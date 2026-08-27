import { test, expect } from '@playwright/test';

// 데이터 관리 — 대시보드 골격(공지 · 기준일 · 제목 · KPI 카드 5) + 단계 뷰(좌 타일 그리드 / 우 패널), 원본 1:1
//  원본      https://mini531.github.io/namwon-smart-village/landxi7/dataset.html
//            (+ dataset-upload / dataset-manage / dataset-manage-publishing / dataset-archive)
//  마스터    design-canvas/v2/B5-DataMgmt.dc.html (1440×900) · NOTES.md §13.7
//  대조표    docs/superpowers/proto/2026-08-26-dataset-parity.md §11
//  발주      KPI 카드 = 단계 선택 · 타일에 선반 없음(상태는 그림 위) · 완료 선택 = 우측에 지도 + 기본 정보 자동 ·
//            발행중 진행 경과는 카드 위 · 액션은 우 패널 · 타일 4단(S·M·L·XL) · `대기중 n건 더 · 전체 보기` 없음 — 전 건 표출
const URL = 'proto/dataset.html';
const ACCENT = 'rgb(0, 109, 247)', WARN = 'rgb(209, 53, 43)', TINT = 'rgb(232, 241, 255)';

// 오프라인/외부 타일 실패는 이 프로토의 정상 동작이다. 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|preloaded using link preload|WebGL|vworld|xdworld|maplibre/i;
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, tab) {
  // 타일 크기는 첫 진입에서만 지운다 — 같은 테스트 안의 새로고침은 저장값을 봐야 한다.
  await page.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); if (!sessionStorage.getItem('lx_e2e')) { localStorage.removeItem('lx_ds_size'); sessionStorage.setItem('lx_e2e', '1'); } });
  await page.goto(URL + (tab ? `?tab=${tab}` : ''));
  await page.waitForFunction(() => document.documentElement.dataset.ds === 'ready', null, { timeout: 20000 });
  await page.waitForTimeout(700);
}
/** 유휴 운동(업로드 리빌)이 스스로 값을 옮기므로 손으로 볼 때는 세운다. */
async function hold(page) { await page.evaluate(() => { for (let i = 1; i < 9999; i++) clearInterval(i); }); }
const plateIdle = (page) => page.waitForFunction(() => ['idle', 'off'].includes(document.documentElement.dataset.plate || ''), null, { timeout: 25000 }).catch(() => {});
const select = async (page, id) => { await page.locator(`.th[data-open="${id}"]`).click(); await page.waitForTimeout(250); };
const kpi = (page, id) => page.locator(`#kpi-${id} .kv b`).innerText();
const cols = (page, list) => page.locator(list).evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);

const STAGES = [
  { id: 'upload', name: '데이터 업로드', panel: '#panel-upload', n: 6 },
  { id: 'manage', name: '업로드 완료', panel: '#panel-manage', n: 8 },
  { id: 'publishing', name: '레이어 발행중', panel: '#panel-publishing', n: 7 },
  { id: 'archive', name: '아카이브', panel: '#panel-archive', n: 5 },
];

/* ── 관문 · 레일 · 마스트헤드 ─────────────────────────────────────────── */
test('로그인 관문 — 플래그가 없으면 관리자 화면이 한 프레임도 새지 않는다', async ({ page }) => {
  await page.goto(URL + '?tab=archive');
  await page.waitForURL(/login\.html/, { timeout: 10000 });
  expect(decodeURIComponent(page.url())).toContain('proto/dataset.html?tab=archive');
});
test('레일 · 마스트헤드 — 대시보드와 같은 공지 + 기준일, 활성은 데이터 관리, 제목 밑 파랑 룰', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  expect(await page.locator('#rail .rail-i .rl').allInnerTexts()).toEqual([
    '대시보드', '데이터 관리', '프로젝트', '분석 서비스', '지도 서비스', '서비스 지원', '카드 발행 관리', '서비스 관리', 'MY', '로그아웃']);
  await expect(page.locator('.rail-i[data-menu="media"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#mast .chip')).toHaveText('공지');
  await expect(page.locator('#notice-t')).toHaveText('고위험 탐지 건 긴급 처리 안내');
  await expect(page.locator('#mast .more')).toHaveText('전체 보기 ›');
  await expect(page.locator('#b2-d')).toHaveText('2026.06.08');
  await expect(page.locator('#b1')).toHaveText('데이터 관리');
  expect(await page.locator('#b1').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Paperlogy/);
  expect(await page.locator('body').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Pretendard/);
  const rule = await page.locator('#b1 .rule').evaluate((e) => { const cs = getComputedStyle(e, '::after'); return [cs.backgroundColor, cs.height]; });
  expect(rule).toEqual([ACCENT, '4px']);
  expect(errs).toEqual([]);
});

/* ── KPI 카드 5 = 디스크 + 단계 4 · 카드 클릭 = ?tab= ──────────────────── */
test('KPI 카드 5 — 디스크 96 %(warn + 증량 신청) · 단계 4 건수 · 기본 upload 선택(틴트 + 밑줄) · 클릭 = ?tab= · 뒤로가기', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  expect(await page.locator('#b-kpi .k .kl').allInnerTexts()).toEqual(['내 디스크 사용량', '데이터 업로드', '업로드 완료', '레이어 발행중', '아카이브']);
  expect(await page.locator('#b-kpi .k .kv').evaluateAll((es) => es.map((e) => e.textContent.replace(/s+/g, '')))).toEqual(['96%', '6건', '8건', '7건', '5건']);
  await expect(page.locator('#kpi-disk .ks')).toHaveText('1,965 / 2,048 GB · 잔여 83 GB');
  expect(await page.locator('#kpi-disk .kv b').evaluate((e) => getComputedStyle(e).color)).toBe(WARN);
  await expect(page.locator('#quota-open')).toHaveText('디스크 증량 신청 ›');
  await expect(page.locator('#kpi-publishing .ks')).toHaveText('진행 5 · 실패 2');
  expect(await page.locator('#kpi-publishing .ks em').evaluate((e) => getComputedStyle(e).color)).toBe(WARN);
  await expect(page.locator('#kpi-upload')).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('#kpi-upload').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(TINT);
  expect(await page.locator('#kpi-upload').evaluate((e) => getComputedStyle(e, '::after').backgroundColor)).toBe(ACCENT);
  expect(await page.locator('#kpi-manage').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('#tool-h')).toHaveText('데이터 업로드');
  await expect(page.locator('#tool-c')).toHaveText('6건');
  // 필터·검색을 만진 뒤 카드로 단계를 옮기면 초기화된다(원본 동작)
  await page.locator('#ds-filters').selectOption('TIF');
  await page.locator('#q').fill('ortho');
  await page.locator('#kpi-archive').click();
  await page.waitForTimeout(300);
  expect(page.url()).toContain('tab=archive');
  await expect(page.locator('#kpi-archive')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-archive')).toBeVisible();
  await expect(page.locator('#panel-upload')).toBeHidden();
  await expect(page.locator('#q')).toHaveValue('');
  await expect(page.locator('#ds-filters')).toHaveValue('전체');
  expect(await page.locator('#ds-filters option').allInnerTexts()).toEqual(['전체', '정사영상', '이미지셋', '공간정보']);
  await expect(page.locator('#tool-h')).toHaveText('아카이브');
  await page.goBack();
  await page.waitForTimeout(300);
  await expect(page.locator('#kpi-upload')).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('#ds-filters option').allInnerTexts()).toEqual(['전체', 'ECW', 'TIF', 'ZIP', 'SHP', 'XLSX/XLS', '기타']);
  expect(errs).toEqual([]);
});

/* ── 단계 4 — 전 건 표출 · 선반 없음 · 시작은 선택 없음(빈 상태 판 + 건수) ── */
for (const s of STAGES) {
  test(`?tab=${s.id} — 타일 ${s.n} = KPI 건수 · 접힘/전체 보기 없음 · 타일에 버튼 0 · 우 패널은 빈 상태(${s.n})`, async ({ page }) => {
    const errs = watch(page);
    await boot(page, s.id);
    await expect(page.locator(`#kpi-${s.id}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(s.panel)).toBeVisible();
    expect(await page.locator(`${s.panel} .tile[data-id]`).count()).toBe(s.n);
    expect(await kpi(page, s.id)).toBe(String(s.n));
    if (s.id === 'upload') await expect(page.locator('#up-form.tile #drop')).toBeVisible();     // 드롭존 = 첫 타일
    const text = await page.locator('#main').innerText();
    expect(text).not.toMatch(/전체 보기|건 더|접기/);
    expect(text).not.toMatch(/습니다|세요|합니다|입니다/);                                         // 문장 0
    expect(await page.locator('#grid .tile[data-id] button, #grid .shelf').count()).toBe(0);      // 선반 없음
    await expect(page.locator('#side')).toHaveAttribute('data-mode', 'none');
    await expect(page.locator('#side-h')).toHaveText(s.name);
    await expect(page.locator('#side-m')).toHaveText(`선택 0 / ${s.n}`);
    await expect(page.locator('#side .fig--none .big')).toHaveText(String(s.n));
    await expect(page.locator('#plate-wrap')).toBeHidden();
    expect(await page.locator('#grid .tile[aria-current="true"]').count()).toBe(0);
    expect(errs).toEqual([]);
  });
}

/* ── 타일 크기 4단 — 열 수 6/4/3/2, localStorage ─────────────────────── */
test('타일 크기 S·M·L·XL — 열 6/4/3/2 · 그림도 같이 커진다 · 새로고침 뒤에도 남는다', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'manage');
  await expect(page.locator('#size button[data-size="M"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await cols(page, '#dn-list')).toBe(4);
  const wM = await page.locator('.tile[data-id="d1"] .th').evaluate((e) => e.getBoundingClientRect().width);
  for (const [k, n] of [['S', 6], ['L', 3], ['XL', 2]]) {
    await page.locator(`#size button[data-size="${k}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-size', k);
    expect(await cols(page, '#dn-list')).toBe(n);
  }
  const wXL = await page.locator('.tile[data-id="d1"] .th').evaluate((e) => e.getBoundingClientRect().width);
  expect(wXL).toBeGreaterThan(wM * 1.8);
  expect(await page.evaluate(() => localStorage.getItem('lx_ds_size'))).toBe('XL');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ds === 'ready');
  await expect(page.locator('body')).toHaveAttribute('data-size', 'XL');
  expect(await cols(page, '#dn-list')).toBe(2);
  expect(errs).toEqual([]);
});

/* ── 업로드 — 드롭존 검증 3 · 진행 4상태(그림 위 리빌 + %) · 액션 5 는 우 패널 ── */
test('드롭존 — 검증 3(파일 없음 · 허용 형식 · 1 TB) · 대기 건은 접지 않고 바로 선다', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'upload');
  await page.evaluate(() => document.getElementById('up-form').requestSubmit());
  await expect(page.locator('#up-err')).toContainText('파일 없음');
  await page.locator('#file').setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('a') });
  await expect(page.locator('#up-err')).toContainText('허용 형식 아님');
  await page.evaluate(() => {
    const f = new File(['a'], 'big.tif'); Object.defineProperty(f, 'size', { value: 2 * 1024 ** 4 });
    const dt = new DataTransfer(); dt.items.add(f);
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  });
  await expect(page.locator('#up-err')).toContainText('1 TB 초과');
  await page.locator('#file').setInputFiles({ name: 'ok.shp', mimeType: 'application/octet-stream', buffer: Buffer.from('a') });
  await expect(page.locator('#up-err')).toBeHidden();
  await page.locator('#up-go').click();
  expect(await kpi(page, 'upload')).toBe('7');
  expect(await page.locator('#panel-upload .tile[data-id]').count()).toBe(7);
  await expect(page.locator('.tile[data-st="wait"]').last()).toContainText('ok.shp');
  expect(errs).toEqual([]);
});
test('업로드 상태 기계(우 패널) — 일시정지(멈춤) → 재개(그 자리부터) · 이어 올리기 · 세부 정보 · 취소 · Esc = 선택 해제', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'upload');
  expect(await page.locator('.tile[data-id="u1"]').getAttribute('data-st')).toBe('run');
  await expect(page.locator('.tile[data-id="u1"] .th')).toHaveAttribute('data-live', '');
  expect(await page.locator('.tile[data-id="u1"] .pv').evaluate((e) => getComputedStyle(e).color)).toBe(ACCENT);
  await expect(page.locator('.tile[data-id="u2"] .st')).toHaveText(/일시정지 \d+%/);
  await expect(page.locator('.tile[data-id="u3"] .st')).toHaveText(/중단됨 \d+%/);
  await expect(page.locator('.tile[data-id="u4"] .st')).toHaveText('대기중 0%');
  await expect(page.locator('.tile[data-id="u2"]')).toHaveAttribute('data-dim', '');
  await select(page, 'u1');
  await expect(page.locator('.tile[data-id="u1"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#side')).toHaveAttribute('data-mode', 'tile');
  await expect(page.locator('#side-m')).toHaveText('선택 1 / 6');
  expect(await page.locator('#side-acts .act').allInnerTexts()).toEqual(['일시정지', '취소', '세부 정보']);
  await page.locator('#side-acts .act[data-up="u1"][data-act="pause"]').click();
  expect(await page.locator('.tile[data-id="u1"]').getAttribute('data-st')).toBe('pause');
  expect(await page.locator('#side-acts .act').allInnerTexts()).toEqual(['재개', '취소', '세부 정보']);
  const p1 = await page.locator('.tile[data-id="u1"] .pv').innerText();
  await page.waitForTimeout(1900);
  expect(await page.locator('.tile[data-id="u1"] .pv').innerText()).toBe(p1);           // 멈춘다
  await page.locator('#side-acts .act[data-up="u1"][data-act="resume"]').click();
  await page.waitForTimeout(1900);
  expect(parseInt(await page.locator('.tile[data-id="u1"] .pv').innerText(), 10)).toBeGreaterThan(parseInt(p1, 10));
  await hold(page);
  await select(page, 'u3');
  expect(await page.locator('#side-acts .act').allInnerTexts()).toEqual(['이어 올리기', '취소', '세부 정보']);
  await page.locator('#side-acts .act[data-up="u3"][data-act="retry"]').click();
  expect(await page.locator('.tile[data-id="u3"]').getAttribute('data-st')).toBe('run');
  await select(page, 'u2');
  await page.locator('#side-acts .act[data-up="u2"][data-act="detail"]').click();
  expect(await page.locator('#side-info dt').allInnerTexts()).toContain('대기 순번');
  await expect(page.locator('#side-h')).toHaveText('NW_ortho_202604_section_D.tif');
  await page.locator('#side-acts .act[data-up="u2"][data-act="cancel"]').click();
  await expect(page.locator('.tile[data-id="u2"]')).toHaveCount(0);
  expect(await kpi(page, 'upload')).toBe('5');
  await expect(page.locator('#side')).toHaveAttribute('data-mode', 'none');
  await select(page, 'u4');
  expect(await page.locator('#side-acts .act').allInnerTexts()).toEqual(['취소', '세부 정보']);
  await page.keyboard.press('Escape');
  await expect(page.locator('#side')).toHaveAttribute('data-mode', 'none');
  expect(await page.locator('#grid .tile[aria-current="true"]').count()).toBe(0);
  expect(errs).toEqual([]);
});
test('디스크 96 % · 증량 신청 모달 — 프리셋 · 직접 입력 · 사유 필수', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'upload');
  await page.locator('#quota-open').click();
  await expect(page.locator('#m-quota')).toBeVisible();
  await expect(page.locator('#mq-tag')).toContainText('1,965 / 2,048 GB · 잔여 83 GB');
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

/* ── 업로드 완료 — 선택 = 우측에 지도 + 기본 정보 자동 · 발행 폼은 패널 안 ── */
test('완료 타일 선택 — 브래킷 + 틴트 캡션, 우 패널에 V-World 판(도엽 + 실측 브래킷) + 기본 정보 + `지도 레이어 발행 ›` · 다시 누르면 해제', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'manage');
  await expect(page.locator('.tile[data-id="d4"] .word')).toHaveText('완료 · 아카이빙 2회');
  await select(page, 'd4');
  await expect(page.locator('.tile[data-id="d4"]')).toHaveAttribute('aria-current', 'true');
  expect(await page.locator('.tile[data-id="d4"] .bk--tl').evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(ACCENT);
  expect(await page.locator('.tile[data-id="d4"] .cap').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(TINT);
  await expect(page.locator('#side')).toHaveAttribute('data-mode', 'tile');
  await expect(page.locator('#side-h')).toHaveText('NW_ortho_202604_section_A.tif');
  await expect(page.locator('#side-m')).toHaveText('선택 1 / 8');
  await expect(page.locator('#plate-wrap')).toBeVisible();
  expect(await page.locator('#side-info dt').allInnerTexts()).toEqual(['이름', '형식', '크기', '업로드 일시', '촬영일', 'GSD', '좌표계', '아카이빙', '등록자', '범위']);
  await expect(page.locator('#side-info dd').nth(5)).toHaveText('1.08 cm');
  await expect(page.locator('#side-info dd').last()).toHaveText('127.3481, 35.5276, 127.3567, 35.5347');
  expect(await page.locator('#side-acts .act').allInnerTexts()).toEqual(['지도 레이어 발행 ›']);
  await expect(page.locator('#side-acts')).toBeInViewport();                              // 액션은 스크롤 밖 — 항상 보인다
  await plateIdle(page);
  if ((await page.evaluate(() => document.documentElement.dataset.plate)) !== 'off') {
    await expect.poll(() => page.evaluate(() => !!(window.__dsMap && window.__dsMap.getLayer('ly-sel'))), { timeout: 15000 }).toBe(true);
    await expect(page.locator('#plate-cap')).toContainText('GSD 1.08 cm · 측정');
    await expect(page.locator('#ex-layer .ex')).toHaveCount(1);
  }
  // 그림이 없는 자산은 액자 + 자백. 판은 도엽이 있을 때만.
  await select(page, 'd6');
  await expect(page.locator('#plate-wrap')).toBeHidden();
  await expect(page.locator('#fig-wrap .fig--none')).toContainText('좌표계 없음');
  await expect(page.locator('#side-info dd').last()).toHaveText('실측 범위 없음');
  await select(page, 'd6');                                                              // 토글 해제
  await expect(page.locator('#side')).toHaveAttribute('data-mode', 'none');
  await expect(page.locator('#side-m')).toHaveText('선택 0 / 8');
  expect(errs).toEqual([]);
});
test('발행 폼(패널 안) — 5필드 · 공유 권한 표 · 필수 검증 · 취소 · 발행 → ?tab=publishing 맨 앞', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'manage');
  await select(page, 'd2');
  await page.locator('#side-acts .act[data-dn="d2"]').click();
  await expect(page.locator('#side')).toHaveAttribute('data-mode', 'pub');
  await expect(page.locator('#pubform')).toBeVisible();
  expect(await page.locator('#pubform .fr .k').allInnerTexts()).toEqual(['발행 유형 *', '기준 일자 *', '데이터명 *', '출처', '설명']);
  expect(await page.locator('#pf-perm .pr .o').allInnerTexts()).toEqual(['LX 한국국토정보공사', '남원시청']);
  expect(await page.locator('#pf-perm .pr').first().locator('button').allInnerTexts()).toEqual(['권한 없음', '뷰어', '편집']);
  expect(await page.locator('#side-acts .act').count()).toBe(0);                        // 액션은 폼 안(취소 / 발행)
  await page.locator('#pubform [data-pf-close]').click();
  await expect(page.locator('#side')).toHaveAttribute('data-mode', 'tile');
  await page.locator('#side-acts .act[data-dn="d2"]').click();
  await page.locator('#pf-name').fill('');
  await page.locator('#pubform button[type="submit"]').click();
  await expect(page.locator('#pf-err')).toContainText('데이터명');
  await page.locator('#pf-perm .pr').nth(1).locator('button[data-perm="편집"]').click();
  await page.locator('#pf-name').fill('남원 정사영상 2026-04 X권역');
  await page.locator('#pubform button[type="submit"]').click();
  await page.waitForTimeout(400);
  expect(page.url()).toContain('tab=publishing');
  await expect(page.locator('#kpi-publishing')).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('#panel-publishing .tile[data-id]').count()).toBe(8);
  expect(await kpi(page, 'publishing')).toBe('8');
  expect(await kpi(page, 'manage')).toBe('7');
  await expect(page.locator('#panel-publishing .tile').first()).toContainText('NW_ortho_202604_zone_X.ecw');
  await expect(page.locator('#say')).toContainText('남원시청 편집');
  expect(errs).toEqual([]);
});

/* ── 레이어 발행중 — 진행 경과는 카드 위(4눈금 + %) · 실패 = warn 브래킷 + 사유 · 액션은 패널 ── */
test('발행중 — 눈금 4 · 채움 = 완료 단계 · 리빌 % · 실패 2 = warn 브래킷 + 짧은 사유(카드) / 원문(패널) · 좌표계 지정 → 재발행 · 발행 취소', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'publishing');
  expect(await page.locator('.tile[data-id="p1"] .ticks i').count()).toBe(4);
  expect(await page.locator('.tile[data-id="p1"] .ticks i.on').count()).toBe(2);
  await expect(page.locator('.tile[data-id="p1"] .st')).toHaveText(/2\/4.*37%/);
  await expect(page.locator('.tile[data-id="p3"] .th')).toHaveAttribute('data-live', '');
  expect(await page.locator('.tile[data-id="p3"] .rv-top').evaluate((e) => e.style.getPropertyValue('--rest'))).toBe('38%');
  expect(await page.locator('.tile[data-st="fail"]').count()).toBe(2);
  await expect(page.locator('.tile[data-id="p2"] .st')).toHaveText('실패 2/4 · 좌표계 없음');
  expect(await page.locator('.tile[data-id="p2"] .st').evaluate((e) => getComputedStyle(e).color)).toBe(WARN);
  expect(await page.locator('.tile[data-id="p2"] .bk--tl').evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(WARN);
  await expect(page.locator('.tile[data-id="p2"] .ticks i.fail')).toHaveCount(1);
  await expect(page.locator('.tile[data-id="p2"]')).toHaveAttribute('data-dim', '');
  await page.waitForTimeout(800);
  await expect(page.locator('.tile[data-id="p2"] .tagb')).toHaveText(/EPSG 없음 · \d+ polygon/);       // 실좌표 실루엣(유보 3)
  await select(page, 'p2');
  await expect(page.locator('#side-h')).toHaveText('NW_greenhouse_labels_202603.shp');
  await expect(page.locator('#side-info dd.warn')).toHaveText('좌표체계 정보를 확인할 수 없습니다. 좌표계를 지정해 다시 발행해 주세요.');
  expect(await page.locator('#side-acts .act').allInnerTexts()).toEqual(['좌표계 지정', '발행 취소', '세부 정보']);
  await page.locator('#side-acts .act[data-pb="p2"][data-act="crs"]').click();
  await expect(page.locator('#m-crs')).toBeVisible();
  await page.locator('#m-crs button[type="submit"]').click();
  expect(await page.locator('.tile[data-id="p2"]').getAttribute('data-st')).toBe('run');
  await expect(page.locator('.tile[data-id="p2"] .st')).toHaveText(/1\/4.*12%/);
  await expect(page.locator('#kpi-publishing .ks')).toHaveText('진행 6 · 실패 1');
  await select(page, 'p6');
  expect(await page.locator('#side-acts .act').allInnerTexts()).toEqual(['좌표계 지정', '발행 취소', '세부 정보']);
  await page.locator('#side-acts .act[data-pb="p6"][data-act="cancel"]').click();
  await expect(page.locator('.tile[data-id="p6"]')).toHaveCount(0);
  expect(await kpi(page, 'publishing')).toBe('6');
  await select(page, 'p3');
  expect(await page.locator('#side-acts .act').allInnerTexts()).toEqual(['발행 취소', '세부 정보']);
  await expect(page.locator('#fig-wrap .fig')).toHaveAttribute('data-live', '');
  expect(await page.locator('#fig-wrap .ticks i.on').count()).toBe(3);
  expect(errs).toEqual([]);
});

/* ── 아카이브 — 선택 = 판의 레이어 · 5액션은 패널 · 숨김 = 감쇠 · 범위 없는 자산은 자백 ── */
test('아카이브 선택 → 판의 레이어(줌 투 익스텐트) · 5액션 · 숨김은 감쇠(목록에 남는다) · 범위 없음 자백 · 삭제는 내린다', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'archive');
  await expect(page.locator('.tile[data-id="a2"]')).toHaveAttribute('data-hidden', '1');
  await expect(page.locator('.tile[data-id="a2"] .st')).toHaveText('숨김 · 삭제 아님');
  await expect(page.locator('.tile[data-id="a1"] .word')).toHaveText('아카이브 · 정사영상');
  await select(page, 'a5');
  await expect(page.locator('#side')).toHaveAttribute('data-mode', 'tile');
  await expect(page.locator('#plate-wrap')).toBeVisible();
  expect(await page.locator('#side-acts .act').allInnerTexts()).toEqual(['숨김', '공유', '공간 편집', '삭제', '상세']);
  await expect(page.locator('.ly[data-id="a5"]')).toHaveAttribute('data-hidden', '0');
  await expect(page.locator('.ly[data-id="a5"]')).toContainText('86셀');
  await plateIdle(page);
  const plate = await page.evaluate(() => document.documentElement.dataset.plate);
  if (plate !== 'off') {
    await expect.poll(() => page.evaluate(() => !!(window.__dsMap && window.__dsMap.getLayer('ly-a5'))), { timeout: 15000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => { const c = window.__dsMap.getCenter(); return c.lng > 127.6 && c.lng < 127.75 && c.lat > 34.55 && c.lat < 34.65 && window.__dsMap.getZoom() > 10; }), { timeout: 15000 }).toBe(true);
    await expect(page.locator('#plate-cap')).toContainText('86셀');
    await expect(page.locator('#ex-layer .ex')).toHaveCount(1);
  }
  // 숨김 = 감쇠. 목록에 남고 판에서는 꺼진다. 표시 = 다시 선다.
  await page.locator('#side-acts .act[data-ar="a5"][data-act="vis"]').click();
  await expect(page.locator('.tile[data-id="a5"]')).toHaveAttribute('data-hidden', '1');
  await expect(page.locator('.ly[data-id="a5"]')).toHaveAttribute('data-hidden', '1');
  expect(await page.locator('#side-acts .act').first().innerText()).toBe('표시');
  if (plate !== 'off') await expect.poll(() => page.evaluate(() => window.__dsMap.getLayoutProperty('ly-a5', 'visibility'))).toBe('none');
  await page.locator('#side-acts .act[data-ar="a5"][data-act="vis"]').click();
  await expect(page.locator('.tile[data-id="a5"]')).toHaveAttribute('data-hidden', '0');
  // 정사영상 도엽 — 타일 피라미드가 레이어로 선다.
  await select(page, 'a1');
  await expect(page.locator('.ly[data-id="a1"]')).toContainText('GSD 1.08 cm');
  if (plate !== 'off') {
    await expect.poll(() => page.evaluate(() => !!window.__dsMap.getLayer('ly-a1')), { timeout: 15000 }).toBe(true);
    await expect(page.locator('#plate-cap')).toContainText('GSD 1.08 cm');
  }
  // 범위 없는 자산 — 판은 자백한다.
  await select(page, 'a4');
  await expect(page.locator('.ly[data-id="a4"]')).toContainText('실측 범위 없음');
  await expect(page.locator('#plate-cap')).toContainText('실측 범위 없음');
  await expect(page.locator('#side-info dd').last()).toHaveText('실측 범위 없음');
  // 삭제 — 레이어가 내려온다.
  await select(page, 'a5');
  await page.locator('#side-acts .act[data-ar="a5"][data-act="del"]').click();
  await expect(page.locator('.tile[data-id="a5"]')).toHaveCount(0);
  await expect(page.locator('#side')).toHaveAttribute('data-mode', 'none');
  await expect(page.locator('.ly[data-id="a5"]')).toHaveCount(0);
  if (plate !== 'off') expect(await page.evaluate(() => !!window.__dsMap.getLayer('ly-a5'))).toBe(false);
  expect(await kpi(page, 'archive')).toBe('4');
  expect(errs).toEqual([]);
});
test('아카이브 상세(밴드·속성) · 공유 설정 모달 · 공간 편집', async ({ page }) => {
  const errs = watch(page);
  await boot(page, 'archive');
  await select(page, 'a1');
  await page.locator('#side-acts .act[data-ar="a1"][data-act="detail"]').click();
  await expect(page.locator('#side-acts .act[data-act="detail"]')).toHaveClass(/on/);
  expect(await page.locator('#side-info dt').allInnerTexts()).toEqual(expect.arrayContaining(['데이터명', '출처', '설명']));
  expect(await page.locator('#side-info .dt-b').count()).toBe(3);
  await page.locator('#side-acts .act[data-ar="a1"][data-act="share"]').click();
  await expect(page.locator('#m-share')).toBeVisible();
  expect(await page.locator('#ms-perm .pr .o').allInnerTexts()).toEqual(['LX 한국국토정보공사', '남원시청']);
  await page.locator('#ms-perm .pr').nth(1).locator('button[data-perm="편집"]').click();
  await page.locator('#m-share button[type="submit"]').click();
  await expect(page.locator('#say')).toContainText('남원시청 편집');
  await select(page, 'a3');
  await page.locator('#side-acts .act[data-ar="a3"][data-act="geo"]').click();
  await expect(page.locator('#say')).toContainText('실측 범위 없음');
  await select(page, 'a1');
  await page.locator('#side-acts .act[data-ar="a1"][data-act="geo"]').click();
  await expect(page.locator('#say')).toContainText('범위로 이동');
  await expect(page.locator('.ly[data-id="a1"]')).toHaveCount(1);
  expect(errs).toEqual([]);
});

/* ── 시스템 — 라운드·그림자·그라디언트 0 · 글자 14 이상 · warn 은 디스크/실패뿐 · 액센트 채움 0 ── */
test('시스템 — 라운드·그림자·그라디언트 0 · 최소 14px · warn = 디스크 96 % + 발행 실패만 · 파란 채움 0 · 푸터', async ({ page }) => {
  const errs = watch(page);
  for (const tab of ['upload', 'publishing']) {
    await boot(page, tab);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll('#mast *, #main *:not(#plate *), #foot *')) {
        const cs = getComputedStyle(e);
        if (e.closest('svg')) continue;
        if (parseFloat(cs.borderRadius) > 0) out.push('radius ' + e.className);
        if (cs.boxShadow !== 'none') out.push('shadow ' + e.className);
        if (/gradient/.test(cs.backgroundImage)) out.push('gradient ' + e.className);
        if (cs.display !== 'none' && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(cs.fontSize) < 14) out.push('font ' + cs.fontSize + ' ' + e.className);
      }
      return out;
    });
    expect(bad).toEqual([]);
    const warn = await page.evaluate((W) => [...document.querySelectorAll('#main *')].filter((e) => {
      const cs = getComputedStyle(e); return [cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderLeftColor, cs.borderBottomColor].includes(W) && cs.display !== 'none';
    }).filter((e) => !e.closest('#kpi-disk, #kpi-publishing, .tile[data-st="fail"]')).map((e) => e.className), WARN);
    expect(warn).toEqual([]);
    const filled = await page.evaluate((A) => [...document.querySelectorAll('#main button, #main .k')].filter((e) => getComputedStyle(e).backgroundColor === A).map((e) => e.className), ACCENT);
    expect(filled).toEqual([]);
  }
  expect(await page.locator('#foot-links span').allInnerTexts()).toEqual(['개인정보처리방침', '이용약관', '이메일주소무단수집거부']);
  await expect(page.locator('#foot-addr')).toContainText('063-713-1213');
  await expect(page.locator('#foot .fam')).toContainText('Family Site');
  expect(errs).toEqual([]);
});
