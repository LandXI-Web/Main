// Render an SVG file to a PNG at a target pixel width, using Playwright (chromium),
// on a given background (default transparent / checkered not needed -- we composite
// on white or dark explicitly per call). Usage:
//   node tools/brand/render-svg.mjs <in.svg> <out.png> <widthPx> [bgColor]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const [, , svgPath, outPath, widthArg, bg] = process.argv;
if (!svgPath || !outPath || !widthArg) {
  console.error('usage: render-svg.mjs <in.svg> <out.png> <widthPx> [bgColor]');
  process.exit(1);
}
const width = parseInt(widthArg, 10);
const svg = readFileSync(path.resolve(svgPath), 'utf-8');
const vbMatch = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!vbMatch) throw new Error('no viewBox found in ' + svgPath);
const vbW = parseFloat(vbMatch[1]);
const vbH = parseFloat(vbMatch[2]);
const height = Math.round(width * vbH / vbW);

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:${bg || 'transparent'};}
svg{display:block;width:${width}px;height:${height}px;}</style>
</head><body>${svg}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: path.resolve(outPath), omitBackground: !bg });
await browser.close();
console.log('wrote', outPath, width + 'x' + height);
