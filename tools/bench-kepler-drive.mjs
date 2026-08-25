import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'shots/bench/taste';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--use-gl=angle','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();

const shot = async (n) => { try { await page.screenshot({ path: `${OUT}/${n}.png` }); log('  shot', n); } catch(e){ log('  shot fail', n, e.message); } };
const clickText = async (t, timeout=6000) => {
  try { await page.getByText(t, { exact: false }).first().click({ timeout }); log('  clicked:', t); return true; }
  catch (e) { log('  no click:', t); return false; }
};

await page.goto('https://kepler.gl/demo', { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(9000);

// dismiss survey banner
await clickText('Already provided my feedback', 4000);
await sleep(1500);
await shot('kepler-demo-01-empty');

// open sample gallery
await clickText('Try sample data', 8000);
await sleep(5000);
await shot('kepler-demo-02-sample-gallery');

const gallery = await page.evaluate(() => {
  const m = document.querySelector('[class*=Modal], [class*=modal]');
  return m ? m.innerText.slice(0, 3000) : 'none';
});
fs.writeFileSync(`${OUT}/kepler-sample-gallery.txt`, gallery);
log('--- GALLERY ---\n' + gallery.slice(0, 1200));

// scroll gallery and shoot again
await page.evaluate(() => {
  const sc = Array.from(document.querySelectorAll('*')).find(e => e.scrollHeight > e.clientHeight + 100 && e.clientHeight > 200 && e.closest('[class*=odal]'));
  if (sc) sc.scrollTop = sc.scrollHeight / 2;
});
await sleep(1500);
await shot('kepler-demo-03-sample-gallery-scroll');

await ctx.close();
await browser.close();
log('DONE');
