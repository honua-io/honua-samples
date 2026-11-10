const PAGE_SIZE = 200;
const MAX_RECORDS = 10_000;

export async function collectFeatures(client, binding, featureFromWire) {
  const query = { serviceId: binding.serviceId, layerId: binding.layerId, where: '1=1', method: 'GET' };
  const count = (await client.queryFeatures({ ...query, extraParams: { returnCountOnly: true } })).count;
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_RECORDS) throw new Error('Layer count is missing or exceeds the 10,000-record demo limit');
  const records = [];
  while (records.length < count) {
    const result = await client.queryFeatures({ ...query, outFields: ['*'], returnGeometry: true, outSr: 4326,
      orderByFields: 'objectid ASC', resultOffset: records.length, resultRecordCount: PAGE_SIZE });
    if (!Array.isArray(result.features) || !result.features.length) throw new Error('Layer pagination ended before the reported count');
    records.push(...result.features.map(featureFromWire));
  }
  const ids = new Set(records.map((feature) => feature.id));
  const finalCount = (await client.queryFeatures({ ...query, extraParams: { returnCountOnly: true } })).count;
  if (records.length !== count || finalCount !== count || ids.size !== count || records.some(({ id }) => id === undefined || id === null)) {
    throw new Error('Layer data changed or pagination repeated records. Refresh to try again');
  }
  return records;
}
