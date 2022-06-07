pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../Creamtroller/Creamtroller.sol";

contract CreamtrollerScenario is Creamtroller {
    uint public blockNumber;
    address public compAddress;

    constructor() Creamtroller() public {}

    function fastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }

    function membershipLength(CToken cToken) public view returns (uint) {
        return accountAssets[address(cToken)].length;
    }

    function unlist(CToken cToken) public {
        markets[address(cToken)].isListed = false;
    }
}
