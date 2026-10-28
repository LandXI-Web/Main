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
import { modal } from '../kit/modal.js';
import { rangeOption } from '../kit/range-option.js';
import { swipePic, absSrc } from '../kit/swipe.js';

const who = await K.gate('lx-console');
const Q = new URLSearchParams(location.search);
const CARD = Q.get('card');
const REGION = Q.get('region');
const IMAGERY = Q.get('imagery');    // 업로드 창 '이 영상으로 분석하기' — 다 올린 내 영상(region 과 함께)      // 홈 '바로 분석하기'에서 직원이 고른 시군구(화면이 고른 것 아님 — 원칙 33) — 카드 상세의 '어디'에 미리 담는다
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
   카드 한 틀: 그림(결과 장면 > 학습 표본 > 빈 틀) → 이름 → 한 줄 → AI 모델 정확도 · 모델 갱신 → 대상 지역 n곳 → 분석하기 · 자세히.
   숫자 · 날짜 = 서버 모델 기록(카드 덱의 model) 한 출처. 보기 개수 = 한 페이지 2 · 4 · 6 · 8장(기본 4장 · 지도-4 ⓐ · 원칙 150) + 페이지 넘김 — 이 브라우저에 기억. */
function perList() { return [2, 4, 6, 8]; }
/* 한 화면 맞춤(10-24 사용자 "한 화면에 나오는 카드 장수를 조절하는게 정상") — 고른 장수가 페이지 스크롤 없이 한 화면에 들어오게
   열 × 줄을 남은 넓이 · 높이로 고르고(카드 비율에 가까운 쪽), 그래도 넘치면 글자 · 그림 크기를 한 단계씩 줄인다(토큰 단계 · 잘림 없음).
   휴대폰 폭(700 미만)은 한 화면 한 장 + 페이지 넘김(장수 고르기는 숨김). */
function narrow() { return matchMedia('(max-width: 699px)').matches; }
function perNow(n) { return narrow() ? 1 : n; }   // 휴대폰 = 한 화면 한 장 + 페이지 넘김
function fitGrid(grid, n) {
  const cards = [...grid.children].filter((x) => x.classList.contains('la-ac'));
  if (!cards.length) { grid.style.removeProperty('grid-template-columns'); grid.style.removeProperty('grid-template-rows'); delete grid.dataset.fit; return; }
  const W = grid.clientWidth, H = Math.max(grid.clientHeight, 240), gap = 16;
  let best = null;
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    if (narrow() && c > 1) break;
    const cw = (W - gap * (c - 1)) / c, ch = (H - gap * (r - 1)) / r;
    if (cw < 220 && c > 1) break;
    const score = Math.abs(Math.log((cw / ch) / 0.8)) + (c * r - n) * 0.5;
    if (!best || score < best.score) best = { c, r, score };
  }
  grid.style.gridTemplateColumns = `repeat(${best.c}, minmax(0, 1fr))`;
  grid.style.gridTemplateRows = `repeat(${best.r}, minmax(0, 1fr))`;
  /* 고정 틀(10-25 원칙 338) — 칸 높이는 모든 카드가 같고(제목 1줄 · 설명 2줄 · 지표 · 대상 지역 1줄 · 영상 칩 · 단추), 글이 길면 그 칸 안에서 글자를 한 단계씩 줄인다.
     그래서 '넘침'은 카드 몸이 칸을 넘는지(그림 칸이 바닥보다 작아지는지)와 숫자 칸만 본다 — 제목 · 설명 길이는 단계(data-fit)를 내리지 않는다 */
  const over = () => { fitText(cards); return cards.some((el) => el.scrollHeight > el.clientHeight + 1
    || [...el.querySelectorAll('.la-ac-hero b, .la-ac-hero small')].some((t) => t.scrollWidth > t.clientWidth + 1)); };
  delete grid.dataset.tight; delete grid.dataset.spill;
  for (const f of ['3', '2', '1', '0']) { grid.dataset.fit = f; if (!over()) return; }
  grid.dataset.tight = '1';                                  // 낮은 화면(1280×720 등) — 정확도 · 갱신을 한 줄로
  if (!over()) return;
  grid.dataset.spill = '1';                                  // 그래도 넘치면 자르지 않고 아래로(잘림 0이 먼저)
  grid.style.gridTemplateRows = `repeat(${best.r}, auto)`;
}   // 함수 — 맨 위 await(gallery) 가 이 줄보다 먼저 돈다
/* 카드 글 칸 맞춤 — 칸 크기는 그대로, 글자만 글자 단계(토큰)를 하나씩 내려 본다. 그래도 넘치면 말줄임(제목) · 두 줄 줄임(설명) + 전체 글은 title(마우스를 올리면 보임) */
function fsTable() {                                          // 함수 — 맨 위 await(gallery) 가 이 줄보다 먼저 돈다(let · const 못 씀)
  if (fsTable.px) return fsTable.px;
  const cs = getComputedStyle(document.documentElement);
  return (fsTable.px = ['--fs-num', '--fs-t1', '--fs-t2', '--fs-body', '--fs-aux', '--fs-tag'].map((k) => [k, parseFloat(cs.getPropertyValue(k)) || 0]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]));
}
function shrinkTo(el, min, full, overflows) {
  el.style.removeProperty('font-size'); el.removeAttribute('title');
  if (!overflows()) return;
  const base = parseFloat(getComputedStyle(el).fontSize);
  for (const [k, v] of fsTable()) {
    if (v >= base - 0.5 || v < min) continue;
    el.style.fontSize = `var(${k})`;
    if (!overflows()) return;
  }
  el.title = full;                                           // 바닥 글자에서도 넘침 — 말줄임 · 줄 줄임(글은 title 로)
}
function fitText(cards) {
  for (const c of cards) {
    const t = c.querySelector('.k-sc-t'), l = c.querySelector('.la-ac-line');
    if (t) shrinkTo(t, 15, t.textContent.replace(/\u2060/g, ''), () => t.scrollWidth > t.clientWidth + 1);          // 제목 바닥 = 보조(15)
    if (l && l.offsetParent) shrinkTo(l, 14, l.textContent, () => {                                                 // 설명 바닥 = 꼬리표(14)
      l.style.webkitLineClamp = 'unset'; const o = l.scrollHeight > l.clientHeight + 1; l.style.removeProperty('-webkit-line-clamp'); return o;
    });
  }
}
function perDef() { return matchMedia('(min-width:2200px)').matches ? 6 : 4; }   // 고르기 전 기본 = 그 해상도 한 줄(원칙 248 · 2200 이상 6열)
function readPer() { try { const n = +localStorage.getItem('lx-analyze.per'); return perList().includes(n) ? n : perDef(); } catch { return perDef(); } }
function savePer(n) { try { localStorage.setItem('lx-analyze.per', String(n)); } catch { /* 저장 못 해도 화면은 그대로 */ } }

async function authBlob(path) {
  const s = session.get();
  const r = await fetch(API.prefix + path, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
  if (!r.ok || r.status === 204) throw new Error('sample');
  const b = await r.blob();
  if (!b.size) throw new Error('sample');
  return URL.createObjectURL(b);
}

/* 카드 그림(10-11 GPT2-5 다시 · 원칙 186) — 배포 신청 때 올린 대표 그림(승인되면 카드 그림 = 서버 scene). 대체 그림 · 학습 표본으로 꾸미지 않는다:
   그림이 없거나 못 받으면 같은 틀에 '그림 없음' 그대로(원칙 140 같은 틀). */
function acCard(c, href, more) {
  const pic = h('div.k-sc-crop.la-ac-pic');
  const blank = (p) => { const keep = [...p.querySelectorAll('.la-ac-cat')]; p.classList.add('is-blank'); p.replaceChildren(h('span.k-sc-blank', { text: '그림 없음' }), ...keep); };
  const src = c.scene?.src ? (String(c.scene.src).startsWith('/api/') ? API.base + c.scene.src : c.scene.src) : null;
  if (src && c.scene.swipe?.before) pic.append(swipePic(c.scene, () => blank(pic)));          // 원본 ↔ AI 결과 한 장(원칙 339)
  else if (src) pic.append(h('img', { src, alt: '', loading: 'lazy', decoding: 'async', onerror: () => blank(pic) }));
  else blank(pic);
  if ((c.groups || []).length || !c.official) pic.append(h('div.la-ac-cat', {}, ...(c.official ? [] : [h('span.is-rv', { text: '검토' })]), ...(c.groups || []).map((g) => h('span', { text: g }))));   // 분야(여러 개 · 질문 5) · 공개 승인 전 = '검토'
  const md = c.model || {};
  const acc = md.acc && md.acc.value !== null && md.acc.value !== undefined ? md.acc.value : null;
  const tg = c.targets || [];
  const tgText = tg.length > 3 ? `${tg.slice(0, 3).join(' · ')} 외 ${tg.length - 3}곳` : tg.join(' · ');
  return h('article.k-sc.la-ac', { dataset: { kind: 'analyze', state: c.state || 'none', card: c.id || '' } }, pic,
    h('div.k-sc-b.la-ac-b', {},
      h('h3.k-sc-t', { text: String(c.name || '').replace(/·/g, '⁠·⁠') }),   // '단동·다동'처럼 가운뎃점 앞뒤에서 줄이 끊기지 않게(줄바꿈 규칙)
      h('p.k-sc-line.la-ac-line', { text: c.line || '' }),
      h('div.la-ac-hero', {},
        h('div', { title: md.acc?.tip || null }, acc === null ? h('b', { text: '—' }) : h('b.num', {}, String(acc), h('i', { text: '%' })), h('small', { text: 'AI 모델 정확도' })),   // 기준 한 줄('학습에 쓰지 않은 영상 n장으로 잼')은 자세히 화면에만(원칙 187 — 이름은 'AI 모델 정확도' 하나 · GPT3-5)
        h('div', {}, h('b.num.d', { text: md.updated || '—' }), h('small', { text: '모델 갱신' }))),
      h('div.la-ac-where', {}, h('span.k', { text: `대상 지역 ${tg.length}곳` }), h('span.v', { text: tgText || '아직 없음', title: tg.join(' · ') }),
        h('span.v2', { text: tg.length ? (tg.length > 1 ? `${tg[0]} 외 ${tg.length - 1}곳` : tg[0]) : '아직 없음', title: tg.join(' · ') })),   // 가장 촘촘한 단계(data-fit 0)에서 한 줄
      h('div.la-ac-imk', (c.imagery_kinds || []).length ? { 'aria-label': '쓸 수 있는 영상' } : { 'aria-hidden': 'true' }, ...(c.imagery_kinds || []).map((k) => h('span', { text: k }))),   // 영상 칩이 없어도 같은 높이 칸(고정 틀 — 아래 칸 줄이 카드마다 맞게)
      h('div.k-sc-acts', {}, h('a.t-btn.k-sc-go', { href: href(c), text: '분석하기' }), h('a.k-sc-more', { href: more(c), text: '자세히 →' }))));
}

async function gallery() {
  document.title = '분석하기 · Land-XI';
  page.append(h('header.la-head', {}, h('h1.t-h3', { text: '분석 서비스' })));   // 머리 한 줄 설명 · '이 화면은?' 뺌(10-25 사용자 "이 부분은 삭제한다")
  const tools = h('div.la-tools');
  const grid = h('div.la-grid.la-acg');
  const box = h('div');
  const pager = h('nav.la-pager', { 'aria-label': '페이지' });
  page.append(tools, box, grid, pager);
  page.classList.add('la-page--fit');      // 한 화면에 고른 장수만큼(10-24 사용자 — 장수를 늘려도 스크롤 없이 카드를 줄여 한 화면에)
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
  // 정식 서비스 + 공개 승인 전 '검토' 서비스(등록된 모델이 있어 분석할 수 있는 국내 카드 · 10-24 "바로 가능한 서비스 8개는 카드를 제작한다") — 검토 카드는 그림 위 '검토' 표시
  const all = (deck.items || []).filter((c) => c.official || (c.can_analyze && c.scope !== 'global'));
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
    const per = perNow(F.per);
    const pages = Math.max(1, Math.ceil(list.length / per));
    F.page = Math.min(Math.max(1, F.page), pages);
    const from = (F.page - 1) * per;
    grid.replaceChildren(...list.slice(from, from + per).map((c) => acCard(c, href, more)));
    const go = (p) => { F.page = p; draw(); grid.scrollIntoView?.({ block: 'nearest' }); };
    const pb = (label, p, cls = '', aria) => h(`button.la-pg${cls}`, { type: 'button', disabled: p < 1 || p > pages || undefined,
      'aria-current': p === F.page && !cls ? 'page' : undefined, 'aria-label': aria, onclick: () => go(p) }, label);
    pager.replaceChildren(...(pages > 1 ? [pb('‹', F.page - 1, '.ar', '앞 페이지'),
      ...Array.from({ length: pages }, (_, i) => pb(String(i + 1), i + 1, '', `${i + 1}페이지`)),
      pb('›', F.page + 1, '.ar', '다음 페이지')] : []),
      h('small', { text: pages > 1 ? `${list.length}장 가운데 ${from + 1}–${Math.min(from + per, list.length)}` : `${list.length}장 모두 한 페이지에` }));
    fitGrid(grid, per);          // 페이지 넘김 줄까지 그린 뒤(그 높이가 카드 칸 높이를 바꾼다)
  };
  let raf = 0;
  try { new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fitGrid(grid, perNow(F.per))); }).observe(grid); } catch { /* 옛 브라우저 — 창 크기 바뀜만 */ }
  document.fonts?.ready?.then(() => fitGrid(grid, perNow(F.per)));   // 글꼴이 다 오면 높이가 바뀐다 — 다시 맞춤
  let rz = 0, wasNarrow = narrow();
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (narrow() !== wasNarrow) { wasNarrow = narrow(); draw(); } else fitGrid(grid, perNow(F.per)); }, 120); });
  const search = h('input.t-input.la-search', { type: 'search', placeholder: '서비스 · 지역 찾기', 'aria-label': '분석 서비스 찾기', autocomplete: 'off' });
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
    K.empty(box, e.status === 404 ? { kind: '404', title: '없는 카드입니다', action: { label: '분석 서비스', href: './' } } : { kind: 'error', title: '카드를 불러오지 못했습니다', onRetry: () => location.reload() });
    return;
  }
  box.remove();
  document.title = `${c.name} · 분석 서비스 · Land-XI`;
  page.classList.add('la-page--dt');

  const crumb = h('nav.la-crumb', { 'aria-label': '위치' }, h('a', { href: './', text: '분석 서비스' }), h('span', { 'aria-hidden': 'true', text: '›' }), h('b', { text: c.name }));
  const hero = h('figure.la-hero', { class: c.scene ? '' : 'is-blank' });
  if (c.scene) {
    hero.append(c.scene.swipe?.before ? swipePic(c.scene) : h('img', { src: absSrc(c.scene.src), alt: '', decoding: 'async', fetchpriority: 'high' }));
    if (c.scene.caption) hero.append(h('figcaption.la-cap', { text: c.scene.caption }));
    if (c.scene.ex) hero.append(h('span.la-ex', { text: '다른 지역 결과 · 예시' }));
  } else hero.append(h('span.la-blank', { text: '그림 없음' }));   // 대체 그림 없이 같은 틀(원칙 186)

  const head = h('div.la-dt-head', {},
    h('div.la-tags', {}, c.official || !c.can_analyze ? chip(c.state, c.state_label) : h('span.t-chip', { dataset: { lv: 'wait' }, text: '검토' }), c.version ? h('span.la-tag.num', { text: `v${c.version}` }) : null,
      h('span.la-tag', { text: c.owner ? `담당 ${c.owner}` : '담당 미지정' })),
    h('h1.la-title', { text: c.name }),
    c.line ? h('p.la-line', { text: c.line }) : null);

  const chgFrame = c.frame === 'change' || c.id === 'card-change';
  const picker = c.can_analyze && !chgFrame && !c.pair ? imageryCard(c) : null;   // 국토 변화 분석서비스는 영상을 고르지 않는다(대상지 + 두 해 · 국토지리정보원 영상 API)
    // 영상 고르기(질문 3 ⓐ) — 오른쪽에서 지역을 고르면 그 지역을 덮는 영상 카드 두 열 + 범위 지도
  const body = h('div.la-dt-body', {}, picker?.el, resultCard(c), compareCard(c), usesCard(c), condCard(c));
  const side = h('aside.la-side', { id: 'analyze', 'aria-label': '이 카드로 분석' });
  const dt = h('div.la-dt', {}, h('div.la-dt-top', {}, crumb, hero, head), side, body);
  page.append(dt);
  K.panes(side, { edge: 'left', key: 'side', cssVar: '--la-side', varHost: dt, min: 320, max: 640, otherMin: 520, below: 1100 });   // 칸 크기 조절(원칙 263)
  analyzePanel(side, c, picker, body);
  if (location.hash === '#analyze' && matchMedia('(max-width: 1099px)').matches) side.scrollIntoView({ block: 'start' });
  S.fresh(c.as_of);
}

/* 결과 예시 — 큰 숫자(카드의 결과 예시와 같은 값) + 지역별 표 */
function resultCard(c) {
  const sec = h('section.t-card.la-box', { 'aria-label': '결과 예시' }, h('h2.la-h', { text: '결과 예시' }));
  const ex = c.example;
  if (!ex) {                                   // AI 분석 결과(다듬은 결과 수)가 없으면 숫자 없이 — 분석 칸 도형 수는 쓰지 않는다(사용자 규칙 2)
    sec.append(h('p.la-none-t', { text: c.pair ? '두 시점 영상 등록 뒤 채움' : c.state === 'none' && c.scene && !c.scene.ex ? '실제 분석 결과는 위 그림과 지도 서비스에서 봅니다 · 결과 숫자는 지역에 적용한 뒤 셉니다' : c.state === 'none' ? '첫 분석 결과가 나오면 여기에 보입니다' : c.example_note === 'AI 분석 결과 있음' ? 'AI 분석 결과는 지역별 지도에서 볼 수 있습니다' : '업무 결과를 아직 세지 않았습니다' }));
    return sec;
  }
  /* 큰 숫자 = AI 분석 결과(원칙 135) — 셈 단위는 서버가 준 그대로(필지 · 동 · 건) */
  const env = { value: ex.value, unit: ex.unit || '', basis: ex.basis, as_of: ex.as_of, source: ex.source };
  const unitW = ex.unit === 'count' ? '건' : ex.unit || '';
  const parts = Array.isArray(ex.parts) && ex.parts.length > 1 ? ex.parts : null;     // 찾는 것마다 따로(사람 · 차량 — 10-25)
  sec.append(h('p.t-label.la-ex-l', { text: [ex.word || 'AI 분석 결과', ex.region, ex.as_of ? `${ymd(ex.as_of)} 기준` : ''].filter(Boolean).join(' · ') }),
    parts ? h('div.la-big.is-parts', { dataset: { metric: ex.label || '', v: String(ex.value) } },
      ...parts.map((q) => h('span.la-pt', { dataset: { v: String(q.value) } }, h('span.u', { text: q.label }), h('b', { text: nf(q.value) }), h('span.u', { text: q.unit }))),
      h('span', { html: sig(env) }))
      : h('div.la-big', { dataset: { metric: ex.label || '', v: String(ex.value) } }, h('b', { text: nf(ex.value) }),
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
  const top = c.scene?.swipe?.before ? c.scene : null;                       // 큰 그림이 원본 ↔ 결과 밀어 보기(원칙 339) — 같은 짝을 여기 다시 두지 않는다
  const sw = top ? null : c.swipe;
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
  const scenes = (c.scenes || []).filter((s) => s.src && s.src !== c.scene?.src && s.src !== top?.swipe?.before && !s.pair).slice(0, 4);
  if (top && !scenes.length) return null;
  if (scenes.length) {
    const big = sec.querySelector('.la-sw');
    const th = h('div.la-thumbs');
    const caps = scenes.map((s) => (s.caption ? s.caption.split(' · ').pop() : ''));
    const one = caps.length > 1 && caps.every((x) => x && x === caps[0]);   // 장면 이름이 모두 같으면(같은 두 시점) 한 번만 — 같은 말 반복 없앰(10-24)
    scenes.forEach((s, i) => th.append(h('figure', {}, h('img', { src: s.src, alt: '', loading: 'lazy' }), caps[i] && !one ? h('figcaption', { text: caps[i] }) : null)));
    sec.append(th);
    if (one) sec.append(h('p.la-note', { text: caps[0] }));
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
  if (!groups.size) { sec.append(h('p.la-none-t', { text: c.pair ? '두 시점 영상 등록 뒤 채움' : '아직 적용한 지역이 없습니다' })); return sec; }
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
  const acc = L?.acc && L.acc.value !== null && L.acc.value !== undefined ? `AI 모델 정확도 ${L.acc.value}%` : '';
  const smp = L?.sample;
  const learnRows = L ? [
    ['학습', '정식 모델 · 학습 불필요', c.pair?.sources ? 'AI 모델 정확도 ' + Object.entries(c.pair.sources).map(([k, x]) => `${k === 'growth' ? '생육기' : '생산기'} ${x.acc?.value ?? '—'}%`).join(' · ')   // 비교 카드 = 시기별 두 모델(원천 카드와 같은 값)
      : [acc, L.updated ? `${L.updated} 학습` : '', L.acc?.basis_line || '모델 기록'].filter(Boolean).join(' · ')],   // 이미 학습한 정식 모델로 바로 분석(원칙 329)
    ...(smp ? [['학습 자료', [smp.region, smp.task, `학습 데이터 ${nf(smp.images?.value ?? 0)}장`].filter(Boolean).join(' · '), smp.classes?.length ? `배운 것 ${[...new Set(smp.classes)].join(' · ')}` : '']] : []),
    ...(L.base ? [['기반 모델', [L.base.name, L.base.acc?.value != null ? `AI 모델 정확도 ${L.base.acc.value}%` : ''].filter(Boolean).join(' · ')]] : []),
  ] : [];
  const rows = [
    ['입력 영상', c.imagery || '—'], ['시점', c.timepoints || '—'],
    ['걸리는 시간', t ? t.text : '첫 분석 뒤 표시', t ? (t.premise || '최근 분석 기록') : ''],   // 전제(어느 영상 · 언제 기록) — 서버 한 출처(GPT2-2)
    ['찾는 것', c.finds || '—'], ...learnRows,
    ['버전 · 담당', `${c.version ? 'v' + c.version : '판 없음'} · ${c.owner || '담당 미지정'}`],
  ];
  return h('section.t-card.la-box.la-wide', { 'aria-label': '이 카드의 조건' }, h('h2.la-h', { text: '이 카드의 조건' }),
    h('dl.la-dl', {}, ...rows.map(([k, v, s]) => h('div', {}, h('dt', { text: k }), h('dd', {}, v, s ? h('small', { text: s }) : null)))));
}

/* ═════════════ 영상 고르기(질문 3 ⓐ · 원칙 153 · 시안 design-r15/map-service-3 B) ═════════════
   고른 지역을 덮는 공유 영상(서버 GET /cards/{카드}/imagery — 분석 판정과 한 출처)을 카드 두 열로: 미리보기(실제 영상에서 만든 것) · 해상도 · 촬영 시기 · 범위 ·
   '이 서비스에 맞음 / 해상도 차이가 커 결과가 거칠 수 있음 / 맞지 않음(고를 수 없음)'. 오른쪽 = 범위 지도(고른 영상 하나만 청록 · 다른 영상은 카드에 마우스를 올릴 때만 옅은 점선 — 흰 선 여러 겹 겹침 없앰 · QA-고침-2 바퀴 4).
   영상 원천(브이월드 · 국토지리정보원 연도별)은 분석 작업이 원천 타일을 부르는 길이 서버에 없어 줄을 두지 않는다(구현 12차 보고). */
function imageryCard(c) {
  const tabs = h('div.la-im-tabs', { role: 'tablist', 'aria-label': '지역' });
  const grid = h('div.la-im-grid');
  const more = h('button.la-im-more', { type: 'button', hidden: true });
  let all = false;   // 처음엔 여섯 장(고른 영상 먼저) · '더 보기'로 모두
  const mapBox = h('div.la-im-map');
  const note = h('p.la-note', { text: '청록 테두리는 고른 영상이 실제로 덮는 범위입니다. 이 범위 안에서만 분석합니다. 다른 영상 카드에 마우스를 올리면 그 범위가 점선으로 보입니다.' });
  /* 내 영상 올려서 분석(10-23 사용자 "넣어라~") — 공유 영상이 없거나 내 영상을 쓰고 싶을 때. 올리기는 업로드 상태 창(kit/uploads.js · 원칙 326)이 맡고,
     다 올리면 좌표계 · 범위 · 해상도를 읽어 공유 영상과 같은 규칙(맞음 / 거칠 수 있음 / 맞지 않음)으로 이 칸에 '내 영상'으로 보인다. 공유 데이터에는 넣지 않는다(올린 사람만). */
  const ownBtn = h('button.t-btn.t-btn--2.la-own-b', { type: 'button', text: '내 영상 업로드해서 분석', onclick: () => openOwn(c) });
  const ownSt = h('p.la-own-st', { role: 'status', hidden: true });
  const el = h('section.t-card.la-box.la-wide.la-im', { id: 'imagery', 'aria-label': '분석할 영상' },
    h('div.la-im-hd', {}, h('h2.la-h', {}, '공유 데이터에서 고르기', h('small', { text: '한 번에 영상 하나' })), ownBtn), ownSt, tabs,
    h('div.la-im-body', {}, h('div.la-im-r', {}, mapBox, note), grid, more));
  ownStatus(c, ownSt);
  const cache = new Map();
  let stage = null, seq = 0;
  K.panes(mapBox, { edge: 'bottom', key: 'im-map', min: 160, max: 640, otherMin: null, collapse: false, map: () => stage?.map });   // 범위 지도 높이 끌어서(원칙 263)
  const dash = () => { try { const m = stage.map; m.setPaintProperty('k-hover-l', 'line-dasharray', [2, 2]); m.setPaintProperty('k-hover-l', 'line-opacity', 0.7); m.setPaintProperty('k-hover-f', 'fill-opacity', 0); } catch { /* 지도 전 */ } };
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
      { const w = h('div'); grid.replaceChildren(w); K.empty(w, { kind: 'loading', compact: true }); }   // 칸은 옅은 빈 틀 · 0.4초 넘으면 가운데 '불러오는 중'(로딩-1 · 원칙 212)
      try { d = await api(`/cards/${encodeURIComponent(c.id)}/imagery?` + new URLSearchParams({ region: sgg })); cache.set(sgg, d); }
      catch (e) { if (my === seq) grid.replaceChildren(h('p.la-im-none', { text: e.message || '영상 목록을 불러오지 못했습니다' })); return; }
    }
    if (my !== seq) return;
    const items = d.items || [];
    const cur = items.find((x) => x.id === chosen) || items.find((x) => x.pick) || null;
    if (!items.length) {
      grid.replaceChildren(h('p.la-im-none', {}, `${d.name}을 덮는 공유 영상이 아직 없습니다 · `, h('a', { href: '#', text: '내 영상 업로드해서 분석', onclick: (e) => { e.preventDefault(); openOwn(c); } })));   // 공유 영상은 공유 데이터(관리자) · 없거나 원하면 내 영상(10-23 — 10-13 '고르기만'을 바로잡음)
      mapBox.hidden = true; note.hidden = true; more.hidden = true; return;
    }
    const ordered = cur ? [cur, ...items.filter((x) => x.id !== cur.id)] : items;
    import('../kit/imagery-viewer.js').then((m) => m.warmImageryViewer(ordered.slice(0, 2).map((v) => v.id))).catch(() => null);   // 크게 보기 미리 준비
    const list = all ? ordered : ordered.slice(0, 6);
    more.hidden = ordered.length <= 6;
    more.textContent = all ? '접기' : `영상 ${ordered.length - 6}개 더 보기`;
    more.onclick = () => { all = !all; show(regions, sgg, chosen, onPick, onTab); };
    grid.replaceChildren(...list.map((x) => {
      const pic = h('div.la-im-th');
      thumb(x.id).then((u) => { if (u) pic.append(h('img', { src: u, alt: '', loading: 'lazy' })); else pic.classList.add('is-blank'); });
      const on = cur && x.id === cur.id;
      // 영상은 하나만(원칙 185) — 라디오 하나 묶음 · 맞지 않는 영상은 고를 수 없음
      const rd = h('input.la-im-rd', { type: 'radio', name: `la-im-${c.id}`, value: x.id, checked: !!on || undefined, disabled: x.fit === 'no' || undefined,
        'aria-label': x.name, onchange: () => { if (x.fit === 'no') return; onPick(x); show(regions, sgg, x.pick ? null : x.id, onPick, onTab); } });
      /* 크게 보기(원칙 295) — 이 지역을 덮는 영상 안에서 앞 · 다음 · 맞는 영상이면 바로 고르기 */
      const big = (e) => { e?.preventDefault(); e?.stopPropagation(); import('../kit/imagery-viewer.js').then((m) => m.openImageryViewer({ items: ordered.map((v) => ({ ...v, region: d.name })), index: ordered.indexOf(x),
        picked: (it) => cur && it.id === cur.id, onPick: (it) => { if (it.fit === 'no') { K.toast('이 영상은 고를 수 없습니다 — ' + (it.fit_text || '범위가 맞지 않습니다')); return; } onPick(it); show(regions, sgg, it.pick ? null : it.id, onPick, onTab); } })).catch(() => K.toast('크게 보기를 열지 못했습니다')); };
      pic.addEventListener('dblclick', big);
      const peek = (v) => { if (!stage || on) return; stage.geo('hover', fc(v ? [x] : []), 'focus').then(() => dash()).catch(() => {}); };
      return h('label.la-im-c', { dataset: { on: on ? '1' : '0', no: x.fit === 'no' ? '1' : '0' }, title: x.fit === 'no' ? x.fit_text : undefined, onmouseenter: () => peek(true), onmouseleave: () => peek(false) },
        rd, pic, h('button.la-im-big', { type: 'button', 'aria-label': `${x.name} 크게 보기`, title: '크게 보기', onclick: big }, h('span', { 'aria-hidden': 'true', text: '⤢' })), h('div.la-im-b', {}, h('p.la-im-n', {}, x.own ? h('span.la-own', { text: '내 영상' }) : null, x.name),
          h('dl', {}, h('dt', { text: '해상도' }), h('dd.num', { text: x.gsd_word || '—' }), h('dt', { text: '촬영 시기' }), h('dd.num', { text: x.when || '—' }),
            h('dt', { text: '범위' }), h('dd', { text: x.range || '—' })),
          h('span.la-fit', { dataset: { fit: x.fit }, text: x.fit_text })));
    }));
    mapBox.hidden = false; note.hidden = false;
    try {
      if (!stage) { stage = K.createStage(mapBox, { bounds: d.bounds || K.KOREA, interactive: true, scale: false }); await stage.ready; }
      if (my !== seq) return;
      await stage.geo('hover', fc([]), 'focus'); dash();         // 다른 영상 = 평소엔 안 그림(겹친 흰 선 없음) · 카드에 올릴 때만 옅은 점선 하나
      await stage.geo('pick', fc(cur ? [cur] : []), 'ai');
      stage.map.resize();
      stage.map.fitBounds(d.bounds || cur?.bounds, { padding: 20, duration: 0 });
    } catch (e) { K.devlog('range map', String(e?.message || e)); }
  }
  clear();
  return { el, show, clear, forget: (sgg) => cache.delete(sgg) };
}

/* 내 영상 업로드 창 — 고르기 전 안내 + 영상 한 장(kit/uploads.js uploadPicker · 관리자 공유 데이터 올리기와 같은 부품) */
function openOwn(c) {
  const box = h('div');
  const no = h('button.t-btn.t-btn--2', { type: 'button', text: '닫기' });
  const m = modal({ title: '내 영상 업로드해서 분석', size: 'lg', body: h('div.la-own-m', {},
    h('p.la-note', { text: '올린 영상은 나만 보고 이 카드 분석에 씁니다 — 공유 데이터에는 들어가지 않습니다.' }), box, h('div.la-own-act', {}, no)) });
  no.addEventListener('click', () => m.close());
  import('../kit/uploads.js').then((U) => U.uploadPicker(box, { one: true, purpose: { kind: 'own', card: c.id, cardName: c.name }, onAdded: () => {
    m.close(true);
    K.toast("업로드를 시작했습니다 · 다 올리면 이 칸에 '내 영상'으로 보입니다");
  } })).catch(() => { box.textContent = '업로드 칸을 열지 못했습니다'; });
}
/* 이 카드의 내 영상 업로드 진행 한 줄(업로드 상태 창과 같은 값) */
function ownStatus(c, line) {
  const draw = (U) => {
    const bs = U.uploadsOf('own', c.id).filter((b) => b.state !== 'done');
    const fs = bs.flatMap((b) => b.files);
    if (!bs.length) { line.hidden = true; return; }
    const tot = fs.reduce((a, f) => a + f.size, 0), got = fs.reduce((a, f) => a + (f.bytes || 0), 0);
    line.hidden = false;
    line.textContent = bs.some((b) => b.state === 'bad') ? '내 영상을 등록하지 못했습니다 · 위쪽 업로드 표시에서 이유를 봅니다'
      : bs.some((b) => b.state === 'reg') ? '내 영상을 다 올렸습니다 — 좌표계 · 범위 · 해상도를 확인하는 중'
        : `내 영상 업로드 중 ${tot ? Math.floor((got / tot) * 100) : 0}% · 다른 화면으로 옮겨도 이어 올립니다`;
  };
  let on = false; try { on = !!localStorage.getItem('lx-up'); } catch { /* */ }
  const hook = () => import('../kit/uploads.js').then((U) => { U.onUploads(() => draw(U)); draw(U); });
  if (on) hook(); else addEventListener('lx:uploads-start', hook, { once: true });
}

/* ═════════════ 이 카드로 분석(오른쪽 고정) ═════════════ */
/* 국토 변화 분석서비스(10-23 원칙 329) — 대상지(고르기 · 구역선 파일 · 필지 목록 올리기) + 두 시점 영상(국토지리정보원 해 · 공유 데이터 · 내 영상)
   → 두 시점 각각 토지피복 AI 분석 · 비교 → 지도 서비스. 화면은 change-panel.js 한 곳. */
function changePanel(side, c) {
  import('./change-panel.js').then((m) => m.changePanel(side, c), () => side.append(h('p.la-cant', { text: '분석 칸을 열지 못했습니다' })));
}

function analyzePanel(side, c, picker, body) {
  if ((c.frame === 'change' || c.id === 'card-change') && c.can_analyze) { changePanel(side, c); return; }   // 국토 변화 틀(국토 변화 · 산사태 취약지구 — 10-25)
  if (c.pair) {          // 두 시기 비교 카드(사료작물 생육기·생산기 · 10-24) — 시기마다 끝난 분석 결과를 골라 필지별로 견준다
    import('./compare-panel.js').then((m) => m.comparePanel(side, c, body), () => side.append(h('p.la-cant', { text: '분석 칸을 열지 못했습니다' })));
    return;
  }
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
  // 내 영상 업로드 길을 분석 칸에서도 보이게(10-24 사용자가 못 찾음 — 왼쪽 '공유 데이터에서 고르기' 칸의 단추와 같은 창)
  const own = h('p.la-note.la-own-side', {}, '영상이 없거나 내 영상으로 하려면', h('br'),
    h('a', { href: '#imagery', style: 'white-space:nowrap', text: '내 영상 업로드해서 분석', onclick: (e) => { e.preventDefault(); openOwn(c); } }));
  /* 기본 | 고급 기능(10-24 원칙 335 · 사용자 "분석 구간 설정하기 … 분석 서비스 카드 모두") — 기본은 위 흐름 그대로, 고급 기능은 분석 시작 위에
     '분석 구간 설정하기'(구간 업로드 · 행정구역) · '필지 단위 집계'(kit/range-option · 국토 변화와 같은 부품 · 같은 장부) */
  const tabs = h('div.rg-tabs', { role: 'tablist', 'aria-label': '분석 방식' },
    h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', dataset: { k: 'basic' }, text: '기본' }),
    h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { k: 'adv' }, text: '고급 기능' }));
  const advBox = h('div.la-adv', { hidden: true });
  let RP = null;
  const ro = rangeOption(advBox, { buffer: /하천/.test(c.name || '') ? 100 : 50, parcels: !!c.parcel_on, sgg: () => [...picks.keys()][0] || null,
    onRange: (r) => {             // 구간을 고르면 지역이 없을 때 그 구간의 시군구를 고른다(영상 판정 · 분석은 그 시군구 영상)
      const cd = r?.sgg?.[0]; if (!cd || picks.size) return;
      const it = RP?.items?.find((x) => x.sgg_cd === cd); add({ sgg_cd: cd, name: it?.name || '' });
    } });
  const isAdv = () => tabs.querySelector('[aria-selected="true"]')?.dataset.k === 'adv';
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    for (const x of tabs.children) x.setAttribute('aria-selected', String(x === b));
    advBox.hidden = b.dataset.k !== 'adv';
  });
  side.append(tabs, step(1, '어디', '한 곳 · 영상 하나'), where, own, list, step(2, '결과까지'), eta, advBox, go, msg, done);

  K.regionPicker(where, { onPick: (r) => add(r) }).then((rp) => {
    RP = rp;
    rp.input.placeholder = '시군구 이름으로 찾기'; rp.input.value = '';
    const r = REGION && rp.items.find((x) => x.sgg_cd === REGION);   // 홈에서 직원이 고른 지역
    if (r) add(r, IMAGERY ? { id: IMAGERY, name: '내 영상' } : null);   // 업로드 창 '이 영상으로 분석하기' — 다 올린 내 영상을 고른 채로
  });
  /* 내 영상을 다 올렸다(이 화면이 열려 있을 때) — 그 영상의 지역 · 영상을 고른 채로(영상이 정한 지역 · 화면이 고른 것 아님) */
  addEventListener('lx:upload-done', (e) => {
    const d = e.detail; if (d?.purpose?.kind !== 'own' || d.purpose.card !== c.id || !d.result?.region) return;
    const it = d.result.imagery;
    picker?.forget(d.result.region.sgg_cd);
    picks.clear();
    add({ sgg_cd: d.result.region.sgg_cd, name: d.result.region.name }, it && it.fit !== 'no' ? { id: it.id, name: it.name } : null);
    if (it?.fit === 'no') K.toast(`내 영상을 올렸지만 이 카드로는 분석할 수 없습니다 — ${it.fit_text}`);
    picker?.el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  async function add(r, imagery = null) {
    const inp = where.querySelector('input'); if (inp) setTimeout(() => { inp.value = ''; }, 0);
    if (!r?.sgg_cd || picks.has(r.sgg_cd)) return;
    picks.clear();                       // 분석하기는 영상 하나만(원칙 185) — 지역을 새로 고르면 앞 지역을 바꾼다
    picks.set(r.sgg_cd, { name: r.name, fit: null, imagery });
    draw();
    showPicker(r.sgg_cd);
    await refit(r.sgg_cd);
  }
  async function refit(sgg) {
    const p = picks.get(sgg); if (!p) return;
    p.fit = null; draw();
    const my = (p.seq = (p.seq || 0) + 1);   // 늦게 온 앞 판정(서버가 고른 영상 · 전역)이 고른 영상의 판정을 덮지 않게(QA-영상판정 · 10-11 종단 시험)
    let f = null;
    try { f = await K.during(api(`/cards/${encodeURIComponent(c.id)}/fit?` + new URLSearchParams({ region: sgg, ...(p.imagery ? { imagery: p.imagery.id } : {}) }))); }   // 0.4초 넘으면 가운데 '불러오는 중'(원칙 212)
    catch (e) { f = { fits: false, note: e.message || '지금은 확인할 수 없습니다' }; }
    if (picks.get(sgg) === p && p.seq === my) { p.fit = f; draw(); }
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
          : f.fits === null ? h('span.s', { text: '등록된 영상이 없습니다' })
            : h('span.s.warn', { text: f.note || '이 카드로 분석할 수 없습니다' });
      const img = p.imagery ? p.imagery.name : f?.imagery?.word ? `${f.imagery.word} 영상` : '';
      return h('li', {}, h('div.r1', {}, h('b', { text: p.name }), h('button.la-x', { type: 'button', 'aria-label': `${p.name} 빼기`, text: '×', onclick: () => { picks.delete(sgg); draw(); showPicker(null); } })),
        line, ...(f?.fits && f.scope_text ? String(f.scope_text).split(' — ').map((t) => h('span.s.sub', { text: t })) : []),
        picker && f && f.fits !== null ? h('span.s.sub', {}, `영상 · ${img || '서버가 고름'} · `, h('a', { href: '#imagery', text: '다른 영상 고르기', onclick: (e) => { e.preventDefault(); showPicker(sgg); picker.el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } })) : null,
        f?.running ? h('span.s', {}, '이미 분석 중입니다 · ', h('a', { href: MAPSVC, text: '지도 서비스' })) : null);
    }));
    const ok = [...picks.entries()].filter(([, p]) => p.fit?.fits && !p.fit.running);
    if (!picks.size) eta.replaceChildren(h('span.la-dash', { text: '—' }), h('span', { text: '지역을 고르면 최근 분석 기록으로 보여 드립니다' }));
    else if (!ok.length) eta.replaceChildren(h('span.la-dash', { text: '—' }), h('span', { text: [...picks.values()].some((p) => !p.fit) ? '확인하는 중' : '분석할 수 있는 지역이 없습니다' }));
    else {
      const secs = ok.map(([, p]) => p.fit.eta?.seconds).filter((x) => x);
      const words = ok.map(([, p]) => `${p.name} ${p.fit.eta?.text || '첫 분석 뒤 표시'}`);
      eta.replaceChildren(ok.length === 1 && secs.length ? h('b', { text: ok[0][1].fit.eta.text }) : h('span.la-dash', { text: `${ok.length}곳` }),
        h('span', { text: ok.length === 1 ? (ok[0][1].fit.eta ? (ok[0][1].fit.eta.premise || '최근 분석 기록으로') : '첫 분석 뒤 표시') : words.join(' · ') }));
    }
    go.disabled = !ok.length;
    go.textContent = ok.length > 1 ? `${ok.length}곳 분석 시작` : '분석 시작';
  }
  go.addEventListener('click', async () => {
    const ok = [...picks.entries()].filter(([, p]) => p.fit?.fits && !p.fit.running);
    if (!ok.length) return;
    let extra = {};
    if (isAdv()) {
      const rg = ro.on() ? await ro.ready() : null;
      if (ro.on() && !rg) { K.toast('분석 구간을 고르세요'); return; }
      extra = { ...(rg ? { range: { id: rg.id } } : {}), parcels: ro.parcels() };
    }
    go.disabled = true; go.textContent = '시작하는 중';
    const res = [];
    for (const [sgg, p] of ok) {
      try { const r = await K.during(api(`/cards/${encodeURIComponent(c.id)}/analyze`, { method: 'POST', body: { region: sgg, ...(p.imagery ? { imagery: p.imagery.id } : {}), ...extra } })); res.push({ ok: true, name: r.range?.word ? `${p.name} · ${r.range.word}` : p.name, sgg: r.region, running: r.running, map: r.map }); }
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
