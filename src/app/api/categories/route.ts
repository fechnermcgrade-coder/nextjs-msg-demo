import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import type { Category } from "@/types";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/)
});

export async function GET() {
  try {
    const categories = await query<Category>("select * from categories order by created_at asc");
    return ok(
      { categories },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const input = categorySchema.parse(await request.json());
    const category = await one<Category>(
      "insert into categories (name, color) values ($1, $2) returning *",
      [input.name, input.color]
    );
    return ok({ category });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const input = categorySchema.extend({ id: z.string().uuid() }).parse(await request.json());
    const category = await one<Category>(
      "update categories set name = $1, color = $2 where id = $3 returning *",
      [input.name, input.color, input.id]
    );
    if (!category) return bad("Category not found", 404);
    return ok({ category });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return bad("Category id is required", 400);
    await one("delete from categories where id = $1 returning id", [id]);
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
