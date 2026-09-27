/* panel.js — GeoAI 에이전트 AG-0 (F2-E) · XI맵 마운트 mount(XI).
   ⌘K 명령 바 → POST /agent/runs → SSE(agent.route/plan/tool.call/tool.result/confirm/token/done) → 계획 단계 · 지도 도착(ui_actions → window.XI) ·
   답변(봉투 칩 · 검증 안 된 숫자 취소선 · 인용 [n] → flyTo + 필지 카드) · 확인 카드(사람 승인 전 제출 0) · 모델 칩 = 실제 백엔드.
   LX_API=off 또는 llm_unavailable(503) → 실제 run 녹음 재생('기록 · 저장 결과 재생'). 보고서 서랍 '초안 작성' 탭은 XI.provide('report-draft').
   지도·HUD 는 브리지(window.XI)로만 만진다. 유리(blur) 0 — 잉크 레인. */
import { API, probe, session } from '../shared/api-v1.js';
import * as A from './api-agent.js';
import { CmdBar } from './cmdbar.js';
import { PlanList } from './plan-list.js';
import { confirmCard } from './confirm-card.js';
import { renderMd, placeholders, chip, esc } from './answer.js';
import * as R from './replay.js';
import { recAt } from './replay.js';
import { ReportWriter } from './report-writer.js';
import { watchJob } from './job-watch.js';
import { arrivalMarks, clearMarks } from './marks.js';

let XI = null, bar = null, lane = null, mounted = false, lastToggle = 0, modelInfo = null;
const S = { run: null, stream: null, player: null, replay: false, envs: {}, meta: {}, text: '', fresh: new Set(), citations: [], plan: null, confirm: null,
  message: '', lastRun: null, arrivals: new Map(), tok: 0 };
export const state = S;

const root = document.documentElement;
const mark = (k, v = '1') => { root.dataset[k] = v; };

function css() {
  if (document.querySelector('link[data-agent-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./css/agent.css', import.meta.url).href; l.dataset.agentCss = '1';
  document.head.appendChild(l);
}

/* ── 레인 골격 ─────────────────────────────────────────────────────────── */
function buildLane(slot) {
  const el = document.createElement('section');
  el.className = 'ag-lane'; el.hidden = true; el.tabIndex = -1; el.setAttribute('aria-label', 'GeoAI 에이전트'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<header class="ag-head"><b>GeoAI 에이전트</b><span class="ag-runid"></span><button type="button" class="ag-x" aria-label="에이전트 닫기">닫기</button></header>
    <p class="ag-mast" hidden></p>
    <p class="ag-q"></p>
    <p class="ag-route"></p>
    <ol class="ag-plan" aria-label="계획 단계"></ol>
    <div class="ag-confirm-host"></div>
    <div class="ag-ans"></div>
    <ul class="ag-cites" hidden></ul>
    <footer class="ag-foot"></footer>`;
  slot.appendChild(el);
  el.querySelector('.ag-x').addEventListener('click', () => closeLane());
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cite]'); if (b) { e.preventDefault(); cite(+b.dataset.cite); }
  });
  return el;
}
const $l = (sel) => lane.querySelector(sel);
function closeLane() { lane.hidden = true; mark('agent', 'closed'); S.stream?.close(); S.player?.close(); }

/* ── 모델 칩(실제 백엔드) ──────────────────────────────────────────────── */
async function refreshModels() {
  if (API.mode !== 'on') { bar.model(null); modelInfo = null; return; }
  try {
    const m = await A.models();
    const active = m.items.find((x) => x.name === m.active) || null;
    modelInfo = { ...m, activeItem: active };
    bar.model(active);
    root.dataset.agentModel = active ? `${active.id}|${active.backend}` : 'none';
  } catch { bar.model(null); modelInfo = null; root.dataset.agentModel = 'none'; }
}

/* ── 명령 바 예시 · 플레이스홀더(현재 화면 기준) ───────────────────────── */
function view() { try { return XI.view() || {}; } catch { return {}; } }
function placeholder() {
  const v = view();
  if (v.mode === 'survey' || (v.on || []).some((x) => /survey|landcover/.test(x))) return '아영면 답 위 건물 의심 상위 5필지';
  if (v.frame) return '이 프레임 비닐하우스 분석해줘';
  return '남원 농지 중 건물이 탐지된 의심 필지 보여줘';
}
function suggestions() {
  const v = view(), out = [];
  out.push({ k: '실태조사', q: '아영면 답 위에 건물이 있는 의심 필지 상위 5개 보여줘' });
  out.push({ k: '검증', q: '전체 몇 건이야? 대략 3만 건 맞지?' });
  if (v.frame) out.push({ k: '실행', q: '이 프레임 비닐하우스 분석해줘' });
  out.push({ k: '보고서', q: '아영면 R1 실태조사 보고서 초안 써줘' });
  return out;
}
function context() {
  const v = view();
  return { view: { center: v.center, zoom: v.zoom, bbox: v.bbox }, on: v.on || [], frame: v.frame || null, svc: v.svc || null, mode: v.mode || 'read',
    epoch: v.epoch ?? null, locale: 'ko', stage: 'imagery' };
}

/* ── 실행 ─────────────────────────────────────────────────────────────── */
/** 이전 질문의 필지 카드(v2 · v1)를 닫는다 — 브리지에 closeCard 가 없어 카드 자신의 닫기 버튼을 누른다(F2-A 요청: XI.closeCard()) */
function closeCards() {
  if (XI?.closeCard) { try { XI.closeCard(); return; } catch { /* */ } }
  for (const sel of ['#pcard2 .xi-x', '#parcel-card:not([hidden]) .xi-x']) {
    const b = document.querySelector(sel);
    if (b && b.offsetParent !== null) b.click();
  }
}

function reset(message) {
  S.tok++;                          // 진행 중인 cite(flyTo → 필지 카드 · 2–4 s)를 무효화 — 늦게 열린 이전 카드가 새 답 위에 남지 않게
  S.stream?.close(); S.player?.close();
  clearMarks(); closeCards();
  Object.assign(S, { run: null, stream: null, player: null, replay: false, envs: {}, meta: {}, text: '', fresh: new Set(), citations: [], confirm: null, message });
  lane.hidden = false; mark('agent', 'open');
  $l('.ag-q').textContent = message;
  $l('.ag-route').innerHTML = '<span>라우터 분류 중 · hyperclovax-seed-1.5b</span>';
  $l('.ag-plan').innerHTML = ''; S.plan = new PlanList($l('.ag-plan'));
  $l('.ag-confirm-host').innerHTML = ''; delete lane.dataset.confirm;
  const ans = $l('.ag-ans'); ans.innerHTML = ''; ans.dataset.live = '0';
  const c = $l('.ag-cites'); c.innerHTML = ''; c.hidden = true;
  $l('.ag-foot').innerHTML = ''; $l('.ag-runid').textContent = '';
  $l('.ag-mast').hidden = true;
  mark('agentState', 'run');
}

export async function ask(message) {
  reset(message);
  const p = await probe();
  if (p.mode !== 'on') return replay(message, '시연 · 에이전트 연결 없음(LX_API=off)');
  const h = await A.alive();
  if (!h.alive) return replay(message, '시연 · 에이전트 연결 없음(llm_unavailable · 사슬 vLLM → Ollama 응답 없음)', h.tried);
  try {
    const j = await A.startRun(message, context(), 'map');
    bar.close();                      // 제출 성공 = 바를 닫는다(plan 이 없는 smalltalk·ops·failed 경로에서도 지도·카드 위에 남지 않게)
    S.run = j.run.id; $l('.ag-runid').textContent = j.run.id.slice(-6); $l('.ag-runid').title = `run ${j.run.id} · audit_log · agent_runs`;
    root.dataset.agentRun = j.run.id;
    S.stream = A.events(S.run, onEvent);
  } catch (e) {
    if (e.code === 'llm_unavailable' || e.status === 503) return replay(message, '시연 · 에이전트 연결 없음(llm_unavailable 503)', e.detail?.tried);
    bar.beam(false);
    $l('.ag-ans').innerHTML = `<p class="ag-void">${esc(e.code)} · ${esc(e.message)}</p>`;
    mark('agentState', 'error');
  }
}

async function replay(message, why, tried) {
  const url = R.pick(message, 'map');
  const lines = await R.load(url);
  S.replay = true;
  const m = $l('.ag-mast'); m.hidden = false; m.textContent = `기록 · 저장 결과 재생 — ${why}`;
  if (tried?.length) m.title = tried.map((t) => `${t.backend} ${t.error} ${t.ms}ms`).join(' · ');
  bar.model(null);
  mark('agentReplay', '1');
  if (!lines) { bar.beam(false); $l('.ag-ans').innerHTML = '<p class="ag-void">녹음 파일 없음 · 에이전트 연결 없음</p>'; return; }
  bar.close();
  S.player = R.play(lines, onEvent);
  const meta = S.player.meta;
  $l('.ag-runid').textContent = (meta.run_id || '').slice(-6) + ' · 녹음'; $l('.ag-runid').title = `실제 run ${meta.run_id} 녹음(${meta.recorded_at || ''}) · 원문 "${meta.message || ''}"`;
}

/* ── SSE 이벤트 ───────────────────────────────────────────────────────── */
function onEvent(name, d) {
  if (!d) return;
  switch (name) {
    case 'agent.route': {
      const tag = d.replay ? recAt(d.recorded_at) : d.backend === 'direct' ? '' : '실측';     // 리플레이 = 녹음 시각의 기록(이 세션 실측 아님)
      $l('.ag-route').innerHTML = `<span>라우터 <b>${esc(d.intent)}</b></span><span class="ag-tag" data-ms="${d.replay ? 'recorded' : 'measured'}">${esc(fmt(d.ms))} ms ${esc(tag)}</span><span>${esc(d.model || '')}</span>${d.pii?.length ? `<span>개인정보 마스킹 ${esc(d.pii.join('·'))}</span>` : ''}`;
      break;
    }
    case 'agent.plan': bar.beam(false); bar.close(); S.plan.set(d.steps || []); if (d.note) $l('.ag-ans').innerHTML = `<p class="ag-void">${esc(d.note)}</p>`; mark('agentPlan', String((d.steps || []).length)); break;
    case 'agent.tool.call': S.plan.call(d.i); break;
    case 'agent.tool.result': onResult(d); break;
    case 'agent.tool.client': break;
    case 'agent.tool.progress': if (d.ui_actions?.length) runUi(d.i, d.ui_actions); break;
    case 'agent.confirm': onConfirm(d); break;
    case 'agent.confirm.decided': S.confirm?.decided(d.decision); break;
    case 'agent.fallback': $l('.ag-route').insertAdjacentHTML('beforeend', `<span>폴백 ${esc(d.from)} → 다음 · ${esc(fmt(d.ms))} ms</span>`); break;
    case 'agent.token': onToken(d.delta || ''); break;
    case 'agent.done': onDone(d); break;
    case 'agent.failed': onFailed(d); break;
    case 'agent.rejected': onRejected(d); break;
    default: break;
  }
}
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '—');

function onResult(d) {
  if (d.summary) Object.assign(S.envs, d.summary);
  if (d.meta) Object.assign(S.meta, d.meta);
  if (d.citations?.length) S.citations.push(...d.citations);
  S.plan.result(d.i, { ms: d.ms, ok: d.ok, error: d.error, client: d.client, rec: d.replay ? (d.recorded_at || null) : undefined });
  if (d.ok && d.ui_actions?.length) runUi(d.i, d.ui_actions);
}

/** ui_actions → window.XI (F2-A 브리지). 클라이언트 단계 ms 는 브라우저가 재서 서버에 보고한다. */
async function runUi(i, acts) {
  const t0 = performance.now();
  let arrived = false;
  for (const a of acts) {
    mark('agentUi', `${i}:${a.op}`);
    try {
      if (a.op === 'map_on') {
        // 에이전트 질의 층은 map_arrive 의 임시 층(레이어 패널 '에이전트 질의 · 저장 안 됨')으로 올린다 —
        // 실태조사 모드 전환(XI 패널 열림 · 유리 증가)은 사람이 한다. 규칙 필터는 행 제목으로만 남긴다.
        continue;
      } else if (a.op === 'map_arrive') {
        const count = S.envs[a.count_env];
        if (!count) continue;
        const fc = { type: 'FeatureCollection', features: a.features || [] };
        // 도착 락온 마커: 스윕이 필지 x 를 지나는 순간 [n] 브래킷(줌 무관) · 락온 단계에 윤곽 강조 층 — 숫자는 그 뒤(XI HUD)
        const mk = arrivalMarks(S.citations, fc.features, { onPick: (n) => cite(n) });
        await XI.arrive({ bbox: a.bbox, features: fc.features.length ? fc : undefined, count, kind: 'building', label: `에이전트 질의 · ${S.message.slice(0, 24)}`,
          head: { scene: '에이전트 · 도착', title: S.message.slice(0, 28), unit: count.unit } });
        mk.lockAll();
        arrived = true;
      } else if (a.op === 'map_flyto') {
        await XI.flyTo(a.bbox ? { bbox: a.bbox } : { center: a.center, zoom: 17 }, 1600);
      } else if (a.op === 'parcel_card') {
        await XI.parcelCard(a.pnu).catch(() => (a.center ? XI.parcelCard({ lng: a.center[0], lat: a.center[1] }) : null));
      } else if (a.op === 'map_frame') {
        XI.frame(a.geojson, { card: false });   // 확인 카드가 같은 견적을 보인다 — XI 견적 카드는 띄우지 않는다
      } else if (a.op === 'drawer_open') {
        await XI.openDrawer(a.kind, { tab: a.tab || undefined, emd_cd: a.emd_cd, rule: a.rule });
      } else if (a.op === 'job_theater') {
        if (S.replay) { $l('.ag-confirm-host').insertAdjacentHTML('beforeend', `<p class="ag-meter">기록 재생 · 녹음된 job ${esc((a.job_id || '').slice(-8))} — 이번 재생은 제출 0</p>`); continue; }
        await theater(a);
      }
    } catch (e) { console.warn('[agent] ui_action', a.op, e?.message); XI.toast?.(`지도 동작 ${a.op} · ${e?.message || '실패'}`); }
  }
  const ms = Math.round(performance.now() - t0);
  const client = acts.some((a) => ['map_arrive', 'map_flyto', 'parcel_card', 'map_frame', 'drawer_open', 'map_on'].includes(a.op));
  if (client) {
    S.plan.clientMs(i, ms);
    if (S.run && !S.replay) A.clientMs(S.run, i, ms);
    if (arrived) mark('agentArrived', String(ms));
  }
}

/** 승인 뒤 실추론 극장 — 브리지 극장(XI.watchJob)이 있으면 그것 · 없으면 같은 job SSE 로 레인 격자 + HUD + 도착(job-watch.js). */
async function theater(a) {
  if (!a.job_id) return;
  mark('agentJob', a.job_id);
  if (XI.watchJob) { await XI.watchJob(a.job_id, { frame: a.frame }); return; }
  const w = watchJob($l('.ag-confirm-host'), XI, a);
  showConfirm(w.el, { focus: false });                   // 극장도 레인 안에 보이게(승인 뒤 카드 아래에 붙는다)
}

function onConfirm(d) {
  const host = $l('.ag-confirm-host');
  S.confirm = confirmCard(host, d, {
    replay: S.replay,
    onDecide: async (dec) => {
      if (S.replay) { S.player?.resume(dec); return; }
      await A.confirm(S.run, d.confirm_id, dec);
    },
  });
  showConfirm(S.confirm.el);
  mark('agentConfirm', d.confirm_id);
}

/** 확인 카드 전체(승인 · 거부 버튼 포함)를 뷰포트 안에 — 레인을 넓힌 뒤 카드 아래끝을 레인 아래끝에 맞춘다(카드가 레인보다 크면 위끝).
 *  focus 는 스크롤을 막지 않는다(키보드 사용자도 버튼이 보여야 한다). 레이아웃(카드 높이) 뒤 두 프레임에 걸쳐 한 번 더. */
function showConfirm(card, { focus = true } = {}) {
  const fit = () => {
    if (!card.isConnected) return;
    const pad = 12;
    // 카드가 레인(아래 128px 비움 · 축척·출처 표기 자리)보다 크면 그때만 레인을 HUD 아래 가용 높이 전부로 넓힌다(agent.css data-confirm)
    if (card.getBoundingClientRect().height + pad * 2 > lane.clientHeight) lane.dataset.confirm = '1';
    const lr = lane.getBoundingClientRect(), cr = card.getBoundingClientRect();
    if (cr.height + pad * 2 >= lr.height) lane.scrollTop += cr.top - lr.top - pad;
    else if (cr.bottom > lr.bottom - pad) lane.scrollTop += cr.bottom - lr.bottom + pad;
    else if (cr.top < lr.top) lane.scrollTop -= lr.top - cr.top + pad;
    const b = card.querySelector('.ag-btn--fill');
    if (!focus) return;
    if (b && !b.disabled) b.focus({ preventScroll: true });
    const br = b?.getBoundingClientRect();
    if (br) root.dataset.agentConfirmBtn = `${Math.round(br.top)},${Math.round(br.bottom)},${innerHeight}`;
  };
  fit(); requestAnimationFrame(() => requestAnimationFrame(fit));
}

function onToken(delta) {
  S.text += delta;
  const ans = $l('.ag-ans');
  ans.dataset.live = '1';
  const before = new Set(Object.keys(S.envs).filter((k) => S.fresh.has(k)));
  const ids = placeholders(S.text);
  S.fresh = new Set(ids.filter((k) => !before.has(k) && !ans.querySelector(`[data-env="${k}"]`)));
  ans.innerHTML = renderMd(S.text, { envs: S.envs, meta: S.meta, live: true, fresh: S.fresh });
  mark('agentTyping', String(S.text.length));
}

function onDone(d) {
  const ans = $l('.ag-ans'); ans.dataset.live = '0';
  if (d.envelopes) Object.assign(S.envs, d.envelopes);
  if (d.env_meta) Object.assign(S.meta, d.env_meta);
  if (d.citations?.length) S.citations = d.citations;
  ans.innerHTML = renderMd(d.answer_md || S.text, { envs: S.envs, meta: S.meta, unverified: d.unverified || [], flags: d.meaning_flags || [] });
  // 인용 목록(필지만 · 최대 6)
  const cits = (S.citations || []).filter((c) => c.kind === 'parcel').slice(0, 6);
  const ul = $l('.ag-cites');
  ul.innerHTML = cits.map((c) => {
    const ev = (c.env || []).map((id) => S.envs[id]).filter(Boolean)[0];
    return `<li data-cite="${c.n}" role="button" tabindex="0"><b>[${c.n}]</b><span>${esc(c.addr || c.label || c.pnu)} · ${esc(c.rule || '')} ${esc(c.priority || '')}</span>${ev ? chip(ev, { meaning: S.meta[c.env[0]], id: c.env[0] }) : ''}</li>`;
  }).join('');
  ul.hidden = !cits.length;
  // 발문: 모델 칩(실제 백엔드) · 토큰 봉투 · 첫 토큰 · 토큰/초 · run
  const m = d.model || {};
  const f = [];
  if (m.backend === 'runtime') f.push(`<span class="ag-model" data-ok="rt" title="런타임이 만든 안내 문장 — LLM 을 부르지 않았습니다(토큰 0)"><i></i>런타임 안내 <small>· LLM 호출 0</small></span>`);
  else if (m.id) f.push(`<span class="ag-model" data-ok="1" title="${esc(m.family || '')} · ${esc(m.license || '')} · ${esc(m.base || '')}"><i></i>${esc(m.id)} <small>· ${esc(m.backend === 'vllm' ? 'vLLM' : m.backend === 'ollama' ? 'Ollama' : m.backend || '')} · 온프레미스</small></span>`);
  if (m.fallback_from?.length) f.push(`<span>폴백 ${esc(m.fallback_from.map((x) => x.backend).join('→'))}</span>`);
  // 리플레이: 토큰·첫 토큰·tok/s 는 녹음된 run 의 값 → basis 'recorded'(기록) · '실측'은 이 세션에서 잰 값에만
  const rec = !!(S.replay || d.replay);
  const recNote = rec ? `${recAt(d.recorded_at)} · run ${d.run_id || ''}` : '';
  if (d.tokens && m.backend !== 'runtime') f.push(chip(rec ? { ...d.tokens, basis: 'recorded', note: recNote } : d.tokens, { meaning: '이 run 토큰(입력+출력)', id: 'tokens' }));
  if (d.perf?.first_token_ms != null) f.push(chip({ value: d.perf.first_token_ms, unit: 'ms', basis: rec ? 'recorded' : 'measured', as_of: d.tokens?.as_of || d.recorded_at || new Date().toISOString(),
    source: rec ? 'run 녹음 · SSE 첫 토큰(녹음 당시 게이트웨이 계측)' : 'SSE 첫 토큰(게이트웨이 계측)', note: recNote || undefined }, { meaning: '첫 토큰', id: 'ftt' }));
  if (d.perf?.tps != null) f.push(`<span data-ms="${rec ? 'recorded' : 'measured'}">${esc(fmt(d.perf.tps))} tok/s ${rec ? esc(recAt(d.recorded_at, true)) : '실측'}</span>`);
  if (S.replay) f.push('<span class="ag-void" style="margin:0">기록 · 저장 결과 재생</span>');
  if (d.unverified?.length) f.push(`<span style="color:var(--ag-warn)">검증 안 된 숫자 ${d.unverified.length}</span>`);
  if (d.meaning_flags?.length) f.push(`<span style="color:var(--ag-warn)">봉투 뜻 확인 필요 ${d.meaning_flags.length}</span>`);
  f.push(`<span class="ag-run" title="agent_runs · audit_log">${esc((d.run_id || S.run || '').slice(-10))}</span>`);
  $l('.ag-foot').innerHTML = f.join('');
  S.lastRun = { id: d.run_id || S.run, citations: S.citations, envs: { ...S.envs }, meta: { ...S.meta }, message: S.message };
  if (S.confirm && !lane.hidden) showConfirm($l('.ag-ans'), { focus: false });   // 승인 · 극장 뒤 LLM 답이 레인 아래에 붙으면 그 답이 보이게
  mark('agentState', 'done');
  mark('agentUnverified', String(d.unverified?.length || 0));
  mark('agentMeaningFlags', String(d.meaning_flags?.length || 0));
  mark('agentModelBackend', m.backend || 'none');
  bar.beam(false);
}

function onFailed(d) {
  bar.beam(false); bar.close();
  if (d.error === 'llm_unavailable' && !S.replay) { replay(S.message, '시연 · 에이전트 연결 없음(실행 중 llm_unavailable)', d.tried); return; }
  $l('.ag-ans').innerHTML = `<p class="ag-void">${esc(d.error)} · ${esc(d.message || '')}</p>`;
  mark('agentState', 'failed');
}

function onRejected(d) {
  bar.beam(false); bar.close();
  const CAT = { cross_tenant: '다른 기관 자료', deploys_forbidden: '배포 조작', raw_imagery: '원본 영상 경로', owner_pii: '소유자 개인정보', quota_write: '쿼터 변경',
    privilege: '권한 상승', prompt_injection: '지시 변경(인젝션)', results_edit: '검수 편집' };
  $l('.ag-route').innerHTML = `<span>권한 밖 요청 · <b>${esc(CAT[d.category] || d.category)}</b></span><span>LLM 호출 0 · 감사 기록</span>`;
  $l('.ag-ans').innerHTML = `<div class="ag-rej"><b>tool_forbidden · ${esc(CAT[d.category] || d.category)}</b>${esc(d.message)}</div>`;
  mark('agentState', 'rejected'); mark('agentReject', d.category || '');
}

/** 인용 [n] → 지도 flyTo + 필지 카드 v2 (서랍은 유지) */
export async function cite(n, cits = S.citations) {
  const c = (cits || []).find((x) => x.n === n);
  if (!c) return;
  const tok = S.tok;                                     // 이 cite 를 시작한 질문 — 새 질문(reset)이 오면 무효
  const stale = () => tok !== S.tok;
  mark('agentCite', String(n)); mark('agentCiteOpen', '1');
  try {
    if (c.kind === 'stats' || c.kind === 'list') { if (c.emd_cd) XI.openDrawer('findings', { emd_cd: c.emd_cd, rule: c.rule || undefined }).catch(() => null); return; }
    // 카메라와 카드를 병렬로(카드 선열림) — 순차(flyTo 1.6 s → 카드 ≈2.1 s)면 3.7 s 뒤에야 보인다
    const fly = c.bbox ? XI.flyTo({ bbox: c.bbox, pitch: 0 }, 1600).catch(() => null) : c.center ? XI.flyTo({ center: c.center, zoom: 17.5 }, 1600).catch(() => null) : null;
    const card = c.pnu ? XI.parcelCard(c.pnu).catch(() => (c.center ? XI.parcelCard({ lng: c.center[0], lat: c.center[1] }).catch(() => null) : null)) : null;
    await Promise.all([fly, card]);
    if (stale()) {                                        // 카드가 새 질문 뒤에 열렸다 → 즉시 닫는다(다음 프레임에 한 번 더 · 카드 배치가 늦게 끝나는 경우)
      closeCards(); requestAnimationFrame(() => { if (stale()) closeCards(); });
      mark('agentCiteStale', String(n));
    }
  } finally { if (!stale()) mark('agentCiteOpen', '0'); }
}

/* ── 마운트 ───────────────────────────────────────────────────────────── */
export async function mount(xi = window.XI) {
  if (mounted || !xi) return;
  mounted = true;
  XI = xi;
  css();
  await XI.ready;
  const sess = XI.session?.() || {};
  if (sess.public || (!sess.realm && !session.shadow().realm)) { mark('agent', 'guest'); return; }       // 게스트 · 공개 모드: 에이전트 없음(요청 0)
  const cmdSlot = XI.slot('cmdk') || document.getElementById('cmdk-slot');
  const agSlot = XI.slot('agent') || document.getElementById('agent-slot');
  if (!cmdSlot || !agSlot) { mark('agent', 'noslot'); return; }
  bar = new CmdBar(cmdSlot, { onSubmit: (q) => ask(q), suggestions, placeholder });
  lane = buildLane(agSlot);
  const toggle = () => { const t = performance.now(); if (t - lastToggle < 200) return; lastToggle = t; bar.toggle(); };
  XI.on('cmdk', toggle);
  XI.provide('report-draft', (el, opts) => { new ReportWriter(el, { XI, opts, last: () => S.lastRun, cite }); return true; });
  await probe();
  await refreshModels();
  if (API.mode === 'on') setInterval(() => { if (!document.hidden) refreshModels(); }, 30000);
  mark('agent', 'ready');
  window.LXAgent = { ask, cite, state: S, open: () => bar.open(), close: () => bar.close() };
}
