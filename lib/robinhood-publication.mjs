/** Owner-withdrawn trial listings. Display removal only: immutable receipts,
 * metadata and financial/publication records remain untouched. Future launches are not gated. */
export const WITHDRAWN_ROBINHOOD_MAINNET = Object.freeze([
 '0x9dde6af4508c2870c1beadec39706d0b425972de',
 '0x6934eed974c6d0f11be1504ba1f64139d39f0c2d',
]);
export function isPublicRobinhoodToken(network, token) {
 return network !== 'robinhood:mainnet' || !WITHDRAWN_ROBINHOOD_MAINNET.includes(String(token).toLowerCase());
}
