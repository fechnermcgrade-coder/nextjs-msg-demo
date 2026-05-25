import "server-only";

import { query } from "@/lib/db";
import type { Category, Post } from "@/types";

export async function getHomeCategories() {
  return query<Category>("select * from categories order by created_at asc");
}

export async function getHomePosts() {
  return query<Post>(
    `with filtered_posts as (
      select p.id, p.user_id, p.category_id, p.title, p.images, p.status, p.view_count, p.created_at, p.updated_at
      from posts p
      where p.status = 'published'
      order by p.created_at desc
      limit 24
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
      false as is_favorited
     from filtered_posts fp
     join users u on u.id = fp.user_id
     left join categories c on c.id = fp.category_id
     left join favorite_counts fc on fc.post_id = fp.id
     left join comment_counts cc on cc.post_id = fp.id
     order by fp.created_at desc`
  );
}
