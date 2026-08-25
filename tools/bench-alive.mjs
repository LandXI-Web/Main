// Bench capture: "alive" reference sites — screenshots + short video, per site.
// Usage: node tools/bench-alive.mjs <groupName>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'shots', 'bench', 'alive');
const VID = path.join(OUT, '_video');
const FFMPEG = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-win64.exe');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VID, { recursive: true });

const SITES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'bench-alive-sites.json'), 'utf8'));

const group = process.argv[2] || 'all';
const list = group === 'all' ? SITES : SITES.filter((s) => s.g === group);
const CONCURRENCY = Number(process.env.CONC || 3);

const log = [];

async function capture(browser, site) {
  const slug = site.slug;
  const started = Date.now();
  let ctx;
  try {
    ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: path.join(VID, slug), size: { width: 1440, height: 900 } },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      locale: site.locale || 'en-US',
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(25000);
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: Number(process.env.NAVTO||45000) });
    // dismiss common cookie banners
    await page.waitForTimeout(900);
    for (const sel of [
      'button:has-text("Accept all")', 'button:has-text("Accept All")', 'button:has-text("Accept")',
      'button:has-text("동의")', 'button:has-text("모두 동의")', '#onetrust-accept-btn-handler',
      'button:has-text("I agree")', 'button:has-text("Got it")', 'button:has-text("Allow all")',
    ]) {
      try { const el = page.locator(sel).first(); if (await el.isVisible({ timeout: 350 })) { await el.click({ timeout: 900 }); break; } } catch {}
    }
    const snap = async (name) => {
      try { await page.screenshot({ path: path.join(OUT, `${slug}-${name}.jpg`), type: 'jpeg', quality: 80, timeout: 12000, animations: 'allow', caret: 'hide' }); }
      catch { try { await page.screenshot({ path: path.join(OUT, `${slug}-${name}.jpg`), type: 'jpeg', quality: 80, timeout: 12000, clip: { x: 0, y: 0, width: 1440, height: 900 } }); } catch {} }
    };
    await snap('1');
    await page.waitForTimeout(1500);
    await snap('2');
    await page.waitForTimeout(2500);
    await snap('3');

    // hover pass: move cursor over primary interactive elements
    try {
      const targets = await page.locator('a, button, [role="button"], canvas').all();
      const picks = targets.slice(0, 40).filter((_, i) => i % 7 === 0).slice(0, 5);
      for (const t of picks) {
        try { await t.hover({ timeout: 800 }); await page.waitForTimeout(320); } catch {}
      }
      await snap('hover');
    } catch {}

    // scroll pass: smooth, human-ish
    const h = await page.evaluate(() => document.body.scrollHeight);
    const steps = 14;
    const target = Math.min(h * 0.55, 9000);
    for (let i = 1; i <= steps; i++) {
      await page.mouse.wheel(0, target / steps);
      await page.waitForTimeout(210);
    }
    await page.waitForTimeout(900);
    await snap('scroll');
    for (let i = 1; i <= 8; i++) { await page.mouse.wheel(0, target / steps); await page.waitForTimeout(200); }
    await page.waitForTimeout(700);
    await snap('scroll2');

    await ctx.close();
    // rename video
    const dir = path.join(VID, slug);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.webm')) : [];
    let vpath = null;
    if (files.length) {
      vpath = path.join(OUT, `${slug}.webm`);
      fs.copyFileSync(path.join(dir, files[0]), vpath);
      // frame strip
      try {
        execFileSync(FFMPEG, ['-y', '-i', vpath, '-vf', 'fps=1/2,scale=480:-1,tile=4x2', '-frames:v', '1',
          path.join(OUT, `${slug}-strip.jpg`)], { stdio: 'ignore', timeout: 60000 });
      } catch {}
    }
    log.push({ slug, ok: true, ms: Date.now() - started, video: !!vpath });
    console.log(`OK   ${slug} (${Date.now() - started}ms)`);
  } catch (e) {
    try { await ctx?.close(); } catch {}
    log.push({ slug, ok: false, err: String(e).slice(0, 160) });
    console.log(`FAIL ${slug} :: ${String(e).slice(0, 120)}`);
  }
}

const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--use-gl=angle'] });
const queue = [...list];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const s = queue.shift();
      await capture(browser, s);
    }
  })
);
await browser.close();
fs.writeFileSync(path.join(OUT, `_log-${group}.json`), JSON.stringify(log, null, 2));
console.log(`\nDONE ${group}: ${log.filter((l) => l.ok).length}/${log.length}`);
