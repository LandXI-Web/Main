/* 메인 장면 시안(설계 13차 · 사용자 확인 전) — v3 메인의 장면을 복사해 한 장면씩 고정해 보인다.
   ?v=a  둘째 ⓐ 차례로: 실태조사가 몇 초씩 바뀌고 지도 모양도 그 일에 맞게 + 숫자 + 실제 결과 장면(작게)
   ?v=b  둘째 ⓑ 겹쳐서: 한 지도에 여러 실태조사 층 · 목록에서 고르면 그 층이 진해진다
   ?v=c2 셋째: 고정밀 영상 · AI 분석 · 행정 정보 융합으로 바로 판단(문구 1·2·3 · 원칙 135: 현장 확인 개념 없음)
   ?v=c3 넷째: XI ChatGEO 에게 말로 묻기 → 지도 → 읍면동 통계 → 보고서 초안(문구 1·2·3) · 비닐하우스는 동 면만(점 없음)
   숫자는 서버 요약(/summary) · 공개 통계(/public/stats)에서만. 비닐하우스 1,674동은 결과 파일(results/namwon-greenhouse-2025) — 요약에 아직 없음.
   움직임 줄이기 설정이면 자동 넘김 · 타자 · 카메라 이동 없이 결과 상태만. v3 코드 수정 0. */
import { createStage, bignum, bars } from '../../../v3/kit/index.js';
import { RM, h, esc } from '../../../v3/kit/util.js';
import * as D from '../../../v3/main/data.js';
import { loadSummary, itemFor, metric } from '../../../v3/service-detail/summary.js';

const $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const V = ['a', 'b', 'c2', 'c3'].includes(Q.get('v')) ? Q.get('v') : 'a';
// 문구 기본값 — 둘째 장면은 2(10-09 사용자 "문구는 2번으로") · 셋째 · 넷째는 1
const W = ['1', '2', '3'].includes(Q.get('w')) ? +Q.get('w') : (['a', 'b'].includes(V) ? 2 : 1);
const KOREA = [124.6, 33.1, 130.95, 38.62];
const NARROW = () => matchMedia('(max-width: 640px)').matches;
const DATA = new URL('./data/', import.meta.url).href;
const geo = (f) => fetch(DATA + f).then((r) => r.json());
const nf = (n) => new Intl.NumberFormat('ko-KR').format(n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 문구 후보(README 표와 같음) ───────────────────────── */
const COPY = {
  ch1: {
    1: ['어떤 실태조사든', '전국 같은 기준으로'],
    2: ['전국 어디서나', '여러 실태조사를 한 번에'],
    3: ['하천 · 농지 · 바다 · 국토 변화', '전국을 같은 눈으로'],
  },
  // 10-09 둘째 답 "고정밀 영상 + AI 분석 + 행정 정보 융합 → 행정 혁신 · 업무 부담 줄임" — 결이 다른 셋
  // 원칙 135(10-09): '현장 확인' 개념은 쓰지 않는다 — AI 분석 결과(동 · 필지 · 면적)와 행정 정보 융합이 주인공
  ch2: {
    1: { h: ['고정밀 영상을 AI가 읽고', '행정 정보와 맞춰 바로 판단'], p: 'AI가 찾은 건물과 면적을 지적 · 대장 정보와 겹쳐 필지마다 결론이 나옵니다. 실태조사가 빨라지고 담당자 부담이 줄어듭니다.', steps: ['AI 영상 분석', '행정 정보와 맞추기', '바로 판단'], chip: '대장과 다름', foot: ['대장은 논, AI 분석은 건물', 'AI 가 찾은 건물 면적을 대장과 맞춰 농지로 쓰이지 않는 필지로 판단'] },
    2: { h: ['영상 · AI · 행정 정보를', '하나로 합친 실태조사'], p: '고정밀 항공영상을 AI가 분석하고 지적 · 대장 정보와 겹쳐, 필지마다 실태를 그 자리에서 확인합니다.', steps: ['AI 영상 분석', '지적 · 대장과 겹치기', '실태 확인'], chip: '대장과 다름', foot: ['대장은 논, AI 분석은 건물', 'AI 가 본 건물과 대장을 겹쳐 농지 아님으로 확인'] },
    3: { h: ['AI가 먼저 분석하고', '담당자는 결정만'], p: '고정밀 영상에서 AI가 찾은 결과를 행정 정보와 맞춰 주니, 담당자는 필지마다 결정만 하면 됩니다.', steps: ['AI가 영상 분석', '행정 정보와 맞춤', '담당자 결정'], chip: '대장과 다름', foot: ['대장은 논, AI 분석은 건물', 'AI 분석과 대장을 맞춰 농지 아님으로 결정'] },
  },
  ch3: {
    1: { h: ['XI ChatGEO 에게 물으면', '지도 · 통계 · 보고서까지'], p: '"남원시 비닐하우스 보여 줘"처럼 평소 말로 물으면 AI 결과를 지도에 그리고, 읍면동 통계와 보고서 초안까지 이어서 만듭니다.' },
    2: { h: ['묻기만 하면', '지도가 답합니다'], p: '공간을 아는 AI, XI ChatGEO. 결과를 지도에 그리고 읍면동별로 세고 보고서 초안까지 씁니다.' },
    3: { h: ['공간을 아는 AI,', 'XI ChatGEO'], p: '말 한마디로 AI 분석 결과를 지도에 불러오고, 통계와 보고서 초안을 바로 받습니다.' },
  },
};
const STEPS3 = ['지도에 그리기', '읍면동 통계', '보고서 초안'];

/* ── 둘째 장면 실태조사 4(숫자는 서버 요약 · 공개 통계에서) ── */
const SURV = [
  { id: 'river', name: '하천구역 안 건물 점유', region: '전국', where: '남원시', sgg: null, label: '하천구역 안 건물 점유 · 전국', p: (d) => `하천구역 안 건물 점유를 전국 ${d?.n_sgg?.value ?? 252}개 시군구에서 같은 기준으로 찾았습니다.`, files: { zone: 'river-zone.geojson', ai: 'river-buildings.geojson' }, cap: '전북 남원시 · 하천구역(흰 선)과 그 안 건물(청록)' },
  { id: 'farm', card: 'card-farm', name: '농지 이용', region: '남원시', sgg: '52190', label: '경작 · 비경작 판정 필지 · 남원시', p: () => '드론 영상에서 농지 이용 실태를 필지마다 경작 · 비경작으로 판정합니다.', files: { ai: 'farm.geojson' }, split: 'cls', cap: '전북 남원시 · 경작(청록) · 비경작(흰 선) 필지' },
  { id: 'marine', card: 'card-marine', name: '해양쓰레기', region: '여수시', sgg: '46130', label: '해양쓰레기 탐지 · 여수시', p: () => '해안선 항공 · 드론 영상에서 쓰레기 더미를 세어 수거 우선순위를 정합니다.', files: { ai: 'marine.geojson' }, cap: '전남 여수시 · 드론 영상 탐지(점)' },
  { id: 'change', card: 'card-change', name: '국토 변화', region: '남원시', sgg: '52190', label: '국토 변화 탐지 · 남원시', p: () => '같은 지역 두 시점 영상을 비교해 신축 · 소실 · 식생 변화를 찾습니다.', files: { ai: 'change.geojson' }, cap: '전북 남원시 · 두 시점 변화(청록)' },
];

const S = { st: null, in: null, cache: {}, timer: 0, auto: !RM(), labels: [] };
const bd = $('#bd'), win = $('#win'), onwin = $('#onwin');

/* ── 공통 ──────────────────────────────────────────── */
function pick() {
  document.querySelectorAll('.p-pick a[data-v]').forEach((a) => { a.classList.toggle('is-on', a.dataset.v === V); a.href = `?v=${a.dataset.v}&w=${W}`; });
  document.querySelectorAll('.p-pick a[data-w]').forEach((a) => { a.classList.toggle('is-on', +a.dataset.w === W); a.href = `?v=${V}&w=${a.dataset.w}`; });
}
function show(id) { for (const s of ['ch1', 'ch2', 'ch3']) { const el = $('#' + s); el.removeAttribute('hidden'); el.style.display = s === id ? '' : 'none'; } }
async function stage(el, bounds = KOREA) {
  await new Promise((r) => (window.maplibregl ? r() : addEventListener('load', r, { once: true })));
  const st = createStage(el, { interactive: false, scale: false, bounds });
  await st.ready;
  st.map.on('error', () => {});
  return st;
}
const padCard = () => (NARROW() ? { top: Math.round(innerHeight * 0.42), left: 24, right: 24, bottom: 190 } : { top: 72, left: 440 + 48 + 72, right: 72, bottom: 72 });
const setOp = (m, id, prop, v) => { if (m.getLayer(id)) m.setPaintProperty(id, prop, v); };
const bboxOf = (fc) => { let a = [180, 90, -180, -90]; const w = (c) => { if (typeof c[0] === 'number') a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; else c.forEach(w); }; for (const f of fc.features) w(f.geometry.coordinates); return a; };
const SRC = { ai: 'AI 분석 결과', summary: '서버 요약' };

/* ══ 둘째 장면 ⓐ · ⓑ ═══════════════════════════════════ */
async function ch1() {
  show('ch1');
  win.dataset.shape = 'full';
  $('#ch1').dataset.v = V;
  $('#ch1-h').innerHTML = COPY.ch1[W].map((s) => `<span>${esc(s)}</span>`).join('');
  const [stats, sum, regions, meta] = await Promise.all([D.riverStats().catch(() => null), loadSummary().catch(() => null), geo('regions.geojson'), geo('meta.json')]);
  S.meta = meta; S.stats = stats;
  // 숫자 봉투(없으면 null — 지어내지 않음)
  for (const s of SURV) s.env = s.id === 'river' ? (stats?.total || null) : (sum ? metric(itemFor(sum, s.card), 'detected') : null);
  // 목록
  const list = $('#ch1-list');
  list.innerHTML = SURV.map((s) => `<li data-id="${s.id}"><b>${esc(s.name)}</b><small>${esc(s.region)}</small><span>${s.env ? nf(s.env.value) + ' ' + esc(s.env.unit === 'count' ? '건' : s.env.unit) : ''}</span><i></i></li>`).join('');
  list.addEventListener('click', (e) => { const li = e.target.closest('li'); if (!li) return; S.auto = false; clearTimeout(S.timer); select(li.dataset.id); });
  if (V === 'a') S.bn = bignum($('#ch1-big'), null, { label: SURV[0].label }); else $('#ch1-big').remove();
  // 지도
  S.st = await stage($('#stage'));
  const m = S.st.map;
  if (stats) { await S.st.geo('river', stats.geojson, 'ai'); setOp(m, 'k-river-h', 'line-opacity', 0); setOp(m, 'k-river-l', 'line-width', 0.6); }
  await S.st.geo('reg', regions, 'ai');
  setOp(m, 'k-reg-l', 'line-color', '#FFFFFF'); setOp(m, 'k-reg-l', 'line-width', 1.6); setOp(m, 'k-reg-h', 'line-opacity', 0);
  m.fitBounds(KOREA, { padding: padCard(), duration: 0 });
  addEventListener('resize', () => m.fitBounds(KOREA, { padding: padCard(), duration: 0 }));
  // 실제 결과 장면(작게)
  const inset = $('#inset'); inset.hidden = false; inset.dataset.fade = RM() ? '0' : '1';
  S.in = await stage($('#inset-map'));
  if (V === 'b') labelsB(regions);
  select('river');
}
function riverExpr(stats, k = 1) {
  const [b0, b1, b2, b3] = (stats?.breaks || [752, 1219, 2297, 4116]).map((b) => (typeof b === 'object' ? b.value : b));
  return ['*', k, ['interpolate', ['linear'], ['coalesce', ['get', 'value'], 0], 0, 0.04, b0, 0.14, b1, 0.26, b2, 0.42, b3, 0.62, b3 * 3.5, 0.86]];
}
async function select(id) {
  const s = SURV.find((x) => x.id === id); if (!s) return;
  S.cur = id;
  document.querySelectorAll('#ch1-list li').forEach((li) => li.classList.toggle('is-on', li.dataset.id === id));
  $('#ch1-p').textContent = s.p(S.stats);
  $('#ch1-cap').textContent = s.id === 'river' && S.stats?.top ? `가장 많은 곳 · ${S.stats.top.sido} ${S.stats.top.name}` : `${s.region} · 실제 결과 장면`;
  if (V === 'a') S.bn = bignum($('#ch1-big'), s.env, { label: s.label });
  const m = S.st.map, stats = S.stats;
  if (V === 'a') {
    // ⓐ 지도 모양이 그 일에 맞게: 전국 시군구 색칠(하천) ↔ 그 일을 한 지역만(농지 · 바다 · 변화)
    setOp(m, 'k-river-f', 'fill-opacity', id === 'river' ? riverExpr(stats) : 0);
    setOp(m, 'k-river-l', 'line-opacity', id === 'river' ? 0.3 : 0);
    const f = s.sgg ? ['==', ['get', 'sgg_cd'], s.sgg] : ['==', ['get', 'sgg_cd'], '-'];
    for (const l of ['k-reg-f', 'k-reg-l']) if (m.getLayer(l)) m.setFilter(l, f);
    setOp(m, 'k-reg-f', 'fill-opacity', 0.45); setOp(m, 'k-reg-l', 'line-opacity', 1);
  } else {
    // ⓑ 모두 겹쳐 두고 고른 층만 진하게
    setOp(m, 'k-river-f', 'fill-opacity', riverExpr(stats, id === 'river' ? 1 : 0.35));
    setOp(m, 'k-river-l', 'line-opacity', id === 'river' ? 0.3 : 0.12);
    setOp(m, 'k-reg-f', 'fill-opacity', ['case', ['==', ['get', 'sgg_cd'], s.sgg || '-'], 0.55, 0.18]);
    setOp(m, 'k-reg-l', 'line-width', ['case', ['==', ['get', 'sgg_cd'], s.sgg || '-'], 2.4, 1.2]);
    for (const l of S.labels) l.el.classList.toggle('is-dim', !(l.ids.includes(id)));
  }
  await scene(s);
  if (V === 'a' && S.auto) { clearTimeout(S.timer); S.timer = setTimeout(() => select(SURV[(SURV.indexOf(s) + 1) % SURV.length].id), 5500); }
}
/* 실제 결과 장면 — 결과 파일에서 창 하나 분량만 잘라 둔 도형(data/) */
async function scene(s) {
  const st = S.in, m = st.map, meta = S.meta[s.id];
  $('#inset-cap').innerHTML = `<b>${esc(s.where || s.region)}</b>${esc(s.cap.split(' · ').slice(1).join(' · '))}<small>실제 결과</small>`;
  const files = s.files; const fc = {};
  for (const k in files) fc[k] = S.cache[files[k]] ||= await geo(files[k]);
  if (S.cur !== s.id) return;
  $('#inset-map').style.opacity = RM() ? '' : '0';
  await st.geo('zone', fc.zone || null, 'focus');
  if (s.split) {
    await st.geo('ai', { type: 'FeatureCollection', features: fc.ai.features.filter((f) => f.properties.cls === '경작지') }, 'ai');
    await st.geo('ai2', { type: 'FeatureCollection', features: fc.ai.features.filter((f) => f.properties.cls !== '경작지') }, 'focus');
  } else { await st.geo('ai', fc.ai, 'ai'); await st.geo('ai2', null, 'focus'); }
  setOp(m, 'k-zone-f', 'fill-opacity', 0.1); setOp(m, 'k-zone-l', 'line-width', 2);
  setOp(m, 'k-ai2-l', 'line-width', 1.2); setOp(m, 'k-ai-f', 'fill-opacity', 0.42);
  setOp(m, 'k-ai-p', 'circle-radius', 3.5);
  m.fitBounds(meta.bbox, { padding: 6, duration: 0 });
  await wait(RM() ? 0 : 120);
  $('#inset-map').style.opacity = '';
}
/* ⓑ 지역 라벨(DOM · 지도 좌표를 따라) */
function labelsB(regions) {
  const host = $('#labels'); host.innerHTML = '';
  S.labels = regions.features.map((f) => {
    const b = bboxOf({ features: [f] }), at = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const ids = SURV.filter((s) => s.sgg === f.properties.sgg_cd).map((s) => s.id);
    const el = h('div.m-lbl', {}, h('i.m-dot', { dataset: { st: 'ga' } }), h('span', { text: `${f.properties.name} · ${SURV.filter((s) => ids.includes(s.id)).map((s) => s.name).join(' · ')}` }));
    host.append(el); return { el, at, ids };
  });
  const place = () => { for (const l of S.labels) { const p = S.st.map.project(l.at); l.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-7px, -50%)`; } };
  S.st.map.on('render', place); place();
}

/* ══ 셋째 장면 — AI 분석 + 행정 정보 융합으로 바로 판단 ═════════════ */
async function ch2() {
  show('ch2');
  win.dataset.shape = 'right';
  const c = COPY.ch2[W];
  $('#ch2-h').innerHTML = c.h.map((s) => `<span>${esc(s)}</span>`).join('');
  $('#ch2-p').textContent = c.p;
  $('#ch2-items').innerHTML = c.steps.map((s, i) => `<li data-i="${i}">${esc(s)}</li>`).join('');
  const p = await D.sampleParcel();
  onwin.innerHTML = `<div class="t-card m-pc" data-step="0">
    <div class="m-pc-top"><span class="t-label">${esc(p.place)} · 예시</span><span class="t-chip" data-lv="warn">${esc(c.chip)}</span></div>
    <div class="m-pc-cols">
      <div class="m-pc-col"><span class="t-label">대장</span><b class="t-h4">${esc(p.ledger.jimok)}</b><span class="num">${nf(p.ledger.area.value)} ㎡</span><span class="t-label">${esc(p.ledger.yongdo || '')}</span></div>
      <div class="m-pc-col is-ai"><span class="t-label">AI 분석</span><b class="t-h4">${esc(p.ai.cls)}</b><span class="num">${nf(p.ai.area.value)} ㎡</span><span class="t-label">${p.ai.year}년 항공영상</span></div>
    </div>
    <div class="m-pc-foot"><span class="m-ok" aria-hidden="true">✓</span><span class="t-label">${esc(c.foot[0])}<small>${esc(c.foot[1])}</small></span></div>
  </div>`;
  const pc = onwin.querySelector('.m-pc');
  const step = (i) => { pc.dataset.step = String(i); pc.querySelector('.m-pc-foot').classList.toggle('is-on', i === 2); document.querySelectorAll('#ch2-items li').forEach((li) => li.classList.toggle('is-on', +li.dataset.i === i)); layers(i); };
  $('#ch2-items').addEventListener('click', (e) => { const li = e.target.closest('li'); if (!li) return; S.auto = false; clearTimeout(S.timer); step(+li.dataset.i); });
  S.st = await stage($('#stage'));
  const st = S.st, m = st.map, fc = p.ai_fc;
  await st.geo('ainear', { type: 'FeatureCollection', features: fc.features.filter((f) => !f.properties.in) }, 'ai');
  await st.geo('aiin', { type: 'FeatureCollection', features: fc.features.filter((f) => f.properties.in) }, 'ai');
  await st.geo('parcel', p.parcel, 'focus');
  setOp(m, 'k-parcel-l', 'line-width', 2.4); setOp(m, 'k-aiin-f', 'fill-opacity', 0.38);
  const b = p.bbox, k = 0.9, bb = [b[0] - (b[2] - b[0]) * k, b[1] - (b[3] - b[1]) * k, b[2] + (b[2] - b[0]) * k, b[3] + (b[3] - b[1]) * k];
  const fit = () => { m.fitBounds(bb, { padding: NARROW() ? { top: 24, left: 24, right: 24, bottom: 200 } : { top: 60, left: 60, right: 60, bottom: 230 }, maxZoom: 19, duration: 0 }); m.jumpTo({ pitch: 38, bearing: 14 }); };
  fit(); addEventListener('resize', fit);
  function layers(i) {
    // 0 AI가 본 것(청록만) → 1 대장과 견주기(필지 선) → 2 판단(안 · 밖 구분)
    setOp(m, 'k-parcel-l', 'line-opacity', i >= 1 ? 0.95 : 0); setOp(m, 'k-parcel-f', 'fill-opacity', i >= 1 ? 0.08 : 0);
    setOp(m, 'k-aiin-f', 'fill-opacity', 0.4); setOp(m, 'k-aiin-l', 'line-opacity', 1); setOp(m, 'k-aiin-h', 'line-opacity', 0.3);
    setOp(m, 'k-ainear-f', 'fill-opacity', i >= 1 ? 0.1 : 0.4); setOp(m, 'k-ainear-l', 'line-opacity', i >= 1 ? 0.35 : 1); setOp(m, 'k-ainear-h', 'line-opacity', 0);
  }
  if (RM()) { step(2); return; }
  step(0);
  const go = (i) => { if (!S.auto) return; step(i); if (i < 2) S.timer = setTimeout(() => go(i + 1), 2400); };
  S.timer = setTimeout(() => go(1), 2400);
}

/* 동이 가장 모인 곳 — 각 동의 가운데점 중 반경 약 500 m 안 이웃이 가장 많은 점을 중심으로 약 1.2 × 0.8 km 창 */
function denseWin(fc) {
  const cs = fc.features.map((f) => { const b = bboxOf({ features: [f] }); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; });
  if (!cs.length) return null;
  let best = cs[0], bn = -1;
  for (const c of cs) { const n = cs.reduce((k, d) => k + (Math.hypot((d[0] - c[0]) * 0.9, d[1] - c[1]) < 0.0045 ? 1 : 0), 0); if (n > bn) { bn = n; best = c; } }
  return [best[0] - 0.0075, best[1] - 0.0032, best[0] + 0.0075, best[1] + 0.0058];
}

/* ══ 넷째 장면 — XI ChatGEO 에게 말로 ═════════════════════ */
async function ch3() {
  show('ch3');
  win.dataset.shape = 'right';
  bd.classList.add('is-inv');
  const c = COPY.ch3[W];
  $('#ch3-h').innerHTML = c.h.map((s) => `<span>${esc(s)}</span>`).join('');
  $('#ch3-p').textContent = c.p;
  $('#ch3-steps').innerHTML = STEPS3.map((s, i) => `<li data-i="${i}">${esc(s)}</li>`).join('');
  onwin.innerHTML = `<div class="m-ask"><div class="k-ck" role="img" aria-label="XI ChatGEO 질문 카드">
    <div class="k-ck-f"><span class="k-ck-ico" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 2.5l1.8 4.7 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.7L3.5 9l4.7-1.8z"/></svg></span><span class="k-ck-t" data-ph="이 지역에 대해 물어보기"></span><kbd class="k-ck-k">Ctrl K</kbd></div>
    <div class="p-chat" id="chat"></div>
  </div></div>`;
  // 10-09 사용자 "동그라미가 혼란" → 점 층 없음 · 비닐하우스는 동 면(원판 모델 결과)만
  const [emd, stat] = await Promise.all([fetch('../../../assets/data/geo/namwon-emd.geojson').then((r) => r.json()), geo('greenhouse-emd.json')]);
  const by = Object.fromEntries(stat.rows.map((r) => [r.emd, r.n]));
  for (const f of emd.features) f.properties.v = by[f.properties.nm] || 0;
  S.st = await stage($('#stage'));
  const st = S.st, m = st.map;
  await st.geo('emd', emd, 'ai'); setOp(m, 'k-emd-h', 'line-opacity', 0); setOp(m, 'k-emd-l', 'line-color', '#FFFFFF'); setOp(m, 'k-emd-l', 'line-width', 0.8); setOp(m, 'k-emd-f', 'fill-opacity', 0);
  await st.geo('ghp', null, 'ai');
  // 면만 잘 보이게 — 청록 면을 진하게, 흰 테두리로 영상과 대비(점 없음)
  const ghLook = () => { setOp(m, 'k-ghp-f', 'fill-opacity', 0.6); setOp(m, 'k-ghp-l', 'line-color', '#FFFFFF'); setOp(m, 'k-ghp-l', 'line-width', ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 1.2]); setOp(m, 'k-ghp-l', 'line-opacity', 0.9); setOp(m, 'k-ghp-h', 'line-opacity', 0); };
  const eb = bboxOf(emd);
  const padR = () => (NARROW() ? { top: 150, left: 16, right: 16, bottom: 16 } : { top: 60, left: 500, right: 48, bottom: 40 });
  const home = (ms) => (RM() || !ms ? m.fitBounds(eb, { padding: padR(), duration: 0 }) : m.fitBounds(eb, { padding: padR(), duration: ms }));
  home(0); addEventListener('resize', () => home(0));
  const chat = $('#chat'), tline = onwin.querySelector('.k-ck-t');
  const typed = async (q) => { if (RM()) { tline.textContent = q; return; } tline.innerHTML = '<i class="m-caret"></i>'; for (let i = 1; i <= q.length; i++) { tline.innerHTML = esc(q.slice(0, i)) + '<i class="m-caret"></i>'; await wait(38); } };
  const block = (q, a) => { const el = h('div.p-a'); const qq = h('p.p-q', {}, '물음', h('b', { text: q })); chat.append(qq, el); el.append(...a); chat.scrollTop = chat.scrollHeight; return el; };
  const plan = async (items) => { const ol = h('ol.k-ck-plan', {}, ...items.map((t) => h('li', { text: t }))); if (!RM()) for (const li of ol.children) { await wait(420); li.classList.add('is-done'); } else for (const li of ol.children) li.classList.add('is-done'); return ol; };
  const mark = (i) => document.querySelectorAll('#ch3-steps li').forEach((li) => li.classList.toggle('is-on', +li.dataset.i === i));
  const ghWin = S.meta?.greenhouse?.bbox;
  // ① 지도에 그리기
  async function s1() {
    mark(0); chat.innerHTML = ''; tline.textContent = '';
    setOp(m, 'k-emd-f', 'fill-opacity', 0); await st.geo('ghp', null, 'ai');
    await typed('남원시 비닐하우스 보여 줘');
    const el = block('남원시 비닐하우스 보여 줘', []);
    const ol = h('ol.k-ck-plan'); el.append(ol);
    for (const t of ['비닐하우스 결과 찾기', '남원시 범위로 자르기', '지도에 그리기']) { const li = h('li', { text: t }); ol.append(li); if (!RM()) await wait(380); li.classList.add('is-done'); }
    el.append(h('div.k-ck-a', {}, h('span.t-label', { text: '남원시 · 비닐하우스' }), h('b.num', { text: nf(stat.total) }), h('small', { text: `동 · 단동 ${nf(stat.single)} · 다동 ${nf(stat.multi)}` })));
    el.append(h('p.p-q', { text: `${stat.as_of}년 항공영상 AI 분석 결과 · 읍면동 ${stat.rows.length}곳` }));
    chat.scrollTop = chat.scrollHeight;
    // 실제 장면으로 — 가장 많은 금지면 창(면 도형)
    const meta = S.meta || (S.meta = await geo('meta.json'));
    const poly = S.cache.gh ||= await geo('greenhouse.geojson');
    await st.geo('ghp', poly, 'ai'); ghLook();
    // 비닐하우스 면이 면으로 보이는 크기로 — 창 안에서 동이 가장 모인 곳(약 1.2 km)으로 들어간다(점 없이 면만)
    const to = denseWin(poly) || meta.greenhouse.bbox;
    if (!RM()) { await wait(600); m.fitBounds(to, { padding: padR(), duration: 2200 }); } else m.fitBounds(to, { padding: padR(), duration: 0 });
  }
  // ② 읍면동 통계
  async function s2() {
    mark(1);
    home(RM() ? 0 : 1600);
    await typed('읍면동별로 통계 내 줘');
    const el = block('읍면동별로 통계 내 줘', []);
    const ol = h('ol.k-ck-plan'); el.append(ol);
    for (const t of ['읍면동 경계와 겹치기', '읍면동마다 세기']) { const li = h('li', { text: t }); ol.append(li); if (!RM()) await wait(380); li.classList.add('is-done'); }
    const max = stat.rows[0].n;
    setOp(m, 'k-emd-f', 'fill-opacity', ['interpolate', ['linear'], ['get', 'v'], 0, 0.04, max * 0.15, 0.3, max, 0.72]);
    const bx = h('div'); el.append(bx);
    bars(bx, { items: stat.rows.slice(0, 6).map((r) => ({ label: r.emd, value: r.n })), unit: '동', ai: true });
    el.append(h('p.p-q', { text: `위 6곳 · 나머지 ${stat.rows.length - 6}곳은 표로 · 합계 ${nf(stat.total)}동` }));
    chat.scrollTop = chat.scrollHeight;
  }
  // ③ 보고서 초안
  async function s3() {
    mark(2);
    await typed('보고서 초안 만들어 줘');
    const el = block('보고서 초안 만들어 줘', []);
    el.append(h('div.p-file', {}, h('div', {}, h('b', { text: '비닐하우스 현황(남원시) — 보고서 초안' }), h('br'), h('span', { text: `읍면동 ${stat.rows.length}곳 표 1 · 지도 1 · 합계 ${nf(stat.total)}동` })), h('span.p-ex', { text: '예시' })));
    el.append(h('p.p-q', { text: '보고서 초안은 로그인 뒤 XI ChatGEO 에서 실제 파일로 받습니다(시안에서는 모양만).' }));
    chat.scrollTop = chat.scrollHeight;
  }
  const seq = [s1, s2, s3];
  $('#ch3-steps').addEventListener('click', async (e) => { const li = e.target.closest('li'); if (!li) return; S.auto = false; clearTimeout(S.timer); S.run = (S.run || 0) + 1; const my = S.run; chat.innerHTML = ''; for (let i = 0; i <= +li.dataset.i; i++) { if (my !== S.run) return; await seq[i](); } });
  S.meta = await geo('meta.json');
  if (RM()) { await s1(); await s2(); await s3(); return; }
  S.run = 1;
  await s1(); if (!S.auto) return; await wait(3200); if (!S.auto) return;
  await s2(); if (!S.auto) return; await wait(3600); if (!S.auto) return;
  await s3();
}

pick();
({ a: ch1, b: ch1, c2: ch2, c3: ch3 })[V]();
