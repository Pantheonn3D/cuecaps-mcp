// The five tools: input schemas as plain JSON Schema (values from vocab.js), argument checks and handlers. Handlers get
// their deps injected ({ env, fetchMe, withStudio, open, unlink, exists }), so tests run with no browser; server.js passes
// the real ones.
import { basename, dirname, extname, isAbsolute } from "node:path";
import { STYLES, LANGS, ASPECTS, POSITIONS, OUTPUTS, RESOLUTIONS, FPS } from "./vocab.js";
import { studioLink, studioQuery } from "./link.js";
import { freePath, outputPath } from "./paths.js";
import { message } from "./errors.js";

// What the on-device engine downloads on its first run: the config and tokenizer files plus the WASM set (encoder fp32,
// decoder q8) of the studio's pinned Whisper model, 138,934,000 bytes by HEAD request on 2026-10-28, counted in the
// studio's own MB of 1,048,576 bytes (its download status in 18-transcribe.js).
const MODEL_MB = 132;

const LINK = {
  style: { type: "string", enum: STYLES.map((s) => s.id), description: "Caption style. list_styles shows how each one looks." },
  words: { type: "integer", minimum: 1, maximum: 10, description: "Words per caption; 1 shows one word at a time." },
  lines: { type: "integer", minimum: 1, maximum: 2, description: "Lines per caption." },
  position: { type: "string", enum: POSITIONS, description: "Where the captions sit in the frame." },
  aspect: { type: "string", enum: ASPECTS, description: "Frame shape: 9:16 for TikTok, Shorts and Reels, 1:1 or 4:5 for feed posts, 16:9 for YouTube." },
  lang: { type: "string", enum: LANGS, description: "The spoken language. Give it for any video that isn't in English; auto lets cloud transcription detect it." },
};
const JOB = {
  path: { type: "string", description: "Absolute path to the video or audio file: MP4, MOV, WebM, MP3, WAV, M4A or another format the studio opens." },
  lang: LINK.lang,
  engine: { type: "string", enum: ["cloud", "device"], description: `cloud: ElevenLabs Scribe on the plan's cloud minutes, strongest on music, accents and 90+ languages; the default when the minutes left cover the file. device: on-device Whisper, no minutes; the first run downloads the model (${MODEL_MB} MB).` },
  keyterms: { type: "array", items: { type: "string", maxLength: 50 }, maxItems: 100, description: "Names and words for cloud transcription to spell your way." },
};
const EXTS = OUTPUTS.map((o) => `.${o}`).join(", ").replace(/, ([^,]+)$/, " or $1"); // ".mp4, .mov, .webm, .srt or .vtt"
const schema = (properties, required = []) => ({ type: "object", properties, ...(required.length && { required }), additionalProperties: false });

// Annotations tell clients what a call does to the world: read-only, idempotent, and whether it reaches cuecaps.com.
const annotations = (title, { readOnly, idempotent, network }) => ({ title, readOnlyHint: readOnly, destructiveHint: false, idempotentHint: idempotent, openWorldHint: network });

export const TOOLS = [
  {
    name: "list_styles",
    description: "Lists the 10 Cuecaps caption styles, each with the id to pass as style to caption_video or studio_link, its name and how it looks. The list is fixed and needs no key. Call it when the user hasn't picked a style or asks what the styles look like.",
    inputSchema: schema({}),
    annotations: annotations("List caption styles", { readOnly: true, idempotent: true, network: false }),
  },
  {
    name: "studio_link",
    description: "Returns a URL to the Cuecaps studio, opened with these caption settings, for the user to finish in their browser: they drop in the video, can fix words and export there. Creates nothing and needs no key, so it works on every plan, Free included. Use it when the user wants to edit by hand, has no Creator or Pro key, or the file isn't on this machine; use caption_video to make the file directly.",
    inputSchema: schema(LINK),
    annotations: annotations("Make a studio link", { readOnly: true, idempotent: true, network: false }),
  },
  {
    name: "account_status",
    description: "Reads the Cuecaps account behind CUECAPS_API_KEY: the plan, cloud minutes left this period, the date they reset, and whether agent captioning is included. Uses no minutes. Call it before transcribe or caption_video to check the plan and minutes; with no key or an invalid key it returns an error that says how to get one.",
    inputSchema: schema({}),
    annotations: annotations("Check the Cuecaps account", { readOnly: true, idempotent: true, network: true }),
  },
  {
    name: "transcribe",
    description: "Transcribes a local video or audio file and returns every word with its start and end time in seconds, plus the SRT text and the engine used. Writes no file: use caption_video when the user wants a captioned video, an overlay or a subtitle file. Needs a Creator or Pro key. engine \"cloud\" uses the plan's minutes and sends only compressed audio, deleted after transcription; \"device\" runs Whisper locally and uses none. Left unset, it picks cloud when the minutes left cover the file, else device.",
    inputSchema: schema(JOB, ["path"]),
    annotations: annotations("Transcribe a file", { readOnly: false, idempotent: false, network: true }),
  },
  {
    name: "caption_video",
    description: "Captions a local video or audio file with the Cuecaps studio's renderer in headless Chrome or Edge and writes <name>.captions.<ext> next to it, never replacing a file: an MP4 with the captions burned in, a transparent MOV or WebM overlay, or SRT or VTT subtitles. Returns the file, its duration in seconds, the engine, the cloud minutes used and a studio link to fine-tune words and style. Needs a Creator or Pro key; 1440p and 4K need Pro. Transcription works as in transcribe, and the video never leaves this machine. Use transcribe when only the words are needed, and studio_link when the user wants to edit by hand or has no key.",
    annotations: annotations("Caption a video", { readOnly: false, idempotent: false, network: true }),
    inputSchema: schema({
      ...JOB, ...LINK,
      // No schema default: with out_path, output follows its extension, and a client that fills in defaults would clash.
      output: { type: "string", enum: OUTPUTS, description: "mp4 with the captions burned in, mov or webm as a transparent captions-only overlay, or srt or vtt subtitles. Defaults to out_path's extension when out_path is given, else mp4." },
      resolution: { type: "string", enum: Object.keys(RESOLUTIONS), default: "1080p", description: "Short side of the video. 1440p and 4k come with Pro." },
      fps: { type: "integer", enum: FPS, default: 30, description: "Frames per second." },
      out_path: { type: "string", description: `Absolute path to write to instead of <name>.captions.<ext> next to the input, ending in ${EXTS}; its extension sets output. An existing file is never replaced: -2, -3 and so on go before the extension.` },
    }, ["path"]),
  },
];
const SCHEMAS = Object.fromEntries(TOOLS.map((t) => [t.name, t.inputSchema]));

// The SDK's low-level Server doesn't check arguments against inputSchema, so this does.
function invalid(name, { properties, required = [] }, args) {
  for (const k of required) if (args[k] === undefined) return `${k} is required.`;
  for (const [k, v] of Object.entries(args)) {
    const p = properties[k];
    if (!p) return `${name} takes ${Object.keys(properties).join(", ") || "no inputs"}, not ${k}.`;
    if (p.enum) { if (!p.enum.includes(v)) return `${k} must be one of: ${p.enum.join(", ")}.`; }
    else if (p.type === "integer") { if (!Number.isInteger(v) || v < p.minimum || v > p.maximum) return `${k} must be a whole number from ${p.minimum} to ${p.maximum}.`; }
    else if (p.type === "array") { if (!Array.isArray(v) || v.length > p.maxItems || !v.every((s) => typeof s === "string" && s.length <= p.items.maxLength)) return `${k} must be a list of up to ${p.maxItems} terms of up to ${p.items.maxLength} characters.`; }
    else if (typeof v !== "string") return `${k} must be a string.`;
  }
}

// An expected end to a job; its text goes to the agent as the tool's error.
class Refused extends Error {}
const refuse = (code, vars) => { throw new Refused(message(code, vars)); };
// What caption_video makes: output as given, else out_path's extension, else mp4. An out_path whose extension isn't an
// output, or isn't the output asked for, is refused before any work, so the file's name always says what it holds.
function outputFor({ output, out_path }) {
  if (out_path === undefined) return output ?? "mp4";
  const ext = extname(out_path).slice(1).toLowerCase();
  if (!OUTPUTS.includes(ext)) throw new Refused(`out_path must end in ${EXTS}.`);
  if (output !== undefined && output !== ext) throw new Refused(`out_path ends in .${ext}, but output is ${output}. Make them match, or leave output out.`);
  return ext;
}
// The studio's texts pass through, except two the agent can act on: exportBlob's text for a browser with no H.264
// encoder, and a key refused mid-run (the studio says "Please sign in again" and goes to /login).
const NO_H264 = "This browser can't encode H.264 video.";
const studioText = (text) => (text === NO_H264 ? message("no_h264") : text.includes("Please sign in again") ? message("bad_key") : text);
const round = (n, places) => (n == null ? null : Math.round(n * 10 ** places) / 10 ** places);
// When cloud minutes reset: the billing period's end, else the first of next month (UTC), when the calendar-month
// allowance starts again.
function resetsOn({ subscription }) {
  if (subscription?.periodEnd) return new Date(subscription.periodEnd);
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
const SUBTITLES = ["srt", "vtt"], OVERLAYS = ["mov", "webm"];

export function handlers({ env, fetchMe, withStudio, open, unlink, exists }) {
  const base = new URL(env.CUECAPS_URL || "https://cuecaps.com").origin, key = env.CUECAPS_API_KEY?.trim();

  // Every tool: arguments checked, then { text } with the result as JSON, or { text, isError } for an expected failure.
  // A client that cancels gets no reply (the SDK drops it), but the job still stops before writing anything.
  const tool = (name, job) => async (args, { progress = () => {}, signal } = {}) => {
    args = Object.fromEntries(Object.entries(args ?? {}).filter(([, v]) => v != null));
    const bad = invalid(name, SCHEMAS[name], args);
    if (bad) return { text: bad, isError: true };
    try { return { text: JSON.stringify(await job(args, progress, signal)) }; }
    catch (e) {
      if (signal?.aborted) return { text: "Cancelled. Nothing was written.", isError: true };
      if (e instanceof TypeError || e instanceof ReferenceError) throw e; // a bug, not an outcome to report
      return { text: e instanceof Refused ? e.message : studioText(e.message), isError: true };
    }
  };

  const left = (me) => me.minutes.limit - me.minutes.used;
  const noMinutes = (me) => refuse("no_minutes", { date: resetsOn(me).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }), plan: me.plan });

  // Key, plan, minutes and files, in that order, before any browser starts. plan() adds the tool's own plan checks.
  async function start(args, plan = () => {}) {
    if (!key) refuse("no_key");
    const me = await fetchMe(base, key);
    if (!me.features.agents) refuse("free_plan");
    plan(me.features);
    if (args.engine === "cloud" && left(me) <= 0) noMinutes(me);
    if (!isAbsolute(args.path) || !exists(args.path)) refuse("no_file", { path: args.path });
    const out = args.out_path;
    if (out !== undefined && !isAbsolute(out)) refuse("no_file", { path: out });
    if (out !== undefined && !exists(dirname(out))) refuse("no_folder", { dir: dirname(out) });
    return me;
  }
  // The engine is picked once the file is open and its length known: cloud when the minutes left cover it in whole
  // minutes, as the studio's Find words dialog counts them, else device. The studio's own status texts follow
  // "Transcribing" (uploading, downloading the model, listening), each new one once: the model download repeats its text
  // for every chunk. No speech ends the job before anything is rendered or written.
  async function findWords(studio, me, { path, lang, keyterms, engine: asked }, progress) {
    await studio.openFile(path);
    const duration = await studio.duration(), fits = left(me) >= Math.ceil((duration ?? 0) / 60);
    if (asked === "cloud" && !fits) noMinutes(me);
    const engine = asked ?? (fits ? "cloud" : "device");
    progress(asked || fits ? "Transcribing" : "Transcribing on this device (cloud minutes used up)");
    let last;
    const status = ({ text }) => { if (text && text !== last) progress(`Transcribing: ${(last = text)}`); };
    if (!(await studio.transcribe({ engine, lang, keyterms }, status))) refuse("no_speech", { file: basename(path) });
    return { engine, duration };
  }
  // The file is written by the time this runs, so a summary that fails to load gives null, not an error.
  async function minutesUsed(before) {
    const after = await fetchMe(base, key).catch(() => null);
    return after && round(Math.max(0, after.minutes.used - before.minutes.used), 2);
  }
  // "wx" never replaces a file, not even one that appeared after its name was picked; then the next free name gets one try.
  // A write that fails once the file is created (a full disk) removes it again, so no partial file is left.
  async function save(pick, data) {
    const write = async (file) => {
      const h = await open(file, "wx");
      try { await h.writeFile(data); await h.close(); }
      catch (e) { await h.close().catch(() => {}); await unlink(file).catch(() => {}); throw e; }
      return file;
    };
    try { return await write(pick()); }
    catch (e) { if (e.code === "EEXIST") return write(pick()); throw e; }
  }

  return {
    list_styles: tool("list_styles", async () => STYLES),
    studio_link: tool("studio_link", async (args) => ({ url: studioLink(base, args) })),
    account_status: tool("account_status", async () => {
      if (!key) refuse("no_key");
      const me = await fetchMe(base, key);
      return { plan: me.plan, minutes_left: round(Math.max(0, me.minutes.limit - me.minutes.used), 1), resets: resetsOn(me).toISOString().slice(0, 10), agents: me.features.agents };
    }),
    transcribe: tool("transcribe", async (args, progress, signal) => {
      const me = await start(args);
      progress("Opening");
      const found = await withStudio(studioQuery(args), async (studio) => {
        const { engine } = await findWords(studio, me, args, progress);
        return { words: await studio.words(), srt: await studio.subtitles("srt"), engine };
      }, signal);
      return { ...found, minutes_used: await minutesUsed(me) };
    }),
    caption_video: tool("caption_video", async (args, progress, signal) => {
      const { path, resolution = "1080p", fps = 30, out_path } = args, output = outputFor(args);
      const video = !SUBTITLES.includes(output), res = RESOLUTIONS[resolution];
      const me = await start(args, (f) => {
        if (video && res > f.maxHeight) refuse("needs_pro");
        if (OVERLAYS.includes(output) && !f.transparent) refuse("no_overlay");
      });
      progress("Opening");
      const done = await withStudio(studioQuery(args), async (studio) => {
        const { engine, duration } = await findWords(studio, me, args, progress);
        let shown = -1; // the studio reports every frame; the agent hears each new whole percent
        const data = video
          ? await studio.exportFile(output, { res, fps, withAudio: true }, ({ frame, total }) => {
            const pct = total ? Math.floor((frame / total) * 100) : -1;
            if (pct > shown) progress(`Rendering ${(shown = pct)}%`);
          })
          : await studio.subtitles(output);
        signal?.throwIfAborted();
        progress("Saving");
        const file = await save(() => (out_path ? freePath(out_path, exists) : outputPath(path, output, exists)), data);
        // The file is safe on disk; a link the save didn't get is null, not an error.
        return { file, duration: round(duration, 2), engine, studio_url: await studio.projectUrl().catch(() => null) };
      }, signal);
      return { file: done.file, duration: done.duration, engine: done.engine, minutes_used: await minutesUsed(me), studio_url: done.studio_url };
    }),
  };
}
