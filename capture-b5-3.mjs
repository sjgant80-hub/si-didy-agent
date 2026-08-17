#!/usr/bin/env node
// ◊·κ=1 · Direct B5.3 screenshot capture for LinkedIn carousel
// Standalone execution of capture_estate_screenshots(scope:"B5.3", crop_top_px:0)

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCOPE = 'B5.3';
const CROP_TOP_PX = 0;
const VIEWPORT_W = 1080;
const VIEWPORT_H = 1350;
const QUEUES_DIR = './queues';

// B5.3 URL set · contrarian-verify theme
const TARGETS = [
  { name: '01-cover-fall-verify',       url: 'https://sjgant80-hub.github.io/fall-verify/' },
  { name: '02-fall-raas',               url: 'https://sjgant80-hub.github.io/fall-raas/' },
  { name: '03-fall-substrate',          url: 'https://sjgant80-hub.github.io/fall-substrate/' },
  { name: '04-substrate-arch-doc',      url: 'https://sjgant80-hub.github.io/fall-substrate/SOVEREIGN-COGNITIVE-SUBSTRATE.md' },
  { name: '05-ain-cognitive-pin',       url: 'https://www.ai-nativesolutions.com/' },
];

async function main() {
  const outDir = path.join(QUEUES_DIR, `li-carousel-${SCOPE.replace(/\./g,'_')}`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`◊ capture_estate_screenshots scope=${SCOPE} crop=${CROP_TOP_PX}px viewport=${VIEWPORT_W}x${VIEWPORT_H}`);
  console.log(`◊ output_dir: ${outDir}\n`);

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: VIEWPORT_W, height: VIEWPORT_H } });

    const results = [];
    for (const t of TARGETS) {
      try {
        console.log(`  · capturing ${t.name} ← ${t.url}`);
        await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500); // let fonts + animations settle
        const filePath = path.join(outDir, `${t.name}.png`);
        let opts = { path: filePath, type: 'png', fullPage: false };
        if (CROP_TOP_PX > 0) {
          opts.clip = { x: 0, y: CROP_TOP_PX, width: VIEWPORT_W, height: VIEWPORT_H - CROP_TOP_PX };
        }
        await page.screenshot(opts);
        const stat = fs.statSync(filePath);
        results.push({ name: t.name, url: t.url, path: filePath, size_kb: Math.round(stat.size / 1024) });
        console.log(`    ✓ ${t.name}.png · ${Math.round(stat.size / 1024)}KB`);
      } catch (e) {
        console.error(`    ✗ ${t.name} · ${e.message}`);
        results.push({ name: t.name, url: t.url, error: e.message });
      }
    }

    await browser.close();

    const ok = results.filter(r => !r.error);
    const errs = results.filter(r => r.error);

    console.log(`\n◊ captured ${ok.length}/${TARGETS.length} screenshots`);
    if (errs.length) {
      console.log(`◊ ${errs.length} errors:`);
      errs.forEach(r => console.log(`  ✗ ${r.name} · ${r.error}`));
    }
    console.log(`\n◊ NEXT: Run linkedin_drop(frame:"B5.3", screenshot_dir:"${outDir}", dry_run:false)`);
    console.log(`◊ Output directory: ${outDir}`);

    return outDir;
  } catch (e) {
    console.error('◊ capture error:', e.message);
    process.exit(1);
  }
}

main();
