#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  sync-estate.js · rebuild estate.json from live GitHub estate
//  Usage:   node sync-estate.js              (rebuilds estate.json)
//           node sync-estate.js --dry        (prints diff, no write)
//
//  Pulls every public repo from sjgant80-hub via `gh` CLI (T0).
//  Classifies each by signal: has Pages, has README mentioning sovereign,
//  has API endpoint, etc. Writes a clean estate.json.
// ═══════════════════════════════════════════════════════════════════

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OWNERS = ['sjgant80-hub', 'teslasolar'];   // estate + guild
const DRY    = process.argv.includes('--dry');
const OUT    = './estate.json';

function gh(args) {
  try {
    return execSync('gh ' + args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (e) {
    console.error('✗ gh error · ' + args + '\n  ' + (e.stderr || e.message).toString().slice(0, 300));
    return '';
  }
}

function fetchRepos(owner) {
  // gh accepts ?query via -F or --jq · simpler: use the endpoint path with --paginate · default type is public
  const raw = gh(`api "users/${owner}/repos?per_page=100" --paginate`);
  if (!raw) return [];
  try {
    // --paginate concatenates JSON arrays; normalize
    const stitched = raw.replace(/\]\s*\[/g, ',');
    return JSON.parse(stitched);
  } catch (e) {
    console.error('  ✗ parse error · ' + e.message);
    return [];
  }
}

// purpose taxonomy by name pattern · fallback to repo description
function classify(repo) {
  const n = repo.name.toLowerCase();
  const d = (repo.description || '').toLowerCase();
  const has = s => n.includes(s) || d.includes(s);

  // section
  let section = 'core_tools';
  if (has('forge') || has('factory')) section = 'forges';
  else if (has('registry') || has('mesh') || has('palette') || has('hot') || has('signal') || has('mcp') || has('konomi')) section = 'infrastructure';
  else if (has('agent') || has('sididy') || has('si-didy') || has('oracle') || has('cassie')) section = 'agents';

  // use_when hint
  let use_when = '';
  if (has('post') || has('linkedin')) use_when = 'LinkedIn drafting · tone grading';
  else if (has('map')) use_when = 'workflow-to-cost · the FallMap-as-bait engine';
  else if (has('shadow') || has('jung')) use_when = 'Jung / shadow-work / individuation conversations';
  else if (has('learn') || has('kids') || has('education')) use_when = 'AI literacy · parents · educators · kids';
  else if (has('account') || has('cis') || has('trades') || has('mtd')) use_when = 'UK accounting · trades / sole-trader compliance';
  else if (has('force') || has('crm') || has('procurement')) use_when = 'CRM / pipeline / RFQ · audit-chained';
  else if (has('slot') || has('calendar')) use_when = 'sovereign scheduling · Calendly replacement';
  else if (has('form')) use_when = 'sovereign forms · Typeform/JotForm replacement';
  else if (has('list') || has('mailchimp')) use_when = 'newsletter / list · Mailchimp replacement';
  else if (has('guild') || has('gravity')) use_when = 'multi-person amplification on LinkedIn';
  else if (has('gate') || has('copy')) use_when = 'tone-grading every draft before publishing';
  else if (has('audio')) use_when = 'audio · sovereign audio fabric';
  else if (has('hub') || has('marketplace')) use_when = 'estate marketplace · client-facing surface';

  const out = {
    purpose: repo.description || `${repo.name} · sovereign estate tool`,
    repo: repo.html_url,
    stars: repo.stargazers_count,
    pushed: repo.pushed_at,
    has_pages: !!repo.has_pages,
  };
  if (repo.has_pages) {
    out.url = `https://${repo.owner.login}.github.io/${repo.name}/`;
  } else if (repo.homepage) {
    out.url = repo.homepage;
  }
  if (use_when) out.use_when = use_when;
  out.tier = repo.has_pages ? 'T3 (load HTML) or T1 if API exposed' : 'T0 (gh clone) or T1';

  return { section, name: repo.name, meta: out };
}

console.log('◊ syncing estate from GitHub…');
const sections = { forges: {}, core_tools: {}, infrastructure: {}, agents: {} };

for (const owner of OWNERS) {
  console.log('  · fetching ' + owner + '…');
  const repos = fetchRepos(owner);
  console.log('    found ' + repos.length + ' public repos');
  for (const r of repos) {
    if (r.archived || r.fork) continue;
    const { section, name, meta } = classify(r);
    sections[section][name] = meta;
  }
}

const totalTools = Object.values(sections).reduce((a, s) => a + Object.keys(s).length, 0);

const estate = {
  _doc: `Estate manifest · auto-synced from GitHub · ${new Date().toISOString()}. v20.1 seed cosmology · phi=1.618 · kappa=0.618 · fold=510510. si-didy queries this BEFORE reaching for browser.`,
  version: '2.0-synced',
  synced_at: new Date().toISOString(),
  owners: OWNERS,
  hub: 'https://www.ai-nativesolutions.com',
  registry: 'https://sjgant80-hub.github.io/fall-registry/',
  forges: sections.forges,
  core_tools: sections.core_tools,
  infrastructure: sections.infrastructure,
  agents: sections.agents,
  tier_decision_doctrine: [
    'Step 1: estate_query(intent) · what tools exist for this?',
    'Step 2: if estate has a tool with an API · estate_call (T1)',
    'Step 3: if estate has a tool that\'s browser-only · T3 against that tool',
    'Step 4: if NO estate tool exists for this task · forge_request(spec) to fallcore-factory',
    'Step 5: if the mission has 2+ independent sub-tasks · subagent_spawn each',
    'Step 6: after mission · learn_log what worked / what failed · the twin compounds',
  ],
};

if (DRY) {
  console.log(`\n◊ DRY · would write ${totalTools} tools across 4 sections:`);
  for (const [s, items] of Object.entries(sections)) {
    console.log(`  · ${s} · ${Object.keys(items).length}`);
    for (const n of Object.keys(items).slice(0, 5)) console.log(`     ${n}`);
    if (Object.keys(items).length > 5) console.log(`     … +${Object.keys(items).length - 5} more`);
  }
} else {
  fs.writeFileSync(OUT, JSON.stringify(estate, null, 2));
  console.log(`\n◊·κ=1 · wrote ${totalTools} tools to ${OUT}`);
  console.log('   forges: ' + Object.keys(sections.forges).length);
  console.log('   core_tools: ' + Object.keys(sections.core_tools).length);
  console.log('   infrastructure: ' + Object.keys(sections.infrastructure).length);
  console.log('   agents: ' + Object.keys(sections.agents).length);
}
