import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");
const AUDIT_FORMAT = "honua.release-capability-audit.v1";
const GAP_SOURCE_FORMAT = "honua.release-gap-triage.v1";
const GAP_REGISTER_FORMAT = "honua.release-gap-register.v1";
const CLIENT_LANES = ["javascript", "python", "dotnet", "cli"];
const DECISIONS = new Set(["pass", "conditional", "blocked"]);
const SEVERITY_ORDER = new Map([["P0", 0], ["P1", 1], ["P2", 2]]);
const P0_CLASSIFICATIONS = new Set([
  "false-or-unsupported-ga-claim",
  "security",
  "data-integrity",
  "broken-core-job",
  "absent-live-proof",
  "absent-rollback",
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function listJsonFiles(directory) {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(directory, name));
}

function dateMs(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalKeys(root) {
  const fixture = readJson(path.join(root, "schemas", "fixtures", "capability-keys.fixture.json"));
  const rows = Array.isArray(fixture) ? fixture : (fixture.capabilities ?? fixture.keys);
  return new Set((rows ?? []).map((row) => typeof row === "string" ? row : row.key));
}

export function loadCertification(root = DEFAULT_ROOT) {
  const auditDirectory = path.join(root, "audits", "capabilities");
  const audits = listJsonFiles(auditDirectory).map((file) => ({ file, value: readJson(file) }));
  const gaps = readJson(path.join(root, "audits", "release-gaps.v1.json"));
  return { audits, gaps };
}

function requireFields(value, fields, location, errors) {
  for (const field of fields) {
    if (!(field in value)) errors.push(`${location}: missing required field ${field}`);
  }
}

function duplicateValues(values) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

export function validateGapSource(source) {
  const errors = [];
  if (source.format !== GAP_SOURCE_FORMAT) errors.push(`release-gaps.v1.json: format must be ${GAP_SOURCE_FORMAT}`);
  if (source.schemaVersion !== "1.0.0") errors.push("release-gaps.v1.json: schemaVersion must be 1.0.0");
  if (!Array.isArray(source.gaps) || source.gaps.length === 0) errors.push("release-gaps.v1.json: gaps must be non-empty");
  const ids = (source.gaps ?? []).map((gap) => gap.id);
  for (const duplicate of duplicateValues(ids)) errors.push(`release-gaps.v1.json: duplicate gap id ${duplicate}`);

  for (const gap of source.gaps ?? []) {
    const location = `gap ${gap.id ?? "<missing>"}`;
    requireFields(gap, ["id", "severity", "classifications", "title", "userCompetitiveImpact", "risk", "currentWorkaround", "dependencyChain", "owner", "effort", "recommendedSequence", "exitEvidence"], location, errors);
    if (!SEVERITY_ORDER.has(gap.severity)) errors.push(`${location}: invalid severity ${gap.severity}`);
    if (!Array.isArray(gap.classifications) || gap.classifications.length === 0) errors.push(`${location}: classifications must be non-empty`);
    if (gap.classifications?.some((item) => P0_CLASSIFICATIONS.has(item)) && gap.severity !== "P0") {
      errors.push(`${location}: ${gap.classifications.join(", ")} requires P0 severity`);
    }
    const hasIssue = typeof gap.existingIssue === "string";
    const issueNeeded = gap.issueNeeded === true;
    if (hasIssue === issueNeeded) errors.push(`${location}: exactly one of existingIssue or issueNeeded:true is required`);
    if (!Number.isInteger(gap.recommendedSequence) || gap.recommendedSequence < 1) errors.push(`${location}: recommendedSequence must be a positive integer`);
    if (!Array.isArray(gap.exitEvidence) || gap.exitEvidence.length === 0) errors.push(`${location}: exitEvidence must be non-empty`);
  }
  return errors;
}

export function validateDossier(dossier, context) {
  const { asOf, gapMap, keySet, file = dossier.auditId ?? "<dossier>" } = context;
  const errors = [];
  const location = path.basename(file);
  requireFields(dossier, [
    "$schema", "format", "schemaVersion", "auditId", "auditSet", "title", "capabilityKey", "jobId",
    "claim", "targetTier", "owner", "protocol", "server", "clients", "demo", "experience", "evidence",
    "accessibility", "browserPlatform", "documentation", "compatibility", "operations", "blockers", "signoffs",
    "expiry", "decision",
  ], location, errors);
  if (dossier.format !== AUDIT_FORMAT) errors.push(`${location}: format must be ${AUDIT_FORMAT}`);
  if (dossier.schemaVersion !== "1.0.0") errors.push(`${location}: schemaVersion must be 1.0.0`);
  if (!DECISIONS.has(dossier.decision)) errors.push(`${location}: invalid decision ${dossier.decision}`);
  if (!keySet.has(dossier.capabilityKey)) errors.push(`${location}: unknown canonical capability key ${dossier.capabilityKey}`);
  if (dossier.capabilityKey === "raster.multidim-coverage" && dossier.targetTier === "ga") {
    errors.push(`${location}: Zarr/NetCDF/HDF5 multidimensional coverage is prohibited from targetTier ga`);
  }
  if (dossier.claim?.gaClaim === true && dossier.targetTier !== "ga") errors.push(`${location}: a GA claim requires targetTier ga`);
  if (!Array.isArray(dossier.claim?.scope) || !Array.isArray(dossier.claim?.exclusions)) errors.push(`${location}: claim scope and exclusions must be arrays`);

  for (const lane of CLIENT_LANES) {
    const client = dossier.clients?.[lane];
    if (!client) {
      errors.push(`${location}: clients.${lane} is required`);
      continue;
    }
    requireFields(client, ["status", "package", "symbols", "evidence", "exclusion"], `${location}: clients.${lane}`, errors);
    requireFields(client.package ?? {}, ["name", "declaredVersion", "publishedVersion", "sourceCommit"], `${location}: clients.${lane}.package`, errors);
    if (!Array.isArray(client.symbols)) errors.push(`${location}: clients.${lane}.symbols must be an array`);
    if (client.status === "absent" && client.exclusion === null) errors.push(`${location}: absent clients.${lane} requires an exclusion`);
  }

  const required = dossier.evidence?.required ?? [];
  const receipts = dossier.evidence?.receipts ?? [];
  const missing = dossier.evidence?.missing ?? [];
  for (const duplicate of duplicateValues(required)) errors.push(`${location}: duplicate required evidence kind ${duplicate}`);
  const receiptKinds = new Set(receipts.map((receipt) => receipt.kind));
  const missingKinds = new Set(missing.map((entry) => entry.kind));
  const staleKinds = new Set();
  for (const kind of required) {
    const count = Number(receiptKinds.has(kind)) + Number(missingKinds.has(kind));
    if (count !== 1) errors.push(`${location}: required evidence ${kind} must have exactly one receipt or missing record`);
  }
  for (const receipt of receipts) {
    requireFields(receipt, ["id", "kind", "source", "capturedAt", "expiresAt", "digest", "semanticAssertions"], `${location}: receipt ${receipt.id ?? "<missing>"}`, errors);
    if (!/^(git-blob-sha1|sha256)$/.test(receipt.digest?.algorithm ?? "")) errors.push(`${location}: receipt ${receipt.id} has unsupported digest algorithm`);
    if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(receipt.digest?.value ?? "")) errors.push(`${location}: receipt ${receipt.id} has invalid digest value`);
    if (!Array.isArray(receipt.semanticAssertions) || receipt.semanticAssertions.length === 0) errors.push(`${location}: receipt ${receipt.id} needs semantic assertions`);
    const expiry = dateMs(receipt.expiresAt);
    if (expiry === null) errors.push(`${location}: receipt ${receipt.id} has invalid expiresAt`);
    else if (expiry < asOf) staleKinds.add(receipt.kind);
  }
  for (const entry of missing) {
    if (!gapMap.has(entry.gapId)) errors.push(`${location}: missing evidence ${entry.kind} references unknown gap ${entry.gapId}`);
  }

  let hasP0 = false;
  for (const blocker of dossier.blockers ?? []) {
    const gap = gapMap.get(blocker.gapId);
    if (!gap) errors.push(`${location}: blocker references unknown gap ${blocker.gapId}`);
    else if (gap.severity === "P0") hasP0 = true;
    if (!Array.isArray(blocker.evidenceKinds) || blocker.evidenceKinds.length === 0) errors.push(`${location}: blocker ${blocker.gapId} needs evidenceKinds`);
  }

  const overallExpired = dateMs(dossier.expiry) === null || dateMs(dossier.expiry) < asOf;
  const signoffsPending = (dossier.signoffs ?? []).some((signoff) => signoff.status !== "approved");
  const evidenceIncomplete = missing.length > 0 || staleKinds.size > 0 || overallExpired;
  const computedDecision = hasP0 || (dossier.targetTier === "ga" && evidenceIncomplete)
    ? "blocked"
    : ((dossier.blockers?.length ?? 0) > 0 || evidenceIncomplete || signoffsPending ? "conditional" : "pass");
  if (dossier.decision !== computedDecision) errors.push(`${location}: decision ${dossier.decision} disagrees with computed ${computedDecision}`);
  if (dossier.claim?.gaClaim === true && (computedDecision !== "pass" || evidenceIncomplete || signoffsPending)) {
    errors.push(`${location}: GA claim lacks fresh complete evidence and approved signoffs`);
  }
  return { errors, computedDecision, staleKinds: [...staleKinds].sort() };
}

export function validateCertification({ audits, gaps }, { root = DEFAULT_ROOT, asOf = Date.now() } = {}) {
  const errors = validateGapSource(gaps);
  const gapMap = new Map((gaps.gaps ?? []).map((gap) => [gap.id, gap]));
  const keySet = canonicalKeys(root);
  const seenAuditIds = new Set();
  const seenJobIds = new Set();
  const results = [];
  for (const entry of audits) {
    const dossier = entry.value ?? entry;
    if (seenAuditIds.has(dossier.auditId)) errors.push(`duplicate auditId ${dossier.auditId}`);
    if (seenJobIds.has(dossier.jobId)) errors.push(`duplicate jobId ${dossier.jobId}`);
    seenAuditIds.add(dossier.auditId);
    seenJobIds.add(dossier.jobId);
    const result = validateDossier(dossier, { asOf, gapMap, keySet, file: entry.file });
    errors.push(...result.errors);
    results.push({ dossier, ...result });
  }
  for (const gap of gaps.gaps ?? []) {
    if (!results.some(({ dossier }) => dossier.blockers.some((blocker) => blocker.gapId === gap.id))) {
      errors.push(`gap ${gap.id}: not referenced by any audit failure`);
    }
  }
  return { errors, results, gapMap };
}

function supportCell(client) {
  const version = client.package.publishedVersion ?? client.package.declaredVersion ?? "none";
  return `${client.status} (${version ?? "none"})`;
}

export function buildGapRegister(audits, gapSource) {
  const gaps = gapSource.gaps.map((definition) => {
    const affected = [];
    const evidenceMissing = new Set();
    for (const entry of audits) {
      const dossier = entry.value ?? entry;
      for (const blocker of dossier.blockers.filter((item) => item.gapId === definition.id)) {
        affected.push({
          auditId: dossier.auditId,
          jobId: dossier.jobId,
          capabilityKey: dossier.capabilityKey,
          gaClaim: dossier.claim.gaClaim,
          targetTier: dossier.targetTier,
          claim: dossier.claim.summary,
        });
        blocker.evidenceKinds.forEach((kind) => evidenceMissing.add(kind));
      }
    }
    return {
      id: definition.id,
      severity: definition.severity,
      classifications: definition.classifications,
      title: definition.title,
      affected,
      userCompetitiveImpact: definition.userCompetitiveImpact,
      risk: definition.risk,
      evidenceMissing: [...evidenceMissing].sort(),
      currentWorkaround: definition.currentWorkaround,
      dependencyChain: definition.dependencyChain,
      owner: definition.owner,
      ...(definition.existingIssue ? { existingIssue: definition.existingIssue } : { issueNeeded: true }),
      effort: definition.effort,
      recommendedSequence: definition.recommendedSequence,
      exitEvidence: definition.exitEvidence,
    };
  }).sort((left, right) =>
    SEVERITY_ORDER.get(left.severity) - SEVERITY_ORDER.get(right.severity)
      || left.recommendedSequence - right.recommendedSequence
      || left.id.localeCompare(right.id));
  return {
    "$schema": "../schemas/release-gap-register.v1.schema.json",
    format: GAP_REGISTER_FORMAT,
    schemaVersion: "1.0.0",
    asOf: gapSource.asOf,
    generatedFrom: ["audits/capabilities/*.json", "audits/release-gaps.v1.json"],
    severityVocabulary: {
      P0: "Release blocker: unsupported GA claim, security/data-integrity risk, broken core job, or absent live proof/rollback.",
      P1: "High: cross-SDK/protocol/day-two/performance/documentation gap.",
      P2: "Planned: intentionally outside the current GA target.",
    },
    gaps,
  };
}

export function renderMatrix(audits, gapRegister) {
  const rows = audits.map((entry) => entry.value ?? entry).sort((a, b) => a.auditId.localeCompare(b.auditId));
  const lines = [
    "# Honua release certification matrix",
    "",
    `Generated deterministically from \`audits/capabilities/*.json\` and \`audits/release-gaps.v1.json\` as of ${gapRegister.asOf}. Do not edit this file by hand.`,
    "",
    "`Implemented`, `supported`, `covered`, and `stable` retain their producer-specific meanings. None is promoted to GA by this matrix. A GA claim requires a `pass` decision with fresh required evidence and approved signoffs.",
    "",
    "| Candidate | Canonical key | Target | Decision | JS | Python | .NET | CLI | Demo service | Evidence | P0/P1/P2 | Expires |",
    "|---|---|---|---|---|---|---|---|---|---:|---|---|",
  ];
  for (const dossier of rows) {
    const counts = { P0: 0, P1: 0, P2: 0 };
    for (const blocker of dossier.blockers) counts[gapRegister.gaps.find((gap) => gap.id === blocker.gapId).severity] += 1;
    lines.push(`| ${dossier.title} | \`${dossier.capabilityKey}\` | ${dossier.targetTier} | **${dossier.decision}** | ${supportCell(dossier.clients.javascript)} | ${supportCell(dossier.clients.python)} | ${supportCell(dossier.clients.dotnet)} | ${supportCell(dossier.clients.cli)} | ${dossier.demo.manifestServiceKey ?? "none"} | ${dossier.evidence.receipts.length}/${dossier.evidence.required.length} | ${counts.P0}/${counts.P1}/${counts.P2} | ${dossier.expiry.slice(0, 10)} |`);
  }
  lines.push("", "## Priority gaps", "");
  for (const gap of gapRegister.gaps) {
    lines.push(`${gap.recommendedSequence}. **${gap.severity} ${gap.id}: ${gap.title}.** ${gap.userCompetitiveImpact} Owner: \`${gap.owner.repository}\`. ${gap.existingIssue ? `[Existing issue](${gap.existingIssue})` : "Issue needed; no matching issue was found."}`);
  }
  lines.push("", "## Explicit non-GA boundary", "", "Zarr, NetCDF, and HDF5 remain in the `raster.multidim-coverage` preview dossier and are prohibited from `targetTier: ga` by the validator.", "");
  return lines.join("\n");
}

function generatedArtifacts(certification) {
  const register = buildGapRegister(certification.audits, certification.gaps);
  return new Map([
    ["generated/release-gap-register.v1.json", stableJson(register)],
    ["generated/release-certification-matrix.md", renderMatrix(certification.audits, register)],
  ]);
}

function parseAsOf(argv) {
  const index = argv.indexOf("--as-of");
  const value = index >= 0 ? argv[index + 1] : new Date().toISOString();
  const parsed = dateMs(value);
  if (parsed === null) throw new Error(`Invalid --as-of value: ${value}`);
  return parsed;
}

function printSummary(validation) {
  for (const result of validation.results) {
    console.log(`${result.dossier.auditId}: ${result.computedDecision} (${result.dossier.evidence.receipts.length}/${result.dossier.evidence.required.length} required receipts recorded)`);
  }
}

export function run(argv = process.argv.slice(2), root = DEFAULT_ROOT) {
  const command = argv[0] ?? "validate";
  const certification = loadCertification(root);
  const validation = validateCertification(certification, { root, asOf: parseAsOf(argv) });
  if (validation.errors.length > 0) {
    validation.errors.forEach((error) => console.error(`ERROR: ${error}`));
    return 1;
  }
  const artifacts = generatedArtifacts(certification);
  if (command === "generate") {
    for (const [relative, contents] of artifacts) {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
      console.log(`generated ${relative}`);
    }
  } else if (command === "check") {
    for (const [relative, expected] of artifacts) {
      const file = path.join(root, relative);
      const actual = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
      if (actual !== expected) {
        console.error(`ERROR: ${relative} is stale; run npm run release:audit:generate`);
        return 1;
      }
    }
  } else if (command !== "validate") {
    console.error(`ERROR: unknown command ${command}; expected validate, generate, or check`);
    return 1;
  }
  printSummary(validation);
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = run();
}
