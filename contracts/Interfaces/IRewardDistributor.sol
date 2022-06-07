// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;

/**
 * @notice Interface for Reward Distributor to get reward supply/borrow speeds
 */
interface IRewardDistributor {
    /**
     * @notice Get CTANK reward supply speed for a single market
     * @param cToken The market whose reward speed to get
     * @return The supply reward speed for the market/type
     */
    function rewardSupplySpeeds(address cToken) external view returns (uint256);

    /**
     * @notice Get CTANK reward borrow speed for a single market
     * @param cToken The market whose reward speed to get
     * @return The borrow reward speed for the market/type
     */
    function rewardBorrowSpeeds(address cToken) external view returns (uint256);

    /**
     * @notice Claim all the CTANK accrued by holder in all markets
     * @param holder The address to claim CTANK for
     * @dev This is only for RewardDistributor V1
     */
    function claimReward(address payable holder) external;

    /**
     * @notice The CTANK accrued but not yet transferred to each user     
     * @param holder The address to claim CTANK for
     * @return The CTANK accrued but not yet transferred to each user 
     */
    function rewardAccrued(address holder) external view returns (uint256);
}