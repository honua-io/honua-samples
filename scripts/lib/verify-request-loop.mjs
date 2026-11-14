import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

async function submitReport(page) {
  const root = page.locator('#request-loop');
  await root.locator('summary').click();
  const seed = await page.evaluate(() => HD.demo.requests.find(row => row.status !== 'Closed'));
  await root.locator('[name="type"]').selectOption(seed.type);
  await root.locator('[name="addr"]').fill('Fictional resident corner <test>');
  await root.locator('[name="lat"]').fill(String(seed.c[1]));
  await root.locator('[name="lng"]').fill(String(seed.c[0]));
  await root.locator('[name="note"]').fill('Fictional browser report');
  await root.locator('[name="photo"]').setInputFiles({ name: 'demo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64') });
  await root.getByRole('button', { name: 'Submit fictional demo report' }).click();
  await expect(root.locator('[data-submit-message]')).toContainText('Created DEMO-');
  const id = await root.locator('[name="report-search"]').inputValue();
  const publicRow = root.locator('[data-request-view="public"] article');
  await expect(publicRow).toContainText('Fictional resident corner <test>');
  await expect(publicRow.locator('img')).toBeVisible();
  return { id, seed };
}

async function assignAndExport(page, report) {
  const root = page.locator('#request-loop');
  const { id, seed } = report;
  const publicRow = root.locator('[data-request-view="public"] article');
  await root.getByRole('button', { name: 'Demo staff board', exact: true }).click();
  let staffRow = root.locator('[data-request-view="staff"] article');
  await staffRow.getByRole('button', { name: 'Suggest triage · demo' }).click();
  await expect(staffRow).toContainText(`Possible duplicate: ${seed.id}`);
  await expect(staffRow).toContainText('Demo answer');
  await expect(staffRow).toContainText(`category: ${seed.type}`);
  await staffRow.getByRole('button', { name: 'Show possible duplicate' }).click();
  await expect(root.locator('[data-request-view="staff"] article')).toHaveAttribute('data-report-id', seed.id);
  await root.locator('[name="report-search"]').fill(id);
  staffRow = root.locator('[data-request-view="staff"] article');
  await staffRow.getByRole('combobox').selectOption('Assigned');
  await staffRow.getByRole('textbox').fill('Demo roads crew');
  await staffRow.getByRole('button', { name: 'Save demo update' }).click();
  await root.getByRole('button', { name: 'Public status', exact: true }).click();
  await expect(publicRow).toContainText('Assigned · Crew: Demo roads crew');
  const downloaded = page.waitForEvent('download');
  await root.locator('[data-export]').click();
  const stream = await (await downloaded).createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.ok(csv.includes(id)); assert.match(csv, /synthetic_demo/); assert.match(csv, /DEMO DATA/);
}

async function verifyReloadAndReset(page, id) {
  const root = page.locator('#request-loop');
  const publicRow = root.locator('[data-request-view="public"] article');
  await page.reload();
  await root.locator('summary').click();
  await root.locator('[name="report-search"]').fill(id);
  await root.getByRole('button', { name: 'Public status', exact: true }).click();
  await expect(publicRow).toContainText('Assigned · Crew: Demo roads crew');
  await root.locator('[data-reset]').click();
  await root.locator('[name="report-search"]').fill(id);
  await expect(publicRow).toHaveCount(0);
  await expect(root).toContainText('No demo reports match this search.');
  await root.locator('[name="report-search"]').fill('');
  await root.getByRole('button', { name: 'Resident report', exact: true }).click();
}

export async function verifyRequestLoop(page, { capture = async () => {} } = {}) {
  const report = await submitReport(page);
  await assignAndExport(page, report);
  await page.locator('[data-request-view="public"] article').scrollIntoViewIfNeeded();
  await capture();
  await verifyReloadAndReset(page, report.id);
  return { category: report.seed.type, duplicateId: report.seed.id, assignment: 'Assigned', photo: 'visible', reload: 'persisted', reset: 'cleared' };
}
