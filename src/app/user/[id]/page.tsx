"use client";

import { readJson } from "@/lib/client-json";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { PostCard } from "@/components/post/post-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/contexts/auth-context";
import { isAbortError } from "@/lib/abort";
import type { Post, User } from "@/types";

type UserWithFollow = User & { is_following?: boolean };
type UserPageCacheEntry = {
  user: UserWithFollow | null;
  posts: Post[];
};

const userPageCache = new Map<string, UserPageCacheEntry>();
const USER_PAGE_STORAGE_KEY = "user-page-cache:v1";

function readStoredUserPages() {
  try {
    const value = window.sessionStorage.getItem(USER_PAGE_STORAGE_KEY);
    if (!value) return {};
    return JSON.parse(value) as Record<string, UserPageCacheEntry>;
  } catch {
    return {};
  }
}

function writeStoredUserPage(id: string, entry: UserPageCacheEntry) {
  try {
    const stored = readStoredUserPages();
    stored[id] = entry;
    window.sessionStorage.setItem(USER_PAGE_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export default function UserPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { user: viewer } = useAuth();
  const cached = userPageCache.get(id);
  const [user, setUser] = useState<UserWithFollow | null>(cached?.user ?? null);
  const [posts, setPosts] = useState<Post[]>(cached?.posts ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const [storageReady, setStorageReady] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async (
    signal?: AbortSignal,
    options: { targetId?: string; force?: boolean; showLoading?: boolean } = {}
  ) => {
    const targetId = options.targetId ?? id;
    const cacheEntry = userPageCache.get(targetId);
    if (cacheEntry && !options.force) {
      setUser(cacheEntry.user);
      setPosts(cacheEntry.posts);
    }
    if (options.showLoading ?? !cacheEntry) setIsLoading(true);
    try {
      const [userRes, postsRes] = await Promise.all([
        fetch(`/api/users/${targetId}`, { cache: "no-store", signal }),
        fetch(`/api/posts?user_id=${encodeURIComponent(targetId)}`, { cache: "no-store", signal })
      ]);
      const nextEntry = {
        user: (await readJson<{ user?: UserWithFollow }>(userRes)).user ?? null,
        posts: (await readJson<{ posts?: Post[] }>(postsRes)).posts ?? []
      };
      userPageCache.set(targetId, nextEntry);
      writeStoredUserPage(targetId, nextEntry);
      setUser(nextEntry.user);
      setPosts(nextEntry.posts);
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const stored = readStoredUserPages()[id];
    if (stored) {
      userPageCache.set(id, stored);
      setUser(stored.user);
      setPosts(stored.posts);
      setIsLoading(false);
    } else {
      setUser(null);
      setPosts([]);
      setIsLoading(true);
    }
    setStorageReady(true);
  }, [id]);

  useEffect(() => {
    if (!storageReady) return;
    const controller = new AbortController();
    void load(controller.signal, { targetId: id, showLoading: !userPageCache.has(id) });
    return () => controller.abort();
  }, [id, load, storageReady]);

  const follow = async () => {
    if (followBusy) return;
    setFollowBusy(true);
    try {
      await fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: id }) });
      await load(undefined, { targetId: id, force: true, showLoading: false });
    } finally {
      setFollowBusy(false);
    }
  };

  if (!user) return <EmptyState className="min-h-[calc(100vh-160px)]">{isLoading ? "用户资料加载中" : "用户不存在"}</EmptyState>;

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="flex flex-col items-center gap-2.5 p-3.5 text-center md:flex-row md:items-center md:gap-4 md:p-5 md:text-left">
        <img src={user.avatar || "/generated/default-avatar.svg"} alt="" className="h-16 w-16 rounded-full object-cover md:h-20 md:w-20" />
        <div className="w-full flex-1">
          <h1 className="text-xl font-black md:text-2xl">{user.nickname}</h1>
          <p className="mt-1 text-sm text-slate-600 md:text-base">{user.bio || "还没有简介"}</p>
          <div className="mx-auto mt-2.5 flex w-fit items-center justify-center gap-7 md:mx-0 md:mt-4 md:flex-wrap md:gap-6">
            <div className="min-w-10 px-1 py-1 md:p-0">
              <p className="text-lg font-black leading-none text-slate-950">{user.post_count ?? 0}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">作品</p>
            </div>
            <div className="min-w-10 px-1 py-1 md:p-0">
              <p className="text-lg font-black leading-none text-slate-950">{user.following_count ?? 0}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">关注</p>
            </div>
            <div className="min-w-10 px-1 py-1 md:p-0">
              <p className="text-lg font-black leading-none text-slate-950">{user.follower_count ?? 0}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">粉丝</p>
            </div>
          </div>
        </div>
        {viewer && viewer.id !== user.id && (
          <div className="grid w-full grid-cols-2 gap-2 md:w-auto md:flex md:flex-wrap">
            <Button className="w-full md:w-auto" disabled={followBusy} onClick={follow}>
              {followBusy ? "处理中..." : user.is_following ? "取消关注" : "关注"}
            </Button>
            <Link href={`/messages?peer=${user.id}`}>
              <Button variant="secondary" className="w-full md:w-auto">
                <MessageCircle className="h-4 w-4" />
                私信
              </Button>
            </Link>
          </div>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => <PostCard key={post.id} post={post} />)}
        {isLoading && posts.length === 0 && <EmptyState className="md:col-span-2 lg:col-span-3">作品加载中</EmptyState>}
        {!isLoading && posts.length === 0 && <EmptyState className="md:col-span-2 lg:col-span-3">暂无已发布作品</EmptyState>}
      </div>
    </div>
  );
}
