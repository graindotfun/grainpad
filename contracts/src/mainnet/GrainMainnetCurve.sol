// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GrainMainnetFeeVault} from "./GrainMainnetFeeVault.sol";
import {GrainMainnetPolicy} from "./GrainMainnetPolicy.sol";
import {GrainMainnetParams} from "./GrainMainnetParams.sol";
import {GrainMainnetLiquidityLocker} from "./GrainMainnetLiquidityLocker.sol";
import {IGraduationPositions, IGraduationPool, IGraduationFactory} from "./IGraduationPositions.sol";
import {GrainParams} from "../GrainParams.sol";

/// @notice Constant-product sale for one factory. Not upgradeable and not a Raydium port.
/// @dev Virtual reserves are never transferred. Only `realQuote` is an asset balance.
///      Output is `reserveOut * amountIn / (reserveIn + amountIn)`, rounded down.
///      Fees are floored and the remainder stays in the net that prices the curve,
///      so platform + creator + trade + net equals the quote amount.
contract GrainMainnetCurve is ReentrancyGuard {
    error WrongChain();
    error ZeroAddress();
    error ZeroAmount();
    error FeeCap();
    error NotFactory();
    error DuplicateLaunch();
    error UnknownLaunch();
    error BadSupply();
    error SoldOut();
    error InsufficientOutput();
    error Slippage();
    error TransferFailed();
    error CurveLimit();
    error AlreadyGraduated();
    error NotSelf();
    error GraduationNotReady();
    error UnsafePool();
    error Expired();

    struct Launch {
        address token;
        address creator;
        uint256 realQuote;
        uint256 inventory;
        bool exists;
    }

    IERC20 public immutable quote;
    GrainMainnetFeeVault public immutable vault;
    address public immutable factory;
    uint256 public immutable platformFeeBps;
    uint256 public immutable creatorFeeBps;
    uint256 public immutable tradeFeeBps;
    uint256 public immutable virtualQuote;
    uint256 public immutable virtualToken;
    uint256 public immutable saleSupply;

    uint256 public immutable liquiditySupply;
    uint256 public immutable graduationQuote;
    address public constant POSITION_MANAGER = address(bytes20(hex"73991a25c818bf1f1128deaab1492d45638de0d3"));
    address public constant DEX_FACTORY = address(bytes20(hex"1f7d7550b1b028f7571e69a784071f0205fd2efa"));
    mapping(bytes32 => bool) public graduated;
    mapping(bytes32 => bool) public graduationPending;
    mapping(bytes32 => address) public lockerOf;
    mapping(bytes32 => address) public poolOf;
    mapping(bytes32 => uint256) public lpTokenId;
    mapping(bytes32 => uint256) public lockedTokenDust;
    mapping(bytes32 => uint256) public lockedQuoteDust;
    event GraduationPending(bytes32 indexed launchId);
    event Graduated(
        bytes32 indexed launchId,
        address indexed pool,
        address indexed locker,
        uint256 positionId,
        uint256 quoteDeposited,
        uint256 tokensDeposited
    );
    mapping(bytes32 => Launch) public launches;
    mapping(address => bool) public registeredToken;

    event Bought(
        bytes32 indexed launchId,
        address indexed buyer,
        address indexed token,
        uint256 quoteIn,
        uint256 platformFee,
        uint256 creatorFee,
        uint256 tradeFee,
        uint256 tokensOut,
        uint256 realQuote,
        uint256 inventory
    );
    event Sold(
        bytes32 indexed launchId,
        address indexed seller,
        address indexed token,
        uint256 tokenIn,
        uint256 quoteOut,
        uint256 platformFee,
        uint256 creatorFee,
        uint256 tradeFee,
        uint256 quoteNet,
        uint256 realQuote,
        uint256 inventory
    );

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    constructor(GrainMainnetParams.Economics memory config, address factory_, GrainMainnetFeeVault vault_) {
        GrainMainnetPolicy.validate(address(vault_.quote()), 35, 65, 0);
        if (factory_ == address(0) || address(vault_) == address(0)) revert ZeroAddress();
        uint256 total = uint256(config.saleSupply) + config.liquiditySupply;
        if (
            config.virtualQuote == 0 || config.virtualToken == 0 || config.saleSupply == 0
                || config.liquiditySupply == 0 || config.graduationQuote == 0 || total > type(uint128).max
                || uint256(config.virtualQuote) + config.graduationQuote > type(uint128).max
                || uint256(config.virtualToken) + config.saleSupply > type(uint128).max
                || config.virtualToken > config.liquiditySupply
                || uint256(config.graduationQuote) * config.virtualToken
                    > uint256(config.virtualQuote) * config.saleSupply
        ) revert BadSupply();
        if (
            POSITION_MANAGER.code.length == 0 || IGraduationPositions(POSITION_MANAGER).factory() != DEX_FACTORY
                || IGraduationFactory(DEX_FACTORY).feeAmountTickSpacing(10_000) != 200
        ) revert UnsafePool();
        quote = vault_.quote();
        vault = vault_;
        factory = factory_;
        platformFeeBps = 35;
        creatorFeeBps = 65;
        tradeFeeBps = 0;
        virtualQuote = config.virtualQuote;
        virtualToken = config.virtualToken;
        saleSupply = config.saleSupply;
        liquiditySupply = config.liquiditySupply;
        graduationQuote = config.graduationQuote;
        if (!quote.approve(address(vault_), type(uint256).max)) revert TransferFailed();
    }

    function open(bytes32 launchId, address token, address creator) external onlyFactory {
        if (creator == address(0) || token == address(0)) revert ZeroAddress();
        if (launches[launchId].exists || registeredToken[token]) revert DuplicateLaunch();
        if (
            IERC20(token).totalSupply() != saleSupply + liquiditySupply
                || IERC20(token).balanceOf(address(this)) != saleSupply + liquiditySupply
        ) revert BadSupply();
        registeredToken[token] = true;
        launches[launchId] = Launch({token: token, creator: creator, realQuote: 0, inventory: saleSupply, exists: true});
        vault.registerCreator(launchId, creator);
        // Initialize before any buyer funds this launch. A malicious preinitialized
        // pool then rejects creation rather than trapping a funded graduation.
        uint256 sold = (virtualToken + saleSupply) * graduationQuote / (virtualQuote + graduationQuote);
        uint256 reserveToken = virtualToken + saleSupply - sold;
        uint256 lpTokens = graduationQuote * reserveToken / (virtualQuote + graduationQuote);
        (,, address pool) = _pool(token, graduationQuote, lpTokens);
        poolOf[launchId] = pool;
    }

    function quoteBuy(bytes32 launchId, uint256 quoteIn)
        external
        view
        returns (uint256 tokensOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net)
    {
        Launch storage launch = _launch(launchId);
        if (graduated[launchId]) revert AlreadyGraduated();
        return _quoteBuy(launch, quoteIn);
    }

    function quoteSell(bytes32 launchId, uint256 tokenIn)
        external
        view
        returns (uint256 quoteOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net)
    {
        Launch storage launch = _launch(launchId);
        if (graduated[launchId]) revert AlreadyGraduated();
        return _quoteSell(launch, tokenIn);
    }

    function buy(bytes32 launchId, uint256 quoteIn, uint256 minTokensOut) external nonReentrant {
        _buy(launchId, quoteIn, minTokensOut);
    }
    function buy(bytes32 launchId, uint256 quoteIn, uint256 minTokensOut, uint256 deadline) external nonReentrant {
        if (block.timestamp > deadline) revert Expired();
        _buy(launchId, quoteIn, minTokensOut);
    }
    function _buy(bytes32 launchId, uint256 quoteIn, uint256 minTokensOut) private {
        Launch storage launch = _launch(launchId);
        if (graduated[launchId]) revert AlreadyGraduated();
        (uint256 tokensOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net) =
            _quoteBuy(launch, quoteIn);
        if (tokensOut < minTokensOut) revert Slippage();
        launch.realQuote += net;
        launch.inventory -= tokensOut;
        _pull(msg.sender, quoteIn);
        _forwardFees(launchId, platformFee, creatorFee, tradeFee);
        if (!IERC20(launch.token).transfer(msg.sender, tokensOut)) revert TransferFailed();
        emit Bought(
            launchId,
            msg.sender,
            launch.token,
            quoteIn,
            platformFee,
            creatorFee,
            tradeFee,
            tokensOut,
            launch.realQuote,
            launch.inventory
        );
        if (launch.realQuote == graduationQuote) _tryGraduate(launchId);
    }

    function sell(bytes32 launchId, uint256 tokenIn, uint256 minQuoteNet) external nonReentrant {
        _sell(launchId, tokenIn, minQuoteNet);
    }
    function sell(bytes32 launchId, uint256 tokenIn, uint256 minQuoteNet, uint256 deadline) external nonReentrant {
        if (block.timestamp > deadline) revert Expired();
        _sell(launchId, tokenIn, minQuoteNet);
    }
    function _sell(bytes32 launchId, uint256 tokenIn, uint256 minQuoteNet) private {
        Launch storage launch = _launch(launchId);
        if (graduated[launchId]) revert AlreadyGraduated();
        (uint256 quoteOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net) =
            _quoteSell(launch, tokenIn);
        if (net < minQuoteNet) revert Slippage();
        launch.realQuote -= quoteOut;
        launch.inventory += tokenIn;
        graduationPending[launchId] = false;
        if (!IERC20(launch.token).transferFrom(msg.sender, address(this), tokenIn)) revert TransferFailed();
        _forwardFees(launchId, platformFee, creatorFee, tradeFee);
        if (!quote.transfer(msg.sender, net)) revert TransferFailed();
        emit Sold(
            launchId,
            msg.sender,
            launch.token,
            tokenIn,
            quoteOut,
            platformFee,
            creatorFee,
            tradeFee,
            net,
            launch.realQuote,
            launch.inventory
        );
    }

    function _launch(bytes32 launchId) private view returns (Launch storage launch) {
        launch = launches[launchId];
        if (!launch.exists) revert UnknownLaunch();
    }

    function _quoteBuy(Launch storage launch, uint256 quoteIn)
        private
        view
        returns (uint256 tokensOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net)
    {
        if (quoteIn == 0 || quoteIn > type(uint128).max) revert ZeroAmount();
        (platformFee, creatorFee, tradeFee, net) = _split(quoteIn);
        if (net == 0) revert ZeroAmount();
        if (net > graduationQuote - launch.realQuote) revert CurveLimit();
        uint256 quoteReserve = virtualQuote + launch.realQuote;
        uint256 tokenReserve = virtualToken + launch.inventory;
        // Floor division favors the pool, so a later sell of these tokens cannot ask for more quote than `net` added.
        tokensOut = tokenReserve * net / (quoteReserve + net);
        if (tokensOut == 0) revert InsufficientOutput();
        if (tokensOut > launch.inventory) revert SoldOut();
    }

    function _quoteSell(Launch storage launch, uint256 tokenIn)
        private
        view
        returns (uint256 quoteOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net)
    {
        if (tokenIn == 0 || tokenIn > saleSupply) revert ZeroAmount();
        if (launch.inventory + tokenIn > saleSupply) revert InsufficientOutput();
        uint256 quoteReserve = virtualQuote + launch.realQuote;
        uint256 tokenReserve = virtualToken + launch.inventory;
        quoteOut = quoteReserve * tokenIn / (tokenReserve + tokenIn);
        if (quoteOut == 0 || quoteOut > launch.realQuote) revert InsufficientOutput();
        (platformFee, creatorFee, tradeFee, net) = _split(quoteOut);
        if (net == 0) revert InsufficientOutput();
    }

    function _split(uint256 amount)
        private
        pure
        returns (uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net)
    {
        (platformFee, creatorFee, net) = GrainMainnetPolicy.split(amount);
        tradeFee = 0;
    }

    function _pull(address from, uint256 amount) private {
        uint256 beforeBalance = quote.balanceOf(address(this));
        if (!quote.transferFrom(from, address(this), amount)) revert TransferFailed();
        if (quote.balanceOf(address(this)) - beforeBalance != amount) revert TransferFailed();
    }

    function _forwardFees(bytes32 launchId, uint256 platformFee, uint256 creatorFee, uint256 tradeFee) private {
        if (platformFee != 0) vault.receiveFee(launchId, GrainParams.FeeKind.Platform, platformFee);
        if (creatorFee != 0) vault.receiveFee(launchId, GrainParams.FeeKind.Creator, creatorFee);
        if (tradeFee != 0) vault.receiveFee(launchId, GrainParams.FeeKind.Trade, tradeFee);
    }

    /// @notice Last buy can fill the curve exactly despite integer fee rounding.
    function maxBuyQuote(bytes32 launchId) external view returns (uint256) {
        Launch storage launch = _launch(launchId);
        if (graduated[launchId] || launch.realQuote >= graduationQuote) return 0;
        uint256 remaining = graduationQuote - launch.realQuote;
        uint256 estimate = remaining * 100 / 99;
        for (uint256 i; i < 8 && estimate >= i; ++i) {
            uint256 candidate = estimate - i;
            (,, uint256 net) = GrainMainnetPolicy.split(candidate);
            if (net == remaining) return candidate;
        }
        revert CurveLimit();
    }

    /// @notice Retry a failed external graduation without any admin or fund redirection.
    function graduate(bytes32 launchId) external nonReentrant {
        Launch storage launch = _launch(launchId);
        if (graduated[launchId]) revert AlreadyGraduated();
        if (launch.realQuote != graduationQuote) revert GraduationNotReady();
        _tryGraduate(launchId);
    }

    function _tryGraduate(bytes32 launchId) private {
        try this.executeGraduation(launchId) {
            graduationPending[launchId] = false;
        }
        catch {
            graduationPending[launchId] = true;
            emit GraduationPending(launchId);
        }
    }

    /// @dev Self-call makes an external DEX failure atomic while retaining the completed buy.
    function executeGraduation(bytes32 launchId) external {
        if (msg.sender != address(this)) revert NotSelf();
        Launch storage launch = _launch(launchId);
        if (graduated[launchId] || launch.realQuote != graduationQuote) revert GraduationNotReady();
        uint256 quoteAmount = launch.realQuote;
        uint256 tokenAmount = quoteAmount * (virtualToken + launch.inventory) / (virtualQuote + quoteAmount);
        if (tokenAmount == 0 || tokenAmount > launch.inventory + liquiditySupply) revert UnsafePool();
        (address asset0, address asset1, address pool) = _pool(launch.token, quoteAmount, tokenAmount);
        uint256 amount0 = asset0 == launch.token ? tokenAmount : quoteAmount;
        uint256 amount1 = asset1 == launch.token ? tokenAmount : quoteAmount;
        IGraduationPositions manager = IGraduationPositions(POSITION_MANAGER);
        GrainMainnetLiquidityLocker locker = new GrainMainnetLiquidityLocker(
            address(this), vault.platform(), launch.creator, launch.token, address(quote)
        );
        graduated[launchId] = true;
        if (
            !quote.approve(POSITION_MANAGER, quoteAmount)
                || !IERC20(launch.token).approve(POSITION_MANAGER, tokenAmount)
        ) revert TransferFailed();
        (uint256 id, uint128 liquidity, uint256 used0, uint256 used1) = manager.mint(
            IGraduationPositions.MintParams(
                asset0,
                asset1,
                10_000,
                -887200,
                887200,
                amount0,
                amount1,
                amount0 * 99 / 100,
                amount1 * 99 / 100,
                address(locker),
                block.timestamp
            )
        );
        if (
            liquidity == 0 || used0 > amount0 || used1 > amount1 || used0 < amount0 * 99 / 100
                || used1 < amount1 * 99 / 100
        ) revert UnsafePool();
        if (!quote.approve(POSITION_MANAGER, 0) || !IERC20(launch.token).approve(POSITION_MANAGER, 0)) {
            revert TransferFailed();
        }
        locker.register(id);
        uint256 usedQuote = asset0 == address(quote) ? used0 : used1;
        uint256 usedToken = asset0 == launch.token ? used0 : used1;
        lockedQuoteDust[launchId] = quoteAmount - usedQuote;
        lockedTokenDust[launchId] = launch.inventory + liquiditySupply - usedToken;
        launch.realQuote = 0;
        launch.inventory = 0;
        lockerOf[launchId] = address(locker);
        poolOf[launchId] = pool;
        lpTokenId[launchId] = id;
        emit Graduated(launchId, pool, address(locker), id, usedQuote, usedToken);
    }

    function _pool(address token, uint256 quoteAmount, uint256 tokenAmount)
        private
        returns (address asset0, address asset1, address pool)
    {
        if (tokenAmount == 0 || quoteAmount == 0) revert UnsafePool();
        asset0 = token < address(quote) ? token : address(quote);
        asset1 = token < address(quote) ? address(quote) : token;
        uint256 amount0 = asset0 == token ? tokenAmount : quoteAmount;
        uint256 amount1 = asset1 == token ? tokenAmount : quoteAmount;
        uint256 ratio = (amount1 << 96) / amount0;
        if (ratio == 0) revert UnsafePool();
        uint160 price = uint160(_sqrt(ratio) << 48);
        pool = IGraduationPositions(POSITION_MANAGER).createAndInitializePoolIfNecessary(asset0, asset1, 10_000, price);
        (uint160 actual,,,,,,) = IGraduationPool(pool).slot0();
        if (uint256(actual) * 1000 < uint256(price) * 999 || uint256(actual) * 1000 > uint256(price) * 1001) {
            revert UnsafePool();
        }
    }

    function _sqrt(uint256 x) private pure returns (uint256 result) {
        if (x == 0) return 0;
        if (x < 4) return 1;
        result = x;
        uint256 next = x / 2 + 1;
        while (next < result) {
            result = next;
            next = (x / next + next) / 2;
        }
    }
}
