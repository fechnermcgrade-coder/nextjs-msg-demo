"use client";

import { readJson } from "@/lib/client-json";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    email: "",
    verificationCode: "",
    nickname: "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = isSubmitting || isPending;

  useEffect(() => {
    if (!user) return;
    router.replace("/");
  }, [router, user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async () => {
    if (isSendingCode || cooldown > 0) return;
    setError("");
    setNotice("");

    const email = form.email.trim();
    if (!email) {
      setError("请先填写邮箱");
      return;
    }

    setIsSendingCode(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(data.error || "验证码发送失败");
        return;
      }

      setNotice("验证码已发送，请查看邮箱。");
      setCooldown(60);
    } finally {
      setIsSendingCode(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");

    if (!form.email.trim() || !form.verificationCode.trim() || !form.nickname.trim() || !form.password || !form.confirmPassword) {
      setError("请完整填写注册信息");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email.trim(),
          verificationCode: form.verificationCode.trim(),
          nickname: form.nickname.trim()
        })
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(data.error || "注册失败");
        return;
      }
      setUser(data.user);
      startTransition(() => {
        router.push("/");
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="text-2xl font-black">注册</h1>
        <form className="mt-6 space-y-4" onSubmit={submit} aria-busy={busy}>
          <Input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="邮箱"
          />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={form.verificationCode}
              onChange={(event) => setForm({ ...form, verificationCode: event.target.value.replace(/\D/g, "").slice(0, 6) })}
              placeholder="邮箱验证码"
            />
            <Button type="button" variant="secondary" disabled={isSendingCode || cooldown > 0 || busy} onClick={() => void sendCode()}>
              {isSendingCode ? "发送中..." : cooldown > 0 ? `${cooldown}s` : "发送验证码"}
            </Button>
          </div>
          <Input
            value={form.nickname}
            autoComplete="nickname"
            onChange={(event) => setForm({ ...form, nickname: event.target.value })}
            placeholder="昵称"
          />
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="密码，至少 6 位"
          />
          <Input
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
            placeholder="再次输入密码"
          />
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" disabled={busy || isSendingCode}>
            {busy ? "创建中..." : "创建账号"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
