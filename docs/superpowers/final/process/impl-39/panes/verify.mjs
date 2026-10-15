/* 칸 크기 조절 검증 — 바깥 주소 · 역할마다 로그인 한 번 · 화면마다 끌기 전/후 · 키보드 · 기본 크기 같음 · 넘침 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
const C = await import(pathToFileURL('E:/Land-XI 플랫폼/01. 디자인/tools/check/common.mjs').href);
const OUT = process.env.OUT || fileURLToPath(new URL('./shots', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const SIZES = (process.env.SIZES || '1440x900').split(',').map((s) => s.split('x').map(Number));
const SHOTS = process.env.SHOTS !== '0';

/* 화면: [이름, 경로, 준비 함수(선택)] */
const PLAN = {
  app: [
    ['직원-지도서비스', 'lx-map/', async (p) => { await p.waitForTimeout(1500); }],
    ['직원-결과확인', 'lx-review/'],
    ['직원-분석하기-상세', 'lx-analyze/', async (p) => { const a = p.locator('a[href*="?card="]').first(); if (await a.count()) { await a.click(); await p.waitForTimeout(4000); } }],
    ['직원-요청함', 'lx-inbox/'],
    ['직원-서비스카드', 'lx-cards/', async (p) => { const a = p.locator('a[href*="card="]').first(); if (await a.count()) { await a.click(); await p.waitForTimeout(3000); } }],
    ['직원-프로젝트', 'lx-project/?project=prj_2d3939d12a'],
    ['직원-새프로젝트창', 'lx-project/', async (p) => { await p.locator('.lxp-newb').first().click(); await p.waitForTimeout(1500); }],
    ['직원-데이터올리기', 'lx-ingest/?project=prj_aa6c836803&region=41220'],
    ['직원-학습', 'lx-train/?project=prj_2d3939d12a'],
  ],
  admin: [
    ['관리자-대시보드', 'ops-core/'],
    ['관리자-인프라', 'ops-infra/'],
    ['관리자-공유데이터', 'ops-infra/?view=shared'],
    ['관리자-기관한곳', 'ops-infra/?view=tenants', async (p) => { const a = p.locator('a.org-link').first(); if (await a.count()) { await a.click(); await p.waitForTimeout(3500); } }],
    ['관리자-배포', 'ops-infra/?view=deploys', async (p) => { const r = p.locator('.v-deploys tbody tr, [data-deploy], .dep-t tbody tr').first(); if (await r.count()) { await r.click().catch(() => {}); await p.waitForTimeout(1500); } }],
    ['관리자-요청관리', 'ops-core/#/approvals', async (p) => { const r = p.locator('.oc-inbox li button, .oc-inbox tbody tr, .oc-row').first(); if (await r.count()) { await r.click().catch(() => {}); await p.waitForTimeout(1500); } }],
    ['관리자-저장용량', 'ops-accounts/#storage'],
    ['관리자-서비스배포', 'lx-deploy/', async (p) => { await p.locator('#tab-ops').click().catch(() => {}); await p.waitForTimeout(2500); }],
  ],
  gov: [
    ['기관-서비스대시보드', 'gov-select/', async (p) => { const a = p.locator('a[href*="?service="]').first(); if (await a.count()) { await a.click(); await p.waitForTimeout(4500); } }],
    ['기관-필지목록', 'gov-report/'],
    ['기관-행정정보와비교', 'gov-fusion/'],
    ['기관-요청하기', 'gov-request/'],
  ],
  abroad: [['해외-첫화면', 'global/']],
};
const only = (process.env.ONLY || 'app,admin,gov,abroad').split(',');
const pick = process.env.PICK ? new RegExp(process.env.PICK) : null;
const b = await C.launch();
const report = [];
for (const role of only) {
  let s;
  if (role === 'app' && process.env.VIDEO) {
    /* 10초 녹화 — 결과 확인(왼쪽 지도 · 오른쪽 통계) 칸을 끌어 넓히고 줄이고 접고 펴기 */
    const [base, id] = C.LOGIN.app();
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: OUT + '/video', size: { width: 1440, height: 900 } } });
    const vp = await ctx.newPage();
    await C.frontDoor(vp, base, id, { password: C.PW });
    await vp.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }).catch(() => {});
    const home = new URL(vp.url()).origin;
    await vp.goto(home + '/landxi/v3/lx-review/'); await vp.waitForTimeout(6000);
    const hd = vp.locator('.pn-h:not([hidden])').last(); const bb = await hd.boundingBox();
    const y = bb.y + bb.height - 120; let x = bb.x + 5;
    await vp.mouse.move(x, y); await vp.waitForTimeout(600);
    const slide = async (to) => { await vp.mouse.down(); await vp.mouse.move(to, y, { steps: 30 }); await vp.mouse.up(); x = to; await vp.waitForTimeout(700); };
    await slide(x - 260); await slide(x + 380); 
    await vp.mouse.move(x - 2, y); await vp.waitForTimeout(300);
    await vp.locator('.pn-fold').last().click(); await vp.waitForTimeout(1600);
    await vp.locator('.pn-fold').last().click(); await vp.waitForTimeout(1200);
    await hd.dblclick({ position: { x: 5, y: bb.height - 120 } }); await vp.waitForTimeout(1500);
    await vp.close();
    s = { ctx, page: await ctx.newPage(), home };
  } else {
    try { s = await C.login(b, role, { width: SIZES[0][0], height: SIZES[0][1] }); } catch (e) { console.log(role, 'LOGIN FAIL', e.message); continue; }
  }
  const { page, home } = s;
  let errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  for (const [W, Hh] of SIZES) {
    await page.setViewportSize({ width: W, height: Hh });
    for (const [name, path, prep] of PLAN[role]) {
      if (pick && !pick.test(name)) continue;
      errs = [];
      await page.evaluate(() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('lx.panes.')) localStorage.removeItem(k); } catch { /* */ } }).catch(() => {});   // 화면마다 기본 크기에서 시작
      await page.goto(home + '/landxi/v3/' + path, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(role === 'abroad' ? 9000 : 5000);
      if (prep) await prep(page).catch((e) => errs.push('prep ' + e.message));
      await page.waitForTimeout(800);
      const info = await page.evaluate(() => {
        const hs = [...document.querySelectorAll('.pn-h')].filter((x) => !x.hidden && x.getBoundingClientRect().height > 0 && x.getBoundingClientRect().width > 0);
        /* 기본 크기 같음: 부품이 붙인 것(위치 기준 · 클래스)을 잠시 떼고 칸 크기를 다시 잼 */
        const panes = [...document.querySelectorAll('.pn-pane')];
        const r0 = panes.map((p) => { const r = p.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
        const rel = [...document.querySelectorAll('[data-pn-rel]')];
        rel.forEach((x) => { x.style.position = ''; });
        const cls = panes.map((p) => [...p.classList].filter((c) => c.startsWith('pn-')));
        panes.forEach((p, i) => p.classList.remove(...cls[i]));
        const r1 = panes.map((p) => { const r = p.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
        rel.forEach((x) => { x.style.position = 'relative'; });
        panes.forEach((p, i) => p.classList.add(...cls[i]));
        const same = r0.every((v, i) => v[0] === r1[i][0] && v[1] === r1[i][1]);
        /* 위치 기준을 바꾼 칸 안에, 그 칸을 기준으로 삼는 다른 떠 있는 요소가 있나 */
        const moved = rel.flatMap((x) => [...x.querySelectorAll('*')].filter((d) => !d.classList.contains('pn-h') && getComputedStyle(d).position === 'absolute' && d.offsetParent === x && !d.closest('.pn-h')).map((d) => d.className.toString().slice(0, 40)));
        return { n: hs.length, same, moved: moved.slice(0, 5), handles: hs.map((x) => { const r = x.getBoundingClientRect(); return { cls: x.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }) };
      });
      const rec = { role, name, size: `${W}x${Hh}`, handles: info.n, defaultSame: info.same, moved: info.moved, drags: [], errs: [] };
      const tag = `${name}-${W}`;
      if (SHOTS && W === 1440) await page.screenshot({ path: `${OUT}/${tag}-before.png` });
      for (let i = 0; i < info.handles.length; i++) {
        const hd = info.handles[i];
        const loc = page.locator('.pn-h:not([hidden])').nth(i);
        const sizeOf = () => loc.evaluate((el) => +el.getAttribute('aria-valuenow'));
        const horiz = /pn-h--x/.test(hd.cls);
        const grow = /--right|--bottom/.test(hd.cls) ? 1 : -1;   // 이 방향으로 끌면 칸이 커짐
        const s0 = await sizeOf();
        /* 끌기(마우스) — 손잡이 위쪽(접기 단추를 피해) */
        const vh = page.viewportSize().height;
        const top = Math.max(hd.y, 70), bot = Math.min(hd.y + hd.h, vh - 8);
        const cx = hd.x + hd.w / 2, cy = horiz ? Math.round(top + (bot - top) * (hd.h < 200 ? 0.85 : 0.6)) : hd.y + hd.h / 2;   // 아래 구석(XI ChatGEO 단추)을 피해
        const ex = horiz ? cx + grow * 120 : hd.x + Math.min(hd.w - 4, hd.w * 0.3);
        const sx = horiz ? cx : hd.x + Math.min(hd.w - 4, hd.w * 0.3);
        const ey = horiz ? cy : cy + grow * 120;
        await page.mouse.move(sx, cy); await page.mouse.down(); await page.mouse.move(ex, ey, { steps: 8 }); await page.mouse.up();
        await page.waitForTimeout(400);
        const s1 = await sizeOf();
        const ovf = await page.evaluate(() => {
          const d = document.documentElement; const over = d.scrollWidth > d.clientWidth + 1;
          const main = document.querySelector('.k-main, main'); const mo = main ? main.scrollWidth > main.clientWidth + 1 : false;
          return { page: over, main: mo };
        });
        if (SHOTS && W === 1440 && i === 0) await page.screenshot({ path: `${OUT}/${tag}-after.png` });
        /* 줄이기도 */
        { const r = await loc.boundingBox(); const px = horiz ? r.x + r.width / 2 : sx, py = horiz ? cy : r.y + r.height / 2;
          await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(horiz ? px - grow * 400 : px, horiz ? py : py - grow * 400, { steps: 8 }); await page.mouse.up(); }
        await page.waitForTimeout(300);
        const s2 = await sizeOf();
        const ovf2 = await page.evaluate(() => { const d = document.documentElement; return d.scrollWidth > d.clientWidth + 1; });
        if (SHOTS && W === 1440 && i === 0) await page.screenshot({ path: `${OUT}/${tag}-small.png` });
        /* 키보드 */
        await loc.focus();
        const key = horiz ? (grow > 0 ? 'ArrowRight' : 'ArrowLeft') : (grow > 0 ? 'ArrowDown' : 'ArrowUp');
        await page.keyboard.press(key); await page.keyboard.press(key);
        await page.waitForTimeout(200);
        const s3 = await sizeOf();
        /* 두 번 누르기 = 기본 */
        { const r = await loc.boundingBox(); if (r) await page.mouse.dblclick(r.x + r.width / 2, horiz ? cy : r.y + r.height / 2).catch(() => {}); }
        await page.waitForTimeout(400);
        const s4 = await sizeOf();
        rec.drags.push({ cls: hd.cls.replace(/pn-h /, ''), s0, grow: s1, shrink: s2, key: s3, reset: s4, overflow: ovf.page || ovf2, mainOverflow: ovf.main });
      }
      rec.errs = errs.slice(0, 5);
      report.push(rec);
      console.log(JSON.stringify(rec));
    }
  }
  await s.ctx.close();
}
await b.close();
fs.writeFileSync(process.env.REPORT || `${OUT}/report-${Date.now()}.json`, JSON.stringify(report, null, 1));
