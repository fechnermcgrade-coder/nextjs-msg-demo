import crypto from "node:crypto";
import { one, query } from "@/lib/db";

const codeTtlMinutes = 10;
const resendCooldownSeconds = 60;
const maxAttempts = 5;

function codeSecret() {
  const value = process.env.EMAIL_CODE_SECRET || process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    throw new Error("EMAIL_CODE_SECRET or JWT_SECRET must be at least 16 characters");
  }
  return value;
}

function hashCode(email: string, code: string) {
  return crypto
    .createHash("sha256")
    .update(`${email.toLowerCase()}:${code}:${codeSecret()}`)
    .digest("hex");
}

export async function ensureEmailVerificationSchema() {
  await query(`
    create table if not exists email_verification_codes (
      id uuid primary key default gen_random_uuid(),
      email varchar(255) not null,
      code_hash varchar(64) not null,
      expires_at timestamptz not null,
      attempts integer not null default 0,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await query("create index if not exists email_verification_codes_email_idx on email_verification_codes(lower(email), created_at desc)");
}

export function createVerificationCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function assertCanSendCode(email: string) {
  await ensureEmailVerificationSchema();
  const recent = await one<{ id: string }>(
    `select id
     from email_verification_codes
     where lower(email) = $1
       and created_at > now() - ($2::text || ' seconds')::interval
     order by created_at desc
     limit 1`,
    [email.toLowerCase(), resendCooldownSeconds]
  );

  return !recent;
}

export async function storeVerificationCode(email: string, code: string) {
  await ensureEmailVerificationSchema();
  await query(
    `update email_verification_codes
     set consumed_at = now()
     where lower(email) = $1 and consumed_at is null`,
    [email.toLowerCase()]
  );
  await one(
    `insert into email_verification_codes (email, code_hash, expires_at)
     values ($1, $2, now() + ($3::text || ' minutes')::interval)
     returning id`,
    [email.toLowerCase(), hashCode(email, code), codeTtlMinutes]
  );
}

export async function verifyEmailCode(email: string, code: string) {
  await ensureEmailVerificationSchema();
  const row = await one<{ id: string; code_hash: string; attempts: number }>(
    `select id, code_hash, attempts
     from email_verification_codes
     where lower(email) = $1
       and consumed_at is null
       and expires_at > now()
     order by created_at desc
     limit 1`,
    [email.toLowerCase()]
  );

  if (!row) return false;
  if (row.attempts >= maxAttempts) return false;

  const ok = crypto.timingSafeEqual(
    Buffer.from(row.code_hash),
    Buffer.from(hashCode(email, code))
  );

  if (!ok) {
    await query("update email_verification_codes set attempts = attempts + 1 where id = $1", [row.id]);
    return false;
  }

  await query("update email_verification_codes set consumed_at = now() where id = $1", [row.id]);
  return true;
}
