const $ = (selector) => document.querySelector(selector);
const tabs = [...document.querySelectorAll('[role=tab]')];
function selectTab(id) {
  for (const button of tabs) {
    const active = button.id === `tab-${id}`;
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    $(`#${button.getAttribute('aria-controls')}`).hidden = !active;
  }
}
for (const [i, button] of tabs.entries()) {
  button.addEventListener('click', () => selectTab(button.getAttribute('aria-controls')));
  button.addEventListener('keydown', (event) => {
    const index = event.key === 'ArrowRight' ? (i + 1) % tabs.length : event.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (index >= 0) { event.preventDefault(); selectTab(tabs[index].getAttribute('aria-controls')); tabs[index].focus(); }
  });
}
function node(tag, text, className) {
  const el = document.createElement(tag); el.textContent = text;
  if (className) el.className = className;
  return el;
}
// README HTML comes from the source generator. Retain text and a small formatting
// vocabulary; never activate embedded HTML, images, styles or arbitrary links.
function sanitizedReadme(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['P','H1','H2','H3','H4','UL','OL','LI','PRE','CODE','B','STRONG','EM','A','BR','TABLE','TBODY','THEAD','TR','TH','TD']);
  function copy(source) {
    if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent);
    const target = document.createElement(allowed.has(source.nodeName) ? source.nodeName.toLowerCase() : 'span');
    if (source.nodeName === 'A') {
      const href = source.getAttribute('href');
      if (/^https?:\/\//i.test(href ?? '')) { target.href = href; target.target = '_blank'; target.rel = 'noopener noreferrer'; }
    }
    target.append(...[...source.childNodes].map(copy)); return target;
  }
  return [...parsed.body.childNodes].map(copy);
}
let selected;
let catalog;
let previews;
function selectSample(sample) {
  selected = sample;
  for (const button of document.querySelectorAll('[data-sample]')) button.setAttribute('aria-current', String(button.dataset.sample === `${sample.repo}:${sample.id}`));
  $('#sample-title').textContent = sample.title;
  $('#sample-path').textContent = sample.path;
  $('#sample-description').textContent = sample.desc;
  $('#source-link').href = sample.url;
  $('#run-command').textContent = sample.run || 'See the source README for setup instructions.';
  $('#copy-command').disabled = !sample.run;
  $('#copy-status').textContent = '';
  $('#api-list').replaceChildren(...sample.apis.map((api) => node('li', api)));
  $('#catalog-revision').textContent = `Source snapshot: SDK ${catalog.sdkRev}; samples ${catalog.samplesRev}. SDK package ${catalog.version}. Preview builds may use a different commit, shown above.`;
  const preview = previews[`${sample.repo}:${sample.id}`];
  $('#preview').replaceChildren(); $('#source').replaceChildren();
  $('#open-preview').hidden = !preview;
  if (preview) {
    const url = new URL(preview.url, location.origin);
    if (url.origin !== location.origin || !url.pathname.endsWith('/') && !url.pathname.endsWith('.html')) throw new Error('Invalid verified preview URL');
    $('#sample-provenance').textContent = `Runnable preview · ${preview.dataModeLabel ?? 'Unknown data mode'} · built from ${preview.commit ?? 'unknown commit'}. Fixture and hybrid modes include demo records.`;
    const iframe = document.createElement('iframe'); iframe.src = url.href; iframe.title = `${sample.title} — running sample`;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    $('#preview').append(iframe); $('#open-preview').href = url.href;
  } else {
    $('#sample-provenance').textContent = sample.status === 'Moved' ? 'Moved example · see the replacement in the catalogue.' : 'Source example · no verified runnable preview in this build.';
    $('#preview').append(node('h3', 'Source available'), node('p', 'A verified runnable build was not admitted for this deployment. Open Source or README to run it locally.'));
  }
  for (const file of sample.files) { const pre = node('pre', ''); pre.tabIndex = 0; pre.append(node('code', file.code)); $('#source').append(node('h3', file.name), pre); }
  if (!sample.files.length) $('#source').append(node('p', sample.moved ? `This example moved to ${sample.moved}.` : 'Open the source repository for this example.'));
  $('#readme').replaceChildren(...sanitizedReadme(sample.readme || '<p>Open the source repository for setup and documentation.</p>'));
  selectTab(preview ? 'preview' : 'source');
}
function renderSampleList() {
  const query = $('#search').value.trim().toLowerCase(); const mode = $('#mode').value;
  const samples = catalog.samples.filter((sample) => (!query || [sample.title,sample.id,sample.desc,...sample.apis].join(' ').toLowerCase().includes(query))
    && (mode === 'all' || mode === 'preview' && previews[`${sample.repo}:${sample.id}`] || mode === sample.repo));
  $('#catalog-status').textContent = `${samples.length} matching samples`;
  $('#sample-list').replaceChildren();
  for (const category of catalog.categories) {
    const members = samples.filter((sample) => sample.cat === category.id); if (!members.length) continue;
    $('#sample-list').append(node('h2', `${category.name} · ${members.length}`));
    for (const sample of members) {
      const button = node('button', '', 'sample-choice'); button.type = 'button'; button.dataset.sample = `${sample.repo}:${sample.id}`;
      button.append(node('span', sample.title), node('small', `${sample.id} · ${sample.repo === 'sdk-js' ? 'JavaScript SDK' : 'Standalone sample'}${sample.status ? ` · ${sample.status}` : previews[`${sample.repo}:${sample.id}`] ? ' · Preview' : ''}`));
      button.setAttribute('aria-current', String(selected?.repo === sample.repo && selected?.id === sample.id));
      button.addEventListener('click', () => { selectSample(sample); history.replaceState(null, '', `#${sample.repo}:${sample.id}`); }); $('#sample-list').append(button);
    }
  }
}
$('#copy-command').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(selected.run); $('#copy-status').textContent = 'Command copied.'; }
  catch { $('#copy-status').textContent = 'Copy unavailable. Select the command text to copy it.'; }
});
try {
  const responses = await Promise.all(['catalog.json', 'previews.json'].map((url) => fetch(url)));
  if (responses.some((response) => !response.ok)) throw new Error('Catalogue request failed');
  [catalog, previews] = await Promise.all(responses.map((response) => response.json()));
  renderSampleList();
  const initial = catalog.samples.find((sample) => `${sample.repo}:${sample.id}` === location.hash.slice(1)) ?? catalog.samples.find((sample) => sample.id === 'maplibre-featureserver-layer');
  selectSample(initial);
  $('#search').addEventListener('input', renderSampleList); $('#mode').addEventListener('change', renderSampleList);
} catch {
  $('#catalog-status').textContent = 'The sample catalogue could not be loaded. Reload to try again.';
}
