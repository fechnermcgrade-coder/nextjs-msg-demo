import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "blog_token";
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

function getSecret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) return null;
  return new TextEncoder().encode(value);
}

function isPublicAsset(pathname: string) {
  return pathname.startsWith("/_next/") || pathname.startsWith("/generated/") || pathname.startsWith("/uploads/");
}

function isPublicApi(pathname: string) {
  return (
    pathname === "/api/auth/me" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/register" ||
    pathname === "/api/auth/send-code" ||
    pathname === "/api/categories" ||
    pathname === "/api/posts"
  );
}

function isPublicRead(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isReadMethod = request.method === "GET" || request.method === "HEAD";

  if (isReadMethod && pathname.startsWith("/post/")) return true;
  if (isReadMethod && /^\/api\/posts\/[^/]+$/.test(pathname)) return true;
  if (isReadMethod && pathname === "/api/comments") return true;
  if (request.method === "POST" && /^\/api\/posts\/[^/]+\/view$/.test(pathname)) return true;

  return false;
}

function safeInternalNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

async function hasValidSession(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = getSecret();
  if (!token || !secret) return false;

  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAsset(pathname) || isPublicApi(pathname) || isPublicRead(request)) {
    return NextResponse.next();
  }

  const hasSession = await hasValidSession(request);

  if ((pathname === "/login" || pathname === "/register") && hasSession) {
    const redirectUrl = new URL(safeInternalNext(request.nextUrl.searchParams.get("next")), request.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (hasSession) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!favicon.ico|.*\\..*).*)"]
};
