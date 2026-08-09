export const DESKTOP_VIEWPORT = Object.freeze({ width: 1440, height: 1000 });
export const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 844 });

export function visibleViewportRatio(box, viewport) {
  if (!box || !viewport || box.width <= 0 || box.height <= 0) return 0;
  const visibleTop = Math.max(0, box.y);
  const visibleBottom = Math.min(viewport.height, box.y + box.height);
  return Math.max(0, visibleBottom - visibleTop) / viewport.height;
}

export function resultTimeoutMs(sample) {
  return sample?.dataMode === "fixture" ? 3_000 : 5_000;
}

export function viewportFailure(label, ratio, minimum) {
  return ratio >= minimum ? null : `${label} result occupies ${(ratio * 100).toFixed(1)}% of the first viewport; requires at least ${(minimum * 100).toFixed(0)}%`;
}
