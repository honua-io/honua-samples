export function detailStructureFailures({
  contentKind,
  runnable,
  embedPosition,
  codePosition,
  guidePosition,
  guideStepCount,
  expectedOutcomeCount,
  sourcePosition,
  codeViewCount,
}) {
  const failures = [];
  if (contentKind === "example") {
    if (codePosition < 0) failures.push("example detail has no inline code view");
    if (runnable && embedPosition >= 0 && codePosition > embedPosition) failures.push("example detail is not inline-code-first");
  } else if (contentKind === "walkthrough") {
    if (guidePosition < 0) failures.push("walkthrough detail has no ordered guide");
    if (guideStepCount < 3) failures.push("walkthrough guide has fewer than three ordered steps");
    if (expectedOutcomeCount !== 1) failures.push("walkthrough guide has no expected outcome");
    if (codePosition >= 0 && guidePosition > codePosition) failures.push("walkthrough guide does not lead its code view");
  } else if (contentKind === "project") {
    if (sourcePosition < 0) failures.push("project detail has no architecture/source panel");
    if (embedPosition >= 0 && sourcePosition >= 0 && embedPosition > sourcePosition) {
      failures.push("project runtime evidence does not lead architecture/source content");
    }
    if (codeViewCount !== 0) failures.push("project detail incorrectly presents one file as primary code");
  }
  return failures;
}

export function geocodingProofFailures(proof, canvasCount) {
  const failures = [];
  if (proof?.ready !== true) failures.push("geocoding runtime did not report ready");
  if (proof?.lastError) failures.push(`geocoding runtime error: ${proof.lastError}`);
  if (proof?.mode !== "fixture-only") failures.push(`geocoding runtime mode is not fixture-only: ${JSON.stringify(proof?.mode)}`);
  if (!/^\/rest\/services\/[^/]+\/GeocodeServer\/findAddressCandidates$/u.test(proof?.endpoint ?? "")) {
    failures.push(`geocoding endpoint is not the governed fixture route: ${JSON.stringify(proof?.endpoint)}`);
  }
  if (!(proof?.resultCount > 0)) failures.push("geocoding fixture returned no reviewed candidates");
  if (proof?.markerCount !== 1) failures.push(`geocoding selected marker count is not one: ${JSON.stringify(proof?.markerCount)}`);
  if (typeof proof?.selectedAddress !== "string" || !proof.selectedAddress.trim()) failures.push("geocoding selected address is empty");
  if (!Number.isFinite(proof?.selectedScore) || proof.selectedScore <= 0) failures.push("geocoding selected score is not positive");
  if (!Array.isArray(proof?.selectedCoordinates) || proof.selectedCoordinates.length !== 2 || !proof.selectedCoordinates.every(Number.isFinite)) {
    failures.push("geocoding selected coordinates are invalid");
  }
  if (canvasCount < 1) failures.push("geocoding did not mount a map canvas");
  return failures;
}

export function coverageProofFailures(proof, canvasCount) {
  const failures = [];
  const expected = {
    ready: true,
    phase: "ready",
    activeProtocol: "ogc",
    collectionId: "7",
    selectedBand: "elevation",
    mapSourceId: "ogc-elevation",
    imageWidth: 320,
    imageHeight: 220,
    fixtureDigest: "8c7b5b3f8bd31bca2df07c4a70254d75e70d63838c2f77e033def3c1b8d2acff",
    centerPixelValue: 450,
    centerPixelColor: [221, 174, 82],
    ogcByteLength: 281908,
    wcsByteLength: 281908,
    requestCount: 8,
    error: null,
  };

  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(proof?.[key]) !== JSON.stringify(value)) {
      failures.push(`coverage ${key} must equal ${JSON.stringify(value)}`);
    }
  }
  if (!Number.isInteger(canvasCount) || canvasCount < 1) failures.push("coverage map canvas is missing");
  return failures;
}

export function imageryCogProofFailures(proof, canvasCount) {
  const failures = [];
  const expectedTopLevel = {
    ready: true,
    disposed: false,
    selectedAssetKey: "cog",
    inspectionStatus: "ready",
    activeLayerCount: 3,
  };
  for (const [key, value] of Object.entries(expectedTopLevel)) {
    if (proof?.[key] !== value) failures.push(`imagery ${key} must equal ${JSON.stringify(value)}`);
  }

  const directCog = proof?.directCog;
  const expectedDirectCog = {
    phase: "ready",
    selectedAssetKey: "cog",
    candidateCount: 9,
    mapSourceMounted: true,
    mapLayerMounted: true,
    decoderModuleLoads: 1,
    decoderLoads: 1,
    decoderDisposals: 0,
  };
  for (const [key, value] of Object.entries(expectedDirectCog)) {
    if (directCog?.[key] !== value) failures.push(`imagery direct COG ${key} must equal ${JSON.stringify(value)}`);
  }
  if (proof?.resources?.activeRequests !== 0 || proof?.resources?.disposed !== false) {
    failures.push("imagery resource state must be idle and retained");
  }
  if (directCog?.renderState !== "ready" || directCog?.renderMounted !== true) {
    failures.push("imagery direct COG render must be mounted and ready");
  }
  if (directCog?.transferRequests !== 3 || directCog?.transferBytes !== 28672) {
    failures.push("imagery direct COG transfer must be the exact bounded three-range fixture read");
  }
  const expectedValidator = 'etag:"sha256-59ba6110a96c0aba2ab5f5ee27b0eed6ec436956df27bb6312b94573f35190bd"';
  if (directCog?.assetValidator !== expectedValidator) failures.push("imagery COG fixture validator is not exact");
  const ranges = directCog?.ranges;
  if (
    !Array.isArray(ranges) ||
    JSON.stringify(ranges.map((range) => range?.length)) !== JSON.stringify([4096, 12288, 12288]) ||
    ranges.some(
      (range) =>
        range?.outcome !== "success" ||
        range?.status !== 206 ||
        range?.bytesReceived !== range?.length ||
        range?.validator !== expectedValidator,
    )
  ) {
    failures.push("imagery COG ranges must be exact successful fixture 206 reads");
  }
  if (
    JSON.stringify(proof?.fixtureImagePaths) !==
    JSON.stringify([
      "/sdk/imagery-cog-quickstart/app/fixtures/cog/tiles/wms-natural-color.png",
      "/sdk/imagery-cog-quickstart/app/fixtures/cog/tiles/image-server-natural-color.png",
    ])
  ) {
    failures.push("imagery comparison layers must use the exact packaged fixture images");
  }
  if (!Number.isInteger(canvasCount) || canvasCount < 1) failures.push("imagery map canvas is missing");
  return failures;
}

export function columnarProofFailures(proof, canvasCount) {
  const failures = [];
  const expectedTopLevel = {
    ready: true,
    running: false,
    status: "ready",
    completedRuns: 1,
    cancelledRuns: 0,
    featureCount: 1,
    sourceFeatureCount: 4,
  };
  for (const [key, value] of Object.entries(expectedTopLevel)) {
    if (proof?.[key] !== value) failures.push(`columnar ${key} must equal ${JSON.stringify(value)}`);
  }

  const evidence = proof?.evidence;
  if (evidence?.rows !== 1 || evidence?.batches !== 1 || evidence?.transferBytes !== 4160) {
    failures.push("columnar evidence must prove one row in one 4160-byte Arrow batch");
  }
  if (!Number.isFinite(evidence?.peakBackingBytes) || evidence.peakBackingBytes < 1 || evidence.peakBackingBytes > 65536) {
    failures.push("columnar peak backing bytes must be within the fixture ceiling");
  }
  const ceilings = { maxRows: 25, maxBatches: 2, maxTransferBytes: 16384, maxBackingBytes: 65536 };
  if (JSON.stringify(evidence?.ceilings) !== JSON.stringify(ceilings)) failures.push("columnar ceilings are not exact");
  if (
    proof?.plan?.execution !== "server-pushdown" ||
    proof?.plan?.format !== "arrow" ||
    JSON.stringify(proof?.plan?.pushdown) !== JSON.stringify(["columns", "filter", "bbox", "limit", "orderBy"])
  ) {
    failures.push("columnar plan must prove exact Arrow server pushdown");
  }
  let requestUrl;
  try {
    requestUrl = new URL(proof?.request?.url);
  } catch {
    failures.push("columnar request URL is invalid");
  }
  if (
    proof?.request?.method !== "GET" ||
    requestUrl?.origin !== "https://example.invalid" ||
    requestUrl?.pathname !== "/rest/services/Interoperability/Harbors/FeatureServer/0/query" ||
    requestUrl?.searchParams.get("f") !== "arrow" ||
    requestUrl?.searchParams.get("resultRecordCount") !== "25"
  ) {
    failures.push("columnar request must be the bounded fixture Arrow query");
  }
  if (
    JSON.stringify(proof?.rows) !==
    JSON.stringify([
      {
        featureId: 1,
        name: "Honolulu Harbor",
        coordinate: [-157.8583, 21.3069],
        timestamp: "1704164645000",
      },
    ])
  ) {
    failures.push("columnar decoded row does not match the exact fixture result");
  }
  if (!Number.isInteger(canvasCount) || canvasCount < 1) failures.push("columnar map canvas is missing");
  return failures;
}

export function stacFixtureProjectionProofFailures(proof, canvasCount) {
  const failures = [];
  const expected = {
    ready: true,
    loadedCount: 2,
    paginationStatus: "ready for next page",
    selectedItemId: "S2B_MAUI_20260502_WEST",
    selectedAssetKey: "preview",
    selectedAssetFormat: "raster",
    mapReady: true,
    mapImageSourceActive: true,
    mapFootprintSourceActive: true,
    mapSelectionSourceIds: ["selected-stac-image", "selected-stac-footprint"],
    mapSelectionLayerIds: [
      "selected-stac-image-raster",
      "selected-stac-footprint-fill",
      "selected-stac-footprint-line",
    ],
    mappedItemId: "S2B_MAUI_20260502_WEST",
    mappedCoordinates: [
      [-156.72, 20.99],
      [-156.33, 20.99],
      [-156.33, 20.69],
      [-156.72, 20.69],
    ],
    searchRequests: [{ method: "POST", pathname: "/v1/search" }],
    signedAssetKeys: ["preview"],
    previewRequestPaths: ["/v1/collections/sentinel-2-l2a/items/assets/west-maui-preview.png"],
  };
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(proof?.[key]) !== JSON.stringify(value)) {
      failures.push(`STAC fixture projection ${key} must equal ${JSON.stringify(value)}`);
    }
  }
  if (!Number.isInteger(canvasCount) || canvasCount < 1) failures.push("STAC fixture projection map canvas is missing");
  return failures;
}
