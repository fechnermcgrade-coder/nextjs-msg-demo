"use client";

import { readJson } from "@/lib/client-json";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@/types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const authStorageKey = "auth-user";
const authEventKey = "auth-event";

type AuthEvent = {
  type: "login" | "logout";
  user: User | null;
  at: number;
};

function isProtectedPath(pathname: string) {
  return (
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/publish" ||
    pathname === "/messages" ||
    pathname === "/settings" ||
    pathname === "/admin" ||
    pathname.startsWith("/edit/")
  );
}

function safeInternalNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function writeCachedUser(user: User | null) {
  try {
    if (typeof window === "undefined") return;
    if (user) window.sessionStorage.setItem(authStorageKey, JSON.stringify(user));
    else window.sessionStorage.removeItem(authStorageKey);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function broadcastAuthEvent(event: AuthEvent) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(authEventKey, JSON.stringify(event));
  } catch {
    // Cross-tab sync is best-effort when storage is unavailable.
  }
}

export function AuthProvider({ children, initialUser = null }: { children: React.ReactNode; initialUser?: User | null }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(false);

  const updateUser = useCallback((nextUser: User | null, options: { broadcast?: boolean } = {}) => {
    const { broadcast = true } = options;
    writeCachedUser(nextUser);
    setUser(nextUser);
    setLoading(false);
    if (broadcast) {
      broadcastAuthEvent({
        type: nextUser ? "login" : "logout",
        user: nextUser,
        at: Date.now()
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await readJson(res);
      const nextUser = data.user ?? null;
      updateUser(nextUser);
    } finally {
      setLoading(false);
    }
  }, [updateUser]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", cache: "no-store", credentials: "same-origin" });
    updateUser(null);
    window.location.replace("/");
  }, [updateUser]);

  useEffect(() => {
    if (!initialUser) return;
    writeCachedUser(initialUser);
  }, [initialUser]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== authEventKey || !event.newValue) return;

      let nextEvent: AuthEvent;
      try {
        nextEvent = JSON.parse(event.newValue) as AuthEvent;
      } catch {
        return;
      }

      if (nextEvent.type === "login") {
        updateUser(nextEvent.user, { broadcast: false });
        router.refresh();
        if (window.location.pathname === "/login" || window.location.pathname === "/register") {
          const next = safeInternalNext(new URLSearchParams(window.location.search).get("next"));
          router.replace(next);
        }
        return;
      }

      updateUser(null, { broadcast: false });
      router.refresh();
      const nextPath = `${window.location.pathname}${window.location.search}`;
      if (isProtectedPath(window.location.pathname)) {
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [router, updateUser]);

  const value = useMemo(() => ({ user, loading, setUser: updateUser, refresh, logout }), [user, loading, updateUser, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
