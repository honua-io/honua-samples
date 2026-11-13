// Runs the six state-local journeys of a built site against the endpoints it was built for.
// Selected only when both the server setting and the site URL are supplied; see scripts/state-local/DISPLAY.md.
import { expect, test } from '@playwright/test';
import { LIBRARY_ORIGINS } from '../../lib/own-sample-apps.mjs';
import { SERVER_SETTING, stateLocalBasemap, stateLocalIslandData, stateLocalServer } from '../../../shared/state-local/server.mjs';

const JOURNEYS = ['workbench', 'property', 'property/mobile', '311', 'public-works', 'emergency'];
const configured = process.env[SERVER_SETTING] && process.env.STATE_LOCAL_SITE_URL;

test.skip(!configured, `Set ${SERVER_SETTING} and STATE_LOCAL_SITE_URL to run the journeys against a server`);

function watchPage(page, siteOrigin) {
  const seen = { errors: [], archiveRequests: [], otherRequests: [] };
  const archives = [stateLocalBasemap, stateLocalIslandData];
  const allowedOrigins = new Set([siteOrigin, stateLocalServer, ...archives.map((url) => new URL(url).origin), ...LIBRARY_ORIGINS]);
  page.on('pageerror', (error) => seen.errors.push(error.message));
  page.on('console', (message) => {
    const missingFavicon = message.location().url?.endsWith('/favicon.ico');
    if (message.type() === 'error' && !missingFavicon) seen.errors.push(message.text());
  });
  page.on('request', (request) => {
    const { origin, protocol } = new URL(request.url());
    if (!['http:', 'https:'].includes(protocol)) return;
    const archive = archives.find((prefix) => request.url().startsWith(prefix));
    if (archive) seen.archiveRequests.push(archive);
    else if (!allowedOrigins.has(origin)) seen.otherRequests.push(request.url());
  });
  return seen;
}

async function mapsDrawn(page) {
  await expect(page.locator('.maplibregl-canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => HM.maps.length > 0
    && HM.maps.every((map) => map.loaded() && map.getSource('streets') && map.isSourceLoaded('streets')), null, { timeout: 60_000 });
}

for (const journey of JOURNEYS) {
  test(`${journey} loads, draws its map and reads only from the configured endpoints`, async ({ page, baseURL }) => {
    const seen = watchPage(page, new URL(baseURL).origin);
    const response = await page.goto(`/state-local/${journey}/`);
    expect(response?.status()).toBe(200);
    await mapsDrawn(page);
    expect(new Set(seen.archiveRequests), 'live requests to each configured map archive').toEqual(new Set([stateLocalBasemap, stateLocalIslandData]));
    expect(seen.otherRequests, 'live requests to any other server').toEqual([]);
    expect(seen.errors, 'console errors').toEqual([]);
  });
}
