// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GrainMainnetFactoryV2} from "../src/mainnet/v2/GrainMainnetFactoryV2.sol";
import {GrainTokenV2} from "../src/mainnet/v2/GrainTokenV2.sol";
import {GrainMainnetCurve} from "../src/mainnet/GrainMainnetCurve.sol";
import {LocalWeth} from "./LocalWeth.sol";
import {
    MainnetPositionsFixture,
    MainnetDexFactoryFixture,
    MainnetQuoteFixture
} from "./GrainMainnetLaunch.t.sol";

interface V2Vm {
    function chainId(uint256) external;
    function etch(address, bytes calldata) external;
    function deal(address, uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
}

/// @dev Offline tests against fixtures. They do not touch a real Uniswap deployment; the real-contract fork
///      acceptance stays an owner gate (see docs/ROBINHOOD_ONE_APPROVAL_LAUNCH.md).
contract GrainMainnetFactoryV2Test {
    V2Vm constant vm = V2Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant MANAGER = address(bytes20(hex"73991a25c818bf1f1128deaab1492d45638de0d3"));
    address constant DEX = address(bytes20(hex"1f7d7550b1b028f7571e69a784071f0205fd2efa"));
    string constant URI = "https://grainpad.fun/api/robinhood/mainnet/metadata/x";
    bytes32 constant HASH = keccak256("metadata");

    GrainMainnetFactoryV2 factory;
    GrainMainnetCurve curve;

    receive() external payable {}

    function setUp() public {
        vm.chainId(4663);
        vm.warp(1_800_000_000);
        vm.etch(WETH, address(new LocalWeth()).code);
        vm.etch(MANAGER, address(new MainnetPositionsFixture()).code);
        vm.etch(DEX, address(new MainnetDexFactoryFixture()).code);
        factory = new GrainMainnetFactoryV2();
        curve = factory.curve();
        vm.deal(address(this), 100 ether);
    }

    function _id(uint256 salt) internal view returns (bytes32) {
        return bytes32((uint256(uint160(address(this))) << 96) | salt);
    }

    function _req(bytes32 id, uint256 minOut) internal view returns (GrainMainnetFactoryV2.LaunchRequest memory) {
        return GrainMainnetFactoryV2.LaunchRequest("Grain Cat", "GCAT", id, URI, HASH, uint64(block.timestamp + 1 days), minOut, block.timestamp + 600);
    }

    function testCreateWithoutBuyBindsMetadataAndCreator() public {
        bytes32 id = _id(1);
        (address token, uint256 out) = factory.createAndLaunch(_req(id, 0));
        require(out == 0 && factory.tokenOf(id) == token);
        require(keccak256(bytes(GrainTokenV2(token).contractURI())) == keccak256(bytes(URI)));
        require(GrainTokenV2(token).metadataHash() == HASH);
        (, address creator,,,) = curve.launches(id);
        require(creator == address(this), "creator is the calling wallet");
        require(IERC20(token).balanceOf(address(curve)) == 1_000_000_000 ether);
        require(IERC20(token).balanceOf(address(factory)) == 0 && IERC20(WETH).balanceOf(address(factory)) == 0);
        require(address(factory).balance == 0);
    }

    function testCreatorBuySettlesInOneCallWithNormalFees() public {
        bytes32 id = _id(2);
        uint256 net = 0.99 ether;
        uint256 expected = (1_000_000_000 ether) * net / (1 ether + net);
        (address token, uint256 out) = factory.createAndLaunch{value: 1 ether}(_req(id, expected));
        require(out == expected && IERC20(token).balanceOf(address(this)) == expected);
        (, address creator, uint256 realQuote,,) = curve.launches(id);
        require(creator == address(this) && realQuote == net);
        require(IERC20(WETH).balanceOf(address(factory.vault())) == 0.01 ether, "1% total fee");
        require(IERC20(token).balanceOf(address(factory)) == 0 && IERC20(WETH).balanceOf(address(factory)) == 0);
        require(IERC20(WETH).allowance(address(factory), address(curve)) == 0);
    }

    function testSlippageRevertsTheWholeLaunch() public {
        bytes32 id = _id(3);
        vm.expectRevert(GrainMainnetCurve.Slippage.selector);
        factory.createAndLaunch{value: 1 ether}(_req(id, type(uint256).max));
        require(factory.tokenOf(id) == address(0), "no token survives a failed buy");
    }

    function testBuyAboveGraduationTargetRevertsTheWholeLaunch() public {
        bytes32 id = _id(4);
        vm.expectRevert(GrainMainnetCurve.CurveLimit.selector);
        factory.createAndLaunch{value: 5 ether}(_req(id, 1));
        require(factory.tokenOf(id) == address(0));
    }

    function testCreatorBindingAndDuplicateAreEnforced() public {
        vm.expectRevert(GrainMainnetFactoryV2.CreatorBinding.selector);
        vm.prank(address(0xBEEF));
        factory.createAndLaunch(_req(_id(5), 0));
        factory.createAndLaunch(_req(_id(6), 0));
        vm.expectRevert(GrainMainnetFactoryV2.DuplicateLaunch.selector);
        factory.createAndLaunch(_req(_id(6), 0));
    }

    function testAuthorizationWindowAndMetadataValidation() public {
        GrainMainnetFactoryV2.LaunchRequest memory r = _req(_id(7), 0);
        r.registrationExpiresAt = uint64(block.timestamp);
        vm.expectRevert(GrainMainnetFactoryV2.BadAuthorization.selector);
        factory.createAndLaunch(r);
        r.registrationExpiresAt = uint64(block.timestamp + 8 days);
        vm.expectRevert(GrainMainnetFactoryV2.BadAuthorization.selector);
        factory.createAndLaunch(r);
        r = _req(_id(7), 0);
        r.metadataHash = bytes32(0);
        vm.expectRevert(GrainMainnetFactoryV2.BadMetadata.selector);
        factory.createAndLaunch(r);
        r = _req(_id(7), 0);
        r.deadline = block.timestamp - 1;
        vm.expectRevert(GrainMainnetFactoryV2.BadDeadline.selector);
        factory.createAndLaunch(r);
    }

    function testRegistrationDigestBindsEveryField() public view {
        bytes32 a = factory.registrationDigest(address(this), _id(1), "Grain Cat", "GCAT", HASH, 10, 0);
        require(a != factory.registrationDigest(address(0xBEEF), _id(1), "Grain Cat", "GCAT", HASH, 10, 0));
        require(a != factory.registrationDigest(address(this), _id(2), "Grain Cat", "GCAT", HASH, 10, 0));
        require(a != factory.registrationDigest(address(this), _id(1), "Grain Dog", "GCAT", HASH, 10, 0));
        require(a != factory.registrationDigest(address(this), _id(1), "Grain Cat", "GCAT", keccak256("other"), 10, 0));
        require(a != factory.registrationDigest(address(this), _id(1), "Grain Cat", "GCAT", HASH, 11, 0));
        require(a != factory.registrationDigest(address(this), _id(1), "Grain Cat", "GCAT", HASH, 10, 1));
    }

    function testRenewalIsCreatorOnlyBoundedAndSequenced() public {
        bytes32 id = _id(8);
        factory.createAndLaunch(_req(id, 0));
        require(factory.registrationSequence(id) == 0);
        factory.renewRegistration(id, uint64(block.timestamp + 2 days));
        require(factory.registrationSequence(id) == 1);
        vm.expectRevert(GrainMainnetFactoryV2.CreatorBinding.selector);
        vm.prank(address(0xBEEF));
        factory.renewRegistration(id, uint64(block.timestamp + 2 days));
        vm.expectRevert(GrainMainnetFactoryV2.UnknownLaunch.selector);
        factory.renewRegistration(_id(99), uint64(block.timestamp + 2 days));
        vm.expectRevert(GrainMainnetFactoryV2.BadAuthorization.selector);
        factory.renewRegistration(id, uint64(block.timestamp));
        vm.expectRevert(GrainMainnetFactoryV2.BadAuthorization.selector);
        factory.renewRegistration(id, uint64(block.timestamp + 8 days));
        for (uint256 i = 2; i <= 16; ++i) factory.renewRegistration(id, uint64(block.timestamp + 2 days));
        vm.expectRevert(GrainMainnetFactoryV2.RenewalLimit.selector);
        factory.renewRegistration(id, uint64(block.timestamp + 2 days));
    }

    /// @dev A stranger can send WETH to the factory. That must neither block launches nor be swept to the creator.
    function testDonatedWethCannotBlockLaunches() public {
        LocalWeth(payable(WETH)).deposit{value: 1}();
        IERC20(WETH).transfer(address(factory), 1);
        factory.createAndLaunch(_req(_id(20), 0));
        (address token,) = factory.createAndLaunch{value: 1 ether}(_req(_id(21), 1));
        require(IERC20(WETH).balanceOf(address(factory)) == 1, "donation untouched");
        require(IERC20(token).balanceOf(address(factory)) == 0);
    }
}
