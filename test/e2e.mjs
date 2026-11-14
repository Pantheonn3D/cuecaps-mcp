// End to end: the SDK's MCP client starts mcp/src/server.js over stdio and captions the demo clip through the Cuecaps
// site with a Creator test key (mp4, webm, srt, an mp3 job, and the mp4 again at 1:1). ffprobe then checks every file
// the server wrote.
//   CUECAPS_API_KEY=cck_… node mcp/test/e2e.mjs      (CUECAPS_URL defaults to http://localhost:3000)
// A live check, so it isn't part of npm test. It needs:
//   - a Creator test key in CUECAPS_API_KEY;
//   - ffmpeg and ffprobe on PATH, and Chrome or Edge (CUECAPS_CHROME overrides the lookup);
//   - `npm ci` already run in mcp/;
//   - the site at CUECAPS_URL (npm run dev) with the api_keys migration applied.
// It uses about 1 cloud minute per transcription on the test account, five in all.
// Exit 0: every assertion passed. Exit 1: one failed (the work folder stays, its path is printed). Exit 2: preflight failed.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findBrowser } from "../src/browser.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const key = process.env.CUECAPS_API_KEY?.trim();
const stop = (why) => { console.error(`Preflight failed: ${why}`); process.exit(2); };
const has = (cmd) => { try { execFileSync(cmd, ["-version"], { stdio: "ignore" }); return true; } catch { return false; } };

let base;
try { base = new URL(process.env.CUECAPS_URL || "http://localhost:3000").origin; } catch { stop("CUECAPS_URL isn't a URL."); }
if (!key) stop("set CUECAPS_API_KEY to a Creator test key.");
if (!has("ffmpeg") || !has("ffprobe")) stop("ffmpeg and ffprobe must be on PATH.");
if (!existsSync(join(repo, "mcp/node_modules/@modelcontextprotocol"))) stop("run npm ci in mcp/ first.");
if (!findBrowser()) stop("no Chrome or Edge found. Install Chrome, or set CUECAPS_CHROME to your browser's path.");
// The same call the server makes first: it shows the site is up, the key works and the account can run the checks.
let res;
try { res = await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) }); }
catch { stop(`nothing answers at ${base}. Start the site with npm run dev, or set CUECAPS_URL.`); }
if (res.status === 401) stop(`${base} refused the key: it is revoked or mistyped, or the api_keys migration isn't applied there.`);
if (!res.ok) stop(`${base}/api/me answered ${res.status}.`);
const me = await res.json();
if (!me.features.agents || !me.features.sync) stop(`the key's account is on ${me.plan}. Use a Creator test account.`);
if (me.minutes.limit - me.minutes.used < 5) stop("the test account has fewer than 5 cloud minutes left.");

const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport, getDefaultEnvironment } = await import("@modelcontextprotocol/sdk/client/stdio.js");

const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" }));
const stream = (p, type) => p.streams.filter((s) => s.codec_type === type);
const seconds = (file) => Number(probe(file).format.duration);

let passed = 0, failed = 0;
function check(name, ok, detail = "") {
  ok ? passed++ : failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
  return ok;
}

// The result's JSON, with the checks every result gets; null when the call failed.
const FIELDS = ["file", "duration", "engine", "minutes_used", "studio_url"];
async function run(client, label, args) {
  const messages = [];
  const reply = await client.callTool({ name: "caption_video", arguments: args }, undefined, {
    onprogress: ({ message }) => messages.push(message),
    timeout: 10 * 60 * 1000, resetTimeoutOnProgress: true,
  });
  const text = reply.content[0].text;
  if (!check(`${label}: no error`, !reply.isError, reply.isError && text)) return null;
  const r = JSON.parse(text);
  check(`${label}: file, duration, engine, minutes_used and studio_url`, FIELDS.every((k) => k in r) && typeof r.file === "string" && typeof r.duration === "number", Object.keys(r).join(", "));
  // Preflight asks for 5 minutes left, so every call's minutes cover the clip.
  check(`${label}: engine cloud`, r.engine === "cloud", r.engine);
  check(`${label}: written next to the input`, dirname(r.file) === dirname(args.path), r.file);
  return { ...r, messages };
}

function checkMp4(label, file, expected) {
  const p = probe(file), [v] = stream(p, "video"), [a] = stream(p, "audio"), got = Number(p.format.duration);
  check(`${label}: h264 + aac`, v?.codec_name === "h264" && a?.codec_name === "aac", `${v?.codec_name} + ${a?.codec_name}`);
  check(`${label}: 30 fps`, v?.r_frame_rate === "30/1", v?.r_frame_rate);
  check(`${label}: duration ${got.toFixed(2)} s, source ${expected.toFixed(2)} s`, Math.abs(got - expected) <= 0.1, "more than 0.1 s apart");
  return p;
}
const studioUrl = (label, r) => check(`${label}: studio_url opens the saved project`, r.studio_url?.startsWith(`${base}/studio#p=`), r.studio_url);

// The mp3 sits beside the clip's folder, so its job names its output clip é.captions.mp4 and the clip's second run is -2.
const work = mkdtempSync(join(tmpdir(), "mcp-e2e-"));
const folder = join(work, "clip with spaces é"), mp4 = join(folder, "clip é.mp4"), mp3 = join(work, "clip é.mp3");
const client = new Client({ name: "cuecaps-mcp-e2e", version: "0" });
try {
  mkdirSync(folder);
  copyFileSync(join(repo, "public/site/sprite.mp4"), mp4);
  execFileSync("ffmpeg", ["-v", "error", "-i", mp4, "-vn", "-c:a", "libmp3lame", "-q:a", "4", mp3]);
  const mp4Seconds = seconds(mp4), mp3Seconds = seconds(mp3);
  // The environment a real MCP client gives the server: the SDK's default set plus the config's variables.
  const env = { ...getDefaultEnvironment(), CUECAPS_URL: base, CUECAPS_API_KEY: key, ...(process.env.CUECAPS_CHROME && { CUECAPS_CHROME: process.env.CUECAPS_CHROME }) };
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(repo, "mcp/src/server.js")], env }));
  let r, first;

  if (r = await run(client, "karaoke mp4", { path: mp4, style: "karaoke" })) {
    check("karaoke mp4: named clip é.captions.mp4", basename(r.file) === "clip é.captions.mp4", basename(r.file));
    checkMp4("karaoke mp4", r.file, mp4Seconds);
    studioUrl("karaoke mp4", r);
    const order = [/^Opening$/, /^Transcribing/, /^Rendering \d+%$/, /^Saving$/].map((re) => r.messages.findIndex((m) => re.test(m)));
    const seen = [...new Set(r.messages.map((m) => m.replace(/\d+%/, "N%")))].join(" > ");
    check(`karaoke mp4: progress in order: ${seen}`, order.every((n, i) => n >= 0 && (!i || n > order[i - 1])));
    first = { file: r.file, size: statSync(r.file).size, mtime: statSync(r.file).mtimeMs };
  }

  if (r = await run(client, "webm", { path: mp4, output: "webm" })) {
    check("webm: named clip é.captions.webm", basename(r.file) === "clip é.captions.webm", basename(r.file));
    const [v] = stream(probe(r.file), "video"), alpha = Object.entries(v?.tags ?? {}).find(([k]) => k.toLowerCase() === "alpha_mode")?.[1];
    check("webm: vp9 with alpha_mode=1", v?.codec_name === "vp9" && alpha === "1", `${v?.codec_name}, alpha_mode ${alpha}`);
  }

  if (r = await run(client, "srt", { path: mp4, output: "srt" })) {
    check("srt: named clip é.captions.srt", basename(r.file) === "clip é.captions.srt", basename(r.file));
    const text = readFileSync(r.file, "utf8").replace(/\r\n/g, "\n");
    check("srt: starts with cue 1 at 00:00:", text.startsWith("1\n00:00:"), JSON.stringify(text.slice(0, 30)));
  }

  if (r = await run(client, "mp3 job", { path: mp3, output: "mp4", aspect: "1:1" })) {
    check("mp3 job: named clip é.captions.mp4", basename(r.file) === "clip é.captions.mp4", basename(r.file));
    const p = checkMp4("mp3 job", r.file, mp3Seconds), [v, ...more] = stream(p, "video");
    check("mp3 job: one 1080x1080 video stream", !more.length && v?.width === 1080 && v?.height === 1080, `${stream(p, "video").length} video, ${v?.width}x${v?.height}`);
    studioUrl("mp3 job", r);
  }

  // The clip is 9:16; a studio link's aspect wins over the video's own shape.
  if (r = await run(client, "karaoke mp4 again", { path: mp4, style: "karaoke", aspect: "1:1" })) {
    check("karaoke mp4 again: named clip é.captions-2.mp4", basename(r.file) === "clip é.captions-2.mp4", basename(r.file));
    const [v, ...more] = stream(checkMp4("karaoke mp4 again", r.file, mp4Seconds), "video");
    check("karaoke mp4 again: aspect 1:1 gives one 1080x1080 video stream", !more.length && v?.width === 1080 && v?.height === 1080, `${more.length + 1} video, ${v?.width}x${v?.height}`);
    studioUrl("karaoke mp4 again", r);
    const now = first && statSync(first.file);
    check("karaoke mp4 again: the first output is untouched", !!now && now.size === first.size && now.mtimeMs === first.mtime);
  }
} catch (e) {
  check("run finished", false, e.message);
} finally {
  await client.close().catch(() => {});
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log(`Files kept in ${work}`); process.exitCode = 1; }
else rmSync(work, { recursive: true, force: true });
