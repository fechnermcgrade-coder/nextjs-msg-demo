import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const existing = await one("select id from favorites where user_id = $1 and post_id = $2", [user.id, id]);
    if (existing) {
      await one("delete from favorites where user_id = $1 and post_id = $2 returning id", [user.id, id]);
      return ok({ favorited: false });
    }
    const post = await one<{ status: string }>("select status from posts where id = $1", [id]);
    if (!post) return bad("文章不存在", 404);
    if (post.status !== "published") return bad("该博客尚未审核", 409);
    await one("insert into favorites (user_id, post_id) values ($1, $2) returning id", [user.id, id]);
    return ok({ favorited: true });
  } catch (error) {
    return routeError(error);
  }
}
