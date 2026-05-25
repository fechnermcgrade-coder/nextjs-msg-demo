import { PostForm } from "@/components/post/post-form";

export default function PublishPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-black">发布文章</h1>
      <PostForm />
    </div>
  );
}
