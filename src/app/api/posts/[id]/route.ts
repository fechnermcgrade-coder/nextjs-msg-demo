import { z } from "zod";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import { postSelect } from "@/lib/post-select";
import type { Post } from "@/types";

const schema = z.object({
  title: z.string().min(2).max(180),
  content: z.string().min(1),
  category_id: z.string().uuid().nullable().optional(),
  images: z.array(z.string()).default([]),
  submit: z.boolean().default(false)
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const values: unknown[] = [id];
    if (user) values.push(user.id);
    const post = await one<Post>(
      `select ${postSelect}
       ${user ? `, exists(select 1 from favorites fx where fx.post_id = p.id and fx.user_id = $2) as is_favorited` : ", false as is_favorited"}
       from posts p
       join users u on u.id = p.user_id
       left join categories c on c.id = p.category_id
       where p.id = $1`,
      values
    );
    if (!post) return bad("文章不存在", 404);
    if (post.status !== "published" && post.user_id !== user?.id && !user?.is_admin) return bad("无权查看", 403);
    return ok({ post });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const existing = await one<Post>("select * from posts where id = $1", [id]);
    if (!existing) return bad("文章不存在", 404);
    if (existing.user_id !== user.id && !user.is_admin) return bad("无权编辑", 403);
    if (existing.status === "pending" && !user.is_admin) return bad("审核中文章不可编辑", 409);
    if (existing.status === "published" && !user.is_admin) return bad("已发布作品请先下架再编辑", 409);
    const status = input.submit ? "pending" : existing.status;
    const post = await one<Post>(
      `update posts
       set title = $1, content = $2, category_id = $3, images = $4, status = $5, updated_at = now()
       where id = $6
       returning *`,
      [input.title, input.content, input.category_id ?? null, input.images, status, id]
    );
    return ok({ post });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const existing = await one<Post>("select * from posts where id = $1", [id]);
    if (!existing) return bad("文章不存在", 404);
    if (existing.user_id !== user.id && !user.is_admin) return bad("无权删除", 403);
    await one("delete from posts where id = $1 returning id", [id]);
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
