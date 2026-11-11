export const parameters = '?requestsService=requests&requestsLayer=1&parcelsService=parcels&parcelsLayer=2';
const fields = ['objectid', 'record_id', 'category', 'status', 'district', 'opened_at', 'tmk_txt', 'gisacres', 'taxacres',
  'data_origin', 'is_demo', 'exercise_only', 'display_label'];
const rows = [1, 2, 3].map((id) => ({ attributes: { objectid: id, record_id: `DEMO-${id}`,
  category: 'drainage', status: id === 3 ? 'exercise_closed' : 'exercise_open', district: 'Demo district 1',
  opened_at: `2026-11-0${id}T12:00:00Z`, tmk_txt: `DEMO-PARCEL-${id}`, gisacres: id, taxacres: id,
  data_origin: 'synthetic_demo', is_demo: true, exercise_only: true, display_label: 'DEMO DATA — fictional request' },
  geometry: { x: -156.44 + id * .005, y: 20.86 } }));

function insideArea(point, geometry) {
  if (!geometry) return true;
  if (!geometry.rings) return point.x >= geometry.xmin && point.x <= geometry.xmax
    && point.y >= geometry.ymin && point.y <= geometry.ymax;
  let inside = false;
  const ring = geometry.rings[0];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [x, y] = ring[i];
    const [priorX, priorY] = ring[j];
    if ((y > point.y) !== (priorY > point.y)
      && point.x < (priorX - x) * (point.y - y) / (priorY - y) + x) inside = !inside;
  }
  return inside;
}

function filtered(params) {
  const where = params.get('where') ?? '1=1';
  const status = /exercise_(open|closed)/u.exec(where)?.[0];
  const recordId = /record_id = '((?:[^']|'')*)'/u.exec(where)?.[1]?.replaceAll("''", "'");
  const start = /opened_at >= '([^']+)'/u.exec(where)?.[1];
  const end = /opened_at < '([^']+)'/u.exec(where)?.[1];
  const box = params.has('geometry') ? JSON.parse(params.get('geometry')) : null;
  return rows.filter(({ attributes: row, geometry: point }) => (!status || row.status === status)
    && (recordId === undefined || row.record_id === recordId)
    && (!start || row.opened_at >= start) && (!end || row.opened_at < end)
    && insideArea(point, box));
}
export async function mockServer(page) {
  const control = { fail: false, queries: [], holdMap: false, corruptTable: false };
  await page.route('https://demo.honua.io/rest/services/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const params = request.method() === 'POST' ? new URLSearchParams(request.postData()) : url.searchParams;
    if (!url.pathname.endsWith('/query')) {
      await route.fulfill({ json: { id: Number(url.pathname.split('/').at(-1)), name: 'DEMO DATA fixture', type: 'Feature Layer',
        geometryType: 'esriGeometryPoint', objectIdField: 'objectid', spatialReference: { wkid: 4326 },
        extent: { xmin: -156.5, ymin: 20.8, xmax: -156.3, ymax: 20.9, spatialReference: { wkid: 4326 } },
        fields: fields.map((name) => ({ name, type: name === 'objectid' ? 'esriFieldTypeOID'
          : ['gisacres', 'taxacres'].includes(name) ? 'esriFieldTypeDouble' : 'esriFieldTypeString' })),
        capabilities: 'Query', useStandardizedQueries: true, maxRecordCount: 1000,
        advancedQueryCapabilities: { supportsPagination: true, supportsStatistics: true, supportsOrderBy: true,
          supportsReturningQueryExtent: true } } });
      return;
    }
    control.queries.push(Object.fromEntries(params));
    if (control.fail) { await route.fulfill({ status: 503, json: { error: { code: 503, message: 'Fixture outage' } } }); return; }
    const matching = filtered(params);
    if (params.get('returnExtentOnly') === 'true' || params.get('returnCountOnly') === 'true') {
      await route.fulfill({ json: { count: matching.length, extent: { xmin: -156.5, ymin: 20.8, xmax: -156.3, ymax: 20.9, spatialReference: { wkid: 4326 } } } });
    } else if (params.has('outStatistics')) {
      const statuses = [...new Set(matching.map((row) => row.attributes.status))];
      await route.fulfill({ json: { features: statuses.map((status) => ({ attributes: { status,
        record_count: matching.filter((row) => row.attributes.status === status).length } })) } });
    } else {
      const offset = Number(params.get('resultOffset') ?? 0);
      const limit = Number(params.get('resultRecordCount') ?? 1000);
      if (control.holdMap && limit === 1000) {
        control.held = true;
        await new Promise((resolve) => { control.releaseMap = resolve; });
      }
      const projection = params.get('outFields')?.split(',');
      const features = matching.slice(offset, offset + limit).map((feature) => ({ ...feature, attributes: Object.fromEntries(
        Object.entries(feature.attributes).filter(([field]) => !projection || projection.includes('*') || projection.includes(field))) }));
      if (control.corruptTable && limit === 100) for (const feature of features) delete feature.attributes.data_origin;
      await route.fulfill({ json: { objectIdFieldName: 'objectid', geometryType: 'esriGeometryPoint', spatialReference: { wkid: 4326 },
        count: matching.length, features, exceededTransferLimit: offset + limit < matching.length } });
    }
  });
  return control;
}

