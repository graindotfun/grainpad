import {NextResponse, type NextRequest} from "next/server";
import {documentSecurityHeaders} from "@/lib/security-headers.mjs";

export function middleware(request: NextRequest) {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
  const headers = documentSecurityHeaders(request.nextUrl.hostname, nonce);
  const requestHeaders = new Headers(request.headers);
  // The renderer reads this policy to nonce its inline bootstrap/RSC scripts.
  // Replace client-supplied policies so they cannot choose the rendering nonce.
  requestHeaders.delete("Content-Security-Policy");
  requestHeaders.delete("Content-Security-Policy-Report-Only");
  if (headers["Content-Security-Policy"]) requestHeaders.set("Content-Security-Policy", headers["Content-Security-Policy"]);
  const response = NextResponse.next({request: {headers: requestHeaders}});
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  response.headers.set("X-Kernel", "saw that");
  // HTML containing a per-request nonce must not enter a shared page cache.
  if (headers["Content-Security-Policy"] && request.headers.get("Accept")?.includes("text/html")) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {matcher: ["/((?!_next/static|_next/image).*)"]};
