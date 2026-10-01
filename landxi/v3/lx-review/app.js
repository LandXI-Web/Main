/* lx-review app.js — ④ 검수: 의심 큐 · 표본 20 판정 · 정밀도 보드 · '검수 전' 떼기 · 임계 결재 요청.
   명세 LANDXI-FINAL-SPEC §2.6 · 부품 K1 K2 K3 K5 K6(HUD 124) K12 K14 · 지역 = URL ?region= 또는 첫 순위 의심이 있는 지역(하드코딩 0). */
import * as K from '../kit/index.js';
import { nf } from '../kit/i18n.js';
import { h, esc, isDev, session, bboxOf } from '../kit/util.js';
import { sourceSpec } from '../../xi/engine/sources.js';
import { summary, total, labelOf, pick } from '../lx-console/summary.js';
import { projectRail, attachProject, projectRules } from '../lx-project/context.js';   // 프로젝트 맥락(?project= · 구현 2차 T1)
import { staffMenu } from '../kit/lx-menu.js';
import { D, SAMPLE, CLS, probeS2, loadRules, loadQueue, parcel, aiLayersAt, loadFeedback, loadRuleStats, verdictMap, ruleStat, judge, unTag, suggest, requestThreshold, drawSample, forgetSample, regionFor, bboxOfPoints, inRegion } from './data.js';

const Q = new URLSearchParams(location.search);
/* 도착 시간 — 자료 요청은 /me(정문 판정)와 나란히 보낸다. 세션이 없으면 보내지 않는다(gate 가 정문으로 돌려보냄).
   순서: 규칙 이름 · 지역 · 판정 기록 · 첫 순위 의심(limit 1) → 지역 집계(by_rule · limit 1)로 막대·HUD 먼저 → 큐 전체(점) → 규칙별 stats(결재 대기 · 지연) */
const kick = () => ({ rules: loadRules(), regions: K.loadRegions(), fb: loadFeedback(), first: loadQueue({ limit: 1 }) });
let E = session.get() ? kick() : null;
const who = await K.gate('lx-review');
/* 도착 시각(측정용 · 화면에 나오지 않음) */
const T = { gate: Math.round(performance.now()) };
E = E || kick();

/* ── 셸 · 메뉴 ─────────────────────────────────────────
   왼쪽 메뉴 = LX 직원 메뉴(kit/lx-menu.js · 10차 메뉴-1 ⓐ · J-1) — 프로젝트 맥락(?project=)이면 '프로젝트'에 불 + 마스트 아래 단계 막대(lx-project/context.js).
   지역 = 프로젝트 대상 지역(?region=) · 화면은 그대로. 프로젝트 밖에서는 메뉴 '프로젝트'(결과 확인은 프로젝트의 일). */
const PR = projectRail('review');
const S = K.shell({ who, home: 'lx-review', xiRegion: () => region?.sgg_cd || null, rail: PR || staffMenu('projects') });
const PROJ = PR ? attachProject(S, PR, 'review') : null;
/* 역할 칩 — 이름이 역할과 같으면(시드 계정 'LX 직원') 한 번만 쓴다(키트 K1 요청 전 화면 쪽 보정) */
for (const c of document.querySelectorAll('.k-role')) { const b = c.querySelector('b'); const rest = (c.textContent || '').slice((b?.textContent || '').length).trim(); if (b && rest === b.textContent.trim()) c.textContent = rest; }
const stageEl = h('div.rv-stage'); S.main.append(stageEl);
const wide = () => !matchMedia('(max-width: 640px)').matches;
/* 지역 카메라 여백 — 서랍 392 + 거터 16 + 24(점 무리가 서랍 밑으로 잘리지 않게) · 390 은 HUD 아래 · 서랍 위 */
const PAD_REGION = () => (wide() ? { top: 96, right: 392 + 16 + 24, bottom: 72, left: 64 } : { top: 176, bottom: Math.round(innerHeight * 0.48), left: 24, right: 24 });
const MIN_Z = 11;                 // 지역 도착 = 이 줌 이상(바탕 사진이 필지 결로 읽히는 단계)
let stage = null;                 // 지역을 안 뒤에 만든다(초기 카메라 = 지역 bbox · 전국 뷰를 거치지 않음)

/* HUD — 사진 위 흰 124 · 업무 결과(현장 확인 필요) */
/* 자료·지도가 준비되기 전에는 HUD 를 띄우지 않는다(회백 바탕 위 흰 글자 · '아직 결과가 없습니다' 깜빡임 0) — hud.set 뒤 사진 타일이 깔리면 연다 */
const hudEl = h('div.rv-hud', { hidden: true }); stageEl.append(hudEl);
const hud = K.bignum(hudEl, null, { label: '현장 확인 필요', unit: '필지', hud: true });
const hudLabel = hudEl.querySelector('.k-big-l');
/* HUD 가 열리기 전에는 진행 막대 1개(K9 막대 · '불러오는 중')만 */
const loadEl = h('div.rv-load', { role: 'status' }, h('span', { text: K.t('empty.loading') }), h('div.t-progress.k-empty-p.is-indet', {}, h('i')));
stageEl.append(loadEl);
/* 사진 타일 — 바탕(k-eox · k-vw) 타일이 몇 장 깔렸는가(줌 10 이상 · 회백 판 위에 HUD 를 올리지 않기 위한 기준). 카드는 V-World 줌 16 이상 */
let painted = 0, paintedHi = 0, flying = 0;
const fly = (b, o) => { if (!stage) return Promise.resolve(false); flying++; return stage.go(b, o).finally(() => { flying--; }); };

/* ── 서랍 골격 — /me 직후 바로(규칙 이름 6줄 · 숫자는 집계가 오면) ── */
let dr = null, sample = null, cardEl = null, cur = null;
let byRule = null, queue = [], rule = null, region = null, all = null;
const body = h('div.rv-board');
function openDrawer() {
  dr = K.drawer({ title: '', body, host: stageEl, slot: 'right', label: '결과 확인', onClose: () => { dr = null; reopen.hidden = false; } });
  reopen.hidden = true;
  title();
}
const reopen = h('button.t-btn.t-btn--2.rv-reopen', { type: 'button', text: '결과 확인', hidden: true, onclick: () => openDrawer() });
stageEl.append(reopen);
const title = () => dr?.title(rule ? `④ 결과 확인 · ${D.byId[rule]?.name || ''}` : '④ 결과 확인');
let resolveQ; const queueReady = new Promise((r) => { resolveQ = r; });
const any = () => Object.values(byRule || {}).some((e) => (e?.value || 0) > 0);

/** 서랍 골격 — 규칙 이름 6줄(숫자 자리 비움). 규칙 목록 전이면 빈 줄 6 */
function skeleton() {
  if (byRule) return;
  body.innerHTML = '';
  const names = D.rules.length ? D.rules.map((r) => r.name) : Array(6).fill('');
  body.append(h('div.rv-rules.k-bars.rv-skel', { 'aria-busy': 'true' }, ...names.map((n) => h('div.k-bar', {}, h('span.k-bar-l.rv-skel-l', { text: n }), h('span.k-bar-t'), h('span.k-bar-v.num')))));
  T.skeleton = T.skeleton || Math.round(performance.now());
}

/** HUD — 현장 확인 필요(이 지역) = 대표 수치 한 출처(summary field_check · XI맵 · 서비스 상세와 같은 값).
    규칙별 수는 서랍 막대에만(다른 이름). summary 를 못 받으면 '—' + 불러오지 못함(규칙 하나의 수를 이 이름으로 쓰지 않는다) */
let hudAt = 0, hudEnv;
function setHud() {
  if (hudEnv === undefined) hud.loading();
  else if (hudEnv === null) { hud.empty(); const n = hudEl.querySelector('.k-big-none'); if (n) n.textContent = '불러오지 못했습니다'; }
  else hud.set(hudEnv);
  if (hudAt) return;
  hudAt = performance.now();
  /* 사진이 깔린 뒤에만 연다(상한 없음): 바탕 사진 타일 ≥ 4장 + 카메라가 지역에 도착(비행 끝 · 멈춤 · 줌 ≥ 11) + 보이는 타일 다 옴. 그 전에는 진행 막대 1개 */
  const tick = () => {
    const m = stage?.map;
    const arrived = m && !flying && !m.isMoving() && m.getZoom() >= MIN_Z - 0.01;
    if (arrived && painted >= 4 && m.areTilesLoaded()) { hudEl.hidden = false; loadEl.classList.add('is-out'); requestAnimationFrame(() => hudEl.classList.add('is-in')); T.hud = Math.round(performance.now()); T.hudZ = +m.getZoom().toFixed(2); return; }
    setTimeout(tick, 100);
  };
  tick();
}

openDrawer();
skeleton();

/* ── 지도 ─────────────────────────────────────────── */
const fc = (items) => ({ type: 'FeatureCollection', features: items.filter((f) => f.lnglat?.[0]).map((f) => ({ type: 'Feature', id: undefined, properties: { id: f.id }, geometry: { type: 'Point', coordinates: f.lnglat } })) });
const inRule = () => queue.filter((f) => f.rule === rule);
const drawQueue = () => stage.geo('q', fc(inRule()), 'ai');
function bindMap() {
  const m = stage.map;
  m.on('data', (e) => {
    if (e.dataType !== 'source' || !e.tile || !/^k-(eox|vw)$/.test(e.sourceId || '')) return;
    const z = e.tile.tileID?.canonical?.z ?? 0;
    if (z >= 10) { painted++; if (painted === 1 || painted === 4) T['tile' + painted] = Math.round(performance.now()); }
    if (z >= 16 && e.sourceId === 'k-vw') paintedHi++;
  });
  m.on('click', 'k-q-p', (e) => { const id = e.features?.[0]?.properties?.id; const f = queue.find((x) => x.id === id); if (f) openCard(f, { from: 'map' }); });
  m.on('mouseenter', 'k-q-p', () => { m.getCanvas().style.cursor = 'pointer'; });
  m.on('mouseleave', 'k-q-p', () => { m.getCanvas().style.cursor = ''; });
  m.on('click', (e) => { if (cardEl && !m.queryRenderedFeatures(e.point, { layers: ['k-q-p'] }).length) closeCard(); });
}

let barEl = null, barKey = '';
function rulesBar() {
  const bar = h('div.rv-rules', { role: 'radiogroup', 'aria-label': '규칙' });
  K.bars(bar, { items: D.rules.map((r) => ({ label: r.name, value: byRule[r.id] || 0 })), unit: '' });
  bar.querySelectorAll('.k-bar').forEach((el, i) => {
    const id = D.rules[i].id, on = id === rule;
    Object.assign(el, { tabIndex: on ? 0 : -1 });
    el.setAttribute('role', 'radio'); el.setAttribute('aria-checked', String(on)); el.dataset.rule = id;
    el.addEventListener('click', () => pickRule(id));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickRule(id); } if (/Arrow(Down|Up)/.test(e.key)) { e.preventDefault(); const n = D.rules[(i + (e.key === 'ArrowDown' ? 1 : D.rules.length - 1)) % D.rules.length].id; pickRule(n); body.querySelector(`[data-rule="${n}"]`)?.focus(); } });
  });
  return bar;
}

/* ── 서랍: 규칙 6 막대 · 표본 · 정밀도 · 떼기 · 임계 ───────── */
function board() {
  if (!byRule) return skeleton();
  body.innerHTML = '';
  if (!any()) {
    const e = h('div'); body.append(e);
    K.empty(e, { kind: 'first', text: '이 지역의 첫 분석이 끝나면 의심 필지가 여기에 모입니다', compact: true });
    return;
  }
  /* 막대는 규칙·집계가 바뀔 때만 새로 그린다(판정마다 0에서 다시 자라지 않게) */
  const key = rule + '|' + D.rules.map((r) => byRule[r.id]?.value ?? 0).join(',');
  if (key !== barKey) { barEl = rulesBar(); barKey = key; }
  const bar = barEl;
  body.append(bar);

  const st = ruleStat(rule);
  if (D.stage) body.prepend(h('span.t-chip.rv-stagechip', { text: '연습 판정 · 실제 정밀도에 들어가지 않음' }));
  const G = st.goal;              // 조건(표본) = 서버 gate_samples
  const ready = st.k >= G && (st.precision?.value ?? 0) >= st.gate;
  const prog = h('div.t-progress.rv-prog', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': G, 'aria-valuenow': Math.min(st.k, G), 'aria-label': '표본 확인' }, h('i', { style: { width: Math.min(100, (st.k / G) * 100) + '%' } }));
  const samp = h('section.rv-sec', {},
    h('div.rv-row', {}, h('span.t-label', { text: '표본 확인' }), h('span.rv-k.num', { html: `<b>${nf(st.k)}</b>/${nf(G)}` })),
    prog,
    sampling() || cardEl ? null : h('button.t-btn.t-btn--2.rv-wide', { type: 'button', text: `표본 ${SAMPLE} 보기`, onclick: () => startSample() }));
  body.append(samp);

  const pr = st.precision;
  const prec = h('section.rv-sec.rv-prec', {},
    h('div', {}, h('span.t-label', { text: '정밀도' }), h('div.rv-p', { html: pr ? `<span class="k-num" data-metric="정밀도" data-v="${pr.value}">${nf(pr.value, 2)}</span>${K.sig(pr)}` : '<span class="k-num">—</span>' })),
    h('div.rv-gate', {}, h('span.t-label', { text: '임계' }), h('span.rv-g.num', { text: nf(st.gate, 2) })));
  body.append(prec);

  const acts = h('div.rv-acts');
  if (st.reviewed) acts.append(h('span.t-chip.rv-done', { text: '✓ 확인됨' }));
  else {
    const b = h('button.t-btn', { type: 'button', text: '확인 완료', onclick: () => doUnTag() });
    if (!ready) { b.disabled = true; b.dataset.why = `표본 ${nf(st.k)}/${nf(G)}`; }
    const wrap = h('span.rv-tipw', { 'data-why': ready ? '' : `표본 ${nf(st.k)}/${nf(G)}` }, b);
    acts.append(wrap);
  }
  acts.append(h('button.t-btn.t-btn--2', { type: 'button', text: '임계 조정', onclick: () => thresholdSheet() }));
  body.append(acts);

  if (sample) body.append(sampleList());
  requestAnimationFrame(fitMobile);
}

/** 390 — 첫 뷰는 '표본 검수 k/100 + 표본 20 보기' 아래(정밀도 위)에서 서랍을 끊는다. 표본을 보는 중이면 기본 높이(52%) */
function fitMobile() {
  const d = dr?.el; if (!d) return;
  if (wide() || sample) { d.style.maxHeight = ''; return; }
  const sec = body.querySelector('.rv-sec'), sc = d.querySelector('.k-dr-b');
  if (!sec || !sc) { d.style.maxHeight = ''; return; }
  const want = Math.ceil(sec.getBoundingClientRect().bottom - d.getBoundingClientRect().top + sc.scrollTop + 12);
  d.style.maxHeight = Math.min(want, Math.round(innerHeight * 0.52)) + 'px';
}

function sampleList() {
  const m = verdictMap(rule);
  const box = h('section.rv-sec.rv-list');
  const done = sample.filter((f) => m.has(f.id)).length;
  box.append(h('div.rv-row', {}, h('span.t-label', { text: `표본 ${SAMPLE}` }), h('span.rv-k.num', { html: `<b>${done}</b>/${sample.length}` })));
  const t = h('div'); box.append(t);
  const V = { tp: '맞음', fp: '오탐', unk: '모름' };
  K.table(t, {
    cols: [{ key: 'n', label: '', num: true, width: '28px' }, { key: 'where', label: '필지' }, { key: 'v', label: '판정', fmt: (v) => v ? `<span class="rv-v" data-v="${esc(v)}">${esc(V[v])}</span>` : '<span class="rv-v">—</span>' }],
    rows: sample.map((f, i) => ({ n: i + 1, where: short(f), v: m.get(f.id)?.v || '', f })), limit: SAMPLE,
    onRow: (r) => openCard(r.f, { from: 'list' }),
  });
  t.querySelectorAll('tbody tr').forEach((tr, i) => { if (sample[i]?.id === cur?.id) tr.classList.add('is-on'); });
  return box;
}

/** 표본을 보는 중(아직 판정 안 된 표본이 남음) — 이때는 '표본 20 보기' 대신 목록이 자리를 차지한다 */
const sampling = () => !!sample && sample.some((f) => !verdictMap(rule).has(f.id));
const short = (f) => String(f.addr || '').split(/\s+/).slice(2).join(' ') || f.emd || '';

function pickRule(id) {
  if (id === rule) return;
  rule = id; sample = null; closeCard();
  const u = new URL(location.href); u.searchParams.set('rule', id); u.searchParams.delete('finding'); history.replaceState(null, '', u);
  setHud();
  drawQueue(); title(); board();
  if (D.s2 && !D.ruleStats[id]) loadRuleStats([id]).then(() => { if (rule === id) board(); });
  toRule(1600);
}
/** 규칙 점 무리로 — 가운데 90 %(양끝 5 % 뗌) 상자 · 서랍 옆 여백(392 + 16 + 24) · 줌 ≥ 11(바탕 사진 결) */
function toRule(ms = 1600) {
  const pts = inRule().map((f) => f.lnglat).filter((c) => c && Number.isFinite(c[0]));
  if (!pts.length || !stage) return Promise.resolve(false);
  const at = (a, t) => a[Math.round(t * (a.length - 1))];
  const xs = pts.map((p) => p[0]).sort((a, b) => a - b), ys = pts.map((p) => p[1]).sort((a, b) => a - b);
  let b = [at(xs, 0.05), at(ys, 0.05), at(xs, 0.95), at(ys, 0.95)];
  if (b[2] - b[0] < 0.004 && b[3] - b[1] < 0.004) b = grow(b.map((v, i) => v + (i < 2 ? -0.002 : 0.002)), 1);
  stage.pad(PAD_REGION());
  const cam = stage.map.cameraForBounds(b, { padding: stage.padding, maxZoom: 13 });
  if (cam && cam.zoom < MIN_Z) b = grow(b, 2 ** (cam.zoom - MIN_Z));
  return fly(b, { maxZoom: 13, ms });
}

/* ── 표본 20 ──────────────────────────────────────── */
async function startSample() {
  await queueReady;
  sample = drawSample(rule, queue);
  if (!sample.length) { K.toast('판정할 표본이 없습니다'); return; }
  stage.geo('smp', fc(sample), 'point');
  board();
  const m = verdictMap(rule);
  const next = sample.find((f) => !m.has(f.id)) || sample[0];
  openCard(next, { from: 'sample' });
}

/* ── 필지 카드(대장 | AI 판독 · 판정 3) ─────────────── */
const UNIT = '㎡';
/* 버튼 예산 8 — 카드가 열려 있는 동안 '표본 20 보기'는 숨기고, 임계 시트와 카드는 동시에 열지 않는다 */
let sheet = null;
function closeCard() {
  const had = !!cardEl; cardEl?.remove(); cardEl = null; cur = null; stage?.clear('sel'); aiShow(null); stage?.pad(PAD_REGION()); document.body.classList.remove('rv-has-card');
  if (had && dr) { board(); if (!wide()) requestAnimationFrame(showProgress); }
}
/** 390 — 카드를 닫고 서랍이 돌아오면 '표본 검수 k/100 · 정밀도'가 보이게 서랍 안을 내린다(규칙 막대는 위로) */
function showProgress() {
  const sc = dr?.el.querySelector('.k-dr-b'), sec = body.querySelector('.rv-sec'); if (!sc || !sec) return;
  sc.scrollTo({ top: sc.scrollTop + sec.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8, behavior: 'smooth' });
}
async function openCard(f, { from } = {}) {
  sheet?.close(); sheet = null; document.body.classList.remove('rv-has-sheet');
  cur = f;
  const st = ruleStat(f.rule);
  const r = D.byId[f.rule];
  const m = verdictMap(f.rule);
  const idx = sample ? sample.findIndex((x) => x.id === f.id) : -1;
  const cls = CLS[r?.cls] || '';
  const pm = f.parcel_m2, ev = f.evid_m2, pc = f.evid_pct;
  const aiLine = ev?.value != null ? `${esc(cls)} ${nf(Math.round(ev.value))}${UNIT}${pc?.value != null ? ` · ${nf(Math.round(pc.value))}%` : ''}${K.sig(ev)}` : '—';
  const el = K.card({ map: true, cls: 'rv-card' });
  el.setAttribute('aria-label', '필지');
  el.innerHTML = `
    <div class="rv-card-h">
      <span class="t-chip rv-tag${st.reviewed ? ' is-ok' : ''}">${st.reviewed ? '✓ 확인됨' : 'AI 분석 · 확인 전'}</span>
      ${idx >= 0 ? `<span class="rv-seq num">${idx + 1} / ${sample.length}</span>` : ''}
    </div>
    <p class="rv-addr">${esc(short(f))}</p>
    <div class="rv-pair">
      <div><span class="t-label">대장</span><b>${esc(f.jimok || '')} ${pm?.value != null ? nf(Math.round(pm.value)) + UNIT : '—'}${K.sig(pm)}</b></div>
      <div class="is-ai"><span class="t-label">AI 분석</span><b>${aiLine}</b></div>
    </div>
    <div class="rv-photo" role="status"><span>사진 불러오는 중</span><div class="t-progress k-empty-p is-indet"><i></i></div></div>
    <div class="rv-verdict" role="group" aria-label="판정">
      <button class="t-btn" type="button" data-v="tp" disabled>맞음</button>
      <button class="t-btn t-btn--2" type="button" data-v="fp" disabled>오탐</button>
      <button class="t-btn t-btn--2" type="button" data-v="unk" disabled>모름</button>
    </div>`;
  const had = m.get(f.id)?.v; if (had) el.querySelector(`[data-v="${had}"]`)?.classList.add('is-was');
  el.querySelectorAll('.rv-verdict button').forEach((b) => b.addEventListener('click', () => decide(f, b.dataset.v, el)));
  cardEl?.remove(); cardEl = el; stageEl.append(el);
  document.body.classList.add('rv-has-card');
  requestAnimationFrame(() => { const r = el.getBoundingClientRect(); if (r.height) document.body.style.setProperty('--rv-toast-b', Math.round(innerHeight - r.top + 28) + 'px'); });
  requestAnimationFrame(() => el.classList.add('is-in'));
  if (dr) board();
  const u = new URL(location.href); u.searchParams.set('finding', f.id); history.replaceState(null, '', u);
  stage.clear('sel'); aiShow(null);
  /* 카메라 — 필지 경계로(없으면 점 둘레). 카드의 실제 높이만큼 아래를 비워 필지가 화면 폭 1/3 이상(z ≥ 17)이 되게 */
  const p = await parcel(f.pnu);
  if (cur !== f) return;
  const geom = p?.geometry || null;
  const [x, y] = f.lnglat; const d = 0.0005;
  const pb = (geom && bboxOf(geom)) || [x - d, y - d * 0.8, x + d, y + d * 0.8];
  paintedHi = 0;
  await new Promise((res) => requestAnimationFrame(res));
  if (cur !== f) return;
  stage.pad(padCard(el));
  const arrive = fly(grow(pb, wide() ? 2.1 : 1.85), { maxZoom: 19, ms: from === 'sample' ? 1000 : 1400 });
  /* 판정 근거 — 필지 경계 흰 2px(sel) + AI 판독 폴리곤(--ai 선 2px · 채움 12%) */
  let selP = Promise.resolve();
  if (geom) {
    selP = stage.geo('sel', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: geom }] }, 'focus').then(() => {
      const mm = stage.map;
      if (mm.getLayer('k-sel-l')) { mm.setPaintProperty('k-sel-l', 'line-width', 2); mm.setPaintProperty('k-sel-l', 'line-opacity', 1); }
      if (mm.getLayer('k-sel-f')) mm.setPaintProperty('k-sel-f', 'fill-opacity', 0);
    });
  }
  const jn = p?.facts?.ledger?.jimok_nm; if (jn && jn !== f.jimok) { const b = el.querySelector('.rv-pair b'); if (b) b.firstChild.textContent = `${jn} `; }
  const fi = (p?.findings || []).find((z) => z.id === f.id);
  const ids = (fi?.ai_ids || []).map(String);
  selP.catch(() => {}).then(() => aiShow(ids.length ? { ids, at: f.lnglat } : null));
  /* 사진 타일이 필지 위에 깔린 뒤에만 판정 버튼을 연다 */
  await arrive;
  photoReady(f, el);
}
/** 카드 카메라 여백 — 카드의 실제 높이 기준(390 = 카드 + 하단 탭 64 위 · HUD 아래) */
function padCard(el) {
  const s = stageEl.getBoundingClientRect(), c = el.getBoundingClientRect();
  if (!wide()) {
    const hb = !hudEl.hidden ? hudEl.getBoundingClientRect().bottom - s.top : 0;
    return { top: Math.max(48, Math.round(hb + 8)), bottom: Math.max(0, Math.round(s.bottom - c.top + 16)), left: 16, right: 16 };
  }
  return { top: 96, right: 392 + 16 + 24, left: 64, bottom: Math.max(72, Math.round(s.bottom - c.top + 24)) };
}
/** 상자를 중심에서 k 배로(필지가 가용 폭의 약 1/k 을 차지) */
const grow = ([a, b, c, d], k) => { const cx = (a + c) / 2, cy = (b + d) / 2, w = ((c - a) * k) / 2, hh = ((d - b) * k) / 2; return [cx - w, cy - hh, cx + w, cy + hh]; };
function photoReady(f, el) {
  const t0 = performance.now();
  const tick = () => {
    if (cur !== f || !el.isConnected) return;
    const m = stage.map;
    const aiOk = aiDoneFor === f || performance.now() - t0 > 8000;   // AI 층이 끝내 안 오면 8초 뒤 연다(사진 기준은 그대로)
    if (!flying && !m.isMoving() && aiOk && m.areTilesLoaded() && paintedHi >= 4) {
      el.querySelector('.rv-photo')?.classList.add('is-out');
      el.querySelectorAll('.rv-verdict button').forEach((b) => { b.disabled = false; });
      T.photo = Math.round(performance.now() - t0); T.cardZ = +m.getZoom().toFixed(2);
      return;
    }
    setTimeout(tick, 100);
  };
  tick();
}

/* AI 판독 폴리곤 층(카탈로그 결과 벡터 · 서버 detections id 필터) — '--ai' 선 2px · 채움 12% */
const aiSrc = new Set();
const aiColor = () => getComputedStyle(document.documentElement).getPropertyValue('--ai').trim() || '#0FA9A0';
const aiFilter = (ids) => ['in', ['to-string', ['coalesce', ['get', 'id'], ['id']]], ['literal', ids]];
/* 층은 큐가 온 직후 한 번 미리 붙여 둔다(필터 빈 값) — 카드를 열면 필터만 바꾸고, 판정 버튼은 AI 층이 붙은 뒤에 연다 */
let aiDoneFor;   // aiShow 가 끝난 카드(cur) — photoReady 가 기다린다
const aiAdding = new Map();
async function aiPrepare(at) {
  if (!stage) return [];
  const m = stage.map;
  await stage.ready;
  const layers = await aiLayersAt(at).catch(() => []);
  await Promise.all(layers.map((it) => {
    const sid = 'rv-ai-' + it.id;
    if (!aiAdding.has(sid)) aiAdding.set(sid, (async () => {
      try {
        const spec = await sourceSpec(it);
        if (!m.getSource(sid)) m.addSource(sid, spec);
        const c = aiColor(), before = m.getLayer('k-sel-l') ? 'k-sel-l' : undefined;
        m.addLayer({ id: sid + '-f', type: 'fill', source: sid, 'source-layer': it.layer, filter: aiFilter([]), paint: { 'fill-color': c, 'fill-opacity': 0.12 } }, before);
        m.addLayer({ id: sid + '-l', type: 'line', source: sid, 'source-layer': it.layer, filter: aiFilter([]), paint: { 'line-color': c, 'line-width': 2 } }, before);
        aiSrc.add(sid);
      } catch (e) { K.devlog('AI 층', e.message); }
    })());
    return aiAdding.get(sid);
  }));
  return layers;
}
async function aiShow(want) {
  if (!stage) return;
  const m = stage.map, f = cur;
  if (!want) { for (const sid of aiSrc) for (const l of [sid + '-f', sid + '-l']) if (m.getLayer(l)) m.setFilter(l, aiFilter([])); aiDoneFor = f; return; }
  const layers = await aiPrepare(want.at);
  if (cur !== f) return;
  for (const it of layers) { const sid = 'rv-ai-' + it.id; for (const l of [sid + '-f', sid + '-l']) if (m.getLayer(l)) m.setFilter(l, aiFilter(want.ids)); }
  aiDoneFor = f;
}

let busy = false;
async function decide(f, v, el) {
  if (busy) return; busy = true;
  el.querySelectorAll('.rv-verdict button').forEach((b) => { b.disabled = true; });
  try {
    await judge(f, v);
    K.toast('판정을 저장했습니다');
    const m = verdictMap(f.rule);
    const next = sample?.find((x) => !m.has(x.id));
    board();
    if (next) openCard(next, { from: 'sample' });
    else {
      if (sample) forgetSample(f.rule);
      closeCard(); board();
      toRule(2000);
    }
  } catch (e) {
    K.devlog('판정 오류', e.code || e.message);
    K.toast('저장하지 못했습니다');
    el.querySelectorAll('.rv-verdict button').forEach((b) => { b.disabled = false; });
  } finally { busy = false; }
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cardEl) { e.stopImmediatePropagation(); e.preventDefault(); closeCard(); }
}, true);
addEventListener('keydown', (e) => {
  if (!cardEl || /input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
  const v = { 1: 'tp', 2: 'fp', 3: 'unk' }[e.key];
  if (v) cardEl.querySelector(`[data-v="${v}"]`)?.click();
});

/* ── 떼기 · 임계 ───────────────────────────────────── */
async function doUnTag() {
  const st = ruleStat(rule);
  try { await unTag(rule, st); K.toast('결재를 요청했습니다'); board(); if (cur) openCard(cur); }
  catch (e) { K.devlog('떼기 오류', e.code || e.message); K.toast(e.code === 'conflict' ? '이미 결재 대기 중입니다' : '저장하지 못했습니다'); }
}
async function thresholdSheet() {
  closeCard();
  const box = h('div.rv-th');
  const d = K.drawer({ title: '임계 조정', body: box, host: stageEl, slot: 'sheet', width: 360, onClose: () => { if (sheet === d) { sheet = null; document.body.classList.remove('rv-has-sheet'); } } });
  sheet = d;
  d.el.classList.add('rv-sheet');
  document.body.classList.add('rv-has-sheet');
  box.append(h('p.t-label', { text: '불러오는 중' }));
  const { th, next } = await suggest(rule, queue);
  box.innerHTML = '';
  if (!th) { const e = h('div'); box.append(e); K.empty(e, { kind: 'first', compact: true }); return; }
  const u = K.unitKo(th.value?.unit);
  const val = (e) => e ? `<span class="k-num">${nf(e.value)}<small>${esc(u)}</small></span>${K.sig(e)}` : '<span class="k-num">—</span>';
  box.append(
    h('p.rv-th-k', { text: th.label || '' }),
    h('div.rv-th-row', {}, h('span.t-label', { text: '현재' }), h('div', { html: val(th.value) })),
    h('div.rv-th-row', {}, h('span.t-label', { text: '제안(현장 확인 기준)' }), h('div', { html: next ? val(next) : `${val(null)}<p class="t-label">${esc(K.t('big.none'))}</p>` })));
  const go = h('button.t-btn.rv-wide', { type: 'button', text: '적용 요청' });
  const pend = ruleStat(rule).pending;
  if (!next || pend) go.disabled = true;
  if (pend) box.append(h('p.t-label', { text: '결재 대기 중' }));
  go.addEventListener('click', async () => {
    go.disabled = true;
    try { await requestThreshold(rule, th, next); K.toast('결재를 요청했습니다'); d.close(); }
    catch (e) { K.devlog('임계 오류', e.code || e.message); K.toast(e.code === 'conflict' ? '이미 결재 대기 중입니다' : '저장하지 못했습니다'); go.disabled = e.code === 'conflict'; }
  });
  box.append(go);
}

/* 비활성 버튼 호버 한 줄 — 키트 풍선(.k-sig 규약) 재사용 */
document.addEventListener('mouseover', (e) => {
  const w = e.target.closest?.('.rv-tipw'); if (!w || !w.dataset.why) return;
  let tip = document.querySelector('.rv-tip');
  if (!tip) { tip = h('div.k-tip.rv-tip', { role: 'tooltip' }); document.body.append(tip); }
  tip.textContent = w.dataset.why; tip.hidden = false;
  const r = w.getBoundingClientRect(), tr = tip.getBoundingClientRect();
  tip.style.transform = `translate(${Math.round(Math.max(12, r.left + r.width / 2 - tr.width / 2))}px, ${Math.round(r.bottom + 8)}px)`;
});
document.addEventListener('mouseout', (e) => { if (e.target.closest?.('.rv-tipw')) { const t = document.querySelector('.rv-tip'); if (t) t.hidden = true; } });

/* ── 시작 · 자료 ─────────────────────────────────────── */
const [regions, , , firstQ, PRJ] = await Promise.all([E.regions, E.rules, E.fb, E.first, PROJ]);
/* 프로젝트 안(J-1) — 그 프로젝트의 대조 규칙만(막대 · 큰 숫자 · 점 · 표본) · 큰 숫자는 그 서비스(카드)의 현장 확인 필요. 프로젝트 밖은 전체 */
const PRULES = PRJ ? await projectRules(PRJ) : null;
if (PRULES) { const keep = D.rules.filter((r) => PRULES.includes(r.id)); if (keep.length) D.rules.splice(0, D.rules.length, ...keep); }
skeleton();
const first = firstQ?.items?.[0] || null;
/* 주소의 지역이 없거나 모르는 값이면 첫 순위 의심 필지의 시군구로(데이터가 정한다) */
region = regionFor(regions, first);
if (D.unknownRegion) setTimeout(() => K.toast('이 지역은 아직 목록에 없습니다'), 600);
/* 무대는 지역을 안 뒤에 만든다 — 초기 카메라 = 지역 bbox(전국 뷰 · 비행 없이 바로 지역 · map load 를 기다리지 않음) */
stage = K.createStage(stageEl, { bounds: region?.bbox || K.KOREA, padding: PAD_REGION() });
stage.pad(PAD_REGION());
T.zFit = +stage.map.getZoom().toFixed(2);
if (region?.bbox && stage.map.getZoom() < MIN_Z) stage.map.jumpTo({ zoom: MIN_Z });
stageEl.append(hudEl, loadEl, reopen);   // 지도 위 층 순서
bindMap();
K.devDrawer({ stage, who });
/* Ctrl K — 결과 확인 화면에서도 말로 묻기(다른 LX 직원 화면과 같은 명령 바 · 지금 시군구를 문맥으로) */
{ const ck = K.mountCmdk({ stage, context: () => ({ region: region?.sgg_cd || null }) }); S.mast(ck.button()); }
T.stage = Math.round(performance.now()); T.z0 = +stage.map.getZoom().toFixed(2);
/* 지역 집계 먼저(by_rule · limit 1) — 막대 · HUD 를 큐 전체(최대 2000건)보다 먼저 그린다 */
const agg = await loadQueue({ bbox: region?.bbox || null, sgg: region?.sgg_cd || null, limit: 1 });
byRule = agg?.by_rule || {};
const count = (id) => byRule[id]?.value || 0;
rule = Q.get('rule') && D.byId[Q.get('rule')] ? Q.get('rule') : [...D.rules].sort((a, b) => count(b.id) - count(a.id))[0]?.id;
const aggAny = Object.values(byRule).some((e) => (e?.value || 0) > 0);
/* 이 규칙의 정밀도 봉투(stats · lx) 한 건만 먼저 — 나머지 5건은 첫 보드 뒤(지연) */
const [sum] = await Promise.all([summary({ region: region?.sgg_cd || null }), rule ? loadRuleStats([rule]) : null]);
hudEnv = sum ? total(sum, 'field_check', region?.sgg_cd || PRJ?.card ? pick({ sgg: region?.sgg_cd || null, card: PRJ?.card || null }) : null) ?? null : null;
K.devlog('현장 확인 필요', sum ? `summary ${hudEnv?.value ?? '—'}` : 'summary 없음');
hudLabel.textContent = `${labelOf(sum, 'field_check')} · ${region?.name || ''}`.replace(/ · $/, '');
setHud();
title(); board(); T.board = Math.round(performance.now());
S.fresh(new Date());

/* 큐 전체(점 · 표본) */
all = aggAny ? await loadQueue({ bbox: region?.bbox || null, sgg: region?.sgg_cd || null }) : { items: [], by_rule: byRule, total: null };
/* 배포 기록의 지역 상자는 넓다 — 상자 안이라도 다른 시군구 필지면 빼고, 서버에 읍면동으로 다시 묻는다(숫자 = 서버 집계 그대로) */
if (all?.items?.some((f) => !inRegion(region, f))) {
  const cds = [...new Set(all.items.filter((f) => inRegion(region, f)).map((f) => f.emd_cd).filter(Boolean))];
  all = cds.length ? await loadQueue({ emd: cds }) : { items: [], by_rule: {}, total: null };
  byRule = all?.by_rule || {};
  setHud(); board();
}
queue = all?.items || [];
resolveQ();
drawQueue();
/* AI 판독 층을 미리 붙여 둔다(카드가 열릴 때 필터만) — 지역 가운데 기준 */
{ const bb = region?.bbox, at = bb ? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] : queue[0]?.lnglat; if (at) setTimeout(() => aiPrepare(at), 400); }
/* 지역 안에서 규칙 점 무리로 한 번 맞춘다(전국 뷰 없음 · 지역 상자 → 점 무리 · 서랍 밑으로 잘리지 않게) */
if (!Q.get('finding')) toRule(region?.bbox ? 1200 : 1600);
if (region?.sgg_cd) for (const a of S.rail.querySelectorAll('a.k-rail-i')) { const u = new URL(a.href); u.searchParams.set('region', region.sgg_cd); a.href = u.pathname + u.search + u.hash; }
const fFirst = Q.get('finding') ? queue.find((f) => f.id === Q.get('finding')) : null;
if (fFirst && fFirst.rule !== rule) { rule = fFirst.rule; setHud(); drawQueue(); title(); board(); }

K.devlog('검수 경로', D.s2 ? '판정 POST /survey/findings/{fid}/state · 정밀도 GET /survey/rules/{id}/stats(lx)'
  : `판정·정밀도 = /feedback · tenant lx · 세트 ${D.set}{규칙}`);
K.devlog('결재 경로', D.stage ? `/feedback 세트 ${D.set}{규칙}(시험 규칙 · 결재함 밖)` : 'POST /survey/rules/{id}/activate → approvals');
K.devlog('지역', region ? `${region.full || region.name} · ${region.sgg_cd || '—'}${region.approx ? ' · 근사' : ''}` : '없음');
K.devlog('큐', `${queue.length}건 · ${D.log.map((l) => l.p + ' ' + l.e).join(' / ') || '오류 0'}`);
if (fFirst) setTimeout(() => openCard(fFirst, { from: 'url' }), 900);
document.documentElement.dataset.ready = '1';
window.__lxReview = { D, get rule() { return rule; }, get sample() { return sample; }, get queue() { return queue; }, stat: () => ruleStat(rule), region, map: stage.map, inRule, T, get painted() { return painted; } };
if (isDev()) K.devlog('표본', `${SAMPLE} · 목표 ${ruleStat(rule).goal}`);
/* 결재 대기 표시용 규칙별 stats(×6) — 첫 보드 뒤에(지연 로드). S-2(lx 전용 필드) 판정도 이 결과로 */
loadRuleStats(D.rules.map((r) => r.id).filter((id) => id !== rule)).then(() => probeS2()).then(() => {
  K.devlog('검수 경로 판정', D.s2why);
  if (Object.values(D.pending).some(Boolean)) { board(); if (cur) openCard(cur); }
});
