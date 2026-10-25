// 카드 그림 후보(10-25 · 규칙 기반) — 바깥 주소 · 로그인 폼. LX 직원: 서비스 카드 관리 '카드 그림' 칸(지금 그림 · 다른 후보 셋 · 새 후보 있음 · 두 장 올리기)
// LX 관리자: '이 그림으로' 한 번 눌러 바꾸고 되돌리기 · 배포 신청 승인 화면의 대표 그림 밀어 보기. node cover-cands-check.mjs <그림 폴더> [카드]
import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const CARD = process.argv[3] || 'card-2c5304';
const b = await launch();
const out = { at: new Date().toISOString(), card: CARD, staff: [], admin: {} , errs: [] };
const measure = (page) => page.evaluate(() => {
  const sec = document.querySelector('.lc-cover'); if (!sec) return { sec: false };
  const r0 = sec.getBoundingClientRect();
  const clip = [], ovl = [];
  for (const e of sec.querySelectorAll('*')) {
    const cs = getComputedStyle(e); if (cs.display === 'none' || e.offsetParent === null) continue;
    if (!e.childElementCount && e.textContent.trim() && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && !e.title) clip.push(e.className + ':' + e.textContent.trim().slice(0, 16));
    const r = e.getBoundingClientRect(); if (r.width && (r.right > r0.right + 1 || r.left < r0.left - 1)) clip.push('out ' + e.className);
  }
  const cs = [...sec.querySelectorAll('.lc-cv-c')].map((c) => c.getBoundingClientRect());
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const a = cs[i], c = cs[j]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) ovl.push(`${i}/${j}`); }
  return { sec: true, main: !!sec.querySelector('.lc-cv-main .la-swp'), cands: cs.length, swipesInCands: sec.querySelectorAll('.lc-cv-c .la-swp').length,
    why: [...sec.querySelectorAll('.lc-cv-why')].map((e) => e.textContent), newer: !!sec.querySelector('.lc-new'), two: !!sec.querySelector('.lc-cv-two'),
    use: sec.querySelectorAll('.lc-cv-use').length, clip: [...new Set(clip)], ovl, hscroll: document.documentElement.scrollWidth - innerWidth,
    mainAfter: sec.querySelector('.lc-cv-main .la-swp-r')?.getAttribute('src')?.replace(/^.*\/files\//, '') || null };
});
// LX 직원
{
  const s = await login(b, 'app');
  s.page.on('pageerror', (e) => out.errs.push('staff ' + e));
  for (const [w, hh] of [[1440, 900], [1280, 800], [390, 844]]) {
    await s.page.setViewportSize({ width: w, height: hh });
    await s.page.goto(s.home + `/landxi/v3/lx-cards/?card=${CARD}`, { waitUntil: 'domcontentloaded' });
    await s.page.waitForSelector('.lc-cover', { timeout: 30000 }); await s.page.waitForTimeout(3500);
    const m = await measure(s.page);
    await s.page.locator('.lc-cover').scrollIntoViewIfNeeded();
    await s.page.locator('.lc-cover').screenshot({ path: path.join(OUT, `staff-cover-${w}.png`) });
    out.staff.push({ w, ...m }); console.log('staff', w, JSON.stringify(m));
  }
  await s.ctx.close();
}
// LX 관리자 — 바꾸고 되돌리기 · 배포 신청 승인 화면
{
  const s = await login(b, 'admin');
  s.page.on('pageerror', (e) => out.errs.push('admin ' + e));
  await s.page.setViewportSize({ width: 1440, height: 900 });
  const open = async () => { await s.page.goto(s.home + `/landxi/v3/lx-cards/?card=${CARD}`, { waitUntil: 'domcontentloaded' }); await s.page.waitForSelector('.lc-cover', { timeout: 30000 }); await s.page.waitForTimeout(2500); };
  await open();
  const before = await measure(s.page);
  out.admin.before = before;
  if (before.use) {
    await s.page.locator('.lc-cv-use').first().click();
    await s.page.waitForFunction((a) => document.querySelector('.lc-cv-main .la-swp-r')?.getAttribute('src')?.replace(/^.*\/files\//, '') !== a, before.mainAfter, { timeout: 20000 });
    await s.page.waitForTimeout(2500);
    out.admin.switched = await measure(s.page);
    await s.page.locator('.lc-cover').screenshot({ path: path.join(OUT, 'admin-switched.png') });
    // 되돌리기 — 예전 그림은 다른 후보로 남아 있다
    const back = await s.page.evaluate((a) => [...document.querySelectorAll('.lc-cv-c')].findIndex((c) => c.querySelector('.la-swp-r')?.getAttribute('src')?.endsWith(a)), before.mainAfter);
    out.admin.backIndex = back;
    if (back >= 0) {
      await s.page.locator('.lc-cv-use').nth(back).click();
      await s.page.waitForFunction((a) => document.querySelector('.lc-cv-main .la-swp-r')?.getAttribute('src')?.endsWith(a), before.mainAfter, { timeout: 20000 });
      await s.page.waitForTimeout(1500);
      out.admin.restored = await measure(s.page);
    }
  }
  console.log('admin', JSON.stringify({ before: before.mainAfter, switched: out.admin.switched?.mainAfter, restored: out.admin.restored?.mainAfter, back: out.admin.backIndex }));
  // 배포 신청 승인 — 대표 그림이 원본 ↔ AI 결과 밀어 보기인 신청을 찾아 연다
  await s.page.goto(s.home + '/landxi/v3/ops-infra/#/deploys', { waitUntil: 'domcontentloaded' });
  await s.page.waitForSelector('.rv-tbl tbody tr', { timeout: 30000 }); await s.page.waitForTimeout(1500);
  const n = await s.page.locator('.rv-tbl tbody tr').count();
  let found = -1;
  for (let i = 0; i < Math.min(n, 40); i++) {
    await s.page.locator('.rv-tbl tbody tr').nth(i).click(); await s.page.waitForTimeout(300);
    if (await s.page.locator('.rv-cover--pair .la-swp').count()) { found = i; break; }
  }
  out.admin.approvalRow = found;
  if (found >= 0) {
    await s.page.waitForTimeout(2500);
    out.admin.approval = await s.page.evaluate(() => { const x = document.querySelector('.rv-cover--pair'); const r = x.getBoundingClientRect(); const v = parseFloat(getComputedStyle(x.querySelector('.la-swp')).getPropertyValue('--v'));
      return { w: Math.round(r.width), h: Math.round(r.height), v: Math.round(v), name: document.querySelector('.rv-h h2')?.textContent }; });
    await s.page.screenshot({ path: path.join(OUT, 'admin-approval.png') });
  }
  console.log('approval', found, JSON.stringify(out.admin.approval || null));
  await s.ctx.close();
}
console.log('pageErrors', out.errs.length, out.errs.slice(0, 3));
fs.writeFileSync(path.join(OUT, 'cover-cands.json'), JSON.stringify(out, null, 1));
await b.close();
