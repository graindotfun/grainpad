// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

/// @notice Shared limits for the Robinhood Chain testnet contracts.
/// @dev These numbers are not the Solana fee policy in `lib/fee-policy.mjs`.
///      Chain id 46630 is the published Robinhood Chain testnet id.
library GrainParams {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46630;
    uint256 internal constant BPS = 10_000;
    /// @dev Safety cap for one fee leg. Not a product rate.
    uint256 internal constant MAX_SINGLE_FEE_BPS = 1_000;
    /// @dev Safety cap for the sum of the three fee legs. Not a product rate.
    uint256 internal constant MAX_TOTAL_FEE_BPS = 1_500;

    enum FeeKind {
        Platform,
        Creator,
        Trade
    }

    struct Config {
        address quote;
        address platform;
        uint16 platformFeeBps;
        uint16 creatorFeeBps;
        uint16 tradeFeeBps;
        uint256 virtualQuote;
        uint256 virtualToken;
        uint256 saleSupply;
    }
}
