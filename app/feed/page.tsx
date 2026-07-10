import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fetchAllTags, fetchEnrichedArticles } from "@/lib/articles";
import FeedClient from "./FeedClient";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; saved?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const tag = params.tag ?? null;
  const savedOnly = params.saved === "1";
  const [{ articles, nextCursor, error }, allTags, { data: profile }] = await Promise.all([
    fetchEnrichedArticles(supabase, user.id, tag, { limit: 24, savedOnly }),
    fetchAllTags(supabase),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
  ]);

  return (
    <FeedClient
      userEmail={user.email!}
      userId={user.id}
      displayName={profile?.display_name ?? user.email!.split("@")[0]}
      initialArticles={articles ?? []}
      initialNextCursor={nextCursor}
      initialTag={tag}
      initialSavedOnly={savedOnly}
      initialAllTags={allTags}
      // A DB failure on first render must surface as an error banner, not
      // masquerade as the "No articles yet" empty state
      initialError={error}
    />
  );
}
