import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { ok, routeError } from "@/lib/http";
import type { User } from "@/types";

const schema = z.object({
  nickname: z.string().min(1).max(80),
  avatar: z.string().min(1),
  bio: z.string().max(300)
});

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const updated = await one<User>(
      `update users set nickname = $1, avatar = $2, bio = $3
       where id = $4
       returning id, nickname, avatar, bio, is_admin, is_active, created_at`,
      [input.nickname, input.avatar, input.bio, user.id]
    );
    return ok({ user: updated });
  } catch (error) {
    return routeError(error);
  }
}
