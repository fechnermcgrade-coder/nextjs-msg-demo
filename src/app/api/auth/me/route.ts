import { getCurrentUser } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  return ok({ user });
}
