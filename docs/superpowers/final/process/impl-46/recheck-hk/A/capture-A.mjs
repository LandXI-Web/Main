/* 재검수 21차 구역 A (impl-46) — 그림 · 오류 · 시간만 모은다. 판정 없음. 코드 수정 없음.
   node capture-A.mjs → ./findings.json (logins + steps) · ./shots/*.png
   로그인은 로그인 폼(frontDoor)으로만. 비밀번호는 server/.env 에서 읽고 출력하지 않는다. 역할당 세션 하나.
   저장 데이터는 건드리지 않는다: 대시보드 칸은 끌어서 되돌린 뒤 페이지를 새로 읽어 '완료'(저장 가능) 는 누르지 않는다.
   저장 · 제출 · 승인 · 공유 단추는 누르지 않는다. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const APP = 'https://app.land-xi.dev', V = '/landxi/v3/';
const VP = { pc: { width: 1440, height: 900 }, mo: { width: 390, height: 844 } };
const DIRS = [['n', 0, -50], ['s', 0, 50], ['e', 50, 0], ['w', -50, 0], ['ne', 50, -50], ['nw', -50, -50], ['se', 50, 50], ['sw', -50, 50]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STEPS = [], LOGINS = { count: 0, attempts: [], responses429: [] };
const OUT = path.join(HERE, 'findings.json');
const save = () => fs.writeFileSync(OUT, JSON.stringify({ logins: LOGINS, steps: STEPS }, null, 1));

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function openSession(role) {
  const ctx = await browser.newContext({ viewport: VP.pc, locale: 'ko-KR' });
  const p = await ctx.newPage();
  const cur = { errors: [], failed: [] };
  p.on('console', (m) => { if (m.type() === 'error') cur.errors.push(m.text().slice(0, 220)); });
  p.on('pageerror', (e) => cur.errors.push('pageerror ' + String(e).slice(0, 220)));
  p.on('response', (r) => {
    if (r.status() >= 400) cur.failed.push(`${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`);
    if (r.status() === 429) LOGINS.responses429.push(`${role} 429 ${r.url().replace(/[?#].*$/, '').slice(0, 120)}`);
  });
  p.on('requestfailed', (r) => cur.failed.push(`ERR ${r.failure()?.errorText || ''} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`));
  return { role, ctx, p, cur };
}

/* 로그인 시간은 따로 잰다(화면 시간에 넣지 않음). 제한 · 429 문구도 적는다 */
async function login(s, id, site) {
  const t0 = Date.now(); let err = null;
  try { await frontDoor(s.p, APP, id, site, {}); } catch (e) { err = String(e).slice(0, 200); }
  await s.p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 90000 }).catch(() => {});
  const url = s.p.url().replace(/[?#].*$/, '');
  const onLogin = /\/login\/?$/.test(new URL(url).pathname);
  const limitMessages = onLogin ? await s.p.evaluate(() => (document.body?.innerText || '').match(/[^\n]*(429|너무 많|잠시 후|시도 횟수|잠금|잠겼|too many|locked|제한)[^\n]*/gi)?.slice(0, 5) || []).catch(() => []) : [];
  LOGINS.count++;
  LOGINS.attempts.push({ role: s.role, id_kind: id.split('@')[0], site, loginMs: Date.now() - t0, landedUrl: url, stillOnLoginPage: onLogin, error: err, limitMessages });
  save();
  s.cur.errors.length = 0; s.cur.failed.length = 0;
}

/* '불러오는 중' · '서버 응답이 늦습니다' 가 사라질 때까지 기다리며 구간 길이를 잰다 */
async function settle(p, to = 60000) {
  const start = Date.now(); const spans = []; let active = null, calm = null;
  while (Date.now() - start < to) {
    const busy = await p.evaluate(() => /불러오는 중|서버 응답이 늦습니다/.test(document.body?.innerText || '')).catch(() => false);
    if (busy) { if (active === null) active = Date.now(); calm = null; }
    else {
      if (active !== null) { spans.push(Date.now() - active); active = null; }
      calm ??= Date.now(); if (Date.now() - calm > 1000) break;
    }
    await sleep(120);
  }
  if (active !== null) spans.push(Date.now() - active);
  return { settleMs: Date.now() - start, loadingSpansMs: spans, longLoadingMs: spans.filter((ms) => ms > 2000) };
}

/* 잘림 · 넘침: 요소 scrollWidth > clientWidth, 그리고 페이지 가로 넘침 */
async function overflowCheck(p) {
  return p.evaluate(() => {
    const out = [];
    const pageOver = document.documentElement.scrollWidth - window.innerWidth;
    for (const el of document.querySelectorAll('body *')) {
      if (el.offsetParent === null && el.tagName !== 'BODY') continue;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && !/(auto|scroll)/.test(cs.overflowX) && el.clientWidth > 0) {
        const t = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        if (t) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} sw${el.scrollWidth}/cw${el.clientWidth} "${t}"`);
      }
      if (out.length >= 25) break;
    }
    return { pageHorizontalOverflowPx: pageOver, elements: out };
  }).catch((e) => ({ error: String(e).slice(0, 120) }));
}

/* 화면에 '불러오는 중'이 보이는 동안을 재는 것 외에, 첫 화면 글자 · 버튼 목록을 적는다(판정 아님) */
function record(screen, vp, s, url, shot, data) {
  STEPS.push({ screen: `${screen}-${vp}`, url, shot: shot ? `shots/${shot}` : null, ...data, consoleErrors: s.cur.errors.splice(0), failedRequests: s.cur.failed.splice(0) });
  save();
}
async function snap(p, name) { await p.screenshot({ path: path.join(SHOTS, name), timeout: 20000 }).catch((e) => console.log('shot 실패', name, String(e).slice(0, 120))); return name; }

async function visit(s, screen, vp, url, opts = {}) {
  const notes = [];
  await s.p.setViewportSize(VP[vp]);
  const t0 = Date.now();
  await s.p.goto(url, { waitUntil: 'load', timeout: 60000 }).catch((e) => notes.push('goto 오류 ' + String(e).slice(0, 160)));
  const gotoMs = Date.now() - t0;
  const st = await settle(s.p);
  await sleep(1000);
  if (opts.after) await opts.after(s.p, notes).catch((e) => notes.push('after 오류 ' + String(e).slice(0, 160)));
  const ov = await overflowCheck(s.p);
  const name = `${opts.name || screen}-${vp}.png`;
  await snap(s.p, name);
  record(screen, vp, s, s.p.url().replace(/[?#].*$/, ''), name, { gotoMs, ...st, overflow: ov, notes });
}

/* 메인: 끝까지 스크롤 → 패밀리 사이트 펼치기 + 링크 목록 + 링크 응답 코드(HEAD 만) */
async function scrollEndAndFamily(ctxReq) {
  return async (p, notes) => {
    for (let i = 0; i < 40; i++) {
      const done = await p.evaluate(() => {
        const before = window.scrollY; window.scrollBy(0, 900);
        return Math.abs(window.scrollY - before) < 2 || window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      });
      await sleep(250);
      if (done) break;
    }
    notes.push('끝까지 스크롤: scrollY ' + (await p.evaluate(() => Math.round(window.scrollY))) + ' / 높이 ' + (await p.evaluate(() => document.body.scrollHeight)));
    const det = p.locator('details.fam').first();
    if (!(await det.count())) { notes.push('패밀리 사이트 묶음 없음'); return; }
    await det.locator('summary').click().catch((e) => notes.push('열기 실패 ' + String(e).slice(0, 120)));
    await sleep(700);
    const links = await det.locator('a').evaluateAll((as) => as.map((a) => ({ text: a.textContent.trim(), href: a.href })));
    notes.push('패밀리 사이트 링크 ' + links.length + '개: ' + JSON.stringify(links));
    for (const l of links.slice(0, 12)) {
      const code = await ctxReq.fetch(l.href, { method: 'HEAD', timeout: 15000 }).then((r) => r.status()).catch((e) => 'ERR ' + String(e).slice(0, 80));
      notes.push(`HEAD ${l.href} → ${code}`);
    }
  };
}

/* ───────── 공개 (로그인 없음) ───────── */
{
  const pub = await openSession('public');
  const fam = (c) => scrollEndAndFamily(c);
  await visit(pub, 'guest-main', 'pc', `${APP}${V}main/`, { after: await fam(pub.ctx.request) });
  await visit(pub, 'guest-login', 'pc', `${APP}${V}login/`);
  await visit(pub, 'sales-cases', 'pc', `${APP}${V}sales/`);
  await visit(pub, 'guest-main', 'mo', `${APP}${V}main/`, { after: await fam(pub.ctx.request) });
  await visit(pub, 'guest-login', 'mo', `${APP}${V}login/`);
  await visit(pub, 'sales-cases', 'mo', `${APP}${V}sales/`);
  await pub.ctx.close();
}

/* ───────── LX 직원 (test@lx.or.kr · 로그인 1회) ───────── */
const staff = await openSession('staff');
await login(staff, 'test@lx.or.kr', 'app');
const DASH = `${APP}${V}lx-console/`;

await visit(staff, 'staff-dash', 'pc', DASH);
try {
  const p = staff.p, notes = [];
  if (!(await p.locator('.dg-b--edit').count())) notes.push('대시보드 수정하기 단추 없음');
  else {
    await p.locator('.dg-b--edit').first().click(); await sleep(1200); await settle(p, 20000);
    notes.push('수정 중 보이는 단추: ' + JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.dg-bar button')].filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim()))));
    notes.push("'기능 추가하기' 단추 글: " + (await p.locator('.dg-b--add').first().innerText().catch(() => '없음')));
    const H = (d) => p.locator(`.dg-rs[data-dir="${d}"]`).first();
    const node = H('se').locator('xpath=..');
    await node.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(300);
    const box0 = await node.boundingBox();
    notes.push('대상 칸 원래 상자: ' + JSON.stringify(box0));
    await snap(p, 'staff-dash-edit-pc.png');
    record('staff-dash-edit', 'pc', staff, DASH, 'staff-dash-edit-pc.png', { notes: ['수정 중 모습'].concat(notes.splice(0)) });
    for (const [d, dx, dy] of DIRS) {
      const n = [];
      const boxBefore = await node.boundingBox();
      const hb = await H(d).boundingBox();
      if (!hb || !boxBefore) { n.push('손잡이 상자 없음'); record(`staff-dash-resize-${d}`, 'pc', staff, DASH, null, { notes: n }); continue; }
      const sx = hb.x + hb.width / 2, sy = hb.y + hb.height / 2;
      await p.mouse.move(sx, sy); await p.mouse.down();
      await p.mouse.move(sx + dx, sy + dy, { steps: 15 }); await p.mouse.up();
      await sleep(800);
      const boxAfter = await node.boundingBox();
      await snap(p, `staff-dash-resize-${d}-pc.png`);
      const hb2 = await H(d).boundingBox();
      if (hb2) {
        const rx = hb2.x + hb2.width / 2, ry = hb2.y + hb2.height / 2;
        await p.mouse.move(rx, ry); await p.mouse.down();
        await p.mouse.move(rx - dx, ry - dy, { steps: 15 }); await p.mouse.up();
        await sleep(800);
      }
      const boxRestored = await node.boundingBox();
      n.push(`${d} 끌기 ${dx},${dy}: 전 ${JSON.stringify(boxBefore)} → 후 ${JSON.stringify(boxAfter)} · 되돌린 뒤 ${JSON.stringify(boxRestored)} · 원래와 차이 ${JSON.stringify(boxRestored && box0 ? { x: +(boxRestored.x - box0.x).toFixed(1), y: +(boxRestored.y - box0.y).toFixed(1), w: +(boxRestored.width - box0.width).toFixed(1), h: +(boxRestored.height - box0.height).toFixed(1) } : null)}`);
      record(`staff-dash-resize-${d}`, 'pc', staff, DASH, `staff-dash-resize-${d}-pc.png`, { notes: n });
    }
    // 저장 없이 나간다: 페이지를 새로 읽는다(편집 완료 단추는 누르지 않음)
    await visit(staff, 'staff-dash-after-resize', 'pc', DASH);
    // 기능 추가하기: 편집 모드에서 누른 모습만 찍고 닫는다(추가 확인은 누르지 않음)
    await p.locator('.dg-b--edit').first().click().catch(() => {}); await sleep(1000); await settle(p, 20000);
    const addBtn = p.locator('.dg-b--add').first();
    if (await addBtn.count()) {
      const a0 = Date.now();
      await addBtn.click().catch((e) => notes.push('기능 추가 클릭 실패 ' + String(e).slice(0, 100)));
      await sleep(1200); const st = await settle(p, 30000);
      const ov = await overflowCheck(p);
      await snap(p, 'staff-dash-add-pc.png');
      record('staff-dash-add', 'pc', staff, DASH, 'staff-dash-add-pc.png', { settleMs: Date.now() - a0, ...st, overflow: ov, notes: ['기능 추가하기 누른 뒤 (추가 확정 안 함)'] });
      await p.keyboard.press('Escape'); await sleep(600);
    } else record('staff-dash-add', 'pc', staff, DASH, null, { notes: ["'기능 추가하기' 단추 없음"] });
    await visit(staff, 'staff-dash-reloaded', 'pc', DASH);
  }
} catch (e) { record('staff-dash-resize', 'pc', staff, DASH, null, { notes: ['오류 ' + String(e).slice(0, 200)] }); }
await visit(staff, 'staff-dash', 'mo', DASH);
await staff.ctx.close();

/* ───────── LX 관리자 (lxadmin · 로그인 1회) — 영업용 화면도 같은 계정(lx/admin)으로 본다 ───────── */
const admin = await openSession('admin');
await login(admin, 'lxadmin@lx.or.kr', 'lx');
const ADMIN_HOME = admin.p.url().replace(/[?#].*$/, '');
const MENU_SEL = 'nav a, aside a, nav button, aside button, [class*="side"] a, [class*="lnb"] a, [class*="gnb"] a';
for (const vp of ['pc', 'mo']) {
  await visit(admin, 'lx-admin-home', vp, ADMIN_HOME);
  const p = admin.p;
  // 영업용 화면(활용사례) — lx/admin 으로 열림 확인
  await visit(admin, 'sales-cases-as-admin', vp, `${APP}${V}sales/`);
  await visit(admin, 'lx-admin-home', vp, ADMIN_HOME);
  // 왼쪽 메뉴: 보이는 항목을 순서대로 누른다(주소 추측 없이)
  const labels = await p.evaluate((sel) => {
    const out = []; const seen = new Set();
    document.querySelectorAll(sel).forEach((el, i) => {
      if (el.offsetParent === null) return;
      const t = (el.innerText || '').trim().replace(/s+/g, ' ');
      if (!t || t.length > 20 || seen.has(t)) return; seen.add(t);
      out.push({ i, text: t, href: el.getAttribute('href') });
    });
    return out.slice(0, 40);
  }, MENU_SEL).catch(() => []);
  STEPS.push({ screen: `lx-admin-menu-list-${vp}`, url: ADMIN_HOME, shot: null, notes: ['왼쪽 메뉴 항목(보이는 것): ' + JSON.stringify(labels)], consoleErrors: [], failedRequests: [] });
  save();
  for (const item of labels) {
    const tag = item.text.replace(/s+/g, '-').replace(/[/\:*?"<>|]/g, '');
    const el = p.locator(MENU_SEL).nth(item.i);
    if (!(await el.isVisible().catch(() => false))) { record(`lx-admin-${tag}`, vp, admin, ADMIN_HOME, null, { notes: ['메뉴 보이지 않음'] }); continue; }
    const c0 = Date.now();
    await el.click({ timeout: 10000 }).catch((e) => record(`lx-admin-${tag}`, vp, admin, p.url(), null, { notes: ['클릭 실패 ' + String(e).slice(0, 120)] }));
    await sleep(800);
    const st = await settle(p);
    await sleep(800);
    const ov = await overflowCheck(p);
    const shot = `lx-admin-${tag}-${vp}.png`;
    await snap(p, shot);
    record(`lx-admin-${tag}`, vp, admin, p.url().replace(/[?#].*$/, ''), shot, { clickToSettleMs: Date.now() - c0, ...st, overflow: ov, notes: [] });
    await p.goto(ADMIN_HOME, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await settle(p); await sleep(500);
  }
}
await admin.ctx.close();

await browser.close();
save();
console.log('기록 단계 수', STEPS.length, '· 로그인 횟수', LOGINS.count);
