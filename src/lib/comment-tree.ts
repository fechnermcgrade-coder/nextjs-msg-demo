import type { Comment } from "@/types";

export function buildCommentTree(rows: Comment[]) {
  const map = new Map<string, Comment>();
  rows.forEach((row) => map.set(row.id, { ...row, children: [], effective_child_count: 0 }));

  const roots: Comment[] = [];
  map.forEach((comment) => {
    if (comment.parent_id && map.has(comment.parent_id)) {
      map.get(comment.parent_id)!.children!.push(comment);
    } else {
      roots.push(comment);
    }
  });

  const countEffective = (comment: Comment): number => {
    const children = comment.children ?? [];
    const direct = children.filter((child) => child.user_id !== comment.user_id).length;
    const nested = children.reduce((sum, child) => sum + countEffective(child), 0);
    comment.effective_child_count = direct + nested;
    comment.children = children.sort(commentSorter);
    return comment.effective_child_count;
  };

  roots.forEach(countEffective);
  return roots.sort(commentSorter);
}

function commentSorter(a: Comment, b: Comment) {
  const byChildren = (b.effective_child_count ?? 0) - (a.effective_child_count ?? 0);
  if (byChildren !== 0) return byChildren;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}
