/* E4 카드 대표 그림 교체 — 그린 그림(E:\도로공사\deck_part3b\cards)을 카드 장면으로 올리고(POST /cards/{카드}/scene) 원본 ↔ 결과 짝(PUT swipe) · kec-land 로그인 폼 */
import fs from 'node:fs';
import { open, APP } from './cap.mjs';
const D = 'E:/도로공사/deck_part3b/cards/';
const PLAN = {
  'card-change': { base: 'c1_main_2019.jpg', result: 'c1_main_2025.jpg', cap: '안성시 · 2019 ↔ 2025 항공 · 구역선 안 포장 확대',
    labels: ['2019', '2025'], legend: [['#FF9F1C', '포장 확대'], ['#FFE066', '구역선']],
    thumbs: [['c1_thumb_신축.jpg', '신축 2019→2025'], ['c1_thumb_소실.jpg', '소실 2019→2025'], ['c1_thumb_경작전환.jpg', '경작 전환 2019→2025'], ['c1_thumb_포장확대.jpg', '포장 확대 2019→2025']] },
  'card-ijimok': { base: 'c2_slope_base.jpg', result: 'c2_slope_result.jpg', cap: '안성시 · 2025 항공 · 본선과 법면 필지 판정',
    labels: ['2025 영상', 'AI 판정'], legend: [['#1C7ED6', '지목미정리'], ['#F08C00', '미확정'], ['#0CA678', '정상']], thumbs: [] },
  'card-occupy': { base: 'c3_main_base.jpg', result: 'c3_main_result.jpg', cap: '안성시 · 2025 항공 · 489-9 점유의심',
    labels: ['2025 영상', '목록 필지'], legend: [['#E03131', '점유의심'], ['#FF8787', '목록 필지']], thumbs: [] },
};
const { browser, page } = await open('kec-land@lx.or.kr', 'ROADLAND_PW');
await page.goto(APP + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
const out = {};
const ONLY = process.argv[2];
for (const [cid, p] of Object.entries(PLAN)) {
  if (ONLY && cid !== ONLY) continue;
  const files = [[p.base, p.cap, '0'], ...p.thumbs.map(([f, c]) => [f, c, '0']), [p.result, p.cap, '1']];
  const srcs = {};
  for (const [f, cap, use] of files) {
    const b64 = fs.readFileSync(D + f).toString('base64');
    const r = await page.evaluate(async ({ cid, b64, cap, use, name }) => {
      const m = await import('/landxi/shared/api-v1.js');
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const fd = new FormData(); fd.append('file', new Blob([bin], { type: 'image/jpeg' }), name); fd.append('region', '41550'); fd.append('caption', cap); fd.append('use', use);
      const r = await fetch(m.API.prefix + `/cards/${cid}/scene`, { method: 'POST', body: fd, headers: { authorization: 'Bearer ' + m.session.get().token } });
      const j = await r.json(); if (!r.ok) return { err: j };
      return { scenes: (j.scenes || []).map((s) => s.src) };
    }, { cid, b64, cap, use, name: f });
    if (r.err) { out[cid] = { err: r.err, file: f }; break; }
    srcs[f] = r.scenes[r.scenes.length - 1];
  }
  if (out[cid]?.err) continue;
  const sw = await page.evaluate(async ({ cid, body }) => { const m = await import('/landxi/shared/api-v1.js'); try { const j = await m.api(`/cards/${cid}`, { method: 'PUT', body }); return { scene: j.scene, swipe: j.swipe }; } catch (e) { return { err: e.message }; } },
    { cid, body: { swipe: { before: srcs[p.base], after: srcs[p.result], labels: p.labels, legend: p.legend } } });
  out[cid] = { srcs, sw };
}
fs.writeFileSync(D + (ONLY ? `uploaded-${ONLY}-${Date.now()}.json` : 'uploaded.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
await browser.close();
