import { countyParcel, countyTmk } from './county-parcel.mjs';
import { parcelCsv, parcelGeoJson } from './parcel-export.mjs';

export function countyExport(publication, feature, format) {
  const source = publication.descriptor.provenance;
  const capture = publication.freshness;
  const sourceUrl = publication.descriptor.links?.source;
  if (!capture.capturedAt || !capture.captureId || !source?.attribution || !source.license || !sourceUrl || !publication.url) throw new Error('Incomplete county publication provenance.');
  const sanitized = countyParcel(publication, { attributes: feature.properties, geometry: feature.geometry });
  const provenance = { snapshot: capture.capturedAt, attribution: source.attribution,
    warning: 'County publication capture; not a current legal boundary survey.',
    sources: { parcels: { sourceUrl, license: source.license, publicationUrl: publication.url, ...capture, crs: publication.descriptor.crs.geoparquet } } };
  const serialize = new Map([['csv', parcelCsv], ['geojson', parcelGeoJson]]).get(format);
  if (!serialize) throw new Error('Unsupported county export format.');
  return serialize([sanitized], provenance);
}

export function countyShareUrl(value, tmk) {
  const url = new URL(value);
  url.searchParams.set('countyTmk', countyTmk(tmk));
  return url.href;
}
