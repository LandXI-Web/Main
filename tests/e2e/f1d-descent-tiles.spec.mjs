// F1-D · 선명한 하강(1차 판정 최우선) — 판정 투어 전체(남원→글로브→으슥아타→소쿨룩→메이크틸라)를 돌리며 100 ms 마다
// tileDeficit(화면 표본점의 맨 위 불투명 래스터 타일 줌이 이상 줌보다 몇 단계 낮은가 · 99 = 흰 화면)을 잰다.
// 기준: deficit ≥ 2 가 500 ms 넘게 이어지는 구간 0 · 콘솔 오류 0 · 빈 캐시(첫 방문)에서.
import { test, expect } from '@playwright/test';

test('하강·전환 중 2단계 이상 낮은 타일이 500 ms 넘게 보이는 구간 0(빈 캐시)', async ({ page }) => {
  test.setTimeout(240000);
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
  await page.goto('/landxi/global/index.html?tenant=lx&locale=en&from=namwon&tour=1');
  await page.waitForFunction(() => window.__f1d && window.__f1dTour, null, { timeout: 90000 });
  await page.evaluate(() => { window.__td = []; setInterval(() => { const R = document.getElementById('root').dataset; const cover = R.bcover === '1'; const a = cover ? window.__f1d.tileDeficitB() : window.__f1d.tileDeficit(); const b = R.swipe && !cover ? window.__f1d.tileDeficitB() : null; window.__td.push({ t: performance.now(), max: Math.max(a.max, b ? b.max : 0), scene: document.getElementById('root').dataset.scene }); }, 100); });
  await page.waitForFunction(() => window.__f1dTour === 'done', null, { timeout: 200000, polling: 500 });
  const td = await page.evaluate(() => window.__td);
  const runs = []; let cur = null;
  for (const s of td) { if (s.max >= 2) { cur ||= { t0: s.t, t1: s.t, scene: s.scene, worst: 0 }; cur.t1 = s.t; cur.worst = Math.max(cur.worst, s.max); } else if (cur) { runs.push(cur); cur = null; } }
  if (cur) runs.push(cur);
  const long = runs.filter((r) => r.t1 - r.t0 + 100 > 500).map((r) => `${r.scene} ${Math.round(r.t1 - r.t0 + 100)} ms worst ${r.worst}`);
  console.log('samples', td.length, 'runs', runs.length, 'long', JSON.stringify(long));
  expect(td.length).toBeGreaterThan(300);
  expect(long).toEqual([]);
  expect(errs).toEqual([]);
});
