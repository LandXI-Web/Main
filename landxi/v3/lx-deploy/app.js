/* lx-deploy — ⑤ 배포·이식 + ⑥ 운영·신고(명세 §2.7). "어느 기관에 깔렸고, 잘 돌고 있는가?"
   부품: K1 셸 · K2 관문 · K3 무대 · K4 지역 · K5 서랍 · K6 큰 숫자 · K8 세로 스텝퍼 · K9 빈 상태 · K12 표 · K13 토스트 · K14 개발자 서랍.
   지역은 변수: URL ?deploy= · ?region= · ?card= · ?tab=ops, 없으면 배포 기록 중 가장 급한 곳(이식 요청 → 시범 → 운영). */
import { ALLOW, shell, gate, createStage, regionPicker, drawer, bignum, numHtml, stepper, empty, table, toast, devDrawer, devlog, h, esc } from '../kit/index.js';
import { api, sse } from '../../shared/api-v1.js';
import { projectRail, attachProject } from '../lx-project/context.js';   // 프로젝트 맥락(?project= · 구현 2차 T1)
import { staffMenu } from '../kit/lx-menu.js';
import { D, load, setScope, scoped, reloadDeploys, regions, deployOf, regionKey, regionShort, workName, cardOf, STAGE_CHIP, stageKind, aoiBox, isDomestic,
  imageryIn, linkedModel, modelFor, sampleBox, boxPoly, health, reportsOf, reportsEnv, retrainEnv, retrainMap, loadHealth, hasOp } from './data.js';

const V3 = '/landxi/v3/';
const Q = new URLSearchParams(location.search);
const mobile = () => matchMedia('(max-width: 640px)').matches;
const gsd = (m) => (m >= 1 ? `${+m.toFixed(1)}m` : `${+(m * 100).toFixed(m < 0.1 ? 1 : 0)}cm`);
const ymd = (s) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}${m[3] ? '.' + m[3] : ''}` : '—'; };

const who = await gate('lx-deploy');
/* 메뉴 — 왼쪽 메뉴 = LX 직원 메뉴(kit/lx-menu.js · 10차 메뉴-1 ⓐ · J-1) — 프로젝트 맥락(?project=)이면 '프로젝트'에 불 + 마스트 아래 단계 막대(lx-project/context.js).
   이 화면 = 프로젝트 단계 '서비스 관리'(화면은 그대로 · 배포 탭 = 다른 지역에 적용). 프로젝트 밖에서는 메뉴 '서비스 카드'(우리가 만든 서비스 · 적용 지역). */
const PR = projectRail('ops');
const S = shell({ who, home: 'lx-deploy', rail: PR || staffMenu('projects') });   // 서비스 공개 = 프로젝트 마지막 단계(서비스카드-1 ⓐ)
const PROJ = PR ? attachProject(S, PR, 'ops') : null;

/* ── 판: 지도 무대 + 윗줄(탭 · 심기) + 범례 + 운영 판 ─────────── */
const root = h('div.dp');
const stageEl = h('div.dp-stage');
const tabs = h('div.dp-tabs', { role: 'tablist', 'aria-label': '배포·서비스 관리' },
  h('button.dp-tab', { type: 'button', role: 'tab', id: 'tab-deploy', 'aria-selected': 'true', text: '배포' }),
  h('button.dp-tab', { type: 'button', role: 'tab', id: 'tab-ops', 'aria-selected': 'false', text: '서비스 관리' }));
const plantBtn = h('button.t-btn.dp-plant', { type: 'button', 'aria-label': '기관에 공유', html: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span>기관에 공유</span>' });
const top = h('div.dp-top', {}, tabs, h('span.sp'), plantBtn);
const legend = h('div.dp-legend', { 'aria-hidden': 'true' }, h('span', {}, h('i'), '운영'), h('span', {}, h('i', { dataset: { s: 'pilot' } }), '시범'), h('span', {}, h('i', { dataset: { s: 'draft' } }), '적용 요청'));
const opsEl = h('section.dp-ops', { hidden: true, role: 'tabpanel', 'aria-labelledby': 'tab-ops' });
root.append(stageEl, top, legend, opsEl);
S.main.append(root);
document.addEventListener('kit:drawer', (e) => root.classList.toggle('has-drawer', e.detail.open > 0));

const st = createStage(stageEl);
devDrawer({ stage: st, who });
const isAdmin = who.me?.role === 'admin';
/* 기관 포털 미리보기 — 관문이 LX 세션의 gov-fusion 읽기(?preview=)를 허용할 때만(아니면 정문으로 튕기는 죽은 링크) */
const canPreview = (ALLOW['gov-fusion'] || []).includes(who.key);

/* 프로젝트 안(J-1) — 그 프로젝트의 서비스(카드) 배포본만 · 큰 숫자(재학습 필요)도 그 범위 · 프로젝트 밖(메뉴 '서비스 카드')은 전체 */
if (PROJ) setScope((await PROJ)?.card || null);
await load();
S.fresh(D.asOf);

/* ── 지도 점(지역별) ──────────────────────────────── */
const PINS = new Map();
let selected = null, drw = null, cur = 'deploy';

function drawPins({ fresh } = {}) {
  for (const p of PINS.values()) p.marker.remove();
  PINS.clear();
  for (const r of regions()) {
    const el = h('div.dp-pin', { dataset: { stage: r.stage, key: r.key }, 'aria-hidden': 'true' }, h('i'), h('span', {}, r.name, r.list.length > 1 ? h('b', { text: r.list.length }) : null));
    if (fresh && r.list.some((d) => d.id === fresh)) el.classList.add('is-new');
    el.addEventListener('click', (e) => { e.stopPropagation(); select(r.list[0].id); });
    const marker = new window.maplibregl.Marker({ element: el, anchor: 'left', offset: [-9, 0] }).setLngLat(r.center).addTo(st.map);   // 점(18px) 가운데 = 지역 자리
    PINS.set(r.key, { el, marker, r });
  }
  markPin();
}
const markPin = () => { for (const [k, p] of PINS) p.el.classList.toggle('is-on', !!selected && regionKey(selected) === k); declutter(); };
/* 이름표 겹침 정리 — 선택 → 운영 → 시범 → 적용 요청 → 배포본 많은 곳 순으로 놓고, 먼저 놓인 이름표 · 다른 점과 겹치는 이름표는 감춘다
   (점은 그대로 · 감춘 이름은 점에 마우스를 올리면 보인다). 지도를 옮기고 확대할 때마다 다시 */
const PIN_RANK = { ga: 0, pilot: 1, draft: 2 };
function declutter() {
  const list = [...PINS.values()];
  for (const p of list) p.el.classList.remove('no-lab');
  const box = (r, m = 0) => ({ l: r.left - m, r: r.right + m, t: r.top - m, b: r.bottom + m });
  const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  const dots = new Map(list.map((p) => [p, box(p.el.querySelector('i').getBoundingClientRect())]));
  const on = (p) => p.el.classList.contains('is-on');
  const kept = [];
  for (const p of list.slice().sort((a, b) => (on(b) - on(a)) || (PIN_RANK[a.r.stage] ?? 9) - (PIN_RANK[b.r.stage] ?? 9) || b.r.list.length - a.r.list.length)) {
    const lab = box(p.el.querySelector('span').getBoundingClientRect(), 3);
    if (kept.some((k) => hit(k, lab)) || list.some((o) => o !== p && hit(dots.get(o), lab))) { p.el.classList.add('no-lab'); continue; }
    kept.push(lab);
  }
}
await st.ready;
drawPins();
st.map.on('moveend', declutter);
addEventListener('resize', () => requestAnimationFrame(declutter));

function padFor(open) {
  if (mobile()) st.pad({ bottom: open ? Math.round(innerHeight * 0.62) : 72, top: 72 });
  else st.pad({ right: open ? 392 + 48 : 64, left: 64, top: 96 });
}

/* ── ⑤ 배포·이식: 배포본 1 → 6단 점검 서랍 ────────────────────── */
async function select(id, { fromPlant = false } = {}) {
  const d = deployOf(id);
  if (!d) return;
  selected = d; markPin();
  const u = new URL(location.href); u.searchParams.set('deploy', id); u.searchParams.delete('region'); history.replaceState(null, '', u);
  if (d.aoi) st.geo('focus', { type: 'Feature', properties: {}, geometry: d.aoi }, 'focus');
  padFor(true);
  const b = aoiBox(d);
  if (b) st.go(b, { maxZoom: 11.5 });
  const title = `${regionShort(d)} · ${workName(d.card_id)}`;
  if (drw && drw.el.isConnected && drw.el.dataset.slot === 'right' && drw.kind === 'deploy') drw.title(title);
  else { drw = drawer({ title, host: document.body, slot: 'right', onClose: () => { selected = null; markPin(); padFor(false); st.clear('focus'); } }); drw.kind = 'deploy'; }
  const body = h('div.dp-body');
  const load9 = h('div'); empty(load9, { kind: 'loading', compact: true });
  body.append(load9);
  drw.set(body);
  await renderChecks(d, body, { fromPlant });
}

/** 6단 점검 — 됨 · 할 일 · 대기 + 단마다 다음 행동 1(실제 쓰기가 되는 것만 버튼 · 아니면 한 줄) */
async function checks(d) {
  await loadHealth();
  const [lin, fin] = await Promise.allSettled([api('/registry/lineage/' + encodeURIComponent(d.id)), api(`/survey/findings?deploy_id=${encodeURIComponent(d.id)}&limit=1`)]);
  const lineage = lin.status === 'fulfilled' ? lin.value : null;
  const total = fin.status === 'fulfilled' ? fin.value.total : null;
  const imgs = imageryIn(d), fine = imgs.filter((i) => i.gsd_m <= 0.5);
  const model = linkedModel(d, lineage);
  const pair = modelFor(d, fine.length ? fine : imgs);
  const jobsDone = D.jobs.filter((j) => j.deploy_id === d.id && j.state === 'done').length;
  const draft0 = d.stage === 'draft';
  const found = draft0 ? 0 : total?.value || 0;          // 의심 목록은 기관 단위 — 이식 요청(draft)엔 아직 이 배포본의 결과가 없다
  const hasRes = !draft0 && !!d.snapshot_current;
  const mods = (d.modules?.core?.length || 0) + Object.values(d.modules?.ext || {}).filter(Boolean).length;
  const reps = reportsOf(d);
  const rpt = reportsEnv(d);   // 기관 신고(summary · 서비스 관리 표와 같은 값)
  const due = !draft0 && retrainMap().has(d.id);
  const draft = d.stage === 'draft';
  const pending = (d.approvals || []).some((a) => !a.decision || a.decision === 'pending');
  /* 적용 요청이 반려됐으면 사유를 보인다(요청한 사람의 화면 — impl-1 · 결재함 반려 사유 필수) */
  const rej = !pending ? [...(d.approvals || [])].filter((a) => a.action === 'port').pop() : null;
  const rejected = rej?.decision === 'reject';
  const canModel = await hasOp('post', `/deploys/${d.id}/model`);
  const canApprove = false;   // POST /approvals 는 한도 변경 전용 — 심기 결재 행은 POST /deploys(S-7)가 만든다
  const reg = encodeURIComponent(regionKey(d));
  const q = `?region=${reg}&deploy=${encodeURIComponent(d.id)}`;
  /* 한 흐름(서버 flow): 결재 → 영상 → AI 분석 → 실태조사 → 결과. 서버 판정이 있으면 그것이 정본(영상 유무·진행 상태) */
  const F = d.flow || null;
  /* AI 분석은 끝났는데 실태조사를 아직 잇지 않은 서비스(서버 survey_next) — 화면에서 바로 잇는다(명령줄 0) */
  const surveyAct = F?.survey_next ? { label: '실태조사 이어 하기', run: (btn) => retryFlow(d, btn), primary: true } : null;
  const run = F && ['starting', 'analyzing', 'surveying'].includes(F.state);
  /* 서비스 모델과 영상 해상도가 맞지 않음(서버 판정) — 다른 모델로 바꾸지 않고 맞는 영상을 기다린다 */
  const mism = F?.reason === 'model_mismatch';
  const imgOk = mism ? false : F ? F.has_imagery || fine.length > 0 : fine.length > 0;
  /* 분석에 실제로 쓴 모델(서버 흐름 기록 한 출처 · 관리자 화면과 같은 모델) — 없으면 계보 */
  const ran = F?.model && (F.model.name || F.model.classes?.length) ? F.model : null;
  const mLine = (m) => m.name || (m.classes || []).slice(0, 3).join(' · ');
  const bad = F?.model_ok === false;

  return [
    { t: '데이터 올리기', href: V3 + 'lx-ingest/' + q, s: imgOk ? 'ok' : 'todo',
      line: mism ? '맞는 영상 등록 필요'
        : F && F.has_imagery ? `${F.imagery?.year ? F.imagery.year + '년 ' : ''}${F.imagery?.gsd_m ? gsd(F.imagery.gsd_m) + ' ' : ''}영상${F.imagery?.partial ? ' · 일부 지역' : ''}`
        : fine.length ? `영상 ${fine.length}벌 · 최고 ${gsd(fine[0].gsd_m)}` : F ? '영상 등록 필요' : imgs.length ? `${gsd(imgs[0].gsd_m)} 영상만 있음` : '고해상도 영상 없음',
      act: imgOk ? null : mism ? { note: F.note || '모델 해상도에 맞는 영상이 등록되면 AI 분석이 이어집니다' } : { label: '영상 등록', href: V3 + 'lx-ingest/' + q } },
    ran ? { t: '학습', href: V3 + 'lx-train/' + q, s: bad ? 'todo' : 'ok',
      line: bad ? `서비스 모델로 분석하지 않음 · 분석 모델 ${mLine(ran)}` : mLine(ran) + (ran.substitute ? ' · 영상 해상도에 맞춘 모델' : ''),
      act: bad ? { note: F.note } : null }
    : { t: '학습', href: V3 + 'lx-train/' + q, s: model ? 'ok' : 'todo',
      line: model ? (model.name || (model.classes || []).slice(0, 3).join(' · ')) : '연결된 모델 없음',
      act: model ? null : pair && isAdmin && canModel ? { label: '모델 연결', run: () => connectModel(d, pair.model) }
        : { note: pair ? '모델 연결은 관리자 승인으로 합니다' : '영상이 들어오면 연결합니다' } },
    { t: '서비스 만들기', href: V3 + 'lx-console/' + q, s: d.card_version_id ? 'ok' : 'todo',
      line: d.card_version_id ? `서비스 카드 ${d.version || ''} · 기능 ${mods}개` : '카드 버전 없음', act: null },
    bad ? { t: '결과 확인', href: V3 + 'lx-review/' + q, s: 'todo', line: '서비스 모델로 낸 결과 없음', act: null }
    : F && F.state !== 'approval' && F.state !== 'rejected' && !(F.state === 'done' && (found || jobsDone))
      ? { t: '결과 확인', href: V3 + 'lx-review/' + q, s: F.state === 'done' ? 'ok' : run ? 'wait' : 'todo',
          line: F.label, act: surveyAct || F.state === 'failed' ? surveyAct || { label: '다시 실행', run: (btn) => retryFlow(d, btn), primary: true }
            : F.state === 'need_imagery' ? { note: '영상이 등록되면 AI 분석이 이어집니다' } : null }
      : { t: '결과 확인', href: V3 + 'lx-review/' + q, s: found || jobsDone || hasRes ? 'ok' : 'todo',
      line: jobsDone ? `분석 ${jobsDone}회 완료` : found ? `의심 ${numHtml(total, { unit: '건' })}` : hasRes ? '결과 반영' : '첫 분석 전', html: !jobsDone && !!found,
      act: surveyAct || (found || jobsDone || hasRes ? null : F ? { note: '승인이 끝나면 AI 분석이 이어집니다' } : pair ? { label: '첫 분석 실행', run: (btn, row) => firstRun(d, pair, btn, row), primary: true } : { note: '영상과 모델이 갖춰지면 분석합니다' }) },
    { t: '배포', href: null, s: draft ? 'wait' : 'ok',
      line: draft ? (pending ? '승인 대기' : rejected ? `거절 · 사유: ${rej.reason || '—'}` : F?.state === 'need_imagery' ? '승인 완료 · 영상 등록 필요' : '관리자 승인 요청 전') : STAGE_CHIP[d.stage],
      act: draft && !pending && !rejected && !(F && F.state !== 'approval') ? canApprove ? { label: '승인 요청', run: () => askApproval(d) } : { note: 'LX 관리자 화면 승인 요청함에서 승인합니다' } : null },
    { t: '서비스 관리', href: null, tab: 'ops', s: draft ? 'wait' : due ? 'todo' : 'ok',
      line: draft ? '배포 뒤 시작' : rpt !== undefined ? (rpt?.value ? `기관 신고 ${rpt.value}건${due ? ' · 재학습' : ''}` : due ? '재학습' : '신고 없음')
        : reps.length ? `오탐 신고 ${reps.length}건${due ? ' · 재학습' : ''}` : '신고 없음', act: null },
  ];
}

async function renderChecks(d, body, { fromPlant } = {}) {
  let steps;
  try { steps = await checks(d); } catch (e) {
    devlog('checks', e.message); body.innerHTML = '';
    const again = () => { body.innerHTML = ''; empty(body.appendChild(h('div')), { kind: 'loading', compact: true }); renderChecks(d, body, { fromPlant }); };
    empty(body.appendChild(h('div')), { kind: 'error', text: '점검 기록을 불러오지 못했습니다', onRetry: again });
    return;
  }
  if (selected?.id !== d.id) return;
  body.innerHTML = '';
  const same = regions().find((r) => r.key === regionKey(d))?.list.filter((x) => x.id !== d.id) || [];
  const head = h('div.dp-head', {}, h('span.t-chip.dp-chip', { dataset: { stage: stageKind(d.stage) === 'pilot' ? 'pilot' : stageKind(d.stage) }, text: STAGE_CHIP[d.stage] || '' }),
    ...same.slice(0, 4).map((x) => h('a.dp-sib', { href: `?deploy=${encodeURIComponent(x.id)}`, text: workName(x.card_id) + (x.card_id === d.card_id || same.filter((y) => y.card_id === x.card_id).length > 1 ? ` · ${STAGE_CHIP[x.stage] || ''}` : ''), onclick: (e) => { e.preventDefault(); select(x.id); } })));
  const list = h('div.dp-steps');
  body.append(head, list);
  const done = steps.map((s, i) => (s.s === 'ok' ? i : -1)).filter((i) => i >= 0);
  const firstTodo = steps.findIndex((s) => s.s === 'todo');
  stepper(list, steps.map((s) => ({ t: s.t })), { vertical: true, done, current: firstTodo >= 0 ? firstTodo : -1 });
  [...list.querySelectorAll('.t-step')].forEach((row, i) => {
    const s = steps[i];
    row.style.setProperty('--i', fromPlant ? i + 1 : i * 0.5);
    if (s.s === 'todo') row.dataset.todo = '';
    const tx = row.querySelector('.k-step-tx'); tx.innerHTML = '';
    const name = s.href ? h('a', { href: s.href, text: s.t }) : h('a', { href: '#', text: s.t, onclick: (e) => { e.preventDefault(); if (s.tab) tab(s.tab); } });
    tx.append(h('span.dp-sr', {}, name, h('em', { text: s.s === 'ok' ? '됨' : s.s === 'wait' ? '대기' : '할 일' })));
    tx.append(s.html ? h('span.d', { html: s.line }) : h('span.d', { text: s.line }));
    if (s.act?.note) tx.append(h('span.d', { text: s.act.note }));
    else if (s.act?.href) tx.append(h('a.t-btn.t-btn--2.dp-act', { href: s.act.href, text: s.act.label }));
    else if (s.act?.run) { const b = h('button.t-btn.dp-act', { type: 'button', class: s.act.primary ? '' : 't-btn--2', text: s.act.label }); b.addEventListener('click', () => s.act.run(b, tx)); tx.append(b); }
  });
  const left = steps.filter((s) => s.s !== 'ok').length;
  const foot = h('div.dp-foot', {}, h('span.dp-left', {}, '남은 일', h('b', { text: left })),
    canPreview ? h('a.t-btn.t-btn--2', { href: `${V3}gov-fusion/?preview=${encodeURIComponent(d.id)}`, text: '기관 포털 미리보기' }) : null);
  if (fromPlant) foot.style.animationDelay = `calc(7 * var(--stagger))`;
  body.append(foot);
}

/* ── 다음 행동(쓰기) ──────────────────────────────── */
/** 다시 실행 — 서버 한 흐름(영상 → AI 분석 → 실태조사)을 다시 잇는다 */
async function retryFlow(d, btn) {
  btn.disabled = true;
  try { await api(`/deploys/${encodeURIComponent(d.id)}/flow`, { method: 'POST', body: {} }); toast('요청을 보냈습니다'); await reloadDeploys(); select(d.id); }
  catch (e) { devlog('flow', `${e.code || ''} ${e.message}`); toast('요청을 보내지 못했습니다'); btn.disabled = false; }
}
/* 진행 중인 흐름이 보이는 동안 10초마다 다시 읽는다(상태 줄만 바뀐다) */
setInterval(async () => {
  if (!selected || !selected.flow || !['approval', 'starting', 'analyzing', 'surveying', 'need_imagery'].includes(selected.flow.state) || cur !== 'deploy') return;
  if (!drw || !drw.el.isConnected || drw.kind !== 'deploy') return; /* 적용 시트 등 다른 시트가 열려 있으면 건드리지 않는다 */
  const key = (f) => (f ? JSON.stringify([f.state, f.job_id, f.survey_job_id, (f.steps || []).map((s) => s && (s.state || s.s || s.k))]) : '');
  try { const prev = key(selected.flow); await reloadDeploys(); const d = deployOf(selected.id); if (d && key(d.flow) !== prev && drw?.kind === 'deploy') select(d.id); } catch { /* 다음 주기 */ }
}, 10000);
async function connectModel(d, model) {
  try { await api(`/deploys/${encodeURIComponent(d.id)}/model`, { method: 'POST', body: { model_id: model.id } }); toast('요청을 보냈습니다'); await reloadDeploys(); select(d.id); }
  catch (e) { devlog('model', `${e.code || ''} ${e.message}`); toast('요청을 보내지 못했습니다'); }
}
async function askApproval(d) {
  try { await api('/approvals', { method: 'POST', body: { subject_type: 'deploy', subject_id: d.id } }); toast('승인을 요청했습니다'); await reloadDeploys(); select(d.id); }
  catch (e) { devlog('approval', `${e.code || ''} ${e.message}`); toast('요청을 보내지 못했습니다'); }
}
/** 첫 분석 — 게이트웨이 작업 큐로만(표본 1칸 · 전력 규칙은 서버가 판정) */
async function firstRun(d, pair, btn, row) {
  const bb = sampleBox(d, pair.img);
  btn.disabled = true;
  const prog = h('div.t-progress.dp-prog', { role: 'progressbar', 'aria-label': '분석 진행' }, h('i', { style: { width: '6%' } }));
  row.append(prog);
  st.geo('sample', { type: 'Feature', properties: {}, geometry: boxPoly(bb) }, 'focus');
  st.go(bb, { maxZoom: 16.5 });
  let j;
  try {
    j = await api('/jobs', { method: 'POST', body: { kind: 'infer', model_id: pair.model.id, imagery_id: pair.img.id, aoi: boxPoly(bb), deploy_id: d.id, options: { chip: 1024, conf: 0.25, overlap: 0.125 }, label: '배포 첫 분석' } });
  } catch (e) { devlog('job', `${e.code || ''} ${e.message}`); prog.remove(); btn.disabled = false; toast('요청을 보내지 못했습니다'); return; }
  devlog('job', j.job?.id);
  toast('요청을 보냈습니다');
  const bar = prog.firstChild;
  const s = sse(j.events_url.replace(/^\/api\/v1/, ''), {
    on: async (name, e) => {
      if (name === 'job.progress' || name === 'shard.done') { const dn = e?.shards_done ?? 0, tot = e?.shards_total ?? 1; bar.style.width = Math.max(8, (dn / tot) * 100) + '%'; }
      if ((name === 'job.done' || name === 'snapshot.ready') && !s.closed) {
        s.closed = true; s.close(); bar.style.width = '100%';
        const fc = await api(`/results/${j.job.result_set}/features?limit=2000`).catch(() => null);
        if (fc) st.geo('res', fc, 'ai');
        const jj = await api('/jobs?limit=500').catch(() => null); if (jj) D.jobs = jj.items || D.jobs;
        if (selected?.id === d.id) renderChecks(d, drw.body.firstChild || drw.body);
      }
      if (name === 'job.failed' || name === 'job.cancelled') { s.close(); prog.remove(); btn.disabled = false; toast('요청을 보내지 못했습니다'); }
    },
  });
}

/* ── 새 지역에 심기(시트) — 카드 · 지역 · 가져갈 것 · 현지에서 준비할 것 · CI 9키 ── */
const CI = [['name', '기관 명칭', 'text'], ['short', '약칭', 'text'], ['mark', '마크', 'file'], ['color', '상징색', 'color'], ['tint', '연한 바탕', 'color'],
  ['unit_word', '행정단위 말', 'select', ['읍면동', '동', '리', '구']], ['crs', '좌표계', 'select', ['EPSG:5186', 'EPSG:5185', 'EPSG:5187', 'EPSG:5188', 'EPSG:4326']], ['contact', '문의처', 'text'], ['seal', '직인', 'file']];
/* 좌표계는 값(서버 ci.crs)만 코드 · 화면 글은 공무원이 쓰는 이름 */
const CRS_WORD = { 'EPSG:5186': '중부원점', 'EPSG:5185': '서부원점', 'EPSG:5187': '동부원점', 'EPSG:5188': '동해(울릉)원점', 'EPSG:4326': '경위도' };

function fileField(k) {
  const inp = h('input', { name: k, type: 'file', accept: 'image/png,image/svg+xml,image/webp', class: 'dp-file-i' });
  const txt = h('span', { text: '파일 선택' });
  inp.addEventListener('change', () => { txt.textContent = inp.files?.[0]?.name || '파일 선택'; });
  return h('span.t-input.dp-file', {}, inp, txt);
}
/** 색 칸 — 24px 원형 견본 + 값 글자(입력 상자 안). 기본은 비움 · 견본을 누르면 색 고르기 */
function colorField(k) {
  const pick = h('input', { type: 'color', class: 'dp-color-p', tabindex: '-1', 'aria-hidden': 'true', value: '#ffffff' });
  const sw = h('span.dp-sw', { 'aria-hidden': 'true' });
  const txt = h('input', { name: k, type: 'text', class: 'dp-color-t', placeholder: '색 선택', maxlength: '7', autocomplete: 'off', spellcheck: 'false' });
  const paint = () => { const v = /^#[0-9a-f]{6}$/i.test(txt.value.trim()) ? txt.value.trim() : ''; sw.style.background = v || ''; sw.toggleAttribute('data-empty', !v); if (v) pick.value = v; };
  pick.addEventListener('input', () => { txt.value = pick.value.toUpperCase(); paint(); });
  txt.addEventListener('input', paint);
  const box = h('span.t-input.dp-color', {}, h('label.dp-sw-w', {}, sw, pick), txt);
  paint();
  return box;
}

async function openPlant() {
  const src = selected && isDomestic(selected) && selected.stage !== 'draft' ? selected : D.deploys.find((d) => d.stage === 'ga' && isDomestic(d));
  const cards = D.cards.filter((c) => c.scope !== 'global' && (c.versions || []).length && (!scoped() || c.id === Q.get('card')));   // 프로젝트 안 = 그 서비스만
  const pd = drawer({ title: '기관에 공유', slot: 'right', onClose: () => { if (selected) select(selected.id); } }); pd.kind = 'plant';
  drw = pd;
  const cardSel = h('select.t-input', { 'aria-label': '카드' }, ...cards.map((c) => h('option', { value: c.id, text: workName(c.id), selected: c.id === (Q.get('card') && cards.some((x) => x.id === Q.get('card')) ? Q.get('card') : src?.card_id) })));
  const regEl = h('div');
  const bring = h('ul.dp-list'), need = h('ul.dp-list');
  const ci = h('div.dp-ci', {}, ...CI.map(([k, label, type, opt]) => h('label', {}, label,
    type === 'select' ? h('select.t-input', { name: k }, ...opt.map((o) => h('option', { value: o, text: CRS_WORD[o] || o })))
      : type === 'file' ? fileField(k) : type === 'color' ? colorField(k)
        : h('input.t-input', { name: k, type, autocomplete: 'off' }))));
  const go = h('button.t-btn.dp-go', { type: 'submit', text: '공유(승인 요청)', disabled: true });
  /* 적용 전 점검 — 서비스 모델과 그 지역 영상의 해상도(서버 GET /deploy-fit · 결재 요청과 같은 판정). 맞지 않으면 요청하지 않는다 */
  const fitEl = h('p.dp-fit', { role: 'status', 'aria-live': 'polite', hidden: true });
  let fit = null, fitSeq = 0;
  /* 이전 계약(S-7 전)은 이식 생성이 관리자 전용 — 직원 세션이면 거절될 요청을 보내지 않고 한 줄로 안내(죽은 버튼 0) */
  const canPlant = isAdmin || D.health === 'server';
  if (!canPlant) go.hidden = true;
  const form = h('form.dp-form', {},
    canPlant ? null : h('p.dp-note', { text: '관리자 승인 권한으로 기관에 공유할 수 있습니다' }),
    h('div.dp-f', {}, h('span.t-label', { text: '카드' }), cardSel),
    h('div.dp-f', {}, h('span.t-label', { text: '지역' }), regEl, fitEl),
    h('div.dp-f', {}, h('span.t-label', { text: '가져갈 것' }), bring),
    h('div.dp-f', {}, h('span.t-label', { text: '현지에서 준비할 것' }), need),
    ci, go);
  pd.set(form);
  if (!canPlant) { form.classList.add('is-locked'); for (const el of form.querySelectorAll('input,select,button')) el.disabled = true; }
  let region = null;
  padFor(true); st.home();

  const srcOf = () => D.deploys.find((d) => d.card_id === cardSel.value && d.stage === 'ga') || D.deploys.find((d) => d.card_id === cardSel.value && d.stage !== 'draft') || null;
  const draw = () => {
    const c = cardOf(cardSel.value), s = srcOf();
    const on = s ? (s.modules?.core?.length || 0) + Object.values(s.modules?.ext || {}).filter(Boolean).length : (c?.modules?.core?.length || 0) + Object.values(c?.modules?.ext || {}).filter(Boolean).length;
    const ver = (s?.version) || (c?.versions?.slice(-1)[0] || '').replace(/^.*@/, 'v');
    bring.innerHTML = '';
    for (const t of [`서비스 카드 ${ver}`, `기능 ${on}개`, s?.model_override ? '탐지 모델' : null, c?.ledger_schema ? '대장 양식' : null, '판정 규칙'].filter(Boolean)) bring.append(h('li', { text: t }));
    need.innerHTML = '';
    const imgOk = fit ? fit.fits === true : region && region.has_imagery != null ? region.has_imagery : region && region.bbox && D.catalog.some((i) => i.role === 'imagery' && i.source === 'pmtiles' && i.gsd_m != null && i.gsd_m <= 0.5 && i.bounds && i.bounds[0] <= region.bbox[2] && i.bounds[2] >= region.bbox[0] && i.bounds[1] <= region.bbox[3] && i.bounds[3] >= region.bbox[1]);
    const imgTxt = fit ? (fit.fits === false ? '맞는 영상 등록 필요' : fit.imagery?.has ? `${fit.imagery.year ? fit.imagery.year + '년 ' : ''}${fit.imagery.gsd_word} 영상` : '영상 등록 필요')
      : region && !imgOk ? '영상 등록 필요' : '고해상도 영상';
    need.append(h('li', { text: imgTxt, ...(imgOk ? { 'data-ok': '' } : { 'data-need': '' }) }), h('li', { 'data-need': '', text: '행정 대장' }), h('li', { 'data-need': '', text: '기관 표지' }));
    go.disabled = !region || !c || (s && regionKey(s) === region.sgg_cd && s.card_id === c.id) || fit?.fits === false || fitEl.dataset.busy === '1';
  };
  /** 서비스 모델 × 지역 영상 — 결과를 한 줄로(맞으면 분석 모델·영상, 안 맞으면 까닭과 할 일) */
  async function checkFit() {
    const my = ++fitSeq;
    fit = null;
    if (!region?.sgg_cd || !cardSel.value) { fitEl.hidden = true; draw(); return; }
    fitEl.hidden = false; fitEl.dataset.lv = ''; fitEl.dataset.busy = '1'; fitEl.textContent = '서비스 모델과 이 지역 영상을 확인하는 중';
    draw();
    const s = srcOf();
    let r = null;
    try { r = await api(`/deploy-fit?region=${encodeURIComponent(region.sgg_cd)}&${s ? 'from_deploy_id=' + encodeURIComponent(s.id) : 'card_id=' + encodeURIComponent(cardSel.value)}`); }
    catch (e) { devlog('fit', `${e.code || ''} ${e.message}`); }
    if (my !== fitSeq) return;
    fitEl.dataset.busy = '';
    fit = r;
    if (!r) { fitEl.textContent = '지금은 확인할 수 없습니다 — 승인 요청 때 다시 확인합니다'; fitEl.dataset.lv = ''; draw(); return; }
    const m = r.model || r.service_model;
    const mw = m ? (m.name || (m.classes || []).slice(0, 3).join(' · ')) : '';
    fitEl.dataset.lv = r.fits === false ? 'warn' : '';
    const cov = r.imagery?.coverage?.value;
    const part = cov != null && cov < 0.95 ? ` — 영상이 있는 곳만 분석합니다(시군구 면적의 약 ${Math.max(1, Math.round(cov * 100))}%)` : '';
    fitEl.textContent = r.fits === false ? r.note
      : r.note || `분석 모델 ${mw}${m?.gsd_word ? ` (${m.gsd_word})` : ''} · 영상 ${r.imagery?.year ? r.imagery.year + '년 ' : ''}${r.imagery?.gsd_word || ''}${part}`;
    draw();
  }
  cardSel.addEventListener('change', () => { draw(); checkFit(); });
  await regionPicker(regEl, {
    onPick: (r) => {
      region = r;
      const f = form.elements;
      f.name.value = r.full || r.name; f.short.value = r.name;
      if (r.bbox) { padFor(true); st.go(r.bbox, { maxZoom: 10.5 }); }
      draw();
      checkFit();
    },
  });
  draw();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!region) return;
    const s = srcOf(), f = form.elements;
    const file = (inp) => inp.files?.[0]?.name || null;          // 서버 ci 는 글자 200자 — 파일 이름만(원본은 기관 표지 반입 때)
    const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : null);
    const ciBody = Object.fromEntries(Object.entries({ name: f.name.value.trim(), short: f.short.value.trim(), mark: file(f.mark), color: hex(f.color.value), tint: hex(f.tint.value),
      unit_word: f.unit_word.value, crs: f.crs.value, contact: f.contact.value.trim(), seal: file(f.seal) }).filter(([, v]) => v));
    /* S-7 본문{from_deploy_id|card_id, region, ci}. 서버가 S-7 전이면(health 없음) 이전 계약 본문{tenant_id, region_profile, aoi}을 함께 */
    const body = { ...(s ? { from_deploy_id: s.id } : { card_id: cardSel.value }), region: region.sgg_cd, ci: ciBody };
    if (D.health !== 'server') {
      const there = (region.deploys || []).map((x) => deployOf(x.id)).find(Boolean);
      const tenant = there?.tenant_id || D.tenants.find((t) => t.profile_id === region.sgg_cd)?.id;
      Object.assign(body, tenant ? { tenant_id: tenant } : {}, { region_profile: there?.region_profile || region.sgg_cd, aoi: there?.aoi || (region.bbox ? boxPoly(region.bbox) : undefined) });
    }
    go.disabled = true;
    try {
      const out = await api('/deploys', { method: 'POST', body });
      devlog('plant', out.id);
      await reloadDeploys();
      drawPins({ fresh: out.id });
      toast('승인을 요청했습니다');
      pd.close(true);
      drw = null;
      select(out.id, { fromPlant: true });
    } catch (err) {
      devlog('plant', `${err.status || ''} ${err.code || ''} ${err.message}`);
      if (err.code === 'model_input_mismatch') { fitEl.hidden = false; fitEl.dataset.lv = 'warn'; fitEl.textContent = err.message; toast('모델과 영상 해상도가 맞지 않아 요청하지 않았습니다'); }
      else if (err.code === 'approval_required') { fitEl.hidden = false; fitEl.dataset.lv = 'warn'; fitEl.textContent = err.message; toast('서비스 공개 승인 뒤에 적용할 수 있습니다'); }
      else toast('요청을 보내지 못했습니다');
      go.disabled = false;
    }
  });
}
plantBtn.addEventListener('click', openPlant);

/* ── ⑥ 운영·신고: 큰 숫자(재학습 필요) + 표 ───────────────────── */
/** 정밀도 칸 — 값이 있으면 lx-review 와 같은 numHtml(0.00 · ~ · 호버 표본 n건). 규칙은 걸렸는데 표본 검수 전이면 '표본 k/100'. 규칙이 없는 업무만 '—' */
const precCell = (v) => {
  if (!v) return '<span class="dp-nop">—</span>';
  if (v.value == null) return `<span class="dp-nop" title="${esc(v.source)}">표본 ${esc(String(v.k))}/100</span>`;
  return `<span title="${esc(v.source)}">${numHtml(v, { unit: '', digits: 2 })}</span>`;
};
async function renderOps() {
  if (!D.healthReady) { opsEl.innerHTML = ''; const c = h('section.t-card.t-card--map.dp-opscard'); empty(c.appendChild(h('div')), { kind: 'loading', compact: true }); opsEl.append(c); void opsEl.offsetWidth; opsEl.classList.add('is-in'); }
  await loadHealth();
  if (cur !== 'ops') return;
  opsEl.innerHTML = '';
  const live = D.deploys.filter((d) => d.stage !== 'draft');
  const due = retrainMap();
  const rows = live.map((d) => ({ d, h: health(d, null, due) }));
  const tcard = h('section.t-card.t-card--map.dp-opscard');
  const big = h('div.dp-big');
  tcard.append(big);
  bignum(big, retrainEnv(), { label: '재학습 필요', unit: '건' });
  opsEl.append(tcard);
  if (!rows.length) { empty(tcard.appendChild(h('div.dp-empty')), { kind: 'first', text: scoped() && !Q.get('card') ? '서비스 카드를 공개하면 여기서 관리합니다' : '이 카드가 깔린 기관이 아직 없습니다' }); return; }
  const rank = { 재학습: 0, '갱신 배포': 1, '표본 확인': 2, 없음: 3 };
  table(tcard.appendChild(h('div')), {
    cols: [
      { key: 'name', label: '배포본', fmt: (_, r) => `<span class="dp-wk">${esc(workName(r.d.card_id))}<small>${esc(regionShort(r.d))}</small></span>` },
      { key: 'precision', label: '정밀도', num: true, fmt: precCell },   // lx-review 와 같은 표기(0.00 · 표본 < 100 이면 ~ · 기록 전이면 표본 수)
      { key: 'reports', label: '기관 신고', num: true, fmt: (v) => numHtml(v, { unit: '건' }) },   // summary reports — 합 = LX 직원 대시보드 '기관 신고'
      { key: 'last', label: '마지막 학습', fmt: (v) => esc(v ? ymd(v) : '—') },
      { key: 'next', label: '다음 행동', fmt: (v) => `<span class="dp-next" data-n="${esc(v)}">${esc(v)}</span>` },
    ],
    rows: rows.map((r) => ({ ...r, name: workName(r.d.card_id), precision: r.h.precision, reports: reportsEnv(r.d) || null, last: r.h.lastTrain, next: r.h.next, rank: rank[r.h.next] ?? 9 }))
      .sort((a, b) => a.rank - b.rank || (b.reports?.value || 0) - (a.reports?.value || 0)),
    onRow: (r) => { tab('deploy'); select(r.d.id); },
  });
  opsEl.classList.add('is-in');
}

/* ── 탭 ──────────────────────────────────────────── */
function tab(which) {
  cur = which;
  const ops = which === 'ops';
  tabs.querySelector('#tab-deploy').setAttribute('aria-selected', String(!ops));
  tabs.querySelector('#tab-ops').setAttribute('aria-selected', String(ops));
  root.classList.toggle('is-ops', ops);
  const u = new URL(location.href);
  if (ops) { u.searchParams.set('tab', 'ops'); u.searchParams.delete('deploy'); u.searchParams.delete('region'); } else u.searchParams.delete('tab');
  history.replaceState(null, '', u);
  if (ops) {
    if (drw) { const d0 = drw; drw = null; d0.close(true); }
    selected = null; markPin(); st.clear('focus');
    opsEl.hidden = false; opsEl.classList.remove('is-in'); renderOps();
    if (mobile()) st.pad({ bottom: 72 }); else st.pad({ left: 760 + 64, right: 64, top: 96 });
    st.home();
  } else {
    opsEl.hidden = true; opsEl.classList.remove('is-in');
    padFor(false); st.home();
  }
}
tabs.addEventListener('click', (e) => { const b = e.target.closest('.dp-tab'); if (b) tab(b.id === 'tab-ops' ? 'ops' : 'deploy'); });
tabs.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const nx = cur === 'ops' ? 'deploy' : 'ops'; tab(nx); tabs.querySelector('#tab-' + nx).focus(); } });

/* 가장 급한 곳 — 심을 준비가 된 이식 요청(카드 버전 있음) 먼저: 지금 결재·점검할 수 있는 것.
   카드 버전 없는 초안은 ③ 조립부터 막혀 있어 그 다음. 같은 급이면 최근 요청 먼저 · 같은 시각이면 서버 순서. 이식 요청이 없으면 시범 → 운영 */
const urgent = () => {
  const dl = D.deploys.map((d, i) => [d, i]).filter(([d]) => d.stage === 'draft')
    .sort((a, b) => (b[0].card_version_id ? 1 : 0) - (a[0].card_version_id ? 1 : 0)
      || String(b[0].updated_at || '').localeCompare(String(a[0].updated_at || '')) || a[1] - b[1]).map(([d]) => d);
  return dl[0] || [...D.deploys].filter(isDomestic).sort((a, b) => ({ pilot: 0, ga: 1 })[stageKind(a.stage)] - ({ pilot: 0, ga: 1 })[stageKind(b.stage)])[0];
};

/* ── 첫 장면: 전국 → (URL 이 가리키는 곳 | 가장 급한 배포본) ─────────── */
const card = Q.get('card');
if (Q.get('tab') === 'ops') tab('ops');
else if (card && !D.deploys.some((d) => d.card_id === card)) {
  const e = drawer({ title: workName(card) || '배포', slot: 'right' });
  const box = h('div'); e.set(box); empty(box, { kind: 'first', text: '이 카드가 깔린 기관이 아직 없습니다', action: { label: '기관에 공유', onClick: openPlant } });
} else {
  const want = Q.get('deploy') && deployOf(Q.get('deploy'))
    || (Q.get('region') && regions().find((r) => r.key === Q.get('region'))?.list[0])
    || (card && D.deploys.find((d) => d.card_id === card))
    || urgent();
  if (want) setTimeout(() => select(want.id), 900);
}
