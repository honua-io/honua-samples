const fs = require('node:fs/promises');

module.exports = async ({ github, context }) => {
  const marker = '<!-- honua-gallery-health:v1 -->';
  const repo = context.repo;
  const run = `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`;
  const report = await fs.readFile('.artifacts/gallery-health/latest.json', 'utf8').then(JSON.parse).catch(() => null);
  const summary = report && await fs.readFile('.artifacts/gallery-health/latest.md', 'utf8').catch(() => null) || 'The health runner did not finish. Inspect the run and its screenshot artifact.';
  const issues = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'all', labels: 'gallery-health', per_page: 100 });
  const existing = issues.find((issue) => issue.body?.includes(marker));
  const body = `${marker}\n${summary.slice(0, 55000)}\n\n[Latest run, readable summary and screenshot artifact](${run})\n\nThis issue is updated in place on each nightly run and closes after a passing run.`;
  if (existing) {
    await github.rest.issues.update({ ...repo, issue_number: existing.number, body, state: report?.ok ? 'closed' : 'open' });
  } else if (!report?.ok) {
    await github.rest.issues.createLabel({ ...repo, name: 'gallery-health', color: 'd73a4a', description: 'Automated public gallery health' })
      .catch((error) => { if (error.status !== 422) throw error; });
    await github.rest.issues.create({ ...repo, title: 'Public gallery nightly health failures', body, labels: ['gallery-health'] });
  }
};
