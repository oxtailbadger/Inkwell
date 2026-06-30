import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await request.json();
  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  try {
    const res = await fetch(
      `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=false`,
      { headers: { "Content-Type": "application/json" } }
    );
    if (!res.ok) throw new Error(`Microlink returned ${res.status}`);

    const { data } = await res.json();
    return NextResponse.json({
      title: data.title ?? null,
      description: data.description ?? null,
      image_url: data.image?.url ?? data.logo?.url ?? null,
      site_name: data.publisher ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch metadata" }, { status: 422 });
  }
}
