import { z } from "zod";
import { ensureEmailLoginSchema } from "@/lib/auth-schema";
import {
  assertCanSendCode,
  createVerificationCode,
  storeVerificationCode
} from "@/lib/email-verification";
import { one } from "@/lib/db";
import { bad, ok, routeError } from "@/lib/http";
import { sendMail } from "@/lib/smtp-mail";

const schema = z.object({
  email: z.string().trim().email()
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const email = input.email.toLowerCase();

    await ensureEmailLoginSchema();

    const exists = await one("select id from users where lower(email) = $1", [email]);
    if (exists) return bad("邮箱已被注册", 409);

    const canSend = await assertCanSendCode(email);
    if (!canSend) return bad("验证码发送太频繁，请稍后再试", 429);

    const code = createVerificationCode();
    await storeVerificationCode(email, code);
    await sendMail({
      to: email,
      subject: "栖声博客注册验证码",
      text: `你的注册验证码是：${code}\n\n验证码 10 分钟内有效。如非本人操作，请忽略这封邮件。`
    });

    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
