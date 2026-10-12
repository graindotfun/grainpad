/** R2's conditional-write API takes its opaque strong ETag without HTTP quotes.
 * Normalize only the R2 boundary, never a custom compareAndSet token. */
export function r2ConditionalEtag(value){
 if(typeof value!=='string')throw Error('Invalid stored R2 ETag. Conditional write refused.');
 const raw=value.startsWith('"')&&value.endsWith('"')?value.slice(1,-1):value;
 // R2 object ETags are a hash, optionally followed by a multipart part count.
 // Do not trim, repeatedly unquote, or turn a list/weak tag/wildcard into a match.
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(raw))throw Error('Invalid stored R2 ETag. Conditional write refused.');
 return raw;
}
