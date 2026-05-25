import { getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import type { User } from "@/types";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await getCurrentUser();
    const { id } = await context.params;
    const user = await one<User>(
      `select u.id, u.nickname, u.avatar, u.bio, u.is_admin, u.is_active, u.created_at,
        (select count(*)::int from follows where following_id = u.id) as follower_count,
        (select count(*)::int from follows where follower_id = u.id) as following_count,
        (select count(*)::int from posts where user_id = u.id and status = 'published') as post_count,
        ${viewer ? "exists(select 1 from follows where follower_id = $2 and following_id = u.id)" : "false"} as is_following
       from users u where u.id = $1 and u.is_active = true`,
      viewer ? [id, viewer.id] : [id]
    );
    if (!user) return bad("用户不存在", 404);
    return ok({ user });
  } catch (error) {
    return routeError(error);
  }
}
