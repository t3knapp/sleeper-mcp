import { createClient } from "./sleeper.js";
import { handleBody, SERVER_INFO } from "./mcp.js";
import { TOOLS } from "./tools.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-session-id, mcp-protocol-version, authorization",
  "access-control-expose-headers": "mcp-session-id",
};

let api;

const json = (status, body) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, ...(body === null ? {} : { "content-type": "application/json" }) },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/" && request.method === "GET") {
      return json(200, {
        ...SERVER_INFO,
        mcp_endpoint: `${url.origin}/mcp`,
        tools: TOOLS.map((t) => t.name),
      });
    }

    if (url.pathname !== "/mcp") return json(404, { error: "Not found. The MCP endpoint is /mcp." });

    // Stateless server: no server-initiated stream and no sessions to end.
    if (request.method === "GET" || request.method === "DELETE") return new Response(null, { status: 405, headers: { ...CORS, allow: "POST" } });
    if (request.method !== "POST") return json(405, { error: "Use POST." });

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    // One client per isolate, so the parsed player index is reused across requests.
    api ||= createClient({ kv: env.CACHE });
    const [status, out] = await handleBody(api, body);
    return json(status, out);
  },
};
