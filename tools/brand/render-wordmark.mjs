// Render "LAND-XI" + gap + "PLATFORM" in a Google-Fonts geometric grotesque
// (fallback for the wordmark: the promo video frame has the letters clipped at
// both edges and fused with a busy background/airplane graphic that threshold+
// trace can't clean up). Layout is two explicit word spans plus a precisely
// sized spacer, with an optional horizontal scaleX to match the promo's
// measured width:cap-height ratio (the stock font's natural tracking runs far
// wider than the promo -- 13-14.5:1 vs the promo's ~9.7:1 -- so scaleX is used
// to condense uniformly rather than colliding strokes with extreme negative
// letter-spacing).
// Usage: node tools/brand/render-wordmark.mjs <out.png> <family> <weight> <letterSpacingEm> <gapPx> <scaleX> <fontSizePx>
import { chromium } from 'playwright';
import path from 'node:path';

const [, , outPath, family, weight, lsEm, gapPxArg, scaleXArg, fontSizeArg] = process.argv;
const fontSize = parseInt(fontSizeArg || '300', 10);
const ls = parseFloat(lsEm || '0');
const gapPx = parseFloat(gapPxArg || '0');
const scaleX = parseFloat(scaleXArg || '1');

const familyUrl = family.replace(/ /g, '+');
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${familyUrl}:wght@${weight}&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;padding:0;background:#000000;}
  #wrap{ display:inline-block; padding:${fontSize}px; transform:scaleX(${scaleX}); transform-origin:left top; }
  #t{
    font-family:'${family}', sans-serif;
    font-weight:${weight};
    font-size:${fontSize}px;
    color:#ffffff;
    letter-spacing:${ls}em;
    white-space:nowrap;
    display:flex;
    align-items:baseline;
    line-height:1;
  }
  #gap{ display:inline-block; width:${gapPx}px; }
</style>
</head><body><div id="wrap"><span id="t"><span>LAND-XI</span><span id="gap"></span><span>PLATFORM</span></span></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(async () => { await document.fonts.ready; });
const el = await page.$('#wrap');
const box = await el.boundingBox();
await page.setViewportSize({ width: Math.ceil(box.width) + 8, height: Math.ceil(box.height) + 8 });
await page.screenshot({ path: path.resolve(outPath) });
await browser.close();
console.log('wrote', outPath, box.width, box.height);
