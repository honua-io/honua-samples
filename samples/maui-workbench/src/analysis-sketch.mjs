import { createEditSketchWorkflow } from '@honua/sdk-js/contract';
import { createTerraDrawSketch } from '@honua/sdk-js/runtime';
import { createHonuaWebComponentController } from '@honua/app-platform/web-components';
import { polygonClause } from './analysis-spatial.mjs';

export async function createAnalysisSketch(map, context) {
  const model = createEditSketchWorkflow({ source: context.source, kind: 'create',
    feature: { attributes: {} }, sketchTools: { polygon: 'supported' } });
  let disposed = false;
  let drawing = false;
  const handle = await createTerraDrawSketch(map, { model,
    applyGeometry(tool, geometry) {
      if (tool !== 'polygon') return false;
      try { const clause = polygonClause(geometry); queueMicrotask(() => { if (!disposed) context.onGeometry(clause); }); }
      catch (error) { context.onError(error); }
      return false;
    },
    onFinish() { void context.element.setMode('off'); },
  });
  const stop = () => {
    drawing = false;
    handle.cancel();
    const ids = handle.draw.getSnapshot().map((feature) => feature.id);
    if (ids.length) handle.draw.removeFeatures(ids);
  };
  const controller = createHonuaWebComponentController({ sketchGeometry: {
    startMode(mode) {
      stop();
      if (disposed || mode === 'off') return;
      if (mode !== 'polygon') throw new Error('Choose Polygon to filter records. Point and line filters are not supported.');
      context.measurement.setMode('off');
      handle.setTool('polygon');
      drawing = true;
    }, stop,
  } });
  const report = (event) => { if (event.detail.status === 'error') context.onError(new Error(event.detail.message)); };
  const measure = (event) => { if (event.detail.mode !== 'off') void context.element.setMode('off'); };
  return { attach() {
      context.element.addEventListener('honua-sketch-change', report);
      context.measurement.addEventListener('honua-measure-change', measure);
      context.element.controller = controller;
    },
    get drawing() { return drawing; },
    cancel() { void context.element.setMode('off'); },
    dispose() {
      disposed = true;
      context.element.removeEventListener('honua-sketch-change', report);
      context.measurement.removeEventListener('honua-measure-change', measure);
      if (context.element.controller === controller) context.element.controller = undefined;
      controller.destroy(); handle.stop();
    } };
}
