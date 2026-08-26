import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// A안 "지도 위 원장" — docs/superpowers/specs/2026-08-26-map-dashboard-options.md §3.1
// 관계 등급표   — docs/superpowers/specs/2026-08-26-dashboard-map-relationship.md §2 (Ⅰ/Ⅱ/Ⅲ)
// 조판 마스터   — design-canvas/v2/B2-Dashboard.dc.html (1440×900)
// 기능 대조표   — docs/superpowers/proto/2026-08-26-dashboard-parity.md (A1–A11 / B1–B16)
const URL = 'proto/dashboard.html';
const SHOTS = 'shots/proto-dash';
fs.mkdirSync(SHOTS, { recursive: true });

// 오프라인/외부 CDN 실패는 이 프로토의 정상 동작이다. 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|preloaded using link preload|WebGL|vworld|xdworld/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!NETWORK.test(t)) errs.push('console: ' + t);
  });
  return errs;
}

async function boot(page) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(URL);
  await page.waitForFunction(() => document.documentElement.dataset.atlas === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(900);
}
/** 스크러버가 스스로 시점을 옮기므로, 손으로 볼 때는 먼저 세운다. */
async function hold(page) {
  await page.locator('#strip-pause').click();
  await page.waitForTimeout(500);
}
/** Ⅱ등급 — 원장을 만져야 결과가 판에 선다. */
async function pickResult(page) {
  await hold(page);
  await page.locator('#t-proj [data-proj]').nth(1).click();   // 농지 활용
  await page.waitForTimeout(2600);
}

test('로그인 관문 — 플래그가 없으면 관리자 화면이 한 프레임도 새지 않는다', async ({ page }) => {
  await page.goto(URL);
  await page.waitForURL(/login\.html/, { timeout: 10000 });
  expect(decodeURIComponent(page.url())).toContain('proto/dashboard.html');
});

/* ── A. 좌측 레일 ─────────────────────────────────────────────────────── */

test('A1–A11 레일 — 원본 include/header.html 의 메뉴가 순서까지 그대로다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const names = await page.locator('#rail .rail-i .rl').allInnerTexts();
  expect(names).toEqual([
    '대시보드', '데이터 관리', '프로젝트', '분석 서비스', '지도 서비스',
    '서비스 지원', '카드 발행 관리', '서비스 관리', 'MY', '로그아웃',
  ]);
  // 원본 파일명이 대응 관계로 남아 있다.
  await expect(page.locator('#rail [data-menu="media"]')).toHaveAttribute('title', '원본 dataset.html');
  await expect(page.locator('#rail [data-menu="map"]')).toHaveAttribute('title', '원본 ximap.html');
  // A2 대시보드는 현재 페이지다.
  await expect(page.locator('#rail [data-menu="dashboard"]')).toHaveAttribute('aria-current', 'page');
  expect(errs, errs.join(' | ')).toEqual([]);
});

test('A3–A9 레일 — 원본 페이지 대신 그 내용이 있는 원장 블록으로 데려간다', async ({ page }) => {
  await boot(page);
  await page.locator('#rail [data-menu="publish-admin"]').click();
  await page.waitForTimeout(700);
  const inView = await page.evaluate(() => {
    const l = document.querySelector('#ledger');
    const t = document.querySelector('#b-approve');
    const d = t.offsetTop - l.scrollTop;
    return d >= -100 && d < l.clientHeight;
  });
  expect(inView).toBe(true);
});

test('A11 로그아웃 — 원본과 같이 로그인 플래그를 지우고 home 으로 간다', async ({ page }) => {
  await boot(page);
  const cleared = page.evaluate(() => new Promise((res) => {
    const rm = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = (k) => { rm(k); if (k === 'lx_logged_in') res(true); };
  }));
  await page.locator('#rail [data-action="logout"]').click();
  expect(await cleared).toBe(true);
  await page.waitForURL(/home\.html/, { timeout: 10000 });
});

/* ── B. 원장 위젯 ─────────────────────────────────────────────────────── */

test('B1–B15 — 원본 위젯이 원본 순서 그대로, 스크롤 없이 한 화면에 든다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  await expect(page.locator('#b1')).toHaveText('LX 관리자 대시보드');            // B1
  expect(await page.locator('#b2').innerText()).toContain('기준일');             // B2

  const led = await page.locator('#ledger').innerText();
  expect(led).toContain('고위험 탐지 건 긴급 처리 안내');                         // B3
  expect(led).toContain('2026.04.15');
  expect(led).toContain('XI-VFM');                                               // B9
  expect(led).toContain('AI 개발 프로젝트 현황');                                 // B10
  expect(led).toContain('최근 7일 방문');                                         // B11
  expect(led).toContain('전체 스토리지 사용량');                                  // B12
  expect(led).toContain('44.5 / 184 TB');
  expect(led).toContain('063-713-1213');                                         // B15

  // B4–B8 — KPI 5개, 값·부제가 원본과 같다.
  await expect(page.locator('#b-kpi .k')).toHaveCount(5);
  const kpi = await page.locator('#b-kpi').innerText();
  for (const t of ['전체 사용자', '발행 분석 카드', '카드 발행 승인 대기', '가입 승인 대기', '미답변 문의',
    '정상 19 · 가입 승인 대기 1', '공개 7 · 비공개 1', '검토 필요', '승인 필요', '전체 12 · 답변 필요']) {
    expect(kpi, t).toContain(t);
  }
  expect(await page.locator('#b-kpi .k').first().locator('.kv').innerText()).toContain('21');

  await expect(page.locator('#ap-rows .ap')).toHaveCount(2);                     // B13
  const ap = await page.locator('#ap-rows').innerText();
  expect(ap).toContain('도로안전 정사영상 v2.1');
  expect(ap).toContain('2026.06.10 14:30');
  await expect(page.locator('#ad-rows .ad')).toHaveCount(4);                     // B14

  // 마스터와 같은 순서.
  const heads = await page.locator('#ledger .lb').allInnerTexts();
  expect(heads).toEqual([
    'LAND-XI · 관리자', 'AI 기반 모델 (백본)', 'AI 개발 프로젝트 현황',
    '사용자 이용 현황', '전체 스토리지 사용량', '카드 발행 승인 대기 · 2건',
  ]);
  // Ⅰ등급(B9 · B10 · B12 · B13) 네 블록에만 눈금이 붙는다 — 눈금의 유무가 곧 등급표다.
  await expect(page.locator('#ledger .g1')).toHaveCount(4);

  // 원장은 1440×900 에서 스크롤 없이 든다(마스터와 같은 밀도).
  const fits = await page.evaluate(() => {
    const l = document.querySelector('#ledger');
    return l.scrollHeight <= l.clientHeight + 1;
  });
  expect(fits).toBe(true);

  expect(errs, errs.join(' | ')).toEqual([]);
});

test('콘티 원칙 — 지어낸 담당자 이름을 싣지 않는다', async ({ page }) => {
  await boot(page);
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('김현우');
  // 대신 원본의 요청 시각은 그대로 남는다.
  expect(body).toContain('2026.05.15 08:50');
});

test('원본에 없는 것은 만들지 않았다 — 탭 0 · 커버리지 0 · 처리 대기 큐 0', async ({ page }) => {
  await boot(page);
  await expect(page.locator('[role="tab"], .tab, .reg')).toHaveCount(0);
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('전국 커버리지');
  expect(body).not.toContain('처리 대기 큐');
  expect(body).not.toContain('추론 현황');
});

test('B10–B12 — 스탯 타일 3종의 형태가 서로 다르고 값은 원본 시드다', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#t-proj .pr')).toHaveCount(5);              // 랭크드 바
  await expect(page.locator('#t-visit svg .ln')).toHaveCount(1);         // 스파크라인
  await expect(page.locator('#t-store .gauge .arc')).toHaveCount(1);     // 도넛 게이지
  const proj = await page.locator('#t-proj').innerText();
  for (const v of ['412', '318', '256', '198', '142']) expect(proj, v).toContain(v);
  const store = await page.locator('#t-store').innerText();
  for (const v of ['18.2', '9.6', '7.4', '5.1', '2.8', '1.4', '139.5']) expect(store, v).toContain(v);
  // 데모 시드에는 [추정] 꼬리표가 붙는다.
  expect(await page.locator('#b-proj').innerText()).toContain('추정');
});

/* ── 판 위 계기 ───────────────────────────────────────────────────────── */

test('Ⅰ등급 — 조작 없이 판에 서 있는 것은 넷뿐이다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await hold(page);

  // B9 작업 AOI — 실측 범위가 있는 것만 그린다(상태별 선 종류).
  expect(await page.evaluate(() => window.__atlas.jobs)).toBeGreaterThan(5);
  const sts = await page.evaluate(() => [...new Set(window.__atlas.map.getSource('job')._data.features.map((f) => f.properties.st))].sort());
  expect(sts).toEqual(['done', 'fail', 'run', 'wait']);

  // B12 정사영상 footprint · B10 사업 지역 채색이 켜져 있다.
  for (const id of ['imgbox-line', 'sig-asset-fill', 'sig-mute', 'job-done', 'job-run', 'job-wait', 'job-fail']) {
    expect(await page.evaluate((l) => window.__atlas.map.getLayoutProperty(l, 'visibility') !== 'none', id), id).toBe(true);
  }
  // B13 십자 핀 — 화면 안에 든 발행 대기 건에 십자가 선다.
  // (원본 시드의 두 핀 중 하나는 남원 밖 좌표라 이 시야에서는 그려지지 않는다 — 지어내 옮기지 않는다.)
  expect(await page.locator('#pins .pin').count()).toBeGreaterThan(0);

  // E1/E2 — 벡터 카드 · 임계 범례 · 락온은 상주하지 않는다.
  await expect(page.locator('#vcard')).toBeHidden();
  await expect(page.locator('#thr')).toBeHidden();
  await expect(page.locator('#lock')).toBeHidden();

  // E5 — 작업 AOI 전부가 한 화면에 든다.
  const fits = await page.evaluate(() => {
    const m = window.__atlas.map;
    const b = m.getBounds();
    return m.getSource('job')._data.features.every((f) => {
      const c = f.geometry.coordinates[0];
      return c.every(([x, y]) => x >= b.getWest() && x <= b.getEast() && y >= b.getSouth() && y <= b.getNorth());
    });
  });
  expect(fits).toBe(true);

  expect(errs, errs.join(' | ')).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/02-grade1.png` });
});

test('Ⅲ등급 — 원장을 만져도 판이 반응하지 않는다(무반응이 곧 선언)', async ({ page }) => {
  await boot(page);
  await hold(page);
  const before = await page.evaluate(() => ({
    c: window.__atlas.map.getCenter().toArray(), z: window.__atlas.map.getZoom(), r: window.__atlas.res,
  }));
  // B4 전체 사용자 · B11 스파크라인 · B14 관리 타일 — 전부 위치가 없는 값이다.
  await page.locator('#b-kpi .k').first().hover();
  await page.locator('#t-visit').hover();
  await page.locator('#ad-rows .ad').first().hover();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    c: window.__atlas.map.getCenter().toArray(), z: window.__atlas.map.getZoom(), r: window.__atlas.res,
  }));
  expect(after).toEqual(before);
  await expect(page.locator('#vcard')).toBeHidden();
});

test('Ⅱ등급 — B10 행을 누르면 그때 결과가 판에 서고 임계 범례가 함께 뜬다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await pickResult(page);
  expect(await page.evaluate(() => window.__atlas.res)).toBeTruthy();
  await expect(page.locator('#thr')).toBeVisible();
  await expect(page.locator('#vcard')).toBeVisible();
  await expect(page.locator('#lock')).toBeVisible();
  expect(await page.locator('#flag-t').innerText()).toContain('지금 지도가 보는 것');
  expect(errs, errs.join(' | ')).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/03-grade2.png` });
});

test('임계 드래그 — 마커를 올리면 통과가 줄고 미달이 늘어난다', async ({ page }) => {
  await boot(page);
  await pickResult(page);
  const before = await page.evaluate(() => window.__atlas.pass);
  await page.locator('#thr-r').fill('0.45');
  await page.dispatchEvent('#thr-r', 'input');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__atlas.pass);
  expect(after).toBeLessThan(before);
  const pass = +(await page.locator('#thr-pass').innerText()).replace(/,/g, '');
  const miss = +(await page.locator('#thr-miss').innerText()).replace(/,/g, '');
  expect(pass + miss).toBe(before);
});

test('B13 호버 — 십자 핀에 리더선과 `연결 추정` 라벨이 붙는다', async ({ page }) => {
  await boot(page);
  await hold(page);
  await page.locator('#ap-rows .ap').first().hover();
  await page.waitForTimeout(400);
  await expect(page.locator('#pins .pin.is-on')).toHaveCount(1);
  const txt = await page.evaluate(() => document.querySelector('#pins .pin.is-on').textContent);
  expect(txt).toContain('연결 추정');
  // 리더선은 원장 경계에서 핀까지 점선으로 그어진다.
  expect(await page.evaluate(() => !!document.querySelector('#pins .pin.is-on .ld'))).toBe(true);
  await page.screenshot({ path: `${SHOTS}/04-pin.png` });
});

test('자백 — 지도가 못 그리는 것을 화면이 말한다', async ({ page }) => {
  await boot(page);
  const own = await page.locator('#own').innerText();
  expect(own).toContain('모의 실행 · 원본 시드');
  expect(own).toContain('AOI 미지정');
  expect(own).toContain('지역 매핑 미확정');
  expect(await page.evaluate(() => window.__atlas.unmapped)).toBe(4);   // 원본 14 − 시드 10
  // B9 카드에도 같은 자백이 선다.
  expect(await page.locator('#b-jobs').innerText()).toContain('AOI 미지정');
  // 정직 태깅은 칩이 아니라 판 하단 범례 한 줄이다.
  await expect(page.locator('#tags')).toHaveCount(0);
  const lg = await page.locator('#legend').innerText();
  for (const t of ['측정 = 실선', '추정 = 점선', '미확정 = 파선']) expect(lg, t).toContain(t);
});

test('취득 스캔 스트립 — 정사영상 4시점, 틱이 곧 컨트롤이다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await expect(page.locator('#scan-bar .ep')).toHaveCount(4);
  expect(await page.locator('#scan-bar .ep').allInnerTexts())
    .toEqual(['2025-04', '2025-06', '2025-08', '2025-10']);
  await hold(page);
  await page.locator('#scan-bar .ep').nth(1).click();
  await page.waitForTimeout(2200);
  expect(await page.evaluate(() => window.__atlas.epoch)).toBe(1);
  expect(await page.locator('#fresh-s').innerText()).toContain('GSD');
  expect(errs, errs.join(' | ')).toEqual([]);
});

test('시간 스크러버 — 유리는 하나뿐이고, 재생 중에는 스윕이 멈춘다', async ({ page }) => {
  await boot(page);
  const glass = await page.evaluate(() => [...document.querySelectorAll('*')]
    .filter((e) => {
      const s = getComputedStyle(e);
      return (s.backdropFilter && s.backdropFilter !== 'none') || (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none');
    }).map((e) => e.id));
  expect(glass).toEqual(['strip']);

  // 재생 중 = 스윕 정지(움직이는 요소는 화면당 하나).
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__atlas.map.getSource('sweep')._data.features.length)).toBe(0);
  const a = await page.evaluate(() => window.__atlas.win);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__atlas.win)).not.toBe(a);

  // 세우면 실행 중 작업의 스윕선 하나가 유일한 운동으로 승계된다.
  await page.locator('#strip-pause').click();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__atlas.map.getSource('sweep')._data.features.length)).toBe(1);
});

test('호버는 색만이 아니라 물리적으로 반응한다 — 4px 이동 + 숫자 액센트', async ({ page }) => {
  await boot(page);
  const row = page.locator('#b-kpi .k').first();
  await row.hover();
  await page.waitForTimeout(320);
  const shift = await row.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  expect(shift).toBeCloseTo(4, 0);
  const color = await row.locator('.kv .n5').evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(0, 109, 247)');
  await page.screenshot({ path: `${SHOTS}/05-hover.png` });
});

test('접근성·모션 — 감소 모션에서 화면이 스스로 움직이지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  const a = await page.evaluate(() => window.__atlas.win);
  await page.waitForTimeout(1400);
  expect(await page.evaluate(() => window.__atlas.win)).toBe(a);
  await expect(page.locator('#strip-play')).toHaveAttribute('aria-pressed', 'false');
  // 스윕도 서 있다.
  expect(await page.evaluate(() => window.__atlas.map.getSource('sweep')._data.features.length)).toBe(0);
  expect(await page.locator('#b-kpi .k').first().locator('.kv').innerText()).toContain('21');
});
