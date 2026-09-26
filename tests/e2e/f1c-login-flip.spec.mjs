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
  await expect(page.locator('#sumText .og-tag')).toHaveText(/실측|시연/);
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
  await page.waitForFunction(() => document.documentElement.dataset.flip === 'grown', null, { timeout: 15000 });
  const ms = Number(await page.evaluate(() => document.documentElement.dataset.flipMs));
  expect(ms).toBeGreaterThanOrEqual(1540); expect(ms).toBeLessThanOrEqual(1660);
  expect(page.url()).toBe(OPS + '/landxi/ops/index.html');
  expect(await page.evaluate(() => window.__sameDoc)).toBe('L-1');                                         // 새로고침 0
  expect(await page.evaluate(() => window.__faceCanvas === document.querySelector('.ov-slot canvas.maplibregl-canvas'))).toBe(true);   // 같은 지도(점프 0)
  expect(await page.getAttribute('body', 'data-stage')).toBe('ops');
  await expect(page.locator('.og-mark')).toHaveText('LX/OPS');
  await expect(page.locator('.dm-pt')).toHaveCount(7);   // 국내 7점 + 글로브 인셋(해외 2)
  await expect(page.locator('.ov-a100')).toHaveCount(2);
});
