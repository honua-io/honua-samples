import { connect } from '@honua/sdk-js';
import { geoServicesGeometryToGeoJSON } from '@honua/sdk-js/geometry';
import { createHonuaFeatureTable } from '@honua/app-platform/web-components';
import { createFilterRegistry, projectFilterRegistryToQuery } from '@honua/sdk-js/filter-registry';
import { namedBindings } from '../../../shared/state-local/binding.mjs';
import { assertExerciseProvenance } from '../../../shared/state-local/exercise-provenance.mjs';
import { boundingBoxClause } from './analysis-query.mjs';

export const catalogs = {
  parcels: { label: 'Parcels', fields: ['tmk_txt', 'gisacres', 'taxacres'], group: null },
  requests: { label: '311 service requests', fields: ['record_id', 'category', 'status', 'district', 'opened_at'], group: 'status',
    provenanceFields: ['data_origin', 'is_demo', 'exercise_only', 'display_label'], validateRecord: assertExerciseProvenance },
};
export const MAP_LIMIT = 1000;

export function analysisBindings(search) {
  return namedBindings(search, Object.keys(catalogs));
}

export async function openAnalysisSource(binding, name) {
  const catalog = catalogs[name];
  if (!catalog) throw new Error('Choose parcels or 311 service requests.');
  const endpoint = `${binding.baseUrl}/rest/services/${binding.serviceId}/FeatureServer/${binding.layerId}`;
  const connection = await connect({ endpoint, protocol: 'geoservices-feature-service',
    authorizationScopeFingerprint: 'anonymous-public', clientOptions: { timeoutMs: 30_000 } });
  const source = connection.source();
  const metadata = await connection.dataset.client.getLayerMetadata(binding.serviceId, binding.layerId);
  const identity = metadata.objectIdField;
  if (!identity || !/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(identity)) {
    throw new Error('The layer must advertise a stable object ID field.');
  }
  const fields = new Set(metadata.fields?.map((field) => field.name));
  const columns = [identity, ...catalog.fields, ...(catalog.provenanceFields ?? [])];
  for (const field of columns) {
    if (!fields.has(field)) throw new Error(`The approved ${catalog.label} layer is missing ${field}.`);
  }
  return { source, catalog, identity, columns, endpoint };
}

export function createAnalysisModel(handle) {
  const { source, identity, columns } = handle;
  const registry = createFilterRegistry();
  const table = createHonuaFeatureTable({ source, sourceId: source.descriptor.id, identityField: identity,
    columns: columns.map((field) => ({ field })), sort: [{ field: identity, direction: 'asc' }],
    returnGeometry: true, budgets: { pageSize: 100, maxCachedRows: 500, maxRequests: 100,
      maxExportRows: 10_000, maxExportBytes: 8 * 1024 * 1024 } });
  return { ...handle, registry, table };
}

export function analysisQuery(model, excludedOwner) {
  const snapshot = { version: 1, clauses: model.registry.snapshot.clauses
    .filter((clause) => clause.owner.id !== excludedOwner) };
  const projection = projectFilterRegistryToQuery(snapshot, { source: model.source.descriptor,
    sourceId: model.source.descriptor.id });
  if (projection.degraded?.length) throw new Error('This server cannot apply every requested filter exactly.');
  return projection.query;
}

export async function queryAnalysisMap(model, options = {}) {
  const result = await model.source.query({ ...analysisQuery(model),
    outFields: model.columns, returnGeometry: true, outSr: 4326,
    orderBy: [{ field: model.identity, direction: 'asc' }],
    pagination: { limit: MAP_LIMIT }, signal: options.signal });
  if (result.degraded?.length) throw new Error('The map query was degraded. Clear the unsupported filter and retry.');
  const features = result.features.map((feature) => {
    model.catalog.validateRecord?.(feature.attributes);
    return { type: 'Feature', id: feature.attributes[model.identity], properties: feature.attributes,
      geometry: geoServicesGeometryToGeoJSON(feature.geometry ?? null) };
  });
  if (features.some((feature) => feature.id == null)
    || new Set(features.map((feature) => feature.id)).size !== features.length) {
    throw new Error('The map query returned missing or repeated object IDs.');
  }
  return { collection: { type: 'FeatureCollection', features },
    partial: result.exceededTransferLimit, totalCount: result.totalCount };
}

export async function queryStatusChart(model, options = {}) {
  const field = model.catalog.group;
  if (!field) return null;
  const result = await model.source.query({ ...analysisQuery(model, 'status-chart'),
    aggregation: { groupBy: [field], metrics: [{ fn: 'count', field: model.identity, alias: 'record_count' }] },
    returnGeometry: false, pagination: { limit: 20 }, signal: options.signal });
  if (result.degraded?.length || result.exceededTransferLimit || !result.aggregateRows) {
    throw new Error('The server did not return a complete grouped count.');
  }
  return result.aggregateRows.map((row) => {
    if (typeof row[field] !== 'string' || !Number.isSafeInteger(row.record_count) || row.record_count < 0) {
      throw new Error('The server returned an invalid status count.');
    }
    return { label: row[field], value: row.record_count };
  });
}

export function setAnalysisFilter(model, filter) {
  const { id, field, operator, value, owner = 'query' } = filter;
  if (id !== 'spatial' && !model.columns.includes(field)) throw new Error('Choose a field from the active layer.');
  const clause = id === 'spatial' ? boundingBoxClause(value) : { id, field, operator, value };
  model.registry.upsert({ ...clause, owner: { kind: 'control', id: owner },
    sourceScope: [model.source.descriptor.id], lifecycle: 'persistent', effect: 'filter' });
}
