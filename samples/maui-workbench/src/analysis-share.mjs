import { parseInteractionQueryState, serializeInteractionQueryState } from '@honua/sdk-js/interactions';
import { analysisBindings, catalogs } from './analysis-model.mjs';
import { dateRangeClauses } from './analysis-query.mjs';
import { spatialClause } from './analysis-spatial.mjs';

const shareError = () => new Error('This share link contains unsupported analysis state. Ask for a new link.');
const ownKeys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));

function validatePresentation(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || !ownKeys(state, ['selection', 'camera'])) throw shareError();
  const { selection = [], camera } = state;
  if (!Array.isArray(selection) || selection.length > 100
    || selection.some((id) => typeof id !== 'number' || !Number.isSafeInteger(id))
    || new Set(selection).size !== selection.length) throw shareError();
  if (camera !== undefined && (!Array.isArray(camera) || camera.length !== 5
    || !camera.every(Number.isFinite) || Math.abs(camera[0]) > 180 || Math.abs(camera[1]) > 85.051129
    || camera[2] < 0 || camera[2] > 22 || Math.abs(camera[3]) > 180 || camera[4] < 0 || camera[4] > 60)) throw shareError();
  return { selection, ...(camera ? { camera } : {}) };
}

function validateClause(catalog, id, clause) {
  if (id === 'spatial') {
    if (!clause || typeof clause !== 'object' || Array.isArray(clause) || !ownKeys(clause, ['value'])) throw shareError();
    try { return spatialClause(clause.value); } catch { throw shareError(); }
  }
  if (!clause || typeof clause !== 'object' || Array.isArray(clause)
    || !ownKeys(clause, ['field', 'operator', 'value']) || !catalogs[catalog].fields.includes(clause.field)
    || !['=', '!=', '>=', '<=', ...(id === 'time-end' ? ['<'] : [])].includes(clause.operator)) throw shareError();
  const numeric = ['gisacres', 'taxacres'].includes(clause.field);
  if (numeric ? typeof clause.value !== 'number' || !Number.isFinite(clause.value)
    : typeof clause.value !== 'string' || !clause.value.length || clause.value.length > 256) throw shareError();
  if (id === 'chart-status' && (catalog !== 'requests' || clause.field !== 'status' || clause.operator !== '=')) throw shareError();
  if (['time-start', 'time-end'].includes(id)) {
    if (catalog !== 'requests' || clause.field !== 'opened_at'
      || clause.operator !== (id === 'time-start' ? '>=' : '<')) throw shareError();
    try { dateRangeClauses(clause.value, ''); } catch { throw shareError(); }
  } else if (!['query', 'chart-status'].includes(id)) throw shareError();
  return { id, field: clause.field, operator: clause.operator, value: clause.value };
}

export function parseAnalysisShare(hash) {
  if (!hash || hash === '#' || hash === '#main') return null;
  if (hash.length > 8192) throw shareError();
  const params = new URLSearchParams(hash.replace(/^#/u, ''));
  if ([...params.keys()].some((key) => !['wb', 'catalog', 'f', 'view'].includes(key) || params.getAll(key).length !== 1)
    || params.get('wb') !== '1' || !Object.hasOwn(catalogs, params.get('catalog'))) throw shareError();
  const catalog = params.get('catalog');
  if (params.has('f')) {
    let raw;
    try { raw = JSON.parse(params.get('f')); } catch { throw shareError(); }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw shareError();
  }
  const state = parseInteractionQueryState(params);
  const clauses = Object.entries(state.filters ?? {}).map(([id, clause]) => validateClause(catalog, id, clause));
  const start = clauses.find((clause) => clause.id === 'time-start')?.value;
  const end = clauses.find((clause) => clause.id === 'time-end')?.value;
  if (end && (end <= '0001-01-01' || (start && start >= end))) throw shareError();
  let presentation;
  if (params.has('view')) {
    try { presentation = validatePresentation(JSON.parse(params.get('view'))); } catch { throw shareError(); }
  }
  return { catalog, clauses, ...(presentation ? { presentation } : {}) };
}

export function createAnalysisShareUrl(address, state) {
  const url = new URL(address);
  const bindings = analysisBindings(url.search);
  if (!bindings) throw shareError();
  url.search = '';
  for (const [name, binding] of Object.entries(bindings)) {
    url.searchParams.set(`${name}Service`, binding.serviceId);
    url.searchParams.set(`${name}Layer`, String(binding.layerId));
  }
  url.searchParams.set('baseUrl', bindings.requests.baseUrl);
  const filters = {};
  for (const clause of state.clauses) {
    if (Object.hasOwn(filters, clause.id)) throw shareError();
    filters[clause.id] = clause.id === 'spatial' ? { value: clause.value }
      : { field: clause.field, operator: clause.operator, value: clause.value };
  }
  const params = new URLSearchParams(serializeInteractionQueryState({ filters }));
  params.set('wb', '1'); params.set('catalog', state.catalog);
  if (state.presentation) params.set('view', JSON.stringify(validatePresentation(state.presentation)));
  url.hash = params.toString();
  parseAnalysisShare(url.hash);
  if (url.href.length > 8192) throw shareError();
  return url.href;
}
