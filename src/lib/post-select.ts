export const postSelect = `
  p.*,
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
  (select count(*)::int from favorites f where f.post_id = p.id) as favorite_count,
  (select count(*)::int from comments cm where cm.post_id = p.id) as comment_count
`;
