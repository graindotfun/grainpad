// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GrainMainnetCurve} from "../GrainMainnetCurve.sol";
import {GrainMainnetFeeVault} from "../GrainMainnetFeeVault.sol";
import {GrainMainnetParams} from "../GrainMainnetParams.sol";
import {GrainMainnetPolicy} from "../GrainMainnetPolicy.sol";
import {GrainTokenV2} from "./GrainTokenV2.sol";

interface IWETH9 {
    function deposit() external payable;
}

/// @notice One-transaction launch: create, bind metadata, authorize Monero registration, optionally buy.
/// @dev CANDIDATE. Not deployed, not audited, not compiled in CI yet. Not upgradeable.
///      Reuses GrainMainnetCurve and GrainMainnetFeeVault unchanged (same 35/65/0 bps policy, same platform address).
///      `msg.sender` is the creator: the curve's creator and fee entitlement are the calling wallet, never a wrapper.
///      The creator buy is a normal curve buy made by this factory and forwarded in the same call, so it pays the
///      normal 1% fee and any revert (slippage, curve limit, deadline) reverts the whole launch.
contract GrainMainnetFactoryV2 {
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

    uint64 public constant MAX_AUTHORIZATION_WINDOW = 7 days;
    /// @dev Bounds how many authorization events one launch can emit, so a source reader's log scan stays bounded.
    uint32 public constant MAX_RENEWALS = 16;
    uint256 public constant MAX_URI_BYTES = 256;
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

    GrainMainnetCurve public immutable curve;
    GrainMainnetFeeVault public immutable vault;
    uint256 public immutable saleSupply;
    uint256 public immutable totalSupply;

    mapping(bytes32 => address) public tokenOf;
    /// @notice Number of renewals so far. Authorization events are numbered 0 (creation), 1, 2, ...
    mapping(bytes32 => uint32) public registrationSequence;
    uint256 private _lock = 1;

    /// @dev Same signature as GrainMainnetFactory so existing receipt decoders keep working.
    event LaunchCreated(
        bytes32 indexed launchId, address indexed token, address indexed creator, string name, string symbol
    );
    event LaunchMetadataBound(
        bytes32 indexed launchId, address indexed token, address indexed creator, string metadataURI, bytes32 metadataHash
    );
    /// @dev The creator's own transaction is the authorization. `digest` is recomputed from this call's arguments.
    event MoneroRegistrationAuthorized(
        bytes32 indexed launchId, address indexed creator, bytes32 digest, uint64 expiresAt, uint32 sequence
    );
    event CreatorBuy(
        bytes32 indexed launchId, address indexed creator, uint256 quoteIn, uint256 tokensOut
    );

    constructor() {
        GrainMainnetParams.Economics memory config = GrainMainnetParams.approved();
        GrainMainnetPolicy.validate(GrainMainnetPolicy.WETH, 35, 65, 0);
        saleSupply = config.saleSupply;
        totalSupply = uint256(config.saleSupply) + config.liquiditySupply;
        vault = new GrainMainnetFeeVault(
            GrainMainnetPolicy.WETH, address(bytes20(hex"f405420b031f1a6fbffd0b2f90cc9ed84818dc9a"))
        );
        curve = new GrainMainnetCurve(config, address(this), vault);
        vault.bindCurve(address(curve));
    }

    function registrationDigest(
        address creator,
        bytes32 launchId,
        string memory name,
        string memory symbol,
        bytes32 metadataHash,
        uint64 expiresAt,
        uint32 sequence
    ) public view returns (bytes32) {
        // chainId and factory are inside the hashed struct: a digest cannot be replayed on another chain or factory.
        return keccak256(
            abi.encode(
                REGISTRATION_TYPEHASH,
                block.chainid,
                address(this),
                creator,
                launchId,
                keccak256(bytes(name)),
                keccak256(bytes(symbol)),
                metadataHash,
                expiresAt,
                sequence
            )
        );
    }

    /// @notice The creator re-authorizes Monero registration if the first authorization expired before publication.
    /// @dev Only the launch's creator, only with a fresh bounded expiry, at most MAX_RENEWALS times. Authorizes nothing
    ///      else: no token, fee or ownership right changes.
    function renewRegistration(bytes32 launchId, uint64 expiresAt) external {
        address token = tokenOf[launchId];
        if (token == address(0)) revert UnknownLaunch();
        (, address creator,,,) = curve.launches(launchId);
        if (creator != msg.sender) revert CreatorBinding();
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_AUTHORIZATION_WINDOW) {
            revert BadAuthorization();
        }
        uint32 sequence = registrationSequence[launchId] + 1;
        if (sequence > MAX_RENEWALS) revert RenewalLimit();
        registrationSequence[launchId] = sequence;
        emit MoneroRegistrationAuthorized(
            launchId,
            msg.sender,
            registrationDigest(
                msg.sender,
                launchId,
                GrainTokenV2(token).name(),
                GrainTokenV2(token).symbol(),
                GrainTokenV2(token).metadataHash(),
                expiresAt,
                sequence
            ),
            expiresAt,
            sequence
        );
    }

    /// @notice `msg.value` is the optional creator buy (gross, fee-inclusive). Zero means create only.
    function createAndLaunch(LaunchRequest calldata r) external payable returns (address token, uint256 tokensOut) {
        if (_lock != 1) revert Reentered();
        _lock = 2;
        if (address(uint160(uint256(r.launchId) >> 96)) != msg.sender) revert CreatorBinding();
        if (
            bytes(r.name).length == 0 || bytes(r.name).length > 32 || bytes(r.symbol).length == 0
                || bytes(r.symbol).length > 10
        ) revert BadMetadata();
        if (
            bytes(r.metadataURI).length == 0 || bytes(r.metadataURI).length > MAX_URI_BYTES
                || r.metadataHash == bytes32(0)
        ) revert BadMetadata();
        if (
            r.registrationExpiresAt <= block.timestamp
                || r.registrationExpiresAt > block.timestamp + MAX_AUTHORIZATION_WINDOW
        ) revert BadAuthorization();
        if (r.deadline < block.timestamp) revert BadDeadline();
        if (tokenOf[r.launchId] != address(0)) revert DuplicateLaunch();

        token = address(
            new GrainTokenV2{salt: r.launchId}(
                r.name, r.symbol, address(curve), totalSupply, r.metadataURI, r.metadataHash
            )
        );
        tokenOf[r.launchId] = token;
        curve.open(r.launchId, token, msg.sender);
        emit LaunchCreated(r.launchId, token, msg.sender, r.name, r.symbol);
        emit LaunchMetadataBound(r.launchId, token, msg.sender, r.metadataURI, r.metadataHash);
        emit MoneroRegistrationAuthorized(
            r.launchId,
            msg.sender,
            registrationDigest(msg.sender, r.launchId, r.name, r.symbol, r.metadataHash, r.registrationExpiresAt, 0),
            r.registrationExpiresAt,
            0
        );

        if (msg.value != 0) {
            IERC20 weth = curve.quote();
            // Balance deltas, never absolute balances: anyone can donate WETH to this address, and a donation must not
            // be able to block (or be mistaken for) a launch. The new token cannot be donated before it exists.
            uint256 wethBefore = weth.balanceOf(address(this));
            IWETH9(address(weth)).deposit{value: msg.value}();
            if (!weth.approve(address(curve), msg.value)) revert BuyFailed();
            curve.buy(r.launchId, msg.value, r.minTokensOut, r.deadline);
            if (!weth.approve(address(curve), 0)) revert BuyFailed();
            if (weth.balanceOf(address(this)) != wethBefore) revert BuyFailed();
            tokensOut = IERC20(token).balanceOf(address(this));
            if (tokensOut < r.minTokensOut || !IERC20(token).transfer(msg.sender, tokensOut)) revert BuyFailed();
            emit CreatorBuy(r.launchId, msg.sender, msg.value, tokensOut);
        }
        // The fresh token must not remain here either (nothing else can have sent it before it existed).
        if (IERC20(token).balanceOf(address(this)) != 0) revert BuyFailed();
        _lock = 1;
    }
}
