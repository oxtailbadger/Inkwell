import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { authNotice } from "@/lib/auth-messages";
import { isSafeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in · Inkwell" };

// `?error=` is set by /api/auth/callback (link couldn't be exchanged) and by
// lib/api-client.ts (session ended). It's mapped through a fixed table, never
// echoed, so the query string can't inject text into the page.
//
// `?next=` is where the auth gate found them headed (e.g. a link shared from the
// phone's share sheet). It's attacker-writable, so it only passes through if it
// is a same-site relative path (lib/safe-redirect.ts).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; next?: string | string[] }>;
}) {
  const { error, next } = await searchParams;
  return <AuthForm mode="signin" notice={authNotice(error)} next={isSafeNextPath(next) ? next : undefined} />;
}
