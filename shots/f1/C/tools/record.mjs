// F1-C 판정 영상 녹화(≈50s · 1440×900 · Playwright recordVideo) — 실제 서버·실제 GPU 추론·실제 쓰기(브리지)로 한 번에 찍는다.
//   node shots/f1/C/tools/record.mjs            (전제: serve-ops :8702 가동 · standin_worker 가 claim 대기 중)
// 산출: shots/f1/C/f1c.webm · shots/f1/C/marks.json(장면 시각 → 프레임 스트립 추출용)
// 커서는 녹화 전용 오버레이(제품 코드 아님) — headless 영상에 마우스가 안 보여서 넣는다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'shots/f1/C';
const OPS = 'http://localhost:8702';
const B = OPS + '/landxi/ops/bridge';
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
const J1_SHARDS = Number(process.env.J1_SHARDS || 170);   // GPU 한 장(전력 규칙) · 녹화 중 실측 ≈ 13.5 칩/s → ≈ 12.5s
const AOI = { type: 'Polygon', coordinates: [[[126.9440, 35.9950], [126.9490, 35.9950], [126.9490, 35.9990], [126.9440, 35.9990], [126.9440, 35.9950]]] };

await fetch(B + '/worker/reset', { method: 'POST' });
const tok = (await (await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-admin', password: PW }) })).json()).token;
const submit = (label, shards) => fetch(B + '/api/v1/jobs', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ kind: 'infer', model_id: 'car_v2_obb', imagery_id: 'axis-iksan-hwangdeung', aoi: AOI, priority: 0, label, shards_total: shards }) }).then((r) => r.json());
const jobState = async (id) => (await (await fetch(B + '/api/v1/jobs/' + id, { headers: { authorization: 'Bearer ' + tok } })).json()).state;

// 전력 규칙(2026-09-26): 두 GPU 가 모두 한가(사용률 < 15%)할 때만 녹화한다 — 다른 에픽의 벤치·추론과 겹치면 동시 고부하 2장이 된다.
{
  const gpus = async () => (await (await fetch(B + '/api/v1/ops/gpus', { headers: { authorization: 'Bearer ' + tok } })).json()).gpus || [];
  let ok = 0; const t = Date.now();
  while (ok < 4) {
    const g = await gpus(); const busy = g.filter((x) => (x.util_pct?.value ?? 100) >= 15).map((x) => `GPU${x.index} ${x.util_pct?.value}%`);
    ok = busy.length ? 0 : ok + 1;
    if (busy.length && (Date.now() - t) % 30000 < 2100) console.log('[wait] GPU 사용 중 — ' + busy.join(' · '));
    if (Date.now() - t > 30 * 60e3) throw new Error('GPU 가 30분 동안 한가하지 않음 — 녹화 중단');
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`[ok] GPU 두 장 한가 · ${(Date.now() - t) / 1000}s 대기`);
}
fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: path.join(OUT, 'raw'), size: { width: 1440, height: 900 } } });
const T0 = Date.now(); const marks = []; const mark = (k) => { marks.push({ k, t: (Date.now() - T0) / 1000 }); console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${k}`); };
await ctx.addInitScript(() => {
  const mk = () => { if (document.getElementById('__cur')) return; const c = document.createElement('div'); c.id = '__cur'; c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.6);z-index:2147483647;pointer-events:none;mix-blend-mode:difference'; document.documentElement.append(c); };
  addEventListener('mousemove', (e) => { mk(); const c = document.getElementById('__cur'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { const c = document.getElementById('__cur'); if (c) { c.style.transform = 'scale(.6)'; setTimeout(() => (c.style.transform = ''), 180); } }, true);
});
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const until = async (sec) => { const w = T0 + sec * 1000 - Date.now(); if (w > 0) await wait(w); };
const moveTo = async (sel, steps = 18) => { const b = await page.locator(sel).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps }); return b; };
const click = async (sel) => { await moveTo(sel); await page.mouse.down(); await page.mouse.up(); };
const ready = () => page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 20000 });

// 0–6s 종이 무대
await page.goto(OPS + '/landxi/ops/login.html'); await ready(); mark('login.ready');
await page.mouse.move(900, 450); await until(2.2);
await moveTo('#id', 24); await page.locator('#id').click(); await page.keyboard.type('lx-admin', { delay: 70 });
await page.locator('#pw').click(); await page.keyboard.type(PW, { delay: 45 });
await until(5.9);
// 6–9s 반전 → 운영 현황
await click('#go'); mark('flip.start');
await page.waitForFunction(() => document.documentElement.dataset.flip === 'done', null, { timeout: 8000 }); mark('flip.done');
await page.waitForFunction(() => document.documentElement.dataset.flip === 'grown', null, { timeout: 8000 }); mark('overview.grown');
await page.mouse.move(700, 500, { steps: 20 }); await until(11.0);
// 9–12s 인프라
await click('.og-nav a[data-page="infra"]'); await ready(); mark('infra.ready');
await page.mouse.move(420, 360, { steps: 20 }); await until(12.6);
// 12–30s J1(대체 워커 · 실제 GPU 추론 · GPU 한 장)
const j1 = (await submit('J1 대체 · 황등 car_v2_obb', J1_SHARDS)).job; mark('j1.submit ' + j1.id);
await page.locator(`.q-row[data-job="${j1.id}"]`).waitFor({ timeout: 5000 }); mark('queue.row');
await page.locator('svg.leader').waitFor({ timeout: 20000 }); mark('leader');
await page.mouse.move(640, 330, { steps: 30 });
for (let i = 0; i < 60; i++) { if ((await jobState(j1.id)) === 'done') break; await wait(500); } mark('j1.done');
await wait(3600); mark('util.fall');
// 30–36s 기관·할당
await click('.og-nav a[data-page="tenants"]'); await ready(); mark('tenants.ready');
const j2 = (await submit('J1 후속 · 계량 확인', 60)).job; mark('j2.submit ' + j2.id);
await moveTo('.tn-item[data-t="lx"]'); await wait(1600);
const r = await page.locator('.tn-edit input[type=range]').nth(1).boundingBox();
await page.mouse.move(r.x + r.width * 0.5, r.y + r.height / 2, { steps: 14 }); await page.mouse.down();
await page.mouse.move(r.x + r.width * 0.16, r.y + r.height / 2, { steps: 26 }); await page.mouse.up(); mark('slider');
await wait(700);
await page.locator('.tn-save input').click(); await page.keyboard.type('lx 월 GPU 상한 시험 · 관제 시연', { delay: 25 });
await click('.tn-save .og-btn'); mark('quota.saved');
await wait(1300);
// 36–46s 배포 제어 · R-1 롤백
await click('.og-nav a[data-page="deploys"]'); await ready(); mark('deploys.ready');
await wait(1200);
await click('.pn-sec .og-btn.is-caution'); await wait(500);
await page.locator('.og-modal input').click(); await page.keyboard.type('2025 드론 결과 재검수 — 2023 항공으로 되돌림', { delay: 18 });
await click('.og-modal .og-btn.is-caution'); mark('rollback');
await page.waitForFunction(() => document.querySelector('[data-k="snapN"]')?.dataset.v === '76,215', null, { timeout: 10000 }); mark('snapshot.76215');
await wait(2400);
// 46–50s P-1 이식
await moveTo('.mx-c[data-card="card-change"][data-tenant="kgz-land"] .mx-port'); await wait(400);
await click('.mx-c[data-card="card-change"][data-tenant="kgz-land"] .mx-port'); mark('port.form');
await wait(900);
await click('[data-k="port-go"]'); mark('port.post');
await page.waitForFunction(() => document.querySelector('.mini-cap')?.textContent.includes('결과 0'), null, { timeout: 10000 }); mark('port.arrived');
await wait(2200); mark('end');

const v = page.video(); await ctx.close(); await browser.close();
const src = await v.path(); fs.copyFileSync(src, path.join(OUT, 'f1c.webm'));
fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify({ at: new Date().toISOString(), j1: j1.id, j1_shards: J1_SHARDS, marks }, null, 1));
console.log('video', path.join(OUT, 'f1c.webm'));
