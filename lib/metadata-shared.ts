export type MetadataDraft={name:string;symbol:string;description:string;imageBase64:string;imageType:string;owner:string;expires:number;website?:string;twitter?:string;telegram?:string;declaredCreatorBuy?:string;quoteAsset?:string;storageProfile?:string;metadataUri?:string;imageUri?:string};
export function metadataLink(value:unknown,kind:"website"|"twitter"|"telegram"){
  if(value===undefined||value==="")return "";
  if(typeof value!=="string"||value.length>300)throw Error("Project links must be URLs below 300 characters.");
  const text=value.trim();if(!text)return "";
  let url:URL;try{url=new URL(text);}catch{throw Error("Enter a complete HTTPS project link.");}
  if(url.protocol!=="https:"||url.username||url.password)throw Error("Project links must use HTTPS without embedded credentials.");
  if(kind==="twitter"&&(!["x.com","www.x.com","twitter.com","www.twitter.com"].includes(url.hostname)||!/^\/[A-Za-z0-9_]{1,15}\/?$/.test(url.pathname)||url.search||url.hash))throw Error("Enter an X / Twitter profile URL.");
  if(kind==="telegram"&&(!["t.me","www.t.me","telegram.me","www.telegram.me"].includes(url.hostname)||!/^\/[A-Za-z0-9_]{5,32}\/?$/.test(url.pathname)||url.search||url.hash))throw Error("Enter a Telegram profile URL.");
  return url.toString();
}
// Direction overrides and invisible characters let a name render differently from its bytes. ZWJ/ZWNJ stay allowed for emoji and scripts.
const INVISIBLE=/[\u061C\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/u;
export function assertMetadataText(d:{name:string;symbol:string;description:string}){
  if(INVISIBLE.test(d.name)||/[\u0000-\u001F\u007F-\u009F]/u.test(d.name))throw Error("Token names cannot contain control, direction or invisible characters.");
  if(INVISIBLE.test(d.description)||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(d.description))throw Error("Descriptions cannot contain control, direction or invisible characters.");
}
export function metadataPayload(d:MetadataDraft){
  // Omitted fields preserve signatures from older drafts; supplied links are signed.
  return JSON.stringify({name:d.name.trim(),symbol:d.symbol.trim(),description:d.description.trim(),imageBase64:d.imageBase64,imageType:d.imageType,owner:d.owner,expires:d.expires,...(d.website!==undefined?{website:d.website.trim()}:{}),...(d.twitter!==undefined?{twitter:d.twitter.trim()}:{}),...(d.telegram!==undefined?{telegram:d.telegram.trim()}:{}),...(d.declaredCreatorBuy!==undefined?{declaredCreatorBuy:d.declaredCreatorBuy,quoteAsset:d.quoteAsset}:{}),...(d.storageProfile!==undefined?{storageProfile:d.storageProfile,metadataUri:d.metadataUri,imageUri:d.imageUri}:{})});
}
export function metadataMessage(origin:string,hash:string){return `Launch Lab metadata\nOrigin: ${origin}\nSHA256: ${hash}\nThis signature publishes token metadata. It does not authorize a payment.`;}
