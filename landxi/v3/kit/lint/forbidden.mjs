/* K16 forbidden.mjs — 금지어 · 첫 뷰 글자 수 · 버튼 수 검사(e2e 보조).
   브라우저: import { scan } from './forbidden.mjs'; scan(document) → { hits[], chars, buttons }
   CLI:     node landxi/v3/kit/lint/forbidden.mjs [--login lx-staff | --login namwon-manager@namwon] [--state state.json] [--mobile] <url>…
            정문(/landxi/v3/login/) 폼 입력으로 로그인한 뒤 각 url 을 1440×900(또는 390×844)에서 잰다. 세션 주입 없음.
   검사 대상: 본문 글자 · title · aria-label · placeholder · alt. 제외: 개발자 서랍(.k-dev) · [data-lint-skip]. */

export const RULES = [
  ['시연·데모·준비 중', /시연|데모|준비\s?중/],
  ['API', /\bAPI\b|\b(GET|POST|PUT|DELETE)\s+\//],
  ['경로', /\/api\/v1|\b[\w-]+\.(pmtiles|geojson|gpkg|json|csv|parquet|tif|py)\b|\b(results|survey|tiles|tenants)\/[\w-]+|[A-Z]:\\/i],
  ['id', /\b(dp|ap|job|run|cf|u|lxs|lxt)[_-][a-z0-9]{3,}|\bcard-[a-z]+(@[\d.]+)?\b|\bmod-[a-z-]+\b/],
  ['GPU명', /\b(RTX|A6000|Radeon|GeForce|NVIDIA|D3D1\d|ANGLE|SwiftShader|CUDA)\b/i],
  ['p95·ms', /\bp9[59]\b|\b\d+(\.\d+)?\s?ms\b/i],
  ['shard', /\bshards?\b|\bchips?\/s\b/i],
  ['좌표', /\b\d{2,3}\.\d{4,}\s?[,·]\s?\d{2}\.\d{4,}\b|\bz\d{1,2}\.\d\b/],
  ['결손 수', /결손\s?\d/],
  ['계산식', /[=÷×]\s?\d|\d\s?[÷×]\s?\d/],
  ['코드 식별자', /\b[a-z]+_[a-z0-9_]+\b|\b[a-z]+[A-Z][a-z]+[A-Za-z]*\b/],
];

/** 한 문자열에 걸리는 규칙들 */
export const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k);

/** 브라우저 안에서 — 문서 전체 스캔(첫 뷰 · 버튼은 뷰포트 안만) */
export function scan(doc = document, { skip = '.k-dev,[data-lint-skip]' } = {}) {
  const win = doc.defaultView, W = win.innerWidth, H = win.innerHeight;
  const skipped = (el) => !!el.closest?.(skip);
  const visible = (el) => { const cs = win.getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inView = (r) => r.bottom > 0 && r.right > 0 && r.top < H && r.left < W;
  const hits = [];
  // 본문 글자
  const tw = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
  let chars = 0, n;
  while ((n = tw.nextNode())) {
    const el = n.parentElement; if (!el || skipped(el) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || !visible(el)) continue;
    const s = n.nodeValue.trim(); if (!s) continue;
    for (const k of check(s)) hits.push({ rule: k, where: 'text', text: s.slice(0, 80) });
    const rg = doc.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect();
    if (inView(r)) chars += s.replace(/\s/g, '').length;
  }
  // 속성
  for (const el of doc.querySelectorAll('[title],[aria-label],[placeholder],img[alt]')) {
    if (skipped(el)) continue;
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) {
      const v = el.getAttribute(a); if (!v) continue;
      for (const k of check(v)) hits.push({ rule: k, where: a, text: v.slice(0, 80) });
    }
  }
  // 버튼(예산 제외: '오늘' 칸 · 공정 레일 · 탭 · [data-budget-skip])
  const btns = [...doc.querySelectorAll('button, a.t-btn, [role=button]')].filter((b) => !skipped(b) && !b.closest('.k-rail,[role=tablist],[data-budget-skip]') && b.getAttribute('role') !== 'tab' && visible(b) && inView(b.getBoundingClientRect()));
  return { hits, chars, buttons: btns.length };
}

/* ── CLI(playwright) ─────────────────────────────────────────────────────────── */
export async function openPages(urls, { login, state, mobile = false, base = 'http://localhost:4173' } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, ...(state ? { storageState: state } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (login) await frontDoor(page, base, login);
  return { browser, page, errors };
}
/** 정문 폼 입력 로그인 — login = 'lx-staff' | 'namwon-manager@namwon'. 비밀번호 = env LX_PW(개발 기본값 서버 .env). */
export async function frontDoor(page, base, login) {
  const [id, tenant] = login.split('@');
  const pw = process.env.LX_PW || 'landxi-dev-2026';
  await page.goto(base + '/landxi/v3/login/', { waitUntil: 'domcontentloaded' });
  const pickTab = async (re) => { const t = page.getByRole('tab', { name: re }).or(page.getByRole('button', { name: re })).or(page.getByRole('radio', { name: re })); if (await t.count()) await t.first().click(); };
  if (tenant) await pickTab(/기관/); else if (/admin/.test(id)) await pickTab(/관리자/); else await pickTab(/직원|LX/);
  if (tenant) { const tf = page.locator('select[name=tenant], input[name=tenant], select[name=tenant_id], input[name=tenant_id]'); if (await tf.count()) { const el = tf.first(); if ((await el.evaluate((e) => e.tagName)) === 'SELECT') await el.selectOption(tenant); else await el.fill(tenant); } }
  await page.locator('input[name=login], input[autocomplete=username], input[type=text]').first().fill(id);
  await page.locator('input[type=password]').first().fill(pw);
  await Promise.all([page.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 15000 }).catch(() => null), page.locator('input[type=password]').first().press('Enter')]);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = { login: null, state: null, mobile: false };
  const urls = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--login') opt.login = args[++i];
    else if (args[i] === '--state') opt.state = args[++i];
    else if (args[i] === '--mobile') opt.mobile = true;
    else urls.push(args[i]);
  }
  const { browser, page, errors } = await openPages(urls, opt);
  let bad = 0;
  for (const u of urls) {
    await page.goto(u, { waitUntil: 'networkidle' }).catch(() => page.goto(u));
    await page.waitForTimeout(2500);
    const r = await page.evaluate(scanSrc);
    console.log(JSON.stringify({ url: u, chars: r.chars, buttons: r.buttons, forbidden: r.hits.length, hits: r.hits.slice(0, 20), console_errors: errors.splice(0) }, null, 1));
    if (r.hits.length) bad++;
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
}
const scanSrc = `(() => { const RULES = ${'[' + RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',') + ']'}; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;
if (typeof process !== 'undefined' && String(process.argv?.[1] || '').endsWith('forbidden.mjs')) main();
