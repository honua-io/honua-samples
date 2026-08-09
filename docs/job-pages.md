# Job-first developer pages

`jobs/*.json` is the canonical source for task pages that compare Honua's raw
server contract with JavaScript, Python, and .NET. A job is one card. Languages
are tabs, not duplicate cards.

The render order is fixed:

1. Server operation, capability id, protocol, HTTP method, endpoint, fixture,
   authentication, raw request/response, maturity, and evidence.
2. Normalized request, expected result, and a machine-checkable semantic
   assertion.
3. A reference matrix for HTTP, CLI, JavaScript, Python, and .NET. Every
   available cell links the exact symbol; unavailable cells are explicit gaps.
4. Code tabs for available SDKs only.
5. Ordered steps for walkthroughs/projects.
6. Optional Console and AI context panels.

The Console panel may include a screenshot only when the real route exists and
the capture records route/version, role, redaction, accessible callouts,
desktop viewport, source/server versions, fixture key, and Playwright golden
receipt. Searchable and copyable JSON/API/CLI configuration remains primary.
Planned screens never get fabricated screenshots.

The AI panel is context, not a separate sample card. It must identify the real
API, provider/data boundary, deterministic validation, approval boundary,
prohibited autonomous actions, manual fallback, and provenance. Natural
language query plans must be shown before execution. Job submit/cancel/delete
always requires explicit approval.

Run the structural and semantic admission check with:

```bash
npm run test:job-pages
```

Gallery integration should render these sources inside the existing
Example/Walkthrough/Project detail route. It must add request/response inspect
and copy controls, deep-link each code tab to its reference row, and keep any
contract-only or planned project non-runnable until a pinned fixture and live
semantic receipt are admitted.
