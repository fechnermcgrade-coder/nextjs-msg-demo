import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const images = [
  "/generated/post-cover-1.svg",
  "/generated/post-cover-2.svg",
  "/generated/post-cover-1.svg",
  "/generated/post-cover-2.svg"
];

async function main() {
  const adminPassword = await bcrypt.hash("123123", 10);
  const userPassword = await bcrypt.hash("123123", 10);

  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
  await pool.query("create extension if not exists pgcrypto with schema public");

  await pool.query(`
    create table users (
      id uuid primary key default gen_random_uuid(),
      email varchar(255) unique not null,
      password varchar(255) not null,
      nickname varchar(80) not null default '',
      avatar text not null default '/generated/default-avatar.svg',
      bio text not null default '',
      is_admin boolean not null default false,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    );

    create table categories (
      id uuid primary key default gen_random_uuid(),
      name varchar(80) unique not null,
      color varchar(24) not null default '#24777b',
      created_at timestamptz not null default now()
    );

    create table posts (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      category_id uuid references categories(id) on delete set null,
      title varchar(180) not null,
      content text not null,
      images text[] not null default '{}',
      status varchar(20) not null default 'draft' check (status in ('draft', 'pending', 'published')),
      view_count integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table comments (
      id uuid primary key default gen_random_uuid(),
      post_id uuid not null references posts(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      parent_id uuid references comments(id) on delete cascade,
      content text not null,
      created_at timestamptz not null default now()
    );

    create table follows (
      id uuid primary key default gen_random_uuid(),
      follower_id uuid not null references users(id) on delete cascade,
      following_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      unique (follower_id, following_id),
      check (follower_id <> following_id)
    );

    create table favorites (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      post_id uuid not null references posts(id) on delete cascade,
      created_at timestamptz not null default now(),
      unique (user_id, post_id)
    );

    create table histories (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      post_id uuid not null references posts(id) on delete cascade,
      created_at timestamptz not null default now(),
      unique (user_id, post_id)
    );

    create table messages (
      id uuid primary key default gen_random_uuid(),
      sender_id uuid not null references users(id) on delete cascade,
      receiver_id uuid not null references users(id) on delete cascade,
      content text not null,
      is_read boolean not null default false,
      deleted_by_sender boolean not null default false,
      deleted_by_receiver boolean not null default false,
      created_at timestamptz not null default now()
    );

    create index posts_status_created_idx on posts(status, created_at desc);
    create index posts_user_status_idx on posts(user_id, status);
    create unique index users_email_lower_unique on users(lower(email));
    create unique index users_nickname_lower_unique on users(lower(nickname));
    create index comments_post_parent_idx on comments(post_id, parent_id);
    create index messages_pair_idx on messages(sender_id, receiver_id, created_at desc);
    create index histories_user_created_idx on histories(user_id, created_at desc);

    alter table users enable row level security;
    alter table categories enable row level security;
    alter table posts enable row level security;
    alter table comments enable row level security;
    alter table follows enable row level security;
    alter table favorites enable row level security;
    alter table histories enable row level security;
    alter table messages enable row level security;
  `);

  const admin = await pool.query(
    `insert into users (email, password, nickname, avatar, bio, is_admin)
     values ('admin@test.com', $1, '绠＄悊鍛?, '/generated/admin-avatar.svg', '璐熻矗瀹℃牳鏂囩珷鍜岀淮鎶ょぞ鍖虹З搴忋€?, true)
     returning id`,
    [adminPassword]
  );
  const user = await pool.query(
    `insert into users (email, password, nickname, avatar, bio)
     values ('user@test.com', $1, '闈掔牃', '/generated/default-avatar.svg', '鐑埍鍐欎綔銆佹憚褰卞拰鍩庡競婕父銆?)
     returning id`,
    [userPassword]
  );

  const cats = await pool.query(
    `insert into categories (name, color) values
      ('鐢熸椿', '#24777b'),
      ('鎶€鏈?, '#6f5bd6'),
      ('鎽勫奖', '#b05f2c'),
      ('闃呰', '#386641')
     returning id, name`
  );
  const life = cats.rows.find((row) => row.name === "鐢熸椿").id;
  const tech = cats.rows.find((row) => row.name === "鎶€鏈?).id;

  const post1 = await pool.query(
    `insert into posts (user_id, category_id, title, content, images, status, view_count)
     values ($1, $2, '鎶婃棩甯稿啓鎴愬彲鍥炴湜鐨勫厜', $3, $4, 'published', 128)
     returning id`,
    [
      user.rows[0].id,
      life,
      "<h2>鍐欎綔鏄竴绉嶆暣鐞?/h2><p>姣忓ぉ鐣欎笅涓€鐐硅瀵燂紝鍍忔妸鏁ｈ惤鍦ㄥ彛琚嬮噷鐨勭エ鏍规寜鏃堕棿澶硅繘鏈瓙銆?/p><p>杩欎釜鍗氬浠庣涓€澶╄捣灏卞笇鏈涙垚涓轰竴涓畨闈欎絾瀹屾暣鐨勭ぞ鍖恒€?/p>",
      [images[0], images[2]]
    ]
  );

  await pool.query(
    `insert into posts (user_id, category_id, title, content, images, status, view_count)
     values ($1, $2, 'Next.js 鍏ㄦ爤鍗氬鐨勬渶灏忛棴鐜?, $3, $4, 'pending', 42)`,
    [
      user.rows[0].id,
      tech,
      "<p>浠庣櫥褰曘€佸彂甯冦€佸鏍稿埌璇勮锛屽厛鎶婁骇鍝佹祦璧伴€氾紝鍐嶇户缁墦纾ㄥ伐绋嬬粏鑺傘€?/p>",
      [images[1], images[3]]
    ]
  );

  await pool.query(
    `insert into comments (post_id, user_id, content) values
     ($1, $2, '杩欑瘒鏂囩珷鐨勮妭濂忓緢濂斤紝璇昏捣鏉ユ湁涓€绉嶆竻鏅ㄦ墦寮€绐楃殑鎰熻銆?),
     ($1, $3, '娆㈣繋鏉ュ埌鏍栧０鍗氬锛屽鏍告祦绋嬪凡缁忓噯澶囧ソ浜嗐€?)`,
    [post1.rows[0].id, user.rows[0].id, admin.rows[0].id]
  );

  await pool.query(
    `insert into follows (follower_id, following_id) values ($1, $2) on conflict do nothing`,
    [admin.rows[0].id, user.rows[0].id]
  );

  console.log("Database schema and seed data created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
