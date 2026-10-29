#!/usr/bin/env node
// cuecaps-mcp over stdio: the tools from tools.js on the SDK's low-level Server, with the real browser, account and
// file system behind them. The only file that imports the SDK.
import { existsSync, readFileSync } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import { fetchMe } from "./account.js";
import { findBrowser, launch, withBrowser } from "./browser.js";
import { message } from "./errors.js";
import { openStudio } from "./studio.js";
import { TOOLS, handlers } from "./tools.js";

const env = process.env, base = env.CUECAPS_URL || "https://cuecaps.com", key = env.CUECAPS_API_KEY?.trim();
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// Every browser a job starts, so none outlives the server; once it's shutting down, none starts.
const browsers = new Set();
let closing = false;
function launchTracked(path) {
  if (closing) throw new Error("The server is shutting down.");
  const started = launch(path).then((b) => ({ ...b, close: () => { browsers.delete(started); return b.close(); } }));
  browsers.add(started);
  started.catch(() => browsers.delete(started));
  return started;
}

// One job's studio in its own headless browser. Aborting the job closes the browser at once, so a render stops and every
// CDP call in flight rejects.
async function withStudio(query, fn, signal) {
  const path = findBrowser();
  if (!path) throw new Error(message("no_browser"));
  return withBrowser(async (browser) => {
    const stop = () => browser.close();
    signal?.addEventListener("abort", stop, { once: true });
    try {
      signal?.throwIfAborted();
      return await fn(await openStudio(browser.cdp, { base, key, query }));
    } finally { signal?.removeEventListener("abort", stop); }
  }, { launch: launchTracked, path });
}

const tools = handlers({ env, fetchMe, withStudio, open, unlink, exists: existsSync });
const server = new Server({ name: "cuecaps-mcp", version }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
  if (!Object.hasOwn(tools, params.name)) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${params.name}`);
  // Progress goes out only when the client sent a token, counted up because MCP wants it to grow with every notification.
  const token = params._meta?.progressToken;
  let n = 0;
  const progress = (text) => {
    if (token !== undefined) extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: ++n, message: text } }).catch(() => {});
  };
  const { text, isError } = await tools[params.name](params.arguments, { progress, signal: extra.signal });
  return { content: [{ type: "text", text }], ...(isError && { isError }) };
});

// A client that goes away leaves nothing running. From then on no browser starts (a job still checking the account gets
// an error instead), and every browser already started closes, one still starting included, taking its temp profile with
// it. Then the process exits, after a moment for replies under way to reach stdout; a close that hangs can't keep it
// running past 20 s.
async function leave() {
  if (closing) return;
  closing = true;
  setTimeout(() => process.exit(0), 20000).unref();
  while (browsers.size) await Promise.all([...browsers].map((p) => p.then((b) => b.close(), () => {})));
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGINT", leave).on("SIGTERM", leave);
process.stdin.on("end", leave);

await server.connect(new StdioServerTransport());
