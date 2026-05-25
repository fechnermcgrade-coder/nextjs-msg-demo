import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import type { Post } from "@/types";

const schema = z.object({
  action: z.enum(["submit", "unpublish"])
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const existing = await one<Post>("select * from posts where id = $1", [id]);

    if (!existing) return bad("文章不存在", 404);
    if (existing.user_id !== user.id && !user.is_admin) return bad("无权操作", 403);

    if (input.action === "submit") {
      if (existing.status !== "draft") return bad("只有草稿可以提交审核", 409);
      const post = await one<Post>(
        "update posts set status = 'pending', updated_at = now() where id = $1 returning *",
        [id]
      );
      return ok({ post });
    }

    if (existing.status !== "published") return bad("只有已发布作品可以下架", 409);
    const post = await one<Post>(
      "update posts set status = 'draft', updated_at = now() where id = $1 returning *",
      [id]
    );
    return ok({ post });
  } catch (error) {
    return routeError(error);
  }
}
