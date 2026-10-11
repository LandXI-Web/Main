/* lx-analyze — 분석하기(구현 3차 · 확인 대장 14차 길-1 ⓑ 카드 먼저 · 카드-1 ⓐ · 원칙 90 · 93).
   길 하나: 갤러리(카드 한 벌 ①) → 카드 상세 → 어디(시군구 · 여러 곳) → 영상 고르기(질문 3 ⓐ · 원칙 153) → 분석 시작 → 결과는 지도 서비스(원칙 149 · 163).
   XI맵은 전국 · 해외 실시간 분석(원칙 147) — 지역별 결과 목록(쓰이는 곳)의 지역 링크만 XI맵으로 간다.
     ./            갤러리 — 정식 분석 서비스만 · 분류 거르기 · 찾기 · 보기 개수(작게 4열 · 크게 3열)
     ./?card=…     카드 상세 — 결과 장면 · 결과 예시(지역별) · 영상 ↔ 결과 · 쓰이는 곳 · 이 카드의 조건 + 오른쪽 '이 카드로 분석'
   지역은 화면이 대신 고르지 않는다(원칙 33) — 직원이 검색해 고른다. 분석은 게이트웨이 작업 대기열(POST /cards/{카드}/analyze = POST /jobs 와 같은 길).
   숫자는 서버(GET /cards/deck · /cards/{카드} — 대표 수치 요약 한 출처). 카드 · 작업 · 배포본 id 는 화면 글자에 없다. */
import * as K from '../kit/index.js';
import { h, api, API, session } from '../kit/util.js';
import { sig } from '../kit/sig.js';
import { loadDeck } from '../kit/service-card.js';
import { staffRail } from './menu.js';

const who = await K.gate('lx-console');
const Q = new URLSearchParams(location.search);
const CARD = Q.get('card');
const REGION = Q.get('region');      // 홈 '바로 분석하기'에서 직원이 고른 시군구(화면이 고른 것 아님 — 원칙 33) — 카드 상세의 '어디'에 미리 담는다
const withRegion = (u) => (REGION ? u + (u.includes('?') ? '&' : '?') + new URLSearchParams({ region: REGION }) : u);
const S = K.shell({ who, home: 'lx-analyze', title: 'LX 직원 대시보드', rail: await staffRail('analyze') });
K.devDrawer({ who });
document.body.classList.remove('la-boot');
const page = h('div.la-page');
S.main.append(h('div.la-scroll', {}, page));

const nf = (v) => Number(v).toLocaleString('ko-KR');
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };
const STATE_LV = { ga: '', pilot: 'wait', none: 'gap' };
const chip = (k, word) => h('span.t-chip', { dataset: STATE_LV[k] ? { lv: STATE_LV[k] } : {}, text: word });
const XI = (sgg) => '../xi-clean/' + (sgg ? '?' + new URLSearchParams({ region: sgg }) : '');
const MAPSVC = '../lx-map/';
const mapHref = (u) => { const q = String(u || '').split('?')[1]; return MAPSVC + (q ? '?' + q : ''); };   // 서버가 준 지도 서비스 주소의 ?job= 만 이어 받는다(상대 경로 — GitHub Pages /Main/ 아래에서도)   // 지도 서비스 — 내가 돌린 분석 결과(분석 시작 뒤 안내 · 끝남 알림이 가는 곳)

if (CARD) await detail(CARD); else await gallery();
document.body.dataset.ready = '1';

/* ═════════════ 갤러리 — 정식 분석 서비스만(카드틀-5 ⓐ · 6 ⓐ · 원칙 145 · 146) ═════════════
   정식 = 서버가 정한 official(등록된 모델 + 돌고 있는 배포본). 다른 카드는 지우지 않고 여기서만 숨긴다(서비스 카드 관리에는 그대로).
   카드 한 틀: 그림(결과 장면 > 학습 표본 > 빈 틀) → 이름 → 한 줄 → 검증 정확도 · 모델 갱신 → 대상 지역 n곳 → 분석하기 · 자세히.
   숫자 · 날짜 = 서버 모델 기록(카드 덱의 model) 한 출처. 보기 개수 = 한 페이지 2 · 4 · 6 · 8장(기본 4장 · 지도-4 ⓐ · 원칙 150) + 페이지 넘김 — 이 브라우저에 기억. */
function perList() { return [2, 4, 6, 8]; }   // 함수 — 맨 위 await(gallery) 가 이 줄보다 먼저 돈다
function readPer() { try { const n = +localStorage.getItem('lx-analyze.per'); return perList().includes(n) ? n : 4; } catch { return 4; } }
function savePer(n) { try { localStorage.setItem('lx-analyze.per', String(n)); } catch { /* 저장 못 해도 화면은 그대로 */ } }

async function authBlob(path) {
  const s = session.get();
  const r = await fetch(API.prefix + path, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
  if (!r.ok || r.status === 204) throw new Error('sample');
  const b = await r.blob();
  if (!b.size) throw new Error('sample');
  return URL.createObjectURL(b);
}

function acCard(c, href, more) {
  const blank = (p) => { p.classList.add('is-blank'); p.replaceChildren(h('span.k-sc-blank', { text: '결과 장면이 아직 없습니다' })); };
  const pic = h('div.k-sc-crop.la-ac-pic');
  const img = (src) => h('img', { src, alt: '', loading: 'lazy', decoding: 'async', onerror: () => blank(pic) });
  if (c.scene?.src) pic.append(img(c.scene.src));
  else if (c.sample) {                                     // 결과 장면이 없으면 학습 표본(직원 전용 — 로그인 토큰으로 받는다)
    pic.classList.add('is-sample');
    authBlob(c.sample).then((u) => pic.append(img(u))).catch(() => blank(pic));
  } else blank(pic);
  if ((c.groups || []).length) pic.append(h('div.la-ac-cat', {}, ...c.groups.map((g) => h('span', { text: g }))));   // 분야(여러 개 · 질문 5)
  const md = c.model || {};
  const acc = md.acc && md.acc.value !== null && md.acc.value !== undefined ? md.acc.value : null;
  const tg = c.targets || [];
  const tgText = tg.length > 3 ? `${tg.slice(0, 3).join(' · ')} 외 ${tg.length - 3}곳` : tg.join(' · ');
  return h('article.k-sc.la-ac', { dataset: { kind: 'analyze', state: c.state || 'none' } }, pic,
    h('div.k-sc-b.la-ac-b', {},
      h('h3.k-sc-t', { text: c.name || '' }),
      h('p.k-sc-line.la-ac-line', { text: c.line || '' }),
      h('div.la-ac-hero', {},
        h('div', {}, acc === null ? h('b', { text: '—' }) : h('b.num', {}, String(acc), h('i', { text: '%' })), h('small', { text: '검증 정확도' })),
        h('div', {}, h('b.num.d', { text: md.updated || '—' }), h('small', { text: '모델 갱신' }))),
      h('div.la-ac-where', {}, h('span.k', { text: `대상 지역 ${tg.length}곳` }), h('span.v', { text: tgText || '—', title: tg.join(' · ') })),
      (c.imagery_kinds || []).length ? h('div.la-ac-imk', { 'aria-label': '쓸 수 있는 영상' }, ...c.imagery_kinds.map((k) => h('span', { text: k }))) : null,
      h('div.k-sc-acts', {}, h('a.t-btn.k-sc-go', { href: href(c), text: '분석하기' }), h('a.k-sc-more', { href: more(c), text: '자세히 →' }))));
}

async function gallery() {
  document.title = '분석하기 · Land-XI';
  page.append(h('header.la-head', {}, h('h1.t-h3', { text: '분석하기' }),
    h('p.la-sub', { text: '정식 분석 서비스를 골라 지역을 정하면 AI가 분석합니다' })));
  const tools = h('div.la-tools');
  const grid = h('div.la-grid.la-acg');
  const box = h('div');
  const pager = h('nav.la-pager', { 'aria-label': '페이지' });
  page.append(tools, box, grid, pager);
  if (REGION) {                                            // 홈에서 들고 온 지역 — 카드를 고르면 그 지역이 '어디'에 담겨 있다
    const regs = await K.loadRegions().catch(() => []);
    const r = regs.find((x) => x.sgg_cd === REGION);
    if (r) page.insertBefore(h('p.la-region', {}, h('b', { text: r.name }), '에서 분석할 서비스를 고르세요',
      h('a', { href: './', 'aria-label': '지역 빼기', text: '지역 빼기' })), tools);
  }
  K.empty(box, { kind: 'loading' });
  const deck = await loadDeck();
  box.remove();
  if (!deck) { const e = h('div'); page.append(e); K.empty(e, { kind: 'error', title: '분석 서비스를 불러오지 못했습니다', onRetry: () => location.reload() }); return; }
  const all = (deck.items || []).filter((c) => c.official);
  const F = { grp: Q.get('grp') || '', img: Q.get('img') || '', q: '', per: readPer(), page: 1 };
  /* 분야 칩 = LX 관리자의 분야 목록 순서(서버 deck.groups) · 서비스가 없는 분야는 숨김 · 한 서비스가 여러 분야에(질문 5 · 원칙 165) */
  const inG = (c, g) => (c.groups || (c.group ? [c.group] : [])).includes(g);
  const groups = (deck.groups || []).filter((g) => all.some((c) => inG(c, g)));
  const KINDS = ['드론', '항공', '위성'];                 // 쓸 수 있는 영상(배포 신청서에서 고름) — 영상별 거르기
  const inK = (c, k) => (c.imagery_kinds || []).includes(k);
  const chipsEl = h('div.la-chips', { role: 'group', 'aria-label': '거르기' });
  const viewEl = h('div.la-view', { role: 'group', 'aria-label': '보기 개수' });
  const href = (c) => withRegion(`?card=${encodeURIComponent(c.id)}`) + '#analyze';
  const more = (c) => withRegion(`?card=${encodeURIComponent(c.id)}`);
  const draw = () => {
    chipsEl.replaceChildren(
      h('button.la-chip', { type: 'button', 'aria-pressed': String(!F.grp), onclick: () => { F.grp = ''; F.page = 1; draw(); } }, '전체', h('small.num', { text: String(all.length) })),
      ...groups.map((g) => h('button.la-chip', { type: 'button', 'aria-pressed': String(F.grp === g), onclick: () => { F.grp = F.grp === g ? '' : g; F.page = 1; draw(); } },
        g, h('small.num', { text: String(all.filter((c) => inG(c, g)).length) }))),
      h('span.la-chips-sep', { 'aria-hidden': 'true' }), h('span.la-chips-k', { text: '영상' }),
      ...KINDS.map((k) => h('button.la-chip', { type: 'button', 'aria-pressed': String(F.img === k), onclick: () => { F.img = F.img === k ? '' : k; F.page = 1; draw(); } },
        k, h('small.num', { text: String(all.filter((c) => inK(c, k)).length) }))));
    viewEl.replaceChildren(h('span.la-view-k', { text: '한 페이지' }),
      ...perList().map((k) => h('button.la-view-b.num', { type: 'button', 'aria-pressed': String(F.per === k), 'aria-label': `한 페이지 ${k}장`,
        onclick: () => { F.per = k; F.page = 1; savePer(k); draw(); } }, String(k))),
      h('span.la-view-u', { text: '장' }));
    grid.dataset.n = String(F.per);
    const q = F.q.replace(/\s+/g, '');
    const list = all.filter((c) => (!F.grp || inG(c, F.grp)) && (!F.img || inK(c, F.img))
      && (!q || [c.name, c.line, c.finds, ...(c.targets || [])].some((s) => String(s || '').replace(/\s+/g, '').includes(q))));
    if (!list.length) {
      pager.replaceChildren();
      grid.replaceChildren(); const e = h('div.la-none'); grid.append(e);
      K.empty(e, all.length ? { kind: 'first', title: '맞는 분석 서비스가 없습니다', text: '거르기를 풀어 보세요', compact: true }
        : { kind: 'first', title: '아직 정식 분석 서비스가 없습니다', text: '분석 모델이 등록되고 지역에 적용되면 여기에 보입니다', compact: true });
      return;
    }
    const pages = Math.max(1, Math.ceil(list.length / F.per));
    F.page = Math.min(Math.max(1, F.page), pages);
    const from = (F.page - 1) * F.per;
    grid.replaceChildren(...list.slice(from, from + F.per).map((c) => acCard(c, href, more)));
    const go = (p) => { F.page = p; draw(); grid.scrollIntoView?.({ block: 'nearest' }); };
    const pb = (label, p, cls = '', aria) => h(`button.la-pg${cls}`, { type: 'button', disabled: p < 1 || p > pages || undefined,
      'aria-current': p === F.page && !cls ? 'page' : undefined, 'aria-label': aria, onclick: () => go(p) }, label);
    pager.replaceChildren(...(pages > 1 ? [pb('‹', F.page - 1, '.ar', '앞 페이지'),
      ...Array.from({ length: pages }, (_, i) => pb(String(i + 1), i + 1, '', `${i + 1}페이지`)),
      pb('›', F.page + 1, '.ar', '다음 페이지')] : []),
      h('small', { text: pages > 1 ? `${list.length}장 가운데 ${from + 1}–${Math.min(from + F.per, list.length)}` : `${list.length}장 모두 한 페이지에` }));
  };
  const search = h('input.t-input.la-search', { type: 'search', placeholder: '서비스 이름 · 찾는 것 · 지역', 'aria-label': '분석 서비스 찾기', autocomplete: 'off' });
  search.addEventListener('input', () => { F.q = search.value.trim(); F.page = 1; draw(); });
  tools.append(chipsEl, h('div.la-tools-r', {}, viewEl, search));
  draw();
  S.fresh(deck.computed_at || deck.as_of);
}

/* ═════════════ 카드 상세 ═════════════ */
async function detail(cid) {
  const box = h('div');
  page.append(box);
  K.empty(box, { kind: 'loading' });
  let c;
  try { c = await api(`/cards/${encodeURIComponent(cid)}`); } catch (e) {
    box.replaceChildren();
    K.empty(box, e.status === 404 ? { kind: '404', title: '없는 카드입니다', action: { label: '분석하기', href: './' } } : { kind: 'error', title: '카드를 불러오지 못했습니다', onRetry: () => location.reload() });
    return;
  }
  box.remove();
  document.title = `${c.name} · 분석하기 · Land-XI`;
  page.classList.add('la-page--dt');

  const crumb = h('nav.la-crumb', { 'aria-label': '위치' }, h('a', { href: './', text: '분석하기' }), h('span', { 'aria-hidden': 'true', text: '›' }), h('b', { text: c.name }));
  const hero = h('figure.la-hero', { class: c.scene ? '' : 'is-blank' });
  if (c.scene) {
    hero.append(h('img', { src: c.scene.src, alt: '', decoding: 'async', fetchpriority: 'high' }));
    if (c.scene.caption) hero.append(h('figcaption.la-cap', { text: c.scene.caption }));
    if (c.scene.ex) hero.append(h('span.la-ex', { text: '다른 지역 결과 · 예시' }));
  } else hero.append(h('span.la-blank', { text: c.state === 'none' ? '첫 결과 전 — 결과가 생기면 장면이 보입니다' : '결과 장면 없음' }));

  const head = h('div.la-dt-head', {},
    h('div.la-tags', {}, chip(c.state, c.state_label), c.version ? h('span.la-tag.num', { text: `v${c.version}` }) : null,
      h('span.la-tag', { text: c.owner ? `담당 ${c.owner}` : '담당 미지정' })),
    h('h1.la-title', { text: c.name }),
    c.line ? h('p.la-line', { text: c.line }) : null);

  const picker = c.can_analyze ? imageryCard(c) : null;   // 영상 고르기(질문 3 ⓐ) — 오른쪽에서 지역을 고르면 그 지역을 덮는 영상 카드 두 열 + 범위 지도
  const body = h('div.la-dt-body', {}, picker?.el, resultCard(c), compareCard(c), usesCard(c), condCard(c));
  const side = h('aside.la-side', { id: 'analyze', 'aria-label': '이 카드로 분석' });
  page.append(h('div.la-dt', {}, h('div.la-dt-top', {}, crumb, hero, head), side, body));
  analyzePanel(side, c, picker);
  if (location.hash === '#analyze' && matchMedia('(max-width: 1099px)').matches) side.scrollIntoView({ block: 'start' });
  S.fresh(c.as_of);
}

/* 결과 예시 — 큰 숫자(카드의 결과 예시와 같은 값) + 지역별 표 */
function resultCard(c) {
  const sec = h('section.t-card.la-box', { 'aria-label': '결과 예시' }, h('h2.la-h', { text: '결과 예시' }));
  const ex = c.example;
  if (!ex) {                                   // AI 분석 결과(다듬은 결과 수)가 없으면 숫자 없이 — 분석 칸 도형 수는 쓰지 않는다(사용자 규칙 2)
    sec.append(h('p.la-none-t', { text: c.state === 'none' ? '첫 분석 결과가 나오면 여기에 보입니다' : c.example_note === 'AI 분석 결과 있음' ? 'AI 분석 결과는 지역별 지도에서 볼 수 있습니다' : '업무 결과를 아직 세지 않았습니다' }));
    return sec;
  }
  /* 큰 숫자 = AI 분석 결과(원칙 135) — 셈 단위는 서버가 준 그대로(필지 · 동 · 건) */
  const env = { value: ex.value, unit: ex.unit || '', basis: ex.basis, as_of: ex.as_of, source: ex.source };
  const unitW = ex.unit === 'count' ? '건' : ex.unit || '';
  sec.append(h('p.t-label.la-ex-l', { text: [ex.word || 'AI 분석 결과', ex.region, ex.as_of ? `${ymd(ex.as_of)} 기준` : ''].filter(Boolean).join(' · ') }),
    h('div.la-big', { dataset: { metric: ex.label || '', v: String(ex.value) } }, h('b', { text: nf(ex.value) }),
      h('span.u', { text: unitW }), h('span', { html: sig(env) })));
  const key = 'detected';
  const rows = (c.regions || []).filter((r) => r[key] && r[key].value !== null && r.sgg !== ex.sgg);
  if (rows.length) {
    const ul = h('ul.la-rl');
    rows.slice(0, 5).forEach((r) => ul.append(h('li', {}, chip(r.state, r.state_label), h('a', { href: XI(r.sgg), text: r.name }),
      h('span.n.num', { text: nf(r[key].value) }, h('small', { text: r[key].unit === 'count' ? '건' : r[key].unit })))));
    if (rows.length > 5) ul.append(h('li.la-rl-more', { text: `외 ${rows.length - 5}곳` }));
    sec.append(ul);
  }
  return sec;
}

/* 영상 ↔ 결과(같은 자리 · 손잡이) + 결과 장면 여러 장 */
function compareCard(c) {
  const sec = h('section.t-card.la-box', { 'aria-label': '영상과 결과' }, h('h2.la-h', {}, '영상 ↔ 결과', h('small', { text: '같은 자리' })));
  const sw = c.swipe;
  if (sw && sw.before && sw.after) {
    const after = h('img.after', { src: sw.after, alt: '', loading: 'lazy' });
    const bar = h('span.bar', { 'aria-hidden': 'true' }, h('i', { text: '‹ ›' }));
    const range = h('input.la-sw-r', { type: 'range', min: '0', max: '100', value: '50', 'aria-label': '영상과 AI 분석 결과 나눠 보기' });
    const box = h('div.la-sw', {}, h('img.before', { src: sw.before, alt: '', loading: 'lazy' }), after, bar,
      h('span.tag.l', { text: '영상' }), h('span.tag.r', { text: 'AI 분석' }), range);
    const set = (v) => { after.style.clipPath = `inset(0 0 0 ${v}%)`; bar.style.left = v + '%'; };
    range.addEventListener('input', () => set(range.value));
    set(50);
    sec.append(box);
    if (sw.caption) sec.append(h('p.la-cap2', { text: sw.caption }));
  }
  const scenes = (c.scenes || []).filter((s) => s.src && s.src !== c.scene?.src).slice(0, 4);
  if (scenes.length) {
    const big = sec.querySelector('.la-sw');
    const th = h('div.la-thumbs');
    scenes.forEach((s) => th.append(h('figure', {}, h('img', { src: s.src, alt: '', loading: 'lazy' }), s.caption ? h('figcaption', { text: s.caption.split(' · ').pop() }) : null)));
    sec.append(th);
    if (!big && !sw) sec.classList.add('la-box--thumbs');
  }
  if (!sw && !scenes.length) sec.append(h('p.la-none-t', { text: '나란히 볼 장면이 아직 없습니다' }));
  return sec;
}

/* 쓰이는 곳 — 상태별로 지역을 묶어(운영 · 시범 · 첫 결과 전) + 기관 검토 요청 */
function usesCard(c) {
  const sec = h('section.t-card.la-box.la-wide', { 'aria-label': '쓰이는 곳' }, h('h2.la-h', {}, '쓰이는 곳', h('small', { text: c.uses?.text || '' })));
  const groups = new Map();
  for (const r of c.regions || []) {
    const k = `${r.state}|${r.imagery || ''}`;
    if (!groups.has(k)) groups.set(k, { state: r.state, label: r.state_label, imagery: r.imagery, list: [] });
    groups.get(k).list.push(r);
  }
  if (!groups.size) { sec.append(h('p.la-none-t', { text: '아직 적용한 지역이 없습니다' })); return sec; }
  const ul = h('ul.la-use');
  for (const g of [...groups.values()].sort((a, b) => ({ ga: 0, pilot: 1, none: 2 }[a.state] - { ga: 0, pilot: 1, none: 2 }[b.state]))) {
    ul.append(h('li', {}, chip(g.state, g.label),
      h('span.rg', {}, ...g.list.flatMap((r, i) => [i ? ' · ' : '', g.state === 'none' ? r.name : h('a', { href: XI(r.sgg), text: r.name })])),
      h('span.im', { text: g.imagery || (g.state === 'none' ? '영상 등록 필요' : '') })));
  }
  const rp = c.reports?.value;   // 기관이 보낸 검토 요청(쉬운 말 — 나중 6 ⓐ · 질문 2 ⓐ · 예전 '기관 신고')
  if (rp) ul.append(h('li', {}, h('span.t-chip', { dataset: { lv: 'wait' }, text: '기관 검토 요청' }), h('span.rg', { text: `${nf(rp)}건${c.reports_sum ? ` · ${c.reports_sum}` : ''}` }), h('a.im', { href: '../lx-inbox/', text: '요청함' })));
  sec.append(ul);
  return sec;
}

/* 이 카드의 조건 — '대조'(지목 · 대장 양식) 줄은 지도 서비스(질문 1)가 정해질 때까지 숨긴다(질문 2 ⓐ) ·
   학습 정보(무엇으로 배웠나 · 원칙 166)는 이 자세히 화면에만 — 서버 c.learn(모델 기록 · 학습 표본 · 기반 모델) 그대로 */
function condCard(c) {
  const t = c.time;
  const L = c.learn;
  const acc = L?.acc && L.acc.value !== null && L.acc.value !== undefined ? `검증 정확도 ${L.acc.value}%` : '';
  const smp = L?.sample;
  const learnRows = L ? [
    ['학습', [acc, L.updated ? `${L.updated} 학습` : ''].filter(Boolean).join(' · ') || '—', '모델 기록 · 학습 끝 검증 값'],
    ...(smp ? [['학습 자료', [smp.region, smp.task, `표본 ${nf(smp.images?.value ?? 0)}장`].filter(Boolean).join(' · '), smp.classes?.length ? `배운 것 ${[...new Set(smp.classes)].join(' · ')}` : '']] : []),
    ...(L.base ? [['기반 모델', [L.base.name, L.base.acc?.value != null ? `검증 정확도 ${L.base.acc.value}%` : ''].filter(Boolean).join(' · ')]] : []),
  ] : [];
  const rows = [
    ['입력 영상', c.imagery || '—'], ['시점', c.timepoints || '—'],
    ['걸리는 시간', t ? t.text : '첫 분석 뒤 표시', t ? '최근 분석 기록' : ''],
    ['찾는 것', c.finds || '—'], ...learnRows,
    ['버전 · 담당', `${c.version ? 'v' + c.version : '판 없음'} · ${c.owner || '담당 미지정'}`],
  ];
  return h('section.t-card.la-box.la-wide', { 'aria-label': '이 카드의 조건' }, h('h2.la-h', { text: '이 카드의 조건' }),
    h('dl.la-dl', {}, ...rows.map(([k, v, s]) => h('div', {}, h('dt', { text: k }), h('dd', {}, v, s ? h('small', { text: s }) : null)))));
}

/* ═════════════ 영상 고르기(질문 3 ⓐ · 원칙 153 · 시안 design-r15/map-service-3 B) ═════════════
   고른 지역을 덮는 공유 영상(서버 GET /cards/{카드}/imagery — 분석 판정과 한 출처)을 카드 두 열로: 미리보기(실제 영상에서 만든 것) · 해상도 · 촬영 시기 · 범위 ·
   '이 서비스에 맞음 / 해상도 차이가 커 결과가 거칠 수 있음 / 맞지 않음(고를 수 없음)'. 오른쪽 = 범위 지도(고른 영상 청록 · 다른 영상 흰 테두리).
   영상 원천(브이월드 · 국토지리정보원 연도별)은 분석 작업이 원천 타일을 부르는 길이 서버에 없어 줄을 두지 않는다(구현 12차 보고). */
function imageryCard(c) {
  const tabs = h('div.la-im-tabs', { role: 'tablist', 'aria-label': '지역' });
  const grid = h('div.la-im-grid');
  const more = h('button.la-im-more', { type: 'button', hidden: true });
  let all = false;   // 처음엔 여섯 장(고른 영상 먼저) · '더 보기'로 모두
  const mapBox = h('div.la-im-map');
  const note = h('p.la-note', { text: '테두리는 영상이 실제로 덮는 범위입니다. 고른 영상 범위 안에서만 분석하고, 범위 밖은 결과에 나오지 않습니다.' });
  const el = h('section.t-card.la-box.la-wide.la-im', { id: 'imagery', 'aria-label': '영상 고르기' },
    h('h2.la-h', {}, '영상 고르기', h('small', { text: '고른 지역을 덮는 공유 영상' })), tabs,
    h('div.la-im-body', {}, h('div.la-im-r', {}, mapBox, note), grid, more));
  const cache = new Map();
  let stage = null, seq = 0;
  const thumbs = new Map();
  const thumb = (id) => {
    if (!thumbs.has(id)) thumbs.set(id, authBlob(`/catalog/imagery/${encodeURIComponent(id)}/thumb`).catch(() => null));
    return thumbs.get(id);
  };
  const rect = (b) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } });
  const fc = (list) => ({ type: 'FeatureCollection', features: list.map((x) => (x.footprint ? { type: 'Feature', properties: {}, geometry: x.footprint } : rect(x.bounds))) });
  function clear() {
    seq++;
    tabs.replaceChildren(); tabs.hidden = true; more.hidden = true;
    grid.replaceChildren(h('p.la-im-none', { text: '오른쪽에서 지역을 고르면 그 지역을 덮는 영상이 여기에 보입니다.' }));
    mapBox.hidden = true; note.hidden = true;
  }
  async function show(regions, sgg, chosen, onPick, onTab) {
    const my = ++seq;
    tabs.hidden = regions.length < 2;
    tabs.replaceChildren(...regions.map((r) => h('button.la-chip', { type: 'button', role: 'tab', 'aria-selected': String(r.sgg === sgg), 'aria-pressed': String(r.sgg === sgg), onclick: () => onTab(r.sgg) }, r.name)));
    let d = cache.get(sgg);
    if (!d) {
      grid.replaceChildren(h('p.la-im-none', { text: '영상을 찾는 중' }));
      try { d = await api(`/cards/${encodeURIComponent(c.id)}/imagery?` + new URLSearchParams({ region: sgg })); cache.set(sgg, d); }
      catch (e) { if (my === seq) grid.replaceChildren(h('p.la-im-none', { text: e.message || '영상 목록을 불러오지 못했습니다' })); return; }
    }
    if (my !== seq) return;
    const items = d.items || [];
    const cur = items.find((x) => x.id === chosen) || items.find((x) => x.pick) || null;
    if (!items.length) {
      grid.replaceChildren(h('p.la-im-none', {}, `${d.name}을 덮는 영상이 아직 없습니다 · `, h('a', { href: '../lx-ingest/', text: '데이터 올리기' })));
      mapBox.hidden = true; note.hidden = true; more.hidden = true; return;
    }
    const ordered = cur ? [cur, ...items.filter((x) => x.id !== cur.id)] : items;
    const list = all ? ordered : ordered.slice(0, 6);
    more.hidden = ordered.length <= 6;
    more.textContent = all ? '접기' : `영상 ${ordered.length - 6}개 더 보기`;
    more.onclick = () => { all = !all; show(regions, sgg, chosen, onPick, onTab); };
    grid.replaceChildren(...list.map((x) => {
      const pic = h('div.la-im-th');
      thumb(x.id).then((u) => { if (u) pic.append(h('img', { src: u, alt: '', loading: 'lazy' })); else pic.classList.add('is-blank'); });
      const on = cur && x.id === cur.id;
      return h('button.la-im-c', { type: 'button', 'aria-pressed': String(!!on), disabled: x.fit === 'no' || undefined, title: x.fit === 'no' ? x.fit_text : undefined,
        onclick: () => { if (x.fit === 'no' || on) return; onPick(x); show(regions, sgg, x.pick ? null : x.id, onPick, onTab); } },
        pic, h('div.la-im-b', {}, h('p.la-im-n', { text: x.name }),
          h('dl', {}, h('dt', { text: '해상도' }), h('dd.num', { text: x.gsd_word || '—' }), h('dt', { text: '촬영 시기' }), h('dd.num', { text: x.when || '—' }),
            h('dt', { text: '범위' }), h('dd', { text: x.range || '—' })),
          h('span.la-fit', { dataset: { fit: x.fit }, text: x.fit_text })));
    }));
    mapBox.hidden = false; note.hidden = false;
    try {
      if (!stage) { stage = K.createStage(mapBox, { bounds: d.bounds || K.KOREA, interactive: true, scale: false }); await stage.ready; }
      if (my !== seq) return;
      await stage.geo('others', fc(items.filter((x) => !cur || x.id !== cur.id)), 'focus');
      await stage.geo('pick', fc(cur ? [cur] : []), 'ai');
      stage.map.resize();
      stage.map.fitBounds(d.bounds || cur?.bounds, { padding: 20, duration: 0 });
    } catch (e) { K.devlog('range map', String(e?.message || e)); }
  }
  clear();
  return { el, show, clear };
}

/* ═════════════ 이 카드로 분석(오른쪽 고정) ═════════════ */
function analyzePanel(side, c, picker) {
  side.classList.add('t-card');
  side.append(h('h2.la-side-h', { text: '이 카드로 분석' }));
  /* '서비스 카드에서 관리하기' 링크는 뺀다 — 직원 메뉴에 서비스 카드 없음 · 공개된 서비스 관리는 LX 관리자 화면(원칙 151) */
  if (!c.can_analyze) {
    side.append(h('p.la-cant', { text: c.cant || '아직 이 카드로 분석할 수 없습니다' }),
      h('p.la-note', { text: '분석 모델이 등록되면 여기에서 바로 분석합니다.' }));
    return;
  }
  const picks = new Map();            // sgg → { name, fit, imagery(직원이 고른 영상 · 없으면 서버가 고름) }
  const step = (n, title, small) => h('div.la-step', {}, h('i', { text: String(n) }), h('b', { text: title }), small ? h('small', { text: small }) : null);
  const where = h('div.la-where');
  const list = h('ul.la-picks');
  const eta = h('div.la-eta');
  const go = h('button.t-btn.la-go', { type: 'button', text: '분석 시작', disabled: true });
  const msg = h('p.la-note', {}, '작업 대기열에 들어갑니다.', h('br'), '분석이 끝나면 지도 서비스에 층으로 쌓입니다.');
  const done = h('div.la-done', { hidden: true });
  side.append(step(1, '어디', '여러 곳 가능'), where, list, step(2, '결과까지'), eta, go, msg, done);

  K.regionPicker(where, { onPick: (r) => add(r) }).then((rp) => {
    rp.input.placeholder = '시군구 이름으로 찾기'; rp.input.value = '';
    const r = REGION && rp.items.find((x) => x.sgg_cd === REGION);   // 홈에서 직원이 고른 지역
    if (r) add(r);
  });

  async function add(r) {
    const inp = where.querySelector('input'); if (inp) setTimeout(() => { inp.value = ''; }, 0);
    if (!r?.sgg_cd || picks.has(r.sgg_cd) || picks.size >= 5) return;
    picks.set(r.sgg_cd, { name: r.name, fit: null, imagery: null });
    draw();
    showPicker(r.sgg_cd);
    await refit(r.sgg_cd);
  }
  async function refit(sgg) {
    const p = picks.get(sgg); if (!p) return;
    p.fit = null; draw();
    let f = null;
    try { f = await api(`/cards/${encodeURIComponent(c.id)}/fit?` + new URLSearchParams({ region: sgg, ...(p.imagery ? { imagery: p.imagery.id } : {}) })); }
    catch (e) { f = { fits: false, note: e.message || '지금은 확인할 수 없습니다' }; }
    if (picks.get(sgg) === p) { p.fit = f; draw(); }
  }
  /* 영상 고르기 칸 — 지금 보는 지역(여러 곳이면 탭) · 카드를 누르면 그 지역의 분석 영상이 바뀐다 */
  function showPicker(sgg) {
    if (!picker) return;
    if (!sgg || !picks.has(sgg)) { const k = [...picks.keys()].pop(); if (!k) { picker.clear(); return; } sgg = k; }
    picker.show([...picks.entries()].map(([k, p]) => ({ sgg: k, name: p.name })), sgg, picks.get(sgg).imagery?.id || null, (it) => {
      const p = picks.get(sgg); if (!p) return;
      p.imagery = it.pick ? null : { id: it.id, name: it.name };   // 서버가 고르는 영상을 다시 고르면 '고르지 않음'과 같다
      refit(sgg);
    }, (k) => showPicker(k));
  }
  function draw() {
    list.replaceChildren(...[...picks.entries()].map(([sgg, p]) => {
      const f = p.fit;
      const line = !f ? h('span.s.wait', { text: '영상과 카드 조건을 보는 중' })
        : f.fits ? h('span.s.ok', { text: `${f.imagery?.word ? f.imagery.word + ' · ' : ''}카드 조건에 맞음 ✓` })
          : f.fits === null ? h('span.s', {}, '등록된 영상이 없습니다 · ', h('a', { href: '../lx-ingest/', text: '데이터 올리기' }))
            : h('span.s.warn', { text: f.note || '이 카드로 분석할 수 없습니다' });
      const img = p.imagery ? p.imagery.name : f?.imagery?.word ? `${f.imagery.word} 영상` : '';
      return h('li', {}, h('div.r1', {}, h('b', { text: p.name }), h('button.la-x', { type: 'button', 'aria-label': `${p.name} 빼기`, text: '×', onclick: () => { picks.delete(sgg); draw(); showPicker(null); } })),
        line, ...(f?.fits && f.scope_text ? String(f.scope_text).split(' — ').map((t) => h('span.s.sub', { text: t })) : []),
        picker && f && f.fits !== null ? h('span.s.sub', {}, `영상 · ${img || '서버가 고름'} · `, h('a', { href: '#imagery', text: '영상 고르기', onclick: (e) => { e.preventDefault(); showPicker(sgg); picker.el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } })) : null,
        f?.running ? h('span.s', {}, '이미 분석 중입니다 · ', h('a', { href: MAPSVC, text: '지도 서비스' })) : null);
    }));
    const ok = [...picks.entries()].filter(([, p]) => p.fit?.fits && !p.fit.running);
    if (!picks.size) eta.replaceChildren(h('span.la-dash', { text: '—' }), h('span', { text: '지역을 고르면 최근 분석 기록으로 보여 드립니다' }));
    else if (!ok.length) eta.replaceChildren(h('span.la-dash', { text: '—' }), h('span', { text: [...picks.values()].some((p) => !p.fit) ? '확인하는 중' : '분석할 수 있는 지역이 없습니다' }));
    else {
      const secs = ok.map(([, p]) => p.fit.eta?.seconds).filter((x) => x);
      const words = ok.map(([, p]) => `${p.name} ${p.fit.eta?.text || '첫 분석 뒤 표시'}`);
      eta.replaceChildren(ok.length === 1 && secs.length ? h('b', { text: ok[0][1].fit.eta.text }) : h('span.la-dash', { text: `${ok.length}곳` }),
        h('span', { text: ok.length === 1 ? (ok[0][1].fit.eta ? '최근 같은 영상 분석의 실제 속도로' : '첫 분석 뒤 표시') : words.join(' · ') }));
    }
    go.disabled = !ok.length;
    go.textContent = ok.length > 1 ? `${ok.length}곳 분석 시작` : '분석 시작';
  }
  go.addEventListener('click', async () => {
    const ok = [...picks.entries()].filter(([, p]) => p.fit?.fits && !p.fit.running);
    if (!ok.length) return;
    go.disabled = true; go.textContent = '시작하는 중';
    const res = [];
    for (const [sgg, p] of ok) {
      try { const r = await api(`/cards/${encodeURIComponent(c.id)}/analyze`, { method: 'POST', body: { region: sgg, ...(p.imagery ? { imagery: p.imagery.id } : {}) } }); res.push({ ok: true, name: p.name, sgg: r.region, running: r.running, map: r.map }); }
      catch (e) { res.push({ ok: false, name: p.name, why: e.message || '시작하지 못했습니다' }); }
    }
    picks.clear(); draw(); picker?.clear();
    done.hidden = false;
    done.replaceChildren(h('p.la-done-h', { text: res.some((r) => r.ok) ? '분석을 시작했습니다' : '시작하지 못했습니다' }),
      h('ul', {}, ...res.map((r) => h('li', {}, h('b', { text: r.name }), r.ok ? h('a.t-btn.t-btn--text', { href: mapHref(r.map), text: r.running ? '분석 중 · 지도 서비스' : '지도 서비스에서 보기' }) : h('span.warn', { text: r.why })))));
    if (res.some((r) => r.ok)) K.toast('분석을 시작했습니다 · 끝나면 지도 서비스에 층으로 쌓입니다', { action: { label: '지도 서비스', href: mapHref(res.find((r) => r.ok).map) } });
  });
  draw();
}
