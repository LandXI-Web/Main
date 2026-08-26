// tools/scrub/shoot-end.mjs — 브랜드 마감 판 9비트를 촬영한다 → shots/scrub/end-*.png
//
//   node tools/scrub/shoot-end.mjs            # end-0 … end-8 (+ end-9 reduced)
//
// 촬영 전에 마지막 레그와 인계 판(여수)을 실제로 올리고, V-World 타일이 다 들어올 때까지
// 기다린다(areTilesLoaded). 타일이 늦게 오는 프레임은 페이지가 아니라 네트워크의 사진이다.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 4173;
const URL = `http://localhost:${PORT}/landxi/proto/scrub/`;
const OUT = path.resolve(process.cwd(), 'shots/scrub');
fs.mkdirSync(OUT, { recursive: true });

// [파일명, 마감 진행도 e]  — 비트 경계: B .029 · C .229 · D .279 · E .35 · F .536 · G .586 · H .657 · I 1
const SHOTS = [
  ['end-0-lead', null], ['end-1-wordmark-in', 0.02], ['end-2-wordmark-shrunk', 0.226],
  ['end-3-haze', 0.255], ['end-4-tagline-wipe', 0.31], ['end-5-tagline-hold', 0.45],
  ['end-6-lockup-in', 0.62], ['end-7-lockup-hold', 0.80], ['end-8-final', 1],
];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
});

async function shoot(reduced) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__scrub && window.__scrub.ready === true', null, { timeout: 60000 });
  await page.waitForTimeout(800);

  if (reduced) {
    await page.evaluate(() => window.__scrub.seekEnd(0.6));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'end-9-reduced.png') });
    console.log('end-9-reduced');
  } else {
    for (const q of [0.5, 0.9, 1]) { await page.evaluate(x => window.__scrub.seek(x), q); await page.waitForTimeout(700); }
    await page.waitForFunction(() => { const p = window.__scrub.plate(1); return p && p.on; }, null, { timeout: 60000 });
    const tiles = () => page.waitForFunction(() => window.__scrub.plateMap(1).areTilesLoaded(), null, { timeout: 20000 }).catch(() => console.log('  (타일 대기 시간 초과)'));
    await tiles();
    for (const [name, e] of SHOTS) {
      if (e === null) await page.evaluate(() => window.__scrub.seek(1));
      else await page.evaluate(x => window.__scrub.seekEnd(x), e);
      await page.waitForTimeout(500);
      await tiles();
      await page.waitForTimeout(200);
      const st = await page.evaluate(() => { const s = window.__scrub.end(); const p = window.__scrub.plate(1);
        return { e: +s.e.toFixed(3), stage: s.stage, wm: +s.wordmark.opacity.toFixed(2), wmW: +s.wordmark.liveWidthPct.toFixed(3),
          base: +s.wordmark.baselinePct.toFixed(3), tag: +s.tagline.toFixed(2), lx: +s.lockup.toFixed(2), zoom: p && +p.zoom.toFixed(3) }; });
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      console.log(name, JSON.stringify(st));
    }
  }
  if (errors.length) console.log('ERRORS', errors);
  await ctx.close();
}
await shoot(false);
await shoot(true);
await browser.close();
