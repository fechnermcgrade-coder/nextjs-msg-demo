"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import type { Post } from "@/types";
import { Card } from "@/components/ui/card";
import { PostCover } from "@/components/post/post-cover";
import { useAuth } from "@/contexts/auth-context";
import { formatDate } from "@/lib/utils";
import { getUserDisplayAvatar, getUserDisplayName, getUserProfileHref } from "@/lib/user-display";

export function PostCard({
  post,
  priority = false,
  actions,
  onFavoriteChanged
}: {
  post: Post;
  priority?: boolean;
  actions?: ReactNode;
  onFavoriteChanged?: (post: Post, isFavorited: boolean) => void;
}) {
  const { user } = useAuth();
  const [isFavorited, setIsFavorited] = useState(Boolean(post.is_favorited));
  const [favoriteCount, setFavoriteCount] = useState(post.favorite_count ?? 0);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [auditNoticeOpen, setAuditNoticeOpen] = useState(false);
  const authorName = getUserDisplayName(post.author);
  const authorAvatar = getUserDisplayAvatar(post.author);
  const authorHref = getUserProfileHref(post.user_id, user?.id, post.author?.is_active ?? true);

  useEffect(() => {
    setIsFavorited(Boolean(post.is_favorited));
    setFavoriteCount(post.favorite_count ?? 0);
  }, [post.favorite_count, post.is_favorited]);

  const toggleFavorite = async () => {
    if (!user || favoriteBusy) return;
    if (post.status !== "published") {
      setAuditNoticeOpen(true);
      return;
    }

    const nextFavorited = !isFavorited;
    setFavoriteBusy(true);
    setIsFavorited(nextFavorited);
    setFavoriteCount((value) => Math.max(0, value + (nextFavorited ? 1 : -1)));
    try {
      const res = await fetch(`/api/posts/${post.id}/favorite`, { method: "POST" });
      if (!res.ok) throw new Error("favorite failed");
      onFavoriteChanged?.(post, nextFavorited);
    } catch {
      setIsFavorited(!nextFavorited);
      setFavoriteCount((value) => Math.max(0, value + (nextFavorited ? -1 : 1)));
    } finally {
      setFavoriteBusy(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <Link href={`/post/${post.id}`}>
          <PostCover images={post.images} className="h-44" priority={priority} />
        </Link>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            {post.category && (
              <span className="rounded-md px-2 py-1 text-white" style={{ backgroundColor: post.category.color }}>
                {post.category.name}
              </span>
            )}
            <span>{formatDate(post.created_at)}</span>
          </div>
          <Link href={`/post/${post.id}`} className="block text-lg font-bold hover:text-primary">
            {post.title}
          </Link>
          <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
            {authorHref ? (
              <Link
                href={authorHref}
                className="flex min-w-0 items-center gap-1 rounded-sm transition hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <img src={authorAvatar} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                <span className="truncate">{authorName}</span>
              </Link>
            ) : (
              <span className="flex min-w-0 items-center gap-1 text-slate-500">
              <img src={authorAvatar} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
              <span className="truncate">{authorName}</span>
              </span>
            )}
            <span className="flex shrink-0 gap-3">
              <button
                type="button"
                className={`flex items-center gap-1 rounded-sm transition hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60 ${isFavorited ? "text-red-500" : ""}`}
                title={user ? (isFavorited ? "取消收藏" : "收藏") : "登录后收藏"}
                disabled={!user || favoriteBusy}
                onClick={toggleFavorite}
              >
                <Heart className={`h-4 w-4 ${isFavorited ? "fill-current" : ""}`} />
                {favoriteCount}
              </button>
              <span className="flex items-center gap-1"><MessageCircle className="h-4 w-4" />{post.comment_count ?? 0}</span>
            </span>
          </div>
          {actions && <div className="flex flex-wrap gap-2 border-t border-border pt-3">{actions}</div>}
        </div>
      </Card>
      {auditNoticeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm space-y-4 p-5 shadow-2xl">
            <div>
              <p className="text-lg font-black text-slate-950">暂不能收藏</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">该博客尚未审核，审核通过后才可以收藏。</p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-medium transition hover:bg-muted"
                onClick={() => setAuditNoticeOpen(false)}
              >
                知道了
              </button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
