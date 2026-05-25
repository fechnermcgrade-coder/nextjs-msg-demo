import { requireAdmin } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { ok, routeError } from "@/lib/http";
import type { Comment } from "@/types";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const q = new URL(request.url).searchParams.get("q")?.trim();
    const values: unknown[] = [];
    const where = q
      ? "where cm.content ilike $1 or p.title ilike $1 or u.nickname ilike $1 or pu.nickname ilike $1"
      : "";
    if (q) values.push(`%${q}%`);
    const comments = await query<Comment>(
      `select cm.*,
       json_build_object(
        'id', u.id,
        'nickname', u.nickname,
        'avatar', u.avatar,
        'bio', u.bio,
        'is_admin', u.is_admin,
        'is_active', u.is_active,
        'created_at', u.created_at
       ) as author,
       case when pu.id is null then null else json_build_object(
        'id', pu.id,
        'nickname', pu.nickname,
        'avatar', pu.avatar,
        'bio', pu.bio,
        'is_admin', pu.is_admin,
        'is_active', pu.is_active,
        'created_at', pu.created_at
       ) end as reply_to_author,
       p.title as article_title
       from comments cm
       join users u on u.id = cm.user_id
       join posts p on p.id = cm.post_id
       left join comments parent_cm on parent_cm.id = cm.parent_id
       left join users pu on pu.id = parent_cm.user_id
       ${where}
       order by cm.created_at desc`,
      values
    );
    return ok({ comments });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (id) await one("delete from comments where id = $1 returning id", [id]);
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
