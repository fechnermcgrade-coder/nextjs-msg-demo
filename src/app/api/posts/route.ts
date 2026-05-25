import { z } from "zod";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import type { Post } from "@/types";

const postSchema = z.object({
  title: z.string().min(2).max(180),
  content: z.string().min(1),
  category_id: z.string().uuid().nullable().optional(),
  images: z.array(z.string()).default([]),
  submit: z.boolean().default(false)
});

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    const category = url.searchParams.get("category");
    const userId = url.searchParams.get("user_id");
    const mine = url.searchParams.get("mine") === "1";
    const status = url.searchParams.get("status");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 24, 1), 50);

    const conditions: string[] = [];
    const values: unknown[] = [];
    if (mine) {
      if (!user) return bad("请先登录", 401);
      values.push(user.id);
      conditions.push(`p.user_id = $${values.length}`);
    } else {
      conditions.push("p.status = 'published'");
    }
    if (userId && !mine) {
      values.push(userId);
      conditions.push(`p.user_id = $${values.length}`);
    }
    if (status && mine) {
      values.push(status);
      conditions.push(`p.status = $${values.length}`);
    }
    if (category) {
      values.push(category);
      conditions.push(`p.category_id = $${values.length}`);
    }
    if (q) {
      values.push(`%${q}%`);
      conditions.push(`(p.title ilike $${values.length} or p.content ilike $${values.length} or u.nickname ilike $${values.length})`);
    }

    values.push(limit);
    const limitParam = values.length;

    let viewerParam: number | null = null;
    if (user) {
      values.push(user.id);
      viewerParam = values.length;
    }

    const posts = await query<Post>(
      `with filtered_posts as (
        select p.id, p.user_id, p.category_id, p.title, p.images, p.status, p.view_count, p.created_at, p.updated_at
        from posts p
        join users u on u.id = p.user_id
        where ${conditions.join(" and ")}
        order by case when p.status = 'pending' then 0 else 1 end, p.created_at desc
        limit $${limitParam}
       ),
       favorite_counts as (
        select f.post_id, count(*)::int as favorite_count
        from favorites f
        join filtered_posts fp on fp.id = f.post_id
        group by f.post_id
       ),
       comment_counts as (
        select cm.post_id, count(*)::int as comment_count
        from comments cm
        join filtered_posts fp on fp.id = cm.post_id
        group by cm.post_id
       )
       select
        fp.*,
        '' as content,
        json_build_object(
          'id', u.id,
          'nickname', u.nickname,
          'avatar', u.avatar,
          'bio', u.bio,
          'is_admin', u.is_admin,
          'is_active', u.is_active,
          'created_at', u.created_at
        ) as author,
        row_to_json(c.*) as category,
        coalesce(fc.favorite_count, 0) as favorite_count,
        coalesce(cc.comment_count, 0) as comment_count,
        ${
          viewerParam
            ? `exists(select 1 from favorites fx where fx.post_id = fp.id and fx.user_id = $${viewerParam})`
            : "false"
        } as is_favorited
       from filtered_posts fp
       join users u on u.id = fp.user_id
       left join categories c on c.id = fp.category_id
       left join favorite_counts fc on fc.post_id = fp.id
       left join comment_counts cc on cc.post_id = fp.id
       order by case when fp.status = 'pending' then 0 else 1 end, fp.created_at desc`,
      values
    );
    return ok(
      { posts },
      user
        ? undefined
        : { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = postSchema.parse(await request.json());
    const post = await one<Post>(
      `insert into posts (user_id, category_id, title, content, images, status)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [user.id, input.category_id ?? null, input.title, input.content, input.images, input.submit ? "pending" : "draft"]
    );
    return ok({ post });
  } catch (error) {
    return routeError(error);
  }
}
