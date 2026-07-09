// Shared `[route-name]` log-prefix convention. Route handlers that talk to
// an external service (Microlink, archive.today, author RSS feeds) or the
// database should log through here instead of calling console.* directly,
// so every server log line is greppable by context in Vercel logs.
export function logInfo(context: string, message: string) {
  console.log(`[${context}] ${message}`);
}

export function logWarn(context: string, message: string, error?: unknown) {
  console.warn(`[${context}] ${message}`, ...(error !== undefined ? [error] : []));
}

export function logError(context: string, message: string, error?: unknown) {
  console.error(`[${context}] ${message}`, ...(error !== undefined ? [error] : []));
}
