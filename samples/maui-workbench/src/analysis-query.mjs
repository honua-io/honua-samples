import { spatialClause } from './analysis-spatial.mjs';
import { queryFilter } from '@honua/sdk-js/contract';
import { compileOgcApiFeaturesQuery } from '@honua/sdk-js/query-planner';

function utcDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(date.getTime())
    || date.getUTCFullYear() < 1 || date.toISOString().slice(0, 10) !== value) throw new Error('Enter a valid calendar date.');
  return date;
}

export function dateRangeClauses(start, end) {
  if (start) utcDate(start);
  if (end) utcDate(end);
  if (start && end && start > end) throw new Error('The date range must end on or after its start.');
  const clauses = [];
  if (start) clauses.push({ id: 'time-start', field: 'opened_at', operator: '>=', value: start });
  if (end) {
    const next = utcDate(end);
    next.setUTCDate(next.getUTCDate() + 1);
    if (next.getUTCFullYear() > 9999) throw new Error('Choose an earlier end date.');
    clauses.push({ id: 'time-end', field: 'opened_at', operator: '<', value: next.toISOString().slice(0, 10) });
  }
  return clauses;
}

const comparisons = { '=': 'eq', '!=': 'ne', '>=': 'gte', '<=': 'lte', '<': 'lt' };
export function previewAnalysisCql2(clauses) {
  if (!clauses.length) return 'TRUE';
  const filters = clauses.map((clause) => clause.id === 'spatial'
    ? queryFilter.spatial('intersects', spatialClause(clause.value).spatialScope.filter)
    : queryFilter[comparisons[clause.operator]](clause.field, clause.value));
  const source = { id: 'preview', protocol: 'ogc-features', collectionId: 'preview',
    endpoint: 'https://demo.honua.io/ogc', authorizationScope: [], capabilities: [] };
  return compileOgcApiFeaturesQuery(source, { filter: filters.length === 1 ? filters[0] : queryFilter.and(...filters) }).filter;
}
