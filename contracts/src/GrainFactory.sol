// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {GrainCurve} from "./GrainCurve.sol";
import {GrainFeeVault} from "./GrainFeeVault.sol";
import {GrainParams} from "./GrainParams.sol";
import {GrainToken} from "./GrainToken.sol";

/// @notice Creates fixed-supply tokens and registers them on one curve.
/// @dev Not upgradeable and not production-ready. Refuses every chain except Robinhood Chain testnet (46630).
contract GrainFactory {
    error WrongChain();
    error BadMetadata();
    error DuplicateLaunch();

    GrainCurve public immutable curve;
    GrainFeeVault public immutable vault;
    uint256 public immutable saleSupply;

    mapping(bytes32 => address) public tokenOf;

    event LaunchCreated(bytes32 indexed launchId, address indexed token, address indexed creator, string name, string symbol);

    constructor(GrainParams.Config memory config) {
        if (block.chainid != GrainParams.ROBINHOOD_TESTNET_CHAIN_ID) revert WrongChain();
        saleSupply = config.saleSupply;
        vault = new GrainFeeVault(config.quote, config.platform);
        curve = new GrainCurve(config, address(this), vault);
        vault.bindCurve(address(curve));
    }

    function create(string calldata name, string calldata symbol, bytes32 launchId) external returns (address token) {
        if (bytes(name).length == 0 || bytes(name).length > 32 || bytes(symbol).length == 0 || bytes(symbol).length > 10) {
            revert BadMetadata();
        }
        if (tokenOf[launchId] != address(0)) revert DuplicateLaunch();
        token = address(new GrainToken{salt: launchId}(name, symbol, address(curve), saleSupply));
        tokenOf[launchId] = token;
        curve.open(launchId, token, msg.sender);
        emit LaunchCreated(launchId, token, msg.sender, name, symbol);
    }
}
