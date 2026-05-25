import { requireUser } from "@/lib/auth";
import { bad, ok, routeError } from "@/lib/http";

const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"]);
const maxUploadBytes = 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requireUser();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return bad("缺少文件");
    if (!allowed.has(file.type)) return bad("只支持图片文件");
    if (file.size > maxUploadBytes) return bad("图片不能超过 2MB");

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    return ok({ url: `data:${file.type};base64,${base64}` });
  } catch (error) {
    return routeError(error);
  }
}
