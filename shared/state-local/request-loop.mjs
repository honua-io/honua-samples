import { createRequestStore, requestStatuses, requestNotice, triageSuggestion, openRequestsCsv } from './request-records.mjs';

const root = document.querySelector('#request-loop');
const query = selector => root.querySelector(selector);
function sessionStorageOrNull() { try { return window.sessionStorage; } catch { return null; } }
const store = createRequestStore({ seeds: window.HD.demo.requests, storage: sessionStorageOrNull() });
const form = query('form');
const search = query('[name="report-search"]');
function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function showTab(name) {
  root.querySelectorAll('[data-request-view]').forEach(node => { node.hidden = node.dataset.requestView !== name; });
  root.querySelectorAll('[data-request-tab]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.requestTab === name)));
}
function suggest(record, answer) {
  const result = triageSuggestion(record, store.records());
  answer.replaceChildren(element('p', `Demo answer · category: ${result.category}. ${result.duplicateId ? `Possible duplicate: ${result.duplicateId}.` : 'No open report in this category within 80 metres.'} ${requestNotice}`));
  if (!result.duplicateId) return;
  const show = element('button', 'Show possible duplicate', 'btn');
  show.type = 'button';
  show.onclick = () => { search.value = result.duplicateId; render(); };
  answer.append(show);
}
function staffControls(row, record) {
  const status = element('select', '', 'sel');
  status.setAttribute('aria-label', `Status for ${record.id}`);
  requestStatuses.forEach(value => status.add(new Option(value, value)));
  status.value = requestStatuses.includes(record.status) ? record.status : 'New';
  const crew = element('input', '', 'sel');
  crew.value = record.crew || ''; crew.maxLength = 80; crew.placeholder = 'Crew name';
  crew.setAttribute('aria-label', `Crew for ${record.id}`);
  const save = element('button', 'Save demo update', 'btn');
  save.onclick = () => { store.update(record.id, { status: status.value, crew: crew.value }); render(); };
  const answer = element('div', ''); answer.setAttribute('aria-live', 'polite');
  const triage = element('button', 'Suggest triage · demo', 'btn');
  triage.onclick = () => suggest(record, answer);
  row.append(status, crew, save, triage, answer);
}
function renderRecord(record, staff) {
  const row = element('article', '', 'panel-b'); row.dataset.reportId = record.id;
  row.append(element('h3', `${record.id} · ${record.type}`), element('p', `${record.addr} · ${record.status}${record.crew ? ` · Crew: ${record.crew}` : ''}`));
  if (record.note) row.append(element('p', record.note));
  if (record.photo?.startsWith('data:image/')) {
    const photo = element('img', ''); photo.src = record.photo; photo.alt = 'Photo attached to this fictional demo report'; photo.width = 120;
    row.append(photo);
  }
  row.append(element('p', requestNotice, 'faint'));
  if (staff) staffControls(row, record);
  return row;
}
function render() {
  const term = search.value.trim().toLowerCase();
  const records = store.records().filter(row => `${row.id} ${row.addr}`.toLowerCase().includes(term));
  for (const view of ['staff', 'public']) {
    const list = query(`[data-request-view="${view}"] .request-records`);
    list.replaceChildren(...records.slice(0, 25).map(row => renderRecord(row, view === 'staff')));
    if (!records.length) list.append(element('p', 'No demo reports match this search.'));
    list.prepend(element('p', `${records.length} matching reports. Showing up to 25; search by report ID or location.`));
  }
  query('[data-reset-time]').textContent = `Resets at ${new Date(store.resetAt()).toISOString()} (UTC). Closing this browser session also clears reports. The snapshot dashboard below remains unchanged.`;
}
function photoData(file) {
  if (!file) return Promise.resolve('');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 250000) return Promise.reject(new Error('Choose a JPEG, PNG or WebP photo smaller than 250 KB.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The photo could not be read.')); reader.readAsDataURL(file);
  });
}
form.onsubmit = async event => {
  event.preventDefault();
  const message = query('[data-submit-message]');
  try {
    const values = Object.fromEntries(new FormData(form));
    const record = store.submit({ ...values, photo: await photoData(values.photo) });
    message.textContent = `Created ${record.id}. ${requestNotice}`;
    search.value = record.id; form.reset(); render(); showTab('public');
  } catch (error) { message.textContent = error.message; }
};
root.querySelectorAll('[data-request-tab]').forEach(button => { button.onclick = () => showTab(button.dataset.requestTab); });
search.oninput = render;
query('[data-reset]').onclick = () => { store.reset(); search.value = ''; query('[data-submit-message]').textContent = 'Demo session reset.'; render(); };
query('[data-export]').onclick = () => {
  const url = URL.createObjectURL(new Blob([openRequestsCsv(store.records())], { type: 'text/csv;charset=utf-8' }));
  const link = element('a', ''); link.href = url; link.download = 'demo-open-requests.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
[...new Set(store.records().map(row => row.type))].sort().forEach(type => form.elements.type.add(new Option(type, type)));
render();
let resetAt = store.resetAt();
setInterval(() => {
  if (Date.now() >= resetAt) { render(); resetAt = store.resetAt(); }
}, 60000);
