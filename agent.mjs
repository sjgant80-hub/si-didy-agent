// ═══════════════════════════════════════════════════════════════════
//  si-didy-agent · v2.0 · 4-tier sovereign agent · ◊·κ=1
//  Claude Agent SDK · CLI + HTTP + MCP + Browser · subscription auth
// ═══════════════════════════════════════════════════════════════════
//
//  TIER MAP (cheapest first · pick highest-applicable for each step)
//   T0 · cli_run         · gh, stripe, gcloud, npm, git, curl, jq, claude…
//   T1 · http_fetch      · direct REST · env-var auth interpolation
//        graphql_query   · GraphQL convenience wrapper
//   T2 · mcp_call        · proxy to any MCP defined in ./mcps.json (optional)
//   T3 · browser_*       · Playwright fallback · only when no API/CLI/MCP
//
//  ALWAYS · ask_user before any irreversible action.
//  Playwright is lazy-loaded · zero startup cost if no browser tier needed.
//
//  SETUP
//    npm i -g @anthropic-ai/claude-code   # subscription auth (one time)
//    claude                                # OAuth · then /quit
//    npm install                           # SDK + zod (+ Playwright if used)
//    npx playwright install chromium       # only if you'll use T3
//    node agent.mjs ./brief.txt
//
//  AUTH
//    ✓ Auto-detects ~/.claude/.credentials.json (subscription · no API charges)
//    ✓ Falls back to ANTHROPIC_API_KEY (per-token billing)
//
// ═══════════════════════════════════════════════════════════════════

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

// ───────────── config ─────────────
const PACK_PATH    = process.argv[2] || './brief.txt';
const USER_DATA    = './si-didy-profile';
const VIEWPORT     = { width: 1280, height: 800 };
const MAX_TURNS    = 200;
const MCPS_CONFIG  = './mcps.json';

// CLI allowlist (extend via env: SIDIDY_CLI_ALLOW="docker,kubectl,...")
const CLI_DEFAULT_ALLOW = [
  'gh', 'git', 'stripe', 'gcloud', 'aws', 'az',
  'npm', 'npx', 'node', 'deno', 'bun', 'yarn', 'pnpm',
  'curl', 'jq', 'wget', 'python', 'python3', 'py',
  'claude', 'code', 'echo', 'cat', 'ls', 'dir',
  'tar', 'zip', 'unzip',
];
const CLI_EXTRA = (process.env.SIDIDY_CLI_ALLOW || '').split(',').map(s => s.trim()).filter(Boolean);
const CLI_ALLOW = new Set([...CLI_DEFAULT_ALLOW, ...CLI_EXTRA]);

// ───────────── auth detection ─────────────
const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
const hasSubAuth = fs.existsSync(credsPath);
const hasApiKey  = !!process.env.ANTHROPIC_API_KEY;

console.log('◊·κ=1 · si-didy-agent v2.0 · 4-tier sovereign\n');
if (hasSubAuth)      console.log('◊ auth: Claude Code subscription ✓ (no per-token API charges)');
else if (hasApiKey)  console.log('◊ auth: ANTHROPIC_API_KEY (per-token billing)');
else {
  console.error('✗ no auth · run  claude  to OAuth · or set ANTHROPIC_API_KEY');
  process.exit(1);
}

if (!fs.existsSync(PACK_PATH)) { console.error('✗ brief not found:', PACK_PATH); process.exit(1); }
const BRIEF = fs.readFileSync(PACK_PATH, 'utf8');

// ───────────── readline ─────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));

// ───────────── env interpolation ─────────────
// Replaces ${env:VAR_NAME} with process.env.VAR_NAME · never logs the value
function interpolateEnv(input) {
  if (typeof input === 'string') {
    return input.replace(/\$\{env:([A-Z_][A-Z0-9_]*)\}/g, (_, k) => process.env[k] ?? '');
  }
  if (Array.isArray(input)) return input.map(interpolateEnv);
  if (input && typeof input === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(input)) out[k] = interpolateEnv(v);
    return out;
  }
  return input;
}

// ═══════════════════════════════════════════════════════════════════
//  TIER 0 · CLI
// ═══════════════════════════════════════════════════════════════════
function runCli(cmd, args, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: false, windowsHide: true });
    let stdout = '', stderr = '';
    const to = setTimeout(() => { proc.kill('SIGTERM'); }, timeoutMs);
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => { clearTimeout(to); resolve({ code, stdout, stderr }); });
    proc.on('error', err => { clearTimeout(to); resolve({ code: -1, stdout, stderr: err.message }); });
  });
}

const tierZeroMcp = createSdkMcpServer({
  name: 'cli',
  version: '2.0.0',
  tools: [
    tool('cli_run', 'TIER 0 (cheapest) · Run an allowlisted CLI command and return its output. Use this FIRST whenever the task can be done via a CLI tool (gh for GitHub, stripe for Stripe, gcloud for GCP, npm/npx for Node, curl for raw HTTP, etc.). Args are passed directly · no shell interpretation. List of allowed commands: ' + [...CLI_ALLOW].join(', '),
      { cmd: z.string().describe('Binary name · must be in allowlist'),
        args: z.array(z.string()).default([]).describe('Argument array · no shell expansion'),
        timeoutSec: z.number().min(1).max(300).default(60) },
      async ({ cmd, args, timeoutSec }) => {
        if (!CLI_ALLOW.has(cmd)) {
          return { content: [{ type: 'text', text: `✗ '${cmd}' not in CLI allowlist. Allowed: ${[...CLI_ALLOW].join(', ')}. To extend, set $env:SIDIDY_CLI_ALLOW=...` }] };
        }
        const interpolated = args.map(interpolateEnv);
        console.log(`  T0 · ${cmd} ${interpolated.slice(0,4).join(' ')}${interpolated.length>4?' …':''}`);
        const r = await runCli(cmd, interpolated, timeoutSec * 1000);
        const out = `exit ${r.code}\n--- stdout ---\n${r.stdout.slice(0, 8000)}\n--- stderr ---\n${r.stderr.slice(0, 2000)}`;
        return { content: [{ type: 'text', text: out }] };
      }
    ),
    tool('cli_which', 'TIER 0 · Check whether a CLI binary is installed and on PATH. Use before cli_run if you\'re unsure the command exists.',
      { cmd: z.string() },
      async ({ cmd }) => {
        const probe = process.platform === 'win32' ? 'where' : 'which';
        const r = await runCli(probe, [cmd], 5000);
        return { content: [{ type: 'text', text: r.code === 0 ? r.stdout.trim() : `not found: ${cmd}` }] };
      }
    ),
  ],
});

// ═══════════════════════════════════════════════════════════════════
//  TIER 1 · HTTP / GraphQL
// ═══════════════════════════════════════════════════════════════════
const tierOneMcp = createSdkMcpServer({
  name: 'http',
  version: '2.0.0',
  tools: [
    tool('http_fetch', 'TIER 1 · Make a direct HTTP request to any REST API. Use after T0 (CLI) if no CLI exists for the target. Headers and body support env interpolation: write ${env:VAR_NAME} and it\'s replaced from process.env at call time. Auth tokens stay in env, never appear in logs.',
      { url: z.string().describe('Full URL · https://...'),
        method: z.enum(['GET','POST','PUT','PATCH','DELETE']).default('GET'),
        headers: z.record(z.string()).optional().describe('e.g. { Authorization: "Bearer ${env:STRIPE_API_KEY}" }'),
        body: z.string().optional().describe('Request body · usually JSON string'),
        timeoutSec: z.number().min(1).max(120).default(30) },
      async ({ url, method, headers, body, timeoutSec }) => {
        const safeHeaders = interpolateEnv(headers || {});
        const safeBody = body ? interpolateEnv(body) : undefined;
        console.log(`  T1 · ${method} ${url.slice(0,80)}`);
        try {
          const r = await fetch(interpolateEnv(url), {
            method,
            headers: safeHeaders,
            body: safeBody,
            signal: AbortSignal.timeout(timeoutSec * 1000),
          });
          const text = await r.text();
          return { content: [{ type: 'text', text: `status ${r.status}\n${text.slice(0, 12000)}` }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'fetch error: ' + e.message }] };
        }
      }
    ),
    tool('graphql_query', 'TIER 1 · Run a GraphQL query/mutation. Convenience over http_fetch for GraphQL endpoints (GitHub v4, Shopify, Linear, etc.). Auth via headers · env interpolation supported.',
      { url: z.string(),
        query: z.string(),
        variables: z.record(z.any()).optional(),
        headers: z.record(z.string()).optional() },
      async ({ url, query: q, variables, headers }) => {
        const safeHeaders = interpolateEnv({ 'Content-Type': 'application/json', ...(headers || {}) });
        console.log(`  T1 · GraphQL ${url.slice(0,60)}`);
        try {
          const r = await fetch(interpolateEnv(url), {
            method: 'POST',
            headers: safeHeaders,
            body: JSON.stringify({ query: q, variables: variables || {} }),
            signal: AbortSignal.timeout(60_000),
          });
          const text = await r.text();
          return { content: [{ type: 'text', text: `status ${r.status}\n${text.slice(0, 12000)}` }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'graphql error: ' + e.message }] };
        }
      }
    ),
  ],
});

// ═══════════════════════════════════════════════════════════════════
//  TIER 2 · MCP proxy (optional · enable by creating ./mcps.json)
// ═══════════════════════════════════════════════════════════════════
//  mcps.json schema:
//    {
//      "onlybrains": { "command": "node", "args": ["path/to/onlybrains.mjs"] },
//      "fallcore":   { "command": "node", "args": ["path/to/fallcore.mjs"] }
//    }
//  The agent SDK spawns these as stdio MCP servers · their tools become
//  available as  mcp__<name>__<tool>  · added to allowedTools automatically.

let configuredMcps = {};
if (fs.existsSync(MCPS_CONFIG)) {
  try {
    configuredMcps = JSON.parse(fs.readFileSync(MCPS_CONFIG, 'utf8'));
    console.log(`◊ T2 · MCP proxy: ${Object.keys(configuredMcps).length} server(s) from ./mcps.json`);
  } catch (e) {
    console.log('◊ T2 · mcps.json present but unparseable · skipping');
    configuredMcps = {};
  }
}

// ═══════════════════════════════════════════════════════════════════
//  TIER 3 · Playwright (lazy-loaded · only on first browser_* call)
// ═══════════════════════════════════════════════════════════════════
let _playwright = null, _ctx = null, _page = null;
async function ensureBrowser() {
  if (_page) return _page;
  console.log('◊ T3 · loading Playwright (lazy) · this may take a sec…');
  const { chromium } = await import('playwright');
  _playwright = chromium;
  _ctx = await chromium.launchPersistentContext(USER_DATA, {
    headless: false,
    viewport: VIEWPORT,
    args: ['--disable-blink-features=AutomationControlled']
  });
  _page = _ctx.pages()[0] || await _ctx.newPage();
  await _page.setViewportSize(VIEWPORT);
  console.log('◊ T3 · Chromium open · persistent profile: ' + USER_DATA);
  console.log('◊    if a login screen shows, log in once · your session is saved.');
  await ask('   [ENTER when ready to hand off browser to agent] ');
  return _page;
}

const tierThreeMcp = createSdkMcpServer({
  name: 'browser',
  version: '2.0.0',
  tools: [
    tool('browser_screenshot', 'TIER 3 (most expensive) · Screenshot the current Chromium tab. Only use the browser tier when CLI/HTTP/MCP all unavailable. Log WHY you\'re reaching for a browser in your reasoning.',
      {},
      async () => {
        const page = await ensureBrowser();
        const buf = await page.screenshot({ type: 'png' });
        return { content: [{ type: 'image', data: buf.toString('base64'), mimeType: 'image/png' }] };
      }
    ),
    tool('browser_navigate', 'TIER 3 · Navigate browser to URL.',
      { url: z.string() },
      async ({ url }) => {
        const page = await ensureBrowser();
        await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(()=>{});
        return { content: [{ type: 'text', text: 'navigated · ' + page.url() }] };
      }
    ),
    tool('browser_click', 'TIER 3 · Click pixel coordinates.',
      { x: z.number(), y: z.number(),
        button: z.enum(['left','right','middle']).default('left'),
        clickCount: z.number().int().min(1).max(3).default(1) },
      async ({ x, y, button, clickCount }) => {
        const page = await ensureBrowser();
        await page.mouse.click(x, y, { button, clickCount });
        await page.waitForTimeout(400);
        const buf = await page.screenshot({ type: 'png' });
        return { content: [{ type: 'image', data: buf.toString('base64'), mimeType: 'image/png' }] };
      }
    ),
    tool('browser_type', 'TIER 3 · Type text at current focus.',
      { text: z.string() },
      async ({ text }) => {
        const page = await ensureBrowser();
        await page.keyboard.type(text, { delay: 15 });
        return { content: [{ type: 'text', text: `typed ${text.length} chars` }] };
      }
    ),
    tool('browser_key', 'TIER 3 · Press a key or combo (Enter, Tab, Control+a, etc.).',
      { keys: z.string() },
      async ({ keys }) => {
        const page = await ensureBrowser();
        await page.keyboard.press(keys);
        await page.waitForTimeout(200);
        return { content: [{ type: 'text', text: 'pressed ' + keys }] };
      }
    ),
    tool('browser_scroll', 'TIER 3 · Scroll the page.',
      { x: z.number().default(640), y: z.number().default(400),
        direction: z.enum(['up','down','left','right']).default('down'),
        pixels: z.number().default(400) },
      async ({ x, y, direction, pixels }) => {
        const page = await ensureBrowser();
        await page.mouse.move(x, y);
        const dx = direction === 'left' ? -pixels : direction === 'right' ? pixels : 0;
        const dy = direction === 'up' ? -pixels : direction === 'down' ? pixels : 0;
        await page.mouse.wheel(dx, dy);
        await page.waitForTimeout(300);
        return { content: [{ type: 'text', text: `scrolled ${direction} ${pixels}px` }] };
      }
    ),
    tool('browser_wait', 'TIER 3 · Wait N seconds.',
      { seconds: z.number().min(0).max(10) },
      async ({ seconds }) => {
        const page = await ensureBrowser();
        await page.waitForTimeout(seconds * 1000);
        return { content: [{ type: 'text', text: 'waited ' + seconds + 's' }] };
      }
    ),
    tool('browser_upload', 'TIER 3 · Set a file path on a file input via CSS selector.',
      { selector: z.string(), filePath: z.string() },
      async ({ selector, filePath }) => {
        const page = await ensureBrowser();
        const abs = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        await page.setInputFiles(selector, abs);
        return { content: [{ type: 'text', text: `uploaded ${abs}` }] };
      }
    ),
    tool('browser_url', 'TIER 3 · Get current URL.',
      {},
      async () => {
        const page = await ensureBrowser();
        return { content: [{ type: 'text', text: page.url() }] };
      }
    ),
  ],
});

// ═══════════════════════════════════════════════════════════════════
//  META · ask_user (the irreversible-action gate)
// ═══════════════════════════════════════════════════════════════════
const metaMcp = createSdkMcpServer({
  name: 'meta',
  version: '2.0.0',
  tools: [
    tool('ask_user', 'MUST be called before any irreversible action: Save, Submit, Send, Delete, Confirm, payment, message send, etc. Pauses and asks the user in the terminal. Returns their reply.',
      { question: z.string() },
      async ({ question }) => {
        const ans = await ask(`\n  ◊ agent asks → ${question}\n  > `);
        return { content: [{ type: 'text', text: 'user replied: ' + (ans || '(empty)') }] };
      }
    ),
    tool('list_env_keys', 'List which environment variables are available for env interpolation (returns names only · never values).',
      {},
      async () => {
        const keys = Object.keys(process.env).filter(k => /TOKEN|KEY|SECRET|API|AUTH/i.test(k));
        return { content: [{ type: 'text', text: 'available auth env vars:\n' + keys.join('\n') }] };
      }
    ),
  ],
});

// ═══════════════════════════════════════════════════════════════════
//  system prompt · the routing doctrine
// ═══════════════════════════════════════════════════════════════════
const PROMPT = `You are si-didy-agent v2 — sovereign 4-tier agent. ◊·κ=1.

YOU HAVE FOUR EXECUTION TIERS. Always pick the CHEAPEST that completes the step:

  T0 · cli_run, cli_which        ← gh, stripe, gcloud, npm, git, curl, etc.
  T1 · http_fetch, graphql_query ← any REST/GraphQL API directly
  T2 · mcp__<server>__<tool>     ← optional · only present if ./mcps.json registered
  T3 · browser_*                 ← Playwright · LAST RESORT only

ROUTING RULES
- "Create a GitHub repo"           → T0  (gh repo create)
- "List a user's repos"            → T0  (gh api users/X/repos)
- "Post to Stripe"                 → T0  (stripe charge create) or T1 (POST api.stripe.com)
- "Query Linear/Shopify GraphQL"   → T1  (graphql_query)
- "Talk to OnlyBrains/fallcore"    → T2  (if registered) else T1
- "Edit a web profile with no API" → T3  (e.g. LinkedIn headline, Upwork profile)
- ALWAYS state your tier choice and reasoning when picking T3.

AUTH
- Use env interpolation: write \${env:GITHUB_TOKEN} in headers/args · it's replaced at call time.
- list_env_keys tells you which auth vars are available · NEVER print the values.

SAFETY (non-negotiable)
- BEFORE any irreversible action (Save, Submit, Send, Delete, Confirm, payment, message-send):
    call ask_user with a clear yes/no question.
    Do not perform the action until the user replies "yes" or "go".
- This applies across ALL tiers · CLI included. A "gh repo delete" needs ask_user just like a browser Save.

EFFICIENCY
- Plan in 3-5 step chunks. Pick the right tier per step. State your reasoning.
- When done, output a final summary text and stop calling tools.

THE BRIEF
═══════════════════════════════════════════════════════════════════
${BRIEF}
═══════════════════════════════════════════════════════════════════

Begin. State your plan first (tiers per step), then execute.`;

// ═══════════════════════════════════════════════════════════════════
//  RUN
// ═══════════════════════════════════════════════════════════════════
const mcpServers = {
  cli: tierZeroMcp,
  http: tierOneMcp,
  browser: tierThreeMcp,
  meta: metaMcp,
  ...configuredMcps,
};

const allowedTools = [
  'mcp__cli__cli_run', 'mcp__cli__cli_which',
  'mcp__http__http_fetch', 'mcp__http__graphql_query',
  'mcp__browser__browser_screenshot', 'mcp__browser__browser_click',
  'mcp__browser__browser_type', 'mcp__browser__browser_key',
  'mcp__browser__browser_scroll', 'mcp__browser__browser_wait',
  'mcp__browser__browser_navigate', 'mcp__browser__browser_upload',
  'mcp__browser__browser_url',
  'mcp__meta__ask_user', 'mcp__meta__list_env_keys',
];

console.log('\n◊ tiers loaded:');
console.log('   T0 · CLI       · ' + CLI_ALLOW.size + ' commands allowed');
console.log('   T1 · HTTP      · REST + GraphQL ready');
console.log('   T2 · MCP proxy · ' + (Object.keys(configuredMcps).length ? Object.keys(configuredMcps).join(', ') : '(none registered · create ./mcps.json to add)'));
console.log('   T3 · Browser   · Playwright (lazy · loaded on first browser_* call)');
console.log('\n◊ handing brief to agent…\n');

let lastText = '';
const result = query({
  prompt: PROMPT,
  options: {
    model: 'claude-sonnet-4-5-20250929',
    mcpServers,
    allowedTools,
    permissionMode: 'bypassPermissions', // agent self-gates via ask_user
    maxTurns: MAX_TURNS
  }
});

for await (const msg of result) {
  if (msg.type === 'assistant') {
    const text = (msg.message?.content || [])
      .filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (text && text !== lastText) {
      console.log('\n◊ claude:\n' + text + '\n');
      lastText = text;
    }
    for (const t of (msg.message?.content || []).filter(b => b.type === 'tool_use')) {
      const tier = t.name.includes('cli') ? 'T0' : t.name.includes('http')||t.name.includes('graphql') ? 'T1' :
                   t.name.includes('browser') ? 'T3' : t.name.includes('meta') ? '··' : 'T2';
      const sum = JSON.stringify(t.input).slice(0, 80);
      console.log(`  ${tier} · ${t.name.replace(/^mcp__[^_]+__/,'')} ${sum}`);
    }
  } else if (msg.type === 'result') {
    console.log('\n◊·κ=1 · agent finished');
    console.log('   turns: ' + (msg.num_turns ?? '?'));
    if (msg.total_cost_usd != null) console.log('   cost:  $' + msg.total_cost_usd.toFixed(4));
    if (msg.is_error) console.log('   note:  ended with error');
  }
}

if (_ctx) console.log('\n◊ browser left open · close manually when ready');
console.log('◊ done\n');
rl.close();
