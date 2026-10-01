/* 구현 5차 · 계정 · 프로젝트 셋(제안 S-19 저장 용량 할당 · 늘리기 요청 · 승인 / S-20 메모 · 파일 지우기 / S-21 부서를 LX 조직도에서 고르기) — 화면 캡처.
   로그인 = 로그인 폼 입력(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음 · 비밀번호는 server/.env 에서 읽고 출력하지 않는다).
   한 번 실행 = 실제 흐름 한 바퀴(쓰기 있음 — 부르는 쪽이 시험 자료를 만들고 끝에서 지운다 · README):
     LX 직원  내 정보(할당 · 90% 넘음 · 부서 고르기) → 늘리기 요청 창 → 보내기 → 프로젝트 기록(90% 한 줄 · 지우기) → 메모 지우기 → 파일 올리기 → 창
     LX 관리자 계정 관리 — 저장 용량 요청(목록 · 서랍) → 승인 · 계정(저장 용량 칸 · 할당 정하기) · 부서 목록(출처 · 올리기 미리 보기 — 바꾸지 않음)
     LX 직원  대시보드 알림 한 줄 · 내 정보 '지난 요청 승인'
     로그인 전 가입 신청 — 부서 칸에서 목록 고르기(보내지 않음)
   사용: node docs/superpowers/final/process/impl-5/account-extras/shoot.mjs [--base https://app.land-xi.dev] [--only staff,admin,after,signup]
   결과: img/after-{이름}-{1440|390}.png · 콘솔 JSON 줄(제목 · 금지어 · 가로 넘침 · 화면 오류 · 한 단어 줄) */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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
const PID = arg('--project', 'prj_3fdba452d5');               // 비닐하우스 2026(test@lx.or.kr 가 프로젝트장)
const ONLY = new Set(arg('--only', 'staff,admin,after,signup').split(','));
const PUBLIC = BASE.includes('land-xi.dev');
const ADMIN_BASE = PUBLIC ? 'https://admin.land-xi.dev' : BASE;
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const scanSrc = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;
const out = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-acc-'));
const CSV = path.join(TMP, 'LX 부서 목록.csv');
fs.writeFileSync(CSV, '\ufeff상위,부서,단위\n# 시험 파일 — 미리 보기만(바꾸지 않음)\n,사장,최상위\n사장,부사장,최상위\n부사장,공간정보본부,본부\n공간정보본부,플랫폼사업처,처\n공간정보본부,디지털SOC처,처\n부사장,전남광주지역본부,지역본부\n');

const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
const ctx = async (o) => { const c = await browser.newContext(o); c.setDefaultNavigationTimeout(120000); c.setDefaultTimeout(90000); return c; };
const PC = { viewport: { width: 1440, height: 900 } };
const MOB = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const state = () => {
  const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const t = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
  const lonely = [];
  for (const el of document.querySelectorAll('.k-md p, .k-md li, .k-drawer p, .k-drawer li, .lxp-log p, .lxp-log li, .acc p, .acc li, .lxp-ntc b, .k-dp-h')) {
    if (!vis(el) || el.children.length > 4) continue;
    const r = document.createRange(); r.selectNodeContents(el);
    const lines = [...r.getClientRects()].map((x) => Math.round(x.top)).filter((v, i, a) => a.indexOf(v) === i);
    if (lines.length > 1 && t(el).split(' ').length > 2) {
      const lastTop = Math.max(...lines); const words = [];
      const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) { const rr = document.createRange(); rr.selectNodeContents(c); for (const q of rr.getClientRects()) if (Math.round(q.top) === lastTop) words.push(c.textContent); } else walk(c); } };
      walk(el);
      const last = words.join(' ').trim();
      if (last && !last.includes(' ') && last.length <= 3) lonely.push(t(el).slice(0, 40));
    }
  }
  return { h: [...document.querySelectorAll('h1,h2')].filter(vis).map(t).slice(0, 10), overflowX: document.documentElement.scrollWidth - innerWidth, lonely: lonely.slice(0, 6) };
};
async function shot(page, name, extra = {}) {
  await sleep(900);
  const f = `after-${name}.png`;
  await page.screenshot({ path: path.join(IMG, f) });
  const s = await page.evaluate(state);
  const lint = await page.evaluate(scanSrc).catch(() => null);
  out({ shot: f, ...s, lint: (lint?.hits || []).slice(0, 6), ...extra });
}
const errs = (page, tag) => { page.on('pageerror', (e) => out({ tag, pageerror: String(e).slice(0, 200) })); page.on('console', (m) => { if (m.type() === 'error') out({ tag, console: m.text().slice(0, 160) }); }); };
const projectUrl = (b, id) => `${b}/landxi/v3/lx-project/?project=${id}`;
async function waitProject(page) {
  for (let i = 0; ; i++) {
    try { await page.locator('.lxp-title').waitFor({ timeout: 45000 }); break; } catch (e) { if (i >= 2) throw e; await page.reload(); }
  }
  await page.locator('.lxp-log .lxp-lg li').first().waitFor({ timeout: 60000 }).catch(() => {});
}
async function openMe(page) {
  await page.locator('.k-mast .k-me-b').click();
  await page.locator('.k-me input[name=name]').waitFor();
  await page.locator('.k-me-st').waitFor();
}
const closeModal = async (page) => { await page.keyboard.press('Escape'); await sleep(500); };

let staff = null;
/* ── LX 직원(test@lx.or.kr) — 내 정보 · 늘리기 요청 · 프로젝트 기록(90% 한 줄 · 지우기 · 올린 뒤 창) ── */
if (ONLY.has('staff')) {
  staff = await ctx(PC);
  const page = await staff.newPage(); errs(page, 'staff-1440');
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 60000 });
  await openMe(page);
  await shot(page, 'me-1440');
  await page.locator('.k-me .k-dp-h').waitFor();                  // 부서 목록이 온 뒤
  await page.locator('.k-me input[name=dept]').click();
  await page.locator('.k-me input[name=dept]').fill('플랫폼');
  await page.locator('.k-dp li').first().waitFor();
  await shot(page, 'me-dept-1440');
  await page.locator('.k-me input[name=dept]').fill('');
  // 모바일(같은 로그인 상태) — 요청을 보내기 전 내 정보 · 요청 창
  const mob = await ctx({ ...MOB, storageState: await staff.storageState() });
  const m = await mob.newPage(); errs(m, 'staff-390');
  await m.goto(`${BASE}/landxi/v3/lx-console/`); await m.locator('.k-mast .k-me-b').waitFor();
  await openMe(m);
  await shot(m, 'me-390');
  await m.locator('.k-me-ask').click();
  await m.locator('.k-md input[name=want_gb]').fill('0.05');
  await m.locator('.k-md input[name=why]').fill('2차 학습데이터 추가');
  await shot(m, 'request-390');
  await closeModal(m); await closeModal(m);
  // PC — 요청 창 → 보내기 → 내 정보 '요청 중'
  await page.locator('.k-me-ask').click();
  await page.locator('.k-md input[name=want_gb]').fill('0.05');
  await page.locator('.k-md input[name=why]').fill('2차 학습데이터 추가');
  await shot(page, 'request-1440');
  await page.locator('.k-md button', { hasText: '요청 보내기' }).click();
  await page.locator('.k-me-req').waitFor();
  await shot(page, 'me-pending-1440');
  await closeModal(page);
  // 프로젝트 한 장 — 기록 칸(90% 한 줄 · 지우기) → 메모 지우기 확인 창 → 지운 뒤 기록
  await page.goto(projectUrl(BASE, PID)); await waitProject(page);
  await page.locator('.lxp-log .lxp-quota').waitFor({ timeout: 30000 }).catch(() => {});
  await page.locator('.lxp-log').scrollIntoViewIfNeeded();
  await shot(page, 'log-1440');
  await page.locator('.lxp-log li[data-kind=memo] .lxp-lg-rm').first().click();
  await page.locator('.k-md .lxp-rm-what').waitFor();
  await shot(page, 'remove-1440');
  await page.locator('.k-md button', { hasText: '지우기' }).click();
  await page.locator('.lxp-log li', { hasText: '메모를 지움' }).first().waitFor();
  await page.locator('.lxp-log').scrollIntoViewIfNeeded();
  await shot(page, 'log-removed-1440');
  // 파일 올리기 → 90% 넘음 창(한 번)
  await page.locator('.lxp-log .lxp-lg-wr input[type=file]').setInputFiles({ name: '시험 그림 둘.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('.lxp-log .lxp-lg-s').click();
  await page.locator('.k-md-t', { hasText: '저장 용량이 거의 찼습니다' }).waitFor({ timeout: 30000 });
  await shot(page, 'upload-warn-1440');
  await closeModal(page);
  // 모바일 — 기록 칸 · 파일 지우기 창(지우지 않음)
  await m.goto(projectUrl(BASE, PID)); await waitProject(m);
  await m.locator('.lxp-log').scrollIntoViewIfNeeded();
  await shot(m, 'log-390');
  await m.locator('.lxp-log li[data-kind=file] .lxp-lg-rm').first().click();
  await m.locator('.k-md .lxp-rm-what').waitFor();
  await shot(m, 'remove-390');
  await closeModal(m);
  await mob.close();
}

/* ── LX 관리자 — 계정 관리: 저장 용량 요청(목록 · 서랍 → 승인) · 계정(저장 용량 칸 · 할당 정하기) · 부서 목록 ── */
if (ONLY.has('admin')) {
  const pc = await ctx(PC);
  const page = await pc.newPage(); errs(page, 'admin');
  await frontDoor(page, ADMIN_BASE, 'lxadmin@lx.or.kr', 'admin');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/ops-core/'), { timeout: 60000 });
  await page.goto(`${ADMIN_BASE}/landxi/v3/ops-accounts/#storage`);
  await page.locator('.acc-card[data-tab=storage] tbody tr').first().waitFor({ timeout: 60000 });
  await page.locator('.acc-set__v').waitFor().catch(() => {});
  await shot(page, 'admin-storage-1440');
  await page.locator('.acc-card[data-tab=storage] tbody tr').first().click();
  await page.locator('.k-drawer .acc-do').waitFor();
  await shot(page, 'admin-storage-drawer-1440');
  const mob = await ctx({ ...MOB, storageState: await pc.storageState() });
  const m = await mob.newPage(); errs(m, 'admin-390');
  await m.goto(`${ADMIN_BASE}/landxi/v3/ops-accounts/#storage`);
  await m.locator('.acc-card[data-tab=storage] tbody tr').first().waitFor({ timeout: 60000 });
  await shot(m, 'admin-storage-390');
  await m.locator('.acc-card[data-tab=storage] tbody tr').first().click();
  await m.locator('.k-drawer .acc-do').waitFor();
  await shot(m, 'admin-storage-drawer-390');
  // 승인(실제 흐름)
  await page.locator('.k-drawer .acc-acts .t-btn', { hasText: '승인' }).click();
  await page.locator('.k-toast', { hasText: '할당을 늘렸습니다' }).waitFor({ timeout: 30000 });
  await shot(page, 'admin-storage-approved-1440');
  // 계정 — 저장 용량 칸 · test@ 서랍의 할당 정하기
  await page.goto(`${ADMIN_BASE}/landxi/v3/ops-accounts/#users`);
  await page.locator('.acc-card[data-tab=users] tbody tr').first().waitFor({ timeout: 60000 });
  await page.locator('.acc-org').selectOption('lx').catch(() => {});
  await page.locator('.acc-card[data-tab=users] tbody tr', { hasText: 'test@lx.or.kr' }).waitFor();
  await shot(page, 'admin-users-1440');
  await page.locator('.acc-card[data-tab=users] tbody tr', { hasText: 'test@lx.or.kr' }).click();
  await page.locator('.k-drawer .acc-gb').waitFor();
  await page.locator('.k-drawer .acc-gb').scrollIntoViewIfNeeded();
  await shot(page, 'admin-user-quota-1440');
  // 부서 목록 — 출처 · 찾기 · 올리기 미리 보기(바꾸지 않음)
  await page.goto(`${ADMIN_BASE}/landxi/v3/ops-accounts/#depts`);
  await page.locator('.acc-dp-list li').first().waitFor({ timeout: 60000 });
  await shot(page, 'admin-depts-1440');
  await page.locator('.acc-dp input[type=file]').setInputFiles(CSV);
  await page.locator('.k-md .acc-dp-pv').waitFor();
  await shot(page, 'admin-depts-upload-1440');
  await closeModal(page);
  await m.goto(`${ADMIN_BASE}/landxi/v3/ops-accounts/#depts`);
  await m.locator('.acc-dp-list li').first().waitFor({ timeout: 60000 });
  await shot(m, 'admin-depts-390');
  await mob.close(); await pc.close();
}

/* ── LX 직원 — 승인 알림 한 줄(대시보드) · 내 정보 '지난 요청 승인' ── */
if (ONLY.has('after') && staff) {
  const page = await staff.newPage(); errs(page, 'after');
  await page.goto(`${BASE}/landxi/v3/lx-console/`);
  await page.locator('.lxp-ntc', { hasText: '저장 용량' }).waitFor({ timeout: 60000 });
  await page.locator('a.lc-pr').first().waitFor({ timeout: 60000 }).catch(() => {});
  await shot(page, 'notice-1440');
  await openMe(page);
  await shot(page, 'me-approved-1440');
  await closeModal(page);
  const mob = await ctx({ ...MOB, storageState: await staff.storageState() });
  const m = await mob.newPage(); errs(m, 'after-390');
  await m.goto(`${BASE}/landxi/v3/lx-console/`);
  await m.locator('.lxp-ntc', { hasText: '저장 용량' }).waitFor({ timeout: 60000 });
  await shot(m, 'notice-390');
  await mob.close();
}
if (staff) await staff.close();

/* ── 로그인 전 — 가입 신청(LX 직원)의 부서 칸: 목록에서 고르기(보내지 않음) ── */
if (ONLY.has('signup')) {
  for (const [o, tag] of [[PC, '1440'], [MOB, '390']]) {
    const c = await ctx(o);
    const page = await c.newPage(); errs(page, 'signup-' + tag);
    await page.goto(`${BASE}/landxi/v3/login/` + (PUBLIC ? '' : '?site=app'));
    await page.waitForLoadState('networkidle').catch(() => {});
    for (let i = 0; i < 3 && !(await page.locator('.ac input[name=dept]').count()); i++) { await page.locator('#helpBtn').click(); await sleep(1500); }   // 화면 스크립트가 붙기 전 누름 대비
    await page.locator('.ac input[name=dept]').waitFor();
    await page.locator('.ac input[name=dept]').scrollIntoViewIfNeeded();
    await page.locator('.ac .k-dp-h').waitFor();
    await page.locator('.ac input[name=dept]').click();
    await page.locator('.ac input[name=dept]').fill('지역본부');
    await page.locator('.k-dp li').first().waitFor();
    await shot(page, 'signup-dept-' + tag);
    await c.close();
  }
}
await browser.close();
fs.rmSync(TMP, { recursive: true, force: true });
