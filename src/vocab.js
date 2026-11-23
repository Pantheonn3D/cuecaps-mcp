// The studio-link vocabulary. This package is published on its own, so it holds copies of what the studio and the site
// define: STYLES is PRESET_NOTES in lib/presets.ts (look = its note; creator: a Creator style), LANGS and the aspects are in studio-src/10-core.js,
// FAST is FAST_TOOLS in studio-src/10-pure.js. test/vocab.test.mjs fails when a copy drifts.
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
  { id: "minimal", name: "Minimal", look: "Poppins in lowercase with a soft shadow, four words at a time. Words not yet spoken are dimmed, and each caption fades in." },
  { id: "subtitle", name: "Subtitle", look: "TikTok Sans in sentence case on a dark box, up to eight words on two lines, fading in, like TV subtitles." },
  { id: "scribble", name: "Scribble", look: "Permanent Marker with a black outline, three words at a time. The spoken word turns pink and each caption rises in." },
  { id: "spotlight", name: "Spotlight", look: "Montserrat in capitals with a heavy shadow, three words at a time. The spoken word turns yellow, keywords take turns in green, red and blue, and an emoji pops up above them.", creator: true },
  { id: "hype", name: "Hype", look: "Bangers in big capitals with a thick outline and a solid shadow, two words at a time, bouncing in. The spoken word grows, keywords take turns in green, yellow and red, and emoji pop up above.", creator: true },
  { id: "sweep", name: "Sweep", look: "Poppins, up to five words on two lines. Yellow sweeps through each word as it is spoken, karaoke style, and emphasized words fill pink.", creator: true },
  { id: "neon", name: "Neon", look: "Kanit in capitals with a pink neon outline and glow, the letters fading from white to pink. The spoken word turns cyan.", creator: true },
  { id: "retro", name: "Retro", look: "Titan One in capitals, yellow fading to orange, with a dark purple outline and 3D depth, two words at a time. The spoken word grows.", creator: true },
];
export const LANGS = [
  "auto", "en", "es", "pt", "fr", "de", "it", "nl", "da", "sv", "no", "fi", "pl",
  "tr", "ru", "uk", "ar", "hi", "id", "vi", "ja", "ko", "zh", "bn", "cs", "tl", "el", "he", "hu", "ms", "fa", "ro", "ta", "th", "ur",
];
export const ASPECTS = ["9:16", "1:1", "4:5", "16:9"];
export const POSITIONS = ["top", "middle", "bottom"];
// The Fast edit tools a studio link turns on once the words are found, in the studio's order.
export const FAST = ["deadspace", "fillers", "retakes", "zoom", "norm"];
export const OUTPUTS = ["mp4", "mov", "webm", "srt", "vtt"];
// The look a link sets on top of the style: FONTS in studio-src/10-core.js, and the names linkSettings in 10-pure.js
// reads for colors, how the spoken word is marked, the entrance animation and letter case.
export const FONTS = ["TikTok Sans", "Montserrat", "Poppins", "Inter", "Nunito", "Rubik", "Outfit", "Sora", "League Spartan", "Bricolage Grotesque", "Unbounded", "Kanit", "Space Grotesk", "Archivo Black", "Anton", "Bebas Neue", "Oswald", "Luckiest Guy", "Bangers", "Lilita One", "Titan One", "Permanent Marker", "Instrument Serif", "DM Serif Display"];
export const COLOR_NAMES = ["white", "black", "yellow", "gold", "orange", "red", "pink", "purple", "blue", "cyan", "green", "lime"];
export const MARKS = ["color", "box", "grow", "dim", "reveal", "none"];
export const ANIMS = ["pop", "punch", "bounce", "rise", "slide", "fade", "focus", "typewriter", "none"];
export const CASES = ["upper", "lower", "as-spoken"];
// Export resolutions by short side in pixels, and the frame rates the studio offers.
export const RESOLUTIONS = { "720p": 720, "1080p": 1080, "1440p": 1440, "4k": 2160 };
export const FPS = [24, 25, 30, 50, 60];
