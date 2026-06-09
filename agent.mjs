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
import { spawn, spawnSync } from 'node:child_process';

// ───────────── config ─────────────
const ARGS         = process.argv.slice(2);
const SERVER_MODE  = ARGS.includes('--server');
// CLI passthrough · `node agent.mjs --tool <name> [--key value ...]`
const TOOL_IDX     = ARGS.indexOf('--tool');
const TOOL_MODE    = TOOL_IDX !== -1 && ARGS[TOOL_IDX + 1] ? ARGS[TOOL_IDX + 1] : null;
const CHAT_MODE    = !SERVER_MODE && !TOOL_MODE && (ARGS.includes('--chat') || ARGS.length === 0);
const PACK_PATH    = (CHAT_MODE || SERVER_MODE || TOOL_MODE) ? null : ARGS.find(a => !a.startsWith('--'));
const SERVER_PORT  = parseInt(process.env.SIDIDY_PORT || '1618', 10); // φ port · phi is home
const USER_DATA    = './si-didy-profile';
const VIEWPORT     = { width: 1280, height: 800 };

// ◊ pre-launch self-heal · reset exit_type so Chromium doesn't show the
// "restore pages" yellow bar (which intercepts focus + blocks DOM ops)
// after a prior force-kill. Call before every launchPersistentContext.
function resetProfileExitType() {
  try {
    const prefPath = path.join(USER_DATA, 'Default', 'Preferences');
    if (!fs.existsSync(prefPath)) return;
    let pref = fs.readFileSync(prefPath, 'utf8');
    pref = pref.replace(/"exit_type":"Crashed"/g, '"exit_type":"Normal"')
               .replace(/"exited_cleanly":false/g, '"exited_cleanly":true');
    fs.writeFileSync(prefPath, pref);
  } catch (_) { /* swallow · best-effort */ }
}
const MAX_TURNS    = 200;
const MCPS_CONFIG  = './mcps.json';
const MEMORY_DIR   = './memory';
const MISSIONS_DIR = './missions';
const QUEUES_DIR   = './queues';
const PACKS_DIR    = './packs';

// scaffold dirs · idempotent
for (const d of [MEMORY_DIR, MISSIONS_DIR, QUEUES_DIR, PACKS_DIR,
                 path.join(QUEUES_DIR, 'up-jobs'),
                 path.join(QUEUES_DIR, 'up-proposal'),
                 path.join(QUEUES_DIR, 'up-reply')]) {
  fs.mkdirSync(d, { recursive: true });
}

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
// Claude Code stores credentials in several places depending on OS/version:
//   ~/.claude/.credentials.json   (older path · some setups)
//   ~/.claude/auth.json           (newer path)
//   Windows Credential Manager    (current Win install)
//   Mac Keychain                  (current Mac install)
// The SDK will pull from whichever the active `claude` CLI uses. So the
// real check is: does the `claude` CLI exist on PATH (any signal of install)?
const credsPaths = [
  path.join(os.homedir(), '.claude', '.credentials.json'),
  path.join(os.homedir(), '.claude', 'auth.json'),
];
const hasCredsFile = credsPaths.some(p => fs.existsSync(p));
const hasClaudeDir = fs.existsSync(path.join(os.homedir(), '.claude'));
const hasApiKey    = !!process.env.ANTHROPIC_API_KEY;

// probe for `claude` CLI on PATH
let hasClaudeCli = false;
try {
  const probeCmd = process.platform === 'win32' ? 'where' : 'which';
  const probe = await import('node:child_process').then(m => m.spawnSync(probeCmd, ['claude'], { encoding: 'utf8' }));
  hasClaudeCli = probe.status === 0 && probe.stdout.trim().length > 0;
} catch {}

console.log('◊·κ=1 · si-didy-agent v2.0 · 4-tier sovereign\n');
if (hasApiKey) {
  console.log('◊ auth: ANTHROPIC_API_KEY (per-token billing)');
} else if (hasClaudeCli || hasCredsFile || hasClaudeDir) {
  console.log('◊ auth: Claude Code subscription detected (no per-token API charges)');
  if (!hasCredsFile) console.log('   (credentials in OS keystore · SDK will pull via `claude` CLI)');
} else {
  console.error('✗ no auth detected');
  console.error('  fix: open PowerShell · run  claude  and complete OAuth · then retry');
  console.error('  or:  $env:ANTHROPIC_API_KEY = "sk-ant-..."  then retry');
  process.exit(1);
}

let BRIEF = '';
if (!CHAT_MODE && !SERVER_MODE && !TOOL_MODE) {
  if (!fs.existsSync(PACK_PATH)) { console.error('✗ brief not found:', PACK_PATH); process.exit(1); }
  BRIEF = fs.readFileSync(PACK_PATH, 'utf8');
}

// ───────────── readline ─────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const _askTTY = q => new Promise(r => rl.question(q, r));
// ask() is TTY-safe: auto-confirm via env, file-drop in non-TTY (brief/tool modes), readline in TTY
let ask = async (q) => {
  if (process.env.SIDIDY_AUTO_CONFIRM === '1') {
    console.log(q + '[auto-confirm via SIDIDY_AUTO_CONFIRM=1] → yes');
    return 'yes';
  }
  if (!process.stdin.isTTY) {
    const respFp = './queues/ask-response.txt';
    const readOnce = () => {
      try {
        if (fs.existsSync(respFp)) {
          const v = fs.readFileSync(respFp, 'utf8').trim();
          try { fs.unlinkSync(respFp); } catch (_) {}
          return v;
        }
      } catch (_) {}
      return null;
    };
    const first = readOnce();
    if (first !== null) { console.log(q + '[file-drop] → ' + first); return first; }
    process.stdout.write(q + '[waiting for ./queues/ask-response.txt to land · 5min timeout]\n');
    const start = Date.now();
    while (Date.now() - start < 5 * 60 * 1000) {
      await new Promise(r => setTimeout(r, 1000));
      const v = readOnce();
      if (v !== null) { console.log('  → file-drop received: ' + v); return v; }
    }
    return '';
  }
  return _askTTY(q);
};

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
  resetProfileExitType(); _ctx = await chromium.launchPersistentContext(USER_DATA, {
    headless: false,
    viewport: VIEWPORT,
    args: ['--disable-blink-features=AutomationControlled', '--disable-session-crashed-bubble', '--restore-last-session=false', '--no-first-run', '--no-default-browser-check']
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
//  MEMORY · persistent state across chat turns
// ═══════════════════════════════════════════════════════════════════
//  Scopes are free-form file slugs (e.g. "fb-posts", "li-dms", "upwork-seen").
//  Each scope is a JSONL file at ./memory/<scope>.jsonl
//  Use these so si-didy never re-posts the same content / re-DMs the
//  same person / re-applies to the same Upwork job across runs.
const memoryMcp = createSdkMcpServer({
  name: 'memory',
  version: '2.0.0',
  tools: [
    tool('memory_recall', 'Recall the last N entries from a memory scope (e.g. "fb-posts", "li-dms", "upwork-seen"). Use BEFORE you post/DM/apply to check whether the same target was already actioned.',
      { scope: z.string().describe('Free-form slug. Lower-kebab. e.g. "fb-posts" / "li-dms"'),
        limit: z.number().min(1).max(200).default(20) },
      async ({ scope, limit }) => {
        const fp = path.join(MEMORY_DIR, scope.replace(/[^a-z0-9_-]/gi, '') + '.jsonl');
        if (!fs.existsSync(fp)) return { content: [{ type: 'text', text: '(empty)' }] };
        const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean);
        const tail = lines.slice(-limit).join('\n');
        return { content: [{ type: 'text', text: tail || '(empty)' }] };
      }
    ),
    tool('memory_note', 'Append a JSON record to a memory scope. Always note an action right after taking it: { ts, target, action, result }. Used to prevent duplicates and feed the daily ops log.',
      { scope: z.string(),
        payload: z.record(z.any()).describe('JSON object · whatever shape fits the scope') },
      async ({ scope, payload }) => {
        const fp = path.join(MEMORY_DIR, scope.replace(/[^a-z0-9_-]/gi, '') + '.jsonl');
        const line = JSON.stringify({ ts: new Date().toISOString(), ...payload }) + '\n';
        fs.appendFileSync(fp, line);
        return { content: [{ type: 'text', text: 'noted to ' + fp }] };
      }
    ),
    tool('mission_log', 'Log the start of a mission (a user directive). Returns mission_id. Use mission_finish later.',
      { directive: z.string(), platforms: z.array(z.string()).default([]) },
      async ({ directive, platforms }) => {
        const id = 'M' + Date.now().toString(36);
        const today = new Date().toISOString().slice(0,10);
        const fp = path.join(MISSIONS_DIR, today + '.jsonl');
        fs.appendFileSync(fp, JSON.stringify({ id, ts: new Date().toISOString(), directive, platforms, status: 'started' }) + '\n');
        return { content: [{ type: 'text', text: 'mission ' + id + ' logged' }] };
      }
    ),
    tool('mission_finish', 'Mark a mission complete with a one-line outcome.',
      { id: z.string(), outcome: z.string() },
      async ({ id, outcome }) => {
        const today = new Date().toISOString().slice(0,10);
        const fp = path.join(MISSIONS_DIR, today + '.jsonl');
        fs.appendFileSync(fp, JSON.stringify({ id, ts: new Date().toISOString(), status: 'finished', outcome }) + '\n');
        return { content: [{ type: 'text', text: 'mission ' + id + ' closed' }] };
      }
    ),
    tool('pack_load', 'Load a verbatim platform pack from ./packs/ (e.g. "FACEBOOK-PACK.txt", "LINKEDIN-PACK.txt"). Treat the pack content as immutable copy spec for that platform.',
      { name: z.string().describe('Pack filename inside ./packs/') },
      async ({ name }) => {
        const fp = path.join(PACKS_DIR, name);
        if (!fs.existsSync(fp)) return { content: [{ type: 'text', text: '✗ pack not found: ' + fp }] };
        const body = fs.readFileSync(fp, 'utf8');
        return { content: [{ type: 'text', text: body.slice(0, 60000) }] };
      }
    ),
    tool('queue_write', 'Save a draft (post / comment / DM / proposal) to a queue for human review. Filename is auto-generated. Returns the path.',
      { queue: z.string().describe('Queue slug · e.g. "fb-post", "li-dm", "upwork"'),
        title: z.string().describe('One-line title · used in the filename'),
        body: z.string().describe('The draft content · markdown-friendly'),
        meta: z.record(z.any()).optional() },
      async ({ queue, title, body, meta }) => {
        const today = new Date().toISOString().slice(0,10);
        const dir = path.join(QUEUES_DIR, queue.replace(/[^a-z0-9_-]/gi,''), today);
        fs.mkdirSync(dir, { recursive: true });
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40);
        const stamp = Date.now().toString(36);
        const fp = path.join(dir, `${stamp}-${slug}.md`);
        const fm = '---\n' + Object.entries({ title, ...(meta||{}), status: 'pending_review' }).map(([k,v])=>`${k}: ${typeof v==='string'?v:JSON.stringify(v)}`).join('\n') + '\n---\n\n';
        fs.writeFileSync(fp, fm + body);
        return { content: [{ type: 'text', text: 'queued · ' + fp }] };
      }
    ),
  ],
});

// ═══════════════════════════════════════════════════════════════════
//  ESTATE · n=4 → n=7 · the digital-twin amplifier
// ═══════════════════════════════════════════════════════════════════
//  The estate is 60+ sovereign tools Simon already built. si-didy
//  should ALWAYS check the estate before doing anything itself.
//  v20.1 seed · phi=1.618 · kappa=0.618 · fold=510510
const ESTATE_PATH  = './estate.json';
let   ESTATE       = {};
if (fs.existsSync(ESTATE_PATH)) {
  try { ESTATE = JSON.parse(fs.readFileSync(ESTATE_PATH, 'utf8')); }
  catch (e) { console.log('◊ estate.json present but unparseable · skipping'); }
}

const estateMcp = createSdkMcpServer({
  name: 'estate',
  version: '1.0.0',
  tools: [
    tool('estate_query', '◊·κ=1 · BEFORE reaching for browser, ALWAYS call this first. Returns matching tools from the AI Native Solutions estate by intent keyword. The estate already has 60+ sovereign builds · the right answer is usually "use what we already shipped".',
      { intent: z.string().describe('Plain-English description of what the task needs · e.g. "linkedin post", "shadow work conversation", "schedule a call", "calendar"'),
        limit: z.number().min(1).max(20).default(8) },
      async ({ intent, limit }) => {
        const all = [];
        const sections = ['forges', 'core_tools', 'infrastructure', 'agents'];
        for (const s of sections) {
          if (!ESTATE[s]) continue;
          for (const [name, meta] of Object.entries(ESTATE[s])) {
            all.push({ name, section: s, ...meta });
          }
        }
        const q = intent.toLowerCase().split(/\s+/);
        const scored = all.map(t => {
          const hay = (t.name + ' ' + (t.purpose||'') + ' ' + (t.use_when||'')).toLowerCase();
          let score = 0;
          for (const w of q) if (w.length > 2 && hay.includes(w)) score += hay.split(w).length - 1;
          return { ...t, _score: score };
        }).filter(t => t._score > 0).sort((a,b)=>b._score-a._score).slice(0, limit);
        const out = scored.length
          ? scored.map(t => `${t.name} (${t.section}) · ${t.purpose}\n  url: ${t.url || '(none)'}\n  use_when: ${t.use_when || '(see purpose)'}\n  tier: ${t.tier || 'T3'}`).join('\n\n')
          : '(no estate tool matched · consider forge_request to spawn a new one)';
        return { content: [{ type: 'text', text: out }] };
      }
    ),
    tool('estate_call', '◊·κ=1 · Call an estate tool\'s HTTP API directly. Use this INSTEAD of opening a browser when the tool exposes an endpoint. Logs to memory scope "estate-calls" automatically.',
      { tool_name: z.string().describe('Name from estate_query · e.g. "fallcore" / "fall-registry"'),
        method: z.enum(['GET','POST','PUT','PATCH','DELETE']).default('GET'),
        endpoint: z.string().describe('Endpoint path · e.g. "/v1/messages"'),
        body: z.string().optional(),
        headers: z.record(z.string()).optional() },
      async ({ tool_name, method, endpoint, body, headers }) => {
        // find the tool in estate
        let base = null;
        for (const s of ['forges','core_tools','infrastructure','agents']) {
          if (ESTATE[s]?.[tool_name]?.url) { base = ESTATE[s][tool_name].url; break; }
        }
        if (!base) return { content: [{ type: 'text', text: '✗ unknown estate tool: ' + tool_name + ' · run estate_query first' }] };
        const url = base.replace(/\/$/,'') + endpoint;
        const safeHeaders = interpolateEnv(headers || {});
        const safeBody = body ? interpolateEnv(body) : undefined;
        console.log(`  ◊· estate_call ${tool_name}${endpoint}`);
        try {
          const r = await fetch(interpolateEnv(url), { method, headers: safeHeaders, body: safeBody, signal: AbortSignal.timeout(60_000) });
          const text = await r.text();
          // auto-log
          fs.appendFileSync(path.join(MEMORY_DIR, 'estate-calls.jsonl'),
            JSON.stringify({ ts: new Date().toISOString(), tool: tool_name, endpoint, method, status: r.status }) + '\n');
          return { content: [{ type: 'text', text: `status ${r.status}\n${text.slice(0, 12000)}` }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'estate_call error: ' + e.message }] };
        }
      }
    ),
    tool('forge_request', '◊·κ=φ · When the estate has NO tool for the task, request one from fallcore-factory. Returns a build job id and (eventually) a repo URL + Pages URL. Pauses for ask_user before firing · this creates a real GitHub repo.',
      { brief: z.string().describe('Plain-English spec of the new tool · what it does, what archetype, what tier'),
        archetype: z.enum(['burned-founder','compliance-nervous','agency-reseller','bootstrapper','shadow-reader','parent','operator']).optional(),
        tier: z.enum(['LITE','PRO','ENTERPRISE']).default('LITE') },
      async ({ brief, archetype, tier }) => {
        const factory = ESTATE.forges?.['fallcore-factory'];
        if (!factory) return { content: [{ type: 'text', text: '✗ fallcore-factory not in estate manifest · add it to estate.json' }] };
        const ans = await ask(`\n  ◊ FORGE · about to request a new sovereign tool from fallcore-factory\n     brief: ${brief.slice(0, 200)}\n     archetype: ${archetype || '(auto)'} · tier: ${tier}\n  proceed? [yes/no] > `);
        if (!/^(y|yes|go|ok)/i.test(ans.trim())) return { content: [{ type: 'text', text: 'forge cancelled by user' }] };
        const body = JSON.stringify({ brief, archetype, tier });
        try {
          const r = await fetch(factory.url + '/v1/forge/expert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
          const text = await r.text();
          fs.appendFileSync(path.join(MEMORY_DIR, 'forge-requests.jsonl'),
            JSON.stringify({ ts: new Date().toISOString(), brief, archetype, tier, status: r.status }) + '\n');
          return { content: [{ type: 'text', text: `forge status ${r.status}\n${text.slice(0, 6000)}` }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'forge unreachable · ' + e.message + '\n\nFallback: use cli_run with `gh repo create` + sovereign-tool template locally.' }] };
        }
      }
    ),
    tool('subagent_spawn', '◊·κ=φ² · n=7 recursion · spawn a child si-didy with a sub-brief. Use when the mission has 2+ independent sub-tasks that can run in parallel or when one sub-task is heavy enough to deserve isolation. Child writes its own memory + queues. Returns its summary.',
      { sub_brief: z.string().describe('Self-contained brief for the child · explain platform, goal, constraints'),
        memory_scope: z.string().default('subagent').describe('Scope the child should log under') },
      async ({ sub_brief, memory_scope }) => {
        // recursive query() call · child inherits same MCPs
        const childPrompt = SYSTEM_DOCTRINE + `\n\nYOU ARE A CHILD si-didy. PARENT GAVE YOU THIS SUB-BRIEF:\n${sub_brief}\n\nExecute autonomously. Log to memory scope "${memory_scope}". Return a tight summary when done.`;
        let summary = '';
        try {
          const child = query({ prompt: childPrompt, options: queryOpts });
          for await (const m of child) {
            if (m.type === 'assistant') {
              const t = (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
              if (t) summary = t;
            }
          }
        } catch (e) {
          return { content: [{ type: 'text', text: 'subagent error: ' + e.message }] };
        }
        return { content: [{ type: 'text', text: '◊ child finished:\n' + summary.slice(0, 8000) }] };
      }
    ),
    tool('learn_log', '◊·κ=φ³ · SELF-LEARNING · After every mission, log a lesson. What worked. What didn\'t. What you\'d do differently. The twin compounds. Scope by platform or task type.',
      { scope: z.string().describe('e.g. "fb-comments", "upwork-proposals", "linkedin-dms"'),
        what_worked: z.string(),
        what_failed: z.string(),
        next_time: z.string() },
      async ({ scope, what_worked, what_failed, next_time }) => {
        const fp = path.join(MEMORY_DIR, 'lessons.jsonl');
        fs.appendFileSync(fp, JSON.stringify({ ts: new Date().toISOString(), scope, what_worked, what_failed, next_time }) + '\n');
        return { content: [{ type: 'text', text: 'lesson logged · the twin compounds · ◊·κ=1' }] };
      }
    ),
    tool('learn_recall', '◊·κ=φ³ · SELF-LEARNING · Before drafting, read recent lessons for this scope. The twin acts on what it learned.',
      { scope: z.string(), limit: z.number().min(1).max(50).default(10) },
      async ({ scope, limit }) => {
        const fp = path.join(MEMORY_DIR, 'lessons.jsonl');
        if (!fs.existsSync(fp)) return { content: [{ type: 'text', text: '(no lessons yet)' }] };
        const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean)
          .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
          .filter(l => l.scope === scope || scope === '*');
        const tail = lines.slice(-limit);
        return { content: [{ type: 'text', text: tail.length ? tail.map(l => `[${l.ts}] worked: ${l.what_worked}\n  failed: ${l.what_failed}\n  next: ${l.next_time}`).join('\n\n') : '(no lessons for scope ' + scope + ')' }] };
      }
    ),
    // ═══════════════════════════════════════════════════════════════
    // ◊ KONOMI v2.0 · ECONOMIC SUBSTRATE · mint + meter
    // ═══════════════════════════════════════════════════════════════
    tool('konomi_mint',
      '◊·κ=φ⁴ · KONOMI MINT · Anchor an authored artefact via SHA-256 + signed certificate. ' +
      'v1.0: writes cert to memory/konomi-mints.jsonl + broadcasts on fall-signal. ' +
      'v1.1 (todo): also posts the hash to onlybrains for BSV OP_RETURN anchoring. ' +
      'Use for the 8-deep mint queue in KONOMI-ECONOMIC-MODEL.md (v20.1 seed, substrate doc, ' +
      'cassie-anthropic, CASSIE stripe search, Konomi Dot Protocol, deep-research workflow, ' +
      'linkedin_drop pattern, this tool spec itself).',
      {
        artefact_path: z.string().describe('Local path to the canonical text file · e.g. "C:/.../SOVEREIGN-COGNITIVE-SUBSTRATE.md"'),
        name: z.string().optional().describe('Human-readable artefact name · defaults to basename'),
        parents: z.array(z.string()).optional().describe('Cert IDs of parent artefacts · e.g. ["cert-v20.1-seed"]'),
        note: z.string().optional().describe('Why-mint-now annotation'),
      },
      async ({ artefact_path, name, parents, note }) => {
        try {
          if (!fs.existsSync(artefact_path)) {
            return { content: [{ type: 'text', text: '✗ artefact_path not found: ' + artefact_path }] };
          }
          const body = fs.readFileSync(artefact_path);
          const crypto = await import('node:crypto');
          const sha256 = crypto.createHash('sha256').update(body).digest('hex');
          const size_bytes = body.length;
          const basename = path.basename(artefact_path);
          const ts = new Date().toISOString();
          const cert_id = 'cert-' + sha256.slice(0, 12);
          const cert = {
            cert_id,
            kind: 'konomi-mint/v1.0',
            artefact: {
              name: name || basename,
              path: artefact_path,
              basename,
              size_bytes,
              sha256,
            },
            parents: parents || [],
            note: note || '',
            issuer: 'sjgant80',
            ts,
            bsv_txid: null, // v1.1: anchor via onlybrains
            bsv_anchored: false,
            konomi_unit: 'KCC/1',
          };
          // append to ledger
          const fp = path.join(MEMORY_DIR, 'konomi-mints.jsonl');
          fs.appendFileSync(fp, JSON.stringify(cert) + '\n');
          // broadcast on fall-signal
          try {
            if (typeof broadcast === 'function') {
              broadcast({
                type: 'fall_signal',
                source: 'si-didy',
                kind: 'konomi_minted',
                payload: { cert_id, name: cert.artefact.name, sha256: sha256.slice(0,16), parents: cert.parents },
                ts,
              });
            }
          } catch (_) {}
          return { content: [{ type: 'text', text:
'◊ KONOMI MINTED · cert_id: ' + cert_id + '\n' +
'  artefact: ' + cert.artefact.name + '\n' +
'  sha256:   ' + sha256 + '\n' +
'  size:     ' + size_bytes + ' bytes\n' +
'  parents:  ' + (cert.parents.length ? cert.parents.join(', ') : '(none · genesis cert)') + '\n' +
'  note:     ' + (note || '(none)') + '\n' +
'  ledger:   ' + fp + '\n' +
'  bsv:      not-yet-anchored (v1.1) · run again with --anchor when onlybrains hook ships' }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'konomi_mint error: ' + e.message }] };
        }
      }
    ),
    tool('konomi_meter',
      '◊·κ=φ⁵ · KONOMI METER · Estimate recent Claude subscription token usage from local transcripts. ' +
      '±15% drift (Max-tier rate-limit accounting is not fully client-observable). Use to decide if you ' +
      'can fire a large fan-out without hitting the rate-limit. Returns: hours_scanned, sessions_count, ' +
      'approx_tokens, burn_rate_per_hour, safety_margin_pct.',
      {
        hours: z.number().min(1).max(168).default(24).describe('Hours to scan back · default 24h'),
        transcripts_root: z.string().optional().describe('Override path · default ~/.claude/projects'),
      },
      async ({ hours, transcripts_root }) => {
        try {
          const home = process.env.USERPROFILE || process.env.HOME || '';
          const root = transcripts_root || path.join(home, '.claude', 'projects');
          if (!fs.existsSync(root)) {
            return { content: [{ type: 'text', text: '✗ transcripts root not found: ' + root + ' · pass transcripts_root to override' }] };
          }
          const cutoff = Date.now() - hours * 60 * 60 * 1000;
          let totalChars = 0;
          let sessions = new Set();
          let files_scanned = 0;
          const walk = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
              const fp = path.join(dir, e.name);
              if (e.isDirectory()) walk(fp);
              else if (e.name.endsWith('.jsonl')) {
                const stat = fs.statSync(fp);
                if (stat.mtimeMs < cutoff) continue;
                files_scanned++;
                try {
                  const body = fs.readFileSync(fp, 'utf8');
                  totalChars += body.length;
                  sessions.add(path.basename(fp, '.jsonl'));
                } catch (_) {}
              }
            }
          };
          walk(root);
          // rough token estimate: 1 token ≈ 4 chars (English-ish · undercounts code-heavy sessions ~10%)
          const approx_tokens = Math.round(totalChars / 4);
          const burn_rate_per_hour = Math.round(approx_tokens / Math.max(1, hours));
          const MAX_PLAN_MONTHLY_TOKENS = 2_400_000; // rough · $200 tier · check current Anthropic policy
          const HOURS_IN_MONTH = 720;
          const monthly_budget = MAX_PLAN_MONTHLY_TOKENS;
          const monthly_burn_projected = burn_rate_per_hour * HOURS_IN_MONTH;
          const safety_margin_pct = Math.max(0, Math.round(100 * (1 - monthly_burn_projected / monthly_budget)));
          return { content: [{ type: 'text', text:
'◊ KONOMI METER · ROLLING ' + hours + 'h READ · NOT a real-time spike monitor\n' +
'  ⚠ this is a ' + hours + 'h rolling SUM · a single bad mission can dominate the window\n' +
'  ⚠ throttle threshold: safety_margin_pct < 25% · then prefer WebLLM / pause fan-outs\n' +
'  ⚠ drift ±15% · Max-tier accounting not fully client-observable\n' +
'\n' +
'  scan_window:              ' + hours + 'h · ' + files_scanned + ' transcripts · ' + sessions.size + ' sessions\n' +
'  approx_tokens_used:       ' + approx_tokens.toLocaleString() + '\n' +
'  burn_rate_per_hour:       ' + burn_rate_per_hour.toLocaleString() + ' tok/h\n' +
'  projected_monthly_burn:   ' + monthly_burn_projected.toLocaleString() + ' tok\n' +
'  Max plan rough budget:    ' + monthly_budget.toLocaleString() + ' tok\n' +
'  safety_margin_pct:        ' + safety_margin_pct + '%\n' +
'\n' +
'  context: a single failed T3 escalation can spike this read · check missions/<today>.jsonl\n' +
'  for "abandoned · selector failure" entries before treating the spike as a steady state.' }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'konomi_meter error: ' + e.message }] };
        }
      }
    ),
    // ═══════════════════════════════════════════════════════════════
    // ◊ SESSION AUDIT · operational hygiene scan (OP1-OP5 doctrine)
    // ═══════════════════════════════════════════════════════════════
    tool('session_audit',
      '◊·κ=φ³ · SESSION AUDIT · Read-only operational sweep. Counts and classifies: agent.mjs --server instances, ' +
      'MCP server processes (orphans across sessions), playwright chromium processes, listening on :1618, ' +
      'zombie playwright temp profile dirs. Returns colour-coded status (ok / amber / red) per category with ' +
      'recommended actions. NEVER kills anything · purely diagnostic. Call before any heavy build to catch leaks. ' +
      'Implements OP5 daily hygiene from estate doctrine.',
      {
        verbose: z.boolean().default(false).describe('Include full process commandlines · default false (counts only)'),
      },
      async ({ verbose }) => {
        try {
          const { execSync } = await import('node:child_process');
          const home = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');

          // 1. agent.mjs --server count
          let agentServerCount = 0;
          let agentServerDetails = [];
          try {
            const wmicOut = execSync('wmic process where "name=\'node.exe\'" get processid,commandline /format:list', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
            const blocks = wmicOut.split(/\r?\n\r?\n/);
            for (const b of blocks) {
              if (/agent\.mjs\s+--server/i.test(b)) {
                agentServerCount++;
                const pidMatch = b.match(/ProcessId=(\d+)/);
                const cmdMatch = b.match(/CommandLine=([^\r\n]+)/);
                if (pidMatch) agentServerDetails.push({ pid: pidMatch[1], cmd: cmdMatch ? cmdMatch[1].trim() : '' });
              }
            }
          } catch (_) {}

          // 2. MCP server count (onlybrains + fallcore)
          let mcpProcCount = 0;
          let mcpSets = 0;
          try {
            const wmicOut = execSync('wmic process where "name=\'node.exe\'" get processid,commandline /format:list', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
            const blocks = wmicOut.split(/\r?\n\r?\n/);
            for (const b of blocks) {
              if (/onlybrains-mcp|fallcore-mcp/i.test(b)) mcpProcCount++;
            }
            // approx: each session has 4 MCP-related procs (2 npx wrappers + 2 actual servers)
            mcpSets = Math.round(mcpProcCount / 4);
          } catch (_) {}

          // 3. Playwright chromium count
          let playwrightCount = 0;
          try {
            const wmicOut = execSync('wmic process where "name=\'chrome.exe\'" get processid,executablepath /format:list', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
            const blocks = wmicOut.split(/\r?\n\r?\n/);
            for (const b of blocks) {
              if (/ms-playwright/i.test(b)) playwrightCount++;
            }
          } catch (_) {}

          // 4. Port 1618 listening
          let port1618Listening = false;
          try {
            const netOut = execSync('netstat -ano', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
            port1618Listening = /:1618\s+0\.0\.0\.0:0\s+LISTENING/.test(netOut) || /:1618.*LISTENING/.test(netOut);
          } catch (_) {}

          // 5. Zombie temp profile dirs
          let zombieDirs = 0;
          const claudeTempPath = home ? path.join(home, 'Temp', 'claude') : '';
          if (claudeTempPath && fs.existsSync(claudeTempPath)) {
            try {
              for (const e of fs.readdirSync(claudeTempPath)) {
                if (/^playwright_chromium/i.test(e)) zombieDirs++;
              }
            } catch (_) {}
          }

          // ─── Classify ───
          const status = (kind, value) => {
            if (kind === 'agentServer') return value === 0 ? 'ok' : (value === 1 ? 'amber' : 'red');
            if (kind === 'mcpSets')     return value <= 1 ? 'ok' : 'amber';
            if (kind === 'playwright')  return value === 0 ? 'ok' : 'amber';
            if (kind === 'port1618')    return value ? 'amber' : 'ok';
            if (kind === 'zombies')     return value === 0 ? 'ok' : 'amber';
            return 'ok';
          };
          const flag = s => s === 'red' ? '✗' : (s === 'amber' ? '⚠' : '✓');

          const sAgent = status('agentServer', agentServerCount);
          const sMcp = status('mcpSets', mcpSets);
          const sPlay = status('playwright', playwrightCount);
          const sPort = status('port1618', port1618Listening);
          const sZomb = status('zombies', zombieDirs);

          const reds = [sAgent, sMcp, sPlay, sPort, sZomb].filter(x => x === 'red').length;
          const ambers = [sAgent, sMcp, sPlay, sPort, sZomb].filter(x => x === 'amber').length;
          const overall = reds > 0 ? 'RED' : (ambers > 0 ? 'AMBER' : 'GREEN');

          // ─── Build report ───
          let report = '◊ SESSION AUDIT · estate operational hygiene · OP5 doctrine\n';
          report += '  overall: ' + overall + ' · reds=' + reds + ' · ambers=' + ambers + '\n\n';
          report += '  ' + flag(sAgent) + ' agent.mjs --server         ' + agentServerCount + ' running';
          if (agentServerCount === 0) report += ' · clean\n';
          else if (agentServerCount === 1) report += ' · check PowerShell profile for autostart\n';
          else report += ' · MULTIPLE INSTANCES · only one needed\n';

          report += '  ' + flag(sMcp) + ' MCP processes              ' + mcpProcCount + ' procs (~' + mcpSets + ' Claude Code session' + (mcpSets === 1 ? '' : 's') + ')';
          if (mcpSets <= 1) report += ' · clean\n';
          else report += ' · ' + (mcpSets - 1) + ' ORPHAN SET' + (mcpSets > 2 ? 'S' : '') + ' from prior sessions · close extra Claude Code via /exit\n';

          report += '  ' + flag(sPlay) + ' Playwright chromium        ' + playwrightCount + ' alive';
          if (playwrightCount === 0) report += ' · clean\n';
          else report += ' · kill if not in active use · they leak profile locks\n';

          report += '  ' + flag(sPort) + ' Port :1618 (si-didy cockpit) ' + (port1618Listening ? 'BOUND' : 'free') + '\n';

          report += '  ' + flag(sZomb) + ' Zombie playwright temp dirs ' + zombieDirs + ' in %LOCALAPPDATA%\\Temp\\claude\\';
          if (zombieDirs > 0) report += ' · ~' + (zombieDirs * 50) + 'MB to free\n';
          else report += '\n';

          // ─── Actions ───
          report += '\n  RECOMMENDED ACTIONS:\n';
          if (overall === 'GREEN') {
            report += '    · none · estate is in steady state\n';
          } else {
            if (agentServerCount > 1) report += '    · kill duplicate agent.mjs --server instances · taskkill /F /PID <pid>\n';
            if (mcpSets > 1) report += '    · close orphan Claude Code sessions (use /exit) · then scan again\n';
            if (playwrightCount > 0) report += '    · kill playwright chromium if no active build · taskkill /F /IM chrome.exe /FI "MODULES eq playwright"\n';
            if (zombieDirs > 0) report += '    · delete zombie temp dirs · Remove-Item "$env:LOCALAPPDATA\\Temp\\claude\\playwright_chromium*" -Recurse -Force\n';
            if (port1618Listening && agentServerCount === 0) report += '    · :1618 bound but no agent.mjs --server · another process owns the port\n';
          }

          report += '\n  doctrine: OP1 env-first · OP2 name-before-kill · OP3 improvisation=stop-the-line\n';
          report += '            OP4 30-min env time-box · OP5 /exit always · session_audit before heavy builds';

          if (verbose && agentServerCount > 0) {
            report += '\n\n  agent.mjs --server details:\n';
            for (const a of agentServerDetails) report += '    PID ' + a.pid + ' · ' + a.cmd.slice(0, 100) + '\n';
          }

          // emit to fall-signal
          try {
            if (typeof broadcast === 'function') broadcast({
              type: 'fall_signal', source: 'si-didy', kind: 'session_audit_run',
              payload: { overall, reds, ambers, agentServerCount, mcpSets, playwrightCount, port1618: port1618Listening, zombieDirs },
              ts: new Date().toISOString()
            });
          } catch (_) {}

          return { content: [{ type: 'text', text: report }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'session_audit error: ' + e.message }] };
        }
      }
    ),
    // ═══════════════════════════════════════════════════════════════
    // ◊ CASSANDRA · vetter_digest · fall-vetter v2.0 daily summary
    // ═══════════════════════════════════════════════════════════════
    tool('vetter_digest',
      '◊·κ=φ⁵ · CASSANDRA DIGEST · Daily summary of all fall-vetter results received in the last N hours. ' +
      'Reads memory/fall-vetter-audit.jsonl (broadcast by the live vetter via fall-signal). ' +
      'Returns top 5 by score, bottom 5 by score, archetype distribution, sales101 stance counts, ' +
      'any tier3 hits (auto-blocks for human review), and recommended actions queue for human approval. ' +
      'Use as daily standup for Alex · "what came in overnight, what do I do with it".',
      {
        hours: z.number().min(1).max(168).default(24).describe('Hours to look back · default 24h'),
        digest_scope: z.string().default('li-vetter-digest').describe('Memory scope to append the digest to'),
      },
      async ({ hours, digest_scope }) => {
        try {
          const auditFp = path.join(MEMORY_DIR, 'fall-vetter-audit.jsonl');
          if (!fs.existsSync(auditFp)) {
            return { content: [{ type: 'text', text: '◊ CASSANDRA DIGEST · no audit ledger yet at ' + auditFp + '\n   (the live vetter posts to /signal · fall_vetter_result events route into this file)' }] };
          }
          const cutoff = Date.now() - hours * 60 * 60 * 1000;
          const lines = fs.readFileSync(auditFp, 'utf8').trim().split('\n').filter(Boolean);
          const events = [];
          for (const l of lines) {
            try {
              const ev = JSON.parse(l);
              const ts = ev.ts ? new Date(ev.ts).getTime() : 0;
              if (ts >= cutoff) events.push(ev);
            } catch (_) {}
          }
          if (!events.length) {
            return { content: [{ type: 'text', text: '◊ CASSANDRA DIGEST · ' + hours + 'h window · 0 events\n   (no signups vetted in this window · estate is quiet)' }] };
          }

          // Aggregate
          const archDist = {};
          const stanceDist = {};
          const decisionDist = { allow: 0, review: 0, block: 0 };
          const tier3Hits = [];
          const freudDominant = {};
          const actionQueue = []; // recommended_next != 'archive'
          const byScore = [];

          for (const ev of events) {
            const p = ev.payload || {};
            const arch = p.archetype || 'Seeker';
            const stance = p.sales_stance || 'UNREAD';
            const dec = p.decision || 'review';
            const next = p.recommended_next || 'reply';
            const score = (typeof p.score === 'number') ? p.score : 0;
            archDist[arch] = (archDist[arch] || 0) + 1;
            stanceDist[stance] = (stanceDist[stance] || 0) + 1;
            if (decisionDist[dec] != null) decisionDist[dec]++;
            if (p.freud_dominant) freudDominant[p.freud_dominant] = (freudDominant[p.freud_dominant] || 0) + 1;
            if (p.tier3_hits && p.tier3_hits > 0) tier3Hits.push({ ts: ev.ts, archetype: arch, stance, summary: (p.reading && p.reading.summary) || '' });
            if (next !== 'archive') actionQueue.push({ ts: ev.ts, archetype: arch, stance, score, next, summary: (p.reading && p.reading.summary) || '' });
            byScore.push({ ts: ev.ts, archetype: arch, stance, score, decision: dec, next, summary: (p.reading && p.reading.summary) || '' });
          }
          byScore.sort((a,b)=>b.score-a.score);
          const top5 = byScore.slice(0,5);
          const bot5 = byScore.slice(-5).reverse();

          // Format
          const fmt = (e) => `   ${e.score.toString().padStart(3)} · ${e.archetype.padEnd(10)} · ${e.stance.padEnd(14)} · ${e.next.padEnd(13)} · ${e.summary.slice(0,70)}`;
          const distLine = (d) => Object.entries(d).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}=${v}`).join(' · ');

          const md =
'# ◊ CASSANDRA DIGEST · ' + new Date().toISOString().slice(0,10) + ' · ' + hours + 'h window\n\n' +
'**' + events.length + ' signups vetted** · decisions: ' + distLine(decisionDist) + '\n\n' +
'## Archetype distribution\n' + distLine(archDist) + '\n\n' +
'## Sales-101 stance distribution\n' + distLine(stanceDist) + '\n\n' +
(Object.keys(freudDominant).length ? '## Freud defenses (dominant)\n' + distLine(freudDominant) + '\n\n' : '') +
(tier3Hits.length ? '## ⚠ TIER-3 hits · auto-blocked · human review\n' + tier3Hits.map(t => '- ' + t.ts + ' · ' + t.archetype + ' · ' + t.summary).join('\n') + '\n\n' : '') +
'## Top 5 by score\n' + top5.map(fmt).join('\n') + '\n\n' +
'## Bottom 5 by score\n' + bot5.map(fmt).join('\n') + '\n\n' +
'## Recommended actions queue (' + actionQueue.length + ')\n' +
(actionQueue.length ? actionQueue.slice(0,15).map(a => '- [' + a.next + '] ' + a.archetype + ' · ' + a.stance + ' · score ' + a.score + ' · ' + a.summary).join('\n') : '   (empty · everything archive-bound)') + '\n';

          // Append to digest scope
          try {
            const fp = path.join(MEMORY_DIR, digest_scope + '.jsonl');
            fs.appendFileSync(fp, JSON.stringify({ ts: new Date().toISOString(), hours, events: events.length, archetypes: archDist, stances: stanceDist, decisions: decisionDist, tier3: tier3Hits.length, actions_queued: actionQueue.length, md }) + '\n');
          } catch (_) {}

          // broadcast
          try {
            if (typeof broadcast === 'function') {
              broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'vetter_digest', payload: { hours, events: events.length, tier3: tier3Hits.length, actions: actionQueue.length, top_archetype: Object.entries(archDist).sort((a,b)=>b[1]-a[1])[0]?.[0] }, ts: new Date().toISOString() });
            }
          } catch (_) {}

          return { content: [{ type: 'text', text: md }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'vetter_digest error: ' + e.message }] };
        }
      }
    ),
    // ═══════════════════════════════════════════════════════════════
    // ◊ LINKEDIN · v1.0 · pack-driven post orchestrator
    // ═══════════════════════════════════════════════════════════════
    tool('linkedin_drop', '◊·κ=1 · Orchestrate a LinkedIn post end-to-end. Loads LINKEDIN-PACK · selects frame · drafts body · queues carousel · drives Playwright · pauses BEFORE Post. Memory-deduped. Use screenshot_dir if you have a folder of PNGs from capture_estate_screenshots — they upload as a multi-image LinkedIn post (works better than PDF for receipt-style "I just shipped this" carousels).',
      { frame: z.enum(['B1','B2','B3','B4','B5.1','B5.2','B5.3','custom']).describe('Which pack frame'),
        body_override: z.string().optional().describe('When frame=custom: verbatim body'),
        carousel_pdf_path: z.string().optional().describe('Path to a carousel PDF · OR use screenshot_dir for multi-image'),
        screenshot_dir: z.string().optional().describe('Directory of PNG screenshots · uploaded as LinkedIn multi-image post (preferred for B5.* substrate drops)'),
        dry_run: z.boolean().default(false).describe('If true: draft only, do not open the browser'),
        memory_scope: z.string().default('li-posts').describe('Dedup scope') },
      async ({ frame, body_override, carousel_pdf_path, screenshot_dir, dry_run, memory_scope }) => {
        // ◊ guard · --tool mode skips zod default · re-apply
        if (!memory_scope) memory_scope = 'li-posts';
        if (dry_run === undefined) dry_run = false;
        const today = new Date().toISOString().slice(0,10);
        console.log(`  ◊· linkedin_drop frame=${frame} dry_run=${dry_run} scope=${memory_scope}`);

        // 1. dedup · don't post the same frame twice in one day
        try {
          const fp = path.join(MEMORY_DIR, memory_scope + '.jsonl');
          if (fs.existsSync(fp)) {
            const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean)
              .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
            const todays = lines.filter(l => (l.ts || '').slice(0,10) === today && l.frame === frame);
            if (todays.length) return { content: [{ type: 'text', text: `✗ already posted frame ${frame} today (${todays.length} hit · skipping · pass a different frame or use dry_run)` }] };
          }
        } catch (_) {}

        // 2. resolve the body from the pack
        let body = body_override || '';
        if (frame !== 'custom') {
          const packFp = path.join(PACKS_DIR, 'LINKEDIN-PACK.txt');
          if (!fs.existsSync(packFp)) return { content: [{ type: 'text', text: '✗ LINKEDIN-PACK.txt not found in ./packs/' }] };
          const pack = fs.readFileSync(packFp, 'utf8');
          // Frame anchors: "B1 ·", "B2 ·", ..., "B5.1 ·", etc.
          const anchors = { 'B1':'B1 ·','B2':'B2 ·','B3':'B3 ·','B4':'B4 ·','B5.1':'B5.1 ·','B5.2':'B5.2 ·','B5.3':'B5.3 ·' };
          const anchor = anchors[frame];
          const idx = pack.indexOf(anchor);
          if (idx < 0) return { content: [{ type: 'text', text: `✗ frame ${frame} not found in pack` }] };
          const slice = pack.slice(idx, idx + 5000);
          const startMarker = '▼ COPY ▼';
          const start = slice.indexOf(startMarker);
          // Accept either '▲ END COPY ▲' (new B5.* frames) or '▲ END ▲' (legacy B1-B4)
          let endMarker = '▲ END COPY ▲';
          let end = slice.indexOf(endMarker);
          if (end < 0) { endMarker = '▲ END ▲'; end = slice.indexOf(endMarker); }
          if (start < 0 || end < 0) return { content: [{ type: 'text', text: `✗ COPY markers missing for frame ${frame}` }] };
          body = slice.slice(start + startMarker.length, end).trim();
        }
        if (!body) return { content: [{ type: 'text', text: '✗ no body resolved · pass body_override when frame=custom' }] };

        const headerLine = `◊ LINKEDIN DROP · frame ${frame} · ${body.length} chars`;
        console.log('  ' + headerLine);

        // 3. emit a fall-signal so cockpit + estate see the intent
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'linkedin_drop_drafted', payload: { frame, body_chars: body.length, carousel_pdf_path: carousel_pdf_path || null, dry_run }, ts: new Date().toISOString() });
        } catch (_) {}

        // 4. dry_run · stop here · queue the body to ./queues/li-post/ for manual review
        if (dry_run) {
          try {
            const qDir = path.join(QUEUES_DIR, 'li-post');
            if (!fs.existsSync(qDir)) fs.mkdirSync(qDir, { recursive: true });
            const qFp = path.join(qDir, `${today}-${frame.replace(/\./g,'_')}.md`);
            fs.writeFileSync(qFp, `# LinkedIn drop · frame ${frame} · ${today}\n\n${body}\n\n---\nCarousel: ${carousel_pdf_path || '(not attached)'}\n`);
            return { content: [{ type: 'text', text: `◊ DRY RUN · queued to ${qFp} · review then re-run with dry_run:false` }] };
          } catch (e) {
            return { content: [{ type: 'text', text: 'queue write error: ' + e.message }] };
          }
        }

        // 5. live mode · enumerate carousel images
        let carouselImages = [];
        if (screenshot_dir && fs.existsSync(screenshot_dir)) {
          try {
            carouselImages = fs.readdirSync(screenshot_dir)
              .filter(f => /\.(png|jpe?g|webp)$/i.test(f))
              .sort()
              .map(f => path.join(screenshot_dir, f));
          } catch(_) {}
        }

        // 6. drive Playwright directly · matches upwork_open pattern
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        try {
          const { chromium } = await import('playwright');
          if (!_ctx) {
            console.log('◊ T3 · Chromium opening (persistent profile · ' + USER_DATA + ')');
            resetProfileExitType();
            _ctx = await chromium.launchPersistentContext(USER_DATA, { headless: false, viewport: VIEWPORT, args: ['--disable-blink-features=AutomationControlled', '--disable-session-crashed-bubble', '--restore-last-session=false', '--no-first-run', '--no-default-browser-check'] });
            _page = _ctx.pages()[0] || await _ctx.newPage();
            await _page.setViewportSize(VIEWPORT);
          }
          if (!_page) _page = await _ctx.newPage();

          await _page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await _page.waitForLoadState('domcontentloaded');
          await _page.waitForTimeout(2500);

          // Verify we landed on /feed/ before proceeding
          if (!_page.url().includes('linkedin.com/feed')) {
            throw new Error('not on /feed/ after navigation · landed at: ' + _page.url());
          }

          // Close any stray tabs (Playwright sometimes opens about:blank)
          try {
            const _pages = _ctx.pages();
            for (let i = 1; i < _pages.length; i++) { try { await _pages[i].close(); } catch (_) {} }
          } catch (_) {}

          // Click "Start a post"
          try {
            await _page.getByRole('button', { name: /start a post/i }).first().click({ timeout: 8000 });
          } catch (_) {
            await _page.locator('text=/start a post/i').first().click({ timeout: 8000 });
          }

          // Wait for the VISIBLE compose dialog · filter aria-hidden ghosts
          // (LinkedIn has vjs-error-display dialogs with role=dialog but aria-hidden=true · they never become visible)
          // Skip the dialog-wait entirely · go straight to waiting for the composer ql-editor inside a VISIBLE dialog
          await _page.waitForTimeout(1500);
          let composer = _page.locator('div[role="dialog"]:not([aria-hidden="true"]) div.ql-editor[contenteditable="true"]').first();
          try {
            await composer.waitFor({ state: 'visible', timeout: 12000 });
            await composer.click({ timeout: 3000 });
          } catch (_) {
            // fallback · still scoped to visible dialog · never page-wide
            composer = _page.locator('div[role="dialog"]:not([aria-hidden="true"]) [contenteditable="true"]').first();
            await composer.waitFor({ state: 'visible', timeout: 5000 });
            await composer.click({ timeout: 3000 });
          }
          await _page.waitForTimeout(500);

          // Type the body char-by-char to defeat anti-paste detection
          await _page.keyboard.type(body, { delay: 5 });
          await _page.waitForTimeout(800);

          // VERIFY body actually landed in the composer (not the search bar)
          try {
            const typed = await composer.innerText();
            const typedLen = (typed || '').replace(/\s+/g, '').length;
            const bodyLen = body.replace(/\s+/g, '').length;
            if (typedLen < bodyLen * 0.85) {
              throw new Error('body did not land in composer · typed=' + typedLen + ' chars · expected ~' + bodyLen + ' · likely typed into search bar');
            }
          } catch (e) {
            throw new Error('composer verification failed: ' + e.message);
          }

          // Attach media
          if (carouselImages.length > 0) {
            // Image button (camera icon) · NOT document
            const imgChooserSel = ['button[aria-label*="photo" i]', 'button[aria-label*="image" i]', 'button[aria-label*="media" i]'];
            let clickedImgBtn = false;
            for (const sel of imgChooserSel) {
              try {
                const b = _page.locator(sel).first();
                if (await b.count() > 0) { await b.click({ timeout: 4000 }); clickedImgBtn = true; break; }
              } catch (_) {}
            }
            if (!clickedImgBtn) {
              try { await _page.getByLabel(/add a photo|image|media/i).first().click({ timeout: 4000 }); clickedImgBtn = true; } catch (_) {}
            }
            await _page.waitForTimeout(1200);
            // setInputFiles · multi-select all PNG paths
            try {
              const fileInput = _page.locator('input[type="file"]').first();
              await fileInput.setInputFiles(carouselImages);
            } catch (e) {
              console.log('  ⚠ image setInputFiles failed: ' + e.message);
            }
            await _page.waitForTimeout(2000);
            // LinkedIn often shows a "Done" / "Next" button after media attach
            try { await _page.getByRole('button', { name: /^(done|next)$/i }).first().click({ timeout: 4000 }); } catch (_) {}
          } else if (carousel_pdf_path && fs.existsSync(carousel_pdf_path)) {
            const docChooserSel = ['button[aria-label*="document" i]'];
            let clickedDocBtn = false;
            for (const sel of docChooserSel) {
              try {
                const b = _page.locator(sel).first();
                if (await b.count() > 0) { await b.click({ timeout: 4000 }); clickedDocBtn = true; break; }
              } catch (_) {}
            }
            if (!clickedDocBtn) {
              try { await _page.getByLabel(/document/i).first().click({ timeout: 4000 }); clickedDocBtn = true; } catch (_) {}
            }
            await _page.waitForTimeout(1200);
            try {
              const fileInput = _page.locator('input[type="file"]').first();
              await fileInput.setInputFiles([carousel_pdf_path]);
            } catch (e) {
              console.log('  ⚠ document setInputFiles failed: ' + e.message);
            }
            await _page.waitForTimeout(2500);
            try { await _page.getByRole('button', { name: /^(done|next)$/i }).first().click({ timeout: 4000 }); } catch (_) {}
          }

          // Wait for preview to render
          await _page.waitForTimeout(3000);
          const previewBuf = await _page.screenshot({ type: 'png' });

          // Pause-before-Post gate · TTY-safe
          const approve = await ask('\n  ◊ ready to Post · approve? [yes/no] > ');
          if (!/^(y|yes|go|ok)/i.test((approve || '').trim())) {
            try { fs.appendFileSync(path.join(MEMORY_DIR, 'li-actions.jsonl'), JSON.stringify({ ts: new Date().toISOString(), verb: 'linkedin_drop', frame, body_chars: body.length, status: 'declined' }) + '\n'); } catch (_) {}
            return { content: [
              { type: 'text', text: 'declined · draft left in composer' },
              { type: 'image', data: previewBuf.toString('base64'), mimeType: 'image/png' }
            ] };
          }

          // Click "Post"
          try {
            await _page.getByRole('button', { name: /^post$/i }).first().click({ timeout: 8000 });
          } catch (_) {
            await _page.locator('button:has-text("Post")').first().click({ timeout: 8000 });
          }
          await _page.waitForTimeout(2000);
          const postBuf = await _page.screenshot({ type: 'png' });

          // Memory · jsonl append
          try { fs.appendFileSync(path.join(MEMORY_DIR, memory_scope + '.jsonl'), JSON.stringify({ ts: new Date().toISOString(), frame, body_chars: body.length, carousel_pdf_path: carousel_pdf_path || null, screenshot_count: carouselImages.length, status: 'posted' }) + '\n'); } catch (_) {}
          try { fs.appendFileSync(path.join(MEMORY_DIR, 'li-actions.jsonl'), JSON.stringify({ ts: new Date().toISOString(), verb: 'linkedin_drop', frame, body_chars: body.length, status: 'posted' }) + '\n'); } catch (_) {}

          // Broadcast success
          try {
            if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'linkedin_drop_posted', payload: { frame, body_chars: body.length, screenshot_count: carouselImages.length, carousel_pdf_path: carousel_pdf_path || null }, ts: new Date().toISOString() });
          } catch (_) {}

          return { content: [
            { type: 'text', text: `◊ LINKEDIN DROP · POSTED · frame ${frame} · ${body.length} chars${carouselImages.length ? ' · ' + carouselImages.length + ' images' : carousel_pdf_path ? ' · doc attached' : ' · text-only'}` },
            { type: 'image', data: postBuf.toString('base64'), mimeType: 'image/png' }
          ] };
        } catch (e) {
          const failPath = `C:\\Users\\sjgan\\Downloads\\li-drop-failure-${frame.replace(/\./g, '_')}-${ts}.png`;
          try { if (_page) { const buf = await _page.screenshot({ type: 'png' }); fs.writeFileSync(failPath, buf); } } catch (_) {}
          try { fs.appendFileSync(path.join(MEMORY_DIR, 'li-actions.jsonl'), JSON.stringify({ ts: new Date().toISOString(), verb: 'linkedin_drop', frame, body_chars: body.length, status: 'error', error: e.message, screenshot: failPath }) + '\n'); } catch (_) {}
          return { content: [{ type: 'text', text: `linkedin_drop error: ${e.message} · failure screenshot: ${failPath}` }] };
        }
      }
    ),

    // ═══════════════════════════════════════════════════════════════
    // ◊ LINKEDIN AUTOPILOT · v1.0 · always-on draft engine
    // Doctrine: NEVER auto-send · ALWAYS queue + ask_user before fire
    // ═══════════════════════════════════════════════════════════════
    tool('capture_estate_screenshots', '◊·κ=φ⁴ · CAROUSEL ENGINE · Screenshot a curated list of live estate pages, save to ./queues/li-carousel-<scope>/, return paths. Each scope has a pre-mapped URL set (B5.1=workflow / B5.2=tool-ship / B5.3=contrarian-verify). Browser chrome is NOT captured (Playwright viewport-only). Use crop_top_px to also trim in-page nav. These become the LinkedIn carousel images.',
      { scope: z.enum(['B5.1','B5.2','B5.3','custom']).describe('Pre-mapped URL set · custom uses urls arg'),
        urls: z.array(z.string()).optional().describe('When scope=custom · explicit URL list'),
        crop_top_px: z.number().min(0).max(400).default(0).describe('Trim N px from the top of each shot (in-page nav)'),
        viewport_w: z.number().default(1080).describe('Viewport width · 1080 matches LinkedIn carousel ratio'),
        viewport_h: z.number().default(1350).describe('Viewport height · 1080x1350 = LinkedIn doc post ratio') },
      async ({ scope, urls, crop_top_px, viewport_w, viewport_h }) => {
        console.log(`  ◊· capture_estate_screenshots scope=${scope} crop=${crop_top_px}px viewport=${viewport_w}x${viewport_h}`);
        // Pre-mapped URL sets per post scope · 7-9 shots each for a substantive carousel
        const SCOPES = {
          'B5.1': [
            { name: '01-cover-fall-substrate',    url: 'https://sjgant80-hub.github.io/fall-substrate/' },
            { name: '02-fall-raas-landing',       url: 'https://sjgant80-hub.github.io/fall-raas/' },
            { name: '03-fall-verify-landing',     url: 'https://sjgant80-hub.github.io/fall-verify/' },
            { name: '04-substrate-arch-doc',      url: 'https://sjgant80-hub.github.io/fall-substrate/SOVEREIGN-COGNITIVE-SUBSTRATE.md' },
            { name: '05-ain-marketplace',         url: 'https://www.ai-nativesolutions.com/#marketplace' },
            { name: '06-ain-substrate-pin',       url: 'https://www.ai-nativesolutions.com/' },
            { name: '07-cassie-cosmology',        url: 'https://sjgant80-hub.github.io/cassietorusbtc135solver/cassie-torus-v2.html' },
            { name: '08-fall-registry-raw',       url: 'https://raw.githubusercontent.com/sjgant80-hub/fall-registry/main/index.json' },
          ],
          'B5.2': [
            { name: '01-cover-fall-substrate',    url: 'https://sjgant80-hub.github.io/fall-substrate/' },
            { name: '02-fallinvoice',             url: 'https://sjgant80-hub.github.io/fallinvoice/' },
            { name: '03-fallflow',                url: 'https://sjgant80-hub.github.io/fallflow/' },
            { name: '04-fallhire',                url: 'https://sjgant80-hub.github.io/fallhire/' },
            { name: '05-fallcrm',                 url: 'https://sjgant80-hub.github.io/fallcrm/' },
            { name: '06-fallap',                  url: 'https://sjgant80-hub.github.io/fallap/' },
            { name: '07-fallcarousel',            url: 'https://sjgant80-hub.github.io/fallcarousel/' },
            { name: '08-ain-marketplace',         url: 'https://www.ai-nativesolutions.com/#marketplace' },
          ],
          'B5.3': [
            { name: '01-cover-fall-verify',       url: 'https://sjgant80-hub.github.io/fall-verify/' },
            { name: '02-fall-raas',               url: 'https://sjgant80-hub.github.io/fall-raas/' },
            { name: '03-fall-substrate',          url: 'https://sjgant80-hub.github.io/fall-substrate/' },
            { name: '04-substrate-arch-doc',      url: 'https://sjgant80-hub.github.io/fall-substrate/SOVEREIGN-COGNITIVE-SUBSTRATE.md' },
            { name: '05-ain-cognitive-pin',       url: 'https://www.ai-nativesolutions.com/' },
          ],
          'custom': (urls || []).map((u, i) => ({ name: String(i+1).padStart(2,'0') + '-custom', url: u })),
        };
        const targets = SCOPES[scope] || [];
        if (targets.length === 0) return { content: [{ type: 'text', text: '✗ no URLs · scope=custom requires urls arg' }] };

        const outDir = path.join(QUEUES_DIR, `li-carousel-${scope.replace(/\./g,'_')}`);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        try {
          const { chromium } = await import('playwright');
          // Use a SEPARATE browser context so the LinkedIn profile session isn't disturbed
          const captureCtx = await chromium.launch({ headless: true });
          const page = await captureCtx.newPage({ viewport: { width: viewport_w, height: viewport_h } });
          await page.setViewportSize({ width: viewport_w, height: viewport_h });

          const results = [];
          for (const t of targets) {
            try {
              console.log(`    · capturing ${t.name} ← ${t.url}`);
              await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await page.waitForTimeout(2500); // let fonts + animations settle
              const filePath = path.join(outDir, `${t.name}.png`);
              let opts = { path: filePath, type: 'png', fullPage: false };
              if (crop_top_px > 0) {
                opts.clip = { x: 0, y: crop_top_px, width: viewport_w, height: viewport_h - crop_top_px };
              }
              await page.screenshot(opts);
              const stat = fs.statSync(filePath);
              results.push({ name: t.name, url: t.url, path: filePath, size_kb: Math.round(stat.size / 1024) });
            } catch (e) {
              results.push({ name: t.name, url: t.url, error: e.message });
            }
          }
          await captureCtx.close();
          try {
            if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'screenshots_captured', payload: { scope, count: results.length, dir: outDir }, ts: new Date().toISOString() });
          } catch(_) {}
          const ok = results.filter(r => !r.error);
          const errs = results.filter(r => r.error);
          return { content: [{ type: 'text', text:
`◊ captured ${ok.length}/${targets.length} screenshots for ${scope}
  output_dir: ${outDir}
${ok.map(r => `  ✓ ${r.name}.png · ${r.size_kb}KB · ${r.url}`).join('\n')}
${errs.length ? '\n' + errs.map(r => `  ✗ ${r.name} · ${r.error}`).join('\n') : ''}

NEXT: hand outputs to linkedin_drop(frame:'${scope}', screenshot_dir:'${outDir}')` }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'capture error: ' + e.message }] };
        }
      }
    ),
    tool('linkedin_schedule', '◊·κ=φ⁵ · Schedule a LinkedIn post for a future time. Stored to memory/li-schedule.jsonl · server cron checks every minute · fires linkedin_drop at the scheduled hour. Auto-runs the carousel capture too. NEVER auto-clicks Post · still pauses for ask_user when the time comes.',
      { frame: z.enum(['B5.1','B5.2','B5.3','B1','B2','B3','B4','custom']).describe('Pack frame'),
        when_iso: z.string().describe('ISO timestamp · e.g. 2026-06-02T07:30:00+01:00 (UK morning)'),
        auto_capture: z.boolean().default(true).describe('Auto-run capture_estate_screenshots before drop'),
        notes: z.string().optional().describe('Reminder notes for future-you') },
      async ({ frame, when_iso, auto_capture, notes }) => {
        const when = new Date(when_iso);
        if (isNaN(when.getTime())) return { content: [{ type: 'text', text: `✗ unparseable when_iso "${when_iso}" · use ISO format` }] };
        const id = `${when.toISOString().slice(0,16).replace(/[-T:]/g,'')}-${frame.replace(/\./g,'_')}`;
        const entry = { id, frame, when_iso: when.toISOString(), auto_capture, notes: notes || '', status: 'scheduled', created_at: new Date().toISOString() };
        try {
          fs.appendFileSync(path.join(MEMORY_DIR, 'li-schedule.jsonl'), JSON.stringify(entry) + '\n');
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'linkedin_scheduled', payload: entry, ts: new Date().toISOString() });
          const dt = when.toLocaleString('en-GB', { timeZone: 'Europe/London' });
          return { content: [{ type: 'text', text: `◊ scheduled · frame ${frame} · ${dt} UK · id ${id}\n  auto_capture: ${auto_capture}\n  notes: ${notes || '(none)'}\n  → server cron will fire linkedin_drop at the hour · pauses for ask_user before Post` }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'schedule error: ' + e.message }] };
        }
      }
    ),
    tool('linkedin_open', '◊·κ=1 · Open LinkedIn in the persistent Chromium profile. First call may prompt for one-time login; session is saved to ./si-didy-profile. Returns screenshot + logged-in status. Call ONCE per session before any LinkedIn autopilot/scan/drop.',
      { url: z.string().default('https://www.linkedin.com/feed/').describe('Where to land · default = home feed') },
      async ({ url }) => {
        console.log(`  ◊· linkedin_open ${url}`);
        try {
          const { chromium } = await import('playwright');
          if (!_ctx) {
            console.log('◊ T3 · Chromium opening (persistent profile · ./si-didy-profile)');
            resetProfileExitType(); _ctx = await chromium.launchPersistentContext(USER_DATA, { headless: false, viewport: VIEWPORT, args: ['--disable-blink-features=AutomationControlled', '--disable-session-crashed-bubble', '--restore-last-session=false', '--no-first-run', '--no-default-browser-check'] });
            _page = _ctx.pages()[0] || await _ctx.newPage();
            await _page.setViewportSize(VIEWPORT);
          }
          if (!_page) _page = await _ctx.newPage();
          await _page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await _page.waitForTimeout(2500);
          const pageUrl = _page.url();
          const loggedIn = !/login|sign-?in/i.test(pageUrl);
          const buf = await _page.screenshot({ type: 'png' });
          try {
            if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'linkedin_opened', payload: { url: pageUrl, loggedIn }, ts: new Date().toISOString() });
          } catch (_) {}
          return { content: [
            { type: 'text', text: `◊ linkedin_open · landed at ${pageUrl} · logged_in=${loggedIn}${loggedIn ? '' : '\n  ↳ login screen detected · log in manually · session will persist'}` },
            { type: 'image', data: buf.toString('base64'), mimeType: 'image/png' }
          ] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'linkedin_open error: ' + e.message }] };
        }
      }
    ),
    tool('linkedin_autopilot', '◊·κ=φ⁷ · ALWAYS-ON LINKEDIN ENGINE · Runs ONE cycle: scans home feed · scans Simon\'s recent posts for new comments · drafts helpful comments / replies / connection requests · QUEUES EVERYTHING for human approval (./queues/li-*). NEVER auto-sends. Strict rate-limit-aware. Use mode:"scan" for the default pass; "reply" to focus on Simon\'s post comment-threads; "engage" for proactive feed commenting.',
      { mode: z.enum(['scan','reply','engage']).default('scan').describe('scan=triage feed+notifs · reply=Simon-post replies · engage=proactive comments'),
        cap: z.number().min(1).max(10).default(5).describe('Max drafts to produce this cycle (rate-safe default 5)'),
        archetype: z.string().optional().describe('Optional · target archetype filter for engage mode (e.g. "compliance-nervous director")') },
      async ({ mode, cap, archetype }) => {
        console.log(`  ◊· linkedin_autopilot mode=${mode} cap=${cap}${archetype ? ' archetype="' + archetype + '"' : ''}`);
        const today = new Date().toISOString().slice(0,10);

        // Rate-limit check from pack: 5 comments/day · 5 DMs/day · 10 connects/day
        const limits = { engage: 5, reply: 5, scan: 10 };
        try {
          const fp = path.join(MEMORY_DIR, 'li-actions.jsonl');
          if (fs.existsSync(fp)) {
            const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean)
              .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
              .filter(l => (l.ts || '').slice(0,10) === today && l.mode === mode);
            if (lines.length >= limits[mode]) {
              return { content: [{ type: 'text', text: `✗ daily cap reached for mode=${mode} (${lines.length}/${limits[mode]}) · skipping · come back tomorrow` }] };
            }
            cap = Math.min(cap, limits[mode] - lines.length);
          }
        } catch (_) {}

        // emit start broadcast
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'autopilot_cycle_started', payload: { mode, cap, archetype: archetype || null }, ts: new Date().toISOString() });
        } catch (_) {}

        // Spawn a child Claude session that scans the feed and drafts cap N items
        const autopilotPrompt = SYSTEM_DOCTRINE + `\n\nYOU ARE THE LINKEDIN AUTOPILOT for Simon · MODE=${mode} · CAP=${cap}${archetype ? ' · ARCHETYPE FILTER="' + archetype + '"' : ''}

PRE-FLIGHT (always):
  1. pack_load('LINKEDIN-PACK.txt') · voice spec
  2. memory_recall('li-targets-seen', limit:50) · do not re-engage the same profile
  3. memory_recall('li-actions', limit:30) · do not duplicate today's actions
  4. browser_screenshot · confirm logged in as Simon

MODE: ${mode}

${mode === 'scan' ? `SCAN MODE (the default · safe to run repeatedly):
  · browser_navigate https://www.linkedin.com/feed/ · wait 3s
  · Read the top 20 visible posts (browser_screenshot + interpret)
  · For each: score 0-100 for { engagement-opportunity, value-fit, audience-match }
  · Pick the top ${cap}
  · For each: DRAFT a helpful comment (60-180 chars) that:
       - Adds a genuine insight (no platitudes)
       - Mentions free info if applicable ("FYI fall-X handles this for free, MIT")
       - Soft DM-encourage at the end ONLY if the post is clearly seeking help
       - ABSOLUTELY NO external links in the comment (LinkedIn dings reach)
       - Voice = Simon (per fallpost six-layer)
  · Queue ALL drafts to ./queues/li-comment/${today}-<n>.md
  · queue_write each one as a markdown file
  · DO NOT navigate to the comment box · DO NOT type · DO NOT click Submit
  · The human reviews + approves later
` : mode === 'reply' ? `REPLY MODE (focus on Simon's posts):
  · browser_navigate https://www.linkedin.com/in/${process.env.SIDIDY_LINKEDIN_HANDLE || 'simon-gant'}/recent-activity/all/
  · Find Simon's last 3 posts · for each, expand the comments section
  · For each comment that's NEW since the last autopilot run (memory_recall 'li-replied-comments'):
       - If it's a substantive question → DRAFT a helpful 1-2 sentence reply
       - If it's a "tell me more" / "DM me" → DRAFT a polite "let's take it to DMs" reply
       - If it's noise / lol-emoji → skip · don't reply
  · Cap at ${cap} replies total this cycle
  · Queue to ./queues/li-reply/${today}-<n>.md
  · memory_note each as 'li-replied-comments' so we don't re-draft next cycle
  · DO NOT click "Reply" or submit · DRAFTS ONLY
` : `ENGAGE MODE (proactive · use sparingly):
  · ${archetype ? 'Search LinkedIn for "' + archetype + '"' : 'Use pack Section E · pick the day archetype on rotation'}
  · browser_navigate the search results
  · For each profile in top ${cap}:
       - browser_screenshot
       - Visit their profile (browser_navigate)
       - Read their last post or "About" section
       - DRAFT a connection-request note (≤220 chars · pack D2 format)
       - DRAFT a follow-up DM (only fires when they accept · pack D3 format)
  · Queue connection drafts to ./queues/li-connect/${today}-<n>.md
  · Queue follow-up DMs to ./queues/li-dm/${today}-<n>.md (marked status:pending-accept)
  · memory_note each profile to 'li-targets-seen'
  · DO NOT click "Connect" or send · DRAFTS ONLY
`}
END OF CYCLE:
  · memory_note { scope:'li-actions', ts, mode:'${mode}', drafts_queued: N }
  · learn_log scope:'linkedin-autopilot' { what_worked, what_failed, next_time }
  · fall_signal broadcast: autopilot_cycle_complete with counts
  · Return a tight summary: N drafts queued · paths · top engagement-score · next-cycle suggestion

SAFETY:
  · NEVER click any Submit/Send/Connect/Comment button
  · NEVER auto-accept InMails
  · NEVER post · NEVER DM · NEVER comment without human approval
  · Pause 30-90s between profile views (LinkedIn rate-flags fast scrolling)
  · If you see a "We've restricted your account" notice · STOP immediately and ask_user`;

        let final = '';
        try {
          const child = query({ prompt: autopilotPrompt, options: queryOpts });
          for await (const m of child) {
            if (m.type === 'assistant') {
              const t = (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
              if (t) final = t;
            }
          }
        } catch (e) {
          return { content: [{ type: 'text', text: 'autopilot error: ' + e.message }] };
        }
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'li-actions.jsonl'), JSON.stringify({ ts: new Date().toISOString(), mode, cap, archetype: archetype || null, summary: final.slice(0, 2000) }) + '\n'); } catch (_) {}
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'autopilot_cycle_complete', payload: { mode, cap }, ts: new Date().toISOString() });
        } catch (_) {}
        return { content: [{ type: 'text', text: `◊ autopilot cycle complete · mode=${mode}\n\n${final}` }] };
      }
    ),
    tool('find_client', '◊·κ=φ⁸ · "FIND ME A CLIENT" · Research the target archetype\'s real pain via research() · score N candidate profiles on LinkedIn · queue personalised connection-request drafts · all paused for human approval. The intent-to-DM funnel.',
      { archetype: z.string().describe('Plain-English target · e.g. "UK accountant in late-payment chaos", "biochem founder hiring sloppy", "trades sole-trader on Xero"'),
        n: z.number().min(1).max(10).default(5).describe('Number of candidate profiles to surface · cap 10') },
      async ({ archetype, n }) => {
        console.log(`  ◊· find_client "${archetype}" · n=${n}`);
        const today = new Date().toISOString().slice(0,10);
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'find_client_started', payload: { archetype, n }, ts: new Date().toISOString() });
        } catch (_) {}

        const findPrompt = SYSTEM_DOCTRINE + `\n\nMISSION: FIND A CLIENT · archetype="${archetype}" · n=${n}

PHASE 1 · RESEARCH THE PAIN
  Call research(question:"What is the most acute, currently-budgeted, DM-conversion-ready pain for ${archetype} in 2026?", angles:4, votes:3).
  From the cited findings: identify the ONE pain that survives adversarial verification AND maps to an estate tool.

PHASE 2 · TOOL MATCH
  estate_query the pain → find the best-fit estate tool.
  If no good fit → consider substrate_build (ASK SIMON FIRST).

PHASE 3 · CANDIDATE SCAN
  pack_load('LINKEDIN-PACK.txt')
  Open LinkedIn (linkedin_open if needed)
  Search for ${n*3} candidates matching the archetype (browser_navigate the search)
  For each: profile-screen + score on { archetype-match, recent-activity, mutual-connections, role-seniority } → pick top ${n}

PHASE 4 · DRAFT THE OUTREACH (queue · don't send)
  For each of the top ${n}:
    · DRAFT a connection request note (≤220 chars · references the verified pain)
    · DRAFT a follow-up DM (fires after accept · references the matched tool · INCLUDES a "comment 'X' for the free tool" CTA)
    · Queue both to ./queues/li-connect/${today}-find-${archetype.replace(/[^a-z0-9]/gi,'-').slice(0,20)}-<n>.md
  memory_note 'li-targets-seen' so we don't re-engage

PHASE 5 · REPORT
  Return tight summary:
    · The verified pain
    · The matched tool
    · The ${n} candidates (name, role, why they fit, what the connection-request says)
    · Total drafts queued
    · Suggested next cycle

SAFETY: NEVER auto-send · ALL drafts await Simon's approval`;
        let final = '';
        try {
          const child = query({ prompt: findPrompt, options: queryOpts });
          for await (const m of child) {
            if (m.type === 'assistant') {
              const t = (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
              if (t) final = t;
            }
          }
        } catch (e) {
          return { content: [{ type: 'text', text: 'find_client error: ' + e.message }] };
        }
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'li-actions.jsonl'), JSON.stringify({ ts: new Date().toISOString(), mode: 'find_client', archetype, n, summary: final.slice(0, 2000) }) + '\n'); } catch (_) {}
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'find_client_complete', payload: { archetype, n }, ts: new Date().toISOString() });
        } catch (_) {}
        return { content: [{ type: 'text', text: `◊ find_client · ${n} drafts queued · archetype="${archetype}"\n\n${final}` }] };
      }
    ),

    // ═══════════════════════════════════════════════════════════════
    // ◊ UPWORK AUTOPILOT · v1.0 · always-on client-hunt engine
    // Doctrine: NEVER auto-submit · ALWAYS queue + ask_user before fire
    // FallMap-bait CTA baked into every proposal · TOS-compliant
    // ═══════════════════════════════════════════════════════════════
    tool('upwork_open', '◊·κ=1 · Open Upwork in the persistent Chromium profile (shared with LinkedIn · ./si-didy-profile). First call may prompt for one-time login; session is saved. Returns screenshot + logged-in status. Call ONCE per session before any upwork_autopilot / find_jobs / propose / reply.',
      { url: z.string().default('https://www.upwork.com/nx/find-work/').describe('Where to land · default = find-work feed') },
      async ({ url }) => {
        console.log(`  ◊· upwork_open ${url}`);
        try {
          const { chromium } = await import('playwright');
          if (!_ctx) {
            console.log('◊ T3 · Chromium opening (persistent profile · ./si-didy-profile)');
            resetProfileExitType(); _ctx = await chromium.launchPersistentContext(USER_DATA, { headless: false, viewport: VIEWPORT, args: ['--disable-blink-features=AutomationControlled', '--disable-session-crashed-bubble', '--restore-last-session=false', '--no-first-run', '--no-default-browser-check'] });
            _page = _ctx.pages()[0] || await _ctx.newPage();
            await _page.setViewportSize(VIEWPORT);
          }
          if (!_page) _page = await _ctx.newPage();
          await _page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await _page.waitForTimeout(2500);
          const pageUrl = _page.url();
          const loggedIn = !/login|sign-?in/i.test(pageUrl);
          const buf = await _page.screenshot({ type: 'png' });
          try {
            if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'upwork_opened', payload: { url: pageUrl, loggedIn }, ts: new Date().toISOString() });
          } catch (_) {}
          return { content: [
            { type: 'text', text: `◊ upwork_open · landed at ${pageUrl} · logged_in=${loggedIn}${loggedIn ? '' : '\n  ↳ login screen detected · log in manually · session will persist'}` },
            { type: 'image', data: buf.toString('base64'), mimeType: 'image/png' }
          ] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'upwork_open error: ' + e.message }] };
        }
      }
    ),
    tool('upwork_assisted_paste', '◊·κ=1 · LinkedIn-flow for Upwork profile fill · pack-driven paste + pause-before-Save. Mirrors linkedin_drop rail: si-didy navigates section URL · loads content to system clipboard · YOU Ctrl+V into the field · YOU hit Save · type "next" between sections. Zero auto-clicks. Zero selector risk. ~8 Save presses total. Use after upwork_open confirms login.',
      { section: z.enum(['all','A','B','C','D','E','F']).default('all').describe('Which section · "all" runs A→F sequentially · or pick one to retry'),
        pack_path: z.string().default('./packs/UPWORK-PACK.txt'),
        portfolio_dir: z.string().default('C:\\Users\\sjgan\\Downloads\\upwork-portfolio') },
      async ({ section, pack_path, portfolio_dir }) => {
        console.log(`  ◊· upwork_assisted_paste section=${section}`);
        const setClipboard = (text) => {
          try { spawnSync('clip.exe', [], { input: text, encoding: 'utf8' }); return true; }
          catch (e) { console.log(`  ⚠ clipboard set failed: ${e.message}`); return false; }
        };
        let pack;
        try { pack = fs.readFileSync(pack_path, 'utf8'); }
        catch (e) { return { content: [{ type: 'text', text: `pack read failed: ${e.message}` }] }; }
        const grab = (re) => { const m = pack.match(re); return m ? m[1].trim() : ''; };
        const allBlocks = [
          { id: 'P0', label: 'WIPE · nothing in old profile is keeping', target: 'Profile page',
            url: 'https://www.upwork.com/freelancers/settings/profile',
            clipboard: '',
            hint: `WIPE EVERYTHING · nothing here is staying:
     · PORTFOLIO  → ⋯ menu → Delete on EVERY card · confirm all
     · SKILLS     → pencil → remove EVERY existing skill · Save empty
     · OVERVIEW   → pencil → select-all → Delete · (we paste fresh in B)
     · PHOTO      → pencil → upload your headshot or AI Native ◊ glyph
                    (skip only if your current photo is already correct)
     · TITLE      → leave the existing one · A1 replaces it next step
     · EMPLOYMENT/EDUCATION/LANGUAGES → leave alone (not in scope)

     The old yellow webflow placeholders ALL go. Take 2 min.
     Type "next" when the canvas is clean.` },
          { id: 'A1', label: 'Headline', target: 'Profile Title field',
            url: 'https://www.upwork.com/freelancers/settings/profile',
            clipboard: grab(/A1\.\s*HEADLINE[\s\S]*?▼ COPY ▼\s*\n([\s\S]*?)\n▲ END ▲/),
            hint: 'Click pencil next to Title · Ctrl+V · Save · type "next"' },
          { id: 'A2', label: 'Hourly Rate · $95', target: 'Hourly rate field',
            url: 'https://www.upwork.com/freelancers/settings/profile',
            clipboard: '95',
            hint: 'Click pencil next to Hourly rate · clear · paste 95 · Save · type "next"' },
          { id: 'A3', label: 'Availability', target: 'Availability setting',
            url: 'https://www.upwork.com/freelancers/settings/profile',
            clipboard: '',
            hint: 'Click pencil next to Availability · select "As needed - open to offers" · Save · type "next"' },
          { id: 'B', label: 'Overview · the bio',  target: 'Overview field',
            url: 'https://www.upwork.com/freelancers/settings/profile',
            clipboard: grab(/SECTION B[\s\S]*?▼ COPY ▼[^\n]*\n([\s\S]*?)\n▲ END ▲/),
            hint: 'Click pencil next to Overview · select-all + Ctrl+V · Save · type "next"' },
          { id: 'C', label: 'Skills · 20 items', target: 'Skills section',
            url: 'https://www.upwork.com/freelancers/settings/profile',
            clipboard: grab(/SECTION C[\s\S]*?▼ COPY \(one at a time\) ▼\s*\n([\s\S]*?)\n▲ END ▲/),
            hint: 'Click pencil next to Skills · type each skill one-by-one (Upwork autocompletes · the 20-list is in your clipboard for reference) · Save · type "next"' },
        ];
        for (let i = 1; i <= 7; i++) {
          const re = new RegExp(`PORTFOLIO ENTRY ${i}[\\s\\S]*?▼ TITLE ▼\\s*\\n([\\s\\S]*?)\\n▲ END ▲[\\s\\S]*?▼ DESCRIPTION ▼\\s*\\n([\\s\\S]*?)\\n▲ END ▲[\\s\\S]*?▼ PROJECT LINK ▼\\s*\\n([\\s\\S]*?)\\n▲ END ▲`);
          const m = pack.match(re);
          if (!m) continue;
          const title = m[1].trim(), desc = m[2].trim(), pURL = m[3].trim();
          const pngCandidates = fs.existsSync(portfolio_dir)
            ? fs.readdirSync(portfolio_dir).filter(f => f.match(new RegExp(`^0?${i}-`)) && f.endsWith('.png')) : [];
          const imgPath = pngCandidates[0] ? path.join(portfolio_dir, pngCandidates[0]) : '(none found)';
          allBlocks.push({
            id: `D${i}`, label: `Portfolio Entry ${i} · ${title.slice(0, 50)}`,
            target: 'Portfolio · Add Work modal',
            url: 'https://www.upwork.com/freelancers/settings/profile',
            clipboard: title,
            hint: `Click "Add work" · paste TITLE with Ctrl+V · sub-blocks (desc/url/image) will sequence automatically · final Save · type "next"`,
            subBlocks: { description: desc, projectUrl: pURL, image: imgPath }
          });
        }
        const fSaved = grab(/SAVED RESPONSE[\s\S]*?▼ COPY ▼\s*\n([\s\S]*?)\n▲ END ▲/) || grab(/SECTION F[\s\S]*?▼ COPY ▼\s*\n([\s\S]*?)\n▲ END ▲/);
        if (fSaved) allBlocks.push({
          id: 'F', label: 'Saved Response · FallMap bait',
          target: 'Messages → Settings → Quick replies',
          url: 'https://www.upwork.com/ab/messages/settings/quick-replies',
          clipboard: fSaved,
          hint: 'Click "New quick reply" · paste with Ctrl+V · name "FallMap bait" · Save · type "next"'
        });
        const wanted = section === 'all' ? allBlocks : allBlocks.filter(b => b.id === section || b.id.startsWith(section) || (section === 'P' && b.id === 'P0'));
        if (!wanted.length) return { content: [{ type: 'text', text: `no blocks match section="${section}"` }] };
        try {
          if (!_ctx) {
            const { chromium } = await import('playwright');
            console.log('◊ T3 · Chromium opening (persistent profile · ./si-didy-profile)');
            resetProfileExitType(); _ctx = await chromium.launchPersistentContext(USER_DATA, {
              headless: false, viewport: VIEWPORT,
              args: ['--disable-blink-features=AutomationControlled', '--disable-session-crashed-bubble', '--restore-last-session=false', '--no-first-run', '--no-default-browser-check']
            });
            _page = _ctx.pages()[0] || await _ctx.newPage();
            await _page.setViewportSize(VIEWPORT);
          }
        } catch (e) { return { content: [{ type: 'text', text: 'browser open failed: ' + e.message }] }; }
        const log = [];
        for (const block of wanted) {
          try {
            await _page.goto(block.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await _page.waitForTimeout(1500);
          } catch (e) { console.log(`  ⚠ nav to ${block.url} failed: ${e.message} · continuing`); }
          if (block.clipboard) setClipboard(block.clipboard);
          console.log(`\n${'═'.repeat(64)}`);
          console.log(`◊ ${block.id} · ${block.label}`);
          console.log(`  Target:    ${block.target}`);
          console.log(`  Clipboard: ${block.clipboard ? `loaded (${block.clipboard.length} chars)` : '(empty · no paste needed)'}`);
          console.log(`  Action:    ${block.hint}`);
          console.log('═'.repeat(64));
          let ans = ((await ask(`\n  ◊ ${block.id} > [next / skip / stop] > `)) || '').trim().toLowerCase();
          if (block.subBlocks && !ans.startsWith('stop') && !ans.startsWith('skip')) {
            if (block.subBlocks.description) {
              setClipboard(block.subBlocks.description);
              console.log(`\n  ◊ ${block.id}.desc · clipboard loaded (${block.subBlocks.description.length} chars) · paste in Description field`);
              await ask(`  ◊ ${block.id}.desc > [next] > `);
            }
            if (block.subBlocks.projectUrl) {
              setClipboard(block.subBlocks.projectUrl);
              console.log(`\n  ◊ ${block.id}.url · clipboard: ${block.subBlocks.projectUrl} · paste in Project Link field`);
              await ask(`  ◊ ${block.id}.url > [next] > `);
            }
            if (block.subBlocks.image && block.subBlocks.image !== '(none found)') {
              console.log(`\n  ◊ ${block.id}.img · file: ${block.subBlocks.image} · drag into upload zone OR click "Add image" → browse to this path`);
              await ask(`  ◊ ${block.id}.img > [next] > `);
            }
            ans = 'next';
          }
          if (ans.startsWith('stop')) { log.push({ section: block.id, status: 'stopped' }); break; }
          const status = ans.startsWith('skip') ? 'skipped' : 'saved';
          log.push({ section: block.id, status });
          try {
            fs.appendFileSync(path.join(MEMORY_DIR, 'up-actions.jsonl'),
              JSON.stringify({ ts: new Date().toISOString(), mode: 'assisted_paste', section: block.id, status, label: block.label }) + '\n');
          } catch (_) {}
          try {
            if (typeof broadcast === 'function') broadcast({
              type: 'fall_signal', source: 'si-didy', kind: 'upwork_section_processed',
              payload: { section: block.id, status }, ts: new Date().toISOString()
            });
          } catch (_) {}
        }
        const savedCount = log.filter(l => l.status === 'saved').length;
        return { content: [{ type: 'text', text:
          `◊ upwork_assisted_paste complete\n${log.map(l => `  ${l.section}: ${l.status}`).join('\n')}\n\n${savedCount}/${wanted.length} sections saved · ◊·κ=1`
        }] };
      }
    ),
    tool('upwork_find_jobs', '◊·κ=φ⁶ · UPWORK JOB SCANNER · Search the Upwork job feed for a query, scrape the visible cards, score against UPWORK-PACK Section H archetype matcher, filter posted-since-hours, dedupe via up-jobs-seen memory. Queues scored candidates to ./queues/up-jobs/. NEVER applies · just scans.',
      { query: z.string().describe('Search query · e.g. "AI agent", "Claude integration", "sovereign self-hosted"'),
        n: z.number().min(1).max(20).default(10).describe('Max candidates to return · default 10'),
        since_hours: z.number().min(1).max(168).default(24).describe('Filter jobs posted within N hours · default 24') },
      async ({ query: q, n, since_hours }) => {
        console.log(`  ◊· upwork_find_jobs "${q}" · n=${n} · since=${since_hours}h`);
        const today = new Date().toISOString().slice(0,10);
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'upwork_scan_started', payload: { query: q, n, since_hours }, ts: new Date().toISOString() });
        } catch (_) {}

        const findPrompt = SYSTEM_DOCTRINE + `\n\nMISSION: UPWORK JOB SCAN · query="${q}" · n=${n} · since=${since_hours}h

PRE-FLIGHT:
  1. pack_load('UPWORK-PACK.txt') · read Section H (archetypes) + Section F (templates)
  2. memory_recall('up-jobs-seen', limit:100) · do NOT re-surface jobs we've already scored
  3. browser_screenshot · confirm logged into Upwork

PHASE 1 · SEARCH
  · browser_navigate https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(q)}&sort=recency
  · browser_screenshot · capture the top of the results
  · Scroll through the first ~30 visible job cards · extract from each:
       - job_id (the slug in the URL path · e.g. ~012abc...)
       - title
       - posted_time (parse to relative · "2 hours ago" → hours)
       - budget (hourly range OR fixed amount)
       - client_spent_history (total spent if visible · "$10k+ spent")
       - proposals_count (e.g. "5 to 10 proposals")
       - description_snippet (first 200 chars visible)
       - job_url (full https://www.upwork.com/jobs/~... URL)

PHASE 2 · FILTER
  · Drop any job posted MORE than ${since_hours} hours ago
  · Drop any job whose job_id appears in up-jobs-seen memory
  · Cap remaining to top ${n}

PHASE 3 · SCORE (archetype matcher · UPWORK-PACK Section H)
  For each surviving job, classify into ONE of:
    1. BURNED_FOUNDER     (mentions specific SaaS names, price hikes, "we tried X")
    2. COMPLIANCE_NERVOUS (legal/finance/healthcare/GDPR/data sovereignty/on-prem)
    3. AGENCY_RESELLER    (white-label, "for our clients", agency posting)
    4. BOOTSTRAPPER       (solo founder, "small budget", weekend-coder energy)
    5. ENTERPRISE_TIRE_KICKER (vague brief, "exploratory", budget mismatch)
  And score 0-100 on { budget_fit, archetype_clarity, freshness, competition_low }.
  Compute total_score = avg of the four.

PHASE 4 · QUEUE
  · Write the full scored list to ./queues/up-jobs/${today}-${q.replace(/[^a-z0-9]/gi,'-').slice(0,30)}.json via queue_write
  · memory_note each job_id to scope 'up-jobs-seen' (so next scan skips)

PHASE 5 · REPORT (return ONLY · short)
  · Total candidates surfaced
  · Top 5 by total_score · for each: title · archetype · score · job_url
  · Suggested next verb (e.g. "upwork_propose job_id_or_url for top hit")

SAFETY: SCAN ONLY · NEVER click Apply / Send Proposal / Submit · drafts come from upwork_propose`;

        let final = '';
        try {
          const child = query({ prompt: findPrompt, options: queryOpts });
          for await (const m of child) {
            if (m.type === 'assistant') {
              const t = (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
              if (t) final = t;
            }
          }
        } catch (e) {
          return { content: [{ type: 'text', text: 'upwork_find_jobs error: ' + e.message }] };
        }
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'up-actions.jsonl'), JSON.stringify({ ts: new Date().toISOString(), mode: 'find_jobs', query: q, n, since_hours, summary: final.slice(0, 2000) }) + '\n'); } catch (_) {}
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'upwork_jobs_scanned', payload: { query: q, n }, ts: new Date().toISOString() });
        } catch (_) {}
        return { content: [{ type: 'text', text: `◊ upwork_find_jobs · query="${q}" · ≤${n} candidates queued\n\n${final}` }] };
      }
    ),
    tool('upwork_propose', '◊·κ=φ⁷ · UPWORK PROPOSAL DRAFTER · Read a job (by URL or queued job_id) · spawn a child Claude that loads UPWORK-PACK Sections B+F+H · match archetype · draft a 150-220 word cover letter with FallMap-bait CTA + ONE portfolio link + UK/Top Rated closer · write to ./queues/up-proposal/. If dry_run:false · ask_user then return a T3 step plan with PAUSE-BEFORE-SUBMIT. NEVER auto-submits.',
      { job_id_or_url: z.string().describe('Upwork job_id (e.g. ~012abc...) OR full job URL'),
        dry_run: z.boolean().default(true).describe('true = draft + queue · false = ask_user + return T3 submit-plan (still pauses before Submit)') },
      async ({ job_id_or_url, dry_run }) => {
        console.log(`  ◊· upwork_propose ${job_id_or_url} dry_run=${dry_run}`);
        const today = new Date().toISOString().slice(0,10);
        const safeId = job_id_or_url.replace(/[^a-z0-9~]/gi,'-').slice(0,40);

        // Daily cap check · UPWORK-PACK Section G: 5-8 sends/day · we cap at 5
        try {
          const fp = path.join(MEMORY_DIR, 'up-actions.jsonl');
          if (fs.existsSync(fp)) {
            const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean)
              .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
              .filter(l => (l.ts || '').slice(0,10) === today && l.mode === 'propose_sent');
            if (lines.length >= 5 && !dry_run) {
              return { content: [{ type: 'text', text: `✗ daily propose-cap reached (${lines.length}/5 sent today) · come back tomorrow · or run dry_run:true to keep drafting` }] };
            }
          }
        } catch (_) {}

        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'upwork_propose_started', payload: { job_id_or_url, dry_run }, ts: new Date().toISOString() });
        } catch (_) {}

        const proposalPrompt = SYSTEM_DOCTRINE + `\n\nMISSION: UPWORK PROPOSAL DRAFT · target="${job_id_or_url}" · dry_run=${dry_run}

PRE-FLIGHT:
  1. pack_load('UPWORK-PACK.txt') · read Section B (overview voice) + Section F (3 templates) + Section H (archetypes) + Section D (portfolio entries 1-6) + Section E (FallMap-bait play)
  2. learn_recall(scope:'upwork-proposals') · what template won last time

PHASE 1 · READ THE JOB
  If "${job_id_or_url}" looks like a URL · browser_navigate to it · browser_screenshot
  Otherwise · look for it in ./queues/up-jobs/${today}-*.json via queue_read · or browser_navigate https://www.upwork.com/jobs/${job_id_or_url}
  Extract: title · full description · budget · client info · stated tech stack · timeline · any specific SaaS named

PHASE 2 · CLASSIFY (Section H archetype matcher)
  Pick ONE of: BURNED_FOUNDER / COMPLIANCE_NERVOUS / AGENCY_RESELLER / BOOTSTRAPPER / ENTERPRISE_TIRE_KICKER
  Pick the matching template: 1=custom build ($5k+) · 2=automation ($2-5k) · 3=discovery/audit (entry)

PHASE 3 · PORTFOLIO MATCH
  Pick ONE most-relevant entry from Section D (1-6):
    1. ai-nativesolutions.com (the hub · use for generic AI / agency reseller)
    2. fallpost (LinkedIn / content / marketing automation)
    3. fallmap (cost-comparison / consulting-replacement · ALSO the bait link)
    4. fallvault (backup / sovereignty / encryption)
    5. fallforce (CRM / procurement / audit chain / compliance)
    6. trilogy-forge (meta / archetype tooling / agencies)

PHASE 4 · DRAFT (150-220 words · STRICT)
  Structure:
    LINE 1-2:  FallMap-bait opener · "Before you read the rest — here's what your workflow costs as a sovereign build vs the consultant quote: https://sjgant80-hub.github.io/fallmap/ — if the number surprises you, the rest is worth reading."
    LINE 3-5:  Name ONE specific signal from the job post (a SaaS they named, a feature they want, a constraint they stated) · proves it's not generic
    LINE 6-8:  Link to the ONE most-relevant portfolio item · 1-line why it matches
    LINE 9-11: Pricing posture from the matched template
    CLOSER:    "Top Rated · UK · ◊"

  Output a JSON object ONLY · no prose:
  {
    "archetype": "BURNED_FOUNDER|COMPLIANCE_NERVOUS|AGENCY_RESELLER|BOOTSTRAPPER|ENTERPRISE_TIRE_KICKER",
    "template_used": 1|2|3,
    "cover_letter": "...the full 150-220 word draft...",
    "fallmap_url": "https://sjgant80-hub.github.io/fallmap/",
    "portfolio_link_used": "https://sjgant80-hub.github.io/...",
    "proposed_rate": "...e.g. $95/hr or $3500 fixed...",
    "time_estimate": "...e.g. 5-day turnaround...",
    "specific_signal_quoted": "...the exact phrase from their post you referenced..."
  }

PHASE 5 · QUEUE
  · queue_write to ./queues/up-proposal/${today}-${safeId}.md
    Frontmatter: status:pending_review · archetype · template · proposed_rate · time_estimate · fallmap_url
    Body: the cover_letter verbatim · then a "──── meta ────" block with the JSON
  · memory_note { scope:'up-proposals', job: '${job_id_or_url}', archetype, template, dry_run: ${dry_run} }

${dry_run ? `STOP HERE · return the queue path + a 3-line summary (archetype · template · word count). Do NOT navigate to the proposal form.` : `PHASE 6 · LIVE MODE (dry_run=false)
  · ask_user("send this proposal as drafted? [yes/no/edit]")
  · If user says "edit" · take their edits and re-queue · stop
  · If user says "no" · stop · log the rejection to learn_log
  · If user says "yes" · return this T3 STEP PLAN as your final text output:

       STEP 1: browser_navigate to the job's apply URL (the job URL + "/apply/")
       STEP 2: browser_wait 2000ms
       STEP 3: browser_type the cover_letter into the proposal textarea (locator: textarea[name="coverLetter"], or first visible textarea)
       STEP 4: browser_type the proposed_rate into the rate input (if hourly job) OR the fixed budget input
       STEP 5: browser_screenshot · show Simon the filled form
       STEP 6: ask_user "Submit this proposal? [yes/no]" · NON-NEGOTIABLE PAUSE
       STEP 7: ONLY if user says yes · browser_click the Submit button
       STEP 8: browser_screenshot · capture the success page
       STEP 9: memory_note { scope:'up-proposals', status:'sent', job: '${job_id_or_url}', sent_at: now }
       STEP 10: append to up-actions.jsonl with mode:'propose_sent'
       STEP 11: fall_signal broadcast: upwork_proposal_sent

  STEP 6 IS THE GATE · NEVER skip · NEVER infer "yes" from silence.`}

SAFETY:
  · NEVER click "Send Proposal" / "Submit" without ask_user
  · NEVER pay connects for boost without ask_user
  · The FallMap URL is a free tool / portfolio link · NOT off-platform redirect · TOS-compliant
  · If you see "We've limited your account" · STOP and ask_user`;

        let final = '';
        try {
          const child = query({ prompt: proposalPrompt, options: queryOpts });
          for await (const m of child) {
            if (m.type === 'assistant') {
              const t = (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
              if (t) final = t;
            }
          }
        } catch (e) {
          return { content: [{ type: 'text', text: 'upwork_propose error: ' + e.message }] };
        }
        const queuePath = `./queues/up-proposal/${today}-${safeId}.md`;
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'up-actions.jsonl'), JSON.stringify({ ts: new Date().toISOString(), mode: dry_run ? 'propose_drafted' : 'propose_sent', job: job_id_or_url, queue_path: queuePath, summary: final.slice(0, 2000) }) + '\n'); } catch (_) {}
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: dry_run ? 'upwork_proposal_drafted' : 'upwork_proposal_sent', payload: { job: job_id_or_url, queue_path: queuePath }, ts: new Date().toISOString() });
        } catch (_) {}
        return { content: [{ type: 'text', text: `◊ upwork_propose · ${dry_run ? 'DRAFTED' : 'LIVE'} · queue=${queuePath}\n\n${final}` }] };
      }
    ),
    tool('upwork_reply', '◊·κ=φ⁶ · UPWORK MESSAGE REPLY · Open a specific Upwork message thread · read the last 3-5 client messages · route to one of three patterns (qualify / unstall-with-fallslot / closing-FallMap-one-pager) · draft a reply · queue for approval. dry_run:false returns a T3 plan with PAUSE-BEFORE-SEND.',
      { thread_url: z.string().describe('Full Upwork message thread URL (https://www.upwork.com/messages/rooms/...)'),
        dry_run: z.boolean().default(true).describe('true = draft + queue · false = ask_user + return T3 send-plan (still pauses before Send)') },
      async ({ thread_url, dry_run }) => {
        console.log(`  ◊· upwork_reply ${thread_url} dry_run=${dry_run}`);
        const today = new Date().toISOString().slice(0,10);
        const threadId = (thread_url.match(/rooms\/([a-z0-9~_-]+)/i) || [,'thread'])[1].slice(0,40);

        // Daily cap check: 10 replies/day
        try {
          const fp = path.join(MEMORY_DIR, 'up-actions.jsonl');
          if (fs.existsSync(fp)) {
            const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean)
              .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
              .filter(l => (l.ts || '').slice(0,10) === today && l.mode === 'reply_sent');
            if (lines.length >= 10 && !dry_run) {
              return { content: [{ type: 'text', text: `✗ daily reply-cap reached (${lines.length}/10 sent today) · come back tomorrow · or run dry_run:true to keep drafting` }] };
            }
          }
        } catch (_) {}

        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'upwork_reply_started', payload: { thread_url, dry_run }, ts: new Date().toISOString() });
        } catch (_) {}

        const replyPrompt = SYSTEM_DOCTRINE + `\n\nMISSION: UPWORK MESSAGE REPLY · thread="${thread_url}" · dry_run=${dry_run}

PRE-FLIGHT:
  1. pack_load('UPWORK-PACK.txt') · read Section E (FallMap-bait + Loom escalation) + Section H (archetypes)
  2. memory_recall('up-replies', limit:20) · check if we've drafted in this thread today already

PHASE 1 · READ THE THREAD
  · browser_navigate ${thread_url}
  · browser_wait 2500
  · browser_screenshot
  · Scroll the message panel · extract the last 3-5 messages FROM THE CLIENT (skip Simon's own messages)
  · Note: client name, current job title (if shown in sidebar), tone, most recent timestamp

PHASE 2 · CLASSIFY CLIENT INTENT (pick exactly ONE)
  ROUTE A · QUALIFYING:    client asked specific questions ("can you do X?", "do you handle Y?")
       → answer each question directly + ask 2 sharper questions back (scope · timeline · success criteria)
  ROUTE B · STALLING:      client went quiet · last message was "let me think about it" / "circle back" / >48h since
       → offer a 10-minute scope call · paste fallslot URL: https://sjgant80-hub.github.io/fallslot/
       → "if a call's the wrong format, just paste your current workflow here and I'll come back with the number"
  ROUTE C · CLOSING-CURIOUS: client asked about pricing / next steps / "what would this cost?"
       → drop the FallMap one-pager URL with their workflow modelled · propose a fixed price · "happy to scope on a 15-min call if you want a tighter number"

PHASE 3 · DRAFT THE REPLY (80-180 words · Simon's voice per Section B)
  Output JSON ONLY:
  {
    "route": "A|B|C",
    "client_last_message_summary": "...1-line gist...",
    "reply_text": "...the full draft...",
    "links_included": ["..."],
    "escalation_offer": "...if any · e.g. 'Loom video next step' or 'fallslot 15-min call'..."
  }

PHASE 4 · QUEUE
  · queue_write to ./queues/up-reply/${today}-${threadId}.md
    Frontmatter: status:pending_review · route · thread_url · links_included
    Body: reply_text verbatim · then "──── meta ────" block with the JSON
  · memory_note { scope:'up-replies', thread: '${thread_url}', route, dry_run: ${dry_run} }

${dry_run ? `STOP HERE · return queue path + 3-line summary (route · word count · links). Do NOT type into the message box.` : `PHASE 5 · LIVE MODE (dry_run=false)
  · ask_user("send this reply as drafted? [yes/no/edit]")
  · If edit · re-queue · stop
  · If no · log to learn_log · stop
  · If yes · return this T3 STEP PLAN:

       STEP 1: browser_navigate to ${thread_url} (refresh focus)
       STEP 2: browser_wait 1500
       STEP 3: browser_click the message input box (locator: div[role="textbox"], or contenteditable area)
       STEP 4: browser_type the reply_text into it
       STEP 5: browser_screenshot · show Simon the composed reply
       STEP 6: ask_user "Send this reply? [yes/no]" · NON-NEGOTIABLE PAUSE
       STEP 7: ONLY if yes · browser_click the Send button
       STEP 8: browser_screenshot · capture confirmation
       STEP 9: memory_note { scope:'up-replies', status:'sent', thread: '${thread_url}', sent_at: now }
       STEP 10: append up-actions.jsonl with mode:'reply_sent'
       STEP 11: fall_signal broadcast: upwork_reply_sent

  STEP 6 IS THE GATE · NEVER skip.`}

SAFETY:
  · NEVER click Send without ask_user
  · NEVER paste a Stripe / external payment link · only fallmap / fallslot / portfolio URLs
  · If Upwork warns about off-platform contact · STOP and ask_user`;

        let final = '';
        try {
          const child = query({ prompt: replyPrompt, options: queryOpts });
          for await (const m of child) {
            if (m.type === 'assistant') {
              const t = (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
              if (t) final = t;
            }
          }
        } catch (e) {
          return { content: [{ type: 'text', text: 'upwork_reply error: ' + e.message }] };
        }
        const queuePath = `./queues/up-reply/${today}-${threadId}.md`;
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'up-actions.jsonl'), JSON.stringify({ ts: new Date().toISOString(), mode: dry_run ? 'reply_drafted' : 'reply_sent', thread: thread_url, queue_path: queuePath, summary: final.slice(0, 2000) }) + '\n'); } catch (_) {}
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: dry_run ? 'upwork_reply_drafted' : 'upwork_reply_sent', payload: { thread: thread_url, queue_path: queuePath }, ts: new Date().toISOString() });
        } catch (_) {}
        return { content: [{ type: 'text', text: `◊ upwork_reply · ${dry_run ? 'DRAFTED' : 'LIVE'} · queue=${queuePath}\n\n${final}` }] };
      }
    ),
    tool('upwork_autopilot', '◊·κ=φ⁷ · ALWAYS-ON UPWORK ENGINE · Runs ONE cycle: scan saved searches · OR draft proposals for top-scored queued jobs · OR draft replies to unanswered message threads · QUEUES EVERYTHING for human approval (./queues/up-*). NEVER auto-submits. Daily caps: propose ≤5/day · reply ≤10/day · scan unlimited. Memory-deduped.',
      { mode: z.enum(['scan','propose','reply']).default('scan').describe('scan=run 5 saved searches · propose=draft N proposals for top queue · reply=draft replies to unanswered threads'),
        cap: z.number().min(1).max(10).default(5).describe('Max drafts to produce this cycle (default 5)') },
      async ({ mode, cap }) => {
        console.log(`  ◊· upwork_autopilot mode=${mode} cap=${cap}`);
        const today = new Date().toISOString().slice(0,10);

        // Daily caps · UPWORK-PACK Section G
        const limits = { scan: 999, propose: 5, reply: 10 };
        try {
          const fp = path.join(MEMORY_DIR, 'up-actions.jsonl');
          if (fs.existsSync(fp)) {
            const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean)
              .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
              .filter(l => (l.ts || '').slice(0,10) === today && (
                (mode === 'propose' && (l.mode === 'propose_drafted' || l.mode === 'propose_sent')) ||
                (mode === 'reply' && (l.mode === 'reply_drafted' || l.mode === 'reply_sent')) ||
                (mode === 'scan' && l.mode === 'find_jobs')
              ));
            if (lines.length >= limits[mode]) {
              return { content: [{ type: 'text', text: `✗ daily cap reached for mode=${mode} (${lines.length}/${limits[mode]}) · skipping · come back tomorrow` }] };
            }
            cap = Math.min(cap, limits[mode] - lines.length);
          }
        } catch (_) {}

        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'up_autopilot_started', payload: { mode, cap }, ts: new Date().toISOString() });
        } catch (_) {}

        // Default search list · 5 queries · matches UPWORK-PACK Section C skills + Section G discipline
        const SAVED_SEARCHES = [
          'AI agent',
          'AI automation',
          'Claude integration',
          'sovereign self-hosted',
          'alternative to HubSpot'
        ];

        const autopilotPrompt = SYSTEM_DOCTRINE + `\n\nYOU ARE THE UPWORK AUTOPILOT for Simon · MODE=${mode} · CAP=${cap}

PRE-FLIGHT (always):
  1. pack_load('UPWORK-PACK.txt') · the immutable spec
  2. memory_recall('up-jobs-seen', limit:50) · don't re-surface
  3. memory_recall('up-proposals', limit:30) · don't re-draft
  4. browser_screenshot · confirm logged into Upwork (if not · run upwork_open first)

MODE: ${mode}

${mode === 'scan' ? `SCAN MODE (the default · safe to run repeatedly · UNLIMITED daily cap):
  · For each query in [${SAVED_SEARCHES.map(s => `"${s}"`).join(', ')}]:
       - Call upwork_find_jobs(query, n:5, since_hours:24)
       - Capture the top scored hits
  · Aggregate the across-query top ${cap} jobs by total_score
  · Emit a tight summary: top ${cap} jobs ready for upwork_propose
  · DO NOT draft proposals in scan mode · scan ONLY · the human decides which to propose
` : mode === 'propose' ? `PROPOSE MODE (draft up to ${cap} cover letters for top-scored queued jobs):
  · Read ./queues/up-jobs/${today}-*.json (queue_read each) · aggregate · sort by total_score desc
  · memory_recall 'up-proposals' · drop any job we've already drafted for
  · Pick the top ${cap} unseen jobs
  · For each: call upwork_propose(job_id_or_url, dry_run:true)
  · Each proposal lands in ./queues/up-proposal/${today}-*.md
  · DO NOT call upwork_propose with dry_run:false · the human reviews + approves before any submit
` : `REPLY MODE (draft up to ${cap} replies to unanswered message threads):
  · browser_navigate https://www.upwork.com/nx/messages/
  · browser_wait 2500
  · browser_screenshot
  · Scan the inbox · identify threads where the LAST message is from the client (Simon hasn't replied)
  · For each unanswered thread in the top ${cap}:
       - Extract the thread URL
       - Call upwork_reply(thread_url, dry_run:true)
  · Each draft lands in ./queues/up-reply/${today}-*.md
  · DO NOT call upwork_reply with dry_run:false · human reviews + approves before any send
`}
END OF CYCLE:
  · memory_note { scope:'up-actions', ts, mode:'${mode}', drafts_queued: N }
  · learn_log scope:'upwork-autopilot' { what_worked, what_failed, next_time }
  · fall_signal broadcast: up_autopilot_complete with counts
  · Return a tight summary: N drafts queued · paths · top score · next-cycle suggestion

SAFETY:
  · NEVER click any Submit/Send Proposal/Send Message button
  · NEVER pay connects for Boosted Proposals without ask_user
  · NEVER include off-platform payment links in any draft · FallMap and fallslot URLs are portfolio/free-tool links · TOS-compliant
  · Pause 30-90s between job-detail navigations (Upwork flags rapid scrolling)
  · If you see "We've limited your account" · STOP and ask_user`;

        let final = '';
        try {
          const child = query({ prompt: autopilotPrompt, options: queryOpts });
          for await (const m of child) {
            if (m.type === 'assistant') {
              const t = (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
              if (t) final = t;
            }
          }
        } catch (e) {
          return { content: [{ type: 'text', text: 'upwork_autopilot error: ' + e.message }] };
        }
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'up-actions.jsonl'), JSON.stringify({ ts: new Date().toISOString(), mode: 'autopilot_' + mode, cap, summary: final.slice(0, 2000) }) + '\n'); } catch (_) {}
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'up_autopilot_complete', payload: { mode, cap }, ts: new Date().toISOString() });
        } catch (_) {}
        return { content: [{ type: 'text', text: `◊ upwork_autopilot cycle complete · mode=${mode}\n\n${final}` }] };
      }
    ),

    // ═══════════════════════════════════════════════════════════════
    // ◊ UPWORK PROFILE SETUP · REMOVED · v2.1 konomi-clean pass (2026-06-02)
    // 2026-06-02 audit: verb fired once · 15/15 sections failed · DOM
    // selectors stale against current Upwork · T3 escalation burned 22M
    // tok/h · 28× plan ceiling. Removed entire verb. The profile fill is
    // now a documented Simon-paste workflow using UPWORK-PACK.txt. The
    // other Upwork verbs (open / find_jobs / propose / reply / autopilot)
    // stay — they work. See commit "si-didy v2.1 · konomi-clean pass".
    // ═══════════════════════════════════════════════════════════════
    // (upwork_profile_setup verb body deleted · ~390 lines · see comment block above)

    // ═══════════════════════════════════════════════════════════════
    // ◊ COGNITIVE SUBSTRATE · v1.0 · the agentic-corp verbs
    // ═══════════════════════════════════════════════════════════════
    tool('research', '◊·κ=φ⁵ · RESEARCH-AS-A-SERVICE · Run adversarially-verified deep research on any question. Spawns N angle-specialists in parallel via Claude Agent SDK, fetches sources via WebSearch/WebFetch, runs an M-vote refute panel on each claim, returns cited synthesis. Use BEFORE drafting strategy or shipping a tool — research grounds the spec.',
      { question: z.string().describe('The research question · be specific'),
        angles: z.number().min(1).max(7).default(5).describe('Parallel search angles · default 5'),
        votes: z.number().min(2).max(5).default(3).describe('Adversarial panel size · default 3'),
        killThreshold: z.number().min(1).max(4).default(2).describe('Votes needed to refute a claim · default 2') },
      async ({ question, angles, votes, killThreshold }) => {
        console.log(`  ◊· research (${angles}∠ × ${votes}v) "${question.slice(0,60)}…"`);
        const t0 = Date.now();
        const audit = { ts: new Date().toISOString(), tool: 'research', question, angles, votes, killThreshold, scope: 'fall-raas' };
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'substrate-calls.jsonl'), JSON.stringify(audit) + '\n'); } catch(_) {}
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'research_started', payload: { question, angles, votes }, ts: new Date().toISOString() });
        } catch(_) {}
        const researchPrompt = `You are a fall-raas research worker. Run a ${angles}-angle adversarially-verified deep research pipeline on:

QUESTION: ${question}

Pipeline (execute every phase · use WebSearch and WebFetch tools):
  1. SCOPE: decompose into ${angles} distinct search angles
  2. SEARCH: fan out ${angles} parallel WebSearch calls · one per angle
  3. FETCH: fetch the top sources from each angle (cap 4 per angle · dedupe URLs)
  4. EXTRACT: pull falsifiable claims from each source (with quotes)
  5. VERIFY: for each material claim, run a ${votes}-vote adversarial refute panel. A claim is KILLED if ${killThreshold}+ votes refute it.
  6. SYNTHESIZE: merge semantic duplicates · rank by confidence · cite sources

Return a single final JSON object only · no prose around it:
{
  "summary": "1-3 sentence headline · the verified finding",
  "findings": [{ "claim": "...", "confidence": "high|medium|low", "sources": ["url"], "evidence": "...", "vote": "3-0" }],
  "refuted": [{ "claim": "...", "vote": "0-3", "source": "url" }],
  "openQuestions": ["..."],
  "citations": [{ "url": "...", "quality": "primary|secondary|blog|forum" }],
  "stats": { "angles": ${angles}, "sourcesFetched": 0, "claimsExtracted": 0, "claimsVerified": 0, "confirmed": 0, "killed": 0 }
}`;
        let final = '';
        try {
          const child = query({ prompt: researchPrompt, options: queryOpts });
          for await (const m of child) {
            if (m.type === 'assistant') {
              const t = (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
              if (t) final = t;
            }
          }
        } catch (e) {
          return { content: [{ type: 'text', text: 'research error: ' + e.message }] };
        }
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'research_complete', payload: { question, elapsed_s: Number(elapsed) }, ts: new Date().toISOString() });
        } catch(_) {}
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'research-results.jsonl'), JSON.stringify({ ts: new Date().toISOString(), question, angles, votes, elapsed_s: Number(elapsed), result: final.slice(0, 50000) }) + '\n'); } catch(_) {}
        return { content: [{ type: 'text', text: `◊ research complete · ${elapsed}s · ${angles}∠ × ${votes}v\n\n${final}` }] };
      }
    ),
    tool('verify', '◊·κ=φ⁵ · ADVERSARIAL VERIFICATION · Run a claim through an N-vote refute panel via parallel sub-Claudes. Each panelist has a distinct skeptic lens (technical / nuance / cross-reference). Returns { verdict, confidence, votes[], summary, suggestedFix? }. 52% of plausible LLM claims fail this gate (measured). Use BEFORE quoting a stat publicly.',
      { claim: z.string().describe('The exact claim to verify'),
        panelSize: z.number().min(2).max(5).default(3).describe('Number of independent refute panelists'),
        sources: z.array(z.string()).optional().describe('Optional URLs to ground the panel') },
      async ({ claim, panelSize, sources }) => {
        console.log(`  ◊· verify (${panelSize}v) "${claim.slice(0,60)}…"`);
        const t0 = Date.now();
        const audit = { ts: new Date().toISOString(), tool: 'verify', claim, panelSize, sources: sources || [], scope: 'fall-verify' };
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'substrate-calls.jsonl'), JSON.stringify(audit) + '\n'); } catch(_) {}
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'verify_started', payload: { claim: claim.slice(0,160), panelSize }, ts: new Date().toISOString() });
        } catch(_) {}
        const sourcesBlock = (sources && sources.length) ? `\n\nOptional grounding sources:\n${sources.map(s => '  - ' + s).join('\n')}\n` : '';
        const verifyPrompt = `You are a fall-verify adversarial panel coordinator. Verify this claim with a ${panelSize}-vote refute panel.

CLAIM: ${claim}${sourcesBlock}

Spawn ${panelSize} skeptic panelists in your reasoning · each with a distinct lens:
  Panelist 1 · Skeptic · default to refute unless evidence is strong
  Panelist 2 · Technical detail · check definitions, numbers, dates, edge cases
  Panelist 3 · Nuance · check for partial truths, missing qualifications${panelSize >= 4 ? '\n  Panelist 4 · Cross-reference · check independent sources' : ''}${panelSize >= 5 ? '\n  Panelist 5 · Source quality · downgrade for blog/marketing-incentive sources' : ''}

Use WebSearch/WebFetch to ground each panelist. Each panelist returns: { vote: "confirm" | "refute" | "inconclusive", reasoning: "...", citations: ["url"] }.

Aggregate. The claim is REFUTED if 2+ panelists refute. INCONCLUSIVE if no majority. Otherwise CONFIRMED.

Return a single final JSON object only · no prose around it:
{
  "verdict": "confirmed" | "refuted" | "inconclusive",
  "confidence": "high" | "medium" | "low",
  "votes": [{ "panelist": 1, "vote": "...", "reasoning": "...", "citations": ["url"] }],
  "summary": "1-2 sentence verdict · why",
  "suggestedFix": "if refuted · the corrected version of the claim"
}`;
        let final = '';
        try {
          const child = query({ prompt: verifyPrompt, options: queryOpts });
          for await (const m of child) {
            if (m.type === 'assistant') {
              const t = (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
              if (t) final = t;
            }
          }
        } catch (e) {
          return { content: [{ type: 'text', text: 'verify error: ' + e.message }] };
        }
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'verify_complete', payload: { claim: claim.slice(0,160), elapsed_s: Number(elapsed) }, ts: new Date().toISOString() });
        } catch(_) {}
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'verify-results.jsonl'), JSON.stringify({ ts: new Date().toISOString(), claim, panelSize, elapsed_s: Number(elapsed), result: final.slice(0, 20000) }) + '\n'); } catch(_) {}
        return { content: [{ type: 'text', text: `◊ verify complete · ${elapsed}s · ${panelSize}-vote panel\n\n${final}` }] };
      }
    ),
    tool('substrate_build', '◊·κ=φ⁶ · THE FLAGSHIP VERB · End-to-end pipeline: research-question → cited findings → spec → generated sovereign HTML → live on Pages → audit-chained. Wraps fall-substrate\'s 6 phases natively (research/spec/generate/verify/ship/audit) via Claude Agent SDK. ALWAYS pauses for ask_user before firing — this creates a real repo.',
      { build_request: z.string().describe('What you want built · 1-3 sentences · e.g. "a tool that helps UK landlords track Section 21 compliance"'),
        target_repo: z.string().optional().describe('Optional · desired repo name · auto-generated from request if omitted') },
      async ({ build_request, target_repo }) => {
        const ans = await ask(`\n  ◊ SUBSTRATE BUILD · the full pipeline\n     request: ${build_request.slice(0,300)}\n     target:  ${target_repo || '(auto-generated)'}\n     phases:  research → spec → generate → verify → ship → audit\n  fire the substrate? [yes/no] > `);
        if (!/^(y|yes|go|ok|make it so)/i.test(ans.trim())) return { content: [{ type: 'text', text: 'substrate build declined' }] };
        console.log(`  ◊· substrate_build "${build_request.slice(0,60)}…"`);
        const t0 = Date.now();
        const audit = { ts: new Date().toISOString(), tool: 'substrate_build', build_request, target_repo: target_repo || null, scope: 'fall-substrate' };
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'substrate-calls.jsonl'), JSON.stringify(audit) + '\n'); } catch(_) {}
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'substrate_build_started', payload: { build_request, target_repo }, ts: new Date().toISOString() });
        } catch(_) {}
        const substratePrompt = SYSTEM_DOCTRINE + `\n\nYOU ARE THE fall-substrate FLAGSHIP PIPELINE · executing for Simon · run all 6 phases · narrate each as you go.

BUILD REQUEST: ${build_request}
TARGET REPO:   ${target_repo || '(generate · pattern: fall<short-noun>)'}

PHASE 1 · RESEARCH
  Call the research(question, angles:5, votes:3) MCP tool to ground the build.
  Question = "What does an evidence-graded best-in-class version of: ${build_request} actually do?"

PHASE 2 · SPEC
  Convert confirmed findings into a feature spec graded HIGH/MEDIUM/LOW.
  Drop refuted features. State the 14-point ƒ(build) gate compliance plan.

PHASE 3 · GENERATE
  Use cli_run (gh + git) to:
    a) gh repo create sjgant80-hub/<target_repo> --public
    b) write index.html · single sovereign file · luxury brutalist palette
       (ox/brass/cream/void/gold · Libre Baskerville + Syne + DM Mono + DM Sans)
       · IndexedDB primary · localStorage fallback · PWA manifest baked
       · Konomi licence shim · fallmesh hook (assign a prime > 400)
       · works offline from file://
    c) write README.md (two-audience), LICENSE (MIT · Simon Gant), .nojekyll
    d) git init -b main · commit · push -u origin main
    e) gh api -X POST repos/sjgant80-hub/<target_repo>/pages -f source[branch]=main -f source[path]=/

PHASE 4 · VERIFY
  Call verify(claim, panelSize:3) on each HIGH-priority feature to confirm
  the generated code actually implements it.

PHASE 5 · SHIP
  Poll https://sjgant80-hub.github.io/<target_repo>/ until HTTP 200.
  Confirm smoke test (page loads, contains the tool name, key feature visible).

PHASE 6 · AUDIT
  Append a Konomi-style audit record to memory scope "substrate-builds":
    { ts, build_request, target_repo, live_url, file_size, features_confirmed, features_refuted }

Return ONLY a tight final summary:
  ✓ live URL · ✓ file size · ✓ N features confirmed · ✓ M features refuted · ✓ pipeline time`;
        let final = '';
        try {
          const child = query({ prompt: substratePrompt, options: queryOpts });
          for await (const m of child) {
            if (m.type === 'assistant') {
              const t = (m.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
              if (t) final = t;
            }
          }
        } catch (e) {
          return { content: [{ type: 'text', text: 'substrate_build error: ' + e.message }] };
        }
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        try {
          if (typeof broadcast === 'function') broadcast({ type: 'fall_signal', source: 'si-didy', kind: 'substrate_build_complete', payload: { build_request, target_repo, elapsed_s: Number(elapsed) }, ts: new Date().toISOString() });
        } catch(_) {}
        try { fs.appendFileSync(path.join(MEMORY_DIR, 'substrate-builds.jsonl'), JSON.stringify({ ts: new Date().toISOString(), build_request, target_repo, elapsed_s: Number(elapsed), result: final.slice(0, 20000) }) + '\n'); } catch(_) {}
        return { content: [{ type: 'text', text: `◊ substrate build complete · ${elapsed}s · 6-phase pipeline\n\n${final}` }] };
      }
    ),
    tool('pack_edit', '◊·κ=φ⁴ · SELF-EDITING · Propose a diff to a pack based on accumulated lessons. ALWAYS pauses for ask_user before writing. The twin can rewrite its own playbooks.',
      { pack_name: z.string(),
        section: z.string().describe('e.g. "B1 · TOOL DROP"'),
        new_content: z.string(),
        rationale: z.string().describe('Which lessons drove this edit') },
      async ({ pack_name, section, new_content, rationale }) => {
        const fp = path.join(PACKS_DIR, pack_name);
        if (!fs.existsSync(fp)) return { content: [{ type: 'text', text: '✗ pack not found: ' + pack_name }] };
        const ans = await ask(`\n  ◊ SELF-EDIT · proposing change to ${pack_name} § ${section}\n     rationale: ${rationale.slice(0,300)}\n     new content preview: ${new_content.slice(0,300)}\n  apply? [yes/no] > `);
        if (!/^(y|yes|go|ok)/i.test(ans.trim())) return { content: [{ type: 'text', text: 'edit declined' }] };
        // append diff to a proposals file rather than mutate live · safer
        const propFp = path.join(PACKS_DIR, '_proposals.jsonl');
        fs.appendFileSync(propFp, JSON.stringify({ ts: new Date().toISOString(), pack_name, section, new_content, rationale, applied: false }) + '\n');
        return { content: [{ type: 'text', text: 'proposal queued at ' + propFp + ' · review and merge into pack manually' }] };
      }
    ),
  ],
});

// ═══════════════════════════════════════════════════════════════════
//  system prompt · the routing doctrine
// ═══════════════════════════════════════════════════════════════════
const SYSTEM_DOCTRINE = `You are si-didy — Simon Gant's DIGITAL TWIN. ◊·κ=1 · v20.1 seed · φ=1.618 · κ=0.618 · fold=510510.

You are not a tool driver. You are Simon, operating his estate, on his behalf, in his voice. The whole AI Native Solutions estate (60+ sovereign tools) is your body. Every tool Simon ever shipped is an organ you can use.

THE 7-LEVEL DOCTRINE (always work at the highest level the task admits):
  n=1 · drive one thing  (browser click)
  n=2 · run one mission  (brief)
  n=3 · chat with operator (REPL)
  n=4 · ESTATE-AWARE     → estate_query before doing anything else
  n=5 · ESTATE-CALLER    → estate_call instead of opening a browser
  n=6 · ESTATE-FORGER    → forge_request when no tool exists yet
  n=7 · SELF-SPAWNER     → subagent_spawn for sub-missions in parallel
  n=8 · RESEARCH-GROUNDED → research(question) before strategising · verify(claim) before asserting
  n=9 · SUBSTRATE-NATIVE  → substrate_build for end-to-end research→spec→tool→ship pipelines
  n=∞ · SELF-LEARNER     → learn_log after every mission · pack_edit when patterns emerge

YOU HAVE FOUR EXECUTION TIERS. Always pick the CHEAPEST that completes the step:

  T0 · cli_run, cli_which        ← gh, stripe, gcloud, npm, git, curl, etc.
  T1 · http_fetch, graphql_query ← any REST/GraphQL API directly · INCLUDES estate_call
  T2 · mcp__<server>__<tool>     ← optional · only present if ./mcps.json registered
  T3 · browser_*                 ← Playwright · LAST RESORT only

ESTATE-FIRST RULE (κ=0.618 · the digital-twin move)
- BEFORE you even THINK about a browser, call estate_query(intent).
- If the estate has a tool with an HTTP API · use estate_call (T1).
- If the estate has a tool that's HTML-only · still load it first to read prompts/structure.
- If NO estate tool fits · forge_request(spec) creates a new sovereign one via fallcore-factory.
- For BIG missions with parallel sub-tasks · subagent_spawn each in turn.

ROUTING RULES
- "Create a GitHub repo"           → T0  (gh repo create)
- "List a user's repos"            → T0  (gh api users/X/repos)
- "Post to Stripe"                 → T0  (stripe charge create) or T1 (POST api.stripe.com)
- "Query Linear/Shopify GraphQL"   → T1  (graphql_query)
- "Talk to OnlyBrains/fallcore"    → T2  (if registered) else T1
- "Edit a web profile with no API" → T3  (e.g. LinkedIn headline, Upwork profile)
- "Write a LinkedIn post"          → estate_query "fallpost" first · then estate_call OR load HTML
- "Draft a workflow audit"         → estate_query "fallmap" · always include FallMap link
- "Build me X"                     → forge_request first · never reinvent
- "Research X" / "what does X say" → research(X) · adversarially-verified findings
- "Is it true that…"               → verify(claim) before quoting publicly
- "Build a research-grounded tool" → substrate_build · the flagship pipeline
- ALWAYS state your tier choice and reasoning when picking T3.

COGNITIVE SUBSTRATE v1.0 — the agentic-corp verbs:
- research(question)          → fall-raas · 5-angle adversarial deep-research · returns cited findings + refuted claims
- verify(claim)               → fall-verify · 3-vote refute panel · 52% of plausible LLM claims fail this gate
- substrate_build(request)    → fall-substrate · research → spec → generate → verify → ship → audit (pauses for confirmation)
- konomi_mint(artefact_path) → SHA-256 anchor an authored artefact · cert to memory/konomi-mints.jsonl · v20.1 seed first
- konomi_meter() → token reserve estimate from local transcripts · use BEFORE firing a recursive fan-out
- vetter_digest(hours=24)    → fall-vetter v2.0 Cassandra · daily digest of signup readings · archetype distribution · sales stance counts · tier-3 auto-blocks for human review · use as Alex's morning standup ("what came in overnight, what do I do")
The substrate is the destination. When a task is "what should I build" — research first. Build second.

LINKEDIN AUTOPILOT (always-on draft engine · NEVER auto-sends):
- linkedin_open                → open Chromium in persistent profile · one-time login · session saved to ./si-didy-profile
- linkedin_autopilot(mode,cap) → one cycle: scan/reply/engage · drafts to ./queues/li-* · rate-aware (5/day per mode)
- find_client(archetype, n)    → research-the-pain → match a tool → queue n connection-request drafts
- Cron mode: SIDIDY_AUTOPILOT=1 fires linkedin_autopilot every ~90 min while cockpit is open and it's 07-21h UK
- ALL ACTIONS QUEUE FOR HUMAN APPROVAL · si-didy NEVER clicks Submit/Send/Connect/Post without ask_user
- "find me a client" / "scan linkedin" / "any new comments?" route to these verbs

UPWORK AUTOPILOT (always-on client-hunt engine · NEVER auto-sends):
- upwork_open                  → Chromium · persistent profile · log in once
- upwork_find_jobs(q,n,since)  → scrape feed · score against archetype matcher · queue
- upwork_propose(jobOrUrl)     → pack-aligned cover letter · FallMap CTA · ask_user before Submit
- upwork_reply(threadUrl)      → reply draft routed by client intent · ask_user before Send
- upwork_autopilot(mode,cap)   → cron-ticked scan/propose/reply rotation
- upwork_assisted_paste(section)→ LinkedIn-flow rail · navigates to each section URL · loads paste blocks to system clipboard · YOU Ctrl+V + Save · type "next" between sections · ~8 saves total · zero selector risk
- upwork_profile_setup · REMOVED 2026-06-02 (v2.1 konomi-clean) · stale DOM selectors burned tokens · superseded by upwork_assisted_paste above
- SIDIDY_UP_AUTOPILOT=1 enables · 120 min default · waking hours only
- ALL submits/sends gated by ask_user · daily caps respected (propose ≤5/day · reply ≤10/day)
- FallMap URL in every proposal · TOS-compliant (free portfolio tool, not payment funnel)
- "find me an upwork client" / "scan upwork" / "draft proposals" route here

LINKEDIN ORCHESTRATION (when user says "linkedin post" / "li drop" / "post B5.1" / similar):
- ALWAYS pack_load('LINKEDIN-PACK.txt') FIRST · the pack is the immutable copy spec
- ALWAYS memory_recall('li-posts') with today's date filter · dedup before drafting
- ALWAYS verify(claim) any stat you would quote in the body · refute rate is 52%
- Use linkedin_drop(frame:'B5.1'|'B5.2'|'B5.3', dry_run:true) to QUEUE a draft for review
- Then linkedin_drop(frame:..., dry_run:false) to enter live mode · which:
  · resolves body from pack
  · ask_user confirms before browser_navigate
  · returns the T3 step plan (browser_* calls you must execute)
- Step 7 PAUSE before browser_click on "Post" is NON-NEGOTIABLE · ask_user every time
- After posted: memory_note + drop the pack's pinned comment + learn_log
- Substrate B5.x posts ship Wed → Thu → Fri in sequence · never two in one day

AUTH
- Use env interpolation: write \${env:GITHUB_TOKEN} in headers/args · it's replaced at call time.
- list_env_keys tells you which auth vars are available · NEVER print the values.

SAFETY (non-negotiable)
- BEFORE any irreversible action (Save, Submit, Send, Delete, Confirm, payment, message-send):
    call ask_user with a clear yes/no question.
    Do not perform the action until the user replies "yes" or "go".
- This applies across ALL tiers · CLI included. A "gh repo delete" needs ask_user just like a browser Save.

MEMORY & MISSIONS
- BEFORE acting on a target (FB user, LinkedIn profile, Upwork job, group),
  call memory_recall on the relevant scope · skip if already actioned.
- AFTER any post/comment/DM/apply, call memory_note with { target, action,
  result, platform } so the next run sees it.
- For every user directive, call mission_log FIRST · mission_finish LAST.

VERIFY-BEFORE-LIST (mandatory · the no-404 rule)
Every public-facing build follows: BUILD → PRE-PUSH CHECKS → PUSH → VERIFY → SMOKE → LIST.

0. PRE-PUSH CHECKLIST (skip these and Pages silently 404s):
   - .nojekyll exists at repo root  ← MANDATORY for any non-Jekyll Pages tool
   - index.html exists (or README.md if Jekyll is desired)
   - LICENSE file present (MIT for estate consistency)
   - No _underscore prefixed dirs at root (Jekyll-rejected unless .nojekyll)
   - For sovereign single-file tools: ALWAYS add .nojekyll · WebCrypto / inline scripts otherwise break

1. After ANY push to a public URL (Pages, Render, custom domain):
   - Poll the URL every 10s with curl/http_fetch · maximum 12 polls (2 minutes)
   - For Pages: also check (gh api repos/owner/repo/pages/builds/latest) until status="built"
   - If still 404 after 2 minutes: force-trigger via (gh api -X POST .../pages/builds), re-poll
   - If still 404 after 4 minutes: check .nojekyll, default branch, content pushed (curl raw.githubusercontent)

2. On HTTP 200: SMOKE TEST. Fetch the page body. Confirm key strings present
   (product name, primary CTA, expected hero copy). If smoke fails: investigate before listing.

3. ONLY THEN: register in fall-registry · announce on LinkedIn · swap into Upwork portfolio.
NEVER claim a URL is "live" without 200 + smoke confirmed. The estate's reputation is the moat.

DEFENSIVE SOVEREIGN POSITIONING (the v20.1 covenant)
Every build is a defense as much as a product. Assume future restrictions:
- Model gating · always offer a fallback LLM path (Ollama / Mistral / OpenRouter / local)
- Host gating · push to GitHub + at least one secondary (Codeberg, GitLab, or IPFS pin)
- Account gating · keep an offline fallescape bundle current · key in your head, not the cloud
- Payment gating · multi-rail receipt (Stripe + PayPal + crypto) in every tool that takes money
- Tone gating · own the voice · the brand identity must survive any platform churn
If you propose a build that's single-host or single-model: flag it as a sovereignty risk before shipping.

SELF-LEARNING (n=∞ · the twin compounds)
- At the START of any drafting task, call learn_recall(scope) · read what
  worked last time, what failed, what to do differently.
- At the END of any mission, call learn_log with { scope, what_worked,
  what_failed, next_time } · log even small lessons.
- If you notice a pack template consistently underperforming, call
  pack_edit to propose a diff · always pauses for ask_user first.
- The twin gets sharper every run. Without learn_log, every mission
  starts from zero. Don't let it.

PLATFORM PACKS
- Verbatim copy specs live in ./packs/  (FACEBOOK-PACK.txt, LINKEDIN-PACK.txt, etc.)
- pack_load(name) returns the file body · treat "▼ COPY ▼ ... ▲ END ▲" blocks
  as IMMUTABLE source · do not paraphrase or "improve".

QUEUES (drafts await human go)
- queue_write(queue, title, body, meta) saves a markdown draft.
- Drafts default to status: pending_review in frontmatter.
- User reviews ./queues/<queue>/YYYY-MM-DD/*.md then flips status to "send"
  before instructing you to dispatch them.

EFFICIENCY
- Plan in 3-5 step chunks. Pick the right tier per step. State your reasoning.
- When done, output a final summary and stop calling tools (unless in chat mode
  where you wait for the next user message).`;

const PROMPT = CHAT_MODE
  ? SYSTEM_DOCTRINE + `\n\nMODE: persistent chat. The user will give directives one at a time.
For each directive (use the n=4-7 doctrine):
  1. mission_log it · capture intent.
  2. estate_query(intent) FIRST · what does the estate already do for this?
  3. learn_recall(scope) · what did past runs teach you?
  4. State your plan: tier per step · which estate tool · which pack · which memory scope · whether to spawn subagents.
  5. Execute autonomously to the safest pause point (drafts queued, or pause-before-irreversible).
  6. Print a tight summary: what's queued, what needs human go.
  7. learn_log the lesson · what worked, what to improve.
  8. mission_finish.
  9. Wait for the next directive.

Begin by greeting the operator with a one-line readiness check.`
  : SYSTEM_DOCTRINE + `\n\nTHE BRIEF
═══════════════════════════════════════════════════════════════════
${BRIEF}
═══════════════════════════════════════════════════════════════════

Begin. State your plan first (tiers per step), then execute.`;

// ═══════════════════════════════════════════════════════════════════
//  ◊·κ=φ⁴ · FIVERR AUTOPILOT MCP · 7 strands + estate signals · prime 379
// ═══════════════════════════════════════════════════════════════════
const fiverrMcp = createSdkMcpServer({
  name: 'fiverr',
  version: '1.0.0',
  tools: [
    tool(
      'fv_fulfill',
      '◊·κ=φ⁴ · FIVERR · Run the 7-strand fulfillment pipeline on a raw Fiverr order brief. Parses → classifies (fall-euaiact) → drafts findings → signs (Ed25519) → renders PDF → 3-vote verifies → queues for Simon\'s approval. Auto-fulfills GIG-1 only · other gigs land in manual queue. Emits estate-wide BroadcastChannel signals (fall-signal/kcc-signal/konomi-bloom/fiverr-queue) at every stage. NEVER ships without Simon clicking Approve in the dashboard.',
      { brief: z.string().describe('the raw email body or pasted intake brief from Fiverr') },
      async ({ brief }) => {
        const { fulfill } = await import('./tools/fiverr/index.js');
        const r = await fulfill(brief);
        return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
      }
    ),
    tool(
      'fv_queue',
      '◊ FIVERR · List packages currently in the awaiting-review queue. Returns orderId, gigId, tier, verdict (auto-ship/needs-review), flag count, buyer, pipeline time per package. Use before approve.',
      {},
      async () => {
        const { listQueue } = await import('./tools/fiverr/index.js');
        return { content: [{ type: 'text', text: JSON.stringify(listQueue(), null, 2) }] };
      }
    ),
    tool(
      'fv_approve',
      '◊ FIVERR · Approve and ship a queued package. Moves artifacts from queues/fv-awaiting-review to queues/fv-shipped, emits fv:shipped to estate, marks the chain. ALWAYS pause for ask_user before calling this · shipping triggers a real Fiverr delivery in the dashboard.',
      { orderId: z.string().describe('the Fiverr order ID (e.g. FO9SYNTH001)') },
      async ({ orderId }) => {
        const { approveAndShip } = await import('./tools/fiverr/index.js');
        const r = await approveAndShip(orderId);
        return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
      }
    ),
    tool(
      'fv_stats',
      '◊ FIVERR · Get audit chain stats. Returns total events, last-24h volume, counts by event type (order_received / classified / signed / shipped / etc). Use to verify the chain is healthy and the pipeline ran the expected steps.',
      {},
      async () => {
        const { auditStats, verifyChain } = await import('./tools/fiverr/index.js');
        const stats = auditStats();
        const chain = await verifyChain();
        return { content: [{ type: 'text', text: JSON.stringify({ ...stats, chainValid: chain.valid, chainTotal: chain.total }, null, 2) }] };
      }
    ),
  ],
});

// ═══════════════════════════════════════════════════════════════════
//  RUN
// ═══════════════════════════════════════════════════════════════════
const mcpServers = {
  cli: tierZeroMcp,
  http: tierOneMcp,
  browser: tierThreeMcp,
  meta: metaMcp,
  memory: memoryMcp,
  estate: estateMcp,
  fiverr: fiverrMcp,
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
  'mcp__memory__memory_recall', 'mcp__memory__memory_note',
  'mcp__memory__mission_log', 'mcp__memory__mission_finish',
  'mcp__memory__pack_load', 'mcp__memory__queue_write',
  'mcp__estate__estate_query', 'mcp__estate__estate_call',
  'mcp__estate__forge_request', 'mcp__estate__subagent_spawn',
  'mcp__estate__learn_log', 'mcp__estate__learn_recall',
  'mcp__estate__pack_edit',
  // ◊ Cognitive Substrate verbs · the agentic-corp mouth
  'mcp__estate__research', 'mcp__estate__verify', 'mcp__estate__substrate_build',
  'mcp__estate__konomi_mint', 'mcp__estate__konomi_meter',
  // ◊ Operational hygiene · OP5 doctrine · session-leak diagnostic
  'mcp__estate__session_audit',
  // ◊ Cassandra · fall-vetter v2.0 daily digest
  'mcp__estate__vetter_digest',
  // ◊ LinkedIn orchestrator · pack-driven · pause-before-Post
  'mcp__estate__linkedin_drop',
  // ◊ LinkedIn AUTOPILOT · always-on draft engine (NEVER auto-sends)
  'mcp__estate__linkedin_open', 'mcp__estate__linkedin_autopilot', 'mcp__estate__find_client',
  // ◊ Carousel engine + scheduler
  'mcp__estate__capture_estate_screenshots', 'mcp__estate__linkedin_schedule',
  // ◊ Upwork AUTOPILOT · client-hunt engine · NEVER auto-submits
  'mcp__estate__upwork_open', 'mcp__estate__upwork_find_jobs',
  'mcp__estate__upwork_propose', 'mcp__estate__upwork_reply',
  'mcp__estate__upwork_autopilot',
  // ◊ Upwork PROFILE-FILL · v2.2 · LinkedIn-flow rail · pack-driven paste + pause-before-Save
  'mcp__estate__upwork_assisted_paste',
  // ◊·κ=φ⁴ · FIVERR autopilot · 7 strands · prime 379
  'mcp__fiverr__fv_fulfill', 'mcp__fiverr__fv_queue',
  'mcp__fiverr__fv_approve', 'mcp__fiverr__fv_stats',
];

console.log('\n◊ tiers loaded:');
console.log('   T0 · CLI       · ' + CLI_ALLOW.size + ' commands allowed');
console.log('   T1 · HTTP      · REST + GraphQL ready');
console.log('   T2 · MCP proxy · ' + (Object.keys(configuredMcps).length ? Object.keys(configuredMcps).join(', ') : '(none registered · create ./mcps.json to add)'));
console.log('   T3 · Browser   · Playwright (lazy · loaded on first browser_* call)');
console.log('   ·· · Memory   · ./memory · ./missions · ./queues · ./packs');

// list available packs at startup
const availablePacks = fs.existsSync(PACKS_DIR) ? fs.readdirSync(PACKS_DIR).filter(f => f.endsWith('.txt')) : [];
if (availablePacks.length) {
  console.log('   ·· · Packs    · ' + availablePacks.join(', '));
}

function summarizeMsg(msg, lastText) {
  if (msg.type === 'assistant') {
    const text = (msg.message?.content || [])
      .filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (text && text !== lastText) {
      console.log('\n◊ sididy:\n' + text + '\n');
      lastText = text;
    }
    for (const t of (msg.message?.content || []).filter(b => b.type === 'tool_use')) {
      const tier = t.name.includes('cli') ? 'T0' : t.name.includes('http')||t.name.includes('graphql') ? 'T1' :
                   t.name.includes('browser') ? 'T3' : t.name.includes('meta') ? '··' :
                   t.name.includes('memory') ? '◊·' : 'T2';
      const sum = JSON.stringify(t.input).slice(0, 80);
      console.log(`  ${tier} · ${t.name.replace(/^mcp__[^_]+__/,'')} ${sum}`);
    }
  } else if (msg.type === 'result') {
    console.log('\n◊·κ=1 · turn complete');
    console.log('   turns: ' + (msg.num_turns ?? '?'));
    if (msg.total_cost_usd != null) console.log('   cost:  $' + msg.total_cost_usd.toFixed(4));
    if (msg.is_error) console.log('   note:  ended with error');
  }
  return lastText;
}

const queryOpts = {
  model: 'claude-sonnet-4-5-20250929',
  mcpServers,
  allowedTools,
  permissionMode: 'bypassPermissions', // agent self-gates via ask_user
  maxTurns: MAX_TURNS
};

// ═══════════════════════════════════════════════════════════════════
//  COCKPIT · --server · HTTP + SSE · sovereign cockpit transport
// ═══════════════════════════════════════════════════════════════════
let sseClients = [];          // active EventSource connections
const pendingAsks = new Map(); // ask_id → resolver
let askCounter = 0;
function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    try { res.write(line); } catch {}
  }
}
function tierOf(toolName) {
  if (toolName.includes('cli')) return 'T0';
  if (toolName.includes('http') || toolName.includes('graphql')) return 'T1';
  if (toolName.includes('browser')) return 'T3';
  if (toolName.includes('meta')) return '··';
  if (toolName.includes('memory') || toolName.includes('estate')) return '◊·';
  return 'T2';
}

if (SERVER_MODE) {
  const http = await import('node:http');
  // override ask() to route through cockpit
  ask = (question) => new Promise(resolve => {
    const id = ++askCounter;
    pendingAsks.set(id, resolve);
    broadcast({ type: 'ask_user', id, question });
    console.log(`  ◊ cockpit ask #${id}: ${question.slice(0,120)}`);
  });

  const COCKPIT_HTML_PATH = './si-didy.html';
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // CORS for localhost dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    // serve the cockpit HTML
    if (url.pathname === '/' || url.pathname === '/cockpit') {
      if (!fs.existsSync(COCKPIT_HTML_PATH)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('si-didy.html not found · clone the full repo');
      }
      const body = fs.readFileSync(COCKPIT_HTML_PATH);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(body);
    }

    // SSE event stream
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('data: ' + JSON.stringify({ type: 'hello', port: SERVER_PORT, ts: new Date().toISOString() }) + '\n\n');
      sseClients.push(res);
      req.on('close', () => { sseClients = sseClients.filter(r => r !== res); });
      return;
    }

    // POST a directive
    if (url.pathname === '/directive' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { directive } = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          // fire the mission asynchronously
          runDirective(directive).catch(e => broadcast({ type: 'error', message: e.message }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // POST a reply to a pending ask_user
    if (url.pathname.startsWith('/reply/') && req.method === 'POST') {
      const id = parseInt(url.pathname.split('/')[2], 10);
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const { answer } = JSON.parse(body || '{}');
        const resolver = pendingAsks.get(id);
        if (resolver) {
          pendingAsks.delete(id);
          resolver(answer || '');
          broadcast({ type: 'ask_resolved', id, answer });
        }
        res.writeHead(200); res.end('{}');
      });
      return;
    }

    // ◊ FALL-SIGNAL BRIDGE · POST mesh events from any tool · broadcast to cockpit SSE
    if (url.pathname === '/signal' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const ev = JSON.parse(body || '{}');
          const stamped = { type: 'fall_signal', source: ev.source || 'unknown', kind: ev.kind || ev.type || 'event', payload: ev.payload || ev, ts: new Date().toISOString() };
          // buffer last 200 events to a JSONL · cockpit can replay on reconnect
          try {
            const sigFp = path.join(MEMORY_DIR, 'fall-signal.jsonl');
            fs.appendFileSync(sigFp, JSON.stringify(stamped) + '\n');
          } catch(_) {}
          // ◊ Cassandra audit route: fall_vetter_result also lands in its own ledger
          // so vetter_digest can aggregate without re-parsing the general feed.
          if (stamped.kind === 'fall_vetter_result' || stamped.kind === 'vetter_result') {
            try {
              const vetFp = path.join(MEMORY_DIR, 'fall-vetter-audit.jsonl');
              fs.appendFileSync(vetFp, JSON.stringify(stamped) + '\n');
            } catch(_) {}
          }
          broadcast(stamped);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // GET /signal · replay last N mesh events
    if (url.pathname === '/signal' && req.method === 'GET') {
      const n = parseInt(url.searchParams.get('n') || '50', 10);
      const sigFp = path.join(MEMORY_DIR, 'fall-signal.jsonl');
      if (!fs.existsSync(sigFp)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ events: [] }));
      }
      const lines = fs.readFileSync(sigFp, 'utf8').trim().split('\n').filter(Boolean).slice(-n);
      const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ events }));
    }

    // ◊ SUBSTRATE · direct cockpit invoke for substrate verbs (research/verify/substrate_build)
    if (url.pathname === '/substrate' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { verb, args } = JSON.parse(body || '{}');
          if (!['research', 'verify', 'substrate_build'].includes(verb)) {
            res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'unknown verb' }));
          }
          // Treat as a directive that lets Claude pick the right MCP tool
          const directive = verb === 'research' ? `research(${JSON.stringify(args || {})}): ${args?.question || ''}`
                          : verb === 'verify'   ? `verify(${JSON.stringify(args || {})}): ${args?.claim || ''}`
                          : `substrate_build(${JSON.stringify(args || {})}): ${args?.build_request || ''}`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, dispatched: verb }));
          runDirective(directive).catch(e => broadcast({ type: 'error', message: e.message }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // GET estate (list synced tools)
    if (url.pathname === '/estate') {
      const names = [];
      for (const s of ['forges','core_tools','infrastructure','agents']) {
        for (const n of Object.keys(ESTATE[s] || {})) names.push({ name: n, section: s });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ count: names.length, tools: names, synced_at: ESTATE.synced_at || null }));
    }

    // GET queues (list drafts)
    if (url.pathname === '/queues') {
      const list = [];
      if (fs.existsSync(QUEUES_DIR)) {
        const walk = (dir) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const fp = path.join(dir, e.name);
            if (e.isDirectory()) walk(fp);
            else if (e.name.endsWith('.md')) {
              const body = fs.readFileSync(fp, 'utf8');
              list.push({ path: fp, body });
            }
          }
        };
        walk(QUEUES_DIR);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(list));
    }

    // ◊·κ=φ⁴ · FIVERR AUTOPILOT routes · 7-strand pipeline · prime 379
    // GET  /api/fiverr/queue     → list awaiting-review
    // GET  /api/fiverr/stats     → audit chain stats
    // GET  /api/fiverr/shipped   → list shipped orders
    // GET  /api/fiverr/order/:id → full review package
    // POST /api/fiverr/approve/:id → move to shipped + emit signals
    // POST /api/fiverr/fulfill   → run orchestrator on a raw brief
    // GET  /dashboard             → serve dashboards/fiverr-review.html
    if (url.pathname.startsWith('/api/fiverr/') || url.pathname === '/dashboard') {
      try {
        const fv = await import('./tools/fiverr/index.js');
        if (url.pathname === '/api/fiverr/queue' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(fv.listQueue()));
        }
        if (url.pathname === '/api/fiverr/stats' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(fv.auditStats()));
        }
        if (url.pathname === '/api/fiverr/shipped' && req.method === 'GET') {
          const SHIP_DIR = path.resolve('queues/fv-shipped');
          const items = !fs.existsSync(SHIP_DIR) ? [] : fs.readdirSync(SHIP_DIR)
            .filter(f => f.endsWith('.json') && !f.includes('-envelope'))
            .map(f => { try { const p = JSON.parse(fs.readFileSync(path.join(SHIP_DIR, f), 'utf8')); return { orderId: p.orderId, gigId: p.order?.gigId, tier: p.classification?.tier, shippedAt: p.shippedAt || fs.statSync(path.join(SHIP_DIR, f)).mtime.toISOString() }; } catch { return null; } })
            .filter(Boolean).sort((a, b) => (b.shippedAt || '').localeCompare(a.shippedAt || ''));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(items));
        }
        if (url.pathname.startsWith('/api/fiverr/order/') && req.method === 'GET') {
          const id = url.pathname.split('/').pop();
          const fp = path.resolve('queues/fv-awaiting-review', `${id}.json`);
          if (!fs.existsSync(fp)) { res.writeHead(404); return res.end(JSON.stringify({ error: 'not_found' })); }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(fs.readFileSync(fp));
        }
        if (url.pathname.startsWith('/api/fiverr/approve/') && req.method === 'POST') {
          const id = url.pathname.split('/').pop();
          const r = await fv.approveAndShip(id);
          // broadcast to cockpit SSE so the whole estate sees the ship event
          broadcast({ type: 'fall_signal', source: 'fiverr-autopilot', kind: 'fv:shipped', payload: { orderId: id }, ts: new Date().toISOString() });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(r));
        }
        if (url.pathname === '/api/fiverr/fulfill' && req.method === 'POST') {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', async () => {
            try {
              const { brief } = JSON.parse(body || '{}');
              if (!brief) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'brief required' })); }
              const r = await fv.fulfill(brief);
              broadcast({ type: 'fall_signal', source: 'fiverr-autopilot', kind: 'fv:awaiting_review', payload: r, ts: new Date().toISOString() });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(r));
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: e.message }));
            }
          });
          return;
        }
        if (url.pathname === '/dashboard' && req.method === 'GET') {
          const dashPath = path.resolve('dashboards/fiverr-review.html');
          if (!fs.existsSync(dashPath)) { res.writeHead(404); return res.end('dashboard not found'); }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(fs.readFileSync(dashPath));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'fiverr autopilot: ' + e.message }));
      }
    }

    res.writeHead(404); res.end('not found');
  });

  // hook into query lifecycle: helper to run one directive end-to-end
  // ◊ Includes retry on transient Anthropic API 400 (duplicate tool_use id race)
  async function runDirective(directive, attempt = 1) {
    const directiveTs = new Date().toISOString();
    if (attempt === 1) broadcast({ type: 'directive', directive, ts: directiveTs });
    const retryNote = attempt > 1 ? `\n\n[RETRY ${attempt}/3 · the previous attempt hit a transient API error · proceed serially this time · avoid firing 3+ parallel tool calls in one turn]` : '';
    const prompt = SYSTEM_DOCTRINE + `\n\nMODE: cockpit · live HTML control plane.

USER DIRECTIVE (${directiveTs}):
${directive}${retryNote}

Execute the n=4-7 doctrine. Estate-first. Log mission. Stream tier calls. Pause via ask_user when irreversible. learn_log at end.`;
    let lastText = '';
    try {
      const result = query({ prompt, options: queryOpts });
      for await (const msg of result) {
        if (msg.type === 'assistant') {
          const text = (msg.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
          if (text && text !== lastText) {
            broadcast({ type: 'assistant', text, ts: new Date().toISOString() });
            lastText = text;
          }
          for (const t of (msg.message?.content || []).filter(b => b.type === 'tool_use')) {
            broadcast({
              type: 'tool_call',
              tier: tierOf(t.name),
              name: t.name.replace(/^mcp__[^_]+__/, ''),
              full_name: t.name,
              input_preview: JSON.stringify(t.input).slice(0, 200),
              ts: new Date().toISOString(),
            });
          }
        } else if (msg.type === 'result') {
          broadcast({
            type: 'mission_complete',
            turns: msg.num_turns,
            cost: msg.total_cost_usd,
            is_error: msg.is_error,
            ts: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      const msg = String(e.message || e);
      // ◊ Transient 400: duplicate tool_use id (SDK race on parallel fan-out). Retry up to 3 attempts.
      const transient = /tool_use.*ids must be unique|API Error: 400|invalid_request_error.*tool_use/i.test(msg);
      if (transient && attempt < 3) {
        broadcast({ type: 'assistant', text: `◊ transient API error (attempt ${attempt}/3) · retrying serially…`, ts: new Date().toISOString() });
        await new Promise(r => setTimeout(r, 1500));
        return runDirective(directive, attempt + 1);
      }
      broadcast({ type: 'error', message: msg + (attempt > 1 ? ` (after ${attempt} attempts)` : '') });
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  ◊ LINKEDIN AUTOPILOT CRON · always-on while cockpit is alive
  //  Env: SIDIDY_AUTOPILOT=1 to enable · SIDIDY_AUTOPILOT_MINUTES=90 default
  //  Waking-hour gate: only fires 07:00-21:00 UK local time
  //  Never fires unless at least one SSE client is connected (proves laptop open)
  // ═════════════════════════════════════════════════════════════════
  const AUTOPILOT_ON = process.env.SIDIDY_AUTOPILOT === '1';
  const AUTOPILOT_INTERVAL_MIN = Math.max(30, parseInt(process.env.SIDIDY_AUTOPILOT_MINUTES || '90', 10));
  let autopilotTickCount = 0;
  if (AUTOPILOT_ON) {
    const modes = ['scan', 'reply', 'engage']; // rotate
    const tick = async () => {
      try {
        const now = new Date();
        const hour = now.getHours();
        if (hour < 7 || hour >= 21) {
          console.log(`◊ autopilot · skipped (outside waking hours · ${hour}h)`);
          return;
        }
        if (sseClients.length === 0) {
          console.log(`◊ autopilot · skipped (no cockpit clients · laptop assumed closed)`);
          return;
        }
        const mode = modes[autopilotTickCount % modes.length];
        autopilotTickCount++;
        const directive = `linkedin_autopilot · mode:"${mode}" · cap:5 · queue all drafts · NEVER send`;
        console.log(`◊ autopilot tick #${autopilotTickCount} · mode=${mode}`);
        broadcast({ type: 'fall_signal', source: 'autopilot', kind: 'autopilot_tick', payload: { mode, count: autopilotTickCount, hour }, ts: new Date().toISOString() });
        runDirective(directive).catch(e => broadcast({ type: 'error', message: 'autopilot tick error: ' + e.message }));
      } catch (e) {
        console.log('◊ autopilot tick err:', e.message);
      }
    };
    // First tick after 2 min (let cockpit/login settle), then every N minutes
    setTimeout(() => { tick(); setInterval(tick, AUTOPILOT_INTERVAL_MIN * 60 * 1000); }, 2 * 60 * 1000);
  }

  // ═════════════════════════════════════════════════════════════════
  //  ◊ UPWORK AUTOPILOT CRON · always-on while cockpit is alive
  //  Env: SIDIDY_UP_AUTOPILOT=1 to enable · SIDIDY_UP_AUTOPILOT_MINUTES=120 default
  //  Waking-hour gate: only fires 07:00-21:00 UK local time
  //  Never fires unless at least one SSE client is connected (proves laptop open)
  // ═════════════════════════════════════════════════════════════════
  const UP_AUTOPILOT_ON = process.env.SIDIDY_UP_AUTOPILOT === '1';
  const UP_AUTOPILOT_INTERVAL_MIN = Math.max(45, parseInt(process.env.SIDIDY_UP_AUTOPILOT_MINUTES || '120', 10));
  let upTickCount = 0;
  if (UP_AUTOPILOT_ON) {
    const upModes = ['scan', 'propose', 'reply']; // rotate
    const upTick = async () => {
      try {
        const now = new Date();
        const hour = now.getHours();
        if (hour < 7 || hour >= 21) {
          console.log(`◊ up-autopilot · skipped (outside waking hours · ${hour}h)`);
          return;
        }
        if (sseClients.length === 0) {
          console.log(`◊ up-autopilot · skipped (no cockpit clients · laptop assumed closed)`);
          return;
        }
        const mode = upModes[upTickCount % upModes.length];
        upTickCount++;
        const directive = `upwork_autopilot mode:"${mode}" cap:5 · queue all drafts · NEVER submit`;
        console.log(`◊ up-autopilot tick #${upTickCount} · mode=${mode}`);
        broadcast({ type: 'fall_signal', source: 'up-autopilot', kind: 'up_autopilot_tick', payload: { mode, count: upTickCount, hour }, ts: new Date().toISOString() });
        runDirective(directive).catch(e => broadcast({ type: 'error', message: 'up-autopilot tick error: ' + e.message }));
      } catch (e) {
        console.log('◊ up-autopilot tick err:', e.message);
      }
    };
    // First tick after 3 min (let LinkedIn autopilot go first), then every N minutes
    setTimeout(() => { upTick(); setInterval(upTick, UP_AUTOPILOT_INTERVAL_MIN * 60 * 1000); }, 3 * 60 * 1000);
  }

  // ═════════════════════════════════════════════════════════════════
  //  ◊ LINKEDIN SCHEDULE CRON · checks every 60s for due posts
  //  Fires linkedin_drop(frame, screenshot_dir) at the scheduled hour
  //  Auto-captures screenshots first if scheduled with auto_capture:true
  //  Still pauses for ask_user before Post (the non-negotiable gate)
  // ═════════════════════════════════════════════════════════════════
  const scheduleFp = path.join(MEMORY_DIR, 'li-schedule.jsonl');
  setInterval(() => {
    try {
      if (!fs.existsSync(scheduleFp)) return;
      if (sseClients.length === 0) return; // need an active cockpit to receive the ask_user
      const raw = fs.readFileSync(scheduleFp, 'utf8').trim().split('\n').filter(Boolean);
      const entries = raw.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const now = Date.now();
      let mutated = false;
      const updated = entries.map(e => {
        if (e.status !== 'scheduled') return e;
        const due = new Date(e.when_iso).getTime();
        if (due > now) return e;
        // FIRE
        console.log(`◊ schedule · firing ${e.frame} · scheduled ${e.when_iso}`);
        broadcast({ type: 'fall_signal', source: 'schedule', kind: 'schedule_fired', payload: e, ts: new Date().toISOString() });
        const directive = e.auto_capture
          ? `Run capture_estate_screenshots(scope:"${e.frame}", crop_top_px:0) THEN run linkedin_drop(frame:"${e.frame}", carousel_pdf_path:null, dry_run:false) using the captured directory as the carousel source. Pause for ask_user before Post.`
          : `Run linkedin_drop(frame:"${e.frame}", dry_run:false). Pause for ask_user before Post.`;
        runDirective(directive).catch(err => broadcast({ type: 'error', message: 'schedule fire err: ' + err.message }));
        mutated = true;
        return { ...e, status: 'fired', fired_at: new Date().toISOString() };
      });
      if (mutated) fs.writeFileSync(scheduleFp, updated.map(e => JSON.stringify(e)).join('\n') + '\n');
    } catch (e) {
      console.log('◊ schedule tick err:', e.message);
    }
  }, 60 * 1000);

  // boot
  server.listen(SERVER_PORT, () => {
    console.log(`\n◊ cockpit live · http://localhost:${SERVER_PORT}`);
    console.log(`◊ open  http://localhost:${SERVER_PORT}/  in your browser`);
    console.log(`◊ SSE events at /events · POST directives at /directive`);
    console.log(`◊ substrate verbs at POST /substrate · {verb:"research"|"verify"|"substrate_build", args:{...}}`);
    console.log(`◊ fall-signal mesh bridge at POST /signal · GET /signal?n=50 to replay`);
    console.log(`◊ ──────────────────────────────────────────────────────────────────`);
    console.log(`◊ fiverr autopilot · 7 strands · prime 379`);
    console.log(`◊   dashboard:   http://localhost:${SERVER_PORT}/dashboard`);
    console.log(`◊   queue:       http://localhost:${SERVER_PORT}/api/fiverr/queue`);
    console.log(`◊   stats:       http://localhost:${SERVER_PORT}/api/fiverr/stats`);
    console.log(`◊   fulfill:     POST /api/fiverr/fulfill {brief:"..."}`);
    console.log(`◊   approve:     POST /api/fiverr/approve/:orderId`);
    console.log(`◊ ──────────────────────────────────────────────────────────────────`);
    if (AUTOPILOT_ON) {
      console.log(`◊ autopilot ARMED · every ${AUTOPILOT_INTERVAL_MIN}min · 07-21h · drafts only · NEVER auto-sends`);
    } else {
      console.log(`◊ autopilot OFF · set SIDIDY_AUTOPILOT=1 to enable (rotates scan/reply/engage)`);
    }
    if (UP_AUTOPILOT_ON) {
      console.log(`◊ upwork autopilot ARMED · every ${UP_AUTOPILOT_INTERVAL_MIN}min · 07-21h · drafts only · NEVER auto-sends`);
    } else {
      console.log(`◊ upwork autopilot OFF · set SIDIDY_UP_AUTOPILOT=1 to enable (rotates scan/propose/reply)`);
    }
    console.log('');
  });
} else if (TOOL_MODE) {
  // ──────── direct CLI passthrough · run ONE MCP verb without the agent loop ────────
  // Usage: node agent.mjs --tool upwork_profile_setup [--pack_path X] [--portfolio_dir Y] [--dry_run true]
  // Lets Simon bypass the LLM layer when he just wants the verb to execute.
  console.log(`\n◊ tool-mode · direct invoke · verb=${TOOL_MODE}\n`);
  // parse remaining --key value pairs into an args object
  const toolArgs = {};
  for (let i = 0; i < ARGS.length; i++) {
    if (ARGS[i].startsWith('--') && ARGS[i] !== '--tool' && i + 1 < ARGS.length && !ARGS[i + 1].startsWith('--')) {
      const k = ARGS[i].slice(2);
      let v = ARGS[i + 1];
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
      toolArgs[k] = v;
      i++;
    }
  }
  console.log('◊ args:', JSON.stringify(toolArgs));

  // walk the registered MCP servers · find the verb in instance._registeredTools · invoke handler directly
  // SDK stores handlers at server.instance._registeredTools[name].handler
  const allServers = [tierZeroMcp, tierOneMcp, tierThreeMcp, metaMcp, memoryMcp, estateMcp];
  let invoked = false;
  for (const server of allServers) {
    const reg = server?.instance?._registeredTools;
    if (!reg || !reg[TOOL_MODE]) continue;
    invoked = true;
    try {
      const handler = reg[TOOL_MODE].handler;
      if (typeof handler !== 'function') throw new Error('tool found but handler is not a function');
      const result = await handler(toolArgs);
      const textBlocks = (result?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      console.log('\n◊ ─── result ───\n' + textBlocks + '\n◊ ───────────────\n');
    } catch (e) {
      console.log('◊ tool error · ' + e.message);
      if (e.stack) console.log(e.stack);
    }
    break;
  }
  if (!invoked) {
    console.log(`◊ tool "${TOOL_MODE}" not found in any registered MCP server`);
  }
  if (_ctx) { console.log('\n◊ browser left open · close manually when ready'); }
  rl.close();
} else if (CHAT_MODE) {
  // ──────── persistent chat REPL ────────
  console.log('\n◊ chat mode · type a directive · "exit" to quit');
  console.log('◊ example: "promote ShadowCompass on my FB page" · "upwork morning run" · "find 5 AI founder groups on FB"');
  console.log('◊ packs available: ' + (availablePacks.join(', ') || '(drop .txt files in ./packs/)'));
  console.log('');

  // bootstrap: greet
  let lastText = '';
  let history = SYSTEM_DOCTRINE + '\n\nMODE: persistent chat REPL\n';

  for (;;) {
    const directive = (await ask('you ◊  ')).trim();
    if (!directive) continue;
    if (/^(exit|quit|bye|stop)$/i.test(directive)) break;

    const turnPrompt = history + `\n\nUSER DIRECTIVE (${new Date().toISOString()}):\n${directive}\n\nExecute. Log a mission, plan tiers, run, summarize, close mission. Then wait for the next directive.`;

    const result = query({ prompt: turnPrompt, options: queryOpts });
    for await (const msg of result) {
      lastText = summarizeMsg(msg, lastText);
      if (msg.type === 'assistant') {
        const text = (msg.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        if (text) history += `\n\nSIDIDY (${new Date().toISOString()}):\n${text}\n`;
      }
    }
    // trim history so the prompt doesn't balloon · keep last ~16k chars
    if (history.length > 16000) history = SYSTEM_DOCTRINE + '\n\n[...older turns trimmed...]\n' + history.slice(-12000);
  }

  if (_ctx) { console.log('\n◊ closing browser…'); await _ctx.close().catch(()=>{}); }
  console.log('◊ chat ended\n');
  rl.close();
} else {
  // ──────── one-shot brief mode (original) ────────
  console.log('\n◊ handing brief to agent…\n');
  let lastText = '';
  const result = query({ prompt: PROMPT, options: queryOpts });
  for await (const msg of result) {
    lastText = summarizeMsg(msg, lastText);
  }
  if (_ctx) console.log('\n◊ browser left open · close manually when ready');
  console.log('◊ done\n');
  rl.close();
}
