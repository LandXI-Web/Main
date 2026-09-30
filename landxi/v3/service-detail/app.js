/* service-detail — 서비스 상세(명세 §2.14 · 토스 5-4 · 카드 1장 = 1페이지 · 게스트·영업·직원·기관 공용).
   히어로(실결과 크롭 + H2 2줄 + 문장 1) → 교차 블록 3–5(모듈 이름 + 한 줄 + `자세히 보기` · 실결과 크롭 또는 결과 지도 실시간)
   → 관련 카드(K7) → 마감(`이 지역에서 열기` / `로그인` / K9 한 줄) → 출처 띠.
   지역은 변수: `?region=`(배포본 region_profile) · `?deploy=` → 기관 = 자기 관할 배포본만 · LX = 결과가 있는 첫 배포본. 코드에 지역 이름·좌표 0.
   숫자는 한 출처: 히어로·결과 지도 = 같은 배포본 봉투(실시간). 숫자가 박힌 정적 화면 캡처 0.
   4차: 지금 지역 밖 결과 = 지역 이름 + '예시' · 블록 항상 3 이상 · 결과 지도 로드 전 = K9 진행 막대.
   5차: 큰 숫자 = `현장 확인 필요 {n}필지`(XI맵과 같은 출처 · adapter.surveyOf) · 그 숫자가 없으면 `{지역} · {기준일} 기준`만(탐지 총수는 숫자 자리에 0)
        · 블록 K9 = 스틸 없는 문장 카드(스틸은 히어로 한 장만). */
import {
  shell, whoami, empty, serviceGrid, joinCards, stateOf, numHtml, drawer, table, devDrawer, createStage,
  h, enter, t, df,
} from '../kit/index.js';
import { isEnvelope, isDev, RM, session, esc } from '../kit/util.js';
import { loadCards, loadDetail, loadDeploys, cropUrl, deployOfSet, buildBlocks, liveLayer, landingOf, focusOf, regionOfSet } from './adapter.js';
import { loadSummary, itemFor, stageKey, metric, scaleOf, userWords } from './summary.js';

const Q = new URLSearchParams(location.search);
const V3 = '/landxi/v3/';
const FRONT = V3 + 'login/';
const STAGE = { ga: 'ga', canary: 'pilot', shadow: 'pilot' };   // 요약이 없을 때만 쓰는 배포 단계 → 상태
const LV = { ga: '', pilot: 'wait', none: 'gap' };
const RANK = { ga: 0, canary: 1, shadow: 2, draft: 3 };
const mobile = () => matchMedia('(max-width: 640px)').matches;
/* 지역 이름 = 요약 항목의 지역(메인 · 영업과 같은 이름) · 없으면 배포 기록의 지역 이름 */
const where = (d) => (SUM && d ? itemFor(SUM, d.card_id, d, { strict: true })?.region_name : '') || d?.region_name?.ko || d?.region_name?.en || '';
const asof = (d) => (d?.scale?.as_of ? t('card.asof', { date: df(d.scale.as_of) }) : '');

/* 결과 세트가 지금 지역 밖인가 — 기관 = 자기 관할 배포본 · LX = 고른 배포본과 지역이 다르면 '예시'.
   지역 이름은 지우지 않는다(정직 표기). 게스트는 지역 맥락이 없어 표기하지 않는다. */
const exOf = (set, deps = cur ? [cur] : []) => {
  if (!who || !set) return false;
  const r = regionOfSet(D.vis, set).profile;
  return !(r && deps.some((d) => d?.region_profile === r));
};
/* '예시' 신뢰 기호(K6 기호와 같은 모양) — 호버 한 줄 = 어느 지역 결과인지 */
const exSig = (name) => `<span class="t-sig k-sig" data-sig="ex" tabindex="0" role="note" aria-label="${esc(t('sig.ex'))}" data-why="${esc(['다른 지역 결과', name].filter(Boolean).join(' · '))}"></span>`;
/* 기관 세션 = 자기 관할 밖 결과는 싣지 않는다(지역 이름 0 · 예시 표기도 없이 뺀다). LX·게스트는 그 카드 실결과 지역을 그대로 보인다 */
const dropSet = (set, deps) => isTenant() && exOf(set, deps);
const markEx = (el, name) => { el.insertAdjacentHTML('beforeend', exSig(name)); el.dataset.ex = '1'; return el; };
/* 큰 숫자 = 실태조사 '현장 확인 필요'(허용 라벨 · XI맵과 같은 출처) — 배포본 id → 봉투(없으면 null) */
const NEED = new Map();
const NEED_L = '현장 확인 필요';
const needOf = (d) => (d ? NEED.get(d.id) || null : null);
const needAsof = (env) => (env?.as_of ? t('card.asof', { date: df(env.as_of) }) : '');
/** 라벨 + 숫자(K6) 한 줄 — `현장 확인 필요 1,079필지 ✓` */
const needHtml = (env) => `<span class="sd-nl">${esc(NEED_L)}</span>${numHtml(env)}`;

let who = null, S = null, D = null, deploys = [], mine = [], own = [], cur = null, SUM = null;
/* 상태 · 수 = 요약(summary) 한 출처 — 배포본에 딱 맞는 항목(같은 카드 · 시군구/기관/지역 이름)만 */
/*   자기 결과가 없는 배포본(계획 · 초안)은 같은 지역 항목을 빌려 오지 않는다 → 첫 결과 전 */
/*   시군구에 적용된 배포본(sgg_cd · 초안 아님)은 같은 카드 · 같은 시군구 항목과 바로 잇는다(손 설정 없이 새 지역 결과가 잡힌다) */
const itemOfDeploy = (d) => {
  if (!SUM || !d) return null;
  if (d.sgg_cd && d.stage !== 'draft') { const it = (SUM.items || []).find((i) => i.card === d.card_id && String(i.sgg_cd || '') === String(d.sgg_cd)); if (it) return it; }
  return isEnvelope(d.scale) ? itemFor(SUM, d.card_id, d, { strict: true }) : null;
};
/** 서비스 지역 표의 한 줄(배포본 하나) — 그 배포본에 딱 맞는 요약 항목만 · 없으면 첫 결과 전(요약이 없을 때만 배포 단계) */
const rowState = (d) => (SUM ? stageKey(itemOfDeploy(d)?.stage) || 'none' : STAGE[d.stage] || 'none');
/** 카드 상태(ga · pilot · none) — 요약 항목이 있으면 그 stage, 요약은 있는데 항목이 없으면 첫 결과 전, 요약이 없으면 기존 판정 */
const stateFor = (cardId, d, fallback) => {
  if (!SUM) return fallback;
  const it = (d && itemOfDeploy(d)) || itemFor(SUM, cardId);
  return it ? stageKey(it.stage) || 'none' : 'none';
};
const LAND = new Map();   // 배포본 id → 착지 href(지역 코드 · 해외 나라/지역)

boot().catch((e) => {
  console.warn('[service-detail]', e);
  document.body.dataset.state = 'error';
});

async function boot() {
  const had = !!session.get();
  who = await whoami();
  /* 로그인 상태에서 세션 확인(/me)이 실패했다(게이트웨이 순단 등) — 게스트 화면으로 바꾸지 않는다: 한 줄 + 다시 시도 */
  if (!who && had && session.get()) return offline();
  document.body.classList.toggle('sd-guest', !who);
  S = shell({ who, home: 'service-detail', title: '서비스' });
  S.main.classList.add('sd-main');
  roleOnce();
  if (!who) S.mast(h('a.k-mast-b.sd-in', { href: FRONT + '?next=' + encodeURIComponent(location.pathname + location.search), text: '로그인' }));
  if (who && isDev()) devDrawer({ who });

  const [{ items: cards0 }, deps, sum] = await Promise.all([loadCards(who), loadDeploys(who), loadSummary()]);
  const cards = cards0.map((c) => ({ ...c, name: userWords(c.name) }));
  deploys = deps; SUM = sum;
  const rows = joinCards(cards, deploys);

  let id = Q.get('card');
  if (!id) {
    const pick = rows.find((r) => r.state === 'ga') || rows.find((r) => r.card.status === '운영') || rows[0];
    id = pick?.card.id;
    if (id) history.replaceState(null, '', `?card=${encodeURIComponent(id)}${Q.get('region') ? '&region=' + encodeURIComponent(Q.get('region')) : ''}`);
  }
  D = id ? await loadDetail(id, cards, who) : null;
  if (!D) return notFound();
  D.card = { ...D.card, name: userWords(D.card.name) };
  for (const k of ['real', 'pending', 'core']) D[k] = (D[k] || []).map((b) => ({ ...b, name: userWords(b.name), desc: userWords(b.desc) }));

  mine = deploys.filter((d) => d.card_id === id).sort((a, b) => (isEnvelope(b.scale) - isEnvelope(a.scale)) || (RANK[a.stage] ?? 9) - (RANK[b.stage] ?? 9));
  own = isTenant() ? mine.filter((d) => d.tenant_id === who.me.tenant_id) : mine;
  cur = pickDeploy();
  document.title = `${D.card.name} · Land-XI`;
  S.fresh(null);   // 기준일만 있고 갱신 시각은 없다 — 시각을 지어내지 않는다

  /* 착지 주소(시군구 코드 · 해외 나라/지역) · 결과 지도 층 · 현장 확인 필요(배포본마다) — 한 번에 */
  const [live] = await Promise.all([
    who ? liveLayer(cur && isEnvelope(cur.scale) ? [cur, ...own] : own, who, D.card.scope) : null,
    Promise.all(own.map(async (d) => { try { const L = await landingOf(d, D.vis); LAND.set(d.id, `${V3}${homeFor(L.home)}/?${L.qs}`); } catch { /* 기본 주소 */ } })),
  ]);
  /* 현장 확인 필요(큰 숫자) = 요약의 field_check — 배포본마다 · 값이 없으면 숫자 없이 */
  for (const d of deploys) { const e = metric(itemOfDeploy(d), 'field_check'); if (e) NEED.set(d.id, e); }

  const row = rows.find((r) => r.card.id === id);
  const state = stateFor(id, cur, who ? (row?.state || stateOf(D.card, cur)) : guestState(D.card));

  S.main.append(
    hero(state),
    blocks(live),
    related(rows, id),
    closing(),
    sources(),
    h('footer.sd-foot', {}, h('span', { text: 'Land-XI' }), h('span', { text: 'Hyper Performance · Hyper Solution · Hyper GeoAI' })),
  );
  enter(S.main);
  document.body.dataset.state = 'ready';
}

/* 게스트: 서버 배포 기록이 없으므로 카드 상태만으로(운영 · 시범 · 첫 결과 전) */
function guestState(card) { return card.status === '운영' ? 'ga' : card.status === '검토' || card.status === '시범' ? 'pilot' : 'none'; }
const isTenant = () => !!who && who.me?.realm !== 'lx';
/* 해외 착지: 해외 기관·LX = global. 국내 = XI맵 */
const homeFor = (home) => (home === 'global' ? 'global' : 'xi-clean');

/* 지역: ?deploy= → ?region= → 첫 배포본. 기관은 자기 관할 배포본만(없으면 null → 마감 K9 한 줄 · 버튼 0) */
function pickDeploy() {
  const dq = Q.get('deploy'); if (dq) { const d = own.find((x) => x.id === dq); if (d) return d; }
  const r = Q.get('region');
  if (r) { const d = own.find((x) => x.region_profile === r || String(x.sgg_cd || '') === r); if (d) return d; }
  return own[0] || null;
}
/* 열 수 있는가 — 게스트(로그인) 또는 이 카드의 지역 배포본이 있을 때만 */
const canOpen = () => !who || !!cur;

function openHref(d = cur) {
  if (!who) return FRONT + '?next=' + encodeURIComponent(location.pathname + location.search);
  if (d && LAND.has(d.id)) return LAND.get(d.id);
  const p = new URLSearchParams();
  if (d?.sgg_cd || d?.region_name?.ko) p.set('region', d.sgg_cd || d.region_name.ko);
  if (d?.id) p.set('deploy', d.id);
  return `${V3}${D.card.scope === 'global' ? 'global' : 'xi-clean'}/${p.toString() ? '?' + p : ''}`;
}

/* 마스트 역할 칩 — 이름이 역할과 같으면 한 번만('LX 직원'). 키트 shell 이 고쳐지면 이 함수는 할 일이 없다 */
function roleOnce() {
  const r = S.app.querySelector('.k-role'); const b = r?.querySelector('b'); if (!b) return;
  const k = b.textContent.trim(), rest = r.textContent.slice(b.textContent.length).trim();
  if (!rest || rest === k) { r.textContent = k; r.classList.add('sd-role1'); }
}

/* ── 세션 확인 실패 — 한 줄 + 다시 시도(로그인 버튼으로 바꾸지 않는다) ── */
function offline() {
  S = shell({ who: null, home: 'service-detail', title: '서비스' });
  S.main.classList.add('sd-main');
  S.app.querySelector('.k-help')?.remove();
  const box = h('section.sd-off');
  S.main.append(box);
  empty(box, { kind: 'error', title: '지금은 불러올 수 없습니다', onRetry: () => location.reload() });
  document.body.dataset.state = 'offline';
}

/* ── 히어로 ───────────────────────────────────────── */
function hero(state) {
  const [l1, l2] = String(D.intro.headline || '').split(' / ');
  const chipLv = { ga: '', pilot: 'wait', none: 'gap' }[state];
  const tx = h('div.sd-hero__tx', {},
    h('div.sd-meta.t-enter', {}, h('span.t-chip', { dataset: chipLv ? { lv: chipLv } : {}, text: t(`card.state.${state}`) }), h('span.t-label', { text: D.card.name })),
    h('h1.t-h2.t-enter', {}, l1 || '', l2 ? h('br') : null, l2 || ''),
    D.intro.line ? h('p.sd-line.t-enter', { text: D.intro.line }) : null,
  );
  const fig = h('figure.sd-hero__vis.t-card--hero');
  const vis = D.vis, hv = D.hero;
  const off = hv.set && dropSet(hv.set);   // 관할 밖 결과 = 히어로 이미지도 싣지 않는다
  const set = hv.set && vis.sets[hv.set] && !off ? hv.set : null;
  if (hv.img && !off) {
    fig.append(h('img.sd-crop', { src: hv.img, alt: '', decoding: 'async', fetchpriority: 'high' }));
    /* 가르기(전 · 후) — 좌 = 이전 시점 원영상, 우 = 이후 시점 + 실판독 변화 윤곽 */
    if (hv.swipe) fig.append(h('span.sd-sw.sd-sw--l', { text: hv.swipe[0] }), h('span.sd-sw.sd-sw--r', { text: hv.swipe[1] }));
    /* 네 시점(2×2) — 같은 필지가 한 해 동안 바뀌는 모습 */
    if (hv.quad) hv.quad.forEach((q, i) => fig.append(h(`span.sd-sw.sd-q.sd-q--${i}`, { text: q })));
  } else {
    /* 결과 전 — 그림 없이 회백 카드 + 문장 하나(검정 잔재 0) */
    const e = h('div.sd-hero__empty'); fig.append(e); fig.classList.add('is-empty');
    const det = metric(itemOfDeploy(cur), 'detected');   // 영상 조각은 없어도 이 지역 결과 수는 있다(summary)
    empty(e, { kind: 'first', text: det ? `${where(cur)} · ${det.label} ${Number(det.value).toLocaleString("ko-KR")}${det.unit || ''}` : '첫 결과가 생기면 여기에 결과가 보입니다' });
    e.querySelector('h6')?.remove();   // 상태는 위 칩 한 곳(시범 칩 옆에 '첫 결과 전' 제목이 겹치지 않게)
  }
  /* 우하단 흰 카드 — 윗줄 `{지역} · {기준일} 기준` / 아랫줄 `현장 확인 필요 {n}필지 ✓`(그 배포본 지역 합계 · XI맵과 같은 출처).
     그 숫자가 없으면 윗줄만. 지금 지역 밖 결과 = `{지역} · {연도 영상}` + 예시(숫자 없음) */
  if (set && hv.img) {
    const ex = exOf(set), R = regionOfSet(vis, set), meta = vis.sets[set];
    const d = ex ? null : cur || deployOfSet(mine, set);
    const env = needOf(d);
    const line = env ? [where(d) || R.name, needAsof(env)] : d ? [where(d) || R.name, asof(d)] : [R.name, `${meta.year} ${meta.kind}`];
    const lab = h('span.t-label', { text: line.filter(Boolean).join(' · ') });
    if (ex) markEx(lab, R.name);
    fig.append(h('div.sd-inset.t-card.is-text', {},
      h('div.sd-inset__b', {}, lab, env ? h('div.sd-inset__n', { html: needHtml(env) }) : null)));
  }
  return h('section.sd-hero', {}, tx, fig);
}

/* ── 교차 블록 3–5 ─────────────────────────────────── */
function blocks(live) {
  const wrap = h('section.sd-blocks');
  buildBlocks(D, live, (s) => dropSet(s)).forEach((b, i) => {
    const shots = shotsOf(b);
    const go = b.kind === 'live' ? () => { location.href = openHref(b.deploy); } : shots.length ? () => detail(b, shots) : null;
    const link = go ? h('button.t-btn.t-btn--text.sd-more', { type: 'button', text: '자세히 보기', onclick: go }) : null;
    const isE = b.kind === 'empty';   // 크롭 없는 모듈 — 문장은 K9 안에 한 번만(제목 반복 0)
    const tx = h('div.sd-block__tx', {},
      h('p.t-label.sd-no.t-enter', { text: String(i + 1).padStart(2, '0') }),
      h('h2.t-h3.t-enter', { text: b.name }),
      b.desc && !isE ? h('p.sd-desc.t-enter', { text: b.desc }) : null,
      link ? h('div.t-enter', {}, link) : null);
    const fig = h('figure.sd-block__vis.t-enter');
    if (b.kind === 'live') {
      fig.classList.add('is-live');
      liveMap(fig, b);
    } else if (shots.length) {
      fig.append(h('img', { src: shots[0].src, alt: '', loading: 'lazy', decoding: 'async' }), capEl(shots[0]));
      fig.classList.add('is-link');
      fig.addEventListener('click', go);
    } else {
      /* K9 compact · 제목 없음 · 문장 1 = 모듈 설명 */
      const e = h('div'); fig.append(e); fig.classList.add('is-empty');
      empty(e, { kind: 'first', text: b.desc || undefined, compact: true });
      e.querySelector('h6')?.remove();   // 그림 없는 문장 카드
      e.classList.add('sd-k9t');
    }
    wrap.append(h('article.sd-block', { class: i % 2 ? 'is-rev' : '', dataset: { kind: b.kind } }, tx, fig));
  });
  return wrap;
}

/* 블록 한 개의 실제 이미지 — 결과 세트 = 크롭 최대 8장(세트가 둘이면 4장씩) */
function shotsOf(b) {
  if (b.kind !== 'set') return [];
  const per = Math.ceil(8 / b.sets.length);
  return b.sets.flatMap((s) => D.vis.sets[s].frames.slice(0, per).map((f, k) => {
    const meta = D.vis.sets[s], R = regionOfSet(D.vis, s), ex = exOf(s);
    const d = ex ? null : deployOfSet(mine, meta.result || s);
    const when = meta.labels?.[k] || `${meta.year} ${meta.kind}`;
    return {
      src: cropUrl(D.vis, s, f), thumb: cropUrl(D.vis, s, f, false), ex, name: R.name,
      cap: [R.name, when, !meta.labels ? asof(d) : ''].filter(Boolean).join(' · '),
    };
  })).slice(0, 8);
}
/* 크롭 캡션 — 지역 · 시점(· 기준일) · 지금 지역 밖이면 예시 */
function capEl(s) { const c = h('figcaption.sd-cap', { text: s.cap }); if (s.ex) markEx(c, s.name); return c; }

/* 결과 지도(실시간) — 그 배포본의 결과 층을 V-World 위성 위에 · 보일 때만 켠다(WebGL 1개) */
const loadJs = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
let LIBS = null;
const libs = () => (LIBS ||= (async () => {
  if (!window.maplibregl) await loadJs('/landxi/proto/vendor/maplibre/maplibre-gl.js');
  if (!window.pmtiles) await loadJs('/landxi/xi/vendor/pmtiles/pmtiles.js');
})());
function liveMap(fig, b) {
  const host = h('div.sd-live');
  const d = b.deploy, it = b.layer;
  const env = needOf(d);
  const cap = h('figcaption.sd-cap', { text: [where(d), env ? needAsof(env) : asof(d)].filter(Boolean).join(' · ') });   // 숫자와 같은 기준일
  const num = env ? h('div.sd-live__n.t-card', { html: needHtml(env) }) : null;
  /* 타일이 오기 전 = --bg-1 판 + K9 진행 막대(숫자 카드·캡션은 지도가 그려진 뒤에만) */
  const ld = h('div.sd-live__ld');
  fig.append(...[host, ld, cap, num].filter(Boolean));   // 숫자가 없으면 싣지 않는다(append(null) → 'null' 글자)
  empty(ld, { kind: 'loading', compact: true });
  let started = false;
  const start = async () => {
    if (started) return; started = true;
    try {
      await libs();
      const st = createStage(host, { interactive: false, scale: true });
      await st.ready;
      const map = st.map;
      map.resize();
      map.addSource('sd-r', { type: 'vector', url: 'pmtiles://' + it.url });
      map.addLayer({ id: 'sd-r-f', type: 'fill', source: 'sd-r', 'source-layer': it.layer, paint: { 'fill-color': '#0FA9A0', 'fill-opacity': 0.34 } }, 'slot-overlay');
      map.addLayer({ id: 'sd-r-h', type: 'line', source: 'sd-r', 'source-layer': it.layer, paint: { 'line-color': 'rgba(255,255,255,.85)', 'line-width': 3 } }, 'slot-overlay');
      map.addLayer({ id: 'sd-r-l', type: 'line', source: 'sd-r', 'source-layer': it.layer, paint: { 'line-color': '#0FA9A0', 'line-width': 1.6 } }, 'slot-overlay');
      const bb = it.bounds || null;
      st.pad({ top: 48, bottom: 64, left: 40, right: 40 });
      await new Promise((ok) => { let k = 0; const f = () => { if (!k++) ok(); }; map.once('idle', f); setTimeout(f, 9000); });
      fig.classList.add('is-on'); ld.remove();
      /* 전국 → 그 지역 결과 범위 → 결과가 촘촘한 곳(필지 윤곽이 읽히는 축척) */
      const fz = await focusOf(it.id);
      if (bb) await st.go(bb, { ms: RM() ? 0 : 2200, maxZoom: Math.min(16.5, (it.maxzoom || 16) + 0.5) });
      if (fz) await st.go(fz, { ms: RM() ? 0 : 2400, maxZoom: Math.min(16, it.maxzoom || 16) });
    } catch (e) {
      console.warn('[service-detail] 결과 지도', e);
      host.remove(); num?.remove(); cap.remove(); ld.remove();
      fig.classList.add('is-empty');
      const e2 = h('div'); fig.append(e2);
      empty(e2, { kind: 'error', title: '지도를 불러오지 못했습니다' });
    }
  };
  const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '120px' });
  io.observe(fig);
}

/* 자세히 보기 — 서랍(K5)에서 그 모듈의 실제 결과를 넘겨 본다 */
function detail(b, shots) {
  const big = h('img.sd-dr-img', { alt: '', decoding: 'async' });
  const cap = h('p.t-label.sd-dr-cap');
  const thumbs = h('div.sd-thumbs', { role: 'tablist' });
  const show = (i) => {
    big.src = shots[i].src; cap.textContent = shots[i].cap; delete cap.dataset.ex;
    if (shots[i].ex) markEx(cap, shots[i].name);
    thumbs.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-selected', j === i ? 'true' : 'false'));
  };
  if (shots.length > 1) shots.forEach((s, i) => thumbs.append(h('button.sd-thumb', { type: 'button', role: 'tab', 'aria-label': `${i + 1}`, onclick: () => show(i) }, h('img', { src: s.thumb, alt: '', loading: 'lazy' }))));
  const go = canOpen() ? h('a.t-btn.t-btn--2.sd-dr-go', { href: openHref(), text: who ? '이 지역에서 열기' : '로그인' }) : null;
  drawer({ title: b.name, body: h('div.sd-dr', {}, big, cap, shots.length > 1 ? thumbs : null, go), slot: 'right', width: 520 });
  show(0);
}

/* ── 관련 카드(K7) — 실결과 비주얼이 있는 카드 먼저 · 같은 범위 · 상태 순 ── */
function related(rows, id) {
  const vis = D.vis;
  const visOf = (r) => { const hv = vis.hero[r.card.id] || {}; return hv.img || (hv.set && vis.sets[hv.set]) ? 1 : 0; };
  const stOf = (r) => stateFor(r.card.id, r.deploy, who ? r.state : guestState(r.card));
  const rank = (r) => ({ ga: 0, pilot: 1, none: 2 }[stOf(r)]);
  const pick = rows.filter((r) => r.card.id !== id)
    .sort((a, b) => (visOf(b) - visOf(a)) || ((b.card.scope === D.card.scope) - (a.card.scope === D.card.scope)) || rank(a) - rank(b))
    .slice(0, 3);
  const grid = h('div.sd-grid');
  serviceGrid(grid, pick, {
    map: (r) => {
      const hv = vis.hero[r.card.id] || {};
      const set = hv.set && vis.sets[hv.set] ? hv.set : null;
      const crop = hv.img ? (/^\/|^https?:/.test(hv.img) ? hv.img : vis.own + hv.img) : set ? cropUrl(vis, set, vis.sets[set].frames[0]) : null;
      /* 크롭이 이 사용자에게 보이는 그 카드 배포본의 지역 밖 = 크롭 지역 이름 + 예시(숫자 없음) */
      if (crop && set && dropSet(set, r.deploys || [])) return { crop: null, card: { ...r.card, crop_url: null }, href: `?card=${encodeURIComponent(r.card.id)}`, where: r.deploy ? where(r.deploy) : '', deploy: r.deploy || null, state: r.state };
      if (crop && exOf(set, r.deploys || [])) return { crop, href: `?card=${encodeURIComponent(r.card.id)}`, where: regionOfSet(vis, set).name, deploy: null, state: r.state };
      return {
        crop, href: `?card=${encodeURIComponent(r.card.id)}`,
        where: r.deploy ? where(r.deploy) : '',
        state: stOf(r), ...(who ? {} : { deploy: null }),
      };
    },
  });
  /* 예시 표기 · 결과 숫자 호버를 이 화면과 같은 말로 */
  pick.forEach((r, i) => {
    const el = grid.children[i]; if (!el) return;
    const hv = vis.hero[r.card.id] || {}; const set = hv.set && vis.sets[hv.set] ? hv.set : null;
    const lab = el.querySelector('.k-svc-meta .t-label');
    if (lab && set && exOf(set, r.deploys || []) && !dropSet(set, r.deploys || [])) markEx(lab, regionOfSet(vis, set).name);
    /* 카드 숫자 = 메인 · 영업 카드와 같은 값(요약의 AI 탐지 · 그 카드 대표 항목) · 요약에 값이 없으면 숫자 없이 */
    const n = el.querySelector('.k-svc-n');
    if (n) { const env = SUM && !(set && exOf(set, r.deploys || [])) ? scaleOf((r.deploy && itemOfDeploy(r.deploy)) || itemFor(SUM, r.card.id)) : null; n.innerHTML = env ? numHtml(env) : ''; n.hidden = !env; }
  });
  grid.querySelectorAll('.k-svc').forEach((c) => c.classList.add('t-enter'));
  return h('section.sd-rel', {}, h('p.t-label.sd-sec-l', { text: '관련 서비스' }), grid);
}

/* ── 마감 ─────────────────────────────────────────── */
function closing() {
  const box = h('section.sd-end.t-card.t-enter');
  if (!who) {
    box.append(h('p.t-label', { text: D.card.name }), h('a.t-btn.sd-cta', { href: openHref(), text: '로그인' }));
    return box;
  }
  /* 이 지역(기관 = 자기 관할)에 이 카드 배포본이 없다 → K9 한 줄 · 행동 0 */
  if (!own.length) {
    box.classList.add('is-none');
    const e = h('div.sd-none'); box.append(e);
    empty(e, { kind: 'first', title: '이 지역에는 아직 없습니다', compact: true });
    return box;
  }
  const cta = h('a.t-btn.sd-cta', { href: openHref(), text: '이 지역에서 열기' });
  const rowsT = own.map((d) => ({
    _d: d, id: d.id,
    region: [where(d), own.filter((x) => x.region_profile === d.region_profile).length > 1 && d.year ? String(d.year) : ''].filter(Boolean).join(' · '),
    stage: t(`card.state.${rowState(d)}`),
    lv: LV[rowState(d)],
    asof: needOf(d)?.as_of ? df(needOf(d).as_of) : d.scale?.as_of ? df(d.scale.as_of) : '—',   // 숫자가 있으면 그 숫자의 기준일
    n: needOf(d),
  }));
  const hasN = rowsT.some((r) => r.n);
  const tb = h('div.sd-table');
  const markSel = () => { const v = tb._vis || []; tb.querySelectorAll('tbody tr, .sd-row').forEach((tr, i) => tr.setAttribute('aria-selected', v[i]?._d === cur ? 'true' : 'false')); };
  const pickRow = (r) => {
    cur = r._d; cta.href = openHref(); markSel();
    const u = new URL(location.href);
    if (cur?.region_profile) u.searchParams.set('region', cur.region_profile);
    u.searchParams.set('deploy', cur.id);
    history.replaceState(null, '', u);
  };
  /* ≤ 640 = 행 카드(1줄 지역 · 상태 칩 / 2줄 기준일 · 결과 숫자 우측) · 넓으면 표(K12) */
  const mq = matchMedia('(max-width: 640px)');
  const draw = () => {
    tb.innerHTML = ''; tb.className = 'sd-table';
    if (mq.matches) {
      const vis = rowsT.slice(0, 6);
      tb.append(h('ul.sd-rows', {}, ...vis.map((r) => h('li', {}, h('button.sd-row', { type: 'button', onclick: () => pickRow(r) },
        h('span.sd-row__a', {}, h('b', { text: r.region }), h('span.t-chip', { dataset: r.lv ? { lv: r.lv } : {}, text: r.stage })),
        h('span.sd-row__b', {}, h('span', { text: r.asof === '—' ? '기준일 —' : t('card.asof', { date: r.asof }) }), r.n ? h('span.sd-row__n', { html: needHtml(r.n) }) : null))))));
      tb._vis = vis;
    } else {
      table(tb, {
        cols: [
          { key: 'region', label: '지역' },
          { key: 'stage', label: '상태' },
          { key: 'asof', label: '기준일' },
          ...(hasN ? [{ key: 'n', label: NEED_L, num: true, fmt: (v) => (v ? numHtml(v) : '—') }] : []),
        ],
        rows: rowsT, limit: 6, onRow: pickRow,
      });
    }
    markSel();
  };
  tb.addEventListener('click', () => requestAnimationFrame(markSel));
  mq.addEventListener('change', draw);
  draw();
  box.append(h('p.t-label', { text: '서비스 지역' }), tb, h('div.sd-end__go', {}, cta));
  return box;
}

/* ── 출처 띠 ─────────────────────────────────────── */
function sources() {
  const L = [['LX', '한국국토정보공사'], ['V-World', '공간정보 오픈플랫폼'], ['NGII', '국토지리정보원'], ['AI Hub', '토지피복 학습데이터']];
  return h('section.sd-src', {}, h('p.t-label', { text: '데이터 출처' }), h('ul', {}, ...L.map(([b, s]) => h('li', {}, h('b', { text: b }), h('span', { text: s })))));
}

function notFound() {
  const box = h('section.sd-404');
  S.main.append(box);
  empty(box, { kind: '404' });
  document.body.dataset.state = 'ready';
}
