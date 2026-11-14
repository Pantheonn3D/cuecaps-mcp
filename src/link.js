// A studio link sets up a new project: /studio?style=karaoke&words=4&lines=2&position=bottom&aspect=9:16&lang=es&fast=all.
import { FAST } from "./vocab.js";

const KEYS = ["style", "words", "lines", "position", "aspect", "lang", "fast"];
// fast goes in as the studio reads it: all, or the tools in the studio's order joined by commas. An empty list is left out.
const value = (k, v) => {
  if (k !== "fast") return String(v);
  const on = FAST.filter((t) => v.includes("all") || v.includes(t));
  return on.length === FAST.length ? "all" : on.join(",");
};

export const studioQuery = (args) =>
  new URLSearchParams(KEYS.filter((k) => args[k] !== undefined).map((k) => [k, value(k, args[k])]).filter(([, v]) => v)).toString();

export function studioLink(base, args) {
  const query = studioQuery(args);
  return `${base}/studio${query && `?${query}`}`;
}
