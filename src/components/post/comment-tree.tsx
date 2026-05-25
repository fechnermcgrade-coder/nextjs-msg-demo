"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Comment, User } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { formatDate } from "@/lib/utils";
import { getUserDisplayAvatar, getUserDisplayName, getUserProfileHref } from "@/lib/user-display";

type FlatReply = Comment & {
  reply_to_author?: User | null;
};

export function CommentTree({ comments, postId, onChanged }: { comments: Comment[]; postId: string; onChanged: () => void }) {
  const { user } = useAuth();

  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <CommentThread
          key={comment.id}
          comment={comment}
          postId={postId}
          viewerId={user?.id}
          canReply={Boolean(user)}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function CommentThread({
  comment,
  postId,
  viewerId,
  canReply,
  onChanged
}: {
  comment: Comment;
  postId: string;
  viewerId?: string;
  canReply: boolean;
  onChanged: () => void;
}) {
  const replies = useMemo(() => flattenReplies(comment), [comment]);
  const [open, setOpen] = useState(replies.length <= 3);
  const visibleReplies = open ? replies : replies.slice(0, 3);

  return (
    <article className="rounded-lg border border-border bg-white p-4">
      <CommentBody comment={comment} postId={postId} viewerId={viewerId} canReply={canReply} onChanged={onChanged} />
      {visibleReplies.length > 0 && (
        <div className="mt-4 space-y-3 border-l border-border pl-4">
          {visibleReplies.map((reply) => (
            <CommentBody
              key={reply.id}
              comment={reply}
              postId={postId}
              viewerId={viewerId}
              canReply={canReply}
              onChanged={onChanged}
              compact
            />
          ))}
        </div>
      )}
      {replies.length > 3 && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setOpen((value) => !value)}>
          {open ? "收起回复" : `展开 ${replies.length - 3} 条回复`}
        </Button>
      )}
    </article>
  );
}

function CommentBody({
  comment,
  postId,
  viewerId,
  canReply,
  onChanged,
  compact = false
}: {
  comment: Comment;
  postId: string;
  viewerId?: string;
  canReply: boolean;
  onChanged: () => void;
  compact?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const authorName = getUserDisplayName(comment.author);
  const authorAvatar = getUserDisplayAvatar(comment.author);
  const authorHref = getUserProfileHref(comment.user_id, viewerId, comment.author?.is_active ?? true);
  const replyToName = comment.reply_to_author ? getUserDisplayName(comment.reply_to_author) : undefined;

  const submit = async () => {
    if (!canReply || !content.trim() || sending) return;
    setSending(true);
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, parent_id: comment.id, content })
      });
      if (!response.ok) return;
      setContent("");
      setReplying(false);
      onChanged();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex items-start gap-3">
      {authorHref ? (
        <Link href={authorHref} className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30">
          <img src={authorAvatar} alt="" className={`${compact ? "h-8 w-8" : "h-9 w-9"} rounded-full object-cover`} />
        </Link>
      ) : (
        <span className="shrink-0 rounded-full">
        <img src={authorAvatar} alt="" className={`${compact ? "h-8 w-8" : "h-9 w-9"} rounded-full object-cover`} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {authorHref ? (
            <Link href={authorHref} className="font-semibold hover:text-primary">
              {authorName}
            </Link>
          ) : (
            <span className="font-semibold text-slate-500">{authorName}</span>
          )}
          {replyToName && <span className="text-slate-500">回复 {replyToName}</span>}
          <span className="text-slate-500">{formatDate(comment.created_at)}</span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{comment.content}</p>
        {canReply && (
          <Button variant="ghost" size="sm" className="mt-1 px-0 hover:bg-transparent hover:text-primary" onClick={() => setReplying((value) => !value)}>
            回复
          </Button>
        )}
        {replying && (
          <div className="mt-2 space-y-2">
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={`回复 ${authorName}`} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" disabled={sending} onClick={() => setReplying(false)}>取消</Button>
              <Button size="sm" disabled={sending || !content.trim()} onClick={submit}>
                {sending ? "发送中..." : "发送"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function flattenReplies(comment: Comment) {
  const replies: FlatReply[] = [];

  const visit = (children: Comment[] = [], parentAuthor?: User) => {
    children
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((child) => {
        replies.push({ ...child, reply_to_author: child.reply_to_author ?? parentAuthor ?? null });
        visit(child.children, child.author);
      });
  };

  visit(comment.children, comment.author);
  return replies;
}
