"use client";

import { readJson } from "@/lib/client-json";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ImagePlus, Tag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RichEditor } from "@/components/post/rich-editor";
import type { Category, Post } from "@/types";

function getPlainTextFromHtml(html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
}

export function PostForm({ post }: { post?: Post }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState(post?.title ?? "");
  const [categoryId, setCategoryId] = useState(post?.category_id ?? "");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [content, setContent] = useState(post?.content ?? "");
  const [images, setImages] = useState<string[]>(post?.images ?? []);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const selectedCategoryName = selectedCategory?.name ?? "选择分类";

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => readJson(res))
      .then((data) => setCategories(data.categories ?? []));
  }, []);

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

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return;

    setMessage("");
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await readJson(res);
        if (!res.ok || !data.url) throw new Error(data.error || "图片上传失败");
        uploaded.push(data.url);
      }
      setImages((current) => [...current, ...uploaded]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const save = async (submit: boolean) => {
    setMessage("");
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setMessage("文章标题至少需要 2 个字");
      return;
    }
    if (!getPlainTextFromHtml(content) && images.length === 0) {
      setMessage("请先写一点文章内容，或插入一张图片");
      return;
    }

    const payload = {
      title: trimmedTitle,
      category_id: categoryId || null,
      content,
      images,
      submit
    };

    setSaving(true);
    try {
      const res = await fetch(post ? `/api/posts/${post.id}` : "/api/posts", {
        method: post ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJson(res);
      if (!res.ok) {
        setMessage(data.error || "保存失败");
        return;
      }
      const nextTab = submit ? "pending" : data.post?.status === "published" ? "posts" : "drafts";
      const params = new URLSearchParams({
        tab: nextTab,
        refresh: String(Date.now())
      });
      if (typeof data.post?.id === "string") params.set("post", data.post.id);
      router.push(`/profile?${params.toString()}`);
    } catch {
      setMessage("网络异常，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <Input placeholder="文章标题" value={title} onChange={(event) => setTitle(event.target.value)} />
      <div ref={categoryDropdownRef} className="relative">
        <button
          type="button"
          className="inline-flex h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground shadow-sm transition hover:border-[hsl(var(--primary)/0.35)] hover:bg-[hsl(var(--primary)/0.06)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.22)]"
          aria-haspopup="listbox"
          aria-expanded={categoryMenuOpen}
          onClick={() => setCategoryMenuOpen((value) => !value)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedCategory?.color ? (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: selectedCategory.color }}
                aria-hidden="true"
              />
            ) : (
              <Tag className="h-4 w-4 shrink-0 text-primary" />
            )}
            <span className={categoryId ? "truncate" : "truncate text-slate-500"}>{selectedCategoryName}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${categoryMenuOpen ? "rotate-180" : ""}`} />
        </button>
        {categoryMenuOpen && (
          <div
            className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-md border border-border bg-white p-1 shadow-xl"
            role="listbox"
          >
            {[{ id: "", name: "不选择分类", color: "" }, ...categories].map((item) => {
              const selected = item.id === categoryId;

              return (
                <button
                  key={item.id || "none"}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2.5 text-left text-sm transition ${
                    selected ? "bg-[hsl(var(--primary)/0.10)] font-semibold text-primary" : "hover:bg-muted"
                  }`}
                  onClick={() => {
                    setCategoryId(item.id);
                    setCategoryMenuOpen(false);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {item.color ? (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                    ) : (
                      <Tag className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
        <select
          className="sr-only"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-label="选择分类"
        >
          <option value="">选择分类</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3 rounded-md border border-border bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">封面/配图</p>
            <p className="mt-1 text-xs text-slate-500">第一张会作为文章封面，图片会上传到服务器后保存。</p>
          </div>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => uploadImages(event.target.files)}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            {uploading ? "上传中..." : "选择图片"}
          </Button>
        </div>

        {images.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {images.map((image, index) => (
              <div key={`${image}-${index}`} className="overflow-hidden rounded-md border border-border">
                <div className="relative aspect-video bg-muted">
                  <img src={image} alt="" className="h-full w-full object-cover" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-2 top-2 h-8 w-8"
                    title="移除图片"
                    onClick={() => removeImage(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="truncate px-3 py-2 text-xs text-slate-500">{image}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <RichEditor value={content} onChange={setContent} />
      {message && <p className="text-sm text-red-600">{message}</p>}
      <div className="grid gap-2 sm:flex">
        <Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={saving} onClick={() => save(false)}>
          {saving ? "保存中..." : "保存草稿"}
        </Button>
        <Button type="button" className="w-full sm:w-auto" disabled={saving} onClick={() => save(true)}>
          {saving ? "提交中..." : "提交审核"}
        </Button>
      </div>
    </Card>
  );
}
