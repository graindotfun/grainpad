// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {GrainMainnetPolicy} from "../src/mainnet/GrainMainnetPolicy.sol";

interface PolicyVm {
    function chainId(uint256 value) external;
    function expectRevert(bytes4 reason) external;
}

contract MainnetPolicyHarness {
    function split(uint256 amount) external pure returns (uint256, uint256, uint256) {
        return GrainMainnetPolicy.split(amount);
    }

    function validate(address quote, uint16 platformBps, uint16 creatorBps, uint16 tradeBps) external view {
        GrainMainnetPolicy.validate(quote, platformBps, creatorBps, tradeBps);
    }
}

contract GrainMainnetPolicyTest {
    PolicyVm constant vm = PolicyVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    MainnetPolicyHarness policy;
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    function setUp() public {
        vm.chainId(4663);
        policy = new MainnetPolicyHarness();
    }

    function testExactOneEtherFees() public view {
        (uint256 platformFee, uint256 creatorFee, uint256 net) = policy.split(1 ether);
        require(platformFee == 0.0035 ether && creatorFee == 0.0065 ether && net == 0.99 ether);
    }

    function testFuzzConservation(uint256 amount) public view {
        (uint256 platformFee, uint256 creatorFee, uint256 net) = policy.split(amount);
        require(platformFee <= amount / 100 && creatorFee <= amount / 100);
        require(platformFee + creatorFee <= amount / 100);
        require(net == amount - platformFee - creatorFee);
    }

    function testApprovedMainnetPolicy() public view {
        policy.validate(WETH, 35, 65, 0);
    }

    function testMaximumAmountAndRoundingBoundaries() public view {
        uint256[6] memory amounts = [uint256(0), 1, 99, 100, 10_000, type(uint256).max];
        for (uint256 i; i < amounts.length; ++i) {
            uint256 amount = amounts[i];
            (uint256 platformFee, uint256 creatorFee, uint256 net) = policy.split(amount);
            uint256 quotient = amount / 10_000;
            uint256 remainder = amount % 10_000;
            require(platformFee == quotient * 35 + remainder * 35 / 10_000);
            require(creatorFee == quotient * 65 + remainder * 65 / 10_000);
            require(platformFee + creatorFee + net == amount);
        }
    }

    function testTestnetChainCannotUseMainnetPolicy() public {
        vm.chainId(46630);
        vm.expectRevert(GrainMainnetPolicy.WrongMainnetChain.selector);
        policy.validate(WETH, 35, 65, 0);
    }

    function testTestnetQuoteCannotUseMainnetPolicy() public {
        vm.expectRevert(GrainMainnetPolicy.WrongMainnetQuote.selector);
        policy.validate(0x7943e237c7F95DA44E0301572D358911207852Fa, 35, 65, 0);
    }

    function testOldTestnetFeeLegCannotBeAdded() public {
        vm.expectRevert(GrainMainnetPolicy.WrongMainnetFees.selector);
        policy.validate(WETH, 35, 65, 50);
    }

    function testAlternativeSplitCannotReplaceOwnerChoice() public {
        vm.expectRevert(GrainMainnetPolicy.WrongMainnetFees.selector);
        policy.validate(WETH, 50, 50, 0);
    }
}
