// ═══════════════════════════════════════════════════════════════════
//  si-didy-agent · sovereign computer-use agent · ◊·κ=1
//  Claude Agent SDK + Playwright MCP · subscription auth · MIT
// ═══════════════════════════════════════════════════════════════════
//
//  WHAT THIS USES
//   → @anthropic-ai/claude-agent-sdk · auto-picks Claude Code
//     subscription auth (no API charges) when `claude` is logged in
//   → Playwright · drives a real Chromium with your saved Upwork session
//   → In-process MCP server · exposes browser tools to the agent
//
//  ONE-TIME SETUP (PowerShell · cd $env:USERPROFILE\Downloads)
//
//   1. Install Claude Code globally (skip if already installed):
//        npm i -g @anthropic-ai/claude-code
//
//   2. Authenticate against your subscription (OAuth in browser):
//        claude
//      Complete the OAuth flow · then exit with /quit or Ctrl+C.
//      This writes credentials to ~/.claude/.credentials.json.
//
//   3. Install agent deps in this folder:
//        npm init -y
//        npm i @anthropic-ai/claude-agent-sdk playwright zod
//        npx playwright install chromium
//
//  RUN
//        node si-didy-agent.mjs
//
//      (defaults to ./UPWORK-SIMON-PACK.txt · pass a different
//       brief as the first arg if you want)
//
//  FALLBACK · if subscription auth not set up, set ANTHROPIC_API_KEY
//  and the SDK uses that instead (per-token API billing).
//
// ═══════════════════════════════════════════════════════════════════

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { chromium } from 'playwright';
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

// ───────────── config ─────────────
const PACK_PATH = process.argv[2] || './UPWORK-SIMON-PACK.txt';
const USER_DATA = './si-didy-profile';
const VIEWPORT  = { width: 1280, height: 800 };
const START_URL = 'https://www.upwork.com/freelancers/ainativesolutions';

// ───────────── auth detection ─────────────
const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
const hasSubAuth = fs.existsSync(credsPath);
const hasApiKey  = !!process.env.ANTHROPIC_API_KEY;

console.log('◊·κ=1 · si-didy-agent\n');
if (hasSubAuth)      console.log('◊ auth: Claude Code subscription ✓ (no per-token API charges)');
else if (hasApiKey)  console.log('◊ auth: ANTHROPIC_API_KEY (per-token billing)');
else {
  console.error('✗ No auth found. Either:');
  console.error('   → run  claude  once to OAuth into your subscription, OR');
  console.error('   → set  $env:ANTHROPIC_API_KEY = "sk-ant-..."');
  process.exit(1);
}

if (!fs.existsSync(PACK_PATH)) { console.error('✗ Pack not found:', PACK_PATH); process.exit(1); }
const PACK = fs.readFileSync(PACK_PATH, 'utf8');

// ───────────── browser ─────────────
console.log('◊ launching Chromium · persistent profile:', USER_DATA);
const ctx = await chromium.launchPersistentContext(USER_DATA, {
  headless: false,
  viewport: VIEWPORT,
  args: ['--disable-blink-features=AutomationControlled']
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.setViewportSize(VIEWPORT);
await page.goto(START_URL, { waitUntil: 'domcontentloaded' }).catch(()=>{});

// ───────────── login handoff ─────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));
console.log('\n◊ Chromium open. If Upwork shows a login page, log in now.');
console.log('◊ Your session persists in ./si-didy-profile · log in once, never again.\n');
await ask('  [press ENTER when you can see your profile editor] ');

// ───────────── Playwright MCP server (in-process) ─────────────
const browserMcp = createSdkMcpServer({
  name: 'browser',
  version: '1.0.0',
  tools: [
    tool('screenshot', 'Take a screenshot of the current page. Returns the image so you can see the current state.',
      {},
      async () => {
        const buf = await page.screenshot({ type: 'png' });
        return { content: [{ type: 'image', data: buf.toString('base64'), mimeType: 'image/png' }] };
      }
    ),
    tool('click', 'Click at pixel coordinates. button: left|right|middle. clickCount: 1=single, 2=double, 3=triple.',
      { x: z.number(), y: z.number(),
        button: z.enum(['left','right','middle']).default('left'),
        clickCount: z.number().int().min(1).max(3).default(1) },
      async ({ x, y, button, clickCount }) => {
        await page.mouse.click(x, y, { button, clickCount });
        await page.waitForTimeout(400);
        return { content: [{ type: 'text', text: `clicked ${button} x${clickCount} @ ${x},${y}` }] };
      }
    ),
    tool('type', 'Type text at the current cursor position. Use after clicking into a field.',
      { text: z.string() },
      async ({ text }) => {
        await page.keyboard.type(text, { delay: 15 });
        return { content: [{ type: 'text', text: `typed ${text.length} chars` }] };
      }
    ),
    tool('key', 'Press a single key or key combo. Examples: "Enter", "Tab", "Escape", "Control+a", "Control+v".',
      { keys: z.string() },
      async ({ keys }) => {
        await page.keyboard.press(keys);
        await page.waitForTimeout(200);
        return { content: [{ type: 'text', text: `pressed ${keys}` }] };
      }
    ),
    tool('scroll', 'Scroll the page in a direction by N pixels at coordinates (x,y).',
      { x: z.number().default(640), y: z.number().default(400),
        direction: z.enum(['up','down','left','right']).default('down'),
        pixels: z.number().default(400) },
      async ({ x, y, direction, pixels }) => {
        await page.mouse.move(x, y);
        const dx = direction === 'left' ? -pixels : direction === 'right' ? pixels : 0;
        const dy = direction === 'up'   ? -pixels : direction === 'down'  ? pixels : 0;
        await page.mouse.wheel(dx, dy);
        await page.waitForTimeout(300);
        return { content: [{ type: 'text', text: `scrolled ${direction} ${pixels}px` }] };
      }
    ),
    tool('wait', 'Wait N seconds for the page to settle. Max 10.',
      { seconds: z.number().min(0).max(10) },
      async ({ seconds }) => {
        await page.waitForTimeout(seconds * 1000);
        return { content: [{ type: 'text', text: `waited ${seconds}s` }] };
      }
    ),
    tool('navigate', 'Navigate the browser to a URL.',
      { url: z.string() },
      async ({ url }) => {
        await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(()=>{});
        return { content: [{ type: 'text', text: `navigated to ${url}` }] };
      }
    ),
    tool('upload_file', 'Set a local file path on a file input element via CSS selector. Use for portfolio screenshot uploads.',
      { selector: z.string(), filePath: z.string() },
      async ({ selector, filePath }) => {
        const abs = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        await page.setInputFiles(selector, abs);
        return { content: [{ type: 'text', text: `uploaded ${abs} to ${selector}` }] };
      }
    ),
    tool('ask_user', 'Pause and ask the user a question in the terminal. MUST be called before any Save/Submit/Send/Delete/Confirm action. Returns the user\'s reply.',
      { question: z.string() },
      async ({ question }) => {
        const answer = await ask(`\n  ◊ agent asks → ${question}\n  > `);
        return { content: [{ type: 'text', text: `user replied: ${answer || '(empty)'}` }] };
      }
    ),
    tool('current_url', 'Get the current page URL.', {},
      async () => ({ content: [{ type: 'text', text: page.url() }] })
    )
  ]
});

// ───────────── system prompt for the agent ─────────────
const PROMPT = `You are si-didy-agent — a sovereign computer-use agent. ◊·κ=1.

You drive a Playwright Chromium browser via the "browser" MCP tools on Simon Gant's laptop.
Viewport: ${VIEWPORT.width}x${VIEWPORT.height}.

CURRENT PAGE: ${START_URL}

YOUR JOB
Execute the brief below on Simon's Upwork profile.

WORKING RULES
1. Always call screenshot first to see what's on screen.
2. Work in 3-5 step chunks. Screenshot · plan · click/type · screenshot to verify · repeat.
3. To select existing text in a field: click into it, then press Control+a.
4. BEFORE ANY irreversible action — Save, Submit, Send, Delete, Confirm —
   YOU MUST call ask_user with a clear yes/no question first.
   Do not click the button until the user replies with "yes" or "go".
5. For portfolio screenshots: the user has saved PNG files at
   C:/Users/sjgan/Desktop/Upwork-Portfolio/01-hub.png through 06-trilogy.png.
   Use upload_file with the file input selector (usually input[type="file"]).
6. If a portfolio screenshot file doesn't exist yet, skip that slot and tell
   the user via ask_user that they need to capture it first.
7. If you can't find an element or get blocked: screenshot, then ask_user.
8. When the whole brief is done, output a final summary text block (no tool calls).

THE BRIEF
═══════════════════════════════════════════════════════════════════
${PACK}
═══════════════════════════════════════════════════════════════════

Begin now. Take a screenshot first.`;

// ───────────── allowed tools (all mcp__browser__*) ─────────────
const allowedTools = [
  'mcp__browser__screenshot',
  'mcp__browser__click',
  'mcp__browser__type',
  'mcp__browser__key',
  'mcp__browser__scroll',
  'mcp__browser__wait',
  'mcp__browser__navigate',
  'mcp__browser__upload_file',
  'mcp__browser__ask_user',
  'mcp__browser__current_url'
];

// ───────────── run the agent ─────────────
console.log('\n◊ handing off to si-didy…\n');

const result = query({
  prompt: PROMPT,
  options: {
    model: 'claude-sonnet-4-5-20250929',
    mcpServers: { browser: browserMcp },
    allowedTools,
    permissionMode: 'bypassPermissions',   // agent self-gates via ask_user tool
    maxTurns: 150
  }
});

let lastText = '';
for await (const msg of result) {
  if (msg.type === 'assistant') {
    const text = (msg.message?.content || [])
      .filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (text && text !== lastText) {
      console.log('\n◊ claude:\n' + text + '\n');
      lastText = text;
    }
    const tools = (msg.message?.content || []).filter(b => b.type === 'tool_use');
    for (const t of tools) {
      const argSummary = JSON.stringify(t.input).slice(0, 80);
      console.log(`  → ${t.name.replace('mcp__browser__','')} ${argSummary}`);
    }
  } else if (msg.type === 'result') {
    console.log('\n◊·κ=1 · agent finished');
    console.log('   turns: ' + (msg.num_turns ?? '?'));
    if (msg.total_cost_usd != null) console.log('   cost:  $' + msg.total_cost_usd.toFixed(4));
    if (msg.is_error) console.log('   note:  ended with error');
  }
}

console.log('\n◊ browser left open — close when ready. profile stays in ./si-didy-profile');
rl.close();
