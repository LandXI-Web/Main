import { test, expect } from '@playwright/test';

// 대시보드 — LX 직원의 현황판(발주자 보드 B5-Dashboard-Data 의 판 + 토글 2 · 우 탭 패널).
// 2026-09-24 E0-6 — 공용 셸(mountShell)로 이관 · 직원 화면으로 · 관리 위젯은 운영 현황으로(E1-6).
// 조판 마스터   — design-canvas/v2/B5-Dashboard-Data.dc.html
// 행선지 표     — docs/superpowers/audit-0923/wave0/E0-6-result.md (원본 위젯 8종이 어디로 갔나)
const URL = 'proto/dashboard.html';

// 오프라인/외부 CDN(EOX 타일·폰트) 실패는 이 프로토의 정상 동작이다. 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|preloaded using link preload|fonts\.g|jsdelivr|eox|WebGL/i;
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}

/* ── 역할 픽스처 — wave0/00-COMMON.md 그대로 복사(Wave 0 동안 _roles.mjs import 금지) ── */
const HOME = { admin: 'admin-home.html', staff: 'ai-project.html', sales: 'ximap.html' };
/** LX 세션으로 화면을 연다. 세션은 첫 로드에서만 심는다(sessionStorage 가드). */
async function bootAs(page, url, role = 'staff', extra = {}) {
  await page.addInitScript(([r, ex]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return;
    sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.setItem('lx_logged_in', '1');
    localStorage.setItem('lx_role', r);
    localStorage.removeItem('lx_tenant_session');
    for (const [k, v] of Object.entries(ex)) (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v));
  }, [role, extra]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
async function boot(page, q = '') {
  await bootAs(page, URL + q, 'staff');
  await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(1100);
}

/** 직원이 못 가는 화면 — roles.js SCREEN_MENU 중 staff.menus 밖의 것. 이리로 가는 링크가 있으면 실패. */
const STAFF_DENIED = ['admin-home.html', 'admin-publish.html', 'ai-card.html', 'ai-card-edit.html', 'ai-publish-create.html',
  'produce.html', 'admin-notice.html', 'admin-users.html', 'admin-inquiry.html', 'admin-faq.html', 'admin-map.html'];
const fileOf = (href) => String(href).split('#')[0].split('?')[0].split('/').pop();

/** #main 자식 사이 · 마지막 자식과 푸터 사이 · 판/패널 아래의 빈 띠(px) — 법전 §6 은 80 초과 금지. */
const bands = (page) => page.evaluate(() => {
  const kids = [...document.querySelector('#main').children].map((e) => e.getBoundingClientRect());
  const out = []; for (let i = 1; i < kids.length; i++) out.push(kids[i].top - kids[i - 1].bottom);
  out.push(document.querySelector('#foot').getBoundingClientRect().top - kids[kids.length - 1].bottom);
  const split = document.querySelector('#split').getBoundingClientRect();
  for (const s of ['#plate-wrap', '#panel']) out.push(split.bottom - document.querySelector(s).getBoundingClientRect().bottom);
  return out.map(Math.round);
});

/** 우 패널 **안**의 빈 띠 — 보이는 tabpanel 마다 첫 자식 위 · 마지막 자식 아래 · 자식 사이(목록 행 포함, #s-lg 는 펼쳐 잰다).
 *  두 목록을 한 패널에 세운 조판(data-lay=both)이면 패널 위 · 목록 사이 · 패널 아래도 잰다. 법전 §6: 띠 ≤ 80 · 행 사이 ≤ 32. */
const paneBands = (page) => page.evaluate(() => {
  const R = (e) => e.getBoundingClientRect();
  const panel = document.querySelector('#panel'), lay = panel.dataset.lay;
  const panes = [...panel.querySelectorAll('[role=tabpanel]')].filter((p) => !p.hidden && R(p).height > 0);
  const out = { lay, panes: {}, edge: [] };
  for (const p of panes) {
    const kids = [...p.children].flatMap((k) => (k.id === 's-lg' ? [...k.children] : [k])).filter((k) => R(k).height > 0).map(R);
    const pr = R(p), gaps = [];
    for (let i = 1; i < kids.length; i++) gaps.push(Math.round(kids[i].top - kids[i - 1].bottom));
    out.panes[p.id] = { top: Math.round(kids[0].top - pr.top), bottom: Math.round(pr.bottom - kids[kids.length - 1].bottom), gaps };
  }
  if (lay === 'both') {
    const a = R(panes[0]), b = R(panes[panes.length - 1]), q = R(panel);
    out.edge = [a.top - q.top, b.top - a.bottom, q.bottom - b.bottom].map(Math.round);
  }
  return out;
});
function expectPaneBands(pb, tag) {
  const s = JSON.stringify(pb);
  for (const [id, m] of Object.entries(pb.panes)) {
    expect(m.top, `${tag} ${id} 위 ${s}`).toBeLessThanOrEqual(80);
    expect(m.bottom, `${tag} ${id} 아래 ${s}`).toBeLessThanOrEqual(80);
    expect(Math.max(0, ...m.gaps), `${tag} ${id} 행 사이 ${s}`).toBeLessThanOrEqual(32);
  }
  for (const g of pb.edge) expect(g, `${tag} 패널 가장자리 ${s}`).toBeLessThanOrEqual(80);
}

test('로그인 관문 — 세션이 없으면 화면이 한 프레임도 새지 않고 로그인으로 간다', async ({ page }) => {
  await page.goto(URL);
  await page.waitForURL(/login\.html/, { timeout: 10000 });
  expect(decodeURIComponent(page.url())).toContain('next=dashboard.html');
});

/* ── 셸 — 레일 · MY · 로그아웃은 공용 셸의 것 ─────────────────────────────── */

test('직원 레일 = roles.js staff.menus 7 + 로그아웃 — 관리 메뉴 0', async ({ page }) => {
  test.skip(true, 'F3 통합(2026-09-29) — 구 proto 레일은 v3 집으로 옮겼다 · 대체: v3-integration.spec');
  const errs = watch(page);
  await boot(page);
  const names = await page.locator('#rail .rail-i .rl').allInnerTexts();
  expect(names).toEqual(['대시보드', '데이터 관리', '프로젝트', '분석 서비스', '지도 서비스', '서비스 지원', 'MY', '로그아웃']);
  for (const k of ['publish', 'produce', 'admin', 'ops', 'usecase']) await expect(page.locator(`#rail [data-menu="${k}"]`)).toHaveCount(0);
  await expect(page.locator('#rail [data-menu="dashboard"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#rail [data-menu="media"]')).toHaveAttribute('href', 'dataset.html');
  await expect(page.locator('#rail [data-menu="project"]')).toHaveAttribute('href', 'ai-project.html');
  await expect(page.locator('#rail-mark')).toHaveAttribute('href', 'scrub/index.html');
  expect(await page.locator('#rail').count()).toBe(1);                                   // 자체 레일이 겹쳐 서지 않는다
  expect(await page.locator('#rail').getAttribute('data-shell-part')).toBe('');           // 셸이 그린 레일
  await page.locator('#rail-my-btn').hover();
  await expect(page.locator('#rail-my')).toBeVisible();
  expect(await page.locator('#rail-my').innerText()).toContain('마이 페이지');
  expect(errs, errs.join(' | ')).toEqual([]);
});

test('자체 레일 · 관문 · 로그아웃 코드 0 — 셸 것만 쓴다', async ({ page }) => {
  await boot(page);
  const src = await page.evaluate(async () => Promise.all(['dashboard.html', 'dashboard.js', 'db-data.js'].map(async (f) => (await fetch(f)).text())));
  for (const s of src) {
    expect(s).not.toMatch(/rail-top|NAV_FOOT|NAV_MY|removeItem\('lx_logged_in'\)/);
    expect(s).not.toMatch(/localStorage\.getItem\('lx_logged_in'\)/);                   // 인라인 관문 0(shell-gate.js 가 한다)
  }
  expect(src[0]).toContain('shell-gate.js');
  expect(src[1]).toMatch(/mountShell\(\{[^}]*active: 'dashboard'/);
});

test('레일 — 직원 메뉴가 실제 화면으로 가고 되돌려 보내지(denied) 않는다', async ({ page }) => {
  test.skip(true, 'F3 통합(2026-09-29) — 구 proto 레일은 v3 집으로 옮겼다 · 대체: v3-integration.spec');
  for (const [menu, file] of [['media', 'dataset.html'], ['project', 'ai-project.html'], ['analysis', 'analysis-ai.html'], ['map', 'xi/index.html'], ['support', 'notice.html']]) {
    await boot(page);
    await page.locator(`#rail [data-menu="${menu}"]`).click();
    await page.waitForURL(new RegExp(file.replace('.', '\\.')));
    expect(page.url(), menu).not.toContain('denied=');
    await page.evaluate(() => sessionStorage.removeItem('lx_e2e_boot'));
  }
});

test('로그아웃 — 셸 로그아웃이 세션 키를 전부 지우고 떠난다(C-09 · 자체 logout 0)', async ({ page }) => {
  await boot(page);
  await page.locator('#rail-foot > [data-action="logout"]').click();
  // 착지는 셸 signOut 이 정한다(E0-1: LX → login.html) — 대시보드는 착지를 모른다.
  await page.waitForURL((u) => !/dashboard\.html/.test(u.href), { timeout: 10000 });
  const left = await page.evaluate(() => ['lx_logged_in', 'lx_role', 'lx_tenant_session'].filter((k) => localStorage.getItem(k) !== null));
  expect(left).toEqual([]);
});

test('MY 플라이아웃 — 포커스로 열리고 Esc 로 닫힌다(D-10)', async ({ page }) => {
  await boot(page);
  await page.locator('#rail-my-btn').focus();
  await expect(page.locator('#rail-my')).toBeVisible();
  await expect(page.locator('#rail-my-btn')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#rail-my')).toBeHidden();
  await expect(page.locator('#rail-my-btn')).toHaveAttribute('aria-expanded', 'false');
  // 안으로 들어갔다가 Esc — MY 로 돌아오며 닫힌다
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#rail-my')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#rail-my')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('rail-my-btn');
});

test('Family Site · 전화번호 — 셸 푸터 한 벌, 링크는 실제로 열린다(D-11)', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#foot')).toHaveCount(1);
  await expect(page.locator('#foot')).toContainText('063-713-1213');
  await page.locator('#fam > summary').click();
  const hrefs = await page.locator('#fam a').evaluateAll((els) => els.map((e) => e.href));
  expect(hrefs.length).toBeGreaterThanOrEqual(3);
  for (const h of hrefs) expect((await page.request.get(h)).status(), h).toBe(200);
});

/* ── 본문 — 직원 화면 ──────────────────────────────────────────────────── */

test('제목 "대시보드" · 정보 KPI 3 · 백본 · 판 · 패널 2탭 — 관리 위젯은 화면에 없다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await expect(page).toHaveTitle('대시보드 — Land-XI');
  await expect(page.locator('#page-title')).toHaveText('대시보드');
  await expect(page.locator('#main')).toHaveAttribute('aria-label', '대시보드');
  await expect(page.locator('#mast-asof')).toHaveText('2026.06.08');
  await expect(page.locator('#mast .asof .tag')).toHaveText('시연');
  await expect(page.locator('#mast-notice')).toContainText('고위험 탐지 건 긴급 처리 안내');
  await expect(page.locator('#mast-notice')).toContainText('2026.04.15');
  await expect(page.locator('#mast-notice')).toHaveAttribute('href', 'notice.html?notice=8');
  await expect(page.locator('#b-kpi .k')).toHaveCount(3);
  const kpi = await page.locator('#b-kpi').innerText();
  for (const t of ['발행 분석 카드', '공개 7 · 비공개 1', '시연', 'AI 분석 결과', '남원 2 · 여수 2', '학습데이터 영상', '정사영상 10 · 피복 1']) expect(kpi, t).toContain(t);
  expect(await page.locator('#b-kpi .k .big').allInnerTexts()).toEqual(['8', '4', '11']);
  await expect(page.locator('#b-bb')).toContainText('XI-VFM v2.1');
  await expect(page.locator('#bb-sub')).toContainText('2026.03.12');
  await expect(page.locator('#bb-sub')).toContainText('14개');
  await expect(page.locator('#pane-proj .rk')).toHaveCount(5);
  await expect(page.locator('#pane-store rect')).toHaveCount(7);                          // 테두리 1 + 6분류
  // 화면에서 내린 것 — 승인 KPI 3 · EVIDENCE-PAIR · 관리 타일 4 · 7일 방문(콘티 위반)
  for (const s of ['#b-approve', '#ap-rows', '#b-admin', '#ad-rows', '.tiles', '#pane-visit', '#tab-visit', '#b1', '#b-bottom']) await expect(page.locator(s), s).toHaveCount(0);
  expect(await page.locator('#main [role=tab]').count()).toBe(4);                          // 판 토글 2 + 우 패널 2
  expect(errs, errs.join(' | ')).toEqual([]);
});

test('관리 문구 0 — 승인 · 가입 · 미답변 · 관리자 라는 말이 직원 화면에 없다', async ({ page }) => {
  await boot(page);
  const t = await page.locator('body').innerText();
  for (const s of ['LX 관리자', '관리자', '승인 대기', '승인 필요', '가입 승인', '가입 대기', '미답변', '답변 필요', '검토 필요', '관리 바로가기',
    '카드 발행 관리', '서비스 관리', '생산 관리', '사용자 관리', '사용자 이용 현황', '7일', '방문']) expect(t, s).not.toContain(s);
  expect(await page.locator('#page-sub').innerText()).not.toMatch(/승인|관리/);
});

test('불필요한 글자 없음 — 설명 문장이 없다, 출처·기준은 title 로', async ({ page }) => {
  await boot(page);
  const t = await page.locator('#main').innerText();
  for (const s of ['Data source', '출처 표기 —', '출처 ·', '용량 순', '1 px', '호버 = 내용', 'Sentinel-2', '상위 5개']) expect(t, s).not.toContain(s);
  expect(t).not.toMatch(/^출처/m);
  expect(await page.locator('#main .cap, #main .src, #tab-meta, #r-sub').count()).toBe(0);
  expect(await page.locator('#plate-wrap').getAttribute('title')).toMatch(/Sentinel-2.*기준 2026\.06\.08/);
  expect(await page.locator('#panel').getAttribute('title')).toMatch(/출처/);
});

test('중복 0 — 합계·잔여는 차트 안에 한 번, 모든 값에 단위, H1 룰 = "대시보드" 폭', async ({ page }) => {
  await boot(page);
  const once = (txt, s) => expect(txt.split(s).length - 1, s + ' 1회').toBe(1);
  let t = await page.locator('#right').innerText();
  once(t, '1,326'); expect(t).not.toContain('Top5');
  for (const v of await page.locator('#pane-proj .rk .val').allInnerTexts()) expect(v).toMatch(/^\d+\s*GB$/);
  expect(await page.locator('#pane-proj .rk-sum .val').innerText()).toMatch(/1,326\s*GB/);
  await page.locator('#tab-store').click(); await page.waitForTimeout(1100);
  t = await page.locator('#right').innerText();
  once(t, '44.5'); once(t, '139.5'); once(t, '184');
  expect(await page.locator('#s-lg .li').count()).toBe(7);
  for (const v of await page.locator('#s-lg .li').allInnerTexts()) expect(v).toMatch(/[\d.]+\s*TB$/);
  expect(await page.locator('#pane-store .pane-big').innerText().then((x) => x.replace(/\s+/g, ' '))).toBe('44.5 TB / 184 TB 분류 배분 시연');
  const rule = await page.evaluate(() => { const r = document.querySelector('#page-title .rule'); const cs = getComputedStyle(r); return { text: r.textContent, color: cs.borderBottomColor, w: cs.borderBottomWidth }; });
  expect(rule).toEqual({ text: '대시보드', color: 'rgb(0, 109, 247)', w: '4px' });
});

test('판 히트 램프 — 건수가 다르면 채움이 다르고(4단 램프), 범례는 건수 행만', async ({ page }) => {
  await boot(page);
  const fills = async () => page.evaluate(() => { const m = new Map(); for (const c of document.querySelectorAll('#cells .cell[data-g]')) if (/^\d$/.test(c.dataset.g)) m.set(c.dataset.g, getComputedStyle(c).backgroundColor); return [...m.entries()]; });
  let f = await fills();
  expect(new Set(f.map(([, v]) => v)).size).toBe(f.length);
  expect(f.length).toBeGreaterThanOrEqual(2);
  const css = await page.evaluate(async () => (await (await fetch('dashboard.css')).text()));
  for (const g of ['1', '2', '3', '4']) expect(css).toMatch(new RegExp(`\\.cell\\[data-g="${g}"\\][^{]*\\{[^}]*background:rgba\\(`));
  expect(new Set([...css.matchAll(/data-g="(\d)"\][^{]*\{[^}]*background:(rgba\([^)]*\))/g)].map((m) => m[2])).size).toBe(8);   // 청록 4 + 파랑 4
  let lg = await page.locator('#legend').innerText();
  expect(lg).not.toMatch(/그리드|학습데이터만|조사 예정|영상 미등록/);
  expect(lg.split('\n').filter((l) => l.trim()).every((l) => /^(결과 \d건( 이상)?|\d셀)$/.test(l.trim()))).toBe(true);
  await page.locator('#seg-train').click(); await page.waitForTimeout(300);
  f = await fills(); expect(new Set(f.map(([, v]) => v)).size).toBe(f.length); expect(f.length).toBeGreaterThanOrEqual(3);
  lg = await page.locator('#legend').innerText();
  expect(lg.split('\n').filter((l) => l.trim()).every((l) => /^(시점 \d( 이상)?|\d셀)$/.test(l.trim()))).toBe(true);
});

test('판 — 셀은 실좌표에서 투영된다: 남원 127.25–127.50 E · 35.25–35.50 N = 결과 2건, 여수 2건, 제주 = 학습데이터만', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#grid line')).not.toHaveCount(0);
  const nw = page.locator('#cells .cell[data-key="127.25,35.25"]');
  await expect(nw).toHaveAttribute('data-g', '2');
  expect(await nw.getAttribute('aria-label')).toContain('남원 127.25–127.50 E · 35.25–35.50 N — AI 분석 결과 2건');
  const ok = await page.evaluate(() => {
    const el = document.querySelector('#cells .cell[data-key="127.25,35.25"]');
    const xs = [...document.querySelectorAll('#grid line')].filter((l) => l.getAttribute('y1') === '0').map((l) => +l.getAttribute('x1'));
    const left = parseFloat(el.style.left), right = left + parseFloat(el.style.width);
    return xs.some((x) => Math.abs(x - left) < 0.6) && xs.some((x) => Math.abs(x - right) < 0.6);
  });
  expect(ok).toBe(true);
  expect(await page.locator('#cells .cell[data-g="2"]').count()).toBe(2);                 // 남원 · 여수
  expect(await page.locator('#cells .cell[data-g="1"]').count()).toBe(1);                 // 남원 변화지수(비지도)
  expect(await page.locator('#cells .cell[data-g="train"]').count()).toBeGreaterThanOrEqual(3);
  expect(await page.locator('#cells .cell[data-g="train"]').first().getAttribute('aria-label')).toMatch(/학습데이터만/);
});

test('셀 호버 — 콜아웃이 실값(필지 · 동 병기)과 행선지를 말하고, 브래킷이 서며, Esc 로 내린다', async ({ page }) => {
  await boot(page);
  const nw = page.locator('#cells .cell[data-key="127.25,35.25"]');
  await nw.hover(); await page.waitForTimeout(300);
  await expect(page.locator('#callout')).toBeVisible();
  const c = await page.locator('#callout').innerText();
  for (const t of ['남원', '127.25–127.50 E', '35.25–35.50 N', 'AI 분석 결과 2건', '농지이용 2,098필지', '비닐하우스 1,674필지 · 9,664동', 'XI맵에서 열기 ›']) expect(c, t).toContain(t);
  expect(await nw.locator('.bk').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))).toEqual(['1', '1', '1', '1']);
  await page.locator('#cells .cell[data-g="1"]').hover(); await page.waitForTimeout(300);
  expect(await page.locator('#callout').innerText()).toContain('변화지수 456폴리곤 · 비지도');
  await page.mouse.move(700, 150); await page.waitForTimeout(300);
  await expect(page.locator('#callout')).toBeHidden();
  await nw.focus(); await page.waitForTimeout(200);
  await expect(page.locator('#callout')).toBeVisible();
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await expect(page.locator('#callout')).toBeHidden();
});

test('판 토글 — 학습데이터 모드는 정사영상 시점 수로 칠하고 콜아웃 · 행선지도 바뀐다', async ({ page }) => {
  await boot(page);
  await page.locator('#seg-train').click(); await page.waitForTimeout(300);
  await expect(page.locator('#plate-wrap')).toHaveAttribute('data-mode', 'train');
  await expect(page.locator('#seg-train')).toHaveAttribute('aria-selected', 'true');
  const aoi = page.locator('#cells .cell[data-key="127.25,35.50"]');
  await expect(aoi).toHaveAttribute('data-g', '4');
  await expect(aoi).toHaveAttribute('href', 'dataset.html?tab=archive');
  await aoi.hover(); await page.waitForTimeout(300);
  const c = await page.locator('#callout').innerText();
  expect(c).toContain('학습데이터'); expect(c).toContain('2025-06 · GSD 1.69 cm'); expect(c).toContain('데이터 관리에서 열기 ›');
  expect(await page.locator('#legend').innerText()).toContain('시점 4 이상');
  await page.locator('#seg-res').click();
  await expect(page.locator('#cells .cell[data-key="127.25,35.25"]')).toHaveAttribute('data-g', '2');
});

test('셀 클릭 → XI맵 ?result=<결과 id> (E0-5 수신) — ?cell= 은 더 보내지 않는다', async ({ page }) => {
  await boot(page);
  const hrefs = await page.locator('#cells .cell').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs.some((h) => /cell=|mode=res/.test(h))).toBe(false);
  expect(hrefs.filter((h) => h.startsWith('ximap.html?result=')).length).toBeGreaterThanOrEqual(3);   // 남원 · 여수 · 변화지수
  await expect(page.locator('#cells .cell[data-g="1"]')).toHaveAttribute('href', /^ximap\.html\?result=namwon-change-/);
  await page.locator('#cells .cell[data-key="127.25,35.25"]').click();
  await page.waitForURL(/ximap\.html/);
  expect(decodeURIComponent(page.url())).toMatch(/ximap\.html\?(result=namwon-farmland-2025|.*on=namwon-farmland-2025)/);
  expect(page.url()).not.toContain('denied=');
});

test('링크 전수 — 제자리 0 · 직원 금지 화면 0 · 가서 되돌려 보내지(denied) 않는다(D-3)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
    .filter((a) => !a.closest('#fam'))                                      // 패밀리 사이트는 위 테스트가 200 으로 본다
    .map((a) => ({ href: a.getAttribute('href'), abs: a.href, cur: a.getAttribute('aria-current'), id: a.id, cls: a.className })));
  expect(links.length).toBeGreaterThan(15);
  for (const l of links) {
    expect(l.href, `${l.id || l.cls} 빈 링크`).not.toMatch(/^#?$/);
    if (fileOf(l.href) === 'dashboard.html') expect(l.cur, `${l.href} 제자리 링크`).toBe('page');   // 레일의 현 위치 표시만
    expect(STAFF_DENIED, `${l.href} 직원 금지 화면`).not.toContain(fileOf(l.href));
    expect(l.href, 'skip 외 해시 링크').toMatch(/^(?!#)|^#main$/);
  }
  const uniq = [...new Set(links.map((l) => l.abs).filter((h) => !/#main$/.test(h) && fileOf(h) !== 'dashboard.html'))];
  const bad = [];
  for (const h of uniq) {
    const r = await page.request.get(h); if (r.status() !== 200) { bad.push(`${h} ${r.status()}`); continue; }
    await page.evaluate(() => sessionStorage.removeItem('lx_e2e_boot'));
    await page.goto(h, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    if (/denied=|login\.html/.test(page.url())) bad.push(`${h} → ${page.url()}`);
  }
  expect(bad, bad.join('\n')).toEqual([]);
});

/* ── 우 탭 패널 ───────────────────────────────────────────────────────── */

test('탭 패널 — 탭 2가 용량 · 스토리지를 전환하고, 키보드·localStorage·카운트업·전체 보기가 산다', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#tab-proj')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pane-proj .rk.on .val b')).toHaveText('412');
  await expect(page.locator('#pane-proj .rk.on .bar i')).toHaveCSS('background-color', 'rgb(0, 109, 247)');
  await expect(page.locator('#b10-more')).toHaveAttribute('href', 'ai-project.html');
  await page.locator('#tab-proj').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-store')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pane-store')).toBeVisible(); await expect(page.locator('#pane-proj')).toBeHidden();
  const early = await page.locator('#pane-store .pane-big .big').innerText();
  await page.waitForTimeout(1100);
  await expect(page.locator('#pane-store .pane-big .big')).toHaveText('44.5');
  expect(+early).toBeLessThanOrEqual(44.5);
  expect(await page.locator('#pane-store').innerText()).toMatch(/정사영상\s*18\.2\s*TB/);
  await expect(page.locator('#b10-more')).toHaveAttribute('href', 'dataset.html?tab=archive');
  expect(await page.evaluate(() => localStorage.getItem('lx_dash_tab'))).toBe('store');
  await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready');
  await expect(page.locator('#tab-store')).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('#tabs [role=tab][tabindex="0"]').count()).toBe(1);
  await page.keyboard.press('Tab');                                                         // 넘어가지 않는다 — 오류 없음 확인용
});

test('딥링크 ?tab=store — 탭을 연다(승인 ?status= · ?open= 은 운영 현황의 것이라 받지 않는다)', async ({ page }) => {
  await boot(page, '?tab=store');
  await expect(page.locator('#tab-store')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.documentElement.dataset.deep || '')).toBe('');
});

/* ── 도착 · 반응형 · 모션 ─────────────────────────────────────────────── */

test('도착 — KPI 숫자가 1000ms 카운트업으로 도착한다', async ({ page }) => {
  await bootAs(page, URL, 'staff');
  await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready');
  const early = await page.locator('#b-kpi .k .big').last().innerText();
  await page.waitForTimeout(1300);
  await expect(page.locator('#b-kpi .k .big').last()).toHaveText('11');
  expect(+early.replace(/,/g, '')).toBeLessThanOrEqual(11);
});

test('반응형 — 1280 가로 넘침 0, 1100 이하 판·패널 세로, 1100px 에서 H1 과 KPI 가 겹치지 않는다(D-6)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  for (const w of [1100, 1000]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(400);
    const [l, r] = await Promise.all(['#left', '#right'].map((s) => page.locator(s).evaluate((e) => e.getBoundingClientRect().top)));
    expect(r, `${w} 세로`).toBeGreaterThan(l + 200);
    const h1 = await page.locator('#page-head').boundingBox(), kpi = await page.locator('#b-kpi').boundingBox();
    expect(kpi.y, `${w} H1/KPI 겹침`).toBeGreaterThanOrEqual(h1.y + h1.height);
    const t = await page.locator('#page-title').boundingBox(), k1 = await page.locator('#b-kpi .k').first().boundingBox();
    expect(k1.y).toBeGreaterThanOrEqual(t.y + t.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), `${w} 넘침`).toBe(false);
  }
  const ok = await page.evaluate(() => {
    const el = document.querySelector('#cells .cell[data-key="127.25,35.25"]');
    const xs = [...document.querySelectorAll('#grid line')].filter((l) => l.getAttribute('y1') === '0').map((l) => +l.getAttribute('x1'));
    return xs.some((x) => Math.abs(x - parseFloat(el.style.left)) < 0.6);
  });
  expect(ok).toBe(true);
});

test('390 — 가로 넘침 0, KPI 는 한 줄에 하나', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const xs = await page.locator('#b-kpi .k').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(xs).size).toBe(1);
});

test('접근성·모션 — 감소 모션에서 숫자가 바로 도착하고 막대가 서 있다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  await expect(page.locator('#b-kpi .k .big').first()).toHaveText('8');
  expect(await page.locator('#pane-proj .rk.on .bar i').evaluate((e) => getComputedStyle(e).transform)).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
});

const WARN = 'rgb(209, 53, 43)', BLUE = 'rgb(0, 109, 247)';

test('색 역할 — 정보 = 파랑, 조치(warn) 숫자 0, 앰버 0, 라운드·그림자·그라디언트 0', async ({ page }) => {
  await boot(page);
  expect(await page.locator('#b-kpi .k .kv b').evaluateAll((els) => els.map((e) => getComputedStyle(e).color))).toEqual([BLUE, BLUE, BLUE]);
  const warn = await page.evaluate((w) => [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).color === w && e.textContent.trim()).map((e) => e.tagName + ':' + e.textContent.trim().slice(0, 20)), WARN);
  expect(warn).toEqual([]);
  await expect(page.locator('#tabs [aria-selected=true]')).toHaveCSS('color', BLUE);
  await expect(page.locator('#tabs [aria-selected=true]')).toHaveCSS('background-color', 'rgb(232, 241, 255)');
  await expect(page.locator('#pane-proj .rk.on .bar i')).toHaveCSS('background-color', BLUE);
  await expect(page.locator('#b-bb svg')).toHaveCSS('color', BLUE);
  await page.locator('#tab-store').click(); await page.waitForTimeout(300);
  const fills = await page.locator('#s-bar rect').evaluateAll((els) => els.map((e) => e.getAttribute('fill')));
  expect(fills.slice(1)).toEqual(['#006DF7', '#010102', '#686868', '#0FA9A0', '#CCCCCC', '#CCCCCC']);
  const css = await page.evaluate(async () => (await (await fetch('dashboard.css')).text()));
  expect(/FFB633/i.test(css)).toBe(false);
  expect(/linear-gradient|box-shadow|border-radius\s*:\s*[1-9]|backdrop-filter/.test(css)).toBe(false);
  expect(await page.evaluate(([blue]) => [...document.querySelectorAll('button, a')].filter((e) => getComputedStyle(e).backgroundColor === blue).length, [BLUE])).toBe(0);
  // 바닥 14px — 본문 글자
  const small = await page.evaluate(() => [...document.querySelectorAll('#main *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => e.tagName + ':' + e.textContent.trim().slice(0, 12)));
  expect(small).toEqual([]);
});

// 1920×1017 = 1920×1080 모니터의 Chrome 창(실사용 최다) · 1440×1000 — 행이 상한 58px 에 닿는 구간(regate E0-6). 1101×640 = 한 화면 조판의 하한.
for (const [w, h] of [[1440, 900], [1280, 720], [1920, 1200], [1920, 1017], [1440, 1000], [1101, 640]]) {
  test(`한 화면 — ${w}×${h}: 넘치지 않고, 판 = 패널, 빈 띠 ≤ 80px, 잘리는 목록 0`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const pane = document.querySelector('#pane-proj');
      return { plate: r('#plate-wrap').height, panel: r('#panel').height, plateTop: r('#plate-wrap').top, panelTop: r('#panel').top,
        over: document.documentElement.scrollHeight - innerHeight, listClip: pane.scrollHeight - pane.clientHeight,
        footBottom: Math.round(r('#foot').bottom + scrollY), sh: document.documentElement.scrollHeight };
    });
    expect(m.over).toBeLessThanOrEqual(4);
    expect(m.listClip).toBeLessThanOrEqual(1);
    expect(Math.abs(m.plate - m.panel)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.plateTop - m.panelTop)).toBeLessThanOrEqual(1);
    expect(m.plate).toBeGreaterThanOrEqual(h >= 800 ? 254 : 180);
    expect(m.footBottom).toBe(m.sh);
    const b = await bands(page);
    expect(Math.max(...b), `빈 띠 ${b.join(',')}`).toBeLessThanOrEqual(80);
    // 패널 안 — 두 탭 모두(두 목록 한 패널 조판이면 둘 다 한 번에 보인다)
    const lay = await page.locator('#panel').getAttribute('data-lay');
    if (h >= 1100) expect(lay, '높은 화면 = 두 목록 한 패널').toBe('both');
    for (const t of ['proj', 'store']) {
      if (lay === 'tabs') { await page.locator(`#tab-${t}`).click(); await page.waitForTimeout(250); }
      const pb = await paneBands(page);
      if (lay === 'both') expect(Object.keys(pb.panes)).toEqual(['pane-proj', 'pane-store']);
      else expect(Object.keys(pb.panes)).toEqual([`pane-${t}`]);
      expectPaneBands(pb, `${w}×${h} ${t}`);
      for (const id of ['#pane-proj', '#pane-store']) {
        const clip = await page.locator(id).evaluate((e) => (e.hidden ? 0 : e.scrollHeight - e.clientHeight));
        expect(clip, `${id} 잘림`).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(4);
    }
  });
}

/* ── regate E0-6 — 행 상한 구간은 늘린 행이 아니라 실값(용량 비중)으로 채운다 · 탭 호버는 물리 반응 ── */
test('용량 비중 띠 — 1920×1017 탭 조판에서 5건의 몫(gb ÷ 합계)이 목록 위에 서고, 두 목록 조판에서는 내린다', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1017 });
  await boot(page);
  await expect(page.locator('#panel')).toHaveAttribute('data-lay', 'tabs');
  await expect(page.locator('#pane-proj .p-share')).toBeVisible();
  // 기대값은 db-data.js PROJECTS 에서 직접 계산 — 화면이 지어낸 숫자가 아니다.
  const want = await page.evaluate(async () => {
    const { PROJECTS } = await import('./db-data.js');
    const sum = PROJECTS.reduce((a, p) => a + p.gb, 0);
    return PROJECTS.map((p, i) => `${String(i + 1).padStart(2, '0')} ${Math.round((p.gb / sum) * 100)}%`);
  });
  expect(await page.locator('#pane-proj .p-pct span').allInnerTexts()).toEqual(want);
  expect(await page.locator('#pane-proj .p-bar rect').count()).toBe(5);
  await expect(page.locator('#pane-proj .p-pct span.on')).toHaveCSS('color', 'rgb(0, 109, 247)');
  await page.setViewportSize({ width: 1920, height: 1200 }); await page.waitForTimeout(400);
  await expect(page.locator('#panel')).toHaveAttribute('data-lay', 'both');
  await expect(page.locator('#pane-proj .p-share')).toBeHidden();
});

/* regate E0-6 — 좁은 패널(1101–1300 폭)에서도 비중 띠 라벨 5개가 잘리지 않는다('05 11' 처럼 % 가 사라지지 않는다) */
for (const [w, h] of [[1920, 1017], [1440, 900], [1280, 800], [1101, 1000]]) {
  test(`용량 비중 띠 라벨 — ${w}×${h} 5칸 전부 잘림 0 · '0N NN%' 온전`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    await expect(page.locator('#panel')).toHaveAttribute('data-lay', 'tabs');
    await expect(page.locator('#pane-proj .p-share')).toBeVisible();
    const cells = await page.locator('#pane-proj .p-pct span').evaluateAll((els) => els.map((e) => ({
      t: e.innerText, sw: e.scrollWidth, cw: e.clientWidth, r: e.getBoundingClientRect().right,
    })));
    expect(cells).toHaveLength(5);
    const row = await page.locator('#pane-proj .p-pct').evaluate((e) => e.getBoundingClientRect().right);
    for (const c of cells) {
      expect(c.t, `${w}×${h} 라벨`).toMatch(/^\d\d \d+%$/);
      expect(c.sw, `${w}×${h} '${c.t}' 잘림`).toBeLessThanOrEqual(Math.ceil(c.cw) + 1);
    }
    expect(cells[4].r, `${w}×${h} 마지막 칸이 띠 밖으로`).toBeLessThanOrEqual(row + 1);
  });
}

test('낮은 행 — 두 목록 조판 --rh < 34 에서 1위 값 글자는 20px(26px 숫자가 28px 행에 끼지 않는다)', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 1050 });
  await boot(page);
  await expect(page.locator('#panel')).toHaveAttribute('data-lay', 'both');
  const m = await page.evaluate(() => {
    const p = document.querySelector('#pane-proj'); const rh = parseFloat(getComputedStyle(p).getPropertyValue('--rh'));
    const b = p.querySelector('.rk.on .val b'); const rows = [...p.querySelectorAll('.rk .val b')].map((e) => e.getBoundingClientRect());
    let minGap = Infinity; for (let i = 1; i < rows.length; i++) minGap = Math.min(minGap, rows[i].top - rows[i - 1].bottom);
    return { rh, fs: parseFloat(getComputedStyle(b).fontSize), minGap, clip: p.scrollHeight - p.clientHeight };
  });
  expect(m.rh).toBeLessThan(34);
  expect(m.fs).toBe(20);
  expect(m.minGap, '값 글자끼리 맞닿지 않는다').toBeGreaterThanOrEqual(4);
  expect(m.clip).toBeLessThanOrEqual(1);
});

test('탭 호버 = 물리 반응 — 우 패널 탭 · 판 토글 모두 밑줄이 180ms 로 쓸려 선다(색만 바꾸는 호버 0)', async ({ page }) => {
  await boot(page);
  const under = (sel) => page.locator(sel).evaluate((e) => {
    const cs = getComputedStyle(e, '::after'); return { t: cs.transform, dur: cs.transitionDuration, prop: cs.transitionProperty, h: cs.height };
  });
  for (const sel of ['#tab-store', '#seg-train']) {
    const before = await under(sel);
    expect(before.t, `${sel} 평시 밑줄 0`).toMatch(/matrix\(0, 0, 0, 1|scaleX\(0\)/);
    expect(before.prop).toContain('transform');
    expect(before.dur).toBe('0.18s');
    expect(before.h).toBe('2px');
    await page.locator(sel).hover(); await page.waitForTimeout(300);
    expect((await under(sel)).t, `${sel} 호버 밑줄`).toBe('matrix(1, 0, 0, 1, 0, 0)');
    await page.mouse.move(5, 5); await page.waitForTimeout(300);
  }
  // 선택 상태 색 규칙은 그대로
  await expect(page.locator('#tab-proj')).toHaveCSS('color', 'rgb(0, 109, 247)');
  await expect(page.locator('#seg-res')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});
