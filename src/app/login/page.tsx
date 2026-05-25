"use client";

import { readJson } from "@/lib/client-json";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function safeInternalNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginCard />}>
      <LoginCard />
    </Suspense>
  );
}

function LoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = isSubmitting || isPending;

  useEffect(() => {
    if (!user) return;
    router.replace(safeInternalNext(searchParams.get("next")));
  }, [router, searchParams, user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");

    if (!form.email.trim() || !form.password) {
      setError("请输入邮箱和密码");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email: form.email.trim() })
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }
      setUser(data.user);
      startTransition(() => {
        router.push(safeInternalNext(searchParams.get("next")));
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="text-2xl font-black">登录</h1>
        <form className="mt-6 space-y-4" onSubmit={submit} aria-busy={busy}>
          <Input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="邮箱"
          />
          <Input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="密码"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" disabled={busy}>
            {busy ? "登录中..." : "登录"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          没有账号？<Link className="text-primary" href="/register">去注册</Link>
        </p>
      </Card>
    </div>
  );
}
