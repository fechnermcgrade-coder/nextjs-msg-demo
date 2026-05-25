import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ok, routeError } from "@/lib/http";
import { postSelect } from "@/lib/post-select";
import type { Post } from "@/types";

export async function GET() {
  try {
    const user = await requireUser();
    const posts = await query<Post>(
      `select ${postSelect}, true as is_favorited
       from favorites f
       join posts p on p.id = f.post_id
       join users u on u.id = p.user_id
       left join categories c on c.id = p.category_id
       where f.user_id = $1 and p.status = 'published'
       order by f.created_at desc`,
      [user.id]
    );
    return ok({ posts });
  } catch (error) {
    return routeError(error);
  }
}
