import { executeHonuaAgentTool } from '@honua/sdk-js/agent-tools';

const operations = new Set(['query', 'queryAggregate', 'spatialAggregate', 'processes']);

export async function explainAnalysisCapability(model, capability) {
  if (!operations.has(capability)) throw new Error('Choose one of the listed operations.');
  const descriptor = model?.source.descriptor;
  if (!descriptor || !(descriptor.capabilities instanceof Set)) throw new Error('Reconnect to discover the source capabilities.');
  const result = await executeHonuaAgentTool({ listSources: () => [{ ...descriptor, capabilities: [...descriptor.capabilities] }] }, {
    name: 'explainCapabilityGap', args: { sourceId: descriptor.id, capability },
  }, { allowedTools: ['explainCapabilityGap'], allowActions: false });
  if (result.status !== 'ok') throw new Error('The SDK could not inspect this capability.');
  return { ...result.data, tool: result.tool, layer: model.catalog.label, endpoint: model.endpoint };
}

export function bindCapabilityExplanation(context) {
  let revision = 0;
  const invalidate = () => { revision += 1; context.output.replaceChildren(); };
  context.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = ++revision;
    const model = context.model();
    context.output.textContent = 'Checking the source descriptor…';
    try {
      const result = await explainAnalysisCapability(model, context.select.value);
      if (current !== revision || context.model() !== model) return;
      context.output.textContent = [result.message, `Source: ${result.layer} · ${result.endpoint}`,
        `Advertised operations: ${result.capabilities.join(', ') || '(none)'}.`,
        result.supported ? 'Advertising an operation does not verify permissions or successful execution.'
          : 'This page cannot offer that operation through this source. Choose a source that advertises it.',
        `Read-only SDK tool: ${result.tool}. No operation was executed.`].join('\n\n');
    } catch (error) { if (current === revision) context.output.textContent = error.message; }
  });
  context.select.addEventListener('change', invalidate);
  return { invalidate };
}
