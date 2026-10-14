// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GrainMainnetFactoryV2} from "../src/mainnet/v2/GrainMainnetFactoryV2.sol";
import {GrainMainnetCurve} from "../src/mainnet/GrainMainnetCurve.sol";
import {GrainTokenV2} from "../src/mainnet/v2/GrainTokenV2.sol";

interface V2ForkVm {
    function deal(address, uint256) external;
    function createSelectFork(string calldata) external returns (uint256);
    function envOr(string calldata, string calldata) external view returns (string memory);
    function skip(bool) external;
}

interface ForkPool {
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool);
    function liquidity() external view returns (uint128);
}

/// @dev Optional real-contract acceptance. Everything runs in a disposable forked VM with test-only ETH: no key, signature,
///      broadcast or real funds. Skips unless RH_FORK_RPC names a production-capable Robinhood Chain (4663) provider.
///      Run: RH_FORK_RPC=<url> forge test --root contracts --match-contract GrainMainnetFactoryV2ForkTest -vv
contract GrainMainnetFactoryV2ForkTest {
    V2ForkVm constant vm = V2ForkVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant MANAGER = address(bytes20(hex"73991a25c818bf1f1128deaab1492d45638de0d3"));
    string constant URI = "https://grainpad.fun/api/robinhood/mainnet/metadata/fork";
    bytes32 constant HASH = keccak256("fork-metadata");

    receive() external payable {}

    function _fork() internal returns (bool) {
        string memory url = vm.envOr("RH_FORK_RPC", string(""));
        if (bytes(url).length == 0) {
            vm.skip(true);
            return false;
        }
        vm.createSelectFork(url);
        require(block.chainid == 4663 && MANAGER.code.length > 0 && WETH.code.length > 0, "not Robinhood mainnet");
        vm.deal(address(this), 100 ether);
        return true;
    }

    function _req(uint256 salt, uint256 minOut) internal view returns (GrainMainnetFactoryV2.LaunchRequest memory) {
        return GrainMainnetFactoryV2.LaunchRequest(
            "Fork Cat", "FCAT", bytes32((uint256(uint160(address(this))) << 96) | salt), URI, HASH, uint64(block.timestamp + 1 days), minOut, block.timestamp + 600
        );
    }

    /// Real position manager and factory: the V2 factory deploys, a creator buy settles with the launch, and the pool exists
    /// at the initialization price with zero liquidity and no trades (the property terminals mis-read as activity).
    function testForkLaunchWithBuyAgainstRealUniswap() public {
        if (!_fork()) return;
        GrainMainnetFactoryV2 factory = new GrainMainnetFactoryV2();
        GrainMainnetCurve curve = factory.curve();
        GrainMainnetFactoryV2.LaunchRequest memory r = _req(1, 1);
        (address token, uint256 out) = factory.createAndLaunch{value: 0.5 ether}(r);
        require(out > 0 && IERC20(token).balanceOf(address(this)) == out, "creator received tokens");
        require(keccak256(bytes(GrainTokenV2(token).contractURI())) == keccak256(bytes(URI)), "contractURI");
        (, address creator, uint256 realQuote,,) = curve.launches(r.launchId);
        require(creator == address(this) && realQuote > 0, "creator identity and curve funding");
        require(IERC20(WETH).balanceOf(address(factory.vault())) == 0.005 ether, "1% total fee in the vault");
        require(IERC20(WETH).balanceOf(address(factory)) == 0 && IERC20(token).balanceOf(address(factory)) == 0, "nothing stranded");
        address pool = curve.poolOf(r.launchId);
        require(pool != address(0) && pool.code.length > 0, "pool deployed by open()");
        (uint160 price,,,,,,) = ForkPool(pool).slot0();
        require(price != 0, "pool initialized");
        require(ForkPool(pool).liquidity() == 0, "initialized pool has no liquidity before graduation");
    }

    /// Fill the curve with one buy: graduation must succeed against the real position manager and lock the position.
    function testForkGraduationAfterCreatorBuyFill() public {
        if (!_fork()) return;
        GrainMainnetFactoryV2 factory = new GrainMainnetFactoryV2();
        GrainMainnetCurve curve = factory.curve();
        GrainMainnetFactoryV2.LaunchRequest memory r = _req(2, 0);
        factory.createAndLaunch(r);
        // The factory has no public max-buy helper; use the curve's, then buy from an ordinary account.
        uint256 amount = curve.maxBuyQuote(r.launchId);
        vm.deal(address(this), amount + 1 ether);
        (bool ok,) = WETH.call{value: amount}(abi.encodeWithSignature("deposit()"));
        require(ok, "wrap");
        IERC20(WETH).approve(address(curve), amount);
        curve.buy(r.launchId, amount, 1);
        require(curve.graduated(r.launchId), "graduated against real Uniswap");
        address pool = curve.poolOf(r.launchId);
        require(ForkPool(pool).liquidity() > 0, "pool has liquidity only after graduation");
        require(curve.lockerOf(r.launchId) != address(0), "position locked");
    }

    /// Renewal on the real chain state: creator only, bounded, sequenced.
    function testForkRenewal() public {
        if (!_fork()) return;
        GrainMainnetFactoryV2 factory = new GrainMainnetFactoryV2();
        GrainMainnetFactoryV2.LaunchRequest memory r = _req(3, 0);
        factory.createAndLaunch(r);
        factory.renewRegistration(r.launchId, uint64(block.timestamp + 2 days));
        require(factory.registrationSequence(r.launchId) == 1, "sequence advanced");
    }
}
