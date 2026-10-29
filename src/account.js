// The account behind the key. /api/me answers a valid key on any plan, so a plan without agent access reads
// features.agents false here instead of failing like a revoked key.
import { message } from "./errors.js";

export async function fetchMe(base, key) {
  let res;
  // fetch's own error can quote the header it refused, key and all, so only the host goes into the message.
  try { res = await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${key}` } }); }
  catch { throw new Error(`Couldn't reach ${base}.`); }
  if (res.status === 401) throw new Error(message("bad_key"));
  if (!res.ok) throw new Error(`Cuecaps answered ${res.status} for /api/me.`);
  return res.json();
}
