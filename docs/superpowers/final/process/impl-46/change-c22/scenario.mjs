// 국토 변화 탐지 §7 2~5단계 — 지도 서비스 + XI ChatGEO(로그인 폼 · 실제 화면 조작). 시간 · 답 · 그림을 남긴다.
// node docs/superpowers/final/process/impl-46/change-c22/scenario.mjs <base> <project>
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:4173';
const PROJECT = process.argv[3];
const W = +(process.argv[4] || 1920), Hh = +(process.argv[5] || 1080);
const tag = W < 800 ? 'm-' : '';
const out0 = { overlaps: {} };
const shot = async (p, n) => { await p.screenshot({ path: path.join(HERE, 'shots', tag + n) }); try { const m = await p.evaluate(MEASURE); out0.overlaps[n] = (m.overlaps || []).map((o) => `${o.a} × ${o.b} (${o.kind} ${o.w}x${o.h})`); } catch (e) { out0.overlaps[n] = ['measure fail ' + e.message]; } };
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: Hh } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
await page.goto(`${BASE}/landxi/v3/lx-map/?project=${PROJECT}`, { waitUntil: 'domcontentloaded' });
console.log('map open'); await page.locator('.chg-card').waitFor({ timeout: 60000 }); console.log('card');
await page.waitForTimeout(3000);
const out = { steps: [], errs, ov: out0.overlaps };

async function ask(q, name) {
  console.log('ask', q, new Date().toISOString());
  const st = page.locator('#k-chat');
  if (await st.isHidden()) { await page.locator('.k-chat-fab').click(); await page.waitForTimeout(300); }
  await page.locator('.k-ck-i').fill(q);
  const t0 = Date.now();
  await page.locator('.k-ck-i').press('Enter');
  await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state === 'busy', null, { timeout: 10000 }).catch(() => null);
  await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state !== 'busy', null, { timeout: 900000 });
  const ms = Date.now() - t0;
  await page.waitForTimeout(2500);
  const ans = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-a')].map((x) => x.innerText).filter(Boolean).pop() || '');
  const steps = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-plan li, #k-chat ol li')].map((x) => `${x.className}:${x.innerText}`).slice(-4));
  out.steps.push({ q, ms, ans, steps });
  await shot(page, name);
  return ans;
}

await ask('2019년과 2024년 항공영상 비교해서 구역선 안에 새로 생긴 것 찾아줘', '03-chat-run.png');
out.card = await page.locator('.chg-card').innerText().catch(() => '');
await page.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 }).catch(() => null);
// 폴리곤 고르기 — 구역선 안 신축 첫 건(지도 위 도형을 누른다)
const pick = await page.evaluate(() => {
  const C = window.__lxChange; const f = (C.fc?.features || []).find((x) => x.properties.inside_row === '내' && x.properties.type === '신축') || C.fc?.features?.[0];
  return f?.id || null;
});
if (pick) {
  await page.evaluate((id) => document.dispatchEvent(new CustomEvent('kit:change-pick', { detail: { id } })), pick);
  await page.waitForTimeout(2500);
  const box = await page.evaluate((id) => {
    const C = window.__lxChange; const m = C.map; const f = C.fc.features.find((x) => x.id === id);
    const p = m.project([f.properties.lng, f.properties.lat]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y };
  }, pick);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(2500);
  await shot(page, '04-popup-ab.png');
  out.picked = pick;
  out.panel = await page.locator('.chg-panel').innerText().catch(() => '');
  await ask('이거 뭐야?', '05-describe.png');
}
await ask('지목이 도로인데 건물 생긴 필지만 소유구분이랑 같이 표로', '06-table.png');
out.table_rows = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-rows tbody tr')].length);
fs.writeFileSync(path.join(HERE, tag + 'scenario.json'), JSON.stringify(out, null, 1));
await ask('철도용지도 같은 방식으로', '07-rail.png');
await page.waitForURL(/change=/, { timeout: 30000 }).catch(() => null);
await page.locator('.chg-card .chg-big').waitFor({ timeout: 60000 }).catch(() => null);
await page.waitForTimeout(4000);
await shot(page, '08-rail-map.png');
out.rail_url = page.url();
out.rail_card = await page.locator('.chg-card').innerText().catch(() => '');
fs.writeFileSync(path.join(HERE, tag + 'scenario.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 4000));
await browser.close();
