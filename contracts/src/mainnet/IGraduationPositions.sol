// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

interface IGraduationPositions {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    function factory() external view returns (address);
    function createAndInitializePoolIfNecessary(address, address, uint24, uint160) external payable returns (address);
    function mint(MintParams calldata) external payable returns (uint256, uint128, uint256, uint256);
}

interface IGraduationFactory {
    function feeAmountTickSpacing(uint24) external view returns (int24);
}

interface IGraduationPool {
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool);
}
