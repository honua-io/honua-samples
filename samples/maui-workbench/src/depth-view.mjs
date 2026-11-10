export const DEPTH_COLORS = [[174, 221, 225], [80, 166, 190], [32, 102, 153], [25, 56, 99]];
const UNKNOWN = [216, 222, 220];

export function depthColor(value) {
  if (!Number.isFinite(value) || value < 0) return UNKNOWN;
  return DEPTH_COLORS[value < 0.5 ? 0 : value < 1 ? 1 : value < 2 ? 2 : 3];
}

export function paintDepth(canvas, raster) {
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(raster.width, raster.height);
  raster.bands[0].values.forEach((value, index) => {
    image.data.set([...depthColor(value), 255], index * 4);
  });
  context.putImageData(image, 0, 0);
}

export function inspectCell(raster, cell) {
  const value = Number(raster.bands[0].values[cell.y * raster.width + cell.x]);
  const unknown = !Number.isFinite(value) || value < 0;
  return { value: unknown ? null : value, label: unknown ? 'NoData · unknown' : `${value.toFixed(6)} m above ground` };
}

export function connectInspection(canvas, raster) {
  let cell = { x: Math.floor(raster.width / 2), y: Math.floor(raster.height / 2) };
  const show = () => {
    const result = inspectCell(raster, cell);
    const output = document.querySelector('#cell-value');
    output.textContent = result.label;
    output.dataset.value = result.value === null ? 'nodata' : String(result.value);
    document.querySelector('#cell-location').textContent = `Column ${cell.x} · row ${cell.y} · zero-based grid`;
  };
  const pointer = (event) => {
    const box = canvas.getBoundingClientRect();
    cell = { x: Math.min(raster.width - 1, Math.max(0, Math.floor((event.clientX - box.left) / box.width * raster.width))),
      y: Math.min(raster.height - 1, Math.max(0, Math.floor((event.clientY - box.top) / box.height * raster.height))) };
    show();
  };
  const keyboard = (event) => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    cell = { x: Math.max(0, Math.min(raster.width - 1, cell.x + delta[0])),
      y: Math.max(0, Math.min(raster.height - 1, cell.y + delta[1])) };
    show();
  };
  canvas.addEventListener('pointermove', pointer);
  canvas.addEventListener('click', pointer);
  canvas.addEventListener('keydown', keyboard);
  canvas.addEventListener('focus', show);
  show();
  return () => {
    canvas.removeEventListener('pointermove', pointer); canvas.removeEventListener('click', pointer);
    canvas.removeEventListener('keydown', keyboard); canvas.removeEventListener('focus', show);
  };
}
