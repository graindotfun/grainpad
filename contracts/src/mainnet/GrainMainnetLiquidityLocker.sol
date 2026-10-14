// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GrainMainnetPolicy} from "./GrainMainnetPolicy.sol";

interface IMainnetPositions {
    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }
    function ownerOf(uint256 tokenId) external view returns (address);
    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1);
}

/// @notice Candidate perpetual LP lock. It exposes fee collection, never principal withdrawal.
/// @dev Splits realized net LP fees 35/65 in each original asset; no conversion or gross-volume guarantee.
contract GrainMainnetLiquidityLocker is ReentrancyGuard {
    error InvalidPosition();
    error NotCurve();
    error NotPayee();
    error TransferFailed();
    error NoFees();
    address public constant POSITION_MANAGER = address(bytes20(hex"73991a25c818bf1f1128deaab1492d45638de0d3"));
    uint24 public constant POOL_FEE = 10_000; // Uniswap units: 1%, not bps.
    int24 public constant TICK_LOWER = -887200;
    int24 public constant TICK_UPPER = 887200;
    address public immutable curve;
    address public immutable platform;
    address public immutable creator;
    address public immutable token;
    address public immutable quote;
    uint256 public tokenId;
    bool public registered;
    address public token0;
    address public token1;
    mapping(address => uint256) public platformOwed;
    mapping(address => uint256) public creatorOwed;
    event PositionLocked(uint256 indexed tokenId, address token0, address token1, uint128 liquidity);
    event FeesCollected(address indexed asset, uint256 platformAmount, uint256 creatorAmount);
    event FeesClaimed(address indexed asset, address indexed payee, uint256 amount);

    constructor(address curve_, address platform_, address creator_, address token_, address quote_) {
        GrainMainnetPolicy.validate(quote_, 35, 65, 0);
        if (
            curve_ == address(0) || platform_ == address(0) || creator_ == address(0) || token_ == address(0)
                || token_ == quote_
        ) revert InvalidPosition();
        curve = curve_;
        platform = platform_;
        creator = creator_;
        token = token_;
        quote = quote_;
    }

    function register(uint256 id) external {
        if (msg.sender != curve) revert NotCurve();
        if (registered || IMainnetPositions(POSITION_MANAGER).ownerOf(id) != address(this)) revert InvalidPosition();
        (
            ,
            address operator,
            address asset0,
            address asset1,
            uint24 fee,
            int24 lower,
            int24 upper,
            uint128 liquidity,,,,
        ) = IMainnetPositions(POSITION_MANAGER).positions(id);
        if (
            operator != address(0) || fee != POOL_FEE || lower != TICK_LOWER || upper != TICK_UPPER || liquidity == 0
                || !((asset0 == token && asset1 == quote) || (asset0 == quote && asset1 == token))
        ) revert InvalidPosition();
        tokenId = id;
        token0 = asset0;
        token1 = asset1;
        registered = true;
        emit PositionLocked(id, asset0, asset1, liquidity);
    }

    /// @notice Permissionless collection cannot redirect fees or unlock the NFT.
    function collect() external nonReentrant {
        if (!registered) revert InvalidPosition();
        uint256 before0 = IERC20(token0).balanceOf(address(this));
        uint256 before1 = IERC20(token1).balanceOf(address(this));
        (uint256 amount0, uint256 amount1) = IMainnetPositions(POSITION_MANAGER)
            .collect(IMainnetPositions.CollectParams(tokenId, address(this), type(uint128).max, type(uint128).max));
        if (
            IERC20(token0).balanceOf(address(this)) - before0 != amount0
                || IERC20(token1).balanceOf(address(this)) - before1 != amount1 || amount0 > type(uint128).max
                || amount1 > type(uint128).max
        ) revert TransferFailed();
        _accrue(token0, amount0);
        _accrue(token1, amount1);
    }

    function _accrue(address asset, uint256 amount) private {
        if (amount == 0) return;
        uint256 company = amount * 35 / 100;
        platformOwed[asset] += company;
        creatorOwed[asset] += amount - company;
        emit FeesCollected(asset, company, amount - company);
    }

    function claim(address asset, bool creatorBucket) external nonReentrant {
        address payee = creatorBucket ? creator : platform;
        if (msg.sender != payee) revert NotPayee();
        uint256 amount = creatorBucket ? creatorOwed[asset] : platformOwed[asset];
        if (amount == 0) revert NoFees();
        if (creatorBucket) creatorOwed[asset] = 0;
        else platformOwed[asset] = 0;
        if (!IERC20(asset).transfer(payee, amount)) revert TransferFailed();
        emit FeesClaimed(asset, payee, amount);
    }
}
