# mcp-arbeitnow

Arbeitnow Job Board MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1861+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

| Tool | Description |
|------|-------------|
| `list_jobs` | List recent job postings from Arbeitnow, a keyless European (Germany-heavy) job board with many English-speaking and visa-sponsorship roles. Returns one page of postings in reverse-chronological order (newest first). HTML descriptions are omitted from this list — use get_job for the full description. Use page to paginate and remote_only to keep only remote jobs. |
| `search_jobs` | Keyword-search recent Arbeitnow job postings (keyless European/German job board, many English-speaking & visa-sponsor roles). The upstream API has no search param, so this scans the most recent pages and filters client-side: it keeps jobs whose title, company name, or any tag contains the query (case-insensitive). Scans up to `pages` pages (default 3, max 10). Older jobs that have scrolled off the recent pages will not be found. |
| `get_job` | Fetch the full details of a single Arbeitnow job posting by its slug, INCLUDING the full HTML description. There is no single-job endpoint upstream, so this scans the most recent pages (~3) to find the matching slug. If the job has scrolled off the recent listings it cannot be retrieved — use search_jobs instead. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "arbeitnow": {
      "url": "https://gateway.pipeworx.io/arbeitnow/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/arbeitnow/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1861+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/arbeitnow_list_jobs \
  -H 'Content-Type: application/json' \
  -d '{"page":1,"remote_only":false}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/arbeitnow_list_jobs`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-arbeitnow` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/arbeitnow/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "arbeitnow": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-arbeitnow"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Arbeitnow data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
