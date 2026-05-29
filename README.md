# ◊ si-didy-agent · v2

**Sovereign 4-tier agent · Claude Agent SDK · CLI + HTTP + MCP + Browser · ◊·κ=1**

You write a brief in plain English. Claude reads it. The agent picks the **cheapest execution tier** that finishes the job — CLI when possible, HTTP when there's an API, MCP when a server is registered, browser only as last resort. **No API charges.** Your Claude subscription pays.

Prime **379** · MIT · part of the [ai-nativesolutions.com](https://www.ai-nativesolutions.com) estate.

Landing: [sjgant80-hub.github.io/si-didy-agent](https://sjgant80-hub.github.io/si-didy-agent/)

---

## What's new in v2

v1 was Playwright-only. As Thomas put it: "playwright is for noobs." He was right.

v2 ships **four execution tiers**, cheapest-first:

```
T0 · cli_run, cli_which           ← gh, stripe, gcloud, npm, git, curl, …
T1 · http_fetch, graphql_query    ← any REST/GraphQL API directly
T2 · mcp__<server>__<tool>        ← any MCP server you register in ./mcps.json
T3 · browser_*                    ← Playwright · LAST RESORT only
```

The agent picks per step. State your tier choice. Justify T3.

**Lazy-load:** Playwright only imports if a browser tool is actually called. Zero startup cost when the job is API-only.

---

## Setup (3 min)

```bash
# 1. Install Claude Code (subscription auth — one time)
npm i -g @anthropic-ai/claude-code
claude                     # OAuth · /quit when done

# 2. Clone + deps
git clone https://github.com/sjgant80-hub/si-didy-agent
cd si-didy-agent
npm install

# 3. (Optional) install Chromium if you'll use the browser tier
npx playwright install chromium

# 4. Make sure CLIs you care about are on PATH:
gh --version           # GitHub
stripe --version       # Stripe (optional)
# etc.

# 5. Run on a brief
node agent.mjs ./examples/GITHUB-AUDIT-BRIEF.txt
```

First-run output:

```
◊·κ=1 · si-didy-agent v2.0 · 4-tier sovereign
◊ auth: Claude Code subscription ✓ (no per-token API charges)

◊ tiers loaded:
   T0 · CLI       · 30 commands allowed
   T1 · HTTP      · REST + GraphQL ready
   T2 · MCP proxy · (none registered · create ./mcps.json to add)
   T3 · Browser   · Playwright (lazy · loaded on first browser_* call)
```

---

## Routing rules

| task | tier | how |
|---|---|---|
| Create a GitHub repo | **T0** | `gh repo create` |
| List a user's repos | **T0** | `gh api users/X/repos` |
| Diff two branches | **T0** | `git diff` |
| Post a Stripe charge | **T0** | `stripe charges create` |
| Query Linear/Shopify GraphQL | **T1** | `graphql_query` |
| Call any REST API | **T1** | `http_fetch` with `${env:TOKEN}` |
| Talk to OnlyBrains/fallcore | **T2** | register in `mcps.json` |
| Edit a web profile with no API | **T3** | Playwright (rare · justified) |

The agent states its tier choice in the terminal log:

```
  T0 · cli_run {"cmd":"gh","args":["api","users/teslasolar/repos"]}
  T1 · http_fetch {"url":"https://api.stripe.com/v1/charges","method":"POST"}
  T3 · browser_navigate {"url":"https://upwork.com/..."}
```

---

## Auth via env interpolation

Write `${env:VAR_NAME}` anywhere a header, arg, or body is needed. Replaced at call time. Never appears in logs.

```
http_fetch {
  url: "https://api.github.com/user",
  headers: { "Authorization": "Bearer ${env:GH_TOKEN}" }
}
```

The agent can call `list_env_keys` to see which auth vars are available (names only — never values).

---

## Safety · pause-before-irreversible

The agent calls **`ask_user`** before any Save / Submit / Send / Delete / Confirm / payment — regardless of tier. This applies to CLI just as much as to browser:

```
  ◊ agent asks → about to run: gh repo delete sjgant80-hub/test-repo
                 confirm? [yes/no]
  >
```

Type `yes`/`go` to proceed. Anything else aborts the step.

Inherited Anthropic safety rules: cannot modify system files, cannot accept terms, cannot execute financial trades, cannot share confidential docs — regardless of brief.

---

## Optional: Tier 2 MCP proxy

Create `./mcps.json` next to `agent.mjs`:

```json
{
  "onlybrains": {
    "command": "node",
    "args": ["/path/to/onlybrains-mcp-server.mjs"]
  },
  "fallcore": {
    "command": "node",
    "args": ["/path/to/fallcore-mcp.mjs"]
  }
}
```

Each server's tools become available as `mcp__onlybrains__<tool>`. The agent treats them as Tier 2 — between HTTP and browser.

---

## CLI allowlist

Default allowed: `gh`, `git`, `stripe`, `gcloud`, `aws`, `az`, `npm`, `npx`, `node`, `deno`, `bun`, `yarn`, `pnpm`, `curl`, `jq`, `wget`, `python`, `python3`, `py`, `claude`, `code`, `echo`, `cat`, `ls`, `dir`, `tar`, `zip`, `unzip`.

Extend per session:

```bash
$env:SIDIDY_CLI_ALLOW = "docker,kubectl,terraform"
node agent.mjs ./brief.txt
```

Commands outside the allowlist are rejected with the full list returned so the agent can pivot to T1 (`http_fetch`).

---

## Briefs

A brief is just a `.txt` file telling the agent what to do. Three included:

| brief | tier exercised |
|---|---|
| `examples/GITHUB-AUDIT-BRIEF.txt` | **T0 only** · estate health report via `gh` |
| `examples/LINKEDIN-HEADLINE-EXAMPLE.txt` | **T3** · LinkedIn profile (no API exists) |
| `examples/UPWORK-BRIEF.txt` | **T3** · Upwork profile repositioning |

Briefs can mix tiers freely. State the tier per step or let the agent route automatically.

---

## Architecture

```
brief.txt
   │
   ▼
agent.mjs
   ├── @anthropic-ai/claude-agent-sdk · query()
   │      ├── auth: ~/.claude/.credentials.json (subscription)
   │      │       OR ANTHROPIC_API_KEY (fallback)
   │      └── model: claude-sonnet-4-5
   │
   ├── 4 in-process MCP servers + meta
   │      ├── cli       · cli_run, cli_which       (T0)
   │      ├── http      · http_fetch, graphql_query (T1)
   │      ├── (mcps.json proxies)                  (T2 · optional)
   │      ├── browser   · browser_* × 9            (T3 · lazy)
   │      └── meta      · ask_user, list_env_keys  (gate)
   │
   └── single process · no Docker · no daemons
```

All tools are in-process via `createSdkMcpServer`. Playwright is lazy-loaded — `import('playwright')` only runs on first browser tool invocation. The agent's startup is sub-second when no browser tier is used.

---

## Why sovereign

Every "AI agent that drives your computer" SaaS sees your screen on their servers, logs every brief, bills per action, holds your session in their cloud.

si-didy-agent v2:
- Single Node script · ~600 lines · readable in 15 minutes
- Runs locally · your screen never leaves your machine
- Brief lives on your disk as plain text
- Claude subscription you already pay · no extra billing
- Browser session in `./si-didy-profile` · gitignore it, encrypt it, delete it
- CLI allowlist enforces what the agent can spawn
- MIT licensed · fork it, modify it, white-label it

---

## License

MIT · ◊·κ=1 · sovereign · subscription-powered · no SaaS · no middleman
