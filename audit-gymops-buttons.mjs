// ◊ live button audit · gymops client build
// drives https://sjgant80-hub.github.io/gymos/clients/gymops.html
// 1. collects every onclick element
// 2. clicks each · captures console errors
// 3. reports per-button pass/fail + error message

import { chromium } from 'playwright';

const URL = 'https://sjgant80-hub.github.io/gymos/clients/gymops.html';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push({ ts: Date.now(), text: m.text() }); });
  page.on('pageerror', e => pageErrors.push({ ts: Date.now(), text: e.message }));

  console.log('◊ loading...');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // inventory · collect every clickable
  const inventory = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('[onclick]').forEach((el, i) => {
      const onclick = el.getAttribute('onclick') || '';
      const txt = (el.innerText || el.textContent || '').slice(0, 60).trim().replace(/\s+/g, ' ');
      const tag = el.tagName.toLowerCase();
      const id = el.id || '';
      const cls = (el.className || '').toString().split(/\s+/).slice(0, 3).join('.');
      items.push({ idx: i, tag, id, cls, txt, onclick: onclick.slice(0, 120) });
    });
    return items;
  });
  console.log(`◊ found ${inventory.length} onclick elements`);

  // for each · click via JS (so we don't trigger viewport scroll issues) and snapshot error count
  const results = [];
  for (let i = 0; i < inventory.length; i++) {
    const item = inventory[i];
    const errBefore = consoleErrors.length + pageErrors.length;

    try {
      await page.evaluate((idx) => {
        const els = document.querySelectorAll('[onclick]');
        const el = els[idx];
        if (!el) throw new Error('element gone');
        // dismiss any open modals/alerts first
        try { document.querySelectorAll('dialog[open]').forEach(d => d.close && d.close()); } catch(_) {}
        // override window.alert/confirm/prompt so they don't block headless
        if (!window.__auditMocks) {
          window.alert = (m) => { window.__lastAlert = m; };
          window.confirm = () => true;
          window.prompt = () => 'test';
          window.__auditMocks = true;
        }
        // call the onclick directly
        const fn = el.onclick;
        if (typeof fn === 'function') {
          fn.call(el, new Event('click'));
        } else {
          el.click();
        }
      }, i);
      await page.waitForTimeout(120);
    } catch (e) {
      pageErrors.push({ ts: Date.now(), text: `click ${i} threw: ${e.message}` });
    }

    const errAfter = consoleErrors.length + pageErrors.length;
    const newErrs = errAfter - errBefore;
    const status = newErrs === 0 ? 'ok' : 'ERR';
    results.push({ ...item, status, newErrors: newErrs });
  }

  // close browser
  await browser.close();

  // report
  const ok = results.filter(r => r.status === 'ok').length;
  const err = results.filter(r => r.status === 'ERR').length;
  console.log('\n◊ button audit report');
  console.log('─'.repeat(100));
  console.log(`  total clicked: ${results.length} · ok: ${ok} · errors: ${err}`);
  console.log('─'.repeat(100));
  if (err > 0) {
    for (const r of results.filter(x => x.status === 'ERR')) {
      console.log(`  [ERR ${r.newErrors}x] <${r.tag}#${r.id}> "${r.txt}" · ${r.onclick}`);
    }
  } else {
    console.log('  all buttons clicked without console/page errors');
  }
  if (consoleErrors.length) {
    console.log('\n◊ console errors (' + consoleErrors.length + '):');
    for (const e of consoleErrors.slice(0, 20)) console.log('  · ' + e.text.slice(0, 200));
  }
  if (pageErrors.length) {
    console.log('\n◊ page errors (' + pageErrors.length + '):');
    for (const e of pageErrors.slice(0, 20)) console.log('  · ' + e.text.slice(0, 200));
  }

  process.exit(err > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
