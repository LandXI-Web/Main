// 자산 대장 매체 준비기 — Pages 에서 실제로 열리는 캡처·영상을 landxi/proto/review/assets-thumbs/ 에 만든다.
// 이유: shots/ 는 _config.yml 로 발행에서 빠져 있어 Pages 에서 404 다. 서버(:8700)가 있어야 도는 화면은
//       Pages 에서 살아 있는 화면으로 열 수 없으므로, 로컬에서 찍은 캡처·영상을 대장이 대신 연다.
// 대장은 Land-XI 자기 화면만 싣는다 — 다른 회사 사이트 캡처는 만들지 않는다(2026-09-29 사용자).
// 실행: node tools/review/ledger-media.mjs [--only=capture,stills,video,core,r3,legacy,legacy-login]   (저장소 루트 · ffmpeg 필요)
//   capture = 새 화면 17종을 로그인 폼으로 들어가 1440×900 첫 화면을 찍는다(:4173 + 서버 :8700 · server/.env DEV_PASSWORD · 세션 주입 0)
//             → shots/final/ledger/<화면>-1440.png
//   stills  = 그 캡처 → 카드 썸네일 480 폭 WebP(≤ 60 KB) v3-<화면>.webp + 크게 보기용 1440 폭 WebP v3-<화면>-L.webp
//             역할별 통합 영상의 스틸(shots/final/walk-*.png) → walk-*.webp
//   video  = 역할별 통합 영상(로그인부터) · 예전 v2 화면 영상 → 1280 폭 mp4
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'landxi/proto/review/assets-thumbs');
const CAP = path.join(ROOT, 'shots/final/ledger');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CAP, { recursive: true });
const only = (process.argv.slice(2).find((a) => a.startsWith('--only=')) || '--only=stills,video').slice(7).split(',');
const want = (k) => only.includes(k);
const kb = (f) => Math.round(fs.statSync(f).size / 1024);
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });

// 역할 → 새 화면(로그인 폼으로 들어간 뒤 차례로 연다). null = 로그인 없이(게스트)
const ROLES = [
  [null, [['main', 'main/'], ['service-detail', 'service-detail/?card=card-farm'], ['login', 'login/']]],
  [{ id: 'lx-staff' }, [['lx-console', 'lx-console/'], ['lx-ingest', 'lx-ingest/'], ['lx-train', 'lx-train/'], ['lx-review', 'lx-review/'], ['lx-deploy', 'lx-deploy/'], ['xi-clean', 'xi-clean/'], ['help-my', 'help-my/'], ['kit', 'kit/']]],
  [{ tab: 'admin', id: 'lx-admin' }, [['ops-core', 'ops-core/'], ['ops-infra', 'ops-infra/']]],
  [{ id: 'lx-sales' }, [['sales', 'sales/']]],
  [{ tab: 'tenant', id: 'namwon-manager', org: 'namwon' }, [['gov-fusion', 'gov-fusion/'], ['gov-report', 'gov-report/']]],
  [{ tab: 'tenant', id: 'kgz-agri-manager', org: 'kgz-agri' }, [['global', 'global/']]],
];
const WALK = ['walk-guest-01-main', 'walk-guest-02-services', 'walk-guest-03-service-detail', 'walk-guest-04-login', 'walk-staff-01-console', 'walk-staff-02-deploy-check',
  'walk-staff-03-review', 'walk-staff-04-ximap-run', 'walk-gov-01-namwon', 'walk-gov-02-ask', 'walk-gov-03-gwangju', 'walk-admin-01-ops', 'walk-admin-02-approvals', 'walk-admin-03-infra',
  'walk-global-01-ysyk-ata', 'walk-global-02-sprawl'];
const VIDEOS = [
  ['shots/final/walk-guest.mp4', 'walk-guest'], ['shots/final/walk-staff.mp4', 'walk-staff'], ['shots/final/walk-gov.mp4', 'walk-gov'],
  ['shots/final/walk-admin.mp4', 'walk-admin'], ['shots/final/walk-global.mp4', 'walk-global'],
  ['shots/f1/B/f1b.mp4', 'xi-map', 75], ['shots/f2/A/f2a.mp4', 'xi-survey', 75], ['shots/f2/E/f2e.mp4', 'xi-agent', 75], ['shots/f2/C/f2c.mp4', 'ops', 75], ['shots/f2/D/f2d.mp4', 'global', 75],
];

if (want('capture')) {
  const { chromium } = await import('@playwright/test');
  const PW = (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8')) || [])[1]?.trim();
  if (!PW) throw new Error('server/.env DEV_PASSWORD 없음');
  const B = 'http://localhost:4173/landxi/v3/';
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [who, list] of ROLES) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    if (who) {
      await p.goto(B + 'login/', { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.__login?.ready, null, { timeout: 20000 });
      await p.locator(`.seg__c:has(input[value="${who.tab || 'staff'}"])`).click();
      if (who.org) await p.selectOption('#org', who.org);
      await p.fill('#id', who.id); await p.fill('#pw', PW); await p.click('#go');
      await p.waitForURL((u) => !/\/login\//.test(u.pathname), { timeout: 30000 });
      await p.waitForTimeout(2000);
    }
    for (const [id, u] of list) {
      await p.goto(B + u, { waitUntil: 'load' });
      await p.waitForTimeout(['main', 'global', 'xi-clean'].includes(id) ? 12000 : 8000);
      const o = path.join(CAP, `${id}-1440.png`); await p.screenshot({ path: o }); console.log(`capture ${id} → ${p.url().replace(B, '')}`);
    }
    await ctx.close();
  }
  await b.close();
}
const webp = (s, o, w, cap) => { for (const q of [80, 70, 60, 50, 40, 30]) { ff(['-i', s, '-vf', `scale=${w}:-2`, '-c:v', 'libwebp', '-quality', String(q), o]); if (!cap || kb(o) <= cap) break; } console.log(`${String(kb(o)).padStart(6)} KB  ${path.basename(o)}`); };
if (want('stills')) {
  for (const f of fs.readdirSync(CAP).filter((f) => f.endsWith('-1440.png'))) {
    const id = f.replace('-1440.png', ''), s = path.join(CAP, f);
    webp(s, path.join(OUT, `v3-${id}.webp`), 480, 60);
    webp(s, path.join(OUT, `v3-${id}-L.webp`), 1440, 200);
  }
  for (const n of WALK) { const s = path.join(ROOT, 'shots/final', n + '.png'); if (fs.existsSync(s)) webp(s, path.join(OUT, n + '.webp'), 1440, 200); else console.warn('! 원본 없음: ' + n); }
}
if (want('video')) for (const [src, name, t] of VIDEOS) {
  const s = path.join(ROOT, src), o = path.join(OUT, name + '.mp4');
  if (!fs.existsSync(s)) { console.warn('! 원본 없음(건너뜀): ' + src); continue; }
  ff(['-i', s, ...(t ? ['-t', String(t)] : []), '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'medium', '-crf', '29', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', o]);
  console.log(`${String(kb(o)).padStart(6)} KB  ${name}.mp4`);
}
// 코어 차수(9월 29–30일) 증거 스틸 — 코어마다 대표 장면을 카드 480 폭 WebP(≤ 60 KB) core-<이름>.webp + 크게 보기 1440 폭 core-<이름>-L.webp(≤ 200 KB)로.
// 대장 항목 정보(화면 · 이름 · 코어)는 masters.mjs 의 CORE_ITEMS. 코어 영상 2편(core-walk.mp4 · c2-walk.mp4)은 이미 assets-thumbs 에 있다.
const CORE_STILLS = [
  ['shots/core/core-imagery/namwon-ingest-1440.png', 'core-c1-ingest'], ['shots/c2/c2-numbers/prove3/10-xi-head.png', 'core-c1-xi'],
  ['shots/c2/c2-core/p3-gj-q-1.png', 'core-c2-move'], ['shots/c2/c2-vlm-global/prove3/p3-nw-xi-1.png', 'core-c2-chart'], ['shots/c2/c2-report-law/prove2/q6-gj-lease-ok.jpg', 'core-c2-law'],
  ['shots/c2/c2-core/p3-gj-q-11-block-image.png', 'core-c2-vlm'], ['shots/c2/c2-core/p3-gj-q-17-block-file.png', 'core-c2-report'], ['shots/c2/c2-core/p3-ad-3-block-chart.png', 'core-c2-ops'],
  ['shots/c2/c2-vlm-global/k12-kgz-2.png', 'core-c2-en'], ['shots/c2/c2-numbers/prove3/15-yeosu-report-sus.png', 'core-c3-yeosu'],
  ['shots/c2/c2-core/p3-gj-2-cols.png', 'core-c4-cols'], ['shots/c2/c2-core/p3-gj-3-joined.png', 'core-c4-joined'], ['shots/c2/c2-report-law/prove3/adm-1-infra.png', 'core-c6-infra'],
  ['shots/core/core-flow/yeosu-01-staff-plant-1440.png', 'core-c7-apply'], ['shots/core/core-flow/yeosu-admin-flow-1440.png', 'core-c7-flow'],
];
if (want('core')) for (const [src, name] of CORE_STILLS) {
  const s = path.join(ROOT, src); if (!fs.existsSync(s)) { console.warn('! 원본 없음(건너뜀): ' + src); continue; }
  webp(s, path.join(OUT, name + '.webp'), 480, 60); webp(s, path.join(OUT, name + '-L.webp'), 1440, 200);
}
// 백본 3차(9월 30일 저녁) 실증 장면 — 구현에 참여하지 않은 확인자가 로그인 폼으로 들어가 찍은 실제 화면. --only=r3
// 대장 항목 정보는 masters.mjs CORE_ITEMS 의 core-r3-*. 코어 영상 3(r3-walk.mp4)은 assets-thumbs 에 바로 둔다.
const R3_STILLS = [
  ['shots/r3/r3-train/prove4/p1-label-check.jpg', 'core-r3-c5-label'], ['shots/r3/r3-train/prove4/p3-train-epochs.jpg', 'core-r3-c5-train'],
  ['shots/r3/r3-train/prove4/p6-service-made.jpg', 'core-r3-c5-service'], ['shots/r3/r3-train/prove4/p7-apply-wonju-fit.jpg', 'core-r3-c5-apply'],
  ['shots/r3/r3-train/prove4/p12-xi-wonju-survey.jpg', 'core-r3-c5-wonju'], ['shots/r3/r3-train/prove4/p13-admin-flow-done.jpg', 'core-r3-c7-flow'],
  ['shots/r3/r3-xi/prove3/a1-muju-running-6.png', 'core-r3-c1-scope'], ['shots/r3/r3-xi/prove3/c1-muju-emd-done.png', 'core-r3-c1-emd'], ['shots/r3/r3-xi/prove3/d1-drawn-done.png', 'core-r3-c1-draw'],
  ['shots/r3/r3-route/prove2/p2-gj-run1-confirm.png', 'core-r3-c2-confirm'], ['shots/r3/r3-route/prove2/p2-st-in-at-max.png', 'core-r3-c2-honest'], ['shots/r3/r3-route/prove2/p2-gj-m10-보성군.png', 'core-r3-c2-nodata'],
  ['shots/r3/r3-law-report/prove3/02-admin-바깥주소-건축허가-제11조.jpg', 'core-r3-c2-law'], ['shots/r3/r3-law-report/prove3/07-gj-보고서화면-구례군-의심11081.jpg', 'core-r3-c3-report'],
  ['shots/r3/r3-law-report/prove3/05-admin-구례군-공문555.jpg', 'core-r3-c3-letter'],
  ['shots/r3/r3-fusion/prove4/js-3-f5.png', 'core-r3-c4-f5'], ['shots/r3/r3-fusion/prove4/js-L1-논.png', 'core-r3-c4-cond'],
  ['shots/r3/r3-global/prove2/agri-r3-show.png', 'core-r3-c8-register'], ['shots/r3/r3-global/prove2/agri-r4-summary.png', 'core-r3-c8-summary'],
  ['shots/r3/r3-ops/prove3/05-ko-160639-same-as-screen.jpg', 'core-r3-c6-gpu'], ['shots/r3/r3-ops/prove3/06-tenant-table-1923340.jpg', 'core-r3-c6-usage'],
];
if (want('r3')) for (const [src, name] of R3_STILLS) {
  const s = path.join(ROOT, src); if (!fs.existsSync(s)) { console.warn('! 원본 없음(건너뜀): ' + src); continue; }
  webp(s, path.join(OUT, name + '.webp'), 480, 60); webp(s, path.join(OUT, name + '-L.webp'), 1440, 200);
}
// 9월 27일 새 화면 캡처·영상(그때 이름 '시안') — Land-XI 자산이라 그대로 둔다. --only=legacy 로 다시 만든다
const LEGACY_STILLS = [
  ['shots/f3b/lx-console/01-first-1440.png', 'v3-lx-console'], ['shots/f3b/lx-console/03-assemble-1440.png', 'v3-lx-console-2'], ['shots/f3b/lx-console/06-sweep-1440.png', 'v3-lx-console-3'],
  ['shots/f3/xi-clean/01-arrive-sweep.png', 'v3-xi-clean'], ['shots/f3/xi-clean/02-ask-list.png', 'v3-xi-clean-2'], ['shots/f3/xi-clean/03-parcel-card.png', 'v3-xi-clean-3'],
  ['shots/f3/ops-core/01-overview.png', 'v3-ops-core'], ['shots/f3/ops-core/02-approvals.png', 'v3-ops-core-2'], ['shots/f3/ops-core/03-infra.png', 'v3-ops-core-3'],
  ['shots/f3b/gov-fusion/d-04-fused.png', 'v3-gov-fusion'], ['shots/f3b/gov-fusion/d-01-land.png', 'v3-gov-fusion-2'], ['shots/f3b/gov-fusion/d-05-ask.png', 'v3-gov-fusion-3'], ['shots/f3b/gov-fusion/d-06-parcel.png', 'v3-gov-fusion-4'],
];
const LEGACY_VIDEOS = [
  ['shots/f3/lx-console/lx-console.mp4', 'v3-lx-console'], ['shots/f3/xi-clean/xi-clean-flow.mp4', 'v3-xi-clean'],
  ['shots/f3/ops-core/ops-core.mp4', 'v3-ops-core'], ['shots/f3b/gov-fusion/gov-fusion.mp4', 'v3-gov-fusion'],
];
if (want('legacy')) {
  for (const [src, name] of LEGACY_STILLS) { const s = path.join(ROOT, src), o = path.join(OUT, name + '.jpg'); if (!fs.existsSync(s)) { console.warn('! 원본 없음(건너뜀): ' + src); continue; } ff(['-i', s, '-vf', "scale='min(1440,iw)':-2", '-q:v', '4', o]); console.log(`${String(kb(o)).padStart(6)} KB  ${name}.jpg`); }
  for (const [src, name] of LEGACY_VIDEOS) { const s = path.join(ROOT, src), o = path.join(OUT, name + '.mp4'); if (!fs.existsSync(s)) { console.warn('! 원본 없음(건너뜀): ' + src); continue; } ff(['-i', s, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'medium', '-crf', '29', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', o]); console.log(`${String(kb(o)).padStart(6)} KB  ${name}.mp4`); }
}
// 9월 27일 새 로그인 캡처 — 3장면(비슈케크 · 남원 · 여수)이 도는 것을 스틸 3 + 스트립 1 + 영상(≈22 s)으로
if (want('legacy-login')) {
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
