# Maui questions in a stock MCP client

Generate a read-only client setup and a realistic question from the same verified
import receipts used by the Maui demos. This is preparation for the agent moment;
generating the file does not mean an agent has answered the question successfully.

First follow [the data recipe](state-local-data.md). The required layers must
already be activated for anonymous reads with anonymous writes denied. Keep the
snapshot directory and deployment receipts together. Generation checks snapshot
hashes, the actual managed table, department folder, access policy and anonymous
layer metadata. It never imports, activates or publishes anything.

From the repository root, with `HONUA_BASE_URL` and `HONUA_ADMIN_API_KEY` set for
the authorized deployment, run:

```sh
mkdir -p artifacts/state-local
node scripts/state-local/cli.mjs mcp-client property artifacts/state-local/maui > artifacts/state-local/property-mcp.json
```

Replace `property` with `311`, `public-works` or `emergency` for the other demos.
The property question binds both `maui-parcels` and `maui-zoning`; each other
question binds its own exercise layer. Missing or changed receipts fail closed.
Administrative credentials are used only by the generator's verification calls.
The output whitelists public fields and contains no administrative key, connection
name, schema, table name or internal service name.

Copy only the generated `clientConfig` object into a stock desktop MCP client's
configuration, such as Claude Desktop's `claude_desktop_config.json`, merging its
`mcpServers.honua` entry with existing servers. Do not replace an existing server
configuration inadvertently. Restart the client, then paste the generated
`prompt` as a new question. The setup uses Node.js 22.12 or newer, `npx`, published
`@honua/mcp-server@0.3.0` and `@honua/sdk-js@0.3.2`, and REST transport. Initial
package acquisition needs network access. `HONUA_API_KEY` is explicitly empty so
the child process queries the public deployment anonymously.

The stock server is the standalone `honua-mcp` binary. Do not substitute an
administrative proxy or add a write credential. Use the emitted public department
source references; internal receipt service names may differ. Inspect schema
before querying. For totals, finish pagination or report an incomplete result.
If the client lacks a spatial join or required field, report that gap. For the
property question, permits remain a manual county MAPPS lookup; no permit records
or CPR suffixes are invented. For exercise questions, answers and exports retain
DEMO DATA and all synthetic provenance fields.

## Recording the agent moment

Run against the newest main-posted default PostGIS-only candidate. Retain the
stock-client version, published package versions, candidate digest, generated
source checksums, question, tool calls and answer in ignored artifacts or CI
artifacts. Compare complete result IDs and derived counts with an independently
computed oracle from the pinned input, including empty-result checks and verified
anonymous read-only policy. Never retain credentials in a transcript. A tool listing, configuration
generation or deterministic SDK query alone cannot pass the agent moment.

The corresponding [SDK queries](../scripts/state-local/sdk/scenarios.json) are
supporting checks. Released Studio publication, the Console walkthrough, public
hosting and the executed stock-client answer remain separate completion gates.
