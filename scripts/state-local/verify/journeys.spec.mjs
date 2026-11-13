// Runs the six state-local journeys of a built site against the endpoints it was built for.
// Selected only when both the server setting and the site URL are supplied; see scripts/state-local/DISPLAY.md.
import { expect, test } from '@playwright/test';
import { LIBRARY_ORIGINS } from '../../lib/own-sample-apps.mjs';
import { SERVER_SETTING, stateLocalBasemap, stateLocalIslandData, stateLocalServer } from '../../../shared/state-local/server.mjs';

const JOURNEYS = ['workbench', 'property', 'property/mobile', '311', 'public-works', 'emergency'];
const configured = process.env[SERVER_SETTING] && process.env.STATE_LOCAL_SITE_URL;

test.skip(!configured, `Set ${SERVER_SETTING} and STATE_LOCAL_SITE_URL to run the journeys against a server`);

function watchPage(page, siteOrigin) {
  const seen = { errors: [], endpointRequests: [], otherRequests: [] };
  const endpoints = new Set([stateLocalServer, stateLocalBasemap, new URL(stateLocalIslandData, siteOrigin).href].map((url) => new URL(url).origin));
  endpoints.delete(siteOrigin);
  page.on('pageerror', (error) => seen.errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') seen.errors.push(message.text()); });
  page.on('request', (request) => {
    const { origin, protocol } = new URL(request.url());
    if (!['http:', 'https:'].includes(protocol)) return;
    if (endpoints.has(origin)) seen.endpointRequests.push(request.url());
    else if (origin !== siteOrigin && !LIBRARY_ORIGINS.includes(origin)) seen.otherRequests.push(request.url());
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
    expect(response.status()).toBe(200);
    await mapsDrawn(page);
    expect(seen.endpointRequests.length, 'live requests to the configured endpoints').toBeGreaterThan(0);
    expect(seen.otherRequests, 'live requests to any other server').toEqual([]);
    expect(seen.errors, 'console errors').toEqual([]);
  });
}
