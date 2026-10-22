// 구현 22 · XI맵 전국 분석 결과(원칙 218) — 10-14 3차 구조(구현 29)로 기대값 고침: 자산을 고르지 않고 농지 전수 · 하천 · 계곡이 함께 · 범례 칸 · 빗금 없음.
// 로그인 폼 입력만(세션 주입 0) · 게이트웨이 :8700 · GPU 0 · 쓰기 0.
// 열자마자: 빛 층 0 · 자산마다 결과 면(판 번호 주소) · 지도 안 왼쪽 위 합계 = 서버(전국 결과 장부 + 진행 장부) → 시군구 올림 → 읍면동 올림 · 누르면 날아감 → 업무 거르기 · 원래대로.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const NCLS = { farm: ['경작지', '비닐하우스'], river: ['건물'] };
const TASK_OF = { '경작·휴경': '경작지', 경작: '경작지', 건축물: '건물' };
/** 서버 값으로 센 합계(화면과 같은 규칙 — 서비스 결과 장부 + 자산마다 한 분류씩 · 전국 분석은 같은 업무의 서비스 결과가 덮은 읍면동을 뺀 수(서버 net · 겹친 읍면동은 한 번만 · 10-22 바퀴 22) · net 이 없으면 찾은 수) */
const natN = (c) => (c?.net ?? c?.n)?.value ?? (typeof (c?.net ?? c?.n) === 'number' ? (c?.net ?? c?.n) : 0);
const total = (bd, pj, task = null) => {
  let n = 0;
  for (const s of bd.services) if (!task || (TASK_OF[s.name] || s.name) === task) n += s.n.value;
  for (const [a, A] of Object.entries(pj.assets)) if (A.on !== false) for (const c of NCLS[a] || []) if (!task || c === task) n += natN(A.counts?.[c]);
  return n;
};

test('전국 분석 결과 — 모든 결과 함께 · 합계 = 서버 · 올림 · 누름 · 업무 거르기', async ({ page, baseURL, request }) => {
  test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
  test.skip(!(await up(request)), '게이트웨이 꺼짐');
  test.setTimeout(150000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
  let lastProg = null;
  page.on('response', (r) => { if (/\/national\/progress$/.test(new URL(r.url()).pathname)) r.json().then((j) => { lastProg = j; }).catch(() => {}); });
  // 첫 화면 자료는 첫 화면 묶음(GET /ximap/boot · 줄마다 경로 하나의 응답 · impl-38)으로 온다 — 화면이 쓴 진행 장부 · 전국 결과는 그 줄(__lxBoot.peek)
  await page.goto('v3/xi-clean/');
  await page.waitForFunction(() => window.__xc?.boot?.shown, null, { timeout: 30000 });
  // 묶음이 실패했으면 화면은 따로 불렀다 — 그때는 같은 경로를 다시 읽는다
  const [pj, bd] = await page.evaluate(async () => Promise.all(['/national/progress', '/ximap/board'].map(async (p) => window.__lxBoot?.peek(p)?.b
    ?? (await fetch('http://localhost:8700/api/v1' + p, { headers: { authorization: 'Bearer ' + JSON.parse(localStorage.getItem('lx_api_session')).token } })).json())));
  expect(pj?.assets && bd).toBeTruthy();
  await page.waitForFunction(() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.xb-hud .xb-k'), null, { timeout: 30000 });

  // 빛나는 밀도 0 · 빗금 0 · 자산마다 결과 면(판 번호 주소) — 자산 고르기 없음
  const on = Object.entries(pj.assets).filter(([, a]) => a.on !== false).map(([k]) => k);
  const st = await page.evaluate(() => { const m = window.__xc.map, s = m.getStyle();
    return { heat: s.layers.filter((l) => l.type === 'heatmap').length, ids: s.layers.filter((l) => /^xn-/.test(l.id)).map((l) => l.id),
      tiles: Object.fromEntries(Object.entries(s.sources).filter(([k]) => /^xn-(farm|river)$/.test(k)).map(([k, v]) => [k, v.tiles?.[0] || ''])) }; });
  expect(st.heat).toBe(0);
  expect(st.ids.filter((id) => /hatch/.test(id))).toEqual([]);
  for (const a of on) {
    expect(st.ids).toContain(`xn-${a}-face`);
    expect(st.tiles[`xn-${a}`]).toMatch(new RegExp(`/tiles/national/${a}/\\d{4}/\\{z\\}/\\{x\\}/\\{y\\}\\.pbf\\?v=`));
    expect(st.tiles[`xn-${a}`]).toContain('v=' + encodeURIComponent(pj.v[a]));
  }
  await expect(page.locator('.xna-card, .xb-leg, .xb-chip')).toHaveCount(0);   // 범례 · 자산 칸 없음
  await expect(page.locator('.xb-hud .xb-k')).toHaveText(/^[\d,]+ 시군구 · [\d,]+ 서비스 제공중$/);   // 10-17 원칙 271 — 한 줄

  // 합계 = 서버(작업기가 도는 동안 진행 장부가 늘 수 있어 화면이 읽은 값과 다시 읽은 값 사이)
  const shown = await page.evaluate(() => window.__xc.hud.n);
  const pj2 = lastProg;                                 // 화면이 다시 읽은 진행 장부(30초마다) 중 마지막
  const lo = total(bd, pj), hi = pj2?.assets ? total(bd, pj2) : lo;
  expect(shown).toBeGreaterThanOrEqual(lo);
  expect(shown).toBeLessThanOrEqual(Math.max(lo, hi));
  // 10-17 원칙 271: 왼쪽 위에 큰 숫자는 없다 — 합계는 __xc.hud.n(말풍선 · 통계와 같은 셈)으로만 본다

  // 읍면동 줌 — 올리면 그 읍면동 말풍선(끝난 곳 = 장부 숫자 · 아직인 곳 = '분석 예정') → 누르면 날아감
  await page.evaluate(() => { window.__xc.map.jumpTo({ center: [127.2, 35.75], zoom: 9 }); });
  await page.waitForFunction(() => { const m = window.__xc.map; const ls = m.getStyle().layers.filter((l) => /^xn-.*-hit$/.test(l.id)).map((l) => l.id); return !m.isMoving() && m.queryRenderedFeatures({ layers: ls }).length > 0; }, null, { timeout: 20000 });
  let pt = null;
  for (let k = 0; k < 10 && !pt; k++) {
    if (k) await page.waitForTimeout(500);
    pt = await page.evaluate(() => { const m = window.__xc.map, c = m.getCanvas(), r = c.getBoundingClientRect();
      const ls = m.getStyle().layers.filter((l) => /^xn-.*-hit$/.test(l.id)).map((l) => l.id);
      for (let y = r.height * 0.15; y < r.height * 0.95; y += 19) for (let x = r.width * 0.42; x < r.width * 0.92; x += 19) {
        if (m.queryRenderedFeatures([x, y], { layers: ls }).length) return [x + r.x, y + r.y];
      } return null; });
  }
  expect(pt).not.toBeNull();
  await page.mouse.move(pt[0] - 5, pt[1]);
  await page.mouse.move(pt[0], pt[1]);
  const tip = page.locator('.xb-tipcard');
  await expect(tip).toBeVisible({ timeout: 5000 });
  await expect(tip).not.toContainText('누르면');                               // 설명 문구 없음(원칙 230)
  await expect(tip).not.toContainText('null');
  if ((await tip.getAttribute('data-done')) === '0') await expect(tip).toContainText('분석 예정');
  else await expect(tip.locator('.xb-tc-rows li').first()).toContainText(/곳|동/);
  const z0 = await page.evaluate(() => window.__xc.map.getZoom());
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForFunction((z) => { const m = window.__xc.map; return !m.isMoving() && m.getZoom() >= Math.min(12.5, Math.max(z + 3, 11.6)) - 0.05; }, z0, { timeout: 15000 });
  await expect(tip).toBeHidden();
  await expect(page.locator('.xb-pin')).toBeVisible({ timeout: 5000 });       // 누른 자리 옆 말풍선

  // 업무 거르기(XI ChatGEO 업무 거르기와 같은 동작) — 그 업무 결과만 · 합계 = 그 업무 서버 값 · 원래대로
  await page.evaluate(() => { window.__xc.map.jumpTo({ center: [127.8, 36.1], zoom: 6.6 }); });
  await page.waitForTimeout(800);
  const done = page.evaluate(() => new Promise((res) => document.addEventListener('kit:agent-action-done', (e) => res(e.detail), { once: true })));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('kit:agent-action', { cancelable: true, detail: { op: 'map_task', task: '비닐하우스' } })));
  expect((await done).ok).toBe(true);
  await expect(page.locator('.xb-hud .xb-task span')).toHaveText('비닐하우스');   // 10-17: 거르기 중이면 한 줄 아래 업무 칩 + '원래대로'
  const nTask = await page.evaluate(() => window.__xc.hud.n);
  expect(nTask).toBeGreaterThanOrEqual(total(bd, pj, '비닐하우스'));
  const flt = await page.evaluate(() => JSON.stringify(window.__xc.map.getFilter('xn-farm-face')));
  expect(flt).toContain('비닐하우스');
  expect(flt).not.toContain('경작지');
  await page.locator('.xb-reset').click();
  await expect(page.locator('.xb-hud .xb-task')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xc.task)).toBeNull();
  expect(errs).toEqual([]);
});
