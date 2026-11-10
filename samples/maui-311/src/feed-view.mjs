import { verifyFeed } from './feed.mjs';
import { element } from './view.mjs';

export function bindFeed(binding) {
  const button = document.querySelector('#check-feed');
  const status = document.querySelector('#feed-status');
  const links = document.querySelector('#feed-links');
  let records = [];
  let controller;
  button.addEventListener('click', async () => {
    controller?.abort();
    const attempt = new AbortController();
    controller = attempt;
    button.disabled = true;
    links.replaceChildren();
    status.textContent = 'Checking every OGC page against the dashboard snapshot…';
    try {
      const href = await verifyFeed({ binding, records, getJson: async (url) => {
        const response = await fetch(url, { credentials: 'omit', redirect: 'error', cache: 'no-store',
          signal: AbortSignal.any([attempt.signal, AbortSignal.timeout(30_000)]) });
        if (!response.ok) throw new Error(`OGC feed returned HTTP ${response.status}`);
        return response.json();
      } });
      if (attempt.signal.aborted) return;
      status.textContent = `Verified ${records.length} exercise requests against the dashboard snapshot. The collection contains all requests; dashboard filters do not change this feed.`;
      links.append(element('a', 'OGC API Features collection', { href }), document.createTextNode(' · '),
        element('a', 'GeoJSON items (paginated)', { href: `${href}/items?limit=200` }));
    } catch (error) {
      if (!attempt.signal.aborted) status.textContent = `Feed not verified. ${error.message}. You can retry; dashboard downloads remain available.`;
    } finally {
      if (!attempt.signal.aborted) button.disabled = false;
    }
  });
  return (snapshot) => {
    controller?.abort();
    records = snapshot;
    links.replaceChildren();
    button.disabled = !snapshot.length;
    status.textContent = 'The OGC feed has not been checked against this dashboard snapshot.';
  };
}
