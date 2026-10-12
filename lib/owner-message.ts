import {SITE} from "./site-config";
export type OwnerRequest={action:"publish-ca"|"record-receipt"|"renew-pilot";value:string;expires:number;nonce:string};
export function ownerMessage(r:OwnerRequest){return `Grainpad owner approval\nSite: ${SITE.origin}\nAction: ${r.action}\nValue: ${r.value}\nExpires: ${r.expires}\nNonce: ${r.nonce}\nThis message does not authorize a transfer.`;}
