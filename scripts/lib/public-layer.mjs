// The public index is service-local and may differ from the storage handle, so
// read it from the service listing rather than assume it.
export async function publicLayerIndex(serviceUrl, layer, headers) {
  const response = await fetch(`${serviceUrl}?f=json`, headers ? { headers } : undefined);
  const listing = response.ok ? await response.json() : null;
  const layers = Array.isArray(listing?.layers) ? listing.layers : [];
  const named = layers.filter((entry) => entry.name === layer.layerName);
  // Fall back to the only layer solely for servers that do not report the admin layer name.
  const match = layer.layerName ? (named.length === 1 ? named[0] : null) : layers.length === 1 ? layers[0] : null;
  if (!Number.isInteger(match?.id)) throw new Error("Service public layer index was not confirmed");
  return match.id;
}
