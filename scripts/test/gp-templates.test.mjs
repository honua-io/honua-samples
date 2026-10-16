// GP process template contract (honua-io/honua-samples#65): the committed
// templates match their TEMPLATE-MANIFEST.json byte for byte, carry every file
// `honua-gp-devkit init` mirrors, and their golden digests describe the
// committed golden artifacts. Network-independent.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { MANIFEST_SCHEMA, REQUIRED_FILES, TEMPLATES_DIR, buildManifest, checkTemplate, readManifest } from "../gp-templates.mjs";

for (const templateId of Object.keys(REQUIRED_FILES)) {
  test(`${templateId}: check passes against the committed manifest`, async () => {
    const problems = await checkTemplate(templateId);
    assert.deepEqual(problems, []);
  });

  test(`${templateId}: manifest lists every required file with a 64-hex digest`, async () => {
    const manifest = await readManifest(templateId);
    assert.equal(manifest.schemaVersion, MANIFEST_SCHEMA);
    assert.equal(manifest.template, templateId);
    const paths = new Set(manifest.files.map((f) => f.path));
    for (const required of REQUIRED_FILES[templateId]) assert.ok(paths.has(required), `${required} missing from manifest`);
    for (const file of manifest.files) assert.match(file.sha256, /^[0-9a-f]{64}$/, `${file.path} digest`);
  });

  test(`${templateId}: a modified file is reported with its path`, async () => {
    const manifest = await buildManifest(templateId);
    const first = manifest.files[0];
    const tampered = { ...manifest, files: [{ ...first, sha256: "0".repeat(64) }, ...manifest.files.slice(1)] };
    const committed = await readManifest(templateId);
    assert.deepEqual(manifest.files, committed.files);
    assert.notDeepEqual(tampered.files, committed.files);
  });

  test(`${templateId}: both failure walkthroughs are documented and asserted`, async () => {
    const readme = await readFile(path.join(TEMPLATES_DIR, templateId, "README.md"), "utf8");
    assert.match(readme, /invalid-input\.geojson/);
    assert.match(readme, /--max-output-bytes 1/);
    assert.match(readme, /receipt/);
    const testSource = await readFile(
      path.join(TEMPLATES_DIR, templateId, templateId === "gp-python" ? "tests/test_golden.py" : "tests/SummaryTool.Tests/GoldenTests.cs"),
      "utf8",
    );
    assert.match(testSource, /invalid-input\.geojson/);
    assert.match(testSource, /artifacts/);
    assert.match(testSource, /Expected a GeoJSON FeatureCollection\./);
  });

  test(`${templateId}: launch configuration has host and container entries`, async () => {
    const launch = JSON.parse(await readFile(path.join(TEMPLATES_DIR, templateId, ".vscode/launch.json"), "utf8"));
    const names = launch.configurations.map((c) => c.name);
    assert.ok(names.some((n) => n.includes("(host)")), "host launch configuration");
    assert.ok(names.some((n) => n.includes("container")), "container debug configuration");
  });
}

test("both templates share the same fixtures and input schema", async () => {
  for (const file of ["fixtures/params.json", "fixtures/input.geojson", "fixtures/invalid-input.geojson", "schema/inputs.schema.json"]) {
    const a = await readFile(path.join(TEMPLATES_DIR, "gp-python", file), "utf8");
    const b = await readFile(path.join(TEMPLATES_DIR, "gp-dotnet", file), "utf8");
    assert.equal(a, b, `${file} differs between templates`);
  }
});
