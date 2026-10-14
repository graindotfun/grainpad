// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GrainParams} from "./GrainParams.sol";

/// @notice Holds only accrued fees. It cannot pull curve reserves.
/// @dev Not upgradeable. The curve address is bound once by the factory.
contract GrainFeeVault is ReentrancyGuard {
    error WrongChain();
    error ZeroAddress();
    error CurveAlreadyBound();
    error NotFactory();
    error NotCurve();
    error DuplicateLaunch();
    error NotPayee();
    error ZeroAmount();
    error TransferFailed();

    IERC20 public immutable quote;
    address public immutable platform;
    address public immutable factory;
    address public curve;

    mapping(bytes32 => address) public creatorOf;
    mapping(bytes32 => mapping(GrainParams.FeeKind => uint256)) public owed;

    event CurveBound(address indexed curve);
    event CreatorRegistered(bytes32 indexed launchId, address indexed creator);
    event FeeAccrued(bytes32 indexed launchId, GrainParams.FeeKind indexed kind, uint256 amount);
    event FeeClaimed(bytes32 indexed launchId, GrainParams.FeeKind indexed kind, address indexed payee, uint256 amount);

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    modifier onlyCurve() {
        if (msg.sender != curve) revert NotCurve();
        _;
    }

    constructor(address quote_, address platform_) {
        if (block.chainid != GrainParams.ROBINHOOD_TESTNET_CHAIN_ID) revert WrongChain();
        if (quote_ == address(0) || platform_ == address(0)) revert ZeroAddress();
        quote = IERC20(quote_);
        platform = platform_;
        factory = msg.sender;
    }

    /// @notice One-shot wiring. Only the factory, and only while `curve` is unset.
    function bindCurve(address curve_) external onlyFactory {
        if (curve != address(0) || curve_ == address(0)) revert CurveAlreadyBound();
        curve = curve_;
        emit CurveBound(curve_);
    }

    function registerCreator(bytes32 launchId, address creator) external onlyCurve {
        if (creator == address(0) || creatorOf[launchId] != address(0)) revert DuplicateLaunch();
        creatorOf[launchId] = creator;
        emit CreatorRegistered(launchId, creator);
    }

    function receiveFee(bytes32 launchId, GrainParams.FeeKind kind, uint256 amount) external onlyCurve nonReentrant {
        if (amount == 0) return;
        owed[launchId][kind] += amount;
        _pull(msg.sender, amount);
        emit FeeAccrued(launchId, kind, amount);
    }

    /// @notice Pays one accrued bucket to its payee. Platform and trade fees pay `platform`. Creator fees pay that launch's creator.
    function claim(bytes32 launchId, GrainParams.FeeKind kind) external nonReentrant {
        address payee = kind == GrainParams.FeeKind.Creator ? creatorOf[launchId] : platform;
        if (msg.sender != payee) revert NotPayee();
        uint256 amount = owed[launchId][kind];
        if (amount == 0) revert ZeroAmount();
        owed[launchId][kind] = 0;
        if (!quote.transfer(payee, amount)) revert TransferFailed();
        emit FeeClaimed(launchId, kind, payee, amount);
    }

    function _pull(address from, uint256 amount) private {
        uint256 beforeBalance = quote.balanceOf(address(this));
        if (!quote.transferFrom(from, address(this), amount)) revert TransferFailed();
        if (quote.balanceOf(address(this)) - beforeBalance != amount) revert TransferFailed();
    }
}
