import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import type { Message, User } from "@/types";

const IMAGE_MESSAGE_PREFIX = "[image]:";
const maxTextMessageLength = 2000;
const maxImageMessageLength = 3_000_000;

const schema = z.object({
  receiver_id: z.string().uuid().optional(),
  receiver_nickname: z.string().trim().min(1).max(80).optional(),
  content: z.string().trim().min(1).refine((content) => {
    if (content.length <= maxTextMessageLength) return true;
    return content.startsWith(`${IMAGE_MESSAGE_PREFIX}data:image/`) && content.length <= maxImageMessageLength;
  }, "消息过长")
}).refine((value) => Boolean(value.receiver_id || value.receiver_nickname), {
  message: "Receiver is required"
});

const deleteSchema = z.object({
  peer_id: z.string().uuid(),
  clear: z.literal(true)
});

async function ensureMessageDeleteColumns() {
  await query("alter table messages add column if not exists deleted_by_sender boolean not null default false");
  await query("alter table messages add column if not exists deleted_by_receiver boolean not null default false");
}

export async function GET(request: Request) {
  try {
    await ensureMessageDeleteColumns();
    const user = await requireUser();
    const peer = new URL(request.url).searchParams.get("peer");
    if (!peer) return ok({ messages: [] });
    if (!z.string().uuid().safeParse(peer).success) return bad("无效的会话用户", 400);
    await query(
      "update messages set is_read = true where sender_id = $1 and receiver_id = $2 and deleted_by_receiver = false",
      [peer, user.id]
    );
    const messages = await query<Message>(
      `select * from messages
       where ((sender_id = $1 and receiver_id = $2) or (sender_id = $2 and receiver_id = $1))
         and case when sender_id = $1 then deleted_by_sender = false else deleted_by_receiver = false end
       order by created_at asc`,
      [user.id, peer]
    );
    return ok({ messages });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureMessageDeleteColumns();
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const lookupValue = input.receiver_id ?? input.receiver_nickname;
    const receiver = await one<User>(
      `select id, nickname, avatar, bio, is_admin, is_active, created_at
       from users
       where ${input.receiver_id ? "id = $1" : "lower(nickname) = lower($1)"}
         and is_active = true`,
      [lookupValue]
    );
    if (!receiver) return bad("接收用户不存在", 404);
    if (receiver.id === user.id) return bad("不能给自己发送私信", 400);
    const message = await one<Message>(
      `insert into messages (sender_id, receiver_id, content)
       values ($1, $2, $3)
       returning *`,
      [user.id, receiver.id, input.content]
    );
    return ok({ message, receiver });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureMessageDeleteColumns();
    const user = await requireUser();
    const input = deleteSchema.parse(await request.json());

    await query(
      `update messages
       set deleted_by_sender = case when sender_id = $1 then true else deleted_by_sender end,
           deleted_by_receiver = case when receiver_id = $1 then true else deleted_by_receiver end
       where (sender_id = $1 and receiver_id = $2) or (sender_id = $2 and receiver_id = $1)`,
      [user.id, input.peer_id]
    );
    await query("delete from messages where deleted_by_sender = true and deleted_by_receiver = true");
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
