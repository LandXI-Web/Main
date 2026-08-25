import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// A안 "지도 위 원장" — docs/superpowers/specs/2026-08-26-map-dashboard-options.md §3.1
// 기능 대조표 — docs/superpowers/proto/2026-08-26-dashboard-parity.md (A1–A11 / B1–B16)
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

test('로그인 관문 — 플래그가 없으면 관리자 화면이 한 프레임도 새지 않는다', async ({ page }) => {
  await page.goto(URL);
  await page.waitForURL(/login\.html/, { timeout: 10000 });
  expect(decodeURIComponent(page.url())).toContain('proto/dashboard.html');
});

/* ── A. 좌측 레일 ─────────────────────────────────────────────────────── */

test('A1–A10 레일 — 원본 include/header.html 의 메뉴가 순서까지 그대로다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const names = await page.locator('#rail .rail-i .rl').allInnerTexts();
  expect(names).toEqual([
    '대시보드', '데이터 관리', '프로젝트', '분석 서비스', '지도 서비스',
    '서비스 지원', '카드 발행 관리', '서비스 관리', 'MY',
  ]);
  // 원본 파일명이 대응 관계로 남아 있다.
  await expect(page.locator('#rail [data-menu="media"]')).toHaveAttribute('title', '원본 dataset.html');
  await expect(page.locator('#rail [data-menu="map"]')).toHaveAttribute('title', '원본 ximap.html');
  // A2 대시보드는 현재 페이지다.
  await expect(page.locator('#rail [data-menu="dashboard"]')).toHaveAttribute('aria-current', 'page');
  // A10 MY 플라이아웃
  await page.locator('#rail .rail-my').hover();
  await expect(page.locator('#rail .rail-fly')).toBeVisible();
  const my = await page.locator('#rail .rail-fly').innerText();
  expect(my).toContain('마이 페이지');
  expect(my).toContain('로그아웃');
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
    return d >= -8 && d < l.clientHeight;
  });
  expect(inView).toBe(true);
});

test('A11 로그아웃 — 원본과 같이 로그인 플래그를 지우고 home 으로 간다', async ({ page }) => {
  await boot(page);
  const cleared = page.evaluate(() => new Promise((res) => {
    const rm = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = (k) => { rm(k); if (k === 'lx_logged_in') res(true); };
  }));
  await page.locator('#rail .rail-my').hover();
  await page.locator('#rail [data-action="logout"]').click();
  expect(await cleared).toBe(true);
  await page.waitForURL(/home\.html/, { timeout: 10000 });
});

/* ── B. 원장 위젯 ─────────────────────────────────────────────────────── */

test('B1–B15 — 원본 위젯이 원본 순서 그대로 원장에 있다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  await expect(page.locator('#b1')).toHaveText('LX 관리자 대시보드');           // B1
  expect(await page.locator('#b2').innerText()).toContain('기준일 현재');       // B2

  const led = await page.locator('#ledger').innerText();
  expect(led).toContain('고위험 탐지 건 긴급 처리 안내');                        // B3
  expect(led).toContain('XI-VFM');                                              // B9
  expect(led).toContain('AI 개발 프로젝트 현황');                                // B10
  expect(led).toContain('최근 7일 방문');                                        // B11
  expect(led).toContain('전체 스토리지 사용량');                                 // B12
  expect(led).toContain('사용자 · 콘텐츠 관리');                                 // B14
  expect(led).toContain('063-713-1213');                                        // B15

  // B4–B8 — KPI 5개, 값·부제가 원본과 같다.
  await expect(page.locator('#ledger .k')).toHaveCount(5);
  const kpi = await page.locator('#ledger .kpis').innerText();
  for (const t of ['전체 사용자', '발행 분석 카드', '카드 발행 승인 대기', '가입 승인 대기', '미답변 문의',
    '정상 19 · 가입 승인 대기 1', '공개 7 · 비공개 1', '검토 필요', '승인 필요', '전체 12 · 답변 필요']) {
    expect(kpi, t).toContain(t);
  }
  // 카운트업이 끝나면 원본 값이 그대로 선다.
  expect(await page.locator('#ledger .k').first().locator('.k__v').innerText()).toContain('21');

  await expect(page.locator('#ap-rows .row')).toHaveCount(2);                   // B13
  const ap = await page.locator('#ap-rows').innerText();
  expect(ap).toContain('도로안전 정사영상 v2.1');
  expect(ap).toContain('김현우 · 2026.06.10 14:30');
  await expect(page.locator('#ad-rows .row')).toHaveCount(4);                   // B14

  // 순서 — 원본 dashboard.html 의 순서 그대로.
  const heads = await page.locator('#led-body .fg__h b').allInnerTexts();
  expect(heads).toEqual([
    '공지', '운영 지표', 'AI 기반 모델 (백본)', 'AI 개발 프로젝트 현황',
    '사용자 이용 현황', '전체 스토리지 사용량', '분석 결과', '카드 발행 승인 대기', '사용자 · 콘텐츠 관리',
  ]);

  expect(errs, errs.join(' | ')).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/01-dash.png` });
});

test('원본에 없는 것은 만들지 않았다 — 탭 0 · 커버리지 0 · 처리 대기 큐 0', async ({ page }) => {
  await boot(page);
  await expect(page.locator('[role="tab"], .tab, .reg')).toHaveCount(0);
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('전국 커버리지');
  expect(body).not.toContain('처리 대기 큐');
  expect(body).not.toContain('추론 현황');
  // 승인 대기는 원본대로 2건뿐이다(우리가 7건으로 합쳤던 큐는 삭제).
  expect(await page.locator('#ap-rows .row').count()).toBe(2);
});

test('B10–B12 — 스탯 타일 3종의 형태가 서로 다르다(균일 카드 그리드 금지)', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#t-proj svg.ch--rank')).toHaveCount(1);     // 랭크드 바
  await expect(page.locator('#t-visit svg.ch--spark')).toHaveCount(1);   // 스파크라인
  await expect(page.locator('#t-store .gauge svg')).toHaveCount(1);      // 도넛 게이지
  // 원본 Top5 프로젝트명이 라벨로 실제로 찍힌다.
  expect(await page.locator('#t-proj').innerText()).toContain('도로안전 정사영상');
  expect(await page.locator('#t-store').innerText()).toContain('184');
});

/* ── 판 위 계기 ───────────────────────────────────────────────────────── */

test('결과 행 — 누르면 카메라가 그 범위로 가고 락온 브래킷이 선다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  // 스크러버가 사건에서 스스로 결과를 고르므로, 먼저 세워 놓고 손으로 고른다.
  await page.locator('#strip-play').click();
  await page.locator('[data-res-row]').nth(2).click();                   // 여수 해양쓰레기(항공)
  await page.waitForTimeout(2400);
  const before = await page.evaluate(() => window.__atlas.map.getCenter().toArray());
  await page.locator('[data-res-row]').first().click();                  // 남원 농지이용
  await page.waitForTimeout(2600);
  const after = await page.evaluate(() => window.__atlas.map.getCenter().toArray());
  expect(Math.abs(after[0] - before[0]) + Math.abs(after[1] - before[1])).toBeGreaterThan(0.05);
  await expect(page.locator('#lock')).toBeVisible();
  // 지도에 실제 결과가 올라와 있다.
  const n = await page.evaluate(() => window.__atlas.map.getSource('res')._data.features.length);
  expect(n).toBeGreaterThan(100);
  // 뷰어 플래그가 지금 보는 것을 말한다.
  expect(await page.locator('#flag').innerText()).toContain('지금 지도가 보는 것');
  expect(errs, errs.join(' | ')).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/02-result.png` });
});

test('임계 드래그 범례 — 마커를 올리면 통과 건수가 즉시 줄어든다', async ({ page }) => {
  await boot(page);
  await page.locator('#strip-play').click();
  await page.locator('[data-res-row]').first().click();                  // 남원 농지(신뢰도 분포 있음)
  await page.waitForTimeout(2400);
  await expect(page.locator('#thr')).toBeVisible();
  const before = await page.evaluate(() => window.__atlas.pass);
  await page.locator('#thr-r').fill('0.6');
  await page.dispatchEvent('#thr-r', 'input');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__atlas.pass);
  expect(after).toBeLessThan(before);
  expect(await page.evaluate(() => window.__atlas.thr)).toBeCloseTo(0.6, 2);
  // 숫자는 항상 보인다.
  expect(await page.locator('#thr-n').innerText()).toBe(String(after).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  await page.screenshot({ path: `${SHOTS}/03-threshold.png` });
});

test('벡터 추출 카드 — 정사영상과 추출 벡터가 같은 액자 안에 나란히 선다', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#vcard')).toBeVisible();
  await expect(page.locator('#vcard .vc__f img')).toHaveCount(2);
  expect(await page.locator('#vcard').innerText()).toContain('GSD');
});

test('취득 스캔 스트립 — 정사영상 4시점 + 변화 4쌍, 틱이 곧 컨트롤이다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await expect(page.locator('#scan-bar .tk:not(.tk--chg)')).toHaveCount(4);   // 남원 AOI 4시점
  await expect(page.locator('#scan-bar .tk--chg')).toHaveCount(4);            // 변화 4쌍
  await page.locator('#scan-bar .tk:not(.tk--chg)').first().click();
  await page.waitForSelector('#card:not([hidden])', { timeout: 12000 });
  const card = await page.locator('#card').innerText();
  for (const k of ['GSD', '촬영', '좌표계', '생성시각']) expect(card, k).toContain(k);
  expect(card).toContain('EPSG:5186');
  expect(errs, errs.join(' | ')).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/04-scan.png` });
});

test('변화 지수는 탐지가 아니다 — 점선 고스트 + 추정 표기', async ({ page }) => {
  await boot(page);
  await page.locator('#scan-bar .tk--chg').first().click();
  await page.waitForTimeout(1800);
  const n = await page.evaluate(() => window.__atlas.map.getSource('chg')._data.features.length);
  expect(n).toBeGreaterThan(0);
  const flag = await page.locator('#flag').innerText();
  expect(flag).toContain('변화 지수(비지도)');
  expect(flag).toContain('추정');
  // 점선이어야 한다(측정 = 실선과 구분).
  const dash = await page.evaluate(() => window.__atlas.map.getPaintProperty('chg-line', 'line-dasharray'));
  expect(dash).toBeTruthy();
});

test('시간 스크러버 — 유리는 화면에 하나뿐이고 사건에서 선다', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#strip')).toBeVisible();
  // 유리(backdrop-filter)를 쓴 요소는 정확히 하나다(취향 §6).
  const glass = await page.evaluate(() => [...document.querySelectorAll('*')]
    .filter((e) => {
      const s = getComputedStyle(e);
      return (s.backdropFilter && s.backdropFilter !== 'none') || (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none');
    }).map((e) => e.id));
  expect(glass).toEqual(['strip']);

  const a = await page.evaluate(() => window.__atlas.scrub);
  await page.waitForTimeout(2200);
  const b = await page.evaluate(() => window.__atlas.scrub);
  expect(b).not.toBe(a);                                   // 스스로 움직인다(§5-2)
  await page.locator('#strip-play').click();
  await expect(page.locator('#strip-play')).toHaveAttribute('aria-pressed', 'false');
});

test('호버는 색만이 아니라 물리적으로 반응한다 — 4px 이동 + 숫자 액센트', async ({ page }) => {
  await boot(page);
  const row = page.locator('#ap-rows .row').first();
  await row.hover();
  await page.waitForTimeout(320);
  const shift = await row.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  expect(shift).toBeCloseTo(4, 0);
  const color = await row.locator('.v').evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(0, 109, 247)');
  await page.screenshot({ path: `${SHOTS}/05-hover.png` });
});

test('접근성·모션 — 감소 모션에서 화면이 스스로 움직이지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  const a = await page.evaluate(() => window.__atlas.scrub);
  await page.waitForTimeout(1400);
  const b = await page.evaluate(() => window.__atlas.scrub);
  expect(b).toBe(a);
  await expect(page.locator('#strip-play')).toHaveAttribute('aria-pressed', 'false');
  // KPI 는 카운트업 없이 최종값으로 선다.
  expect(await page.locator('#ledger .k').first().locator('.k__v').innerText()).toContain('21');
});
