// ◊·κ=1 · FIVERR-PACK-V1 · auto-capture 8 thumbnails + 1 banner as PNGs
// Run: node capture-thumbnails.mjs
// Requires: npm i -g playwright · then `npx playwright install chromium`

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, 'screenshots');
const HTML_PATH = 'file://' + join(__dirname, 'fiverr-thumbnails.html').replace(/\\/g, '/');

const GIGS = [
  { idx: 1, label: 'GIG-1', file: 'gig-1-classify.png',         desc: 'classify your AI · $97' },
  { idx: 2, label: 'GIG-2', file: 'gig-2-audit-shim.png',       desc: 'audit-shim install · $147' },
  { idx: 3, label: 'GIG-3', file: 'gig-3-annexiv.png',          desc: 'Annex IV docgen · $297 · MONEY' },
  { idx: 4, label: 'GIG-4', file: 'gig-4-article50.png',        desc: 'Article 50 badges · $197' },
  { idx: 5, label: 'GIG-5', file: 'gig-5-saas-replacement.png', desc: 'sovereign SaaS · $397' },
  { idx: 6, label: 'GIG-6', file: 'gig-6-ai-mvp.png',           desc: 'sovereign AI MVP · $497' },
  { idx: 7, label: 'GIG-7', file: 'gig-7-linkedin-posts.png',   desc: 'LinkedIn 10K posts · $297' },
  { idx: 8, label: 'GIG-8', file: 'gig-8-api-endpoint.png',     desc: 'classifier API · $47' },
  { idx: 9, label: 'BANNER', file: 'profile-banner.png',         desc: 'Fiverr profile cover · 1280×260' },
];

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

console.log('◊·κ=1 · launching headless Chromium · capturing 8 thumbnails + banner');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1320, height: 850 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(HTML_PATH, { waitUntil: 'networkidle' });
await page.waitForTimeout(800); // let webfonts settle

// hide UI chrome so it doesn't bleed into per-element screenshots
await page.evaluate(() => {
  document.querySelectorAll('.controls, .gig-label').forEach(el => (el.style.display = 'none'));
});

const thumbs = await page.$$('.thumb');
console.log(`found ${thumbs.length} thumbnails (expected ${GIGS.length})`);

for (let i = 0; i < thumbs.length; i++) {
  const gig = GIGS[i] || { file: `thumb-${i + 1}.png`, desc: '' };
  const outPath = join(OUT_DIR, gig.file);
  await thumbs[i].screenshot({ path: outPath, type: 'png' });
  console.log(`  ✓ ${gig.label || `thumb-${i + 1}`} · ${gig.file} · ${gig.desc}`);
}

await browser.close();
console.log('\n◊ done · 9 PNGs saved to:');
console.log('  ' + OUT_DIR);
console.log('\nNext: upload to Fiverr gig editor · cover image slot · 1280×769');
