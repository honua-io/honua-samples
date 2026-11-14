import { countyExport, countyShareUrl } from './county-export.mjs';
import { download } from './download.mjs';

export function mountCountyExports(state) {
  for (const button of state.root.querySelectorAll('[data-county-export]')) button.addEventListener('click', () => {
    if (!state.selection || !state.publication) return;
    try {
      const format = button.dataset.countyExport;
      const contents = countyExport(state.publication, state.selection, format);
      download(`county-parcel-${state.selection.properties.tmk_txt}.${format}`, contents, format);
    } catch (error) { state.status.textContent = `County export unavailable: ${error.message}`; }
  });
}

export function updateCountyExports(state) {
  state.root.querySelector('#countyExports').disabled = !state.selection;
  const share = state.root.querySelector('#countyShare');
  share.hidden = !state.selection;
  if (state.selection) share.href = countyShareUrl(location.href, state.selection.properties.tmk_txt);
  else share.removeAttribute('href');
}
