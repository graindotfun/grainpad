/** Document protection for the public site. Local dev stays unrestricted so the Vite client can run. */
const DOCUMENT_DIRECTIVES=[
 "default-src 'self'",
 "base-uri 'self'",
 "object-src 'none'",
 "style-src 'self' 'unsafe-inline'",
 "img-src 'self' data: blob:",
 "font-src 'self'",
 "connect-src 'self'",
 "worker-src 'self' blob:",
 "frame-src 'none'",
 "frame-ancestors 'none'",
 "form-action 'self'",
];

export function documentSecurityHeaders(hostname,nonce){
 if(hostname==='localhost'||hostname==='127.0.0.1'||hostname==='[::1]')return {};
 // Generated once per request by middleware. Never accept a nonce from a client.
 if(typeof nonce!=='string'||nonce.length!==32||!/^[a-f0-9]{32}$/.test(nonce))throw Error('A fresh 128-bit script nonce is required.');
 return {
  'Content-Security-Policy':[...DOCUMENT_DIRECTIVES,`script-src 'self' 'nonce-${nonce}'`].join('; '),
  'Strict-Transport-Security':'max-age=31536000; includeSubDomains',
  'X-Frame-Options':'DENY',
 };
}
