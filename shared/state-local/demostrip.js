// Keep demo/real data labels visible when the disclosure strip overflows its
// height cap: a sticky key row repeats the badges and the sources link, and
// the strip becomes a focusable, named scroll region for keyboard users.
(() => {
  const NAME = 'Data labels and sources';
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
    const ownTabIndex = strip.getAttribute('tabindex');
    const ownName = strip.getAttribute('aria-label');
    const sync = () => {
      const overflowing = strip.scrollHeight > strip.clientHeight + 1;
      strip.classList.toggle('is-overflowing', overflowing);
      if (overflowing) {
        strip.tabIndex = 0;
        if (!ownName) strip.setAttribute('aria-label', NAME);
      } else {
        if (ownTabIndex === null) strip.removeAttribute('tabindex');
        if (!ownName) strip.removeAttribute('aria-label');
      }
    };
    sync();
    if ('ResizeObserver' in window) new ResizeObserver(sync).observe(strip);
    else window.addEventListener('resize', sync);
  }
  const start = () => document.querySelectorAll('.demostrip').forEach(watch);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
