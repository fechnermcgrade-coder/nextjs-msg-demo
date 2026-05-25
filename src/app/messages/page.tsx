"use client";

import { readJson } from "@/lib/client-json";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Eraser, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { isAbortError } from "@/lib/abort";
import { getUserDisplayAvatar, getUserDisplayName, getUserProfileHref } from "@/lib/user-display";
import type { Message, User } from "@/types";

type Thread = User & { last_message: string; unread_count: number; last_at?: string };
type Peer = User & Partial<Pick<Thread, "last_message" | "unread_count" | "last_at">>;

const messageThreadCache: { threads: Thread[] | null } = { threads: null };
const messageCache = new Map<string, Message[]>();
const peerCache = new Map<string, Peer>();
const MESSAGE_POLL_INTERVAL_MS = 5000;
const IMAGE_MESSAGE_PREFIX = "[image]:";
const SHARED_POST_PREFIX = "分享文章：";

export default function MessagesPage() {
  return (
    <Suspense fallback={<EmptyState className="min-h-[calc(100vh-160px)]">消息加载中</EmptyState>}>
      <MessagesContent />
    </Suspense>
  );
}

function MessageBubble({ content, onPreviewImage }: { content: string; onPreviewImage: (src: string) => void }) {
  if (content.startsWith(IMAGE_MESSAGE_PREFIX)) {
    const src = content.slice(IMAGE_MESSAGE_PREFIX.length);
    return (
      <button
        type="button"
        onClick={() => onPreviewImage(src)}
        className="inline-block max-w-[70%] overflow-hidden rounded-lg bg-white p-1 text-left shadow-sm transition hover:shadow-md"
      >
        <img src={src} alt="私信图片" className="max-h-72 rounded-md object-contain" />
      </button>
    );
  }

  const sharedPost = parseSharedPost(content);
  if (sharedPost) {
    return (
      <Link
        href={sharedPost.href}
        className="inline-flex w-full max-w-sm flex-col gap-2 rounded-lg border border-primary/15 bg-white px-4 py-3 text-left text-sm shadow-sm transition hover:border-primary/40 hover:shadow-md sm:max-w-md"
      >
        <span className="text-xs font-medium text-primary">分享文章</span>
        <span className="line-clamp-2 font-semibold text-slate-950">{sharedPost.title}</span>
        <span className="truncate text-xs text-slate-500">{sharedPost.href}</span>
      </Link>
    );
  }

  return (
    <span className="inline-block max-w-[min(70%,32rem)] break-words whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
      {linkifyText(content)}
    </span>
  );
}

function parseSharedPost(content: string) {
  if (!content.startsWith(SHARED_POST_PREFIX)) return null;

  const rest = content.slice(SHARED_POST_PREFIX.length).trim();
  const urlMatch = rest.match(/(?:https?:\/\/[^\s]+)?\/post\/[^\s]+/);
  if (!urlMatch) return null;

  let href = urlMatch[0];
  if (href.startsWith("http")) {
    try {
      const url = new URL(href);
      href = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }

  const title = rest.slice(0, urlMatch.index).trim() || "查看文章";
  return { title, href };
}

function formatThreadPreview(content: string) {
  if (content.startsWith(IMAGE_MESSAGE_PREFIX)) return "图片";
  const sharedPost = parseSharedPost(content);
  if (sharedPost) return `分享文章：${sharedPost.title}`;
  return content;
}

function getDisplayName(user: Pick<User, "nickname" | "is_active">) {
  return getUserDisplayName(user);
}

function getDisplayAvatar(user: Pick<User, "avatar" | "is_active">) {
  return getUserDisplayAvatar(user);
}

function linkifyText(content: string) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  return content.split(urlPattern).map((part, index) => {
    if (!part.match(urlPattern)) return part;
    return (
      <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
        {part}
      </a>
    );
  });
}

function MessagesContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const peerId = searchParams.get("peer");
  const [threads, setThreads] = useState<Thread[]>(messageThreadCache.threads ?? []);
  const [active, setActive] = useState<Peer | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [manualNickname, setManualNickname] = useState("");
  const [error, setError] = useState("");
  const [isThreadLoading, setIsThreadLoading] = useState(!messageThreadCache.threads);
  const [isMessageLoading, setIsMessageLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const activeRef = useRef<Peer | null>(null);
  const pollingRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async (signal?: AbortSignal, showLoading = !messageThreadCache.threads) => {
    if (messageThreadCache.threads) setThreads(messageThreadCache.threads);
    if (showLoading) setIsThreadLoading(true);
    try {
      const data = await fetch("/api/messages/threads", { signal }).then((res) => readJson<{ threads?: Thread[] }>(res));
      const nextThreads = data.threads ?? [];
      messageThreadCache.threads = nextThreads;
      nextThreads.forEach((thread) => peerCache.set(thread.id, thread));
      setThreads(nextThreads);
    } catch (err) {
      if (!isAbortError(err)) throw err;
    } finally {
      if (!signal?.aborted) setIsThreadLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (peer: Peer, options: { force?: boolean; showLoading?: boolean; refreshThreads?: boolean } = {}) => {
    setActive(peer);
    activeRef.current = peer;
    peerCache.set(peer.id, peer);
    setError("");
    const cachedMessages = messageCache.get(peer.id);
    if (cachedMessages && !options.force) setMessages(cachedMessages);
    if (options.showLoading ?? !cachedMessages) setIsMessageLoading(true);
    try {
      const data = await fetch(`/api/messages?peer=${peer.id}`).then((res) => readJson<{ messages?: Message[]; error?: string }>(res));
      if (data.error) throw new Error(data.error);
      const nextMessages = data.messages ?? [];
      messageCache.set(peer.id, nextMessages);
      setMessages(nextMessages);
      if (options.refreshThreads ?? true) await loadThreads(undefined, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "消息加载失败");
    } finally {
      setIsMessageLoading(false);
    }
  }, [loadThreads]);

  const loadPeerById = useCallback(async (id: string) => {
    setError("");
    const cachedPeer = peerCache.get(id);
    if (cachedPeer) {
      await loadMessages(cachedPeer, { showLoading: !messageCache.has(id) });
      return;
    }
    const data = await fetch(`/api/users/${id}`, { cache: "no-store" }).then((res) => readJson<{ user?: User; error?: string }>(res));
    if (!data.user) {
      setError(data.error || "用户不存在");
      return;
    }
    peerCache.set(id, data.user);
    await loadMessages(data.user);
  }, [loadMessages]);

  useEffect(() => {
    const controller = new AbortController();
    if (user) {
      void loadThreads(controller.signal, !messageThreadCache.threads);
      if (peerId) void loadPeerById(peerId);
    }
    return () => controller.abort();
  }, [loadPeerById, loadThreads, user, peerId]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      void (async () => {
        try {
          await loadThreads(undefined, false);
          const currentPeer = activeRef.current;
          if (currentPeer) {
            await loadMessages(currentPeer, { force: true, showLoading: false, refreshThreads: false });
          }
        } finally {
          pollingRef.current = false;
        }
      })();
    }, MESSAGE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadMessages, loadThreads, user]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }, [active?.id, messages.length, isMessageLoading]);

  const send = async (overrideContent?: string) => {
    const receiverNickname = manualNickname.trim();
    const nextContent = overrideContent ?? content;
    if ((!active && !receiverNickname) || !nextContent.trim() || sending) return;
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(active ? { receiver_id: active.id, content: nextContent } : { receiver_nickname: receiverNickname, content: nextContent })
      });
      const data = await readJson<{ message?: Message; receiver?: User; error?: string }>(response);
      if (!response.ok || data.error) {
        setError(data.error || "发送失败");
        return;
      }
      if (!overrideContent) setContent("");
      if (active) {
        await loadMessages(active, { force: true, showLoading: false });
      } else if (data.receiver) {
        setManualNickname("");
        peerCache.set(data.receiver.id, data.receiver);
        await loadMessages(data.receiver, { force: true, showLoading: false });
      }
    } finally {
      setSending(false);
    }
  };

  const clearChat = async () => {
    if (!active || clearingChat) return;
    setError("");
    setClearingChat(true);
    const previous = messages;
    setMessages([]);
    messageCache.set(active.id, []);
    try {
      const response = await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peer_id: active.id, clear: true })
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok || data.error) throw new Error(data.error || "清空失败");
      messageThreadCache.threads = null;
      await loadThreads(undefined, false);
      setClearDialogOpen(false);
    } catch (err) {
      setMessages(previous);
      messageCache.set(active.id, previous);
      setError(err instanceof Error ? err.message : "清空失败");
    } finally {
      setClearingChat(false);
    }
  };

  const uploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingImage || sending) return;
    if (!active && !manualNickname.trim()) {
      setError("请先选择会话或输入接收者昵称");
      return;
    }
    setError("");
    setUploadingImage(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body });
      const data = await readJson<{ url?: string; error?: string }>(response);
      if (!response.ok || !data.url) {
        setError(data.error || "图片上传失败");
        return;
      }
      await send(`${IMAGE_MESSAGE_PREFIX}${data.url}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const savePreviewImage = async () => {
    if (!previewImage) return;

    const download = (href: string, filename = "private-message-image") => {
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    };

    const getImageFile = async () => {
      const response = await fetch(previewImage);
      const blob = await response.blob();
      const ext = blob.type.split("/")[1]?.split("+")[0] || "png";
      return new File([blob], `private-message-image.${ext}`, { type: blob.type || "image/png" });
    };

    setPreviewMessage("");
    const isMobile = navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const savePickerWindow = window as Window & {
      showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<{
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    };

    try {
      const shareNavigator = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string }) => Promise<void>;
      };

      if (!isMobile && savePickerWindow.showSaveFilePicker) {
        const handle = await savePickerWindow.showSaveFilePicker({
          suggestedName: "private-message-image.png",
          types: [{ description: "Image", accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"] } }]
        });
        const file = await getImageFile();
        const writable = await handle.createWritable();
        await writable.write(file);
        await writable.close();
        setPreviewMessage("图片已保存");
        return;
      }

      if (isMobile) {
        const file = await getImageFile();
        if (shareNavigator.canShare?.({ files: [file] }) && shareNavigator.share) {
          await shareNavigator.share({ files: [file], title: "保存图片" });
          setPreviewMessage("已打开系统保存面板");
          return;
        }
      }

      download(previewImage);
      setPreviewMessage("已触发下载，请查看浏览器下载栏");
    } catch {
      download(previewImage);
      setPreviewMessage("已尝试下载；若未弹出，请长按图片保存");
    }
  };

  if (loading) return <EmptyState className="min-h-[calc(100vh-160px)]">用户状态加载中</EmptyState>;
  if (!user) return <EmptyState className="min-h-[calc(100vh-160px)]">请先登录</EmptyState>;

  return (
    <div className="grid gap-4 lg:h-[calc(100dvh-96px)] lg:min-h-[560px] lg:grid-cols-[320px_1fr]">
      <Card className="min-h-0 overflow-auto p-4">
        <h1 className="text-xl font-black">私信</h1>
        <div className="mt-4 space-y-2">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className="flex w-full cursor-pointer items-center gap-3 rounded-md p-2 text-left hover:bg-muted"
              role="button"
              tabIndex={0}
              onClick={() => void loadMessages(thread)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void loadMessages(thread);
                }
              }}
            >
              {thread.is_active && getUserProfileHref(thread.id, user.id, thread.is_active) ? (
                <Link
                  href={getUserProfileHref(thread.id, user.id, thread.is_active) ?? "#"}
                  className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30"
                  title="查看资料"
                  aria-label={`查看 ${getDisplayName(thread)} 的资料`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <img src={getDisplayAvatar(thread)} alt="" className="h-10 w-10 rounded-full object-cover" />
                </Link>
              ) : (
                <div className="shrink-0 rounded-full">
                  <img src={getDisplayAvatar(thread)} alt="" className="h-10 w-10 rounded-full object-cover" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {thread.is_active && getUserProfileHref(thread.id, user.id, thread.is_active) ? (
                  <Link
                    href={getUserProfileHref(thread.id, user.id, thread.is_active) ?? "#"}
                    className="inline-block max-w-full truncate font-semibold hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {getDisplayName(thread)}
                  </Link>
                ) : (
                  <span className="inline-block max-w-full truncate font-semibold text-slate-500">{getDisplayName(thread)}</span>
                )}
                <span className="block truncate text-xs text-slate-500">{formatThreadPreview(thread.last_message)}</span>
              </div>
              {thread.unread_count > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{thread.unread_count}</span>}
            </div>
          ))}
          {isThreadLoading && threads.length === 0 && <p className="p-2 text-sm text-slate-500">会话加载中</p>}
          {!isThreadLoading && threads.length === 0 && <p className="p-2 text-sm text-slate-500">暂无会话</p>}
        </div>
      </Card>
      <Card className="flex h-[calc(100dvh-220px)] min-h-[420px] flex-col p-4 lg:h-auto lg:min-h-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-black">{active ? `与 ${getDisplayName(active)} 的私信` : "发送新私信"}</h2>
          {active && messages.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setClearDialogOpen(true)}>
              <Eraser className="h-4 w-4" />
              清空
            </Button>
          )}
        </div>
        {!active && <Input className="mt-3" value={manualNickname} onChange={(event) => setManualNickname(event.target.value)} placeholder="输入接收者昵称" />}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div ref={messageListRef} className="my-4 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md bg-muted p-4">
          {messages.map((message) => (
            <div key={message.id} className={message.sender_id === user.id ? "text-right" : "text-left"}>
              <MessageBubble content={message.content} onPreviewImage={setPreviewImage} />
            </div>
          ))}
          {isMessageLoading && messages.length === 0 && <EmptyState className="min-h-full">消息加载中</EmptyState>}
          {!isMessageLoading && active && messages.length === 0 && <EmptyState className="min-h-full">暂无消息</EmptyState>}
          {!isMessageLoading && !active && messages.length === 0 && <EmptyState className="min-h-full">选择一个会话或输入昵称发送新私信</EmptyState>}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="输入消息"
            onKeyDown={(event) => {
              if (event.key === "Enter") void send();
            }}
          />
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" disabled={uploadingImage || sending} onChange={uploadImage} />
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={uploadingImage || sending || (!active && !manualNickname.trim())}
            onClick={() => imageInputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            {uploadingImage ? "上传中..." : "图片"}
          </Button>
          <Button className="w-full sm:w-auto" disabled={sending || !content.trim() || (!active && !manualNickname.trim())} onClick={() => void send()}>
            {sending ? "发送中..." : "发送"}
          </Button>
        </div>
      </Card>
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <div className="max-h-[90dvh] w-full max-w-4xl space-y-3" onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => void savePreviewImage()}>
                <Download className="h-4 w-4" />
                保存图片
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPreviewImage(null)}>
                <X className="h-4 w-4" />
                关闭
              </Button>
            </div>
            {previewMessage && <p className="text-right text-sm text-white">{previewMessage}</p>}
            <div className="flex max-h-[82dvh] items-center justify-center overflow-auto rounded-lg bg-white p-2 shadow-2xl">
              <img src={previewImage} alt="私信图片预览" className="max-h-[78dvh] max-w-full object-contain" />
            </div>
          </div>
        </div>
      )}
      {clearDialogOpen && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => !clearingChat && setClearDialogOpen(false)}>
          <Card className="w-full max-w-sm space-y-4 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div>
              <p className="text-lg font-black text-slate-950">清空聊天记录</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                将清空你与 {getDisplayName(active)} 的聊天记录。此操作只影响你自己的私信列表，对方仍然可以看到原聊天内容。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={clearingChat} onClick={() => setClearDialogOpen(false)}>取消</Button>
              <Button disabled={clearingChat} onClick={() => void clearChat()}>
                {clearingChat ? "清空中..." : "确认清空"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
