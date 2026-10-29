// The studio-link vocabulary. This package is published on its own, so it holds copies of what the studio and the site
// define: STYLES is PRESET_NOTES in lib/presets.ts (look = its note), LANGS and the aspects are in studio-src/10-core.js.
// test/vocab.test.mjs fails when a copy drifts.
export const STYLES = [
  { id: "bold", name: "Bold", look: "Montserrat in capitals with a black outline, up to three words at a time. The spoken word turns yellow and each caption pops in." },
  { id: "clean", name: "Clean", look: "TikTok Sans in normal case, one word at a time, with a soft shadow and no outline." },
  { id: "karaoke", name: "Karaoke", look: "Poppins, up to five words on two lines. A purple box sits behind the word being spoken." },
  { id: "comic", name: "Comic", look: "Luckiest Guy with a thick outline, two words at a time. The spoken word grows, and emphasised words turn red and wiggle." },
  { id: "tall", name: "Tall", look: "Anton, very large, one word at a time, slamming in from large." },
  { id: "editorial", name: "Editorial", look: "Instrument Serif with punctuation kept, up to six words on two lines. Words not yet spoken are dimmed." },
  { id: "boxed", name: "Boxed", look: "Dark TikTok Sans on a white box, up to four words at a time." },
  { id: "rounded", name: "Rounded", look: "Nunito in capitals with a dark outline and a solid drop shadow. A green box marks the spoken word." },
  { id: "typewriter", name: "Typewriter", look: "Space Grotesk on a translucent black box. Letters appear one by one as each word is spoken." },
  { id: "glow", name: "Glow", look: "Bricolage Grotesque with a cyan glow, one word at a time, coming into focus from a blur." },
];
export const LANGS = [
  "auto", "en", "es", "pt", "fr", "de", "it", "nl", "da", "sv", "no", "fi", "pl",
  "tr", "ru", "uk", "ar", "hi", "id", "vi", "ja", "ko", "zh",
];
export const ASPECTS = ["9:16", "1:1", "4:5", "16:9"];
export const POSITIONS = ["top", "middle", "bottom"];
export const OUTPUTS = ["mp4", "mov", "webm", "srt", "vtt"];
// Export resolutions by short side in pixels, and the frame rates the studio offers.
export const RESOLUTIONS = { "720p": 720, "1080p": 1080, "1440p": 1440, "4k": 2160 };
export const FPS = [24, 25, 30, 50, 60];
