import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// 데이터 관리 — B5 썸네일 그리드, 원본 1:1
//  원본      https://mini531.github.io/namwon-smart-village/landxi7/dataset.html
//            (+ dataset-upload / dataset-manage / dataset-manage-publishing / dataset-archive)
//  마스터    design-canvas/v2/B5-DataMgmt.dc.html (1440×900) · NOTES.md §13
//  대조표    docs/superpowers/proto/2026-08-26-dataset-parity.md
//  발주 추가  아카이브 `표시` → 판(지도)의 레이어
const URL = 'proto/dataset.html';
const SHOTS = 'shots/proto-ds';
fs.mkdirSync(SHOTS, { recursive: true });

// 오프라인/외부 타일 실패는 이 프로토의 정상 동작이다. 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|preloaded using link preload|WebGL|vworld|xdworld|maplibre/i;
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, tab) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(URL + (tab ? `?tab=${tab}` : ''));
  await page.waitForFunction(() => document.documentElement.dataset.ds === 'ready', null, { timeout: 20000 });
  await page.waitForTimeout(900);
}
/** 유휴 운동(업로드 리빌)이 스스로 값을 옮기므로 손으로 볼 때는 세운다. */
async function hold(page) { await page.evaluate(() => { for (let i = 1; i < 9999; i++) clearInterval(i); }); }
const plateIdle = (page) => page.waitForFunction(() => ['idle', 'off'].includes(document.documentElement.dataset.plate || ''), null, { timeout: 25000 }).catch(() => {});
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });

/* ── 관문 · 레일 ──────────────────────────────────────────────────────── */
test('로그인 관문 — 플래그가 없으면 관리자 화면이 한 프레임도 새지 않는다', async ({ page }) => {
  await page.goto(URL + '?tab=archive');
  await page.waitForURL(/login\.html/, { timeout: 10000 });
  expect(decodeURIComponent(page.url())).toContain('proto/dataset.html?tab=archive');
});
test('레일 — 원본 메뉴 순서 그대로, 활성은 데이터 관리', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  expect(await page.locator('#rail .rail-i .rl').allInnerTexts()).toEqual([
    '대시보드', '데이터 관리', '프로젝트', '분석 서비스', '지도 서비스', '서비스 지원', '카드 발행 관리', '서비스 관리', 'MY', '로그아웃']);
  await expect(page.locator('.rail-i[data-menu="media"]')).toHaveAttribute('aria-current', 'page');
  expect(errs).toEqual([]);
});

/* ── 탭 4종 · `?tab=` ─────────────────────────────────────────────────── */
const TABS = [
  { id: 'upload', name: '데이터 업로드', panel: '#panel-upload', shot: 'b5-01-upload', n: 6 },
  { id: 'manage', name: '업로드 완료', panel: '#panel-manage', shot: 'b5-02-manage', n: 8 },
  { id: 'publishing', name: '레이어 발행중', panel: '#panel-publishing', shot: 'b5-03-publishing', n: 7 },
  { id: 'archive', name: '아카이브', panel: '#panel-archive', shot: 'b5-04-archive', n: 5 },
];
test('탭 4종 — 라벨·순서·건수, 기본값 upload, 활성 칩만 잉크(마스터 유보 1), 드로어는 닫혀 시작(유보 2)', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const labels = await page.locator('#ds-tabs .tb').allInnerTexts();
  TABS.forEach((t, i) => { expect(labels[i]).toContain(t.name); expect(labels[i]).toContain(String(t.n)); });
  await expect(page.locator('#tab-upload')).toHaveAttribute('aria-selected', 'true');
  const ink = await page.locator('#tab-upload').evaluate((e) => getComputedStyle(e).borderColor);
  const grey = await page.locator('#tab-archive').evaluate((e) => getComputedStyle(e).borderColor);
  expect(ink).toBe('rgb(1, 1, 2)'); expect(grey).toBe('rgb(221, 221, 221)');
  await expect(page.locator('body')).toHaveAttribute('data-side', 'none');
  for (const d of ['#pubdrawer', '#detail', '#mapdrawer']) await expect(page.locator(d)).toBeHidden();
  expect(errs).toEqual([]);
});
for (const t of TABS) {
  test(`딥링크 ?tab=${t.id} — 패널·URL · 타일 ${t.n}건 · 스크린샷`, async ({ page }) => {
    const errs = watch(page);
    await boot(page, t.id);
    await expect(page.locator(`#tab-${t.id}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(t.panel)).toBeVisible();
    expect(page.url()).toContain(`tab=${t.id}`);
    // 타일 = 목록. 업로드 탭은 드롭존 + 접힌 4건.
    const tiles = await page.locator(`${t.panel} .tile[data-id]`).count();
    expect(tiles).toBe(t.id === 'upload' ? 4 : t.n);
    await hold(page);
    await page.waitForTimeout(1200);
    await shot(page, t.shot);
    expect(errs).toEqual([]);
  });
}
test('탭 클릭 — pushState 로 ?tab= 이 따라오고 뒤로가기가 되돌린다 · 필터·검색 초기화', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await page.locator('#ds-filters').selectOption('TIF');
  await page.locator('#q').fill('ortho');
  await page.locator('#tab-archive').click();
  await page.waitForTimeout(300);
  expect(page.url()).toContain('tab=archive');
  await expect(page.locator('#q')).toHaveValue('');
  await expect(page.locator('#ds-filters')).toHaveValue('전체');
  expect(await page.locator('#ds-filters option').allInnerTexts()).toEqual(['전체', '정사영상', '이미지셋', '공간정보']);
  await page.goBack();
  await page.waitForTimeout(300);
  await expect(page.locator('#tab-upload')).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('#ds-filters option').allInnerTexts()).toEqual(['전체', 'ECW', 'TIF', 'ZIP', 'SHP', 'XLSX/XLS', '기타']);
  expect(errs).toEqual([]);
});

/* ── 업로드 — 드롭존 검증 3 · 진행 4상태 · 액션 5 · 디스크 ────────────── */
test('드롭존 — 검증 3(파일 없음 · 허용 형식 · 1 TB)', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'upload');
  await page.evaluate(() => document.getElementById('up-form').requestSubmit());
  await expect(page.locator('#up-err')).toContainText('파일을 선택');
  await page.locator('#file').setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('a') });
  await expect(page.locator('#up-err')).toContainText('허용하지 않는 형식');
  await page.evaluate(() => {
    const f = new File(['a'], 'big.tif'); Object.defineProperty(f, 'size', { value: 2 * 1024 ** 4 });
    const dt = new DataTransfer(); dt.items.add(f);
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  });
  await expect(page.locator('#up-err')).toContainText('1 TB');
  await page.locator('#file').setInputFiles({ name: 'ok.shp', mimeType: 'application/octet-stream', buffer: Buffer.from('a') });
  await expect(page.locator('#up-err')).toBeHidden();
  await page.locator('#up-go').click();
  expect(await page.locator('#tab-upload .c').innerText()).toBe('7');
  await page.locator('#up-fold').click();                                                // 접힌 목록 밖에 붙는다
  await expect(page.locator('.tile[data-st="wait"]').last()).toContainText('ok.shp');
  expect(errs).toEqual([]);
});
test('업로드 상태 기계 — 일시정지(멈춤) → 재개(그 자리부터) · 이어 올리기 · 취소 · 세부 정보 · 전체 보기', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'upload');
  expect(await page.locator('.tile[data-id="u1"]').getAttribute('data-st')).toBe('run');
  await expect(page.locator('.tile[data-id="u1"] .th')).toHaveAttribute('data-live', '');
  await page.locator('.act[data-up="u1"][data-act="pause"]').click();
  expect(await page.locator('.tile[data-id="u1"]').getAttribute('data-st')).toBe('pause');
  const p1 = await page.locator('.tile[data-id="u1"] .pv').innerText();
  await page.waitForTimeout(1900);
  expect(await page.locator('.tile[data-id="u1"] .pv').innerText()).toBe(p1);           // 멈춘다
  await page.locator('.act[data-up="u1"][data-act="resume"]').click();
  await page.waitForTimeout(1900);
  const p2 = parseInt(await page.locator('.tile[data-id="u1"] .pv').innerText(), 10);
  expect(p2).toBeGreaterThan(parseInt(p1, 10));                                          // 그 자리부터 이어진다
  await page.locator('.act[data-up="u3"][data-act="retry"]').click();
  expect(await page.locator('.tile[data-id="u3"]').getAttribute('data-st')).toBe('run');
  await page.locator('.act[data-up="u2"][data-act="detail"]').click();
  await expect(page.locator('#m-detail')).toBeVisible();
  await expect(page.locator('#md-rows')).toContainText('NW_ortho_202604_section_D.tif');
  await page.keyboard.press('Escape');
  await page.locator('.act[data-up="u2"][data-act="cancel"]').click();
  await expect(page.locator('.tile[data-id="u2"]')).toHaveCount(0);
  expect(await page.locator('#tab-upload .c').innerText()).toBe('5');
  await page.locator('#up-fold').click();
  expect(await page.locator('#panel-upload .tile[data-id]').count()).toBe(5);
  await hold(page);
  await page.locator('#up-fold').click();
  expect(errs).toEqual([]);
});
test('디스크 96% · 증량 신청 모달 — 프리셋 · 직접 입력 · 사유 필수', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'upload');
  await expect(page.locator('#disk-pct b')).toHaveText('96');
  await expect(page.locator('#disk-use')).toHaveText('1,965.0 / 2,048.0 GB · 잔여 83.0 GB');
  await page.locator('#quota-open').click();
  await expect(page.locator('#m-quota')).toBeVisible();
  expect(await page.locator('#mq-presets .chip').allInnerTexts()).toEqual(['32', '64', '128', '256', '512', '1024', '직접 입력']);
  await page.locator('#m-quota button[type="submit"]').click();
  await expect(page.locator('#mq-err')).toContainText('사유');
  await page.locator('#mq-presets .chip[data-gb="custom"]').click();
  await page.locator('#mq-gb').fill('300');
  await page.locator('#mq-why').fill('4월 정사영상 업로드');
  await page.locator('#m-quota button[type="submit"]').click();
  await expect(page.locator('#m-quota')).toBeHidden();
  await expect(page.locator('#say')).toContainText('300 GB');
  expect(errs).toEqual([]);
});

/* ── 업로드 완료 → 발행 드로어 ─────────────────────────────────────────── */
test('발행 드로어 — 선택 → 브래킷 + 선반 → 폼 5필드 · 공유 권한 표 · 필수 검증 → ?tab=publishing', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'manage');
  await page.locator('.tile[data-id="d2"] .th').click();
  await expect(page.locator('.tile[data-id="d2"] .br-svg')).toBeVisible();
  await page.locator('.act[data-dn="d2"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-side', 'pub');
  await expect(page.locator('#pubdrawer')).toBeVisible();
  expect(await page.locator('#pubdrawer .fr .k').allInnerTexts()).toEqual(['발행 유형 *', '기준 일자 *', '데이터명 *', '출처', '설명']);
  expect(await page.locator('#pf-perm .pr .o').allInnerTexts()).toEqual(['LX 한국국토정보공사', '남원시청']);
  expect(await page.locator('#pf-perm .pr').first().locator('button').allInnerTexts()).toEqual(['권한 없음', '뷰어', '편집']);
  await page.waitForTimeout(900);
  // 그리드는 3열로 물러나고 타일은 그대로 1급이다.
  const right = await page.locator('#grid').evaluate((e) => innerWidth - e.getBoundingClientRect().right);
  expect(right).toBeGreaterThanOrEqual(480);
  await shot(page, 'b5-05-drawer');
  await page.locator('#pf-name').fill('');
  await page.locator('#pubform button[type="submit"]').click();
  await expect(page.locator('#pf-err')).toContainText('데이터명');
  await page.locator('#pf-perm .pr').nth(1).locator('button[data-perm="편집"]').click();
  await page.locator('#pf-name').fill('남원 정사영상 2026-04 X권역');
  await page.locator('#pubform button[type="submit"]').click();
  await page.waitForTimeout(400);
  expect(page.url()).toContain('tab=publishing');
  await expect(page.locator('body')).toHaveAttribute('data-side', 'none');
  expect(await page.locator('#panel-publishing .tile[data-id]').count()).toBe(8);
  await expect(page.locator('#panel-publishing .tile').first()).toContainText('NW_ortho_202604_zone_X.ecw');
  await expect(page.locator('#say')).toContainText('남원시청 편집');
  expect(errs).toEqual([]);
});

/* ── 레이어 발행중 — 4단계 · 실패 사유 원문 · 좌표계 지정 · 발행 취소 ──── */
test('발행중 — 눈금 4 · 실패 2건 사유 원문 · 실패 SHP 는 실좌표 캔버스(유보 3) · 좌표계 지정 → 재발행 · 발행 취소', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'publishing');
  expect(await page.locator('.tile[data-id="p1"] .ticks i').count()).toBe(4);
  expect(await page.locator('.tile[data-id="p1"] .ticks i.on').count()).toBe(2);   // 마스터: 채움 = 완료 단계 수
  await expect(page.locator('.tile[data-id="p1"] .shelf .st')).toHaveText('2/4 공간정보 분석');
  expect(await page.locator('.tile[data-st="fail"]').count()).toBe(2);
  await expect(page.locator('.tile[data-id="p2"] .why')).toHaveText('좌표체계 정보를 확인할 수 없습니다. 좌표계를 지정해 다시 발행해 주세요.');
  await expect(page.locator('.tile[data-id="p2"] .ticks i.fail')).toHaveCount(1);
  await expect(page.locator('.tile[data-id="p2"] .br-svg path')).toHaveAttribute('stroke', '#FFB633');
  await page.waitForTimeout(800);
  await expect(page.locator('.tile[data-id="p2"] .tag2')).toContainText(/EPSG 없음 · \d+ polygon/);
  const n = parseInt((await page.locator('.tile[data-id="p2"] .tag2').innerText()).match(/(\d+) polygon/)[1], 10);
  expect(n).toBeGreaterThan(20);
  expect(await page.locator('.tile[data-id="p2"] .shelf .act').allInnerTexts()).toEqual(['좌표계 지정', '발행 취소', '세부 정보']);
  await page.locator('.act[data-pb="p2"][data-act="crs"]').click();
  await expect(page.locator('#m-crs')).toBeVisible();
  await page.locator('#m-crs button[type="submit"]').click();
  expect(await page.locator('.tile[data-id="p2"]').getAttribute('data-st')).toBe('run');
  await expect(page.locator('.tile[data-id="p2"] .shelf .st')).toHaveText('1/4 파일 확인');
  await page.locator('.act[data-pb="p6"][data-act="cancel"]').click();
  await expect(page.locator('.tile[data-id="p6"]')).toHaveCount(0);
  expect(await page.locator('#tab-publishing .c').innerText()).toBe('6');
  expect(errs).toEqual([]);
});

/* ── 아카이브 — 5액션 · 표시 → 판 레이어 ────────────────────────────────── */
test('아카이브 표시 → 판의 레이어 — 줌 투 익스텐트 · 숨김은 감쇠(목록에 남는다) · 범위 없는 자산은 자백 · 삭제는 내린다', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'archive');
  expect(await page.locator('.tile[data-id="a1"] .shelf .act').allInnerTexts()).toEqual(['숨김', '공유', '공간 편집', '삭제', '상세']);
  await expect(page.locator('.tile[data-id="a2"]')).toHaveAttribute('data-hidden', '1');
  await expect(page.locator('.tile[data-id="a2"] .shelf .st')).toHaveText('숨김 — 삭제 아님');
  // 표시된 자산을 한 번 숨겼다가 다시 표시 — 판이 열리고 레이어가 선다.
  await page.locator('.act[data-ar="a5"][data-act="vis"]').click();
  await expect(page.locator('.tile[data-id="a5"]')).toHaveAttribute('data-hidden', '1');
  await page.locator('.act[data-ar="a5"][data-act="vis"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-side', 'map');
  await expect(page.locator('#mapdrawer')).toBeVisible();
  await expect(page.locator('.ly[data-id="a5"]')).toHaveAttribute('data-hidden', '0');
  await expect(page.locator('.ly[data-id="a5"]')).toContainText('86셀');
  await plateIdle(page);
  const plate = await page.evaluate(() => document.documentElement.dataset.plate);
  if (plate !== 'off') {
    await expect.poll(() => page.evaluate(() => !!(window.__dsMap && window.__dsMap.getLayer('ly-a5'))), { timeout: 15000 }).toBe(true);
    // 줌 투 익스텐트 — 카메라가 여수 격자 범위 안으로 갔다.
    await expect.poll(() => page.evaluate(() => { const c = window.__dsMap.getCenter(); return c.lng > 127.6 && c.lng < 127.75 && c.lat > 34.55 && c.lat < 34.65 && window.__dsMap.getZoom() > 10; }), { timeout: 15000 }).toBe(true);
    await expect(page.locator('#plate-cap')).toContainText('86셀');
    await expect(page.locator('#ex-layer .ex')).toHaveCount(1);
  }
  await page.waitForTimeout(1500);
  await shot(page, 'b5-06-map');
  // 정사영상 도엽 — 타일 피라미드가 레이어로 선다.
  await page.locator('.act[data-ar="a1"][data-act="vis"]').click();
  await page.locator('.act[data-ar="a1"][data-act="vis"]').click();
  await expect(page.locator('.ly[data-id="a1"]')).toContainText('GSD 1.08 cm');
  if (plate !== 'off') {
    await expect.poll(() => page.evaluate(() => !!window.__dsMap.getLayer('ly-a1')), { timeout: 15000 }).toBe(true);
    await expect(page.locator('#plate-cap')).toContainText('GSD 1.08 cm');
  }
  // 숨김 = 감쇠. 목록에 남고 판에서는 꺼진다.
  await page.locator('.ly[data-id="a1"] .act[data-act="vis"]').click();
  await expect(page.locator('.ly[data-id="a1"]')).toHaveAttribute('data-hidden', '1');
  await expect(page.locator('.tile[data-id="a1"]')).toHaveAttribute('data-hidden', '1');
  if (plate !== 'off') expect(await page.evaluate(() => window.__dsMap.getLayoutProperty('ly-a1', 'visibility'))).toBe('none');
  // 범위 없는 자산 — 판은 자백한다.
  await page.locator('.act[data-ar="a4"][data-act="vis"]').click();
  await page.locator('.act[data-ar="a4"][data-act="vis"]').click();
  await expect(page.locator('.ly[data-id="a4"]')).toContainText('실측 범위 없음');
  await expect(page.locator('#say')).toContainText('실측 범위 없음');
  await plateIdle(page);
  await page.waitForTimeout(1200);
  await shot(page, 'b5-07-map-layers');
  // 삭제 — 레이어가 내려온다.
  await page.locator('.act[data-ar="a5"][data-act="del"]').click();
  await expect(page.locator('.ly[data-id="a5"]')).toHaveCount(0);
  if (plate !== 'off') expect(await page.evaluate(() => !!window.__dsMap.getLayer('ly-a5'))).toBe(false);
  expect(await page.locator('#tab-archive .c').innerText()).toBe('4');
  // 그리드 보기로 돌아가면 판이 닫힌다.
  await page.locator('#view-grid').click();
  await expect(page.locator('body')).toHaveAttribute('data-side', 'none');
  expect(errs).toEqual([]);
});
test('아카이브 상세 · 공유 설정 · 공간 편집', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'archive');
  await page.locator('.act[data-ar="a1"][data-act="detail"]').click();
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#detail-h')).toHaveText('남원 정사영상 2026-04 A구역');
  expect(await page.locator('#detail-rows .dt-r span').allInnerTexts()).toEqual(['데이터명', '출처', '설명', '실측 범위']);
  await expect(page.locator('#detail-rows')).toContainText('127.3481');
  expect(await page.locator('#detail-bands .dt-b').count()).toBe(3);
  await page.locator('#detail .act[data-act="share"]').click();
  await expect(page.locator('#m-share')).toBeVisible();
  expect(await page.locator('#ms-perm .pr .o').allInnerTexts()).toEqual(['LX 한국국토정보공사', '남원시청']);
  await page.locator('#ms-perm .pr').nth(1).locator('button[data-perm="편집"]').click();
  await page.locator('#m-share button[type="submit"]').click();
  await expect(page.locator('#say')).toContainText('남원시청 편집');
  await page.locator('.act[data-ar="a3"][data-act="geo"]').click();
  await expect(page.locator('#say')).toContainText('실측 범위 없음');
  await page.locator('.act[data-ar="a1"][data-act="geo"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-side', 'map');
  await expect(page.locator('.ly[data-id="a1"]')).toHaveCount(1);
  expect(errs).toEqual([]);
});

/* ── 시스템 — 라운드 0 · 그림자 0 · 액센트 1곳 · 푸터 ──────────────────── */
test('시스템 — 라운드·그림자·그라디언트 0, 액센트는 살아있는 업로드뿐, 푸터 include', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'upload');
  const bad = await page.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('#mast *, #tool *, #grid *, #foot *')) {
      const cs = getComputedStyle(e);
      if (parseFloat(cs.borderRadius) > 0 && !e.closest('svg')) out.push('radius ' + e.className);
      if (cs.boxShadow !== 'none') out.push('shadow ' + e.className);
      if (/gradient/.test(cs.backgroundImage)) out.push('gradient ' + e.className);
    }
    return out;
  });
  expect(bad).toEqual([]);
  const accent = await page.evaluate(() => [...document.querySelectorAll('#grid *')].filter((e) => {
    const cs = getComputedStyle(e); return [cs.color, cs.backgroundColor, cs.borderLeftColor].includes('rgb(0, 109, 247)');
  }).map((e) => e.className).sort());
  expect(accent).toEqual(['pv', 'rv-line']);
  expect(await page.locator('#foot-links span').allInnerTexts()).toEqual(['개인정보처리방침', '이용약관', '이메일주소무단수집거부']);
  await expect(page.locator('#foot-addr')).toContainText('063-713-1213');
  await expect(page.locator('#foot .fam')).toContainText('Family Site');
  expect(errs).toEqual([]);
});
