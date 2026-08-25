// design-canvas/*.dc.html → design-canvas/renders/<Name>.png
// 각 아트보드(<x-dc>…</x-dc>)의 마크업을 뽑아 최소 HTML 페이지로 감싸고,
// 개발 서버(4173)를 통해 1440×900 PNG 참조 이미지로 찍는다.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const canvasDir = path.join(root, 'design-canvas');
const outDir = path.join(canvasDir, 'renders');
const tmpDir = path.join(outDir, '_tmp');
const port = process.env.PORT || 4173;
const base = `http://localhost:${port}`;

const names = [
  'A-Home', 'A-Dashboard', 'A-Workflow',
  'B-Home', 'B-Dashboard', 'B-Workflow',
  'C-Home', 'C-Dashboard', 'C-Workflow',
  'Main',
];

function extractArtboard(src) {
  const xdc = /<x-dc>([\s\S]*?)<\/x-dc>/.exec(src);
  if (!xdc) throw new Error('no <x-dc> found');
  let inner = xdc[1];

  // <helmet><style>…</style></helmet> → keep just the <style>…</style>
  const helmet = /<helmet>([\s\S]*?)<\/helmet>/.exec(inner);
  let styleTag = '';
  if (helmet) {
    const style = /<style>([\s\S]*?)<\/style>/.exec(helmet[1]);
    if (style) styleTag = `<style>${style[1]}</style>`;
    inner = inner.slice(0, helmet.index) + inner.slice(helmet.index + helmet[0].length);
  }

  // drop the support.js script line if it leaked into the artboard body
  inner = inner.replace(/<script src="\.\/support\.js"><\/script>\s*/g, '');

  // resolve <img src="name.jpg"> → design-canvas/img/name.jpg (served at /design-canvas/img/)
  inner = inner.replace(/(<img[^>]*\bsrc=")([^./][^"]*\.(?:jpg|jpeg|png|webp|svg))(")/g,
    (_m, pre, file, post) => `${pre}/design-canvas/img/${file}${post}`);

  const fontsLink = /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)">/.exec(src);
  const fontsHref = fontsLink ? fontsLink[1] : '';

  return { bodyMarkup: inner.trim(), styleTag, fontsHref };
}

function buildPage({ bodyMarkup, styleTag, fontsHref }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
${fontsHref ? `<link rel="stylesheet" href="${fontsHref}">` : ''}
${styleTag}
</head>
<body style="margin:0">
${bodyMarkup}
</body>
</html>
`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  try {
    for (const name of names) {
      const srcPath = path.join(canvasDir, `${name}.dc.html`);
      const src = fs.readFileSync(srcPath, 'utf8');
      const parts = extractArtboard(src);
      const html = buildPage(parts);

      const tmpPath = path.join(tmpDir, `${name}.html`);
      fs.writeFileSync(tmpPath, html, 'utf8');

      try {
        await page.goto(`${base}/design-canvas/renders/_tmp/${name}.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        const outPath = path.join(outDir, `${name}.png`);
        await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1440, height: 900 } });
        console.log('saved', path.relative(root, outPath));
      } finally {
        fs.rmSync(tmpPath, { force: true });
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
