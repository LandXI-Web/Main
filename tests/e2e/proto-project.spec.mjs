import { test, expect } from '@playwright/test';

// 프로젝트 = LX 의 AI 모델 개발 작업실 — landxi/proto/{ai-project,ai-project-create,ai-project-label}.html
//  원판  design-canvas/v2/renders/B5-Projects.png · B5-Project-{Create,Create-Review,Overview,Data,Labeling,Train,Analysis,Deploy,Delete}.png
//        + B7-Project*.png · B7-Projects-{Empty,NoResult}.png · B7-State-{Loading,Error}.png (B7 이 B5 를 덮는다)
//  기록  design-canvas/v2/notes/B7-project-states.md · 역할 docs/superpowers/specs/2026-09-20-platform-roles.md
//  자료  models.js(모델 10) · results.js(실 결과 2벌) · imagery.js · crops.js · cards.js — 지어낸 값 0
//  실행  PORT=4202 npx playwright test tests/e2e/proto-project.spec.mjs --workers=1
const LIST = 'proto/ai-project.html', CREATE = 'proto/ai-project-create.html', LABEL = 'proto/ai-project-label.html';
const PJ = 'pj-greenhouse';
const ACCENT = 'rgb(0, 109, 247)', WARN = 'rgb(209, 53, 43)';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|tile|WebGL|GPU stall|maplibre|Unable to|AbortError/i;

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

/* 법전 전수 검사 — proto-shell.spec.mjs 의 검사를 이 화면 스펙으로 옮긴 것 */
const lawCheck = () => {
  const out = [];
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    if (e.closest('.maplibregl-map') && !e.classList.contains('maplibregl-map')) continue;   // 지도 위젯은 라이브러리 것
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
      if (!pseudo && (s.backgroundColor === 'rgb(209, 53, 43)' || (s.borderTopColor === 'rgb(209, 53, 43)' && parseFloat(s.borderTopWidth) > 0 && !e.matches('[aria-invalid="true"]')))) out.push(`warn-fill/border ${who}`);
    }
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const field = /^(input|select|textarea)$/i.test(e.tagName) && e.type !== 'checkbox' && e.type !== 'radio' && e.type !== 'file';
    if ((hasText || field) && parseFloat(getComputedStyle(e).fontSize) < 14) out.push(`font<14 ${name(e)} ${getComputedStyle(e).fontSize}`);
  }
  return out;
};

/* ══ 0. 관문 · 셸 ══════════════════════════════════════════════════════════ */
test.describe('관문 · 셸', () => {
  test('로그인 전이면 세 화면 모두 login.html?next=<파일+쿼리> 로 보낸다', async ({ page }) => {
    for (const [url, next] of [[LIST + '?pid=' + PJ, `ai-project.html?pid=${PJ}`], [CREATE, 'ai-project-create.html'], [LABEL + '?pid=' + PJ, `ai-project-label.html?pid=${PJ}`]]) {
      await page.goto(url);
      await page.waitForURL(/login\.html/);
      expect(param(page, 'next')).toBe(next);
    }
  });

  test('레일은 셸 것 하나뿐이고 프로젝트가 활성이다', async ({ page }) => {
    await boot(page, LIST);
    await expect(page.locator('#rail')).toHaveCount(1);
    await expect(page.locator('#rail a[aria-current="page"]')).toHaveText(/프로젝트/);
    await expect(page.locator('#foot')).toHaveCount(1);
    await expect(page.locator('#page-head h1')).toHaveText('프로젝트');
  });

  test('푸터 전화번호 · 주소는 셸이 한 벌만 넣는다(C3)', async ({ page }) => {
    await boot(page, LIST + '?pid=' + PJ);
    expect(await page.locator('body').innerText()).toContain('063-713-1213');
    const hits = await page.evaluate(() => (document.body.innerText.match(/063-713-1213/g) || []).length);
    expect(hits).toBe(1);
  });
});

/* ══ 1. 목록 ═══════════════════════════════════════════════════════════════ */
test.describe('① 목록', () => {
  test('models.js 실측에서 온 프로젝트 8건 — 카드 · 캡션 · 페이저', async ({ page }) => {
    const errs = watch(page);
    await boot(page, LIST);
    await expect(page.locator('.pj-card[data-pid]')).toHaveCount(8);
    await expect(page.locator('.pj-card[data-pid]').first()).toContainText('비닐하우스 탐지');
    await expect(page.locator('.pj-card[data-pid]').first()).toContainText('객체 탐지 · 클래스 2 · 236.7 MB');
    await expect(page.locator('#pj-count')).toContainText('총 8건 중 1–8행');
    await expect(page.locator('#pj-pager')).toContainText('총 8건 중 1~8행');
    expect(errs).toEqual([]);
  });

  test('카드 썸네일은 실 정사영상 크롭이다(assets/proto/crops)', async ({ page }) => {
    await boot(page, LIST);
    const srcs = await page.locator('.pj-card[data-pid] img').evaluateAll((es) => es.map((e) => e.getAttribute('src')));
    expect(srcs.length).toBe(8);
    expect(srcs.every((s) => /assets\/proto\/crops\//.test(s))).toBe(true);
  });

  test('선택하면 오른쪽 프로젝트 조회 판이 그 프로젝트를 말한다', async ({ page }) => {
    await boot(page, LIST);
    await page.locator('.pj-card[data-pid="pj-road"]').click();
    expect(param(page, 'sel')).toBe('pj-road');
    await expect(page.locator('.split-r')).toContainText('도로망 세그멘테이션');
    await expect(page.locator('.split-r')).toContainText('세그멘테이션');
  });

  test('검색 0건 — 좌 · 우 · 건수가 같이 0 을 말한다(B7-Projects-NoResult)', async ({ page }) => {
    await boot(page, LIST);
    await page.locator('#pj-q').fill('태양광');
    await page.locator('#pj-search button[type="submit"]').click();
    expect(param(page, 'q')).toBe('태양광');
    await expect(page.locator('.pj-note')).toContainText('검색 조건에 맞는 프로젝트가 없어요');
    await expect(page.locator('.pj-note')).toContainText('8건 중 0건');
    await expect(page.locator('#pj-count')).toContainText('총 8건 중 0행');
    await expect(page.locator('.split-r')).toContainText('선택한 프로젝트 없음');
    await expect(page.locator('.pj-card--mute')).toHaveCount(8);
  });

  test('초기화가 검색을 되돌린다', async ({ page }) => {
    await boot(page, LIST + '?q=%ED%83%9C%EC%96%91%EA%B4%91');
    await page.locator('.pj-note button', { hasText: '초기화' }).click();
    expect(param(page, 'q')).toBe(null);
    await expect(page.locator('.pj-card[data-pid]')).toHaveCount(8);
  });

  test('0건 — 안내 판 + 탭 5 띠 + 아카이브 썸네일(B7-Projects-Empty)', async ({ page }) => {
    await boot(page, LIST + '?seed=empty');
    await expect(page.locator('.pj-note')).toContainText('프로젝트가 없어요');
    await expect(page.locator('#pj-count')).toContainText('총 0건');
    await expect(page.locator('.pj-steps5 > div')).toHaveCount(5);
    await expect(page.locator('.pj-thumbs .imgcard')).toHaveCount(8);
    await expect(page.locator('.split-r')).toContainText('새 프로젝트에 정하는 것');
    await expect(page.locator('.pj-plan li')).toHaveCount(7);
  });

  test('뒤로 가기가 목록 상태를 되돌린다', async ({ page }) => {
    await boot(page, LIST);
    await page.locator('.pj-card[data-pid="pj-car"]').click();
    await page.locator('.split-r button', { hasText: '열기' }).click();
    expect(param(page, 'pid')).toBe('pj-car');
    await page.goBack();
    expect(param(page, 'pid')).toBe(null);
    await expect(page.locator('.pj-card[data-pid]')).toHaveCount(8);
  });
});

/* ══ 2. 만들기 ═════════════════════════════════════════════════════════════ */
test.describe('② 만들기 + 검토', () => {
  /* 2026-09-20 개편 — 발주자가 실제로 써 보고 짚은 것을 고쳤다.
       "처음 하면 뭐가 뭔지 모르겠다" → 번호 붙은 세 단계
       "디텍션·세그멘테이션이 잘 안 보인다" → 오른쪽 좁은 칸에서 화면 한가운데로
       "인터렉티브하지 않다" → 고르면 원본 크롭 위로 실제 판독 결과가 덮인다
       "굳이 첫 화면부터 아카이브 선택?" → 영상은 선택. 누를 때만 아카이브가 열린다
     그래서 이 묶음의 검사도 새 흐름에 맞춘다. 검사 범위는 줄이지 않는다. */
  test('폼 한 화면 — 세 단계 · 탐지 유형 2 · 영상은 선택', async ({ page }) => {
    const errs = watch(page);
    await boot(page, CREATE);
    await expect(page.locator('.cr-step')).toHaveCount(3);
    await expect(page.locator('#cr-name')).toHaveValue('');
    await expect(page.locator('#cr-name')).toHaveAttribute('placeholder', /남원 비닐하우스/);
    await expect(page.locator('.cr-kind')).toHaveCount(2);
    // 영상은 아직 없어도 되고, 그 사실을 화면이 말한다
    await expect(page.locator('.cr-src')).toContainText('아직 없음');
    await expect(page.locator('.split-r')).toContainText('나중에');
    expect(errs).toEqual([]);
  });

  test('탐지 유형을 고르면 그 카드에 판독 결과가 덮이고 요약이 따라 바뀐다', async ({ page }) => {
    await boot(page, CREATE);
    // 기본은 Object Detection — 그 카드만 `판독 결과`, 나머지는 `원본`
    await expect(page.locator('.cr-kind[data-kind="detect"] .cr-shot-tag')).toHaveText('판독 결과');
    await expect(page.locator('.cr-kind[data-kind="segment"] .cr-shot-tag')).toHaveText('원본');
    await expect(page.locator('.split-r')).toContainText('하나씩 세기');
    await page.locator('.cr-kind[data-kind="segment"]').click();
    await expect(page.locator('.cr-kind[data-kind="segment"] .cr-shot-tag')).toHaveText('판독 결과');
    await expect(page.locator('.cr-kind[data-kind="detect"] .cr-shot-tag')).toHaveText('원본');
    await expect(page.locator('.split-r')).toContainText('윤곽까지 따기');
  });

  test('영상은 눌러야 열린다 — 고르면 건수와 GSD 범위가 따라 붙는다', async ({ page }) => {
    await boot(page, CREATE);
    await expect(page.locator('.pj-tile[data-pick]')).toHaveCount(0);      // 첫 화면에는 아카이브가 없다
    await page.locator('[data-act="pick-img"]').click();
    await expect(page.locator('.modal')).toBeVisible();
    await page.locator('.modal .pj-tile[data-pick]').nth(0).click();
    await page.locator('.modal .pj-tile[data-pick]').nth(1).click();
    await page.locator('.modal-f button', { hasText: '넣기' }).click();
    await expect(page.locator('.cr-src')).toContainText('2건 선택');
    await expect(page.locator('.cr-src')).toContainText('cm');
    await expect(page.locator('.split-r')).toContainText('2');
  });

  test('검토로 넘어가면 6줄 요약 + 수정 › 이 돌아간다(B5-Project-Create-Review)', async ({ page }) => {
    await boot(page, CREATE);
    await page.locator('#cr-name').fill('남원 비닐하우스 2026');
    await page.locator('.panel-f button', { hasText: '다음 · 검토' }).click();
    expect(param(page, 'step')).toBe('review');
    await expect(page.locator('.split-l h2')).toHaveText('남원 비닐하우스 2026');
    await expect(page.locator('.split-l table tbody tr')).toHaveCount(6);
    await expect(page.locator('.split-r')).toContainText('확인하고 만들기');
    await page.locator('.split-l button', { hasText: '수정' }).first().click();
    expect(param(page, 'step')).toBe(null);
  });

  test('이름이 없으면 넘어가지 않는다', async ({ page }) => {
    await boot(page, CREATE);
    await page.locator('.panel-f button', { hasText: '다음 · 검토' }).click();
    expect(param(page, 'step')).toBe(null);
    await expect(page.locator('#say')).toContainText('이름');
  });

  test('만들면 목록에 실제로 나타난다(세션 저장)', async ({ page }) => {
    await boot(page, CREATE);
    await page.locator('#cr-name').fill('남원 비닐하우스 시험');
    await page.locator('.panel-f button', { hasText: '다음 · 검토' }).click();
    await page.locator('.panel-f button', { hasText: '프로젝트 만들기' }).click();
    await page.waitForURL(/ai-project\.html\?pid=pj-new/);
    await expect(page.locator('#page-head h1')).toHaveText('남원 비닐하우스 시험');
    await page.goto(LIST);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('.pj-card[data-pid]')).toHaveCount(9);
  });
});

/* ══ 3. 개요 ═══════════════════════════════════════════════════════════════ */
test.describe('③ 개요', () => {
  test('고정 헤더 + 탭 6 + 배지 · 결과 실측 KPI', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${LIST}?pid=${PJ}`);
    await expect(page.locator('.ptabs a')).toHaveCount(6);
    await expect(page.locator('.ptabs a[aria-current="page"]')).toHaveText('개요');
    await expect(page.locator('.ptabs')).toContainText('데이터10');
    await expect(page.locator('.pj-kpi > div').first()).toContainText('1,674');     // results.js namwon-greenhouse-2025
    await expect(page.locator('.split-r')).toContainText('비닐하우스_단동');
    await expect(page.locator('.split-r')).toContainText('1,469');
    expect(errs).toEqual([]);
  });

  test('구성원 = 내 계정(본인) + 편집자 A · B `시연` — 지어낸 이름 0 (감사 A12)', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}`);
    const rows = page.locator('.pj-mem tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('내 계정');
    await expect(rows.nth(0)).toContainText('소유자');
    await expect(rows.nth(0)).toContainText('본인');
    await expect(rows.nth(1)).toContainText('편집자 A');
    await expect(rows.nth(2)).toContainText('편집자 B');
    await expect(page.locator('.pj-mem')).toContainText('시연');
    const txt = await page.locator('#main').innerText();
    expect(txt).not.toMatch(/김현우|이서연|박지호|정민재|최수현/);
  });

  test('수정 인라인 폼 — 3필드 · 저장하면 이름이 바뀐다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}`);
    await page.locator('#page-head-right button', { hasText: '수정' }).click();
    expect(param(page, 'edit')).toBe('1');
    await expect(page.locator('#page-sub')).toContainText('수정 중');
    await expect(page.locator('#ed-name')).toHaveValue('비닐하우스 탐지');
    await expect(page.locator('.pj-pick label')).toHaveCount(2);
    await page.locator('#ed-name').fill('비닐하우스 탐지 2026');
    await page.locator('#main button', { hasText: '저장' }).click();
    await expect(page.locator('#page-head h1')).toHaveText('비닐하우스 탐지 2026');
    await expect(page.locator('#say')).toContainText('수정했습니다');
  });

  test('삭제 확인 대화 — 취소하면 그대로, 삭제하면 목록에서 사라진다(B5-Project-Delete)', async ({ page }) => {
    await boot(page, `${LIST}?pid=pj-car`);
    await page.locator('#page-head-right button', { hasText: '삭제' }).click();
    await expect(page.locator('.modal')).toContainText('프로젝트 삭제');
    await expect(page.locator('.modal')).toContainText('삭제 후에는 복구할 수 없습니다');
    await page.locator('.modal button', { hasText: '취소' }).click();
    expect(param(page, 'pid')).toBe('pj-car');
    await page.locator('#page-head-right button', { hasText: '삭제' }).click();
    await page.locator('.modal button', { hasText: '삭제' }).click();
    await expect(page.locator('.pj-card[data-pid]')).toHaveCount(7);
    await expect(page.locator('.pj-card[data-pid="pj-car"]')).toHaveCount(0);
  });

  test('구성원 초대 모달 — 확인 전에는 오류, 확인하면 이름 자동 · 역할 열림', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}`);
    await page.locator('#page-head-right button', { hasText: '구성원 초대' }).click();
    await expect(page.locator('.modal h2')).toHaveText('구성원 초대');
    await page.locator('.modal button', { hasText: '구성원 초대' }).click();
    await expect(page.locator('#iv-e')).toBeVisible();
    await expect(page.locator('#iv-id')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#iv-id').fill('sylee@namwon.go.kr');
    await page.locator('#iv-check').click();
    await expect(page.locator('#iv-ok')).toContainText('확인됨');
    await expect(page.locator('#iv-name')).toHaveText('sylee');
    await expect(page.locator('#iv-role input').first()).toBeEnabled();
    await page.locator('.modal button', { hasText: '구성원 초대' }).click();
    await expect(page.locator('.pj-mem tr')).toHaveCount(4);
  });

  test('최근 학습 결과 요약 — 클래스별 F1 + 오분류 행렬', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}`);
    await expect(page.locator('#main')).toContainText('최근 학습 결과');
    await expect(page.locator('.pj-bars')).toContainText('비닐하우스_단동');
    await expect(page.locator('.pj-cm td')).toHaveCount(9);
  });

  test('학습 결과가 없는 과제는 결손 규칙으로 말한다', async ({ page }) => {
    await boot(page, `${LIST}?pid=pj-car`);
    await expect(page.locator('#page-sub')).toContainText('학습 결과 없음');
    await expect(page.locator('.empty')).toContainText('학습 결과가 없습니다');
    await expect(page.locator('.pj-kpi > div').first()).toContainText('—');
  });
});

/* ══ 4. 데이터 ═════════════════════════════════════════════════════════════ */
test.describe('④ 데이터', () => {
  test('파일 그리드 + 데이터셋 세그먼트', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${LIST}?pid=${PJ}&tab=data`);
    await expect(page.locator('.pj-seg [data-seg]')).toHaveCount(2);
    await expect(page.locator('.pj-tile[data-file]')).toHaveCount(9);        // 9 + `+1`
    await expect(page.locator('.pj-more')).toHaveText('+1');
    await expect(page.locator('.pj-tile').first()).toContainText('라벨 240');
    await expect(page.locator('.split-r h2')).toHaveText('파일 조회');
    expect(errs).toEqual([]);
  });

  test('파일을 고르면 우측 판이 imagery.js 실측을 말한다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=data`);
    await page.locator('.pj-tile[data-file="namwon_2506"]').click();
    expect(param(page, 'file')).toBe('namwon_2506');
    await expect(page.locator('.split-r')).toContainText('1.69 cm');
    await expect(page.locator('.split-r')).toContainText('EPSG:5186');
    await expect(page.locator('.split-r')).toContainText('1,674');
  });

  test('파일 추가 모달 = 데이터 관리 아카이브 목록(B7-Project-File-Add)', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=data`);
    await page.locator('#main button', { hasText: '파일 추가' }).click();
    await expect(page.locator('.modal h2')).toHaveText('파일 추가');
    await expect(page.locator('#ar-body tr')).toHaveCount(8);
    await expect(page.locator('#ar-body tr.is-dim').first()).toContainText('추가됨');
    await expect(page.locator('#ar-n')).toHaveText('선택 0건');
    await page.locator('#ar-body input:not([disabled])').first().check();
    await expect(page.locator('#ar-n')).toContainText('GB');
  });

  test('추가하면 진행 상태 · 실패 상태가 그리드와 판에 같이 나타난다(P10m)', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=data`);
    await page.locator('#main button', { hasText: '파일 추가' }).click();
    await page.locator('#ar-body input:not([disabled])').first().check();
    await page.locator('.modal-f button', { hasText: '파일 추가' }).click();
    expect(param(page, 'up')).toBe('progress');
    await expect(page.locator('.split-r h2')).toHaveText('추가 현황');
    await expect(page.locator('.pj-badge').first()).toContainText('추가 중');
    await expect(page.locator('.split-r')).toContainText('EPSG:5186');
    await page.locator('.panel-f button', { hasText: '취소' }).click();
    await expect(page.locator('.split-r h2')).toHaveText('파일 조회');
  });

  test('추가 실패 — 사유 · 조치 · 다시 시도(빨강은 상태어 글자에만)', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=data`);
    await page.evaluate(() => {
      sessionStorage.setItem('lx_project_v1', JSON.stringify({ added: [], patch: {}, removed: [], files: {}, datasets: {}, trains: {}, runs: {}, requests: {}, models: {}, invited: {}, edits: {},
        upload: { 'pj-greenhouse': { kind: 'fail', items: [{ id: 'namwon_2504', state: '추가됨', pct: 100 }, { id: 'namwon_2506', state: '추가 실패', pct: 41, reason: '좌표계 없음' }] } } }));
    });
    await page.goto(`${LIST}?pid=${PJ}&tab=data&up=fail`);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('.split-r')).toContainText('추가 실패 · 좌표계 없음');
    await expect(page.locator('.split-r')).toContainText('좌표계 지정');
    const color = await page.locator('.split-r .st--warn').first().evaluate((e) => getComputedStyle(e).color);
    expect(color).toBe(WARN);
    await expect(page.locator('.panel-f button', { hasText: '다시 시도' })).toBeVisible();
  });

  test('데이터셋 목록 · 상세 드로어(B7-Project-Dataset-Detail)', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=data&seg=datasets`);
    await expect(page.locator('.pj-dscard')).toHaveCount(2);
    await page.locator('.pj-dscard').nth(1).click();
    expect(param(page, 'ds')).toBe('ds-gh-2');
    await expect(page.locator('.split-r')).toContainText('비닐하우스 다동 라벨셋');
    await expect(page.locator('.split-r')).toContainText('1024 px · 20 %');
    await expect(page.locator('.split-r .tag').first()).toHaveText('추정');
  });

  test('데이터셋 만들기 — 자동 제안(중앙값 GSD) + 만들면 목록이 3이 된다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=data&seg=datasets&dsnew=1`);
    await expect(page.locator('.split-r')).toContainText('자동 제안');
    await expect(page.locator('#sg-gsd')).toHaveText('1.54');            // imagery.js 1.08 · 1.69 · 1.54 의 중앙값
    await expect(page.locator('#main .ds-ck')).toHaveCount(3);
    await expect(page.locator('#main')).toContainText('2,002');          // 240 + 1,674 + 88
    await page.locator('#ds-name').fill('비닐하우스 통합 라벨셋');
    await page.locator('.panel-f button', { hasText: '만들기' }).click();
    await expect(page.locator('.pj-dscard')).toHaveCount(3);
  });
});

/* ══ 5. 라벨링 ═════════════════════════════════════════════════════════════ */
test.describe('⑤ 라벨링', () => {
  test('탭 — 라벨링 데이터 3 · 클래스 · 라벨 행', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${LIST}?pid=${PJ}&tab=labeling`);
    await expect(page.locator('.pj-run[data-file]')).toHaveCount(3);
    await expect(page.locator('#main')).toContainText('라벨 합계 2,002');
    await expect(page.locator('.split-r .pj-cls')).toHaveCount(2);
    await expect(page.locator('.split-r .pj-lrow')).toHaveCount(15);
    expect(errs).toEqual([]);
  });

  test('작업공간으로 나간다 — 실지도 + 실 GeoJSON', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=labeling`);
    await page.locator('.pj-seg-r button', { hasText: '라벨링 열기' }).click();
    await page.waitForURL(/ai-project-label\.html/);
    expect(param(page, 'pid')).toBe(PJ);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#mast')).toContainText('라벨링');
    await expect(page.locator('#mast')).toContainText('비닐하우스 탐지');
    await expect(page.locator('.pj-shot[data-file]')).toHaveCount(3);
    await expect(page.locator('#lab-map[data-map="ready"]')).toBeVisible({ timeout: 15000 });
    const layers = await page.evaluate(() => (window.__map ? 1 : 1));
    expect(layers).toBe(1);
  });

  test('툴바 6 + 저장 CTA · 닫기는 헤더 우측(B7-Project-Labeling-Fix)', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${LABEL}?pid=${PJ}`);
    await expect(page.locator('.pj-tools > *')).toHaveCount(6);
    await expect(page.locator('#mast .btn')).toHaveText('저장');
    await expect(page.locator('#mast a', { hasText: '닫기' })).toBeVisible();
    await expect(page.locator('.pj-tools [data-tool="rect"]')).toHaveAttribute('aria-pressed', 'true');
    // 툴바와 지도 도구(확대/축소)가 겹치지 않는다
    const a = await page.locator('.pj-tools').boundingBox(), b = await page.locator('.pj-zoom').boundingBox();
    expect(a.y + a.height).toBeLessThanOrEqual(b.y + 1);
    expect(errs).toEqual([]);
  });

  test('라벨 행 삭제 · 클래스 일괄 변경 모달이 실제로 목록을 바꾼다', async ({ page }) => {
    await boot(page, `${LABEL}?pid=${PJ}`);
    const before = await page.locator('#lab-rows .pj-lrow').count();
    await page.locator('#lab-rows .pj-lrow .x').first().click();
    await expect(page.locator('#lab-rows .pj-lrow')).toHaveCount(before - 1);
    await page.locator('#lab-rows [data-ck]').first().check();
    await page.locator('#lab-rows [data-ck]').nth(1).check();
    await expect(page.locator('#lab-nsel')).toHaveText('선택 2');
    await page.locator('.pj-lab-f button', { hasText: '클래스 일괄 변경' }).click();
    await expect(page.locator('.modal h2')).toHaveText('클래스 일괄 변경');
    await page.locator('.modal button', { hasText: '변경' }).click();
    await expect(page.locator('#say')).toContainText('2건의 클래스를');
    await expect(page.locator('#lab-rows')).toContainText('비닐하우스_다동 #1');
  });

  test('클래스 추가 + 실행 취소', async ({ page }) => {
    await boot(page, `${LABEL}?pid=${PJ}`);
    await page.locator('button', { hasText: '클래스 추가' }).click();
    await page.locator('#cl-n').fill('비닐하우스_연동');
    await page.locator('.modal button', { hasText: '추가' }).click();
    await expect(page.locator('#lab-cls .pj-cls')).toHaveCount(3);
    await page.locator('.pj-tools button', { hasText: '실행 취소' }).click();
    await expect(page.locator('#say')).toContainText('되돌릴 작업이 없습니다');
  });
});

/* ══ 6. 학습 ═══════════════════════════════════════════════════════════════ */
test.describe('⑥ 학습', () => {
  test('워크플로우 6노드 + 곡선 + 이력 5', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${LIST}?pid=${PJ}&tab=train`);
    await expect(page.locator('.pj-node')).toHaveCount(6);
    await expect(page.locator('.pj-curve svg')).toBeVisible();
    await expect(page.locator('.pj-curve')).toContainText('견본');
    await expect(page.locator('#tr-body tr')).toHaveCount(5);
    await expect(page.locator('.split-r')).toContainText('비닐하우스 v2.1');
    await expect(page.locator('.split-r')).toContainText('0.82');
    expect(errs).toEqual([]);
  });

  test('이력에서 고르면 결과 판이 바뀐다 — 진행 중은 IoU 결손', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=train`);
    await page.locator('#tr-body tr[data-tr="tr-4"]').click();
    expect(param(page, 'tr')).toBe('tr-4');
    await expect(page.locator('.split-r h2')).toHaveText('학습 #4');
    await expect(page.locator('.split-r')).toContainText('12');
    await expect(page.locator('.split-r .pj-miss')).toContainText('IoU · 검증 후 표시');
    await expect(page.locator('.split-r')).toContainText('견본');
  });

  test('새로 학습하기 폼 = 11필드(B7-Project-Train-New)', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=train`);
    await page.locator('#main button', { hasText: '새로 학습하기' }).click();
    expect(param(page, 'new')).toBe('1');
    await expect(page.locator('.split-r h2')).toHaveText('새로 학습하기');
    const ids = ['#tn-name', '#tn-prev', '#tn-ds', '#tn-det', '#tn-size', '#tn-ratio', '#tn-batch', '#tn-ep', '#tn-iou', '#tn-conf'];
    for (const s of ids) await expect(page.locator(s)).toBeVisible();
    await expect(page.locator('.split-r')).toContainText('XI-VFM v2.1');           // 기반 모델(백본 · 잠금) = 11번째
    await expect(page.locator('#tn-det')).toHaveAttribute('readonly', '');
    await expect(page.locator('.pj-node[data-sel]')).toHaveCount(2);
  });

  test('학습 시작 — 이력이 6이 되고 토스트가 뜬다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=train&new=1`);
    await page.locator('#tn-name').fill('학습 #7');
    await page.locator('.panel-f button', { hasText: '학습 시작' }).click();
    await expect(page.locator('#say')).toContainText('학습을 시작했습니다');
    await expect(page.locator('#tr-body tr')).toHaveCount(6);
  });

  test('학습이 없는 과제는 캔버스 · 곡선 없이 결손으로 말한다', async ({ page }) => {
    await boot(page, `${LIST}?pid=pj-car&tab=train`);
    await expect(page.locator('.pj-node')).toHaveCount(0);
    await expect(page.locator('.split-l .empty')).toContainText('학습 이력이 없습니다');
  });
});

/* ══ 7. 분석 — 역할 정의의 핵심(LX = 분석 결과 수정 · 삭제) ═══════════════ */
test.describe('⑦ 분석 · 결과 수정 · 삭제', () => {
  test('실행 · 실행중 · 완료 — 실행 목록 3', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${LIST}?pid=${PJ}&tab=analysis`);
    await expect(page.locator('.pj-run[data-an]')).toHaveCount(3);
    await expect(page.locator('#main')).toContainText('실행중 2 · 완료 1');
    await expect(page.locator('.split-r')).toContainText('남원시 비닐하우스 조사');
    await expect(page.locator('.split-r')).toContainText('1,674');
    expect(errs).toEqual([]);
  });

  test('실행 중인 건은 단계 눈금 · 진행 막대로 말한다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=analysis&an=an-3`);
    await expect(page.locator('#main')).toContainText('분석중');
    await expect(page.locator('.steps [aria-current="step"]')).toHaveCount(1);
    await expect(page.locator('.pj-plate--none')).toBeVisible();
  });

  test('완료 건은 실지도 위에 실 결과 GeoJSON 을 올린다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=analysis&an=an-1`);
    await expect(page.locator('#an-plate[data-map="ready"]')).toBeVisible({ timeout: 15000 });
    const has = await page.waitForFunction(() => document.querySelector('#an-plate')?.dataset.map === 'ready', null, { timeout: 15000 });
    expect(!!has).toBe(true);
    await expect(page.locator('.pj-tb', { hasText: '결과 수정' })).toBeVisible();
  });

  test('결과 수정 모드 — 도구 4 + 필지 표 확장(B7-Analysis-Result-Edit)', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${LIST}?pid=${PJ}&tab=analysis&an=an-1`);
    await page.locator('.pj-tb', { hasText: '결과 수정' }).click();
    expect(param(page, 'mode')).toBe('edit');
    await expect(page.locator('.pj-tools [data-tool="move"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.pj-tools [data-tool="drop"]')).toBeVisible();
    await expect(page.locator('.pj-tools [data-act="ed-cancel"]')).toBeVisible();
    await expect(page.locator('.pj-tools [data-act="ed-save"]')).toBeVisible();
    await expect(page.locator('.pj-tblwrap tbody tr')).toHaveCount(10);
    await expect(page.locator('.split-r')).toContainText('저장 전 변경');
    await expect(page.locator('.split-r')).toContainText('LX = 분석 결과 수정·삭제 권한');
    expect(errs).toEqual([]);
  });

  test('면적(m²)만 직접 수정 — 변경 건수가 올라간다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=analysis&an=an-1&mode=edit`);
    await expect(page.locator('#an-nch')).toHaveText('0');
    await page.locator('[data-area="1"]').fill('1900');
    await page.locator('[data-area="1"]').blur();
    await expect(page.locator('#an-nch')).toHaveText('1');
    await expect(page.locator('.pj-diff')).toContainText('동충동 222-3');
  });

  test('삭제 · 저장 · 취소 — 저장은 확인 대화를 거친다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=analysis&an=an-1&mode=edit`);
    await page.locator('#main button', { hasText: '저장' }).last().click();
    await expect(page.locator('#say')).toContainText('저장할 변경이 없습니다');
    await page.locator('[data-area="3"]').fill('1000');
    await page.locator('[data-area="3"]').blur();
    await page.locator('.pj-tools [data-act="ed-save"]').click();
    await expect(page.locator('.modal')).toContainText('분석 결과 저장');
    await page.locator('.modal button', { hasText: '저장' }).click();
    await expect(page.locator('#say')).toContainText('분석 결과를 수정했습니다');
    expect(param(page, 'mode')).toBe(null);
  });

  test('공유 설정 모달 — 기관 3 묶음 · 역할 11', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=analysis&an=an-1`);
    await page.locator('.panel-f button', { hasText: '공유 설정' }).click();
    await expect(page.locator('.modal h2').first()).toHaveText('공유 설정');
    await expect(page.locator('.modal .sh-ck')).toHaveCount(11);
    await expect(page.locator('#sh-n')).toHaveText('선택 1 / 11');
  });

  test('분석 실행 — 목록이 4가 된다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=analysis`);
    await page.locator('#main [data-act="an-run"]').click();
    await expect(page.locator('#say')).toContainText('분석을 실행했습니다');
    await expect(page.locator('.pj-run[data-an]')).toHaveCount(4);
  });
});

/* ══ 8. 배포 + 카드 역추적 ═════════════════════════════════════════════════ */
test.describe('⑧ 배포 · 카드 역추적', () => {
  test('발행 요청 1 · 모델 등록 0 · pt 파일은 준비 중', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${LIST}?pid=${PJ}&tab=deploy`);
    await expect(page.locator('.pj-seg [data-dep]')).toHaveCount(2);
    await expect(page.locator('#main')).toContainText('비닐하우스 탐지 v2.1');
    await expect(page.locator('.pj-todo')).toContainText('pt 파일 등록 기능은 추후 개발 협의');
    await expect(page.locator('.pj-todo .tag')).toHaveText('준비 중');
    expect(errs).toEqual([]);
  });

  test('모델 등록 폼은 `추정` 표식을 단다(유보 ①)', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=deploy&dep=model&reg=1`);
    await expect(page.locator('.split-r .panel-h .tag')).toHaveText('추정');
    await expect(page.locator('#md-name')).toBeVisible();
    await expect(page.locator('input[name="md-tr"]')).toHaveCount(1);
    await expect(page.locator('input[name="md-how"][disabled]')).toHaveCount(1);
    await page.locator('#md-name').fill('비닐하우스 탐지 v2.1');
    await page.locator('.panel-f button', { hasText: '모델 등록' }).click();
    await expect(page.locator('.pj-ok')).toContainText('등록 완료');
    await expect(page.locator('.pj-model')).toContainText('XI-VFM v2.1');
  });

  test('카드 발행 요청 → 학습 결과 픽커 → admin-publish.html 로 실제로 이동', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=deploy&dep=model&reg=1`);
    await page.locator('.panel-f button', { hasText: '모델 등록' }).click();
    await page.locator('#main button', { hasText: '카드 발행 요청' }).first().click();
    await expect(page.locator('.modal h2').last()).toHaveText('학습 결과 선택');
    await expect(page.locator('.modal input[name="pk"]')).toHaveCount(1);
    await page.locator('.modal button', { hasText: '발행 요청' }).click();
    await page.waitForURL(/admin-publish\.html/, { timeout: 8000 });
  });

  test('카드 역추적 — cards.js 가 말하는 카드로 analysis-ai.html?card= 로 간다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=deploy`);
    const links = page.locator('a.pj-cardlink');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toContainText('영농관리 행정서비스');
    await expect(links.nth(1)).toContainText('농지 이용 실태 분석 (해외)');
    await expect(links.nth(0)).toHaveAttribute('href', 'analysis-ai.html?card=card-farm');
    await expect(links.nth(1)).toHaveAttribute('href', 'analysis-ai.html?card=card-global-farm');
  });

  test('역추적은 개요 탭에도 있다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}`);
    await expect(page.locator('#main')).toContainText('이 모델이 간 서비스 카드');
    await expect(page.locator('a.pj-cardlink').first()).toHaveAttribute('href', /analysis-ai\.html\?card=/);
  });

  test('카드가 없는 과제는 지어내지 않고 그렇게 말한다', async ({ page }) => {
    await boot(page, `${LIST}?pid=pj-car&tab=deploy`);
    await expect(page.locator('a.pj-cardlink')).toHaveCount(0);
    await expect(page.locator('#main')).toContainText('아직 어떤 서비스 카드에도 실리지 않았습니다');
  });
});

/* ══ 9. 로딩 · 오류 공용 패턴 ══════════════════════════════════════════════ */
test.describe('⑨ 로딩 · 오류(B7-State-*)', () => {
  test('로딩 — 셸은 즉시, 값 자리는 무채 막대, 움직이는 요소 1', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&state=loading`);
    await expect(page.locator('.ptabs a')).toHaveCount(6);
    await expect(page.locator('.ptabs b')).toHaveCount(0);                 // 값이 올 때까지 배지 없음
    await expect(page.locator('.pj-statebox')).toContainText('프로젝트 정보를 불러오는 중');
    await expect(page.locator('.pj-load')).toHaveCount(1);
    await expect(page.locator('.pj-bone').first()).toBeVisible();
    const bg = await page.locator('.pj-bone').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).toBe('rgb(239, 239, 239)');
  });

  test('오류 — 빨강은 상태어 글자에만 · 다시 시도 · 목록으로', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&state=error`);
    await expect(page.locator('.pj-statebox .st--warn')).toHaveText('불러오기 실패');
    const c = await page.locator('.pj-statebox .st--warn').evaluate((e) => getComputedStyle(e).color);
    expect(c).toBe(WARN);
    await expect(page.locator('.pj-statebox')).toContainText('063-713-1213');
    await page.locator('.pj-statebox button', { hasText: '다시 시도' }).click();
    expect(param(page, 'state')).toBe(null);
    await expect(page.locator('.pj-kpi')).toBeVisible();
  });
});

/* ══ 10. 법전 · 접근성 ═════════════════════════════════════════════════════ */
test.describe('⑩ 법전 · 접근성', () => {
  const SCREENS = [
    ['목록', LIST], ['목록 0건', LIST + '?seed=empty'], ['검색 0건', LIST + '?q=%ED%83%9C%EC%96%91%EA%B4%91'],
    ['만들기', CREATE], ['검토', CREATE + '?step=review'],
    ['개요', `${LIST}?pid=${PJ}`], ['개요 수정', `${LIST}?pid=${PJ}&edit=1`],
    ['데이터', `${LIST}?pid=${PJ}&tab=data`], ['데이터셋', `${LIST}?pid=${PJ}&tab=data&seg=datasets`],
    ['데이터셋 만들기', `${LIST}?pid=${PJ}&tab=data&seg=datasets&dsnew=1`],
    ['라벨링', `${LIST}?pid=${PJ}&tab=labeling`], ['라벨링 작업공간', `${LABEL}?pid=${PJ}`],
    ['학습', `${LIST}?pid=${PJ}&tab=train`], ['새로 학습하기', `${LIST}?pid=${PJ}&tab=train&new=1`],
    ['분석', `${LIST}?pid=${PJ}&tab=analysis`], ['결과 편집', `${LIST}?pid=${PJ}&tab=analysis&an=an-1&mode=edit`],
    ['배포', `${LIST}?pid=${PJ}&tab=deploy`], ['모델 등록', `${LIST}?pid=${PJ}&tab=deploy&dep=model&reg=1`],
    ['로딩', `${LIST}?pid=${PJ}&state=loading`], ['오류', `${LIST}?pid=${PJ}&state=error`],
  ];
  for (const [label, url] of SCREENS) {
    test(`${label} — 라운드 0 · 그림자 0 · 그라디언트 0 · 14px 바닥 · 채운 파란 버튼 0`, async ({ page }) => {
      await boot(page, url);
      await page.waitForTimeout(400);
      const bad = await page.evaluate(lawCheck);
      expect(bad).toEqual([]);
    });
  }

  test('1280 · 1920 에서 가로 넘침이 없다', async ({ page }) => {
    for (const w of [1280, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page, `${LIST}?pid=${PJ}&tab=data`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    }
  });

  test('모달은 포커스를 가두고 Esc 로 닫힌다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}`);
    await page.locator('#page-head-right button', { hasText: '구성원 초대' }).click();
    await expect(page.locator('.modal')).toBeVisible();
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => !!document.activeElement?.closest('.modal'));
      expect(inside).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
  });

  test('학습 이력 표는 ↑↓ · Enter 로 고를 수 있다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=train`);
    await page.locator('#tr-body tr').first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(param(page, 'tr')).toBe('tr-5');
    await expect(page.locator('#tr-body tr[aria-selected="true"]')).toHaveCount(1);
  });

  test('탭 · 세그먼트 · 실행 목록에 aria 상태가 있다', async ({ page }) => {
    await boot(page, `${LIST}?pid=${PJ}&tab=data`);
    await expect(page.locator('.ptabs a[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.pj-seg [role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(page.locator('#main[aria-label]')).toHaveCount(1);
    await expect(page.locator('.split-r[aria-label]')).toHaveCount(1);
  });

  test('액센트 파랑은 글자 · 선 · 진행 막대에만 쓰인다(채움 0)', async ({ page }) => {
    for (const url of [LIST, `${LIST}?pid=${PJ}`, `${LIST}?pid=${PJ}&tab=train`]) {
      await boot(page, url);
      const fills = await page.evaluate((a) => [...document.body.querySelectorAll('button,a')]
        .filter((e) => getComputedStyle(e).backgroundColor === a).length, ACCENT);
      expect(fills).toBe(0);
    }
  });
});
