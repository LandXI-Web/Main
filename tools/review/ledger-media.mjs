// 자산 대장 매체 준비기 — Pages 에서 실제로 열리는 캡처·영상을 landxi/proto/review/assets-thumbs/ 에 만든다.
// 이유: shots/ 는 _config.yml 로 발행에서 빠져 있어 Pages 에서 404 다. 백엔드(:8700·:8702)가 필요한 화면과
//       v3 시안은 Pages 에서 살아 있는 화면으로 열 수 없으므로, 로컬에서 찍은 캡처·영상을 대장이 대신 연다.
// 실행: node tools/review/ledger-media.mjs [--only=stills,video,kakao,login]   (저장소 루트 · ffmpeg 필요 · 카카오 절·정문은 :4173 필요)
// 정문(v3 로그인)은 다른 워크플로가 shots/f3b/login 을 계속 갈아엎으므로 여기서 직접 찍는다(게스트 화면 · 세션 0).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'landxi/proto/review/assets-thumbs');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '--only=stills,video,kakao,login').slice(7).split(',');
const want = (k) => only.includes(k);
const kb = (f) => Math.round(fs.statSync(f).size / 1024);

// 스틸 — 원본(shots/) → 1440 폭 jpg
const STILLS = [
  ['shots/f3b/lx-console/01-first-1440.png', 'v3-lx-console'], ['shots/f3b/lx-console/03-assemble-1440.png', 'v3-lx-console-2'], ['shots/f3b/lx-console/06-sweep-1440.png', 'v3-lx-console-3'],
  ['shots/f3/xi-clean/01-arrive-sweep.png', 'v3-xi-clean'], ['shots/f3/xi-clean/02-ask-list.png', 'v3-xi-clean-2'], ['shots/f3/xi-clean/03-parcel-card.png', 'v3-xi-clean-3'],
  ['shots/f3/ops-core/01-overview.png', 'v3-ops-core'], ['shots/f3/ops-core/02-approvals.png', 'v3-ops-core-2'], ['shots/f3/ops-core/03-infra.png', 'v3-ops-core-3'],
  ['shots/f3b/gov-fusion/d-04-fused.png', 'v3-gov-fusion'], ['shots/f3b/gov-fusion/d-01-land.png', 'v3-gov-fusion-2'], ['shots/f3b/gov-fusion/d-05-ask.png', 'v3-gov-fusion-3'], ['shots/f3b/gov-fusion/d-06-parcel.png', 'v3-gov-fusion-4'],
  // 토스 벤치(toss.im 실측 2026-09-27) — 제안이 빌리는 문법의 장면
  ['shots/bench-toss/home-d-000.png', 'toss-hero'], ['shots/bench-toss/home-d-004.png', 'toss-seq'], ['shots/bench-toss/home-d-016.png', 'toss-shop'],
  ['shots/bench-toss/home-d-030.png', 'toss-ad'], ['shots/bench-toss/home-d-040.png', 'toss-invert'], ['shots/bench-toss/home-d-054.png', 'toss-globe'],
  ['shots/bench-toss/home-d-056.png', 'toss-end'], ['shots/bench-toss/home-d-012.png', 'toss-webgl'], ['shots/bench-toss/asset-d-003.png', 'toss-asset'],
  ['shots/bench-toss/_sheet-home-d.jpg', 'toss-sheet-home'], ['shots/bench-toss/_sheet-sec-d.jpg', 'toss-sheet-sec'], ['shots/bench-toss/_sheet-pos-d.jpg', 'toss-sheet-pos'],
  ['shots/bench-toss/_strip-video-0-12s.jpg', 'toss-strip-video'], ['shots/bench-toss/_sheet-career-d.jpg', 'toss-sheet-career'],
];
// 영상 — 1280 폭 · 무음 · h264 (Pages 용량을 위해 crf 29 · 최대 75 s)
const VIDEOS = [
  ['shots/f3/lx-console/lx-console.mp4', 'v3-lx-console'], ['shots/f3/xi-clean/xi-clean-flow.mp4', 'v3-xi-clean'],
  ['shots/f3/ops-core/ops-core.mp4', 'v3-ops-core'], ['shots/f3b/gov-fusion/gov-fusion.mp4', 'v3-gov-fusion'],
  ['shots/f1/B/f1b.mp4', 'xi-map', 75], ['shots/f2/A/f2a.mp4', 'xi-survey', 75], ['shots/f2/E/f2e.mp4', 'xi-agent', 75], ['shots/f2/C/f2c.mp4', 'ops', 75], ['shots/f2/D/f2d.mp4', 'global', 75],
];
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
if (want('stills')) for (const [src, name] of STILLS) {
  const s = path.join(ROOT, src), o = path.join(OUT, name + '.jpg');
  if (!fs.existsSync(s)) { console.warn('! 원본 없음(건너뜀): ' + src); continue; }
  ff(['-i', s, '-vf', "scale='min(1440,iw)':-2", '-q:v', '4', o]); console.log(`${String(kb(o)).padStart(6)} KB  ${name}.jpg`);
}
if (want('video')) for (const [src, name, t] of VIDEOS) {
  const s = path.join(ROOT, src), o = path.join(OUT, name + '.mp4');
  if (!fs.existsSync(s)) { console.warn('! 원본 없음(건너뜀): ' + src); continue; }
  ff(['-i', s, ...(t ? ['-t', String(t)] : []), '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'medium', '-crf', '29', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', o]);
  console.log(`${String(kb(o)).padStart(6)} KB  ${name}.mp4`);
}
// 카카오 벤치 결정 절 — 로컬 :4173 에서 절 머리를 찍는다(결정 카드 4장의 그림)
if (want('kakao')) {
  const { chromium } = await import('@playwright/test');
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  for (const [anchor, name] of [['spec', 'kakao-sec-spec'], ['specJ', 'kakao-sec-J'], ['specG', 'kakao-sec-G']]) {
    await p.goto(`http://localhost:4173/landxi/proto/review/bench-kakao.html#${anchor}`, { waitUntil: 'load' });
    await p.evaluate((a) => document.getElementById(a)?.scrollIntoView({ block: 'start' }), anchor);
    await p.waitForTimeout(1200);
    const o = path.join(OUT, name + '.jpg'); await p.screenshot({ path: o, type: 'jpeg', quality: 82 }); console.log(`${String(kb(o)).padStart(6)} KB  ${name}.jpg`);
  }
  await b.close();
}
// 정문(v3 로그인) — 3장면(비슈케크 · 남원 · 여수)이 도는 것을 스틸 3 + 스트립 1 + 영상(≈22 s)으로
if (want('login')) {
  const { chromium } = await import('@playwright/test');
  const U = 'http://localhost:4173/landxi/v3/login/';
  const b = await chromium.launch({ channel: 'chrome' });
  const until = (p, id) => p.waitForFunction((r) => window.__login?.plate()?.region === r, id, { timeout: 60000, polling: 200 });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(U, { waitUntil: 'domcontentloaded' });
  const scenes = [['kgz', 'v3-login'], ['namwon', 'v3-login-2'], ['yeosu', 'v3-login-3']];
  for (const [id, name] of scenes) {
    try { await until(p, id); } catch { console.warn('! 장면 안 옴(파일 못 읽음?): ' + id); continue; }
    await p.waitForTimeout(1500);
    const o = path.join(OUT, name + '.jpg'); await p.screenshot({ path: o, type: 'jpeg', quality: 84 }); console.log(`${String(kb(o)).padStart(6)} KB  ${name}.jpg`);
  }
  await ctx.close();
  const have = scenes.map(([, n]) => path.join(OUT, n + '.jpg')).filter((f) => fs.existsSync(f));
  if (have.length) { // 스트립 — 3장면 나란히
    const o = path.join(OUT, 'v3-login-scenes.jpg');
    ff(have.flatMap((f) => ['-i', f]).concat(['-filter_complex', have.map((_, i) => `[${i}:v]scale=720:-2[s${i}]`).join(';') + ';' + have.map((_, i) => `[s${i}]`).join('') + `hstack=inputs=${have.length}`, '-q:v', '4', o]));
    console.log(`${String(kb(o)).padStart(6)} KB  v3-login-scenes.jpg`);
  }
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pm = await m.newPage(); await pm.goto(U, { waitUntil: 'domcontentloaded' }); await pm.waitForTimeout(4000);
  const om = path.join(OUT, 'v3-login-390.jpg'); await pm.screenshot({ path: om, type: 'jpeg', quality: 84 }); console.log(`${String(kb(om)).padStart(6)} KB  v3-login-390.jpg`); await m.close();
  const vdir = path.join(OUT, '_v'); fs.rmSync(vdir, { recursive: true, force: true });
  const vc = await b.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: vdir, size: { width: 1440, height: 900 } } });
  const pv = await vc.newPage(); await pv.goto(U, { waitUntil: 'domcontentloaded' });
  try { await until(pv, 'kgz'); await until(pv, 'namwon'); await until(pv, 'yeosu'); await pv.waitForTimeout(6000); } catch { await pv.waitForTimeout(8000); }
  await vc.close(); await b.close();
  const webm = fs.readdirSync(vdir).find((f) => f.endsWith('.webm'));
  if (webm) { const o = path.join(OUT, 'v3-login.mp4'); ff(['-i', path.join(vdir, webm), '-ss', '0.5', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'medium', '-crf', '29', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', o]); console.log(`${String(kb(o)).padStart(6)} KB  v3-login.mp4`); }
  fs.rmSync(vdir, { recursive: true, force: true });
}
console.log('assets-thumbs 합계 ' + Math.round(fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0) / 1048576) + ' MB');
