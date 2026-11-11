class BudgetedRangeSource {
  readers = new WeakMap();
  activeReader;
  closed = false;

  use(context) {
    if (this.closed) throw new Error('Imagery decoder is closed.');
    this.activeReader = context.readRange;
    this.readers.set(context.signal, context.readRange);
  }

  async fetch(slices, signal) {
    if (this.closed) throw new Error('Imagery decoder is closed.');
    const read = this.readers.get(signal) ?? this.activeReader;
    if (!read) throw new Error('No active bounded imagery request.');
    return Promise.all(slices.map(async ({ offset, length }) => {
      const bytes = await read({ offset, length });
      return Uint8Array.from(bytes).buffer;
    }));
  }

  get fileSize() { return null; }
  async close() { this.closed = true; this.activeReader = undefined; }
}

async function readPixels({ request, context, source, images, metadata }) {
  source.use(context);
  const decimation = request.sampling?.overviewDecimation ?? 1;
  const image = images.find((candidate) => Math.round(metadata.width / candidate.getWidth()) === decimation);
  if (!image) throw new Error('Requested imagery overview is unavailable.');
  const width = request.sampling?.width ?? request.width;
  const height = request.sampling?.height ?? request.height;
  const bands = request.bands ?? metadata.bands.map((band) => band.index);
  const values = await image.readRasters({
    window: [Math.floor(request.x / decimation), Math.floor(request.y / decimation),
      Math.min(image.getWidth(), Math.ceil((request.x + request.width) / decimation)),
      Math.min(image.getHeight(), Math.ceil((request.y + request.height) / decimation))],
    samples: bands.map((band) => band - 1), width, height, interleave: false,
    resampleMethod: request.sampling?.resampling ?? 'nearest', signal: context.signal,
  });
  return { width, height, bands: bands.map((band, index) => ({ band, values: values[index] })) };
}

export function createBoundedCogDecoder({ open, inspect }) {
  const source = new BudgetedRangeSource();
  let tiff;
  let images = [];
  let metadata;
  return {
    async inspect(context) {
      source.use(context);
      tiff ??= await open(source, context.signal);
      images = await Promise.all(Array.from({ length: await tiff.getImageCount() }, (_, index) => tiff.getImage(index)));
      metadata = inspect(images);
      return metadata;
    },
    async readWindow(request, context) {
      if (!metadata) throw new Error('Inspect imagery before reading pixels.');
      return readPixels({ request, context, source, images, metadata });
    },
    async dispose() { await tiff?.close(); await source.close(); images = []; metadata = undefined; },
  };
}
