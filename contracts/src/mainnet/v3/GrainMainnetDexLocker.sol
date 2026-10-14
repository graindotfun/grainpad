// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IV3Npm} from "./IUniswapV3Min.sol";

/// @notice Permanent custody of one continuous position. Only accrued fees can leave.
contract GrainMainnetDexLocker is ReentrancyGuard {
    error InvalidPosition();
    error NotPayee();
    error NoFees();
    error TransferFailed();
    address public immutable launcher;
    address public immutable platform;
    address public immutable creator;
    address public immutable token;
    address public immutable weth;
    address public immutable pool;
    IV3Npm public immutable npm;
    bool public immutable tokenIsToken0;
    int24 public immutable lower;
    int24 public immutable upper;
    uint256 public tokenId;
    bool public registered;
    mapping(address => uint256) public platformOwed;
    mapping(address => uint256) public creatorOwed;
    event PositionLocked(uint256 indexed tokenId, int24 lower, int24 upper, uint128 liquidity);
    event FeesCollected(address indexed asset, uint256 platformAmount, uint256 creatorAmount);
    event FeesClaimed(address indexed asset, address indexed payee, uint256 amount);
    constructor(address launcher_, address platform_, address creator_, address token_, address weth_, address pool_, address npm_, bool first_, int24 lower_, int24 upper_) {
        launcher = launcher_; platform = platform_; creator = creator_; token = token_; weth = weth_; pool = pool_;
        npm = IV3Npm(npm_); tokenIsToken0 = first_; lower = lower_; upper = upper_;
    }
    function register(uint256 id) external {
        if (msg.sender != launcher || registered || npm.ownerOf(id) != address(this)) revert InvalidPosition();
        (,address operator,address t0,address t1,uint24 fee,int24 l,int24 u,uint128 liquidity,,,,) = npm.positions(id);
        if (operator != address(0) || fee != 10000 || l != lower || u != upper || liquidity == 0 || t0 != (tokenIsToken0 ? token : weth) || t1 != (tokenIsToken0 ? weth : token)) revert InvalidPosition();
        tokenId = id; registered = true;
        emit PositionLocked(id,l,u,liquidity);
    }
    function collect() external nonReentrant {
        if (!registered) revert InvalidPosition();
        address a0 = tokenIsToken0 ? token : weth;
        address a1 = tokenIsToken0 ? weth : token;
        uint256 b0 = IERC20(a0).balanceOf(address(this));
        uint256 b1 = IERC20(a1).balanceOf(address(this));
        (uint256 got0,uint256 got1) = npm.collect(IV3Npm.CollectParams(tokenId,address(this),type(uint128).max,type(uint128).max));
        if (IERC20(a0).balanceOf(address(this)) - b0 != got0 || IERC20(a1).balanceOf(address(this)) - b1 != got1) revert TransferFailed();
        _accrue(a0,got0); _accrue(a1,got1);
    }
    function _accrue(address asset,uint256 amount) private {
        if (amount == 0) return;
        uint256 company = amount * 35 / 100;
        platformOwed[asset] += company; creatorOwed[asset] += amount - company;
        emit FeesCollected(asset,company,amount-company);
    }
    function claim(address asset,bool creatorBucket) external nonReentrant {
        address payee = creatorBucket ? creator : platform;
        if (msg.sender != payee) revert NotPayee();
        uint256 amount = creatorBucket ? creatorOwed[asset] : platformOwed[asset];
        if (amount == 0) revert NoFees();
        if (creatorBucket) creatorOwed[asset] = 0; else platformOwed[asset] = 0;
        if (!IERC20(asset).transfer(payee,amount)) revert TransferFailed();
        emit FeesClaimed(asset,payee,amount);
    }
}
