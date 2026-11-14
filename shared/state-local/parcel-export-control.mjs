import { parcelCsv, parcelGeoJson } from './parcel-export.mjs';

function download(feature, contents, format) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([contents], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/geo+json' }));
  link.download = `parcel-${feature.properties.t9}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

export async function mountParcelExports({ root, selected }) {
  const status = document.createElement('p');
  status.className = 'faint';
  status.setAttribute('role', 'status');
  status.textContent = 'Loading snapshot export sources…';
  root.replaceChildren(status);
  try {
    const response = await fetch('/state-local/data/approved/manifest.json');
    if (!response.ok) throw new Error('Snapshot manifest unavailable');
    const provenance = await response.json();
    if (!provenance.snapshot || !provenance.attribution || !provenance.warning || !provenance.sources?.parcels?.sourceUrl || !provenance.sources.parcels.license) throw new Error('Incomplete snapshot provenance');
    const buttons = [['CSV', 'csv', parcelCsv], ['GeoJSON', 'geojson', parcelGeoJson]].map(([label, format, serialize]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn sm';
      button.textContent = `Download selected parcel ${label}`;
      button.addEventListener('click', () => {
        const feature = selected();
        download(feature, serialize([feature], provenance), format);
      });
      return button;
    });
    status.textContent = `Snapshot ${provenance.snapshot} · ${provenance.attribution} · Generalized display geometry, not legal boundaries.`;
    root.append(...buttons);
  } catch {
    status.textContent = 'Snapshot exports unavailable: source provenance could not be loaded.';
  }
}
