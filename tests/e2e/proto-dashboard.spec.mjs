import { test, expect } from '@playwright/test';
import fs from 'node:fs';

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

/** 로그인 플래그를 심고 아틀라스를 연다. */
async function boot(page, q = '') {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(URL + q);
  await page.waitForFunction(() => document.documentElement.dataset.atlas === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(600);
}

test('로그인 관문 — 플래그가 없으면 아틀라스가 한 프레임도 새지 않는다', async ({ page }) => {
  await page.goto(URL);
  await page.waitForURL(/login\.html/, { timeout: 10000 });
  expect(page.url()).toMatch(/login\.html\?next=/);
  expect(decodeURIComponent(page.url())).toContain('proto/dashboard.html');
});

test('딥링크 3종 — ?tab=infer|train|results 가 각각 그 레지스터로 연다', async ({ page }) => {
  for (const tab of ['infer', 'train', 'results']) {
    const errs = watch(page);
    await boot(page, `?tab=${tab}`);
    expect(await page.evaluate(() => window.__atlas.reg)).toBe(tab);
    await expect(page.locator(`.reg[data-reg="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
    // 주소는 그 자리에 남는다(뒤로 가기로 되돌릴 수 있게).
    expect(page.url()).toContain(`tab=${tab}`);
    expect(errs, `${tab}: ${errs.join(' | ')}`).toEqual([]);
  }
});

test('알 수 없는 tab 은 추론 현황으로 떨어진다', async ({ page }) => {
  await boot(page, '?tab=nope');
  expect(await page.evaluate(() => window.__atlas.reg)).toBe('infer');
});

test('추론 — 실타일 196칸을 실제로 확인하고 스윕이 전진한다', async ({ page }) => {
  const errs = watch(page);
  await boot(page, '?tab=infer');

  // z14 후보 315칸 가운데 실제로 존재하는 타일만 남는다(레포의 실측값).
  expect(await page.evaluate(() => window.__atlas.tiles.length)).toBe(196);

  const a = await page.evaluate(() => window.__atlas.runs.map((r) => r.sweep.i));
  await page.waitForTimeout(2500);
  const b = await page.evaluate(() => window.__atlas.runs.map((r) => r.sweep.i));
  // 세 실행 모두 앞으로 갔다(회차를 마치고 되감긴 경우도 값이 달라진다).
  expect(b.some((v, i) => v !== a[i])).toBe(true);

  // 원장 행의 진행률·ETA 도 같이 움직인다.
  const sub = await page.locator('[data-run] [data-sub]').first().innerText();
  expect(sub).toMatch(/\.pt · \d+\/196 타일/);

  // 칸은 절대 불투명해지지 않는다 — 처리된 칸의 알파는 8~28% 안에 있다(§5-9).
  const alphas = await page.evaluate(() => window.__atlas.map.getSource('sweep')._data.features
    .map((f) => f.properties.a).filter((a) => a > 0));
  expect(alphas.length).toBeGreaterThan(0);
  expect(Math.max(...alphas)).toBeLessThanOrEqual(0.28);
  expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0.08);

  expect(errs, errs.join(' | ')).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/01-infer.png` });
});

test('추론 — 실행 행을 누르면 카메라가 그 지역으로 날아가고 출처 카드가 선다', async ({ page }) => {
  await boot(page, '?tab=infer');
  const before = await page.evaluate(() => window.__atlas.map.getCenter().toArray());
  await page.locator('[data-run]').first().click();
  await page.waitForSelector('#card:not([hidden])', { timeout: 12000 });
  const after = await page.evaluate(() => window.__atlas.map.getCenter().toArray());
  expect(Math.abs(after[0] - before[0]) + Math.abs(after[1] - before[1])).toBeGreaterThan(0.005);
  const card = await page.locator('#card').innerText();
  expect(card).toContain('best(Vinylhouse).pt');
  expect(card).toContain('/ 196 · z14');
  // 프로비넌스 — 모델·엔진·GSD·좌표계·촬영일·생성시각
  for (const k of ['모델', '엔진', 'GSD', '좌표계', '촬영일', '생성시각']) expect(card, k).toContain(k);
  expect(card).toContain('EPSG:5186');
  expect(card).toMatch(/assets\/tiles\/namwon_city_2510/);   // 출처가 붙는다
  await page.screenshot({ path: `${SHOTS}/02-infer-click.png` });
});

test('학습데이터 — 밀도 격자·클래스 균형·영상 인벤토리가 실수치로 선다', async ({ page }) => {
  const errs = watch(page);
  await boot(page, '?tab=train');
  await expect(page.locator('[data-dens]')).toHaveCount(4);
  await expect(page.locator('[data-img]')).toHaveCount(11);          // imagery.js 11세트
  const bal = await page.locator('.bal').innerText();
  expect(bal).toContain('비닐하우스_단동');                            // 실제 클래스명
  expect(bal).toContain('1,469');
  // 지도에 밀도 격자가 실제로 올라와 있다.
  const cells = await page.evaluate(() => window.__atlas.map.getSource('grid')._data.features.length);
  expect(cells).toBeGreaterThan(100);
  expect(errs, errs.join(' | ')).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/03-train.png` });
});

test('학습데이터 — 행 호버는 크롭 썸네일을, 클릭은 Acquired 인셋을 연다', async ({ page }) => {
  await boot(page, '?tab=train');
  await page.locator('[data-dens]').nth(1).hover();
  await page.waitForSelector('#probe:not([hidden])');
  expect(await page.locator('#probe img').count()).toBe(1);
  await page.screenshot({ path: `${SHOTS}/04-train-hover.png` });

  await page.locator('[data-dens]').nth(1).click();
  await page.waitForSelector('#card:not([hidden])', { timeout: 12000 });
  const card = await page.locator('#card').innerText();
  expect(card).toMatch(/acquired/i);
  expect(card).toContain('100 m 칸');
});

test('결과 누적 — 스트립을 끌면 기둥이 자란다', async ({ page }) => {
  const errs = watch(page);
  await boot(page, '?tab=results');
  await page.locator('#strip-play').click();                 // 자동 재생을 멈춘다

  const at = async (frac) => {
    const box = await page.locator('#strip-track').boundingBox();
    await page.mouse.move(box.x + box.width * frac, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(350);
    return page.evaluate(() => ({
      cols: window.__atlas.map.getSource('stack')._data.features.length,
      date: window.__atlas.scrub,
      head: document.querySelector('#head-stat').textContent,
    }));
  };
  const early = await at(0.02);
  const late = await at(0.99);
  expect(late.cols).toBeGreaterThan(early.cols);             // 층이 늘어난다
  expect(late.date > early.date).toBe(true);
  expect(late.head).not.toBe(early.head);                    // 누적 숫자가 자란다

  // 마지막 분석일(2026-06-08)까지 가면 results.js 총계와 정확히 맞는다.
  await page.evaluate(() => window.__atlas.seek(1));
  await page.waitForTimeout(300);
  expect(await page.locator('#head-stat').textContent()).toContain('7,710');
  expect(await page.evaluate(() => window.__atlas.map.getSource('stack')._data.features.length)).toBe(4);
  expect(errs, errs.join(' | ')).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/05-results.png` });
});

test('결과 누적 — 원장 행에 측정/추정 꼬리표가 갈린다', async ({ page }) => {
  await boot(page, '?tab=results');
  const body = await page.locator('#reg-body').innerText();
  expect(body).toContain('측정');
  expect(body).toContain('추정');
  // 실측 시군구는 2곳뿐이고, 나머지는 높이를 갖지 않는다.
  await expect(page.locator('[data-stack]')).toHaveCount(2);
});

test('기능 대조 — 원본 대시보드 위젯이 원장 꼬리에 1:1 로 있다', async ({ page }) => {
  await boot(page, '?tab=infer');
  const ops = await page.locator('#fg-ops').innerText();
  // 대조표 §B — docs/superpowers/proto/2026-08-26-dashboard-parity.md
  for (const t of ['공지', 'AI 기반 모델', '카드 발행 승인 대기', '사용자 · 콘텐츠 관리', '시연']) {
    expect(ops, t).toContain(t);
  }
  expect(ops).toContain('고위험 탐지 건 긴급 처리 안내');            // 원본 SP_NOTICES 최상단
  expect(ops).toContain('XI-VFM');                                   // 원본 백본 카드
  await expect(page.locator('#ops-kpi .k')).toHaveCount(5);          // 원본 KPI 5
  await expect(page.locator('#ops-rows .row')).toHaveCount(2);       // 원본 CARD_APPROVALS 2건
  await expect(page.locator('#ops-admin .row')).toHaveCount(4);      // 원본 support-grid 4타일
  // 원본에 없는 위젯은 만들지 않는다.
  expect(ops).not.toContain('전국 커버리지');
});

test('좌측 레일 — 원본 include/header.html 의 메뉴가 그대로 있다', async ({ page }) => {
  await boot(page, '?tab=infer');
  const names = await page.locator('#rail .rail-i .rl').allInnerTexts();
  expect(names).toEqual([
    '대시보드', '데이터 관리', '프로젝트', '분석 서비스', '지도 서비스',
    '서비스 지원', '카드 발행 관리', '서비스 관리', 'MY',
  ]);
  // 원본 파일명이 대응 관계로 남아 있다.
  await expect(page.locator('#rail [data-menu="media"]')).toHaveAttribute('title', '원본 dataset.html');
  // 데이터 관리 = 학습데이터 레지스터
  await page.locator('#rail [data-menu="media"]').click();
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__atlas.reg)).toBe('train');
  // MY 플라이아웃 — 호버해야 열리고, 항목은 원본과 같다.
  await page.locator('#rail .rail-my').hover();
  await expect(page.locator('#rail .rail-fly')).toBeVisible();
  const my = await page.locator('#rail .rail-fly').innerText();
  expect(my).toContain('마이 페이지');
  expect(my).toContain('로그아웃');
});

test('레일 로그아웃 — 원본과 같이 로그인 플래그를 지우고 home 으로 간다', async ({ page }) => {
  await boot(page, '?tab=infer');
  // 플래그가 실제로 지워지는지 본다(boot 의 initScript 가 다음 페이지에서 다시 심기 전에).
  await page.exposeFunction('__seen', () => {});
  const cleared = page.evaluate(() => new Promise((res) => {
    const rm = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = (k) => { rm(k); if (k === 'lx_logged_in') res(true); };
  }));
  await page.locator('#rail .rail-my').hover();
  await page.locator('#rail [data-action="logout"]').click();
  expect(await cleared).toBe(true);
  await page.waitForURL(/home\.html/, { timeout: 10000 });
});

test('접근성·모션 — 감소 모션에서 스캔이 스스로 움직이지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, '?tab=results');
  const a = await page.evaluate(() => window.__atlas.scrub);
  await page.waitForTimeout(1200);
  const b = await page.evaluate(() => window.__atlas.scrub);
  expect(b).toBe(a);
  await expect(page.locator('#strip-play')).toHaveAttribute('aria-pressed', 'false');
});

test('접근성·모션 — 감소 모션에서 스윕도 정지 프레임이다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, '?tab=infer');
  const a = await page.evaluate(() => window.__atlas.runs.map((r) => r.sweep.i));
  await page.waitForTimeout(1400);
  const b = await page.evaluate(() => window.__atlas.runs.map((r) => r.sweep.i));
  expect(b).toEqual(a);
});
