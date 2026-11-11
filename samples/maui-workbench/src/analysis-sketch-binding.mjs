// A catalog change can overtake map readiness or sketch dependency loading.
export function createLatestSketchBinding({ ready, create }) {
  let revision = 0;
  let sketch;
  const dispose = () => { revision += 1; sketch?.dispose(); sketch = undefined; };
  return {
    get drawing() { return sketch?.drawing; },
    cancel() { sketch?.cancel(); },
    dispose,
    async bind(context) {
      dispose();
      const current = revision;
      await ready;
      if (current !== revision) return;
      const next = await create(context);
      if (current !== revision) { next.dispose(); return; }
      sketch = next;
      next.attach();
    },
  };
}
