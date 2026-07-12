import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign in · Inkwell" };

export default function LoginPage() {
  return <AuthForm mode="signin" />;
}
