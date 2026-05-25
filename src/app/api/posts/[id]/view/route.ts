import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { ok, routeError } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const post = await one<{ status: string }>(
      "select status from posts where id = $1",
      [id]
    );
    if (post?.status === "published") {
      await query("update posts set view_count = view_count + 1 where id = $1", [id]);
    }
    if (user && post?.status === "published") {
      await one(
        `insert into histories (user_id, post_id, created_at)
         values ($1, $2, now())
         on conflict (user_id, post_id) do update set created_at = now()
         returning id`,
        [user.id, id]
      );
    }
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
