"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const slides = [
  {
    image: "/generated/carousel-poster-1.webp",
    position: "center",
    eyebrow: "今日编辑精选",
    title: "把安静的日常写成一张海报",
    description: "统一的水彩动漫海报风，承载生活、技术与灵感的长篇表达。"
  },
  {
    image: "/generated/carousel-poster-2.webp",
    position: "center",
    eyebrow: "创作与审稿",
    title: "让想传达的话认真抵达",
    description: "草稿、审稿、发布、评论和收藏，让每一篇作品都有正式登场的仪式感。"
  },
  {
    image: "/generated/carousel-poster-3.webp",
    position: "center",
    eyebrow: "社区回声",
    title: "在城市散步里遇见新的章节",
    description: "关注作者、收藏文章、私信交流，让博客不只是归档，也能生长。"
  }
];

export function HeroCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;

    const timer = window.setInterval(() => {
      setActive((value) => (value + 1) % slides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [paused]);

  const move = (direction: -1 | 1) => {
    setActive((value) => (value + direction + slides.length) % slides.length);
  };

  return (
    <div
      className="relative aspect-[16/9] min-h-[210px] max-w-full overflow-hidden rounded-lg border border-border bg-slate-900 sm:min-h-[300px] lg:min-h-0"
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {slides.map((slide, index) => (
        <div
          key={slide.image}
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            index === active ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <img
            src={slide.image}
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            fetchPriority={index === 0 ? "high" : "auto"}
            loading={index === 0 ? "eager" : "lazy"}
            style={{ objectPosition: slide.position }}
          />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/52 via-slate-950/14 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white [text-shadow:0_2px_16px_rgba(15,23,42,0.65)] md:p-9">
            <p className="mb-2 text-sm font-semibold text-white/85 md:mb-3">{slide.eyebrow}</p>
            <h1 className="max-w-xl text-3xl font-black leading-tight md:text-5xl">{slide.title}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/90 md:mt-4 md:text-base md:leading-7">
              {slide.description}
            </p>
          </div>
        </div>
      ))}
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 md:px-5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="pointer-events-auto border-transparent text-white shadow-sm [text-shadow:0_1px_8px_rgba(15,23,42,0.8)] hover:bg-white/15"
          title="上一张"
          onClick={() => move(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="pointer-events-auto border-transparent text-white shadow-sm [text-shadow:0_1px_8px_rgba(15,23,42,0.8)] hover:bg-white/15"
          title="下一张"
          onClick={() => move(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="absolute bottom-5 right-6 flex gap-2">
        {slides.map((slide, index) => (
          <button
            key={slide.image}
            className={cn("h-2.5 rounded-full bg-white/55 transition-all", index === active ? "w-8 bg-white" : "w-2.5")}
            aria-label={`切换到第 ${index + 1} 张`}
            onClick={() => setActive(index)}
          />
        ))}
      </div>
    </div>
  );
}
