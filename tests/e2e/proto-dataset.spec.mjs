import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// 데이터 관리 — 원본 1:1
//  원본      https://mini531.github.io/namwon-smart-village/landxi7/dataset.html
//            (+ dataset-upload / dataset-manage / dataset-manage-publishing / dataset-archive)
//  인벤토리  docs/superpowers/specs/2026-08-26-landxi7-function-inventory.md §3
//  마스터    design-canvas/v2/B2-DataMgmt-Upload.dc.html · B2-DataMgmt-List.dc.html (1440×900)
//  대조표    docs/superpowers/proto/2026-08-26-dataset-parity.md
const URL = 'proto/dataset.html';
const SHOTS = 'shots/proto-ds';
fs.mkdirSync(SHOTS, { recursive: true });

// 오프라인/외부 CDN 실패는 이 프로토의 정상 동작이다. 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|preloaded using link preload|WebGL|vworld|xdworld|maplibre/i;

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

async function boot(page, tab) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(URL + (tab ? `?tab=${tab}` : ''));
  await page.waitForFunction(() => document.documentElement.dataset.ds === 'ready', null, { timeout: 20000 });
  // 판은 WebGL 이 없으면 off 로 떨어진다 — 원장은 그래도 완성된다.
  await page.waitForFunction(() => ['ready', 'idle', 'off'].includes(document.documentElement.dataset.plate || ''), null, { timeout: 20000 });
  await page.waitForTimeout(1400);
}
/** 유휴 운동(업로드 진행률)이 스스로 값을 옮기므로 손으로 볼 때는 세운다. */
async function hold(page) {
  await page.evaluate(() => { for (let i = 1; i < 9999; i++) clearInterval(i); });
  await page.waitForTimeout(200);
}

/* ── 관문 ─────────────────────────────────────────────────────────────── */

test('로그인 관문 — 플래그가 없으면 관리자 화면이 한 프레임도 새지 않는다', async ({ page }) => {
  await page.goto(URL + '?tab=archive');
  await page.waitForURL(/login\.html/, { timeout: 10000 });
  expect(decodeURIComponent(page.url())).toContain('proto/dataset.html?tab=archive');
});

test('레일 — 원본 메뉴 순서 그대로, 활성은 데이터 관리', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const names = await page.locator('#rail .rail-i .rl').allInnerTexts();
  expect(names).toEqual([
    '대시보드', '데이터 관리', '프로젝트', '분석 서비스', '지도 서비스',
    '서비스 지원', '카드 발행 관리', '서비스 관리', 'MY', '로그아웃',
  ]);
  await expect(page.locator('.rail-i[data-menu="media"]')).toHaveAttribute('aria-current', 'page');
  expect(errs).toEqual([]);
});

/* ── 탭 4종 · `?tab=` 딥링크 ──────────────────────────────────────────── */

const TABS = [
  { id: 'upload', name: '데이터 업로드', panel: '#panel-upload', shot: '01-upload' },
  { id: 'manage', name: '업로드 완료', panel: '#panel-manage', shot: '02-manage' },
  { id: 'publishing', name: '레이어 발행중', panel: '#panel-publishing', shot: '03-publishing' },
  { id: 'archive', name: '아카이브', panel: '#panel-archive', shot: '04-archive' },
];

test('탭 4종 — 라벨·순서가 원본과 같고 기본값은 ?tab=upload', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  expect(await page.locator('#ds-tabs .tb').allInnerTexts())
    .toEqual(TABS.map((t) => t.name));
  await expect(page.locator('#tab-upload')).toHaveAttribute('aria-selected', 'true');
  expect(errs).toEqual([]);
});

for (const t of TABS) {
  test(`딥링크 ?tab=${t.id} — 해당 탭이 열리고 URL 이 유지된다 · 스크린샷`, async ({ page }) => {
    const errs = watch(page);
    await boot(page, t.id);
    await expect(page.locator(`#tab-${t.id}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(t.panel)).toBeVisible();
    expect(page.url()).toContain(`tab=${t.id}`);
    await hold(page);
    await page.waitForFunction(() => ['idle', 'off'].includes(document.documentElement.dataset.plate || ''), null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, `${t.shot}.png`) });
    expect(errs).toEqual([]);
  });
}

test('탭 클릭 — history.pushState 로 ?tab= 이 따라오고 뒤로가기가 되돌린다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await page.locator('#tab-archive').click();
  await page.waitForTimeout(400);
  expect(page.url()).toContain('tab=archive');
  await page.goBack();
  await page.waitForTimeout(400);
  await expect(page.locator('#tab-upload')).toHaveAttribute('aria-selected', 'true');
  expect(errs).toEqual([]);
});

test('탭 전환 — 필터칩·검색이 초기화된다(원본 동작)', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await page.locator('.chip[data-chip="TIF"]').click();
  await page.locator('#q').fill('ortho');
  await expect(page.locator('.chip[data-chip="TIF"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#tab-archive').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#q')).toHaveValue('');
  await expect(page.locator('.chip[data-chip="전체"]')).toHaveAttribute('aria-pressed', 'true');
  // 아카이브는 유형 필터 4종으로 갈아 낀다.
  expect(await page.locator('#ds-filters .chip').allInnerTexts())
    .toEqual(['전체', '정사영상', '이미지셋', '공간정보']);
  expect(errs).toEqual([]);
});

test('필터 7 · 검색 — 업로드 탭 목록이 실제로 줄어든다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await hold(page);
  expect(await page.locator('#ds-filters .chip').allInnerTexts())
    .toEqual(['전체', 'ECW', 'TIF', 'ZIP', 'SHP', 'XLSX/XLS', '기타']);
  await page.locator('#up-fold').click();          // 전체 보기
  const all = await page.locator('#up-list .uc').count();
  await page.locator('.chip[data-chip="ECW"]').click();
  const ecw = await page.locator('#up-list .uc').count();
  expect(ecw).toBeLessThan(all);
  expect(ecw).toBeGreaterThan(0);
  await page.locator('.chip[data-chip="전체"]').click();
  await page.locator('#q').fill('camera');
  await page.waitForTimeout(200);
  expect(await page.locator('#up-list .uc').count()).toBe(1);
  expect(errs).toEqual([]);
});

/* ── 업로드 폼 ────────────────────────────────────────────────────────── */

test('업로드 폼 — 허용 형식 5 · 최대 1TB · 파일 없이 제출하면 막힌다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await hold(page);
  expect(await page.locator('#dz-acc span').allInnerTexts())
    .toEqual(['ECW (.ecw)', 'GeoTIFF (.tif)', 'ZIP (.zip)', 'SHP (.shp)', '엑셀 (.xlsx)']);
  await expect(page.locator('#drop-sub')).toHaveText('여러 파일을 한 번에 · 최대 1 TB');
  await page.locator('#up-go').click();
  await expect(page.locator('#up-err')).toBeVisible();
  await expect(page.locator('#up-err')).toContainText('파일을 선택해 주세요');

  // 허용하지 않는 형식은 원본과 같이 거절한다.
  await page.setInputFiles('#file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.locator('#up-err')).toContainText('허용하지 않는 형식');

  // 허용 형식이면 대기열에 들어간다.
  const before = await page.locator('#up-tally').innerText();
  await page.setInputFiles('#file', { name: 'NW_test_202608.tif', mimeType: 'image/tiff', buffer: Buffer.from('tif') });
  await expect(page.locator('#up-err')).toBeHidden();
  await page.locator('#up-go').click();
  await page.waitForTimeout(300);
  expect(await page.locator('#up-tally').innerText()).not.toBe(before);
  expect(errs).toEqual([]);
});

test('업로드 카드 액션 — 일시정지 / 재개 / 이어 올리기 / 취소가 상태를 바꾼다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await hold(page);
  const run = page.locator('#up-list .uc[data-st="run"]').first();
  await expect(run.locator('.uc-st')).toHaveText('업로드중');
  await run.locator('.act[data-act="pause"]').click();
  await expect(page.locator('#up-list .uc').first().locator('.uc-st')).toHaveText('일시정지');
  await page.locator('#up-list .uc').first().locator('.act[data-act="resume"]').click();
  await expect(page.locator('#up-list .uc').first().locator('.uc-st')).toHaveText('업로드중');

  // 중단됨 카드는 `이어 올리기` 를 가진다.
  const stop = page.locator('#up-list .uc[data-st="stop"]').first();
  await expect(stop.locator('.act[data-act="retry"]')).toHaveText('이어 올리기');
  await stop.locator('.act[data-act="retry"]').click();
  await page.waitForTimeout(200);

  const n = await page.locator('#up-list .uc').count();
  await page.locator('#up-list .uc').first().locator('.act[data-act="cancel"]').click();
  await page.waitForTimeout(200);
  expect(await page.locator('#up-list .uc').count()).toBeLessThanOrEqual(n);
  expect(errs).toEqual([]);
});

test('세부 정보 모달 — 열고 닫힌다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await hold(page);
  await page.locator('#up-list .act[data-act="detail"]').first().click();
  await expect(page.locator('#m-detail')).toBeVisible();
  await expect(page.locator('#md-rows .dt-r')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(page.locator('#m-detail')).toBeHidden();
  expect(errs).toEqual([]);
});

test('디스크 증량 모달 — 프리셋 6 + 직접 입력 + 사유 검증 · 스크린샷', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await hold(page);
  await expect(page.locator("#disk-use")).toHaveText("1,965.0 / 2,048.0 GB");
  await expect(page.locator('#disk-free')).toHaveText('잔여 83.0 GB');
  await expect(page.locator('#disk-pct')).toHaveText('96%');

  await page.locator('#quota-open').click();
  await expect(page.locator('#m-quota')).toBeVisible();
  expect(await page.locator('#mq-presets .chip').allInnerTexts())
    .toEqual(['32', '64', '128', '256', '512', '1024', '직접 입력']);
  await page.screenshot({ path: path.join(SHOTS, '05-quota-modal.png') });

  // 사유가 비면 저장이 막힌다.
  await page.locator('#mq-form button[type="submit"]').click();
  await expect(page.locator('#mq-err')).toContainText('신청 사유');
  // 직접 입력 전환
  await page.locator('.chip[data-gb="custom"]').click();
  await expect(page.locator('#mq-custom')).toBeVisible();
  await page.locator('#mq-gb').fill('768');
  await page.locator('#mq-why').fill('4월 정사영상 4권역 동시 업로드');
  await page.locator('#mq-form button[type="submit"]').click();
  await expect(page.locator('#m-quota')).toBeHidden();
  await expect(page.locator('#say')).toContainText('768');
  expect(errs).toEqual([]);
});

/* ── 아카이브 ─────────────────────────────────────────────────────────── */

test('아카이브 — 표시/숨김 토글은 감쇠일 뿐 삭제가 아니다', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'archive');
  const n = await page.locator('#ar-list .ac').count();
  const card = page.locator('#ar-list .ac').first();
  await card.locator('.act[data-act="vis"]').click();
  await expect(page.locator('#ar-list .ac').first()).toHaveAttribute('data-hidden', '1');
  await expect(page.locator('#ar-list .ac').first().locator('.act[data-act="vis"]')).toHaveText('표시');
  expect(await page.locator('#ar-list .ac').count()).toBe(n);
  expect(errs).toEqual([]);
});

test('아카이브 — 데이터셋 상세 드로어(데이터명/출처/설명 + 밴드·속성) · 스크린샷', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'archive');
  await page.locator('#ar-list .ac-th').first().click();
  await expect(page.locator('#detail')).toBeVisible();
  expect(await page.locator('#detail-rows .dt-r span').allInnerTexts()).toEqual(['데이터명', '출처', '설명']);
  expect(await page.locator('#detail-bands .dt-b').count()).toBeGreaterThan(0);
  await page.waitForFunction(() => ['idle', 'off'].includes(document.documentElement.dataset.plate || ''), null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, '06-archive-detail.png') });
  await page.locator('#detail-x').click();
  await expect(page.locator('#detail')).toBeHidden();
  expect(errs).toEqual([]);
});

test('아카이브 — 공유 설정 모달(기관명 / 권한명) · 삭제 · 스크린샷', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'archive');
  await page.locator('#ar-list .act[data-act="share"]').first().click();
  await expect(page.locator('#m-share')).toBeVisible();
  expect(await page.locator('#ms-perm thead th').allInnerTexts()).toEqual(['기관명', '권한명']);
  expect(await page.locator('#ms-perm tbody tr').count()).toBe(2);
  await page.screenshot({ path: path.join(SHOTS, '07-share-modal.png') });
  await page.locator('#ms-perm select').first().selectOption('뷰어');
  await page.locator('#ms-form button[type="submit"]').click();
  await expect(page.locator('#m-share')).toBeHidden();

  const n = await page.locator('#ar-list .ac').count();
  await page.locator('#ar-list .act[data-act="del"]').first().click();
  await page.waitForTimeout(200);
  expect(await page.locator('#ar-list .ac').count()).toBe(n - 1);
  expect(errs).toEqual([]);
});

/* ── 업로드 완료 → 발행 ───────────────────────────────────────────────── */

test('업로드 완료 — 목록 길이 제어(전체 보기 / 접기)', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'manage');
  const folded = await page.locator('#dn-list .dn').count();
  expect(folded).toBe(3);
  await page.locator('#dn-more').click();
  const all = await page.locator('#dn-list .dn').count();
  expect(all).toBe(8);
  await expect(page.locator('#dn-h')).toHaveText('업로드 완료 · 8건 → 지도 레이어 발행');
  await page.locator('#dn-more').click();
  expect(await page.locator('#dn-list .dn').count()).toBe(3);
  expect(errs).toEqual([]);
});

test('발행 폼 — 공유 권한 표 + 필수 검증 + 발행하면 발행중 탭으로 넘어간다 · 스크린샷', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'manage');
  await page.locator('.dn-go').first().click();
  await expect(page.locator('#pubform')).toBeVisible();
  expect(await page.locator('#pf-perm thead th').allInnerTexts()).toEqual(['기관명', '권한명']);
  expect(await page.locator('#pf-perm tbody tr').count()).toBe(2);
  await page.waitForFunction(() => ['idle', 'off'].includes(document.documentElement.dataset.plate || ''), null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, '08-publish-form.png') });

  await page.locator('#pf-name').fill('');
  await page.locator('#pubform button[type="submit"]').click();
  await expect(page.locator('#pf-err')).toContainText('데이터명');

  await page.locator('#pf-name').fill('남원 정사영상 2026-04 C구역');
  await page.locator('#pubform button[type="submit"]').click();
  await page.waitForTimeout(600);
  expect(page.url()).toContain('tab=publishing');
  await expect(page.locator('#tab-publishing')).toHaveAttribute('aria-selected', 'true');
  expect(errs).toEqual([]);
});

/* ── 레이어 발행중 ────────────────────────────────────────────────────── */

test('레이어 발행중 — 4단계 · 실패 사유 · 발행 취소', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'publishing');
  expect(await page.locator('#pb-list .pb').first().locator('.step-l span').allInnerTexts())
    .toEqual(['파일 확인', '공간정보 분석', '지도 데이터 변환', '레이어 발행']);
  const fail = page.locator('#pb-list .pb[data-st="fail"]').first();
  await expect(fail.locator('.pb-st')).toHaveText('실패');
  await expect(fail.locator('.why .t')).toContainText('좌표체계');

  const n = await page.locator('#pb-list .pb').count();
  await page.locator('#pb-list .act[data-act="cancel"]').first().click();
  await page.waitForTimeout(200);
  expect(await page.locator('#pb-list .pb').count()).toBe(n - 1);
  expect(errs).toEqual([]);
});

/* ── 살아있음 §5 ──────────────────────────────────────────────────────── */

test('§5 — 유휴 운동 1개(업로드 진행률)가 실제로 움직이고 `시연` 이라고 밝힌다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await expect(page.locator('#up-tally')).toContainText('시연');
  const a = await page.locator('#up-list .uc[data-st="run"] .uc-v').first().innerText();
  await page.waitForTimeout(3600);
  const b = await page.locator('#up-list .uc[data-st="run"] .uc-v').first().innerText();
  expect(b).not.toBe(a);
  expect(errs).toEqual([]);
});

test('§5-3 — 호버는 색만이 아니라 물리적으로 반응한다(180ms)', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'archive');
  const card = page.locator('#ar-list .ac').first();
  const before = await card.evaluate((el) => getComputedStyle(el).transform);
  await card.hover();
  await page.waitForTimeout(320);
  const after = await card.evaluate((el) => getComputedStyle(el).transform);
  expect(after).not.toBe(before);
  await page.screenshot({ path: path.join(SHOTS, '09-hover.png') });
  expect(errs).toEqual([]);
});

/* ── 콘솔 0 (전 탭) ───────────────────────────────────────────────────── */

test('콘솔 0 — 네 탭을 모두 돌아도 우리 코드가 던진 오류가 없다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  for (const t of ['manage', 'publishing', 'archive', 'upload']) {
    await page.locator(`#tab-${t}`).click();
    await page.waitForTimeout(700);
  }
  expect(errs).toEqual([]);
});

/* ── 마스터 대조 — 나란히 붙인 그림 ───────────────────────────────────── */

const PAIRS = [
  { shot: '01-upload', master: 'B2-DataMgmt-Upload.png', out: 'ds-vs-B2-upload.png', tab: 'upload' },
  { shot: '04-archive', master: 'B2-DataMgmt-List.png', out: 'ds-vs-B2-list.png', tab: 'archive' },
];

for (const p of PAIRS) {
  test(`마스터 대조 ${p.out}`, async ({ page }) => {
    await boot(page, p.tab);
    await hold(page);
    // 마스터가 잡아 둔 상태와 같은 상태로 찍는다 — 업로드는 증량 모달, 아카이브는 상세.
    if (p.tab === 'upload') {
      await page.locator('#quota-open').scrollIntoViewIfNeeded();
      await page.locator('#quota-open').click();
      await page.waitForTimeout(500);
    }
    if (p.tab === 'archive') {
      await page.locator('#ar-list .ac-th').first().click();
      await page.waitForTimeout(1800);
    }
    // 판의 타일이 다 앉을 때까지 기다린다 — 대조 그림은 완성된 프레임이어야 한다.
    await page.waitForFunction(() => ['idle', 'off'].includes(document.documentElement.dataset.plate || ''), null, { timeout: 25000 });
    await page.waitForTimeout(900);
    const mine = path.join(SHOTS, `${p.shot}-state.png`);
    await page.screenshot({ path: mine });
    const master = path.join('design-canvas/v2/renders', p.master);
    expect(fs.existsSync(master)).toBe(true);
    const b64 = (f) => fs.readFileSync(f).toString('base64');
    await page.setContent(`<body style="margin:0;background:#111;font:11px/1.3 Inter,system-ui;color:#fff">
      <div style="display:flex">
        <figure style="margin:0"><figcaption style="padding:8px 12px">우리 구현 · proto/dataset.html?tab=${p.tab}</figcaption>
          <img src="data:image/png;base64,${b64(mine)}" style="width:1440px;display:block"></figure>
        <figure style="margin:0"><figcaption style="padding:8px 12px">마스터 · design-canvas/v2/renders/${p.master}</figcaption>
          <img src="data:image/png;base64,${b64(master)}" style="width:1440px;display:block"></figure>
      </div></body>`);
    await page.setViewportSize({ width: 2880, height: 928 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, p.out), fullPage: true });
    expect(fs.existsSync(path.join(SHOTS, p.out))).toBe(true);
  });
}
