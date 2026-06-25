import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FeedClient from "./FeedClient";

export default async function FeedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <FeedClient userEmail={user.email!} userId={user.id} />;
}
