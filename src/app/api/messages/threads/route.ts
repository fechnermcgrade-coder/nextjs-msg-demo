import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ok, routeError } from "@/lib/http";

async function ensureMessageDeleteColumns() {
  await query("alter table messages add column if not exists deleted_by_sender boolean not null default false");
  await query("alter table messages add column if not exists deleted_by_receiver boolean not null default false");
}

export async function GET() {
  try {
    await ensureMessageDeleteColumns();
    const user = await requireUser();
    const threads = await query(
      `with peers as (
        select case when sender_id = $1 then receiver_id else sender_id end as peer_id, max(created_at) as last_at
        from messages
        where (sender_id = $1 and deleted_by_sender = false) or (receiver_id = $1 and deleted_by_receiver = false)
        group by peer_id
      )
      select u.id, u.nickname, u.avatar, u.bio, u.is_admin, u.is_active, u.created_at,
        p.last_at,
        (select content from messages m
         where ((m.sender_id = $1 and m.receiver_id = u.id and m.deleted_by_sender = false) or (m.sender_id = u.id and m.receiver_id = $1 and m.deleted_by_receiver = false))
         order by created_at desc limit 1) as last_message,
        (select count(*)::int from messages m where m.sender_id = u.id and m.receiver_id = $1 and m.is_read = false and m.deleted_by_receiver = false) as unread_count
      from peers p join users u on u.id = p.peer_id
      order by p.last_at desc`,
      [user.id]
    );
    return ok({ threads });
  } catch (error) {
    return routeError(error);
  }
}
