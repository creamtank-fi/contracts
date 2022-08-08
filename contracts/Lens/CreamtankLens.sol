pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../CTokens/CErc20.sol";
import "../CTokens/CToken.sol";
import "../Creamtroller/CreamtrollerRewards.sol";
import "../Interfaces/PriceOracle.sol";
import "../Interfaces/EIP20Interface.sol";
import "../Interfaces/IRewardDistributor.sol";
import "../Governance/GovernorBravoDelegate.sol"; // TODO
import "../Governance/Ctank.sol";
// import "../Exponential.sol";

interface CreamtrollerLensInterface {
    function markets(address) external view returns (bool, uint);
    function oracle() external view returns (PriceOracle);
    function getAccountLiquidity(address) external view returns (uint, uint, uint);
    function getAssetsIn(address) external view returns (CToken[] memory);
    function claimCtank(address) external;
    function ctankAccrued(address) external view returns (uint);
    function ctankSpeeds(address) external view returns (uint);
    function supplyCtankRewardsPerSeconds(address) external view returns (uint);
    function borrowCtankRewardsPerSeconds(address) external view returns (uint);
    function borrowCaps(address) external view returns (uint);
}

interface GovernorBravoInterface {
    struct Receipt {
        bool hasVoted;
        uint8 support;
        uint96 votes;
    }
    struct Proposal {
        uint id;
        address proposer;
        uint eta;
        uint startBlock;
        uint endBlock;
        uint forVotes;
        uint againstVotes;
        uint abstainVotes;
        bool canceled;
        bool executed;
    }
    function getActions(uint proposalId) external view returns (address[] memory targets, uint[] memory values, string[] memory signatures, bytes[] memory calldatas);
    function proposals(uint proposalId) external view returns (Proposal memory);
    function getReceipt(uint proposalId, address voter) external view returns (Receipt memory);
}

contract CreamtankLens {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     *@notice The module that handles reward distribution
     */
    address payable public rewardDistributor;

    struct CTokenMetadata {
        address cToken;
        uint exchangeRateCurrent;
        uint supplyRatePerBlock;
        uint borrowRatePerBlock;
        uint reserveFactorMantissa;
        uint totalBorrows;
        uint totalReserves;
        uint totalSupply;
        uint totalCash;
        // uint totalCollateralTokens; ???
        bool isListed;
        uint collateralFactorMantissa;
        address underlyingAssetAddress;
        uint cTokenDecimals;
        uint underlyingDecimals;
        uint borrowCap;
        uint supplyCtankRewardsPerSecond;
        uint borrowCtankRewardsPerSecond;
    }

    struct CTokenBalances {
        address cToken;
        uint balanceOf;
        uint balanceOfUnderlying;
        // uint supplyValueUSD
        // uint collateralValueUSD
        uint borrowBalanceCurrent;
        // uint borrowValueUSD
        uint tokenBalance;
        uint tokenAllowance;
        // bool collateralEnabled
    }

    struct CTokenUnderlyingPrice {
        address cToken;
        uint underlyingPrice;
    }
    
    struct GovBravoReceipt {
        uint proposalId;
        bool hasVoted;
        uint8 support;
        uint96 votes;
    }

    struct AccountLimits {
        CToken[] markets;
        uint liquidity;
        uint shortfall;
        // uint totalCollateralValueUSD
        // uint totalBorrowValueUSD
        // uint healthFactor
    }

    struct CtankBalanceMetadata {
        uint balance;
        uint votes;
        address delegate;
    }

    struct CtankBalanceMetadataExt {
        uint balance;
        uint votes;
        address delegate;
        uint allocated;
    }

    struct GovBravoProposal {
        uint proposalId;
        address proposer;
        uint eta;
        address[] targets;
        uint[] values;
        string[] signatures;
        bytes[] calldatas;
        uint startBlock;
        uint endBlock;
        uint forVotes;
        uint againstVotes;
        uint abstainVotes;
        bool canceled;
        bool executed;
    }

    struct CtankVotes {
        uint blockNumber;
        uint votes;
    }

    /**
     * @notice Constructor function that initializes the native symbol and administrator for this contract
     * @param _rewardDistributor The reward distributor for this contract
     */
    constructor(address payable _rewardDistributor) public {
        admin = msg.sender;
        rewardDistributor = _rewardDistributor;
    }

    function cTokenMetadata(CToken cToken) public returns (CTokenMetadata memory) {
        uint exchangeRateCurrent = cToken.exchangeRateCurrent();
        CreamtrollerLensInterface creamtroller = CreamtrollerLensInterface(address(cToken.creamtroller()));
        (bool isListed, uint collateralFactorMantissa) = creamtroller.markets(address(cToken));
        address underlyingAssetAddress;
        uint underlyingDecimals;

        CErc20 cErc20 = CErc20(address(cToken));
        underlyingAssetAddress = cErc20.underlying();
        underlyingDecimals = EIP20Interface(cErc20.underlying()).decimals();

        uint supplyCtankRewardsPerSecond = 0;
        uint borrowCtankRewardsPerSecond = 0;

        if (address(rewardDistributor) != address(0)) {
            supplyCtankRewardsPerSecond = IRewardDistributor(rewardDistributor).rewardSupplySpeeds(address(cToken));
            borrowCtankRewardsPerSecond = IRewardDistributor(rewardDistributor).rewardBorrowSpeeds(address(cToken));
        }

        uint borrowCap = 0;
        (bool borrowCapSuccess, bytes memory borrowCapReturnData) =
            address(creamtroller).call(
                abi.encodePacked(
                    creamtroller.borrowCaps.selector,
                    abi.encode(address(cToken))
                )
            );
        if (borrowCapSuccess) {
            borrowCap = abi.decode(borrowCapReturnData, (uint));
        }

        return CTokenMetadata({
            cToken: address(cToken),
            exchangeRateCurrent: exchangeRateCurrent,
            supplyRatePerBlock: cToken.supplyRatePerBlock(),
            borrowRatePerBlock: cToken.borrowRatePerBlock(),
            reserveFactorMantissa: cToken.reserveFactorMantissa(),
            totalBorrows: cToken.totalBorrows(),
            totalReserves: cToken.totalReserves(),
            totalSupply: cToken.totalSupply(),
            totalCash: cToken.getCash(),
            isListed: isListed,
            collateralFactorMantissa: collateralFactorMantissa,
            underlyingAssetAddress: underlyingAssetAddress,
            cTokenDecimals: cToken.decimals(),
            underlyingDecimals: underlyingDecimals,
            supplyCtankRewardsPerSecond: supplyCtankRewardsPerSecond,
            borrowCtankRewardsPerSecond: borrowCtankRewardsPerSecond,
            borrowCap: borrowCap
        });
    }

    function cTokenMetadataAll(CToken[] calldata cTokens) external returns (CTokenMetadata[] memory) {
        uint cTokenCount = cTokens.length;
        CTokenMetadata[] memory res = new CTokenMetadata[](cTokenCount);
        for (uint i = 0; i < cTokenCount; i++) {
            res[i] = cTokenMetadata(cTokens[i]);
        }
        return res;
    }



    function cTokenBalances(CToken cToken, address payable account) public returns (CTokenBalances memory) {
        uint balanceOf = cToken.balanceOf(account);
        uint borrowBalanceCurrent = cToken.borrowBalanceCurrent(account);
        uint balanceOfUnderlying = cToken.balanceOfUnderlying(account);
        uint tokenBalance;
        uint tokenAllowance;


        CErc20 cErc20 = CErc20(address(cToken));
        EIP20Interface underlying = EIP20Interface(cErc20.underlying());
        tokenBalance = underlying.balanceOf(account);
        tokenAllowance = underlying.allowance(account, address(cToken));


        // TODO: add USD values

        return CTokenBalances({
            cToken: address(cToken),
            balanceOf: balanceOf,
            borrowBalanceCurrent: borrowBalanceCurrent,
            balanceOfUnderlying: balanceOfUnderlying,
            tokenBalance: tokenBalance,
            tokenAllowance: tokenAllowance
        });
    }

    function cTokenBalancesAll(CToken[] calldata cTokens, address payable account) external returns (CTokenBalances[] memory) {
        uint cTokenCount = cTokens.length;
        CTokenBalances[] memory res = new CTokenBalances[](cTokenCount);
        for (uint i = 0; i < cTokenCount; i++) {
            res[i] = cTokenBalances(cTokens[i], account);
        }
        return res;
    }



    function cTokenUnderlyingPrice(CToken cToken) public returns (CTokenUnderlyingPrice memory) {
        CreamtrollerLensInterface creamtroller = CreamtrollerLensInterface(address(cToken.creamtroller()));
        PriceOracle priceOracle = creamtroller.oracle();

        return CTokenUnderlyingPrice({
            cToken: address(cToken),
            underlyingPrice: priceOracle.getUnderlyingPrice(cToken)
        });
    }

    function cTokenUnderlyingPriceAll(CToken[] calldata cTokens) external returns (CTokenUnderlyingPrice[] memory) {
        uint cTokenCount = cTokens.length;
        CTokenUnderlyingPrice[] memory res = new CTokenUnderlyingPrice[](cTokenCount);
        for (uint i = 0; i < cTokenCount; i++) {
            res[i] = cTokenUnderlyingPrice(cTokens[i]);
        }
        return res;
    }

    function getAccountLimits(CreamtrollerLensInterface creamtroller, address account) public returns (AccountLimits memory) {
        (uint errorCode, uint liquidity, uint shortfall) = creamtroller.getAccountLiquidity(account);
        require(errorCode == 0);

        // TODO add additional USD values here

        return AccountLimits({
            markets: creamtroller.getAssetsIn(account),
            liquidity: liquidity,
            shortfall: shortfall
        });
    }

    function getGovBravoReceipts(GovernorBravoInterface governor, address voter, uint[] memory proposalIds) public view returns (GovBravoReceipt[] memory) {
        uint proposalCount = proposalIds.length;
        GovBravoReceipt[] memory res = new GovBravoReceipt[](proposalCount);
        for (uint i = 0; i < proposalCount; i++) {
            GovernorBravoInterface.Receipt memory receipt = governor.getReceipt(proposalIds[i], voter);
            res[i] = GovBravoReceipt({
                proposalId: proposalIds[i],
                hasVoted: receipt.hasVoted,
                support: receipt.support,
                votes: receipt.votes
            });
        }
        return res;
    }

    function setBravoProposal(GovBravoProposal memory res, GovernorBravoInterface governor, uint proposalId) internal view {
        GovernorBravoInterface.Proposal memory p = governor.proposals(proposalId);

        res.proposalId = proposalId;
        res.proposer = p.proposer;
        res.eta = p.eta;
        res.startBlock = p.startBlock;
        res.endBlock = p.endBlock;
        res.forVotes = p.forVotes;
        res.againstVotes = p.againstVotes;
        res.abstainVotes = p.abstainVotes;
        res.canceled = p.canceled;
        res.executed = p.executed;
    }

    function getGovBravoProposals(GovernorBravoInterface governor, uint[] calldata proposalIds) external view returns (GovBravoProposal[] memory) {
        GovBravoProposal[] memory res = new GovBravoProposal[](proposalIds.length);
        for (uint i = 0; i < proposalIds.length; i++) {
            (
                address[] memory targets,
                uint[] memory values,
                string[] memory signatures,
                bytes[] memory calldatas
            ) = governor.getActions(proposalIds[i]);
            res[i] = GovBravoProposal({
                proposalId: 0,
                proposer: address(0),
                eta: 0,
                targets: targets,
                values: values,
                signatures: signatures,
                calldatas: calldatas,
                startBlock: 0,
                endBlock: 0,
                forVotes: 0,
                againstVotes: 0,
                abstainVotes: 0,
                canceled: false,
                executed: false
            });
            setBravoProposal(res[i], governor, proposalIds[i]);
        }
        return res;
    }

    function getCtankBalanceMetadata(Ctank ctank, address account) external view returns (CtankBalanceMetadata memory) {
        return CtankBalanceMetadata({
            balance: ctank.balanceOf(account),
            votes: uint256(ctank.getCurrentVotes(account)),
            delegate: ctank.delegates(account)
        });
    }



    function getCtankBalanceMetadataExt(Ctank ctank, CreamtrollerLensInterface creamtroller, address account) external returns (CtankBalanceMetadataExt memory) {
        uint balance = ctank.balanceOf(account);
        creamtroller.claimCtank(account);
        uint newBalance = ctank.balanceOf(account);
        uint accrued = creamtroller.ctankAccrued(account);
        uint total = add(accrued, newBalance, "sum ctank total");
        uint allocated = sub(total, balance, "sub allocated");

        return CtankBalanceMetadataExt({
            balance: balance,
            votes: uint256(ctank.getCurrentVotes(account)),
            delegate: ctank.delegates(account),
            allocated: allocated
        });
    }

    function getCtankVotes(Ctank ctank, address account, uint32[] calldata blockNumbers) external view returns (CtankVotes[] memory) {
        CtankVotes[] memory res = new CtankVotes[](blockNumbers.length);
        for (uint i = 0; i < blockNumbers.length; i++) {
            res[i] = CtankVotes({
                blockNumber: uint256(blockNumbers[i]),
                votes: uint256(ctank.getPriorVotes(account, blockNumbers[i]))
            });
        }
        return res;
    }

    /**
     * @notice Claims available rewards of a given reward type for an account
     * @param _creamtroller The creamtroller address
     * @param _ctank The joe token address
     * @param _account The account that will receive the rewards
     * @return The amount of tokens claimed
     */
    function getClaimableRewards(
        address _creamtroller,
        address _ctank,
        address payable _account
    ) external returns (uint256) {
        uint256 balanceBefore = Ctank(_ctank).balanceOf(_account);
        CreamtrollerRewards(_creamtroller).claimReward(_account);
        uint256 balanceAfter = Ctank(_ctank).balanceOf(_account);
        return sub(balanceAfter, balanceBefore, "sub error");
    }

    /**
     * @notice Admin function to set new reward distributor address
     * @param _newRewardDistributor The address of the new reward distributor
     */
    function setRewardDistributor(address payable _newRewardDistributor) external {
        require(msg.sender == admin, "not admin");

        rewardDistributor = _newRewardDistributor;
    }

    /**
     * @notice Admin function to set new admin address
     * @param _admin The address of the new admin
     */
    function setAdmin(address payable _admin) external {
        require(msg.sender == admin, "not admin");

        admin = _admin;
    }

    function add(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        uint c = a + b;
        require(c >= a, errorMessage);
        return c;
    }

    function sub(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        require(b <= a, errorMessage);
        uint c = a - b;
        return c;
    }
}
