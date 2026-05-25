export type User = {
  id: string;
  nickname: string;
  avatar: string;
  bio: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  following_count?: number;
  follower_count?: number;
  post_count?: number;
};

export type Category = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type PostStatus = "draft" | "pending" | "published";

export type Post = {
  id: string;
  user_id: string;
  category_id: string | null;
  title: string;
  content: string;
  images: string[];
  status: PostStatus;
  view_count: number;
  created_at: string;
  updated_at: string;
  author?: User;
  category?: Category;
  favorite_count?: number;
  comment_count?: number;
  is_favorited?: boolean;
};

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  author?: User;
  reply_to_author?: User | null;
  article_title?: string;
  children?: Comment[];
  effective_child_count?: number;
};

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  peer?: User;
};
