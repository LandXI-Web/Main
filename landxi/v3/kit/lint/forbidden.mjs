/* K16 forbidden.mjs — 금지어 · 첫 뷰 글자 수 · 버튼 수 검사(e2e 보조).
   브라우저: import { scan } from './forbidden.mjs'; scan(document) → { hits[], chars, buttons }
   CLI:     node landxi/v3/kit/lint/forbidden.mjs [--login lx-staff | --login namwon-manager@namwon | --login test@lx.or.kr | --login lxadmin@lx.or.kr#namwon]
                 [--tenant namwon] [--site app|admin|gov] [--base URL] [--state state.json] [--mobile] <url>…
            로그인(/landxi/v3/login/) 폼 입력으로 로그인한 뒤 각 url 을 1440×900(또는 390×844)에서 잰다. 세션 주입 없음.
            아이디 = 메일 주소(원칙 77) · 옛 아이디도 그대로. 기관 계정은 '메일#기관' 또는 --tenant(옛 '아이디@기관'도 그대로 — 기관 id 에는 점이 없다).
            입구(--site)를 안 주면 계정으로 고른다: 기관 있음 → gov · 아이디에 admin → admin · 그 밖 → app.
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
  // 2026-09-29 사용자 — 내부에서 지어낸 말(용어표: E:/Land-XI 플랫폼/CLAUDE.md §2)
  ['지어낸 용어', /관제|생산\s?콘솔|정문|반입|조립|검수|이식|심기|판독|착지|봉투|계보|극장|\bOPS\b/],
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
export async function openPages(urls, { login, state, mobile = false, base = 'http://localhost:4173', site, tenant } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, ...(state ? { storageState: state } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (login) await frontDoor(page, base, login, site, { tenant });
  return { browser, page, errors };
}
/** 개발 계정 비밀번호 — env LX_PW · DEV_PASSWORD, 없으면 server/.env(저장소에 올리지 않는 파일)에서 읽는다 */
async function devPw() {
  if (process.env.LX_PW || process.env.DEV_PASSWORD) return process.env.LX_PW || process.env.DEV_PASSWORD;
  const fs = await import('node:fs');
  try { return fs.readFileSync(new URL('../../../../server/.env', import.meta.url), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m)?.[1] || ''; } catch { return ''; }
}
/** 아이디 풀기(원칙 77 — 아이디 = 메일 주소 · 옛 호출 하위 호환):
    'lx-staff' → 아이디만 · 'namwon-manager@namwon' → 옛 '아이디@기관'(@ 뒤에 점이 없으면 기관 id) ·
    'test@lx.or.kr' → 메일 아이디(@ 뒤에 점) · 'lxadmin@lx.or.kr#namwon' → 메일 아이디 + 기관 · tenant 인자를 주면 그 기관이 먼저 */
export function parseLogin(login, tenant) {
  let id = String(login || ''), t = tenant || null;
  const hash = id.lastIndexOf('#');
  if (hash > 0) { t = t || id.slice(hash + 1); id = id.slice(0, hash); }
  else {
    const at = id.lastIndexOf('@');
    if (at > 0 && !id.slice(at + 1).includes('.')) { t = t || id.slice(at + 1); id = id.slice(0, at); }
  }
  return { id, tenant: t };
}
/** 입구 — 'app' | 'admin' | 'gov'. 안 주면 계정으로 고른다(기관 있음 → gov · 아이디에 admin → admin · 그 밖 → app — 옛 호출 그대로 같은 첫 화면) */
export const siteFor = (login, site, tenant) => { if (site) return site; const p = parseLogin(login, tenant); return p.tenant ? 'gov' : /admin/.test(p.id) ? 'admin' : 'app'; };
/** 로그인 폼 입력 — login = 'lx-staff' | 'lxadmin' | 'namwon-manager@namwon' | 'test@lx.or.kr' | 'lxadmin@lx.or.kr#namwon' · site = 입구(생략 가능).
    opts = { tenant, password } — 기관 · 비밀번호(생략하면 devPw()). site 자리에 opts 를 바로 줘도 된다: frontDoor(page, base, 'a@b.kr', { tenant: 'namwon' }).
    비밀번호는 출력하지 않는다. 역할 탭 없음(확인 대장 6) — 입구가 로그인 문을 정한다. 이 PC(localhost · 127.0.0.1)는 ?site= 로 입구를 열고,
    바깥 주소(https://app|admin|gov.land-xi.dev)는 주소가 입구다(site 는 쓰지 않는다 — base 를 그 입구 주소로 줄 것). */
export async function frontDoor(page, base, login, site, opts = {}) {
  if (site && typeof site === 'object') { opts = site; site = opts.site; }
  const { id, tenant } = parseLogin(login, opts.tenant);
  const pw = opts.password || await devPw();
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(base);
  await page.goto(base + '/landxi/v3/login/' + (local ? '?site=' + siteFor(login, site, opts.tenant) : ''), { waitUntil: 'domcontentloaded' });
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
    else if (args[i] === '--site') opt.site = args[++i];
    else if (args[i] === '--tenant') opt.tenant = args[++i];
    else if (args[i] === '--base') opt.base = args[++i];
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
