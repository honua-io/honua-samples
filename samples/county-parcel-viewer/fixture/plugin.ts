import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { fixtureResponse } from "./service.ts";

async function respond(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url!, "http://fixture.local");
  if (request.method !== "GET" && request.method !== "POST") { response.writeHead(405).end(); return; }
  const params = url.searchParams;
  if (request.method === "POST") {
    let body = "";
    for await (const chunk of request) {
      body += chunk.toString();
      if (body.length > 64_000) { response.writeHead(413).end(); return; }
    }
    for (const [key, value] of new URLSearchParams(body)) params.set(key, value);
  }
  const result = fixtureResponse(url.pathname, params);
  response.writeHead(result.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(result.body));
}

export function fixturePlugin(): Plugin {
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (!request.url?.startsWith("/rest/") && !request.url?.startsWith("/fixture/")) { next(); return; }
    void respond(request, response).catch(() => { response.writeHead(500).end(); });
  };
  return { name: "synthetic-parcel-fixture",
    configureServer: (server) => { server.middlewares.use(middleware); },
    configurePreviewServer: (server) => { server.middlewares.use(middleware); } };
}
