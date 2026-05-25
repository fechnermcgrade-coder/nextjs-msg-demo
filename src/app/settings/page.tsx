"use client";

import { readJson } from "@/lib/client-json";
import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({
    nickname: user?.nickname || "",
    avatar: user?.avatar || "/generated/default-avatar.svg",
    bio: user?.bio || ""
  });
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (user) {
      setForm({
        nickname: user.nickname || "",
        avatar: user.avatar || "/generated/default-avatar.svg",
        bio: user.bio || ""
      });
    }
  }, [user]);

  if (!user) return <Card className="p-8 text-center text-slate-500">请先登录</Card>;

  const upload = async (file: File) => {
    if (uploading) return;
    setUploading(true);
    setFileName(file.name);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body });
      const data = await readJson(res);
      if (data.url) setForm((value) => ({ ...value, avatar: data.url }));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (saving || uploading) return;
    setSaving(true);
    try {
      const res = await fetch("/api/users/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await readJson(res);
      setMessage(res.ok ? "资料已保存" : data.error || "保存失败");
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="space-y-4 p-6">
        <h1 className="text-2xl font-black">设置</h1>
        <img src={form.avatar} alt="" className="h-24 w-24 rounded-full object-cover" />
        <Input value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} placeholder="昵称" />
        <Input value={form.avatar} onChange={(event) => setForm({ ...form, avatar: event.target.value })} placeholder="头像路径" />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium transition hover:bg-muted">
            <Upload className="h-4 w-4" />
            {uploading ? "上传中..." : "选择头像"}
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])}
            />
          </label>
          <span className="text-sm text-slate-500">{fileName || "未选择文件"}</span>
        </div>
        <Textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} placeholder="简介" />
        {message && <p className="text-sm text-slate-600">{message}</p>}
        <div className="flex justify-end">
          <Button className="min-w-28" onClick={save} disabled={uploading || saving}>
            {saving ? "保存中..." : "保存资料"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
