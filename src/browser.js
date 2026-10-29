// The browser layer: find Chrome or Edge, start it headless with a throwaway profile, and speak CDP to it.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// True when p settles within ms, false otherwise; no timer is left behind to hold the process open.
async function within(p, ms) {
  let t;
  try { return await Promise.race([p.then(() => true, () => true), new Promise((r) => (t = setTimeout(r, ms, false)))]); }
  finally { clearTimeout(t); }
}

const CHROME = "Google\\Chrome\\Application\\chrome.exe", EDGE = "Microsoft\\Edge\\Application\\msedge.exe";
const PATHS = {
  // Windows variable names ignore case, but a copy of process.env doesn't, so they're looked up either way. An MCP
  // client's default environment (the SDK's getDefaultEnvironment) has PROGRAMFILES but not PROGRAMFILES(X86), where
  // Edge lives, so that one is derived when missing.
  win32: (env) => {
    const get = (k) => env[k] ?? Object.entries(env).find(([n]) => n.toUpperCase() === k)?.[1];
    const pf = get("PROGRAMFILES") || `${get("SYSTEMDRIVE") || "C:"}\\Program Files`, pf86 = get("PROGRAMFILES(X86)") || `${pf} (x86)`, local = get("LOCALAPPDATA");
    return [[pf, CHROME], [pf86, CHROME], [local, CHROME], [pf86, EDGE], [pf, EDGE]].filter(([dir]) => dir).map(([dir, rel]) => win32.join(dir, rel));
  },
  darwin: () => ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  linux: () => ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome", "/usr/bin/microsoft-edge"],
};

// Chrome first, then Edge. CUECAPS_CHROME overrides the lookup.
export function findBrowser({ env = process.env, platform = process.platform, exists = existsSync } = {}) {
  if (env.CUECAPS_CHROME) return env.CUECAPS_CHROME;
  return (PATHS[platform]?.(env) ?? []).find((p) => exists(p)) ?? null;
}

// Its own profile and a free port, so a Chrome the user has open is never touched. The sandbox stays on.
export const launchArgs = (profile) => ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "about:blank"];

// A CDP connection. When it closes, every call in flight rejects at once and later calls fail straight away.
export class Cdp {
  #ws; #seq = 0; #pending = new Map(); #handlers = new Map(); #open;
  constructor(url) {
    const ws = (this.#ws = new WebSocket(url));
    this.#open = new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("close", () => rej(new Error("Couldn't connect to the browser.")), { once: true }); });
    this.#open.catch(() => {});
    ws.addEventListener("message", ({ data }) => {
      const m = JSON.parse(data);
      if (m.id === undefined) return void this.#handlers.get(m.method)?.forEach((fn) => fn(m.params, m.sessionId));
      const p = this.#pending.get(m.id);
      this.#pending.delete(m.id);
      if (m.error) p?.rej(new Error(m.error.message)); else p?.res(m.result);
    });
    ws.addEventListener("close", () => {
      for (const { rej } of this.#pending.values()) rej(new Error("The browser closed."));
      this.#pending.clear();
    });
  }
  static async connect(url) {
    const cdp = new Cdp(url);
    await cdp.#open;
    return cdp;
  }
  get closed() { return this.#ws.readyState >= WebSocket.CLOSING; }
  async send(method, params = {}, sessionId) {
    await this.#open;
    if (this.closed) throw new Error("The browser closed.");
    return new Promise((res, rej) => {
      const id = ++this.#seq;
      this.#pending.set(id, { res, rej });
      this.#ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    });
  }
  on(method, fn) {
    if (!this.#handlers.has(method)) this.#handlers.set(method, new Set());
    this.#handlers.get(method).add(fn);
    return () => this.#handlers.get(method).delete(fn);
  }
}

export async function launch(path) {
  const profile = await mkdtemp(join(tmpdir(), "cuecaps-"));
  // The key travels only in the Authorization header, so the browser's processes don't inherit it (any case: Windows).
  const env = Object.fromEntries(Object.entries(process.env).filter(([n]) => n.toUpperCase() !== "CUECAPS_API_KEY"));
  const proc = spawn(path, launchArgs(profile), { stdio: "ignore", env });
  let failed = null, cdp, closing;
  // "error" can fire twice (spawn, then kill), so it keeps a listener for the process's whole life.
  const exited = new Promise((r) => { proc.on("exit", r); proc.on("error", (e) => { failed ??= e; r(); }); });
  let running = true;
  exited.then(() => { running = false; });

  const close = () => (closing ??= (async () => {
    if (cdp && !cdp.closed) await within(cdp.send("Browser.close"), 2000);
    if (running && !(await within(exited, 3000))) { proc.kill(); await within(exited, 5000); }
    // Chrome's helper processes can hold profile files for a moment after it exits: rm retries EBUSY and EPERM
    // with a linear backoff (100 ms, 200 ms…), about 2 s in all.
    await rm(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
  })().catch(() => {}));

  try {
    // --remote-debugging-port=0 picks a free port; the browser writes it and the WebSocket path to DevToolsActivePort.
    const file = join(profile, "DevToolsActivePort"), end = Date.now() + 10000;
    let url;
    while (!url) {
      if (!running) throw new Error(failed ? `Couldn't start the browser at ${path} (${failed.code ?? failed.message}).` : `The browser at ${path} quit as it started.`);
      if (Date.now() > end) throw new Error(`The browser at ${path} didn't open DevTools within 10 s.`);
      const [port, wsPath] = (await readFile(file, "utf8").catch(() => "")).trim().split("\n");
      if (wsPath) url = `ws://127.0.0.1:${port}${wsPath}`; else await sleep(100);
    }
    cdp = await Cdp.connect(url);
    return { cdp, close };
  } catch (e) {
    await close();
    throw e;
  }
}

// Runs fn with a started browser and closes it whatever fn does.
export async function withBrowser(fn, { launch, path }) {
  const browser = await launch(path);
  try { return await fn(browser); }
  finally { await browser.close(); }
}
