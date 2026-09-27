/* K16 number-lint.mjs — 숫자 정합 검사: 같은 지표(라벨) 다른 값 0.
   큰 숫자 부품(K6 bignum)은 data-metric(라벨) · data-v(값)을 남긴다. 표·카드 숫자는 [data-metric] 를 화면이 달면 함께 잰다.
   브라우저: import { collect, compare } from '/landxi/v3/kit/lint/number-lint.mjs'; collect(document) → [{ metric, v, scope }]
   CLI:     node landxi/v3/kit/lint/number-lint.mjs [--login lx-staff] [--state state.json] <url>…   (여러 화면을 돌며 모은 뒤 비교)
   scope = 가장 가까운 [data-scope](예: 지역 코드) — 지역이 다르면 다른 지표로 본다. */
import { openPages } from './forbidden.mjs';

export function collect(doc = document) {
  return [...doc.querySelectorAll('[data-metric][data-v]')].filter((e) => e.dataset.v !== '').map((e) => ({ metric: e.dataset.metric, v: e.dataset.v, scope: e.closest('[data-scope]')?.dataset.scope || '' }));
}
/** rows = [{ metric, v, scope, url }] → 충돌 목록 */
export function compare(rows) {
  const by = new Map();
  for (const r of rows) { const k = r.metric + '|' + r.scope; if (!by.has(k)) by.set(k, new Map()); by.get(k).set(r.v, [...(by.get(k).get(r.v) || []), r.url || '']); }
  return [...by].filter(([, vs]) => vs.size > 1).map(([k, vs]) => ({ metric: k.split('|')[0], scope: k.split('|')[1], values: Object.fromEntries(vs) }));
}

async function main() {
  const args = process.argv.slice(2);
  const opt = { login: null, state: null };
  const urls = [];
  for (let i = 0; i < args.length; i++) { if (args[i] === '--login') opt.login = args[++i]; else if (args[i] === '--state') opt.state = args[++i]; else urls.push(args[i]); }
  const { browser, page } = await openPages(urls, opt);
  const rows = [];
  for (const u of urls) {
    await page.goto(u, { waitUntil: 'networkidle' }).catch(() => page.goto(u));
    await page.waitForTimeout(3000);
    const got = await page.evaluate(`(${collect.toString()})(document)`);
    rows.push(...got.map((r) => ({ ...r, url: u })));
  }
  await browser.close();
  const bad = compare(rows);
  console.log(JSON.stringify({ metrics: rows.length, conflicts: bad }, null, 1));
  process.exit(bad.length ? 1 : 0);
}
if (typeof process !== 'undefined' && String(process.argv?.[1] || '').endsWith('number-lint.mjs')) main();
