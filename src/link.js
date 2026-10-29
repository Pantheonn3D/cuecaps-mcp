// A studio link sets up a new project: /studio?style=karaoke&words=4&lines=2&position=bottom&aspect=9:16&lang=es.
const KEYS = ["style", "words", "lines", "position", "aspect", "lang"];

export const studioQuery = (args) =>
  new URLSearchParams(KEYS.filter((k) => args[k] !== undefined).map((k) => [k, String(args[k])])).toString();

export function studioLink(base, args) {
  const query = studioQuery(args);
  return `${base}/studio${query && `?${query}`}`;
}
