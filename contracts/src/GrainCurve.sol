// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GrainFeeVault} from "./GrainFeeVault.sol";
import {GrainParams} from "./GrainParams.sol";

/// @notice Constant-product sale for one factory. Not upgradeable and not a Raydium port.
/// @dev Virtual reserves are never transferred. Only `realQuote` is an asset balance.
///      Output is `reserveOut * amountIn / (reserveIn + amountIn)`, rounded down.
///      Fees are floored and the remainder stays in the net that prices the curve,
///      so platform + creator + trade + net equals the quote amount.
contract GrainCurve is ReentrancyGuard {
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

    struct Launch {
        address token;
        address creator;
        uint256 realQuote;
        uint256 inventory;
        bool exists;
    }

    IERC20 public immutable quote;
    GrainFeeVault public immutable vault;
    address public immutable factory;
    uint256 public immutable platformFeeBps;
    uint256 public immutable creatorFeeBps;
    uint256 public immutable tradeFeeBps;
    uint256 public immutable virtualQuote;
    uint256 public immutable virtualToken;
    uint256 public immutable saleSupply;

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

    constructor(GrainParams.Config memory config, address factory_, GrainFeeVault vault_) {
        if (block.chainid != GrainParams.ROBINHOOD_TESTNET_CHAIN_ID) revert WrongChain();
        if (factory_ == address(0) || address(vault_) == address(0) || config.quote == address(0) || config.platform == address(0)) {
            revert ZeroAddress();
        }
        if (
            config.platformFeeBps > GrainParams.MAX_SINGLE_FEE_BPS || config.creatorFeeBps > GrainParams.MAX_SINGLE_FEE_BPS
                || config.tradeFeeBps > GrainParams.MAX_SINGLE_FEE_BPS
                || uint256(config.platformFeeBps) + config.creatorFeeBps + config.tradeFeeBps > GrainParams.MAX_TOTAL_FEE_BPS
        ) revert FeeCap();
        if (config.virtualQuote == 0 || config.virtualToken == 0 || config.saleSupply == 0) revert ZeroAmount();
        quote = IERC20(config.quote);
        vault = vault_;
        factory = factory_;
        platformFeeBps = config.platformFeeBps;
        creatorFeeBps = config.creatorFeeBps;
        tradeFeeBps = config.tradeFeeBps;
        virtualQuote = config.virtualQuote;
        virtualToken = config.virtualToken;
        saleSupply = config.saleSupply;
        if (!quote.approve(address(vault_), type(uint256).max)) revert TransferFailed();
    }

    function open(bytes32 launchId, address token, address creator) external onlyFactory {
        if (creator == address(0) || token == address(0)) revert ZeroAddress();
        if (launches[launchId].exists || registeredToken[token]) revert DuplicateLaunch();
        if (IERC20(token).totalSupply() != saleSupply || IERC20(token).balanceOf(address(this)) != saleSupply) revert BadSupply();
        registeredToken[token] = true;
        launches[launchId] = Launch({token: token, creator: creator, realQuote: 0, inventory: saleSupply, exists: true});
        vault.registerCreator(launchId, creator);
    }

    function quoteBuy(bytes32 launchId, uint256 quoteIn)
        external
        view
        returns (uint256 tokensOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net)
    {
        Launch storage launch = _launch(launchId);
        return _quoteBuy(launch, quoteIn);
    }

    function quoteSell(bytes32 launchId, uint256 tokenIn)
        external
        view
        returns (uint256 quoteOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net)
    {
        Launch storage launch = _launch(launchId);
        return _quoteSell(launch, tokenIn);
    }

    function buy(bytes32 launchId, uint256 quoteIn, uint256 minTokensOut) external nonReentrant {
        Launch storage launch = _launch(launchId);
        (uint256 tokensOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net) = _quoteBuy(launch, quoteIn);
        if (tokensOut < minTokensOut) revert Slippage();
        launch.realQuote += net;
        launch.inventory -= tokensOut;
        _pull(msg.sender, quoteIn);
        _forwardFees(launchId, platformFee, creatorFee, tradeFee);
        if (!IERC20(launch.token).transfer(msg.sender, tokensOut)) revert TransferFailed();
        emit Bought(launchId, msg.sender, launch.token, quoteIn, platformFee, creatorFee, tradeFee, tokensOut, launch.realQuote, launch.inventory);
    }

    function sell(bytes32 launchId, uint256 tokenIn, uint256 minQuoteNet) external nonReentrant {
        Launch storage launch = _launch(launchId);
        (uint256 quoteOut, uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net) = _quoteSell(launch, tokenIn);
        if (net < minQuoteNet) revert Slippage();
        launch.realQuote -= quoteOut;
        launch.inventory += tokenIn;
        if (!IERC20(launch.token).transferFrom(msg.sender, address(this), tokenIn)) revert TransferFailed();
        _forwardFees(launchId, platformFee, creatorFee, tradeFee);
        if (!quote.transfer(msg.sender, net)) revert TransferFailed();
        emit Sold(launchId, msg.sender, launch.token, tokenIn, quoteOut, platformFee, creatorFee, tradeFee, net, launch.realQuote, launch.inventory);
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
        if (quoteIn == 0) revert ZeroAmount();
        (platformFee, creatorFee, tradeFee, net) = _split(quoteIn);
        if (net == 0) revert ZeroAmount();
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
        if (tokenIn == 0) revert ZeroAmount();
        if (launch.inventory + tokenIn > saleSupply) revert InsufficientOutput();
        uint256 quoteReserve = virtualQuote + launch.realQuote;
        uint256 tokenReserve = virtualToken + launch.inventory;
        quoteOut = quoteReserve * tokenIn / (tokenReserve + tokenIn);
        if (quoteOut == 0 || quoteOut > launch.realQuote) revert InsufficientOutput();
        (platformFee, creatorFee, tradeFee, net) = _split(quoteOut);
        if (net == 0) revert InsufficientOutput();
    }

    function _split(uint256 amount) private view returns (uint256 platformFee, uint256 creatorFee, uint256 tradeFee, uint256 net) {
        platformFee = amount * platformFeeBps / GrainParams.BPS;
        creatorFee = amount * creatorFeeBps / GrainParams.BPS;
        tradeFee = amount * tradeFeeBps / GrainParams.BPS;
        net = amount - platformFee - creatorFee - tradeFee;
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
}
