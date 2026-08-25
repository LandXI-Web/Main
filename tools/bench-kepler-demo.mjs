import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'shots/bench/taste';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--use-gl=angle','--ignore-gpu-blocklist','--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type()==='error') console.log('  [cerr]', m.text().slice(0,140)); });

console.log('>> kepler demo');
await page.goto('https://kepler.gl/demo', { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(9000);
await page.screenshot({ path: `${OUT}/kepler-demo-00-initial.png` });

// dump the sample map catalogue
const samples = await page.evaluate(async () => {
  try {
    const r = await fetch('https://raw.githubusercontent.com/keplergl/kepler.gl-data/master/index.json');
    return await r.json();
  } catch (e) { return { error: e.message }; }
});
fs.writeFileSync(`${OUT}/kepler-samples.json`, JSON.stringify(samples, null, 2));
console.log('samples:', Array.isArray(samples) ? samples.map(s=>s.id).join(', ') : JSON.stringify(samples).slice(0,300));

// also capture whatever modal is open
const modalTexts = await page.evaluate(() => Array.from(document.querySelectorAll('[class*=modal], [class*=Modal]')).slice(0,4).map(e=>e.innerText.slice(0,600)));
fs.writeFileSync(`${OUT}/kepler-demo-modal.txt`, modalTexts.join('\n\n=====\n\n'));

await ctx.close();
await browser.close();
console.log('DONE');
