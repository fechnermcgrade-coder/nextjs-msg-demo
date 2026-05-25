"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Home, LogOut, Mail, PenLine, Search, UserRound } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "首页", icon: Search, match: (pathname: string) => pathname === "/" || pathname.startsWith("/post/") },
  { href: "/publish", label: "发布", icon: PenLine, match: (pathname: string) => pathname === "/publish" || pathname.startsWith("/edit/") },
  { href: "/messages", label: "私信", icon: Mail, match: (pathname: string) => pathname === "/messages" },
  {
    href: "/profile",
    label: "我的",
    icon: UserRound,
    match: (pathname: string) =>
      pathname === "/profile" ||
      pathname.startsWith("/profile/") ||
      pathname === "/settings" ||
      pathname === "/admin"
  }
];

const authenticatedPrefetchHrefs = [
  "/",
  "/publish",
  "/messages",
  "/profile",
  "/profile?tab=drafts",
  "/profile?tab=pending",
  "/profile?tab=favorites",
  "/profile?tab=histories",
  "/profile/follows?type=following",
  "/profile/follows?type=followers",
  "/settings",
  "/admin"
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  useEffect(() => {
    setNavigatingTo(null);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    const prefetch = () => authenticatedPrefetchHrefs.forEach((href) => router.prefetch(href));
    const idleCallback = window.requestIdleCallback?.(prefetch, { timeout: 1800 });
    if (!window.requestIdleCallback) {
      const timer = window.setTimeout(prefetch, 300);
      return () => window.clearTimeout(timer);
    }
    return () => window.cancelIdleCallback?.(idleCallback);
  }, [router, user]);

  const startNav = (href: string) => {
    if (href === pathname) return;
    setNavigatingTo(href);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
        {navigatingTo && (
          <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-[hsl(var(--primary)/0.12)]">
            <div className="h-full w-1/2 animate-[route-progress_1s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        )}
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2 font-bold">
            <BookOpen className="h-6 w-6 shrink-0 text-primary" />
            <span className="truncate">栖声博客</span>
          </Link>

          {user && (
            <nav className="hidden items-center gap-1 md:flex">
              {links.map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => startNav(item.href)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-muted",
                      active && "bg-muted font-semibold text-primary"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="flex shrink-0 items-center gap-2">
            {user ? (
              <>
                <Link
                  href="/profile"
                  className="flex min-w-0 items-center gap-2 rounded-full px-2 py-1 text-sm transition hover:bg-muted"
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.nickname} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
                      {user.nickname.slice(0, 1)}
                    </div>
                  )}
                  <span className="hidden max-w-28 truncate sm:inline">{user.nickname}</span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  title={loggingOut ? "退出中" : "退出登录"}
                  disabled={loggingOut}
                  onClick={handleLogout}
                >
                  <LogOut className={cn("h-4 w-4", loggingOut && "animate-pulse")} />
                </Button>
              </>
            ) : (
              <>
                <Link
                  href="/"
                  className="inline-flex min-h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[hsl(var(--primary)/0.18)] bg-[hsl(var(--primary)/0.10)] px-3 py-2 text-sm font-semibold text-primary transition hover:bg-[hsl(var(--primary)/0.16)] sm:px-4"
                >
                  <Home className="h-4 w-4" />
                  首页
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-md border border-border bg-white px-3 py-2 text-sm font-medium transition hover:bg-muted sm:px-4"
                >
                  登录
                </Link>
                <Link href="/register">
                  <Button size="sm">注册</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl px-4 py-6 pb-24 md:pb-6">{children}</main>

      {user && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
            {links.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => startNav(item.href)}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium text-slate-500 transition",
                    active ? "bg-[hsl(var(--primary)/0.10)] text-primary" : "hover:bg-muted hover:text-slate-900",
                    navigatingTo === item.href && "bg-[hsl(var(--primary)/0.08)] text-primary"
                  )}
                >
                  <Icon className={cn("h-5 w-5", navigatingTo === item.href && "animate-pulse")} />
                  <span className="leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
