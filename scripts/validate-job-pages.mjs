#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(modulePath), "..");
const surfaces = ["http", "cli", "javascript", "python", "dotnet"];
const languageSurfaces = ["javascript", "python", "dotnet"];

export async function loadJobPages({ root = defaultRoot } = {}) {
  const jobsDir = path.join(root, "jobs");
  const failures = [];
  const jobs = [];
  const check = (condition, file, message) => {
    if (!condition) failures.push(`${file}: ${message}`);
  };

  const schema = JSON.parse(await readFile(path.join(root, "schemas", "job-page.v1.schema.json"), "utf8"));
  check(schema.$id === "https://honua.io/schemas/job-page.v1.schema.json", "job-page.v1.schema.json", "unexpected or missing $id");

  for (const name of (await readdir(jobsDir)).filter((entry) => entry.endsWith(".json")).sort()) {
    const file = path.join(jobsDir, name);
    let job;
    try {
      job = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      failures.push(`${name}: invalid JSON (${error.message})`);
      continue;
    }
    jobs.push(job);

    check(job.schemaVersion === "honua.job-page/v1", name, "schemaVersion must be honua.job-page/v1");
    check(job.id === name.slice(0, -5), name, "id must match the file name");
    check(["example", "walkthrough", "project"].includes(job.kind), name, "kind must be example, walkthrough, or project");
    check(Array.isArray(job.server?.capabilityIds) && job.server.capabilityIds.length > 0, name, "server capabilityIds are required");
    check(Array.isArray(job.server?.protocols) && job.server.protocols.length > 0, name, "at least one raw protocol contract is required");
    check(typeof job.semantics?.assertion === "string" && job.semantics.assertion.length > 0, name, "semantic assertion is required");

    const refs = new Map((job.references ?? []).map((ref) => [ref.surface, ref]));
    check(refs.size === surfaces.length && surfaces.every((surface) => refs.has(surface)), name, "reference matrix must contain exactly http, cli, javascript, python, and dotnet");
    check(refs.size === (job.references ?? []).length, name, "reference matrix surfaces must be unique");
    for (const surface of surfaces) {
      const ref = refs.get(surface);
      if (!ref) continue;
      for (const key of ["label", "supportTier", "owner", "auth", "cancellation", "errors"]) {
        check(typeof ref[key] === "string" && ref[key].length > 0, name, `${surface} reference requires ${key}`);
      }
      if (ref.availability === "gap") {
        check(ref.symbolOrCommand === null && ref.deepLink === null && typeof ref.gap === "string" && ref.gap.length > 0, name, `${surface} gap must not invent a symbol/link and must explain the gap`);
      } else {
        check(typeof ref.symbolOrCommand === "string" && ref.symbolOrCommand.length > 0, name, `${surface} available reference requires an exact symbol or command`);
        check(typeof ref.deepLink === "string" && /^https:\/\//u.test(ref.deepLink), name, `${surface} available reference requires an HTTPS deep link`);
        check(ref.gap === null, name, `${surface} available reference must have gap=null`);
      }
    }

    const tabs = new Map((job.codeTabs ?? []).map((tab) => [tab.surface, tab]));
    check(tabs.size === (job.codeTabs ?? []).length, name, "code tab surfaces must be unique");
    for (const tab of job.codeTabs ?? []) {
      const ref = refs.get(tab.referenceSurface);
      check(ref?.availability !== "gap", name, `${tab.surface} code tab cannot target an unavailable reference`);
      check(tab.surface === tab.referenceSurface, name, `${tab.surface} code tab must deep-link its own reference row`);
      check(typeof tab.code === "string" && tab.code.trim().length > 0, name, `${tab.surface} code tab requires real code`);
    }
    for (const surface of languageSurfaces) {
      const ref = refs.get(surface);
      check(ref?.availability === "gap" || tabs.has(surface), name, `${surface} available reference requires a matching code tab`);
    }
    if (job.kind === "project") {
      check((job.codeTabs ?? []).length === 0, name, "project pages must remain architecture/source-first rather than presenting a primary code file");
    }

    for (const protocol of job.server.protocols ?? []) {
      check(typeof protocol.method === "string" && protocol.method.length > 0, name, `${protocol.id} requires an HTTP method`);
      check(protocol.concreteEndpoint === null || /^https?:\/\//u.test(protocol.concreteEndpoint), name, `${protocol.id} concrete endpoint must be null or HTTP(S)`);
      check(protocol.request && typeof protocol.request === "object", name, `${protocol.id} requires a raw request object`);
      check(protocol.response && typeof protocol.response === "object", name, `${protocol.id} requires a raw response object`);
    }

    const orders = (job.walkthrough ?? []).map((step) => step.order);
    check(orders.every((order, index) => order === index + 1), name, "walkthrough steps must be ordered contiguously from 1");

    const visual = job.console?.visual;
    if (visual?.state === "captured") {
      for (const key of ["path", "alt", "viewport", "redaction", "sourceCommit", "serverVersion", "fixtureKey", "goldenReceipt"]) {
        check(typeof visual[key] === "string" && visual[key].length > 0, name, `captured console visual requires ${key}`);
      }
    } else {
      check(visual?.path === null, name, "planned/not-applicable console visual must not name a fabricated screenshot");
    }

    if (job.ai?.state === "available" || job.ai?.state === "experimental") {
      check(typeof job.ai.api === "string" && job.ai.api.length > 0, name, "available AI panel requires an exact API");
    }
    check((job.ai?.prohibitedActions ?? []).includes("execute without required human approval"), name, "AI panel must prohibit execution without required human approval");
  }

  if (failures.length) throw new Error(`job-page validation failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  return jobs.sort((a, b) => a.id.localeCompare(b.id));
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const jobs = await loadJobPages();
    console.log(`job-page validation passed (${jobs.length} contracts)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
