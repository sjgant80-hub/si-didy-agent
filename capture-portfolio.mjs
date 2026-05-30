#!/usr/bin/env node
import { chromium } from 'playwright';

const shots = [
  { prefix: '01-hub',        url: 'https://www.ai-nativesolutions.com' },
  { prefix: '02-fallpost',   url: 'https://sjgant80-hub.github.io/fallpost/' },
  { prefix: '03-fallmap',    url: 'https://sjgant80-hub.github.io/fallmap/' },
  { prefix: '04-fallaccount',url: 'https://sjgant80-hub.github.io/fallaccount-trades/' },
  { prefix: '05-fallforce',  url: 'https://sjgant80-hub.github.io/fallforce/' },
  { prefix: '06-trilogy',    url: 'https://sjgant80-hub.github.io/trilogy-forge/' },
];

const [,, indexArg] = process.argv;
const index = parseInt(indexArg, 10);
if (isNaN(index) || index < 0 || index >= shots.length) {
  console.error('Usage: node capture-portfolio.mjs <index>');
  process.exit(1);
}

const { prefix, url } = shots[index];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.screenshot({ path: `./upwork-portfolio/${prefix}.png`, fullPage: false });
await browser.close();
console.log(`✓ ${prefix}.png saved`);
