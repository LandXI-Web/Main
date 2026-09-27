// F2-D · integrate 지적 — 영문판(locale=en)에 국문 0. 보이는 글자 + title · aria-label · alt · placeholder 를 전 장면에서 정규식으로 센다
// (한글 음절·자모). 게이트웨이(on) 카탈로그의 국문 라이선스('(비상업 · export 빌드 제외)')도 영문으로. ru UI 는 미착수(정직 표기).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const GW = 'http://localhost:8700';
async function gateway() { try { return (await (await fetch(GW + '/api/v1/health', { signal: AbortSignal.timeout(1500) })).json()).ok; } catch { return false; } }
const pw = () => process.env.DEV_PASSWORD || (fs.existsSync('server/.env') ? (fs.readFileSync('server/.env', 'utf8').match(/^DEV_PASSWORD=(.*)$/m) || [])[1]?.trim() : null);
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return errs;
}
/** 문서 전체(숨김 포함 · 호버 카드 포함)의 글자와 속성에서 한글을 찾는다. */
function hangul() {
  const re = /[ㄱ-ㆎ가-힣]/, out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const p = n.parentElement; if (p && /^(SCRIPT|STYLE)$/.test(p.tagName)) continue; if (re.test(n.textContent)) out.push('text: ' + n.textContent.trim().slice(0, 60)); }
  for (const el of document.querySelectorAll('[title],[aria-label],[alt],[placeholder]')) for (const a of ['title', 'aria-label', 'alt', 'placeholder']) { const v = el.getAttribute(a); if (v && re.test(v)) out.push(`${a}: ${v.slice(0, 60)}`); }
  if (re.test(document.title)) out.push('doc.title: ' + document.title);
  return out;
}
async function tourAll(page) {
  const found = [];
  const grab = async (where) => { for (const x of await page.evaluate(hangul)) found.push(`${where} · ${x}`); };
  await grab('globe');
  await page.evaluate(() => window.__f1d.go('ysykata'));
  await page.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run({ speed: 150 }); });
  await page.waitForFunction(() => window.__f1d.scenes.ys.S.job === 'done' && document.querySelector('#ys-next'), null, { timeout: 90000, polling: 500 });
  await page.click('#ys-next [data-a="open"]');
  await grab('ysykata');
  await page.evaluate(() => window.__f1d.go('sokuluk'));
  await page.click('#sk-run');
  await page.waitForTimeout(1500);
  await grab('sokuluk');
  await page.evaluate(() => window.__f1d.go('meiktila'));
  await page.evaluate(() => window.__f1d.scenes.mk.swipeOn(50));
  await page.waitForTimeout(500);
  await grab('meiktila');
  return found;
}

test.describe('F2-D i18n-en pure (Hangul 0)', () => {
  test.setTimeout(240000);
  test('off — LX(en) 전 장면 · 게스트(en) 메이크틸라', async ({ page, browser }) => {
    const errs = watch(page);
    await page.addInitScript(() => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', 1); localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
    await page.goto('/landxi/global/index.html?tenant=lx&locale=en');
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
    const found = await tourAll(page);
    // 게스트(public · S2 대체 칩)
    const g = await browser.newPage();
    await g.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_tenant_session'); });
    await g.goto('/landxi/global/index.html?locale=en');
    await g.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
    await g.evaluate(() => window.__f1d.go('meiktila'));
    for (const x of await g.evaluate(hangul)) found.push('guest · ' + x);
    await g.close();
    expect(found).toEqual([]);
    // ru UI 미착수 — 정직 표기 한 줄(글로브 목록 머리)
    await page.evaluate(() => window.__f1d.go('globe'));
    await expect(page.locator('.gs-list__ru')).toContainText('Russian UI not started');
    expect(errs).toEqual([]);
  });

  test('on — 게이트웨이 카탈로그 국문 라이선스도 영문(마스트 칩 · 사다리 칩 · 호버 카드)', async ({ page }) => {
    test.skip(!(await gateway()) || !pw(), '게이트웨이 :8700 · DEV_PASSWORD 필요');
    const errs = watch(page);
    const s = await (await fetch(GW + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-staff', password: pw() }) })).json();
    await page.addInitScript(([s, gw]) => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', 1); localStorage.setItem('lx_api_base', gw); localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); }, [s, GW]);
    await page.goto('/landxi/global/index.html?tenant=lx&locale=en');
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
    expect(await page.evaluate(() => window.__f1d.state().mode)).toBe('on');
    const cat = await page.evaluate(() => window.__f1d.ctx.cat.items.filter((i) => /[ㄱ-ㆎ가-힣]/.test(`${i.license} ${i.attribution} ${i.title || ''}`)).map((i) => i.id));
    expect(cat).toEqual([]);
    await page.evaluate(() => window.__f1d.go('sokuluk'));
    const found = await page.evaluate(hangul);
    expect(found).toEqual([]);
    // 판정 3차: 견적 근거(게이트웨이 eta_s.source 국문 'perf:shard_ms:… 최근 72건 중앙값 …')가 #ys-eta 에 그대로 → 봉투 숫자로 영문 조립.
    // quote() → run(실 게이트웨이 · 작업 제출) → 첫 칸 도착(job.progress · shard.done)까지 전 문서 국문 0 → 작업 취소(CPU 워커 반납).
    await page.evaluate(() => window.__f1d.go('ysykata'));
    const q = await page.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); const q = await y.quote(); return { src: q.eta_s?.source || null, eta: document.getElementById('ys-eta')?.innerText || '', title: document.getElementById('ys-eta')?.title || '' }; });
    console.log('quote', JSON.stringify(q));
    const fq = (await page.evaluate(hangul)).map((x) => 'quote · ' + x);
    await page.click('#ys-run');
    const jobId = await page.waitForFunction(() => window.__f1d.scenes.ys.S.jobId, null, { timeout: 30000 }).then((h) => h.jsonValue());
    await page.waitForFunction(() => { const S = window.__f1d.scenes.ys.S; return (S.progressSeen || 0) > 0 || Object.keys(S.arrived || {}).length > 0 || S.job === 'done'; }, null, { timeout: 150000, polling: 500 });
    await page.waitForTimeout(1200);
    const fr = (await page.evaluate(hangul)).map((x) => 'run · ' + x);
    const hud = await page.evaluate(() => document.getElementById('hud')?.innerText || '');
    console.log('run', jobId, JSON.stringify(hud.slice(0, 240)));
    const e0 = errs.slice();
    await fetch(`${GW}/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', headers: { authorization: 'Bearer ' + s.token } }).catch(() => null);
    expect(q.eta).not.toMatch(HANGUL);
    expect(q.title).not.toMatch(HANGUL);
    expect([...fq, ...fr]).toEqual([]);
    expect(e0).toEqual([]);
  });
});
