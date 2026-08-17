// ◊ capture 6 LinkedIn carousel screenshots from the live fall-euaiact demo
// runs headless · no chromium windows · no profile lock · ~15 seconds total
// run from si-didy-agent dir (it has playwright installed) OR npm i playwright first

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const URL = 'https://sjgant80-hub.github.io/fall-euaiact/';
const OUT = 'C:/Users/sjgan/Downloads/euaiact-carousel';

// LinkedIn carousel friendly · 4:5 portrait
const W = 1080, H = 1350;

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  console.log('◊ loading demo...');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // ─── SHOT 1 · classifier verdict for CV screening (the hero) ───
  console.log('◊ shot 1 · classifier verdict');
  await page.evaluate(() => {
    document.getElementById('sysDesc').value = "An AI system that screens CVs for a recruitment agency. Scores 0-100, ranks candidates, rejects bottom 50% automatically without human review.";
    classify();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '01-hero-classifier.png'), clip: { x: 0, y: 0, width: W, height: H } });

  // ─── SHOT 2 · article 14 expanded (human oversight = the pause-before-pattern) ───
  console.log('◊ shot 2 · article 14');
  await page.evaluate(() => {
    const dets = [...document.querySelectorAll('#articleList details')];
    dets.forEach(d => d.open = false);
    const a14 = dets.find(d => /article 14/i.test(d.querySelector('summary')?.textContent || ''));
    if (a14) {
      a14.open = true;
      a14.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '02-article-14-oversight.png'), clip: { x: 0, y: 0, width: W, height: H } });

  // ─── SHOT 3 · Annex IV form with sample data filled ───
  console.log('◊ shot 3 · annex iv form');
  await page.evaluate(() => {
    const fills = {
      'doc_system_name': 'FallVet CV Scorer v2.3',
      'doc_provider': 'Acme GmbH · Berlin · privacy@acme.de',
      'doc_purpose': 'Scoring software-engineer CVs against role specifications',
      'doc_users': 'In-house recruiters at Acme GmbH · German labour market',
      'doc_architecture': 'TF-IDF + logistic regression · BERT embeddings · all client-side',
    };
    for (const [id, v] of Object.entries(fills)) {
      const el = document.getElementById(id);
      if (el) el.value = v;
    }
    document.getElementById('docForm').scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '03-annex-iv-form.png'), clip: { x: 0, y: 0, width: W, height: H } });

  // ─── SHOT 4 · drop-in audit shim code block ───
  console.log('◊ shot 4 · audit chain code');
  await page.evaluate(() => {
    const h2s = [...document.querySelectorAll('section h2')];
    const auditH = h2s.find(h => /audit shim|article 12/i.test(h.textContent));
    if (auditH) auditH.closest('section').scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '04-article-12-audit-chain.png'), clip: { x: 0, y: 0, width: W, height: H } });

  // ─── SHOT 5 · transparency badge generator (chatbot disclosure) ───
  console.log('◊ shot 5 · transparency badge');
  await page.evaluate(() => {
    document.getElementById('badgeType').value = 'chatbot';
    renderBadge();
    const h2s = [...document.querySelectorAll('section h2')];
    const badgeH = h2s.find(h => /transparency badge|article 50/i.test(h.textContent));
    if (badgeH) badgeH.closest('section').scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '05-transparency-badge.png'), clip: { x: 0, y: 0, width: W, height: H } });

  // ─── SHOT 6 · language toggle showing 6 EU languages ───
  console.log('◊ shot 6 · 6 languages');
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const sel = document.getElementById('langSel');
    if (sel) {
      sel.value = 'de';
      setLang('de');
    }
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '06-multi-language.png'), clip: { x: 0, y: 0, width: W, height: H } });

  await browser.close();
  console.log('\n◊ done · 6 shots saved to ' + OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
