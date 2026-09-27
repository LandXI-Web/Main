import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// F2-R ?embed=1 — 통계 · 보고서(발급 내역 · 발급 요청)가 다른 화면의 iframe 안에서 **본문만** 선다(F1-A 요청 9).
//   부모가 스타일을 주입하지 않아도(주입 0 host 페이지) 레일 · 마스트 · 공지 · 푸터 · 쪽 제목 · 안쪽 닫기 0 · 본문 100%
//   · postMessage lx:embed:ready · 기간 칩(?period · lx:embed:period) · ?emd 수신 · embed 없이 열면 예전 셸 그대로.
const SHOTS = 'shots/f2/R';
fs.mkdirSync(SHOTS, { recursive: true });
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|WebGL|GPU stall|GroupMarkerNotSet/i;
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function asStaff(page) {
  await page.addInitScript(() => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', '1'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_tenant_session'); });
}
/** 같은 origin 의 빈 host(주입 0) 에 iframe 을 세우고 lx:embed:ready 를 기다린다. */
async function hostFrame(page, src, w = 620, h = 820) {
  await page.goto('proto/signup.html');                  // 관문 없는 같은 origin 화면 — host 로만 쓴다(스타일 주입 없음)
  await page.evaluate(([src, w, h]) => new Promise((res) => {
    window.__ready = null;
    addEventListener('message', (e) => { if (e.data?.type === 'lx:embed:ready') { window.__ready = e.data; res(); } });
    document.body.innerHTML = '';
    const f = document.createElement('iframe'); f.id = 'host'; f.src = src; f.style.cssText = `width:${w}px;height:${h}px;border:0;position:fixed;right:0;top:0`;
    document.body.append(f);
  }), [src, w, h]);
  await page.waitForFunction(() => !!window.__ready, null, { timeout: 30000 });
  return page.frameLocator('#host');
}
const chrome = (fr) => fr.locator('#rail, #mast, #foot, #page-head, #mast-notice, #st-x, #rp-x, #rp-cancel, .skip');

for (const [name, src, view] of [
  ['통계', '../proto/stats-standard.html?embed=1&period=2025', 'stats'],
  ['보고서 발급 내역', '../proto/report-standard.html?embed=1&period=2025', 'report'],
  ['보고서 발급 요청', '../proto/report-standard-issue.html?embed=1&period=2025', 'report'],
]) {
  test(`${name} ?embed=1 — 주입 0 host 에서 크롬 0 · 본문 100% · lx:embed:ready(${view}) · 기간 칩`, async ({ page }) => {
    test.setTimeout(60000);
    const errs = watch(page);
    await asStaff(page);
    const fr = await hostFrame(page, src);
    const msg = await page.evaluate(() => window.__ready);
    expect(msg).toMatchObject({ type: 'lx:embed:ready', view, period: '2025' });
    expect(msg.height).toBeGreaterThan(200);
    await expect(chrome(fr)).toHaveCount(0);
    await expect(fr.locator('#xi-embed')).toHaveCount(0);                     // 부모 주입 스타일 없음
    await expect(fr.locator('html')).toHaveAttribute('data-embed', '1');
    const g = await page.frames().find((f) => /standard/.test(f.url())).evaluate(() => {
      const d = document.querySelector('#side .dw'), r = d.getBoundingClientRect();
      const small = [...document.querySelectorAll('#side *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => e.outerHTML.slice(0, 70));
      return { w: Math.round(r.width), vw: innerWidth, left: Math.round(r.left), small, hx: document.documentElement.scrollWidth - innerWidth };
    });
    expect(g.left).toBe(0);
    expect(g.w).toBe(g.vw);                                                    // 본문 100%
    expect(g.hx).toBeLessThanOrEqual(0);                                       // 가로 넘침 0
    expect(g.small).toEqual([]);
    await expect(fr.locator(view === 'stats' ? '#st-period' : '#rp-period')).toContainText('기간 2025');
    await page.screenshot({ path: `${SHOTS}/embed-${view}-${src.includes('issue') ? 'issue' : 'main'}.png` });
    expect(errs).toEqual([]);
  });
}

test('통계 embed — ?emd= 첫 거르개 · 기간 2023(그 해 결과 없음)은 이유를 말한다 · lx:embed:period 로 기간이 바뀐다', async ({ page }) => {
  test.setTimeout(60000);
  await asStaff(page);
  const fr = await hostFrame(page, '../proto/stats-standard.html?embed=1&period=2023&emd=' + encodeURIComponent('운봉읍'));
  await expect(fr.locator('#st-period-empty')).toContainText('2023년 판독 결과가 이 화면에 없습니다');
  await page.evaluate(() => document.getElementById('host').contentWindow.postMessage({ type: 'lx:embed:period', period: '2025' }, location.origin));
  await expect(fr.locator('#st-period')).toHaveAttribute('data-period', '2025');
  await expect(fr.locator('#st-period-empty')).toHaveCount(0);
  await expect(fr.locator('select[name="emd"]')).toHaveValue('운봉읍');
  await expect(fr.locator('#st-tb tr[data-emd]')).toHaveCount(1);
});

test('embed 없이 열면 예전 셸 그대로 — 레일 · 마스트 · 제목 · 닫기', async ({ page }) => {
  await asStaff(page);
  await page.goto('proto/stats-standard.html');
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  for (const s of ['#rail', '#mast', '#foot', '#page-head']) await expect(page.locator(s)).toHaveCount(1);
  await page.waitForSelector('#st-x');
  await expect(page.locator('html')).not.toHaveAttribute('data-embed', /./);
});

test('embed 도 관문은 그대로 — 세션 없으면 로그인 문 · 기관 세션이면 기관 홈', async ({ page }) => {
  await page.goto('proto/stats-standard.html?embed=1');
  await page.waitForURL(/login\.html\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('stats-standard.html?embed=1');
});

test('XI맵 서랍(통계) — 실제 XI맵 안에서 크롬 0(서랍은 F2-A · 주입 제거 여부와 무관하게 통과)', async ({ page }) => {
  test.setTimeout(90000);
  await asStaff(page);
  await page.goto('xi/index.html?cam=127.47,35.425,12.5,0,0&drawer=stats');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 });
  const opened = await page.waitForSelector('#drawer iframe[src*="stats-standard"]', { timeout: 25000, state: 'attached' }).then(() => true).catch(() => false);
  test.skip(!opened, 'XI맵이 ?drawer=stats 를 URL 로 열지 않음(F2-A 영역) — host 페이지 검사가 정본');
  const fr = page.frameLocator('iframe[src*="stats-standard"]');
  await expect(fr.locator('#side .dw')).toHaveCount(1, { timeout: 30000 });
  await expect(chrome(fr)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/embed-xi-drawer.png` });
});
