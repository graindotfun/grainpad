// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

library GrainMainnetParams {
    struct Economics {
        uint128 virtualQuote;
        uint128 virtualToken;
        uint128 saleSupply;
        uint128 liquiditySupply;
        uint128 graduationQuote;
    }

    function approved() internal pure returns (Economics memory) {
        return Economics(1 ether, 200_000_000 ether, 800_000_000 ether, 200_000_000 ether, 4 ether);
    }
}
