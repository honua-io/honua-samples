import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { prepareDepthBrowser } from './depth-fixture.mjs';

let site;
test.beforeAll(async () => { site = await prepareDepthBrowser(); });
test.afterAll(async () => { await site?.close(); });
const parameters = '?requestsService=requests&requestsLayer=1&parcelsService=parcels&parcelsLayer=2';
const fields = ['objectid', 'record_id', 'category', 'status', 'district', 'opened_at', 'tmk_txt', 'gisacres', 'taxacres',
  'data_origin', 'is_demo', 'exercise_only', 'display_label'];
const rows = [1, 2, 3].map((id) => ({ attributes: { objectid: id, record_id: `DEMO-${id}`,
  category: 'drainage', status: id === 3 ? 'exercise_closed' : 'exercise_open', district: 'Demo district 1',
  opened_at: `2026-11-0${id}T12:00:00Z`, tmk_txt: `DEMO-PARCEL-${id}`, gisacres: id, taxacres: id,
  data_origin: 'synthetic_demo', is_demo: true, exercise_only: true, display_label: 'DEMO DATA — fictional request' },
  geometry: { x: -156.44 + id * .005, y: 20.86 } }));

function filtered(params) {
  const where = params.get('where') ?? '1=1';
  const status = /exercise_(open|closed)/u.exec(where)?.[0];
  const recordId = /record_id = '((?:[^']|'')*)'/u.exec(where)?.[1]?.replaceAll("''", "'");
  const start = /opened_at >= '([^']+)'/u.exec(where)?.[1];
  const end = /opened_at < '([^']+)'/u.exec(where)?.[1];
  const box = params.has('geometry') ? JSON.parse(params.get('geometry')) : null;
  return rows.filter(({ attributes: row, geometry: point }) => (!status || row.status === status)
    && (recordId === undefined || row.record_id === recordId)
    && (!start || row.opened_at >= start) && (!end || row.opened_at < end)
    && (!box || (point.x >= box.xmin && point.x <= box.xmax && point.y >= box.ymin && point.y <= box.ymax)));
}
async function mockServer(page) {
  const control = { fail: false, queries: [], holdMap: false, corruptTable: false };
  await page.route('https://demo.honua.io/rest/services/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const params = request.method() === 'POST' ? new URLSearchParams(request.postData()) : url.searchParams;
    if (!url.pathname.endsWith('/query')) {
      await route.fulfill({ json: { id: Number(url.pathname.split('/').at(-1)), name: 'DEMO DATA fixture', type: 'Feature Layer',
        geometryType: 'esriGeometryPoint', objectIdField: 'objectid', spatialReference: { wkid: 4326 },
        extent: { xmin: -156.5, ymin: 20.8, xmax: -156.3, ymax: 20.9, spatialReference: { wkid: 4326 } },
        fields: fields.map((name) => ({ name, type: name === 'objectid' ? 'esriFieldTypeOID'
          : ['gisacres', 'taxacres'].includes(name) ? 'esriFieldTypeDouble' : 'esriFieldTypeString' })),
        capabilities: 'Query', useStandardizedQueries: true, maxRecordCount: 1000,
        advancedQueryCapabilities: { supportsPagination: true, supportsStatistics: true, supportsOrderBy: true,
          supportsReturningQueryExtent: true } } });
      return;
    }
    control.queries.push(Object.fromEntries(params));
    if (control.fail) { await route.fulfill({ status: 503, json: { error: { code: 503, message: 'Fixture outage' } } }); return; }
    const matching = filtered(params);
    if (params.get('returnExtentOnly') === 'true' || params.get('returnCountOnly') === 'true') {
      await route.fulfill({ json: { count: matching.length, extent: { xmin: -156.5, ymin: 20.8, xmax: -156.3, ymax: 20.9, spatialReference: { wkid: 4326 } } } });
    } else if (params.has('outStatistics')) {
      const statuses = [...new Set(matching.map((row) => row.attributes.status))];
      await route.fulfill({ json: { features: statuses.map((status) => ({ attributes: { status,
        record_count: matching.filter((row) => row.attributes.status === status).length } })) } });
    } else {
      const offset = Number(params.get('resultOffset') ?? 0);
      const limit = Number(params.get('resultRecordCount') ?? 1000);
      if (control.holdMap && limit === 1000) {
        control.held = true;
        await new Promise((resolve) => { control.releaseMap = resolve; });
      }
      const projection = params.get('outFields')?.split(',');
      const features = matching.slice(offset, offset + limit).map((feature) => ({ ...feature, attributes: Object.fromEntries(
        Object.entries(feature.attributes).filter(([field]) => !projection || projection.includes('*') || projection.includes(field))) }));
      if (control.corruptTable && limit === 100) for (const feature of features) delete feature.attributes.data_origin;
      await route.fulfill({ json: { objectIdFieldName: 'objectid', geometryType: 'esriGeometryPoint', spatialReference: { wkid: 4326 },
        count: matching.length, features, exceededTransferLimit: offset + limit < matching.length } });
    }
  });
  return control;
}

for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
  test(`linked analysis ${theme} ${width}px: chart, table, export and catalog`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.addInitScript((value) => localStorage.setItem('honua-theme', value), theme);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const control = await mockServer(page);
    await page.goto(`${site.url}analysis.html${parameters}`);
    await expect(page.locator('#connection-status')).toContainText('311 service requests connected');
    await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
    await expect(page.locator('#map')).toHaveAttribute('aria-label', 'Map showing 3 matching county records in current view.');
    await expect(page.locator('#feature-table').getByRole('grid')).toBeVisible();
    await page.locator('#chart-filters').getByRole('button', { name: 'exercise_open · 2', exact: true }).click();
    await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
    await expect(page.locator('#chart-filters').getByRole('button', { name: 'exercise_closed · 1', exact: true })).toBeVisible();
    const row = page.locator('#feature-table').locator('tbody tr[data-row-key]').first();
    await row.getByRole('gridcell').first().click();
    await expect(page.locator('#selection-status')).toContainText('1 selected');
    await row.getByRole('gridcell').first().press('ArrowDown');
    await page.locator('#feature-table').locator('tbody tr[data-row-key]').nth(1).getByRole('gridcell').first().press('Enter');
    await expect(page.locator('#feature-table').locator('tbody tr[data-row-key]').nth(1)).toHaveAttribute('aria-selected', 'true');
    const downloaded = [];
    for (const format of ['csv', 'geojson']) {
      const pending = page.waitForEvent('download');
      await page.locator(`#export-${format}`).click();
      const download = await pending;
      downloaded.push(await readFile(await download.path(), 'utf8'));
    }
    expect(downloaded[0]).toContain('DEMO-1');
    expect(downloaded[0]).toContain('DEMO-2');
    expect(downloaded[0]).not.toContain('DEMO-3');
    expect(downloaded[0]).toContain('DEMO DATA');
    expect(JSON.parse(downloaded[1]).features.every((f) => f.properties.data_origin === 'synthetic_demo'
      && f.properties.display_label.includes('DEMO DATA'))).toBe(true);
    expect(JSON.parse(downloaded[1]).features.map((f) => f.id)).toEqual([1, 2]);
    await page.locator('#catalog').selectOption('parcels');
    await expect(page.locator('#connection-status')).toContainText('Parcels connected');
    await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
    await expect(page.locator('#chart-status')).toContainText('not applicable');
    await expect(page.locator('#filter-summary')).toHaveText('No filters applied.');
    expect(control.queries.some((query) => query.outStatistics && !query.where?.includes('exercise_open'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.locator('#share').click();
    await expect(page.locator('#share-url')).toHaveValue(/#.*catalog=parcels/u);
    await expect(page.locator('#map')).toHaveAttribute('aria-label', 'Map showing 3 matching county records in current view.');
    await page.screenshot({ path: `artifacts/linked-analysis-${theme}-${width}.png`, fullPage: true });
  });
}

test('failed queries disable exports and clear-filter recovery fetches a fresh result', async ({ page }) => {
  const control = await mockServer(page);
  await page.goto(`${site.url}analysis.html${parameters}`);
  await expect(page.locator('#connection-status')).toContainText('connected');
  control.fail = true;
  await page.locator('#clear').click();
  await expect(page.locator('#connection-status')).toContainText('Could not finish');
  await expect(page.locator('#export-csv')).toBeDisabled();
  await expect(page.locator('#map-status')).toContainText('No completed');
  control.fail = false;
  await page.locator('#clear').click();
  await expect(page.locator('#connection-status')).toContainText('311 service requests connected');
  await expect(page.locator('#export-csv')).toBeEnabled();
});

test('share link reloads the catalog and owned filters before querying', async ({ page }) => {
  await mockServer(page);
  await page.goto(`${site.url}analysis.html${parameters}&token=discard-me`);
  await expect(page.locator('#connection-status')).toContainText('connected');
  await page.locator('#field').selectOption('category');
  await page.locator('#value').fill('drainage');
  await page.locator('#apply').click();
  await expect(page.locator('#share')).toBeEnabled();
  await page.locator('#chart-filters').getByRole('button', { name: 'exercise_open · 2' }).click();
  await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
  await page.locator('#share').click();
  const link = await page.locator('#share-url').inputValue();
  expect(link).not.toContain('discard-me');
  await page.goto(link);
  await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
  await expect(page.locator('#catalog')).toHaveValue('requests');
  await expect(page.locator('#field')).toHaveValue('category');
  await expect(page.locator('#value')).toHaveValue('drainage');
  await expect(page.locator('#filter-summary')).toContainText('status = exercise_open');
  await expect(page.locator('#chart-filters').getByRole('button', { name: 'exercise_open · 2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#chart-filters').getByRole('button', { name: 'exercise_closed · 1' })).toBeVisible();
});

test('unsupported share state stops before any county data request', async ({ page }) => {
  const control = await mockServer(page);
  await page.goto(`${site.url}analysis.html${parameters}#wb=1&catalog=requests&where=1%3D1`);
  await expect(page.locator('#connection-status')).toContainText('unsupported analysis state');
  await expect(page.locator('#share')).toBeDisabled();
  expect(control.queries).toEqual([]);
});

test('a fresh anonymous iframe restores selected records and the camera at narrow width', async ({ page }) => {
  await mockServer(page);
  await page.goto(`${site.url}analysis.html${parameters}`);
  await expect(page.locator('#share')).toBeEnabled();
  await page.locator('#feature-table').locator('tbody tr[data-row-key]').nth(1).getByRole('gridcell').first().click();
  await expect(page.locator('#selection-status')).toContainText('1 selected');
  const camera = [-156.431, 20.861, 14, 17, 25];
  await page.locator('#measurement').evaluate((node, value) => node.map.jumpTo({
    center: value.slice(0, 2), zoom: value[2], bearing: value[3], pitch: value[4],
  }), camera);
  await page.locator('#share').click();
  const link = await page.locator('#share-url').inputValue();
  const anonymous = await page.context().browser().newContext({ viewport: { width: 390, height: 900 } });
  try {
    const host = await anonymous.newPage();
    await mockServer(host);
    await host.goto(site.url);
    await host.evaluate((url) => {
      document.body.replaceChildren();
      document.body.style.margin = '0';
      const frame = document.createElement('iframe');
      frame.title = 'County analysis'; frame.src = url;
      frame.style.cssText = 'display:block;width:100%;height:800px;border:0';
      document.body.append(frame);
    }, link);
    const frame = host.frameLocator('iframe');
    await expect(frame.locator('#share')).toBeEnabled();
    await expect(frame.locator('#selection-status')).toContainText('1 selected');
    await expect(frame.locator('#feature-table').locator('tbody tr[data-row-key]').nth(1)).toHaveAttribute('aria-selected', 'true');
    const restored = await frame.locator('#measurement').evaluate((node) => {
      const map = node.map; const center = map.getCenter();
      return [center.lng, center.lat, map.getZoom(), map.getBearing(), map.getPitch()];
    });
    restored.forEach((value, index) => expect(value).toBeCloseTo(camera[index], 5));
    expect(await frame.locator('html').evaluate((node) => node.scrollWidth <= innerWidth)).toBe(true);
    await frame.locator('#clear').click();
    await expect(frame.locator('#map-status')).toHaveText('3 matching records mapped.');
    await host.screenshot({ path: 'artifacts/linked-analysis-share-iframe-390.png', fullPage: true });
  } finally { await anonymous.close(); }
});

test('an invalid shared camera stops before querying county records', async ({ page }) => {
  const control = await mockServer(page);
  const view = encodeURIComponent(JSON.stringify({ camera: [-156, 90, 10, 0, 0] }));
  await page.goto(`${site.url}analysis.html${parameters}#wb=1&catalog=requests&view=${view}`);
  await expect(page.locator('#connection-status')).toContainText('unsupported analysis state');
  await expect(page.locator('#export-csv')).toBeDisabled();
  expect(control.queries).toEqual([]);
});


test('fragment navigation restores filters and skip navigation preserves the share URL', async ({ page }) => {
  await mockServer(page);
  await page.goto(`${site.url}analysis.html${parameters}`);
  await expect(page.locator('#share')).toBeEnabled();
  await page.locator('#chart-filters').getByRole('button', { name: 'exercise_open · 2' }).click();
  await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
  await page.locator('#share').click();
  const openLink = await page.locator('#share-url').inputValue();
  await page.locator('#chart-filters').getByRole('button', { name: 'exercise_closed · 1' }).click();
  await expect(page.locator('#map-status')).toHaveText('1 matching records mapped.');
  await page.locator('#share').click();
  const closedLink = await page.locator('#share-url').inputValue();
  await page.goto(openLink);
  await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
  await page.goto(closedLink);
  await expect(page.locator('#map-status')).toHaveText('1 matching records mapped.');
  await page.locator('.skip').focus();
  await page.locator('.skip').press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  expect(page.url()).toBe(closedLink);
  await page.reload();
  await expect(page.locator('#map-status')).toHaveText('1 matching records mapped.');
  await page.goto(`${closedLink.split('#')[0]}#main`);
  await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
});

for (const width of [1440, 390]) {
  test(`measurement draws without selecting county records at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await mockServer(page);
    await page.goto(`${site.url}analysis.html${parameters}`);
    await expect(page.locator('#map')).toHaveAttribute('aria-label', 'Map showing 3 matching county records in current view.');
    const widget = page.locator('#measurement');
    const canvas = page.locator('#map canvas');
    const positions = [[-156.435, 20.86], [-156.434, 20.86], [-156.434, 20.861]];
    const clickVertex = async (coordinate) => {
      const point = await widget.evaluate((node, location) => {
        const projected = node.map.project(location);
        return { x: projected.x, y: projected.y };
      }, coordinate);
      await canvas.click({ position: point });
    };
    await widget.getByRole('button', { name: 'Distance', exact: true }).click();
    await clickVertex(positions[0]);
    await clickVertex(positions[1]);
    await widget.getByRole('button', { name: 'Finish', exact: true }).click();
    await expect(widget.getByRole('status')).toContainText('(finished)');
    const distance = await widget.evaluate((node) => node.result.distance);
    // A 0.001° longitude segment at 20.86°N is approximately 104 metres.
    expect(distance).toBeGreaterThan(103);
    expect(distance).toBeLessThan(105);
    await expect(page.locator('#selection-status')).toContainText('0 selected');
    await widget.getByRole('button', { name: 'Area', exact: true }).click();
    await expect(widget.getByRole('button', { name: 'Distance', exact: true })).toHaveAttribute('aria-pressed', 'false');
    for (const coordinate of positions) await clickVertex(coordinate);
    await widget.getByRole('button', { name: 'Finish', exact: true }).click();
    const area = await widget.evaluate((node) => node.result.area);
    // The right triangle is approximately half of a 104 × 111 metre rectangle.
    expect(area).toBeGreaterThan(5700);
    expect(area).toBeLessThan(5850);
    await expect(widget.getByRole('status')).toContainText('(finished)');
    await widget.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await widget.evaluate((node) => node.vertices.length)).toBe(0);
    await clickVertex(positions[0]);
    await page.keyboard.press('Escape');
    expect(await widget.evaluate((node) => node.result)).toBeUndefined();
    await widget.getByRole('button', { name: 'Off', exact: true }).click();
    await clickVertex(positions[0]);
    await expect(page.locator('#selection-status')).toContainText('1 selected');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('date and area filters share one map/table/chart/export query and survive sharing', async ({ page }) => {
  const control = await mockServer(page);
  await page.goto(`${site.url}analysis.html${parameters}`);
  await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
  await page.locator('#date-start').fill('2026-11-01');
  await page.locator('#date-end').fill('2026-11-02');
  await page.locator('#apply-dates').click();
  await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
  for (const [id, value] of Object.entries({ west: '-156.432', south: '20.85', east: '-156.428', north: '20.87' })) {
    await page.locator(`#${id}`).fill(value);
  }
  await page.locator('#apply-bounds').click();
  await expect(page.locator('#map-status')).toHaveText('1 matching records mapped.');
  await expect(page.locator('#feature-table').locator('tbody tr[data-row-key]')).toHaveCount(1);
  await expect(page.locator('#feature-table')).toContainText('DEMO-2');
  await expect(page.locator('#chart-filters')).toContainText('exercise_open · 1');
  await expect(page.locator('#cql2-preview')).toContainText('S_INTERSECTS');
  await expect(page.locator('#cql2-preview')).toContainText("opened_at < '2026-11-03'");
  const pending = page.waitForEvent('download');
  await page.locator('#export-geojson').click();
  const download = await pending;
  expect(JSON.parse(await readFile(await download.path(), 'utf8')).features.map((feature) => feature.id)).toEqual([2]);
  const spatialQueries = control.queries.filter((query) => query.geometry);
  expect(spatialQueries.some((query) => query.outStatistics)).toBe(true);
  expect(spatialQueries.every((query) => query.where.includes("opened_at < '2026-11-03'"))).toBe(true);
  expect(spatialQueries.every((query) => Number(query.inSR ?? JSON.parse(query.geometry).spatialReference?.wkid) === 4326)).toBe(true);
  await page.locator('#share').click();
  const link = await page.locator('#share-url').inputValue();
  await page.goto(link);
  await expect(page.locator('#map-status')).toHaveText('1 matching records mapped.');
  await expect(page.locator('#date-end')).toHaveValue('2026-11-02');
  await expect(page.locator('#west')).toHaveValue('-156.432');
  await page.locator('#remove-bounds').click();
  await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
  await page.locator('#clear').click();
  await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
  await expect(page.locator('#date-start')).toHaveValue('');
  await expect(page.locator('#cql2-preview')).toHaveText('TRUE');
  await page.locator('#catalog').selectOption('parcels');
  await expect(page.locator('#date-form')).toBeHidden();
});


test('an unsupported CQL2 preview refreshes results and invalidates a cached export', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const control = await mockServer(page);
  await page.goto(`${site.url}analysis.html${parameters}`);
  await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
  let pending = page.waitForEvent('download');
  await page.locator('#export-geojson').click();
  let download = await pending;
  expect(JSON.parse(await readFile(await download.path(), 'utf8')).features).toHaveLength(3);
  await page.locator('#field').selectOption('record_id');
  const value = 'x'.repeat(4097);
  await page.locator('#value').fill(value);
  await page.locator('#apply').click();
  await expect(page.locator('#cql2-preview')).toContainText('CQL2 preview unavailable');
  await expect(page.locator('#map-status')).toHaveText('0 matching records mapped.');
  expect(control.queries.some((query) => query.where?.includes(value))).toBe(true);
  pending = page.waitForEvent('download');
  await page.locator('#export-geojson').click();
  download = await pending;
  expect(JSON.parse(await readFile(await download.path(), 'utf8')).features).toHaveLength(0);
  await page.locator('#clear').click();
  await expect(page.locator('#cql2-preview')).toHaveText('TRUE');
  await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
  expect(errors).toEqual([]);
});


test('a delayed refresh cannot reattach a table after provenance failure', async ({ page }) => {
  const control = await mockServer(page);
  await page.goto(`${site.url}analysis.html${parameters}`);
  await expect(page.locator('#connection-status')).toContainText('311 service requests connected');
  // Keep a map refresh pending while a subsequent table request fails validation.
  control.holdMap = true;
  await page.locator('#clear').click();
  await expect.poll(() => control.held).toBe(true);
  await expect.poll(() => page.evaluate(() => document.getElementById('feature-table').table?.snapshot.state)).toBe('ready');
  control.corruptTable = true;
  await page.evaluate(async () => {
    await document.getElementById('feature-table').table.setColumnVisibility('district', false);
  });
  await expect(page.locator('#connection-status')).toContainText('Could not finish the query');
  control.releaseMap();
  await expect(page.locator('#map-status')).toHaveText('No completed map result. Retry before using these records.');
  await expect(page.locator('#export-csv')).toBeDisabled();
  await expect(page.locator('#share')).toBeDisabled();
  expect(await page.evaluate(() => document.getElementById('feature-table').table)).toBeUndefined();
});
