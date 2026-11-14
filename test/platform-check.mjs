// Platform check: can headless Chrome or Edge run the studio's own export unattended on this OS,
// how fast, with which codecs, and can CDP's IO.read stream a Blob back to Node?
//   node mcp/test/platform-check.mjs        (CUECAPS_CHROME=/path/to/browser overrides the lookup)
// Serves public/ itself on a free port, so no dev server is needed. Exit 1 if an export is missing
// or its codecs are wrong; IO.read is reported but never fails the run (it only picks the transfer path).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const publicDir = join(repo, "public");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same list, same order as Task 8's mcp/src/browser.js.
function findBrowser() {
  if (process.env.CUECAPS_CHROME) return process.env.CUECAPS_CHROME;
  const env = process.env, under = (base, rel) => base && join(base, rel);
  const chrome = "Google/Chrome/Application/chrome.exe", edge = "Microsoft/Edge/Application/msedge.exe";
  const candidates = {
    win32: [under(env.PROGRAMFILES, chrome), under(env["PROGRAMFILES(X86)"], chrome), under(env.LOCALAPPDATA, chrome), under(env["PROGRAMFILES(X86)"], edge), under(env.PROGRAMFILES, edge)],
    darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
    linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome", "/usr/bin/microsoft-edge"],
  }[process.platform] ?? [];
  return candidates.find((p) => p && existsSync(p));
}

// public/ over HTTP: /studio is studio.html, /api/* is 401 (the studio then runs as a guest).
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".mp4": "video/mp4", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (path.startsWith("/api/")) return void res.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
  const file = join(publicDir, path === "/studio" ? "studio.html" : path);
  let body;
  try { if (!file.startsWith(publicDir + sep)) throw 0; body = readFileSync(file); } catch { return void res.writeHead(404).end(); }
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
});

// ffprobe is optional: without it the codecs go unchecked.
const hasFfprobe = !spawnSync("ffprobe", ["-version"]).error;
function codecs(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffprobe failed: " + (r.stderr || "").trim());
  return JSON.parse(r.stdout).streams.map((s) => s.codec_name);
}

const jobs = [
  { kind: "mp4", opts: { res: 1080, fps: 30, withAudio: true }, expect: ["h264", "aac"] },
  { kind: "webm", opts: { res: 1080, fps: 30, withAudio: false }, expect: ["vp9"] },
  { kind: "mp4", opts: { res: 2160, fps: 30, withAudio: true }, expect: ["h264", "aac"] },
];

async function main() {
  const browser = findBrowser();
  if (!browser) throw new Error("no Chrome or Edge found; set CUECAPS_CHROME to a browser executable");
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const studioUrl = `http://127.0.0.1:${server.address().port}/studio`;

  const work = mkdtempSync(join(tmpdir(), "cuecaps-check-"));
  const profile = join(work, "profile");
  let chrome, ws, failed = false;
  // Ubuntu CI runners restrict the user namespaces Chrome's sandbox needs, so it runs with --no-sandbox there.
  const sandbox = process.platform === "linux" && process.env.CI ? ["--no-sandbox"] : [];
  const closed = new Promise((r) => { chrome = spawn(browser, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", ...sandbox, "about:blank"], { stdio: "ignore" }); chrome.on("error", r); chrome.on("exit", r); });
  try {
    // --remote-debugging-port=0 picks a free port; the browser writes it to DevToolsActivePort.
    let wsUrl;
    for (let i = 0; i < 100 && !wsUrl; i++) {
      if (chrome.exitCode !== null || chrome.pid === undefined) throw new Error(`browser did not start: ${browser}`);
      const [port, path] = (existsSync(join(profile, "DevToolsActivePort")) ? readFileSync(join(profile, "DevToolsActivePort"), "utf8") : "").trim().split("\n");
      if (path) wsUrl = `ws://127.0.0.1:${port}${path}`; else await sleep(200);
    }
    if (!wsUrl) throw new Error("browser never published its DevTools port");

    ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", () => rej(new Error("DevTools connection failed")), { once: true }); });
    let seq = 0;
    const pending = new Map(), logs = [];
    ws.addEventListener("message", ({ data }) => {
      const m = JSON.parse(data);
      if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
      if (m.method === "Runtime.exceptionThrown") logs.push("EXCEPTION " + m.params.exceptionDetails.exception?.description?.slice(0, 300));
      if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) logs.push(m.params.type + " " + m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
    });
    ws.addEventListener("close", () => { for (const { rej } of pending.values()) rej(new Error("browser connection closed")); pending.clear(); });
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

    await send("Browser.setDownloadBehavior", { behavior: "deny" }); // exports are caught as Blobs; nothing should reach Downloads
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
    const ev = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, s);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const until = async (expression, ms = 60000) => {
      const t = Date.now();
      while (Date.now() - t < ms) { if (await ev(expression).catch(() => false)) return; await sleep(250); }
      throw new Error("timed out waiting for " + expression);
    };
    await send("Runtime.enable", {}, s); await send("Page.enable", {}, s);
    await send("Page.navigate", { url: studioUrl }, s);
    await until("!!window.cuecaps?.S?.p");

    // Hand the clip over the way the MCP does: straight into the studio's file input, nothing uploaded.
    const { root } = await send("DOM.getDocument", {}, s);
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "#fileIn" }, s);
    await send("DOM.setFileInputFiles", { nodeId, files: [join(publicDir, "site", "sprite.mp4")] }, s);
    await until("!!(window.cuecaps.S.file && window.cuecaps.S.p.media)");

    // A Creator account's features and the clip's real words (transcription is not under test).
    const words = JSON.parse(readFileSync(join(publicDir, "site", "sprite-words.json"), "utf8"));
    await ev(`(() => { const c = window.cuecaps, S = c.S;
      S.me = { ...(S.me || {}), guest: false, features: { cloud: true, transparent: true, customFonts: true, maxHeight: 2160, watermark: false, sync: false } };
      c.mutate(() => { S.p.format.bg = "video"; S.p.words = ${JSON.stringify(words)}.map((w, i) => ({ id: "w" + i, text: w.text, start: w.start, end: w.end, emph: !!w.emph })); });
    })()`);
    const info = await ev(`(async () => ({ dur: window.cuecaps.S.audio?.duration, avc: typeof VideoEncoder !== "undefined" && (await VideoEncoder.isConfigSupported({ codec: "avc1.640033", width: 1080, height: 1920 })).supported }))()`);
    console.log(`Browser: ${(await send("Browser.getVersion")).product} on ${process.platform}; H.264 encode ${info.avc ? "supported" : "NOT supported"}; clip ${info.dur?.toFixed(1)} s`);
    if (!hasFfprobe) console.log("ffprobe not on PATH: codecs not checked");

    for (const { kind, opts, expect } of jobs) {
      const label = `${kind} ${opts.res}p@${opts.fps}`;
      try {
        // The hook the MCP calls: the Export button's own render, returned as a Blob instead of a download.
        await ev("window.__last = null");
        const t = performance.now();
        await ev(`window.cuecaps.exportBlob(${JSON.stringify(kind)}, ${JSON.stringify(opts)}).then((b) => { window.__last = b; })`);
        const rendered = (performance.now() - t) / 1000;
        const meta = await ev("window.__last && { size: window.__last.size }");
        if (!meta?.size) throw new Error("export produced no file");

        // The path that writes the file: the Blob in 8 MB slices, each as base64.
        const parts = [];
        for (let off = 0; off < meta.size; off += 8e6) {
          parts.push(Buffer.from(await ev(`(async () => { const u = new Uint8Array(await window.__last.slice(${off}, ${off + 8e6}).arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); })()`), "base64"));
        }
        const file = join(work, `${opts.res}p.${kind}`);
        writeFileSync(file, Buffer.concat(parts));

        let found = "";
        if (hasFfprobe) {
          const names = codecs(file);
          found = ", " + names.join("+");
          const missing = expect.filter((c) => !names.includes(c));
          if (missing.length) throw new Error(`missing ${missing.join("+")} (found ${names.join("+") || "no streams"})`);
        }
        console.log(`${label}: ${rendered.toFixed(1)} s for ${info.dur.toFixed(1)} s of video (${(info.dur / rendered).toFixed(2)}x real time) -> ${(meta.size / 1e6).toFixed(1)} MB${found}`);

        // The alternative transfer: resolve the Blob's RemoteObject to a handle and stream it with IO.read.
        try {
          const { result } = await send("Runtime.evaluate", { expression: "window.__last" }, s);
          const { uuid } = await send("IO.resolveBlob", { objectId: result.objectId }, s);
          let bytes = 0;
          for (let eof = false; !eof;) {
            const chunk = await send("IO.read", { handle: "blob:" + uuid }, s);
            bytes += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").length : Buffer.byteLength(chunk.data);
            eof = chunk.eof;
          }
          if (bytes !== meta.size) throw new Error(`read ${bytes} of ${meta.size} bytes`);
          console.log(`IO.read: ok (${bytes} bytes)`);
        } catch (e) { console.log(`IO.read: ${e.message}`); }
      } catch (e) { failed = true; console.log(`${label}: FAILED ${e.message}`); }
    }
    console.log(logs.length ? "Console:\n" + logs.slice(0, 15).join("\n") : "Console: no errors or warnings");
  } finally {
    // Close the browser, wait for it to let go of the profile, then delete the temporary directory.
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 1e9, method: "Browser.close" }));
    await Promise.race([closed, sleep(5000)]);
    chrome.kill();
    await closed;
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    server.closeAllConnections();
    server.close();
  }
  return failed;
}

main().then((failed) => { console.log(failed ? "platform-check: FAILED" : "platform-check: ok"); process.exitCode = failed ? 1 : 0; }, (e) => { console.error("platform-check: " + e.message); process.exitCode = 1; });
