// Pass as `fetchFn` to a HonuaClient whose every load claims to verify the
// server's current data. Anonymous public queries allow a browser to answer
// from a cached response inside their stale-while-revalidate window; this
// makes each request revalidate with the server (a 304 when nothing changed).
export const revalidatingFetch = (input, init) => fetch(input, { ...init, cache: 'no-cache' });
