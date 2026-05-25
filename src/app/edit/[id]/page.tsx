"use client";

import { readJson } from "@/lib/client-json";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PostForm } from "@/components/post/post-form";
import { Card } from "@/components/ui/card";
import type { Post } from "@/types";

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/posts/${id}`, { cache: "no-store" })
      .then((res) => readJson(res).then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => ok ? setPost(data.post) : setError(data.error || "无法编辑"));
  }, [id]);

  if (error) return <Card className="p-8 text-red-600">{error}</Card>;
  if (!post) return <Card className="p-8 text-slate-500">加载文章中</Card>;
  if (post.status === "pending") return <Card className="p-8 text-slate-500">审核中文章不可编辑</Card>;
  if (post.status === "published") return <Card className="p-8 text-slate-500">已发布作品请先下架到草稿箱后再编辑</Card>;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-black">编辑文章</h1>
      <PostForm post={post} />
    </div>
  );
}
