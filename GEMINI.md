# Cuecaps

The `cuecaps` MCP server makes animated word-by-word captions for TikTok, YouTube Shorts, Reels and YouTube videos.

- `list_styles` lists the 10 caption styles. Call it when the user hasn't picked one.
- `studio_link` returns a cuecaps.com/studio link set up with the style, words per caption, position, frame shape,
  language and Fast edit tools (`fast`: deadspace, fillers, retakes, zoom, norm, or all). Give the user the link and the
  steps it returns. The video is transcribed and rendered in their browser, never uploaded. The studio exports MP4,
  transparent overlays, SRT, VTT, ASS karaoke and, with Fast edit, EDL or FCPXML cut lists.

To caption a file on the user's computer without opening the studio, they need the local server:
`npx -y cuecaps-mcp` with a key from https://cuecaps.com/account (Creator or Pro).
