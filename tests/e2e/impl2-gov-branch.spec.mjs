// 구현 2차 T3 · 기관 분기 플랫폼 뼈대 — 바깥 주소에서 기관 주소(https://{기관}.land-xi.dev/ · 7차 결정 기관-주소 ⓒ) 메인 → 그 기관 모습의 로그인 →
// 서비스 선택 → 서비스 대시보드 → 기존 기관 화면, 기관 관리자가 색 · 글을 고치면 메인에 바로 반영, LX 관리자도 기관 서랍에서 같은 칸을 고친다.
// 로그인은 폼 입력만(세션 주입 0). 기준 주소: LX_GOV_BASE(기관 목록 · 기본 https://gov.land-xi.dev) · LX_ORG_BASE(기관 주소 규칙 · 기본 https://{org}.land-xi.dev)
// · LX 관리자 입구 LX_ADMIN_BASE(기본 https://admin.land-xi.dev).
// 운영 DB 를 쓰므로 고친 브랜드 값은 끝에 처음 값으로 되돌린다(게이트웨이 127.0.0.1:8700 · LX 관리자 토큰).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const GOV = process.env.LX_GOV_BASE || 'https://gov.land-xi.dev';
const ADMIN = process.env.LX_ADMIN_BASE || 'https://admin.land-xi.dev';
const ORG = (o) => (process.env.LX_ORG_BASE || 'https://{org}.land-xi.dev').replace('{org}', o);
const API = 'http://127.0.0.1:8700/api/v1';
const ENV = path.resolve('server/.env');
const PW = process.env.LX_PW || (fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null);
const up = async (request) => { try { return (await request.get(ORG('namwon') + '/api/v1/brand/namwon', { timeout: 15000 })).ok(); } catch { return false; } };

async function adminToken(request) {
  const r = await request.post(API + '/auth/login', { data: { realm: 'lx', login: 'lxadmin@lx.or.kr', password: PW } });
  return (await r.json()).token;
}
/** 브랜드 한 벌을 처음 값으로(시험이 고친 것 되돌리기) */
async function restore(request, t, b) {
  const tok = await adminToken(request);
  await request.put(`${API}/brand/${t}`, { headers: { authorization: 'Bearer ' + tok }, data: {
    platform: b.platform, short: b.short, mark_text: b.mark.text.join('\n'), accent: b.color.accent, tint: b.color.tint, contact: b.contact,
    intro: { headline: b.intro.headline, lines: b.intro.lines, items: b.intro.items } } });
}
async function signInAtMain(page, org, id = 'lxadmin@lx.or.kr') {
  await page.goto(ORG(org) + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__govHome?.ready, null, { timeout: 30000 });
  await page.fill('.gh-form input[name=login]', id);
  await page.fill('.gh-form input[name=password]', PW);
  await Promise.all([page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-select/'), { timeout: 90000, waitUntil: 'domcontentloaded' }), page.click('.gh-go')]);
}

test.describe('구현 2차 · 기관 분기 플랫폼(기관 주소)', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '바깥 주소(gov 입구)에 닿지 않음');
  });

  test('gov 첫 주소 = 기관 고르기 목록(Land-XI 로그인 아님) → 기관 주소 · 옛 경로 · 없는 기관', async ({ page, request }) => {
    test.setTimeout(90000);
    await page.goto(GOV + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__govHome?.ready, null, { timeout: 30000 });
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('#form, .door__h')).toHaveCount(0);                         // Land-XI 로그인 화면이 아니다
    await expect(page.locator('a.gh-orgc[data-org="namwon"]')).toBeVisible();
    await expect(page.locator('a.gh-orgc[data-org="gwangju-jeonnam"]')).toBeVisible();
    await page.locator('a.gh-orgc[data-org="namwon"]').click();
    await page.waitForURL(ORG('namwon') + '/');
    await page.waitForFunction(() => window.__govHome?.org === 'namwon', null, { timeout: 30000 });
    const old = await request.get(GOV + '/namwon/?x=1', { maxRedirects: 0 });                // 옛 모양 → 기관 주소
    expect(old.status()).toBe(301); expect(old.headers().location).toBe(ORG('namwon') + '/?x=1');
    expect((await request.get(ORG('no-such-org') + '/', { maxRedirects: 0 })).status()).toBe(404);   // 서버 기관 목록에 없는 이름
    const lx = await request.get(ORG('namwon') + '/landxi/v3/login/', { maxRedirects: 0 });   // 기관 주소에서 Land-XI 로그인 아님
    expect(lx.status()).toBe(302); expect(new URL(lx.headers().location, ORG('namwon')).pathname).toBe('/');
    const cross = await request.post(ORG('namwon') + '/api/v1/auth/login', { data: { site: 'gov', realm: 'tenant', tenant_id: 'gwangju-jeonnam', login: 'lxadmin@lx.or.kr', password: PW } });
    expect(cross.status()).toBe(400);                                                         // 남원 주소에서 다른 기관 계정 0
  });

  test('남원 메인 · 광주전남 메인 — 같은 틀, 다른 마크 · 이름 · 색 · 서비스', async ({ page }) => {
    test.setTimeout(90000);
    const seen = {};
    for (const org of ['namwon', 'gwangju-jeonnam']) {
      await page.goto(ORG(org) + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__govHome?.ready, null, { timeout: 30000 });
      const b = await page.evaluate(() => window.__govHome.brand);
      await expect(page.locator('.gh-plat')).toHaveText(b.platform);
      await expect(page.locator('.gh-form input[name=login]')).toBeVisible();          // 그 기관 모습의 로그인 — 기관 고르기 없음
      await expect(page.locator('select')).toHaveCount(0);
      seen[org] = { platform: b.platform, accent: b.color.accent, cards: await page.locator('.gh-svc').evaluateAll((a) => a.map((x) => x.dataset.card)),
        parts: await page.locator('.gh-top, .gh-hero, #svc, #how, .gh-foot').count(), h1: (await page.locator('.gh-h1').innerText()).split('\n').length };
      const txt = await page.locator('body').innerText();
      for (const bad of ['시연', '데모', '준비 중', '/api/', 'card-']) expect(txt).not.toContain(bad);
    }
    expect(seen.namwon.cards).toEqual(['card-living', 'card-farm', 'card-road', 'card-crowd']);
    expect(seen['gwangju-jeonnam'].cards).toEqual(['card-marine']);
    expect(seen.namwon.accent).not.toBe(seen['gwangju-jeonnam'].accent);
    expect(seen.namwon.parts).toBe(5); expect(seen['gwangju-jeonnam'].parts).toBe(5);    // 틀은 같다
    expect(seen.namwon.h1).toBe(2); expect(seen['gwangju-jeonnam'].h1).toBe(2);          // 머리 두 줄
    await expect(page.locator('.gh-svc[data-card="card-marine"] .t-chip')).toHaveText('운영');
    /* 구현 5차 기관-2 ⓐ — 결과가 있는 서비스만 실제 결과 장면(작게 · 저해상 크롭) · 나머지는 시작 시기 · 그림판(일러스트) 0 */
    await page.goto(ORG('namwon') + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__govHome?.ready, null, { timeout: 30000 });
    const pic = page.locator('.gh-svc[data-card="card-farm"] .gh-crop img');
    await expect(pic).toBeVisible();
    await expect.poll(() => pic.evaluate((i) => i.naturalWidth), { timeout: 20000 }).toBeGreaterThan(0);
    expect(await pic.evaluate((i) => Math.max(i.naturalWidth, i.naturalHeight))).toBeLessThanOrEqual(800);     // 로그인 전 = 저해상만
    expect(await page.locator('.gh-svc[data-card="card-road"] .gh-crop.is-blank').count()).toBe(1);
    expect(await page.locator('.gb-face, .gh-art').count()).toBe(0);
    expect(await page.locator('.gh-fact').count()).toBe(3);                                  // 업무 결과 셋(서버 값)
  });

  test('남원 — 메인 로그인 → 서비스 선택 → 서비스 대시보드 → 기존 기관 화면(?service=)', async ({ page }) => {
    test.setTimeout(120000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await signInAtMain(page, 'namwon');
    await page.waitForFunction(() => window.__govSelect?.ready, null, { timeout: 30000 });
    expect(await page.evaluate(() => window.__govSelect.view)).toBe('list');           // 서비스가 여럿 — 서비스 선택
    await expect(page.locator('.k-mast .gs-plat')).toHaveText('남원시 GeoVision 플랫폼'); // 머리에 기관 마크 · 이름
    await expect(page.locator('.k-mast .gb-mark')).toBeVisible();
    /* 카드 = 서비스 카드 한 벌의 기관 모양(확인 대장 14차 카드-1 ⓐ ③) — 열린 서비스만 '이 서비스 열기' */
    await expect(page.locator('.gs-card .k-sc-go')).toHaveCount(3);                     // 생활환경 · 영농 · 도로안전(열림) + 인파(내년 · 닫힘)
    await expect(page.locator('.gs-card.is-off[data-card="card-crowd"] .t-chip')).toHaveText('내년');
    await expect(page.locator('.gs-card[data-card="card-road"] .t-chip')).toHaveText('첫 결과 전');
    await expect(page.locator('.gs-card[data-card="card-farm"] .k-sc-crop img')).toBeVisible();   // 실제 결과 장면(그 기관 관할)
    await page.locator('.gs-card[data-card="card-farm"] .k-sc-go').click();
    await page.waitForURL((u) => u.searchParams.get('service') === 'card-farm');
    await page.waitForFunction(() => window.__govSelect?.ready && window.__govSelect.view === 'svc', null, { timeout: 30000 });
    const big = page.locator('.gd-scene');                                               // 구현 5차 기관-4 ⓐ — 결과 장면 위 큰 숫자 하나
    await expect(big).toHaveAttribute('data-metric', '현장 확인 필요');
    const v = await big.getAttribute('data-v');
    const sum = await page.evaluate(async () => { const s = JSON.parse(localStorage.getItem('lx_api_session')); const r = await fetch('/api/v1/summary?card=card-farm', { headers: { authorization: 'Bearer ' + s.token } }); return r.json(); });
    expect(Number(v)).toBe(sum.items.reduce((a, i) => a + (i.metrics.field_check.value || 0), 0));   // 숫자 한 출처(/summary)
    await expect(page.locator('.gs-tab[aria-current]')).toHaveText('현황');
    expect(await page.locator('.gs-tabs a').allInnerTexts()).toEqual(['현황', '결과 지도', '필지 목록', '이력', '통계·보고서']);   // 18차 N-1 ⓐ 탭 다섯
    const mapU = new URL(await page.locator('.gs-tabs a', { hasText: '결과 지도' }).getAttribute('href'), page.url());
    expect(mapU.pathname).toBe('/landxi/v3/xi-clean/');
    expect(mapU.searchParams.get('service')).toBe('card-farm');                         // 지도 위 '보고 있는 결과' 카드가 그 서비스로
    /* 읍면별 막대의 합 = 큰 숫자(같은 식 · 서버 값) · 이 결과는(결과 설명서) · 내려받기 셋 */
    await page.waitForSelector('.gd-bars .gd-bar');
    const bars = await page.locator('.gd-bars .gd-bar-n').allInnerTexts();
    expect(bars.reduce((a, t) => a + Number(t.replace(/,/g, '')), 0)).toBe(Number(v));
    await expect(page.locator('.gd-about .gd-dl3 button')).toHaveCount(0);               // 내려받기는 통계·보고서 탭 한 곳(18차 N-1 ⓐ)
    await expect(page.locator('.gd-epochs .gd-ep-i')).toHaveCount(4);
    /* 통계·보고서 — 다섯 숫자(현장 확인 필요 = 큰 숫자) · 보고서 만들기 + 내려받기 셋 */
    await page.locator('.gs-tabs a', { hasText: '통계·보고서' }).click();
    await page.waitForURL((u) => u.searchParams.get('tab') === 'stats');
    await page.waitForSelector('.gs-num');
    await expect(page.locator('.gs-num')).toHaveCount(5);
    expect(Number(await page.locator('.gs-num[data-k="field_check"] .k-num').getAttribute('data-v'))).toBe(Number(v));
    await expect(page.locator('.gs-files .gs-file')).toHaveCount(4);
    /* 이력 — 날짜별 한 줄기 */
    await page.locator('.gs-tabs a', { hasText: '이력' }).click();
    await page.waitForSelector('.gy-row');
    await page.locator('.gs-tabs a', { hasText: '현황' }).click();
    await page.waitForSelector('.gd-about .gd-links a');
    await page.locator('.gd-about .gd-links a', { hasText: '행정정보와 비교' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-fusion/') && u.searchParams.get('service') === 'card-farm', { timeout: 30000 });
    await page.waitForTimeout(3000);
    expect(new URL(page.url()).pathname.startsWith('/landxi/v3/gov-fusion/')).toBe(true);   // 관문이 되돌리지 않았다
    expect(errs).toEqual([]);
  });

  test('광주전남 — 서비스가 하나(해양쓰레기)라 로그인하면 그 서비스 대시보드로 · 광역 전체/시·군·구 한 칸', async ({ page }) => {
    test.setTimeout(120000);
    await signInAtMain(page, 'gwangju-jeonnam', 'lxadmin@lx.or.kr');
    await page.waitForURL((u) => u.searchParams.get('service') === 'card-marine', { timeout: 30000 });
    await page.waitForFunction(() => window.__govSelect?.ready && window.__govSelect.view === 'svc', null, { timeout: 30000 });
    await expect(page.locator('.k-mast .gs-plat')).toHaveText('전남광주 AI 플랫폼');
    await expect(page.locator('.gs-reg select')).toBeVisible();                          // 광역만 한 칸 더
    await expect(page.locator('.gs-reg select option').first()).toHaveText('광역 전체');
    await expect(page.locator('.gd-scene')).toHaveAttribute('data-metric', 'AI 탐지');
    await page.selectOption('.gs-reg select', '12130');
    await page.waitForURL((u) => u.searchParams.get('region') === '12130');
    await page.waitForFunction(() => window.__govSelect?.ready, null, { timeout: 30000 });
    await expect(page.locator('.gs-sub')).toContainText('여수시');
  });

  test('기관 관리자 — 기관 정보에서 색 · 글 고치기 → 메인에 바로 반영(대비 검사 걸리면 저장 안 됨)', async ({ page, request }) => {
    test.setTimeout(120000);
    const orig = await (await request.get(`${API}/brand/namwon`)).json();
    try {
      await signInAtMain(page, 'namwon');
      await page.goto(ORG('namwon') + '/landxi/v3/gov-select/?view=org');
      await page.waitForSelector('form.bf');
      await page.fill('form.bf input[name=accent]', '#9FD3B5');                           // 흰 바탕에서 안 읽히는 색
      await expect(page.locator('form.bf .bf-check')).toHaveAttribute('data-bad', '1');
      await expect(page.locator('form.bf button[type=submit]')).toBeDisabled();
      await page.fill('form.bf input[name=accent]', '#1F5F8A');
      await page.fill('form.bf input[name=tint]', '#E8F0F6');
      await expect(page.locator('form.bf button[type=submit]')).toBeEnabled();
      await page.fill('form.bf textarea[name=headline]', '드론·항공 영상을 AI로 분석해\n남원시 현장조사를 돕습니다');
      await page.click('form.bf button[type=submit]');
      await expect(page.locator('form.bf .bf-ok')).toHaveText(/저장했습니다/);
      await page.goto(ORG('namwon') + '/');
      await page.waitForFunction(() => window.__govHome?.ready, null, { timeout: 30000 });
      await expect(page.locator('.gh-h1')).toContainText('남원시 현장조사를 돕습니다');
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ci').trim().toUpperCase())).toBe('#1F5F8A');
      expect(await page.locator('.gh-h1 b').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(31, 95, 138)');
    } finally { await restore(request, 'namwon', orig); }
  });

  test('LX 관리자 — 기관 서랍에서 같은 칸을 고친다 → 그 기관 메인에 반영', async ({ page, request }) => {
    test.setTimeout(150000);
    const orig = await (await request.get(`${API}/brand/gwangju-jeonnam`)).json();
    try {
      await frontDoor(page, ADMIN, 'lxadmin@lx.or.kr', 'admin');
      await page.goto(ADMIN + '/landxi/v3/ops-infra/#/tenants');
      await page.locator('.org[data-id="gwangju-jeonnam"] .brand-b').click();
      await page.waitForSelector('.brand-dr form.bf');
      await page.fill('.brand-dr input[name=contact]', '062-613-0000');
      await page.fill('.brand-dr input[name=line1]', '해안 쓰레기 결과를 시·군·구별로 확인합니다.');
      await page.click('.brand-dr button[type=submit]');
      await expect(page.locator('.brand-dr .bf-ok')).toHaveText(/저장했습니다/);
      await page.goto(ORG('gwangju-jeonnam') + '/');
      await page.waitForFunction(() => window.__govHome?.ready, null, { timeout: 30000 });
      await expect(page.locator('.gh-lead')).toContainText('해안 쓰레기 결과를 시·군·구별로 확인합니다.');
      await expect(page.locator('.gh-foot')).toContainText('062-613-0000');
    } finally { await restore(request, 'gwangju-jeonnam', orig); }
  });
});
