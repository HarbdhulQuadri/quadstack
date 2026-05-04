import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require an authenticated user.
const PROTECTED_PATHS = ["/dashboard"];

// NOTE: Next.js middleware runs in Edge Runtime, which cannot make DB calls.
// This check is a first-pass guard: it rejects clearly unauthenticated requests
// (no session cookie at all) before they hit the server. The ORPC `priv` middleware
// performs the real cryptographic session validation on every API call.
// This means an expired-but-present cookie can still reach the page server component —
// that's fine because any data fetch via `priv` procedures will return UNAUTHORIZED.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const sessionCookie =
    req.cookies.get("better-auth.session_token") ??
    req.cookies.get("__Secure-better-auth.session_token");

  if (!sessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
