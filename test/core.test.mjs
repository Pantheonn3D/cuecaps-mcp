// Tests for the package core: studio links, output paths and error texts. The link test loads the studio's own
// linkSettings (studio-src/10-pure.js) the way scripts/smart.test.mjs does.
// Run from the repo root: node --test mcp/test/core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { STYLES, ASPECTS, LANGS, FAST, FONTS, COLOR_NAMES, MARKS, ANIMS, CASES } from "../src/vocab.js";
import { studioQuery, studioLink } from "../src/link.js";
import { outputPath } from "../src/paths.js";
import { message } from "../src/errors.js";

const src = readFileSync(new URL("../../studio-src/10-pure.js", import.meta.url), "utf8");
const pure = vm.runInNewContext(`${src}\n;({ linkSettings })`, {});
// Values made inside the vm have its own Array prototype; compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

const OK = { presets: STYLES.map((s) => s.id), aspects: ASPECTS, langs: LANGS };

test("tool arguments become a studio query that linkSettings reads back unchanged", () => {
  const args = { style: "karaoke", words: 4, lines: 2, position: "top", aspect: "1:1", lang: "es", output: "mp4" };
  assert.deepEqual(plain(pure.linkSettings(new URLSearchParams(studioQuery(args)), OK)),
    { preset: "karaoke", words: 4, lines: 2, position: "top", aspect: "1:1", lang: "es" });
  assert.equal(studioQuery({}), "");
  assert.equal(studioLink("https://cuecaps.com", { style: "bold", words: 1 }), "https://cuecaps.com/studio?style=bold&words=1&src=assistant");
  assert.equal(studioLink("https://cuecaps.com", {}), "https://cuecaps.com/studio?src=assistant");
});

test("the look reaches the studio as the settings asked for", () => {
  const fonts = FONTS, read = (args) => plain(pure.linkSettings(new URLSearchParams(studioQuery(args)), { ...OK, fonts }));
  assert.deepEqual(read({ font: "Bebas Neue", color: "#FFFFFF", highlight: "yellow", emphasis: "f0f", mark: "grow", anim: "typewriter", case: "as-spoken", size: 140, voice: true }),
    { font: "Bebas Neue", color: "#FFFFFF", highlight: "#FFE14D", emphasis: "#FF00FF", mark: "scale", anim: "type", case: "none", size: 140, voice: true });
  for (const m of MARKS) assert.ok(read({ mark: m }).mark, m);
  for (const a of ANIMS) assert.ok(read({ anim: a }).anim, a);
  for (const k of CASES) assert.ok(read({ case: k }).case, k);
  for (const n of COLOR_NAMES) assert.ok(read({ color: n }).color, n);
  for (const f of FONTS) assert.equal(read({ font: f }).font, f);
});

test("fast reaches the studio as the Fast edit tools to turn on", () => {
  const read = (fast) => plain(pure.linkSettings(new URLSearchParams(studioQuery({ fast })), OK)).fast;
  assert.deepEqual(read(["all"]), FAST);
  assert.deepEqual(read(FAST), FAST);
  assert.deepEqual(read(["zoom", "fillers"]), ["fillers", "zoom"]);
  assert.equal(read([]), undefined);
});

test("outputs sit next to the input, keep spaces and accents, and never overwrite", () => {
  const dir = join("C:", "Users", "x", "02 Creative and Media"), input = join(dir, "clip é.mp4");
  const taken = new Set([join(dir, "clip é.captions.mp4")]);
  assert.equal(outputPath(input, "mp4", (p) => taken.has(p)), join(dir, "clip é.captions-2.mp4"));
  assert.equal(outputPath(join(dir, "talk.mov"), "srt", () => false), join(dir, "talk.captions.srt"));
});

test("error texts fill their placeholders", () => {
  assert.match(message("no_minutes", { date: "1 November" }), /reset on 1 November/);
  assert.match(message("no_speech", { file: "a.mp4" }), /in a\.mp4/);
});
