// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

/// @notice Mainnet candidate policy, not a deployed factory or release approval.
/// @dev Separate from the already-deployed testnet source and bytecode.
library GrainMainnetPolicy {
    error WrongMainnetChain();
    error WrongMainnetQuote();
    error WrongMainnetFees();

    uint256 internal constant CHAIN_ID = 4663;
    address internal constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    uint16 internal constant PLATFORM_FEE_BPS = 35;
    uint16 internal constant CREATOR_FEE_BPS = 65;
    uint16 internal constant TRADE_FEE_BPS = 0;
    uint256 internal constant BPS = 10_000;

    function split(uint256 amount) internal pure returns (uint256 platformFee, uint256 creatorFee, uint256 net) {
        platformFee = _fee(amount, PLATFORM_FEE_BPS);
        creatorFee = _fee(amount, CREATOR_FEE_BPS);
        net = amount - platformFee - creatorFee;
    }

    /// @dev Exact floor(amount * bps / BPS) without overflowing at uint256 max.
    /// The fixed policy bounds bps below BPS, so both products fit uint256.
    function _fee(uint256 amount, uint16 bps) private pure returns (uint256) {
        return (amount / BPS) * bps + ((amount % BPS) * bps) / BPS;
    }

    function validate(address quote, uint16 platformBps, uint16 creatorBps, uint16 tradeBps) internal view {
        if (block.chainid != CHAIN_ID) revert WrongMainnetChain();
        if (quote != WETH) revert WrongMainnetQuote();
        if (platformBps != PLATFORM_FEE_BPS || creatorBps != CREATOR_FEE_BPS || tradeBps != TRADE_FEE_BPS) {
            revert WrongMainnetFees();
        }
    }
}
