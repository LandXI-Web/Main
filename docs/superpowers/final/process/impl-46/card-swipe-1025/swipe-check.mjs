// 카드 그림 밀어 보기(10-25 원칙 339) — 바깥 주소 · 로그인 폼(LX 직원). 처음 한 번 원본 → 결과 · 멈춤(되풀이 없음) · 끌기 · 칸 어긋남 · 잘림 · 겹침
// node swipe-check.mjs <그림 폴더> [폭x높이,…] [장수,…]   (비밀번호는 env LX_PW)
import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const sizes = (process.argv[3] || '1920x1080,1440x900,1280x800,390x844').split(',').map((s) => s.split('x').map(Number));
const pers = (process.argv[4] || '2,4,6,8').split(',').map(Number);
const b = await launch(); const s = await login(b, 'app');
const errs = []; s.page.on('pageerror', (e) => errs.push(String(e)));
const vOf = (pg) => pg.evaluate(() => [...document.querySelectorAll('.la-swp')].map((x) => Math.round(parseFloat(getComputedStyle(x).getPropertyValue('--v')) || 0)));
const V = () => vOf(s.page);
const open = async (per) => {
  await s.page.goto(s.home + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
  await s.page.evaluate((p) => localStorage.setItem('lx-analyze.per', String(p)), per);
  await s.page.reload({ waitUntil: 'domcontentloaded' });
  await s.page.waitForSelector('.la-ac', { timeout: 30000 });
};
const res = [];
let gif = false;
for (const [w, hgt] of sizes) {
  await s.page.setViewportSize({ width: w, height: hgt });
  for (const per of (w < 700 ? [4] : pers)) {
    await open(per);
    const tl = []; const t0 = Date.now();
    if (!gif && w === 1440 && per === 4) {                       // 갤러리 움직임(로컬 GIF 재료) — 약 4 s
      fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
      for (let i = 0; i < 32; i++) { await s.page.screenshot({ path: path.join(OUT, 'frames', `f${String(i).padStart(2, '0')}.png`) }); tl.push([Date.now() - t0, await V()]); }
      gif = true;
    } else {
      for (let i = 0; i < 12; i++) { tl.push([Date.now() - t0, await V()]); await s.page.waitForTimeout(300); }
    }
    await s.page.waitForTimeout(1500);
    const end = await V();
    await s.page.waitForTimeout(3000);
    const later = await V();                                          // 되풀이 없음 = 3 s 뒤에도 그대로
    const m = await s.page.evaluate(() => {
      const cards = [...document.querySelectorAll('.la-ac')];
      const parts = ['.la-ac-pic', '.k-sc-t', '.la-ac-line', '.la-ac-hero', '.la-ac-where', '.la-ac-imk', '.k-sc-acts'];
      const rows = {}; for (const c of cards) { const r = c.getBoundingClientRect(); (rows[Math.round(r.top)] ||= []).push(c); }
      const mis = [];
      for (const [top, cs] of Object.entries(rows)) for (const p of parts) {
        const tops = cs.map((c) => { const e = c.querySelector(p); if (!e || getComputedStyle(e).display === 'none') return null; const q = e.getBoundingClientRect(); return [Math.round(q.top), Math.round(q.bottom)]; });
        const ok = tops.filter(Boolean); if (!ok.length) continue;
        const t0 = Math.min(...ok.map((x) => x[0])), t1 = Math.max(...ok.map((x) => x[0])), b0 = Math.min(...ok.map((x) => x[1])), b1 = Math.max(...ok.map((x) => x[1]));
        if (t1 - t0 > 1 || b1 - b0 > 1 || ok.length !== tops.length) mis.push(`${top} ${p}`);
      }
      const clip = [];
      for (const c of cards) for (const e of c.querySelectorAll('*')) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || e.closest('[style*="display: none"]')) continue;
        if (e.offsetParent === null && cs.position !== 'fixed') continue;
        if (!e.childElementCount && e.textContent.trim() && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && !e.title) clip.push(e.className + ':' + e.textContent.trim().slice(0, 20));
        const r = e.getBoundingClientRect(), cr = c.getBoundingClientRect();
        if (r.width && (r.right > cr.right + 1 || r.bottom > cr.bottom + 1)) clip.push('out ' + e.className);
      }
      const swo = [];
      for (const x of document.querySelectorAll('.la-swp')) {
        const br = x.getBoundingClientRect();
        const els = [...x.querySelectorAll('.la-swp-lab, .la-swp-leg')].filter((e) => getComputedStyle(e).display !== 'none' && +getComputedStyle(e).opacity > 0);
        for (const e of els) { const r = e.getBoundingClientRect(); if (r.left < br.left - 1 || r.right > br.right + 1 || r.top < br.top - 1 || r.bottom > br.bottom + 1) swo.push('out ' + e.className); }
        if (els.length === 2) { const [a, c] = els.map((e) => e.getBoundingClientRect()); if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) swo.push('overlap lab/leg'); }
        const cat = x.parentElement.querySelector('.la-ac-cat'); const lab = x.querySelector('.la-swp-lab');
        if (cat && lab && getComputedStyle(lab).display !== 'none') { const a = cat.getBoundingClientRect(), c = lab.getBoundingClientRect(); if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) swo.push('overlap cat/lab'); }
      }
      const sc = document.querySelector('.la-scroll');
      return { n: cards.length, swipes: document.querySelectorAll('.la-swp').length, mis, clip: [...new Set(clip)].slice(0, 10), swo: [...new Set(swo)],
        pageScroll: sc ? sc.scrollHeight - sc.clientHeight : null, hscroll: document.documentElement.scrollWidth - innerWidth };
    });
    const f = `${w}x${hgt}-${w < 700 ? 'phone' : per}.png`;
    await s.page.screenshot({ path: path.join(OUT, f) });
    res.push({ size: `${w}x${hgt}`, per, shot: f, timeline: tl.map(([t, v]) => `${t}ms:${v.slice(0, 3).join('/')}`).join(' '), end, later, ...m });
    const r = res.at(-1);
    console.log(JSON.stringify({ size: r.size, per, n: r.n, swipes: r.swipes, start: tl[0][1].slice(0, 3), mid: tl[3]?.[1].slice(0, 3), end: end.slice(0, 4), later: later.slice(0, 4), mis: r.mis.length, clip: r.clip, swo: r.swo, pageScroll: r.pageScroll, hscroll: r.hscroll }));
  }
}
// 끌기 · 마우스 따라 · 키보드 — 1440 · 4장 첫 카드
await s.page.setViewportSize({ width: 1440, height: 900 });
await open(4); await s.page.waitForSelector('.la-swp'); await s.page.waitForTimeout(3500);
const box = await s.page.locator('.la-swp').first().boundingBox();
const it = {};
await s.page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2); await s.page.waitForTimeout(150);
it.hover30 = (await V())[0];
await s.page.screenshot({ path: path.join(OUT, 'hover-30.png'), clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } });
await s.page.mouse.down(); await s.page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 8 }); await s.page.mouse.up(); await s.page.waitForTimeout(150);
it.drag70 = (await V())[0];
await s.page.mouse.move(box.x + box.width + 300, Math.max(0, box.y - 100)); await s.page.waitForTimeout(800);
it.leave = (await V())[0];
await s.page.locator('.la-swp-in').first().focus(); for (let i = 0; i < 20; i++) await s.page.keyboard.press('ArrowLeft'); await s.page.waitForTimeout(150);
it.keyLeft20 = (await V())[0];
// 자세히 큰 그림(국토 변화)
await s.page.goto(s.home + '/landxi/v3/lx-analyze/?card=card-change', { waitUntil: 'domcontentloaded' });
await s.page.waitForSelector('.la-hero .la-swp', { timeout: 30000 }); await s.page.waitForTimeout(3500);
it.detail = (await V())[0];
it.detailBlocks = await s.page.evaluate(() => document.querySelectorAll('.la-sw').length);
await s.page.screenshot({ path: path.join(OUT, 'detail-change-1440.png') });
// 움직임 줄이기 — 결과 바로
const ctx2 = await b.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 }, storageState: await s.ctx.storageState() });
const p2 = await ctx2.newPage(); await p2.goto(s.home + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('.la-swp'); await p2.waitForTimeout(500);
it.reduced = (await vOf(p2)).slice(0, 4);
await ctx2.close();
console.log(JSON.stringify(it), 'pageErrors', errs.length);
fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify({ at: new Date().toISOString(), base: s.home, res, interact: it, pageErrors: errs }, null, 1));
await s.ctx.close(); await b.close();
