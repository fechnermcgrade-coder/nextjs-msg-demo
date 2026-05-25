import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ok, routeError } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await query(
      `select
        (select count(*)::int from follows where follower_id = $1) as following_count,
        (select count(*)::int from follows where following_id = $1) as follower_count,
        (select count(*)::int from posts where user_id = $1 and status = 'published') as post_count,
        (select count(*)::int from favorites where user_id = $1) as favorite_count,
        (select count(*)::int from histories h join posts p on p.id = h.post_id where h.user_id = $1 and p.status = 'published') as history_count,
        (select count(*)::int from posts where user_id = $1 and status = 'draft') as draft_count`,
      [user.id]
    );
    return ok({ summary: rows[0] });
  } catch (error) {
    return routeError(error);
  }
}
