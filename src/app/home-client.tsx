"use client";

import { readJson } from "@/lib/client-json";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Eye, Heart, Layers3, MessageCircle, Search, TrendingUp } from "lucide-react";
import { HeroCarousel } from "@/components/post/hero-carousel";
import { PostCard } from "@/components/post/post-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Category, Post } from "@/types";

type HomeClientProps = {
  initialPosts?: Post[];
  initialCategories?: Category[];
  initialLoaded?: boolean;
};

const postCache = new Map<string, Post[]>();
let categoryCache: Category[] | null = null;
const homeStorageKey = "home-cache";
const RECOMMENDATION_LIMIT = 5;

function readHomeCache() {
  try {
    const value = window.sessionStorage.getItem(homeStorageKey);
    if (!value) return null;
    return JSON.parse(value) as { posts: Record<string, Post[]>; categories: Category[] | null };
  } catch {
    return null;
  }
}

function writeHomeCache() {
  try {
    window.sessionStorage.setItem(
      homeStorageKey,
      JSON.stringify({ posts: Object.fromEntries(postCache), categories: categoryCache })
    );
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function hydrateHomeCache() {
  if (postCache.size || categoryCache) return;
  const stored = readHomeCache();
  if (!stored) return;
  for (const [key, value] of Object.entries(stored.posts)) {
    postCache.set(key, value);
  }
  categoryCache = stored.categories;
}

function getPostCacheKey(q: string, category: string) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (category) params.set("category", category);
  return params.toString();
}

export function HomeClient({ initialPosts = [], initialCategories = [], initialLoaded = false }: HomeClientProps) {
  const initialKey = getPostCacheKey("", "");
  const [posts, setPosts] = useState(initialPosts);
  const [categories, setCategories] = useState(initialCategories);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resolvedInitial, setResolvedInitial] = useState(initialLoaded);
  const [isFilteredView, setIsFilteredView] = useState(false);
  const selectedCategoryName = categories.find((item) => item.id === category)?.name ?? "全部分类";

  const featured = useMemo(
    () =>
      [...posts]
        .sort((a, b) => getRecommendationScore(b) - getRecommendationScore(a) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, RECOMMENDATION_LIMIT),
    [posts]
  );

  const load = async () => {
    const trimmedQuery = q.trim();
    if (!trimmedQuery) {
      const cachedHomePosts = postCache.get(initialKey);
      setPosts(cachedHomePosts ?? initialPosts);
      setIsFilteredView(false);
      setIsLoading(false);
      return;
    }

    const cacheKey = getPostCacheKey(trimmedQuery, category);
    const cachedPosts = postCache.get(cacheKey);
    if (cachedPosts) {
      setPosts(cachedPosts);
      setIsFilteredView(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (category) params.set("category", category);

      const res = await fetch(`/api/posts?${params.toString()}`);
      const nextPosts = (await readJson(res)).posts ?? [];
      postCache.set(cacheKey, nextPosts);
      writeHomeCache();
      setPosts(nextPosts);
      setIsFilteredView(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;

    async function loadInitial() {
      if (initialLoaded) {
        postCache.set(initialKey, initialPosts);
        categoryCache = initialCategories;
        writeHomeCache();
        setResolvedInitial(true);
        setIsLoading(false);
        return;
      }

      hydrateHomeCache();
      const cachedPosts = postCache.get(initialKey);
      const cachedCategories = categoryCache;
      if (cachedPosts && cachedCategories) {
        setPosts(cachedPosts);
        setCategories(cachedCategories);
        setIsLoading(false);
        setResolvedInitial(true);
        return;
      }

      setIsLoading(true);
      try {
        const [postRes, catRes] = await Promise.all([
          cachedPosts ? null : fetch("/api/posts"),
          cachedCategories ? null : fetch("/api/categories")
        ]);
        if (ignore) return;

        const nextPosts = cachedPosts ?? ((await readJson(postRes!)).posts ?? []);
        const nextCategories = cachedCategories ?? ((await readJson(catRes!)).categories ?? []);
        postCache.set(initialKey, nextPosts);
        categoryCache = nextCategories;
        writeHomeCache();
        setPosts(nextPosts);
        setCategories(nextCategories);
        setResolvedInitial(true);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void loadInitial();

    return () => {
      ignore = true;
    };
  }, [initialCategories, initialKey, initialLoaded, initialPosts]);

  useEffect(() => {
    if (q.trim()) return;

    const cachedHomePosts = postCache.get(initialKey);
    if (cachedHomePosts) {
      setPosts(cachedHomePosts);
    } else if (initialPosts.length) {
      setPosts(initialPosts);
    }
    setIsFilteredView(false);
  }, [initialKey, initialPosts, q]);

  useEffect(() => {
    if (!categoryMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!categoryDropdownRef.current?.contains(event.target as Node)) {
        setCategoryMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCategoryMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [categoryMenuOpen]);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="搜索文章标题或内容"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load();
            }}
          />
        </div>
        <div ref={categoryDropdownRef} className="relative w-full md:w-[192px]">
          <button
            type="button"
            className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground shadow-sm transition hover:border-[hsl(var(--primary)/0.35)] hover:bg-[hsl(var(--primary)/0.06)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.22)]"
            aria-haspopup="listbox"
            aria-expanded={categoryMenuOpen}
            onClick={() => setCategoryMenuOpen((value) => !value)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Layers3 className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{selectedCategoryName}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${categoryMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {categoryMenuOpen && (
            <div
              className="absolute right-0 top-12 z-30 w-full overflow-hidden rounded-md border border-border bg-white p-1 shadow-xl"
              role="listbox"
            >
              {[{ id: "", name: "全部分类" }, ...categories].map((item) => {
                const selected = item.id === category;

                return (
                  <button
                    key={item.id || "all"}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm transition ${
                      selected ? "bg-[hsl(var(--primary)/0.10)] font-semibold text-primary" : "hover:bg-muted"
                    }`}
                    onClick={() => {
                      setCategory(item.id);
                      setCategoryMenuOpen(false);
                    }}
                  >
                    <span className="truncate">{item.name}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <select
          className="sr-only"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">全部分类</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button onClick={load} disabled={isLoading || !q.trim()}>
          {isLoading ? "筛选中" : "筛选"}
        </Button>
      </section>

      {!isFilteredView && (
        <section className="grid items-stretch gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <HeroCarousel />
          <Card className="flex h-full min-h-[300px] flex-col overflow-hidden p-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="text-xs font-semibold text-primary">每日推荐</p>
              <h2 className="mt-1 text-lg font-black">今日阅读榜</h2>
            </div>
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>

          <div className="min-h-0 flex-1 divide-y divide-border">
            {featured.map((post, index) => (
              <Link key={post.id} href={`/post/${post.id}`} className="grid grid-cols-[auto_1fr] gap-3 py-3 hover:text-primary">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-sm font-black text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="line-clamp-1 font-bold">{post.title}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{post.view_count}</span>
                    <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{post.favorite_count ?? 0}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{post.comment_count ?? 0}</span>
                    <span>热度 {getRecommendationScore(post)}</span>
                  </div>
                </div>
              </Link>
            ))}
            {featured.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">暂无推荐内容</div>
            )}
          </div>

          <p className="border-t border-border pt-3 text-xs text-slate-500">按浏览量、收藏数和评论数综合排序，每日动态更新。</p>
          </Card>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post, index) => (
          <PostCard key={post.id} post={post} priority={index < 3} />
        ))}
        {isLoading && posts.length === 0 && (
          <EmptyState className="md:col-span-2 lg:col-span-3">内容加载中</EmptyState>
        )}
        {resolvedInitial && !isLoading && posts.length === 0 && (
          <EmptyState className="md:col-span-2 lg:col-span-3">暂无已发布文章</EmptyState>
        )}
      </section>
    </div>
  );
}

function getRecommendationScore(post: Post) {
  return post.view_count + (post.favorite_count ?? 0) * 5 + (post.comment_count ?? 0) * 3;
}
