"use client";

import { readJson } from "@/lib/client-json";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Eye, Heart, Share2 } from "lucide-react";
import { CommentTree } from "@/components/post/comment-tree";
import { PostCover } from "@/components/post/post-cover";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { isAbortError } from "@/lib/abort";
import { formatDate } from "@/lib/utils";
import { getUserDisplayAvatar, getUserDisplayName, getUserProfileHref } from "@/lib/user-display";
import type { Comment, Post, User } from "@/types";

type ShareThread = User & { last_message: string; unread_count: number; last_at?: string };

type PostDetailCacheEntry = {
  post: Post | null;
  comments: Comment[];
};

const postDetailCache = new Map<string, PostDetailCacheEntry>();
const POST_DETAIL_STORAGE_KEY = "post-detail-cache:v1";
const COMMENT_POLL_INTERVAL_MS = 8000;

function readStoredPostDetails() {
  try {
    const value = window.sessionStorage.getItem(POST_DETAIL_STORAGE_KEY);
    if (!value) return {};
    return JSON.parse(value) as Record<string, PostDetailCacheEntry>;
  } catch {
    return {};
  }
}

function writeStoredPostDetail(id: string, entry: PostDetailCacheEntry) {
  try {
    const stored = readStoredPostDetails();
    stored[id] = entry;
    window.sessionStorage.setItem(POST_DETAIL_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const cached = postDetailCache.get(id);
  const [post, setPost] = useState<Post | null>(cached?.post ?? null);
  const [comments, setComments] = useState<Comment[]>(cached?.comments ?? []);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(!cached);
  const [storageReady, setStorageReady] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [auditNoticeOpen, setAuditNoticeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareThreads, setShareThreads] = useState<ShareThread[]>([]);
  const [shareSelected, setShareSelected] = useState<string[]>([]);
  const [shareNickname, setShareNickname] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSending, setShareSending] = useState(false);
  const recordedViewId = useRef<string | null>(null);

  const load = useCallback(async (
    signal?: AbortSignal,
    options: { targetId?: string; force?: boolean; showLoading?: boolean } = {}
  ) => {
    const targetId = options.targetId ?? id;
    const cacheEntry = postDetailCache.get(targetId);
    if (cacheEntry && !options.force) {
      setPost(cacheEntry.post);
      setComments(cacheEntry.comments);
    }
    if (options.showLoading ?? !cacheEntry) setIsLoading(true);
    try {
      const [postRes, commentRes] = await Promise.all([
        fetch(`/api/posts/${targetId}`, { cache: "no-store", signal }),
        fetch(`/api/comments?post_id=${targetId}`, { cache: "no-store", signal })
      ]);
      const nextEntry = {
        post: (await readJson(postRes)).post ?? null,
        comments: (await readJson(commentRes)).comments ?? []
      };
      postDetailCache.set(targetId, nextEntry);
      writeStoredPostDetail(targetId, nextEntry);
      setPost(nextEntry.post);
      setComments(nextEntry.comments);
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const stored = readStoredPostDetails()[id];
    if (stored) {
      postDetailCache.set(id, stored);
      setPost(stored.post);
      setComments(stored.comments);
      setIsLoading(false);
    } else {
      setPost(null);
      setComments([]);
      setIsLoading(true);
    }
    setStorageReady(true);
    recordedViewId.current = null;
  }, [id]);

  useEffect(() => {
    if (!storageReady) return;
    const controller = new AbortController();
    void load(controller.signal, { targetId: id, showLoading: !postDetailCache.has(id) });
    return () => {
      controller.abort();
    };
  }, [id, load, storageReady]);

  useEffect(() => {
    if (!storageReady || post?.status !== "published") return;
    const timer = window.setInterval(() => {
      void load(undefined, { targetId: id, force: true, showLoading: false });
    }, COMMENT_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [id, load, post?.status, storageReady]);

  useEffect(() => {
    if (post?.status !== "published" || recordedViewId.current === id) return;
    recordedViewId.current = id;
    void fetch(`/api/posts/${id}/view`, { method: "POST", credentials: "same-origin" });
  }, [id, post?.status]);

  const favorite = async () => {
    if (!post || favoriteBusy) return;
    if (post.status !== "published") {
      setAuditNoticeOpen(true);
      return;
    }
    const previous = post;
    const nextFavorited = !post.is_favorited;
    setFavoriteBusy(true);
    const optimisticPost = {
      ...post,
      is_favorited: nextFavorited,
      favorite_count: Math.max(0, (post.favorite_count ?? 0) + (nextFavorited ? 1 : -1))
    };
    setPost(optimisticPost);
    postDetailCache.set(id, { post: optimisticPost, comments });
    writeStoredPostDetail(id, { post: optimisticPost, comments });
    try {
      const res = await fetch(`/api/posts/${id}/favorite`, { method: "POST" });
      if (!res.ok) throw new Error("favorite failed");
    } catch {
      setPost(previous);
      postDetailCache.set(id, { post: previous, comments });
      writeStoredPostDetail(id, { post: previous, comments });
    } finally {
      setFavoriteBusy(false);
    }
  };

  const submitComment = async () => {
    if (!content.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: id, content })
      });
      setContent("");
      await load(undefined, { targetId: id, force: true, showLoading: false });
    } finally {
      setCommentSubmitting(false);
    }
  };

  const openShareDialog = async () => {
    if (!user) {
      setShareOpen(true);
      setShareMessage("请先登录后分享到私信");
      return;
    }
    setShareOpen(true);
    setShareMessage("");
    if (shareThreads.length > 0 || shareLoading) return;
    setShareLoading(true);
    try {
      const response = await fetch("/api/messages/threads", { cache: "no-store" });
      const data = await readJson<{ threads?: ShareThread[]; error?: string }>(response);
      if (!response.ok || data.error) {
        setShareMessage(data.error || "会话加载失败");
        return;
      }
      setShareThreads(data.threads ?? []);
    } finally {
      setShareLoading(false);
    }
  };

  const toggleShareTarget = (targetId: string) => {
    setShareSelected((current) => current.includes(targetId) ? current.filter((id) => id !== targetId) : [...current, targetId]);
  };

  const shareToMessages = async () => {
    if (!post || !user || shareSending) return;
    const nickname = shareNickname.trim();
    const targets = shareSelected;
    if (targets.length === 0 && !nickname) {
      setShareMessage("请选择会话或输入接收者昵称");
      return;
    }
    setShareSending(true);
    setShareMessage("");
    const postUrl = `/post/${post.id}`;
    const content = `分享文章：${post.title}\n${postUrl}`;
    try {
      for (const receiverId of targets) {
        const response = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiver_id: receiverId, content })
        });
        const data = await readJson<{ error?: string }>(response);
        if (!response.ok || data.error) throw new Error(data.error || "分享失败");
      }
      if (nickname) {
        const response = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiver_nickname: nickname, content })
        });
        const data = await readJson<{ error?: string }>(response);
        if (!response.ok || data.error) throw new Error(data.error || "分享失败");
      }
      setShareMessage("已分享到私信");
      setShareSelected([]);
      setShareNickname("");
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : "分享失败");
    } finally {
      setShareSending(false);
    }
  };

  if (!post) return <EmptyState className="min-h-[calc(100vh-160px)]">{isLoading ? "文章加载中" : "文章不可访问"}</EmptyState>;
  const authorHref = getUserProfileHref(post.user_id, user?.id, post.author?.is_active ?? true);
  const authorName = getUserDisplayName(post.author);
  const authorAvatar = getUserDisplayAvatar(post.author);

  return (
    <article className="mx-auto max-w-4xl space-y-6">
      <Card className="overflow-hidden">
        <PostCover images={post.images} className="h-56 sm:h-80" />
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {post.category && <span className="rounded-md px-2 py-1 text-white" style={{ backgroundColor: post.category.color }}>{post.category.name}</span>}
            <span>{formatDate(post.created_at)}</span>
            <span className="flex items-center gap-1"><Eye className="h-4 w-4" />{post.view_count}</span>
          </div>
          <h1 className="text-2xl font-black leading-tight sm:text-3xl">{post.title}</h1>
          {authorHref ? (
            <Link href={authorHref} className="flex items-center gap-3">
              <img src={authorAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              <span>{authorName}</span>
            </Link>
          ) : (
            <span className="flex items-center gap-3 text-slate-500">
              <img src={authorAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              <span>{authorName}</span>
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            {user && (
              <>
              <Button variant="secondary" disabled={favoriteBusy} onClick={favorite}>
                <Heart className={`h-4 w-4 ${post.is_favorited ? "fill-current text-red-500" : ""}`} />
                {favoriteBusy ? "处理中..." : post.is_favorited ? "取消收藏" : "收藏"}
              </Button>
              <Button variant="secondary" onClick={openShareDialog}><Share2 className="h-4 w-4" />分享</Button>
              </>
            )}
            {(user?.id === post.user_id || user?.is_admin) && post.status === "draft" && <Link href={`/edit/${post.id}`}><Button variant="secondary">编辑</Button></Link>}
          </div>
          <div className="prose-content border-t border-border pt-4" dangerouslySetInnerHTML={{ __html: post.content }} />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-xl font-black">评论</h2>
        {user ? (
          <div className="space-y-2">
            <Textarea placeholder="写下你的评论" value={content} onChange={(event) => setContent(event.target.value)} />
            <Button disabled={commentSubmitting || !content.trim()} onClick={submitComment}>
              {commentSubmitting ? "发布中..." : "发布评论"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">登录后可以参与评论。</p>
        )}
        <CommentTree comments={comments} postId={id} onChanged={load} />
      </Card>
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg space-y-4 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-black text-slate-950">分享到私信</p>
                <p className="mt-1 text-sm text-slate-600">选择已有会话，或输入一个接收者昵称。</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShareOpen(false)}>关闭</Button>
            </div>
            <div className="max-h-56 space-y-2 overflow-auto rounded-md border border-border p-2">
              {shareLoading && <p className="p-2 text-sm text-slate-500">会话加载中</p>}
              {!shareLoading && shareThreads.length === 0 && <p className="p-2 text-sm text-slate-500">暂无已有会话</p>}
              {shareThreads.map((thread) => {
                const selected = shareSelected.includes(thread.id);
                return (
                <label
                  key={thread.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition ${
                    selected ? "border-primary/40 bg-primary/5 shadow-sm" : "border-transparent hover:border-border hover:bg-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={shareSelected.includes(thread.id)}
                    onChange={() => toggleShareTarget(thread.id)}
                  />
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-black ${
                      selected ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <img src={thread.avatar || "/generated/default-avatar.svg"} alt="" className="h-9 w-9 rounded-full object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{thread.nickname}</span>
                    <span className="block truncate text-xs text-slate-500">{thread.last_message}</span>
                  </span>
                </label>
              );
              })}
            </div>
            <Input value={shareNickname} onChange={(event) => setShareNickname(event.target.value)} placeholder="输入接收者昵称" />
            {shareMessage && <p className="text-sm text-slate-600">{shareMessage}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={shareSending} onClick={() => setShareOpen(false)}>取消</Button>
              <Button disabled={shareSending || !user} onClick={shareToMessages}>
                {shareSending ? "分享中..." : "发送分享"}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {auditNoticeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm space-y-4 p-5 shadow-2xl">
            <div>
              <p className="text-lg font-black text-slate-950">暂不能收藏</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">该博客尚未审核，审核通过后才可以收藏。</p>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setAuditNoticeOpen(false)}>知道了</Button>
            </div>
          </Card>
        </div>
      )}
    </article>
  );
}
