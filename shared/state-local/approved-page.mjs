// Preserve the approved mockup shell across public demo pages.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function approvedPage({ template, assets, data }) {
  const css = await readFile(path.join(assets, 'tokens.css'), 'utf8') + '\n' + await readFile(path.join(assets, 'app.css'), 'utf8');
  const icons = await readFile(path.join(assets, 'icons.svg'), 'utf8');
  const kit = `<script>${await readFile(path.join(assets, 'honua-map.js'), 'utf8')}</script>`;
  const head = `<script>try{var t=localStorage.getItem("honua-theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script><style>${css}</style>`;
  const shell = await readFile(new URL('./app-shell.css', import.meta.url), 'utf8');
  const html = (await readFile(template, 'utf8')).replace('</head>', `<style>${shell}</style></head>`);
  return html.replace('{{HEAD}}', () => head).replace('{{ICONS}}', () => icons).replace('{{MAPJS}}', () => kit)
    .replace(/\{\{DATA [^}]*\}\}/g, () => `<script>window.HD=${JSON.stringify(data).replaceAll('</', '<\\/')};</script>`);
}
