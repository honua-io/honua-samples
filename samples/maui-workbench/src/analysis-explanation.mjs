// Keep delayed read-only explanations tied to the current query and source.
export function bindAsyncExplanation(context) {
  let revision = 0;
  const invalidate = () => { revision += 1; context.output.replaceChildren(); };
  context.trigger.addEventListener(context.event, async (event) => {
    event.preventDefault();
    const current = ++revision;
    const model = context.model();
    const active = () => current === revision && context.model() === model;
    context.output.textContent = context.pending;
    try {
      const result = await context.run(model);
      if (active()) context.render(result);
    } catch (error) { if (active()) context.output.textContent = error.message; }
  });
  return { invalidate };
}
