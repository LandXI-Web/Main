import { test, expect } from '@playwright/test';

// 분석 서비스 — landxi/proto/analysis-ai.html (서비스 카드 진열대 + 분석 실행 · 실행중 · 완료)
//  원판  design-canvas/v2/renders/B5-Analysis-{List,Run-Review,Run-Progress,Result}.png ·
//        B7-Analysis-{List,Progress-Overlay,Result-Edit,Share}.png · 기록 notes/B7-project-states.md §분석
//  사양  docs/superpowers/specs/2026-09-20-{platform-roles,card-architecture,two-tier}.md
//  데이터 assets/data/{cards,registry}.js (정본) · results·services·imagery·models·crops (실측)
//  실행  PORT=4201 npx playwright test tests/e2e/proto-analysis.spec.mjs --workers=1
const P = 'proto/analysis-ai.html';

/* 줄바꿈을 LF 로 맞춘다. core.autocrlf 가 켜진 윈도우에서 새로 클론하면 작업 트리가
   CRLF 로 떨어지고, LF 기준으로 쓴 문자열 치환이 조용히 빗나가 테스트가 엉뚱하게 깨진다. */
const nl = (s) => s.split('\r\n').join('\n');
const ACCENT = 'rgb(0, 109, 247)', WARN = 'rgb(209, 53, 43)';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|tile|WebGL|GPU stall|maplibre/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, url = P) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
const param = (page, k) => new URL(page.url()).searchParams.get(k);
async function tabTo(page, selector, max = 160) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches?.(s) || false, selector)) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}

/* 법전 자동 검사 — proto-shell.spec.mjs 의 전 요소 검사를 이 화면에 그대로 옮겼다. */
const lawCheck = () => {
  const out = [];
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    if (e.closest('.maplibregl-map')) continue;                       // 지도 라이브러리 내부는 우리 마크업이 아니다
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

/* ══ 관문 · 셸 ═══════════════════════════════════════════════════════════ */
test.describe('관문 · 셸', () => {
  test('로그인 전이면 login.html?next=<파일+쿼리> 로 보낸다', async ({ page }) => {
    await page.goto(P + '?tab=done&run=namwon-farmland-2025');
    await page.waitForURL(/login\.html/);
    expect(param(page, 'next')).toBe('analysis-ai.html?tab=done&run=namwon-farmland-2025');
  });

  test('레일 활성 = 분석 서비스 · H1 하나 · 탭 4 · 오류 0', async ({ page }) => {
    const errs = watch(page);
    await boot(page);
    await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveAttribute('data-menu', 'analysis');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('분석 서비스');
    await expect(page.locator('#atabs a')).toHaveCount(4);
    await expect(page.locator('#atabs a[aria-current="page"]')).toHaveText(/서비스/);
    await expect(page.locator('#foot')).toBeVisible();
    expect(errs).toEqual([]);
  });

  test('네 탭 모두 오류 없이 서고 URL 에 상태가 남는다(뒤로 가기 동작)', async ({ page }) => {
    const errs = watch(page);
    await boot(page);
    for (const [key, label] of [['run', '분석 실행'], ['running', '실행중'], ['done', '완료']]) {
      await page.locator(`#atabs a[data-tab="${key}"]`).click();
      await expect(page.locator('#atabs a[aria-current="page"]')).toContainText(label);
      expect(param(page, 'tab')).toBe(key);
    }
    await page.goBack();
    expect(param(page, 'tab')).toBe('running');
    await page.waitForTimeout(400);
    expect(errs).toEqual([]);
  });
});

/* ══ 1. 분기 탭 — 지자체 사업 / 글로벌 사업 ═══════════════════════════════ */
test.describe('분기 — 지자체 사업 / 글로벌 사업', () => {
  test('SCOPES 그대로 두 분기가 서고 집계는 scopeSummary() 값이다', async ({ page }) => {
    await boot(page);
    const want = await page.evaluate(async () => {
      const m = await import('../assets/data/cards.js');
      return m.SCOPES.map((s) => ({ name: s.name, ...m.scopeSummary(s.id) }));
    });
    await expect(page.locator('.scope-t')).toHaveCount(want.length);
    for (const [i, s] of want.entries()) await expect(page.locator('.scope-t').nth(i)).toContainText(s.name);
    const tiles = page.locator('.an-shelf .band .tile-v b');
    await expect(tiles.nth(0)).toHaveText(String(want[0].total));
    await expect(tiles.nth(1)).toHaveText(String(want[0].live));
    await expect(tiles.nth(4)).toHaveText(String(want[0].models));
    await expect(tiles.nth(5)).toHaveText(String(want[0].deploys));
  });

  test('글로벌로 바꾸면 같은 구조에 맥락만 바뀐다 — URL · 집계 · 좌표계', async ({ page }) => {
    await boot(page);
    await page.locator('[data-scope="global"]').click();
    expect(param(page, 'scope')).toBe('global');
    await expect(page.locator('[data-scope="global"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.band-note')).toContainText('EPSG:4326');
    await expect(page.locator('.scopes')).toHaveCount(1);                    // 구조는 같다
    await expect(page.locator('.cgrid')).toBeVisible();
    await expect(page.locator('#cfilters')).toBeVisible();
    const n = await page.evaluate(async () => (await import('../assets/data/cards.js')).scopeSummary('global').total);
    await expect(page.locator('.ccard')).toHaveCount(n);
  });
});

/* ══ 2. 카드 진열대 — 레지스트리가 그린다(R5) ═════════════════════════════ */
test.describe('진열대 — 레지스트리 · AXES', () => {
  test('카드 목록은 findCards() 결과와 1:1 이다', async ({ page }) => {
    await boot(page);
    const want = await page.evaluate(async () => (await import('../assets/data/registry.js')).findCards({ scope: 'local' }).map((c) => c.name));
    await expect(page.locator('.ccard')).toHaveCount(want.length);
    for (const [i, name] of want.entries()) await expect(page.locator('.ccard-n').nth(i)).toHaveText(name);
  });

  test('거르개는 AXES 정의가 그린다 — scope 를 뺀 축마다 셀렉트 하나', async ({ page }) => {
    await boot(page);
    const axes = await page.evaluate(async () => (await import('../assets/data/registry.js')).AXES.filter((a) => a.id !== 'scope').map((a) => ({ id: a.id, name: a.name, n: a.options().length })));
    await expect(page.locator('#cfilters [data-axis]')).toHaveCount(axes.length);
    for (const ax of axes) {
      const sel = page.locator(`[data-axis="${ax.id}"]`);
      await expect(sel).toHaveCount(1);
      await expect(sel.locator('option')).toHaveCount(ax.n + 1);             // + '전체'
    }
  });

  test('축으로 거르면 URL 에 남고 목록이 줄어든다 · 0건이면 이유 한 줄', async ({ page }) => {
    await boot(page);
    await page.locator('[data-axis="status"]').selectOption('운영');
    expect(param(page, 'status')).toBe('운영');
    const live = await page.evaluate(async () => (await import('../assets/data/registry.js')).findCards({ scope: 'local', status: '운영' }).length);
    await expect(page.locator('.ccard')).toHaveCount(live);
    await page.locator('#cq').fill('없는낱말zzz');
    await page.locator('#cfilters button[type="submit"]').click();
    await expect(page.locator('#cempty')).toBeVisible();
    await expect(page.locator('#cempty-w')).toContainText('초기화로 전체 카드 복귀');
    await page.locator('#cfilters button[type="reset"]').click();
    await expect(page.locator('#cempty')).toBeHidden();
  });

  test('R5 — cards.js 에 카드를 한 줄 더하면 화면 코드를 고치지 않아도 진열대에 선다', async ({ page }) => {
    await page.route('**/assets/data/cards.js', async (route) => {
      const res = await route.fetch();
      // 줄바꿈을 LF 로 맞춘 뒤 치환한다 — autocrlf 가 켜진 윈도우에서 새로 클론하면
      // 작업 트리가 CRLF 로 떨어져 LF 기준 치환이 조용히 빗나간다.
      const src = nl(await res.text());
      const extra = `{ id: 'card-test-new', name: '시험용 신규 카드', scope: 'local', duty: '테스트 업무',
        kind: { input: ['video'], output: ['density', 'series'], viz: ['heatmap', 'playback'] },
        services: ['marine'], ext: 'crowd', status: '검토', version: 'v0.1', projectId: 'pj-test', portable: true,
        needs: ['시험 레이어'], summary: '레지스트리에 한 줄 더하면 화면이 따라오는지 보는 카드.' },`;
      await route.fulfill({ body: src.replace('export const CARDS = [', 'export const CARDS = [\n  ' + extra), headers: { ...res.headers(), 'content-type': 'text/javascript' } });
    });
    await boot(page);
    await expect(page.locator('.ccard-n', { hasText: '시험용 신규 카드' })).toHaveCount(1);
    await expect(page.locator('#atabs a[data-tab="cards"] b')).toHaveText('8');      // 지자체 7 + 1
    await expect(page.locator('.an-shelf .band .tile-v b').first()).toHaveText('8');
    // 상세도 이름을 모른 채 그린다 — 선언(kind)이 장치를 켠다
    await page.locator('.ccard', { hasText: '시험용 신규 카드' }).click();
    await expect(page.locator('#cdetail .panel-t')).toHaveText('시험용 신규 카드');
    await expect(page.locator('#cd-devs [data-device="grid"]')).toHaveCount(1);
    await expect(page.locator('#cd-devs [data-device="timeAxis"]')).toHaveCount(1);
    await expect(page.locator('#cd-devs [data-device="videoPlayer"]')).toHaveCount(1);
  });

  test('준비 중 카드 = 무채 + 점선 + 비활성 CTA(원판 B7-Analysis-List)', async ({ page }) => {
    await boot(page);
    const ready = page.locator('.ccard[data-ready]').first();
    await expect(ready).toHaveCount(1);
    await expect(ready.locator('.chip')).toHaveText('준비 중');
    await expect(ready.locator('.imgcard--none')).toHaveCount(1);             // 결과 산출물 없음 = 점선
    await ready.click();
    await expect(page.locator('#cd-run')).toBeDisabled();
    await expect(page.locator('#cd-run')).toHaveText('준비 중');
    await expect(page.locator('#cd-results')).toBeDisabled();
    await expect(page.locator('.cd-why')).toContainText(/준비 중/);
  });
});

/* ══ 3. 카드 상세 ════════════════════════════════════════════════════════ */
test.describe('카드 상세', () => {
  test('행정 업무 · 소관 · 주기 · 모델(실측) · 배포 지역 · 버전 · 요약이 모두 선다', async ({ page }) => {
    await boot(page, P + '?card=card-farm');
    const kv = page.locator('#cdetail .kv dt');
    for (const k of ['행정 업무', '소관', '주기', '분야', '대상 사업', '버전']) await expect(kv.filter({ hasText: k })).toHaveCount(1);
    const want = await page.evaluate(async () => {
      const c = await import('../assets/data/cards.js');
      const card = c.cardById('card-farm');
      return { duty: card.duty, summary: card.summary, version: card.version,
        models: c.modelsOfCard(card).map((m) => ({ name: m.name, count: m.count, unit: m.unit })),
        deploys: c.deploysOfCard('card-farm').length };
    });
    await expect(page.locator('#cdetail .kv dd').first()).toHaveText(want.duty);
    await expect(page.locator('.cd-sum')).toHaveText(want.summary);
    await expect(page.locator('.cd-models li')).toHaveCount(want.models.length);
    for (const [i, m] of want.models.entries()) {
      await expect(page.locator('.cd-models .cd-mn').nth(i)).toHaveText(m.name);
      if (m.count > 0) await expect(page.locator('.cd-models .cd-mc').nth(i)).toContainText(new Intl.NumberFormat('ko-KR').format(m.count));
      else await expect(page.locator('.cd-models .cd-mc').nth(i)).toHaveText('준비 중');
    }
    await expect(page.locator('#cdetail [data-deploy]')).toHaveCount(want.deploys);
  });

  test('공통 모듈 7 + 전용 모듈 n — 상태어 완성/진행/설계, LX 와 기관을 섞지 않는다', async ({ page }) => {
    await boot(page, P + '?card=card-living');
    const want = await page.evaluate(async () => {
      const c = await import('../assets/data/cards.js');
      return { core: c.CORE_MODULES.length, lx: c.extByOwner('living', 'lx'), local: c.extByOwner('living', 'local') };
    });
    await expect(page.locator('#cd-mods-lx li[data-core]')).toHaveCount(want.core);
    await expect(page.locator('#cd-mods-lx li:not([data-core])')).toHaveCount(want.lx.length);
    await expect(page.locator('#cd-mods-local li[data-owner="local"]')).toHaveCount(want.local.length);
    const LABEL = { done: '완성', wip: '진행', todo: '설계' };
    for (const [i, m] of want.lx.entries()) {
      await expect(page.locator('#cd-mods-lx li:not([data-core]) .cd-mn').nth(i)).toHaveText(m.name);
      await expect(page.locator('#cd-mods-lx li:not([data-core]) .st').nth(i)).toHaveText(LABEL[m.build]);
    }
    // 경계선 — 기관 모듈은 'lx' 목록에 없다(노선 구간화 등 행정 가공은 기관 몫)
    for (const m of want.local) await expect(page.locator('#cd-mods-lx').getByText(m.name, { exact: true })).toHaveCount(0);
    await expect(page.locator('#cd-mods-local li .st').first()).toHaveText('기관이 수행');
  });

  test('종류 선언(kind)이 장치를 켠다 — 카드 이름으로 분기하지 않는다', async ({ page }) => {
    await boot(page, P + '?card=card-crowd');       // 드론 영상 → 점·밀도·시계열 → 히트맵·재생
    for (const d of ['videoPlayer', 'timeAxis', 'grid']) await expect(page.locator(`#cd-devs [data-device="${d}"]`)).toHaveCount(1);
    await expect(page.locator('#cd-devs [data-device="parcelRef"]')).toHaveCount(0);
    await page.goto(P + '?card=card-road');          // 차량 카메라 → 점·구간 → 등급
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#cd-devs [data-device="lineRef"]')).toHaveCount(1);
    await expect(page.locator('#cd-devs [data-device="grid"]')).toHaveCount(0);
    await page.goto(P + '?card=card-farm');          // 정사영상 → 면 → 레이어
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#cd-devs [data-device="parcelRef"]')).toHaveCount(1);
    await expect(page.locator('#cd-devs [data-device="videoPlayer"]')).toHaveCount(0);
  });

  test('선언을 바꾸면 화면 장치가 따라 바뀐다(하드코딩 아님)', async ({ page }) => {
    await page.route('**/assets/data/cards.js', async (route) => {
      const res = await route.fetch();
      const src = nl(await res.text());
      // card-farm 의 선언만 인파관리형으로 바꾼다 — 화면 코드는 그대로다
      await route.fulfill({ body: src.replace(
        "kind: { input: ['ortho'], output: ['polygon'], viz: ['layer', 'chart'] },\n    services: ['farmland', 'greenhouse', 'feedcrop', 'silage'],",
        "kind: { input: ['video'], output: ['point', 'density', 'series'], viz: ['heatmap', 'playback'] },\n    services: ['farmland', 'greenhouse', 'feedcrop', 'silage'],"),
      headers: { ...res.headers(), 'content-type': 'text/javascript' } });
    });
    await boot(page, P + '?card=card-farm');
    await expect(page.locator('#cd-devs [data-device="videoPlayer"]')).toHaveCount(1);
    await expect(page.locator('#cd-devs [data-device="grid"]')).toHaveCount(1);
    await expect(page.locator('#cd-devs [data-device="parcelRef"]')).toHaveCount(0);
    await expect(page.locator('#cd-kindline')).toContainText('드론 영상');
    // 실행 화면의 입력 묶음도 선언을 따른다 — 드론 영상 아카이브는 아직 없다고 말한다
    await page.locator('#cd-run').click();
    await expect(page.locator('.in-k[data-input="video"]')).toHaveCount(1);
    await expect(page.locator('.in-k[data-input="ortho"]')).toHaveCount(0);
    await expect(page.locator('#arch-empty')).toBeVisible();
    await expect(page.locator('#arch-empty')).toContainText('드론 영상 아카이브');
  });

  test('역추적 — 이 카드를 만든 프로젝트 · 결과 → 지도 서비스', async ({ page }) => {
    await boot(page, P + '?card=card-marine');
    // 해양쓰레기는 판독은 돌지만 models.js 에 대응하는 학습 프로젝트가 없다(cards.js projectGap).
    // 없는 프로젝트로 링크를 걸지 않는다 — 결과 → 지도 연결은 그대로 산다.
    await expect(page.locator('#to-project')).toHaveCount(0);
    const rid = await page.evaluate(async () => (await import('../assets/data/results.js')).resultsByService('marine')[0].id);
    await expect(page.locator(`#cdetail a[href="ximap.html?result=${rid}"]`)).toHaveCount(1);
    // 프로젝트가 있는 카드는 링크가 걸린다
    await page.goto(P + '?card=card-farm');
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#to-project')).toHaveAttribute('href', 'ai-project.html?pid=pj-greenhouse');
    // 프로젝트가 없는 카드는 링크 대신 이유 한 줄
    await page.goto(P + '?card=card-crowd');
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#to-project')).toHaveCount(0);
    await expect(page.locator('#cdetail .panel-h .mic')).toContainText('연결된 프로젝트 없음');
  });
});

/* ══ 4. 이식 마법사 ══════════════════════════════════════════════════════ */
test.describe('이식 마법사', () => {
  test('점검표 · 가져갈 것 / 현지 준비 / LX 보관 · 막는 것이 레지스트리 값 그대로', async ({ page }) => {
    await boot(page, P + '?card=card-road');
    await page.locator('#tp-open').click();
    await expect(page.locator('.modal')).toBeVisible();
    const pid = await page.evaluate(async () => (await import('../assets/data/registry.js')).PROFILES[1].id);
    await page.locator(`[data-pf="${pid}"]`).click();
    const want = await page.evaluate(async ([p]) => {
      const r = await import('../assets/data/registry.js');
      const chk = r.transplantCheck('card-road', p), as = r.transplantAssets('card-road');
      return { rows: chk.rows, blockers: chk.blockers, goes: as.goes.map((t) => t.name), stays: as.stays.map((t) => t.name), local: [...as.localNeed, ...as.layerNeed] };
    }, [pid]);
    await expect(page.locator('.tp-check li')).toHaveCount(want.rows.length);
    for (const [i, r] of want.rows.entries()) {
      await expect(page.locator('.tp-check li').nth(i)).toContainText(r.need);
      await expect(page.locator('.tp-check li').nth(i)).toHaveAttribute('data-ok', String(r.ok));
    }
    await expect(page.locator('.tp-col').nth(0).locator('.tp-t')).toHaveCount(want.goes.length);
    for (const [i, g] of want.goes.entries()) await expect(page.locator('.tp-col').nth(0).locator('.tp-t').nth(i)).toHaveText(g);
    for (const [i, l] of want.local.entries()) await expect(page.locator('.tp-col').nth(1).locator('.tp-t').nth(i)).toHaveText(l);
    // LX 보관 = 원본 정사영상(공유 불가 · 위치만) + 영상 이미지(타일)만 권한 부여 — R7
    await expect(page.locator('.tp-col').nth(2)).toContainText(want.stays[0]);
    await expect(page.locator('.tp-col').nth(2)).toContainText('공유 불가 · 위치만');
    await expect(page.locator('.tp-col').nth(2)).toContainText('영상 이미지(타일)');
    await expect(page.locator('.tp-col').nth(2)).toContainText('권한 부여');
    await expect(page.locator('.tp-block li')).toHaveCount(want.blockers.length);
  });

  test('이식 요청 = 배포본 한 줄이 늘고 목록·거르개에 반영된다(카드는 복사하지 않는다)', async ({ page }) => {
    await boot(page, P + '?card=card-farm');
    const before = await page.locator('#cdetail [data-deploy]').count();
    const regBefore = await page.locator('[data-axis="region"] option').count();
    const known = await page.locator('[data-axis="region"] option').allTextContents();
    // 아직 배포본이 한 줄도 없는 지역 프로파일을 고른다 — 거르개에 새 선택지가 느는 것을 본다
    const pid = await page.evaluate(async ([k]) => {
      const { PROFILES } = await import('../assets/data/registry.js');
      return (PROFILES.find((p) => !k.includes(p.region)) || PROFILES[1]).id;
    }, [known]);
    await page.locator('#tp-open').click();
    await page.locator(`[data-pf="${pid}"]`).click();
    await page.locator('.modal-f .btn').click();
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(page.locator('#cdetail [data-deploy]')).toHaveCount(before + 1);
    await expect(page.locator('#cdetail tr.is-new')).toHaveCount(1);
    await expect(page.locator('#cdetail tr.is-new')).toContainText('예정');
    await expect(page.locator('[data-axis="region"] option')).toHaveCount(regBefore + 1);
    // 정본 CARDS 는 손대지 않았다(R3)
    const n = await page.evaluate(async () => (await import('../assets/data/cards.js')).CARDS.length);
    await expect(page.locator('.ccard')).toHaveCount(await page.evaluate(async () => (await import('../assets/data/registry.js')).findCards({ scope: 'local' }).length));
    expect(n).toBeGreaterThan(0);
    // 그 지역으로 거르면 이 카드가 걸린다
    const region = await page.evaluate(async ([p]) => (await import('../assets/data/registry.js')).PROFILES.find((x) => x.id === p).region, [pid]);
    await page.locator('[data-axis="region"]').selectOption(region);
    await expect(page.locator('.ccard-n', { hasText: '영농관리 행정서비스' })).toHaveCount(1);
  });

  test('이식 불가 카드는 마법사 대신 이유를 말한다', async ({ page }) => {
    await boot(page, P + '?card=card-forest');
    await expect(page.locator('#tp-open')).toHaveCount(0);
    await expect(page.locator('.cd-tp')).toContainText('이식 불가');
  });
});

/* ══ 5. 분석 실행 — 원본 3단 픽커 1:1 ════════════════════════════════════ */
test.describe('분석 실행 · 실행중 · 완료', () => {
  test('01 영상 → 02 과제 → 03 모델 · 요약 · 실행 CTA (원판 B5-Analysis-Run-Review)', async ({ page }) => {
    await boot(page, P + '?tab=run&card=card-farm');
    await expect(page.locator('.step-n')).toHaveCount(3);
    const n = await page.evaluate(async () => (await import('../assets/data/imagery.js')).IMAGERY.length);
    await expect(page.locator('#arch-n')).toHaveText(String(n));
    await expect(page.locator('#go-run')).toBeDisabled();                     // 영상 전
    await expect(page.locator('#run-why')).toContainText('영상을 한 장 이상');
    await page.locator('.thumb').first().locator('input').check();
    await expect(page.locator('#go-run')).toBeEnabled();
    await expect(page.locator('#sel-sum')).toContainText('선택');
    await expect(page.locator('#run-extent')).toContainText('선택 범위 1');
    await expect(page.locator('#run-sum div')).toHaveCount(8);
    await expect(page.locator('#run-sum')).toContainText('영농관리 행정서비스');
  });

  test('필터 칩 · 검색으로 아카이브가 줄고, 없으면 이유 한 줄', async ({ page }) => {
    await boot(page, P + '?tab=run&card=card-farm');
    const all = await page.locator('.thumb').count();
    await page.locator('[data-facet="recent"]').click();
    await expect(page.locator('[data-facet="recent"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.thumb')).toHaveCount(4);                      // 남원 농경지 4시점
    await page.locator('[data-facet="all"]').click();
    await expect(page.locator('.thumb')).toHaveCount(all);
    await page.locator('#rq').fill('없는영상zzz');
    await expect(page.locator('#arch-empty')).toBeVisible();
  });

  test('실행 → 진행 오버레이(원판 B7-Analysis-Progress-Overlay) → 실행중 목록에 한 줄', async ({ page }) => {
    await boot(page, P + '?tab=run&card=card-farm');
    const before = await page.evaluate(() => Number(document.querySelector('#atabs a[data-tab="running"] b').textContent));
    await page.locator('.thumb').first().locator('input').check();
    await page.locator('#go-run').click();
    const m = page.locator('.modal');
    await expect(m).toBeVisible();
    await expect(m.locator('h2')).toHaveText('분석 진행 중');
    await expect(m.locator('#p-steps span')).toHaveCount(5);                  // 전처리 · 추론 · 후처리 · 벡터화 · 저장
    await expect(m.locator('#p-steps [aria-current="step"]')).toHaveCount(1);
    await expect(m.locator('#p-t')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(m.locator('.tag').first()).toHaveText('시연');
    await expect(m.locator('#p-note')).toContainText('실행중 목록에 추가됨');
    await page.waitForTimeout(900);
    expect(await m.locator('#p-bar').evaluate((e) => e.style.getPropertyValue('--v'))).not.toBe('0%');
    await m.locator('.btn').click();                                          // 분석 결과 보기 → 실행중
    expect(param(page, 'tab')).toBe('running');
    await expect(page.locator('#atabs a[data-tab="running"] b')).toHaveText(String(before + 1));
  });

  test('실행중 — 상태 칩 · 등록자 · 새로고침 · 검색 · 페이저 · 진행 판', async ({ page }) => {
    await boot(page, P + '?tab=running');
    await expect(page.locator('[data-st]')).toHaveCount(4);                   // 전체 · 대기 중 · 처리 중 · 처리 실패
    await expect(page.locator('[data-own]')).toHaveCount(3);
    await expect(page.locator('#rl .lcard')).toHaveCount(3);
    await expect(page.locator('#rl-pager')).toContainText('총 3건');
    await page.locator('[data-st="fail"]').click();
    await expect(page.locator('#rl .lcard')).toHaveCount(1);
    await expect(page.locator('#rp')).toContainText('처리 실패');
    await expect(page.locator('.rp-fail .st--warn')).toHaveCSS('color', WARN);
    await expect(page.locator('.rp-fail')).toContainText('좌표계');
    await page.locator('[data-st="run"]').click();
    await expect(page.locator('.rp-steps [aria-current="step"]')).toHaveCount(1);
    await page.locator('#rl-q').fill('없는이름zzz');
    await expect(page.locator('#rl-empty')).toBeVisible();
  });

  test('완료 — 실지도(V-World + 실 GeoJSON 청록) · 실측 통계 · 필지 행정정보 표', async ({ page }) => {
    const errs = watch(page);
    await boot(page, P + '?tab=done&run=namwon-farmland-2025');
    await page.waitForSelector('#dm-plate[data-map="ready"]', { timeout: 20000 });
    const layers = await page.evaluate(() => {
      const c = document.querySelector('#dm-plate .maplibregl-canvas');
      return !!c && c.width > 0;
    });
    expect(layers).toBe(true);
    const want = await page.evaluate(async () => {
      const r = (await import('../assets/data/results.js')).resultById('namwon-farmland-2025');
      return { count: r.stats.count, ha: r.stats.areaHa.toFixed(1), classes: Object.entries(r.stats.classes).sort((a, b) => b[1] - a[1]) };
    });
    const nf = new Intl.NumberFormat('ko-KR');
    await expect(page.locator('#dp-n')).toHaveText(nf.format(want.count));
    await expect(page.locator('.dp-nums')).toContainText(want.ha);
    await expect(page.locator('.bars li')).toHaveCount(want.classes.length);
    for (const [i, [k, v]] of want.classes.entries()) {
      await expect(page.locator('.bars .bar-k').nth(i)).toHaveText(k);
      await expect(page.locator('.bars b').nth(i)).toHaveText(nf.format(v));
    }
    // 필지 행정정보 = 실 GeoJSON 속성(PNU 결합)
    await expect(page.locator('[data-device="parcelRef"]')).toHaveCount(1);
    await expect(page.locator('#pc-sum')).toContainText(nf.format(want.count));
    await expect(page.locator('#pc-tbl thead th')).toHaveCount(8);
    await expect(page.locator('#pc-tbl tbody tr')).toHaveCount(5);
    await expect(page.locator('#to-map')).toHaveAttribute('href', 'ximap.html?result=namwon-farmland-2025');
    await page.waitForTimeout(500);
    expect(errs).toEqual([]);
  });

  test('결과 편집(원판 B7-Analysis-Result-Edit) — 이동 · 삭제 · 저장 전 변경 · 저장', async ({ page }) => {
    await boot(page, P + '?tab=done&run=namwon-farmland-2025');
    await page.waitForSelector('#pc-tbl tbody tr');
    await page.locator('#ed-open').click();
    expect(param(page, 'edit')).toBe('1');
    await expect(page.locator('[data-tool="move"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dp-share')).toBeDisabled();
    await expect(page.locator('.dp-hint')).toContainText('저장·취소 후 다시 활성');
    await page.waitForSelector('#pc-tbl tbody tr');
    await page.locator('#pc-tbl tbody tr').first().click();
    await expect(page.locator('#dm-chg')).toHaveText('1');
    await expect(page.locator('.ed-strip')).toContainText('이동');
    await page.locator('[data-tool="del"]').click();
    await page.locator('#pc-tbl tbody tr').nth(1).click();
    await expect(page.locator('#dm-chg')).toHaveText('2');
    await expect(page.locator('.ed-strip')).toContainText('삭제');
    await expect(page.locator('.ed-strip .st--warn')).toHaveCSS('color', WARN);
    await page.locator('#ed-save').click();
    expect(param(page, 'edit')).toBe(null);
    await expect(page.locator('#say')).toContainText('변경 2건을 저장했습니다');
    await expect(page.locator('#dp .panel-b')).toContainText('이 세션에 저장한 편집');
  });

  test('공유 설정(원판 B7-Analysis-Share) — 기관 3 묶음 · 역할 9 · 선택 n / 9', async ({ page }) => {
    await boot(page, P + '?tab=done&run=namwon-farmland-2025');
    await page.locator('#dp-share').click();
    await expect(page.locator('.modal h2')).toHaveText('공유 설정');
    await expect(page.locator('.share-g')).toHaveCount(3);
    await expect(page.locator('.share-r')).toHaveCount(9);
    await expect(page.locator('.share-n')).toContainText('선택 2');
    await expect(page.locator('.share-gh').first()).toContainText('1 / 2');
    await page.locator('.share-r input').nth(1).check();
    await expect(page.locator('.share-n')).toContainText('선택 3');
    await expect(page.locator('.share-gh').first()).toContainText('2 / 2');
    await page.locator('.modal-f .btn').click();
    await expect(page.locator('#say')).toContainText('공유 대상 3건');
    await expect(page.locator('#dp .kv')).toContainText('LX 일반 사용자');
  });

  test('결과 산출물이 없는 시드 실행은 지도·표를 세우지 않고 그렇게 말한다', async ({ page }) => {
    await boot(page, P + '?tab=done&run=run-road-2604');
    await expect(page.locator('.dm-cnt')).toContainText('결과 산출물 없음');
    await expect(page.locator('#ed-open')).toHaveCount(0);
    await expect(page.locator('#dp-down')).toBeDisabled();
    await expect(page.locator('#dp .panel-b')).toContainText('결과 산출물이 없는 시드 실행');
  });
});

/* ══ 6. 화면 간 연결 ═════════════════════════════════════════════════════ */
test.describe('화면 간 연결', () => {
  test('?result= 로 들어오면 완료 탭의 그 결과가 열린다(지도·대시보드 딥링크)', async ({ page }) => {
    await boot(page, P + '?result=yeosu-marine-2026-drone');
    await expect(page.locator('#atabs a[aria-current="page"]')).toContainText('완료');
    await expect(page.locator('#dp .panel-t')).toHaveText('여수시 해양쓰레기 조사(드론)');
  });

  test('?card= 로 들어오면 그 카드가 선택된 진열대가 열린다(프로젝트 역추적 착지)', async ({ page }) => {
    await boot(page, P + '?card=card-living');
    await expect(page.locator('#cdetail .panel-t')).toHaveText('생활환경 위험요소 탐지 서비스');
    await expect(page.locator('.ccard[aria-selected="true"] .ccard-n')).toHaveText('생활환경 위험요소 탐지 서비스');
  });

  test('?svc= (포털의 서비스 카드 = 배포본) 로 들어오면 그 맥락으로 걸러 연다', async ({ page }) => {
    const dep = await (async () => ({ id: 'dp-nw-farm-25' }))();
    await boot(page, P + `?svc=${dep.id}`);
    await expect(page.locator('#svc-bar')).toBeVisible();
    await expect(page.locator('#svc-bar .chip')).toHaveText('서비스 카드');       // 발행 카드와 이름을 구분한다
    await expect(page.locator('#svc-bar')).toContainText('영농관리 행정서비스');
    await expect(page.locator('#svc-bar a')).toHaveAttribute('href', `portal.html?svc=${dep.id}`);
    await expect(page.locator('#atabs a[aria-current="page"]')).toContainText('완료');
    const mine = await page.evaluate(() => document.querySelectorAll('#dl .lcard').length);
    expect(mine).toBeGreaterThan(0);
    await page.locator('#svc-clear').click();
    await expect(page.locator('#svc-bar')).toBeHidden();
  });
});

/* ══ 7. 법전 · 접근성 ════════════════════════════════════════════════════ */
test.describe('법전 · 접근성', () => {
  for (const [name, url] of [['진열대', P], ['분석 실행', P + '?tab=run'], ['실행중', P + '?tab=running'], ['완료', P + '?tab=done']]) {
    test(`${name} — 라운드·그림자·그라디언트·14px 미만·파란 채움 버튼 0`, async ({ page }) => {
      await boot(page, url);
      await page.waitForTimeout(1200);
      expect(await page.evaluate(lawCheck)).toEqual([]);
    });
  }

  test('이식 마법사 · 공유 모달도 법전을 지킨다 · 포커스 트랩 · Esc', async ({ page }) => {
    await boot(page, P + '?card=card-farm');
    await page.locator('#tp-open').click();
    await expect(page.locator('.modal')).toBeVisible();
    expect(await page.evaluate(lawCheck)).toEqual([]);
    expect(await page.evaluate(() => document.querySelector('.modal').contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.querySelector('.modal')?.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
    expect(param(page, 'pick')).toBe(null);
  });

  test('키보드만으로 카드를 고르고 ↑↓←→ 로 진열대를 걷는다', async ({ page }) => {
    await boot(page);
    expect(await tabTo(page, '.ccard')).toBe(true);
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.activeElement.querySelector('.ccard-n')?.textContent)).toBeTruthy();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ccard[aria-selected="true"]')).toHaveCount(1);
    expect(param(page, 'card')).toBeTruthy();
  });

  test('aria — 분기 탭 tablist · 진열대 listbox · 판 live · 포커스 링 파랑', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.scopes')).toHaveAttribute('role', 'tablist');
    await expect(page.locator('#cgrid')).toHaveAttribute('role', 'listbox');
    await expect(page.locator('.ccard').first()).toHaveAttribute('role', 'option');
    await expect(page.locator('#cdetail')).toHaveAttribute('aria-live', 'polite');
    await page.locator('.ccard').first().focus();
    await expect(page.locator('.ccard').first()).toHaveCSS('outline-color', ACCENT);
  });

  test('1280 · 1920 에서 가로 스크롤 0', async ({ page }) => {
    for (const w of [1280, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const url of [P, P + '?tab=run', P + '?tab=done']) {
        await boot(page, url);
        await page.waitForTimeout(800);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      }
    }
  });
});

/* ══ 8. 정직 — 지어낸 수치 0 ═════════════════════════════════════════════ */
test.describe('콘티 원칙', () => {
  test('실측은 results.js · services.js 값 그대로, 시드는 `시연` 꼬리표', async ({ page }) => {
    await boot(page, P + '?tab=done');
    const demo = await page.evaluate(async () => (await import('./analysis-data.js')).SEED_RUNS.filter((r) => r.demo && r.state === 'done').length);
    await expect(page.locator('#dl .lcard .tag')).toHaveCount(demo);
    for (const t of await page.locator('#dl .lcard .tag').all()) await expect(t).toHaveText('시연');
  });

  test('준비 중 카드는 남의 결과를 제 것으로 내세우지 않는다', async ({ page }) => {
    await boot(page, P + '?scope=global&card=card-global-farm');
    await expect(page.locator('.cd-img.imgcard--none')).toHaveCount(1);
    await expect(page.locator('#cd-results')).toBeDisabled();
    await expect(page.locator('#cdetail')).toContainText('결과 대장에 산출물이 없습니다');
  });

  test('레지스트리 건강 검사가 비어 있다(R6)', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(async () => (await import('../assets/data/registry.js')).healthCheck());
    expect(h.issues).toEqual([]);
  });
});
