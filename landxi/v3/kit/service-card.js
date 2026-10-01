/* K7 service-card.js — 서비스 카드 한 벌(확인 대장 14차 카드-1 ⓐ · 원칙 90 · 93).
   한 부품 · 네 자리. 정보 여덟 칸 = ① 결과 장면 ② 상태 ③ 어디 · 기준일 ④ 이름 ⑤ 무엇을 찾나 ⑥ 결과 예시 ⑦ 조건 두 칸 ⑧ 1차 버튼 + 자세히.
   자리(kind)마다 다른 것은 배지와 ⑦ · ⑧ 칸뿐:
     'analyze' 분석하기 갤러리(LX 직원) — 쓰이는 곳 · 영상 조건 또는 걸리는 시간 / 이 카드로 분석
     'manage'  서비스 카드 관리(LX)    — 판 · 담당 / 다음 할 일 / 관리 (배지 = 공개 결재 중 · 기관 신고 n)
     'gov'     기관 서비스 선택(1차)    — 사업 연도 · LX 담당 / 최근 결과 · 할 일 / 이 서비스 열기 · 보고서 (기관 색)
     'mine'    기관 공간의 2차 서비스   — '우리 기관이 만든 서비스' 배지 · 입력이 된 1차 결과와 기준 시점 / 열기 · 설명서 (기관 색)

   쓰는 법(대시보드 '서비스 장면 · 바로 분석'도 같은 부품):
     import { loadDeck, svcCard, svcGrid } from '../kit/service-card.js';
     const deck = await loadDeck();               // GET /api/v1/cards/deck — 서버가 여덟 칸을 채운다(숫자 = /summary 한 출처 · 기관 세션 = 자기 기관만). 실패 = null
     svcGrid(el, deck.items, { kind: 'analyze' }); // 4열(≥1400) · 3 · 2 · 1(휴대폰)
     el.append(svcCard(item, { kind: 'analyze' })); // 한 장
     옵션: href(item) · more(item) — 1차 버튼 · '자세히' 주소(기본: 분석하기 상세) · compact — ⑦ · ⑧ 없이(대시보드 띠 · 고르기)
           pick: { selected, disabled, why, onPick(item) } — 카드 전체가 고르는 단추(role=radio · 기관 분석 의뢰 ② 분석 카드 고르기)
           row — 가로 모양(장면 왼쪽 작은 판 · 좁은 칸 · 휴대폰)
   기관 색: 부모에 --ci(진한) · --ci-t1(연한)이 있으면 'gov' · 'mine' 카드의 배지 · 버튼이 그 색(gov-select/brand.js applyBrand).
   장면 없는 카드 = 회백 판('결과 장면 없음' · '첫 결과 전') — 그림을 지어 넣지 않는다(원칙 42 · 4차 S1 ⓐ).
   옛 K7(serviceCard · serviceGrid · joinCards · stateOf — 메인 · 영업 · 서비스 소개의 작은 카드)은 아래에 그대로 둔다. */
import { h, esc, isEnvelope, api, hasRoute, API } from './util.js';
import { numHtml } from './bignum.js';
import { sig } from './sig.js';
import { t, df } from './i18n.js';

/* 부품 스타일 — 이 모듈을 쓰는 화면에 한 번만(화면이 <link> 로 먼저 붙였으면 건너뛴다) */
{
  const href = new URL('./service-card.css', import.meta.url).href;
  if (typeof document !== 'undefined' && ![...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === href)) {
    document.head.append(h('link', { rel: 'stylesheet', href }));
  }
}

/* ═══════════════ 카드 한 벌 ═══════════════ */
const nf = (v) => Number(v).toLocaleString('ko-KR');
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };
const STATE_LV = { ga: '', pilot: 'wait', none: 'gap' };
const STATE_WORD = { ga: '운영', pilot: '시범', none: '첫 결과 전' };
const DETAIL = (c) => `/landxi/v3/lx-analyze/?card=${encodeURIComponent(c.id)}`;

/** 서버 덱(GET /cards/deck) — { items:[카드], as_of, can_edit } · 경로가 없거나 실패하면 null(화면은 빈 상태 한 줄) */
let DECK = null;
export function loadDeck({ fresh = false } = {}) {
  if (!DECK || fresh) DECK = (async () => {
    if (!(await hasRoute('/cards/deck'))) return null;
    try {
      const j = await api('/cards/deck' + (fresh ? '?fresh=1' : ''));
      if (!Array.isArray(j?.items)) return null;
      for (const c of j.items) if (c.scene?.src && String(c.scene.src).startsWith('/api/')) c.scene.src = API.base + c.scene.src;   // 올린 장면 = 게이트웨이 파일(이 PC 개발 서버에서도 열리게)
      return j;
    } catch { return null; }
  })();
  return DECK;
}

/** ⑥ 결과 예시 — 큰 숫자 + 신뢰 기호 + 말(현장 확인 필요 필지 · 남원시). 값이 없으면 '첫 분석 뒤 표시' */
function resultEl(c, kind) {
  const ex = c.example;
  if (!ex || ex.value === null || ex.value === undefined) {
    return h('div.k-sc-res.is-none', {}, h('span', { text: c.state === 'none' || kind === 'mine' ? '첫 결과 뒤 표시' : '결과 수 집계 전' }));
  }
  const env = { value: ex.value, unit: ex.unit || '', basis: ex.basis || 'estimate', as_of: ex.as_of || '', source: ex.source || '' };
  const word = [ex.word, kind === 'gov' || kind === 'mine' ? ex.place : ex.region].filter(Boolean).join(' · ');
  return h('div.k-sc-res', { dataset: { metric: ex.label || '', v: String(ex.value) } },
    h('b', { text: nf(ex.value) }), isEnvelope(env) ? h('span.k-sc-sig', { html: sig(env) }) : null, h('span', { text: word }));
}

/** ⑦ 조건 두 칸 — 자리마다 다른 내용 */
function specCells(c, kind) {
  if (kind === 'manage') {
    const ver = c.version ? `v${c.version}` : '판 없음';
    return [['판 · 담당', `${ver} · ${c.owner || '담당 미지정'}`], ['다음 할 일', c.next?.text || '—']];
  }
  if (kind === 'gov') return [['최근 결과', c.latest ? ymd(c.latest) : '아직 없음'], ['할 일', c.todo?.text || '—']];
  if (kind === 'mine') return [];
  const second = c.time?.text ? ['걸리는 시간', c.time.text] : ['영상', c.imagery || '—'];
  return [['쓰이는 곳', c.uses?.text || '아직 없음'], second];
}

/** ③ 어디 · 기준일 줄 — 왼쪽 글 · 오른쪽 작은 글 */
function whereRow(c, kind) {
  if (kind === 'gov' || kind === 'mine') {
    const left = kind === 'mine' ? [c.since ? `${c.since}년부터` : '', c.owner_org || ''].filter(Boolean).join(' · ')
      : [c.year ? `${c.year}년 사업` : '', c.dept || ''].filter(Boolean).join(' · ');
    const right = kind === 'mine' ? (c.place || '') : (c.owner ? `LX 담당 ${c.owner}` : '');
    return h('p.k-sc-where', {}, h('span', { text: left }), right ? h('span.r', { text: right }) : null);
  }
  const at = c.as_of ? t('card.asof', { date: df(c.as_of) }) : '';
  const left = [c.where, at].filter(Boolean).join(' · ');
  const right = kind === 'manage' ? (c.publish?.label || '') : (c.version ? `v${c.version}` : '');
  return h('p.k-sc-where', {}, h('span', { text: left || '아직 결과 없음' }), right ? h('span.r', { class: kind === 'manage' ? '' : 'num', text: right }) : null);
}

/** ⑧ 1차 버튼 + 자세히 — 할 수 없는 일은 버튼을 흐리게 두지 않고 글 한 줄로(죽은 버튼 0) */
function actions(c, kind, o) {
  const more = o.more ? o.more(c) : kind === 'manage' ? DETAIL(c) : kind === 'analyze' ? DETAIL(c) : null;
  const moreLabel = o.moreLabel || (kind === 'gov' ? '보고서' : kind === 'mine' ? '설명서' : kind === 'manage' ? '분석하기에서 보기' : '자세히');
  const href = o.href ? o.href(c) : null;
  let main = null;
  if (kind === 'analyze') {
    main = c.can_analyze ? h('a.t-btn.k-sc-go', { href: href || DETAIL(c) + '#analyze', text: '이 카드로 분석' })
      : h('span.k-sc-cant', { text: c.cant || '분석 모델 등록 전' });
  } else if (kind === 'manage') {
    main = h('a.t-btn.k-sc-go', { href: href || `/landxi/v3/lx-cards/?card=${encodeURIComponent(c.id)}`, text: '관리' });
  } else if (kind === 'gov') {
    main = c.open === false ? h('span.k-sc-cant', { text: c.year ? `${c.year}년 시작` : '사업 시작 전' }) : h('a.t-btn.k-sc-go', { href: href || '#', text: '이 서비스 열기' });
  } else if (kind === 'mine') {
    main = h('a.t-btn.k-sc-go', { href: href || '#', text: '열기' });
  }
  const showMore = more && !(kind === 'gov' && (c.open === false || !c.report));
  return h('div.k-sc-acts', {}, main, showMore ? h('a.t-btn.t-btn--text.k-sc-more', { href: more, text: moreLabel }) : null);
}
/* gov '보고서' 주소는 화면이 more(c) 로 준다(그 기관의 보고서 화면) — c.report = 필지 대조가 있는 서비스 */

/** ① 결과 장면 · ② 상태 배지 · (manage) 관리 신호 · 다른 지역 결과 표기 */
function cropEl(c, kind) {
  const sc = c.scene && c.scene.src ? c.scene : null;
  const fig = h('div.k-sc-crop', { class: sc ? '' : 'is-blank' });
  if (sc) fig.append(h('img', { src: String(sc.src).startsWith('/api/') ? API.base + sc.src : sc.src, alt: '', loading: 'lazy', decoding: 'async' }));   // 올린 장면 = 게이트웨이 파일
  else fig.append(h('span.k-sc-blank', { text: c.state === 'none' || kind === 'mine' ? '결과가 나오면 장면이 보입니다' : '결과 장면 없음' }));
  const word = kind === 'mine' ? (c.badge || '우리 기관이 만든 서비스') : (kind === 'gov' ? (c.status_label || STATE_WORD[c.state]) : (c.state_label || STATE_WORD[c.state]));
  const lv = kind === 'mine' ? 'mine' : kind === 'gov' && c.open === false ? 'gap' : STATE_LV[c.state] ?? 'gap';
  fig.append(h('span.k-sc-badge.t-chip', { dataset: lv ? { lv } : {}, text: word || '' }));
  if (kind === 'manage') {
    const rp = isEnvelope(c.reports) ? c.reports.value : c.reports;
    const sigs = [c.publish?.pending ? '공개 결재 중' : '', rp ? `기관 신고 ${nf(rp)}` : ''].filter(Boolean);
    if (sigs.length) fig.append(h('span.k-sc-flag', { text: sigs.join(' · ') }));
  }
  if (sc && sc.ex) fig.append(h('span.k-sc-ex', { text: '다른 지역 결과 · 예시' }));
  return fig;
}

/** 카드 한 장 — c = 덱 항목(서버 GET /cards/deck), o = { kind, href, more, moreLabel, compact, pick } */
export function svcCard(c, o = {}) {
  const kind = o.kind || 'analyze';
  const pick = o.pick || null;
  const tag = pick ? 'button' : 'article';
  const attrs = { dataset: { kind, state: c.state || 'none', card: c.id || '' } };
  if (pick) Object.assign(attrs, { type: 'button', role: 'radio', 'aria-checked': pick.selected ? 'true' : 'false', ...(pick.disabled ? { 'aria-disabled': 'true' } : {}) });
  const el = h(`${tag}.k-sc`, { ...attrs, class: [o.compact || pick ? 'is-compact' : '', o.row ? 'is-row' : '', pick?.selected ? 'is-on' : '', pick?.disabled ? 'is-off' : '', kind === 'gov' && c.open === false ? 'is-off' : ''].filter(Boolean).join(' ') });
  const body = h('div.k-sc-b', {},
    whereRow(c, kind),
    h('h3.k-sc-t', { text: c.name || '' }),
    c.line ? h('p.k-sc-line', { text: c.line }) : null,
    kind === 'mine' && c.input ? h('p.k-sc-in', {}, h('b', { text: '입력' }), h('span', { text: c.input.text || '' }), c.input.note ? h('small', { text: c.input.note }) : null) : null,
    resultEl(c, kind));
  if (!(o.compact || pick)) {
    const cells = specCells(c, kind);
    if (cells.length) body.append(h('dl.k-sc-spec', {}, ...cells.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v })))));
    body.append(actions(c, kind, o));
  } else if (pick?.why) {
    body.append(h('p.k-sc-why', { text: pick.why }));
  }
  el.append(cropEl(c, kind), body);
  if (pick) el.addEventListener('click', () => { if (!pick.disabled) pick.onPick?.(c); });
  return el;
}

/** 카드 격자 — 4열(≥1400) · 3 · 2 · 1(휴대폰). list = 덱 항목들 */
export function svcGrid(el, list, o = {}) {
  el.classList.add('k-sc-grid');
  if (o.cols) el.dataset.cols = String(o.cols);
  el.replaceChildren(...(list || []).map((c) => svcCard(c, o)));
  return { el };
}

/* ═══════════════ 옛 K7 — 작은 서비스 카드(메인 · 영업 · 서비스 소개) ═══════════════ */
/* 크롭 3:2 상단 풀폭 · 기준일 라벨 · 상태 칩(잉크 농도 3단: 운영 · 시범 · 첫 결과 전) · 제목 H4 2줄 · 결과 수 32 잉크 + 기호.
   크롭이 없으면 그림 없이 회백 판(is-blank). 3열 그리드 거터 24 = serviceGrid().
   serviceCard({ card, deploy, crop, href, where }) → <article>
   joinCards(cards, deploys) → [{ card, deploy, state }] (실배포 우선 · 시험 배포 제외) */
const RANK = { ga: 0, canary: 1, shadow: 2, draft: 3 };
const isTest = (d) => /-test(-\d+)?$/.test(d?.id || '') || /\(테스트\)|\btest\b/i.test(d?.name || '');

/** 상태 3종: ga | pilot | none */
export function stateOf(card, deploy) {
  if (deploy && isEnvelope(deploy.scale) && deploy.stage === 'ga') return 'ga';
  if (deploy && (deploy.stage === 'canary' || deploy.stage === 'shadow')) return 'pilot';
  if (card?.status === '운영' && deploy && isEnvelope(deploy.scale)) return 'ga';
  if (card?.status === '검토' || card?.status === '시범') return 'pilot';
  return 'none';
}
const CHIP = { ga: ['card.state.ga', ''], pilot: ['card.state.pilot', 'wait'], none: ['card.state.none', 'gap'] };

export function joinCards(cards = [], deploys = []) {
  const live = deploys.filter((d) => !isTest(d));
  return cards.map((card) => {
    const mine = live.filter((d) => d.card_id === card.id).sort((a, b) =>
      (isEnvelope(b.scale) - isEnvelope(a.scale)) || (RANK[a.stage] ?? 9) - (RANK[b.stage] ?? 9) || String(b.updated_at).localeCompare(String(a.updated_at)));
    const deploy = mine[0] || null;
    return { card, deploy, deploys: mine, state: stateOf(card, deploy) };
  });
}

export function serviceCard({ card, deploy, crop, href, where, state, onClick } = {}) {
  const st = state || stateOf(card, deploy);
  const [chipKey, lv] = CHIP[st];
  const scale = deploy && isEnvelope(deploy.scale) ? deploy.scale : null;
  const asOf = scale?.as_of || deploy?.updated_at || null;
  const src = crop || card?.crop_url || null;
  const tag = href ? 'a' : onClick ? 'button' : 'article';
  const el = h(`${tag}.t-card.k-svc`, { ...(href ? { href } : {}), ...(onClick ? { type: 'button', onclick: onClick } : {}), dataset: { state: st, card: card?.id || '' } });
  const fig = h('div.k-svc-crop', { class: src ? '' : 'is-blank', 'aria-hidden': src ? undefined : 'true' }, src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }) : null);
  const meta = h('div.k-svc-meta', {},
    h('span.t-label', { text: [where, asOf ? t('card.asof', { date: df(asOf) }) : ''].filter(Boolean).join(' · ') }),
    h('span.t-chip', { dataset: lv ? { lv } : {}, text: t(chipKey) }));
  const title = h('h3.t-h4.k-svc-t', { text: card?.name || '' });
  const num = h('div.k-svc-n', { html: scale ? numHtml(scale) : '' });
  el.append(fig, meta, title, num);
  return el;
}

/** 3열 그리드(≤ 960 2열 · ≤ 640 1열) */
export function serviceGrid(el, rows, opts = {}) {
  el.classList.add('k-svc-grid'); el.innerHTML = '';
  for (const r of rows) el.append(serviceCard({ ...r, ...(opts.map ? opts.map(r) : {}) }));
  return { el };
}
void esc;
