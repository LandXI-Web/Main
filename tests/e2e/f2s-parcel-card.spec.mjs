// F2-A · 필지 카드 v2(EVIDENCE-PAIR) + 이력 타임라인 H-1 — 대장/현황 같은 행 높이 · '왜 의심인가' 줄 수 = 그 필지 findings 규칙 수 · skipped 점선 ·
//   결손 점선 3종(건축물대장 · 소유구분 · 용도지역 미결합) · 시점 라디오 2023/2025 → 막대 재성장 + 스크러버(배경) 동기 · 이력 ◆▣●▲▶ + 스크러버 커서 동기
// 실행: npx playwright test tests/e2e/f2s-parcel-card --reporter=line
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API && realm) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD || 'landxi-dev-2026' } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD || 'landxi-dev-2026' }) });
    session = await r.json();
  }
  await page.addInitScript(([s, api, realm, role, tenant]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    if (api) { localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); } else localStorage.setItem('lx_api_mode', 'off');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s)); else localStorage.removeItem('lx_api_session');
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); localStorage.removeItem('lx_tenant_session'); }
    else if (realm === 'tenant') { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-24T09:00:00+09:00' })); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.removeItem('lx_tenant_session'); }
  }, [session, API, realm, role, tenant]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 });
}
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  return errs;
}
const XI = '/landxi/xi/index.html';
const CITY = '?cam=127.47,35.425,12.5,35,0';
const cardReady = (page) => page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1' && !document.getElementById('pcard2').hidden, null, { timeout: 40000 });
const pairCheck = (page) => page.evaluate(() => {
  const el = document.getElementById('pcard2'), pair = el.querySelector('.sv-pair');
  const L = [...el.querySelector('.sv-lcol').children], R = [...el.querySelector('.sv-rcol').children];
  const rows = L.map((c, i) => { const a = c.getBoundingClientRect(), b = R[i]?.getBoundingClientRect(); return b ? [Math.round(a.top - b.top), Math.round(a.height - b.height)] : null; });
  return { n: [L.length, R.length], rows, why: el.querySelectorAll('.sv-why li[data-rule]').length, skip: el.querySelectorAll('.sv-why li.sv-skip').length, voids: [...el.querySelectorAll('.sv-lcol .cw-void')].map((v) => v.textContent), finds: +el.dataset.finds, pnu: el.dataset.pnu, pairRows: pair.dataset.rows };
});

test('R1 A 1위(아영면 아곡리 1053-12) — 같은 행 높이 · 왜 의심인가 1줄 = findings 1 · skipped · 결손 · 시점 라디오 → 막대 · 스크러버', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + CITY);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await page.evaluate(() => window.XI.parcelCard('5219045021110530012'));
  await cardReady(page);
  const r = await pairCheck(page);
  console.log(JSON.stringify(r));
  expect(r.pnu).toBe('5219045021110530012');
  expect(r.n).toEqual([7, 7]);
  for (const row of r.rows) expect(row).toEqual([0, 0]);          // 대장 i 행 ↔ 현황 i 행 같은 높이 · 같은 자리
  expect(r.why).toBe(r.finds); expect(r.why).toBe(1);
  expect(r.skip).toBe(1);
  expect(r.voids.join(' ')).toContain('건축HUB'); expect(r.voids.join(' ')).toContain('연속지적 미제공');
  const txt = await page.evaluate(() => document.getElementById('pcard2').textContent);
  for (const s of ['답', '4,556', '농림지역', '농업진흥구역', '11,300', '2,415', '53%', '0.97', '33㎡', '추정 초기값', '건축물대장 미대조']) expect(txt, s).toContain(s);
  // 시점 라디오 → 2025: 막대 재성장(WAAPI 500) + 스크러버(배경 영상) 끝 시점으로
  const scrub0 = await page.evaluate(() => ({ mode: document.getElementById('scrub').dataset.mode, e: window.__xi.scrub.S.e, eps: window.__xi.scrub.S.epochs.map((e) => e.id) }));
  await page.click('#pcard2 .sv-ep input[value="2025"]');
  const grow = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('#pcard2 .sv-bar')).map((a) => a.effect.getTiming().duration));
  await page.waitForTimeout(800);
  const s1 = await page.evaluate(() => ({ ep: document.getElementById('pcard2').dataset.ep, e: window.__xi.scrub.S.e, mode: document.getElementById('scrub').dataset.mode, eps: window.__xi.scrub.S.epochs.map((e) => e.id), chip: document.getElementById('hud-chip').dataset.src, rows: document.querySelector('#pcard2 .sv-pair').dataset.rows }));
  console.log('2025', JSON.stringify({ grow, s1, scrub0 }));
  expect(grow.every((d) => d === 500)).toBe(true);
  expect(await page.evaluate(() => document.querySelector('#pcard2 .sv-rcol').textContent)).toContain('2025 A02 AI 분석 없음');   // 이 필지는 2025 판독 없음 — 결손 정직
  await page.click('#pcard2 .sv-ep input[value="2023"]');
  const grow23 = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('#pcard2 .sv-bar')).map((a) => a.effect.getTiming().duration));
  expect(grow23.length).toBeGreaterThan(0); expect(grow23.every((d) => d === 500)).toBe(true);   // 막대 500 재성장
  await page.waitForTimeout(800);
  await page.click('#pcard2 .sv-ep input[value="2025"]'); await page.waitForTimeout(800);
  expect(s1.mode).toBe('parcel');                                  // 시점 라디오가 그 필지 시점 스크러버를 짓는다(배경 = 같은 축)
  expect(s1.eps[0]).toBe('ap25-namwon-2023');
  expect(s1.ep).toBe('2025'); expect(s1.e).toBe(s1.eps.length - 1); expect(s1.rows).toBe('7/7');
  expect(s1.chip).toBe(s1.eps[s1.eps.length - 1]);                   // 출처 칩 = 지금 보이는 시점
  // 스크러버를 0 으로 끌면 카드 라디오가 2023 으로(같은 축)
  await page.evaluate(() => window.__xi.scrub.set(0));
  expect(await page.evaluate(() => document.getElementById('pcard2').dataset.ep)).toBe('2023');
  expect(errs).toEqual([]);
});

test('규칙 2개 필지(동충동 41 · R4+R2) → 왜 의심인가 2줄 · 용도지역 미결합 필지 → 결손 점선 3종', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + CITY);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await page.evaluate(() => window.XI.parcelCard('5219010100100410000'));
  await cardReady(page);
  const a = await pairCheck(page);
  console.log('multi', JSON.stringify(a));
  expect(a.why).toBe(2); expect(a.finds).toBe(2);
  await page.evaluate(() => window.XI.parcelCard({ lng: 127.318287, lat: 35.320544 }));   // 송동면 도로(용도지역 미결합 19필지 중 하나)
  await page.waitForFunction(() => document.getElementById('pcard2').dataset.pnu === '5219033033109900004' && document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 40000 });
  const b = await pairCheck(page);
  console.log('unjoined', JSON.stringify(b));
  expect(b.voids.some((v) => v.includes('용도지역 미결합'))).toBe(true);
  expect(b.voids.length).toBeGreaterThanOrEqual(3);
  expect(b.why).toBe(0);
  expect(await page.evaluate(() => document.querySelector('#pcard2 .sv-why li.sv-none')?.textContent || '')).toContain('의심 없음');
  expect(errs).toEqual([]);
});

test('이력 ▾ 750 펼침 — ◆▣●▲ 마커(▶ 는 실제 종결 전이 때만 · 원천에 없는 날짜 0) · 스크러버를 끌면 커서가 따라오고 ▣ 를 누르면 스크러버가 그 시점으로', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + CITY);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await page.evaluate(() => window.XI.parcelCard('5219033033113950012'));   // README 사례 5 · R2 A · 2025 A02 비경작
  await cardReady(page);
  await page.click('#pcard2 .sv-tlb');
  await page.waitForFunction(() => +document.getElementById('pcard2').dataset.tl > 0, null, { timeout: 30000 });
  const anim = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('sv-tl')).map((a) => a.effect.getTiming().duration));
  await page.waitForTimeout(900);
  const t = await page.evaluate(() => ({ kinds: [...new Set([...document.querySelectorAll('#pcard2 .sv-mk')].map((m) => m.textContent))], sum: document.querySelector('#pcard2 .sv-tlsum').textContent, c0: document.querySelector('#pcard2 .sv-tl').dataset.cursor,
    marks: [...document.querySelectorAll('#pcard2 .sv-mk')].map((m) => ({ k: m.dataset.k, t: m.dataset.t })), listT: [...document.querySelectorAll('#pcard2 .sv-tlsum li[data-t]')].map((l) => ({ k: l.dataset.k, t: l.dataset.t })),
    actVoid: [...document.querySelectorAll('#pcard2 .sv-tlsum li[data-k="act"]')].map((l) => ({ void: l.dataset.void, t: l.dataset.t || null, text: l.textContent })) }));
  // 원천 날짜 집합: 이력 파일(namwon-parcel-timeline.json) · 시점 스크러버(카탈로그) · 대장(공시지가 기준 1월 · 연속지적 수집일) · 대조일 · 연도만(촬영월 미상)
  const TL = JSON.parse(fs.readFileSync('landxi/data/survey/namwon-parcel-timeline.json', 'utf8'));
  const tlRow = (TL.parcels || []).find((x) => x.pnu === '5219033033113950012');
  expect(tlRow, '이력 파일에 이 필지').toBeTruthy();
  const srcDates = new Set((tlRow?.events || []).flatMap((e) => [String(e.t || '').slice(0, 7), String(e.from || '').slice(0, 7)]).filter(Boolean));
  const eps = await page.evaluate(() => window.__xi.scrub.S.epochs.map((e) => String(e.date || e.label || '')));
  const today = new Date().toISOString().slice(0, 10);
  console.log('tl', JSON.stringify({ anim, t }));
  expect(anim).toContain(750);
  for (const k of ['◆', '▣', '●', '▲']) expect(t.kinds).toContain(k);
  expect(t.kinds).not.toContain('▶');                                 // 조치 마커는 실제 종결(closed) 전이 때만 — 이 필지는 open
  expect(t.marks.filter((m) => m.k === 'act')).toEqual([]);
  expect(t.actVoid).toHaveLength(1); expect(t.actVoid[0].void).toBe('1'); expect(t.actVoid[0].t).toBeNull();   // 날짜 없는 결손 줄
  expect(t.actVoid[0].text).toContain('현장 확인(inspected) 뒤 기록');
  for (const m of [...t.marks, ...t.listT]) {
    expect(m.t <= today, `미래 날짜 ${m.k} ${m.t}`).toBe(true);        // 원천에 없는 미래 날짜 0(1차 '2026-12' 재발 방지)
    const ok = /^\d{4}$/.test(m.t) || m.t === '2026-09-24' || m.t.startsWith('2026-09') || /^\d{4}-01$/.test(m.t) || srcDates.has(m.t.slice(0, 7)) || eps.some((d) => d && d.startsWith(m.t.slice(0, 7)));
    expect(ok, `원천 없는 날짜 ${m.k} ${m.t}`).toBe(true);
  }
  expect(t.sum).toContain('2025');
  await page.evaluate(() => window.__xi.scrub.set(1.5));
  const c1 = await page.evaluate(() => document.querySelector('#pcard2 .sv-tl').dataset.cursor);
  expect(+c1).toBeGreaterThan(+t.c0);
  await page.click('#pcard2 .sv-mk[data-ep="0"]');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__xi.scrub.S.e)).toBe(0);
  expect(errs).toEqual([]);
});
