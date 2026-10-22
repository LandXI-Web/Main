/* IMPL 1-1 수용 확인 — 바깥 기관 주소 · 로그인 폼(세션 주입 0):
   ① 로그인 뒤 첫 화면 · 결과 지도까지 누른 수(내 서비스 → 묶음 카드 → '결과 지도') ② 묶음 홈 첫 뷰 글자 수(≤ 400) ③ 두 기관(남원 · 전남광주) 같은 틀
   ④ 층 판 이름(LX 작업 이름 0) · 필지 '바뀜' 한 줄(카드 · 위 띠 · 이력 같은 말) — 결과는 ./flow-check.json */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const b = await launch();
const out = {};
const FIRSTVIEW = () => {   // 화면에 보이는 첫 뷰 본문 글(머리 · 레일 · 바닥 빼고)
  const main = document.querySelector('.gs-page') || document.body; let n = 0;
  const tw = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    const el = t.parentElement; if (!el || el.closest('.gs-foot,.k-mast,.k-rail')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || r.top > innerHeight || r.bottom < 0) continue;
    n += t.nodeValue.replace(/\s+/g, '').length;
  }
  return n;
};
for (const role of ['gov', 'gov2']) {
  const t0 = Date.now();
  const s = await login(b, role);
  const p = s.page; const o = out[role] = { tenant: p._who.tenant, landing: new URL(p.url()).pathname + new URL(p.url()).search, clicks: [] };
  await p.waitForLoadState('domcontentloaded'); await p.waitForTimeout(2500);
  o.landing = new URL(p.url()).pathname + new URL(p.url()).search;
  if (/gov-select/.test(o.landing)) {
    await p.locator('.gs-gcard').first().waitFor({ timeout: 20000 });
    await p.locator('.gs-gcard').first().click(); o.clicks.push('묶음 카드');
  }
  await p.waitForFunction(() => window.__govGroup?.ready, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
  o.group_home = new URL(p.url()).pathname + new URL(p.url()).search;
  o.firstview_chars = await p.evaluate(FIRSTVIEW);
  o.tabs = await p.locator('.gg-tab').allTextContents();
  const map = p.locator('.gg-svc-a a:has-text("결과 지도")').first();
  if (await map.count()) {
    await map.click(); o.clicks.push('결과 지도');
    await p.locator('.xc-tools').waitFor({ timeout: 40000 }); await p.waitForTimeout(3500);
    o.map = new URL(p.url()).pathname;
    await p.locator('.xc-tool[data-tool="layers"]').click(); await p.waitForTimeout(900);
    o.layer_names = await p.locator('.xc-pop .xc-row span').allTextContents();
  }
  o.ms_to_map = Date.now() - t0;
  if (role === 'gov') {
    /* 한 필지 두 문장(IMPL 0-5) — 필지 카드 '바뀜' · XI맵 위 띠 · 이력 바뀜이 같은 말 */
    await p.goto(s.home + '/landxi/v3/gov-report/?service=card-farm&tab=sus', { waitUntil: 'domcontentloaded' });
    await p.locator('#sus-table tbody tr').first().waitFor({ timeout: 30000 });
    await p.locator('#sus-table tbody tr').first().locator('td').nth(1).click();
    await p.locator('#det-x .sp-chg:not([hidden]) b').waitFor({ timeout: 20000 });
    o.parcel = { card: await p.locator('#det-t, .gr-det-t').first().innerText().catch(() => ''), change_card: await p.locator('#det-x .sp-chg b').innerText() };
    await p.locator('#det-x .sp-cmp').click();
    await p.locator('.gx-cmp-t b').waitFor({ timeout: 40000 });
    o.parcel.change_band = await p.locator('.gx-cmp-t b').innerText();
    o.parcel.band_head = await p.locator('.gx-cmp-h').innerText().catch(() => '');
    o.parcel.same = o.parcel.change_card === o.parcel.change_band;
  }
  await s.ctx.close();
}
await b.close();
fs.writeFileSync(path.join(HERE, 'flow-check.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
