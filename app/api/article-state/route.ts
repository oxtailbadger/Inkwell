import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse } from "@/lib/api-errors";

// Six explicit actions rather than a generic multi-field PATCH — this
// documents that dismiss/undismiss is a distinct asymmetric flow (paired
// with a client-side undo window), not just a boolean flip like save/read.
const ACTIONS: Record<string, { column: "saved" | "read" | "dismissed"; value: boolean }> = {
  save: { column: "saved", value: true },
  unsave: { column: "saved", value: false },
  read: { column: "read", value: true },
  unread: { column: "read", value: false },
  dismiss: { column: "dismissed", value: true },
  undismiss: { column: "dismissed", value: false },
};

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { article_id, action } = await request.json();
  if (!article_id) return NextResponse.json({ error: "article_id required" }, { status: 400 });

  const mapped = ACTIONS[action];
  if (!mapped) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  // Upsert: most articles won't have a state row until first touched. Only
  // the column named by `action` is written — the other two flags keep
  // their existing value (or default false on first insert). updated_at is
  // set explicitly because a partial upsert only writes the columns in the
  // payload; the column default fires on first insert only.
  const { data, error } = await supabase
    .from("article_state")
    .upsert(
      { article_id, user_id: user.id, [mapped.column]: mapped.value, updated_at: new Date().toISOString() },
      { onConflict: "article_id,user_id" }
    )
    .select("article_id, saved, read, dismissed")
    .single();

  if (error) return dbErrorResponse("article-state:PATCH", error, "Could not update this article. Please try again.");
  return NextResponse.json(data);
}
