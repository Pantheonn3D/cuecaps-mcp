import { existsSync } from "node:fs";
import { join, parse } from "node:path";

// path itself, else the same name with -2, -3 and so on before the extension. Never an existing file.
export function freePath(path, exists = existsSync) {
  const { dir, name, ext } = parse(path), at = (n) => join(dir, `${name}${n}${ext}`);
  let out = at("");
  for (let n = 2; exists(out); n++) out = at(`-${n}`);
  return out;
}

// <name>.captions.<ext> next to the input, then <name>.captions-2.<ext>, -3 and so on. Never an existing file.
export function outputPath(input, ext, exists = existsSync) {
  const { dir, name } = parse(input);
  return freePath(join(dir, `${name}.captions.${ext}`), exists);
}
