import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { one } from "@/lib/db";
import type { User } from "@/types";

export const AUTH_COOKIE_NAME = "blog_token";

export const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/"
};

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    throw new Error("JWT_SECRET must be at least 16 characters");
  }
  return new TextEncoder().encode(value);
}

type AuthTokenUser = Pick<User, "id" | "is_admin">;
type CachedAuthUser = {
  expiresAt: number;
  user: User;
};

const AUTH_USER_CACHE_TTL_MS = 30_000;

const globalForAuth = globalThis as typeof globalThis & {
  __blogAuthUserCache?: Map<string, CachedAuthUser>;
};

const authUserCache = globalForAuth.__blogAuthUserCache ?? new Map<string, CachedAuthUser>();
globalForAuth.__blogAuthUserCache = authUserCache;

export async function signToken(user: AuthTokenUser) {
  return new SignJWT({ is_admin: user.is_admin })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function setAuthCookie(user: AuthTokenUser) {
  const token = await signToken(user);
  const jar = await cookies();
  jar.set(AUTH_COOKIE_NAME, token, {
    ...authCookieOptions,
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearAuthCookie() {
  const jar = await cookies();
  jar.set(AUTH_COOKIE_NAME, "", {
    ...authCookieOptions,
    expires: new Date(0),
    maxAge: 0
  });
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, secret());
    const id = verified.payload.sub;
    if (!id) return null;

    const cacheKey = `${id}:${token.slice(-16)}`;
    const cached = authUserCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.user;

    const user = await one<User>(
      `select id, nickname, avatar, bio, is_admin, is_active, created_at
       from users where id = $1 and is_active = true`,
      [id]
    );
    if (user) {
      authUserCache.set(cacheKey, {
        expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
        user
      });
    }
    return user;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.is_admin) throw new Response("Forbidden", { status: 403 });
  return user;
}
