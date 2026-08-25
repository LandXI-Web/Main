import { chromium } from '@playwright/test';
import fs from 'node:fs';
const PORT = process.env.PORT || 4173;
const OUT = 'shots/proto';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(`http://localhost:${PORT}/landxi/proto/dive.html`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
await p.waitForTimeout(3000);

const A = 0.888, B = 0.988;
const step = (i) => A + (B - A) * (i / 6);
const FRAMES = [
  ['w-01-orbit', 0.05, 2600],
  ['w-02-clouds', 0.24, 2200],
  ['w-03-atlas', 0.50, 3600],
  ['w-04-descent', 0.66, 3600],
  ['w-05-descent-low', 0.755, 3600],
  ['w-06-landing', 0.835, 4600],
  ['w-07-res-yeosu-air', step(0), 7000],
  ['w-08-res-yeosu-drone', step(1), 7000],
  ['w-09-res-farmland', step(2), 7000],
  ['w-10-res-greenhouse', step(3), 7000],
  ['w-11-res-jeju', step(4), 7000],
  ['w-12-res-kuksan', step(5), 7000],
  ['w-13-res-change', step(6), 7000],
];
for (const [name, q, wait] of FRAMES) {
  await p.evaluate((v) => window.__dive.seek(v), q);
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

// 호버 — 색인 행(4px 이동 + 지점 강조)
await p.evaluate(() => window.__dive.seek(0.50));
await p.waitForTimeout(2600);
await p.hover('#index li:nth-child(2)');
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/w-14-hover-index.png` });
console.log('shot hover-index');

// 클릭 — 서비스 선택 → 판의 카메라가 결과로 난다
await p.click('#index li:nth-child(1)');
await p.waitForTimeout(6500);
await p.screenshot({ path: `${OUT}/w-15-select-marine.png` });
console.log('shot select');

// 신뢰도 슬라이더 라이브 필터
const before = await p.textContent('#rconf-n').catch(() => null);
if (before) {
  await p.evaluate(() => {
    const s = document.querySelector('#rconf');
    s.value = String(+s.min + (+s.max - +s.min) * 0.6);
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(900);
  const after = await p.textContent('#rconf-n');
  console.log('conf filter', before, '->', after);
  await p.screenshot({ path: `${OUT}/w-16-conf.png` });
}

// 결과 판 호버
await p.evaluate((v) => window.__dive.seek(v), step(2));
await p.waitForTimeout(6000);
await p.hover('#res-menu button:nth-child(2)');
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/w-17-hover-menu.png` });

console.log('--- errors ---\n' + errs.join('\n'));
const copy = await p.evaluate(() => {
  const t = document.querySelector('#ui').innerText.replace(/\s+/g, ' ').trim();
  return t.length;
});
console.log('copy chars(visible UI):', copy);
await b.close();
