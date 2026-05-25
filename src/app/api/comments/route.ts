import { z } from "zod";
import { buildCommentTree } from "@/lib/comment-tree";
import { getCurrentUser, requireAdmin, requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import type { Comment } from "@/types";

const schema = z.object({
  post_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  content: z.string().trim().min(1).max(2000)
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const postId = url.searchParams.get("post_id");
    const search = url.searchParams.get("q");
    const admin = url.searchParams.get("admin") === "1";
    const viewer = admin ? await requireAdmin() : await getCurrentUser();
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (postId) {
      values.push(postId);
      conditions.push(`cm.post_id = $${values.length}`);

      const post = await one<{ status: string; user_id: string }>(
        "select status, user_id from posts where id = $1",
        [postId]
      );
      if (!post) return bad("文章不存在", 404);
      if (post.status !== "published" && post.user_id !== viewer?.id && !viewer?.is_admin) {
        return bad("无权查看评论", 403);
      }
    } else if (!admin) {
      return bad("缺少文章 ID", 400);
    }
    if (search) {
      values.push(`%${search}%`);
      conditions.push(`cm.content ilike $${values.length}`);
    }
    const includeArticleTitle = admin || !postId;
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
        ) end as reply_to_author
        ${includeArticleTitle ? ", p.title as article_title" : ""}
       from comments cm
       join users u on u.id = cm.user_id
       left join comments parent_cm on parent_cm.id = cm.parent_id
       left join users pu on pu.id = parent_cm.user_id
       ${includeArticleTitle ? "join posts p on p.id = cm.post_id" : ""}
       ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
       order by cm.created_at desc`,
      values
    );
    return ok({ comments: admin ? comments : buildCommentTree(comments) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const post = await one<{ status: string }>(
      "select status from posts where id = $1",
      [input.post_id]
    );
    if (!post) return bad("文章不存在", 404);
    if (post.status !== "published") return bad("文章未发布，暂不能评论", 403);
    if (input.parent_id) {
      const parent = await one<{ id: string }>(
        "select id from comments where id = $1 and post_id = $2",
        [input.parent_id, input.post_id]
      );
      if (!parent) return bad("回复的评论不存在", 404);
    }
    const comments = await query<Comment>(
      `insert into comments (post_id, user_id, parent_id, content)
       values ($1, $2, $3, $4)
       returning *`,
      [input.post_id, user.id, input.parent_id ?? null, input.content]
    );
    return ok({ comment: comments[0] });
  } catch (error) {
    return routeError(error);
  }
}
