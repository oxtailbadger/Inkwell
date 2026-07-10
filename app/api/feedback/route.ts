import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse } from "@/lib/api-errors";
import { LIMITS, ValidationError, validateText } from "@/lib/validate";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  let message: string | null;
  try {
    message = validateText(body.message, LIMITS.FEEDBACK, "Feedback");
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  // validateText treats "" as null; an empty message isn't feedback.
  if (!message) return NextResponse.json({ error: "Please enter some feedback first" }, { status: 400 });

  // email is captured from the authenticated session, never the request body,
  // so it can't be spoofed. Denormalized so the feedback table reads on its
  // own without a join to auth.users (see supabase/feedback-schema.sql).
  const { error } = await supabase
    .from("feedback")
    .insert({ user_id: user.id, email: user.email, message });

  if (error) return dbErrorResponse("feedback:POST", error, "Could not send your feedback. Please try again.");
  return NextResponse.json({ ok: true });
}
