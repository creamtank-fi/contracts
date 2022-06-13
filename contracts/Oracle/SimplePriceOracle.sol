pragma solidity ^0.5.16;

import "../Interfaces/PriceOracle.sol";
import "../CTokens/CErc20.sol";

contract SimplePriceOracle is PriceOracle {
    address public admin;
    address public pendingAdmin;
    address public poster;
    mapping(address => uint) prices;
    event PricePosted(address asset, uint previousPriceMantissa, uint requestedPriceMantissa, uint newPriceMantissa);

    constructor(address _poster) public {
        admin = msg.sender;
        poster = _poster;
    }

    function _getUnderlyingAddress(CToken cToken) private view returns (address) {
        return address(CErc20(address(cToken)).underlying());
    }

    function getUnderlyingPrice(CToken cToken) public view returns (uint) {
        return prices[_getUnderlyingAddress(cToken)];
    }

    function setUnderlyingPrice(CToken cToken, uint underlyingPriceMantissa) public {
        require(msg.sender == poster, "only poster can set underlying price");
        address asset = _getUnderlyingAddress(cToken);
        emit PricePosted(asset, prices[asset], underlyingPriceMantissa, underlyingPriceMantissa);
        prices[asset] = underlyingPriceMantissa;
    }

    function setDirectPrice(address asset, uint price) public {
        require(msg.sender == poster, "only poster can set direct price");
        emit PricePosted(asset, prices[asset], price, price);
        prices[asset] = price;
    }

    // v1 price oracle interface for use as backing of proxy
    function assetPrices(address asset) external view returns (uint) {
        return prices[asset];
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function setPoster(address newPoster) external {
        require(msg.sender == admin, "Only admin can change poster");
        poster = newPoster;
    }

    function setPendingAdmin(address _pendingAdmin) external {
        require(msg.sender == admin, "Only current admin can change admin");
        pendingAdmin = _pendingAdmin;
    }

    function acceptPendingAdmin() external {
        require(msg.sender == pendingAdmin, "Only pending admin can accept admin");
        pendingAdmin = address(0);
        admin = pendingAdmin;
    }
}
