// A gallery "Open" link is only for an address a reader can request.
// Loopback endpoints stay in the contract text; they are not navigation.

const LOOPBACK_HOSTS = new Set(["localhost", "0.0.0.0", "::", "::1"]);

export function isPublishableHttpUrl(value) {
  if (!value) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[/u, "").replace(/\]$/u, "").replace(/\.$/u, "");
  if (LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost")) return false;
  if (/^127(?:\.\d{1,3}){3}$/u.test(host)) return false;
  return true;
}
