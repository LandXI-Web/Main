// design-canvas/v2/*.dc.html → design-canvas/v2/renders/<Name>.png
// tools/design-render.mjs 를 v2 경로(이미지 = design-canvas/v2/img/)에 맞춰 옮긴 것.
// 각 아트보드(<x-dc>…</x-dc>) 마크업을 최소 HTML 로 감싸 1440×900 PNG 로 찍는다.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const dir = import.meta.dirname;
const outDir = path.join(dir, 'renders');
const tmpDir = path.join(dir, '_tmp');

const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(dir).filter(f => f.endsWith('.dc.html')).map(f => f.replace('.dc.html', '')).sort();

function extractArtboard(src) {
  const xdc = /<x-dc>([\s\S]*?)<\/x-dc>/.exec(src);
  if (!xdc) throw new Error('no <x-dc> found');
  let inner = xdc[1];

  const helmet = /<helmet>([\s\S]*?)<\/helmet>/.exec(inner);
  let styleTag = '';
  if (helmet) {
    const style = /<style>([\s\S]*?)<\/style>/.exec(helmet[1]);
    if (style) styleTag = `<style>${style[1]}</style>`;
    inner = inner.slice(0, helmet.index) + inner.slice(helmet.index + helmet[0].length);
  }
  inner = inner.replace(/<script src="\.\/support\.js"><\/script>\s*/g, '');
  // <img src="name.jpg"> → ../img/name.jpg (tmp page lives in v2/_tmp/)
  inner = inner.replace(/(<img[^>]*\bsrc=")([^./][^"]*\.(?:jpg|jpeg|png|webp|svg))(")/g,
    (_m, pre, file, post) => `${pre}../img/${file}${post}`);

  const fontsLink = /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)">/.exec(src);
  // 아트보드 높이 = 루트 div 의 height (1440×900 기본 · 대시보드류 1048)
  const hm = /width:1440px;height:(\d+)px/.exec(inner);
  return { bodyMarkup: inner.trim(), styleTag, fontsHref: fontsLink ? fontsLink[1] : '', height: hm ? +hm[1] : 900 };
}

const buildPage = ({ bodyMarkup, styleTag, fontsHref }) => `<!doctype html>
<html><head><meta charset="utf-8">
${fontsHref ? `<link rel="stylesheet" href="${fontsHref}">` : ''}
${styleTag}
</head><body style="margin:0">
${bodyMarkup}
</body></html>
`;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    for (const name of names) {
      const src = fs.readFileSync(path.join(dir, `${name}.dc.html`), 'utf8');
      const tmpPath = path.join(tmpDir, `${name}.html`);
      const art = extractArtboard(src);
      fs.writeFileSync(tmpPath, buildPage(art), 'utf8');
      await page.setViewportSize({ width: 1440, height: art.height });
      await page.goto(url.pathToFileURL(tmpPath).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `${name}.png`), clip: { x: 0, y: 0, width: 1440, height: art.height } });
      console.log('saved renders/' + name + '.png');
    }
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exit(1); });
