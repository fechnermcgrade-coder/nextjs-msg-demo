"use client";

import { readJson } from "@/lib/client-json";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/contexts/auth-context";
import { isAbortError } from "@/lib/abort";
import type { User } from "@/types";

type FollowType = "following" | "followers";
type FollowCache = Partial<Record<FollowType, User[]>>;

const followCache: FollowCache = {};

function getFollowType(value: string | null): FollowType {
  return value === "followers" ? "followers" : "following";
}

export default function FollowsPage() {
  return (
    <Suspense fallback={<EmptyState className="min-h-[calc(100vh-160px)]">加载列表中</EmptyState>}>
      <FollowsContent />
    </Suspense>
  );
}

function FollowsContent() {
  const { user } = useAuth();
  const params = useSearchParams();
  const type = getFollowType(params?.get("type") ?? null);
  const [usersByType, setUsersByType] = useState<FollowCache>(() => followCache);
  const [loadingType, setLoadingType] = useState<FollowType | null>(followCache[type] ? null : type);
  const [actingId, setActingId] = useState<string | null>(null);
  const users = usersByType[type] ?? [];
  const isLoading = loadingType === type && !usersByType[type];

  const title = type === "followers" ? "粉丝列表" : "关注列表";
  const description = type === "followers" ? "这些用户正在关注你。" : "你正在关注这些用户。";
  const emptyText = type === "followers" ? "暂时还没有粉丝" : "暂时还没有关注的人";
  const actionText = type === "followers" ? "移除粉丝" : "取消关注";

  const load = useCallback(async (options: { force?: boolean; signal?: AbortSignal; silent?: boolean } = {}) => {
    const { force = false, signal, silent = false } = options;
    if (!force && followCache[type]) {
      setUsersByType({ ...followCache });
      setLoadingType((value) => (value === type ? null : value));
      return;
    }

    if (!silent) setLoadingType(type);
    try {
      const data = await fetch(`/api/follows?type=${type}`, { cache: "no-store", signal }).then((res) => readJson(res));
      if (signal?.aborted) return;
      followCache[type] = data.users ?? [];
      setUsersByType({ ...followCache });
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      if (!signal?.aborted && !silent) setLoadingType((value) => (value === type ? null : value));
    }
  }, [type]);

  useEffect(() => {
    const controller = new AbortController();
    void load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  const remove = async (id: string) => {
    setActingId(id);
    try {
      await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id, remove_follower: type === "followers" })
      });
      await load({ force: true });
    } finally {
      setActingId(null);
    }
  };

  const tabs = useMemo(
    () => [
      { href: "/profile/follows?type=following", key: "following" as const, label: "关注", count: type === "following" ? users.length : undefined },
      { href: "/profile/follows?type=followers", key: "followers" as const, label: "粉丝", count: type === "followers" ? users.length : undefined }
    ],
    [type, users.length]
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/profile" className="text-sm font-medium text-primary hover:underline">
            返回个人中心
          </Link>
          <h1 className="mt-2 text-2xl font-black text-slate-950">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex gap-2">
          {tabs.map((item) => (
            <Link key={item.key} href={item.href}>
              <Button variant={type === item.key ? "primary" : "secondary"}>
                {item.label}
                {typeof item.count === "number" && <span className="text-xs opacity-80">{item.count}</span>}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {users.map((item) => (
          <Card key={item.id} className="flex items-center gap-4 p-4">
            <img src={item.avatar || "/generated/default-avatar.svg"} alt="" className="h-14 w-14 rounded-full object-cover" />
            <Link href={user?.id === item.id ? "/profile" : `/user/${item.id}`} className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-950">{item.nickname}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.bio || "还没有简介"}</p>
            </Link>
            <Button variant="secondary" size="sm" disabled={actingId === item.id} onClick={() => remove(item.id)}>
              {actingId === item.id ? "处理中" : actionText}
            </Button>
          </Card>
        ))}

        {isLoading && users.length === 0 && (
          <div className="col-span-full flex min-h-72 items-center justify-center text-sm text-slate-500">
            列表加载中
          </div>
        )}
        {!isLoading && users.length === 0 && (
          <div className="col-span-full flex min-h-72 items-center justify-center text-sm text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}
