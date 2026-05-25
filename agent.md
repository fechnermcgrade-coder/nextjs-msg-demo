# Project Agent Notes

## Project Overview

This is a Next.js full-stack personal blog/community prototype.

- Framework: Next.js 15.0.4, App Router, React 19, TypeScript.
- Styling: Tailwind CSS with local UI primitives in `src/components/ui`.
- Backend: Next.js route handlers under `src/app/api`.
- Database: PostgreSQL via `pg`, usually Supabase pooler style connection strings.
- Auth: email/password login, bcryptjs password hashes, JWT in HTTP-only cookie.
- Email: custom SMTP client in `src/lib/smtp-mail.ts` for verification codes.
- Deployment target: Netlify, configured by `netlify.toml`.

The app is not a static export. It needs server-side runtime support, API routes,
middleware, PostgreSQL, and environment variables in production.

## Important Files

- `src/app/page.tsx`: home page server entry; loads public posts/categories.
- `src/app/home-client.tsx`: interactive home/discovery experience.
- `src/app/layout.tsx`: root layout; reads the current user server-side.
- `src/middleware.ts`: route guard for protected pages and API routes.
- `src/lib/auth.ts`: JWT signing, cookie handling, current-user lookup.
- `src/lib/db.ts`: PostgreSQL pool, optional HTTP CONNECT proxy support, query helpers.
- `src/lib/email-verification.ts`: verification code creation/checking.
- `src/lib/smtp-mail.ts`: SMTP sending implementation.
- `src/app/api/uploads/route.ts`: authenticated image upload endpoint; returns data URLs.
- `scripts/setup-db.mjs`: destructive local/setup seed script for PostgreSQL.
- `netlify.toml`: Netlify build configuration.
- `.env.example`: minimal environment variable example.

## Main Routes

Pages:

- `/`: public home/discovery.
- `/login`, `/register`: authentication.
- `/post/[id]`: public post detail, comments, sharing.
- `/publish`, `/edit/[id]`: authenticated post authoring.
- `/profile`, `/profile/follows`, `/settings`, `/messages`: authenticated user areas.
- `/user/[id]`: public user profile.
- `/admin`: admin dashboard.

API groups:

- `/api/auth/*`: login, logout, register, current user, send verification code.
- `/api/posts/*`: list, detail, create/update/delete/status/favorite/view.
- `/api/comments/*`: comments and moderation.
- `/api/messages/*`: private messages and threads.
- `/api/admin/*`: admin users/posts/comments/summary.
- `/api/uploads`: image upload to data URL.
- `/api/categories`, `/api/follows`, `/api/favorites`, `/api/histories`, `/api/users/*`.

## Local Development

Use pnpm through Corepack if `pnpm` is not directly on PATH:

```powershell
corepack pnpm dev
corepack pnpm lint
corepack pnpm ts-check
corepack pnpm build
```

Useful scripts:

- `dev`: `next dev`
- `build`: `next build`
- `lint`: `eslint src --ext .ts,.tsx`
- `ts-check`: `tsc --noEmit`
- `db:setup`: `node scripts/setup-db.mjs`

Do not run `next build` while `next dev` is serving the same project unless the
dev server can be restarted afterward. Both commands write to `.next`.

## Environment Variables

Local development uses `.env.local`, which must not be committed.

Required for normal operation:

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: long random secret, at least 16 characters.

Required for email verification:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`

Optional but useful:

- `EMAIL_CODE_SECRET`: separate long random secret for verification code hashes.
- `NEXT_PUBLIC_APP_URL`: public app URL when absolute links are needed.
- `PG_POOL_MAX`: set low on serverless hosts, for example `1` or `2`.
- `DATABASE_PROXY_URL` or `PG_HTTP_PROXY`: optional HTTP CONNECT proxy for database access.

Never commit `.env.local`, real database URLs, SMTP passwords, JWT secrets, or
service keys.

## Database Notes

The app expects a PostgreSQL schema with tables for:

- users
- categories
- posts
- comments
- follows
- favorites
- histories
- messages
- email verification codes/schema helpers where applicable

`scripts/setup-db.mjs` drops and recreates the public schema. Treat it as
destructive and only run it against disposable/local prototype databases.

`src/lib/db.ts` keeps a global pool to reduce connection churn in Next dev and
serverless-style reuse. In production, keep `PG_POOL_MAX` conservative.

## Netlify Deployment

`netlify.toml` currently contains:

```toml
[build]
  command = "pnpm build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "22"
```

Netlify supports modern Next.js App Router projects through its OpenNext adapter,
including SSR, ISR, middleware, route handlers, and image optimization.

Set production environment variables in Netlify, not in source files:

- `DATABASE_URL`
- `JWT_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `NEXT_PUBLIC_APP_URL` if needed
- `EMAIL_CODE_SECRET` recommended
- `PG_POOL_MAX=1` or `2` recommended

This project is Netlify-friendly because `/api/uploads` returns `data:image/...`
URLs instead of writing uploaded files to `public/uploads` at runtime. For real
production storage, replace that endpoint with object storage.

## Git And Ignore Rules

This directory is initialized as its own Git repository:

```text
D:\nav\wtest\vitex\project_1\.git
```

Important ignored files/directories:

- `.next/`
- `node_modules/`
- `.env`, `.env.local`, `.env.*.local`
- `public/uploads/*` except `public/uploads/.gitkeep`
- local dev logs
- `tsconfig.tsbuildinfo`

Before pushing to GitHub, check:

```powershell
git status --short
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <github-repo-url>
git push -u origin main
```

## Verification Snapshot

Last local checks performed during setup:

- `corepack pnpm lint`: passed with warnings only.
- `corepack pnpm ts-check`: passed.
- `http://127.0.0.1:3000/`: returned HTTP 200 while dev server was running.

Known lint warnings are mostly `@next/next/no-img-element`; they are performance
warnings, not build blockers.

## Maintenance Guidance

- Keep auth checks on the server in route handlers even when middleware protects routes.
- Keep secrets server-side; only `NEXT_PUBLIC_*` variables are safe for browser exposure.
- Do not rely on runtime filesystem writes for durable uploaded files on Netlify.
- Avoid broad refactors unless needed; this project uses simple local modules and UI primitives.
- For UI work, inspect the running app on desktop and mobile widths before finalizing.
