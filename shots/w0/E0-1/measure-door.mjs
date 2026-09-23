/* E0-1 재판정 프로브 — 기관 문(안내 있음/없음)이 카드 안에 들어오는가 · 로그인 단추 테두리가 그려지는가.
   실행: node shots/w0/E0-1/measure-door.mjs */
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const rows = [];
for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080], [1280, 720], [800, 900]]) for (const deny of [true, false]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
  await p.addInitScript((d) => {
    if (sessionStorage.getItem('g')) return; sessionStorage.setItem('g', '1');
    for (const k of ['lx_logged_in', 'lx_role', 'lx_tenant_session']) localStorage.removeItem(k);
    if (d) { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'admin'); }
  }, deny);
  await p.goto('http://localhost:4173/landxi/proto/' + (deny ? 'portal-dp-nw-farm-25.html' : 'portal-login-namwon.html'));
  await p.waitForSelector('.pl-form .pl-b'); await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const c = document.querySelector('.pl-card'), f = document.querySelector('.pl-form');
    const bt = getComputedStyle(document.querySelector('.pl-b'));
    const cr = c.getBoundingClientRect(), fr = f.getBoundingClientRect();
    const cap = document.querySelector('.pl-face-c').getBoundingClientRect();
    const note = document.querySelector('.pl-note').getBoundingClientRect();
    return { deny: !!document.querySelector('#pl-deny'), cardH: Math.round(cr.height), cardB: Math.round(cr.bottom),
      formB: Math.round(fr.bottom), formScroll: f.scrollHeight, formClient: f.clientHeight,
      noteB: Math.round(note.bottom), capB: Math.round(cap.bottom),
      btn: `${bt.borderTopWidth} ${bt.borderTopStyle} ${bt.borderTopColor} / ${bt.color}`,
      docOver: document.documentElement.scrollHeight - innerHeight };
  });
  rows.push({ vp: `${w}x${h}`, ...r });
  await ctx.close();
}
await b.close();
console.table(rows);
