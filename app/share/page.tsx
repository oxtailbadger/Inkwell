import { redirect } from "next/navigation";

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
  redirect(match ? `/feed?share=${encodeURIComponent(match[0])}` : "/feed");
}
