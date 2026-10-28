/* §4-1 노출 고침 확인 — 새 직원 계정(프로젝트 0)으로 프로젝트 · 현장점검 · 대상지(국토 변화 카드 분석할 곳) · 지도 서비스 네 곳 */
import { open, shot, text, APP } from './cap.mjs';
const { browser, page, errs } = await open();
const out = {};
for (const [k, u, w] of [['V5-empty-projects', '/landxi/v3/lx-project/?scope=all', 5000], ['V5-empty-field', '/landxi/v3/change-field/', 5000],
  ['V5-empty-ranges', '/landxi/v3/lx-analyze/?card=card-change#analyze', 6000], ['V5-empty-mapsvc', '/landxi/v3/lx-map/', 7000]]) {
  await page.goto(APP + u, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(w);
  out[k] = { file: await shot(page, k), text: (await text(page, 'main')).slice(0, 400) };
}
console.log(JSON.stringify({ out, errs }, null, 1));
await browser.close();
