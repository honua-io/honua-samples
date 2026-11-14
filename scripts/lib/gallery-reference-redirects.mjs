import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { escapeAttr, escapeHtml } from "./markdown-lite.mjs";

export const referenceRedirects = [
  {
    route: "jobs/multidimensional-format-maturity",
    document: "docs/multidimensional-format-maturity.md",
    title: "Zarr, NetCDF and HDF5 readiness",
  },
];

export function referenceDocumentUrl(entry, sourceCommit) {
  return `https://github.com/honua-io/honua-samples/blob/${sourceCommit}/${entry.document}`;
}

export async function writeReferenceRedirects({ siteDir, sourceCommit }) {
  for (const entry of referenceRedirects) {
    const target = referenceDocumentUrl(entry, sourceCommit);
    const directory = path.join(siteDir, entry.route);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(entry.title)} — reference documentation</title>
<meta http-equiv="refresh" content="0; url=${escapeAttr(target)}">
<link rel="canonical" href="${escapeAttr(target)}"></head>
<body><h1>${escapeHtml(entry.title)}</h1><p>This reference guidance has moved out of the sample gallery.
<a href="${escapeAttr(target)}">Read the format readiness documentation</a>.</p></body></html>\n`, "utf8");
  }
}
