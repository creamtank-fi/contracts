// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./Interfaces/EIP20Interface.sol";
import "./Creamtroller/Creamtroller.sol";
import "./CTokens/CToken.sol";

contract RewardDistributorStorage {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @notice Active brains of Unitroller
     */
    Creamtroller public creamtroller;
    bool public creamtrollerSet;

    struct RewardMarketState {
        /// @notice The market's last updated ctankBorrowIndex or ctankSupplyIndex
        uint224 index;
        /// @notice The timestamp number the index was last updated at
        uint32 timestamp;
    }

    /// @notice The portion of supply reward rate that each market currently receives
    mapping(address => uint256) public rewardSupplySpeeds;

    /// @notice The portion of borrow reward rate that each market currently receives
    mapping(address => uint256) public rewardBorrowSpeeds;

    /// @notice The CTANK market supply state for each market
    mapping(address => RewardMarketState) public rewardSupplyState;

    /// @notice The CTANK market borrow state for each market
    mapping(address => RewardMarketState) public rewardBorrowState;

    /// @notice The CTANK borrow index for each market for each supplier as of the last time they accrued reward
    mapping(address => mapping(address => uint256)) public rewardSupplierIndex;

    /// @notice The CTANK borrow index for each market for each borrower as of the last time they accrued reward
    mapping(address => mapping(address => uint256)) public rewardBorrowerIndex;

    /// @notice The CTANK accrued but not yet transferred to each user
    mapping(address => uint256) public rewardAccrued;

    /// @notice The initial reward index for a market
    uint224 public constant rewardInitialIndex = 1e36;

    /// @notice CTANK token contract address
    address public ctankAddress;
}

contract RewardDistributor is RewardDistributorStorage, Exponential {
    /// @notice Emitted when a new reward supply speed is calculated for a market
    event RewardSupplySpeedUpdated(CToken indexed cToken, uint256 newSpeed);

    /// @notice Emitted when a new reward borrow speed is calculated for a market
    event RewardBorrowSpeedUpdated(CToken indexed cToken, uint256 newSpeed);

    /// @notice Emitted when CTANK is distributed to a supplier
    event DistributedSupplierReward(
        CToken indexed cToken,
        address indexed supplier,
        uint256 rewardDelta,
        uint256 rewardSupplyIndex
    );

    /// @notice Emitted when CTANK is distributed to a borrower
    event DistributedBorrowerReward(
        CToken indexed cToken,
        address indexed borrower,
        uint256 rewardDelta,
        uint256 rewardBorrowIndex
    );

    /// @notice Emitted when CTANK is granted by admin
    event RewardGranted(address recipient, uint256 amount);

    bool private initialized;

    constructor() public {
        admin = msg.sender;
    }

    function initialize() public {
        require(!initialized, "RewardDistributor already initialized");
        creamtroller = Creamtroller(msg.sender);
        initialized = true;
    }

    /**
     * @notice Checks caller is admin, or this contract is becoming the new implementation
     */
    function adminOrInitializing() internal view returns (bool) {
        return msg.sender == admin || msg.sender == address(creamtroller);
    }

    /**
     * @notice Set CTANK speed for a single market
     * @param cToken The market whose reward speed to update
     * @param rewardSupplySpeed New reward supply speed for market
     * @param rewardBorrowSpeed New reward borrow speed for market
     */
    function _setRewardSpeed(
        CToken cToken,
        uint256 rewardSupplySpeed,
        uint256 rewardBorrowSpeed
    ) public {
        require(adminOrInitializing(), "only admin can set reward speed");
        setRewardSpeedInternal(cToken, rewardSupplySpeed, rewardBorrowSpeed);
    }

    /**
     * @notice Set CTANK speed for a single market
     * @param cToken The market whose speed to update
     * @param newSupplySpeed New CTANK supply speed for market
     * @param newBorrowSpeed New CTANK borrow speed for market
     */
    function setRewardSpeedInternal(
        CToken cToken,
        uint256 newSupplySpeed,
        uint256 newBorrowSpeed
    ) internal {
        // Handle new supply speeed
        uint256 currentRewardSupplySpeed = rewardSupplySpeeds[address(cToken)];
        if (currentRewardSupplySpeed != 0) {
            // note that CTANK speed could be set to 0 to halt liquidity rewards for a market
            updateRewardSupplyIndex(address(cToken));
        } else if (newSupplySpeed != 0) {
            // Add the CTANK market
            require(creamtroller.isMarketListed(address(cToken)), "reward market is not listed");

            if (
                rewardSupplyState[address(cToken)].index == 0 &&
                rewardSupplyState[address(cToken)].timestamp == 0
            ) {
                rewardSupplyState[address(cToken)] = RewardMarketState({
                    index: rewardInitialIndex,
                    timestamp: safe32(getBlockTimestamp(), "block timestamp exceeds 32 bits")
                });
            }
        }

        if (currentRewardSupplySpeed != newSupplySpeed) {
            rewardSupplySpeeds[address(cToken)] = newSupplySpeed;
            emit RewardSupplySpeedUpdated(cToken, newSupplySpeed);
        }

        // Handle new borrow speed
        uint256 currentRewardBorrowSpeed = rewardBorrowSpeeds[address(cToken)];
        if (currentRewardBorrowSpeed != 0) {
            // note that CTANK speed could be set to 0 to halt liquidity rewards for a market
            Exp memory borrowIndex = Exp({mantissa: cToken.borrowIndex()});
            updateRewardBorrowIndex(address(cToken), borrowIndex);
        } else if (newBorrowSpeed != 0) {
            // Add the CTANK market
            require(creamtroller.isMarketListed(address(cToken)), "reward market is not listed");

            if (
                rewardBorrowState[address(cToken)].index == 0 &&
                rewardBorrowState[address(cToken)].timestamp == 0
            ) {
                rewardBorrowState[address(cToken)] = RewardMarketState({
                    index: rewardInitialIndex,
                    timestamp: safe32(getBlockTimestamp(), "block timestamp exceeds 32 bits")
                });
            }
        }

        if (currentRewardBorrowSpeed != newBorrowSpeed) {
            rewardBorrowSpeeds[address(cToken)] = newBorrowSpeed;
            emit RewardBorrowSpeedUpdated(cToken, newBorrowSpeed);
        }
    }

    /**
     * @notice Accrue CTANK to the market by updating the supply index
     * @param cToken The market whose supply index to update
     */
    function updateRewardSupplyIndex(address cToken) internal {
        RewardMarketState storage supplyState = rewardSupplyState[cToken];
        uint256 supplySpeed = rewardSupplySpeeds[cToken];
        uint256 blockTimestamp = getBlockTimestamp();
        uint256 deltaTimestamps = sub_(blockTimestamp, uint256(supplyState.timestamp));
        if (deltaTimestamps > 0 && supplySpeed > 0) {
            uint256 supplyTokens = CToken(cToken).totalSupply();
            uint256 rewardAccrued = mul_(deltaTimestamps, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(rewardAccrued, supplyTokens) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: supplyState.index}), ratio);
            rewardSupplyState[cToken] = RewardMarketState({
                index: safe224(index.mantissa, "new index exceeds 224 bits"),
                timestamp: safe32(blockTimestamp, "block timestamp exceeds 32 bits")
            });
        } else if (deltaTimestamps > 0) {
            supplyState.timestamp = safe32(blockTimestamp, "block timestamp exceeds 32 bits");
        }
    }

    /**
     * @notice Accrue CTANK to the market by updating the borrow index
     * @param cToken The market whose borrow index to update
     * @param marketBorrowIndex Current index of the borrow market
     */
    function updateRewardBorrowIndex(
        address cToken,
        Exp memory marketBorrowIndex
    ) internal {
        RewardMarketState storage borrowState = rewardBorrowState[cToken];
        uint256 borrowSpeed = rewardBorrowSpeeds[cToken];
        uint256 blockTimestamp = getBlockTimestamp();
        uint256 deltaTimestamps = sub_(blockTimestamp, uint256(borrowState.timestamp));
        if (deltaTimestamps > 0 && borrowSpeed > 0) {
            uint256 borrowAmount = div_(CToken(cToken).totalBorrows(), marketBorrowIndex);
            uint256 rewardAccrued = mul_(deltaTimestamps, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(rewardAccrued, borrowAmount) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: borrowState.index}), ratio);
            rewardBorrowState[cToken] = RewardMarketState({
                index: safe224(index.mantissa, "new index exceeds 224 bits"),
                timestamp: safe32(blockTimestamp, "block timestamp exceeds 32 bits")
            });
        } else if (deltaTimestamps > 0) {
            borrowState.timestamp = safe32(blockTimestamp, "block timestamp exceeds 32 bits");
        }
    }

    /**
     * @notice Calculate CTANK accrued by a supplier and possibly transfer it to them
     * @param cToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute CTANK to
     */
    function distributeSupplierReward(
        address cToken,
        address supplier
    ) internal {
        RewardMarketState storage supplyState = rewardSupplyState[cToken];
        Double memory supplyIndex = Double({mantissa: supplyState.index});
        Double memory supplierIndex = Double({mantissa: rewardSupplierIndex[cToken][supplier]});
        rewardSupplierIndex[cToken][supplier] = supplyIndex.mantissa;

        if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
            supplierIndex.mantissa = rewardInitialIndex;
        }

        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        uint256 supplierTokens = CToken(cToken).balanceOf(supplier);
        uint256 supplierDelta = mul_(supplierTokens, deltaIndex);
        uint256 supplierAccrued = add_(rewardAccrued[supplier], supplierDelta);
        rewardAccrued[supplier] = supplierAccrued;
        emit DistributedSupplierReward(CToken(cToken), supplier, supplierDelta, supplyIndex.mantissa);
    }

    /**
     * @notice Calculate CTANK accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param cToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute CTANK to
     * @param marketBorrowIndex Current index of the borrow market
     */
    function distributeBorrowerReward(
        address cToken,
        address borrower,
        Exp memory marketBorrowIndex
    ) internal {
        RewardMarketState storage borrowState = rewardBorrowState[cToken];
        Double memory borrowIndex = Double({mantissa: borrowState.index});
        Double memory borrowerIndex = Double({mantissa: rewardBorrowerIndex[cToken][borrower]});
        rewardBorrowerIndex[cToken][borrower] = borrowIndex.mantissa;

        if (borrowerIndex.mantissa > 0) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint256 borrowerAmount = div_(CToken(cToken).borrowBalanceStored(borrower), marketBorrowIndex);
            uint256 borrowerDelta = mul_(borrowerAmount, deltaIndex);
            uint256 borrowerAccrued = add_(rewardAccrued[borrower], borrowerDelta);
            rewardAccrued[borrower] = borrowerAccrued;
            emit DistributedBorrowerReward(CToken(cToken), borrower, borrowerDelta, borrowIndex.mantissa);
        }
    }

    /**
     * @notice Refactored function to calc and rewards accounts supplier rewards
     * @param cToken The market to verify the mint against
     * @param supplier The supplier to be rewarded
     */
    function updateAndDistributeSupplierRewardsForToken(address cToken, address supplier) external {
        require(adminOrInitializing(), "only admin can update and distribute supplier rewards");
        updateRewardSupplyIndex(cToken);
        distributeSupplierReward(cToken, supplier);
    }

    /**
     * @notice Refactored function to calc and rewards accounts supplier rewards
     * @param cToken The market to verify the mint against
     * @param borrower Borrower to be rewarded
     * @param marketBorrowIndex Current index of the borrow market
     */
    function updateAndDistributeBorrowerRewardsForToken(
        address cToken,
        address borrower,
        Exp calldata marketBorrowIndex
    ) external {
        require(adminOrInitializing(), "only admin can update and distribute borrower rewards");
        updateRewardBorrowIndex(cToken, marketBorrowIndex);
        distributeBorrowerReward(cToken, borrower, marketBorrowIndex);
    }

    /*** User functions ***/

    /**
     * @notice Claim all the CTANK accrued by holder in all markets
     * @param holder The address to claim CTANK for
     */
    function claimReward(address holder) public {
        return claimReward(holder, creamtroller.getAllMarkets());
    }

    /**
     * @notice Claim all the CTANK accrued by holder in the specified markets
     * @param holder The address to claim CTANK for
     * @param cTokens The list of markets to claim CTANK in
     */
    function claimReward(
        address holder,
        CToken[] memory cTokens
    ) public {
        address[] memory holders = new address[](1);
        holders[0] = holder;
        claimReward(holders, cTokens, true, true);
    }

    /**
     * @notice Claim all CTANK  accrued by the holders
     * @param holders The addresses to claim CTANK for
     * @param cTokens The list of markets to claim CTANK in
     * @param borrowers Whether or not to claim CTANK earned by borrowing
     * @param suppliers Whether or not to claim CTANK earned by supplying
     */
    function claimReward(
        address[] memory holders,
        CToken[] memory cTokens,
        bool borrowers,
        bool suppliers
    ) public {
        for (uint256 i = 0; i < cTokens.length; i++) {
            CToken cToken = cTokens[i];
            require(creamtroller.isMarketListed(address(cToken)), "market must be listed");
            if (borrowers == true) {
                Exp memory borrowIndex = Exp({mantissa: cToken.borrowIndex()});
                updateRewardBorrowIndex(address(cToken), borrowIndex);
                for (uint256 j = 0; j < holders.length; j++) {
                    distributeBorrowerReward(address(cToken), holders[j], borrowIndex);
                    rewardAccrued[holders[j]] = grantRewardInternal(
                        holders[j],
                        rewardAccrued[holders[j]]
                    );
                }
            }
            if (suppliers == true) {
                updateRewardSupplyIndex(address(cToken));
                for (uint256 j = 0; j < holders.length; j++) {
                    distributeSupplierReward(address(cToken), holders[j]);
                    rewardAccrued[holders[j]] = grantRewardInternal(
                        holders[j],
                        rewardAccrued[holders[j]]
                    );
                }
            }
        }
    }

    /**
     * @notice Transfer CTANK to the user
     * @dev Note: If there is not enough CTANK, we do not perform the transfer all.
     * @param user The address of the user to transfer CTANK to
     * @param amount The amount of CTANK to (possibly) transfer
     * @return The amount of CTANK which was NOT transferred to the user
     */
    function grantRewardInternal(
        address user,
        uint256 amount
    ) internal returns (uint256) {
        EIP20Interface ctank = EIP20Interface(ctankAddress);
        uint256 ctankRemaining = ctank.balanceOf(address(this));
        if (amount > 0 && amount <= ctankRemaining) {
            ctank.transfer(user, amount);
            return 0;
        }
        return amount;
    }

    /*** CTANK Distribution Admin ***/

    /**
     * @notice Transfer CTANK to the recipient
     * @dev Note: If there is not enough CTANK, we do not perform the transfer all.
     * @param recipient The address of the recipient to transfer CTANK to
     * @param amount The amount of CTANK to (possibly) transfer
     */
    function _grantReward(
        address recipient,
        uint256 amount
    ) public {
        require(adminOrInitializing(), "only admin can grant ctank");
        uint256 amountLeft = grantRewardInternal(recipient, amount);
        require(amountLeft == 0, "insufficient ctank for grant");
        emit RewardGranted(recipient, amount);
    }

    /**
     * @notice Set the CTANK token address
     */
    function setCtankAddress(address newCtankAddress) public {
        require(msg.sender == admin, "only admin can set CTANK");
        ctankAddress = newCtankAddress;
    }

    /**
     * @notice Set the Creamtroller address
     */
    function setCreamtroller(address _creamtroller) public {
        require(msg.sender == admin, "only admin can set Creamtroller");
        require(!creamtrollerSet, "Creamtroller can only be set once");
        creamtroller = Creamtroller(_creamtroller);
    }

    /**
     * @notice Set the admin
     */
    function setAdmin(address _newAdmin) public {
        require(msg.sender == admin, "only admin can set admin");
        admin = _newAdmin;
    }

    function getBlockTimestamp() public view returns (uint256) {
        return block.timestamp;
    }
}