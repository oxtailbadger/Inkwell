import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { isSafeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign up · Inkwell" };

// Keeps a validated `?next=` when someone arrives from the sign-in page's
// "Create an account" link, so a shared link still survives the detour.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" next={isSafeNextPath(next) ? next : undefined} />;
}
