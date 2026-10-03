/** Shared by the browser seal and the server. This message does not authorize a transaction. */
export const IDENTITY_SCHEMA='grainpad.identity.v1';
export function headerSealMessage({mint,metadataHash,imageHash,headerHash}){
 return ['Grainpad launch identity seal',`Schema: ${IDENTITY_SCHEMA}`,`Mint: ${mint}`,`Metadata SHA256: ${metadataHash}`,`Image SHA256: ${imageHash}`,`Header SHA256: ${headerHash}`,'This seals the canonical launch banner. It does not authorize a payment or a transaction.'].join('\n');
}
