import { test, expect } from '@playwright/test';

// 카드 발행 관리 — landxi/proto/{admin-publish,ai-card,ai-card-edit,ai-publish-create}.html (B6 · 선택 3 분할 검토 데스크)
//  원판   design-canvas/v2/B6-Publish-*.dc.html · 기록 design-canvas/v2/notes/B6-publish.md
//  원본   landxi7/admin-publish.html · ai-card.html · ai-card-edit.html · ai-publish-create.html (기능 1:1 · 검증 문구는 원본 그대로)
//  실행   PORT=4193 npx playwright test tests/e2e/proto-publish.spec.mjs --workers=1
const REVIEW = 'proto/admin-publish.html', CARDS = 'proto/ai-card.html', EDIT = 'proto/ai-card-edit.html', REQUEST = 'proto/ai-publish-create.html';
const ACCENT = 'rgb(0, 109, 247)', WARN = 'rgb(209, 53, 43)';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|tile|WebGL|GPU stall/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, url) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
const param = (page, k) => new URL(page.url()).searchParams.get(k);
async function tabTo(page, selector, max = 120) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches?.(s) || false, selector)) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}
const lawCheck = () => {
  const out = [];
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    for (const pseudo of [null, '::before', '::after']) {
      const s = getComputedStyle(e, pseudo);
      if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
      const who = name(e) + (pseudo || '');
      if (['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].some((k) => parseFloat(s[k]) > 0)) out.push(`radius ${who}`);
      if (s.boxShadow !== 'none') out.push(`shadow ${who}`);
      if (/gradient/.test(s.backgroundImage)) out.push(`gradient ${who}`);
      if (s.backdropFilter && s.backdropFilter !== 'none') out.push(`backdrop ${who}`);
      if (s.textShadow !== 'none') out.push(`text-shadow ${who}`);
      if (/^(button|a)$/i.test(e.tagName) && !pseudo && s.backgroundColor === 'rgb(0, 109, 247)') out.push(`blue-fill ${who}`);
      if (!pseudo && (s.backgroundColor === 'rgb(209, 53, 43)' || s.borderTopColor === 'rgb(209, 53, 43)' && parseFloat(s.borderTopWidth) > 0 && !e.matches('[aria-invalid="true"]'))) out.push(`warn-fill/border ${who}`);
    }
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const field = /^(input|select|textarea)$/i.test(e.tagName) && e.type !== 'checkbox' && e.type !== 'radio' && e.type !== 'file';
    if ((hasText || field) && parseFloat(getComputedStyle(e).fontSize) < 14) out.push(`font<14 ${name(e)} ${getComputedStyle(e).fontSize}`);
  }
  return out;
};

test.describe('관문 · 레일', () => {
  test('로그인 전이면 네 화면 모두 login.html?next=<파일+쿼리> 로 보낸다', async ({ page }) => {
    for (const [url, next] of [[REVIEW + '?open=pa-6', 'admin-publish.html?open=pa-6'], [CARDS, 'ai-card.html'], [EDIT + '?cid=6&mc=0', 'ai-card-edit.html?cid=6&mc=0'], [REQUEST, 'ai-publish-create.html']]) {
      await page.goto(url);
      await page.waitForURL(/login\.html/);
      expect(new URL(page.url()).searchParams.get('next')).toBe(next);
    }
  });
  test('레일 활성 = 카드 발행 관리(발행 요청은 프로젝트에서 들어오므로 프로젝트) · H1 하나', async ({ page }) => {
    const errs = watch(page);
    for (const [url, key, h1] of [[REVIEW, 'publish', '카드 발행 관리'], [CARDS, 'publish', '카드 발행'], [EDIT, 'publish', '카드 발행'], [EDIT + '?cid=6&mc=0', 'publish', '카드 수정'], [REQUEST, 'project', '카드 발행 요청']]) {
      await boot(page, url);
      await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveCount(1);
      await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveAttribute('data-menu', key);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(h1);
    }
    expect(errs).toEqual([]);
  });
  test('한 단계 위 landxi/admin-publish.html 은 쿼리를 들고 proto 로 넘긴다(대시보드 `검토 ›` 딥링크)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
    await page.goto('admin-publish.html?open=pa-1');
    await page.waitForURL(/proto\/admin-publish\.html\?open=pa-1/);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#detail h2')).toHaveText('도로안전 정사영상');
  });
});

test.describe('발행 요청 목록 — 상태 타일 · 검색 · 빈 상태', () => {
  test('요청 6 · 상태 타일 5(대기 = 빨강 글자) · 실크롭 썸네일 · 이미지셋은 점선 결손', async ({ page }) => {
    const errs = watch(page);
    await boot(page, REVIEW);
    await expect(page.locator('#desk')).toHaveAttribute('data-mode', 'list');
    await expect(page.locator('.q-card')).toHaveCount(6);
    expect(await page.locator('.pst').evaluateAll((a) => a.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))).toEqual(['전체 6 건', '대기 2 건', '검토중 1 건', '승인 2 건', '반려 1 건']);
    await expect(page.locator('.pst[data-status=""]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.pst[data-status="대기"] b')).toHaveCSS('color', WARN);
    expect(await page.locator('.q-card img').evaluateAll((a) => a.every((i) => /assets\/proto\/(crops|publish)\//.test(i.getAttribute('src'))))).toBe(true);
    await expect(page.locator('.q-card .imgcard--none')).toHaveCount(1);
    await page.waitForFunction(() => [...document.querySelectorAll('.q-card img')].every((i) => i.complete && i.naturalWidth > 0));
    expect(errs).toEqual([]);
  });
  test('사람 이름은 가려져 있다 — 원본 실명이 화면 어디에도 없다', async ({ page }) => {
    await boot(page, REVIEW + '?open=pa-6&tab=members');
    const text = await page.locator('body').innerText();
    for (const raw of ['김현우', '이서연', '박지훈', '박지호', '홍길동']) expect(text).not.toContain(raw);
    expect(await page.locator('.mb-n').evaluateAll((a) => a.map((e) => e.firstChild.textContent))).toEqual(['김○○', '박○○']);
  });
  test('상태 타일 = 필터 · URL 이 상태 · 뒤로 가기', async ({ page }) => {
    await boot(page, REVIEW);
    await page.locator('.pst[data-status="대기"]').click();
    expect(param(page, 'status')).toBe('대기');
    await expect(page.locator('.q-pair')).toHaveCount(2);
    await expect(page.locator('#q-n')).toHaveText('2');
    await expect(page.locator('.q-pair-cta').first()).toHaveCSS('color', WARN);
    await page.locator('.pst[data-status="승인"]').click();
    await expect(page.locator('.q-card')).toHaveCount(2);
    await page.goBack();
    await expect(page.locator('.pst[data-status="대기"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.q-pair')).toHaveCount(2);
  });
  test('?status=대기 딥링크(대시보드 KPI) — 대기 2건의 EVIDENCE-PAIR', async ({ page }) => {
    await boot(page, REVIEW + '?status=' + encodeURIComponent('대기'));
    await expect(page.locator('.pst[data-status="대기"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.q-pair-t b').allInnerTexts()).toEqual(['도로안전 정사영상 v2.1', '농지 활용 분석 v2.0']);
    await expect(page.locator('#q-note')).toHaveText('대기 · 검토가 필요한 요청');
  });
  test('검색 패널 — 요청자 + 요청 일시(기간) · 초기화 · 빈 상태', async ({ page }) => {
    await boot(page, REVIEW);
    await expect(page.locator('#q-search')).toBeHidden();
    await page.locator('#q-search-t').click();
    await expect(page.locator('#q-search')).toBeVisible();
    await expect(page.locator('#q-search-t')).toHaveText('검색 닫기');
    await expect(page.locator('#q-who')).toBeFocused();
    await page.locator('#q-who').fill('박');
    await page.keyboard.press('Enter');
    await expect(page.locator('.q-card')).toHaveCount(2);
    expect(param(page, 'who')).toBe('박');
    await page.locator('#q-from').fill('2026-06-01'); await page.locator('#q-to').fill('2026-06-30');
    await page.locator('#q-search button[type="submit"]').click();
    await expect(page.locator('.q-void-m h3')).toHaveText('요청이 없습니다');
    await expect(page.locator('.q-void-m p')).toContainText('요청자 “박”');
    await page.locator('#q-search .q-reset').click();
    await expect(page.locator('.q-card')).toHaveCount(6);
    expect(param(page, 'who')).toBeNull();
    await page.locator('#q-from').fill('2026-06-01');
    await page.locator('#q-search button[type="submit"]').click();
    await expect(page.locator('.q-card')).toHaveCount(2);                 // 06.10 · 06.08
    await page.locator('#q-search-t').click();
    await expect(page.locator('#q-search')).toBeHidden();
  });
  test('빈 상태의 `초기화 ›` 가 전부 되돌린다', async ({ page }) => {
    await boot(page, REVIEW + '?status=' + encodeURIComponent('반려') + '&who=' + encodeURIComponent('도로관리과') + '&search=1');
    await expect(page.locator('.q-void-m h3')).toBeVisible();
    await page.locator('#q-void-reset').click();
    await expect(page.locator('.q-card')).toHaveCount(6);
  });
});

test.describe('검토 데스크 — 딥링크 · 탭 · 실지도', () => {
  test('?open=pa-1 · ?open=pa-6 (대시보드 `검토 ›`) 이 맞는 요청에 선다', async ({ page }) => {
    for (const [id, project, card] of [['pa-1', '도로안전 정사영상', '도로안전 정사영상 v2.1'], ['pa-6', '농지 활용 분석', '농지 활용 분석 v2.0']]) {
      await boot(page, REVIEW + '?open=' + id);
      await expect(page.locator('#desk')).toHaveAttribute('data-mode', 'review');
      await expect(page.locator('#detail h2')).toHaveText(project);
      await expect(page.locator('.q-row[aria-current="true"]')).toHaveAttribute('data-id', id);
      await expect(page.locator('.dc .kv div', { hasText: '과제명' }).locator('dd')).toHaveText(card);
      await expect(page.locator('#detail .dt-h .st')).toHaveText('대기');
      await expect(page.locator('#detail .dt-h .st')).toHaveCSS('color', WARN);
    }
    await boot(page, REVIEW + '?open=nope');
    await expect(page.locator('#desk')).toHaveAttribute('data-mode', 'list');
  });
  test('큐에서 고르면 세부가 바뀌고 URL · 뒤로 가기가 따라온다 · ↑↓ 로 행 이동 · × 로 닫기', async ({ page }) => {
    await boot(page, REVIEW);
    await page.locator('.q-card[data-id="pa-2"]').click();
    expect(param(page, 'open')).toBe('pa-2');
    await expect(page.locator('#detail h2')).toHaveText('사료작물(생육기) 탐지');
    await expect(page.locator('.q-row')).toHaveCount(6);
    await page.locator('.q-row[data-id="pa-2"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.q-row[data-id="pa-3"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#detail h2')).toHaveText('도로안전 카메라');
    await expect(page.locator('.q-row[data-id="pa-3"]')).toBeFocused();
    await page.goBack();
    await expect(page.locator('#detail h2')).toHaveText('사료작물(생육기) 탐지');
    await page.locator('[data-act="close"]').click();
    await expect(page.locator('#desk')).toHaveAttribute('data-mode', 'list');
    expect(param(page, 'open')).toBeNull();
  });
  test('검토 탭 5 — 클릭 · ←→ 로빙 · ?tab= · 내용', async ({ page }) => {
    const errs = watch(page);
    await boot(page, REVIEW + '?open=pa-6');
    expect(await page.locator('#detail > .tabs [role="tab"]').evaluateAll((a) => a.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))).toEqual(['개요', '구성원 2', '라벨링 1', '학습 결과', '분석 결과 2']);
    await expect(page.locator('#tab-overview')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.ov-tx p').first()).toContainText('농지 이용 현황');
    await expect(page.locator('.dc .cls-c')).toHaveText(['경작지', '비경작지']);
    await page.locator('#tab-overview').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-members')).toBeFocused();
    expect(param(page, 'tab')).toBe('members');
    await expect(page.locator('.mb')).toHaveCount(2);
    await expect(page.locator('.share .lb')).toHaveText('라벨 기여 · 합계 2,140');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.lab-row')).toHaveCount(1);
    await expect(page.locator('.lab-row')).toContainText('금지면 정사영상');
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('.kpi4 b').allInnerTexts()).toEqual(['0.83', '0.88', '0.86', '0.89']);
    expect(await page.locator('.perf-r .n').allInnerTexts()).toEqual(['0.88', '0.80', '0.84', '0.91', '0.83', '0.87']);
    await expect(page.locator('.cm-why')).toContainText('난수 데모');
    await expect(page.locator('.cm .c')).toHaveCount(4);
    await page.keyboard.press('End');
    expect(param(page, 'tab')).toBe('analysis');
    await expect(page.locator('.an-row')).toHaveCount(2);
    await page.keyboard.press('Home');
    await expect(page.locator('#tab-overview')).toHaveAttribute('aria-selected', 'true');
    expect(param(page, 'tab')).toBeNull();
    expect(errs).toEqual([]);
  });
  test('증거 판 = MapLibre 실지도 · 실 결과 GeoJSON 이 청록(#0FA9A0)으로', async ({ page }) => {
    await boot(page, REVIEW + '?open=pa-6');
    await page.waitForFunction(() => document.querySelector('.plate')?.dataset.state === 'result', null, { timeout: 20000 });
    const info = await page.evaluate(async () => {
      const m = window.__pubPlate.map;
      if (!m.loaded()) await new Promise((r) => m.once('idle', r));
      const s = m.getStyle();
      return { canvas: !!document.querySelector('.plate-map canvas.maplibregl-canvas'), base: s.sources.vsat.tiles[0], line: m.getPaintProperty('res-line', 'line-color'), fill: m.getPaintProperty('res-fill', 'fill-color'), pt: m.getPaintProperty('res-pt', 'circle-color'),
        n: s.sources.res.data.features.length, first: Object.keys(s.sources.res.data.features[0].properties), zoom: m.getZoom(), controls: document.querySelectorAll('.maplibregl-ctrl').length };
    });
    expect(info.canvas).toBe(true);
    expect(info.base).toMatch(/vworld\.kr/);
    expect([info.line, info.fill, info.pt]).toEqual(['#0FA9A0', '#0FA9A0', '#0FA9A0']);
    expect(info.n).toBe(2098);                                            // landxi/assets/data/geo/results/namwon-farmland-2025.geojson
    expect(info.first).toContain('pnu');
    expect(info.zoom).toBeGreaterThan(14);
    expect(info.controls).toBe(0);
    await expect(page.locator('.plate-cap')).toContainText('금지면');
    const z = info.zoom;
    await page.locator('.plate-tools [data-t="in"]').click();
    await page.waitForFunction((z0) => window.__pubPlate.map.getZoom() > z0 + 0.5, z);
  });
  test('분석 결과 — 실측 건은 시 전체 분포(청록) + 범례, 시연 건은 도형 없이 이유 한 줄 · 이미지셋은 점선 결손', async ({ page }) => {
    await boot(page, REVIEW + '?open=pa-6&tab=analysis');
    await page.waitForFunction(() => document.querySelector('.plate')?.dataset.state === 'result', null, { timeout: 20000 });
    expect(await page.locator('.plate-legend .row .n').allInnerTexts()).toEqual(['1,291', '807']);
    await expect(page.locator('.an-row[aria-pressed="true"]')).toContainText('2,098');
    await expect(page.locator('.an-row[aria-pressed="true"] .tag')).toHaveText('실측');
    await expect(page.locator('.an-d')).toContainText('남원시 농정과 드론 촬영');
    await page.locator('.an-row[data-an="1"]').click();
    expect(param(page, 'an')).toBe('1');
    await page.waitForFunction(() => document.querySelector('.plate')?.dataset.state === 'base');
    await expect(page.locator('.plate-gap')).toContainText('실 결과 GeoJSON 이 없어');
    expect(await page.evaluate(() => !!window.__pubPlate.map.getSource('res'))).toBe(false);
    await expect(page.locator('.an-d')).toContainText('농지 활용 분석 #4');
    // 비닐하우스(실측 1,674) · 도로안전 카메라(이미지셋)
    await page.locator('.q-row[data-id="pa-4"]').click();
    await page.locator('#tab-analysis').click();
    await page.waitForFunction(() => document.querySelector('.plate')?.dataset.state === 'result', null, { timeout: 20000 });
    expect(await page.locator('.plate-legend .row .n').allInnerTexts()).toEqual(['1,469', '205']);
    expect(await page.evaluate(() => window.__pubPlate.map.getStyle().sources.res.data.features.length)).toBe(1674);
    await page.locator('.q-row[data-id="pa-3"]').click();
    await expect(page.locator('.plate--none')).toContainText('이미지셋');
    await page.locator('.q-row[data-id="pa-1"]').click();
    await page.waitForFunction(() => document.querySelector('.plate')?.dataset.state === 'base');
    await expect(page.locator('.plate-gap')).toContainText('결과 폴리곤 없음');
  });
  test('반려 건 — 개요 맨 위에 반려 사유', async ({ page }) => {
    await boot(page, REVIEW + '?open=pa-4');
    await expect(page.locator('.rej p')).toHaveText('학습 정확도가 기준 미달입니다. F1 0.75 이상 필요');
    await expect(page.locator('.stage [aria-current="step"]')).toHaveText('반려');
    await boot(page, REVIEW + '?open=pa-6');
    await expect(page.locator('.rej')).toHaveCount(0);
  });
});

test.describe('발행 처리 · 개요 수정', () => {
  test('반려 — 사유 필수 오류 · 권한 필수 오류 · 확인하면 큐 · 타일 · 개요가 바뀌고 새로고침에도 남는다', async ({ page }) => {
    const errs = watch(page);
    await boot(page, REVIEW + '?open=pa-6');
    await page.locator('[data-act="process"]').click();
    expect(param(page, 'mode')).toBe('process');
    await expect(page.locator('input[name="proc-status"]:checked')).toHaveValue('대기');
    await expect(page.locator('input[name="proc-status"]:checked')).toBeFocused();
    await expect(page.locator('.proc-p')).toHaveCount(13);
    await expect(page.locator('.proc-p:checked')).toHaveCount(2);
    await expect(page.locator('#proc-rej')).toBeHidden();
    await page.locator('.proc-st label', { hasText: '반려' }).click();
    await expect(page.locator('#proc-hint')).toHaveText('현재 대기 → 반려 · 사유가 요청자에게 전달됩니다');
    await expect(page.locator('#proc-rej')).toBeVisible();
    await page.locator('#proc button[type="submit"]').click();
    await expect(page.locator('#proc-reason-e')).toHaveText('반려 사유를 입력해 주세요');
    await expect(page.locator('#proc-reason-e')).toHaveCSS('color', WARN);
    await expect(page.locator('#proc-reason')).toBeFocused();
    await expect(page.locator('#proc-reason')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#proc-reason').fill('검증 영역의 비경작지 재현율이 낮습니다');
    await expect(page.locator('#proc-reason-e')).toBeHidden();
    await expect(page.locator('.cnt[data-for="proc-reason"]')).toHaveText('21자/500자');
    await page.locator('#proc-all').check(); await expect(page.locator('#proc-pn')).toHaveText('13');
    await page.locator('#proc-all').uncheck(); await expect(page.locator('#proc-pn')).toHaveText('0');
    await page.locator('#proc button[type="submit"]').click();
    await expect(page.locator('#proc-perm-e')).toHaveText('권한을 1개 이상 선택해 주세요');
    await page.locator('.proc-perm tbody tr', { hasText: '농지 활용 분석' }).locator('td.pr').click();     // 행 클릭 = 체크
    await expect(page.locator('#proc-perm-e')).toBeHidden();
    await page.locator('#proc button[type="submit"]').click();
    await expect(page.locator('#say')).toHaveText('반려 처리했습니다');
    expect(param(page, 'mode')).toBeNull();
    await expect(page.locator('#detail .dt-h .st')).toHaveText('반려');
    await expect(page.locator('.rej p')).toHaveText('검증 영역의 비경작지 재현율이 낮습니다');
    await expect(page.locator('.q-row[data-id="pa-6"] .st')).toHaveText('반려');
    await expect(page.locator('.pst[data-status="대기"] b')).toHaveText('1');
    await expect(page.locator('.pst[data-status="반려"] b')).toHaveText('2');
    await expect(page.locator('.dc .kv div', { hasText: '권한' }).locator('dd')).toHaveText('농지 활용 분석');
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#detail .dt-h .st')).toHaveText('반려');
    expect(errs).toEqual([]);
  });
  test('키보드만으로 — 목록에서 요청을 열고 승인(발행)까지', async ({ page }) => {
    await boot(page, REVIEW + '?status=' + encodeURIComponent('검토중'));
    expect(await tabTo(page, '.q-card[data-id="pa-2"]')).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#detail h2')).toHaveText('사료작물(생육기) 탐지');
    expect(await tabTo(page, '[data-act="process"]')).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('input[name="proc-status"][value="검토중"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('input[name="proc-status"][value="승인"]')).toBeChecked();
    await expect(page.locator('#proc-hint')).toHaveText('현재 검토중 → 승인 · 승인하면 카드가 발행됩니다');
    expect(await tabTo(page, '#proc button[type="submit"]')).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#say')).toHaveText('카드를 승인(발행)했습니다');
    await expect(page.locator('#detail .dt-h .st')).toHaveText('승인');
    await expect(page.locator('[data-act="process"]')).toBeFocused();
    await expect(page.locator('.pst[data-status="승인"] b')).toHaveText('3');
    await expect(page.locator('.q-void-m h3')).toHaveText('요청이 없습니다');       // 검토중 필터에는 이제 0건
  });
  test('발행 처리 — 취소 · Esc 는 아무것도 바꾸지 않는다', async ({ page }) => {
    await boot(page, REVIEW + '?open=pa-1&mode=process');
    await page.locator('.proc-st label', { hasText: '승인' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#proc')).toHaveCount(0);
    await expect(page.locator('#detail .dt-h .st')).toHaveText('대기');
    await page.locator('[data-act="process"]').click();
    await page.locator('.proc-f .txt-b').click();
    await expect(page.locator('[data-act="process"]')).toBeFocused();
  });
  test('개요 수정 — 필수 오류(원본 문구) · 글자 수 · 저장하면 큐와 개요가 바뀐다', async ({ page }) => {
    await boot(page, REVIEW + '?open=pa-6');
    await page.locator('[data-act="edit"]').click();
    expect(param(page, 'mode')).toBe('edit');
    await expect(page.locator('#detail h2')).toHaveText('발행 정보 수정');
    await expect(page.locator('#ed-name')).toBeFocused();
    await expect(page.locator('#ed .auto')).toHaveText(['농지 활용 분석', '농지 분류 v2.0', '폴리곤 (Polygon)', '정사영상']);
    await page.locator('#ed-name').fill(''); await page.locator('#ed-model').fill('');
    await page.locator('[data-clear="ed-dash"]').click();
    await page.locator('#ed button[type="submit"]').click();
    await expect(page.locator('#ed-name-e')).toHaveText('과제명을 입력해 주세요');
    await expect(page.locator('#ed-model-e')).toHaveText('모델명을 입력해 주세요');
    await expect(page.locator('#ed-dash-f .err')).toHaveText('이미지를 선택해 주세요');
    await expect(page.locator('#ed-name')).toBeFocused();
    await page.locator('#ed-name').fill('농지 활용 분석 v2.1'); await page.locator('#ed-model').fill('v2.1');
    await expect(page.locator('#ed-name-e')).toBeHidden();
    await page.locator('#ed-dash').setInputFiles({ name: 't.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.locator('#ed-dash-f img')).toHaveAttribute('src', /^data:image\/png/);
    await expect(page.locator('#ed-dash-f .err')).toBeHidden();
    await page.locator('#ed-intro').fill('소개를 고쳤습니다');
    await expect(page.locator('.cnt[data-for="ed-intro"]')).toHaveText('9자/500자');
    await page.locator('#ed button[type="submit"]').click();
    await expect(page.locator('#say')).toHaveText('발행 정보를 수정했습니다');
    await expect(page.locator('.q-row[data-id="pa-6"] .lcard-t > span').first()).toHaveText('농지 활용 분석 v2.1');
    await expect(page.locator('.ov-tx p').first()).toHaveText('소개를 고쳤습니다');
    await expect(page.locator('.dc .kv div', { hasText: '모델명' }).locator('dd')).toHaveText('v2.1');
    await page.locator('[data-act="edit"]').click();
    await page.locator('[data-act="edit-cancel"]').click();
    await expect(page.locator('#tab-overview')).toBeVisible();
  });
});

test.describe('라벨링 모드 · 클래스 일괄 변경', () => {
  test('라벨링 목록 → 라벨링 모드(?lab=0) · 실 필지가 라벨 · 선택 → 일괄 변경 모달(포커스 가둠 · 필수 오류 · 저장 · 실행 취소)', async ({ page }) => {
    const errs = watch(page);
    await boot(page, REVIEW + '?open=pa-6&tab=labeling');
    await page.locator('.lab-row').click();
    expect(param(page, 'lab')).toBe('0');
    await expect(page.locator('.lm-t')).toHaveText(['사각형', '원형', '폴리곤', '도형 복사']);
    await expect(page.locator('.lm-t[data-tool="copy"]')).toBeDisabled();
    await expect(page.locator('#lm-undo')).toBeDisabled();
    await page.waitForFunction(() => document.querySelectorAll('.lm-l').length > 5, null, { timeout: 20000 });
    const n = await page.locator('.lm-l').count();
    await expect(page.locator('#lm-n')).toHaveText(String(n));
    await expect(page.locator('.lm-zoom')).toContainText('GSD 12 cm/px');
    await expect(page.locator('#lm-batch')).toBeDisabled();
    for (const i of [1, 2, 3]) await page.locator('.lm-l').nth(i).locator('input').check();
    await expect(page.locator('#lm-batch')).toHaveText('클래스 일괄 변경 (3건)');
    await expect(page.locator('.lm-t[data-tool="copy"]')).toBeEnabled();
    const before = await page.locator('.lm-l').nth(1).locator('.ck span').innerText();
    await page.locator('#lm-batch').click();
    const modal = page.locator('.modal');
    await expect(modal.locator('h2')).toHaveText('클래스 일괄 변경');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('.modal'))).toBe(true); }
    await modal.locator('.btn', { hasText: '저장' }).click();
    await expect(modal.locator('#bc-e')).toHaveText('변경할 클래스를 선택해 주세요.');
    const target = before.startsWith('비경작지') ? '경작지' : '비경작지';
    await modal.locator('.opt', { hasText: new RegExp(`^${target}$`) }).click();
    await expect(modal.locator('#bc-after')).toContainText(`${target}(으)로 바뀝니다`);
    await modal.locator('.btn', { hasText: '저장' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('#say')).toHaveText('3건의 클래스를 변경했습니다.');
    await expect(page.locator('.lm-l').nth(1).locator('.ck span')).toHaveText(new RegExp(`^${target} #`));
    await expect(page.locator('#lm-batch')).toBeFocused();
    await expect(page.locator('#lm-undo')).toBeEnabled();
    await page.locator('#lm-undo').click();
    await expect(page.locator('.lm-l').nth(1).locator('.ck span')).toHaveText(before);
    // 전체 선택 · Esc 로 모달 닫기 · 포커스 복귀
    await page.locator('#lm-all').check();
    await expect(page.locator('#lm-batch')).toHaveText(`클래스 일괄 변경 (${n}건)`);
    await page.locator('#lm-batch').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(page.locator('#lm-batch')).toBeFocused();
    await page.locator('#lm-all').uncheck();
    // 삭제 · 저장 · 클래스 탭
    await page.locator('.lm-l').first().locator('.del').click();
    await expect(page.locator('.lm-l')).toHaveCount(n - 1);
    await page.locator('#lm-save').click();
    await expect(page.locator('#say')).toHaveText('라벨링을 저장했습니다.');
    await page.locator('#lm-tab-classes').click();
    await expect(page.locator('.lm-c')).toHaveCount(2);
    await expect(page.locator('#lm-f')).toBeHidden();
    await page.locator('#lm-close').click();
    expect(param(page, 'lab')).toBeNull();
    await expect(page.locator('.lab-row')).toBeFocused();
    expect(errs).toEqual([]);
  });
  test('그리기 — 사각형 도구로 끌면 라벨이 하나 는다(실 MapLibre 캔버스) · Esc 로 도구 해제', async ({ page }) => {
    await boot(page, REVIEW + '?open=pa-6&tab=labeling&lab=0');
    await page.waitForFunction(() => document.querySelector('.lm')?.hasAttribute('data-ready'), null, { timeout: 25000 });
    const n = await page.locator('.lm-l').count();
    await page.locator('.lm-t[data-tool="rect"]').click();
    await expect(page.locator('.lm-t[data-tool="rect"]')).toHaveAttribute('aria-pressed', 'true');
    const box = await page.locator('#lm-cv').boundingBox();
    await page.mouse.move(box.x + 200, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 300, box.y + 270, { steps: 6 }); await page.mouse.up();
    await expect(page.locator('.lm-l')).toHaveCount(n + 1);
    await expect(page.locator('.lm-l').last()).toContainText('사각형');
    expect(await page.evaluate(() => window.__pubLabel.map.getStyle().sources.lab.data.features.length)).toBe(n + 1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.lm-t[data-tool="rect"]')).toHaveAttribute('aria-pressed', 'false');
  });
  test('실 도형이 없는 과제는 빈 캔버스 + 이유 · 이미지셋은 라벨링 모드를 열지 않는다', async ({ page }) => {
    await boot(page, REVIEW + '?open=pa-1&tab=labeling&lab=0');
    await expect(page.locator('#lm-gap')).toContainText('라벨 도형 없음');
    await expect(page.locator('.lm-list .empty')).toHaveText('라벨이 없습니다. 도형을 그려주세요.');
    await boot(page, REVIEW + '?open=pa-3&tab=labeling');
    await expect(page.locator('div.lab-row')).toHaveCount(2);
    await expect(page.locator('button.lab-row')).toHaveCount(0);
    await expect(page.locator('.ev .empty')).toContainText('이미지셋');
  });
});

test.describe('ai-card.html — 발행된 카드', () => {
  test('카드 8 · 건수 · 검색어/공개 여부 · 초기화 · 페이저 · 빈 상태', async ({ page }) => {
    const errs = watch(page);
    await boot(page, CARDS);
    await expect(page.locator('.cd')).toHaveCount(8);
    expect(await page.locator('.pst').evaluateAll((a) => a.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))).toEqual(['발행 카드 8 건', '공개 7 건', '비공개 1 건']);
    await expect(page.locator('.pager-sum')).toHaveText('총 8건 중 1~8행');
    expect(await page.locator('.pager-size option').allInnerTexts()).toEqual(['15', '30', '90']);
    await expect(page.locator('.cd').nth(5)).toHaveAttribute('href', 'ai-card-edit.html?cid=6&mc=0');
    await page.locator('#cd-pub').selectOption('private');
    await page.locator('#cd-tool button[type="submit"]').click();
    await expect(page.locator('.cd')).toHaveCount(1);
    await expect(page.locator('.cd .cd-n')).toHaveText('방치 쓰레기 탐지');
    expect(param(page, 'public')).toBe('private');
    await page.locator('#cd-tool .q-reset').click();
    await expect(page.locator('.cd')).toHaveCount(8);
    await page.locator('#cd-field').selectOption('name');
    await page.locator('#cd-q').fill('사료작물');
    await page.keyboard.press('Enter');
    await expect(page.locator('.cd')).toHaveCount(2);
    await page.locator('#cd-q').fill('없는카드');
    await page.keyboard.press('Enter');
    await expect(page.locator('.cd-none h3')).toHaveText('발행된 카드가 없습니다');
    await expect(page.locator('.cd-steps > div')).toHaveCount(3);
    await expect(page.locator('.pager-sum')).toHaveText('총 0건 중 0~0행');
    await page.goBack();
    await expect(page.locator('.cd')).toHaveCount(2);
    await page.locator('.cd-tool a.btn').click();
    await page.waitForURL(/ai-card-edit\.html$/);
    expect(errs).toEqual([]);
  });
});

test.describe('ai-card-edit.html — 3단계 발행 · 수정(잠금)', () => {
  test('발행 — 단계 검증(원본 문구) · 발행됨은 비활성 · 모델 유형 자동 · 사용 여부 고정 · 발행하면 목록으로', async ({ page }) => {
    const errs = watch(page);
    await boot(page, EDIT);
    await expect(page.locator('.ce-p')).toHaveCount(8);
    await expect(page.locator('#mdlUseYn')).toBeDisabled();
    await expect(page.locator('#mdlUseYn')).toHaveValue('Y');
    await page.locator('#f-submit').click();
    await expect(page.locator('#ce-e1')).toHaveText('프로젝트를 선택해주세요.');
    await expect(page.locator('#say')).toHaveText('프로젝트를 선택해주세요.');
    await page.locator('.ce-p[data-pid="6"]').click();
    await expect(page.locator('#ce-e1')).toBeHidden();
    await expect(page.locator('#datasetSeCd')).toHaveValue('020414');
    await expect(page.locator('.ce-r')).toHaveCount(5);
    await expect(page.locator('.ce-r:disabled')).toHaveCount(1);
    await expect(page.locator('.ce-r:disabled')).toContainText('발행됨');
    await expect(page.locator('.ce-r').last()).toBeDisabled();                       // 발행된 결과는 아래로
    await expect(page.locator('.ce-note')).toHaveText('이미 발행된 학습 결과는 선택할 수 없습니다.');
    await page.locator('#f-submit').click();
    await expect(page.locator('#ce-e2')).toHaveText('학습 결과를 선택해주세요.');
    await page.locator('.ce-r', { hasText: 'v4(반사광 보정)' }).click();
    expect(param(page, 'project')).toBe('6'); expect(param(page, 'result')).toBe('1');
    await page.locator('#f-submit').click();
    await expect(page.locator('#mdlNm-e')).toHaveText('모델 명을 입력해 주세요.');
    await expect(page.locator('#mdlNm')).toBeFocused();
    await expect(page.locator('#algoId-e')).toHaveText('알고리즘을 선택해 주세요.');
    await expect(page.locator('#tileSz-e')).toHaveText('타일링 크기를 입력해 주세요.');
    await page.locator('#mdlNm').fill('v4');
    await expect(page.locator('.cnt[data-for="mdlNm"]')).toHaveText('2자/200자');
    await page.locator('#algoId').selectOption('YOLOV11seg');
    await page.locator('#dockerImage').fill('landxi/greenhouse'); await page.locator('#dockerTag').fill('4.0');
    await page.locator('#detTp').selectOption('PLG'); await page.locator('#tileSz').fill('1024');
    await page.locator('#f-submit').click();
    await expect(page.locator('#mdlExplnScrn-e')).toHaveText('모델 설명 화면을 입력해 주세요.');
    await expect(page.locator('#mdlExplnScrn')).toBeFocused();
    await page.locator('#mdlExplnScrn').fill('/jn/aidetect/greenhouse.html');
    await page.locator('#f-submit').click();
    await expect(page.locator('#say')).toHaveText('"v4" 카드가 발행되었습니다.');
    await page.waitForURL(/ai-card\.html$/);
    // 방금 발행한 결과는 이제 `발행됨`
    await boot(page, EDIT + '?project=6');
    await expect(page.locator('.ce-r:disabled')).toHaveCount(2);
    expect(errs).toEqual([]);
  });
  test('발행 가능한 결과가 하나뿐이면 자동 선택 · 증거 판은 실 결과(비닐하우스 1,674) · ↑↓ 로 결과 이동', async ({ page }) => {
    await boot(page, EDIT + '?project=5');
    await expect(page.locator('.ce-r[aria-checked="true"]')).toContainText('v1(기본)');
    await page.locator('.ce-p[data-pid="6"]').click();
    await page.waitForFunction(() => document.querySelector('.plate')?.dataset.state === 'result', null, { timeout: 20000 });
    await expect(page.locator('#ce-ev-note')).toContainText('1,674');
    await page.locator('.ce-r').first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.ce-r').nth(1)).toHaveAttribute('aria-checked', 'true');
  });
  test('수정 — ?cid=6&mc=0 은 1·2 단계가 잠기고 값이 채워진다 · 저장', async ({ page }) => {
    await boot(page, EDIT + '?cid=6&mc=0');
    await expect(page.locator('#page-sub')).toHaveText('발행된 AI 카드 정보를 수정합니다');
    await expect(page.locator('.ce[data-locked]')).toHaveCount(1);
    await expect(page.locator('.ce-p, .ce-r')).toHaveCount(0);
    await expect(page.locator('.ce-lock .why')).toHaveText(['수정 시 변경할 수 없습니다.', '수정 시 변경할 수 없습니다.']);
    await expect(page.locator('.ce-lock .box').first()).toContainText('비닐하우스 탐지');
    await expect(page.locator('.ce-lock .box').last()).toContainText('v5(단동/연동 분리)');
    expect(await page.evaluate(() => ['mdlNm', 'datasetSeCd', 'algoId', 'mdlUseYn', 'mdlCn', 'dockerImage', 'dockerTag', 'detTp', 'tileSz', 'mdlExplnScrn'].map((id) => document.getElementById(id).value)))
      .toEqual(['v5', '020414', 'YOLOV11seg', 'Y', '단동/연동 분리', 'landxi/greenhouse', '5.0', 'PLG', '1024', '/jn/aidetect/greenhouse.html']);
    await expect(page.locator('#mdlUseYn')).toBeEnabled();
    await expect(page.locator('#f-submit')).toHaveText('저장');
    await page.locator('#dockerTag').fill('');
    await page.locator('#f-submit').click();
    await expect(page.locator('#dockerTag-e')).toHaveText('도커 이미지 태그를 입력해 주세요.');
    await page.locator('#dockerTag').fill('5.1');
    await page.locator('#f-submit').click();
    await expect(page.locator('#say')).toHaveText('"v5" 카드가 수정되었습니다.');
    await page.waitForURL(/ai-card\.html$/);
    await boot(page, EDIT + '?cid=6&mc=0');
    await expect(page.locator('#dockerTag')).toHaveValue('5.1');
  });
});

test.describe('ai-publish-create.html — 전역 발행 요청', () => {
  test('선택 카드 3 → 분석 결과 다중 선택 모달 → 과제 고도화 → 발행 요청 → 검토 큐 맨 위에 대기로 선다', async ({ page }) => {
    const errs = watch(page);
    await boot(page, REQUEST);
    await expect(page.locator('.rq-p')).toHaveCount(3);
    await expect(page.locator('.rq-p[data-pick="result"]')).toBeDisabled();
    await expect(page.locator('.rq-p[data-pick="analysis"]')).toBeDisabled();
    await page.locator('#rq button[type="submit"]').click();
    await expect(page.locator('#rq-perr')).toHaveText('프로젝트를 선택해 주세요');
    await page.locator('.rq-p[data-pick="project"]').click();
    await expect(page.locator('.modal h2')).toHaveText('내 프로젝트 선택');
    await expect(page.locator('.modal .pk')).toHaveCount(8);
    await page.locator('.modal .pk', { hasText: '농지 활용 분석' }).click();
    await expect(page.locator('.rq-p[data-pick="project"] .v')).toHaveText('농지 활용 분석');
    await expect(page.locator('.rq-p[data-pick="project"]')).toBeFocused();
    await expect(page.locator('#rq-task')).toHaveValue('농지 활용 분석');
    await page.locator('#rq button[type="submit"]').click();
    await expect(page.locator('#rq-perr')).toHaveText('학습 결과를 선택해 주세요');
    await page.locator('.rq-p[data-pick="result"]').click();
    await page.locator('.modal .pk', { hasText: '농지 분류 v2.0' }).click();
    await expect(page.locator('.rq-p[data-pick="result"] .s')).toContainText('IoU 0.83 · F1 0.88');
    // 분석 결과 — 다중 선택 · 포커스 가둠 · 취소는 버린다
    await page.locator('.rq-p[data-pick="analysis"]').click();
    const modal = page.locator('.modal');
    await expect(modal.locator('h2')).toHaveText('분석 결과');
    await expect(modal.locator('.pk-an')).toHaveCount(5);
    await expect(modal.locator('.pk-an').first()).toContainText('운봉읍 일대 · 2026.05.12 · 201건 탐지');
    await modal.locator('.pk-an').nth(0).locator('input').check();
    await expect(modal.locator('.pk-sum')).toHaveText('선택 1건');
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('.modal'))).toBe(true); }
    await modal.locator('.btn-br', { hasText: '취소' }).click();
    await expect(page.locator('.rq-p[data-pick="analysis"] .v')).toHaveText('잘 된 분석 결과를 선택해 주세요');
    await page.locator('.rq-p[data-pick="analysis"]').click();
    await modal.locator('.pk-an').nth(0).locator('input').check(); await modal.locator('.pk-an').nth(3).locator('input').check();
    await modal.locator('.btn', { hasText: '적용' }).click();
    await expect(page.locator('.rq-p[data-pick="analysis"] .v')).toHaveText('2건 선택됨');
    expect(param(page, 'an')).toBe('AN-7-1,AN-7-4');
    // 신규 과제 검증 → 과제 고도화
    await page.locator('#rq-task').fill('');
    await page.locator('#rq button[type="submit"]').click();
    await expect(page.locator('#rq-task-e')).toHaveText('과제명을 입력해 주세요.');
    await expect(page.locator('#rq-model-e')).toHaveText('모델명을 입력해 주세요.');
    await expect(page.locator('#rq-dash-f .err')).toHaveText('이미지를 선택해 주세요.');
    await page.locator('.rq-type .rd', { hasText: '과제 고도화' }).click();
    expect(param(page, 'type')).toBe('enhance');
    await expect(page.locator('#rq-task-sel')).toHaveValue('농지 활용 분석');
    await expect(page.locator('.rq-hint')).toContainText('새 모델만 추가합니다');
    await expect(page.locator('#rq-acc-t')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#rq-acc-t').click();
    await expect(page.locator('#rq-acc-t')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#rq-intro')).toHaveValue(/농지 이용 현황/);
    await page.locator('#rq-task-sel').selectOption('');
    await page.locator('#rq button[type="submit"]').click();
    await expect(page.locator('#rq-task-sel-e')).toHaveText('기존 과제를 선택해 주세요.');
    await page.locator('#rq-task-sel').selectOption('농지 활용 분석');
    await page.locator('#rq-model').fill('v3.0');
    await page.locator('#rq button[type="submit"]').click();
    await expect(page.locator('#say')).toHaveText('카드 발행을 요청했습니다.');
    await page.waitForURL(/admin-publish\.html\?open=pa-7/);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('.q-row').first()).toHaveAttribute('data-id', 'pa-7');
    await expect(page.locator('.q-row').first()).toContainText('농지 활용 분석 v3.0');
    await expect(page.locator('#detail .dt-h .st')).toHaveText('대기');
    await expect(page.locator('.pst[data-status="대기"] b')).toHaveText('3');
    await expect(page.locator('#tab-analysis .n')).toHaveText('2');
    await expect(page.locator('.dc .kv div', { hasText: '과제 유형' }).locator('dd')).toHaveText('과제 고도화');
    expect(errs).toEqual([]);
  });
  test('딥링크가 상태를 되살린다 · 목록/취소는 프로젝트로', async ({ page }) => {
    await boot(page, REQUEST + '?project=7&result=r7-1&type=enhance&an=AN-7-2');
    await expect(page.locator('.rq-p[data-pick="analysis"] .v')).toHaveText('1건 선택됨');
    await expect(page.locator('input[name="rq-type"][value="enhance"]')).toBeChecked();
    await expect(page.locator('.rq-read')).toContainText('농지 이용 현황');
    await expect(page.locator('.rq-f a').first()).toHaveAttribute('href', 'ai-project.html');
  });
});

test.describe('법전 · 접근성 · 반응', () => {
  test('라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0 · 바닥 14px · 파란 채움 버튼 0 · 빨강 채움/테두리 0 — 네 화면 + 열린 패널/모달', async ({ page }) => {
    await boot(page, REVIEW + '?open=pa-6&mode=process');
    await page.locator('.proc-st label', { hasText: '반려' }).click();
    await page.locator('#proc button[type="submit"]').click();
    expect(await page.evaluate(lawCheck)).toEqual([]);
    await boot(page, REVIEW + '?open=pa-6&tab=labeling&lab=0');
    await page.waitForFunction(() => document.querySelectorAll('.lm-l').length > 3, null, { timeout: 20000 });
    await page.locator('.lm-l').first().locator('input').check();
    await page.locator('#lm-batch').click();
    expect(await page.evaluate(lawCheck)).toEqual([]);
    for (const url of [REVIEW + '?status=' + encodeURIComponent('대기'), REVIEW + '?open=pa-6&tab=training', REVIEW + '?open=pa-6&tab=analysis', REVIEW + '?open=pa-6&mode=edit', CARDS, CARDS + '?q=zz', EDIT + '?project=6', EDIT + '?cid=6&mc=0']) {
      await boot(page, url);
      expect(await page.evaluate(lawCheck), url).toEqual([]);
    }
    await boot(page, REQUEST + '?project=7&result=r7-1&type=enhance&edit=1');
    await page.locator('.rq-p[data-pick="analysis"]').click();
    expect(await page.evaluate(lawCheck)).toEqual([]);
  });
  test('이름 없는 상호작용 요소 0 · 포커스 링 = 파랑 2px · 축소 모션이면 전환 0', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const url of [REVIEW + '?open=pa-6&mode=process', REVIEW + '?open=pa-6&tab=labeling&lab=0', CARDS, EDIT + '?project=6', REQUEST + '?project=7&result=r7-1']) {
      await boot(page, url);
      const nameless = await page.evaluate(() => [...document.querySelectorAll('a[href],button,input,select,textarea')].filter((e) => {
        if (e.closest('[hidden]') || e.closest('.maplibregl-map')) return false;
        const lab = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || (e.labels && e.labels.length ? 'l' : '') || e.textContent.trim();
        return !lab;
      }).map((e) => e.outerHTML.slice(0, 90)));
      expect(nameless, url).toEqual([]);
    }
    await boot(page, REVIEW + '?open=pa-6');
    await page.locator('.q-row').first().focus();
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth, s.outlineColor]; });
    expect(ring).toEqual(['solid', '2px', ACCENT]);
    const moving = await page.evaluate(() => [...document.querySelectorAll('.pst, .q-row, .btn, .btn-br, #dt-body, .tabs [role="tab"]')].filter((e) => { const s = getComputedStyle(e); return parseFloat(s.transitionDuration) > 0 || s.animationName !== 'none'; }).length);
    expect(moving).toBe(0);
  });
  test('1280 · 1920 에서 가로 스크롤 없음 · 검토 데스크의 세 열이 겹치지 않는다', async ({ page }) => {
    for (const [w, h] of [[1280, 800], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const url of [REVIEW + '?open=pa-6', REVIEW, CARDS, EDIT + '?project=6', REQUEST + '?project=7&result=r7-1&type=enhance']) {
        await boot(page, url);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${url} @${w}`).toBe(true);
      }
      await boot(page, REVIEW + '?open=pa-6');
      const r = await page.evaluate(() => ['#queue', '.ev', '.dc'].map((s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.bottom)]; }));
      expect(r[0][1]).toBeLessThanOrEqual(r[1][0]); expect(r[1][1]).toBeLessThanOrEqual(r[2][0]);
      expect(Math.max(...r.map((x) => x[2]))).toBeLessThanOrEqual(h - 36);
    }
  });
  test('조판 — 1440×900 원판 실측: 큐 x 128–472 · 세부 x 504– · 증거 520 · 결정 328 · CTA 바닥 834', async ({ page }) => {
    await boot(page, REVIEW + '?open=pa-6');
    const g = await page.evaluate(() => { const b = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
      return { q: b('#queue'), d: b('#detail'), ev: b('.ev'), dc: b('.dc'), cta: b('[data-act="process"]'), row: b('.q-row'), th: b('.q-row .imgcard'), pst: b('.pst'), tabs: b('#detail > .tabs') }; });
    expect(Math.abs(g.q.l - 128)).toBeLessThanOrEqual(1); expect(Math.abs(g.q.r - 472)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.d.l - 504)).toBeLessThanOrEqual(2); expect(Math.abs(g.d.r - 1384)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.ev.w - 520)).toBeLessThanOrEqual(3); expect(Math.abs(g.dc.w - 328)).toBeLessThanOrEqual(3);
    expect(Math.abs(g.cta.b - 834)).toBeLessThanOrEqual(4); expect(g.cta.h).toBe(44);
    expect(g.row.h).toBe(100); expect([g.th.w, g.th.h]).toEqual([100, 67]);
    expect([g.pst.w, g.pst.h]).toEqual([104, 66]);
    expect(Math.abs(g.tabs.t - 218)).toBeLessThanOrEqual(4);
  });
});
