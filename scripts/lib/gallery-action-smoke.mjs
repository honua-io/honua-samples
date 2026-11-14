import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from "./gallery-visual-contract.mjs";

export async function verifyGalleryActions(browser, baseUrl) {
  const visited = new Set();
  for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
      const cards = page.locator(".starter-card, .card[data-id]");
      if (!(await cards.count())) throw new Error("No gallery action cards found");
      for (const card of await cards.all()) await verifyCardActions({ card, page, baseUrl, visited });
    } finally {
      await page.close();
    }
  }
}

async function verifyCardActions({ card, page, baseUrl, visited }) {
  const id = await card.getAttribute("data-id");
  const actions = card.locator("[data-gallery-action]");
  const kinds = await actions.evaluateAll((nodes) => nodes.map((node) => node.dataset.galleryAction));
  if (kinds.join(",") !== "open,build,source") throw new Error(`${id}: expected open, build, source actions`);
  for (const action of await actions.all()) {
    await action.scrollIntoViewIfNeeded();
    if (!(await action.isVisible())) throw new Error(`${id}: action is hidden`);
    const bounds = await action.boundingBox();
    if (!bounds || bounds.x < 0 || bounds.x + bounds.width > page.viewportSize().width + 1) {
      throw new Error(`${id}: action extends beyond the viewport`);
    }
    await verifyActionDestination({ action, page, baseUrl, visited, id });
  }
}

async function verifyActionDestination({ action, page, baseUrl, visited, id }) {
  const kind = await action.getAttribute("data-gallery-action");
  const href = await action.getAttribute("href");
  if (!href) {
    const reason = await action.locator("small").textContent();
    if (await action.getAttribute("aria-disabled") !== "true" || !reason?.trim()) {
      throw new Error(`${id}: ${kind} has no destination or unavailable reason`);
    }
    return;
  }
  const url = new URL(href, `${baseUrl}/`);
  if (kind === "source" && !/^https:\/\/github\.com\/honua-io\/[^/]+\/(tree|blob)\/[a-f0-9]{40}\/.+/u.test(url.href)) {
    throw new Error(`${id}: source does not pin a full published commit`);
  }
  if (kind === "open" && url.origin !== new URL(baseUrl).origin) throw new Error(`${id}: open leaves the gallery`);
  if (visited.has(url.href)) return;
  const response = await followAction(page, url);
  if (!response.ok()) throw new Error(`${id}: ${kind} returned ${response.status()} at ${url.href}`);
  visited.add(url.href);
}

async function followAction(page, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.request.get(url.href, { timeout: 45_000 });
    if (response.status() !== 429 || attempt === 2) return response;
    const retryAfter = Number(response.headers()["retry-after"]);
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000;
    if (delay > 10_000) return response;
    await page.waitForTimeout(delay);
  }
}
