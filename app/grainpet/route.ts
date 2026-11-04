/* grainpet lives as a static page under /pet/. The share cards say grainpad.fun/grainpet, so that address leads there. */
export function GET(request: Request) {
  return Response.redirect(new URL("/pet/", request.url), 302);
}
