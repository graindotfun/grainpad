// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Isolated metadata-compatibility trial. No owner, metadata updates or further minting.
/// @dev Matching a provider's read interface does not establish that it indexes an unknown factory.
contract GrainMetadataToken is ERC20 {
    error BadMetadata();
    struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }
    struct Display { string image; string description; Socials socials; }
    address public immutable deployer;
    bytes32 public immutable metadataHash;
    string private _uri;
    Display private _display;
    event ContractURIUpdated();

    constructor(
        string memory name_, string memory symbol_, address receiver, uint256 supply,
        address creator, bytes32 launchId, Display memory display
    ) ERC20(name_, symbol_) {
        if (receiver == address(0) || creator == address(0) || supply == 0 ||
            address(uint160(uint256(launchId) >> 96)) != creator ||
            bytes(name_).length == 0 || bytes(name_).length > 32 ||
            bytes(symbol_).length == 0 || bytes(symbol_).length > 10 ||
            bytes(display.image).length == 0 || bytes(display.image).length > 256 ||
            bytes(display.description).length > 1000) revert BadMetadata();
        _link(display.image);
        _link(display.socials.twitter); _link(display.socials.telegram); _link(display.socials.discord);
        _link(display.socials.website); _link(display.socials.farcaster);
        // Existing Grainpad metadata schema has these three social fields. Do not silently commit fewer fields.
        if (bytes(display.socials.discord).length != 0 || bytes(display.socials.farcaster).length != 0) revert BadMetadata();
        deployer = creator;
        _display = display;
        bytes memory document = abi.encodePacked(
            '{"schema":"grainpad.token-metadata.v1","name":', _quote(name_),
            ',"symbol":', _quote(symbol_), ',"description":', _quote(display.description),
            ',"image":', _quote(display.image), ',"external_url":', _quote(display.socials.website),
            ',"links":{"website":', _quote(display.socials.website), ',"twitter":', _quote(display.socials.twitter),
            ',"telegram":', _quote(display.socials.telegram),
            '},"chain":{"networkId":"robinhood:mainnet","chainId":4663,"factory":"',
            _hex(abi.encodePacked(receiver)), '","launchId":"', _hex(abi.encodePacked(launchId)), '"}}'
        );
        metadataHash = keccak256(document);
        _uri = string.concat("data:application/json;base64,", _base64(document));
        _mint(receiver, supply);
        emit ContractURIUpdated();
    }

    function logo() external view returns (string memory) { return _display.image; }
    function description() external view returns (string memory) { return _display.description; }
    function socials() external view returns (string memory twitter, string memory telegram, string memory discord, string memory website, string memory farcaster) {
        Socials storage s = _display.socials;
        return (s.twitter, s.telegram, s.discord, s.website, s.farcaster);
    }
    function getTokenInfo() external view returns (address tokenDeployer, string memory tokenLogo, string memory tokenDescription, Socials memory tokenSocials) {
        return (deployer, _display.image, _display.description, _display.socials);
    }
    function contractURI() external view returns (string memory) { return _uri; }
    /// @dev Discovery aliases only; this trial does not claim full ERC-1046 schema conformance.
    function tokenURI() external view returns (string memory) { return _uri; }
    function metadataURI() external view returns (string memory) { return _uri; }

    function _link(string memory value) private pure {
        bytes memory b = bytes(value);
        if (b.length > 256) revert BadMetadata();
        if (b.length == 0) return;
        // Public HTTPS/IPFS assets only. No credentials or control characters in any URI.
        bool https = b.length > 8 && b[0] == 'h' && b[1] == 't' && b[2] == 't' && b[3] == 'p' && b[4] == 's' && b[5] == ':' && b[6] == '/' && b[7] == '/';
        bool ipfs = b.length > 7 && b[0] == 'i' && b[1] == 'p' && b[2] == 'f' && b[3] == 's' && b[4] == ':' && b[5] == '/' && b[6] == '/';
        if (!https && !ipfs) revert BadMetadata();
        for (uint256 i; i < b.length; i++) if (uint8(b[i]) <= 32 || b[i] == '@' || b[i] == '\\') revert BadMetadata();
    }
    function _hex(bytes memory value) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory out = new bytes(2 + value.length * 2);
        out[0] = '0'; out[1] = 'x';
        for (uint256 i; i < value.length; i++) { out[2 + i * 2] = alphabet[uint8(value[i]) >> 4]; out[3 + i * 2] = alphabet[uint8(value[i]) & 15]; }
        return string(out);
    }
    function _quote(string memory value) private pure returns (bytes memory) {
        bytes memory b = bytes(value); uint256 size = 2;
        for (uint256 i; i < b.length; i++) size += uint8(b[i]) < 32 ? 6 : b[i] == '"' || b[i] == '\\' ? 2 : 1;
        bytes memory out = new bytes(size); out[0] = '"'; uint256 j = 1;
        bytes memory alphabet = "0123456789abcdef";
        for (uint256 i; i < b.length; i++) {
            if (uint8(b[i]) < 32) {
                // JSON.stringify uses short escapes for these five code points; other controls use lower-case hex.
                bytes1 shortEscape = b[i] == 0x08 ? bytes1('b') : b[i] == 0x09 ? bytes1('t') : b[i] == 0x0a ? bytes1('n') : b[i] == 0x0c ? bytes1('f') : b[i] == 0x0d ? bytes1('r') : bytes1(0);
                out[j++] = '\\';
                if (shortEscape != bytes1(0)) { out[j++] = shortEscape; }
                else { out[j++] = 'u'; out[j++] = '0'; out[j++] = '0'; out[j++] = alphabet[uint8(b[i]) >> 4]; out[j++] = alphabet[uint8(b[i]) & 15]; }
            } else { if (b[i] == '"' || b[i] == '\\') out[j++] = '\\'; out[j++] = b[i]; }
        }
        out[j++] = '"';
        // Short escapes consume fewer bytes than the conservative allocation above.
        assembly ("memory-safe") { mstore(out, j) }
        return out;
    }
    function _base64(bytes memory value) private pure returns (string memory) {
        bytes memory alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        bytes memory out = new bytes(4 * ((value.length + 2) / 3)); uint256 j;
        for (uint256 i; i < value.length; i += 3) {
            uint256 n = uint256(uint8(value[i])) << 16;
            if (i + 1 < value.length) n |= uint256(uint8(value[i + 1])) << 8;
            if (i + 2 < value.length) n |= uint8(value[i + 2]);
            out[j++] = alphabet[n >> 18]; out[j++] = alphabet[(n >> 12) & 63];
            out[j++] = i + 1 < value.length ? alphabet[(n >> 6) & 63] : bytes1('=');
            out[j++] = i + 2 < value.length ? alphabet[n & 63] : bytes1('=');
        }
        return string(out);
    }
}
