import { bindAsyncExplanation } from './analysis-explanation.mjs';
import { executeHonuaAgentTool } from '@honua/sdk-js/agent-tools';
import { previewAnalysisCql2 } from './analysis-query.mjs';

function describeField(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = row.attributes[field];
    if (value != null && !['string', 'number', 'boolean'].includes(typeof value)) continue;
    const label = value == null ? '(missing)' : String(value).slice(0, 120);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const values = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const examples = values.slice(0, 5).map(([value, count]) => `${value}: ${count}`).join('; ');
  return `${field} — ${examples}${values.length > 5 ? `; ${values.length - 5} more values` : ''}`;
}

export async function summarizeAnalysisSelection(model) {
  const targets = model.table.selectionTargets();
  const snapshot = model.table.snapshot;
  if (!['ready', 'partial'].includes(snapshot.state) || snapshot.stale) throw new Error('Finish the current query before summarizing.');
  const selected = new Set(snapshot.selection);
  const rows = snapshot.rows.filter((row) => row && selected.has(row.key));
  const filter = previewAnalysisCql2(model.registry.snapshot.clauses);
  const result = await executeHonuaAgentTool({ getSelection: () => targets }, { name: 'summarizeSelection' }, {
    allowedTools: ['summarizeSelection'], allowActions: false,
  });
  if (result.status !== 'ok') throw new Error('The SDK could not summarize this selection.');
  const fields = model.catalog.fields.filter((field) => !['record_id', 'tmk_txt', 'opened_at'].includes(field));
  return { count: result.data.count, layer: model.catalog.label, endpoint: model.endpoint, filter,
    scope: `${rows.length} of ${result.data.count} selected records are in the loaded table window. Field counts describe those loaded records only.`,
    fields: rows.length ? fields.map((field) => describeField(rows, field)) : [],
    tool: result.tool };
}

export function bindSelectionExplanation(context) {
  return bindAsyncExplanation({ ...context, trigger: context.button, event: 'click',
    pending: 'Summarizing the selected records…', run: summarizeAnalysisSelection,
    render(summary) {
      const lines = [`${summary.count} selected from ${summary.layer}.`, summary.scope,
        ...summary.fields, `Filter (CQL2): ${summary.filter}`, `Source: ${summary.endpoint}`,
        `Read-only SDK tool: ${summary.tool}. These are descriptive counts, not a model-generated comparison.`];
      context.output.replaceChildren(...lines.map((text) => {
        const paragraph = document.createElement('p'); paragraph.textContent = text; return paragraph;
      }));
    } });
}
