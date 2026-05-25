"use client";

import { readJson } from "@/lib/client-json";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PostCard } from "@/components/post/post-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/contexts/auth-context";
import { isAbortError } from "@/lib/abort";
import type { Post } from "@/types";

const tabs = [
  ["posts", "作品"],
  ["drafts", "草稿箱"],
  ["pending", "审核中"],
  ["favorites", "收藏"],
  ["histories", "历史记录"]
] as const;

type ProfileTab = (typeof tabs)[number][0];
type PostCache = Partial<Record<ProfileTab, Post[]>>;
type ProfileCache = {
  posts: PostCache;
  summary?: Record<string, number>;
};

const profileCache = new Map<string, ProfileCache>();
const storagePrefix = "profile-cache:v3:";

function readStoredProfile(userId: string) {
  try {
    const value = window.sessionStorage.getItem(`${storagePrefix}${userId}`);
    if (!value) return null;
    return JSON.parse(value) as ProfileCache;
  } catch {
    return null;
  }
}

function writeStoredProfile(userId: string, cache: ProfileCache) {
  try {
    window.sessionStorage.setItem(`${storagePrefix}${userId}`, JSON.stringify(cache));
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

function getCachedProfile(userId: string) {
  let cache = profileCache.get(userId);
  if (!cache) {
    cache = { posts: {} };
    profileCache.set(userId, cache);
  }
  return cache;
}

function isProfileTab(value: string | null): value is ProfileTab {
  return tabs.some(([key]) => key === value);
}

function hasTabCache(cache: PostCache, tab: ProfileTab) {
  return Object.prototype.hasOwnProperty.call(cache, tab);
}

function getTabUrl(tab: ProfileTab) {
  if (tab === "favorites") return "/api/favorites";
  if (tab === "histories") return "/api/histories";

  const statusMap: Record<Exclude<ProfileTab, "favorites" | "histories">, string> = {
    posts: "published",
    drafts: "draft",
    pending: "pending"
  };
  return `/api/posts?mine=1&status=${statusMap[tab]}`;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<EmptyState className="min-h-[calc(100vh-160px)]">加载个人中心</EmptyState>}>
      <ProfileContent />
    </Suspense>
  );
}

function ProfileContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const userId = user?.id;
  const params = useSearchParams();
  const requestedTab = params.get("tab");
  const refreshKey = params.get("refresh");
  const refreshPostId = params.get("post");
  const tab: ProfileTab = isProfileTab(requestedTab) ? requestedTab : "posts";
  const initialCache = userId ? getCachedProfile(userId) : null;
  const hasInitialTabCache = initialCache ? hasTabCache(initialCache.posts, tab) : false;
  const [summary, setSummary] = useState<Record<string, number>>(initialCache?.summary ?? {});
  const [postCache, setPostCacheState] = useState<PostCache>(initialCache?.posts ?? {});
  const postCacheRef = useRef<PostCache>(initialCache?.posts ?? {});
  const [loadingTab, setLoadingTab] = useState<ProfileTab | null>(hasInitialTabCache || !userId ? null : tab);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusAction, setStatusAction] = useState<{ postId: string; action: "submit" | "unpublish" } | null>(null);
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const posts = useMemo(() => postCache[tab] ?? [], [postCache, tab]);
  const isLoading = loadingTab === tab;

  const fetchPostsForTab = useCallback(async (targetTab: ProfileTab, signal?: AbortSignal) => {
    const res = await fetch(getTabUrl(targetTab), { cache: "no-store", signal });
    return ((await readJson(res)).posts ?? []) as Post[];
  }, []);

  const setPostCache = useCallback((updater: (value: PostCache) => PostCache) => {
    setPostCacheState((value) => {
      const next = updater(value);
      postCacheRef.current = next;
      if (userId) {
        const cache = getCachedProfile(userId);
        cache.posts = next;
        writeStoredProfile(userId, cache);
      }
      return next;
    });
  }, [userId]);

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    if (!user) return;
    try {
      const res = await fetch("/api/users/me/summary", { cache: "no-store", signal });
      const nextSummary = (await readJson(res)).summary ?? {};
      if (userId) {
        const cache = getCachedProfile(userId);
        cache.summary = nextSummary;
        writeStoredProfile(userId, cache);
      }
      setSummary(nextSummary);
    } catch (error) {
      if (!isAbortError(error)) throw error;
    }
  }, [user, userId]);

  const loadTab = useCallback(async (
    targetTab: ProfileTab,
    options: { expectedPostId?: string | null; signal?: AbortSignal; silent?: boolean; force?: boolean } = {}
  ) => {
    if (!user) return;

    const { expectedPostId, signal, silent = true, force = false } = options;
    if (!force) {
      const storedCache = userId ? getCachedProfile(userId).posts : postCacheRef.current;
      if (hasTabCache(storedCache, targetTab)) {
        postCacheRef.current = storedCache;
        setPostCacheState(storedCache);
        setLoadingTab((value) => (value === targetTab ? null : value));
        if (targetTab === "favorites") return;
      }
    }

    if (!silent) setLoadingTab(targetTab);
    try {
      let nextPosts = await fetchPostsForTab(targetTab, signal);
      for (let attempt = 0; expectedPostId && !nextPosts.some((item) => item.id === expectedPostId) && attempt < 3; attempt += 1) {
        if (signal?.aborted) return;
        await delay(450, signal);
        if (signal?.aborted) return;
        nextPosts = await fetchPostsForTab(targetTab, signal);
      }
      if (signal?.aborted) return;
      setPostCache((value) => ({ ...value, [targetTab]: nextPosts }));
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      if (!signal?.aborted && !silent) {
        setLoadingTab((value) => (value === targetTab ? null : value));
      }
    }
  }, [fetchPostsForTab, setPostCache, user, userId]);

  const refreshProfileData = async (targetTab = tab) => {
    setPostCache((value) => {
      const next = { ...value };
      delete next.posts;
      delete next.drafts;
      delete next.pending;
      delete next.histories;
      return next;
    });
    await Promise.all([
      loadSummary(),
      loadTab(targetTab, { force: true, silent: false })
    ]);
  };

  const goToTab = (targetTab: ProfileTab, postId?: string) => {
    const params = new URLSearchParams({
      tab: targetTab,
      refresh: String(Date.now())
    });
    if (postId) params.set("post", postId);
    router.push(`/profile?${params.toString()}`);
  };

  const updatePostStatus = async (postId: string, action: "submit" | "unpublish", targetTab: ProfileTab) => {
    setStatusAction({ postId, action });
    try {
      const res = await fetch(`/api/posts/${postId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      if (!res.ok) return;
      await refreshProfileData(targetTab);
      goToTab(targetTab, postId);
    } finally {
      setStatusAction(null);
    }
  };

  const deletePost = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/posts/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) return;
      setDeleteTarget(null);
      await refreshProfileData("drafts");
      goToTab("drafts");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFavoriteChanged = (post: Post, isFavorited: boolean) => {
    if (tab !== "favorites" || isFavorited) return;
    setPostCache((value) => ({
      ...value,
      favorites: (value.favorites ?? []).filter((item) => item.id !== post.id)
    }));
    void loadSummary();
  };

  const removeHistory = async (postId: string) => {
    setHistoryActionId(postId);
    try {
      const res = await fetch(`/api/histories?post_id=${postId}`, { method: "DELETE" });
      if (!res.ok) return;
      setPostCache((value) => ({
        ...value,
        histories: (value.histories ?? []).filter((item) => item.id !== postId)
      }));
      void loadSummary();
    } finally {
      setHistoryActionId(null);
    }
  };

  const clearHistory = async () => {
    setIsClearingHistory(true);
    try {
      const res = await fetch("/api/histories", { method: "DELETE" });
      if (!res.ok) return;
      setClearHistoryOpen(false);
      setPostCache((value) => ({ ...value, histories: [] }));
      await loadSummary();
    } finally {
      setIsClearingHistory(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    const stored = readStoredProfile(userId);
    if (stored) profileCache.set(userId, stored);
    else profileCache.set(userId, { posts: {} });
    const cache = getCachedProfile(userId);
    setSummary(cache.summary ?? {});
    postCacheRef.current = cache.posts;
    setPostCacheState(cache.posts);
    setLoadingTab(hasTabCache(cache.posts, tab) ? null : tab);
  }, [tab, userId]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    if (user) void loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary, user, userId]);

  useEffect(() => {
    if (!refreshKey || !user) return;
    const controller = new AbortController();
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary, refreshKey, user]);

  useEffect(() => {
    const controller = new AbortController();
    const hasCurrentTabCache = hasTabCache(postCacheRef.current, tab);
    if (refreshKey) {
      setPostCache((value) => {
        const next = { ...value };
        delete next[tab];
        return next;
      });
    }
    void loadTab(tab, {
      expectedPostId: refreshPostId,
      force: Boolean(refreshKey) || tab === "histories",
      signal: controller.signal,
      silent: !refreshKey && hasCurrentTabCache
    });
    return () => controller.abort();
  }, [loadTab, refreshKey, refreshPostId, setPostCache, tab]);

  if (loading) return <EmptyState className="min-h-[calc(100vh-160px)]">用户状态加载中</EmptyState>;
  if (!user) return <EmptyState className="min-h-[calc(100vh-160px)]">请先登录</EmptyState>;

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="flex flex-col items-center gap-2.5 p-3.5 text-center md:flex-row md:items-center md:gap-4 md:p-5 md:text-left">
        <img src={user.avatar} alt="" className="h-16 w-16 rounded-full object-cover md:h-20 md:w-20" />
        <div className="w-full flex-1">
          <h1 className="text-xl font-black md:text-2xl">{user.nickname}</h1>
          <p className="mt-1 text-sm text-slate-600 md:text-base">{user.bio || "还没有简介"}</p>
          <div className="mx-auto mt-2.5 flex w-fit items-center justify-center gap-7 md:mx-0 md:mt-4 md:flex-wrap md:gap-6">
            <div className="min-w-10 px-1 py-1 md:p-0">
              <p className="text-lg font-black leading-none text-slate-950">{summary.post_count ?? 0}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">作品</p>
            </div>
            <Link href="/profile/follows?type=following" className="min-w-10 px-1 py-1 transition hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 md:p-0">
              <p className="text-lg font-black leading-none text-slate-950">{summary.following_count ?? 0}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">关注</p>
            </Link>
            <Link href="/profile/follows?type=followers" className="min-w-10 px-1 py-1 transition hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 md:p-0">
              <p className="text-lg font-black leading-none text-slate-950">{summary.follower_count ?? 0}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">粉丝</p>
            </Link>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 md:w-auto md:flex md:flex-wrap">
          {user.is_admin && <Link href="/admin"><Button className="w-full md:w-auto">后台管理</Button></Link>}
          <Link href="/settings"><Button variant="secondary" className="w-full border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 md:w-auto">编辑资料</Button></Link>
        </div>
      </Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {tabs.map(([key, label]) => (
            <Link key={key} href={`/profile?tab=${key}`}>
              <Button variant={tab === key ? "primary" : "secondary"}>{label}</Button>
            </Link>
          ))}
        </div>
        {tab === "histories" && <Button className="self-start sm:self-auto" variant="danger" onClick={() => setClearHistoryOpen(true)}>清空历史</Button>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onFavoriteChanged={handleFavoriteChanged}
            actions={tab === "drafts" ? (
              <>
                <Link href={`/edit/${post.id}`}><Button size="sm" variant="secondary">编辑</Button></Link>
                <Button
                  size="sm"
                  disabled={Boolean(statusAction)}
                  onClick={() => updatePostStatus(post.id, "submit", "pending")}
                >
                  {statusAction?.postId === post.id && statusAction.action === "submit" ? "提交中..." : "提交审核"}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleteTarget(post)}>删除</Button>
              </>
            ) : tab === "posts" ? (
              <>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={Boolean(statusAction)}
                  onClick={() => updatePostStatus(post.id, "unpublish", "drafts")}
                >
                  {statusAction?.postId === post.id && statusAction.action === "unpublish" ? "下架中..." : "下架"}
                </Button>
              </>
            ) : tab === "histories" ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={historyActionId === post.id}
                  onClick={() => removeHistory(post.id)}
                >
                  {historyActionId === post.id ? "移除中..." : "移除记录"}
                </Button>
              </>
            ) : undefined}
          />
        ))}
        {isLoading && posts.length === 0 && <EmptyState className="md:col-span-2 lg:col-span-3">内容加载中</EmptyState>}
        {!isLoading && posts.length === 0 && <EmptyState className="md:col-span-2 lg:col-span-3">暂无内容</EmptyState>}
      </div>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-md space-y-4 p-5 shadow-2xl">
            <div>
              <p className="text-lg font-black text-slate-950">删除草稿</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                确定要删除《{deleteTarget.title}》吗？这个操作会永久移除草稿，无法恢复。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={isDeleting} onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button variant="danger" disabled={isDeleting} onClick={deletePost}>
                {isDeleting ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {clearHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-md space-y-4 p-5 shadow-2xl">
            <div>
              <p className="text-lg font-black text-slate-950">清空历史记录</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                确定要清空全部浏览历史吗？清空后这些记录不会再出现在历史记录里。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={isClearingHistory} onClick={() => setClearHistoryOpen(false)}>取消</Button>
              <Button variant="danger" disabled={isClearingHistory} onClick={clearHistory}>
                {isClearingHistory ? "清空中..." : "确认清空"}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {statusAction && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/55 px-4 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-md border border-border bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-xl">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {statusAction.action === "submit" ? "正在提交审核..." : "正在下架到草稿箱..."}
          </div>
        </div>
      )}
    </div>
  );
}
