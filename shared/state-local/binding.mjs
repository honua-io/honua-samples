export function sourceBinding(search) {
  const params = new URLSearchParams(search);
  const serviceId = params.get('service');
  const layer = params.get('layer');
  if (!serviceId && !layer) return null;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(serviceId ?? '') || !/^\d{1,9}$/.test(layer ?? '')) {
    throw new Error('Use the service and numeric layer from the approved deployment receipt');
  }
  const url = new URL(params.get('baseUrl') ?? 'https://demo.honua.io');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!local && url.origin !== 'https://demo.honua.io') || !['http:', 'https:'].includes(url.protocol)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Connect to demo.honua.io or a disposable localhost server');
  }
  return { baseUrl: url.origin, serviceId, layerId: Number(layer) };
}

export function namedBindings(search, names) {
  const params = new URLSearchParams(search);
  const entries = names.map((name) => [name, sourceBinding(new URLSearchParams({
    baseUrl: params.get('baseUrl') ?? 'https://demo.honua.io',
    ...(params.has(`${name}Service`) ? { service: params.get(`${name}Service`) } : {}),
    ...(params.has(`${name}Layer`) ? { layer: params.get(`${name}Layer`) } : {})
  }))]);
  if (entries.every(([, binding]) => !binding)) return null;
  if (entries.some(([, binding]) => !binding)) throw new Error(`Connect all layers from approved import receipts: ${names.join(', ')}`);
  return Object.fromEntries(entries);
}

