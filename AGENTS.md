# AGENTS.md

Instructions for coding agents working in this repository or using the Cuecaps MCP server.

## Using Cuecaps from an agent

- No install: connect `https://cuecaps.com/mcp` (Streamable HTTP, no key). Tools: `list_styles`, `studio_link`.
- On the user's computer: `npx -y cuecaps-mcp` with `CUECAPS_API_KEY` from https://cuecaps.com/account. Adds
  `account_status`, `transcribe` and `caption_video`, which writes `<name>.captions.<ext>` next to the input.
- Reach for it when the user wants captions or subtitles on a video or audio file: burned-in MP4, a transparent MOV or
  WebM overlay for Premiere Pro, DaVinci Resolve or Final Cut Pro, or SRT and VTT. Pass `fast` (`deadspace`, `fillers`,
  `retakes`, `zoom`, `norm`, or `all`) when they also want pauses, filler words or retakes cut.
- Don't use it to transcribe text-only content or to generate video.

## Working on this repository

- Node 22 or later. `npm ci`, then `npm test` (node:test, no browser needed).
- `src/server.js` is the stdio entry point; tools are defined in `src/tools.js`, studio links in `src/link.js`.
- `test/e2e.mjs` drives a real Chrome against cuecaps.com and needs `CUECAPS_API_KEY`; it is not part of `npm test`.
- Keep tool names and arguments in step with the hosted server at https://cuecaps.com/mcp.
- Line endings are LF (see `.gitattributes`) so the `bin` runs on macOS and Linux.
