export function parcelResults(parcels, zone) {
  const features = parcels.filter(({ properties }) => zone === '' || String(properties.zone) === zone);
  const areas = features.map(({ properties }) => properties.acres);
  const known = areas.filter((area) => typeof area === 'number' && Number.isFinite(area) && area >= 0);
  return { features, acres: known.reduce((sum, area) => sum + area, 0), missingArea: areas.length - known.length };
}

export function parcelViewUrl(current, { tmk, zone }) {
  const url = new URL(current);
  url.searchParams.set('tmk', tmk);
  if (zone === '') url.searchParams.delete('zone');
  else url.searchParams.set('zone', zone);
  return url.href;
}

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function parcelRow(feature, options) {
  const p = feature.properties, row = element('tr'), button = element('button', options.formatTmk(p.t9));
  button.type = 'button'; button.className = 'btn sm';
  button.setAttribute('aria-pressed', String(options.selected()?.properties.id === p.id));
  button.addEventListener('click', () => options.onSelect(feature));
  const cell = element('td'); cell.append(button); row.append(cell);
  row.append(element('td', options.zoneNames[p.zone] || 'Not zoned'));
  row.append(element('td', typeof p.acres === 'number' && Number.isFinite(p.acres) && p.acres >= 0 ? p.acres.toFixed(3) : 'Unknown'));
  return row;
}

function tableShell(root) {
  const table = element('table'), caption = element('caption', 'Parcel snapshot results');
  const head = element('thead'), titles = element('tr'), body = element('tbody');
  for (const name of ['TMK', 'Zoning', 'Acres']) { const th = element('th', name); th.scope = 'col'; titles.append(th); }
  head.append(titles); table.append(caption, head, body); root.append(table);
  return body;
}

export function mountParcelBrowser(options) {
  const { root, parcels } = options;
  const zones = [...new Set(parcels.map(({ properties }) => String(properties.zone)))].sort();
  const requested = new URL(location.href).searchParams.get('zone') ?? '';
  let zone = zones.includes(requested) ? requested : '', offset = 0;
  const label = element('label', 'Zoning district '), filter = element('select');
  filter.setAttribute('aria-label', 'Zoning district');
  for (const code of ['', ...zones]) { const option = element('option', code === '' ? 'All zoning districts' : options.zoneNames[code] || 'Not zoned'); option.value = code; filter.append(option); }
  filter.value = zone; label.append(filter);
  const summary = element('p'), selection = element('p'), paging = element('p');
  summary.setAttribute('role', 'status'); selection.setAttribute('role', 'status');
  root.replaceChildren(label, summary, selection);
  const body = tableShell(root), controls = element('div'); controls.className = 'row wrap';
  const previous = element('button', 'Previous parcels'), next = element('button', 'Next parcels');
  for (const button of [previous, next]) { button.type = 'button'; button.className = 'btn sm'; }
  controls.append(previous, next); root.append(paging, controls);
  const state = { options, filter, summary, selection, body, paging, previous, next };
  function refresh() { renderResults(state, { zone, offset }); applyParcelFilter(options.map(), zone); }
  filter.addEventListener('change', () => { zone = filter.value; offset = 0; refresh(); options.onChange(); });
  previous.addEventListener('click', () => { offset = Math.max(0, offset - 20); refresh(); });
  next.addEventListener('click', () => { offset += 20; refresh(); });
  refresh();
  return { get zone() { return zone; }, refresh };
}

function renderResults(state, { zone, offset }) {
  const { options, summary, selection, body, paging, previous, next } = state;
  const result = parcelResults(options.parcels, zone), selected = options.selected();
  summary.textContent = `${result.features.length.toLocaleString()} parcels · ${result.acres.toLocaleString(undefined, { maximumFractionDigits: 3 })} acres${result.missingArea ? ` · ${result.missingArea} with unknown area` : ''}`;
  selection.textContent = selected && !result.features.includes(selected) ? 'The selected parcel is outside this zoning filter. Clear the filter to include it.' : '';
  body.replaceChildren(...result.features.slice(offset, offset + 20).map((feature) => parcelRow(feature, options)));
  paging.textContent = result.features.length ? `Showing ${offset + 1}–${Math.min(offset + 20, result.features.length)} of ${result.features.length} parcels` : 'No parcels match this filter.';
  previous.disabled = offset === 0; next.disabled = offset + 20 >= result.features.length;
}

function applyParcelFilter(map, zone) {
  const expression = zone === '' ? null : ['==', ['to-string', ['get', 'zone']], zone];
  for (const layer of ['parcels-fill', 'parcels-line']) if (map?.getLayer(layer)) map.setFilter(layer, expression);
}
