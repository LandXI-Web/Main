/* tools/proto/vs-b.mjs — B-Home 원판 대조.
 *
 *   node tools/serve.mjs &
 *   node tools/proto/vs-b.mjs
 *
 * ① design-canvas/B-Home.dc.html 을 1440×900 으로 렌더 → design-canvas/renders/B-Home.png
 *    (<x-dc> 래퍼와 없는 support.js 는 무시된다. sat-namwon.jpg 는 img/ 아래로 라우팅한다.)
 * ② B 원판의 실측 지오메트리를 뽑는다 — 마스트헤드 높이 · 바깥 여백 · 타입 계단.
 * ③ 우리 페이지의 같은 상태(2장 아틀라스 · 결과 아틀라스)를 찍는다.
 * ④ 좌: 우리 / 우: B 로 나란히 붙여 shots/proto/w-vs-B.png 로 남긴다.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PORT = process.env.PORT || 4173;
const OUT = path.resolve('shots/proto');
const RND = path.resolve('design-canvas/renders');
const W = 1440, H = 900;
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RND, { recursive: true });

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
await (art || b).screenshot({ path: path.join(RND, 'B-Home.png') });

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
await browser.close();
console.log('우리 실측:', JSON.stringify(OURS, null, 1));

/* ── ④ 나란히 붙이기 ──────────────────────────────────── */
const FF = process.env.FFMPEG || 'ffmpeg';
const bpng = path.join(RND, 'B-Home.png');
function pair(mine, out, label) {
  const dst = path.join(OUT, out);
  try {
    execFileSync(FF, ['-y', '-loglevel', 'error', '-i', path.join(OUT, mine), '-i', bpng,
      '-filter_complex',
      `[0:v]scale=${W}:-1,pad=${W}:${H + 34}:0:34:white,`
      + `drawtext=text='OURS — ${label}':x=12:y=9:fontsize=17:fontcolor=black[a];`
      + `[1:v]scale=${W}:-1,pad=${W}:${H + 34}:0:34:white,`
      + "drawtext=text='B-Home.dc.html (template)':x=12:y=9:fontsize=17:fontcolor=black[b];"
      + '[a][b]hstack=inputs=2',
      dst], { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log('side-by-side', dst);
  } catch (e) {
    console.log('ffmpeg 실패 — 원본만 남긴다:', String(e.stderr || e).slice(0, 200));
  }
}
pair('w-vs-src-atlas.png', 'w-vs-B.png', 'ch2 atlas');
pair('w-vs-src-res.png', 'w-vs-B-results.png', 'results atlas');
