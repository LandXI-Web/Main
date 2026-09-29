// F1-C · L-1 종이 무대 → 로그인 → 1600ms 잉크 반전 → 같은 지도가 운영 현황 배포 지도로(점프 0 · 새로고침 0)
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OPS = 'http://localhost:8702';
const B = OPS + '/landxi/ops/bridge';
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
let child = null;
async function up() { try { return (await fetch(B + '/health')).ok; } catch { return false; } }
test.beforeAll(async () => { if (await up()) return; child = spawn(process.execPath, ['landxi/ops/serve-ops.mjs'], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250)); });
test.afterAll(() => { child?.kill(); });

test('종이 무대: 플랫폼 소개 · 관제 요약 한 줄(실측 시각) · 얼굴판 미니맵 · 봉투', async ({ page }) => {
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(OPS + '/landxi/ops/login.html');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  expect(await page.getAttribute('body', 'data-stage')).toBe('paper');
  await expect(page.locator('.lg-h1')).toContainText('Geo-AI');
  await expect(page.locator('.lg-axes > div')).toHaveCount(3);
  await expect(page.locator('#sumText')).toContainText('마지막 점검');
  await expect(page.locator('#sumText .og-tag')).toHaveText(/실측|예시/);
  await expect(page.locator('#capN')).toHaveText('2,098');
  await expect(page.locator('#cap .cw-prov')).toContainText('실측');
  expect(await page.locator('#faceMap canvas').count()).toBe(1);
  expect(errs).toEqual([]);
});

test('로그인 → 반전 1600±60 · 전환 프레임 12장 상이 쌍 ≥ 8 · index 로 replaceState · 같은 지도', async ({ page }) => {
  await page.goto(OPS + '/landxi/ops/login.html');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  await page.evaluate(() => { window.__sameDoc = 'L-1'; window.__faceCanvas = document.querySelector('#faceMap canvas'); });
  await page.fill('#id', 'lx-admin'); await page.fill('#pw', PW);
  await page.click('#go');
  await page.waitForFunction(() => document.documentElement.dataset.flip === 'running', null, { timeout: 5000 });
  const frames = []; const t0 = Date.now();
  for (let i = 0; i < 12; i++) { frames.push(await page.screenshot({ type: 'jpeg', quality: 40, clip: { x: 0, y: 0, width: 720, height: 450 }, scale: 'css' })); const due = t0 + (i + 1) * 125; const w = due - Date.now(); if (w > 0) await page.waitForTimeout(w); }
  let diff = 0; for (let i = 1; i < frames.length; i++) if (!frames[i].equals(frames[i - 1])) diff++;
  if (process.env.F1C_STRIP) { fs.mkdirSync(process.env.F1C_STRIP, { recursive: true }); frames.forEach((f, i) => fs.writeFileSync(`${process.env.F1C_STRIP}/flip-${String(i).padStart(2, '0')}.jpg`, f)); }
  expect(diff).toBeGreaterThanOrEqual(8);
  // F2-C(must_fix 1): 순수 검정 프레임 0 — 반전 중 모든 프레임에 지도·셸 글자가 있다(프레임 전체 max(RGB) ≥ 24)
  const maxes = await page.evaluate(async (list) => Promise.all(list.map(async (b64) => { const img = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + b64)).blob());
    const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, img.width, img.height).data; let m = 0; for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i], d[i + 1], d[i + 2]); return m; })), frames.map((f) => f.toString('base64')));
  for (const m of maxes) expect(m).toBeGreaterThanOrEqual(24);
  await page.waitForFunction(() => document.documentElement.dataset.flip === 'grown', null, { timeout: 15000 });
  const ms = Number(await page.evaluate(() => document.documentElement.dataset.flipMs));
  expect(ms).toBeGreaterThanOrEqual(1540); expect(ms).toBeLessThanOrEqual(1660);
  const wall = Number(await page.evaluate(() => document.documentElement.dataset.flipWallMs));   // 벽시계(125 ms 연속 스크린샷 부하 속) — 두 프레임까지 허용
  expect(wall).toBeGreaterThanOrEqual(1540); expect(wall).toBeLessThanOrEqual(1740);
  expect(page.url()).toBe(OPS + '/landxi/ops/index.html');
  expect(await page.evaluate(() => window.__sameDoc)).toBe('L-1');                                         // 새로고침 0
  expect(await page.evaluate(() => window.__faceCanvas === document.querySelector('.ov-slot canvas.maplibregl-canvas'))).toBe(true);   // 같은 지도(점프 0)
  expect(await page.getAttribute('body', 'data-stage')).toBe('ops');
  await expect(page.locator('.og-mark')).toHaveText('LX/관리자');
  expect(await page.locator('.dm-pt').count()).toBeGreaterThanOrEqual(7);   // 국내 배포 점(남원 무리 + 광주전남) + 글로브 인셋(해외)
  expect(await page.evaluate(() => document.documentElement.dataset.cam)).toBe('dense');   // F2-C: 전국 → 배포 밀집(호남) 초점
  await expect(page.locator('[data-k="inset"]')).toBeVisible();   // 전국 인셋
  await expect(page.locator('.ov-a100')).toHaveCount(2);
});

test('게이트웨이 직결(v1.1 기본) — 로그인·운영 현황·인프라·기관·배포 5화면 콘솔 오류 0 · 응답 ≥ 400 0 · 본문 글자 null/undefined/NaN 0 · 마스트 게이트웨이 표기', async ({ page }) => {
  const h = await (await fetch(B + '/health')).json(); test.skip(!h.gateway?.full, '게이트웨이 없음 — 브리지 폴백(마스트 브리지 · 메모리)');
  // 2차 판정: 판정관 실행 1회 404 리소스 1건(간헐) — 원인 특정을 위해 오류마다 리소스 URL(m.location().url)과 응답 ≥ 400 URL 을 함께 남긴다
  const errs = []; const bad = []; const words = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(`${page.url()} · ${m.location()?.url || '-'}:${m.location()?.lineNumber ?? ''} · ${m.text()}`));
  page.on('pageerror', (e) => errs.push(`${page.url()} · pageerror · ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${page.url()} · ${r.status()} ${r.request().method()} ${r.url()}`); });
  const scan = (pg) => page.evaluate(() => {   // 본문 텍스트 노드 전수(TreeWalker) — h()/replaceChildren 경로의 null·undefined·NaN 문자열화 0
    const out = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest('script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n = tw.nextNode(); n; n = tw.nextNode()) if (/\bnull\b|undefined|NaN/.test(n.nodeValue)) out.push(`${n.parentElement?.className || n.parentElement?.tagName}: ${n.nodeValue.trim().slice(0, 80)}`);
    return out; }).then((o) => words.push(...o.map((x) => pg + ' · ' + x)));
  await page.goto(OPS + '/landxi/ops/login.html'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  await scan('login');
  await page.fill('#id', 'lx-admin'); await page.fill('#pw', PW); await page.click('#go');
  await page.waitForFunction(() => document.documentElement.dataset.flip === 'grown', null, { timeout: 15000 });
  expect(await page.evaluate(() => document.documentElement.dataset.src)).toBe('gateway');
  for (const pg of ['infra', 'tenants', 'deploys', 'index']) {
    await page.goto(`${OPS}/landxi/ops/${pg}.html`); await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 20000 });
    await expect(page.locator('.og-src')).toContainText('게이트웨이 :8700');
    await page.waitForTimeout(3000);   // 첫 gpu.sample(2 s) · 스토리지 · LLM 행이 그려진 뒤
    await scan(pg);
  }
  const log = { at: new Date().toISOString(), errs, bad, words };
  fs.mkdirSync('shots/f2/C/logs', { recursive: true }); fs.appendFileSync('shots/f2/C/logs/console-5screens.ndjson', JSON.stringify(log) + '\n');
  expect(bad, '응답 ≥ 400').toEqual([]);
  expect(errs, '콘솔 오류').toEqual([]);
  expect(words, '본문 null/undefined/NaN/Infinity').toEqual([]);
});
