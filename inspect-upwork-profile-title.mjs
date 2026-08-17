#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'fs';

const PROFILE_DIR = 'C:\\Users\\sjgan\\Downloads\\si-didy-profile';
const URL = 'https://www.upwork.com/freelancers/settings/profile';

(async () => {
  console.log('◊ Launching Chromium with persistent profile...');
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 720 }
  });

  const page = ctx.pages()[0] || await ctx.newPage();

  console.log('◊ First, navigating to Upwork home to establish session...');
  await page.goto('https://www.upwork.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  console.log(`◊ Now navigating to ${URL}...`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('◊ Waiting 10 seconds for React to hydrate...');
  await page.waitForTimeout(10000); // Wait for dynamic content

  console.log('◊ Taking screenshot...');
  await page.screenshot({
    path: 'C:\\Users\\sjgan\\Downloads\\upwork-profile-title-inspect.png',
    fullPage: true
  });

  console.log('◊ Extracting HTML...');
  const html = await page.content();
  fs.writeFileSync('C:\\Users\\sjgan\\Downloads\\upwork-profile-title-source.html', html, 'utf8');

  console.log('◊ Extracting form elements...');
  const inputs = await page.$$eval('input, textarea, button', elements =>
    elements.map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      id: el.id || '',
      name: el.name || '',
      className: el.className || '',
      placeholder: el.placeholder || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      dataTest: el.getAttribute('data-test') || '',
      text: el.textContent?.trim().slice(0, 50) || ''
    }))
  );

  console.log('◊ Looking for title/headline edit controls...');
  const titleControls = await page.$$eval('[data-test*="title"], [aria-label*="title" i], [aria-label*="headline" i], [aria-label*="edit" i]', elements =>
    elements.map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      id: el.id || '',
      className: el.className || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      dataTest: el.getAttribute('data-test') || '',
      text: el.textContent?.trim().slice(0, 100) || '',
      outerHTML: el.outerHTML.slice(0, 200)
    }))
  ).catch(() => []);

  console.log('\n=== TITLE/HEADLINE CONTROLS (most relevant) ===\n');
  titleControls.forEach((el, idx) => {
    console.log(`[${idx}] <${el.tag}${el.type ? ` type="${el.type}"` : ''}>`);
    if (el.id) console.log(`    id="${el.id}"`);
    if (el.className) console.log(`    class="${el.className}"`);
    if (el.ariaLabel) console.log(`    aria-label="${el.ariaLabel}"`);
    if (el.dataTest) console.log(`    data-test="${el.dataTest}"`);
    if (el.text) console.log(`    text="${el.text}"`);
    console.log(`    outerHTML: ${el.outerHTML}`);
    console.log('');
  });

  console.log('\n=== ALL FORM ELEMENTS ===\n');
  console.log(`Total: ${inputs.length} elements (showing first 30)`);
  inputs.slice(0, 30).forEach((el, idx) => {
    console.log(`[${idx}] <${el.tag}${el.type ? ` type="${el.type}"` : ''}>`);
    if (el.id) console.log(`    id="${el.id}"`);
    if (el.name) console.log(`    name="${el.name}"`);
    if (el.className) console.log(`    class="${el.className}"`);
    if (el.placeholder) console.log(`    placeholder="${el.placeholder}"`);
    if (el.ariaLabel) console.log(`    aria-label="${el.ariaLabel}"`);
    if (el.dataTest) console.log(`    data-test="${el.dataTest}"`);
    if (el.text && el.tag === 'button') console.log(`    text="${el.text}"`);
    console.log('');
  });

  const report = {
    url: URL,
    timestamp: new Date().toISOString(),
    screenshot: 'C:\\Users\\sjgan\\Downloads\\upwork-profile-title-inspect.png',
    html_source: 'C:\\Users\\sjgan\\Downloads\\upwork-profile-title-source.html',
    title_controls: titleControls,
    form_elements_count: inputs.length,
    form_elements_sample: inputs.slice(0, 30)
  };

  fs.writeFileSync(
    'C:\\Users\\sjgan\\Downloads\\upwork-profile-title-report.json',
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log('\n✓ Report saved to upwork-profile-title-report.json');
  console.log('✓ Screenshot saved to upwork-profile-title-inspect.png');
  console.log('✓ HTML source saved to upwork-profile-title-source.html');

  console.log('\n◊ Keeping browser open for 10 seconds for manual inspection...');
  await page.waitForTimeout(10000);

  await ctx.close();
  console.log('◊ Done.');
})();
