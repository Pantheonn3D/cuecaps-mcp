# cuecaps-mcp

Caption a video or audio file on your computer from Claude Code, Cursor, Claude Desktop or any MCP client. Ask "caption
talk.mp4 in Karaoke and give me the MP4" and `talk.captions.mp4` lands next to the original. Ask it to cut the pauses
too, and Fast edit trims the dead space, filler words and retakes before the captions render. The server drives the
Cuecaps studio's own export in headless Chrome or Edge on your machine, so the result matches a studio export of the same
settings. Once the project syncs to your account, `caption_video` also returns a studio link that opens it, to fix a word
or change the style.

## No install: the hosted server

Apps that connect to an MCP server by URL can use **`https://cuecaps.com/mcp`** (Streamable HTTP) with no install and no
key: claude.ai and the Claude apps on phone and desktop, ChatGPT, Gemini CLI, Claude Code and Cursor. It has
`list_styles` and `studio_link`, so you ask for captions the way you'd describe them ("karaoke captions on a Spanish
TikTok") and get a studio link set up for them, to finish in your browser. The studio exports an MP4, a transparent
overlay, SRT, VTT or ASS karaoke subtitles, and with Fast edit on an EDL or FCPXML cut list for Premiere Pro, DaVinci
Resolve or Final Cut Pro. To caption a file on your computer directly,
use this package (below).

- claude.ai: Settings, Connectors, Add custom connector, and paste `https://cuecaps.com/mcp`.
- Claude Code: `claude mcp add --transport http cuecaps https://cuecaps.com/mcp`
- Cursor: [Add to Cursor](https://cursor.com/en/install-mcp?name=cuecaps&config=eyJ1cmwiOiJodHRwczovL2N1ZWNhcHMuY29tL21jcCJ9)
- VS Code: [Install in VS Code](https://insiders.vscode.dev/redirect/mcp/install?name=cuecaps&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fcuecaps.com%2Fmcp%22%7D)
- Gemini CLI: `gemini extensions install https://github.com/Pantheonn3D/cuecaps-mcp`, or in `~/.gemini/settings.json`:
  `{ "mcpServers": { "cuecaps": { "httpUrl": "https://cuecaps.com/mcp" } } }`
- Codex CLI, in `~/.codex/config.toml`: `[mcp_servers.cuecaps]` then `url = "https://cuecaps.com/mcp"`
- goose: open `goose://extension?url=https%3A%2F%2Fcuecaps.com%2Fmcp&type=streamable_http&id=cuecaps&name=Cuecaps&description=Animated%20word-by-word%20captions`
  in your browser, or add a Remote Extension (Streamable HTTP) with the URL above.
- Continue, in `.continue/mcpServers/cuecaps.yaml`:

  ```yaml
  name: Cuecaps
  version: 0.0.1
  schema: v1
  mcpServers:
    - name: Cuecaps
      type: streamable-http
      url: https://cuecaps.com/mcp
  ```

- Cline: Settings, MCP Servers, Remote Servers, with the URL above. Agents setting it up can follow
  [llms-install.md](llms-install.md).

Setup for every client: [cuecaps.com/ai-assistants](https://cuecaps.com/ai-assistants).

## Requirements

- Node 22 or later.
- Google Chrome or Microsoft Edge, found at its standard install path. `CUECAPS_CHROME` points to any other browser.
- A key from [cuecaps.com/account](https://cuecaps.com/account). Agent access comes with a Creator or Pro plan:
  [cuecaps.com/pricing](https://cuecaps.com/pricing).

## Setup

### Claude Code

```sh
claude mcp add cuecaps --env CUECAPS_API_KEY=cck_… -- npx -y cuecaps-mcp
```

### Claude Desktop and Cursor

Add this to the MCP config: Settings, Developer, Edit Config in Claude Desktop, or `~/.cursor/mcp.json` in Cursor.

```json
{ "mcpServers": { "cuecaps": { "command": "npx", "args": ["-y", "cuecaps-mcp"], "env": { "CUECAPS_API_KEY": "cck_…" } } } }
```

The Agent access card on [cuecaps.com/account](https://cuecaps.com/account) creates a key and shows this config with
the key filled in.

## Tools

| Tool | Key | What it does |
|---|---|---|
| `list_styles` | no | The 10 caption styles: id, name and how each one looks. |
| `studio_link` | no | A studio link that opens set up with your settings. Works on every plan. |
| `account_status` | yes | Your plan, cloud minutes left this period, the date they reset, and whether it includes agent captioning. |
| `transcribe` | yes | Every word of a file with its start and end time in seconds, plus the SRT text. Writes no file. |
| `caption_video` | yes | Captions a file and writes the result next to it. |

Every input except `path` is optional. The caption settings use the studio-link names: `style`, `words` (1 to 10),
`lines` (1 or 2), `position` (`top`, `middle`, `bottom`), `aspect` (`9:16`, `1:1`, `4:5`, `16:9`) and `lang` (a language
code such as `es`; `auto` lets cloud transcription detect it). Each tool's schema lists the valid values.

`studio_link` and `caption_video` also take `fast`, the Fast edit tools to turn on once the words are found:
`deadspace` cuts the pauses, `fillers` cuts um, uh and stutters, `retakes` keeps the last take of a restarted sentence,
`zoom` punches in on the jump cuts and `norm` levels the volume to -14 LUFS. `["all"]` turns on all five. In
`caption_video` the file is cut before it renders, and SRT, VTT and overlay timings follow the cut. A studio link with
`fast` works on every plan; exporting with Fast edit comes with Creator and Pro.

Both also take the look the user describes, on top of the style, so the captions come out the way they asked:
`font` (any of the studio's 24 fonts, such as `Bebas Neue`), `color` (the text), `highlight` (the word being spoken)
and `emphasis` (key words), each as a hex value or `white`, `black`, `yellow`, `gold`, `orange`, `red`, `pink`,
`purple`, `blue`, `cyan`, `green` or `lime`; `mark` (`color`, `box`, `grow`, `dim`, `reveal` or `none`); `anim`
(`pop`, `punch`, `bounce`, `rise`, `slide`, `fade`, `focus`, `typewriter` or `none`); `case` (`upper`, `lower` or
`as-spoken`) and `size` (50 to 200, a percent of the style's size). `studio_link` also takes `voice: true`, which
removes background noise from the voice once the words are found (Chrome or Edge on a computer). Its links end in
`src=assistant`, so the studio opens with a preview of the captions in that look and says the assistant set it up.

`transcribe` and `caption_video` also take:

- `engine`: `cloud` is ElevenLabs Scribe on your plan's cloud minutes, strongest on music, accents and 90+ languages, and
  the default when the minutes left cover the file. `device` is on-device Whisper with no minutes; its first run
  downloads the model (132 MB). The result names the engine used.
- `keyterms`: up to 100 names and words for cloud transcription to spell your way.

`caption_video` also takes:

- `output`: `mp4` with the captions burned in (the default), `mov` or `webm` as a transparent captions-only overlay, or
  `srt` or `vtt` subtitles.
- `resolution`: `720p`, `1080p` (the default), `1440p` or `4k`. 1440p and 4K come with Pro.
- `fps`: 24, 25, 30 (the default), 50 or 60.
- `out_path`: an absolute path in an existing folder to write to instead; its extension sets the output.

### Examples

`list_styles`

```json
{}
```

Returns `[{ "id": "bold", "name": "Bold", "look": "Montserrat in capitals with a black outline, …" }, …]`.

`studio_link`

```json
{ "style": "karaoke", "words": 4, "aspect": "9:16" }
```

Returns `{ "url": "https://cuecaps.com/studio?style=karaoke&words=4&aspect=9%3A16&src=assistant" }`.

```json
{ "style": "bold", "fast": ["all"] }
```

Returns `{ "url": "https://cuecaps.com/studio?style=bold&fast=all&src=assistant" }`: the studio cuts the dead space,
filler words and retakes, adds the jump-cut zoom and levels the volume as soon as the words are found.

```json
{ "style": "bold", "font": "Bebas Neue", "highlight": "yellow", "anim": "bounce", "voice": true }
```

Returns a link that opens with yellow-highlighted Bebas Neue captions bouncing in, and removes the background noise
once the words are found.

`account_status`

```json
{}
```

Returns `{ "plan": "creator", "minutes_left": 287.5, "resets": "2026-11-20", "agents": true }`.

`transcribe`

```json
{ "path": "/Users/ana/clips/talk.mp4", "engine": "device" }
```

Returns `{ "words": [{ "text": "Greetings!", "start": 0.48, "end": 1.84 }, …], "srt": "1\n00:00:00,480 --> …", "engine": "device", "minutes_used": 0 }`.

`caption_video`

```json
{ "path": "/Users/ana/clips/talk.mp4", "style": "karaoke", "aspect": "9:16", "fast": ["deadspace", "fillers"] }
```

Returns `{ "file": "/Users/ana/clips/talk.captions.mp4", "duration": 17.17, "engine": "cloud", "minutes_used": 0.29, "studio_url": "https://cuecaps.com/studio#p=…" }`.
While it runs, the server reports progress: Opening, Transcribing, Rendering 42%, Saving.

## Output files

`caption_video` writes `<name>.captions.<ext>` next to the input. A file that already exists is never replaced: the
next run writes `<name>.captions-2.<ext>`, then `-3`, and so on. The same rule applies to `out_path`.

The studio link in `studio_url` opens the saved project on Creator and Pro. The video itself stays on your machine, so
the studio asks for the file again when you open the link on another device.

## Settings

| Variable | Use |
|---|---|
| `CUECAPS_API_KEY` | Your key (`cck_` and 32 characters). |
| `CUECAPS_CHROME` | Path to the Chrome or Edge executable, when it isn't at a standard install path. |
| `CUECAPS_URL` | The Cuecaps site, `https://cuecaps.com` by default. |

## Privacy

- Your video stays on your machine. The render happens in a browser on your computer.
- Cloud transcription sends compressed speech audio, as the studio does, and deletes it after transcription.
  `engine: "device"` sends no audio. The project and its words still sync to your account, as every project does on
  Creator and Pro.
- Your key goes only to `cuecaps.com/api/*` requests. It is never in a URL, a log or a file.
- Each run uses a temporary browser profile and deletes it afterwards, so no cookies or projects stay behind.

## License

MIT. The source is at [github.com/Pantheonn3D/cuecaps-mcp](https://github.com/Pantheonn3D/cuecaps-mcp).
