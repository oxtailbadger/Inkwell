// Server-side validation for values that get stored and later rendered as
// hrefs or image src attributes. The client form has its own guards, and a raw
// POST to the API must not be able to store a `javascript:` URL or an
// unbounded string.
//
// This is NOT the only wall: Supabase exposes PostgREST directly and the anon
// key ships in the JS bundle, so a signed-in user can write to the tables
// without going through these routes. supabase/content-constraints.sql
// enforces the same limits as CHECK constraints — keep the two in sync
// (__tests__/db-constraints.test.ts fails if they drift).

export class ValidationError extends Error {}

const MAX_URL_LENGTH = 2000;
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SITE_NAME_LENGTH = 200;
const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 40;
const MAX_DISPLAY_NAME_LENGTH = 60;
const MAX_FEEDBACK_LENGTH = 4000;

// Only http/https may be stored. Rejects javascript:, data:, and anything
// else that could execute or misbehave when used as an href or image src.
export function validateHttpUrl(value: unknown, { required = false } = {}): string | null {
  if (value === null || value === undefined || value === "") {
    if (required) throw new ValidationError("A URL is required");
    return null;
  }
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) {
    throw new ValidationError("That URL doesn't look valid");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ValidationError("That URL doesn't look valid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError("URL must start with http:// or https://");
  }
  return value;
}

// For untrusted values we'd rather *drop* than reject — e.g. a link inside a
// third-party RSS feed, where there's no caller to send a 400 to. Same rules as
// validateHttpUrl, but returns null instead of throwing.
export function safeHttpUrl(value: unknown): string | null {
  try {
    return validateHttpUrl(value);
  } catch {
    return null;
  }
}

export function validateText(value: unknown, maxLength: number, fieldName: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ValidationError(`${fieldName} must be text`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${fieldName} is too long (max ${maxLength} characters)`);
  }
  return trimmed || null;
}

export function validateTags(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError("Tags must be a list");
  if (value.length > MAX_TAGS) throw new ValidationError(`Too many tags (max ${MAX_TAGS})`);
  return value.map((tag) => {
    if (typeof tag !== "string" || tag.length === 0 || tag.length > MAX_TAG_LENGTH) {
      throw new ValidationError("Invalid tag");
    }
    return tag.toLowerCase();
  });
}

export const LIMITS = {
  URL: MAX_URL_LENGTH,
  TITLE: MAX_TITLE_LENGTH,
  DESCRIPTION: MAX_DESCRIPTION_LENGTH,
  SITE_NAME: MAX_SITE_NAME_LENGTH,
  DISPLAY_NAME: MAX_DISPLAY_NAME_LENGTH,
  FEEDBACK: MAX_FEEDBACK_LENGTH,
  TAGS: MAX_TAGS,
  TAG_LENGTH: MAX_TAG_LENGTH,
};
