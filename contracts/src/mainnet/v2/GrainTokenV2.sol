// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply launch token with an immutable ERC-7572 `contractURI`.
/// @dev ERC-20 defines no image or links. `contractURI` is a discovery hint, not proof that any terminal ingests it.
///      The URI and its content hash are fixed at construction and cannot be updated. No owner, no further mint.
contract GrainTokenV2 is ERC20 {
    error BadTokenInit();

    /// @dev ERC-7572. Emitted once, at construction, so indexers can re-query.
    event ContractURIUpdated();

    string private _contractURI;
    bytes32 public immutable metadataHash;

    constructor(
        string memory name_,
        string memory symbol_,
        address curve,
        uint256 supply,
        string memory contractURI_,
        bytes32 metadataHash_
    ) ERC20(name_, symbol_) {
        if (curve == address(0) || supply == 0 || bytes(contractURI_).length == 0 || metadataHash_ == bytes32(0)) {
            revert BadTokenInit();
        }
        _contractURI = contractURI_;
        metadataHash = metadataHash_;
        _mint(curve, supply);
        emit ContractURIUpdated();
    }

    function contractURI() external view returns (string memory) {
        return _contractURI;
    }
}
