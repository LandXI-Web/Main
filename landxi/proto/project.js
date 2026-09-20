/* 프로젝트 = LX 의 AI 모델 개발 작업실 — 목록 · 개요 · 데이터 · 라벨링 · 학습 · 분석 · 배포 · 카드 역추적.
   원판  design-canvas/v2/renders/B5-Projects.png · B5-Project-{Create,Create-Review,Overview,Data,Labeling,Train,Analysis,Deploy,Delete}.png
         + B7-Project*.png · B7-Projects-{Empty,NoResult}.png · B7-State-{Loading,Error}.png (B7 이 B5 를 덮는다)
   기록  design-canvas/v2/notes/B7-project-states.md
   역할  LX = 모델 개발 · 학습 · 분석 실행 · 분석 결과 수정/삭제 (docs/superpowers/specs/2026-09-20-platform-roles.md)

   URL 이 상태다(뒤로 가기 동작): ?pid= &tab=overview|data|labeling|train|analysis|deploy
     목록 ?q= &p= &sz= &sel= &seed=empty
     상태 &state=loading|error · 개요 &edit=1 · 데이터 &seg=files|datasets &file= &ds= &dsnew=1 &up=progress|fail
     학습 &tr= &new=1 · 분석 &an= &mode=edit · 배포 &reg=1
   변경은 project-data.js 의 세션 저장 — 새로 고치면 시드로 돌아간다. */
import { mountShell, say, confirmDialog, openModal, mountPager, bindCounters, icon, esc, $, $$ } from './shell.js';
import * as D from './project-data.js';
import { n, demo, guess, fig, kv, st, empty, statePlate, cta, br, link, bone, bars, miss } from './project-ui.js';
import { dataTab, bindData } from './project-files.js';
import { labelTab, bindLabel } from './project-labeling.js';
import { trainTab, bindTrain } from './project-train.js';
import { analysisTab, bindAnalysis } from './project-analysis.js';
import { deployTab, bindDeploy, cardTrace } from './project-deploy.js';

const PAGE = 'ai-project.html';
export const TABS = [['overview', '개요'], ['data', '데이터'], ['labeling', '라벨링'], ['train', '학습'], ['analysis', '분석'], ['deploy', '배포']];

/* ── URL ↔ 상태 ───────────────────────────────────────────────────────────── */
export const S = {};
const one = (q, k, allow, dflt = '') => (allow.includes(q.get(k)) ? q.get(k) : dflt);
function read() {
  const q = new URLSearchParams(location.search);
  Object.assign(S, {
    pid: q.get('pid') || '', tab: one(q, 'tab', TABS.map(([k]) => k), 'overview'),
    q: q.get('q') || '', page: Math.max(1, +q.get('p') || 1), size: [10, 20, 50].includes(+q.get('sz')) ? +q.get('sz') : 10,
    sel: q.get('sel') || '', seed: one(q, 'seed', ['empty']), state: one(q, 'state', ['loading', 'error']),
    edit: q.get('edit') === '1', seg: one(q, 'seg', ['files', 'datasets'], 'files'), file: q.get('file') || '',
    ds: q.get('ds') || '', dsnew: q.get('dsnew') === '1', up: one(q, 'up', ['progress', 'fail']),
    tr: q.get('tr') || '', trnew: q.get('new') === '1', an: q.get('an') || '', mode: one(q, 'mode', ['edit']),
    reg: q.get('reg') === '1', dep: one(q, 'dep', ['request', 'model'], 'request'),
  });
  if (S.pid && !D.detail(S.pid)) S.pid = '';
  if (!S.pid) { S.tab = 'overview'; S.edit = false; S.state = ''; }
}
export function href(patch = {}) {
  const v = { ...S, ...patch }, q = new URLSearchParams();
  if (!v.pid) {
    if (v.q) q.set('q', v.q);
    if (v.page > 1) q.set('p', v.page); if (v.size !== 10) q.set('sz', v.size);
    if (v.sel) q.set('sel', v.sel); if (v.seed) q.set('seed', v.seed);
  } else {
    q.set('pid', v.pid); if (v.tab !== 'overview') q.set('tab', v.tab);
    if (v.state) q.set('state', v.state);
    if (v.tab === 'overview' && v.edit) q.set('edit', '1');
    if (v.tab === 'data') { if (v.seg !== 'files') q.set('seg', v.seg); if (v.file) q.set('file', v.file); if (v.ds) q.set('ds', v.ds); if (v.dsnew) q.set('dsnew', '1'); if (v.up) q.set('up', v.up); }
    if (v.tab === 'labeling' && v.file) q.set('file', v.file);
    if (v.tab === 'train') { if (v.tr) q.set('tr', v.tr); if (v.trnew) q.set('new', '1'); }
    if (v.tab === 'analysis') { if (v.an) q.set('an', v.an); if (v.mode) q.set('mode', v.mode); }
    if (v.tab === 'deploy') { if (v.dep !== 'request') q.set('dep', v.dep); if (v.reg) q.set('reg', '1'); }
  }
  const s = q.toString(); return PAGE + (s ? `?${s}` : '');
}
export function go(patch, { replace = false } = {}) {
  const url = href(patch), cur = PAGE + location.search;
  if (url !== cur) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  read(); render();
}
addEventListener('popstate', () => { read(); render(); });

/* ── 셸 ───────────────────────────────────────────────────────────────────── */
read();
let shell = null, mounted = '';
function chrome() {
  const p = S.pid ? D.detail(S.pid) : null;
  const want = p ? `d:${p.id}:${S.tab}:${S.state}:${S.edit ? 'e' : ''}` : 'list';
  if (mounted === want) return p;
  mounted = want;
  if (!p) {
    shell = mountShell({ active: 'project', title: '프로젝트', subtitle: '', asOf: false, fit: true, keepDocTitle: false,
      crumbs: null, notice: false, headRight: '<p class="mic" id="pj-count"></p>' });
  } else {
    const tabs = TABS.map(([k, label]) => ({ key: k, label, href: href({ pid: p.id, tab: k, edit: false, state: '', file: '', ds: '', dsnew: false, up: '', tr: '', trnew: false, an: '', mode: '', reg: false }).replace(PAGE, PAGE), count: tabCount(p, k) }));
    shell = mountShell({ active: 'project', title: p.name, titleRule: 0, asOf: false, fit: true,
      crumbIcon: 'chevR', crumbs: [{ label: '프로젝트 목록', href: PAGE }, { label: p.name }],
      subtitle: headSub(p), tabs, tab: S.tab, tabStyle: 'line', headRight: headActs(p) });
    $('#page-head')?.setAttribute('data-pj', '');
  }
  return p;
}
function tabCount(p, k) {
  if (S.state) return '';
  const c = { data: p.files.length, labeling: p.nLabel, train: p.nTrain, deploy: p.nDeploy }[k];
  return c ? String(c) : '';
}
function headSub(p) {
  if (S.state === 'loading') return '<span style="color:var(--accent)">불러오는 중</span>';
  if (S.state === 'error') return '<span class="st st--warn">불러오기 실패</span>';
  if (S.edit) return '<span style="color:var(--accent)">수정 중</span>';
  const t = D.lastTrain(p.id);
  const head = t ? `<span class="st st--acc">학습 완료</span>${t.iou != null ? ` · <span class="n">IoU ${t.iou.toFixed(2)}</span>` : ''}` : '<span class="st st--dim">학습 결과 없음</span>';
  if (S.tab !== 'overview') return head;
  const todo = p.nLabel ? `라벨링 ${p.nLabel}/${p.files.length}` : `데이터 ${p.files.length ? '라벨링 시작' : '파일 추가'}`;
  return `${head} <span class="dim">· 다음 할 일 = ${esc(todo)}</span>`;
}
function headActs(p) {
  if (S.state || S.edit) return '';
  const next = p.nLabel ? ['라벨링 이어하기', 'go-label'] : p.files.length ? ['라벨링 시작', 'go-label'] : ['파일 추가', 'go-files'];
  const t = (label, act) => `<button type="button" class="link link--ink" data-act="${act}">${esc(label)}</button>`;
  return `<span class="pj-acts">${t('수정', 'edit')}${t('구성원 초대', 'invite')}${t('삭제', 'del')}${cta(next[0], next[1])}</span>`;
}

/* ── 그리기 ───────────────────────────────────────────────────────────────── */
export function render() {
  const p = chrome();
  const main = $('#main');
  $$('#main > :not(#page-head)').forEach((e) => e.remove());
  // 렌더마다 새 그릇을 만든다 — 위임 리스너가 그릇과 함께 사라져 두 번 걸리지 않는다.
  main.insertAdjacentHTML('beforeend', `<div id="pj-root">${p ? detailView(p) : listView()}</div>`);
  if (p) bindDetail(p); else bindList();
  window.scrollTo?.(0, 0);
}

/* ══ 1. 목록 ═══════════════════════════════════════════════════════════════ */
function projects() {
  if (S.seed === 'empty') return [];
  const all = D.list();
  const q = S.q.trim().toLowerCase();
  return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
}
function listView() {
  const all = S.seed === 'empty' ? [] : D.list(), rows = projects();
  const from = (S.page - 1) * S.size, page = rows.slice(from, from + S.size);
  const sel = rows.find((p) => p.id === S.sel) || page[0] || null;
  const zero = !all.length, none = !zero && !rows.length;
  return `<div class="split" style="--l:776fr;--r:440fr">
  <section class="split-l" aria-label="프로젝트 목록">
    <form class="pj-bar" role="search" id="pj-search">
      <label class="inp-ic">${icon('search')}<input class="inp inp--s" id="pj-q" name="q" placeholder="프로젝트명" aria-label="프로젝트명" value="${esc(S.q)}" autocomplete="off">${S.q ? '<button type="button" class="x" id="pj-qx" aria-label="검색어 지우기">' + icon('x', 14) + '</button>' : ''}</label>
      <button type="reset" class="link link--ink" id="pj-reset">초기화</button><button type="submit" class="link link--ink">검색</button>
      <nav id="pj-pager"></nav><span class="sp"></span>${cta('프로젝트 만들기', 'create')}</form>
    <div class="panel-b" style="padding-top:0">
      ${zero ? emptyState() : none ? noResult(all) : `<div class="pj-cards">${page.map((p) => card(p, p.id === (sel && sel.id))).join('')}</div>`}
    </div>
  </section>
  <aside class="split-r panel" aria-label="프로젝트 조회">
    <header class="panel-h"><h2>프로젝트 조회</h2><span class="sp"></span><span class="mic n">${rows.length ? (sel ? 1 : 0) : 0} / ${all.length} 선택</span></header>
    <div class="panel-b">${zero ? newPlan() : sel ? peek(sel) : peekNone(all.length)}</div>
    ${sel && !zero ? `<footer class="panel-f"><span class="mic">${esc(TABS.map(([, l]) => l).join(' · '))}</span>${link('열기 ›', 'open')}${link('수정', 'edit')}${link('삭제', 'del')}</footer>` : ''}
  </aside></div>`;
}
function card(p, on) {
  const cls = [p.classes.length, `${p.sizeMB} MB`].join(' · ');
  return `<button type="button" class="pj-card" data-pid="${esc(p.id)}" aria-selected="${!!on}">
    ${fig(p.thumb, `${p.name} 대표 이미지`, '', {})}
    <span class="pj-card-t"><span>${esc(p.name)}</span>${p.inferredModel ? guess() : ''}${p.added ? demo() : ''}</span>
    <span class="pj-card-s">${esc(p.taskLabel)} · 클래스 ${cls}</span>
    <span class="pj-card-s">학습 완료 · <span class="n">${esc(p.trainedAt)}</span></span></button>`;
}
function emptyState() {
  const steps = [['데이터', '정사영상 · 데이터셋'], ['라벨링', '클래스 · 도형'], ['학습', '워크플로우 · 곡선'], ['분석', '결과 폴리곤'], ['배포', '모델 등록 · 카드 발행']];
  const shots = [...D.CLEAN.fl, ...D.MARK.gh, ...D.CLEAN.je];
  return `<div class="pj-note"><div><h2>프로젝트가 없어요</h2>
      <p>정사영상을 불러와 라벨링 · 학습 · 분석 · 배포까지 한 프로젝트로</p>
      <p class="acts">${link('프로젝트 만들기 ›', 'create')}</p></div></div>
  <div class="pj-strip"><p class="pj-strip-h">프로젝트 하나에 담기는 것 · 탭 <span class="n">5</span></p>
    <div class="pj-steps5">${steps.map(([t, s], i) => `<div>${fig(shots[i * 2], t)}<b><span class="n">0${i + 1}</span>${esc(t)}</b><span>${esc(s)}</span></div>`).join('')}</div></div>
  <div class="pj-strip"><p class="pj-strip-h">불러올 수 있는 영상 · 데이터 관리 아카이브 <span class="n" style="color:var(--accent)">${D.ARCHIVE.length}</span><span class="sp" style="flex:1"></span><a class="link link--ink" href="dataset.html">데이터 관리 ›</a></p>
    <div class="pj-thumbs">${D.ARCHIVE.slice(0, 8).map((a) => (a.thumb ? fig(a.thumb, a.name) : `<figure class="imgcard imgcard--none">SHP</figure>`)).join('')}</div>
    <p class="mic" style="margin-top:8px">${esc(D.ARCHIVE.slice(0, 3).map((a) => a.name).join(' · '))} · 외 ${D.ARCHIVE.length - 3}건${demo()}</p></div>`;
}
function noResult(all) {
  return `<div class="pj-note">${icon('search', 30)}<div><h2>검색 조건에 맞는 프로젝트가 없어요</h2>
      <p>프로젝트명 “${esc(S.q)}” · ${all.length}건 중 0건</p>
      <p class="acts">${link('초기화 ›', 'reset')}${link('프로젝트 만들기 ›', 'create')}</p></div></div>
  <div class="pj-strip"><p class="pj-strip-h">전체 프로젝트 <span class="n" style="color:var(--accent)">${all.length}</span></p>
    <div class="pj-cards pj-cards--s">${all.map((p, i) => `<div class="pj-card pj-card--mute">${fig(p.thumb, '')}${i < 4 ? `<span class="pj-card-t"><span>${esc(p.name)}</span></span>` : bone('64%')}</div>`).join('')}</div></div>`;
}
function newPlan() {
  const fields = [['프로젝트명', '100자 이내'], ['탐지 유형', 'Object Detection · Segmentation'], ['학습데이터 유형', '정사영상 · 이미지셋'], ['영상 불러오기', '아카이브에서 선택'], ['권장 해상도', '선택 영상 GSD 에서 자동'], ['학습데이터 불러오기', '데이터셋 · 라벨링 데이터'], ['구성원 초대', '아이디 확인 → 역할']];
  return `<p class="mic">새 프로젝트에 정하는 것 · <span class="n">${fields.length}</span></p>
  <div class="pj-pick" style="margin:8px 0 14px">
    <div>${fig(D.MARK.gh[0], 'Object Detection 예')}<b>Object Detection</b></div>
    <div>${fig(D.MARK.fl[0], 'Segmentation 예')}<b class="dim">Segmentation</b></div></div>
  <ol class="pj-plan" style="list-style:none;margin:0;padding:0">${fields.map(([t, s], i) => `<li><span class="n">0${i + 1}</span><span><b>${esc(t)}</b><span>${esc(s)}</span></span></li>`).join('')}</ol>
  <p class="mic" style="margin-top:14px">클래스는 라벨링 탭에서 등록</p>`;
}
function peekNone(total) {
  return `<figure class="imgcard imgcard--none" style="--ar:16/9">선택한 프로젝트 없음</figure>
  <p class="mic" style="margin:10px 0 14px">검색 결과 0건 — 조회할 카드가 없음</p>
  ${kv([['탐지유형', bone('58%')], ['학습데이터 유형', bone('62%')], ['권장 해상도', bone('48%')], ['등록일시', bone('54%')], ['최근 학습', bone('66%')]])}
  <p class="mic" style="margin-top:12px">전체 ${total}건</p>`;
}
function peek(p) {
  const t = D.lastTrain(p.id), lab = D.labelTotal(p.id);
  return `${fig(p.thumb, `${p.name} 대표 이미지`)}
  <p class="pj-hero-cap">대표 이미지 · 자동(첫 도엽 AOI)<span class="sp" style="flex:1"></span>${link('변경 ›', 'edit')}</p>
  <h3 class="panel-t" style="margin:10px 0 2px">${esc(p.name)}</h3>
  <p class="mic" style="margin:0 0 12px">${t ? `<span class="st st--acc">학습 완료</span> · <span class="n">${esc(p.trainedAt)}</span>${t.iou != null ? ` · <span class="n">IoU ${t.iou.toFixed(2)}</span>` : ''}` : st('학습 결과 없음')}</p>
  ${kv([['탐지유형', esc(p.taskLabel)], ['학습데이터 유형', esc(p.dataType)], ['권장 해상도', `<span class="n">${esc(p.reco)}</span>${guess()}`],
    ['등록일시', `<span class="n">${esc(p.created)}</span>${demo()}`], ['최근 학습', t ? `${esc(t.name)} · <span class="n">${esc(t.at.slice(0, 10))}</span>` : miss('학습 결과 없음')]])}
  <div class="pj-kpi" style="margin-top:16px">
    <div><b class="n">${p.nMember}</b><span>구성원</span></div><div><b class="n">${p.files.length}</b><span>파일</span></div>
    <div><b class="n">${p.nDataset}</b><span>데이터셋</span></div><div><b class="n">${lab ? n(lab) : '—'}</b><span>라벨</span></div></div>
  <p class="mic" style="margin-top:10px">소유자 1 · 편집자 ${Math.max(0, p.nMember - 1)} · 도엽 ${p.files.length}${p.files[0] && p.files[0].gsd ? ' · ' + p.files[0].gsdLabel : ''}</p>`;
}
function bindList() {
  const all = S.seed === 'empty' ? [] : D.list(), rows = projects();
  $('#pj-count').innerHTML = all.length ? (rows.length ? `총 <b class="n">${all.length}</b>건 중 <span class="n">${Math.min(rows.length, (S.page - 1) * S.size + 1)}–${Math.min(rows.length, S.page * S.size)}</span>행` : `총 <b class="n">${all.length}</b>건 중 <span class="n">0</span>행`) : '총 <b class="n">0</b>건';
  mountPager($('#pj-pager'), { total: rows.length, page: S.page, size: S.size, onChange: ({ page, size }) => go({ page, size }) });
  $('#pj-search').addEventListener('submit', (e) => { e.preventDefault(); go({ q: $('#pj-q').value.trim(), page: 1, sel: '' }); });
  $('#pj-search').addEventListener('reset', (e) => { e.preventDefault(); go({ q: '', page: 1, sel: '', seed: '' }); });
  $('#pj-qx')?.addEventListener('click', () => go({ q: '', page: 1, sel: '' }));
  $$('#main .pj-card[data-pid]').forEach((b) => {
    b.addEventListener('click', () => go({ sel: b.dataset.pid }, { replace: true }));
    b.addEventListener('dblclick', () => go({ pid: b.dataset.pid, tab: 'overview', sel: '' }));
  });
  const sel = rows.find((p) => p.id === S.sel) || rows.slice((S.page - 1) * S.size, S.page * S.size)[0] || null;
  $('#pj-root').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'create') location.href = 'ai-project-create.html';
    if (a.dataset.act === 'reset') go({ q: '', page: 1, sel: '' });
    if (a.dataset.act === 'open' && sel) go({ pid: sel.id, tab: 'overview' });
    if (a.dataset.act === 'edit' && sel) go({ pid: sel.id, tab: 'overview', edit: true });
    if (a.dataset.act === 'del' && sel) await askDelete(sel);
  });
}

/* ══ 2. 상세 ═══════════════════════════════════════════════════════════════ */
function detailView(p) {
  if (S.state) return `<div class="pj-body">${statePlate(S.state, { img: p.heroClean,
    title: S.state === 'error' ? '프로젝트 정보를 불러오지 못했습니다' : '프로젝트 정보를 불러오는 중',
    why: S.state === 'error' ? '네트워크 연결을 확인한 뒤 다시 시도 · 계속되면 고객센터 063-713-1213' : '대표 이미지 · 결과 필지 · 최근 학습' })}
    ${S.state === 'loading' ? `<div class="pj-kpi" style="margin-top:18px">${['탐지 필지', 'IoU · 최근 학습', '정사영상 도엽', '데이터셋'].map((l) => `<div>${bone('72%')}<span>${esc(l)}</span></div>`).join('')}</div>` : ''}</div>`;
  if (S.tab === 'overview') return overviewTab(p);
  if (S.tab === 'data') return dataTab(p, S);
  if (S.tab === 'labeling') return labelTab(p, S);
  if (S.tab === 'train') return trainTab(p, S);
  if (S.tab === 'analysis') return analysisTab(p, S);
  return deployTab(p, S);
}
function bindDetail(p) {
  $('#pj-root').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'retry') go({ state: '' });
    if (a.dataset.act === 'save-edit') saveEdit(p);
    if (a.dataset.act === 'cancel-edit') go({ edit: false });
  });
  if (S.state) return;
  if (S.tab === 'overview') { bindCounters($('#pj-root')); return; }
  if (S.tab === 'data') return bindData(p, S, go);
  if (S.tab === 'labeling') return bindLabel(p, S, go);
  if (S.tab === 'train') return bindTrain(p, S, go);
  if (S.tab === 'analysis') return bindAnalysis(p, S, go);
  return bindDeploy(p, S, go);
}

/* ── 개요 ─────────────────────────────────────────────────────────────────── */
/* 제목 행 액션(수정 · 구성원 초대 · 삭제 · CTA)은 셸이 만든 #page-head 안에 있다 —
   그릇(#pj-root) 밖이므로 문서에 한 번만 위임한다(리스너 누적 0). */
document.addEventListener('click', (e) => {
  const a = e.target.closest('#page-head [data-act]'); if (!a || !S.pid) return;
  const p = D.detail(S.pid); if (!p) return;
  const act = a.dataset.act;
  if (act === 'edit') go({ edit: true, tab: 'overview' });
  else if (act === 'invite') openInvite(p);
  else if (act === 'del') askDelete(p);
  else if (act === 'go-label') go({ tab: 'labeling' });
  else if (act === 'go-files') go({ tab: 'data', seg: 'files' });
});

function overviewTab(p) {
  return `<div class="split pj-body" style="--l:776fr;--r:440fr">
    <section class="split-l"><div class="panel-b" style="padding-top:0">${S.edit ? editForm(p) : overviewBody(p)}</div></section>
    <aside class="split-r panel" aria-label="프로젝트 정보">
      <header class="panel-h"><h2>프로젝트 정보</h2><span class="sp"></span>${link('닫기', 'go-list', ' aria-label="판 닫기"')}</header>
      <div class="panel-b">${infoPanel(p)}</div></aside></div>`;
}
function overviewBody(p) {
  const t = D.lastTrain(p.id), lab = D.labelTotal(p.id), f = p.files[0];
  const res = p.result;
  return `${fig(p.hero, `${p.name} 결과 미리보기`)}
  <p class="pj-hero-cap">${f ? `${esc(f.name)} · 도엽 ${p.files.length} · GSD ${esc(f.gsdLabel)}` : '대표 이미지 없음'}<span class="sp" style="flex:1"></span>${link('대표 이미지 변경 ›', 'edit')}</p>
  <div class="pj-kpi">
    <div><b class="n">${res ? n(res.stats.count) : '—'}</b><span>탐지 ${esc(res ? res.unit : '필지')}</span></div>
    <div><b class="n">${t && t.iou != null ? t.iou.toFixed(2) : '—'}</b><span>IoU · 최근 학습</span></div>
    <div><b class="n">${p.files.length}</b><span>정사영상 도엽</span></div>
    <div><b class="n">${p.nDataset}</b><span>데이터셋</span></div></div>
  ${t ? recentTrain(p, t) : `<div style="margin-top:22px">${empty('학습 결과가 없습니다', '학습 탭에서 새로 학습하기 → 곡선 · 클래스별 F1 · 오분류 행렬이 여기에 요약됩니다', 'clock')}</div>`}
  <div style="margin-top:22px">${cardTrace(p, { compact: true })}</div>
  <p class="mic" style="margin-top:14px">라벨 합계 <span class="n">${lab ? n(lab) : '—'}</span> · 구성원 ${p.nMember} · 분석 실행 ${p.nRun}</p>`;
}
function recentTrain(p, t) {
  return `<section style="margin-top:22px"><div class="pj-hist-h"><h3>최근 학습 결과</h3><span class="mic">${esc(t.name)} · <span class="n">${esc(t.at.slice(0, 10))}</span>${demo(true)}</span>
      <span class="sp" style="flex:1"></span><a class="link link--ink" href="${esc(href({ tab: 'train', tr: t.id }))}">학습 탭에서 보기 ›</a></div>
    <div style="display:grid;grid-template-columns:1fr 240px;gap:26px;align-items:start">
      <div><p class="lb" style="margin-bottom:8px">클래스별 F1</p>${t.classF1 ? bars(t.classF1.map(([k, v], i) => [k, v, i > 0])) : miss('클래스별 값 없음 — 검증 전')}</div>
      <div><p class="lb" style="margin-bottom:8px">오분류 행렬</p>${t.cm ? cmTable(t, p) : miss('행렬 없음 — 검증 전')}</div></div></section>`;
}
function cmTable(t, p) {
  const names = p.classes.map((c) => c.name);
  return `<table class="pj-cm"><caption class="sr">${esc(names.join(' · '))} 오분류 행렬</caption><tbody>${t.cm.map((row, i) => `<tr>${row.map((v, j) => `<td class="n${i === j ? ' hit' : ''}">${n(v)}</td>`).join('')}<td class="dim">—</td></tr>`).join('')}<tr><td class="dim">—</td><td class="dim">—</td><td class="dim">—</td></tr></tbody></table>`;
}
function infoPanel(p) {
  const t = D.lastTrain(p.id), ms = D.membersOf(p.id);
  return `${kv([['프로젝트명', esc(p.name)], ['탐지유형', esc(p.taskLabel)], ['학습데이터 유형', esc(p.dataType)],
    ['권장 해상도', `<span class="n">${esc(p.reco)}</span>${guess()}`], ['등록일시', `<span class="n">${esc(p.created)}</span>${demo()}`],
    ['최근 학습', t ? `<span class="n">${esc(p.trainedAt)}</span> · ${esc(p.file)}` : miss('학습 결과 없음')]])}
  <p class="lb" style="margin:16px 0 8px">CLASSES ${p.classes.length}</p>
  <p class="pj-chipline">${p.classes.map((c) => `<span class="pj-chip">${esc(c.name)}${c.n != null ? ` <b class="n" style="color:var(--accent);font-weight:400">${n(c.n)}</b>` : ''}</span>`).join('')}</p>
  <div class="pj-hist-h" style="margin-top:18px"><h3>구성원 ${ms.length}</h3><span class="sp" style="flex:1"></span>${link('삭제 ›', 'rm-member')}</div>
  <table class="pj-mem"><tbody>${ms.map((m) => `<tr><td>${m.self ? '' : '<input type="checkbox" aria-label="' + esc(m.name) + ' 선택">'}</td>
      <td><span class="pj-av${m.self ? ' pj-av--me' : ''}">${esc(m.initial)}</span></td>
      <td>${esc(m.name)}${m.demo ? demo() : ''}</td><td>${esc(m.role)}${m.self ? ' <span style="color:var(--accent)">본인</span>' : ''}</td></tr>`).join('')}</tbody></table>
  <button type="button" class="pj-invite" data-act="invite">${icon('plus', 14)}구성원 초대</button>
  <div class="pj-hist-h" style="margin-top:20px"><h3>최근 활동</h3></div>
  ${activity(p).map(([d, txt]) => `<div class="pj-act"><span class="n">${esc(d)}</span><span>${txt}</span></div>`).join('') || `<p class="mic">${esc('기록 없음')}</p>`}`;
}
function activity(p) {
  const out = [], lab = D.labelTotal(p.id), t = D.lastTrain(p.id);
  if (lab) out.push([D.labelingOf(p.id)[0].last, `라벨 <span class="n">${n(lab)}</span> ${esc(p.result ? p.result.unit : '건')} 저장`]);
  if (t) out.push([p.trainedAt, `<span class="st st--acc">학습 완료</span> · ${esc(p.file)}`]);
  return out;
}

/* ── 개요 수정(인라인 폼) — 원본 3필드: 프로젝트명 · 대표 이미지 · 탐지유형 ── */
function editForm(p) {
  const shots = p.thumbs;
  return `<form class="form" id="pj-edit" style="display:block">
    <div class="field"><div class="field-h"><label class="field-l" for="ed-name">프로젝트명<em class="req">*</em></label><span class="cnt" data-for="ed-name"></span></div>
      <input id="ed-name" class="inp" maxlength="100" value="${esc(p.name)}" required></div>
    <p class="lb" style="margin:18px 0 8px">대표 이미지</p>
    <div style="display:grid;grid-template-columns:252px 1fr;gap:18px;align-items:start">
      ${fig(p.thumb, '대표 이미지', '', { style: '--ar:252/142' })}
      <div><p style="margin:0 0 6px;font-size:15px">자동 · ${esc(p.files[0] ? p.files[0].name : '영상 없음')} AOI</p>
        <p class="mic" style="margin:0 0 14px">프로젝트 목록 카드와 개요에 표시되는 대표 이미지 · jpg · jpeg · png · gif</p>
        <p class="acts" style="justify-content:flex-start">${br('이미지 선택', 'pick-img')}${link('자동으로 되돌리기', 'auto-img')}</p></div></div>
    <p class="lb" style="margin:18px 0 8px">탐지유형 <em class="req">*</em></p>
    <div class="pj-pick">
      <label>${fig(shots[0], 'Object Detection')}<span class="pj-pick-m">${icon('check', 14)}</span><input type="radio" name="det" value="detect"${p.task !== 'segment' ? ' checked' : ''}><b>Object Detection</b><span>바운딩 박스로 객체 위치 탐지</span></label>
      <label>${fig(shots[1] || shots[0], 'Segmentation')}<span class="pj-pick-m">${icon('check', 14)}</span><input type="radio" name="det" value="segment"${p.task === 'segment' ? ' checked' : ''}><b>Segmentation</b><span>폴리곤으로 정밀 윤곽 탐지</span></label></div>
    <hr class="hr" style="margin:20px 0 14px">
    <p class="acts">${br('취소', 'cancel-edit')}${cta('저장', 'save-edit')}</p></form>`;
}
function saveEdit(p) {
  const name = $('#ed-name').value.trim();
  if (!name) { $('#ed-name').setAttribute('aria-invalid', 'true'); $('#ed-name').focus(); say('프로젝트명을 입력해 주세요.'); return; }
  const task = $('input[name="det"]:checked').value;
  D.patchProject(p.id, { name, task, taskLabel: D.TASK[task], detLabel: D.DET[task] });
  mounted = ''; go({ edit: false }); say('프로젝트를 수정했습니다 · 시연');
}

/* ── 구성원 초대 — 아이디 확인 → 이름 자동 → 역할(편집자 · 뷰어) ── */
function openInvite(p) {
  const m = openModal({ title: '구성원 초대', width: 480, content: `
    <div class="form" style="display:block">
      <div class="field"><label class="field-l" for="iv-id">아이디 (이메일)<em class="req">*</em></label>
        <span style="display:flex;gap:10px"><input id="iv-id" class="inp" placeholder="sylee@namwon.go.kr" autocomplete="off" aria-describedby="iv-e"><button type="button" class="btn-br" id="iv-check" style="width:72px">확인</button></span>
        <p class="help" id="iv-ok" hidden></p><p class="err" id="iv-e" hidden>아이디를 확인해 주세요.</p></div>
      <p class="lb" style="margin:16px 0 6px">이름 <em class="tag">자동</em></p>
      <p id="iv-name" class="pj-miss" style="width:100%">아이디 확인 후 자동 입력</p>
      <p class="lb" style="margin:16px 0 6px">역할</p>
      <div class="checks" id="iv-role" aria-disabled="true">
        <label class="rd"><input type="radio" name="iv-r" value="편집자" checked disabled>편집자</label>
        <label class="rd"><input type="radio" name="iv-r" value="뷰어" disabled>뷰어</label>
        <span class="mic">라벨링 · 학습 · 분석 실행</span></div>
      <p class="mic" id="iv-after" style="margin-top:14px">초대 후 구성원 ${D.membersOf(p.id).length + 1}</p>
    </div>`,
    actions: [{ label: '취소', kind: 'bracket' }, { label: '구성원 초대', kind: 'primary', onClick: () => {
      const id = $('#iv-id', m.el).value.trim();
      if (!ok) { $('#iv-id', m.el).setAttribute('aria-invalid', 'true'); $('#iv-e', m.el).hidden = false; $('#iv-id', m.el).focus(); return false; }
      const role = $('input[name="iv-r"]:checked', m.el).value;
      D.invite(p.id, { key: `iv-${id}`, name: id.split('@')[0], initial: (id[0] || '?').toUpperCase(), role, demo: true });
      mounted = ''; go({}); say(`${id.split('@')[0]} 님을 초대했습니다 · 시연`); return true;
    } }],
  });
  let ok = false;
  $('#iv-check', m.el).addEventListener('click', () => {
    const v = $('#iv-id', m.el).value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { ok = false; $('#iv-id', m.el).setAttribute('aria-invalid', 'true'); $('#iv-e', m.el).hidden = false; $('#iv-ok', m.el).hidden = true; return; }
    ok = true; $('#iv-id', m.el).removeAttribute('aria-invalid'); $('#iv-e', m.el).hidden = true;
    const org = v.split('@')[1] || '';
    $('#iv-ok', m.el).hidden = false; $('#iv-ok', m.el).innerHTML = `<span style="color:var(--accent)">확인됨</span> · ${esc(org)}`;
    const nm = $('#iv-name', m.el); nm.className = ''; nm.style.cssText = 'background:var(--t1);padding:10px 12px;margin:0;font-size:16px'; nm.textContent = v.split('@')[0];
    $('#iv-role', m.el).removeAttribute('aria-disabled'); $$('#iv-role input', m.el).forEach((i) => { i.disabled = false; });
  });
  $('#iv-id', m.el).addEventListener('input', () => { ok = false; $('#iv-e', m.el).hidden = true; });
}

/* ── 삭제 확인(B5-Project-Delete) ── */
async function askDelete(p) {
  const yes = await confirmDialog({ title: '프로젝트 삭제', body: `“${p.name}” 프로젝트를 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`, okLabel: '삭제', danger: true });
  if (!yes) return;
  D.removeProject(p.id); mounted = '';
  go({ pid: '', sel: '', page: 1 }); say(`“${p.name}” 프로젝트를 삭제했습니다 · 시연`);
}

render();
