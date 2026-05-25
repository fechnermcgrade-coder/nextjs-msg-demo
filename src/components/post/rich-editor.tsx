"use client";

import { readJson } from "@/lib/client-json";
import { useEffect, useRef, useState } from "react";
import { Bold, Heading2, ImagePlus, Italic, List } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RichEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const editor = ref.current;
    if (!editor || editor.innerHTML === value) return;
    editor.innerHTML = value;
  }, [value]);

  const command = (name: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(name, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  };

  const insertImage = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append("file", file);
      setUploading(true);
      try {
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await readJson(res);
        if (data.url) command("insertImage", data.url);
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        <Button type="button" variant="ghost" size="icon" title="加粗" onClick={() => command("bold")}><Bold className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" title="斜体" onClick={() => command("italic")}><Italic className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" title="标题" onClick={() => command("formatBlock", "h2")}><Heading2 className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" title="列表" onClick={() => command("insertUnorderedList")}><List className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" title="图片" disabled={uploading} onClick={insertImage}><ImagePlus className="h-4 w-4" /></Button>
      </div>
      <div
        ref={ref}
        className="prose-content min-h-64 p-4 outline-none empty:before:text-slate-400 empty:before:content-['写下文章内容...']"
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
      />
    </div>
  );
}
