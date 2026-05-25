import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { ok, routeError } from "@/lib/http";

export async function GET() {
  try {
    await requireAdmin();
    const [totals] = await query<{
      user_count: number;
      post_count: number;
      published_count: number;
      pending_count: number;
      comment_count: number;
      favorite_count: number;
      history_count: number;
      view_count: number;
    }>(
      `select
        (select count(*)::int from users) as user_count,
        (select count(*)::int from posts where status <> 'draft') as post_count,
        (select count(*)::int from posts where status = 'published') as published_count,
        (select count(*)::int from posts where status = 'pending') as pending_count,
        (select count(*)::int from comments) as comment_count,
        (select count(*)::int from favorites) as favorite_count,
        (select count(*)::int from histories) as history_count,
        (select coalesce(sum(view_count), 0)::int from posts) as view_count`
    );

    const trends = await query<{
      day: string;
      posts: number;
      users: number;
      comments: number;
    }>(
      `with days as (
        select generate_series(current_date - interval '6 days', current_date, interval '1 day')::date as day
      )
      select
        to_char(d.day, 'MM-DD') as day,
        (select count(*)::int from posts p where p.status <> 'draft' and p.created_at::date = d.day) as posts,
        (select count(*)::int from users u where u.created_at::date = d.day) as users,
        (select count(*)::int from comments c where c.created_at::date = d.day) as comments
      from days d
      order by d.day asc`
    );

    const recentPosts = await query<{
      id: string;
      title: string;
      status: string;
      created_at: string;
      author_name: string;
    }>(
      `select p.id, p.title, p.status, p.created_at, u.nickname as author_name
       from posts p
       join users u on u.id = p.user_id
       where p.status <> 'draft'
       order by p.created_at desc
       limit 6`
    );

    const [categories] = await query<{ count: number }>("select count(*)::int as count from categories");

    const categoryInterest = await query<{
      id: string | null;
      name: string;
      color: string;
      post_count: number;
      view_count: number;
      favorite_count: number;
      comment_count: number;
      heat_score: number;
      top_post_id: string | null;
      top_post_title: string | null;
    }>(
      `with published_posts as (
        select
          p.id,
          p.title,
          p.category_id,
          coalesce(c.name, '未分类') as category_name,
          coalesce(c.color, '#64748b') as category_color,
          p.view_count,
          (select count(*)::int from favorites f where f.post_id = p.id) as favorite_count,
          (select count(*)::int from comments cm where cm.post_id = p.id) as comment_count
        from posts p
        left join categories c on c.id = p.category_id
        where p.status = 'published'
      ),
      scored_posts as (
        select *,
          (view_count + favorite_count * 5 + comment_count * 3)::int as heat_score,
          row_number() over (
            partition by category_id
            order by (view_count + favorite_count * 5 + comment_count * 3) desc, view_count desc, title asc
          ) as rank_in_category
        from published_posts
      )
      select
        category_id as id,
        category_name as name,
        category_color as color,
        count(*)::int as post_count,
        coalesce(sum(view_count), 0)::int as view_count,
        coalesce(sum(favorite_count), 0)::int as favorite_count,
        coalesce(sum(comment_count), 0)::int as comment_count,
        coalesce(sum(heat_score), 0)::int as heat_score,
        (array_agg(id order by rank_in_category asc))[1] as top_post_id,
        (array_agg(title order by rank_in_category asc))[1] as top_post_title
      from scored_posts
      group by category_id, category_name, category_color
      order by heat_score desc, view_count desc, name asc
      limit 8`
    );

    return ok({ summary: { totals, trends, recentPosts, category_count: categories?.count ?? 0, categoryInterest } });
  } catch (error) {
    return routeError(error);
  }
}
