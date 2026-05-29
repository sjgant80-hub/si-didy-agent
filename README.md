# ◊ si-didy-agent

**Sovereign computer-use agent · Claude Agent SDK + Playwright · ◊·κ=1**

You write a brief in plain English. Claude reads it. A real Chromium browser does it — clicks, types, uploads files, pauses before every Save to ask. **No API charges.** Your Claude subscription pays.

Prime **379** · MIT · part of the [ai-nativesolutions.com](https://www.ai-nativesolutions.com) estate.

Landing page: [sjgant80-hub.github.io/si-didy-agent](https://sjgant80-hub.github.io/si-didy-agent/)

---

## What this is

`si-didy.html` is the **persona engine** — profiles people by Jung archetype + Freud shadow. Runs in any browser. No backend. It thinks.

`si-didy-agent` is the **hands**. A single Node script that:

- Reads a brief (any `.txt` file you point it at)
- Drives a Playwright-controlled Chromium browser
- Routes through Claude via the **Agent SDK** — uses your Claude subscription credentials, not per-token API billing
- Pauses before any Save / Submit / Send / Delete — you confirm in the terminal
- Persists your browser session so you log in once, never again

Both speak `BroadcastChannel('fall-signal')` — same mesh as every tool in the estate.

---

## Setup (3 minutes)

### 1. Install Claude Code (skip if you have it)

```bash
npm i -g @anthropic-ai/claude-code
```

### 2. Authenticate against your subscription

```bash
claude
# OAuth flow opens in your browser · sign in · /quit when done
# credentials write to ~/.claude/.credentials.json
```

### 3. Clone and run

```bash
git clone https://github.com/sjgant80-hub/si-didy-agent
cd si-didy-agent
npm install
npx playwright install chromium

node agent.mjs ./examples/UPWORK-EXAMPLE-BRIEF.txt
```

First run output:

```
◊·κ=1 · si-didy-agent
◊ auth: Claude Code subscription ✓ (no per-token API charges)
◊ launching Chromium · persistent profile: ./si-didy-profile
◊ Chromium open. If you see a login page, log in now.
  [press ENTER when ready to hand off]
```

If you see `auth: ANTHROPIC_API_KEY` instead — the OAuth step didn't take. Run `claude` again, complete the flow, retry.

---

## Writing briefs

A brief is just a `.txt` file. The shape:

```
OBJECTIVE: Update my LinkedIn profile headline.

NEW HEADLINE (copy verbatim):
  Sovereign AI Tools You Own Forever · 60+ Live Builds · No SaaS Rent

STEPS:
  1. Navigate to linkedin.com/in/your-handle
  2. Click the edit-profile pencil
  3. Replace the headline field with the NEW HEADLINE above
  4. Before clicking Save: ask user to confirm
  5. After Save, screenshot to verify

RULES:
  - If LinkedIn shows a login screen, pause and ask
  - Don't touch any other field
  - If headline already matches, skip and tell me
```

See [`examples/`](./examples) for working briefs.

---

## Safety

Every irreversible action (Save / Submit / Send / Delete / Confirm) — the agent stops and asks in the terminal:

```
  ◊ agent asks → ready to save the new headline? [yes/no]
  >
```

Type `yes` to proceed. Anything else aborts that step. The agent never unilaterally commits changes.

Hard boundaries inherited from Anthropic safety rules:
- Cannot modify system files
- Cannot accept terms or sharing permissions
- Cannot execute financial trades
- Cannot share confidential documents

---

## MCP tools the agent has

| tool | what it does |
|---|---|
| `screenshot` | see the current page state |
| `click` | x,y · left/right/middle · 1/2/3 clicks |
| `type` | type text at the current focus |
| `key` | press a key or combo (Enter, Control+a, Tab) |
| `scroll` | up/down/left/right by N pixels |
| `wait` | N seconds for the page to settle |
| `navigate` | go to a URL |
| `upload_file` | set a path on a file input |
| `ask_user` | pause · yes/no in terminal |
| `current_url` | read the current URL |

All exposed via an **in-process MCP server** registered with the Agent SDK. No external MCP daemons. No Docker.

---

## Use cases that pay back

| brief | time saved |
|---|---|
| Upwork profile + portfolio repositioning | ~60 min |
| LinkedIn post via fallpost → live | ~10 min |
| Stripe payout / tax form fill | ~25 min |
| GitHub new-repo setup × 10 | ~40 min |
| Mass-reply to Upwork messages | ~30 min |
| Update fall-registry entries via web UI | ~20 min |

---

## Why sovereign

Every "AI agent that drives your computer" SaaS sees your screen on their servers, logs every brief, bills per action, holds your session in their cloud.

si-didy-agent:
- One Node script you can read in 10 minutes — ~280 lines
- Chromium runs locally — your screen never leaves your machine
- Brief lives on your disk as plain text
- Claude subscription you already pay — no extra billing
- Session lives in `./si-didy-profile` — gitignore it, encrypt it, delete it
- MIT licensed — fork it, modify it, white-label it

---

## For developers · architecture

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
   ├── createSdkMcpServer({ name: 'browser', tools: [...] })
   │      ├── screenshot / click / type / key / scroll / wait
   │      ├── navigate / upload_file / current_url
   │      └── ask_user  ← the pause-before-save gate
   │
   └── playwright.chromium.launchPersistentContext('./si-didy-profile')
          └── visible Chromium · you can grab the mouse
```

The agent loop is managed by the Agent SDK. We provide the tools; the SDK handles message-loop iteration, tool-result formatting, error retry. The pause-before-save is implemented as a tool the agent is instructed to call, not a permission prompt — this keeps the SDK in `bypassPermissions` mode for performance.

---

## License

MIT · ◊·κ=1 · sovereign · subscription-powered · no SaaS · no middleman
