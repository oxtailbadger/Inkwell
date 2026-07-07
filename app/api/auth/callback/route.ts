import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only same-origin relative paths are safe to use as the post-login redirect
// target. `next` gets concatenated directly onto `origin` below rather than
// passed through new URL(), so a value like "@evil.com" (no leading slash)
// or "//evil.com" (protocol-relative) can produce a string that parses as a
// different host — the leading-slash-but-not-double-slash check blocks both.
function safeNextPath(value: string | null): string {
  if (value && /^\/(?!\/|\\)/.test(value)) return value;
  return "/feed";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
