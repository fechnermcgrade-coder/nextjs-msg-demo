"use client";

import { readJson } from "@/lib/client-json";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BarChart3, Eye, FileText, MessageCircle, PieChart, Search, Tags, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { isAbortError } from "@/lib/abort";
import { formatDate } from "@/lib/utils";
import type { Category, Comment, Post, User } from "@/types";

type Tab = "dashboard" | "posts" | "users" | "comments" | "categories";
type SearchableTab = Extract<Tab, "posts" | "users" | "comments">;

type AdminSummary = {
  totals: {
    user_count: number;
    post_count: number;
    published_count: number;
    pending_count: number;
    comment_count: number;
    favorite_count: number;
    history_count: number;
    view_count: number;
  };
  trends: Array<{ day: string; posts: number; users: number; comments: number }>;
  recentPosts: Array<{ id: string; title: string; status: string; created_at: string; author_name: string }>;
  category_count: number;
  categoryInterest: Array<{
    id: string | null;
    name: string;
    color: string;
    post_count: number;
    view_count: number;
    favorite_count: number;
    comment_count: number;
    heat_score: number;
    top_post_id: string | null;
    top_post_title: string | null;
  }>;
};

type AdminCache = {
  summary: AdminSummary | null;
  posts: Record<string, Post[]>;
  users: Record<string, User[]>;
  comments: Record<string, Comment[]>;
  categories: Category[] | null;
};

const adminCache: AdminCache = {
  summary: null,
  posts: {},
  users: {},
  comments: {},
  categories: null
};

const ADMIN_STORAGE_KEY = "admin-cache:v1";

function readStoredAdminCache() {
  try {
    const value = window.sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (!value) return null;
    return JSON.parse(value) as AdminCache;
  } catch {
    return null;
  }
}

function writeStoredAdminCache() {
  try {
    window.sessionStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(adminCache));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function getListCacheKey(q: string) {
  return q.trim();
}

function isSearchableTab(tab: Tab): tab is SearchableTab {
  return tab === "posts" || tab === "users" || tab === "comments";
}

function hasCachedTab(tab: Tab, q: string) {
  const key = getListCacheKey(q);
  if (tab === "dashboard") return Boolean(adminCache.summary);
  if (tab === "posts") return Object.prototype.hasOwnProperty.call(adminCache.posts, key);
  if (tab === "users") return Object.prototype.hasOwnProperty.call(adminCache.users, key);
  if (tab === "comments") return Object.prototype.hasOwnProperty.call(adminCache.comments, key);
  return Boolean(adminCache.categories);
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [q, setQ] = useState("");
  const qRef = useRef(q);
  const [summary, setSummary] = useState<AdminSummary | null>(adminCache.summary);
  const [posts, setPosts] = useState<Post[]>(adminCache.posts[getListCacheKey("")] ?? []);
  const [users, setUsers] = useState<User[]>(adminCache.users[getListCacheKey("")] ?? []);
  const [comments, setComments] = useState<Comment[]>(adminCache.comments[getListCacheKey("")] ?? []);
  const [categories, setCategories] = useState<Category[]>(adminCache.categories ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedTab("dashboard", ""));
  const [storageReady, setStorageReady] = useState(false);
  const [postAction, setPostAction] = useState<{ id: string; action: "approve" | "reject" | "unpublish" | "delete" } | null>(null);
  const [userAction, setUserAction] = useState<{ id: string; action: "enable" | "disable" | "delete" } | null>(null);
  const [commentActionId, setCommentActionId] = useState<string | null>(null);
  const isSearchable = isSearchableTab(tab);

  const load = useCallback(async (
    signal?: AbortSignal,
    options: { targetTab?: Tab; query?: string; force?: boolean; showLoading?: boolean } = {}
  ) => {
    const targetTab = options.targetTab ?? "dashboard";
    const query = getListCacheKey(options.query ?? "");
    const key = getListCacheKey(query);
    const hasCache = hasCachedTab(targetTab, query);
    if (options.showLoading ?? !hasCache) setIsLoading(true);
    try {
      if (targetTab === "dashboard") {
        if (adminCache.summary && !options.force) setSummary(adminCache.summary);
        const nextSummary = (await fetch("/api/admin/summary", { cache: "no-store", signal }).then((res) => readJson(res))).summary ?? null;
        adminCache.summary = nextSummary;
        writeStoredAdminCache();
        setSummary(nextSummary);
      }
      if (targetTab === "posts") {
        if (adminCache.posts[key] && !options.force) setPosts(adminCache.posts[key]);
        const nextPosts = (await fetch(`/api/admin/posts?q=${encodeURIComponent(query)}`, { cache: "no-store", signal }).then((res) => readJson(res))).posts ?? [];
        adminCache.posts[key] = nextPosts;
        writeStoredAdminCache();
        setPosts(nextPosts);
      }
      if (targetTab === "users") {
        if (adminCache.users[key] && !options.force) setUsers(adminCache.users[key]);
        const nextUsers = (await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`, { cache: "no-store", signal }).then((res) => readJson(res))).users ?? [];
        adminCache.users[key] = nextUsers;
        writeStoredAdminCache();
        setUsers(nextUsers);
      }
      if (targetTab === "comments") {
        if (adminCache.comments[key] && !options.force) setComments(adminCache.comments[key]);
        const nextComments = (await fetch(`/api/admin/comments?q=${encodeURIComponent(query)}`, { cache: "no-store", signal }).then((res) => readJson(res))).comments ?? [];
        adminCache.comments[key] = nextComments;
        writeStoredAdminCache();
        setComments(nextComments);
      }
      if (targetTab === "categories") {
        if (adminCache.categories && !options.force) setCategories(adminCache.categories);
        const nextCategories = (await fetch("/api/categories", { cache: "no-store", signal }).then((res) => readJson(res))).categories ?? [];
        adminCache.categories = nextCategories;
        writeStoredAdminCache();
        setCategories(nextCategories);
      }
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    qRef.current = q;
  }, [q]);

  const showCachedList = useCallback((targetTab: SearchableTab, query: string) => {
    const key = getListCacheKey(query);
    if (targetTab === "posts" && Object.prototype.hasOwnProperty.call(adminCache.posts, key)) {
      setPosts(adminCache.posts[key]);
      return true;
    }
    if (targetTab === "users" && Object.prototype.hasOwnProperty.call(adminCache.users, key)) {
      setUsers(adminCache.users[key]);
      return true;
    }
    if (targetTab === "comments" && Object.prototype.hasOwnProperty.call(adminCache.comments, key)) {
      setComments(adminCache.comments[key]);
      return true;
    }
    return false;
  }, []);

  const handleSearchChange = (value: string) => {
    setQ(value);
    qRef.current = value;
    if (!isSearchableTab(tab) || value.trim()) return;

    const restored = showCachedList(tab, "");
    setIsLoading(!restored);
    void load(undefined, { targetTab: tab, query: "", showLoading: !restored });
  };

  const submitSearch = (event?: FormEvent) => {
    event?.preventDefault();
    if (!isSearchableTab(tab)) return;
    const query = getListCacheKey(q);
    qRef.current = query;
    setQ(query);
    void load(undefined, { targetTab: tab, query, force: true, showLoading: true });
  };

  useEffect(() => {
    const stored = readStoredAdminCache();
    if (stored) {
      adminCache.summary = stored.summary ?? null;
      adminCache.posts = stored.posts ?? {};
      adminCache.users = stored.users ?? {};
      adminCache.comments = stored.comments ?? {};
      adminCache.categories = stored.categories ?? null;
      setSummary(adminCache.summary);
      setPosts(adminCache.posts[getListCacheKey(qRef.current)] ?? []);
      setUsers(adminCache.users[getListCacheKey(qRef.current)] ?? []);
      setComments(adminCache.comments[getListCacheKey(qRef.current)] ?? []);
      setCategories(adminCache.categories ?? []);
      setIsLoading(!hasCachedTab(tab, qRef.current));
    }
    setStorageReady(true);
  }, [tab]);

  useEffect(() => {
    if (!storageReady) return;
    const controller = new AbortController();
    const activeQuery = qRef.current;
    if (user?.is_admin) void load(controller.signal, { targetTab: tab, query: activeQuery, showLoading: !hasCachedTab(tab, activeQuery) });
    return () => controller.abort();
  }, [load, storageReady, tab, user]);

  const actionPost = async (id: string, action: "approve" | "reject" | "unpublish" | "delete") => {
    if (postAction) return;
    setPostAction({ id, action });
    try {
      await fetch("/api/admin/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      adminCache.summary = null;
      adminCache.posts = {};
      writeStoredAdminCache();
      await load(undefined, { targetTab: tab, query: q, force: true, showLoading: false });
    } finally {
      setPostAction(null);
    }
  };

  const actionUser = async (id: string, action: "enable" | "disable") => {
    if (userAction) return;
    setUserAction({ id, action });
    try {
      await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      adminCache.users = {};
      writeStoredAdminCache();
      await load(undefined, { targetTab: tab, query: q, force: true, showLoading: false });
    } finally {
      setUserAction(null);
    }
  };

  const deleteUser = async (id: string) => {
    if (userAction) return;
    setUserAction({ id, action: "delete" });
    try {
      await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
      adminCache.summary = null;
      adminCache.users = {};
      writeStoredAdminCache();
      await load(undefined, { targetTab: tab, query: q, force: true, showLoading: false });
    } finally {
      setUserAction(null);
    }
  };

  const deleteComment = async (id: string) => {
    if (commentActionId) return;
    setCommentActionId(id);
    try {
      await fetch(`/api/admin/comments?id=${id}`, { method: "DELETE" });
      adminCache.summary = null;
      adminCache.comments = {};
      writeStoredAdminCache();
      await load(undefined, { targetTab: tab, query: q, force: true, showLoading: false });
    } finally {
      setCommentActionId(null);
    }
  };

  if (loading) return <Card className="p-8 text-center text-slate-500">加载中</Card>;
  if (!user?.is_admin) return <Card className="p-8 text-center text-red-600">仅管理员可访问</Card>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950">管理后台</h1>
          <p className="mt-1 text-sm text-slate-500">后台只接收审核中和已发布文章，草稿不会进入后台。</p>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <Button variant={tab === "dashboard" ? "primary" : "secondary"} onClick={() => setTab("dashboard")}>仪表盘</Button>
          <Button variant={tab === "posts" ? "primary" : "secondary"} onClick={() => setTab("posts")}>文章管理</Button>
          <Button variant={tab === "users" ? "primary" : "secondary"} onClick={() => setTab("users")}>用户管理</Button>
          <Button variant={tab === "comments" ? "primary" : "secondary"} onClick={() => setTab("comments")}>评论管理</Button>
          <Button variant={tab === "categories" ? "primary" : "secondary"} onClick={() => setTab("categories")}>分类管理</Button>
        </div>
      </div>

      {isSearchable && (
        <form className="flex gap-2" onSubmit={submitSearch}>
          <Input value={q} onChange={(event) => handleSearchChange(event.target.value)} placeholder={"\u641c\u7d22"} />
          <Button type="submit" disabled={isLoading}>
            <Search className="h-4 w-4" />
            {isLoading ? "\u641c\u7d22\u4e2d..." : "\u641c\u7d22"}
          </Button>
        </form>
      )}

      {tab === "dashboard" && <Dashboard summary={summary} isLoading={isLoading} onTabChange={setTab} />}
      {tab === "posts" && <PostTable posts={posts} currentUserId={user.id} isLoading={isLoading} postAction={postAction} actionPost={actionPost} />}
      {tab === "users" && <UserTable users={users} currentUserId={user.id} isLoading={isLoading} userAction={userAction} deleteUser={deleteUser} actionUser={actionUser} />}
      {tab === "comments" && <CommentTable comments={comments} isLoading={isLoading} commentActionId={commentActionId} deleteComment={deleteComment} />}
      {tab === "categories" && <CategoryManager categories={categories} isLoading={isLoading} reload={() => load(undefined, { targetTab: "categories", force: true, showLoading: false })} />}
    </div>
  );
}

function Dashboard({
  summary,
  isLoading,
  onTabChange
}: {
  summary: AdminSummary | null;
  isLoading: boolean;
  onTabChange: (tab: Tab) => void;
}) {
  const totals = summary?.totals;
  const statusTotal = Math.max(1, (totals?.published_count ?? 0) + (totals?.pending_count ?? 0));
  const publishedCount = totals?.published_count ?? 0;
  const pendingCount = totals?.pending_count ?? 0;
  const maxTrend = useMemo(
    () => Math.max(1, ...(summary?.trends ?? []).flatMap((item) => [item.posts, item.users, item.comments])),
    [summary]
  );
  const maxCategoryHeat = useMemo(
    () => Math.max(1, ...(summary?.categoryInterest ?? []).map((item) => item.heat_score)),
    [summary]
  );

  if (isLoading && !summary) return <Card className="p-8 text-center text-slate-500">仪表盘加载中</Card>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Users} label="用户总数" value={totals?.user_count ?? 0} tone="bg-sky-50 text-sky-700" />
        <MetricCard icon={FileText} label="后台文章" value={totals?.post_count ?? 0} tone="bg-emerald-50 text-emerald-700" />
        <MetricCard icon={MessageCircle} label="评论总数" value={totals?.comment_count ?? 0} tone="bg-violet-50 text-violet-700" />
        <MetricCard icon={Eye} label="总浏览量" value={totals?.view_count ?? 0} tone="bg-amber-50 text-amber-700" />
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="min-w-0 p-4 md:p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-black text-slate-950">近 7 日数据柱状图</h2>
              <p className="mt-1 text-sm text-slate-500">文章只统计提交审核或已发布，不包含草稿。</p>
            </div>
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex h-72 min-w-0 items-end gap-2 border-b border-l border-border px-1 pb-3 pt-6 sm:gap-3 sm:px-2">
            {(summary?.trends ?? []).map((item) => (
              <div key={item.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-56 w-full items-end justify-center gap-1">
                  <ChartColumn label="文章" value={item.posts} max={maxTrend} className="bg-emerald-500" />
                  <ChartColumn label="用户" value={item.users} max={maxTrend} className="bg-sky-500" />
                  <ChartColumn label="评论" value={item.comments} max={maxTrend} className="bg-violet-500" />
                </div>
                <span className="text-xs font-medium text-slate-500">{item.day}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
            <Legend className="bg-emerald-500" label="文章" />
            <Legend className="bg-sky-500" label="用户" />
            <Legend className="bg-violet-500" label="评论" />
          </div>
        </Card>

        <Card className="min-w-0 p-4 md:p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-black text-slate-950">后台文章状态</h2>
              <p className="mt-1 text-sm text-slate-500">仅显示审核中与已发布。</p>
            </div>
            <PieChart className="h-5 w-5 text-primary" />
          </div>
          <div className="mb-5 flex items-center justify-center">
            <StatusDonut published={publishedCount} pending={pendingCount} total={statusTotal} />
          </div>
          <StatusBar label="已发布" value={publishedCount} total={statusTotal} className="bg-emerald-500" />
          <StatusBar label="审核中" value={pendingCount} total={statusTotal} className="bg-amber-500" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <ActionStat
              icon={FileText}
              label="审核队列"
              value={pendingCount}
              actionLabel={pendingCount > 0 ? "去审核" : "查看文章"}
              onClick={() => onTabChange("posts")}
            />
            <ActionStat
              icon={Tags}
              label="内容分类"
              value={summary?.category_count ?? 0}
              actionLabel="管理分类"
              onClick={() => onTabChange("categories")}
            />
          </div>
        </Card>
      </div>

      <Card className="min-w-0 p-4 md:p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-black text-slate-950">分类兴趣热度</h2>
            <p className="mt-1 text-sm text-slate-500">按推荐权重计算：浏览量 + 收藏数 x 5 + 评论数 x 3。</p>
          </div>
          <Tags className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-4">
          {(summary?.categoryInterest ?? []).map((item) => (
            <CategoryHeatRow key={item.id ?? "uncategorized"} item={item} max={maxCategoryHeat} />
          ))}
          {!summary?.categoryInterest?.length && <p className="py-6 text-center text-sm text-slate-500">暂无已发布文章热度数据</p>}
        </div>
      </Card>

      <Card className="min-w-0 p-4 md:p-5">
        <h2 className="font-black text-slate-950">最近进入后台的文章</h2>
        <div className="mt-3 divide-y divide-border">
          {(summary?.recentPosts ?? []).map((post) => (
            <div key={post.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/post/${post.id}`} className="font-semibold text-primary hover:underline">{post.title}</Link>
              <div className="flex gap-3 text-sm text-slate-500">
                <span>{post.author_name}</span>
                <span>{statusLabel(post.status)}</span>
                <span>{formatDate(post.created_at)}</span>
              </div>
            </div>
          ))}
          {!summary?.recentPosts?.length && <p className="py-8 text-center text-sm text-slate-500">暂无进入后台的文章</p>}
        </div>
      </Card>
    </div>
  );
}

function CategoryHeatRow({ item, max }: { item: AdminSummary["categoryInterest"][number]; max: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-[160px_1fr_220px] md:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
        <span className="truncate font-semibold text-slate-800">{item.name}</span>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>热度 {item.heat_score}</span>
          <span>{item.view_count} 浏览 / {item.favorite_count} 收藏 / {item.comment_count} 评论</span>
        </div>
        <div className="mt-1 h-3 overflow-hidden rounded bg-muted">
          <div className="h-full rounded" style={{ width: `${Math.max(4, (item.heat_score / max) * 100)}%`, backgroundColor: item.color }} />
        </div>
      </div>
      <div className="min-w-0 text-sm text-slate-600">
        {item.top_post_id && item.top_post_title ? (
          <Link href={`/post/${item.top_post_id}`} className="block truncate font-medium text-primary hover:underline">
            最热：{item.top_post_title}
          </Link>
        ) : (
          <span>暂无代表文章</span>
        )}
      </div>
    </div>
  );
}

function StatusDonut({ published, pending, total }: { published: number; pending: number; total: number }) {
  const publishedDeg = total > 0 ? (published / total) * 360 : 0;
  const hasData = published + pending > 0;
  const background = hasData
    ? `conic-gradient(#10b981 0deg ${publishedDeg}deg, #f59e0b ${publishedDeg}deg 360deg)`
    : "conic-gradient(#e2e8f0 0deg 360deg)";

  return (
    <div className="relative flex h-44 w-44 items-center justify-center rounded-full shadow-inner" style={{ background }}>
      <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white text-center shadow">
        <span className="text-2xl font-black text-slate-950">{published + pending}</span>
        <span className="mt-1 text-xs font-medium text-slate-500">后台文章</span>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className={`flex h-11 w-11 items-center justify-center rounded-md ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
      </div>
    </Card>
  );
}

function ChartColumn({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  return (
    <div className="flex h-full w-5 flex-col items-center justify-end gap-1">
      <span className="text-[10px] font-semibold text-slate-500">{value}</span>
      <div
        className={`w-full rounded-t ${className}`}
        style={{ height: `${value > 0 ? Math.max(8, (value / max) * 190) : 2}px` }}
        title={`${label}: ${value}`}
      />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

function StatusBar({ label, value, total, className }: { label: string; value: number; total: number; className: string }) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded bg-muted">
        <div className={`h-full rounded ${className}`} style={{ width: `${(value / total) * 100}%` }} />
      </div>
    </div>
  );
}

function ActionStat({
  icon: Icon,
  label,
  value,
  actionLabel,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <button type="button" onClick={onClick} className="text-xs font-semibold text-primary hover:underline">
          {actionLabel}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{label}</p>
      <p className="text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function PostTable({
  posts,
  currentUserId,
  isLoading,
  postAction,
  actionPost
}: {
  posts: Post[];
  currentUserId: string;
  isLoading: boolean;
  postAction: { id: string; action: "approve" | "reject" | "unpublish" | "delete" } | null;
  actionPost: (id: string, action: "approve" | "reject" | "unpublish" | "delete") => void;
}) {
  return (
    <Card className="overflow-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted text-left"><tr><th className="p-3">标题</th><th>作者</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id} className="border-t border-border">
              <td className="p-3"><Link className="font-semibold text-primary" href={`/post/${post.id}`}>{post.title}</Link></td>
              <td>
                {post.author && (
                  <Link href={post.author.id === currentUserId ? "/profile" : `/user/${post.author.id}`} className="font-medium text-primary hover:underline">
                    {post.author.nickname}
                  </Link>
                )}
              </td>
              <td>{statusLabel(post.status)}</td>
              <td>{formatDate(post.created_at)}</td>
              <td className="space-x-2">
                {post.status === "pending" && (
                  <Button size="sm" disabled={Boolean(postAction)} onClick={() => actionPost(post.id, "approve")}>
                    {postAction?.id === post.id && postAction.action === "approve" ? "通过中..." : "通过"}
                  </Button>
                )}
                {post.status === "pending" && (
                  <Button size="sm" variant="secondary" disabled={Boolean(postAction)} onClick={() => actionPost(post.id, "reject")}>
                    {postAction?.id === post.id && postAction.action === "reject" ? "拒绝中..." : "拒绝"}
                  </Button>
                )}
                {post.status === "published" && (
                  <Button size="sm" variant="warning" disabled={Boolean(postAction)} onClick={() => actionPost(post.id, "unpublish")}>
                    {postAction?.id === post.id && postAction.action === "unpublish" ? "下架中..." : "下架"}
                  </Button>
                )}
                <Button size="sm" variant="danger" disabled={Boolean(postAction)} onClick={() => actionPost(post.id, "delete")}>
                  {postAction?.id === post.id && postAction.action === "delete" ? "删除中..." : "删除"}
                </Button>
              </td>
            </tr>
          ))}
          {isLoading && posts.length === 0 && <tr><td className="p-6 text-center text-slate-500" colSpan={5}>文章加载中</td></tr>}
          {!isLoading && posts.length === 0 && <tr><td className="p-6 text-center text-slate-500" colSpan={5}>暂无后台文章</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function UserTable({
  users,
  currentUserId,
  isLoading,
  userAction,
  deleteUser,
  actionUser
}: {
  users: User[];
  currentUserId: string;
  isLoading: boolean;
  userAction: { id: string; action: "enable" | "disable" | "delete" } | null;
  deleteUser: (id: string) => void;
  actionUser: (id: string, action: "enable" | "disable") => void;
}) {
  return (
    <Card className="overflow-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted text-left"><tr><th className="p-3">用户</th><th>简介</th><th>角色</th><th>作品</th><th>操作</th></tr></thead>
        <tbody>
          {users.map((item) => (
            <tr key={item.id} className="border-t border-border">
              <td className="p-3">
                <Link href={item.id === currentUserId ? "/profile" : `/user/${item.id}`} className="inline-flex items-center gap-2 font-semibold text-slate-800 hover:text-primary">
                  <img src={item.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                  <span>{item.nickname}</span>
                </Link>
              </td>
              <td>{item.bio}</td>
              <td>{item.is_admin ? "管理员" : "普通用户"} / {item.is_active ? "正常" : "已停用"}</td>
              <td>{item.post_count ?? 0}</td>
              <td className="space-x-2">
                <Button
                  size="sm"
                  variant={item.is_active ? "secondary" : "primary"}
                  disabled={item.id === currentUserId || Boolean(userAction)}
                  onClick={() => actionUser(item.id, item.is_active ? "disable" : "enable")}
                >
                  {userAction?.id === item.id && userAction.action !== "delete" ? "处理中..." : item.is_active ? "停用" : "启用"}
                </Button>
                <Button size="sm" variant="danger" disabled={item.id === currentUserId || Boolean(userAction)} onClick={() => deleteUser(item.id)}>
                  {userAction?.id === item.id && userAction.action === "delete" ? "删除中..." : "删除"}
                </Button>
              </td>
            </tr>
          ))}
          {isLoading && users.length === 0 && <tr><td className="p-6 text-center text-slate-500" colSpan={5}>用户加载中</td></tr>}
          {!isLoading && users.length === 0 && <tr><td className="p-6 text-center text-slate-500" colSpan={5}>暂无用户</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function CategoryManager({ categories, isLoading, reload }: { categories: Category[]; isLoading: boolean; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#24777b");
  const [busy, setBusy] = useState(false);
  const [categoryActionId, setCategoryActionId] = useState<string | null>(null);

  const startEdit = (category: Category) => {
    setEditing(category);
    setName(category.name);
    setColor(category.color);
  };

  const reset = () => {
    setEditing(null);
    setName("");
    setColor("#24777b");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const method = editing ? "PATCH" : "POST";
      const body = editing ? { id: editing.id, name, color } : { name, color };
      const res = await fetch("/api/categories", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) return;
      reset();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setCategoryActionId(id);
    try {
      const res = await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) return;
      if (editing?.id === id) reset();
      await reload();
    } finally {
      setBusy(false);
      setCategoryActionId(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="p-5">
        <h2 className="font-black text-slate-950">{editing ? "编辑分类" : "新增分类"}</h2>
        <form className="mt-4 space-y-3" onSubmit={save}>
          <div>
            <label className="text-sm font-medium text-slate-700">分类名称</label>
            <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 技术" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">分类颜色</label>
            <div className="mt-1 flex gap-2">
              <Input type="color" className="w-16 p-1" value={color} onChange={(event) => setColor(event.target.value)} />
              <Input value={color} onChange={(event) => setColor(event.target.value)} placeholder="#24777b" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editing && <Button type="button" variant="secondary" disabled={busy} onClick={reset}>取消</Button>}
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? "保存中..." : "保存"}</Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-3">分类</th><th>颜色</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-t border-border">
                <td className="p-3 font-semibold">{category.name}</td>
                <td>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 rounded-sm border border-border" style={{ backgroundColor: category.color }} />
                    {category.color}
                  </span>
                </td>
                <td>{formatDate(category.created_at)}</td>
                <td className="space-x-2">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => startEdit(category)}>编辑</Button>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(category.id)}>
                    {categoryActionId === category.id ? "删除中..." : "删除"}
                  </Button>
                </td>
              </tr>
            ))}
            {isLoading && categories.length === 0 && <tr><td className="p-6 text-center text-slate-500" colSpan={4}>分类加载中</td></tr>}
            {!isLoading && categories.length === 0 && <tr><td className="p-6 text-center text-slate-500" colSpan={4}>暂无分类</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function CommentTable({
  comments,
  isLoading,
  commentActionId,
  deleteComment
}: {
  comments: Comment[];
  isLoading: boolean;
  commentActionId: string | null;
  deleteComment: (id: string) => void;
}) {
  return (
    <Card className="overflow-auto">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="bg-muted text-left"><tr><th className="p-3">评论内容</th><th>所在文章</th><th>评论用户</th><th>回复用户</th><th>时间</th><th>操作</th></tr></thead>
        <tbody>
          {comments.map((comment) => (
            <tr key={comment.id} className="border-t border-border">
              <td className="max-w-md p-3">
                <p className="line-clamp-3 leading-6">{comment.content}</p>
              </td>
              <td>
                <Link className="font-medium text-primary hover:underline" href={`/post/${comment.post_id}`}>
                  {comment.article_title}
                </Link>
              </td>
              <td>
                {comment.author && (
                  <Link href={`/user/${comment.author.id}`} className="font-medium text-primary hover:underline">
                    {comment.author.nickname}
                  </Link>
                )}
              </td>
              <td>
                {comment.reply_to_author ? (
                  <Link href={`/user/${comment.reply_to_author.id}`} className="font-medium text-primary hover:underline">
                    {comment.reply_to_author.nickname}
                  </Link>
                ) : "主评论"}
              </td>
              <td>{formatDate(comment.created_at)}</td>
              <td>
                <Button size="sm" variant="danger" disabled={Boolean(commentActionId)} onClick={() => deleteComment(comment.id)}>
                  {commentActionId === comment.id ? "删除中..." : "删除"}
                </Button>
              </td>
            </tr>
          ))}
          {isLoading && comments.length === 0 && <tr><td className="p-6 text-center text-slate-500" colSpan={6}>评论加载中</td></tr>}
          {!isLoading && comments.length === 0 && <tr><td className="p-6 text-center text-slate-500" colSpan={6}>暂无评论</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function statusLabel(status: string) {
  return status === "published" ? "已发布" : status === "pending" ? "审核中" : "草稿";
}
