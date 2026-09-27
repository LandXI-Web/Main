/* survey-mode.js — 실태조사 모드 S-1 조립(F2-A). 모드 스위치 → 업무 판 → 필지 층 도착(1250 · pitch 0→25) → 대조 스윕 39칸(작업 이벤트)
   → 락온 3(README 대표 사례) → HUD '의심 필지 20,852'(정본 합) → 의심 큐 서랍 → 필지 카드 v2 → 이력 → 조치 → 보고서 초안.
   판독 모드에서도 기관·직원의 필지 클릭은 카드 v2(같은 부품). 게스트(public=1)는 이 파일을 부르지 않는다(survey 요청 0). */
import { E, SV, loadEmd, loadRules, loadLite, probeRoute, routeOn, routeNote, runSurveyJob, onFindingState, stateOf, finding as getFinding, STATE_KO } from './api-survey.js';
import { surveyLayers, reconcileSweep, lockPicks } from './reconcile-sweep.js';
import { findingsDrawer } from './drawer-findings.js';
import { parcelCardV2, planCard, obstacles } from './parcel-card-v2.js';
import { renderSurveyTab, modeSwitch } from './survey-panel.js';
import { setPhase, clearLocks, bboxOf } from '../fx/arrive.js';
import { D } from '../fx/glass.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const SURVEY_CAM = { center: [127.43, 35.432], zoom: 11.0, pitch: 25, bearing: 0 };   // 남원 전역이 화면 폭에 든다(필지 타일 z11 부터)
/** README §4 대표 사례 1–3(R1 A 1위 · R4 A · R5 A) — 락온 대상. 값(점수·주소)은 데이터에서 읽는다 */
const PICKS = ['f_R1_5219045021110530012', 'f_R4_5219025037111100000', 'f_R5_5219038026104780009'];

export function createSurvey(ctx) {
  const { A, hud, $, role } = ctx;
  const S = { mode: 'read', ready: false, swept: false, job: null, sweep: null, rows: [], totals: null, rules: [], filters: { rules: new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']), prio: new Set(['A', 'B', 'C']) }, doneAt: null, pinned: null, prevScrub: null };
  const canWrite = ['agency', 'staff', 'sales'].includes(role);
  let layers = null, drawer = null, card = null, sw = null;

  /** 부팅 때 한 번(기관·직원) — 층(숨김) · 카드 · 서랍 · 스위치 */
  async function setup() {
    const [emd, R] = await Promise.all([loadEmd(), loadRules()]);
    S.rows = emd?.rows || []; S.totals = emd?.totals || null; S.rules = R?.items || []; S.emdVia = SV.via.emd;
    layers = surveyLayers(A, { url: 'pmtiles://' + location.origin + '/landxi/data/survey/namwon-parcel-survey.pmtiles', emd: ctx.emdFeatures });
    // 판독 모드: 필지 조회용 투명 면만(z14+) — 카드 v2 가 PNU 를 찾는다
    A.setLayoutProperty('sv-parcel-hit', 'visibility', 'visible');
    for (const id of ['sv-hl-line', 'sv-hl-halo']) A.setLayoutProperty(id, 'visibility', 'visible');
    drawer = findingsDrawer($('fdrawer'), {
      rows: S.rows, layers, role, canWrite, canExport: !ctx.isPublic && ctx.canExport, ruleName: (r) => S.rules.find((x) => x.id === r)?.name,
      pinned: () => S.pinned,
      onOpen: (f) => openFinding(f), onReport: (q) => ctx.openReport(q), onUrl: (q) => { S.q = q; ctx.writeUrl(); },
      onUnrail: () => card?.close(),
      onFilter: (q) => { if (q.rule.length) layers.setRules(q.rule); else layers.setRules([...S.filters.rules]); if (q.priority.length) layers.setPrio(q.priority); else layers.setPrio([...S.filters.prio]); },
      onOpenChange: (on) => { placeDrawer(); ctx.emit('drawer', { kind: 'findings', open: on }); if (on) { ctx.panel?.setOpen(false); if (card?.isOpen) drawer.setRail(true); } else if (card?.isOpen) setTimeout(() => card.place(), D.d380 + D.d40); },
      onState: (r) => { for (const x of r.ok) ctx.emit('finding', { id: x.f.id, pnu: x.f.pnu, state: x.row.state, saved: x.row.saved }); },
    });
    card = parcelCardV2($('pcard2'), {
      A, layers, stageEl: $('locks'), role, canWrite,
      emdName: (cd) => S.rows.find((r) => r.emd_cd === cd)?.emd, ruleName: (r) => S.rules.find((x) => x.id === r)?.name,
      pnuAt, inAoi: ctx.inAoi, cropEpochs: ctx.cropEpochs, parcelEpochs: ctx.parcelEpochs, waitTiles: ctx.waitTiles,
      onEpoch: (y) => ctx.parcelEpoch(y), scrubTo: (i) => ctx.scrubTo(i), scrubE: () => ctx.scrubE(),
      onTimeline: (on, eps) => ctx.parcelTimeline(on, eps),
      onReport: (q) => ctx.openReport(q), onVoid: (t) => ctx.toast(t),
      onOpen: (d) => { ctx.emit('parcel', { pnu: d.facts.pnu, findings: d.finds.map((f) => f.id) }); ctx.onCard(d); },
      beforePlace: () => { if (drawer.S.open) { drawer.setRail(true); drawer.pin(card.S.pnu); } if (ctx.panel?.S.open) { const pl = planCard({ contentH: 720 }); if (pl.why === 'fallback' || pl.h < 420) ctx.panel.setOpen(false); } },
      onClose: () => { S.pinned = null; layers.highlight(null); drawer.pin(null); if (drawer.S.open) drawer.setRail(false); ctx.onCardClose(); ctx.writeUrl(); },
      onState: (r) => { for (const x of r.ok) ctx.emit('finding', { id: x.f.id, pnu: x.f.pnu, state: x.row.state, saved: x.row.saved }); },
    });
    if (ctx.showSwitch) sw = modeSwitch($('mode-sw'), { mode: 'read', onChange: (m) => (m === 'survey' ? enter() : exit()) });
    // 지도: 의심 필지 호버 → 큐 행 · 막대(삼각)
    let hov = null;
    A.on('mousemove', 'sv-sus-fill', (e) => { if (S.mode !== 'survey') return; const p = e.features?.[0]?.properties?.pnu; if (p && p !== hov) { hov = p; layers.highlight(p); drawer.markPnu(p); } });
    A.on('mouseleave', 'sv-sus-fill', () => { if (!hov) return; hov = null; layers.highlight(S.pinned); drawer.markPnu(null); });
    onFindingState((ev) => { if (S.mode === 'survey') { hud.jobNote?.(`${ev.pnu.slice(-8)} · ${STATE_KO[ev.to]}${ev.row?.saved ? '' : ' · 시연'} · ${ev.via === 'tab' ? '다른 탭' : ev.via === 'stream' ? '실시간' : '방금'}`); } });
    S.ready = true;
    return S;
  }
  /** 서랍 top = HUD 숫자 아래 */
  function placeDrawer() {
    const top = $('hud').querySelector('.xi-hud-big')?.getBoundingClientRect();
    document.documentElement.style.setProperty('--fd-top', Math.round((top?.bottom || 276) + 8) + 'px');
    if (card?.isOpen) card.place();   // HUD 숫자 크기가 바뀌면(서랍 집중 124 ↔ 64) 카드도 다시 잰다 — 숫자 교차 0
  }
  function pnuAt(ll) {
    const q = A.project([ll.lng, ll.lat]);
    const hit = A.getLayer('sv-parcel-hit') && A.getZoom() >= 13.5 ? A.queryRenderedFeatures(q, { layers: ['sv-parcel-hit'] }) : [];
    return hit[0]?.properties?.pnu || null;
  }

  /** 모드 진입 — animate=false 면 복원(스윕 없이 결과 상태로) */
  async function enter({ animate = true, rerun = false } = {}) {
    if (!S.ready) await setup();
    if (S.mode === 'survey' && !rerun) return;
    S.mode = 'survey'; sw?.set('survey');
    document.documentElement.dataset.xmode = 'survey';
    ctx.onMode('survey');
    ctx.emit('mode', { mode: 'survey', survey: 'farmland', deploy: 'dp-nw-farm-25' });
    probeRoute();
    layers.show(true);
    ctx.panelSurvey(renderTab);
    ctx.writeUrl();
    if (!animate) {
      layers.doneAll(S.rows.map((r) => r.emd_cd)); S.swept = true;
      await showResult({ animate: false });
      return;
    }
    // ① 필지 층 도착 — 베일(대조 전) + 카메라 1250 · pitch 0→25
    clearLocks(); ctx.cancelArrive?.();
    layers.reset();
    hud.pending({ scene: '실태조사 · 필지 층', title: '농지이용 실태조사 · dp-nw-farm-25', pending: '연속지적 332,084필지 도착 · 대조 대기' });
    setPhase('survey-enter');
    await ctx.flyTo(SURVEY_CAM, D.d1250);   // 필지 층 도착 1250 · 기울기 25(대조 판)
    const P = S.totals ? E(S.totals.parcels, '필지', 'recorded', 'V-World 연속지적 LP_PA_CBND_BUBUN(수집 2026-09-24)', `${S.rows.length} 읍면동 · 749.25 km²`) : null;
    if (P) hud.count(P, { scene: '실태조사 · 필지 층 도착', title: '연속지적 × AI 판독 · 대조 전', unit: '필지', provLabel: '대장', done: '대조 대기' }, ['읍면동 39 · 베일 = 대조 전', '규칙 R1–R6 · <b data-basis="estimate">추정</b> 임계'], { waitNote: false });
    setPhase('survey-arrived-parcels');
    await runSweep();
  }
  /** 대조 스윕 — on: POST /jobs kind:'survey' + SSE · 경로 없으면 리플레이(녹음 · 합성) · 이벤트 없이 진행 0 */
  async function runSweep() {
    S.sweep?.close(); S.job?.close();
    layers.reset(); clearLocks();
    const host = $('sv-sweeps');
    S.sweep = reconcileSweep({ A, layers, host, hud, rows: S.rows, onDone: (x) => showResult({ animate: true, sweep: x }) });
    ctx.emit('job', { kind: 'survey', phase: 'submit' });
    hud.jobState(API_TEXT(), { live: routeOn() });
    S.job = await runSurveyJob({
      onSubmitted: (j) => { if (j?.id) { S.jobId = j.id; ctx.onSurveyJob(j); hud.jobState(`대조 작업 접수 · ${String(j.id).slice(-6)} · ${j.pool || 'cpu'} · 읍면동 ${j.shards_total || 39}칸`, { live: true }); } },
      onEvent: (name, d, meta) => { S.sweep.on(name, d, meta); if (name === 'job.done') ctx.emit('job', { kind: 'survey', phase: 'done', job_id: d.job_id }); },
    });
    ctx.masthead(S.job.live ? '' : S.job.recorded ? '기록 · 대조 녹음 재생' : `시연 · 저장 결과 재생(${routeNote() || '서버 없음'})`);
  }
  const API_TEXT = () => (routeOn() ? '대조 작업 제출 · SSE 연결' : `시연 · 저장 결과 재생 · ${routeNote()}`);
  /** 결과: 락온 3 + HUD '의심 필지 n'(정본 합) + 부제 */
  async function showResult({ animate = true, sweep = null } = {}) {
    S.swept = true; S.doneAt = Date.now(); drawer.setDoneAt(S.doneAt);
    const T = S.totals; if (!T) { hud.voidNote('정본 합 없음 · findings-emd.json'); return; }
    const src = S.emdVia?.startsWith('F2-S') ? '02. 데이터/survey/findings-emd.json(F2-S 정본)' : 'findings-emd.json 39행 합(02. 데이터 사본)';
    const env = E(T.suspect_parcels, '필지', 'inferred', src, `의심 ${T.findings.toLocaleString('ko-KR')}건 · 규칙 R1–R6 · 검수 전 · 현장 확인 전`);
    const L = await loadLite();
    const picks = PICKS.map((id) => L?.byId.get(id)).filter(Boolean).map((f) => {
      const g = layers.parcelGeom(f.pnu, 'suspects');
      return { lng: f.lng, lat: f.lat, bbox: g?.bbox || null, title: f.id, html: `<b>${f.rule} ${f.priority} ${f.score}</b>${esc(f.emd)} ${esc(f.ri)} ${esc(f.jibun)}` };
    });
    if (animate && picks.length) {
      // 대조가 끝나면 대표 3필지를 비어 있는 화면(패널 오른쪽 · HUD 왼쪽)에 모아 1250 으로 다가간다 → 락온
      const bb = picks.reduce((b, p) => [Math.min(b[0], p.lng), Math.min(b[1], p.lat), Math.max(b[2], p.lng), Math.max(b[3], p.lat)], [180, 90, -180, -90]);
      const panelOpen = document.getElementById('panel')?.dataset.open === '1';
      const cam = A.cameraForBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: { top: 190, bottom: 210, left: panelOpen ? 470 : 170, right: 520 }, maxZoom: 12.4 });
      if (cam) await ctx.flyTo({ center: cam.center, zoom: Math.max(11, cam.zoom), pitch: 25, bearing: 0 }, D.d1000);
      setPhase('survey-lock', { n: picks.length }); S.locks = lockPicks($('locks'), A, picks);
    }
    const mismatch = sweep && sweep.parcels && sweep.parcels !== T.suspect_parcels ? ` · 작업 합 ${sweep.parcels.toLocaleString('ko-KR')} ≠ 정본` : '';
    const note = [`읍면동 ${sweep?.done ?? S.rows.length}/${S.rows.length} 대조`, `규칙 ${S.rules.length || 6}`, '연속지적 2026-09-24', '건축물대장 미대조', '<b data-basis="estimate">추정</b> 초기 임계' + mismatch];
    const head = { scene: '실태조사 · 대조 완료', title: '농지이용 실태조사 · 남원 전역', unit: '필지', provLabel: '의심', done: `대조 완료 ${new Date(S.doneAt).toTimeString().slice(0, 5)}` };
    hud.el.big.parentElement.dataset.label = '의심 필지';
    if (animate) await hud.count(env, { ...head, scene: '의심 필지' }, note);
    else await hud.count(env, { ...head, scene: '의심 필지' }, note, { waitNote: false });
    if (sweep) hud.surveyJob({ done: sweep.done, total: sweep.total, parcels: sweep.parcels || T.suspect_parcels, findings: sweep.findings || T.findings, basis: sweep.basis, final: sweep.jobDone || {} });
    else hud.jobState(`복원 · 대조 결과(정본) · 읍면동 ${S.rows.length}/${S.rows.length}`, { live: null });
    S.hudEnv = env;
    setPhase('survey-result', { value: env.value });
    ctx.onSurveyResult(env);
  }
  function renderTab(body) {
    if (!S.totals) { body.innerHTML = '<p class="cw-void xi-void">실태조사 정본 없음 · findings-emd.json</p>'; return; }
    renderSurveyTab(body, {
      rules: S.rules, totals: S.totals, deploy: ctx.deploy(), filters: S.filters, canRun: canWrite, via: 'findings-emd.json',
      onRule: (r) => { S.filters.rules.has(r) ? S.filters.rules.delete(r) : S.filters.rules.add(r); layers.setRules([...S.filters.rules]); renderTab(body); },
      onPrio: (p) => { S.filters.prio.has(p) ? S.filters.prio.delete(p) : S.filters.prio.add(p); layers.setPrio([...S.filters.prio]); renderTab(body); },
      onQueue: () => openQueue({ rule: [...S.filters.rules].length === 6 ? [] : [...S.filters.rules], priority: [...S.filters.prio].length === 3 ? [] : [...S.filters.prio] }),
      onRerun: () => enter({ rerun: true }),
    });
  }
  async function openQueue(q = {}) {
    if (S.mode !== 'survey') await enter({ animate: false });
    placeDrawer();
    await drawer.open(q);
  }
  /** 카드가 설 자리(계획) + 화면 장애물 — 필지를 이 밖의 가장 넓은 빈 곳에 둔다 */
  function avoidFor() {
    const mode = drawer?.S.open ? 'rail' : null, plan = planCard({ contentH: 720, drawer: mode });
    return [{ name: 'card', l: plan.x - 8, t: plan.y - 8, r: plan.x + 568, b: plan.y + plan.h + 8 }, ...obstacles({ drawer: mode })];
  }
  /** 행/인용 → 카메라 1600 z17(카드가 가리지 않게 왼쪽 빈 곳) → 카드 v2 */
  async function openFinding(f) {
    S.pinned = f.pnu; layers.highlight(f.pnu);
    ctx.emit('finding', { id: f.id, pnu: f.pnu, state: stateOf(f), open: true });
    // 카드가 설 자리를 먼저 계산(서랍은 레일로 접힘) → 필지를 그 밖 가장 넓은 빈 곳에 둔다
    if (drawer.S.open) { drawer.setRail(true); drawer.pin(f.pnu); }
    await ctx.flyToParcel([f.lng, f.lat], { avoid: avoidFor() });
    await openCard({ pnu: f.pnu, source: `${f.rule} ${f.priority} · 큐` });
    ctx.writeUrl({ finding: f.id });
  }
  async function openCard(o) {
    if (!S.ready) await setup();
    const d = await card.open(o);
    if (d) { S.pinned = d.facts.pnu; ctx.writeUrl(); }
    return d;
  }
  async function exit() {
    if (S.mode !== 'survey') return;
    S.mode = 'read'; sw?.set('read'); delete document.documentElement.dataset.xmode;
    S.sweep?.close(); S.job?.close();
    drawer.close(); card.close(); clearLocks();
    layers.show(false); A.setLayoutProperty('sv-parcel-hit', 'visibility', 'visible'); for (const id of ['sv-hl-line', 'sv-hl-halo']) A.setLayoutProperty(id, 'visibility', 'visible');
    ctx.onMode('read'); ctx.emit('mode', { mode: 'read' });
    ctx.masthead(null);
    ctx.writeUrl();
  }
  /** URL 복원: ?mode=survey&rule=&priority=&emd=&state=&finding=&pnu= */
  async function restore(Q) {
    await enter({ animate: false });
    const rule = (Q.get('rule') || '').split(',').filter(Boolean), priority = (Q.get('priority') || '').split(',').filter(Boolean), emd = Q.get('emd') || '', st = (Q.get('state') || '').split(',').filter(Boolean);
    if (rule.length || priority.length || emd || st.length || Q.get('queue') === '1') await openQueue({ rule, priority, emd_cd: emd, state: st });
    const fid = Q.get('finding'), pnu = Q.get('pnu');
    if (fid) { const f = await getFinding(fid); if (f) await openFinding(f); }
    else if (pnu) { const L = await loadLite(); const f = L?.byPnu.get(pnu)?.[0]; if (f) await openFinding(f); else { await ctx.flyToPnu?.(pnu); await openCard({ pnu }); } }
  }
  /** 판독 모드 필지 클릭(기관·직원) → 카드 v2 */
  async function parcelAt(ll, source) {
    if (!S.ready) await setup();
    const pnu = pnuAt(ll);
    if (!pnu) return false;
    await openCard({ pnu, lngLat: ll, source });
    return true;
  }
  return {
    S, setup, enter, exit, restore, runSweep, openQueue, openFinding, openCard, parcelAt, pnuAt,
    get layers() { return layers; }, get drawer() { return drawer; }, get card() { return card; },
    urlState() {
      if (S.mode !== 'survey') return {};
      const q = drawer?.S.open ? drawer.S.q : null;
      return { mode: 'survey', survey: 'farmland', rule: q?.rule?.join(',') || '', priority: q?.priority?.join(',') || '', emd: q?.emd_cd || '', state: q?.state?.join(',') || '', queue: drawer?.S.open ? '1' : '', pnu: card?.S.open ? card.S.pnu : '' };
    },
    placeDrawer, avoidFor,
  };
}
