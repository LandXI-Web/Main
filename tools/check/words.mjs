/* 금칙어 검사(GPT 전수 검사 제안 · 바퀴 4-1 '외부 검수 보완' — numbers.mjs 옆) — 배포(커밋 · 게이트웨이 재시작) 때 돌린다.
   바깥 주소(app · admin · {기관}.land-xi.dev)를 로그인 폼으로 열어(세션 주입 없음) 주요 화면 · 상세 화면 · 관리자 개선 후보를 보고
   화면에 보이는 글(본문 · title · aria-label · placeholder · alt)에서 금칙어를 센다:
     결재 · 반려 · 현장 확인 · 시연 · 데모 · 준비 중 · 검증 정확도 · 무허가 건축 의심
   빼는 곳: 개발자 서랍(.k-dev) · [data-lint-skip] · 사용자가 쓴 말 그대로([data-user-text] — 예: 개선 후보의 '질문 원문').
   응답 문구: 화면이 받은 서버 JSON 응답에서 사람이 읽는 칸(message · text · title · label · line · note · why · hint · sub · answer …)의
   글도 같은 금칙어로 세어 따로 적는다(경고 — 화면에 안 나온 값일 수 있음). 화면 글에 금칙어가 있거나 화면 오류(콘솔 오류)가 있으면 종료 코드 1.
   사용: node tools/check/words.mjs [--app https://app.land-xi.dev] [--admin https://admin.land-xi.dev] [--gov https://namwon.land-xi.dev] [--tenant namwon] [--json 파일]
   비밀번호는 env LX_PW / DEV_PASSWORD 또는 server/.env 의 DEV_PASSWORD(화면 · 출력에 적지 않는다). */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const HW = process.env.LX_HW_BROWSERS || 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD && !process.env.LX_PW) {
  try { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; } catch { /* 없음 */ }
}
process.env.LX_PW ||= process.env.DEV_PASSWORD || '';
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const HOST = { app: arg('--app', 'https://app.land-xi.dev'), admin: arg('--admin', 'https://admin.land-xi.dev'), gov: arg('--gov', 'https://namwon.land-xi.dev') };
const TENANT = arg('--tenant', 'namwon');
const PW = process.env.LX_PW;

/** 금칙어(사용자 규칙 · 원칙 135 · 187 · CLAUDE.md §2) — 이름 → 식 */
export const WORDS = [
  ['결재', /결재/], ['반려', /반려/], ['현장 확인', /현장\s?확인/], ['시연', /시연/], ['데모', /데모/], ['준비 중', /준비\s?중/],
  ['검증 정확도', /검증\s?정확도/], ['무허가 건축 의심', /무허가\s?건축\s?의심/],
];
const hitWords = (s) => WORDS.filter(([, re]) => re.test(s)).map(([k]) => k);
/** 서버 응답에서 사람이 읽는 칸 */
const TEXT_KEYS = new Set(['message', 'text', 'title', 'label', 'line', 'note', 'why', 'hint', 'sub', 'answer', 'summary', 'state_word', 'kind_ko',
  'kind_label', 'status_label', 'desc', 'description', 'lead', 'caption', 'name', 'reason_word', 'word', 'headline', 'lines']);
const USER_KEYS = new Set(['gist', 'examples', 'memo', 'q', 'question', 'prompt', 'content', 'body_user']);   // 사용자가 쓴 말 — 세지 않는다

/* 화면 안에서 — 보이는 글 · 속성의 금칙어 */
function scanPage(words) {
  const res = words.map(([k, s, f]) => [k, new RegExp(s, f)]);
  const skip = '.k-dev,[data-lint-skip],[data-user-text]';
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const out = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const el = n.parentElement; if (!el || el.closest(skip) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || !vis(el)) continue;
    const s = n.nodeValue.trim(); if (!s) continue;
    for (const [k, re] of res) if (re.test(s)) out.push({ word: k, where: 'text', text: s.slice(0, 90) });
  }
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder],img[alt]')) {
    if (el.closest(skip)) continue;
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) {
      const v = el.getAttribute(a); if (!v) continue;
      for (const [k, re] of res) if (re.test(v)) out.push({ word: k, where: a, text: v.slice(0, 90) });
    }
  }
  return out;
}
const WORDS_SRC = WORDS.map(([k, re]) => [k, re.source, re.flags]);

/* 서버 응답 글 걷기 */
function walk(o, key, out, url) {
  if (o == null) return;
  if (typeof o === 'string') { if (key && TEXT_KEYS.has(key)) for (const w of hitWords(o)) out.push({ word: w, key, text: o.slice(0, 90), url }); return; }
  if (Array.isArray(o)) { for (const v of o) walk(v, key, out, url); return; }
  if (typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (!USER_KEYS.has(k)) walk(v, k, out, url); }
}

const results = [];      // {screen, url, hits[], resp[], errors[]}
const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());

async function session(base, login, tenant) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const st = { resp: [], errors: [] };
  page.on('console', (m) => { if (m.type() === 'error') st.errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => st.errors.push(String(e).slice(0, 160)));
  page.on('response', async (r) => {
    try {
      const u = new URL(r.url());
      if (!u.pathname.startsWith('/api/v1/') || !/json/.test(r.headers()['content-type'] || '')) return;
      walk(await r.json(), null, st.resp, u.pathname);
    } catch { /* 본문 없음 */ }
  });
  for (let i = 0; i < 3; i++) {
    await frontDoor(page, base, login, tenant ? { tenant, password: PW } : { password: PW });
    if (!/\/login\/?$/.test(new URL(page.url()).pathname)) break;
    if (/시도가 너무 많습니다/.test(await page.innerText('body').catch(() => ''))) throw new Error('로그인 시도가 너무 많습니다 — 10분 뒤 다시 돌려 주세요');
    await page.waitForTimeout(8000);
  }
  if (/\/login\/?$/.test(new URL(page.url()).pathname)) throw new Error(`로그인하지 못했습니다(${new URL(base).hostname})`);
  return { ctx, page, st };
}
/** 화면 하나 — 열고(필요하면 누르기) 세기 */
async function screen(s, name, url, { wait, act, ms = 2500 } = {}) {
  s.st.resp = []; s.st.errors = [];
  await s.page.goto(url, { waitUntil: 'domcontentloaded' });
  if (wait) await s.page.waitForSelector(wait, { timeout: 30000 }).catch(() => s.st.errors.push(`기다린 칸이 안 보임: ${wait}`));
  await s.page.waitForTimeout(ms);
  if (act) { try { await act(s.page); await s.page.waitForTimeout(1500); } catch (e) { s.st.errors.push(`누르기 실패: ${String(e.message || e).slice(0, 120)}`); } }
  const hits = await s.page.evaluate(scanPage, WORDS_SRC);
  const seen = new Set(), resp = s.st.resp.filter((x) => { const k = `${x.word}|${x.url}|${x.key}|${x.text}`; if (seen.has(k)) return false; seen.add(k); return true; });   // 같은 응답 글은 한 번
  results.push({ screen: name, url: new URL(s.page.url()).pathname + new URL(s.page.url()).search + new URL(s.page.url()).hash, hits, resp, errors: [...s.st.errors] });
}

try {
  /* ── 기관(남원 등) ── */
  {
    const s = await session(HOST.gov, 'lxadmin@lx.or.kr', TENANT);
    const G = HOST.gov + '/landxi/v3/';
    await screen(s, '기관 · 내 서비스', G + 'gov-select/?list=1', { wait: '.gs-page' });
    const cards = await s.page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="service="]')].map((a) => new URL(a.href).searchParams.get('service')).filter(Boolean))]);
    for (const c of cards.slice(0, 6)) {
      await screen(s, `기관 · 서비스 대시보드(${c})`, G + `gov-select/?service=${encodeURIComponent(c)}`, { wait: '.gs-page' });
      await screen(s, `기관 · 통계·보고서(${c})`, G + `gov-select/?service=${encodeURIComponent(c)}&tab=stats`, { wait: '.gs-page' });
      await screen(s, `기관 · 필지 목록 + 상세(${c})`, G + `gov-report/?service=${encodeURIComponent(c)}&tab=sus`, { wait: '.gr-board', ms: 3500,
        act: async (p) => { const r = p.locator('#sus-table tbody tr').first(); if (await r.count()) await r.click(); } });
    }
    await screen(s, '기관 · 요청하기(분석 요청)', G + 'gov-request/', { wait: '.gq-grid' });
    await screen(s, '기관 · 요청하기(촬영 요청)', G + 'gov-request/?tab=shoot', { wait: '.gq-grid' });
    await s.ctx.close();
  }
  /* ── LX 직원(app) ── */
  {
    const s = await session(HOST.app, 'test@lx.or.kr');
    const A = HOST.app + '/landxi/v3/';
    await screen(s, 'LX 직원 · 대시보드', A + 'lx-console/', { wait: 'main' });
    await screen(s, 'LX 직원 · 분석하기', A + 'lx-analyze/', { wait: '.la-ac' });
    const more = await s.page.evaluate(() => [...document.querySelectorAll('.la-ac')].map((a) => ({ n: a.querySelector('h3')?.innerText.trim(), h: a.querySelector('a.k-sc-more')?.href })).filter((x) => x.h));
    for (const c of more.slice(0, 8)) await screen(s, `LX 직원 · 분석하기 자세히(${c.n})`, c.h, { wait: '.la-dt-body' });
    await screen(s, 'LX 직원 · 지도 서비스', A + 'lx-map/', { wait: '.lm-groups', ms: 4000 });
    await screen(s, 'LX 직원 · 요청함', A + 'lx-inbox/', { wait: 'main' });
    await s.ctx.close();
  }
  /* ── LX 관리자(admin) ── */
  {
    const s = await session(HOST.admin, 'lxadmin@lx.or.kr');
    const O = HOST.admin + '/landxi/v3/';
    await screen(s, 'LX 관리자 · 대시보드', O + 'ops-core/', { wait: 'main' });
    await screen(s, 'LX 관리자 · 요청 관리', O + 'ops-core/#/approvals', { wait: 'main' });
    await screen(s, 'LX 관리자 · 배포', O + 'ops-infra/#/deploys', { wait: 'main' });
    await screen(s, 'LX 관리자 · 배포 → 개선 후보', O + 'ops-infra/#/deploys/improve', { wait: '.im-t, .k-empty', ms: 3000 });
    await s.ctx.close();
  }
} finally {
  await browser.close();
}

/* ── 표 ── */
let bad = 0;
const line = (s) => process.stdout.write(s + '\n');
line(`금칙어 검사 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · 화면 ${results.length}개 · 금칙어 ${WORDS.map(([k]) => k).join(' · ')}`);
for (const r of results) {
  const h = r.hits.length, e = r.errors.length;
  if (h || e) bad++;
  line(`${h || e ? '✗' : '✓'} ${r.screen} — 화면 금칙어 ${h} · 응답 문구 ${r.resp.length} · 화면 오류 ${e}`);
  for (const x of r.hits) line(`    화면 [${x.word}] (${x.where}) ${x.text}`);
  for (const x of r.resp.slice(0, 5)) line(`    응답(경고) [${x.word}] ${x.url} .${x.key}: ${x.text}`);
  for (const x of r.errors.slice(0, 3)) line(`    오류 ${x}`);
}
line(bad ? `실패 — 금칙어나 화면 오류가 있는 화면 ${bad}개` : '통과 — 화면 금칙어 0 · 화면 오류 0');
const out = arg('--json');
if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), words: WORDS.map(([k]) => k), results }, null, 1));
process.exit(bad ? 1 : 0);
