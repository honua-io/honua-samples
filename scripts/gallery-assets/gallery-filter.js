(function () {
  // Progressive enhancement: without this file every stable sample link stays visible.
  function safe(fn) { try { return fn(); } catch { return undefined; } }
  function all(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function selected(selector) { return all(selector).filter(function (input) { return input.checked; }).map(function (input) { return input.value; }); }
  function csv(value) { return (value || "").split(",").map(function (part) { return part.trim(); }).filter(Boolean); }
  function intersects(left, right) { return left.some(function (value) { return right.indexOf(value) !== -1; }); }

  function stateFromControls() {
    var search = document.getElementById("filter-search");
    var runnable = document.getElementById("filter-runnable");
    return { q: search ? search.value.trim() : "", kind: selected(".filter-kind"), caps: selected(".filter-cap"), sdk: selected(".filter-sdk"), edition: selected(".filter-edition"), source: selected(".filter-source"), run: !!(runnable && runnable.checked) };
  }

  function stateUrl(state) {
    var url = new URL(window.location.href); url.search = "";
    if (state.q) url.searchParams.set("q", state.q);
    if (state.kind.length) url.searchParams.set("kind", state.kind.join(","));
    if (state.caps.length) url.searchParams.set("caps", state.caps.join(","));
    if (state.sdk.length) url.searchParams.set("sdk", state.sdk.join(","));
    if (state.edition.length) url.searchParams.set("edition", state.edition.join(","));
    if (state.source.length) url.searchParams.set("source", state.source.join(","));
    if (state.run) url.searchParams.set("run", "1");
    return url;
  }

  function applyFilters(updateAddress) {
    var state = stateFromControls(); var query = state.q.toLowerCase(); var visible = 0; var total = 0;
    all(".category").forEach(function (section) {
      var sectionVisible = 0;
      all(".card[data-id]", section).forEach(function (card) {
        total++;
        var show =
          (!query || (card.getAttribute("data-search") || card.textContent || "").toLowerCase().indexOf(query) !== -1) &&
          (!state.kind.length || state.kind.indexOf(card.getAttribute("data-content-kind") || "") !== -1) &&
          (!state.run || card.getAttribute("data-runnable") === "yes") &&
          (!state.caps.length || intersects(state.caps, csv(card.getAttribute("data-capabilities")))) &&
          (!state.sdk.length || intersects(state.sdk, csv(card.getAttribute("data-sdks")))) &&
          (!state.edition.length || state.edition.indexOf(card.getAttribute("data-edition") || "") !== -1) &&
          (!state.source.length || state.source.indexOf(card.getAttribute("data-source") || "") !== -1);
        card.hidden = !show;
        if (show) { visible++; sectionVisible++; }
      });
      section.hidden = sectionVisible === 0;
    });

    var count = (state.q ? 1 : 0) + state.kind.length + state.caps.length + state.sdk.length + state.edition.length + state.source.length + (state.run ? 1 : 0);
    all(".content-kind-section").forEach(function (section) {
      var cards = all(".card[data-id]", section);
      section.hidden = cards.length ? !cards.some(function (card) { return !card.hidden; }) : count > 0;
    });

    var status = document.getElementById("filter-status"); if (status) status.textContent = count ? "Showing " + visible + " of " + total + " samples." : "Showing all " + total + " samples.";
    var active = document.getElementById("filter-active-count"); if (active) active.textContent = String(count);
    var empty = document.getElementById("empty-state"); if (empty) empty.hidden = visible !== 0;
    var url = stateUrl(state);
    var share = document.getElementById("cap-share-url"); if (share) share.value = url.toString();
    var shareRow = document.getElementById("cap-share-row"); if (shareRow) shareRow.hidden = count === 0;
    if (updateAddress && history.replaceState) history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function setChecked(selector, values) { all(selector).forEach(function (input) { input.checked = values.indexOf(input.value) !== -1; }); }
  function readPreset() {
    var params = new URLSearchParams(location.search); var search = document.getElementById("filter-search"); var runnable = document.getElementById("filter-runnable");
    if (search) search.value = params.get("q") || "";
    setChecked(".filter-kind", csv(params.get("kind"))); setChecked(".filter-cap", csv(params.get("caps"))); setChecked(".filter-sdk", csv(params.get("sdk"))); setChecked(".filter-edition", csv(params.get("edition"))); setChecked(".filter-source", csv(params.get("source")));
    if (runnable) runnable.checked = params.get("run") === "1";
  }

  function bind() {
    all(".filter-kind, .filter-cap, .filter-sdk, .filter-edition, .filter-source, #filter-runnable").forEach(function (input) { input.addEventListener("change", function () { safe(function () { applyFilters(true); }); }); });
    var search = document.getElementById("filter-search"); if (search) search.addEventListener("input", function () { safe(function () { applyFilters(true); }); });
    var clear = document.getElementById("filter-clear"); if (clear) clear.addEventListener("click", function () { all(".filter-kind, .filter-cap, .filter-sdk, .filter-edition, .filter-source, #filter-runnable").forEach(function (input) { input.checked = false; }); if (search) search.value = ""; applyFilters(true); });
    var toggle = document.getElementById("filter-toggle"); var filters = document.getElementById("catalog-filters"); if (toggle && filters) toggle.addEventListener("click", function () { var open = toggle.getAttribute("aria-expanded") === "true"; toggle.setAttribute("aria-expanded", String(!open)); filters.classList.toggle("is-open", !open); });
    document.addEventListener("keydown", function (event) { if (event.key === "/" && search && !/input|textarea|select/i.test(document.activeElement.tagName)) { event.preventDefault(); search.focus(); } });
    var copy = document.getElementById("cap-share-copy"); if (copy) copy.addEventListener("click", function () { var input = document.getElementById("cap-share-url"); var note = document.getElementById("cap-share-status"); if (!input) return; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(function () { if (note) note.textContent = "Link copied."; }); else input.select(); });
  }

  document.addEventListener("DOMContentLoaded", function () { safe(readPreset); bind(); safe(function () { applyFilters(false); }); });
})();
