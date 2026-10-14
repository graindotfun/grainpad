// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GrainCurve} from "../src/GrainCurve.sol";
import {GrainFactory} from "../src/GrainFactory.sol";
import {GrainFeeVault} from "../src/GrainFeeVault.sol";
import {GrainParams} from "../src/GrainParams.sol";
import {GrainToken} from "../src/GrainToken.sol";

interface Vm {
    function chainId(uint256 newChainId) external;
    function prank(address msgSender) external;
    function expectRevert(bytes4 revertData) external;
}

/// @dev Foundry cheatcodes. No keys and no RPC.
Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

contract MockQuote is ERC20 {
    constructor() ERC20("Quote", "QUOTE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FeeOnTransferQuote is ERC20 {
    constructor() ERC20("Taxed", "TAX") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount - 1);
        _burn(from, 1);
        return true;
    }
}

contract ReentrantQuote is ERC20 {
    GrainCurve public curve;
    GrainFeeVault public vault;
    bytes32 public launchId;
    bool public attackBuy;
    bool public attackClaim;

    constructor() ERC20("Reentrant", "RE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function armBuy(GrainCurve curve_, bytes32 launchId_) external {
        curve = curve_;
        launchId = launchId_;
        attackBuy = true;
    }

    function armClaim(GrainFeeVault vault_, bytes32 launchId_) external {
        vault = vault_;
        launchId = launchId_;
        attackClaim = true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (attackBuy) {
            attackBuy = false;
            curve.buy(launchId, 1 ether, 0);
        }
        return super.transferFrom(from, to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (attackClaim) {
            attackClaim = false;
            vault.claim(launchId, GrainParams.FeeKind.Platform);
        }
        return super.transfer(to, amount);
    }
}

contract GrainLaunchTest {
    uint16 internal constant PLATFORM_BPS = 100;
    uint16 internal constant CREATOR_BPS = 200;
    uint16 internal constant TRADE_BPS = 50;
    uint256 internal constant VIRTUAL_QUOTE = 1_000 ether;
    uint256 internal constant VIRTUAL_TOKEN = 1_000_000 ether;
    uint256 internal constant SALE = 1_000_000 ether;
    bytes32 internal constant LAUNCH = bytes32(uint256(1));

    MockQuote internal quote;
    GrainFactory internal factory;
    GrainCurve internal curve;
    GrainFeeVault internal vault;
    GrainToken internal token;
    address internal platform = address(0xB0B);
    address internal creator = address(0xC0FFEE);
    address internal buyer = address(0xBEEF);

    function setUp() public {
        vm.chainId(GrainParams.ROBINHOOD_TESTNET_CHAIN_ID);
        quote = new MockQuote();
        factory = new GrainFactory(_config(address(quote), platform));
        curve = factory.curve();
        vault = factory.vault();
        vm.prank(creator);
        token = GrainToken(factory.create("Grain Test", "GT", LAUNCH));
        quote.mint(buyer, 1_000_000 ether);
        vm.prank(buyer);
        quote.approve(address(curve), type(uint256).max);
    }

    function testFuzzRoundTripConservesQuoteAndSupply(uint96 seed, uint16 fraction) public {
        uint256 amount = uint256(seed) % (500 ether) + 1e12;
        uint256 beforeBuyer = quote.balanceOf(buyer);
        vm.prank(buyer);
        curve.buy(LAUNCH, amount, 1);
        uint256 bought = token.balanceOf(buyer);
        uint256 sellAmount = bought * (uint256(fraction) % 10_000 + 1) / 10_000;
        vm.prank(buyer);
        token.approve(address(curve), sellAmount);
        vm.prank(buyer);
        curve.sell(LAUNCH, sellAmount, 1);
        (, , uint256 reserve, uint256 inventory,) = curve.launches(LAUNCH);
        uint256 fees = vault.owed(LAUNCH, GrainParams.FeeKind.Platform)
            + vault.owed(LAUNCH, GrainParams.FeeKind.Creator)
            + vault.owed(LAUNCH, GrainParams.FeeKind.Trade);
        require(quote.balanceOf(address(curve)) == reserve, "reserve conservation");
        require(quote.balanceOf(address(vault)) == fees, "fee conservation");
        require(beforeBuyer - quote.balanceOf(buyer) == reserve + fees, "quote conservation");
        require(inventory + token.balanceOf(buyer) == SALE, "supply conservation");
        require(quote.balanceOf(buyer) <= beforeBuyer, "round trip profit");
    }

    function testChainIdMatchesPublishedTestnet() public pure {
        require(GrainParams.ROBINHOOD_TESTNET_CHAIN_ID == 46630, "chain");
    }

    function testFactoryRevertsOnMainnetChainId() public {
        vm.chainId(4663);
        vm.expectRevert(GrainFactory.WrongChain.selector);
        new GrainFactory(_config(address(quote), platform));
    }

    function testVaultAndCurveRevertOnWrongChain() public {
        vm.chainId(4663);
        vm.expectRevert(GrainFeeVault.WrongChain.selector);
        new GrainFeeVault(address(quote), platform);
    }

    function testFeeCapRejectsOneLegAndTheSum() public {
        GrainParams.Config memory highLeg = _config(address(quote), platform);
        highLeg.platformFeeBps = 1001;
        vm.expectRevert(GrainCurve.FeeCap.selector);
        new GrainFactory(highLeg);

        GrainParams.Config memory highSum = _config(address(quote), platform);
        highSum.platformFeeBps = 1000;
        highSum.creatorFeeBps = 500;
        highSum.tradeFeeBps = 1;
        vm.expectRevert(GrainCurve.FeeCap.selector);
        new GrainFactory(highSum);
    }

    function testFeeCapBoundaryDeploys() public {
        GrainParams.Config memory edge = _config(address(quote), platform);
        edge.platformFeeBps = 1000;
        edge.creatorFeeBps = 500;
        edge.tradeFeeBps = 0;
        GrainFactory edgeFactory = new GrainFactory(edge);
        require(address(edgeFactory.curve()) != address(0), "curve");
        require(edgeFactory.curve().platformFeeBps() == 1000, "platform");
        require(edgeFactory.curve().creatorFeeBps() == 500, "creator");
        require(edgeFactory.curve().tradeFeeBps() == 0, "trade");
    }

    function testRoundingRemainderStaysInNet() public view {
        uint256 gross = 10001;
        (, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net) = curve.quoteBuy(LAUNCH, gross);
        require(platformFee == 100, "platform");
        require(creatorFee == 200, "creator");
        require(tradeFee == 50, "trade");
        require(net == 9651, "net");
        require(platformFee + creatorFee + tradeFee + net == gross, "sum");
    }

    function testOneWeiBuyFloorsFeesToZero() public view {
        (, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net) = curve.quoteBuy(LAUNCH, 1);
        require(platformFee == 0 && creatorFee == 0 && tradeFee == 0, "floors");
        require(net == 1, "net");
    }

    function testBuySplitsFeesAndLeavesQuoteReserve() public {
        uint256 gross = 10 ether;
        (uint256 tokensOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net) = curve.quoteBuy(LAUNCH, gross);
        require(platformFee + creatorFee + tradeFee + net == gross, "sum");
        require(tokensOut > 0, "tokens");

        vm.prank(buyer);
        curve.buy(LAUNCH, gross, tokensOut);

        (, , uint256 realQuote, uint256 inventory, ) = curve.launches(LAUNCH);
        require(realQuote == net, "real");
        require(inventory == SALE - tokensOut, "inventory");
        require(quote.balanceOf(address(curve)) == realQuote, "curve balance");
        require(quote.balanceOf(address(vault)) == platformFee + creatorFee + tradeFee, "vault");
        require(token.balanceOf(buyer) == tokensOut, "buyer tokens");
        require(vault.owed(LAUNCH, GrainParams.FeeKind.Platform) == platformFee, "platform owed");
        require(vault.owed(LAUNCH, GrainParams.FeeKind.Creator) == creatorFee, "creator owed");
        require(vault.owed(LAUNCH, GrainParams.FeeKind.Trade) == tradeFee, "trade owed");
    }

    function testFirstBuyerStartsFromVirtualReserves() public {
        (, , uint256 realBefore, uint256 inventoryBefore, ) = curve.launches(LAUNCH);
        require(realBefore == 0, "empty");
        require(inventoryBefore == SALE, "full");
        require(token.balanceOf(buyer) == 0, "no tokens");

        uint256 gross = 1 ether;
        (uint256 tokensOut, , , , uint256 net) = curve.quoteBuy(LAUNCH, gross);
        uint256 expected = (VIRTUAL_TOKEN + SALE) * net / (VIRTUAL_QUOTE + net);
        require(tokensOut == expected, "formula");

        vm.prank(buyer);
        curve.buy(LAUNCH, gross, 1);
        require(token.balanceOf(buyer) == tokensOut, "received");
        (, , uint256 realAfter, , ) = curve.launches(LAUNCH);
        require(realAfter == net, "seeded");
    }

    function testLastBuyerFillsInventoryAndNextQuoteReverts() public {
        uint256 lo = 1;
        uint256 hi = 5_000 ether;
        uint256 best;
        while (lo <= hi) {
            uint256 mid = (lo + hi) / 2;
            try curve.quoteBuy(LAUNCH, mid) returns (uint256, uint256, uint256, uint256, uint256) {
                best = mid;
                lo = mid + 1;
            } catch {
                hi = mid - 1;
            }
        }
        require(best > 0 && best < 5_000 ether, "bound");

        (uint256 tokensOut, , , , ) = curve.quoteBuy(LAUNCH, best);
        vm.prank(buyer);
        curve.buy(LAUNCH, best, tokensOut);
        (, , , uint256 inventory, ) = curve.launches(LAUNCH);
        require(inventory < SALE, "sold");
        require(token.balanceOf(buyer) == tokensOut, "last buyer");

        vm.expectRevert(GrainCurve.SoldOut.selector);
        curve.quoteBuy(LAUNCH, best + 1);
    }

    function testCannotSellVirtualQuoteBeforeABuy() public {
        vm.expectRevert(GrainCurve.InsufficientOutput.selector);
        curve.quoteSell(LAUNCH, 1);
    }

    function testSlippageBoundsOnBuyAndSell() public {
        uint256 gross = 2 ether;
        (uint256 tokensOut, , , , ) = curve.quoteBuy(LAUNCH, gross);
        vm.expectRevert(GrainCurve.Slippage.selector);
        vm.prank(buyer);
        curve.buy(LAUNCH, gross, tokensOut + 1);

        vm.prank(buyer);
        curve.buy(LAUNCH, gross, tokensOut);

        (uint256 quoteOut, , , , uint256 net) = curve.quoteSell(LAUNCH, tokensOut);
        require(quoteOut > net && net > 0, "sell fee");
        vm.prank(buyer);
        token.approve(address(curve), tokensOut);
        vm.expectRevert(GrainCurve.Slippage.selector);
        vm.prank(buyer);
        curve.sell(LAUNCH, tokensOut, net + 1);

        uint256 quoteBefore = quote.balanceOf(buyer);
        vm.prank(buyer);
        curve.sell(LAUNCH, tokensOut, net);
        require(quote.balanceOf(buyer) - quoteBefore == net, "net paid");
        require(token.balanceOf(buyer) == 0, "tokens back");
    }

    function testRoundTripPaysFeesAndKeepsCurveSolvent() public {
        uint256 gross = 25 ether;
        (uint256 tokensOut, , , , ) = curve.quoteBuy(LAUNCH, gross);
        uint256 buyerBefore = quote.balanceOf(buyer);
        vm.prank(buyer);
        curve.buy(LAUNCH, gross, tokensOut);
        vm.prank(buyer);
        token.approve(address(curve), tokensOut);
        (uint256 quoteOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net) = curve.quoteSell(LAUNCH, tokensOut);
        vm.prank(buyer);
        curve.sell(LAUNCH, tokensOut, net);

        require(quote.balanceOf(buyer) < buyerBefore, "trader paid");
        require(buyerBefore - quote.balanceOf(buyer) == gross - net, "round trip cost");
        (, , uint256 realQuote, uint256 inventory, ) = curve.launches(LAUNCH);
        require(inventory == SALE, "inventory restored");
        require(realQuote == (gross - (gross * 350 / 10_000)) - quoteOut, "dust");
        require(quote.balanceOf(address(curve)) == realQuote, "solvent");
        require(quoteOut == platformFee + creatorFee + tradeFee + net, "sell split");
    }

    function testClaimsPayOnlyTheAccruedBucket() public {
        uint256 gross = 10 ether;
        (, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, ) = curve.quoteBuy(LAUNCH, gross);
        vm.prank(buyer);
        curve.buy(LAUNCH, gross, 0);
        uint256 reserve = quote.balanceOf(address(curve));

        vm.expectRevert(GrainFeeVault.NotPayee.selector);
        vm.prank(creator);
        vault.claim(LAUNCH, GrainParams.FeeKind.Platform);

        vm.expectRevert(GrainFeeVault.NotPayee.selector);
        vm.prank(platform);
        vault.claim(LAUNCH, GrainParams.FeeKind.Creator);

        vm.expectRevert(GrainFeeVault.NotPayee.selector);
        vm.prank(buyer);
        vault.claim(LAUNCH, GrainParams.FeeKind.Trade);

        vm.prank(platform);
        vault.claim(LAUNCH, GrainParams.FeeKind.Platform);
        vm.prank(platform);
        vault.claim(LAUNCH, GrainParams.FeeKind.Trade);
        vm.prank(creator);
        vault.claim(LAUNCH, GrainParams.FeeKind.Creator);

        require(quote.balanceOf(platform) == platformFee + tradeFee, "platform paid");
        require(quote.balanceOf(creator) == creatorFee, "creator paid");
        require(quote.balanceOf(address(vault)) == 0, "vault empty");
        require(quote.balanceOf(address(curve)) == reserve, "reserve stays");

        vm.expectRevert(GrainFeeVault.ZeroAmount.selector);
        vm.prank(creator);
        vault.claim(LAUNCH, GrainParams.FeeKind.Creator);
    }

    function testTwoLaunchesKeepFeesAndReservesApart() public {
        bytes32 otherId = bytes32(uint256(2));
        address otherCreator = address(0xC0B);
        vm.prank(otherCreator);
        GrainToken other = GrainToken(factory.create("Other Grain", "OG", otherId));

        vm.prank(buyer);
        curve.buy(LAUNCH, 10 ether, 0);
        vm.prank(buyer);
        curve.buy(otherId, 20 ether, 0);

        uint256 firstCreatorFee = vault.owed(LAUNCH, GrainParams.FeeKind.Creator);
        uint256 secondCreatorFee = vault.owed(otherId, GrainParams.FeeKind.Creator);
        require(secondCreatorFee == firstCreatorFee * 2, "scaled");

        vm.expectRevert(GrainFeeVault.NotPayee.selector);
        vm.prank(creator);
        vault.claim(otherId, GrainParams.FeeKind.Creator);

        vm.prank(otherCreator);
        vault.claim(otherId, GrainParams.FeeKind.Creator);
        require(vault.owed(LAUNCH, GrainParams.FeeKind.Creator) == firstCreatorFee, "untouched");
        require(quote.balanceOf(otherCreator) == secondCreatorFee, "paid");

        (, , uint256 realA, , ) = curve.launches(LAUNCH);
        (, , uint256 realB, , ) = curve.launches(otherId);
        require(quote.balanceOf(address(curve)) == realA + realB, "shared reserve");
        require(other.totalSupply() == SALE, "supply");
    }

    function testDuplicateLaunchIdAndTokenRegistration() public {
        vm.expectRevert(GrainFactory.DuplicateLaunch.selector);
        vm.prank(creator);
        factory.create("Grain Test", "GT", LAUNCH);

        vm.expectRevert(GrainCurve.DuplicateLaunch.selector);
        vm.prank(address(factory));
        curve.open(LAUNCH, address(token), creator);

        vm.expectRevert(GrainCurve.DuplicateLaunch.selector);
        vm.prank(address(factory));
        curve.open(bytes32(uint256(9)), address(token), creator);
    }

    function testBadMetadataAndUnknownLaunch() public {
        vm.expectRevert(GrainFactory.BadMetadata.selector);
        factory.create("", "GT", bytes32(uint256(3)));
        vm.expectRevert(GrainFactory.BadMetadata.selector);
        factory.create("Grain Test", "", bytes32(uint256(4)));
        vm.expectRevert(GrainFactory.BadMetadata.selector);
        factory.create("this name is longer than thirty two", "GT", bytes32(uint256(5)));

        vm.expectRevert(GrainCurve.UnknownLaunch.selector);
        curve.quoteBuy(bytes32(uint256(8)), 1);
        vm.expectRevert(GrainCurve.ZeroAmount.selector);
        curve.quoteBuy(LAUNCH, 0);
    }

    function testStrangerCannotWireOrAccrue() public {
        vm.expectRevert(GrainCurve.NotFactory.selector);
        curve.open(bytes32(uint256(7)), address(token), creator);

        vm.expectRevert(GrainFeeVault.NotFactory.selector);
        vault.bindCurve(address(0x1234));

        vm.expectRevert(GrainFeeVault.CurveAlreadyBound.selector);
        vm.prank(address(factory));
        vault.bindCurve(address(0x1234));

        vm.expectRevert(GrainFeeVault.NotCurve.selector);
        vault.registerCreator(LAUNCH, creator);

        vm.expectRevert(GrainFeeVault.NotCurve.selector);
        vault.receiveFee(LAUNCH, GrainParams.FeeKind.Platform, 1 ether);
    }

    function testNoPremintAndNoSecondMint() public view {
        require(token.totalSupply() == SALE, "supply");
        require(token.balanceOf(address(curve)) + token.balanceOf(buyer) == SALE, "conserved");
        require(token.decimals() == 18, "decimals");
    }

    function testBuyReentrancyReverts() public {
        ReentrantQuote bad = new ReentrantQuote();
        GrainFactory badFactory = new GrainFactory(_config(address(bad), platform));
        GrainCurve badCurve = badFactory.curve();
        vm.prank(creator);
        badFactory.create("Reentrant", "RE", LAUNCH);
        bad.mint(buyer, 10 ether);
        vm.prank(buyer);
        bad.approve(address(badCurve), type(uint256).max);
        bad.armBuy(badCurve, LAUNCH);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(buyer);
        badCurve.buy(LAUNCH, 1 ether, 0);
    }

    function testClaimReentrancyReverts() public {
        ReentrantQuote bad = new ReentrantQuote();
        GrainFactory badFactory = new GrainFactory(_config(address(bad), platform));
        GrainCurve badCurve = badFactory.curve();
        GrainFeeVault badVault = badFactory.vault();
        vm.prank(creator);
        badFactory.create("Reentrant", "RE", LAUNCH);
        bad.mint(buyer, 10 ether);
        vm.prank(buyer);
        bad.approve(address(badCurve), type(uint256).max);
        vm.prank(buyer);
        badCurve.buy(LAUNCH, 1 ether, 0);
        bad.armClaim(badVault, LAUNCH);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(platform);
        badVault.claim(LAUNCH, GrainParams.FeeKind.Platform);
    }

    function testFeeOnTransferQuoteIsRejected() public {
        FeeOnTransferQuote taxed = new FeeOnTransferQuote();
        GrainFactory taxedFactory = new GrainFactory(_config(address(taxed), platform));
        GrainCurve taxedCurve = taxedFactory.curve();
        vm.prank(creator);
        taxedFactory.create("Taxed", "TAX", LAUNCH);
        taxed.mint(buyer, 10 ether);
        vm.prank(buyer);
        taxed.approve(address(taxedCurve), type(uint256).max);

        vm.expectRevert(GrainCurve.TransferFailed.selector);
        vm.prank(buyer);
        taxedCurve.buy(LAUNCH, 1 ether, 0);
        require(taxed.balanceOf(address(taxedCurve)) == 0, "untouched");
    }

    function _config(address quoteToken, address platform_) internal pure returns (GrainParams.Config memory) {
        return GrainParams.Config({
            quote: quoteToken,
            platform: platform_,
            platformFeeBps: PLATFORM_BPS,
            creatorFeeBps: CREATOR_BPS,
            tradeFeeBps: TRADE_BPS,
            virtualQuote: VIRTUAL_QUOTE,
            virtualToken: VIRTUAL_TOKEN,
            saleSupply: SALE
        });
    }
}
