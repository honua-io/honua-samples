export function serverEnv() {
  const baseUrl = (process.env.HONUA_BASE_URL ?? "").replace(/\/+$/, "");
  const adminApiKey = process.env.HONUA_ADMIN_API_KEY ?? "";
  if (!baseUrl) throw new Error("HONUA_BASE_URL is not set");
  if (!adminApiKey) throw new Error("HONUA_ADMIN_API_KEY is not set");
  return { baseUrl, adminApiKey };
}

// Read a response body once, keeping the raw text for error messages.
export async function readJsonResponse(response) {
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { text, json };
}

export async function adminFetchResponse(env, { method, apiPath, body, headers: requestHeaders }) {
  const headers = { ...requestHeaders, "X-API-Key": env.adminApiKey };
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${env.baseUrl}${apiPath}`, { method, headers, body: payload,
    signal: AbortSignal.timeout(60_000) });
  const { text, json } = await readJsonResponse(response);
  if (!response.ok || json?.success === false) {
    throw new Error(`${method} ${apiPath} -> HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return { json, headers: response.headers };
}

export async function adminFetch(env, request) {
  return (await adminFetchResponse(env, request)).json;
}
