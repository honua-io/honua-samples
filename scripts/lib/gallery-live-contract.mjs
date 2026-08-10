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
