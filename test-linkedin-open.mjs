#!/usr/bin/env node
// Test LinkedIn session - check if profile is logged in

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const USER_DATA = './si-didy-profile';
const VIEWPORT = { width: 1280, height: 800 };

// Reset exit_type to prevent restore-session dialog
function resetProfileExitType() {
  try {
    const prefPath = path.join(USER_DATA, 'Default', 'Preferences');
    if (!fs.existsSync(prefPath)) return;
    let pref = fs.readFileSync(prefPath, 'utf8');
    pref = pref.replace(/"exit_type":"Crashed"/g, '"exit_type":"Normal"')
               .replace(/"exited_cleanly":false/g, '"exited_cleanly":true');
    fs.writeFileSync(prefPath, pref);
  } catch (_) { }
}

async function main() {
  console.log('◊ Opening LinkedIn to test session...\n');

  resetProfileExitType();

  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    headless: false,
    viewport: VIEWPORT,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-session-crashed-bubble',
      '--restore-last-session=false',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  const page = ctx.pages()[0] || await ctx.newPage();
  await page.setViewportSize(VIEWPORT);

  try {
    console.log('◊ Navigating to LinkedIn feed...');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const url = page.url();
    console.log('◊ Current URL:', url);

    if (url.includes('/login') || url.includes('/uas/login')) {
      console.log('\n✗ NOT LOGGED IN - Need to log in manually');
      console.log('◊ Please log in to LinkedIn in the browser window.');
      console.log('◊ Press Enter when ready to continue...');

      // Wait for user to press Enter
      await new Promise((resolve) => {
        process.stdin.once('data', resolve);
      });

      // Check again
      await page.waitForTimeout(2000);
      const newUrl = page.url();
      console.log('◊ New URL:', newUrl);

      if (newUrl.includes('/feed')) {
        console.log('\n✓ Logged in successfully!');
      } else {
        console.log('\n✗ Still not on feed. Current URL:', newUrl);
      }
    } else if (url.includes('/feed')) {
      console.log('\n✓ Already logged in - session active');

      // Take a screenshot
      const screenshot = await page.screenshot({ type: 'png' });
      const screenshotPath = './linkedin-session-test.png';
      fs.writeFileSync(screenshotPath, screenshot);
      console.log('◊ Screenshot saved:', screenshotPath);
    } else {
      console.log('\n⚠ Unexpected URL:', url);
    }

    console.log('\n◊ Browser will stay open. Close manually when done.');
    console.log('◊ Press Ctrl+C to exit this script.');

    // Keep the script running
    await new Promise(() => {});

  } catch (e) {
    console.error('◊ Error:', e.message);
    await ctx.close();
    process.exit(1);
  }
}

main();
