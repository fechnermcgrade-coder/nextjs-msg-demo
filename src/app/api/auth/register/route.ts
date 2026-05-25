import bcrypt from "bcryptjs";
import { z } from "zod";
import { setAuthCookie } from "@/lib/auth";
import { ensureEmailLoginSchema } from "@/lib/auth-schema";
import { verifyEmailCode } from "@/lib/email-verification";
import { one } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import type { User } from "@/types";

const schema = z.object({
  email: z.string().trim().email(),
  nickname: z.string().trim().min(1).max(80),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
  verificationCode: z.string().trim().regex(/^\d{6}$/, "请输入 6 位邮箱验证码")
}).refine((value) => value.password === value.confirmPassword, {
  message: "两次输入的密码不一致",
  path: ["confirmPassword"]
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const email = input.email.toLowerCase();

    await ensureEmailLoginSchema();

    const exists = await one("select id from users where lower(email) = $1", [email]);
    if (exists) return bad("邮箱已被注册", 409);

    const nicknameExists = await one("select id from users where lower(nickname) = lower($1)", [input.nickname]);
    if (nicknameExists) return bad("昵称已被占用", 409);

    const verified = await verifyEmailCode(email, input.verificationCode);
    if (!verified) return bad("邮箱验证码无效或已过期", 400);

    const password = await bcrypt.hash(input.password, 10);
    const user = await one<User>(
      `insert into users (email, password, nickname)
       values ($1, $2, $3)
       returning id, nickname, avatar, bio, is_admin, is_active, created_at`,
      [email, password, input.nickname]
    );

    await setAuthCookie(user!);
    return ok({ user });
  } catch (error) {
    return routeError(error);
  }
}
