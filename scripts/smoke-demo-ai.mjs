#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { evaluateCapitalProjects } from './lib/capital-project-eval.mjs';
import { verifyRequestLoop } from './lib/verify-request-loop.mjs';
import { startStaticServer } from './lib/browser-lane.mjs';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const evidence = fileURLToPath(new URL('../artifacts/demo-ai-evals/', import.meta.url));
const results = [];
const number = (text) => Number(text.replaceAll(',', '').match(/\d+/)?.[0]);
const count = async (page, selector) => number(await page.locator(selector).textContent());

async function visit(page, route) {
  const response = await page.goto(`${server.url}/state-local/${route}`);
  assert.equal(response.status(), 200, route);
}

async function overview(page) {
  await visit(page, '');
  await expect(page.locator('.hero-card[aria-label="Agent example"]')).toContainText(/Demo answer.*illustrative/);
  await expect(page.locator('.hero-card[aria-label="Agent example"]')).toContainText('synthetic records');
  return { mode: 'labelled example, no query-result count' };
}

async function parcelQuestions(page) {
  const questions = page.locator('#parcelQuestions');
  await expect(questions).toContainText('Demo answers · scripted snapshot');
  await expect(questions.getByRole('link')).toHaveAttribute('href', '/state-local/data/approved/manifest.json');
  const buttons = questions.getByRole('button');
  await expect(buttons).toHaveCount(3);
  const title = await page.locator('#pTitle, #tmk').textContent();
  const id = title.replace(/[^0-9]/g, '');
  const land = await page.locator('#fLand').textContent();
  const building = await page.locator('#fBldg').textContent();
  await buttons.nth(0).focus();
  await page.keyboard.press('Enter');
  await expect(questions.getByRole('status')).toContainText(`TMK ${id}`);
  await expect(questions.getByRole('status')).toContainText(land);
  await expect(questions.getByRole('status')).toContainText(building);
  await buttons.nth(1).click();
  const area = (await page.locator('#fArea, #ovArea').textContent()).replace(' (GIS)', '');
  await expect(questions.getByRole('status')).toContainText(area);
  await buttons.nth(2).click();
  const flood = await page.evaluate(() => {
    const id = document.querySelector('#pTitle, #tmk').textContent.replace(/[^0-9]/g, '');
    return HM.get('parcels').features.find((f) => String(f.properties.t9) === id).properties.fld;
  });
  await expect(questions.getByRole('status')).toContainText(`flood zone ${flood}`);
  await expect(questions.getByRole('status')).toContainText('County floodplain administrator');
}

async function property(page, route) {
  await visit(page, route);
  await parcelQuestions(page);
  await expect(page.locator('#askAnswer')).toBeVisible();
  await expect(page.locator('#askAnswer')).toContainText('scripted example');
  const claims = [
    ['State land use: Urban', 'Urban'], ['B-2 Community business', 'B-2 Business - Community'],
    ['community plan source is pending', 'Source pending'], ['Special Management Area', 'Inside the SMA'],
    ['Flood zone AE', 'Zone AE'], ['Tsunami evacuation zone', 'Evacuation zone'],
    ['3.2 ft sea-level-rise', 'Sea-level rise, 3.2 ft'],
  ];
  for (const [answer, layer] of claims) {
    await expect(page.locator('#askAnswer')).toContainText(answer);
    await expect(page.locator('#luStack')).toContainText(layer);
  }
  const other = await page.evaluate(() => HM.get("parcels").features.find((f) => String(f.properties.t9) !== '237004006')?.properties.t9);
  assert.ok(other, 'A second parcel is required to check answer invalidation');
  await page.getByRole('combobox').fill(String(other));
  await page.getByRole('combobox').press('Enter');
  await expect(page.locator('#parcelQuestions').getByRole('status')).toBeEmpty();
  await parcelQuestions(page);
  await expect(page.locator('#askAnswer')).toBeHidden();
  return { claims: claims.length, otherParcelAnswer: 'hidden' };
}

async function propertyMobile(page) {
  await visit(page, 'property/mobile/');
  await parcelQuestions(page);
  await expect(page.locator('#aiSteps li')).toHaveCount(8);
  await expect(page.locator('#ai')).toContainText('This example identifies layers');
  for (const text of ['Urban', 'B-2 Business - Community', 'source pending', 'AE', '3.2 ft']) {
    await expect(page.locator('#aiSteps')).toContainText(text);
    await expect(page.locator('#regs')).toContainText(text, { ignoreCase: true });
  }
  const other = await page.evaluate(() => HM.get('parcels').features.find((f) => String(f.properties.t9) !== '237004006').properties.t9);
  await page.getByRole('combobox').fill(String(other));
  await page.getByRole('combobox').press('Enter');
  await expect(page.locator('#parcelQuestions').getByRole('status')).toBeEmpty();
  await parcelQuestions(page);
  await expect(page.locator('#ai')).toBeHidden();
  await expect(page.locator('#aiUnavailable')).toBeVisible();
  return { claims: 5, otherParcelAnswer: 'hidden' };
}

async function emergencyMobile(page) {
  await visit(page, 'emergency/mobile.html');
  await expect(page.locator('#nearName')).not.toHaveText('');
  const names = await page.locator('#shelters .row-item > span:first-child').allTextContents();
  const expected = await page.evaluate(() => HD.shelters.features.filter((f) => HD.exerciseShelters[f.properties.name]?.st === 'open').length);
  assert.equal(names.length, expected, 'Mobile shelter list must match open exercise shelters');
  await expect(page.locator('#nearName')).toHaveText(names[0]);
  await expect(page.locator('#nearMeta')).toContainText('straight-line');
  await expect(page.locator('#resText')).toContainText('Exercise only');
  await expect(page.locator('.note')).toContainText('practice tsunami warning');
  return { openShelters: names.length, nearest: names[0], mode: 'labelled practice notice' };
}

async function checkBrief(page) {
  const actual = await count(page, '#brief .stat');
  await page.locator('#briefOpen').click();
  assert.equal(actual, await count(page, '#qSub'), '311 answer must equal its linked queue');
  const expected = await page.evaluate(() => {
    const type = document.querySelector('#fType').value, district = document.querySelector('#fDist').value;
    const deadline = new Date('2026-11-11T23:59');
    return HD.demo.requests.filter((r) => r.status !== 'Closed' && new Date(r.due) <= deadline &&
      (!type || r.type === type) && (!district || r.district == district)).length;
  });
  assert.equal(actual, expected, '311 answer must equal filtered records');
  return actual;
}

async function requests(page) {
  await visit(page, '311/');
  const counts = [await checkBrief(page)];
  const original = await page.locator('#brief .stat').textContent();
  await page.locator('#brief .stat').evaluate((el) => { el.textContent = '999999'; });
  await assert.rejects(() => checkBrief(page), /311 answer must equal its linked queue/);
  await page.locator('#brief .stat').evaluate((el, text) => { el.textContent = text; }, original);
  await page.locator('#fType').selectOption({ label: 'Drainage / flooding' });
  counts.push(await checkBrief(page));
  await page.locator('#fDist').selectOption('4');
  counts.push(await checkBrief(page));
  await page.locator('#fDist').selectOption('');
  await page.locator('#fType').selectOption('');
  await page.locator('#clr').click();
  await page.locator('#qBody tr').first().click();
  await expect(page.locator('#dBody .reply')).toContainText('Example reply · not sent');
  const id = await page.locator('#dKick').textContent();
  await expect(page.locator('#dBody .reply')).toContainText(id.split(' · ')[0]);
  const triage = page.locator('#dBody .ai-card');
  await expect(triage).toContainText('Example priority');
  const nearest = await page.locator('#dBody dt').filter({ hasText: /^Nearest asset$/ }).locator('+ dd').textContent();
  const assetId = await triage.locator('[data-asset]').textContent();
  assert.ok(nearest.includes(assetId.replace('assets/', '')), 'Triage asset agrees with request detail');
  await page.locator('#acc').click();
  await expect(triage).toContainText('Demo approval · no records changed');
  return { counts, negativeControl: 'mismatch rejected', reply: 'labelled unsent example' };
}

async function publicWorks(page) {
  await visit(page, 'public-works/');
  await expect(page.locator('#ap1 .flag')).toContainText('Demo answer');
  const anomaly = await page.evaluate(() => {
    const id = document.querySelector('#aTitle').textContent;
    const asset = HD.demo.assets.find((a) => a.id === id);
    const nearby = HD.demo.requests.filter((r) => r.type === 'Drainage / flooding' &&
      Math.hypot((r.c[0] - asset.c[0]) * 104000, (r.c[1] - asset.c[1]) * 111000) < 250 &&
      (new Date(HD.demo.now) - new Date(r.created)) / 864e5 < 90);
    return { id, condition: asset.cond, requests: nearby.length, ids: nearby.slice(0, 3).map((r) => r.id) };
  });
  assert.ok(anomaly.condition >= 4, 'Anomaly requires a good inspection rating');
  await expect(page.locator('#ap1 .flag')).toContainText(`${anomaly.requests} drainage requests within 250 m`);
  for (const id of anomaly.ids) await expect(page.locator('#ap1 .flag')).toContainText(id);
  const rows = await page.locator('#planTbl tbody tr').count();
  const hours = await page.locator('#planTbl tbody tr td:last-child .id').allTextContents();
  const totalHours = hours.reduce((sum, text) => sum + number(text), 0);
  assert.equal(await count(page, '#planCountTop'), rows);
  assert.equal(await count(page, '#planHrsTop'), totalHours);
  await expect(page.locator('#planSum')).toContainText(`${rows} inspections and cleanings · ${totalHours} crew-hours`);
  const conditions = await page.locator('#capTbl tbody tr td:nth-child(2) .chip').allTextContents();
  const poor = conditions.filter((text) => number(text) <= 2).length;
  await expect(page.locator('#capNote')).toContainText(`${poor} culverts are rated poor or failed; the next ${conditions.length - poor} are fair`);
  await page.locator('#approvePlan').click();
  await expect(page.locator('#plan .chip.ok')).toContainText(`${rows} draft work orders`);
  const capitalProjects = await evaluateCapitalProjects(page);
  return { rows, totalHours, capitalRows: conditions.length, poor, anomaly, capitalProjects };
}

async function emergency(page, route) {
  await visit(page, route);
  const capacities = await page.locator('#shelterList .pct').allInnerTexts();
  const totals = capacities.reduce((sum, text) => {
    const [occupied, capacity] = text.split('\n')[0].replaceAll(',', '').match(/\d+/g).map(Number);
    return [sum[0] + occupied, sum[1] + capacity];
  }, [0, 0]);
  const fmt = (n) => n.toLocaleString('en-US');
  const percentage = Math.round(totals[0] / totals[1] * 100);
  await expect(page.locator('#shSum')).toContainText(`${fmt(totals[0])} / ${fmt(totals[1])} · ${percentage}%`);
  await expect(page.locator('#sitrep')).toContainText(`${capacities.length} of ${await page.locator('#shelterList .shel').count()} open`);
  await expect(page.locator('#sitrep')).toContainText(`${fmt(totals[0])} of ${fmt(totals[1])} spaces used (${percentage}%)`);
  const closedRoads = (await page.locator('#roadList .chip').allTextContents()).filter((text) => text === 'Closed').length;
  await expect(page.locator('#sitrep')).toContainText(`${closedRoads} closed roads`);
  await expect(page.locator('#sitrep')).toContainText('fictional open requests');
  const facilityRows = page.locator('#exposure tbody tr');
  const evacuation = await facilityRows.filter({ hasText: 'Evacuation' }).count();
  await expect(page.locator('#exposure')).toContainText(`${evacuation} facilities are inside the evacuation zone`);
  const checked = await count(page, '#tcCount');
  await expect(page.locator('#exposure')).toContainText(`I checked ${checked} facilities`);
  for (const name of await facilityRows.locator('td:nth-child(2)').evaluateAll((cells) => cells.map((cell) => cell.firstChild.textContent))) {
    await expect(page.locator('#sitrep')).toContainText(name);
  }
  for (const name of ['Baldwin High', 'Maui High']) {
    const shelter = page.locator('#shelterList .shel').filter({ has: page.locator('.nm', { hasText: name }) });
    const [occupied, capacity] = (await shelter.locator('.pct').innerText()).split('\n')[0].match(/\d+/g).map(Number);
    await expect(page.locator('#balanceText')).toContainText(name === 'Baldwin High'
      ? `${Math.round(occupied / capacity * 100)}%` : `${fmt(capacity - occupied)} spaces free`);
  }
  await expect(page.locator('#map .rr').first()).toBeAttached();
  const resources = await page.locator('#map .rr').count();
  const critical = await page.locator('#map .rr.crit').count();
  await expect(page.locator('#sitrep')).toContainText(`${resources} fictional open requests, ${critical} critical`);
  await expect(page.locator('#noticeText')).toContainText('EXERCISE');
  return { openShelters: capacities.length, occupied: totals[0], capacity: totals[1], closedRoads };
}

async function workbenchCounts(page) {
  const shown = await count(page, '#nShown');
  assert.equal(await count(page, '#tCount'), shown);
  await expect(page.locator('#chips')).toContainText(`${shown.toLocaleString()} of`);
  await expect(page.locator('#nlqExp')).toContainText(`${shown.toLocaleString()} of`);
  await expect(page.locator('#plan .steps li').filter({ hasText: 'setFilter' })).toContainText(`${shown} features`);
  return shown;
}

async function workbench(page) {
  await visit(page, 'workbench/');
  await page.locator('#nlqIn').fill('Show parcels over 0.25 acres');
  await page.locator('#nlqForm').evaluate((form) => form.requestSubmit());
  await expect(page.locator('#nlqOut')).toBeVisible();
  if (await page.locator('#nlqExplainBtn').getAttribute('aria-pressed') !== 'true') await page.locator('#nlqExplainBtn').click();
  const filtered = await workbenchCounts(page);
  await page.locator('#chips [data-qr="0"]').click();
  const all = await workbenchCounts(page);
  assert.ok(all > filtered, 'Removing the acreage filter must change the displayed query');
  await page.locator('#nlqIn').fill('Launch an orbital satellite');
  await page.locator('#nlqForm').evaluate((form) => form.requestSubmit());
  await expect(page.locator('#nlqMiss')).toBeVisible();
  return { filtered, all, unsupported: 'no fabricated answer' };
}

await mkdir(evidence, { recursive: true });
const server = await startStaticServer({ rootDir: root, port: 0 });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Pacific/Honolulu' });
    const page = await context.newPage();
    const scenarios = [
      ['overview', overview], ['property', (p) => property(p, 'property/')],
      ['property-mobile', propertyMobile], ['311', requests],
      ['311-linked-loop', async (p) => { await visit(p, '311/'); return verifyRequestLoop(p); }],
      ['public-works', publicWorks], ['emergency', (p) => emergency(p, 'emergency/')],
      ['emergency-mobile', emergencyMobile], ['workbench', workbench],
    ];
    for (const [name, run] of scenarios) {
      try {
        results.push({ name, width, status: 'pass', figures: await run(page) });
      } catch (error) {
        results.push({ name, width, status: 'fail', error: error.message });
        await page.screenshot({ path: `${evidence}/${name}-${width}-failure.png`, fullPage: true });
        throw error;
      } finally {
        await writeFile(`${evidence}/results.json`, JSON.stringify(results, null, 2));
      }
    }
    await context.close();
  }
  console.log(`Demo AI checks passed: ${results.length} signed-out desktop/mobile scenarios.`);
} finally {
  await browser.close();
  await server.close();
}
