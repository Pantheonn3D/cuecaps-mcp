// Drift guard: the package keeps its own copy of the studio's and the site's vocabulary, because it is published on
// its own. This fails when the copy and the originals part ways. Run from the repo root: node --test mcp/test/vocab.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STYLES, LANGS, ASPECTS, FAST, FONTS } from "../src/vocab.js";

test("vocab matches the studio and the site", () => {
  const presets = readFileSync("lib/presets.ts", "utf8"), core = readFileSync("studio-src/10-core.js", "utf8"), pure = readFileSync("studio-src/10-pure.js", "utf8");
  assert.deepEqual(FAST, JSON.parse(pure.match(/const FAST_TOOLS = (\[[^\]]*\]);/)[1]));
  assert.deepEqual(STYLES.map((s) => [s.id, s.name]), [...presets.matchAll(/id: "([a-z]+)", name: "([A-Za-z]+)"/g)].map((m) => [m[1], m[2]]));
  const langs = core.slice(core.indexOf("const LANGS"), core.indexOf("];", core.indexOf("const LANGS")));
  assert.deepEqual(LANGS, [...langs.matchAll(/\["([a-z]+)",/g)].map((m) => m[1]));
  const aspects = core.match(/const ASPECTS = \{([^}]*)\}/)[1];
  assert.deepEqual([...ASPECTS].sort(), [...aspects.matchAll(/"(\d+:\d+)"/g)].map((m) => m[1]).sort());
  const fonts = core.slice(core.indexOf("const FONTS"), core.indexOf("];", core.indexOf("const FONTS")));
  assert.deepEqual(FONTS, [...fonts.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]));
});
