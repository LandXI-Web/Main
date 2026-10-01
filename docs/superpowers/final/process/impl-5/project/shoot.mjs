/* 구현 5차 · 프로젝트 한 장(확인 17차 P-3 ⓐ 재학습 근거 · P-4 ⓐ 기록 · 메모 · 파일 · P-5 ⓐ 넘기기 · 내 정보) — 화면 캡처(바뀐 뒤).
   로그인 = 로그인 폼 입력(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음 · 비밀번호는 server/.env 에서 읽고 출력하지 않는다).
   쓰기 0 — 재학습 · 넘기기 · 내 정보 창은 열어서 고르기까지만 찍고 닫는다(보내지 않는다). 메모 · 파일 · 알림 · 결재 줄은 부르는 쪽이 시험으로 만들고 지운다(README).
   사용: node docs/superpowers/final/process/impl-5/project/shoot.mjs [--base https://app.land-xi.dev] [--project prj_…] [--only staff,admin,notice] [--admin-project prj_…]
   결과: img/after-{이름}-{1440|390}.png · 콘솔 JSON 줄(제목 · 금지어 · 가로 넘침 · 콘솔 오류 · 한 단어 줄) */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor, RULES, scan } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173');
const PID = arg('--project', 'prj_3fdba452d5');               // 비닐하우스 2026(공개된 서비스 — 재학습 칸이 열린다)
const ADMIN_PID = arg('--admin-project', '');                  // 관리자 결재 줄(재학습 사유)을 찍을 시험 프로젝트
const ONLY = new Set(arg('--only', 'staff').split(','));
const PUBLIC = BASE.includes('land-xi.dev');
const ADMIN_BASE = PUBLIC ? 'https://admin.land-xi.dev' : BASE;
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const scanSrc = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;
const out = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
const ctx = async (o) => { const c = await browser.newContext(o); c.setDefaultNavigationTimeout(120000); c.setDefaultTimeout(90000); return c; };

const state = () => {
  const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const t = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
  /* 한 단어만 남은 줄(줄바꿈 규칙 9) — 두 어절 이상 글에서 마지막 줄이 한 어절인지 */
  const lonely = [];
  for (const el of document.querySelectorAll('.lxp-page p, .lxp-page li, .lxp-page b, .k-md p, .k-drawer li, .lxp-say, .k-me-say, .lxp-ntc b')) {
    if (!vis(el) || el.children.length > 3) continue;
    const r = document.createRange(); r.selectNodeContents(el);
    const lines = [...r.getClientRects()].map((x) => Math.round(x.top)).filter((v, i, a) => a.indexOf(v) === i);
    if (lines.length > 1 && t(el).split(' ').length > 2) {
      const lastTop = Math.max(...lines); const words = [];
      for (const n of el.childNodes) if (n.nodeType === 3) { const rr = document.createRange(); rr.selectNodeContents(n); for (const q of rr.getClientRects()) if (Math.round(q.top) === lastTop) words.push(n.textContent); }
      const last = words.join(' ').trim();
      if (last && !last.includes(' ') && last.length <= 3) lonely.push(t(el).slice(0, 40));
    }
  }
  return { h: [...document.querySelectorAll('h1,h2')].filter(vis).map(t).slice(0, 12), overflowX: document.documentElement.scrollWidth - innerWidth, lonely: lonely.slice(0, 6) };
};
async function shot(page, name, { full = false, extra = {} } = {}) {
  await sleep(900);
  const f = `after-${name}.png`;
  if (full) {                                                    // 판 안 스크롤(.lxp-page) 전체를 한 장에 — 창 높이를 내용 높이로 늘렸다가 되돌린다
    const vp = page.viewportSize();
    const hgt = await page.evaluate(() => { const p = document.querySelector('.lxp-page'); return p ? p.scrollHeight + p.getBoundingClientRect().top + 8 : document.documentElement.scrollHeight; });
    await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, Math.ceil(hgt)) }); await sleep(700);
    await page.screenshot({ path: path.join(IMG, f) });
    await page.setViewportSize(vp); await sleep(300);
  } else await page.screenshot({ path: path.join(IMG, f) });
  const s = await page.evaluate(state);
  const lint = await page.evaluate(scanSrc).catch(() => null);
  out({ shot: f, ...s, lint: (lint?.hits || lint || []).slice?.(0, 6) ?? lint, ...extra });
}
const errs = (page, tag) => { page.on('pageerror', (e) => out({ tag, pageerror: String(e).slice(0, 200) })); page.on('console', (m) => { if (m.type() === 'error') out({ tag, console: m.text().slice(0, 160) }); }); };
const projectUrl = (b, id) => `${b}/landxi/v3/lx-project/?project=${id}`;
async function waitProject(page) {
  for (let i = 0; ; i++) {                                      // 바깥 주소 앞단이 가끔 한 파일을 520 으로 놓친다 — 두 번까지 다시 연다
    try { await page.locator('.lxp-title').waitFor({ timeout: 45000 }); break; } catch (e) { if (i >= 2) throw e; await page.reload(); }
  }
  await page.locator('.lxp-lg li').first().waitFor({ timeout: 60000 }).catch(() => {});
}

/* ── LX 직원(test@lx.or.kr) — 프로젝트 한 장 · 재학습 사유 창 · 기록 서랍 · 넘기기 창 · 내 정보 창 · 휴대폰 ── */
if (ONLY.has('staff')) {
  const pc = await ctx({ viewport: { width: 1440, height: 900 } });
  const page = await pc.newPage(); errs(page, 'staff-1440');
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 60000 });
  await page.goto(projectUrl(BASE, PID)); await waitProject(page);
  await shot(page, 'project-1440');
  await shot(page, 'project-1440-full', { full: true });
  await page.locator('.lxp-rt').click();
  await page.locator('.k-md .lxp-chip', { hasText: '성능 보완' }).click();
  await shot(page, 'retrain-1440');
  await page.keyboard.press('Escape'); await sleep(500);
  await page.locator('.lxp-log .lxp-more').click();
  await page.locator('.k-drawer .lxp-lg li').first().waitFor();
  await shot(page, 'log-1440');
  await page.locator('.k-drawer .lxp-chip', { hasText: '파일' }).click().catch(() => {});
  await shot(page, 'log-file-1440');
  await page.locator('.k-drawer .k-dr-x').click(); await sleep(500);
  await page.locator('.lxp-people .lxp-link', { hasText: '넘기기' }).click();
  await page.locator('.k-md select').waitFor();
  await page.waitForFunction(() => document.querySelector('.k-md select')?.options.length > 1, null, { timeout: 30000 }).catch(() => {});
  await page.locator('.k-md select').selectOption({ index: 1 }).catch(() => {});
  await shot(page, 'handover-1440');
  await page.keyboard.press('Escape'); await sleep(500);
  await page.locator('.k-mast .k-me-b').click();
  await page.locator('.k-me input[name=name]').waitFor();
  await shot(page, 'me-1440');
  await page.keyboard.press('Escape'); await sleep(400);
  const st = await pc.storageState();
  const mob = await ctx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: st });
  const m = await mob.newPage(); errs(m, 'staff-390');
  await m.goto(projectUrl(BASE, PID)); await waitProject(m);
  await shot(m, 'project-390');
  await shot(m, 'project-390-full', { full: true });
  await m.locator('.lxp-rt').click();
  await m.locator('.k-md .lxp-chip', { hasText: '검토 요청 반영' }).click();
  await shot(m, 'retrain-390');
  await m.keyboard.press('Escape'); await sleep(500);
  await m.locator('.lxp-people .lxp-link', { hasText: '넘기기' }).click();
  await m.waitForFunction(() => document.querySelector('.k-md select')?.options.length > 1, null, { timeout: 30000 }).catch(() => {});
  await shot(m, 'handover-390');
  await m.keyboard.press('Escape'); await sleep(500);
  await m.locator('.lxp-log .lxp-more').click();
  await m.locator('.k-drawer .lxp-lg li').first().waitFor();
  await shot(m, 'log-390');
  await m.locator('.k-drawer .k-dr-x').click(); await sleep(500);
  await m.locator('.k-mast .k-me-b').click();
  await m.locator('.k-me input[name=name]').waitFor();
  await shot(m, 'me-390');
  await mob.close(); await pc.close();
}

/* ── 알림 한 줄 — 넘겨받은 사람(test@lx.or.kr)의 대시보드 '내 프로젝트' · 프로젝트 목록 ── */
if (ONLY.has('notice')) {
  const pc = await ctx({ viewport: { width: 1440, height: 900 } });
  const page = await pc.newPage(); errs(page, 'notice');
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 60000 });
  await page.locator('.lc-mine .lxp-ntc').waitFor({ timeout: 60000 });
  await page.locator('a.lc-pr').first().waitFor({ timeout: 60000 }).catch(() => {});
  await shot(page, 'notice-dashboard-1440');
  await page.goto(`${BASE}/landxi/v3/lx-project/`); await page.locator('.lxp-ntc').waitFor();
  await page.locator('.lxp-list tbody tr').first().waitFor({ timeout: 60000 }).catch(() => {});
  await shot(page, 'notice-list-1440');
  const mob = await ctx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await pc.storageState() });
  const m = await mob.newPage(); errs(m, 'notice-390');
  await m.goto(`${BASE}/landxi/v3/lx-console/`); await m.locator('.lc-mine .lxp-ntc').waitFor({ timeout: 60000 });
  await m.locator('a.lc-pr').first().waitFor({ timeout: 60000 }).catch(() => {});
  await shot(m, 'notice-dashboard-390');
  await mob.close(); await pc.close();
}

/* ── LX 관리자 — 결재함에서 재학습 회차의 모델 등록 결재를 열면 '재학습 사유'(프로젝트장이 고른 말) ── */
if (ONLY.has('admin')) {
  const pc = await ctx({ viewport: { width: 1440, height: 900 } });
  const page = await pc.newPage(); errs(page, 'admin');
  await frontDoor(page, ADMIN_BASE, 'lxadmin@lx.or.kr', 'admin');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/ops-core/'), { timeout: 60000 });
  await page.goto(`${ADMIN_BASE}/landxi/v3/ops-core/#/approvals`);
  const row = page.locator('tr', { hasText: '재학습 시험 모델' }).first();
  await row.waitFor({ timeout: 90000 });
  await row.click();
  await page.locator('.oc-req').waitFor();
  await shot(page, 'admin-approval-1440', { extra: { req: await page.locator('.oc-req').innerText() } });
  if (ADMIN_PID) {
    await page.goto(projectUrl(ADMIN_BASE, ADMIN_PID)); await waitProject(page);
    await shot(page, 'admin-project-1440');
  }
  await pc.close();
}
await browser.close();
