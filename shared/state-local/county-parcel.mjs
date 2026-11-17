export const countyFields = Object.freeze({
  tmk_txt: 'TMK', zone: 'Tax map zone', section: 'Section', plat: 'Plat', parcel: 'Parcel',
  nhoodcode: 'Neighborhood code', pittcode: 'Property tax class code', taxacres: 'Tax acres', gisacres: 'GIS acres',
  zoning_code: 'County zoning code', zoning_district: 'County zoning district',
});

const zoningFields = new Set(['zoning_code', 'zoning_district']);

export function countyFieldText(name, value) {
  if (value !== null) return String(value);
  return zoningFields.has(name) ? 'None (no district covers 10%)' : 'Unknown';
}

export function countyTmk(value) {
  if (typeof value !== 'string') throw new Error('Enter a nine-digit TMK as text.');
  const tmk = value.replace(/[\s()-]/gu, '');
  if (!/^\d{9}$/u.test(tmk)) throw new Error('Enter a nine-digit TMK; spaces and dashes are allowed.');
  return tmk;
}

export function countyParcel(publication, feature) {
  if (!feature?.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) throw new Error('Parcel geometry is unavailable.');
  const fields = new Set(publication.publicFields.map(({ name }) => name));
  const properties = Object.fromEntries(Object.keys(countyFields).filter((name) => fields.has(name)).map((name) => [name, feature.attributes[name] ?? null]));
  if (countyTmk(properties.tmk_txt) !== properties.tmk_txt) throw new Error('The publication returned an invalid text TMK.');
  return { type: 'Feature', properties, geometry: feature.geometry };
}
