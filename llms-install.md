# Installing the Cuecaps MCP server

There are two ways to add Cuecaps. Pick the hosted server unless the user wants files on their computer captioned
without opening a browser.

## 1. Hosted server (recommended, no install, no key)

Add a remote MCP server with Streamable HTTP transport:

```json
{
  "mcpServers": {
    "cuecaps": {
      "type": "streamableHttp",
      "url": "https://cuecaps.com/mcp"
    }
  }
}
```

It has two tools: `list_styles` and `studio_link`. Test it by calling `list_styles`; it returns 18 styles with an `id`,
`name` and `look`. No environment variables are needed.

## 2. Local server (captions files on the user's computer)

Requirements: Node 22 or later, and Google Chrome or Microsoft Edge installed. Ask the user for their Cuecaps key from
https://cuecaps.com/account (it starts with `cck_`; agent access comes with the Creator or Pro plan). Never invent one.

```json
{
  "mcpServers": {
    "cuecaps": {
      "command": "npx",
      "args": ["-y", "cuecaps-mcp"],
      "env": { "CUECAPS_API_KEY": "cck_..." }
    }
  }
}
```

If Chrome or Edge is installed somewhere non-standard, add `"CUECAPS_CHROME": "<path to the browser executable>"` to
`env`. Test it by calling `account_status`, which returns the plan and the cloud minutes left.

Tools: `list_styles`, `studio_link`, `account_status`, `transcribe`, `caption_video`. The README describes every argument.
