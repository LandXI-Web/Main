// F1-C · Ops 무대 법전 — 모션 사다리 · 14px 바닥 · 파이/도넛 0 · 앰버 = Ops 주의 규칙 안 · 잉크/흰/색 분량 · off 모드 콘솔 0 + 쓰기 disabled
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OPS = 'http://localhost:8702';
const B = OPS + '/landxi/ops/bridge';
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
const LADDER = [40, 60, 80, 120, 180, 380, 500, 750, 1000, 1250, 1600, 2400];
const PAGES = ['index', 'infra', 'tenants', 'deploys'];
let child = null;
async function up() { try { return (await fetch(B + '/health')).ok; } catch { return false; } }
test.beforeAll(async () => { if (!(await up())) { child = spawn(process.execPath, ['landxi/ops/serve-ops.mjs'], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250)); } await fetch(B + '/worker/reset', { method: 'POST' }); });
test.afterAll(() => { child?.kill(); });
const login = async () => (await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lxadmin@lx.or.kr', password: PW }) })).json();
async function admin(page) {
  const s = await login();
  await page.addInitScript(([s, base]) => { if (sessionStorage.getItem('f1c')) return; sessionStorage.setItem('f1c', '1'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_ops_base', base); localStorage.setItem('lx_api_base', base); localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_ops_src', 'bridge'); }, [s, B]);
}
async function offMode(page) { await page.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'admin'); localStorage.removeItem('lx_api_session'); }); }

test('소스 스캔: CSS 지속값·JS tween/duration 이 사다리 밖이면 실패 · conic-gradient/파이 0', async () => {
  const css = ['landxi/ops/ops.css', 'landxi/assets/css/v2/ops-grid.css'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const bad = [];
  for (const m of css.matchAll(/(?:animation|transition)\s*:\s*([^;{}]+);/g)) {
    for (const part of m[1].split(/,(?![^(]*\))/)) {
      const t = part.trim().match(/(\d+(?:\.\d+)?)(ms|s)\b|var\(--d-(\d+)\)|var\(--lock-(grow|amber|settle)\)/);
      if (!t) continue;
      const v = t[3] ? Number(t[3]) : t[4] ? { grow: 180, amber: 80, settle: 120 }[t[4]] : t[2] === 's' ? Number(t[1]) * 1000 : Number(t[1]);
      if (!LADDER.includes(v) && v !== 1) bad.push(part.trim());
    }
  }
  expect(bad).toEqual([]);
  expect(css).not.toMatch(/conic-gradient/);
  const js = fs.readdirSync('landxi/ops/js').map((f) => fs.readFileSync(path.join('landxi/ops/js', f), 'utf8')).join('\n') + PAGES.concat('login').map((p) => fs.readFileSync(`landxi/ops/${p}.html`, 'utf8')).join('\n');
  for (const m of js.matchAll(/tween\((\d+)/g)) expect(LADDER).toContain(Number(m[1]));
  for (const m of js.matchAll(/duration:\s*(?:swap \? )?(\d+)/g)) expect([0, ...LADDER]).toContain(Number(m[1]));
  expect(js).not.toMatch(/class:\s*'[^']*(pie|donut)/);
  expect(js).not.toMatch(/setInterval\([^)]*progress/i);
});

for (const pg of PAGES) {
  test(`런타임 법전 — ${pg}: getAnimations 사다리 · 14px 바닥 · 앰버 규칙 · 잉크 분량`, async ({ page }) => {
    const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message));
    await admin(page); await page.goto(`${OPS}/landxi/ops/${pg}.html`);
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
    await page.waitForTimeout(2500);
    const durs = await page.evaluate(() => document.getAnimations().map((a) => a.effect?.getTiming?.().duration).filter((d) => typeof d === 'number'));
    for (const d of durs) expect(LADDER.concat([1])).toContain(Math.round(d));
    const small = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!el.childNodes.length || el.closest('.maplibregl-ctrl, svg title')) continue;
        const txt = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (!txt) continue;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 14) out.push(el.tagName + '.' + el.className + ' ' + fs);
      }
      return out;
    });
    expect(small).toEqual([]);
    const amberOut = await page.evaluate(() => {
      const A = 'rgb(255, 182, 51)'; const ok = '.g-cchip,.q-rec,.og-rec,.og-caution,.is-caution,[data-goal],[data-stage="rolled_back"],[data-caution="1"],[data-blocked="1"],.rg-tick[data-kind="caution"],.og-alerts,.cap-row,.st-ring,.tn-ghost,.dm-leg,.leader,.is-lock,.cw-lock';
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if ([cs.color, cs.borderTopColor, cs.backgroundColor, cs.fill, cs.stroke].includes(A) && !el.closest(ok)) {
          const r = el.getBoundingClientRect(); if (r.width && r.height && cs.visibility !== 'hidden' && cs.opacity !== '0') out.push(el.tagName + '.' + (el.className?.baseVal ?? el.className));
        }
      }
      return out;
    });
    expect(amberOut).toEqual([]);
    const png = await page.screenshot();
    const mix = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height).data; let ink = 0, white = 0, color = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { const r = d[i], g = d[i + 1], bb = d[i + 2]; const l = 0.2126 * r + 0.7152 * g + 0.0722 * bb; const ch = Math.max(r, g, bb) - Math.min(r, g, bb); n++; if (ch > 60) color++; else if (l < 48) ink++; else if (l > 150) white++; }
      return { ink: ink / n, white: white / n, color: color / n };
    }, png.toString('base64'));
    test.info().annotations.push({ type: 'ink-mix', description: `${pg} ink ${(mix.ink * 100).toFixed(1)}% · white ${(mix.white * 100).toFixed(1)}% · color ${(mix.color * 100).toFixed(1)}%` });
    expect(mix.ink).toBeGreaterThan(0.72); expect(mix.color).toBeLessThan(0.07);
    expect(errs).toEqual([]);
  });
}

test('off 모드: 다섯 화면 콘솔 오류 0 · 예시 표기 · 쓰기 버튼 disabled + 이유', async ({ page }) => {
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message));
  await offMode(page);
  await page.goto(OPS + '/landxi/ops/login.html?stay');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  await expect(page.locator('#sumText .og-tag')).toHaveText('예시');
  for (const pg of PAGES) {
    await page.goto(`${OPS}/landxi/ops/${pg}.html`);
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
    await expect(page.locator('.og-src')).toHaveAttribute('data-kind', 'off');
    await expect(page.locator('.og-src')).toContainText('예시');
    const writes = await page.evaluate(() => [...document.querySelectorAll('button[data-why], button[aria-disabled="true"]')].map((b) => [b.disabled, b.title]));
    if (pg !== 'index') { expect(writes.length).toBeGreaterThan(0); for (const [dis, why] of writes) { expect(dis).toBe(true); expect(why).toContain('서버 연결 없음'); } }
  }
  await page.goto(OPS + '/landxi/ops/infra.html'); await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  await page.waitForTimeout(4500);
  await expect(page.locator('.gpu-row [data-k="util"]').first()).toHaveText('0%');   // 리플레이 util 0 고정(지어낸 부하 곡선 0)
  expect(errs).toEqual([]);
});
