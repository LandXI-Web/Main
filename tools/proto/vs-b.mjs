/* tools/proto/vs-b.mjs — B-Home 원판 대조.
 *
 *   node tools/serve.mjs &
 *   node tools/proto/vs-b.mjs
 *
 * ① design-canvas/B-Home.dc.html 을 1440×900 으로 렌더 → shots/proto/w-B-template.png
 *    (<x-dc> 래퍼와 없는 support.js 는 무시된다. sat-namwon.jpg 는 img/ 아래로 라우팅한다.)
 * ② B 원판의 실측 지오메트리를 뽑는다 — 마스트헤드 높이 · 바깥 여백 · 타입 계단.
 * ③ 우리 페이지의 같은 상태(2장 아틀라스 · 결과 아틀라스)를 찍는다.
 * ④ 좌: 우리 / 우: B 로 나란히 붙여 shots/proto/w-vs-B.png 로 남긴다.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 4173;
const OUT = path.resolve('shots/proto');
// B 원판 렌더는 우리 산출물 폴더에 남긴다 — design-canvas/ 는 읽기 전용 템플릿이다.
// (리포에 커밋된 design-canvas/renders/B-Home.png 는 전량 0바이트로 깨져 있다.
//  깨져 있으면 같은 렌더의 사본인 Main.png 로 대체한다.)
const RND = path.resolve('shots/proto');
const TPL = path.resolve('design-canvas/renders/Main.png');
const W = 1440, H = 900;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });

/* ── ① B 원판 렌더 ─────────────────────────────────────── */
const bctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const b = await bctx.newPage();
// 존재하지 않는 support.js 는 빈 응답으로, 루트에 없는 아트워크는 img/ 로 돌린다.
await b.route('**/design-canvas/support.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await b.route('**/design-canvas/*.jpg', (r) => {
  const name = r.request().url().split('/').pop();
  return r.continue({ url: `http://localhost:${PORT}/design-canvas/img/${name}` });
});
await b.goto(`http://localhost:${PORT}/design-canvas/B-Home.dc.html`, { waitUntil: 'networkidle' });
await b.addStyleTag({ content: 'x-dc,helmet{display:block}helmet{display:none}body{margin:0}' });
await b.waitForTimeout(2500);
const art = await b.$('x-dc > div');
try {
  await (art || b).screenshot({ path: path.join(RND, 'w-B-template.png') });
  if (fs.statSync(path.join(RND, 'w-B-template.png')).size < 5000) throw new Error('빈 렌더');
} catch (e) {
  console.log('B 렌더 실패 — 커밋된 사본을 쓴다:', e.message);
  fs.copyFileSync(TPL, path.join(RND, 'w-B-template.png'));
}

// ── ② B 실측 ──
const BM = await b.evaluate(() => {
  const root = document.querySelector('x-dc > div');
  const all = [...root.querySelectorAll('*')];
  const px = (v) => parseFloat(v) || 0;
  // 마스트헤드 = 상단에 붙은 border-bottom 을 가진 전폭 블록
  const bar = all.find((e) => {
    const r = e.getBoundingClientRect();
    return r.top < 2 && r.width > 1400 && r.height > 40 && r.height < 110
      && getComputedStyle(e).borderBottomWidth !== '0px';
  });
  const barCS = bar && getComputedStyle(bar);
  // 가장 큰 활자 = 헤드라인
  const sizes = all.map((e) => ({ e, s: px(getComputedStyle(e).fontSize), t: (e.textContent || '').trim() }))
    .filter((x) => x.t && x.t.length < 60);
  sizes.sort((a, c) => c.s - a.s);
  const head = sizes[0];
  // 좌측 색인 — 번호 + 이름 + 우측 정렬 수치를 가진 행 뭉치
  const rows = all.filter((e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return cs.display === 'flex' && r.width > 180 && r.width < 460 && r.height > 14 && r.height < 46
      && cs.borderBottomWidth !== '0px' && r.left < 500;
  });
  const rowRects = rows.map((e) => e.getBoundingClientRect()).sort((a, c) => a.top - c.top);
  // 헤어라인 색 빈도
  const hair = {};
  for (const e of all) {
    const cs = getComputedStyle(e);
    for (const k of ['borderBottomColor', 'borderTopColor']) {
      const wd = px(cs[k.replace('Color', 'Width')]);
      if (wd > 0 && wd <= 1.5) hair[cs[k]] = (hair[cs[k]] || 0) + 1;
    }
  }
  return {
    ink: getComputedStyle(root).color,
    bg: getComputedStyle(root).backgroundColor,
    bar: bar ? { h: Math.round(bar.getBoundingClientRect().height), padX: px(barCS.paddingLeft), border: barCS.borderBottomColor } : null,
    headline: head ? { px: head.s, family: getComputedStyle(head.e).fontFamily.split(',')[0], weight: getComputedStyle(head.e).fontWeight, left: Math.round(head.e.getBoundingClientRect().left), text: head.t.slice(0, 24) } : null,
    typeScale: [...new Set(sizes.map((x) => x.s))].sort((a, c) => c - a).slice(0, 10),
    index: rowRects.length ? {
      n: rowRects.length,
      left: Math.round(rowRects[0].left), width: Math.round(rowRects[0].width),
      rowH: Math.round(rowRects.length > 1 ? rowRects[1].top - rowRects[0].top : rowRects[0].height),
      top: Math.round(rowRects[0].top),
    } : null,
    hair: Object.entries(hair).sort((a, c) => c[1] - a[1]).slice(0, 3),
  };
});
await bctx.close();
console.log('B-Home 실측:', JSON.stringify(BM, null, 1));

/* ── ③ 우리 페이지 ────────────────────────────────────── */
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(`http://localhost:${PORT}/landxi/proto/dive.html`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
await p.waitForTimeout(3000);

const OURS = {};
async function grab(name, q, wait) {
  await p.evaluate((v) => window.__dive.seek(v), q);
  await p.waitForTimeout(wait);
  await p.screenshot({ path: path.join(OUT, name + '.png') });
}
await grab('w-vs-src-atlas', 0.45, 3500);
OURS.atlas = await p.evaluate(() => {
  const px = (v) => parseFloat(v) || 0;
  const cs = getComputedStyle(document.documentElement);
  const bar = document.querySelector('#topbar');
  const li = [...document.querySelectorAll('#index li')];
  const r0 = li[0].getBoundingClientRect(), r1 = li[1].getBoundingClientRect();
  const h1 = document.querySelector('#ch1 .display');
  return {
    ink: getComputedStyle(document.body).color,
    bg: getComputedStyle(document.body).backgroundColor,
    bar: { h: Math.round(bar.getBoundingClientRect().height), padX: px(getComputedStyle(bar).paddingLeft), border: getComputedStyle(bar).borderBottomColor },
    g: px(cs.getPropertyValue('--g')), gap: px(cs.getPropertyValue('--gap')),
    headline: { px: px(getComputedStyle(h1).fontSize), family: getComputedStyle(h1).fontFamily.split(',')[0], weight: getComputedStyle(h1).fontWeight, left: Math.round(h1.getBoundingClientRect().left) },
    index: { n: li.length, left: Math.round(r0.left), width: Math.round(r0.width), rowH: Math.round(r1.top - r0.top), top: Math.round(r0.top) },
    hair: getComputedStyle(li[0]).borderBottomColor,
  };
});
const A = 0.888, B2 = 0.988;
await grab('w-vs-src-res', A + (B2 - A) * (2 / 6), 7000);
await ctx.close();
console.log('우리 실측:', JSON.stringify(OURS, null, 1));

/* ── ④ 나란히 붙이기 ────────────────────────────────────
   ffmpeg drawtext 는 이 환경에서 fontconfig 가 없어 죽는다. 브라우저로 붙인다 —
   어차피 브라우저는 이미 떠 있고, 라벨 서체도 페이지와 같은 것을 쓴다. */
const bpng = path.join(RND, 'w-B-template.png');
const dataURI = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

async function pair(mine, out, label) {
  const src = path.join(OUT, mine);
  if (!fs.existsSync(src) || !fs.existsSync(bpng)) { console.log('건너뜀:', out); return; }
  const c = await browser.newContext({ viewport: { width: W * 2, height: H + 34 }, deviceScaleFactor: 1 });
  const pg = await c.newPage();
  await pg.setContent(`<style>
      *{margin:0;box-sizing:border-box}
      body{background:#fff;font:13px/1 ui-sans-serif,system-ui,sans-serif;color:#111}
      .r{display:flex}
      .h{height:34px;display:flex;align-items:center;padding:0 12px;
         border-bottom:1px solid #ddd;letter-spacing:.02em}
      .c{width:${W}px}
      .c + .c{border-left:1px solid #ddd}
      img{display:block;width:${W}px;height:${H}px}
    </style>
    <div class="r">
      <div class="c"><div class="h">OURS — ${label}</div><img src="${dataURI(src)}"></div>
      <div class="c"><div class="h">B-Home.dc.html (template)</div><img src="${dataURI(bpng)}"></div>
    </div>`);
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: path.join(OUT, out) });
  await c.close();
  console.log('side-by-side', path.join(OUT, out));
}

await pair('w-vs-src-atlas.png', 'w-vs-B.png', 'ch2 atlas');
await pair('w-vs-src-res.png', 'w-vs-B-results.png', 'results atlas');
await browser.close();
