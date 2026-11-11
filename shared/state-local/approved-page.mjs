// Preserve the approved mockup shell across public demo pages.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function approvedPage({ template, assets, data, islandDirectory }) {
  if (islandDirectory) data = await islandPointData(islandDirectory, data);
  const css = await readFile(path.join(assets, 'tokens.css'), 'utf8') + '\n' + await readFile(path.join(assets, 'app.css'), 'utf8');
  const icons = await readFile(path.join(assets, 'icons.svg'), 'utf8');
  const island = await readFile(new URL('./island-map.js', import.meta.url), 'utf8');
  const mapKit = await readFile(new URL('../../scripts/state-local/approved/src/honua-map.js', import.meta.url), 'utf8');
  const kit = `<script>${island}\n${mapKit}</script>`;
  const head = `<script>try{var t=localStorage.getItem("honua-theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/dist/pmtiles.js" integrity="sha384-pbKNZbDshUsLnZMIVsn/t+j3xEY9PGfuX5Z22l5rcy/obXz3EwaMx1F5d9sRsJMn" crossorigin="anonymous"></script><style>${css}</style>`;
  const shell = await readFile(new URL('./app-shell.css', import.meta.url), 'utf8');
  const html = (await readFile(template, 'utf8')).replace('</head>', () => `<style>${shell}</style></head>`);
  return html.replace('{{HEAD}}', () => head).replace('{{ICONS}}', () => icons).replace('{{MAPJS}}', () => kit)
    .replace(/\{\{DATA [^}]*\}\}/g, () => `<script>window.HD=${JSON.stringify(data).replaceAll('</', '<\\/')};</script>`);
}

export async function islandPointData(directory, data) {
  const result = { ...data };
  for (const name of ['fire', 'police', 'hospitals', 'places', 'bridges', 'schools']) {
    if (name in result) result[name] = JSON.parse(await readFile(path.join(directory, `${name}.geojson`)));
  }
  return result;
}
