"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn, firstImage } from "@/lib/utils";

type PostCoverProps = {
  images?: string[];
  image?: string;
  className?: string;
  priority?: boolean;
};

export function PostCover({ images, image, className, priority = false }: PostCoverProps) {
  const src = image || firstImage(images);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className={cn("w-full object-cover", className)}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? "eager" : "lazy"}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={cn("flex w-full flex-col items-center justify-center gap-2 bg-muted text-slate-500", className)}>
      <ImageOff className="h-6 w-6" />
      <span className="text-sm font-medium">暂无封面图片</span>
    </div>
  );
}
