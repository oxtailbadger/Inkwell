import { NextResponse } from "next/server";

// Never surface raw Postgres/Supabase error text to the client — messages
// like `relation "articles" does not exist` leak schema details. Log the
// real error server-side with a route-name prefix; return a short, generic
// message the UI can display directly.
export function dbErrorResponse(
  context: string,
  error: { message: string },
  friendlyMessage: string,
  status = 500
) {
  console.error(`[${context}] ${error.message}`);
  return NextResponse.json({ error: friendlyMessage }, { status });
}
