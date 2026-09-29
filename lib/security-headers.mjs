/** Document protection for the public site. Local dev stays unrestricted so the Vite client can run. */
export const DOCUMENT_CSP=[
 "default-src 'self'",
 "base-uri 'self'",
 "object-src 'none'",
 "script-src 'self'",
 "style-src 'self' 'unsafe-inline'",
 "img-src 'self' data: blob:",
 "font-src 'self'",
 "connect-src 'self'",
 "worker-src 'self' blob:",
 "frame-src 'none'",
 "frame-ancestors 'none'",
 "form-action 'self'",
].join('; ');

export function documentSecurityHeaders(hostname){
 if(hostname==='localhost'||hostname==='127.0.0.1'||hostname==='[::1]')return {};
 return {
  'Content-Security-Policy':DOCUMENT_CSP,
  'Strict-Transport-Security':'max-age=31536000; includeSubDomains',
  'X-Frame-Options':'DENY',
 };
}
