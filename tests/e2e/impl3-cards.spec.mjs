// 구현 3차 · 서비스 카드 한 벌(확인 대장 14차 카드-1 ⓐ · 길-1 ⓑ · 13차 분기-4 ⓐ · 구현 확인 2차 J-9) — 로그인은 폼 입력만(세션 주입 0).
// 분석하기(갤러리 → 카드 상세 → 어디 → 견적까지 — 분석 시작은 GPU 를 쓰므로 LX_GPU=1 일 때만) · 서비스 카드 관리(고치고 되돌리기) ·
// 기관 서비스 선택(카드 ③ · 관할 장면만) · 덱 범위(기관 = 자기 기관만) · 숫자 한 출처(/summary). 계정 = 메일 아이디 · 비밀번호는 server/.env(출력 0).
import { test, expect } from '@playwright/test';
import { frontDoor, check } from '../../landxi/v3/kit/lint/forbidden.mjs';

const BASE = 'http://localhost:4173';
const API = 'http://127.0.0.1:8700/api/v1';
const up = async (request) => { try { return (await request.get(API + '/health', { timeout: 3000 })).ok(); } catch { return false; } };
/** 이 페이지의 로그인 세션으로 게이트웨이를 부른다(화면과 같은 토큰) */
const call = (page, path, init = {}) => page.evaluate(async ([p, i]) => {
  const s = JSON.parse(localStorage.getItem('lx_api_session'));
  const r = await fetch('http://localhost:8700/api/v1' + p, { ...i, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.token } });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [path, init]);
/** 보이는 글자에 금지어(용어표 · 개발 정보)가 없는가 */
const words = async (page, sel) => (await page.locator(sel).innerText()).split('\n').flatMap((l) => check(l).map((k) => `${k}: ${l}`));

test.describe('구현 3차 · 서비스 카드 한 벌', () => {
  test.beforeEach(async ({ request }) => { test.skip(!process.env.DEV_PASSWORD, 'server/.env DEV_PASSWORD 없음'); test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐'); });

  test('분석하기 — 갤러리(카드 한 벌 ①) · 숫자 한 출처 · 카드 상세 · 어디 고르기(견적)', async ({ page }) => {
    test.setTimeout(120000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await frontDoor(page, BASE, 'test@lx.or.kr');
    await page.goto(BASE + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.k-sc[data-kind="analyze"]', { timeout: 30000 });
    expect(await page.locator('.k-sc').count()).toBeGreaterThanOrEqual(5);
    expect(await words(page, '.la-page')).toEqual([]);
    /* 결과 예시 숫자 = 대표 수치 요약(/summary) 그 지역 값 */
    const farm = page.locator('.k-sc[data-card="card-farm"] .k-sc-res');
    const v = Number(await farm.getAttribute('data-v'));
    const sum = await call(page, '/summary?card=card-farm');
    const vals = sum.body.items.flatMap((i) => [i.metrics.field_check?.value, i.metrics.detected?.value]).filter((x) => x != null);
    expect(vals).toContain(v);
    /* 장면 없는 카드 = 회백 판(그림 0) */
    await expect(page.locator('.k-sc .k-sc-crop.is-blank').first()).toContainText(/결과 장면 없음|결과가 나오면/);
    /* 거르기 — 운영만 */
    await page.locator('.la-chip', { hasText: '운영' }).click();
    for (const st of await page.locator('.k-sc').evaluateAll((els) => els.map((e) => e.dataset.state))) expect(st).toBe('ga');
    await page.locator('.la-chip', { hasText: '전체' }).click();
    /* 카드 상세 — 이 카드로 분석: 지역은 화면이 고르지 않는다(원칙 33) */
    await page.locator('.k-sc[data-card="card-45424f"] .k-sc-more').click();
    await page.waitForSelector('.la-side .k-region input', { timeout: 30000 });
    await expect(page.locator('.la-picks li')).toHaveCount(0);
    await expect(page.locator('.la-go')).toBeDisabled();
    const inp = page.locator('.la-side .k-region input');
    await inp.click(); await inp.fill('원주');
    await page.locator('.la-side .k-region-l [role=option]', { hasText: '원주시' }).first().click();
    await expect(page.locator('.la-picks')).toContainText(/카드 조건에 맞음|분석할 수 없|등록된 영상이 없/, { timeout: 90000 });
    expect(await words(page, '.la-page')).toEqual([]);
    if (process.env.LX_GPU === '1') {                                         // 게이트웨이 작업 대기열로 한 번(작은 시군구 · GPU 한 장)
      await page.locator('.la-go').click();
      await expect(page.locator('.la-done')).toContainText('XI맵에서 보기', { timeout: 60000 });
    }
    expect(errs).toEqual([]);
  });

  test('서비스 카드 관리(카드 ②) — 고치면 분석하기 카드에 바로 · 되돌리기', async ({ page }) => {
    test.setTimeout(90000);
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr', 'app');
    await page.goto(BASE + '/landxi/v3/lx-cards/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.k-sc[data-kind="manage"] .k-sc-go', { timeout: 30000 });
    expect(await words(page, '.la-page')).toEqual([]);
    const before = (await call(page, '/cards/card-change')).body;
    try {
      await page.goto(BASE + '/landxi/v3/lx-cards/?card=card-change', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.lc-form input[name=line]', { timeout: 30000 });
      const line = page.locator('.lc-form input[name=line]');
      await line.fill('두 시점 영상을 견주어 달라진 땅만 골라냅니다');
      await page.locator('.lc-save').click();
      await expect(page.locator('.lc-msg')).toContainText('저장했습니다', { timeout: 15000 });
      await expect(page.locator('.lc-prev .k-sc-line')).toHaveText('두 시점 영상을 견주어 달라진 땅만 골라냅니다');
      const deck = (await call(page, '/cards/deck')).body;
      const c = deck.items.find((x) => x.id === 'card-change');
      expect(c.line).toBe('두 시점 영상을 견주어 달라진 땅만 골라냅니다');
      expect(c.scene?.src).toBe(before.scene?.src);                                          // 대표 이미지는 그대로(같이 저장해도 모양이 바뀌지 않는다)
      expect(c.example?.value).toBe(before.example?.value);                                 // 숫자는 고치지 않는다 — 결과 예시 값은 그대로
    } finally {                                                                              // 되돌리기(시험이 중간에 멈춰도)
      await call(page, '/cards/card-change', { method: 'PUT', body: JSON.stringify({ line: before.info?.line ?? before.line }) });
    }
    expect((await call(page, '/cards/card-change')).body.line).toBe(before.line);
  });

  test('기관 서비스 선택(카드 ③) — 관할 장면만 · 덱은 자기 기관만', async ({ browser }) => {
    test.setTimeout(120000);
    for (const [org, card, other] of [['namwon', 'card-farm', 'card-marine'], ['gwangju-jeonnam', 'card-marine', 'card-living']]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await frontDoor(page, BASE, `lxadmin@lx.or.kr#${org}`);
      await page.goto(BASE + '/landxi/v3/gov-select/?list=1', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.gs-card.k-sc', { timeout: 30000 });
      await expect(page.locator(`.gs-card[data-card="${card}"] .k-sc-crop img`)).toBeVisible();
      expect(await words(page, '.gs-page')).toEqual([]);
      const deck = (await call(page, '/cards/deck')).body;
      expect(deck.items.some((c) => c.id === other)).toBe(false);                       // 다른 기관 서비스 0
      for (const c of deck.items) {
        expect(c.uses).toBeUndefined();                                                  // LX 안쪽 값(쓰이는 곳 · 걸리는 시간) 0
        expect(c.time).toBeUndefined();
      }
      if (org === 'gwangju-jeonnam') expect(deck.items.find((c) => c.id === 'card-farm')?.scene ?? null).toBeNull();   // 남원 장면은 광주전남에 0
      expect((await call(page, '/cards/card-farm')).status).toBe(403);                   // 카드 상세 · 고치기는 LX 만
      await ctx.close();
    }
  });

  test('분석 의뢰(J-9) — ① 영상 넣기 ② 분석 카드 고르기 ③ 요청하기 · 전문 글 0', async ({ page }) => {
    test.setTimeout(90000);
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr#namwon');
    await page.goto(BASE + '/landxi/v3/gov-request/?service=dp-nw-farm-25', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gq-cards .k-sc', { timeout: 30000 });
    const pane = page.locator('.gq-pane[data-pane=new]');
    for (const t of ['영상 넣기', '분석 카드 고르기', '요청하기']) await expect(pane).toContainText(t);
    await expect(page.locator('#go')).toHaveText('분석 요청');
    await expect(page.locator('.gq-cards .k-sc[data-card="card-farm"]')).toHaveAttribute('aria-checked', 'true');   // ?service= 의 카드
    expect(await pane.innerText()).not.toMatch(/25cm|좌표|해상도|이렇게 읽었습니다|TIF|JP2|ECW|JPG/);
    expect(await words(page, '.gq-sheet')).toEqual([]);
    await expect(page.locator('#go')).toBeDisabled();                                    // 영상을 넣기 전
  });
});
