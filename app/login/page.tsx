import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { authNotice } from "@/lib/auth-messages";

export const metadata: Metadata = { title: "Sign in · Inkwell" };

// `?error=` is set by /api/auth/callback (link couldn't be exchanged) and by
// lib/api-client.ts (session ended). It's mapped through a fixed table, never
// echoed, so the query string can't inject text into the page.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  return <AuthForm mode="signin" notice={authNotice(error)} />;
}
