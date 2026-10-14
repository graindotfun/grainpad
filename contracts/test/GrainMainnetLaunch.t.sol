// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GrainMainnetFactory} from "../src/mainnet/GrainMainnetFactory.sol";
import {GrainMainnetCurve} from "../src/mainnet/GrainMainnetCurve.sol";
import {GrainMainnetPolicy} from "../src/mainnet/GrainMainnetPolicy.sol";
import {GrainMainnetLiquidityLocker, IMainnetPositions} from "../src/mainnet/GrainMainnetLiquidityLocker.sol";
import {IGraduationPositions} from "../src/mainnet/IGraduationPositions.sol";
import {GrainParams} from "../src/GrainParams.sol";

interface MainnetVm {
    function chainId(uint256) external;
    function etch(address, bytes calldata) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract MainnetQuoteFixture is ERC20 {
    constructor() ERC20("Fixture", "FIX") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MainnetPoolFixture {
    uint160 public price;

    constructor(uint160 p) {
        price = p;
    }

    function setPrice(uint160 p) external {
        price = p;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (price, 0, 0, 0, 0, 0, true);
    }
}

contract MainnetDexFactoryFixture {
    function feeAmountTickSpacing(uint24 tier) external pure returns (int24) {
        return tier == 10_000 ? int24(200) : int24(0);
    }
}

contract MainnetPositionsFixture {
    struct Position {
        address owner;
        address token0;
        address token1;
        uint128 liquidity;
    }
    mapping(bytes32 => address) public pool;
    mapping(uint256 => Position) public position;
    uint256 public count;
    bool public failMint;
    bool public wrongInit;

    function factory() external pure returns (address) {
        return address(bytes20(hex"1f7d7550b1b028f7571e69a784071f0205fd2efa"));
    }

    function failures(bool mintFailure, bool initFailure) external {
        failMint = mintFailure;
        wrongInit = initFailure;
    }

    function createAndInitializePoolIfNecessary(address a, address b, uint24, uint160 price)
        external
        returns (address result)
    {
        bytes32 key = keccak256(abi.encode(a, b));
        result = pool[key];
        if (result == address(0)) {
            result = address(new MainnetPoolFixture(wrongInit ? price * 2 : price));
            pool[key] = result;
        }
    }

    function mint(IGraduationPositions.MintParams calldata p)
        external
        returns (uint256 id, uint128 liquidity, uint256 a, uint256 b)
    {
        require(!failMint, "DEX unavailable");
        a = p.amount0Desired;
        b = p.amount1Desired;
        liquidity = 1;
        require(IERC20(p.token0).transferFrom(msg.sender, address(this), a));
        require(IERC20(p.token1).transferFrom(msg.sender, address(this), b));
        id = ++count;
        position[id] = Position(p.recipient, p.token0, p.token1, liquidity);
    }

    function ownerOf(uint256 id) external view returns (address) {
        return position[id].owner;
    }

    function positions(uint256 id)
        external
        view
        returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)
    {
        Position memory p = position[id];
        return (0, address(0), p.token0, p.token1, 10_000, -887200, 887200, p.liquidity, 0, 0, 0, 0);
    }

    function collect(IMainnetPositions.CollectParams calldata) external pure returns (uint256, uint256) {
        return (0, 0);
    }
}

contract GrainMainnetLaunchTest {
    MainnetVm constant vm = MainnetVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant MANAGER = address(bytes20(hex"73991a25c818bf1f1128deaab1492d45638de0d3"));
    address constant DEX = address(bytes20(hex"1f7d7550b1b028f7571e69a784071f0205fd2efa"));
    GrainMainnetFactory factory;
    GrainMainnetCurve curve;
    MainnetPositionsFixture manager;
    bytes32 id;
    address token;

    function setUp() public {
        vm.chainId(4663);
        MainnetQuoteFixture q = new MainnetQuoteFixture();
        vm.etch(WETH, address(q).code);
        MainnetPositionsFixture m = new MainnetPositionsFixture();
        vm.etch(MANAGER, address(m).code);
        manager = MainnetPositionsFixture(MANAGER);
        MainnetDexFactoryFixture d = new MainnetDexFactoryFixture();
        vm.etch(DEX, address(d).code);
        factory = new GrainMainnetFactory();
        curve = factory.curve();
        id = bytes32((uint256(uint160(address(this))) << 96) | 1);
        token = factory.create("Mainnet candidate", "MNC", id);
        MainnetQuoteFixture(WETH).mint(address(this), 10 ether);
        IERC20(WETH).approve(address(curve), type(uint256).max);
    }

    function testApprovedEconomicsAndFeePins() public view {
        require(factory.totalSupply() == 1_000_000_000 ether && factory.saleSupply() == 800_000_000 ether);
        require(
            curve.virtualQuote() == 1 ether && curve.virtualToken() == 200_000_000 ether
                && curve.liquiditySupply() == 200_000_000 ether && curve.graduationQuote() == 4 ether
        );
        require(curve.platformFeeBps() == 35 && curve.creatorFeeBps() == 65 && curve.tradeFeeBps() == 0);
        require(
            IERC20(token).totalSupply() == 1_000_000_000 ether
                && IERC20(token).balanceOf(address(curve)) == 1_000_000_000 ether
        );
    }

    function testLastBuyAutomaticallyMigratesOnlyRealReservesAndLocksPrincipal() public {
        uint256 amount = curve.maxBuyQuote(id);
        curve.buy(id, amount, 1);
        require(curve.graduated(id) && !curve.graduationPending(id));
        require(IERC20(token).balanceOf(address(this)) == 800_000_000 ether);
        require(IERC20(token).balanceOf(MANAGER) == 160_000_000 ether && IERC20(WETH).balanceOf(MANAGER) == 4 ether);
        require(
            curve.lockedTokenDust(id) == 40_000_000 ether && IERC20(token).balanceOf(address(curve)) == 40_000_000 ether
        );
        require(curve.lockedQuoteDust(id) == 0 && IERC20(WETH).balanceOf(address(curve)) == 0);
        address locker = curve.lockerOf(id);
        require(locker != address(0) && manager.ownerOf(curve.lpTokenId(id)) == locker);
        require(GrainMainnetLiquidityLocker(locker).registered());
        require(
            IERC20(token).allowance(address(curve), MANAGER) == 0
                && IERC20(WETH).allowance(address(curve), MANAGER) == 0
        );
        require(IERC20(WETH).balanceOf(address(factory.vault())) == amount - 4 ether);
        vm.expectRevert(GrainMainnetCurve.AlreadyGraduated.selector);
        curve.buy(id, 1 ether, 1);
    }

    function testMigrationFailureKeepsFundsAndCanRetryPermissionlessly() public {
        manager.failures(true, false);
        uint256 amount = curve.maxBuyQuote(id);
        curve.buy(id, amount, 1);
        require(!curve.graduated(id) && curve.graduationPending(id));
        require(
            IERC20(WETH).balanceOf(address(curve)) == 4 ether
                && IERC20(token).balanceOf(address(curve)) == 200_000_000 ether
        );
        require(manager.count() == 0 && curve.lockerOf(id) == address(0));
        manager.failures(false, false);
        vm.prank(address(0x303));
        curve.graduate(id);
        require(curve.graduated(id) && !curve.graduationPending(id) && IERC20(WETH).balanceOf(MANAGER) == 4 ether);
    }

    function testMigrationOutageStillPermitsExitBeforeRetry() public {
        manager.failures(true, false);
        curve.buy(id, curve.maxBuyQuote(id), 1);
        IERC20(token).approve(address(curve), 1 ether);
        curve.sell(id, 1 ether, 1);
        require(!curve.graduated(id) && !curve.graduationPending(id));
        vm.expectRevert(GrainMainnetCurve.GraduationNotReady.selector);
        curve.graduate(id);
    }

    function testCreatorSaltCannotBeTakenByAnotherWallet() public {
        bytes32 next = bytes32((uint256(uint160(address(this))) << 96) | 2);
        vm.prank(address(0x303));
        vm.expectRevert(GrainMainnetFactory.CreatorBinding.selector);
        factory.create("Stolen", "BAD", next);
        require(factory.tokenOf(next) == address(0));
        require(factory.create("Owner", "OWN", next) != address(0));
    }

    function testPoisonedInitializationRejectsCreationBeforeBuyerFunding() public {
        manager.failures(false, true);
        bytes32 next = bytes32((uint256(uint160(address(this))) << 96) | 2);
        vm.expectRevert(GrainMainnetCurve.UnsafePool.selector);
        factory.create("Rejected", "BAD", next);
        require(factory.tokenOf(next) == address(0));
    }

    function testExternalCallerCannotExecuteOrPrematurelyGraduate() public {
        vm.expectRevert(GrainMainnetCurve.NotSelf.selector);
        curve.executeGraduation(id);
        vm.expectRevert(GrainMainnetCurve.GraduationNotReady.selector);
        curve.graduate(id);
    }

    function testCannotBuyBeyondTheGraduationReserveLimit() public {
        vm.expectRevert(GrainMainnetCurve.CurveLimit.selector);
        curve.buy(id, 5 ether, 1);
    }

    function testFuzzRoundTripConservesActualQuote(uint96 raw) public {
        uint256 amount = uint256(raw) % 1 ether + 10000;
        uint256 before = IERC20(WETH).balanceOf(address(this));
        curve.buy(id, amount, 1);
        uint256 bought = IERC20(token).balanceOf(address(this));
        IERC20(token).approve(address(curve), bought);
        curve.sell(id, bought, 1);
        require(IERC20(WETH).balanceOf(address(this)) <= before);
        require(
            IERC20(WETH).balanceOf(address(curve)) + IERC20(WETH).balanceOf(address(factory.vault()))
                == before - IERC20(WETH).balanceOf(address(this))
        );
        require(IERC20(token).balanceOf(address(curve)) == 1_000_000_000 ether);
    }

    function testDeadlineRejectsLateBuyAndSellWithoutMovingFunds() public {
        uint256 balance = IERC20(WETH).balanceOf(address(this));
        vm.expectRevert(GrainMainnetCurve.Expired.selector); curve.buy(id, 1 ether, 1, block.timestamp - 1);
        vm.expectRevert(GrainMainnetCurve.Expired.selector); curve.sell(id, 1 ether, 1, block.timestamp - 1);
        require(IERC20(WETH).balanceOf(address(this)) == balance);
    }

    function testMainnetFactoryRejectsTestnet() public {
        vm.chainId(46630);
        vm.expectRevert(GrainMainnetPolicy.WrongMainnetChain.selector);
        new GrainMainnetFactory();
    }
}
