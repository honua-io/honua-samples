import { drawPolygon } from './sketch.mjs';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { prepareDepthBrowser } from './depth-fixture.mjs';
import { mockServer, parameters } from './analysis-fixture.mjs';

const ring = [[-156.437, 20.858], [-156.422, 20.858], [-156.437, 20.864], [-156.437, 20.858]];
const isDrawnPolygon = (query) => query.geometryType === 'esriGeometryPolygon' && JSON.parse(query.geometry).rings[0].length === 4;
const areaFeatures = (page) => page.locator('#measurement').evaluate(async (node) => (await node.map.getSource('area').getData()).features);
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

let site;
test.beforeAll(async () => { site = await prepareDepthBrowser(); });
test.afterAll(async () => { await site?.close(); });

async function openWorkbench(page, theme, width) {
  await page.setViewportSize({ width, height: 1100 });
  await page.addInitScript((value) => localStorage.setItem('honua-theme', value), theme);
  const control = await mockServer(page);
  await page.goto(`${site.url}analysis.html${parameters}`);
  await expect(page.locator('#connection-status')).toContainText('311 service requests connected');
  await page.locator('#measurement').evaluate((node) => node.map.jumpTo({ center: [-156.43, 20.86], zoom: 13 }));
  return control;
}

async function drawAndExpectFilter(page, control) {
  control.queries.length = 0;
  await drawPolygon(page, ring);
  await expect(page.locator('#filter-summary')).toHaveText('Intersects drawn polygon (3 vertices)');
  await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
  await expect(page.locator('#feature-table').locator('tbody tr[data-row-key]')).toHaveCount(2);
  await expect(page.locator('#chart-filters').getByRole('button', { name: 'exercise_open · 2', exact: true })).toBeVisible();
  await expect(page.locator('#chart-filters button')).toHaveCount(1);
  await expect(page.locator('#cql2-preview')).toContainText('POLYGON');
  await expect(page.locator('#sketch').getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'true');
}

async function explainSelection(page) {
  await page.locator('#feature-table').locator('tbody tr[data-row-key]').first().getByRole('gridcell').first().click();
  await page.locator('#explain-selection').click();
  const explanation = page.locator('#selection-explanation');
  for (const text of ['1 selected from 311 service requests.', 'status — exercise_open: 1', 'Filter (CQL2):', 'POLYGON', 'Read-only SDK tool: summarizeSelection']) {
    await expect(explanation).toContainText(text);
  }
}

async function explainCapabilityGap(page, control) {
  await page.getByText('Check a source capability', { exact: true }).click();
  await page.locator('#capability').selectOption('spatialAggregate');
  const queryCount = control.queries.length;
  await page.locator('#check-capability').click();
  const explanation = page.locator('#capability-explanation');
  for (const text of ['spatialAggregate" is not advertised', 'Read-only SDK tool: explainCapabilityGap', 'No operation was executed.']) {
    await expect(explanation).toContainText(text);
  }
  expect(control.queries.length).toBe(queryCount);
}

async function exportAndCheckQueries(page, control) {
  const downloadPending = page.waitForEvent('download');
  await page.locator('#export-geojson').click();
  const download = await downloadPending;
  expect(JSON.parse(await readFile(await download.path(), 'utf8')).features.map((feature) => feature.id)).toEqual([1, 2]);
  const grouped = control.queries.filter((query) => query.outStatistics);
  expect(grouped.length).toBeGreaterThan(0);
  expect(grouped.every(isDrawnPolygon)).toBe(true);
  const queries = control.queries.filter((query) => query.geometry);
  expect(queries.length).toBeGreaterThanOrEqual(4);
  expect(queries.every(isDrawnPolygon)).toBe(true);
}

async function restoreSharedPolygon(page) {
  await page.locator('#share').click();
  await page.goto(await page.locator('#share-url').inputValue());
  await expect(page.locator('#filter-summary')).toHaveText('Intersects drawn polygon (3 vertices)');
  await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
  expect((await areaFeatures(page))[0].geometry.type).toBe('Polygon');
  await page.locator('#remove-bounds').click();
  await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
  expect(await areaFeatures(page)).toEqual([]);
}

async function switchToolsAndCatalog(page) {
  await page.locator('#sketch').getByRole('button', { name: 'Polygon', exact: true }).click();
  await page.locator('#measurement').getByRole('button', { name: 'Distance', exact: true }).click();
  await expect(page.locator('#sketch').getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#measurement').getByRole('button', { name: 'Off', exact: true }).click();
  await page.locator('#catalog').selectOption('parcels');
  await expect(page.locator('#connection-status')).toContainText('Parcels connected');
  await expect(page.locator('#filter-summary')).toHaveText('No filters applied.');
  await expect(page.locator('#selection-explanation')).toBeEmpty();
  await expect(page.locator('#capability-explanation')).toBeEmpty();
}

for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
  test(`Polygon shape filters map, chart, table, export and shared state ${theme} ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const control = await openWorkbench(page, theme, width);
    await drawAndExpectFilter(page, control);
    await explainSelection(page);
    await explainCapabilityGap(page, control);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `artifacts/analysis-polygon-${theme}-${width}.png`, fullPage: true });
    await exportAndCheckQueries(page, control);
    await restoreSharedPolygon(page);
    await switchToolsAndCatalog(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });
}
