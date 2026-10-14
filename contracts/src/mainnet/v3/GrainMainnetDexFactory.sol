// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GrainMainnetPolicy} from "../GrainMainnetPolicy.sol";
import {GrainTokenV2} from "../v2/GrainTokenV2.sol";
import {IV3Factory, IV3Pool, IV3Npm} from "./IUniswapV3Min.sol";
import {GrainMainnetDexLocker} from "./GrainMainnetDexLocker.sol";

interface IWETH9 {
    function deposit() external payable;
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Fixed-supply one-transaction launch into permanently locked Uniswap V3 liquidity.
/// @dev Owner policy: all 1B tokens enter one continuous range; no graduation, reserve or principal exit.
///      Optional creator purchase and Monero authorization are bound to the same launch transaction.
contract GrainMainnetDexFactory {
    error WrongChain();
    error BadMetadata();
    error DuplicateLaunch();
    error CreatorBinding();
    error BadAuthorization();
    error BadDeadline();
    error Reentered();
    error BuyFailed();
    error UnknownLaunch();
    error RenewalLimit();
    error BadPlan();
    error PoolNotFresh();
    error PositionFailed();
    error BuyExceedsRange();
    error BadCallback();

    uint64 public constant MAX_AUTHORIZATION_WINDOW = 7 days;
    uint32 public constant MAX_RENEWALS = 16;
    uint256 public constant MAX_URI_BYTES = 256;
    uint24 public constant POOL_FEE = 10_000;
    bytes32 public constant REGISTRATION_TYPEHASH = keccak256(
        "GrainpadMoneroRegistration(uint256 chainId,address factory,address creator,bytes32 launchId,bytes32 nameHash,bytes32 symbolHash,bytes32 metadataHash,uint64 expiresAt,uint32 sequence)"
    );

    struct LaunchRequest {
        string name;
        string symbol;
        bytes32 launchId;
        string metadataURI;
        bytes32 metadataHash;
        uint64 registrationExpiresAt;
        uint256 minTokensOut;
        uint256 deadline;
    }

    address public constant weth = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    IV3Npm public constant npm = IV3Npm(address(bytes20(hex"73991a25c818bf1f1128deaab1492d45638de0d3")));
    IV3Factory public constant dex = IV3Factory(address(bytes20(hex"1f7d7550b1b028f7571e69a784071f0205fd2efa")));
    address public constant platform = address(bytes20(hex"f405420b031f1a6fbffd0b2f90cc9ed84818dc9a"));
    uint256 public constant totalSupply = 1_000_000_000 ether;
    int24 public constant OPEN_TICK = -207200;
    int24 public constant FAR_TICK = 887200;
    uint160 public constant SQRT_OPEN_A = 2510809139091789284100322;
    uint160 public constant SQRT_OPEN_B = 2500031419217008302293562112940196;
    uint160 public constant SQRT_FAR_A = 1456195216270955103206513029158776779468408838535;
    uint160 public constant SQRT_FAR_B = 4310618292;
    mapping(bytes32 => address) public poolOf;
    mapping(bytes32 => uint256) public positionIdOf;
    mapping(bytes32 => address) public tokenOf;
    mapping(bytes32 => address) public creatorOf;
    mapping(bytes32 => address) public lockerOf;
    mapping(bytes32 => uint32) public registrationSequence;
    uint256 private _lock = 1;
    address private _activePool;

    event LaunchCreated(bytes32 indexed launchId, address indexed token, address indexed creator, string name, string symbol);
    event LaunchMetadataBound(bytes32 indexed launchId, address indexed token, address indexed creator, string metadataURI, bytes32 metadataHash);
    event MoneroRegistrationAuthorized(bytes32 indexed launchId, address indexed creator, bytes32 digest, uint64 expiresAt, uint32 sequence);
    event CreatorBuy(bytes32 indexed launchId, address indexed creator, uint256 quoteIn, uint256 tokensOut);
    event LaunchPositionLocked(
        bytes32 indexed launchId, address indexed token, address pool, address locker, uint256 positionId,
        int24 tickLower, int24 tickUpper, uint128 liquidity, bool tokenIsToken0
    );

    constructor() {
        GrainMainnetPolicy.validate(weth, 35, 65, 0);
        if (npm.factory() != address(dex) || npm.WETH9() != weth || dex.feeAmountTickSpacing(POOL_FEE) != 200) revert BadPlan();
    }

    function registrationDigest(address creator, bytes32 launchId, string memory name, string memory symbol, bytes32 metadataHash, uint64 expiresAt, uint32 sequence)
        public view returns (bytes32)
    {
        return keccak256(abi.encode(REGISTRATION_TYPEHASH, block.chainid, address(this), creator, launchId, keccak256(bytes(name)), keccak256(bytes(symbol)), metadataHash, expiresAt, sequence));
    }

    function renewRegistration(bytes32 launchId, uint64 expiresAt) external {
        address token = tokenOf[launchId];
        if (token == address(0)) revert UnknownLaunch();
        if (creatorOf[launchId] != msg.sender) revert CreatorBinding();
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_AUTHORIZATION_WINDOW) revert BadAuthorization();
        uint32 sequence = registrationSequence[launchId] + 1;
        if (sequence > MAX_RENEWALS) revert RenewalLimit();
        registrationSequence[launchId] = sequence;
        emit MoneroRegistrationAuthorized(
            launchId, msg.sender,
            registrationDigest(msg.sender, launchId, GrainTokenV2(token).name(), GrainTokenV2(token).symbol(), GrainTokenV2(token).metadataHash(), expiresAt, sequence),
            expiresAt, sequence
        );
    }

    /// @notice Address the token will have for this request (creation code includes metadata, so it is bound to it).
    function predictToken(LaunchRequest calldata r) public view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(
            type(GrainTokenV2).creationCode, abi.encode(r.name, r.symbol, address(this), totalSupply, r.metadataURI, r.metadataHash)
        ));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), r.launchId, h)))));
    }

    struct Placed {
        address pool;
        GrainMainnetDexLocker locker;
        bool tokenIsToken0;
        uint160 sqrtEnd;
    }

    /// @notice `msg.value` is the optional creator buy (gross, fee-inclusive). Zero means create only: no WETH ever enters.
    function createAndLaunch(LaunchRequest calldata r) external payable returns (address token, uint256 tokensOut) {
        if (_lock != 1) revert Reentered();
        _lock = 2;
        _validate(r);
        token = address(new GrainTokenV2{salt: r.launchId}(r.name, r.symbol, address(this), totalSupply, r.metadataURI, r.metadataHash));
        tokenOf[r.launchId] = token;
        creatorOf[r.launchId] = msg.sender;
        emit LaunchCreated(r.launchId, token, msg.sender, r.name, r.symbol);
        emit LaunchMetadataBound(r.launchId, token, msg.sender, r.metadataURI, r.metadataHash);
        emit MoneroRegistrationAuthorized(
            r.launchId, msg.sender, registrationDigest(msg.sender, r.launchId, r.name, r.symbol, r.metadataHash, r.registrationExpiresAt, 0), r.registrationExpiresAt, 0
        );
        Placed memory placed = _place(r.launchId, token);
        if (msg.value != 0) tokensOut = _creatorBuy(r, placed);
        // Nothing may remain here: not tokens (bar none), not WETH.
        if (IERC20(token).balanceOf(address(this)) != 0) revert PositionFailed();
        _lock = 1;
    }

    function _validate(LaunchRequest calldata r) private view {
        if (address(uint160(uint256(r.launchId) >> 96)) != msg.sender) revert CreatorBinding();
        if (bytes(r.name).length == 0 || bytes(r.name).length > 32 || bytes(r.symbol).length == 0 || bytes(r.symbol).length > 10) revert BadMetadata();
        if (bytes(r.metadataURI).length == 0 || bytes(r.metadataURI).length > MAX_URI_BYTES || r.metadataHash == bytes32(0)) revert BadMetadata();
        if (r.registrationExpiresAt <= block.timestamp || r.registrationExpiresAt > block.timestamp + MAX_AUTHORIZATION_WINDOW) revert BadAuthorization();
        if (r.deadline < block.timestamp) revert BadDeadline();
        if (tokenOf[r.launchId] != address(0)) revert DuplicateLaunch();
    }

    function _place(bytes32 launchId, address token) private returns (Placed memory placed) {
        bool isT0 = token < weth;
        placed.tokenIsToken0 = isT0;
        int24 lo = isT0 ? OPEN_TICK : int24(-FAR_TICK);
        int24 hi = isT0 ? FAR_TICK : int24(-OPEN_TICK);
        uint160 sqrtInit = isT0 ? SQRT_OPEN_A : SQRT_OPEN_B;
        placed.sqrtEnd = isT0 ? SQRT_FAR_A : SQRT_FAR_B;
        (address t0, address t1) = isT0 ? (token, weth) : (weth, token);
        // Pool: created and initialized here. A pool that already exists must sit exactly at our price with no active liquidity,
        // otherwise the launch reverts (griefing costs the attacker; it can never move our funds or price).
        address pool = npm.createAndInitializePoolIfNecessary(t0, t1, POOL_FEE, sqrtInit);
        {
            (uint160 sp, int24 tk,,,,,) = IV3Pool(pool).slot0();
            if (sp != sqrtInit || tk != (isT0 ? lo : hi) || IV3Pool(pool).liquidity() != 0) revert PoolNotFresh();
        }
        placed.pool = pool;
        poolOf[launchId] = pool;
        GrainMainnetDexLocker locker = new GrainMainnetDexLocker(
            address(this), platform, msg.sender, token, weth, pool, address(npm), isT0, lo, hi
        );
        placed.locker = locker;
        lockerOf[launchId] = address(locker);
        IERC20(token).approve(address(npm), totalSupply);
        (uint256 id, uint128 liquidity, uint256 used0, uint256 used1) = npm.mint(
            IV3Npm.MintParams({
                token0: t0, token1: t1, fee: POOL_FEE, tickLower: lo, tickUpper: hi,
                amount0Desired: isT0 ? totalSupply : 0, amount1Desired: isT0 ? 0 : totalSupply,
                amount0Min: 0, amount1Min: 0, recipient: address(locker), deadline: block.timestamp
            })
        );
        IERC20(token).approve(address(npm), 0);
        uint256 usedTokens = isT0 ? used0 : used1;
        uint256 usedWeth = isT0 ? used1 : used0;
        // Token-only: no quote asset was supplied; rounding dust (tokens not placed) goes to the locker, never stays here.
        if (usedWeth != 0 || usedTokens * 1_000_000 < uint256(totalSupply) * 999_999 || liquidity == 0) revert PositionFailed();
        uint256 toLocker = IERC20(token).balanceOf(address(this));
        if (toLocker != 0 && !IERC20(token).transfer(address(locker), toLocker)) revert PositionFailed();
        locker.register(id);
        positionIdOf[launchId] = id;
        emit LaunchPositionLocked(launchId, token, pool, address(locker), id, lo, hi, liquidity, isT0);
    }

    function _creatorBuy(LaunchRequest calldata r, Placed memory placed) private returns (uint256 tokensOut) {
        uint256 wethBefore = IERC20(weth).balanceOf(address(this));
        IWETH9(weth).deposit{value: msg.value}();
        _activePool = placed.pool;
        // Buying the token with WETH: WETH is token1 when the token is token0 (price rises), token0 otherwise (price falls).
        (int256 a0, int256 a1) = IV3Pool(placed.pool).swap(msg.sender, !placed.tokenIsToken0, int256(msg.value), placed.sqrtEnd, "");
        _activePool = address(0);
        uint256 wethUsed = placed.tokenIsToken0 ? uint256(a1) : uint256(a0);
        int256 out = placed.tokenIsToken0 ? a0 : a1;
        if (out >= 0) revert BuyFailed();
        tokensOut = uint256(-out);
        if (wethUsed != msg.value) revert BuyExceedsRange();           // range exhausted: never a partial launch buy
        if (tokensOut < r.minTokensOut) revert BuyFailed();
        if (IERC20(weth).balanceOf(address(this)) != wethBefore) revert BuyFailed();
        emit CreatorBuy(r.launchId, msg.sender, msg.value, tokensOut);
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        if (msg.sender != _activePool || _activePool == address(0)) revert BadCallback();
        uint256 owed = amount0Delta > 0 ? uint256(amount0Delta) : amount1Delta > 0 ? uint256(amount1Delta) : 0;
        if (!IWETH9(weth).transfer(msg.sender, owed)) revert BuyFailed();
    }
}
