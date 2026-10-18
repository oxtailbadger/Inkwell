// "Only the most recent request may update the screen."
//
// The feed refetches on every filter change. Responses can arrive out of order —
// a slow request for the tag you clicked first can finish AFTER the fast one for
// the tag you clicked second, and overwrite it with stale articles. Take a
// token when a request starts; only apply its result if it's still the latest.
export function createLatestGuard() {
  let latest = 0;
  return {
    // Start a new "latest" request, invalidating every earlier token
    next(): number {
      latest += 1;
      return latest;
    },
    // The current token without starting a new one (for work, like "load more",
    // that belongs to whichever request is current when it starts)
    current(): number {
      return latest;
    },
    isCurrent(token: number): boolean {
      return token === latest;
    },
  };
}
