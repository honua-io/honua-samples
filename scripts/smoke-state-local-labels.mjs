#!/usr/bin/env node
// Strip-label check alone, against the built site or a published one: --base https://samples.honua.io
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';
import { verifyStripLabels } from './lib/verify-strip-labels.mjs';

const baseArg = process.argv.indexOf('--base');
const server = baseArg > 0 ? null : await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  await verifyStripLabels(await browser.newContext(), baseArg > 0 ? process.argv[baseArg + 1].replace(/\/+$/, '') : server.url);
} finally {
  await browser.close();
  await server?.close();
}
