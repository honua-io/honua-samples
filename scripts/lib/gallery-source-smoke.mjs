export async function requestAction(page, href, options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.request.get(href, { timeout: 45_000, ...options });
    if (response.status() !== 429 || attempt === 2) return response;
    const retryAfter = Number(response.headers()["retry-after"]);
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000;
    if (delay > 10_000) return response;
    await page.waitForTimeout(delay);
  }
}

export function createGithubSourceVerifier({ token = process.env.GITHUB_TOKEN } = {}) {
  const sourceTrees = new Map();
  return async (page, url) => {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(blob|tree)\/([a-f0-9]{40})\/(.+)$/u);
    if (url.hostname !== "github.com" || !match) throw new Error(`Unsupported source URL: ${url.href}`);
    const [, owner, repository, kind, commit, path] = match;
    const treeUrl = `https://api.github.com/repos/${owner}/${repository}/git/trees/${commit}?recursive=1`;
    if (!sourceTrees.has(treeUrl)) sourceTrees.set(treeUrl, readSourceTree(page, treeUrl, token));
    const tree = await sourceTrees.get(treeUrl);
    const expectedType = kind === "blob" ? "blob" : "tree";
    if (!tree.some((entry) => entry.path === path && entry.type === expectedType)) {
      throw new Error(`Published source ${kind} is missing at ${url.href}`);
    }
  };
}

async function readSourceTree(page, treeUrl, token) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Keep credentials on the constructed API URL, even if it returns a redirect.
  const response = await requestAction(page, treeUrl, { headers, maxRedirects: 0 });
  if (!response.ok()) throw new Error(`Source tree returned ${response.status()} at ${treeUrl}`);
  const result = await response.json();
  if (result.truncated || !Array.isArray(result.tree)) throw new Error(`Incomplete source tree at ${treeUrl}`);
  return result.tree;
}
