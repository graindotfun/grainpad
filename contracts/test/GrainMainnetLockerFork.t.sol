// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GrainMainnetLiquidityLocker, IMainnetPositions} from "../src/mainnet/GrainMainnetLiquidityLocker.sol";
import {GrainMainnetFactory} from "../src/mainnet/GrainMainnetFactory.sol";
import {GrainMainnetCurve} from "../src/mainnet/GrainMainnetCurve.sol";
import {GrainParams} from "../src/GrainParams.sol";

interface ForkVm {
    function deal(address, uint256) external;
    function createSelectFork(string calldata) external returns (uint256);
    function envOr(string calldata, string calldata) external view returns (string memory);
    function skip(bool) external;
}

interface ForkWeth is IERC20 {
    function deposit() external payable;
}

interface ForkPositions is IMainnetPositions {
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
    function createAndInitializePoolIfNecessary(address, address, uint24, uint160) external payable returns (address);
    function mint(MintParams calldata) external payable returns (uint256, uint128, uint256, uint256);
}

interface ForkRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256);
}

contract ForkLaunchToken is ERC20 {
    constructor() ERC20("Fork-only", "FORK") {
        _mint(msg.sender, 2 ether);
    }
}

/// @dev Optional real-contract fork test: all deployments/funding/swaps are disposable local VM state.
contract GrainMainnetLockerForkTest {
    ForkVm constant vm = ForkVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant MANAGER = address(bytes20(hex"73991a25c818bf1f1128deaab1492d45638de0d3"));
    address constant ROUTER = address(bytes20(hex"caf681a66d020601342297493863e78c959e5cb2"));

    function testForkRealMintSwapCollectKeepsPrincipalLocked() public {
        string memory url = vm.envOr("RH_FORK_RPC", string(""));
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(url);
        require(block.chainid == 4663 && MANAGER.code.length > 0 && ROUTER.code.length > 0);
        vm.deal(address(this), 2 ether);
        ForkWeth(WETH).deposit{value: 2 ether}();
        ForkLaunchToken token = new ForkLaunchToken();
        GrainMainnetLiquidityLocker locker =
            new GrainMainnetLiquidityLocker(address(this), address(0x101), address(0x202), address(token), WETH);
        address asset0 = address(token) < WETH ? address(token) : WETH;
        address asset1 = address(token) < WETH ? WETH : address(token);
        ForkPositions manager = ForkPositions(MANAGER);
        address pool = manager.createAndInitializePoolIfNecessary(asset0, asset1, 10_000, uint160(1) << 96);
        require(pool.code.length > 0);
        token.approve(MANAGER, 1 ether);
        ForkWeth(WETH).approve(MANAGER, 1 ether);
        (uint256 id, uint128 liquidity, uint256 used0, uint256 used1) = manager.mint(
            ForkPositions.MintParams(
                asset0,
                asset1,
                10_000,
                -887200,
                887200,
                1 ether,
                1 ether,
                0.99 ether,
                0.99 ether,
                address(locker),
                block.timestamp
            )
        );
        require(liquidity > 0 && used0 > 0 && used1 > 0);
        locker.register(id);
        ForkWeth(WETH).approve(ROUTER, 0.01 ether);
        uint256 output = ForkRouter(ROUTER)
            .exactInputSingle(
                ForkRouter.ExactInputSingleParams(WETH, address(token), 10_000, address(this), 0.01 ether, 1, 0)
            );
        require(output > 0);
        locker.collect();
        uint256 realized = locker.platformOwed(WETH) + locker.creatorOwed(WETH);
        require(realized > 0 && locker.platformOwed(WETH) == realized * 35 / 100);
        require(manager.ownerOf(id) == address(locker));
        (,,,,,,, uint128 afterLiquidity,,,,) = manager.positions(id);
        require(afterLiquidity == liquidity);
    }

    function testForkFactoryCurveGraduationAndDexRoundTrip() public {
        string memory url = vm.envOr("RH_FORK_RPC", string(""));
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(url);
        require(block.chainid == 4663);
        vm.deal(address(this), 5 ether);
        ForkWeth(WETH).deposit{value: 5 ether}();
        GrainMainnetFactory factory = new GrainMainnetFactory();
        GrainMainnetCurve curve = factory.curve();
        bytes32 launchId = bytes32((uint256(uint160(address(this))) << 96) | 1);
        address token = factory.create("Fork graduation", "FGR", launchId);
        uint256 gross = curve.maxBuyQuote(launchId);
        ForkWeth(WETH).approve(address(curve), gross);
        curve.buy(launchId, gross, 1, block.timestamp);
        require(curve.graduated(launchId) && !curve.graduationPending(launchId));
        require(IERC20(token).balanceOf(address(this)) == 800_000_000 ether);
        require(curve.lockedTokenDust(launchId) >= 40_000_000 ether);
        require(ForkWeth(WETH).allowance(address(curve), MANAGER) == 0);
        require(IERC20(token).allowance(address(curve), MANAGER) == 0);
        uint256 beforeClaim = ForkWeth(WETH).balanceOf(address(this));
        uint256 creatorFee = factory.vault().owed(launchId, GrainParams.FeeKind.Creator);
        require(creatorFee > 0);
        factory.vault().claim(launchId, GrainParams.FeeKind.Creator);
        require(ForkWeth(WETH).balanceOf(address(this)) == beforeClaim + creatorFee);
        GrainMainnetLiquidityLocker locker = GrainMainnetLiquidityLocker(curve.lockerOf(launchId));
        uint256 id = curve.lpTokenId(launchId);
        ForkPositions manager = ForkPositions(MANAGER);
        require(manager.ownerOf(id) == address(locker));
        (,,,,,,, uint128 liquidity,,,,) = manager.positions(id);
        require(liquidity > 0);
        ForkWeth(WETH).approve(ROUTER, 0.01 ether);
        uint256 bought = ForkRouter(ROUTER).exactInputSingle(
            ForkRouter.ExactInputSingleParams(WETH, token, 10_000, address(this), 0.01 ether, 1, 0)
        );
        require(bought > 0);
        IERC20(token).approve(ROUTER, bought);
        require(ForkRouter(ROUTER).exactInputSingle(
            ForkRouter.ExactInputSingleParams(token, WETH, 10_000, address(this), bought, 1, 0)
        ) > 0);
        locker.collect();
        require(locker.platformOwed(WETH) + locker.creatorOwed(WETH) > 0);
        require(locker.platformOwed(token) + locker.creatorOwed(token) > 0);
        (,,,,,,, uint128 afterLiquidity,,,,) = manager.positions(id);
        require(manager.ownerOf(id) == address(locker) && afterLiquidity == liquidity);
    }
}
