import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { Shell } from "@/components/layout/shell";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "栖声博客",
  description: "一个功能完整的个人博客社区原型"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider initialUser={user}>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}
