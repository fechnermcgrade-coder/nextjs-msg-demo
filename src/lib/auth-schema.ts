import { one, query } from "@/lib/db";

let emailLoginSchemaPromise: Promise<void> | null = null;

async function ensureEmailLoginSchemaOnce() {
  const legacyUsernameColumn = await one(
    `select column_name
     from information_schema.columns
     where table_name = 'users' and column_name = 'username'`
  );

  await query("alter table users add column if not exists email varchar(255)");
  await query("create unique index if not exists users_email_lower_unique on users(lower(email)) where email is not null");

  if (legacyUsernameColumn) {
    await query(
      "update users set email = $1 where email is null and (username = $2 or is_admin = true)",
      ["admin@test.com", "admin"]
    );
    await query(
      "update users set email = $1 where email is null and username in ($2, $3)",
      ["user@test.com", "user", "user1"]
    );
  } else {
    await query("update users set email = $1 where email is null and is_admin = true", ["admin@test.com"]);
  }

  await query("alter table users drop column if exists username");
}

export function ensureEmailLoginSchema() {
  emailLoginSchemaPromise ??= ensureEmailLoginSchemaOnce().catch((error) => {
    emailLoginSchemaPromise = null;
    throw error;
  });

  return emailLoginSchemaPromise;
}
