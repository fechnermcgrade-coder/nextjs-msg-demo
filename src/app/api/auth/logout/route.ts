import { AUTH_COOKIE_NAME, authCookieOptions, clearAuthCookie } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function POST() {
  await clearAuthCookie();
  const response = ok({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    ...authCookieOptions,
    expires: new Date(0),
    maxAge: 0
  });
  return response;
}
