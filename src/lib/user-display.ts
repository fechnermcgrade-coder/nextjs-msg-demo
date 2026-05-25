import type { User } from "@/types";

export const deletedUserDisplayName = "该账户已注销";
export const defaultAvatar = "/generated/default-avatar.svg";

export function getUserDisplayName(user?: Pick<User, "nickname" | "is_active"> | null) {
  if (!user) return "匿名用户";
  return user.is_active ? user.nickname : deletedUserDisplayName;
}

export function getUserDisplayAvatar(user?: Pick<User, "avatar" | "is_active"> | null) {
  if (!user || !user.is_active) return defaultAvatar;
  return user.avatar || defaultAvatar;
}

export function getUserProfileHref(userId: string, viewerId?: string, isActive = true) {
  if (!isActive) return null;
  return viewerId === userId ? "/profile" : `/user/${userId}`;
}
