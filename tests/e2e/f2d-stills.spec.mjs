// F2-D · 1차 판정 must_fix 5 — 정지화면 잘림 0. 3폭(1280 · 1440 · 1920) × 3장면(으슥아타 결과 절 · 소쿨룩 핀 · 메이크틸라 스와이프):
// 카드 머리(제목 행) 온전 · 보이는 글자 bbox ⊂ 뷰포트 · 카드 스크롤 가장자리는 머리(위) · 페이드(아래)로만 · 핀 상자 서로 겹침 0 · 카드·HUD 와 겹침 0 ·
// 14 px 미만 0 · 캔버스 ≥ 90 %. 정지화면은 shots/f2/D/still/ 에 남긴다.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

async function boot(page, url) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff');
  });
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
}
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return errs;
}
/** 화면 검사 — 잘린 글자 · 14 px 미만 · 핀 겹침 · 캔버스 면적 */
function audit() {
  const W = innerWidth, H = innerHeight;
  const vis = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; if (e.hidden) return false; } return true; };
  const card = document.getElementById('card'), cr = card && !card.hidden ? card.getBoundingClientRect() : null;
  const head = card?.querySelector('.g-card__head')?.getBoundingClientRect();
  const cut = [], small = [];
  const walker = document.createTreeWalker(document.getElementById('root'), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || !vis(el) || el.closest('.xi-prov-card, .gs-list, #date')) continue;   // 호버 카드(숨김) · 글로브 전용 패널(무대 밖)
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const inCard = cr && card.contains(el) && !el.closest('.g-card__head');
      if (inCard) {
        if (r.bottom <= cr.top || r.top >= cr.bottom) continue;                 // 스크롤로 완전히 밖 — 보이지 않음
        if (r.top < (head ? head.bottom : cr.top)) continue;                    // 머리 밑(불투명 머리 + 페이드)로 들어간 줄
        if (r.bottom > cr.bottom && r.top >= cr.bottom - 28) continue;          // 아래 페이드 안(옅어지는 줄)
        if (r.bottom > cr.bottom + 0.5) { cut.push('card-bottom: ' + n.textContent.trim().slice(0, 40)); continue; }
      }
      if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) cut.push(`viewport: ${n.textContent.trim().slice(0, 40)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
    const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 14) small.push(`${fs}px ${n.textContent.trim().slice(0, 30)}`);
  }
  // 카드 머리: 제목 행이 카드 안에 온전히
  let headOk = true; if (cr && head) headOk = head.top >= cr.top - 0.5 && card.querySelector('.g-card__head h2').getBoundingClientRect().top >= cr.top - 0.5;
  // 핀 상자 · 깃발
  const boxes = [...document.querySelectorAll('.g-pin--anchored, .xi-lock-flag')].filter(vis).map((e) => ({ t: e.textContent.trim().slice(0, 20), r: e.getBoundingClientRect() }));
  const over = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i].r, b = boxes[j].r; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) over.push(`${boxes[i].t} × ${boxes[j].t}`); }
  const panels = [card, document.getElementById('hud')].filter((e) => e && !e.hidden && vis(e)).map((e) => e.getBoundingClientRect());
  for (const b of boxes.filter((x) => document.querySelector('.g-pin--anchored') && x.t)) for (const p of panels) { const a = b.r; if (a.left < p.right && p.left < a.right && a.top < p.bottom && p.top < a.bottom) over.push(`${b.t} × panel`); }
  const cv = document.querySelector('#map canvas').getBoundingClientRect();
  return { cut, small, headOk, over, pins: boxes.length, canvas: (cv.width * cv.height) / (W * H) };
}

const SIZES = [[1280, 800], [1440, 900], [1920, 1080]];
test.describe('F2-D stills — 3 widths · clipped glyphs 0', () => {
  test.setTimeout(180000);
  for (const [w, h] of SIZES) {
    test(`${w} — 으슥아타 결과 절 · 소쿨룩 핀 · 메이크틸라 스와이프`, async ({ page }) => {
      const errs = watch(page);
      await page.setViewportSize({ width: w, height: h });
      await boot(page, '/landxi/global/index.html?tenant=lx&locale=en');
      fs.mkdirSync('shots/f2/D/still', { recursive: true });
      const out = {};
      // ① 으슥아타 — 리플레이 끝 → 결과 절(자동 스크롤) · 표 열림
      await page.evaluate(() => window.__f1d.go('ysykata'));
      await page.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run({ speed: 120 }); });
      await page.waitForFunction(() => window.__f1d.scenes.ys.S.job === 'done' && document.querySelector('#ys-next'), null, { timeout: 60000 });
      await page.click('#ys-next [data-a="open"]');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `shots/f2/D/still/ysykata-result-${w}.png` });
      out.ys = await page.evaluate(audit);
      // ② 소쿨룩 — 시범지 핀(fx anchor) · 카드 스크롤 400(머리 sticky)
      await page.evaluate(() => window.__f1d.go('sokuluk'));
      await page.waitForTimeout(1200);
      await page.evaluate(() => document.getElementById('card').scrollTo({ top: 400 }));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `shots/f2/D/still/sokuluk-${w}.png` });
      out.sk = await page.evaluate(audit);
      // ③ 메이크틸라 — 스와이프(fx swipe)
      await page.evaluate(() => window.__f1d.go('meiktila'));
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__f1d.scenes.mk.swipeOn(55));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `shots/f2/D/still/meiktila-swipe-${w}.png` });
      out.mk = await page.evaluate(audit);
      fs.mkdirSync('shots/f2/D/logs', { recursive: true });
      fs.writeFileSync(`shots/f2/D/logs/e2e-stills-${w}.json`, JSON.stringify(out, null, 1));
      for (const [k, a] of Object.entries(out)) {
        expect(a.cut, `${k} clipped`).toEqual([]);
        expect(a.small, `${k} <14px`).toEqual([]);
        expect(a.headOk, `${k} card head`).toBe(true);
        expect(a.over, `${k} overlaps`).toEqual([]);
        expect(a.canvas).toBeGreaterThanOrEqual(0.9);
      }
      expect(out.sk.pins).toBeGreaterThanOrEqual(2);
      expect(errs).toEqual([]);
    });
  }
});
