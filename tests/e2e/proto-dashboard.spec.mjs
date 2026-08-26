import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// 대시보드 B5 12.8 — 판 하나(대한민국 전도) + 토글 2 + 0.25° 그리드 + 등급 범례 + 셀 콜아웃.
// 조판 마스터 : design-canvas/v2/B5-Dashboard.dc.html · B5-Dashboard-Data.dc.html (1440×900)
// 조판 근거   : design-canvas/v2/NOTES.md §12.4(밴드) + §12.8(판 내부)
// 기능 대조표 : docs/superpowers/proto/2026-08-26-dashboard-parity.md (A1–A11 / B1–B16)
// 법전       : design/system.md
const URL = 'proto/dashboard.html';
// 판은 EOX 타일과 unpkg maplibre 를 실제로 받아온다 — 전체 스위트에서 30s 는 빠듯하다.
test.describe.configure({ timeout: 60000 });
const SHOTS = 'shots/proto';
fs.mkdirSync(SHOTS, { recursive: true });

// 오프라인/외부 CDN 실패는 이 프로토의 정상 동작이다. 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|preloaded using link preload|WebGL|eox|maps\.eox|unpkg/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!NETWORK.test(t)) errs.push(`console: ${t}`);
  });
  return errs;
}

// 원장은 지도를 기다리지 않는다 — 두 준비 신호가 따로 있다(dash = 원장, plate = 판).
async function boot(page, { plate = true } = {}) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(URL);
  await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready', null, { timeout: 40000 });
  if (plate) await page.waitForFunction(() => document.documentElement.dataset.plate === 'ready', null, { timeout: 40000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}
/** 남원 3건 셀(127.25–127.50 / 35.50–35.75) — 원판 콜아웃이 선 자리. */
const namwon = (page) => page.evaluate(() => window.__dash.indexOf(127.25, 35.5));

/* ── 로그인 관문 ──────────────────────────────────────────────────────── */

test('로그인 관문 — 플래그가 없으면 관리자 화면이 한 프레임도 새지 않는다', async ({ page }) => {
  await page.goto(URL);
  await page.waitForURL(/login\.html/, { timeout: 10000 });
  expect(decodeURIComponent(page.url())).toContain('proto/login.html?next=dashboard.html');
});

/* ── A. 좌측 레일 A1–A11 ──────────────────────────────────────────────── */

test('A1–A11 레일 — 원본 include/header.html 의 메뉴가 순서까지 그대로다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  // 마스터는 두 항목을 두 줄로 접는다(white-space:pre-line) — 이름 자체는 원본 그대로다.
  const names = (await page.locator('#rail .rail-i .rl').allInnerTexts()).map((s) => s.replace(/\s+/g, ' '));
  expect(names).toEqual([
    '대시보드', '데이터 관리', '프로젝트', '분석 서비스', '지도 서비스',
    '서비스 지원', '카드 발행 관리', '서비스 관리', 'MY', '로그아웃',
  ]);
  // 대응 관계로 원본 파일명을 남긴다.
  const titles = await page.locator('#rail .rail-i').evaluateAll((n) => n.map((e) => e.title));
  expect(titles).toContain('원본 dataset.html');
  expect(titles).toContain('원본 ximap.html');
  // 현재 페이지 = 대시보드 하나만 활성.
  await expect(page.locator('#rail .rail-i[aria-current]')).toHaveCount(1);
  await expect(page.locator('#rail [data-menu="dashboard"]')).toHaveAttribute('aria-current', 'page');
  // 마스터 좌표 — 58px 항목이 72부터, 하단 묶음은 596부터.
  const tops = await page.locator('#rail .rail-i').evaluateAll((n) => n.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops).toEqual([72, 130, 188, 246, 304, 596, 654, 712, 770, 828]);
  expect(errs).toEqual([]);
});

test('A11 로그아웃 — 원본과 동작까지 1:1(lx_logged_in 삭제 → home)', async ({ page }) => {
  // 관문 플래그를 initScript 로 심으면 이동 뒤에 다시 심긴다 — 여기서는 손으로 심는다.
  await page.goto('proto/login.html');
  await page.evaluate(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(URL);
  await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready', null, { timeout: 40000 });
  await page.locator('#rail [data-action="logout"]').click();
  await page.waitForURL(/home\.html/, { timeout: 10000 });
  expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBeNull();
});

/* ── B. 밴드 조판 (§12.4) ─────────────────────────────────────────────── */

test('세로 밴드 — 헤어라인 y 가 마스터와 같다(≤2px)', async ({ page }) => {
  await boot(page);
  const hair = await page.evaluate(() => [...new Set([...document.querySelectorAll('#stage *')]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return Math.abs(r.height - 1) < 0.6 && r.width > 400
        && getComputedStyle(e).backgroundColor === 'rgb(221, 221, 221)';
    })
    .map((e) => Math.round(e.getBoundingClientRect().top)))].sort((a, b) => a - b));
  expect(hair).toEqual([64, 156, 302, 460, 598, 708, 748, 774, 802, 830, 866]);
});

test('마진 56 · 레일 72 · 판 572×254 (y 378–632)', async ({ page }) => {
  await boot(page);
  const g = await page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10); };
    return { rail: r('#rail'), plate: r('#plate-box'), title: r('#b1'), mast: r('#mast') };
  });
  expect(g.rail).toEqual([0, 0, 72, 900]);
  expect(g.plate).toEqual([128, 378, 572, 254]);
  expect(g.mast).toEqual([128, 0, 1256, 64]);
  expect(g.title.slice(0, 2)).toEqual([128, 92]);
});

test('B1 제목 SUIT 32 · 부제 15 · KPI 값 Inter 56', async ({ page }) => {
  await boot(page);
  const t = await page.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s));
    return {
      h1: [cs('#b1 h1').fontSize, cs('#b1 h1').fontWeight, cs('#b1 h1').fontFamily.split(',')[0].replace(/"/g, '')],
      sub: cs('#b1 .sub').fontSize,
      kpi: [cs('.k .kv b').fontSize, cs('.k .kv b').fontFamily.split(',')[0].replace(/"/g, '')],
    };
  });
  expect(t.h1).toEqual(['32px', '500', 'SUIT']);
  expect(t.sub).toBe('15px');
  expect(t.kpi).toEqual(['56px', 'Inter']);
});

/* ── B3 · B2 · B4–B8 ──────────────────────────────────────────────────── */

test('B3 공지 스트립 + B2 기준일 — 원본 값 그대로', async ({ page }) => {
  await boot(page, { plate: false });
  await expect(page.locator('#b-notice')).toContainText('고위험 탐지 건 긴급 처리 안내');
  await expect(page.locator('#b-notice')).toContainText('2026.04.15');
  await expect(page.locator('#b-notice')).toContainText('전체 보기 ›');
  expect(await page.locator('#b-notice').getAttribute('href')).toBe('../notice.html?notice=8');
  await expect(page.locator('#b2')).toHaveText(/^\d{4}\.\d{2}\.\d{2}$/);
});

test('B4–B8 KPI 5 — 값·부제·딥링크가 원본과 같다', async ({ page }) => {
  await boot(page, { plate: false });
  await expect(page.locator('.k')).toHaveCount(5);
  const rows = await page.locator('.k').evaluateAll((n) => n.map((e) => [
    e.querySelector('.lab').textContent, e.querySelector('.kv b').textContent,
    e.querySelector('.kv em').textContent, e.querySelector('.ks').textContent,
  ]));
  expect(rows).toEqual([
    ['전체 사용자', '21', '명', '정상 19 · 가입 승인 대기 1'],
    ['발행 분석 카드', '8', '건', '공개 7 · 비공개 1'],
    ['카드 발행 승인 대기', '2', '건', '검토 필요 · ?status=대기'],
    ['가입 승인 대기', '1', '건', '승인 필요'],
    ['미답변 문의', '6', '건', '전체 12 · 답변 필요'],
  ]);
  // `|` 헤어라인 4, 카드 0
  await expect(page.locator('.kvl')).toHaveCount(4);
});

/* ── B9 백본 + 판 ─────────────────────────────────────────────────────── */

test('B9 백본 — XI-VFM v2.1 · 최종 적용 · 과제 14개(자백 포함)', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#b-bb')).toContainText('AI 기반 모델 (백본)');
  await expect(page.locator('#bb-ver')).toHaveText('XI-VFM v2.1');
  await expect(page.locator('#bb-applied')).toContainText('최종 적용 2026.03.12 · 연결된 분석 과제 14개');
  await expect(page.locator('#bb-applied')).toContainText('측정 10 · AOI 미지정 4');
});

test('원장은 판을 기다리지 않는다 — 판이 서기 전에 B1–B14 가 이미 서 있다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  // 판이 쓰는 위성 타일과 maplibre 를 끊어도 원장은 그려진다.
  await page.route(/tiles\.maps\.eox\.at|unpkg\.com/, (r) => r.abort());
  await page.goto(URL);
  await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready', null, { timeout: 40000 });
  await expect(page.locator('.k')).toHaveCount(5);
  await expect(page.locator('.pr')).toHaveCount(5);
  await expect(page.locator('.ap-row')).toHaveCount(2);
  await expect(page.locator('.ad')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.dataset.plate)).toBeUndefined();
});

test('판 — 위성 한 판 · 상호작용 없음 · 그리드/셀 레이어가 선다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const s = await page.evaluate(() => {
    const m = window.__dash.map;
    return {
      layers: ['eox', 'grat-1', 'grat-025', 'cells-fill', 'cells-line', 'cells-plan'].map((id) => !!m.getLayer(id)),
      drag: m.dragPan.isEnabled(), scroll: m.scrollZoom.isEnabled(),
      bearing: m.getBearing(), pitch: m.getPitch(),
      // 라벨·벡터 스타일 없음 — 심볼 레이어 0
      symbols: m.getStyle().layers.filter((l) => l.type === 'symbol').length,
      grat: m.getPaintProperty('grat-1', 'line-color') + '|' + m.getPaintProperty('grat-025', 'line-color'),
    };
  });
  expect(s.layers).toEqual([true, true, true, true, true, true]);
  expect(s.drag).toBe(false);
  expect(s.scroll).toBe(false);
  expect(s.bearing).toBe(0);
  expect(s.pitch).toBe(0);
  expect(s.symbols).toBe(0);
  expect(s.grat).toBe('rgba(255,255,255,0.3)|rgba(255,255,255,0.13)');
  expect(errs).toEqual([]);
});

test('셀은 계산된 11개 — 판 4모서리 브래킷 14도 그대로', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.pcell')).toHaveCount(11);
  await expect(page.locator('#plate-box .pfr')).toHaveCount(4);
  const fr = await page.locator('#plate-box .pfr').first().evaluate((e) => e.getBoundingClientRect().width);
  expect(fr).toBe(14);
  // 남원 셀은 마스터 SVG 의 rect 좌표(268.59 / 137.96 / 8.7)와 같은 자리에 선다.
  const i = await namwon(page);
  const box = await page.locator('.pcell').nth(i).evaluate((e) => {
    const p = document.querySelector('#plate-box').getBoundingClientRect();
    const r = e.getBoundingClientRect();
    return [r.left - p.left, r.top - p.top, r.width].map((v) => Math.round(v * 100) / 100);
  });
  expect(Math.abs(box[0] - 268.59)).toBeLessThanOrEqual(1);
  expect(Math.abs(box[1] - 137.96)).toBeLessThanOrEqual(1);
  expect(Math.abs(box[2] - 8.7)).toBeLessThanOrEqual(1);
});

test('셀 클릭 → XI맵 — href 형식이 셀 bbox 다(대상 페이지는 아직 없다)', async ({ page }) => {
  await boot(page);
  const i = await namwon(page);
  expect(await page.locator('.pcell').nth(i).getAttribute('href')).toBe('ximap.html?bbox=127.25,35.5,127.5,35.75');
  const all = await page.locator('.pcell').evaluateAll((n) => n.map((e) => e.getAttribute('href')));
  for (const h of all) expect(h).toMatch(/^ximap\.html\?bbox=-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
});

test('남원 셀 호버 — 콜아웃 문구가 원판(§12.8)과 같다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const i = await namwon(page);
  await page.locator('.pcell').nth(i).hover();
  await expect(page.locator('#pc')).toBeVisible();
  expect(await page.locator('#pc').innerText()).toBe(
    '남원 127.25–127.50 E · 35.50–35.75 N\nAI 분석 결과 3건\n농지이용 2,098필지 · 비닐하우스 9,664동\n변화지수 456폴리곤 · 비지도',
  );
  // 브래킷 4(팔 5) + 중앙 점 + 직각 리더
  await expect(page.locator('#pmark .pbk')).toHaveCount(4);
  await expect(page.locator('#pmark .plead polyline')).toHaveCount(1);
  await expect(page.locator('#pmark .plead rect')).toHaveCount(1);
  // 콜아웃 라벨은 청록, 좌상 12/48 · 244px
  const pc = await page.evaluate(() => {
    const p = document.querySelector('#plate-box').getBoundingClientRect();
    const r = document.querySelector('#pc').getBoundingClientRect();
    return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height, c: getComputedStyle(document.querySelector('.pc-k')).color };
  });
  expect([pc.x, pc.y, pc.w, pc.h]).toEqual([12, 48, 244, 96]);
  expect(pc.c).toBe('rgb(15, 169, 160)');
  expect(errs).toEqual([]);
});

test('토글 — fill 표현식과 범례 문구가 바뀐다(레이어는 그대로)', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const read = () => page.evaluate(() => {
    const m = window.__dash.map;
    return {
      mode: window.__dash.mode,
      color: JSON.stringify(m.getPaintProperty('cells-fill', 'fill-color')),
      opacity: JSON.stringify(m.getPaintProperty('cells-fill', 'fill-opacity')),
      line: JSON.stringify(m.getPaintProperty('cells-line', 'line-color')),
      ids: m.getStyle().layers.map((l) => l.id).join(','),
      legend: document.querySelector('#pl').innerText,
      checked: [...document.querySelectorAll('.pt-seg')].map((e) => e.getAttribute('aria-checked')).join(','),
    };
  });
  const a = await read();
  expect(a.mode).toBe('ai');
  expect(a.color).toContain('0FA9A0');
  expect(a.opacity).toContain('ai');
  expect(a.checked).toBe('true,false');
  expect(a.legend).toContain('청록 진하기 = 결과 건수');

  await page.locator('.pt-seg[data-mode="data"]').click();
  const b = await read();
  expect(b.mode).toBe('data');
  expect(b.color).toBe('"#FFFFFF"');
  expect(b.opacity).toContain('data');
  expect(b.line).toContain('data');
  expect(b.checked).toBe('false,true');
  expect(b.legend).toContain('흰 진하기 = 영상 시점 수');
  // 레이어를 다시 만들지 않았다 — 순서·목록이 같다.
  expect(b.ids).toBe(a.ids);
  expect(errs).toEqual([]);
});

test('토글 키보드 — role=radiogroup, 좌우 화살표로 옮긴다', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#pt')).toHaveAttribute('role', 'radiogroup');
  await page.locator('.pt-seg[data-mode="ai"]').focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__dash.mode)).toBe('data');
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => window.__dash.mode)).toBe('ai');
});

test('데이터 모드 콜아웃 — 시점·GSD·라벨 연결이 원판과 같다', async ({ page }) => {
  await boot(page);
  await page.locator('.pt-seg[data-mode="data"]').click();
  const i = await namwon(page);
  await page.locator('.pcell').nth(i).hover();
  expect(await page.locator('#pc').innerText()).toBe(
    '남원 127.25–127.50 E · 35.50–35.75 N\n학습데이터 4시점 · 드론\n2025-04 · 06 · 08 · 10 · GSD 1.08–1.69 cm\n라벨 연결 2,098 + 1,674필지',
  );
  expect(await page.locator('#pc').evaluate((e) => e.getBoundingClientRect().height)).toBe(82);
});

test('범례 셀 수 = 집계값이고, 합이 셀 총수와 같다', async ({ page }) => {
  await boot(page);
  for (const mode of ['ai', 'data']) {
    await page.evaluate((m) => window.__dash.setMode(m), mode);
    const shown = await page.locator('#pl .pl-r').evaluateAll((n) => n.map((e) => e.textContent.trim()));
    const calc = await page.evaluate((m) => window.__dash.legend(m).rows.map((r) => `${r.name} ${r.n}셀`), mode);
    expect(shown).toEqual(calc);
    const sum = await page.evaluate((m) => window.__dash.legend(m).rows.reduce((a, r) => a + r.n, 0), mode);
    expect(sum).toBe(await page.locator('.pcell').count());
  }
});

test('판 캡션·출처 — 셀 호버/클릭 안내와 기준시점', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#plate-cap')).toContainText('대한민국 전도 · Sentinel-2 cloudless 2024 · 그리드 0.25°');
  await expect(page.locator('#plate-cap')).toContainText('셀 호버 = 내용 · 클릭 → XI맵');
  await expect(page.locator('#plate-src')).toContainText('Data source: EOX Sentinel-2 cloudless 2024');
  await expect(page.locator('#plate-src')).toContainText('기준시점 2026.06.08');
});

/* ── B10 · B11 · B12 ──────────────────────────────────────────────────── */

test('B10 랭크드 바 — 원본 Top5 값 · 1위만 액센트 · 2–5위 #CCC', async ({ page }) => {
  await boot(page, { plate: false });
  const rows = await page.locator('.pr').evaluateAll((n) => n.map((e) => [
    e.querySelector('.pn').textContent, e.querySelector('.pv').textContent,
    getComputedStyle(e.querySelector('.trk i')).backgroundColor,
  ]));
  expect(rows.map((r) => r[1])).toEqual(['412', '318', '256', '198', '142']);
  expect(rows[0][0]).toBe('도로안전 정사영상');
  expect(rows[0][2]).toBe('rgb(0, 109, 247)');
  for (const r of rows.slice(1)) expect(r[2]).toBe('rgb(204, 204, 204)');
  await expect(page.locator('#b-proj')).toContainText('용량 Top5 · GB');
  await expect(page.locator('#proj-src')).toContainText('상위 5개 합계 1,326 GB');
});

test('B11 7일 폴리라인 — 7값 전부 · 양끝·최대만 잉크', async ({ page }) => {
  await boot(page, { plate: false });
  const v = await page.locator('#t-visit .vl2').allInnerTexts();
  expect(v).toEqual(['812', '945', '1,024', '876', '1,150', '412', '356']);
  const tone = await page.locator('#t-visit .vl2').evaluateAll((n) => n.map((e) => getComputedStyle(e).color));
  expect(tone).toEqual([
    'rgb(1, 1, 2)', 'rgb(204, 204, 204)', 'rgb(204, 204, 204)', 'rgb(204, 204, 204)',
    'rgb(1, 1, 2)', 'rgb(204, 204, 204)', 'rgb(1, 1, 2)',
  ]);
  await expect(page.locator('#b-visit')).toContainText('7일 합계 5,575');
  await expect(page.locator('#t-visit .vd')).toHaveCount(7);
});

test('B12 스택 바 — 6분류 실척 + 잔여, 사용/전체 44.5 / 184 TB', async ({ page }) => {
  await boot(page, { plate: false });
  await expect(page.locator('#b-store')).toContainText('44.5');
  await expect(page.locator('#b-store')).toContainText('/ 184 TB');
  await expect(page.locator('#t-store i')).toHaveCount(6);
  const w = await page.locator('#t-store i').evaluateAll((n) => n.map((e) => Math.round(e.getBoundingClientRect().width * 100) / 100));
  expect(w[0]).toBeCloseTo(64.1, 1);           // 18.2 TB × 648 / 184
  await expect(page.locator('#store-lg')).toContainText('잔여 139.5 TB');
  await expect(page.locator('#store-src')).toContainText('1 px ≒ 0.28 TB');
});

/* ── B13 · B14 · B15 · B16 ────────────────────────────────────────────── */

test('B13 승인 대기 원장 — 2행, 값·태그·딥링크가 원본과 같다', async ({ page }) => {
  await boot(page, { plate: false });
  await expect(page.locator('.ap-row')).toHaveCount(2);
  const head = await page.locator('#ap-head .th').allInnerTexts();
  expect(head).toEqual(['#', '카드명', '버전', '요청 일시', '요청 지역', '상태', '진입']);
  const r0 = await page.locator('.ap-row').first().innerText();
  expect(r0).toContain('도로안전 정사영상');
  expect(r0).toContain('v2.1');
  expect(r0).toContain('2026.06.10 14:30');
  expect(r0).toContain('시연');
  expect(r0).toContain('남원시 도통동');
  expect(r0).toContain('추정');
  expect(r0).toContain('승인 대기');
  expect(await page.locator('.ap-row').first().getAttribute('href')).toBe('../admin-publish.html?open=pa-1');
  expect(await page.locator('.ap-row').nth(1).getAttribute('href')).toBe('../admin-publish.html?open=pa-6');
  await expect(page.locator('#ap-h')).toContainText('?status=대기');
});

test('B14 CHIP-RAIL — 관리 4, 같은 수치를 두 번 말하지 않는다', async ({ page }) => {
  await boot(page, { plate: false });
  await expect(page.locator('.ad')).toHaveCount(4);
  const rows = await page.locator('.ad').evaluateAll((n) => n.map((e) => [e.querySelector('.t').textContent, e.querySelector('.s').textContent]));
  expect(rows).toEqual([
    ['사용자 관리', '수치는 KPI ① · ④에'],
    ['공지사항 관리', '전체 12건 · 긴급 2'],
    ['문의 관리', '수치는 KPI ⑤에'],
    ['자주 묻는 질문 관리', '전체 15건'],
  ]);
});

test('B15 푸터 + 콜로폰 — 출처 표기 규칙을 화면이 말한다', async ({ page }) => {
  await boot(page, { plate: false });
  await expect(page.locator('#foot')).toContainText('LX 한국국토정보공사 · 고객센터');
  await expect(page.locator('#foot')).toContainText('063-713-1213');
  await expect(page.locator('#colophon')).toContainText('태그 없음 = 측정');
  await expect(page.locator('#colophon')).toContainText('시연');
  await expect(page.locator('#colophon')).toContainText('추정');
  await expect(page.locator('#colophon .chip')).toHaveText('Family Site ▾');
});

/* ── C. 원본에 없어서 만들지 않은 것 ──────────────────────────────────── */

test('탭 0 · 표 0 · 지도 위젯 0 — 원본에 없는 것은 만들지 않았다', async ({ page }) => {
  await boot(page);
  await expect(page.locator('[role=tab], .tab, [data-tab]')).toHaveCount(0);
  await expect(page.locator('table')).toHaveCount(0);
  // 판은 위젯이 아니라 B9 의 증거 자리다 — 지도는 이 하나뿐이다.
  await expect(page.locator('.maplibregl-map')).toHaveCount(1);
  await expect(page.locator('.maplibregl-ctrl')).toHaveCount(0);
});

/* ── D. 법전 (design/system.md §1 · §2) ───────────────────────────────── */

test('액센트 #006DF7 은 화면에 정확히 한 곳 — B10 1위 바', async ({ page }) => {
  await boot(page);
  const hits = await page.evaluate(() => [...document.querySelectorAll('#stage *')].filter((e) => {
    const cs = getComputedStyle(e);
    return [cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor, cs.fill, cs.stroke]
      .some((v) => /rgb\(0,\s*109,\s*247\)/.test(v));
  }).map((e) => e.closest('.pr') ? e.closest('.pr').className : e.tagName));
  expect(hits).toEqual(['pr is-1']);
});

test('앰버 0 · 라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0', async ({ page }) => {
  await boot(page);
  const bad = await page.evaluate(() => {
    const out = { radius: [], shadow: [], gradient: [], glass: [], amber: [] };
    for (const e of document.querySelectorAll('#stage *')) {
      const cs = getComputedStyle(e);
      const id = e.id || e.className || e.tagName;
      if (['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']
        .some((k) => cs[k] !== '0px' && cs[k] !== '')) out.radius.push(id);
      if (cs.boxShadow && cs.boxShadow !== 'none') out.shadow.push(id);
      if (/gradient/i.test(cs.backgroundImage)) out.gradient.push(id);
      if (cs.backdropFilter && cs.backdropFilter !== 'none') out.glass.push(id);
      if ([cs.color, cs.backgroundColor, cs.fill, cs.stroke].some((v) => /rgb\(255,\s*182,\s*51\)/.test(v))) out.amber.push(id);
    }
    return out;
  });
  expect(bad).toEqual({ radius: [], shadow: [], gradient: [], glass: [], amber: [] });
});

test('서체는 SUIT · Pretendard · Inter 셋뿐이다', async ({ page }) => {
  await boot(page);
  const fams = await page.evaluate(() => [...new Set([...document.querySelectorAll('#stage *')]
    .map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim()))].sort());
  expect(fams.filter((f) => f && !['SUIT', 'Pretendard', 'Inter', 'system-ui'].includes(f))).toEqual([]);
});

test('콘솔 오류 0 — 판 · 차트 · 토글 · 호버를 모두 지나서', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const i = await namwon(page);
  await page.locator('.pcell').nth(i).hover();
  await page.locator('.pt-seg[data-mode="data"]').click();
  await page.locator('.pcell').nth(i).hover();
  await page.locator('.pt-seg[data-mode="ai"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/dashboard-b5-e2e.png` });
  expect(errs).toEqual([]);
});
