// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {GrainMainnetLiquidityLocker, IMainnetPositions} from "../src/mainnet/GrainMainnetLiquidityLocker.sol";

interface LockerVm {
    function chainId(uint256) external;
    function etch(address, bytes calldata) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract LockerToken is ERC20 {
    constructor() ERC20("Fixture", "FIX") {}

    function mint(address who, uint256 amount) external {
        _mint(who, amount);
    }
}

contract PositionFixture is IMainnetPositions {
    address public owner;
    address public asset0;
    address public asset1;
    address public approved;
    uint24 public tier;
    int24 public lower;
    int24 public upper;
    uint128 public liquidity;
    uint128 public fees0;
    uint128 public fees1;
    bool public lie;

    function configure(
        address owner_,
        address a,
        address b,
        uint24 fee,
        int24 l,
        int24 u,
        uint128 liq,
        address operator
    ) external {
        owner = owner_;
        asset0 = a;
        asset1 = b;
        tier = fee;
        lower = l;
        upper = u;
        liquidity = liq;
        approved = operator;
    }

    function feeAmounts(uint128 a, uint128 b, bool lie_) external {
        fees0 = a;
        fees1 = b;
        lie = lie_;
    }

    function ownerOf(uint256) external view returns (address) {
        return owner;
    }

    function positions(uint256)
        external
        view
        returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)
    {
        return (0, approved, asset0, asset1, tier, lower, upper, liquidity, 0, 0, fees0, fees1);
    }

    function collect(CollectParams calldata p) external payable returns (uint256 a, uint256 b) {
        require(msg.sender == owner);
        a = fees0;
        b = fees1;
        fees0 = 0;
        fees1 = 0;
        if (!lie) {
            LockerToken(asset0).transfer(p.recipient, a);
            LockerToken(asset1).transfer(p.recipient, b);
        }
    }
}

contract GrainMainnetLiquidityLockerTest {
    LockerVm constant vm = LockerVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant MANAGER = address(bytes20(hex"73991a25c818bf1f1128deaab1492d45638de0d3"));
    address constant PLATFORM = address(0x101);
    address constant CREATOR = address(0x202);
    GrainMainnetLiquidityLocker locker;
    LockerToken token;
    PositionFixture manager;

    function setUp() public {
        vm.chainId(4663);
        token = new LockerToken();
        LockerToken quote = new LockerToken();
        vm.etch(WETH, address(quote).code);
        PositionFixture template = new PositionFixture();
        vm.etch(MANAGER, address(template).code);
        manager = PositionFixture(MANAGER);
        locker = new GrainMainnetLiquidityLocker(address(this), PLATFORM, CREATOR, address(token), WETH);
        _position(address(locker), 10_000, -887200, 887200, 1, address(0));
    }

    function _position(address owner, uint24 tier, int24 lower, int24 upper, uint128 liq, address operator) private {
        manager.configure(owner, address(token), WETH, tier, lower, upper, liq, operator);
    }

    function testOnlyCurveCanBindOnce() public {
        vm.prank(CREATOR);
        vm.expectRevert(GrainMainnetLiquidityLocker.NotCurve.selector);
        locker.register(1);
        locker.register(1);
        require(locker.registered() && locker.tokenId() == 1);
        vm.expectRevert(GrainMainnetLiquidityLocker.InvalidPosition.selector);
        locker.register(2);
    }

    function testRejectsWithdrawableWrongPosition() public {
        _position(CREATOR, 10_000, -887200, 887200, 1, address(0));
        vm.expectRevert(GrainMainnetLiquidityLocker.InvalidPosition.selector);
        locker.register(1);
        _position(address(locker), 3000, -887200, 887200, 1, address(0));
        vm.expectRevert(GrainMainnetLiquidityLocker.InvalidPosition.selector);
        locker.register(1);
        _position(address(locker), 10_000, -887200, 887200, 0, address(0));
        vm.expectRevert(GrainMainnetLiquidityLocker.InvalidPosition.selector);
        locker.register(1);
        _position(address(locker), 10_000, -887200, 887200, 1, CREATOR);
        vm.expectRevert(GrainMainnetLiquidityLocker.InvalidPosition.selector);
        locker.register(1);
    }

    function testFuzzFeesSeparateFromPrincipal(uint128 a, uint128 b) public {
        locker.register(1);
        token.mint(MANAGER, a);
        LockerToken(WETH).mint(MANAGER, b);
        manager.feeAmounts(a, b, false);
        vm.prank(address(0x303));
        locker.collect();
        require(locker.platformOwed(address(token)) == uint256(a) * 35 / 100);
        require(locker.creatorOwed(address(token)) == uint256(a) - uint256(a) * 35 / 100);
        require(locker.platformOwed(WETH) + locker.creatorOwed(WETH) == b);
        require(manager.owner() == address(locker) && manager.liquidity() == 1 && manager.approved() == address(0));
    }

    function testPayeesClaimOnlyTheirBucket() public {
        locker.register(1);
        token.mint(MANAGER, 100);
        LockerToken(WETH).mint(MANAGER, 100);
        manager.feeAmounts(100, 100, false);
        locker.collect();
        vm.prank(CREATOR);
        vm.expectRevert(GrainMainnetLiquidityLocker.NotPayee.selector);
        locker.claim(WETH, false);
        vm.prank(PLATFORM);
        locker.claim(WETH, false);
        require(LockerToken(WETH).balanceOf(PLATFORM) == 35);
        vm.prank(CREATOR);
        locker.claim(WETH, true);
        require(LockerToken(WETH).balanceOf(CREATOR) == 65);
        require(locker.platformOwed(WETH) == 0 && locker.creatorOwed(WETH) == 0);
        require(locker.platformOwed(address(token)) == 35 && locker.creatorOwed(address(token)) == 65);
    }

    function testClaimCannotDoubleSpend() public {
        locker.register(1);
        token.mint(MANAGER, 100);
        manager.feeAmounts(100, 0, false);
        locker.collect();
        vm.prank(PLATFORM);
        locker.claim(address(token), false);
        vm.prank(PLATFORM);
        vm.expectRevert(GrainMainnetLiquidityLocker.NoFees.selector);
        locker.claim(address(token), false);
    }

    function testFalseCollectionCannotCreateDebt() public {
        locker.register(1);
        manager.feeAmounts(100, 100, true);
        vm.expectRevert(GrainMainnetLiquidityLocker.TransferFailed.selector);
        locker.collect();
        require(locker.platformOwed(WETH) == 0 && locker.creatorOwed(WETH) == 0);
    }

    function testNoPrincipalTransferApprovalOrDecreaseEntrypoint() public {
        locker.register(1);
        (bool a,) = address(locker).call(abi.encodeWithSignature("decreaseLiquidity(uint256)", 1));
        (bool b,) = address(locker)
            .call(abi.encodeWithSignature("transferFrom(address,address,uint256)", address(locker), CREATOR, 1));
        (bool c,) = address(locker).call(abi.encodeWithSignature("approve(address,uint256)", CREATOR, 1));
        require(!a && !b && !c && manager.owner() == address(locker));
    }
}
