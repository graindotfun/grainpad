// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {GrainMainnetCurve} from "./GrainMainnetCurve.sol";
import {GrainMainnetFeeVault} from "./GrainMainnetFeeVault.sol";
import {GrainMainnetParams} from "./GrainMainnetParams.sol";
import {GrainMainnetPolicy} from "./GrainMainnetPolicy.sol";
import {GrainToken} from "../GrainToken.sol";

/// @notice Creates fixed-supply tokens and registers them on one curve.
/// @dev Mainnet release candidate, not upgradeable. Only Robinhood mainnet; owner-selected economics and fees.
contract GrainMainnetFactory {
    error WrongChain();
    error BadMetadata();
    error DuplicateLaunch();
    error CreatorBinding();

    GrainMainnetCurve public immutable curve;
    GrainMainnetFeeVault public immutable vault;
    uint256 public immutable saleSupply;
    uint256 public immutable totalSupply;

    mapping(bytes32 => address) public tokenOf;

    event LaunchCreated(
        bytes32 indexed launchId, address indexed token, address indexed creator, string name, string symbol
    );

    constructor() {
        GrainMainnetParams.Economics memory config = GrainMainnetParams.approved();
        GrainMainnetPolicy.validate(GrainMainnetPolicy.WETH, 35, 65, 0);
        saleSupply = config.saleSupply;
        totalSupply = uint256(config.saleSupply) + config.liquiditySupply;
        vault = new GrainMainnetFeeVault(
            GrainMainnetPolicy.WETH, address(bytes20(hex"f405420b031f1a6fbffd0b2f90cc9ed84818dc9a"))
        );
        curve = new GrainMainnetCurve(config, address(this), vault);
        vault.bindCurve(address(curve));
    }

    function create(string calldata name, string calldata symbol, bytes32 launchId) external returns (address token) {
        // Address prefix binds the salt to the signer; mempool observers cannot take the creator's fees.
        if (address(uint160(uint256(launchId) >> 96)) != msg.sender) revert CreatorBinding();
        if (
            bytes(name).length == 0 || bytes(name).length > 32 || bytes(symbol).length == 0 || bytes(symbol).length > 10
        ) {
            revert BadMetadata();
        }
        if (tokenOf[launchId] != address(0)) revert DuplicateLaunch();
        token = address(new GrainToken{salt: launchId}(name, symbol, address(curve), totalSupply));
        tokenOf[launchId] = token;
        curve.open(launchId, token, msg.sender);
        emit LaunchCreated(launchId, token, msg.sender, name, symbol);
    }
}
