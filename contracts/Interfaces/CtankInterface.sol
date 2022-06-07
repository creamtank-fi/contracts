interface CtankInterface {
    function getPriorVotes(address account, uint blockNumber) external view returns (uint96);
}