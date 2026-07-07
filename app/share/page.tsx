import { redirect } from "next/navigation";

// Trailing characters that are almost never part of a URL but commonly sit
// right after one in prose ("check this out: https://x.com/a." or
// "(see https://x.com/a)"). Stripped repeatedly so nested cases like ")."
// are fully removed.
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

// Web Share Target landing. Android apps are inconsistent about which field
// carries the link — many put it in `text` (sometimes with commentary around
// it) rather than `url` — so scan all three for the first http(s) URL.
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string; title?: string }>;
}) {
  const { url, text, title } = await searchParams;
  const candidate = [url, text, title].filter(Boolean).join(" ");
  const match = candidate.match(/https?:\/\/\S+/);
  const cleaned = match ? match[0].replace(TRAILING_PUNCTUATION, "") : null;
  redirect(cleaned ? `/feed?share=${encodeURIComponent(cleaned)}` : "/feed");
}
