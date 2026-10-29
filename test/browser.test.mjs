// Tests for the browser layer: where Chrome or Edge is found, the flags it starts with, and that it always closes.
// The page-driving code is covered by a smoke run against the studio, not here.
// Run from the repo root: node --test mcp/test/browser.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findBrowser, launchArgs, withBrowser } from "../src/browser.js";

test("finds Chrome first, then Edge, and honours CUECAPS_CHROME", () => {
  const has = (...ps) => (p) => ps.includes(p);
  assert.equal(findBrowser({ env: { CUECAPS_CHROME: "/x/chrome" }, platform: "linux", exists: () => true }), "/x/chrome");
  assert.equal(findBrowser({ env: {}, platform: "darwin", exists: has("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge") }), "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
  assert.equal(findBrowser({ env: {}, platform: "linux", exists: () => false }), null);
});
test("finds Edge on Windows under an MCP client's default environment, which has no PROGRAMFILES(X86)", () => {
  const edge = (drive) => `${drive}\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe`;
  const only = (p) => (q) => q === p;
  const sdk = { PROGRAMFILES: "C:\\Program Files", LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" };
  assert.equal(findBrowser({ env: sdk, platform: "win32", exists: only(edge("C:")) }), edge("C:"));
  assert.equal(findBrowser({ env: {}, platform: "win32", exists: only(edge("C:")) }), edge("C:"));
  assert.equal(findBrowser({ env: { SYSTEMDRIVE: "D:" }, platform: "win32", exists: only(edge("D:")) }), edge("D:"));
});
test("the browser gets its own profile and a free port, leaving the user's Chrome alone", () => {
  const args = launchArgs("/tmp/cuecaps-x");
  assert.ok(args.includes("--remote-debugging-port=0") && args.includes("--user-data-dir=/tmp/cuecaps-x") && args.includes("--headless=new"));
});
test("withBrowser closes the browser when the work throws", async () => {
  let closed = false;
  const launch = async () => ({ cdp: {}, close: async () => { closed = true; } });
  await assert.rejects(withBrowser(async () => { throw new Error("boom"); }, { launch, path: "x" }), /boom/);
  assert.equal(closed, true);
});
