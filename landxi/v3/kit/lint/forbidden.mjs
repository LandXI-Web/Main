/* K16 forbidden.mjs — 금지어 · 첫 뷰 글자 수 · 버튼 수 검사(e2e 보조).
   브라우저: import { scan } from './forbidden.mjs'; scan(document) → { hits[], chars, buttons }
   CLI:     node landxi/v3/kit/lint/forbidden.mjs [--login test@lx.or.kr | --login lxadmin@lx.or.kr | --login sales@lx.or.kr | --login lxadmin@lx.or.kr#namwon]
                 [--tenant namwon] [--site app|admin|gov] [--base URL] [--state state.json] [--mobile] <url>…
            로그인 폼 입력으로 로그인한 뒤 각 url 을 1440×900(또는 390×844)에서 잰다. 세션 주입 없음.
            아이디 = 메일 주소(원칙 77 · 기본 test@lx.or.kr). 옛 아이디 호출(lx-staff · lx-admin · lxadmin · lx-sales · {기관}-manager · '아이디@기관')은
            옛 계정이 사용 중지라 같은 역할의 메일 아이디로 바꿔 부른다. 기관 계정은 '메일#기관' 또는 --tenant.
            LX 계정 = Land-XI 로그인(/landxi/v3/login/ · LX 전용 — 원칙 78) · 기관 계정 = 그 기관 메인의 로그인({기관}.land-xi.dev · 이 PC 는 /landxi/v3/gov-home/?org=).
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
/** 메일 아이디(원칙 77 · 확인 대장 PW-4) — 옛 아이디는 사용 중지(server/migrations/0015_mail_accounts.sql) */
export const MAIL = Object.freeze({ staff: 'test@lx.or.kr', admin: 'lxadmin@lx.or.kr', sales: 'sales@lx.or.kr', tenant: 'lxadmin@lx.or.kr' });
export const DEFAULT_LOGIN = MAIL.staff;
const OLD_LX = { 'lx-staff': MAIL.staff, 'lx-admin': MAIL.admin, lxadmin: MAIL.admin, 'lx-sales': MAIL.sales };
const OLD_TENANT = { 'gj-manager': 'gwangju-jeonnam' };          // 그 밖 옛 기관 아이디 = '{기관}-manager'
/** 아이디 풀기(원칙 77 — 아이디 = 메일 주소 · 옛 호출은 메일 아이디로 바꿔 부른다):
    'test@lx.or.kr' → 메일 아이디(@ 뒤에 점) · 'lxadmin@lx.or.kr#namwon' → 메일 아이디 + 기관 · tenant 인자를 주면 그 기관이 먼저.
    옛 호출: 'lx-staff' → test@lx.or.kr · 'lx-admin' · 'lxadmin' → lxadmin@lx.or.kr · 'lx-sales' → sales@lx.or.kr ·
    'namwon-manager' · 'gj-manager' · 'namwon-manager@namwon' · 'lxadmin@namwon'(옛 '아이디@기관') → 그 기관의 lxadmin@lx.or.kr */
export function parseLogin(login, tenant) {
  let id = String(login || DEFAULT_LOGIN), t = tenant || null;
  const hash = id.lastIndexOf('#');
  if (hash > 0) { t = t || id.slice(hash + 1); id = id.slice(0, hash); }
  else {
    const at = id.lastIndexOf('@');
    if (at > 0 && !id.slice(at + 1).includes('.')) { t = t || id.slice(at + 1); id = id.slice(0, at); }
  }
  if (!id.includes('@')) {                                       // 옛 아이디 → 같은 역할의 메일 아이디
    if (t) id = MAIL.tenant;
    else if (OLD_LX[id]) id = OLD_LX[id];
    else if (OLD_TENANT[id] || /-manager$/.test(id)) { t = OLD_TENANT[id] || id.replace(/-manager$/, ''); id = MAIL.tenant; }
  }
  return { id, tenant: t };
}
/** 입구 — 'app' | 'admin' | 'gov'. 안 주면 계정으로 고른다(기관 있음 → gov · 아이디에 admin → admin · 그 밖 → app — 옛 호출 그대로 같은 첫 화면) */
export const siteFor = (login, site, tenant) => { if (site) return site; const p = parseLogin(login, tenant); return p.tenant ? 'gov' : /admin/.test(p.id) ? 'admin' : 'app'; };
/** 기관 메인 주소(그 기관 모습의 로그인) — 이 PC 는 /landxi/v3/gov-home/?org=&site=gov · 바깥 주소는 https://{기관}.land-xi.dev/(kit/sites.js gov.orgHost 규칙) */
export function orgLoginUrl(base, tenant) {
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(base);
  if (local) return base.replace(/\/+$/, '') + '/landxi/v3/gov-home/?' + new URLSearchParams({ org: tenant, site: 'gov' });
  const u = new URL(base);
  u.hostname = u.hostname.replace(/^[^.]+/, tenant);            // app|admin|gov|{기관}.land-xi.dev → {기관}.land-xi.dev
  return u.origin + '/';
}
/** 로그인 폼 입력 — login = 'test@lx.or.kr'(기본) | 'lxadmin@lx.or.kr' | 'sales@lx.or.kr' | 'lxadmin@lx.or.kr#namwon' · 옛 호출도 받는다(parseLogin) · site = 입구(생략 가능).
    opts = { tenant, password } — 기관 · 비밀번호(생략하면 devPw()). site 자리에 opts 를 바로 줘도 된다: frontDoor(page, base, 'a@b.kr', { tenant: 'namwon' }).
    비밀번호는 출력하지 않는다. 역할 탭 없음(확인 대장 6) — 입구가 로그인 문을 정한다.
    LX 계정: Land-XI 로그인 — 이 PC(localhost · 127.0.0.1)는 ?site= 로 입구를 열고, 바깥 주소(https://app|admin.land-xi.dev)는 주소가 입구.
    기관 계정: 그 기관 메인의 로그인(원칙 78 — Land-XI 로그인은 LX 전용) — 이 PC 는 gov-home(?org=) · 바깥 주소는 {기관}.land-xi.dev. */
export async function frontDoor(page, base, login, site, opts = {}) {
  if (site && typeof site === 'object') { opts = site; site = opts.site; }
  const { id, tenant } = parseLogin(login, opts.tenant);
  const pw = opts.password || await devPw();
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(base);
  if (tenant) {                                                  // 기관 — 기관 메인의 로그인 카드
    await page.goto(orgLoginUrl(base, tenant), { waitUntil: 'domcontentloaded' });
    const idIn = page.locator('.gh-login input[name=login]');
    await idIn.waitFor({ timeout: 30000 });
    await idIn.fill(id);
    await page.locator('.gh-login input[name=password]').fill(pw);
    await Promise.all([page.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/)[a-z-]+\//.test(u.pathname), { timeout: 30000 }).catch(() => null),
      page.locator('.gh-login input[name=password]').press('Enter')]);
    return;
  }
  await page.goto(base + '/landxi/v3/login/' + (local ? '?site=' + siteFor(id, site) : ''), { waitUntil: 'domcontentloaded' });
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
