import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fetchEnrichedArticles } from "@/lib/articles";
import FeedClient from "./FeedClient";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tag = (await searchParams).tag ?? null;
  const { articles } = await fetchEnrichedArticles(supabase, user.id, tag);

  return (
    <FeedClient
      userEmail={user.email!}
      userId={user.id}
      initialArticles={articles ?? []}
      initialTag={tag}
    />
  );
}
