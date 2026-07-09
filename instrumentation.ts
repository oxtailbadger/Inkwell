// Runs once when a new Next.js server instance starts (both Node and Edge
// runtimes — proxy.ts runs on Edge). Fail fast with a clear message instead
// of letting `process.env.X!` throw a cryptic "Cannot read property of
// undefined" deep inside a request handler.
const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export function register() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Copy .env.example to .env.local and fill in your Supabase project settings.`
    );
  }
}
