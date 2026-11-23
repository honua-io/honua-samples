// Keep demo/real data labels visible when the disclosure strip overflows its
// height cap: a sticky key row repeats the badges and the sources link.
(() => {
  function keyRow(strip) {
    const row = document.createElement('div');
    row.className = 'demostrip-key';
    row.setAttribute('aria-hidden', 'true');
    for (const tag of strip.querySelectorAll(':scope > .tag-real, :scope > .tag-demo')) row.append(tag.cloneNode(true));
    const sources = strip.querySelector('a[href]');
    if (sources) {
      const copy = sources.cloneNode(true);
      copy.tabIndex = -1;
      row.append(copy);
    }
    return row.childElementCount ? row : null;
  }
  function watch(strip) {
    const row = keyRow(strip);
    if (row) strip.prepend(row);
    const sync = () => {
      strip.classList.toggle('is-overflowing', strip.scrollHeight > strip.clientHeight + 1);
    };
    sync();
    if ('ResizeObserver' in window) new ResizeObserver(sync).observe(strip);
    else window.addEventListener('resize', sync);
  }
  const start = () => document.querySelectorAll('.demostrip').forEach(watch);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
