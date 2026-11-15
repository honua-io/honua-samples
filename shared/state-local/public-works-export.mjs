import { csvCell } from './csv.mjs';
import { download } from './download.mjs';

const provenance = {
  data_origin: 'synthetic_demo', is_demo: true, exercise_only: true,
  label: 'DEMO DATA', use_statement: 'Fictional exercise records; not for operational use',
};

function recordsCsv(records, fields) {
  const columns = [...fields, ...Object.keys(provenance)];
  return [columns.map(csvCell).join(','), ...records.map((record) => {
    const labelled = { ...record, ...provenance };
    return columns.map((field) => csvCell(labelled[field])).join(',');
  })].join('\r\n');
}

export function assetsCsv(assets) {
  return recordsCsv(assets.map((asset) => ({
    ...asset, longitude: asset.c[0], latitude: asset.c[1],
  })), ['id', 'kind', 'cond', 'street', 'insp', 'installed', 'longitude', 'latitude']);
}

export function culvertsCsv({ candidates, costs, actions }) {
  return recordsCsv(candidates.map((candidate, index) => ({
    rank: index + 1, id: candidate.a.id, street: candidate.a.street, condition: candidate.a.cond,
    action: actions[candidate.a.cond], nearby_requests: candidate.reqs.length,
    nearby_parcels: candidate.parcels, estimated_cost: costs[candidate.a.cond],
    cost_basis: 'Demo planning estimate; not a county budget',
    parcel_basis: 'Maui County Parcels snapshot; within 300 m',
  })), ['rank', 'id', 'street', 'condition', 'action', 'nearby_requests', 'nearby_parcels',
    'estimated_cost', 'cost_basis', 'parcel_basis']);
}

export function mountPublicWorksExports({ assets, candidates, costs, actions }) {
  document.getElementById('publicWorksExport').addEventListener('click', (event) => {
    event.preventDefault();
    if (!document.getElementById('capitalView').hidden) {
      document.getElementById('capitalExport').click();
    } else {
      download('maui-demo-assets.csv', assetsCsv(assets), 'csv');
    }
  });
  document.getElementById('culvertExport').addEventListener('click', () =>
    download('maui-demo-culvert-shortlist.csv', culvertsCsv({ candidates, costs, actions }), 'csv'));
}
