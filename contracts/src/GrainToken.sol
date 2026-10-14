// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply launch token. Not upgradeable. No owner and no further mint.
/// @dev Not a production token. The entire supply is minted once to the curve.
contract GrainToken is ERC20 {
    error BadTokenInit();

    constructor(string memory name_, string memory symbol_, address curve, uint256 supply) ERC20(name_, symbol_) {
        if (curve == address(0) || supply == 0) revert BadTokenInit();
        _mint(curve, supply);
    }
}
