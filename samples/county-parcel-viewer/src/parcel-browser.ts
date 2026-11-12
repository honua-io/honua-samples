import {
  createHonuaApplicationContext, createHonuaFeatureInspectionFromApplicationContext,
  createHonuaFeatureTable, mountHonuaApplication,
  type HonuaFeatureInspectionElement, type HonuaFeatureTableElement,
  type HonuaFeatureTable, type HonuaFeatureTableSecureExportAdapter,
} from "@honua/sdk-js/web-components";
import { DEFAULT_BASE_URL, DISPLAY_SNAPSHOT, type ViewerConfig } from "./config.js";
import { layer, parcelById, type Parcel } from "./data.js";
import { normalizeTmk } from "./tmk.js";

const EXPORT_ROWS = 100;
const EXPORT_BYTES = 1_000_000;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const detail = (error: unknown) => error instanceof Error ? error.message : String(error);

function download(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPolicy(config: ViewerConfig, sourceId: string): HonuaFeatureTableSecureExportAdapter {
  return {
    id: "maui-public-demo",
    authorize: (request) => config.parcelsUrl === `${DEFAULT_BASE_URL}/rest/services/maui-parcels/FeatureServer/1`
      && request.sourceId === sourceId && request.maxRows <= EXPORT_ROWS && request.maxBytes <= EXPORT_BYTES
      ? { authorized: true, authorizationId: "anonymous-public-parcels" }
      : { authorized: false, reason: "Only the public Maui demo parcel layer can be exported here." },
    record: (provenance) => { element("export-status").dataset.provenance = JSON.stringify(provenance); },
  };
}

function connectFilter(table: HonuaFeatureTable, signal: AbortSignal): void {
  const form = element<HTMLFormElement>("parcel-filter");
  const input = element<HTMLInputElement>("filter-tmk");
  const status = element("browse-status");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const tmk = input.value.trim() ? normalizeTmk(input.value) : undefined;
    input.setCustomValidity(tmk === null ? "Enter a 9-digit TMK, or leave this empty for all parcels." : "");
    if (!input.reportValidity()) return;
    void table.setFilters(tmk ? [{ id: "tmk", owner: { kind: "component", id: "parcel-browser" },
      field: "tmk_txt", operator: "=", value: tmk, effect: "filter" }] : [])
      .catch((error) => { status.textContent = `Filter failed: ${detail(error)}`; });
  }, { signal });
  input.addEventListener("input", () => input.setCustomValidity(""), { signal });
  form.addEventListener("reset", () => {
    input.setCustomValidity("");
    void table.setFilters([]).catch((error) => { status.textContent = `Filter failed: ${detail(error)}`; });
  }, { signal });
}

function connectExports(options: {
  config: ViewerConfig; table: HonuaFeatureTable; sourceId: string;
  selected: () => Parcel | undefined; signal: AbortSignal;
}): void {
  const { config, table, sourceId, selected, signal } = options;
  const adapter = exportPolicy(config, sourceId);
  const status = element("export-status");
  const csv = element<HTMLButtonElement>("export-csv");
  const geojson = element<HTMLButtonElement>("export-geojson");
  const run = async (button: HTMLButtonElement, exportFile: () => Promise<string>) => {
    button.disabled = true;
    try { status.textContent = await exportFile(); }
    catch (error) { if (!signal.aborted) status.textContent = `Export failed: ${detail(error)}`; }
    finally { if (!signal.aborted) button.disabled = button === geojson && selected()?.id === undefined; }
  };
  csv.disabled = false;
  csv.addEventListener("click", () => void run(csv, async () => {
    const result = await table.secureExport({ format: "csv", maxRows: EXPORT_ROWS, adapter, signal });
    if (signal.aborted) return "Export cancelled.";
    download(result.content, "maui-parcels.csv", "text/csv;charset=utf-8");
    return `Exported ${result.rowCount} rows${result.truncated ? "; limited to the export budget, not the full result" : ""}.`;
  }), { signal });
  geojson.addEventListener("click", () => void run(geojson, async () => {
    const id = selected()?.id;
    if (id === undefined) throw new Error("Select a live parcel first.");
    const authorization = await adapter.authorize({ sourceId, format: "json", selectionOnly: true,
      maxRows: 1, maxBytes: EXPORT_BYTES, authorizationScope: ["anonymous-public"], signal });
    if (!authorization.authorized) throw new Error(authorization.reason);
    const parcel = await parcelById(config, id, signal);
    if (!parcel) throw new Error("The selected parcel is no longer available.");
    const content = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", id,
      properties: { tmk_txt: parcel.tmk, gisacres: parcel.gisAcres, taxacres: parcel.taxAcres }, geometry: parcel.geometry }] });
    if (new TextEncoder().encode(content).length > EXPORT_BYTES) throw new Error("Parcel exceeds the 1 MB export budget.");
    if (signal.aborted) return "Export cancelled.";
    await adapter.record({ sourceId, adapterId: adapter.id, authorizationId: authorization.authorizationId,
      exportedAt: new Date().toISOString(), format: "json", rowCount: 1, truncated: false, authorizationScope: ["anonymous-public"] });
    download(content, `maui-parcel-${parcel.tmk}.geojson`, "application/geo+json");
    return `Exported selected parcel ${parcel.tmk}; re-queried by stable source ID.`;
  }), { signal });
}

function connectPointerSelection(table: HonuaFeatureTable, signal: AbortSignal): void {
  // SDK 0.3.2 can replace a focused row before its click fires. Remove after upgrading the SDK.
  element("parcel-table").addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const path = event.composedPath();
    if (path.some((node) => node instanceof Element && node.matches("a, button, input, select, textarea, [contenteditable]"))) return;
    const row = path.find((node) => node instanceof HTMLElement && node.dataset.rowKey) as HTMLElement | undefined;
    if (row?.dataset.rowKey) table.select([row.dataset.rowKey], { replace: true });
  }, { signal });
}

export async function createParcelBrowser(config: ViewerConfig, onPick: (id: string | number) => void) {
  const status = element("browse-status");
  if (DISPLAY_SNAPSHOT) {
    status.textContent = "This publication uses a display snapshot. Live browsing and exports are unavailable.";
    element("parcel-filter").hidden = true;
    element("parcel-components").hidden = true;
    return { select: (_parcel: Parcel) => {}, clear: () => {}, dispose: () => {} };
  }
  const { source, idField } = await layer(config.parcelsUrl);
  if (!source) throw new Error("The parcel source is unavailable.");
  const sourceId = source.descriptor.id;
  const context = createHonuaApplicationContext({ status: "ready", binding: { source, sourceIdentity: sourceId },
    authorization: { status: "authorized", scopes: ["anonymous-public"] } });
  const inspection = createHonuaFeatureInspectionFromApplicationContext<Record<string, unknown>>(context, {
    presentation: { titleField: "tmk_txt", fields: [idField, "gisacres", "taxacres"] },
    budgets: { pageSize: 25, maxPages: 1, maxOverlappingResults: 1 },
  });
  const table = createHonuaFeatureTable<Record<string, unknown>>({ source, sourceId, identityField: idField,
    columns: [{ field: idField, label: "Source ID" }, { field: "tmk_txt", label: "TMK" },
      { field: "gisacres", label: "GIS acres", type: "number" }, { field: "taxacres", label: "Tax acres", type: "number" }],
    budgets: { pageSize: 25, maxCachedRows: 100, maxRequests: 20, maxExportRows: EXPORT_ROWS,
      maxExportBytes: EXPORT_BYTES, windowOverscan: 0 }, authorizationScope: ["anonymous-public"],
  });
  let mounted: Awaited<ReturnType<typeof mountHonuaApplication>> | undefined;
  const lifetime = new AbortController();
  let selected: Parcel | undefined;
  let synchronizing = false;
  let previousSelection = "";
  const unsubscribe = table.subscribe((snapshot) => {
    status.dataset.state = snapshot.state;
    status.textContent = snapshot.error ? `Parcel browsing failed: ${detail(snapshot.error)}`
      : snapshot.state === "loading" ? "Loading parcels…"
      : snapshot.count.loaded === 0 ? "No parcels match this filter."
      : `${snapshot.count.loaded} parcels loaded in pages of 25. ${snapshot.message ?? "Select a row to inspect it."}`;
    const key = snapshot.selection.join("|");
    if (key === previousSelection) return;
    previousSelection = key;
    const target = table.selectionTargets()[0];
    if (!synchronizing && target) onPick(typeof target === "object" ? target.id : target);
  });
  const dispose = () => {
    lifetime.abort(); unsubscribe(); mounted?.dispose(); inspection.dispose(); table.dispose(); context.dispose();
  };
  try {
    mounted = await mountHonuaApplication({ host: element("parcel-components"), context });
    element<HonuaFeatureTableElement>("parcel-table").table = table;
    const inspectionElement = element<HonuaFeatureInspectionElement>("parcel-inspection");
    inspectionElement.inspection = inspection;
    inspectionElement.messages = { diagnostic: (diagnostic) => diagnostic.code === "attachments-unsupported"
      ? "This parcel service does not publish attachments." : diagnostic.message };
    connectPointerSelection(table, lifetime.signal);
    connectFilter(table, lifetime.signal);
    connectExports({ config, table, sourceId, selected: () => selected, signal: lifetime.signal });
    await table.refresh();
  } catch (error) { dispose(); throw error; }
  return {
    select(parcel: Parcel) {
      selected = parcel;
      element<HTMLButtonElement>("export-geojson").disabled = parcel.id === undefined;
      if (parcel.id === undefined) return;
      const target = { sourceId, id: parcel.id };
      synchronizing = true;
      context.update({ selection: [target] });
      table.select(table.keysForTargets([target]), { replace: true });
      synchronizing = false;
      void inspection.openFromTableRow({ target }).catch((error) => {
        if (!lifetime.signal.aborted) status.textContent = `Inspection failed: ${detail(error)}`;
      });
    },
    clear() {
      selected = undefined;
      element<HTMLButtonElement>("export-geojson").disabled = true;
      synchronizing = true;
      context.update({ selection: [] });
      table.select([], { replace: true });
      synchronizing = false;
      inspection.close();
    },
    dispose,
  };
}
