import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'shots/bench/taste';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function measure(page, label) {
  try {
    const data = await page.evaluate(() => {
      const seen = new Map();
      const push = (m, k) => m.set(k, (m.get(k) || 0) + 1);
      const fonts = new Map(), sizes = new Map(), colors = new Map(), bgs = new Map();
      const els = Array.from(document.querySelectorAll('body *')).slice(0, 4000);
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const cs = getComputedStyle(el);
        push(fonts, cs.fontFamily);
        if (el.childElementCount === 0 && el.textContent.trim()) {
          push(sizes, `${cs.fontSize}/${cs.fontWeight}/${cs.letterSpacing}/${cs.lineHeight}`);
          push(colors, cs.color);
        }
        const bg = cs.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)') push(bgs, bg);
      }
      const top = (m, n) => [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);
      return {
        title: document.title,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyFont: getComputedStyle(document.body).fontFamily,
        htmlBg: getComputedStyle(document.documentElement).backgroundColor,
        fonts: top(fonts, 8), sizes: top(sizes, 14), colors: top(colors, 12), bgs: top(bgs, 14),
        headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0,25).map(h => {
          const cs = getComputedStyle(h);
          return { tag: h.tagName, text: h.textContent.trim().slice(0,110), font: cs.fontFamily.split(',')[0], size: cs.fontSize, weight: cs.fontWeight, ls: cs.letterSpacing, color: cs.color, transform: cs.textTransform };
        }),
        canvases: Array.from(document.querySelectorAll('canvas')).map(c => ({ w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight })),
        videos: Array.from(document.querySelectorAll('video')).map(v => ({ src: v.currentSrc || v.src, w: v.videoWidth, h: v.videoHeight, autoplay: v.autoplay, loop: v.loop })),
        imgCount: document.images.length,
        bigImages: Array.from(document.images).filter(i=>i.clientWidth>300).slice(0,15).map(i=>({src:(i.currentSrc||i.src).slice(0,160), w:i.clientWidth, h:i.clientHeight})),
      };
    });
    fs.writeFileSync(`${OUT}/${label}.json`, JSON.stringify(data, null, 2));
    console.log(`[measure] ${label} ok`);
  } catch (e) { console.log(`[measure] ${label} FAIL ${e.message}`); }
}

async function shot(page, name, opts = {}) {
  try {
    await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
    console.log(`  shot ${name}`);
  } catch (e) { console.log(`  shot ${name} FAIL ${e.message}`); }
}

const target = process.argv[2] || 'all';

const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });

// ---------------- PLANET ----------------
if (target === 'all' || target === 'planet') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const pages = [
    ['planet-home', 'https://www.planet.com/'],
    ['planet-insights', 'https://www.planet.com/products/planet-insights-platform/'],
    ['planet-monitoring', 'https://www.planet.com/products/monitoring/'],
    ['planet-tasking', 'https://www.planet.com/products/tasking/'],
    ['planet-superres', 'https://www.planet.com/products/superres/'],
    ['planet-gallery', 'https://www.planet.com/gallery/'],
    ['planet-about', 'https://www.planet.com/company/'],
  ];
  for (const [name, url] of pages) {
    console.log(`>> ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2000); await shot(page, `${name}-t2`);
      await sleep(2000); await shot(page, `${name}-t4`);
      await measure(page, `${name}-measure`);
      // mid scroll passes
      for (let i = 1; i <= 4; i++) {
        await page.evaluate((k) => window.scrollTo({ top: window.innerHeight * k * 1.0, behavior: 'instant' }), i);
        await sleep(1400);
        await shot(page, `${name}-scroll${i}`);
      }
      // full page
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(1200);
      await shot(page, `${name}-full`, { fullPage: true });
    } catch (e) { console.log(`  PAGE FAIL ${name}: ${e.message}`); }
  }
  await ctx.close();
}

// ---------------- KEPLER LANDING ----------------
if (target === 'all' || target === 'kepler') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  console.log('>> kepler.gl landing');
  try {
    await page.goto('https://kepler.gl/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000); await shot(page, 'kepler-landing-t3');
    await measure(page, 'kepler-landing-measure');
    for (let i = 1; i <= 5; i++) {
      await page.evaluate((k) => window.scrollTo({ top: window.innerHeight * k, behavior: 'instant' }), i);
      await sleep(1500);
      await shot(page, `kepler-landing-scroll${i}`);
    }
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(1000);
    await shot(page, 'kepler-landing-full', { fullPage: true });
  } catch (e) { console.log('kepler landing fail ' + e.message); }
  await ctx.close();
}

await browser.close();
console.log('DONE');
