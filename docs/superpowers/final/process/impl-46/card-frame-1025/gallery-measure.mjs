// 갤러리 카드 틀 재기 · 그림(LX 직원 로그인 폼)
import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const sizes = (process.argv[3] || '1920x1080,1440x900,1280x800,390x844').split(',').map((s) => s.split('x').map(Number));
const pers = (process.argv[4] || '2,4,6,8').split(',').map(Number);
const b = await launch(); const s = await login(b, 'app');
const res = [];
for (const [w, hgt] of sizes) {
  await s.page.setViewportSize({ width: w, height: hgt });
  for (const per of (w < 700 ? [4] : pers)) {
    await s.page.goto(s.home + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
    await s.page.evaluate((p) => localStorage.setItem('lx-analyze.per', String(p)), per);
    await s.page.reload({ waitUntil: 'domcontentloaded' });
    await s.page.waitForSelector('.la-ac', { timeout: 30000 });
    await s.page.waitForTimeout(2500);
    const m = await s.page.evaluate(() => {
      const cards = [...document.querySelectorAll('.la-ac')];
      const parts = ['.la-ac-pic', '.k-sc-t', '.la-ac-line', '.la-ac-hero', '.la-ac-where', '.la-ac-imk', '.k-sc-acts'];
      const rows = {};
      for (const c of cards) { const r = c.getBoundingClientRect(); (rows[Math.round(r.top)] ||= []).push(c); }
      const mis = [];
      for (const [top, cs] of Object.entries(rows)) for (const p of parts) {
        const tops = cs.map((c) => { const e = c.querySelector(p); if (!e || getComputedStyle(e).display === 'none') return null; const q = e.getBoundingClientRect(); return [Math.round(q.top), Math.round(q.bottom)]; });
        const ok = tops.filter(Boolean); if (!ok.length) continue;
        const t0 = Math.min(...ok.map((x) => x[0])), t1 = Math.max(...ok.map((x) => x[0])), b0 = Math.min(...ok.map((x) => x[1])), b1 = Math.max(...ok.map((x) => x[1]));
        if (t1 - t0 > 1 || b1 - b0 > 1 || ok.length !== tops.length) mis.push(`${top} ${p} top ${t0}-${t1} bot ${b0}-${b1} n${ok.length}/${tops.length}`);
      }
      const clip = [];
      for (const c of cards) for (const e of c.querySelectorAll('*')) {
        if (!e.childElementCount && e.textContent.trim() && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && getComputedStyle(e).display !== 'none' && !e.title) clip.push(e.className + ':' + e.textContent.trim().slice(0, 20));
        const r = e.getBoundingClientRect(), cr = c.getBoundingClientRect();
        if (r.width && (r.right > cr.right + 1 || r.bottom > cr.bottom + 1) && getComputedStyle(e).display !== 'none') clip.push('out ' + e.className);
      }
      const sc = document.querySelector('.la-scroll');
      const g = document.querySelector('.la-acg');
      return { n: cards.length, fit: g.dataset.fit, tight: g.dataset.tight, spill: g.dataset.spill, mis, clip: [...new Set(clip)].slice(0, 10), pageScroll: sc.scrollHeight - sc.clientHeight, hscroll: document.documentElement.scrollWidth - innerWidth,
        sub: !!document.querySelector('.la-sub'), titles: cards.map((c) => { const t = c.querySelector('.k-sc-t'); return getComputedStyle(t).fontSize; }).join(' ') };
    });
    const f = `${w}x${hgt}-${w < 700 ? 'phone' : per}.png`;
    await s.page.screenshot({ path: path.join(OUT, f) });
    res.push({ size: `${w}x${hgt}`, per, shot: f, ...m });
    console.log(JSON.stringify(res.at(-1)));
  }
}
fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify({ at: new Date().toISOString(), res }, null, 1));
await s.ctx.close(); await b.close();
