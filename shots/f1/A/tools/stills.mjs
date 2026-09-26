// F1-A 정지 화면 — 1280/1440/1920 × (남원 전역 도착 · 드론 AOI + 필지 카드 · 공개) + 레퍼런스 나란히(Vantor · kepler.gl)
//   node shots/f1/A/tools/stills.mjs     (off 모드 · 정적 서버 :4173)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'shots/f1/A/stills';
fs.mkdirSync(OUT, { recursive: true });
const XI = 'http://localhost:4173/landxi/xi/index.html';
const b = await chromium.launch({ channel: 'chrome' });
const errs = [];
async function open(w, h, url, { role = 'staff' } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((role) => { localStorage.setItem('lx_api_mode', 'off'); localStorage.removeItem('lx_api_session'); if (role) { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); } else { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); } }, role);
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`${w} ${url}: ${m.text().slice(0, 200)}`); });
  await p.goto(url);
  await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 });
  return { p, ctx };
}
const H = { 1280: 800, 1440: 900, 1920: 1080 };
for (const w of [1280, 1440, 1920]) {
  // 1) 남원 전역 도착(글로브부터 실제로 내려온다)
  { const { p, ctx } = await open(w, H[w], XI);
    await p.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived'), null, { timeout: 45000 });
    await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/city-${w}.png` });
    // 2) 운봉읍 집계 카드
    const pt = await p.evaluate(() => window.__xi.emdPoint('운봉읍', [innerWidth * 0.45, innerHeight * 0.5, innerWidth * 0.8, innerHeight * 0.85]));
    await p.mouse.click(pt[0], pt[1]); await p.waitForTimeout(1100); await p.screenshot({ path: `${OUT}/emd-${w}.png` });
    // 3) AOI 하강 → 필지 카드
    await p.evaluate(() => { window.__mark = performance.now(); }); await p.click('#emd-card .xi-aoi');
    await p.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived' && x.t > window.__mark), null, { timeout: 30000 });
    const pp = await p.evaluate(async () => { const X = window.__xi; const fa = await X.loadA02(); const id = X.state.aoiParcels[0]; const f = fa.features.find((x) => x.properties.id === id); const g = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]; let x = 0, y = 0; g.forEach((c) => { x += c[0]; y += c[1]; }); const q = X.A.project([x / g.length, y / g.length]); return [q.x, q.y]; });
    await p.mouse.click(pp[0], pp[1]);
    await p.waitForFunction(() => document.getElementById('parcel-card').dataset.ready === '1', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/parcel-${w}.png` });
    await ctx.close(); }
  // 4) 공개(게스트 · 로그인 없음)
  { const { p, ctx } = await open(w, H[w], XI + '?public=1', { role: null });
    await p.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived'), null, { timeout: 45000 });
    await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/public-${w}.png` });
    await ctx.close(); }
  console.log('stills', w);
}
await b.close();

// 레퍼런스 나란히(읽기만 — 원본은 F1-C/F1-D 폴더): Vantor(124px 숫자 · 영상 위 HUD) · kepler.gl(유리 패널 · 시간 재생)
const side = (ref, ours, out, lblL, lblR) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', ref, '-i', ours, '-filter_complex',
  `[0]scale=-2:900,pad=iw:960:0:60:white,drawtext=text='${lblL}':x=16:y=18:fontsize=28:fontcolor=black:fontfile='C\\:/Windows/Fonts/malgun.ttf'[a];` +
  `[1]scale=-2:900,pad=iw:960:0:60:white,drawtext=text='${lblR}':x=16:y=18:fontsize=28:fontcolor=black:fontfile='C\\:/Windows/Fonts/malgun.ttf'[b];[a][b]hstack=inputs=2`, out]);
side('shots/f1/C/stills/ref-vantor.png', `${OUT}/city-1440.png`, 'shots/f1/A/side-vantor-vs-xi.png', 'Vantor (레퍼런스)', 'Land-XI XI맵 · 남원 전역 도착');
side('shots/f1/D/ref/kepler-time-playback.png', `${OUT}/parcel-1440.png`, 'shots/f1/A/side-kepler-vs-xi.png', 'kepler.gl (레퍼런스)', 'Land-XI XI맵 · 드론 AOI · 필지 카드 · 스크러버');
console.log('errors', errs.length ? errs : 0);
