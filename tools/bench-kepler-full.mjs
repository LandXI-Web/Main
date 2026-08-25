import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'shots/bench/taste';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const SAMPLE = process.argv[2] || 'California Earthquakes';
const TAG = process.argv[3] || 'quake';

const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--use-gl=angle','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: `${OUT}/video-${TAG}`, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();
const shot = async (n) => { try { await page.screenshot({ path: `${OUT}/kepler-${TAG}-${n}.png` }); log('  shot', n); } catch(e){ log('  shotfail', n, e.message); } };
const clickText = async (t, timeout=6000) => {
  try { await page.getByText(t, { exact: false }).first().click({ timeout }); log('  click:', t); return true; }
  catch { log('  nolick:', t); return false; }
};

await page.goto('https://kepler.gl/demo', { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(9000);
await clickText('Already provided my feedback', 4000);
await sleep(1200);
await clickText('Try sample data', 8000);
await sleep(4500);
// click the sample CARD (thumbnail), not just the text node
let loaded = false;
try {
  const card = page.locator(`img[alt="${SAMPLE}"], [class*=sample-map] >> nth=0`);
  const byImg = page.locator(`img[alt="${SAMPLE}"]`).first();
  if (await byImg.count()) { await byImg.click({ timeout: 8000 }); loaded = true; log('  clicked img card'); }
} catch(e){ log('  img click fail', e.message); }
if (!loaded) {
  try {
    await page.evaluate((name) => {
      const els = Array.from(document.querySelectorAll('div,li,a'));
      const t = els.find(e => e.children.length && e.innerText && e.innerText.trim().startsWith(name) && e.querySelector('img'));
      if (t) { const img = t.querySelector('img'); (img||t).click(); }
    }, SAMPLE);
    log('  js-clicked card');
  } catch(e){ log('  js click fail', e.message); }
}
log('  loading sample...');
await sleep(16000);
// force-close any lingering modal
try { await page.locator('.ReactModal__Content [class*=close], .ReactModal__Content svg').last().click({ timeout: 3000 }); } catch(e){}
try { await page.keyboard.press('Escape'); } catch(e){}
await sleep(2500);
await shot('10-loaded');

// ---- measure the chrome ----
try {
  const m = await page.evaluate(() => {
    const panel = document.querySelector('[class*=side-panel], [class*=SidePanel], [class*=side-bar]');
    const cs = panel ? getComputedStyle(panel) : null;
    const fonts = new Map();
    const sizes = new Map();
    for (const el of Array.from(document.querySelectorAll('body *')).slice(0,3000)) {
      const r = el.getBoundingClientRect(); if (r.width<1||r.height<1) continue;
      const c = getComputedStyle(el);
      fonts.set(c.fontFamily, (fonts.get(c.fontFamily)||0)+1);
      if (!el.childElementCount && el.textContent.trim()) sizes.set(`${c.fontSize}/${c.fontWeight}/${c.letterSpacing}/${c.textTransform}/${c.color}`, (sizes.get(`${c.fontSize}/${c.fontWeight}/${c.letterSpacing}/${c.textTransform}/${c.color}`)||0)+1);
    }
    const top=(m,n)=>[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);
    const canvases = Array.from(document.querySelectorAll('canvas')).map(c=>({w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight,cls:c.className}));
    return {
      bodyFont: getComputedStyle(document.body).fontFamily,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      panelBg: cs?cs.backgroundColor:null, panelW: cs?cs.width:null, panelFont: cs?cs.fontFamily:null,
      fonts: top(fonts,8), sizes: top(sizes,18), canvases,
      panelText: panel ? panel.innerText.slice(0,2500) : null,
    };
  });
  fs.writeFileSync(`${OUT}/kepler-${TAG}-measure.json`, JSON.stringify(m, null, 2));
  log('  measured. panelBg=', m.panelBg, 'font=', m.bodyFont);
} catch(e){ log('  measure fail', e.message); }

// ---- expand layer config ----
try {
  const arrows = await page.locator('[class*=layer-panel] [class*=panel__header], [class*=layer-panel__header]').all();
  log('  layer headers:', arrows.length);
  if (arrows.length) { await arrows[0].click({ timeout: 5000 }); await sleep(2500); await shot('11-layer-config'); }
} catch(e){ log('  layerconf fail', e.message); }

// scroll the side panel to see color ramp / config
try {
  await page.evaluate(() => {
    const sc = Array.from(document.querySelectorAll('*')).find(e => e.scrollHeight > e.clientHeight+80 && e.clientHeight>300 && e.getBoundingClientRect().left < 500);
    if (sc) sc.scrollTop = 400;
  });
  await sleep(1500); await shot('12-panel-scroll');
  await page.evaluate(() => {
    const sc = Array.from(document.querySelectorAll('*')).find(e => e.scrollHeight > e.clientHeight+80 && e.clientHeight>300 && e.getBoundingClientRect().left < 500);
    if (sc) sc.scrollTop = 900;
  });
  await sleep(1500); await shot('13-panel-scroll2');
} catch(e){}

// ---- color ramp palette picker ----
try {
  const sw = page.locator('[class*=color-selector], [class*=ColorSelector], [class*=color-range]').first();
  await sw.click({ timeout: 5000 }); await sleep(2500); await shot('14-color-ramp');
  await page.keyboard.press('Escape'); await sleep(1000);
} catch(e){ log('  colorramp fail'); }

// ---- Filters tab (time playback) ----
try {
  await page.locator('[class*=side-panel__tab], [class*=panel-tab]').nth(1).click({ timeout: 5000 });
  await sleep(2000); await shot('20-filters-tab');
  await clickText('Add Filter', 5000); await sleep(2500); await shot('21-filter-added');
} catch(e){ log('  filters fail', e.message); }

// ---- Interact / tooltip tab ----
try {
  await page.locator('[class*=side-panel__tab], [class*=panel-tab]').nth(2).click({ timeout: 5000 });
  await sleep(2000); await shot('22-interact-tab');
} catch(e){}
// ---- Base map tab ----
try {
  await page.locator('[class*=side-panel__tab], [class*=panel-tab]').nth(3).click({ timeout: 5000 });
  await sleep(2000); await shot('23-basemap-tab');
} catch(e){}

// back to layers
try { await page.locator('[class*=side-panel__tab], [class*=panel-tab]').nth(0).click({ timeout: 4000 }); await sleep(1500); } catch(e){}

// ---- hover tooltip on the map ----
const CX = 950, CY = 470;
try {
  for (const [dx,dy] of [[0,0],[40,-30],[-60,50],[80,60]]) {
    await page.mouse.move(CX+dx, CY+dy, { steps: 12 });
    await sleep(1600);
    await shot(`30-hover-${dx}_${dy}`);
  }
} catch(e){ log('  hover fail', e.message); }

// ---- 3D tilt (ctrl/right-drag) ----
try {
  await page.mouse.move(CX, CY);
  await page.keyboard.down('Control');
  await page.mouse.down();
  for (let i=0;i<24;i++){ await page.mouse.move(CX, CY - i*7, { steps: 2 }); await sleep(40); }
  await page.mouse.up();
  await page.keyboard.up('Control');
  await sleep(3000); await shot('40-tilt3d');
  // rotate
  await page.mouse.move(CX, CY); await page.keyboard.down('Control'); await page.mouse.down();
  for (let i=0;i<20;i++){ await page.mouse.move(CX + i*9, CY-160, { steps: 2 }); await sleep(40); }
  await page.mouse.up(); await page.keyboard.up('Control');
  await sleep(2500); await shot('41-rotate3d');
} catch(e){ log('  tilt fail', e.message); }

// ---- zoom in (scroll) ----
try {
  await page.mouse.move(CX, CY);
  for (let i=0;i<6;i++){ await page.mouse.wheel(0, -220); await sleep(500); }
  await sleep(3000); await shot('50-zoomed');
  for (let i=0;i<4;i++){ await page.mouse.wheel(0, 300); await sleep(450); }
  await sleep(2500); await shot('51-zoomout');
} catch(e){ log('  zoom fail', e.message); }

// ---- pan drag (for the video) ----
try {
  for (let k=0;k<2;k++){
    await page.mouse.move(CX,CY); await page.mouse.down();
    for (let i=0;i<18;i++){ await page.mouse.move(CX - i*10, CY + i*4, { steps:2 }); await sleep(45); }
    await page.mouse.up(); await sleep(1800);
  }
  await shot('52-panned');
} catch(e){}

// ---- play the time filter if present ----
try {
  const play = page.locator('[class*=playback] svg, [class*=animation-control] svg, [class*=play-control] svg').first();
  await play.click({ timeout: 4000 });
  log('  playing animation');
  for (let i=0;i<5;i++){ await sleep(2200); await shot(`60-playback-${i}`); }
} catch(e){ log('  playback fail', e.message); }

await sleep(2000);
await shot('99-final');
await ctx.close();
await browser.close();
log('DONE ' + TAG);
