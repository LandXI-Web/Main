// 기관 XI맵(서비스로 열기) · LX 직원 XI맵 열기 시간 — 바깥 주소 · 로그인 폼(역할마다 한 번) · PC 1440
//   node measure.mjs <phase> [gov,staff] [N=3] [--log]   →  measure-<phase>.json
//   처음 = 브라우저 보관 · Cache Storage 를 비운 뒤(CDP · 처음 오는 사람과 같음) · 다시 = 한 번 열어 본 뒤. 각각 N번 → 가운데 값.
//   다 그려짐 = 가운데 '불러오는 중'(.k-ld) 없음 + 진행 중 API 0 + 지도 타일 다 옴 · 움직임 없음 · 첫 판 걷힘 이 0.6초 이어진 첫 시각(impl-36 recheck/time.mjs 와 같은 재는 법)
//   ldN = '불러오는 중'이 따로 몇 번 떴나(꺼졌다 다시 켜지면 2)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url));

const APP = 'https://app.land-xi.dev', GOV = 'https://namwon.land-xi.dev';
const PHASE = process.argv[2] || 'before';
const GROUPS = (process.argv[3] || 'gov,staff').split(',');
const N = +(process.argv[4] || 3);
const LOG = process.argv.includes('--log');
const MF = path.join(HERE, `measure-${PHASE}.json`);
const M = fs.existsSync(MF) ? JSON.parse(fs.readFileSync(MF, 'utf8')) : {};
const save = () => fs.writeFileSync(MF, JSON.stringify(M, null, 1));
const CAP = 30000;
const V = '/landxi/v3/';
// 지도 = 타일 다 옴 · 바탕 밖 원천(영상 · 결과 층) 모두 그려짐 · 첫 판 걷힘. 카메라 자리를 함께 돌려줘 0.6초 동안 그대로여야 '다 그려짐'
// (옛 화면의 첫 비행은 프레임마다 jumpTo 라 isMoving 이 거짓 — 비행 중 잠깐 타일이 찬 순간을 '다 그려짐'으로 세지 않게)
const until = () => { const m = window.__xc?.map; if (!m || !window.__xc.boot?.shown || m.isMoving() || !m.areTilesLoaded()) return false;
  try { if (!Object.keys(m.getStyle()?.sources || {}).filter((id) => !/^k-/.test(id)).every((id) => m.isSourceLoaded(id))) return false; } catch { /* */ }
  const c = m.getCenter(); return `${c.lng.toFixed(5)},${c.lat.toFixed(5)},${m.getZoom().toFixed(3)}`; };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }).catch(() => chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }));

async function measure(p, url) {
  const live = new Map(); const all = [];
  const isApi = (u) => u.includes('/api/v1/') && !/stream|events|sse/.test(u);
  const onReq = (r) => { const t = Date.now(); r.__t = t; if (isApi(r.url())) live.set(r, t); };
  const onEnd = (r) => { live.delete(r); all.push({ u: r.url().replace(/^https:\/\/[^/]+/, '').replace(/\?exp=\d+&sig=[0-9a-f]+/, '?(서명)').slice(0, 120), at: r.__t - t0, ms: Date.now() - r.__t, fail: !!r.failure() }); };
  p.on('request', onReq); p.on('requestfinished', onEnd); p.on('requestfailed', onEnd);
  const errs = []; const onErr = (e) => errs.push(String(e).slice(0, 200)); const onCon = (m) => { if (m.type() === 'error' || m.text().includes('[xi-clean]')) errs.push('console: ' + m.text().slice(0, 200)); };
  p.on('pageerror', onErr); p.on('console', onCon);
  const t0 = Date.now();
  try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) { errs.push(String(e).slice(0, 160)); }
  let lastWhat = '', lastSig = null, ldN = 0, wasLd = false, ldMs = 0, stable = null, done = null, last = Date.now();
  const tl = [];
  while (Date.now() - t0 < CAP) {
    const s = await p.evaluate(() => {
      const ld = document.querySelector('.k-ld'); const on = !!(ld && !ld.hidden && ld.getClientRects().length && ld.classList.contains('is-on'));
      return { on, what: (ld?.dataset.what || '') + (document.querySelector('.xc-load') ? '+판' : '') + (window.__xc?.map?.isMoving() ? '+움직임' : ''), boot: { ...(window.__xc?.boot || {}) } };
    }).catch(() => ({ on: false, nav: true }));
    const sig = await p.evaluate(until).catch(() => false);
    const ok = !!sig && sig === lastSig; lastSig = sig;
    const now = Date.now();
    if (s.on && !wasLd) { ldN++; tl.push(`ld on @${now - t0}${s.what ? ' ' + s.what : ''}`); }
    if (s.on && wasLd && s.what !== lastWhat) tl.push(`(${s.what || '-'} @${now - t0})`);
    lastWhat = s.what;
    if (!s.on && wasLd) tl.push(`ld off @${now - t0}`);
    if (s.on) ldMs += now - last;
    wasLd = s.on; last = now;
    if (!s.on && live.size === 0 && ok) { stable ??= now; if (now - stable >= 600) { done = stable - t0; M.__boot = s.boot; break; } } else stable = null;
    await p.waitForTimeout(100);
  }
  const boot = await p.evaluate(() => ({ ...(window.__xc?.boot || {}) })).catch(() => ({}));
  p.off('request', onReq); p.off('requestfinished', onEnd); p.off('requestfailed', onEnd); p.off('pageerror', onErr); p.off('console', onCon);
  all.sort((a, b) => a.at - b.at);
  return { done, ldN, ldMs: Math.round(ldMs), tl, boot, errs, n: all.length, reqs: LOG ? all : all.filter((r) => r.ms > 700).slice(0, 15) };
}

const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
async function run(group, base, login, url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await frontDoor(p, APP, login); await p.waitForTimeout(2000);
  const R = (M[group] = { url, first: [], again: [] });
  for (let i = 0; i < N; i++) {
    for (const pass of ['first', 'again']) {
      if (pass === 'first') { await cdp.send('Network.clearBrowserCache'); await cdp.send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'cache_storage' }).catch(() => {}); }
      await p.goto('about:blank').catch(() => {});
      if (pass === 'again') { await p.goto(base + url, { waitUntil: 'load' }).catch(() => {}); await p.waitForTimeout(4000); await p.goto('about:blank').catch(() => {}); }   // 다시 = 한 번 열어 본 뒤
      const r = await measure(p, base + url);
      R[pass].push(r);
      console.log(group, pass, i, 'done', r.done, 'ldN', r.ldN, 'ldMs', r.ldMs, r.tl.join(' '), 'boot', JSON.stringify(r.boot), r.errs.length ? 'ERR ' + r.errs.join(' | ') : '');
      if (LOG) for (const q of r.reqs) console.log(`   ${String(q.at).padStart(5)} +${String(q.ms).padStart(4)} ${q.u}`);
      save();
    }
  }
  R.median = { first: med(R.first.map((x) => x.done)), again: med(R.again.map((x) => x.done)), ldNmax: Math.max(...[...R.first, ...R.again].map((x) => x.ldN)), errs: [...R.first, ...R.again].reduce((a, x) => a + x.errs.length, 0) };
  console.log(group, 'MEDIAN', JSON.stringify(R.median));
  save();
  await ctx.close();
}

if (GROUPS.includes('gov')) await run('gov', GOV, 'lxadmin@lx.or.kr#namwon', V + 'xi-clean/?service=card-farm');
if (GROUPS.includes('staff')) await run('staff', APP, 'test@lx.or.kr', V + 'xi-clean/');
await browser.close();
