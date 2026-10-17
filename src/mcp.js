// Minimal, stateless MCP server over Streamable HTTP (JSON responses, no SSE).
// Implements: initialize, ping, tools/list, tools/call, and accepts notifications.

import { TOOLS, TOOL_INDEX, ToolError } from "./tools.js";
import { SleeperError } from "./sleeper.js";

export const SERVER_INFO = { name: "sleeper-mcp", title: "Sleeper Fantasy Football", version: "0.1.0" };
const DEFAULT_PROTOCOL = "2025-06-18";

const INSTRUCTIONS =
  "Read-only access to Sleeper fantasy football leagues. Start with find_leagues (username) to get a league_id, " +
  "then league_overview for its scoring rules. Use score_players to score players under the league's own scoring " +
  "(e.g. first-down points) rather than generic rankings. Player names are resolved from a daily-refreshed index.";

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function toolList() {
  return TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }));
}

async function callTool(api, params) {
  const tool = TOOL_INDEX[params?.name];
  if (!tool) return { error: [-32602, `Unknown tool: ${params?.name}`] };
  try {
    const data = await tool.run(api, params.arguments || {});
    return { result: { content: [{ type: "text", text: JSON.stringify(data, null, 1) }], isError: false } };
  } catch (e) {
    const expected = e instanceof ToolError || e instanceof SleeperError;
    const message = expected ? e.message : `Unexpected error: ${e.message}`;
    return { result: { content: [{ type: "text", text: message }], isError: true } };
  }
}

/** Handle one JSON-RPC message. Returns a response object, or null for notifications. */
export async function handleMessage(api, msg) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return msg && "id" in msg ? err(msg.id, -32600, "Invalid request") : err(null, -32600, "Invalid request");
  }
  const isNotification = !("id" in msg);
  if (isNotification) return null;
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: toolList() });
    case "tools/call": {
      const r = await callTool(api, params);
      return r.error ? err(id, ...r.error) : ok(id, r.result);
    }
    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

/** Handle an HTTP request body (single message or batch). Returns [status, body|null]. */
export async function handleBody(api, body) {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleMessage(api, m)))).filter(Boolean);
    return out.length ? [200, out] : [202, null];
  }
  const res = await handleMessage(api, body);
  return res ? [200, res] : [202, null];
}
