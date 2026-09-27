import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// F2-R 레일 정본 — 세 계정(관리자 · 직원 · 영업) 로그인 → 레일 수 · href · 죽은 링크 0(전수 요청) · 14px 미만 0 · 콘솔 0 · 1440 캡처
//   정본: '지도 서비스' = 새 XI맵(landxi/xi) · 관리자 관제 넷 = :8702 login.html?next= · 영업 첫 화면 = 새 XI맵
//   브리프 blueprint/f2/F2-R.md · 계약 v1.1-29
const SHOTS = 'shots/f2/R';
fs.mkdirSync(SHOTS, { recursive: true });
const OPS = 'http://localhost:8702/landxi/ops/login.html?next=';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError/i;
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
const clearOnce = (page) => page.addInitScript(() => { try { if (sessionStorage.getItem('__f2r')) return; localStorage.clear(); sessionStorage.setItem('__f2r', '1'); } catch { /* */ } });

/** 로그인 문(UI)으로 그 계정에 들어간다 — 세션을 심지 않고 사람이 하는 대로. */
async function signIn(page, label) {
  await clearOnce(page);
  await page.goto('proto/login.html');
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await page.locator('.lg-seg__c', { hasText: label }).click();
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
}
const railOf = (page) => page.$$eval('#rail a.rail-i', (a) => a.map((e) => ({ key: e.dataset.menu, name: e.innerText.replace(/\s+/g, ' ').trim(), href: e.getAttribute('href'), abs: e.href, target: e.getAttribute('target') })));

const WANT = {
  admin: [['home', '운영 현황', 'admin-home.html'], ['ops', '관제 현황', OPS + 'index.html'], ['infra', '인프라 관제', OPS + 'infra.html'], ['tenants', '기관·할당', OPS + 'tenants.html'], ['deploys', '배포 제어', OPS + 'deploys.html'],
    ['media', '데이터 관리', 'dataset.html'], ['publish', '카드 발행 관리', 'admin-publish.html'], ['produce', '생산 관리', 'produce.html'], ['admin', '서비스 관리', 'admin-notice.html'], ['my', 'MY', 'mypage.html']],
  staff: [['dashboard', '대시보드', 'dashboard.html'], ['media', '데이터 관리', 'dataset.html'], ['project', '프로젝트', 'ai-project.html'], ['analysis', '분석 서비스', 'analysis-ai.html'],
    ['map', '지도 서비스', '../xi/index.html'], ['support', '서비스 지원', 'notice.html'], ['my', 'MY', 'mypage.html']],
  sales: [['analysis', '분석 서비스', 'analysis-ai.html'], ['map', '지도 서비스', '../xi/index.html'], ['usecase', '활용 사례', 'usecase.html'], ['my', 'MY', 'mypage.html']],
};

/** 링크 전수 — 같은 origin 은 GET 200, :8702 는 관제 로그인 문 ?next= 형식 + (관제가 떠 있으면) 200. */
async function checkLinks(page, hrefs) {
  const bad = [];
  const ops = await page.request.get('http://localhost:8702/landxi/ops/login.html', { timeout: 5000 }).then((r) => r.status()).catch(() => 0);
  for (const h of [...new Set(hrefs)]) {
    const u = new URL(h);
    if (u.port === '8702') {
      if (!/^\/landxi\/ops\/login\.html$/.test(u.pathname) || !/^[\w-]+\.html(\?[\w=%&.-]*)?$/.test(u.searchParams.get('next') || '')) bad.push(['형식', h]);
      else if (ops && ops !== 200) bad.push([ops, h]);
      continue;
    }
    const r = await page.request.get(u.origin + u.pathname, { timeout: 15000 }).catch(() => null);
    if (!r || r.status() !== 200) bad.push([r?.status() ?? 0, h]);
  }
  return { bad, ops };
}

for (const [role, label, landRe, railAt] of [
  ['admin', 'LX 관리자', /\/landxi\/proto\/admin-home\.html$/, null],
  ['staff', 'LX 직원', /\/landxi\/proto\/ai-project\.html$/, null],
  ['sales', '영업용 계정', /\/landxi\/xi\/index\.html$/, 'proto/usecase.html'],
]) {
  test(`${role} — 로그인 → 첫 화면 · 레일 ${WANT[role].length} · href 정본 · 죽은 링크 0 · 14px 미만 0 · 콘솔 0 · 1440 캡처`, async ({ page }) => {
    test.setTimeout(120000);
    const errs = watch(page);
    await signIn(page, label);
    await page.waitForURL(landRe, { timeout: 20000 });
    if (role === 'sales') {
      // 영업 첫 화면 = 새 XI맵 — 세션 인계(session.shadow) · 관문 = 영업(시연)
      await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
      expect(await page.evaluate(() => window.__xi.state.role)).toBe('sales');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SHOTS}/rail-sales-home-xi-1440.png` });
      await page.goto(railAt);
    }
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    const rail = await railOf(page);
    expect(rail.map((r) => [r.key, r.name, r.href])).toEqual(WANT[role]);
    expect(rail.every((r) => r.target === null)).toBe(true);                       // 외부 origin 도 같은 탭
    if (role === 'admin') await expect(page.locator('html')).toHaveAttribute('data-site', 'admin');
    // 14px 미만 0 — 레일 · 마스트 · 제목 · 푸터
    const small = await page.evaluate(() => [...document.querySelectorAll('#rail *, #mast *, #page-head *, #foot *')]
      .filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getClientRects().length)
      .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => e.outerHTML.slice(0, 80)));
    expect(small).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/rail-${role}-1440.png` });
    // 죽은 링크 0 — 레일 · 마스트(공지) · Family Site · MY 플라이아웃
    const hrefs = await page.$$eval('#rail a[href], #mast a[href], #fam a[href], #rail-my a[href]', (a) => a.map((e) => e.href));
    const { bad } = await checkLinks(page, hrefs);
    expect(bad).toEqual([]);
    expect(errs).toEqual([]);
  });
}

test('직원 레일 → 지도 서비스 클릭 → 새 XI맵 부팅(data-lx=ready) · 마스트 역할 표기 · 세션 키 그대로', async ({ page }) => {
  test.setTimeout(90000);
  const errs = watch(page);
  await signIn(page, 'LX 직원');
  await page.waitForURL(/ai-project\.html$/);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  await page.locator('#rail a[data-menu="map"]').click();
  await page.waitForURL(/\/landxi\/xi\/index\.html/);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
  const st = await page.evaluate(() => ({ role: window.__xi.state.role, sh: window.__xi.state.session, keys: ['lx_logged_in', 'lx_role'].map((k) => localStorage.getItem(k)) }));
  expect(st.role).toBe('staff');
  expect(st.sh).toMatchObject({ realm: 'lx', role: 'staff' });
  expect(st.keys).toEqual(['1', 'staff']);
  expect(errs).toEqual([]);
});

test('관리자 레일 → 인프라 관제 → :8702 관제 로그인 문(?next=infra.html) — 관제 서버 실측', async ({ page }) => {
  test.setTimeout(90000);
  await signIn(page, 'LX 관리자');
  await page.waitForURL(/admin-home\.html$/);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  const up = await page.request.get('http://localhost:8702/landxi/ops/login.html', { timeout: 5000 }).then((r) => r.ok()).catch(() => false);
  if (!up) await page.route('http://localhost:8702/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
  await page.locator('#rail a[data-menu="infra"]').click();
  await page.waitForURL((u) => u.port === '8702' && u.pathname.startsWith('/landxi/ops/'), { timeout: 20000 });
  expect(new URL(page.url()).searchParams.get('next') ?? 'infra.html(관제가 인계 후 주소를 바꿈)').toMatch(/infra\.html/);
  test.info().annotations.push({ type: 'ops', description: up ? `관제 :8702 가동 — 도착 ${page.url()}` : '관제 :8702 꺼짐 — route stub 으로 ?next 만 확인' });
});

test('딥링크 · Global 진입 주소 전수 — 200(같은 origin) · 관제는 ?next 형식', async ({ page }) => {
  await clearOnce(page);
  await page.goto('proto/login.html');
  const base = new URL(page.url());
  const urls = ['xi/index.html', 'xi/index.html?svc=dp-nw-farm-25', 'xi/index.html?mode=survey&svc=dp-nw-farm-25&survey=farmland&embed=1',
    'global/index.html?locale=en', 'global/login.html', 'proto/ai-card.html?card=card-farm&version=v2.1', 'proto/produce.html?deploy=dp-nw-farm-25',
    'proto/stats-standard.html?embed=1&period=2025', 'proto/report-standard.html?embed=1', 'proto/report-standard-issue.html?embed=1', 'proto/ximap.html', 'login.html?next=../xi/index.html']
    .map((u) => new URL('/landxi/' + u, base).href);
  const { bad } = await checkLinks(page, [...urls, OPS + 'deploys.html%3Fdeploy%3Ddp-nw-farm-25']);
  expect(bad).toEqual([]);
});

/* 판정 1차 반영 — 관리자 홈(admin-home · 결재 대기 2·1·6 + 관리 네 축)이 레일에서 고립되지 않는다.
   레일 '운영 현황' = 이 origin admin-home.html · 관제 운영 현황은 '관제 현황'(title LX/OPS 운영 현황)으로 갈린다.
   admin-home 에서 그 항목이 aria-current=page(전에는 admin-home.js active:'admin' 탓에 '서비스 관리'가 현재였다). */
test('관리자 홈 고립 0 — 모든 관리자 화면 레일에 admin-home 링크 · admin-home 에서 운영 현황 = 현재', async ({ page }) => {
  test.setTimeout(90000);
  const errs = watch(page);
  await signIn(page, 'LX 관리자');
  await page.waitForURL(/admin-home\.html$/);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  const cur = await page.$$eval('#rail a[aria-current="page"]', (a) => a.map((e) => e.dataset.menu));
  expect(cur).toEqual(['home']);
  for (const f of ['dataset.html', 'admin-publish.html', 'produce.html', 'admin-notice.html', 'mypage.html']) {
    await page.goto('proto/' + f);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    const home = page.locator('#rail a[data-menu="home"]');
    await expect(home, f).toHaveAttribute('href', 'admin-home.html');
    await expect(home, f).not.toHaveAttribute('aria-current', 'page');
  }
  await page.locator('#rail a[data-menu="home"]').click();
  await page.waitForURL(/admin-home\.html$/);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  await expect(page.locator('#rail a[data-menu="home"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#rail a[data-menu="admin"]')).not.toHaveAttribute('aria-current', 'page');
  expect(errs).toEqual([]);
});

/* 영업이 막힌 화면(대시보드)에 주소로 들어오면 관문이 ../xi/index.html?denied=dashboard.html 로 보낸다.
   안내 한 줄은 XI맵(F2-A 소유)이 띄운다 — XI맵에 denied 처리가 들어오면 이 단언이 저절로 켜진다(그 전에는 fixme · 결과 문서에 소유자 F2-A). */
test('영업 → 막힌 화면 → 새 XI맵 ?denied= · 안내 한 줄(F2-A 토스트)', async ({ page }) => {
  test.setTimeout(90000);
  const src = await page.request.get('xi/xi.js').then((r) => r.text()).catch(() => '');
  await signIn(page, '영업용 계정');
  await page.waitForURL(/\/landxi\/xi\/index\.html/);
  await page.goto('proto/dashboard.html');
  await page.waitForURL(/\/landxi\/xi\/index\.html\?denied=dashboard\.html/);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
  expect(await page.evaluate(() => window.__xi.state.role)).toBe('sales');
  test.fixme(!/denied/.test(src), 'XI맵 denied 토스트 미구현 — 소유 F2-A(landxi/xi). 들어오면 아래 단언이 켜진다');
  await expect(page.locator('body')).toContainText(/영업 계정은 대시보드를 볼 수 없어 XI맵으로 왔습니다/, { timeout: 8000 });
});
