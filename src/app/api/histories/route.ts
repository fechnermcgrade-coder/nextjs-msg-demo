import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { ok, routeError } from "@/lib/http";
import { postSelect } from "@/lib/post-select";
import type { Post } from "@/types";

export async function GET() {
  try {
    const user = await requireUser();
    const posts = await query<Post>(
      `select ${postSelect}, exists(select 1 from favorites fx where fx.post_id = p.id and fx.user_id = $1) as is_favorited
       from histories h
       join posts p on p.id = h.post_id
       join users u on u.id = p.user_id
       left join categories c on c.id = p.category_id
       where h.user_id = $1 and p.status = 'published'
       order by h.created_at desc`,
      [user.id]
    );
    return ok({ posts });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const id = url.searchParams.get("post_id");
    if (id) await one("delete from histories where user_id = $1 and post_id = $2 returning id", [user.id, id]);
    else await query("delete from histories where user_id = $1", [user.id]);
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
