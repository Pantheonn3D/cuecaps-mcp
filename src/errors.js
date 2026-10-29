const TEXTS = {
  no_key: "Create a key at cuecaps.com/account (Creator and Pro), then add it to your MCP config as CUECAPS_API_KEY.",
  bad_key: "That key no longer works. Create a new one at cuecaps.com/account.",
  free_plan: "Agent captioning comes with Creator and Pro: cuecaps.com/pricing. studio_link works on every plan.",
  // Pro is the top plan, so it isn't offered Pro.
  no_minutes: ({ date, plan }) => `Cloud minutes reset on ${date}. Use engine "device"${plan === "pro" ? "" : ", or Pro for 1,200 a month"}.`,
  needs_pro: "4K and 1440p come with Pro. Use 1080p or 720p.",
  no_overlay: "Transparent overlays come with Creator and Pro.",
  no_browser: "Install Google Chrome, or set CUECAPS_CHROME to your browser's path.",
  no_h264: "This browser can't encode H.264. Use Google Chrome or Microsoft Edge.",
  no_speech: "No speech found in {file}. Check that it has speech, or try engine \"cloud\".",
  no_file: "No file at {path}. Give the full path to a video or audio file.",
  no_folder: "No folder at {dir}.",
};

// The text for an error code, with {name} placeholders filled from vars (or the text a function makes from them).
export const message = (code, vars = {}) => {
  const t = TEXTS[code];
  return typeof t === "function" ? t(vars) : t.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
};
