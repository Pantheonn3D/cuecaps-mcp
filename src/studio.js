// Drives the Cuecaps studio in a page of the browser from browser.js, through its hooks on window.cuecaps
// (studio-src/20-app.js). The key only ever travels in the Authorization header of requests to ${base}/api/.
import { basename } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLICE = 8 << 20; // bytes per Blob read
// A page error as its message alone: no "Error: " prefix, no stack, so studio texts come through as written.
const pageError = ({ exception: x, text }) => x?.description?.split(/\n\s+at /)[0].replace(/^\w*Error: /, "") ?? String(x?.value ?? text);
// Progress and status updates go back to Node through the cuecapsProgress binding; a failed report never stops the work.
const REPORT = "(p) => { try { window.cuecapsProgress(JSON.stringify(p)); } catch {} }";

export async function openStudio(cdp, { base, key, query }) {
  base = new URL(base).origin;
  const api = `${base}/api/`;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

  // A crashed or closed page never answers, so either one fails every call in flight instead.
  let dead = null, die;
  const lost = new Promise((_, rej) => (die = (text) => rej((dead ??= new Error(text)))));
  lost.catch(() => {});
  cdp.on("Inspector.targetCrashed", (_, s) => s === sessionId && die("The studio page crashed."));
  cdp.on("Target.detachedFromTarget", (p) => p.sessionId === sessionId && die("The studio page closed."));
  // On a 401 the studio throws "Please sign in again" and goes to /login (studio-src/18-transcribe.js api()).
  cdp.on("Page.frameNavigated", ({ frame }, s) => s === sessionId && !frame.parentId && frame.url.startsWith(`${base}/login`) && die("Please sign in again"));
  const send = (method, params) => Promise.race([cdp.send(method, params, sessionId), lost]);

  cdp.on("Fetch.requestPaused", ({ requestId, request }, s) => {
    if (s !== sessionId) return;
    // The Fetch pattern already limits this to ${base}/api/*; the prefix check makes sure no other URL gets the key.
    const headers = key && request.url.startsWith(api) && [
      ...Object.entries(request.headers).filter(([n]) => n.toLowerCase() !== "authorization").map(([name, value]) => ({ name, value })),
      { name: "Authorization", value: `Bearer ${key}` },
    ];
    cdp.send("Fetch.continueRequest", { requestId, ...(headers && { headers }) }, sessionId).catch(() => {});
  });
  let progress = null;
  cdp.on("Runtime.bindingCalled", ({ name, payload }, s) => {
    if (s !== sessionId || name !== "cuecapsProgress" || !progress) return;
    try { progress(JSON.parse(payload)); } catch {}
  });

  await cdp.send("Browser.setDownloadBehavior", { behavior: "deny" }); // exports come back as Blobs; nothing reaches Downloads
  await Promise.all([send("Runtime.enable"), send("Page.enable"), send("Inspector.enable"), send("Runtime.addBinding", { name: "cuecapsProgress" }),
    send("Fetch.enable", { patterns: [{ urlPattern: `${api}*`, requestStage: "Request" }] })]);

  const evaluate = async (expression, byValue = true) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: byValue });
    if (r.exceptionDetails) throw new Error(pageError(r.exceptionDetails));
    return byValue ? r.result.value : r.result;
  };
  const callOn = async (objectId, functionDeclaration, ...args) => {
    const r = await send("Runtime.callFunctionOn", { objectId, functionDeclaration, arguments: args.map((value) => ({ value })), awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(pageError(r.exceptionDetails));
    return r.result.value;
  };
  // Polls until the expression is truthy and returns its value. Errors while a page loads count as "not yet";
  // a closed browser or a lost page ends the wait at once.
  const until = async (expression, ms, what) => {
    for (const end = Date.now() + ms; ;) {
      const v = await evaluate(expression).catch((e) => { if (cdp.closed || dead) throw e; });
      if (v) return v;
      if (Date.now() > end) throw new Error(`The studio didn't ${what} within ${ms / 1000} s.`);
      await sleep(250);
    }
  };
  // One call at a time: progress goes to whichever callback the current call passed.
  const run = async (expression, onProgress, byValue) => {
    progress = onProgress ?? null;
    try { return await evaluate(expression, byValue); }
    finally { progress = null; }
  };

  // The Blob comes back through CDP's IO stream, read exactly once (a second read of the same Blob returns nothing),
  // or in base64 slices when the browser can't stream it.
  const stream = async (objectId, size) => {
    const { uuid } = await send("IO.resolveBlob", { objectId });
    const handle = `blob:${uuid}`, parts = [];
    try {
      for (let got = 0; ;) {
        const { data, base64Encoded, eof } = await send("IO.read", { handle, size: SLICE });
        const chunk = Buffer.from(data, base64Encoded ? "base64" : "utf8");
        parts.push(chunk);
        if ((got += chunk.length) > size) throw new Error("IO.read returned more than the Blob holds.");
        if (eof) { if (got < size) throw new Error("IO.read ended early."); return Buffer.concat(parts, size); }
        if (!chunk.length) throw new Error("IO.read stalled.");
      }
    } finally { await send("IO.close", { handle }).catch(() => {}); }
  };
  const readBlob = async (objectId) => {
    const size = await callOn(objectId, "function () { return this.size; }");
    if (!size) throw new Error("The export produced no file.");
    try { return await stream(objectId, size); }
    catch (e) { if (cdp.closed || dead) throw e; }
    const parts = [];
    for (let off = 0; off < size; off += SLICE) {
      parts.push(Buffer.from(await callOn(objectId, `async function (off, end) {
        const u = new Uint8Array(await this.slice(off, end).arrayBuffer()); let s = "";
        for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
        return btoa(s); }`, off, off + SLICE), "base64"));
    }
    const buf = Buffer.concat(parts);
    if (buf.length !== size) throw new Error(`Read ${buf.length} of the export's ${size} bytes.`);
    return buf;
  };

  const { errorText } = await send("Page.navigate", { url: `${base}/studio${query ? `?${query}` : ""}` });
  if (errorText) throw new Error(`Couldn't open ${base}/studio (${errorText}).`);
  // window.cuecaps is set at the end of start-up, and S.me once /api/me has answered (a guest plan on a 401).
  await until("!!window.cuecaps?.S?.me", 30000, "start");

  return {
    me: () => evaluate("window.cuecaps.S.me"),
    // The file goes straight into the studio's file input; nothing is uploaded. Opening ends when the editor shows
    // the file, or with the studio's error dialog ("<heading>: <text>").
    async openFile(path) {
      const errors = 'document.querySelectorAll(".dlg h2 > .lucide-circle-alert")';
      const before = await evaluate(`${errors}.length`);
      const { root } = await send("DOM.getDocument", { depth: 0 });
      const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "#fileIn" });
      await send("DOM.setFileInputFiles", { nodeId, files: [path] });
      const r = await until(`(() => {
        const d = [...${errors}].slice(${before}).at(-1)?.closest(".dlg");
        if (d) return { error: d.querySelector("h2").textContent.trim() + ": " + (d.querySelector("p")?.textContent.trim() ?? "") };
        return window.cuecaps.S.p.media?.name === ${JSON.stringify(basename(path))} && document.body.classList.contains("editing");
      })()`, 600000, "open the file");
      if (r.error) throw new Error(r.error);
    },
    // The on-device engine has no "auto" language (the studio's dialog switches it to English), and only the cloud
    // engine takes key terms.
    transcribe({ engine, lang, keyterms }, onStatus) {
      const opts = engine === "device" ? { engine: "local", lang: !lang || lang === "auto" ? "en" : lang } : { engine, lang: lang || "auto", keyterms: keyterms ?? [] };
      return run(`window.cuecaps.transcribeProject(${JSON.stringify(opts)}, ${REPORT})`, onStatus);
    },
    async exportFile(kind, { res, fps, withAudio }, onProgress) {
      const blob = await run(`window.cuecaps.exportBlob(${JSON.stringify(kind)}, ${JSON.stringify({ res, fps, withAudio })}, ${REPORT})`, onProgress, false);
      if (!blob.objectId) throw new Error("The export produced no file.");
      try { return await readBlob(blob.objectId); }
      finally { await send("Runtime.releaseObject", { objectId: blob.objectId }).catch(() => {}); }
    },
    subtitles: (format) => evaluate(`window.cuecaps.subtitleText(${JSON.stringify(format)})`),
    words: () => evaluate("window.cuecaps.S.p.words.map(({ text, start, end }) => ({ text, start, end }))"),
    duration: () => evaluate("window.cuecaps.S.audio?.duration ?? null"),
    // A link only once the project is saved to the account. flushSave() resolves even when the sync fails
    // (syncNow catches its own errors), so the studio's save indicator decides: setSaved("saved") alone shows the check.
    async projectUrl() {
      const id = await evaluate(`(async () => { const c = window.cuecaps; if (!c.S.me?.features?.sync) return null;
        await c.flushSave(); return document.querySelector("#saved .lucide-check") ? c.S.p.id : null; })()`);
      return id ? `${base}/studio#p=${id}` : null;
    },
  };
}
