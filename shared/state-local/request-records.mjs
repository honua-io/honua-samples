import { csvCell } from './csv.mjs';

export const requestStatuses = ['New', 'Assigned', 'In progress', 'Closed'];
export const requestNotice = 'DEMO DATA · fictional reports · browser session only · not a county submission';
const validPhoto = photo => typeof photo === 'string' && (!photo || (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) && photo.length <= 350000));
const key = 'honua-311-browser-v1';
const provenance = { data_origin: 'synthetic_demo', is_demo: true, exercise_only: true, display_label: 'DEMO DATA', disclaimer: requestNotice };
export const nextReset = time => Date.UTC(new Date(time).getUTCFullYear(), new Date(time).getUTCMonth(), new Date(time).getUTCDate() + 1);

function validSavedReport(row) {
  return typeof row?.id === 'string' && row.id.startsWith('DEMO-')
    && typeof row.addr === 'string' && typeof row.type === 'string' && typeof row.note === 'string'
    && Array.isArray(row.c) && row.c.length === 2 && row.c.every(Number.isFinite) && validPhoto(row.photo);
}

function restoreState(storage, clock) {
  const state = { resetAt: nextReset(clock()), reports: [], changes: {} };
  try {
    const saved = JSON.parse(storage?.getItem(key) || 'null');
    if (saved?.resetAt > clock() && saved.resetAt <= nextReset(clock()) && Array.isArray(saved.reports) && saved.changes && typeof saved.changes === 'object') {
      state.reports = saved.reports.filter(validSavedReport).slice(0, 25);
      for (const [id, change] of Object.entries(saved.changes)) {
        if (requestStatuses.includes(change?.status) && typeof change.crew === 'string' && change.crew.length <= 80) state.changes[id] = { status: change.status, crew: change.crew };
      }
    }
  } catch { /* A blocked or full storage still permits an in-memory demo. */ }
  return state;
}

export function createRequestStore({ seeds, storage, clock = Date.now }) {
  let state = restoreState(storage, clock);
  const persist = () => { try { storage?.setItem(key, JSON.stringify(state)); } catch { /* Keep the current session usable. */ } };
  const expire = () => {
    if (state.resetAt <= clock()) { state = { resetAt: nextReset(clock()), reports: [], changes: {} }; persist(); }
  };
  const records = () => {
    expire();
    return [...state.reports, ...seeds].map(row => ({ ...row, ...state.changes[row.id], ...provenance }));
  };
  const submit = input => {
    expire();
    const lat = Number(input.lat), lng = Number(input.lng);
    if (!seeds.some(row => row.type === input.type)) throw new Error('Choose a report category.');
    if (!input.addr?.trim() || input.addr.length > 120) throw new Error('Enter a location up to 120 characters.');
    if (input.note.length > 500) throw new Error('Keep the description within 500 characters.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 20.45 || lat > 21.25 || lng < -157.4 || lng > -155.95) throw new Error('Choose a location within Maui Nui.');
    if (!validPhoto(input.photo)) throw new Error('Choose a JPEG, PNG or WebP photo smaller than 250 KB.');
    if (state.reports.length >= 25) throw new Error('This demo session has reached 25 reports. Reset the session to continue.');
    const row = { id: `DEMO-${clock()}-${state.reports.length + 1}`, type: input.type, addr: input.addr.trim(), note: input.note, c: [lng, lat], photo: input.photo, status: 'New', crew: '', created: new Date(clock()).toISOString(), ...provenance };
    state.reports.unshift(row); persist(); return { ...row };
  };
  const update = (id, change) => {
    if (!records().some(row => row.id === id)) throw new Error('Report not found in this board.');
    if (!requestStatuses.includes(change.status) || change.crew.length > 80) throw new Error('Choose a status and a crew name up to 80 characters.');
    state.changes[id] = { status: change.status, crew: change.crew.trim() }; persist();
  };
  return { records, submit, update, resetAt: () => { expire(); return state.resetAt; }, reset: () => { state = { resetAt: nextReset(clock()), reports: [], changes: {} }; persist(); } };
}

export function triageSuggestion(record, records) {
  const candidates = records.filter(row => row.id !== record.id && row.type === record.type && row.status !== 'Closed' && row.c?.length === 2);
  const nearby = candidates.map(row => ({ row, distance: Math.hypot((row.c[0] - record.c[0]) * 104000, (row.c[1] - record.c[1]) * 111000) })).sort((a, b) => a.distance - b.distance);
  return { category: record.type, duplicateId: nearby[0]?.distance <= 80 ? nearby[0].row.id : null };
}

export function openRequestsCsv(records) {
  const fields = ['id', 'type', 'addr', 'status', 'crew', 'data_origin', 'is_demo', 'exercise_only', 'display_label', 'disclaimer'];
  return [fields, ...records.filter(row => row.status !== 'Closed').map(row => fields.map(field => ({ ...row, ...provenance })[field]))].map(row => row.map(csvCell).join(',')).join('\r\n');
}
