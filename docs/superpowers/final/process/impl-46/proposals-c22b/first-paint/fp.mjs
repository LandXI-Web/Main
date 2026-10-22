/* 첫 그림 재기(P8b 13) — 로그인 폼으로 한 번 들어간 뒤, 다른 화면에서 대상 화면으로 넘어갈 때 매 그림(rAF)마다 상태를 적는다.
   blank = 머리줄도 없고 본문 글도 없는 그림 · ld = 가운데 '불러오는 중'(.k-ld 보임) · mast = 머리줄 · ready = 본문 글 40자 이상(머리줄 밖)
   사용: node fp.mjs <out> <role app|gov> <w> <path1,path2,...> [reps] */
const C = await import('file:///E:/Land-XI 플랫폼/01. 디자인/tools/check/common.mjs');
import fs from 'node:fs';
const [out = 'fp', role = 'app', w = '1440', paths = '/landxi/v3/lx-console/', reps = '2', video = '0'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await C.launch();
const [base, id, tenant] = C.LOGIN[role]();
const ctx = await b.newContext({ viewport: { width: +w, height: +w < 600 ? 844 : 900 }, ...(video === '1' ? { recordVideo: { dir: out, size: { width: +w, height: +w < 600 ? 844 : 900 } } } : {}) });
await ctx.addInitScript(() => {
  const T = []; window.__fp = T;
  const t0 = performance.timeOrigin;
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.hidden; };
  const step = () => {
    try {
      const b = document.body;
      const mast = vis(document.querySelector('.k-mast'));
      const ld = [...document.querySelectorAll('.k-ld')].some((x) => vis(x) && !x.hidden);
      const main = document.querySelector('.k-main') || b;
      const txt = main ? (main.innerText || '').replace(/\s+/g, '').length : 0;
      const bg = getComputedStyle(document.documentElement).backgroundColor + '|' + (b ? getComputedStyle(b).backgroundColor : '');
      const pre = !!(b && b.dataset.pre && (!document.querySelector('body > .k-app') || b.classList.contains('gq-boot') || b.classList.contains('acc-boot')));
      T.push([Math.round(performance.now()), mast ? 1 : 0, ld ? 1 : 0, txt, pre ? 1 : 0, bg]);
    } catch { /* */ }
    if (T.length < 4000) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
const p = await ctx.newPage();
await C.frontDoor(p, base, id, tenant ? { tenant, password: C.PW } : { password: C.PW });
await p.waitForTimeout(4000);
const home = new URL(p.url()).origin;
const res = [];
for (let r = 0; r < +reps; r++) {
  for (const path of paths.split(',')) {
    // 다른 화면에서 넘어온다(사람이 메뉴를 누르는 것과 같은 새 문서 열기)
    const nav0 = Date.now();
    await p.goto(home + path, { waitUntil: 'commit' });
    await p.waitForTimeout(7000);
    const tl = await p.evaluate(() => window.__fp || []);
    const first = tl[0]?.[0] ?? null;
    const tMast = tl.find((x) => x[1])?.[0] ?? null;
    const tReady = tl.find((x) => x[1] && x[3] > 40 && !x[2])?.[0] ?? null;
    const ldMs = tl.reduce((a, x, i) => a + (x[2] && tl[i + 1] ? tl[i + 1][0] - x[0] : 0), 0);
    const blankMs = tl.reduce((a, x, i) => a + (!x[1] && x[3] < 5 && !x[4] && tl[i + 1] ? tl[i + 1][0] - x[0] : 0), 0);
    const preMs = tl.reduce((a, x, i) => a + (x[4] && tl[i + 1] ? tl[i + 1][0] - x[0] : 0), 0);
    res.push({ rep: r, path, w: +w, first_frame_ms: first, mast_ms: tMast, ready_ms: tReady, loading_ms: ldMs, blank_ms: blankMs, pre_ms: preMs, frames: tl.length });
    console.log(JSON.stringify(res[res.length - 1]));
  }
}
fs.writeFileSync(out + '/fp-' + role + '-' + w + '.json', JSON.stringify(res, null, 1));
await ctx.close();
await b.close();
