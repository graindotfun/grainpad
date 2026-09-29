import {NextResponse, type NextRequest} from "next/server";
import {documentSecurityHeaders} from "@/lib/security-headers.mjs";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(documentSecurityHeaders(request.nextUrl.hostname))) response.headers.set(name, value);
  return response;
}

export const config = {matcher: ["/((?!_next/static|_next/image).*)"]};
