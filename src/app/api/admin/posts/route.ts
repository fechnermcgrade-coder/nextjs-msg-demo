import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { ok, routeError } from "@/lib/http";
import { postSelect } from "@/lib/post-select";
import type { Post } from "@/types";

const schema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "unpublish", "delete"])
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const q = new URL(request.url).searchParams.get("q")?.trim();
    const values: unknown[] = [];
    const where = q
      ? "where p.status <> 'draft' and (p.title ilike $1 or p.content ilike $1 or u.nickname ilike $1 or c.name ilike $1)"
      : "where p.status <> 'draft'";
    if (q) values.push(`%${q}%`);
    const posts = await query<Post>(
      `select ${postSelect}
       from posts p
       join users u on u.id = p.user_id
       left join categories c on c.id = p.category_id
       ${where}
       order by case when p.status = 'pending' then 0 else 1 end, p.created_at desc`,
      values
    );
    return ok({ posts });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const input = schema.parse(await request.json());
    if (input.action === "delete") {
      await one("delete from posts where id = $1 returning id", [input.id]);
      return ok({ ok: true });
    }
    const status = input.action === "approve" ? "published" : "draft";
    await one("update posts set status = $1, updated_at = now() where id = $2 returning id", [status, input.id]);
    return ok({ ok: true, status });
  } catch (error) {
    return routeError(error);
  }
}
