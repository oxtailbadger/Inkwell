import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { article_id } = await request.json();
  if (!article_id) return NextResponse.json({ error: "article_id required" }, { status: 400 });

  // Check if nod already exists
  const { data: existing } = await supabase
    .from("nods")
    .select("article_id")
    .eq("article_id", article_id)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    // Un-nod
    const { error } = await supabase
      .from("nods")
      .delete()
      .eq("article_id", article_id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ nodded: false });
  } else {
    // Nod
    const { error } = await supabase
      .from("nods")
      .insert({ article_id, user_id: user.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ nodded: true });
  }
}
