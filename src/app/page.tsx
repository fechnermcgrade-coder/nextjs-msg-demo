import { HomeClient } from "@/app/home-client";
import { getHomeCategories, getHomePosts } from "@/lib/home-server";

export const revalidate = 60;

export default async function HomePage() {
  const [initialPosts, initialCategories] = await Promise.all([
    getHomePosts().catch((error) => {
      console.error("Failed to load home posts:", error);
      return [];
    }),
    getHomeCategories().catch((error) => {
      console.error("Failed to load home categories:", error);
      return [];
    })
  ]);

  return <HomeClient initialPosts={initialPosts} initialCategories={initialCategories} initialLoaded />;
}
