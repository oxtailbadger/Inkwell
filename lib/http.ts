import { NextResponse } from "next/server";
import { ValidationError } from "@/lib/validate";

// Shared plumbing for route handlers' request bodies and validation errors.
//
// Before this, most routes did `await request.json()` bare. A malformed body
// threw, and a body of `null`/`[]`/`"x"` parsed fine and then blew up on the
// first property access — both surfaced as a 500, for what is really a bad
// request (400). Routes still check auth FIRST (401 before 400), then read the
// body through here.

export type JsonBody =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

const invalidBody = () =>
  NextResponse.json({ error: "Invalid request body" }, { status: 400 });

// Parses the request as a JSON *object*. Anything else — unparseable text, an
// empty body, `null`, an array, a bare string or number — is a 400.
export async function readJsonObject(request: Request): Promise<JsonBody> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, response: invalidBody() };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, response: invalidBody() };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

// For `catch (e)` around the validators in lib/validate.ts: a ValidationError
// becomes a 400 carrying its message; anything else is a real bug and rethrows.
export function validationErrorResponse(e: unknown): NextResponse {
  if (e instanceof ValidationError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  throw e;
}
