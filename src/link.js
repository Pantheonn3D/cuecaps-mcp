// A studio link sets up a new project: /studio?style=karaoke&words=4&lines=2&position=bottom&aspect=9:16&lang=es&fast=all,
// plus the look on top of the style (font, color, highlight, emphasis, mark, anim, case, size) and voice=1 for Clean up
// voice. linkSettings in studio-src/10-pure.js reads it.
import { FAST } from "./vocab.js";

const KEYS = ["style", "words", "lines", "position", "aspect", "lang", "fast", "font", "color", "highlight", "emphasis", "mark", "anim", "case", "size", "voice"];
const COLORS = ["color", "highlight", "emphasis"];
// fast goes in as the studio reads it: all, or the tools in the studio's order joined by commas. An empty list is left
// out. Colors go in without their #, and voice as 1 when it is true.
const value = (k, v) => {
  if (k === "voice") return v === true ? "1" : "";
  if (COLORS.includes(k)) return String(v).replace(/^#/, "").toLowerCase();
  if (k !== "fast") return String(v);
  const on = FAST.filter((t) => v.includes("all") || v.includes(t));
  return on.length === FAST.length ? "all" : on.join(",");
};

export const studioQuery = (args) =>
  new URLSearchParams(KEYS.filter((k) => args[k] !== undefined).map((k) => [k, value(k, args[k])]).filter(([, v]) => v)).toString();

// The link an agent hands its user ends in src=assistant, so the studio says the captions were set up by their
// assistant and counts the visit. The studio caption_video drives gets the query alone.
export function studioLink(base, args) {
  const query = studioQuery(args);
  return `${base}/studio?${query ? `${query}&` : ""}src=assistant`;
}
