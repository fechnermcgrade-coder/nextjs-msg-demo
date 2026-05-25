import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { ok, routeError } from "@/lib/http";

const schema = z.object({
  user_id: z.string().uuid(),
  remove_follower: z.boolean().optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const type = url.searchParams.get("type") === "followers" ? "followers" : "following";
    const rows = await query(
      type === "followers"
        ? `select u.id, u.nickname, u.avatar, u.bio, u.is_admin, u.is_active, u.created_at
           from follows f join users u on u.id = f.follower_id
           where f.following_id = $1 order by f.created_at desc`
        : `select u.id, u.nickname, u.avatar, u.bio, u.is_admin, u.is_active, u.created_at
           from follows f join users u on u.id = f.following_id
           where f.follower_id = $1 order by f.created_at desc`,
      [user.id]
    );
    return ok({ users: rows });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    if (input.remove_follower) {
      await one("delete from follows where follower_id = $1 and following_id = $2 returning id", [input.user_id, user.id]);
      return ok({ following: false });
    }
    const existing = await one("select id from follows where follower_id = $1 and following_id = $2", [user.id, input.user_id]);
    if (existing) {
      await one("delete from follows where follower_id = $1 and following_id = $2 returning id", [user.id, input.user_id]);
      return ok({ following: false });
    }
    await one("insert into follows (follower_id, following_id) values ($1, $2) returning id", [user.id, input.user_id]);
    return ok({ following: true });
  } catch (error) {
    return routeError(error);
  }
}
