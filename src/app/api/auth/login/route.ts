import bcrypt from "bcryptjs";
import { z } from "zod";
import { setAuthCookie } from "@/lib/auth";
import { ensureEmailLoginSchema } from "@/lib/auth-schema";
import { one } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import type { User } from "@/types";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

type UserWithPassword = User & { password: string };

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const email = input.email.toLowerCase();

    await ensureEmailLoginSchema();

    const user = await one<UserWithPassword>(
      `select id, password, nickname, avatar, bio, is_admin, is_active, created_at
       from users where lower(email) = $1 and is_active = true`,
      [email]
    );

    if (!user || !(await bcrypt.compare(input.password, user.password))) {
      return bad("邮箱或密码错误", 401);
    }

    await setAuthCookie(user);
    const { password, ...safeUser } = user;
    void password;
    return ok({ user: safeUser });
  } catch (error) {
    return routeError(error);
  }
}
