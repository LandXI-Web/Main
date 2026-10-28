/* 금칙어 검사(GPT 전수 검사 제안 · 바퀴 4-1 '외부 검수 보완' — numbers.mjs 옆) — 배포(커밋 · 게이트웨이 재시작) 때 돌린다.
   바깥 주소(app · admin · {기관}.land-xi.dev)를 로그인 폼으로 열어(세션 주입 없음) 주요 화면 · 상세 화면 · 관리자 개선 후보를 보고
   화면에 보이는 글(본문 · title · aria-label · placeholder · alt)에서 금칙어를 센다:
     결재 · 반려 · 현장 확인 · 시연 · 데모 · 준비 중 · 검증 정확도 · 무허가 건축 의심 · 데이터하우스(10-13) · 평가 · 추론 시험 · 검증 묶음 · 고친 곳 …(10-13 13:42 용어 되돌림)
   빼는 곳: 개발자 서랍(.k-dev) · [data-lint-skip] · 사용자가 쓴 말 그대로([data-user-text] — 예: 개선 후보의 '질문 원문').
   응답 문구: 화면이 받은 서버 JSON 응답에서 사람이 읽는 칸(message · text · title · label · line · note · why · hint · sub · answer …)의
   글도 같은 금칙어로 세어 따로 적는다(경고 — 화면에 안 나온 값일 수 있음). 화면 글에 금칙어가 있거나 화면 오류(콘솔 오류)가 있으면 종료 코드 1.
   사용: node tools/check/words.mjs [--only gov,abroad,app,admin] [--app …] [--admin …] [--gov https://namwon.land-xi.dev] [--tenant namwon] [--abroad kgz-agri] [--json 파일]
   해외 기관(abroad · 10-15) — 해외 첫 화면(landxi/v3/global) 네 탭(Season · NDVI · Sprawl · Register)도 본다. --tenant 에 해외 기관을 줘도 그 화면으로 돈다.
   세 검사기를 한 번에(역할마다 로그인 한 번): node tools/check/all.mjs
   10-14 원칙 250: '.docx · Word' 금칙(모든 문서 = 한글 문서) · 기관 보고서 탭도 본다.
   비밀번호는 env LX_PW / DEV_PASSWORD 또는 server/.env 의 DEV_PASSWORD(화면 · 출력에 적지 않는다). */
import fs from 'node:fs';
import { arg, isMain, standalone, listen, abroadReady, abroadTab, ABROAD_TABS } from './common.mjs';

/** 금칙어(사용자 규칙 · 원칙 135 · 187 · CLAUDE.md §2) — 이름 → 식 */
export const WORDS = [
  ['결재', /결재/], ['반려', /반려/], ['현장 확인', /현장\s?확인/], ['시연', /시연/], ['데모', /데모/], ['준비 중', /준비\s?중/],
  ['검증 정확도', /검증\s?정확도/], ['무허가 건축 의심', /무허가\s?건축\s?의심/],
  // 10-12 원칙 209 · 202 고침 · 203 — '표본 n장'(→ 학습 데이터 n장) · 개선 후보 '개발 요청'(→ 모아 두기) · 결과 확인 '봤음' 기록
  ['표본 n장', /표본\s?[\d,]+\s?장|학습\s?데이터\s?표본|표본\s?학습/], ['개발 요청', /개발\s?요청/], ['봤음 기록', /지도에서\s?봤음|이 결과 확인했음/],
  // 10-12 XI맵 시군구 카드 'nullnull' — 값이 비었는데 글자로 이어 붙은 것(화면 글 · 속성). 영문자 · 숫자 · 밑줄에 붙은 낱말(예: annulled · nullable)은 세지 않는다
  ['null · undefined · NaN', /(^|[^A-Za-z0-9_])(null|undefined|NaN)(?![A-Za-z0-9_])/],
  // 10-13 데이터-개념 ⓐ(원칙 232) — 데이터하우스를 없앴다(학습 데이터는 프로젝트 안 · 영상 · 행정 자료는 '공유 데이터에서 고르기')
  ['데이터하우스', /데이터\s?하우스/],
  // 10-13 13:42 용어 되돌림(원칙 235 — "평가가 아니라 추론. 용어를 자꾸 만들어 내지말고. 늘리지 마라") · 고친 것 문구는 사용자 말 그대로
  //   ('수정된 부분은 학습 데이터로 저장됩니다.' · '학습 데이터' · '수정된 부분 n장'). 관리자 개선 후보의 '평가 질문'(XI ChatGEO 개선용 질문 묶음)은 다른 뜻이라 뺀다.
  ['평가(→ 추론)', /평가(?!\s?질문)/], ['추론 시험', /추론\s?시험/], ['검증 묶음', /검증\s?묶음/], ['자체 검증', /자체\s?검증/],
  ['고친 곳 · 모인 학습 데이터', /고친\s?곳|모인\s?학습\s?데이터/], ['고친 것 n건', /고친\s?것\s?[\d,]+\s?건/],
  ['학습 자료로 쌓임', /학습\s?(자료|데이터)로\s?쌓/], ['학습 자리', /학습\s?자리/],
  // 10-14 원칙 250 — 모든 문서는 한글 문서(.hwpx). 화면에 '.docx' · 'Word' 표기 0
  ['.docx · Word', /\bdocx\b|\bWord\b|워드\s?(문서|파일)/i],
  // 10-17 원칙 268 — 실제 이름은 '전남광주특별시'. '광주전남특별시'는 잘못된 표기(기관 · 지역 이름 어디에도 쓰지 않는다)
  ['광주전남특별시(→ 전남광주특별시)', /광주\s?전남\s?특별시/],
  // 10-21 첫인상-3(원칙 161 · 212 · 251) — 기다림은 가운데 하나(kit/loader.js .k-ld). 칸 안에 남은 '불러오는 중' 글 = 칸 로딩 글자(가운데 표시는 세지 않는다)
  ['칸 불러오는 중', /불러오는\s?중/],
  // 10-22 원칙 308 — 보통 사람이 쓰는 말 · 브이월드 · 공공 GIS 낱말(FARM-ADMIN-DESIGN §5) · LX 작업 이름이 기관 화면에(규칙 2)
  ['가르기(→ 영상 비교)', /가르기/], ['견주기(→ 대조)', /견주기/], ['이용 약속(→ 다운로드 이력 · 개인정보 이용 확인)', /이용\s?약속/],
  ['오늘 볼 필지(→ 필지 목록)', /오늘\s?볼\s?필지/], ['재추론', /재추론/], ['n클래스(작업 이름)', /\d클래스/], ['n시점(작업 이름)', /\([가-힣]+\s?\d시점\)/],
  ['지역만 정하기(→ 브이월드에서 영상 가져오기)', /지역만\s?정하기/],
];
const hitWords = (s) => WORDS.filter(([, re]) => re.test(s)).map(([k]) => k);
/** 서버 응답에서 사람이 읽는 칸 */
const TEXT_KEYS = new Set(['message', 'text', 'title', 'label', 'line', 'note', 'why', 'hint', 'sub', 'answer', 'summary', 'state_word', 'kind_ko',
  'kind_label', 'status_label', 'desc', 'description', 'lead', 'caption', 'name', 'reason_word', 'word', 'headline', 'lines']);
const USER_KEYS = new Set(['gist', 'examples', 'memo', 'q', 'question', 'prompt', 'content', 'body_user']);   // 사용자가 쓴 말 — 세지 않는다

/* 화면 안에서 — 보이는 글 · 속성의 금칙어 */
function scanPage(words) {
  const res = words.map(([k, s, f]) => [k, new RegExp(s, f)]);
  /* 판정상태 열거값 예외(10-29 PM 회신 — 미확인 · 현장확인 · 적법 · 불법 · 철거완료는 PM 이 정한 값) — 글 한 덩이가 그 값(과 → · 숫자 · 건 · 필지)만이면 세지 않는다.
     '현장 확인 후 …' 같은 설명 글은 그대로 센다 */
  const STATUS_ONLY = /^((미확인|현장확인|적법|불법|철거완료)|[\s→·,:]|[\d,]+|건|필지)+$/;
  const skip = '.k-dev,[data-lint-skip],[data-user-text]';
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const out = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const el = n.parentElement; if (!el || el.closest(skip) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || !vis(el)) continue;
    const s = n.nodeValue.trim(); if (!s) continue;
    for (const [k, re] of res) if (re.test(s) && !(k === '칸 불러오는 중' && el.closest('.k-ld')) && !(k === '현장 확인' && STATUS_ONLY.test(s))) out.push({ word: k, where: 'text', text: s.slice(0, 90) });
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

/** 화면 하나 — 열고(필요하면 누르기) 세기. url 이 없으면 지금 화면 그대로 */
async function screen(s, name, url, { wait, act, ms = 2500, ready } = {}) {
  s.st.resp = []; s.st.errors = [];
  if (url) {
    await s.page.goto(url, { waitUntil: 'domcontentloaded' });
    if (wait) await s.page.waitForSelector(wait, { timeout: 30000 }).catch(() => s.st.errors.push(`기다린 칸이 안 보임: ${wait}`));
    if (ready) await ready(s.page);
    await s.page.waitForTimeout(ms);
  }
  if (act) { try { await act(s.page); await s.page.waitForTimeout(1500); } catch (e) { s.st.errors.push(`누르기 실패: ${String(e.message || e).slice(0, 120)}`); } }
  const hits = await s.page.evaluate(scanPage, WORDS_SRC);
  const seen = new Set(), resp = s.st.resp.filter((x) => { const k = `${x.word}|${x.url}|${x.key}|${x.text}`; if (seen.has(k)) return false; seen.add(k); return true; });   // 같은 응답 글은 한 번
  results.push({ screen: name, url: new URL(s.page.url()).pathname + new URL(s.page.url()).search + new URL(s.page.url()).hash, hits, resp, errors: [...s.st.errors] });
}

/** 해외 첫 화면 — 네 탭 */
async function abroad(s, who) {
  const G = s.home + '/landxi/v3/global/';
  for (const [i, t] of ABROAD_TABS.entries()) {
    await screen(s, `${who} · 해외 첫 화면(${t})`, i ? null : G, { ready: abroadReady, ms: 1500, act: i ? (p) => abroadTab(p, t) : null });
  }
}

/** 역할 하나 — 로그인한 세션(s = { page, home, abroad })으로 */
export async function run(role, s0) {
  const st = { resp: [], errors: [] };
  const s = { ...s0, st };
  const off = listen(s.page, {
    console: (m) => { if (m.type() === 'error') st.errors.push(m.text().slice(0, 160)); },
    pageerror: (e) => st.errors.push(String(e).slice(0, 160)),
    response: async (r) => {
      try {
        const u = new URL(r.url());
        if (!u.pathname.startsWith('/api/v1/') || !/json/.test(r.headers()['content-type'] || '')) return;
        walk(await r.json(), null, st.resp, u.pathname);
      } catch { /* 본문 없음 */ }
    },
  });
  try {
    if (role === 'abroad' || (role === 'gov' && s.abroad)) return await abroad(s, '해외 기관');
    if (role === 'gov') {
      const G = s.home + '/landxi/v3/';
      await screen(s, '기관 · 내 서비스', G + 'gov-select/?list=1', { wait: '.gs-page' });
      /* 행정서비스 묶음(10-22 원칙 310) — 묶음 홈 탭 · 묶음 안 분석서비스도 본다 */
      const groups = await s.page.evaluate(() => window.__govSelect?.groups || []).catch(() => []);
      const inGroup = groups.flatMap((g) => g.cards || []);
      const listed = await s.page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="service="]')].map((a) => new URL(a.href).searchParams.get('service')).filter(Boolean))]);
      for (const g of groups) {
        for (const [t, nm] of [['', '통합 대시보드'], ['services', '분석서비스'], ['parcels', '필지 찾기'], ['stats', '보고서·통계'], ['downloads', '다운로드 이력']]) {
          await screen(s, `기관 · ${g.id} 묶음 · ${nm}`, G + 'gov-group/?' + new URLSearchParams({ group: g.id, ...(t ? { tab: t } : {}) }), { wait: '.gg-tabs', ms: 3000 });
        }
      }
      const cards = [...new Set([...inGroup, ...listed])];
      for (const c of cards.slice(0, 6)) {
        await screen(s, `기관 · 결과 지도(${c})`, G + `xi-clean/?service=${encodeURIComponent(c)}`, { wait: '.xc-tools', ms: 4500,
          act: async (p) => { const t = p.locator('.xc-tool[data-tool="layers"]'); if (await t.count()) { await t.click(); await p.waitForTimeout(800); } } });   // 층 판 이름(10-22 — LX 작업 이름 0)
        await screen(s, `기관 · 서비스 대시보드(${c})`, G + `gov-select/?service=${encodeURIComponent(c)}`, { wait: '.gs-page' });
        await screen(s, `기관 · 통계·보고서(${c})`, G + `gov-select/?service=${encodeURIComponent(c)}&tab=stats`, { wait: '.gs-page' });
        await screen(s, `기관 · 보고서(${c})`, G + `gov-report/?service=${encodeURIComponent(c)}&tab=report`, { wait: '.rp-grid, #rp-form', ms: 3500 });   // 10-14 원칙 250 — 한글 문서 단추
        await screen(s, `기관 · 필지 목록 + 상세(${c})`, G + `gov-report/?service=${encodeURIComponent(c)}&tab=sus`, { wait: '.gr-board', ms: 3500,
          act: async (p) => { const r = p.locator('#sus-table tbody tr').first(); if (await r.count()) await r.click(); } });
      }
      await screen(s, '기관 · 요청하기(분석 요청)', G + 'gov-request/', { wait: '.gq-grid' });
      await screen(s, '기관 · 요청하기(촬영 요청)', G + 'gov-request/?tab=shoot', { wait: '.gq-grid' });
    }
    if (role === 'app') {
      const A = s.home + '/landxi/v3/';
      await screen(s, 'LX 직원 · 대시보드', A + 'lx-console/', { wait: 'main' });
      await screen(s, 'LX 직원 · 분석 서비스', A + 'lx-analyze/', { wait: '.la-ac' });
      const more = await s.page.evaluate(() => [...document.querySelectorAll('.la-ac')].map((a) => ({ n: a.querySelector('h3')?.innerText.trim(), h: a.querySelector('a.k-sc-more')?.href })).filter((x) => x.h));
      for (const c of more.slice(0, 8)) await screen(s, `LX 직원 · 분석 서비스 자세히(${c.n})`, c.h, { wait: '.la-dt-body' });
      await screen(s, 'LX 직원 · 지도 서비스', A + 'lx-map/', { wait: '.lm-groups', ms: 4000 });
      await screen(s, 'LX 직원 · 요청함', A + 'lx-inbox/', { wait: 'main' });
      await screen(s, 'LX 직원 · 프로젝트', A + 'lx-project/', { wait: 'main' });                       // 10-13 — 메뉴에 데이터하우스 없음
      await screen(s, 'LX 직원 · 새 프로젝트 창', A + 'lx-project/?new=1', { wait: '.lxp-new--one' });
      /* XI맵 — 전국 · 결과 있는 시군구 · 결과 없는 시군구(카드 글에 값 없음 글자가 새지 않는지) */
      const jump = (x, y, z) => async (p) => { await p.evaluate(([a, b, c]) => { window.__xc.map.jumpTo({ center: [a, b], zoom: c }); }, [x, y, z]); await p.waitForTimeout(4000); };
      await screen(s, 'LX 직원 · XI맵(전국)', A + 'xi-clean/', { wait: '.xb-hud', ms: 4000 });
      await screen(s, 'LX 직원 · XI맵(시군구 · 남원)', A + 'xi-clean/', { wait: '.xb-hud', ms: 3000, act: jump(127.39, 35.42, 11) });
      await screen(s, 'LX 직원 · XI맵(시군구 · 전주 · 구가 있는 시)', A + 'xi-clean/', { wait: '.xb-hud', ms: 3000, act: jump(127.13, 35.82, 11) });
      await screen(s, 'LX 직원 · XI맵(시군구 · 종로)', A + 'xi-clean/', { wait: '.xb-hud', ms: 3000, act: jump(126.97, 37.57, 11) });
      /* 프로젝트 학습 화면(학습-작업흐름-v3 · 10-12) — 진행 중 프로젝트마다 흐름 판 · 이번 학습 · 학습 이력 */
      const pids = await s.page.evaluate(async () => {
        const t = JSON.parse(localStorage.getItem('lx_api_session') || 'null')?.token;
        const j = await fetch('/api/v1/projects?scope=all', { headers: t ? { authorization: 'Bearer ' + t } : {} }).then((r) => r.json()).catch(() => null);
        return (j?.items || []).map((x) => ({ id: x.id, n: x.name }));
      });
      for (const x of pids.slice(0, 6)) await screen(s, `LX 직원 · 프로젝트 학습(${x.n})`, A + `lx-train/?project=${encodeURIComponent(x.id)}&stage=train`, { wait: '.tb-hist' });
    }
    if (role === 'admin') {
      const O = s.home + '/landxi/v3/';
      await screen(s, 'LX 관리자 · 대시보드', O + 'ops-core/', { wait: 'main' });
      await screen(s, 'LX 관리자 · 요청 관리', O + 'ops-core/#/approvals', { wait: 'main' });
      await screen(s, 'LX 관리자 · 배포', O + 'ops-infra/#/deploys', { wait: 'main' });
      await screen(s, 'LX 관리자 · 배포 → 개선 후보', O + 'ops-infra/#/deploys/improve', { wait: '.im-t, .k-empty', ms: 3000 });
      await screen(s, 'LX 관리자 · 배포 → XI 재학습', O + 'ops-infra/#/deploys/retrain', { wait: '.rt-when', ms: 2000 });
      await screen(s, 'LX 관리자 · 배포 → 학습 서식', O + 'ops-infra/#/deploys/templates', { wait: '.rt-blks', ms: 2000 });
      await screen(s, 'LX 관리자 · 공유 데이터', O + 'ops-infra/#/shared', { wait: '.sd-tbl', ms: 2000 });   // 10-13 관리자-공유데이터(원칙 238)
      await screen(s, 'LX 관리자 · 공유 데이터 → 영상 상세', null, { act: async (p) => { await p.locator('.sd-row').first().click(); await p.waitForTimeout(2500); } });   // 10-14 상세 판
      await screen(s, 'LX 관리자 · 공유 데이터 → 학습 데이터', O + 'ops-infra/#/shared', { wait: '.sd-tbl', ms: 1000,   // 10-14 공유데이터-탭(원칙 240)
        act: async (p) => { await p.locator('.sd-tabs button', { hasText: '학습 데이터' }).click(); await p.waitForSelector('.sd-body table, .sd-none', { timeout: 30000 }); } });
      await screen(s, 'LX 관리자 · 공유 데이터 → 행정 자료', O + 'ops-infra/#/shared', { wait: '.sd-tbl', ms: 1000,
        act: async (p) => { await p.locator('.sd-tabs button', { hasText: '행정 자료' }).click(); await p.waitForSelector('.sd-sub', { timeout: 30000 }); } });
    }
  } finally { off(); }
}

/* ── 표 ── */
/** 결과 표 → { bad, text } (all.mjs 도 쓴다) */
export function report(out = arg('--json')) {
  let bad = 0;
  const lines = [];
  const line = (x) => lines.push(x);
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
  if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), words: WORDS.map(([k]) => k), results }, null, 1));
  return { bad, text: lines.join('\n') };
}

if (isMain(import.meta.url)) {
  await standalone(run);
  const r = report();
  process.stdout.write(r.text + '\n');
  process.exit(r.bad ? 1 : 0);
}
