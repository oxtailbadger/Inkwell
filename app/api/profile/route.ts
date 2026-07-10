import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse } from "@/lib/api-errors";
import { LIMITS, ValidationError, validateText } from "@/lib/validate";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  let displayName: string | null;
  try {
    displayName = validateText(body.display_name, LIMITS.DISPLAY_NAME, "Display name");
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  // validateText treats "" as null; the column is not-null, so empty input
  // is a required-field error here, not a legitimate "clear this field" request
  if (!displayName) return NextResponse.json({ error: "Display name is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id)
    .select("display_name")
    .single();

  if (error) return dbErrorResponse("profile:PATCH", error, "Could not update your profile. Please try again.");
  return NextResponse.json(data);
}
