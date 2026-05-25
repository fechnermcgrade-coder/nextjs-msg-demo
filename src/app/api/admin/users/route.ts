import { requireAdmin } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import type { User } from "@/types";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const q = new URL(request.url).searchParams.get("q")?.trim();
    const values: unknown[] = [];
    const where = q ? "where nickname ilike $1 or bio ilike $1" : "";
    if (q) values.push(`%${q}%`);
    const users = await query<User>(
      `select id, nickname, avatar, bio, is_admin, is_active, created_at,
        (select count(*)::int from posts where user_id = users.id) as post_count,
        (select count(*)::int from follows where following_id = users.id) as follower_count
       from users ${where} order by created_at desc`,
      values
    );
    return ok({ users });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = await request.json() as { id?: string; action?: string };
    if (!input.id) return bad("User id is required", 400);
    if (input.id === admin.id) return bad("You cannot change your own account status", 409);
    if (input.action !== "enable" && input.action !== "disable") return bad("Invalid action", 400);
    const isActive = input.action === "enable";
    const user = await one<User>(
      "update users set is_active = $1 where id = $2 returning id, nickname, avatar, bio, is_admin, is_active, created_at",
      [isActive, input.id]
    );
    if (!user) return bad("User not found", 404);
    return ok({ user });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (id === admin.id) return bad("You cannot delete your own account", 409);
    if (id) {
      await one(
        `update users
         set is_active = false,
             nickname = $1,
             avatar = $2,
             bio = ''
         where id = $3
         returning id`,
        [`已注销用户-${id.slice(0, 8)}`, "/generated/default-avatar.svg", id]
      );
    }
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
