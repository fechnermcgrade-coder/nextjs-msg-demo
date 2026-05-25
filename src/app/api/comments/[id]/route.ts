import { requireAdmin, requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(request.url);
    const adminMode = url.searchParams.get("admin") === "1";
    const user = adminMode ? await requireAdmin() : await requireUser();
    const { id } = await context.params;
    const existing = await one<{ user_id: string }>("select user_id from comments where id = $1", [id]);
    if (!existing) return bad("评论不存在", 404);
    if (!user.is_admin && existing.user_id !== user.id) return bad("无权删除", 403);
    await one("delete from comments where id = $1 returning id", [id]);
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
