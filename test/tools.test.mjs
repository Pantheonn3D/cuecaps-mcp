// Tests for the five tools: the plan checks and their order, and what gets written, against a fake account and a fake
// studio. No browser and no SDK. Run from the repo root: node --test mcp/test/tools.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { TOOLS, handlers } from "../src/tools.js";
import { fetchMe } from "../src/account.js";
import { outputPath } from "../src/paths.js";
import { message } from "../src/errors.js";

const KEY = "cck_Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56";
const INPUT = resolve("/clips/talk é.mp4");
const never = () => { throw new Error("not expected"); };

const summary = ({ features, minutes, ...rest } = {}) => ({
  id: "u1", email: "a@example.com", plan: "creator", label: "Creator",
  features: { cloud: true, transparent: true, customFonts: true, maxHeight: 1080, watermark: false, sync: true, agents: true, ...features },
  minutes: { used: 12.5, limit: 300, ...minutes },
  subscription: { status: "active", periodEnd: "2026-11-01T09:30:00.000Z", cancelAtPeriodEnd: false }, hasBilling: true, ...rest,
});

// handlers() over fakes. `taken` is the set of files that exist; opening adds to it, and a "wx" open of one fails with
// EEXIST. A file in `unseen` looks free the first time it's checked, as if another program created it right after.
// `folders` exist too. `status` is what the studio reports while it transcribes. `writeFails` makes every write fail
// after its file was created, as a full disk does.
const RENDERS = resolve("/renders");
function setup({ env = { CUECAPS_API_KEY: KEY }, me = summary(), after = summary({ minutes: { used: 13.75 } }), found = 28, taken = [INPUT], unseen = [], folders = [dirname(INPUT), RENDERS], status = [], writeFails, onExport, studio: extra } = {}) {
  const files = new Set(taken), hidden = new Set(unseen);
  let ran = false;
  const calls = { fetchMe: [], withStudio: [], transcribe: [], exportFile: [], attempts: [], written: [], unlinked: [], progress: [] };
  const studio = {
    openFile: async (path) => { calls.opened = path; },
    transcribe: async (opts, onStatus) => { calls.transcribe.push(opts); for (const s of status) onStatus?.(s); return found; },
    async exportFile(kind, opts, onProgress) {
      calls.exportFile.push([kind, opts]);
      for (const p of [{ text: "Encoding audio" }, { frame: 0, total: 100 }, { frame: 5, total: 100 }, { frame: 42, total: 100 }, { frame: 42, total: 100 }]) onProgress(p);
      await onExport?.();
      return Buffer.from("video");
    },
    subtitles: async (format) => `${format === "vtt" ? "WEBVTT\n\n" : "1\n"}00:00:00,500 --> 00:00:01,800\nHi there\n`,
    words: async () => [{ text: "Hi", start: 0.5, end: 1 }, { text: "there", start: 1, end: 1.8 }],
    duration: async () => 17.166666666666668,
    projectUrl: async () => "https://cuecaps.com/studio#p=782dcv2qlzui",
    ...extra,
  };
  const deps = {
    env,
    // `after` once a studio session has run since the last read: the summary a finished job sees.
    fetchMe: async (base, key) => { calls.fetchMe.push([base, key]); const r = ran ? after : me; ran = false; return r; },
    withStudio: async (query, fn, signal) => { calls.withStudio.push({ query, signal }); ran = true; return fn(studio); },
    async open(file, flag) {
      calls.attempts.push(file);
      if (flag === "wx" && files.has(file)) throw Object.assign(new Error(`EEXIST: file already exists, open '${file}'`), { code: "EEXIST" });
      files.add(file);
      return {
        async writeFile(data) {
          if (writeFails) throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
          calls.written.push({ file, data, flag });
        },
        close: async () => {},
      };
    },
    unlink: async (file) => { calls.unlinked.push(file); files.delete(file); },
    exists: (p) => !hidden.delete(p) && (files.has(p) || folders.includes(p)),
  };
  const tools = handlers(deps);
  const call = (name, args, signal) => tools[name](args, { progress: (m) => calls.progress.push(m), signal });
  return { call, calls, files };
}

test("every tool says what it does to the world", () => {
  for (const t of TOOLS) {
    const a = t.annotations;
    assert.ok(a?.title, t.name);
    for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) assert.equal(typeof a[hint], "boolean", `${t.name} ${hint}`);
    assert.equal(a.destructiveHint, false, t.name); // no tool replaces or deletes anything
  }
  const readOnly = TOOLS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
  assert.deepEqual(readOnly, ["list_styles", "studio_link", "account_status"]);
});

test("studio_link and list_styles need no key", async () => {
  const tools = handlers({ env: {}, fetchMe: never, withStudio: never, open: never, unlink: never, exists: () => false });
  assert.deepEqual(TOOLS.map((t) => t.name), ["list_styles", "studio_link", "account_status", "transcribe", "caption_video"]);
  const link = await tools.studio_link({ style: "karaoke" }, {});
  assert.ok(!link.isError && link.text.includes("https://cuecaps.com/studio?style=karaoke"), link.text);
  const styles = JSON.parse((await tools.list_styles({}, {})).text);
  assert.equal(styles.length, 10);
  assert.deepEqual(Object.keys(styles[0]), ["id", "name", "look"]);
});

test("caption_video without a key says where to get one", async () => {
  const { call, calls } = setup({ env: {} });
  const r = await call("caption_video", { path: INPUT });
  assert.equal(r.isError, true);
  assert.equal(r.text, message("no_key"));
  assert.equal(calls.fetchMe.length, 0);
});

test("a Free plan gets the upgrade text and no browser is opened", async () => {
  const me = summary({ plan: "free", label: "Free", features: { agents: false, transparent: false, sync: false, watermark: true }, minutes: { limit: 10 }, subscription: null });
  const { call, calls } = setup({ me });
  const r = await call("caption_video", { path: INPUT, style: "karaoke" });
  assert.equal(r.text, message("free_plan"));
  assert.equal(r.isError, true);
  // The plan comes before every other check.
  assert.equal((await call("caption_video", { path: resolve("/nowhere.mp4"), output: "webm", resolution: "4k", engine: "cloud" })).text, message("free_plan"));
  assert.equal(calls.withStudio.length, 0);
});

test("4k on Creator is refused before rendering", async () => {
  const { call, calls } = setup({ me: summary({ features: { transparent: false }, minutes: { used: 300 } }) });
  const r = await call("caption_video", { path: INPUT, resolution: "4k" });
  assert.equal(r.text, message("needs_pro"));
  // Resolution, then overlay, then minutes, then the file.
  assert.equal((await call("caption_video", { path: resolve("/nowhere.mp4"), output: "webm", resolution: "4k", engine: "cloud" })).text, message("needs_pro"));
  assert.equal((await call("caption_video", { path: resolve("/nowhere.mp4"), output: "webm", engine: "cloud" })).text, message("no_overlay"));
  assert.equal((await call("caption_video", { path: resolve("/nowhere.mp4"), engine: "cloud" })).text, message("no_minutes", { date: "1 November", plan: "creator" }));
  assert.equal(calls.withStudio.length, 0);
});

test("an overlay on a plan without transparent export is refused", async () => {
  const { call, calls } = setup({ me: summary({ features: { transparent: false } }) });
  for (const output of ["webm", "mov"]) assert.equal((await call("caption_video", { path: INPUT, output })).text, message("no_overlay"));
  assert.equal(calls.withStudio.length, 0);
});

test("a missing file is named in the error", async () => {
  const { call, calls } = setup({ taken: [] });
  const r = await call("caption_video", { path: INPUT });
  assert.equal(r.isError, true);
  assert.equal(r.text, message("no_file", { path: INPUT }));
  assert.equal((await call("caption_video", { path: "talk.mp4" })).text, message("no_file", { path: "talk.mp4" }));
  assert.equal(calls.withStudio.length, 0);
});

test("no speech: an error and no file written", async () => {
  const { call, calls } = setup({ found: 0 });
  const r = await call("caption_video", { path: INPUT });
  assert.equal(r.isError, true);
  assert.equal(r.text, message("no_speech", { file: "talk é.mp4" }));
  assert.equal(calls.exportFile.length, 0);
  assert.equal(calls.written.length, 0);
});

test("a cancelled render writes nothing", async () => {
  const ac = new AbortController();
  const { call, calls } = setup({ onExport: () => ac.abort() });
  const r = await call("caption_video", { path: INPUT }, ac.signal).catch((e) => ({ rejected: e }));
  assert.ok(r.rejected || r.isError, "the job ends in an error");
  assert.equal(calls.withStudio[0].signal, ac.signal, "withStudio gets the signal, so it can close the browser");
  assert.equal(calls.written.length, 0);
});

test("a finished job writes next to the input and reports minutes used", async () => {
  const { call, calls, files } = setup();
  const expected = outputPath(INPUT, "mp4", (p) => files.has(p));
  const r = await call("caption_video", { path: INPUT, style: "karaoke", words: 4 });
  assert.ok(!r.isError, r.text);
  assert.equal(calls.written.length, 1);
  assert.deepEqual(calls.written[0], { file: expected, data: Buffer.from("video"), flag: "wx" });
  assert.deepEqual(JSON.parse(r.text), { file: expected, duration: 17.17, engine: "cloud", minutes_used: 1.25, studio_url: "https://cuecaps.com/studio#p=782dcv2qlzui" });
  // Defaults, the studio link settings, the order of the work, and the key only ever handed to fetchMe.
  assert.equal(calls.withStudio[0].query, "style=karaoke&words=4");
  assert.equal(calls.opened, INPUT);
  assert.deepEqual(calls.transcribe, [{ engine: "cloud", lang: undefined, keyterms: undefined }]);
  assert.deepEqual(calls.exportFile, [["mp4", { res: 1080, fps: 30, withAudio: true }]]);
  assert.deepEqual(calls.progress, ["Opening", "Transcribing", "Rendering 0%", "Rendering 5%", "Rendering 42%", "Saving"]);
  assert.deepEqual(calls.fetchMe, [["https://cuecaps.com", KEY], ["https://cuecaps.com", KEY]]);
  assert.ok(!r.text.includes(KEY));
});

test("out_path is never overwritten: -2 goes before its extension", async () => {
  const out = resolve("/renders/final.mp4");
  const { call, calls } = setup({ taken: [INPUT, out] });
  const r = await call("caption_video", { path: INPUT, out_path: out });
  assert.equal(JSON.parse(r.text).file, resolve("/renders/final-2.mp4"));
  assert.equal(calls.written[0].file, resolve("/renders/final-2.mp4"));
  assert.equal((await call("caption_video", { path: INPUT, out_path: "final.mp4" })).text, message("no_file", { path: "final.mp4" }));
});

test("out_path in a folder that doesn't exist is refused before any browser or minute is used", async () => {
  const { call, calls } = setup();
  const r = await call("caption_video", { path: INPUT, out_path: resolve("/missing/final.mp4") });
  assert.deepEqual(r, { text: message("no_folder", { dir: resolve("/missing") }), isError: true });
  assert.equal(message("no_folder", { dir: resolve("/missing") }), `No folder at ${resolve("/missing")}.`);
  assert.equal(calls.withStudio.length, 0);
});

test("a write that fails after its file was created removes the partial file", async () => {
  const { call, calls, files } = setup({ writeFails: true }), file = resolve("/clips/talk é.captions.mp4");
  const r = await call("caption_video", { path: INPUT });
  assert.deepEqual(r, { text: "ENOSPC: no space left on device, write", isError: true });
  assert.deepEqual(calls.unlinked, [file]);
  assert.ok(!files.has(file));
});

test("out_path's extension sets the output; another extension is refused before any work", async () => {
  const { call, calls } = setup();
  const r = await call("caption_video", { path: INPUT, out_path: resolve("/renders/final.SRT") });
  assert.ok(!r.isError, r.text);
  assert.equal(calls.exportFile.length, 0);
  assert.equal(calls.written[0].file, resolve("/renders/final.SRT"));
  assert.match(calls.written[0].data, /^1\n00:00:00,500/);
  assert.ok(!(await call("caption_video", { path: INPUT, out_path: resolve("/renders/final.WebM"), output: "webm" })).isError);
  assert.deepEqual(calls.exportFile.map(([kind]) => kind), ["webm"]);
  const reads = calls.fetchMe.length, studios = calls.withStudio.length;
  assert.deepEqual(await call("caption_video", { path: INPUT, out_path: resolve("/renders/final.mov"), output: "mp4" }),
    { text: "out_path ends in .mov, but output is mp4. Make them match, or leave output out.", isError: true });
  for (const name of ["final.avi", "final"]) {
    assert.deepEqual(await call("caption_video", { path: INPUT, out_path: resolve("/renders", name) }), { text: "out_path must end in .mp4, .mov, .webm, .srt or .vtt.", isError: true });
  }
  assert.equal(calls.fetchMe.length, reads);
  assert.equal(calls.withStudio.length, studios);
  // The inferred output gets the plan checks an explicit one would.
  const noOverlay = setup({ me: summary({ features: { transparent: false } }) });
  assert.equal((await noOverlay.call("caption_video", { path: INPUT, out_path: resolve("/renders/final.mov") })).text, message("no_overlay"));
});

test("the studio's transcription status follows Transcribing as progress, each new text once", async () => {
  const download = "Downloading the speech model (one time): 13 of 132 MB";
  const status = [{ phase: "prep", text: "Preparing audio" }, { phase: "download", frac: 0.1, text: download }, { phase: "download", frac: 0.11, text: download }, { frac: 0.5 }, { phase: "listen", text: "Listening for words" }];
  const expected = ["Opening", "Transcribing", "Transcribing: Preparing audio", `Transcribing: ${download}`, "Transcribing: Listening for words"];
  const { call, calls } = setup({ status });
  assert.ok(!(await call("caption_video", { path: INPUT })).isError);
  assert.deepEqual(calls.progress, [...expected, "Rendering 0%", "Rendering 5%", "Rendering 42%", "Saving"]);
  calls.progress.length = 0;
  assert.ok(!(await call("transcribe", { path: INPUT })).isError);
  assert.deepEqual(calls.progress, expected);
});

test("a file that appears after the name was picked is never replaced: the next name gets one more try", async () => {
  const first = resolve("/clips/talk é.captions.mp4"), second = resolve("/clips/talk é.captions-2.mp4");
  const { call, calls } = setup({ taken: [INPUT, first], unseen: [first] });
  const r = await call("caption_video", { path: INPUT });
  assert.equal(JSON.parse(r.text).file, second);
  assert.deepEqual(calls.attempts, [first, second]);
  assert.deepEqual(calls.written.map((w) => w.file), [second]);
});

test("srt and vtt skip the render and the video plan checks", async () => {
  const { call, calls } = setup({ me: summary({ features: { transparent: false } }) });
  const r = await call("caption_video", { path: INPUT, output: "srt", resolution: "4k" });
  assert.ok(!r.isError, r.text);
  assert.equal(calls.exportFile.length, 0);
  assert.equal(calls.written[0].file, resolve("/clips/talk é.captions.srt"));
  assert.match(calls.written[0].data, /^1\n00:00:00,500/);
  assert.deepEqual(calls.progress, ["Opening", "Transcribing", "Saving"]);
});

test("cloud minutes: device takes over when they run out, and an explicit cloud says when they reset", async () => {
  const me = summary({ minutes: { used: 300.2 } });
  const { call, calls } = setup({ me, after: me });
  const r = await call("caption_video", { path: INPUT, engine: "cloud" });
  assert.equal(r.text, message("no_minutes", { date: "1 November", plan: "creator" }));
  assert.equal(calls.withStudio.length, 0);
  const d = await call("caption_video", { path: INPUT, lang: "es" });
  assert.ok(!d.isError, d.text);
  assert.deepEqual(calls.transcribe, [{ engine: "device", lang: "es", keyterms: undefined }]);
  assert.equal(JSON.parse(d.text).engine, "device");
  assert.equal(JSON.parse(d.text).minutes_used, 0);
  assert.equal(calls.progress[1], "Transcribing on this device (cloud minutes used up)");
});

test("cloud only when the minutes left cover the file: fewer picks device, an explicit cloud gets no_minutes", async () => {
  // 125 s needs 3 cloud minutes, as the studio's Find words dialog counts them.
  const long = { duration: async () => 125 };
  const short = setup({ me: summary({ minutes: { used: 298 } }), studio: long });
  const d = await short.call("caption_video", { path: INPUT });
  assert.ok(!d.isError, d.text);
  assert.deepEqual(short.calls.transcribe.map((t) => t.engine), ["device"]);
  assert.equal(JSON.parse(d.text).engine, "device");
  assert.ok(short.calls.progress.includes("Transcribing on this device (cloud minutes used up)"));
  const t = await short.call("transcribe", { path: INPUT });
  assert.equal(JSON.parse(t.text).engine, "device");

  const asked = setup({ me: summary({ minutes: { used: 298 } }), studio: long });
  const c = await asked.call("caption_video", { path: INPUT, engine: "cloud" });
  assert.deepEqual(c, { text: message("no_minutes", { date: "1 November", plan: "creator" }), isError: true });
  assert.equal(asked.calls.transcribe.length, 0);
  assert.equal(asked.calls.written.length, 0);

  const exact = setup({ me: summary({ minutes: { used: 297 } }), studio: long });
  const e = await exact.call("caption_video", { path: INPUT });
  assert.equal(JSON.parse(e.text).engine, "cloud");
  assert.deepEqual(exact.calls.progress.slice(0, 2), ["Opening", "Transcribing"]);
});

test("no_minutes offers Pro only to plans below it", async () => {
  assert.match(message("no_minutes", { date: "1 November", plan: "creator" }), /, or Pro for 1,200 a month\.$/);
  const pro = summary({ plan: "pro", label: "Pro", features: { maxHeight: 2160 }, minutes: { used: 1200, limit: 1200 } });
  const { call } = setup({ me: pro });
  const r = await call("caption_video", { path: INPUT, engine: "cloud" });
  assert.equal(r.text, 'Cloud minutes reset on 1 November. Use engine "device".');
  assert.ok(!r.text.includes("Pro for"));
});

test("studio texts the agent can act on get the package's wording; others pass through", async () => {
  const h264 = setup({ studio: { exportFile: async () => { throw new Error("This browser can't encode H.264 video."); } } });
  assert.equal((await h264.call("caption_video", { path: INPUT })).text, message("no_h264"));
  const size = "This browser can't encode video at this size. Try a lower resolution.";
  const encode = setup({ studio: { exportFile: async () => { throw new Error(size); } } });
  assert.deepEqual(await encode.call("caption_video", { path: INPUT }), { text: size, isError: true });
  const signIn = setup({ studio: { openFile: async () => { throw new Error("Please sign in again"); } } });
  assert.equal((await signIn.call("caption_video", { path: INPUT })).text, message("bad_key"));
  const text = "That file type isn't supported: notes.txt isn't an audio or video file. Try MP4, MOV, WebM, MP3, WAV or M4A.";
  const other = setup({ studio: { openFile: async () => { throw new Error(text); } } });
  const r = await other.call("caption_video", { path: INPUT });
  assert.deepEqual(r, { text, isError: true });
  assert.equal(other.calls.written.length, 0);
});

test("arguments outside the schema are refused before any work", async () => {
  const { call, calls } = setup();
  for (const args of [{ path: INPUT, words: 11 }, { path: INPUT, style: "neon" }, { path: INPUT, fps: 29 }, { path: INPUT, colour: "red" }, {}]) {
    const r = await call("caption_video", args);
    assert.equal(r.isError, true, JSON.stringify(args));
  }
  assert.equal(calls.fetchMe.length, 0);
});

test("transcribe returns timed words and SRT; account_status reads the summary", async () => {
  const { call, calls } = setup();
  const t = JSON.parse((await call("transcribe", { path: INPUT, engine: "device", keyterms: ["Cuecaps"] })).text);
  assert.deepEqual(t.words, [{ text: "Hi", start: 0.5, end: 1 }, { text: "there", start: 1, end: 1.8 }]);
  assert.match(t.srt, /^1\n00:00:00,500/);
  assert.equal(t.engine, "device");
  assert.equal(t.minutes_used, 1.25);
  assert.equal(calls.written.length, 0);
  assert.deepEqual(calls.transcribe, [{ engine: "device", lang: undefined, keyterms: ["Cuecaps"] }]);

  const s = setup({ me: summary({ minutes: { used: 12.46 } }) });
  assert.deepEqual(JSON.parse((await s.call("account_status", {})).text), { plan: "creator", minutes_left: 287.5, resets: "2026-11-01", agents: true });
  // No subscription: the calendar-month allowance resets on the first of next month (UTC).
  const now = new Date(), next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const free = setup({ me: summary({ plan: "free", features: { agents: false }, minutes: { used: 11, limit: 10 }, subscription: null }) });
  assert.deepEqual(JSON.parse((await free.call("account_status", {})).text), { plan: "free", minutes_left: 0, resets: next, agents: false });
});

test("fetchMe sends the key as a Bearer header only, and a 401 means the key no longer works", async (t) => {
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url, init) => { seen.push([url, init.headers]); return new Response("{}", { status: 401 }); });
  await assert.rejects(fetchMe("http://localhost:3000", KEY), { message: message("bad_key") });
  assert.deepEqual(seen, [["http://localhost:3000/api/me", { authorization: `Bearer ${KEY}` }]]);
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError(`Headers.append: "Bearer ${KEY}\n" is an invalid header value.`); });
  await assert.rejects(fetchMe("http://localhost:3000", KEY), (e) => e.message === "Couldn't reach http://localhost:3000." && !e.message.includes(KEY));
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 503 }));
  await assert.rejects(fetchMe("http://localhost:3000", KEY), { message: "Cuecaps answered 503 for /api/me." });
});
