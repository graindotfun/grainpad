export type MetadataDraft={name:string;symbol:string;description:string;imageBase64:string;imageType:string;owner:string;expires:number;website?:string;twitter?:string};
export function metadataLink(value:unknown,kind:"website"|"twitter"){
  if(value===undefined||value==="")return "";
  if(typeof value!=="string"||value.length>300)throw Error("Project links must be URLs below 300 characters.");
  const text=value.trim();if(!text)return "";
  let url:URL;try{url=new URL(text);}catch{throw Error("Enter a complete HTTPS project link.");}
  if(url.protocol!=="https:"||url.username||url.password)throw Error("Project links must use HTTPS without embedded credentials.");
  if(kind==="twitter"&&(!["x.com","www.x.com","twitter.com","www.twitter.com"].includes(url.hostname)||!/^\/[A-Za-z0-9_]{1,15}\/?$/.test(url.pathname)||url.search||url.hash))throw Error("Enter an X / Twitter profile URL.");
  return url.toString();
}
export function metadataPayload(d:MetadataDraft){
  // Omitted fields preserve signatures from older drafts; supplied links are signed.
  return JSON.stringify({name:d.name.trim(),symbol:d.symbol.trim(),description:d.description.trim(),imageBase64:d.imageBase64,imageType:d.imageType,owner:d.owner,expires:d.expires,...(d.website!==undefined?{website:d.website.trim()}:{}),...(d.twitter!==undefined?{twitter:d.twitter.trim()}:{})});
}
export function metadataMessage(origin:string,hash:string){return `Launch Lab metadata\nOrigin: ${origin}\nSHA256: ${hash}\nThis signature publishes token metadata. It does not authorize a payment.`;}
