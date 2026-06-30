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
      `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=false`
    );

    const json = await res.json();
    console.log("[fetch-og] Microlink response:", JSON.stringify(json, null, 2));

    if (json.status !== "success") {
      console.error("[fetch-og] Microlink failed:", json.message ?? json.status);
      const needsManual = json.code === "EPROXYNEEDED";
      return NextResponse.json(
        { error: "Could not fetch metadata", manual: needsManual },
        { status: 422 }
      );
    }

    const { data } = json;
    return NextResponse.json({
      title: data.title ?? null,
      description: data.description ?? null,
      image_url: data.image?.url ?? data.logo?.url ?? null,
      site_name: data.publisher ?? null,
    });
  } catch (e) {
    console.error("[fetch-og] Error:", e);
    return NextResponse.json({ error: "Could not fetch metadata" }, { status: 422 });
  }
}
