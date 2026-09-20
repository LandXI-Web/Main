/* 카드 발행 관리 — 분할 검토 데스크(선택 3): 큐 344 · 증거 520 · 결정 328.
   원판 design-canvas/v2/B6-Publish-{Opt3,List,List-Pending,List-Empty,Review-*}.dc.html · 원본 landxi7/admin-publish.html(기능 1:1).
   URL 이 상태다: ?status=대기 · ?who= · ?from= · ?to= · ?search=1 · ?open=pa-6 · ?tab=members|labeling|training|analysis · ?lab=0 · ?an=0 · ?mode=edit|process
   변경(발행 처리 · 개요 수정 · 라벨 저장)은 publish-data.js 의 세션 저장에 들어가 화면이 실제로 바뀐다. */
import { mountShell, say, bindCounters, icon, esc, $, $$ } from './shell.js';
import * as D from './publish-data.js';
import { ico, fig, stageRail, classChips, stWord, DEMO, Plate } from './publish-ui.js';
import { openLabeling } from './publish-label.js';

const TABS = [['overview', '개요'], ['members', '구성원'], ['labeling', '라벨링'], ['training', '학습 결과'], ['analysis', '분석 결과']];
const FILTERS = ['전체', ...D.STATUSES];
const PAGE = 'admin-publish.html';

/* ── URL ↔ 상태 ── */
const S = {};
function read() {
  const q = new URLSearchParams(location.search), st = q.get('status') || '';
  Object.assign(S, { status: D.STATUSES.includes(st) ? st : '', who: q.get('who') || '', from: q.get('from') || '', to: q.get('to') || '', search: q.get('search') === '1',
    open: q.get('open') || '', tab: TABS.some(([k]) => k === q.get('tab')) ? q.get('tab') : 'overview', mode: ['edit', 'process'].includes(q.get('mode')) ? q.get('mode') : '',
    lab: q.has('lab') ? +q.get('lab') : null, an: q.has('an') ? +q.get('an') : null });
  if (S.open && !D.findRequest(S.open)) S.open = '';
  if (!S.open) { S.tab = 'overview'; S.mode = ''; S.lab = S.an = null; }
  if (S.tab !== 'labeling' || S.mode) S.lab = null;
  if (S.tab !== 'analysis') S.an = null;
}
function href(patch = {}) {
  const n = { ...S, ...patch }, q = new URLSearchParams();
  if (n.status) q.set('status', n.status); if (n.who) q.set('who', n.who); if (n.from) q.set('from', n.from); if (n.to) q.set('to', n.to); if (n.search) q.set('search', '1');
  if (n.open) { q.set('open', n.open); if (n.tab && n.tab !== 'overview') q.set('tab', n.tab); if (n.mode) q.set('mode', n.mode); if (n.lab != null && n.tab === 'labeling' && !n.mode) q.set('lab', n.lab); if (n.an != null && n.tab === 'analysis') q.set('an', n.an); }
  const s = q.toString(); return PAGE + (s ? `?${s}` : '');
}
function go(patch, { replace = false, focus = '' } = {}) {
  const url = href(patch); if (url === PAGE + location.search || (url === PAGE && !location.search)) { read(); render(focus); return; }
  history[replace ? 'replaceState' : 'pushState'](null, '', url); read(); render(focus);
}

/* ── 거르기 ── */
function filtered() {
  const who = S.who.trim().toLowerCase();
  return D.requests().filter((r) => {
    if (S.status && r.status !== S.status) return false;
    if (who && !r.requester.toLowerCase().includes(who)) return false;
    const d = r.date.slice(0, 10).replace(/\./g, '-');
    if (S.from && d < S.from) return false; if (S.to && d > S.to) return false;
    return true;
  });
}
const searching = () => !!(S.who || S.from || S.to);

/* ── 셸 ── */
const fromDash = /dashboard\.html/.test(document.referrer);
mountShell({ active: 'publish', title: '카드 발행 관리', titleRule: 2, subtitle: 'AI 전문가의 카드 발행 요청을 검토하고 승인/반려 처리합니다', fit: true, demo: true,
  crumbIcon: 'layers', crumbs: [{ label: '카드 발행 관리' }], headRight: '<div class="pst-band" id="pst" role="group" aria-label="상태로 거르기"></div>' });
const main = $('#main');
main.insertAdjacentHTML('beforeend', `
<div id="desk" data-mode="list">
  <section id="queue" aria-labelledby="q-title">
    <header class="q-h"><h2 id="q-title" class="d">발행 요청 목록</h2><span class="n q-n" id="q-n"></span><span class="q-note" id="q-note"></span><span class="sp"></span>
      <button type="button" class="q-ib q-ib--g" id="q-refresh" aria-label="새로 고침" title="새로 고침">${ico('refresh')}</button>
      <button type="button" class="q-ib" id="q-search-t" aria-expanded="false" aria-controls="q-search"></button></header>
    <form id="q-search" class="q-search" role="search" aria-label="발행 요청 검색" hidden>
      <span class="grp"><label class="f-lab" for="q-who">요청자</label><input class="inp" id="q-who" placeholder="요청자명" autocomplete="off"></span>
      <span class="grp"><span class="f-lab" id="q-dl">요청 일시</span><input class="inp" type="date" id="q-from" aria-label="요청 일시 시작"><span class="tilde">~</span><input class="inp" type="date" id="q-to" aria-label="요청 일시 끝"></span>
      <span class="acts"><button type="reset" class="q-reset">초기화</button><button type="submit" class="btn">검색</button></span>
    </form>
    <div id="q-list" tabindex="-1"></div>
    <p class="sr" id="q-live" aria-live="polite"></p>
  </section>
  <div class="desk-rule" aria-hidden="true"></div>
  <section id="detail" aria-label="발행 요청 세부" hidden></section>
</div>`);
const plate = new Plate();
let labeling = null;

/* ── 제목 행 — 상태 건수 타일 5 ── */
function drawTiles() {
  const c = D.counts();
  $('#pst').innerHTML = FILTERS.map((k) => {
    const on = (S.status || '전체') === k, n = c[k];
    return `<button type="button" class="pst${k === '대기' && n ? ' pst--warn' : ''}${n ? '' : ' pst--zero'}" data-status="${k === '전체' ? '' : k}" aria-pressed="${on}"><span class="pst-l">${k}</span><span class="pst-v"><b>${n}</b><span>건</span></span></button>`;
  }).join('');
}
function drawCrumbs(r) {
  const ol = $('.crumbs ol'); if (!ol) return;
  const parts = [];
  if (fromDash) parts.push('<li><a href="dashboard.html">대시보드</a></li>');
  parts.push(r || S.status ? `<li><a href="${PAGE}" data-nav="">카드 발행 관리</a></li>` : '<li aria-current="page"><span>카드 발행 관리</span></li>');
  if (r) parts.push(`<li aria-current="page"><span>${esc(r.card)} · 검토</span></li>`); else if (S.status) parts.push(`<li aria-current="page"><span>${esc(S.status)} ${S.status === '대기' ? '· 검토가 필요한 요청' : '요청'}</span></li>`);
  ol.innerHTML = parts.join('');
}

/* ── 큐 / 목록 ── */
const who = (r) => `요청자 ${esc(r.requester)}`;
function rowHtml(r) {
  const pj = D.PROJECTS[r.pid] || {};
  return `<a class="q-row lcard" href="${href({ open: r.id, tab: 'overview', mode: '', lab: null, an: null })}" data-id="${r.id}"${r.id === S.open ? ' aria-current="true"' : ''}>
    <div class="q-th">${fig(r.cardThumb, { alt: `${pj.name} 요청 지역 정사영상` })}</div>
    <div><div class="lcard-t"><span>${esc(r.card)}</span>${stWord(r.status)}</div><div class="lcard-s">${esc(r.project)} · ${esc(r.training)}</div><div class="q-d"><span class="n">${esc(r.date)}</span><span class="who">${who(r)}</span></div></div></a>`;
}
function cardHtml(r) {
  const go_ = r.status === '대기' ? ['검토 ›', 'q-go--warn'] : r.status === '검토중' ? ['이어서 검토 ›', 'q-go--acc'] : ['열람 ›', 'q-go--ink'];
  return `<a class="q-card" href="${href({ open: r.id })}" data-id="${r.id}">${fig(r.cardThumb, { alt: `${r.project} 요청 지역 정사영상`, long: true })}
    <div class="q-card-b"><div class="q-card-t"><span>${esc(r.card)}</span>${stWord(r.status)}</div><div class="q-card-s">${esc(r.project)} · ${esc(r.training)}</div><div class="q-card-d"><span class="n">${esc(r.date)}</span> · ${who(r)}</div><span class="q-go ${go_[1]}">${go_[0]}</span></div></a>`;
}
function pairHtml(r, i) {
  const pj = D.PROJECTS[r.pid] || {}, real = pj.real ? D.REAL[pj.real] : null;
  return `<a class="q-pair" href="${href({ open: r.id })}" data-id="${r.id}">${fig(r.cardThumb, { alt: `${r.project} 요청 지역 정사영상`, long: true, cap: pj.thumbNote || '', capR: real ? `${real.res.title} · 실측 ${real.res.stats.count.toLocaleString('ko-KR')} ${real.unit}` : '' })}
    <div class="q-pair-t"><span class="n">${String(i + 1).padStart(2, '0')}</span><b>${esc(r.card)}</b><span class="st st--warn">승인 대기</span></div>
    <div class="q-pair-b">${kv([['요청 일시', `<span class="n">${esc(r.date)}</span> ${DEMO}`], ['과제 유형', esc(r.type)], ['학습 결과', esc(r.training)], ['탐지 형태', esc(r.det)], ['권한', esc(r.perms.join(', '))]], 'kv--p')}
      <div class="q-pair-r"><span class="lb" style="margin-bottom:8px">처리 단계</span>${stageRail(r.status)}<span class="who">${who(r)}</span><span class="q-pair-cta brackets">검토 ›</span></div></div></a>`;
}
function voidHtml() {
  const why = [S.status, S.who ? `요청자 “${S.who}”` : '', S.from || S.to ? `${S.from || '…'} ~ ${S.to || '…'}` : ''].filter(Boolean);
  const msg = `<div class="q-void-m">${icon('layers', 34)}<h3 class="d">요청이 없습니다</h3><p>${esc(why.slice(0, 2).join(' · '))}${why[2] ? `\n${esc(why[2])}` : ''}</p>${why.length ? '<button type="button" class="link-b" id="q-void-reset">초기화 ›</button>' : ''}</div>`;
  return `<div class="q-void"><i></i>${msg}<i></i><i></i><i></i><i></i></div>`;
}
function drawQueue() {
  const list = filtered(), review = !!S.open, n = $('#q-n');
  $('#desk').dataset.mode = review ? 'review' : 'list';
  n.textContent = list.length; n.toggleAttribute('data-warn', S.status === '대기' && list.length > 0); n.toggleAttribute('data-zero', !list.length);
  $('#q-note').textContent = review ? '' : searching() ? '검색 결과' : S.status === '대기' ? '대기 · 검토가 필요한 요청' : '';
  const t = $('#q-search-t'); t.setAttribute('aria-expanded', String(S.search)); t.innerHTML = S.search ? `${icon('x')}검색 닫기` : `${icon('search')}검색`;
  $('#q-search').hidden = !S.search; $('#q-who').value = S.who; $('#q-from').value = S.from; $('#q-to').value = S.to;
  const el = $('#q-list');
  if (!list.length) el.innerHTML = voidHtml();
  else if (review) el.innerHTML = list.map(rowHtml).join('');
  else if (S.status === '대기' && !searching()) el.innerHTML = `<div class="q-grid q-grid--pair">${list.map(pairHtml).join('')}</div>`;
  else el.innerHTML = `<div class="q-grid">${list.map(cardHtml).join('')}</div>`;
  $('#q-live').textContent = `발행 요청 ${list.length}건`;
}

/* ── 세부 ── */
const kv = (rows, cls = '') => `<dl class="kv ${cls}">${rows.map(([k, v, c]) => `<div><dt>${k}</dt><dd${c ? ` class="${c}"` : ''}>${v}</dd></div>`).join('')}</dl>`;
const infoRows = (r) => [['상태', stWord(r.status)], ['과제 유형', esc(r.type)], ['과제명', esc(r.card)], ['분석 과제', esc(r.project)], ['학습 결과', esc(r.training)], ['모델명', esc(r.model), 'n'], ['탐지 형태', esc(r.det)], ['데이터 유형', esc(r.data)], ['권한', esc(r.perms.join(', '))], ['요청자', `${esc(r.requester)} ${DEMO}`], ['요청일', esc(r.date), 'n']];
const infoCol = (r) => `<h3 class="sec-h">발행 정보</h3>${kv(infoRows(r))}<p class="lb dc-k">클래스</p>${classChips(r.classes)}`;
const decisionFoot = (r, edit) => `<div class="dc-f"><span class="lb">처리 단계</span>${stageRail(r.status)}<div class="dc-acts">${edit ? '<button type="button" class="btn-br" data-act="edit">수정</button>' : ''}<button type="button" class="btn btn--l" data-act="process">발행 처리</button></div></div>`;
const rejBox = (r) => (r.status === '반려' && r.reject ? `<div class="rej"><span class="lb">반려 사유</span><p>${esc(r.reject)}</p></div>` : '');
const evBottom = (r) => `<div class="ov-b"><div class="ov-th"><figure>${fig(r.cardThumb, { alt: '카드 썸네일' })}<figcaption class="lb">카드 썸네일</figcaption></figure><figure>${fig(r.dashThumb, { alt: '대시보드 썸네일', cls: 'dash' })}<figcaption class="lb">대시보드 썸네일</figcaption></figure></div>
  <div class="ov-tx"><span class="lb">소개</span><p>${esc(r.intro) || '—'}</p><span class="lb">개발 목적</span><p>${esc(r.purpose) || '—'}</p></div></div>`;

function overviewHtml(r, dim) {
  return `<div class="dt-cols"><div class="ev"${dim ? ' data-dim inert' : ''}>${rejBox(r)}<div data-slot="plate"></div>${evBottom(r)}</div>
    ${dim ? processHtml(r) : `<div class="dc"><div class="dc-scroll">${infoCol(r)}</div>${decisionFoot(r, true)}</div>`}</div>`;
}
function membersHtml(r) {
  const m = D.membersOf(r.pid), sum = m.reduce((a, x) => a + x.labels, 0);
  const rows = m.length ? m.map((x) => `<div class="mb" role="listitem"><span class="mb-a">${icon('user', 24)}</span><div><div class="mb-n">${esc(x.name)}<span class="chip">${esc(x.role)}</span></div><div class="mb-s">이름 가림 ${DEMO}</div></div><div><span class="lb">라벨</span><span class="mb-v">${x.labels.toLocaleString('en-US')}</span></div><div><span class="lb">마지막 작업</span><span class="n mb-d">${esc(x.last)}</span></div></div>`).join('') : '<div class="empty empty--s">구성원이 없습니다</div>';
  const share = sum ? `<div class="share"><span class="lb">라벨 기여 · 합계 ${sum.toLocaleString('en-US')}</span><div class="share-bar" aria-hidden="true">${m.filter((x) => x.labels).map((x) => `<i style="flex:${x.labels}"></i>`).join('')}</div><div class="share-k">${m.filter((x) => x.labels).map((x) => `<span style="flex:${x.labels}">${esc(x.role)} ${Math.round((x.labels / sum) * 100)} %</span>`).join('')}</div></div>` : '';
  return `<div class="dt-cols"><div class="ev"><h3 class="sec-h" style="margin-top:-2px">구성원<span class="mic" style="margin-left:auto;font-family:var(--body);font-weight:400">읽기 전용 · 초대/내보내기 없음</span></h3><div role="list">${rows}</div>${share}<div data-slot="plate"></div></div>
    <div class="dc"><div class="dc-scroll">${infoCol(r)}</div>${decisionFoot(r, false)}</div></div>`;
}
function labelingHtml(r) {
  const items = D.LABELING[r.pid] || [], imgset = D.PROJECTS[r.pid]?.dataType === 'imageset';
  const tagN = imgset ? 'div' : 'button type="button"';
  const rows = items.length ? items.map((it, i) => `<${tagN} class="lab-row" data-lab="${i}"><b>${esc(it.name)}</b>${it.labels > 0 ? '<span class="st st--acc">라벨링됨</span>' : '<span class="st st--dim">미작업</span>'}<span class="m">라벨 <span class="n">${it.labels}</span>${it.photos ? ` · 사진 <span class="n">${it.photos}</span>장` : ` · <span class="n">${esc(it.gsd)}</span>`} · <span class="n">${esc(it.last)}</span></span><span class="go">${imgset ? '' : '라벨링 모드 ›'}</span></${imgset ? 'div' : 'button'}>`).join('') : '<div class="empty empty--s">라벨링 데이터가 없습니다</div>';
  return `<div class="dt-cols"><div class="ev"><h3 class="sec-h" style="margin-top:-2px">라벨링 데이터<span class="mic" style="margin-left:auto;font-family:var(--body);font-weight:400">읽기 전용 · 학습 데이터 추가 없음 ${DEMO}</span></h3><div class="ev-scroll">${rows}${imgset ? '<div class="empty empty--s" style="margin-top:14px">이미지셋 — 사진 원본이 없어 라벨링 모드를 열 수 없습니다</div>' : ''}</div></div>
    <div class="dc"><div class="dc-scroll">${infoCol(r)}</div>${decisionFoot(r, false)}</div></div>`;
}
function trainingHtml(r) {
  const t = D.trainingOf(r);
  if (!t) return '<div class="empty">학습 결과가 없습니다</div>';
  const K = [['영역 일치도 (IOU)', t.iou], ['종합 정확도 (F1)', t.f1], ['검출율 (Recall)', t.recall], ['정밀도 (Precision)', t.precision]];
  const n = t.perf.length;
  const cm = `<div class="cm" style="grid-template-columns:minmax(64px,96px) repeat(${n},minmax(0,${n > 3 ? '1fr' : '120px'}))" role="img" aria-label="오분류 행렬 — 값 없음"><span></span>${t.perf.map((c) => `<span class="h">${esc(c.name)}</span>`).join('')}${t.perf.map((c, i) => `<span class="h" style="text-align:left">${esc(c.name)}</span>${t.perf.map((_, j) => `<span class="c n${i === j ? ' d' : ''}">—</span>`).join('')}`).join('')}</div>`;
  return `<div class="dt-cols"><div class="ev"><div class="kpi4">${K.map(([k, v]) => `<div><span class="lb">${k}</span><b>${(+v).toFixed(2)}</b></div>`).join('')}</div>
    <div class="ev-scroll"><h3 class="sec-h2">클래스별 성능<span class="mic"><span><i></i>정밀도</span><span><i class="r"></i>재현율</span><span><i class="f"></i>F1</span></span></h3>
      <div class="perf">${t.perf.map((c, i) => `<div class="perf-c"><h4><i class="sw sw--s${i ? ' sw--d' : ''}"></i>${esc(c.name)}</h4>${[['', c.p], ['r', c.r], ['f', c.f]].map(([k, v]) => `<div class="perf-r"><i class="${k}" style="width:${(v * 100).toFixed(1)}%"></i><span class="n ${k}">${v.toFixed(2)}</span></div>`).join('')}</div>`).join('')}</div>
      <h3 class="sec-h2">오분류 행렬<span class="mic">행: 실제 클래스, 열: 예측 클래스. 대각선이 높을수록 정확</span></h3>${cm}
      <p class="cm-why">값 없음 — 원본은 매번 바뀌는 난수 데모입니다. 학습 서버가 연결되면 표시합니다(대각선 = 틴트 칸).</p></div></div>
    <div class="dc"><div class="dc-scroll"><h3 class="sec-h">학습 정보${DEMO}</h3>${kv([['학습명', esc(t.labeling)], ['상태', '<span class="st st--acc">완료</span>'], ['학습 시작 일시', `${esc(t.date)} ${t.time}`, 'n'], ['소요 시간', t.dur], ['라벨 수', t.labels.toLocaleString('en-US'), 'n'], ['클래스 수', t.classes, 'n']], 'kv--t')}
      <h3 class="sec-h" style="margin-top:16px">학습 설정</h3>${kv([['기반 모델 (백본)', 'XI-VFM v2.1', 'n'], ['입력 크기', '640 x 640', 'n'], ['이전 학습 이어가기', '없음 (새로 시작)'], ['탐지 형태', esc(r.det)], ['학습 : 검증 비율', '80 : 20', 'n'], ['배치 크기', '16', 'n'], ['에폭 (Epochs)', '100', 'n'], ['IoU 임계값', '0.5', 'n'], ['Confidence 임계값', '0.25', 'n']], 'kv--t')}</div>
      <div class="dc-f"><div class="dc-acts"><button type="button" class="btn btn--l" data-act="process">발행 처리</button></div></div></div></div>`;
}
function analysisHtml(r) {
  const list = D.analysesOf(r);
  if (!list.length) return '<div class="empty">분석 결과가 없습니다</div>';
  const cur = list[S.an ?? 0] || list[0];
  const rows = list.map((a) => `<button type="button" class="an-row" data-an="${a.idx}" aria-pressed="${a === cur}"><b>${esc(a.name)}</b><span class="st st--teal">완료</span><span class="m">탐지 <span class="n">${a.dets.toLocaleString('en-US')}</span> ${a.unit} <em class="tag">${a.tag}</em></span><span class="d">${esc(a.date)}</span></button>`).join('');
  const sec = (t, rws, tag = '') => `<h4>${t}${tag}</h4>${kv(rws)}`;
  return `<div class="dt-cols dt-cols--an"><div class="ev"><div data-slot="plate"></div></div>
    <div class="an"><h3 class="sec-h">분석 결과<span class="mic">${list.length}건</span></h3><div role="group" aria-label="분석 결과 목록">${rows}</div>
      <div class="an-d" tabindex="0" aria-label="분석 결과 세부">${sec('기본 정보', [['분석명', esc(cur.name)], ['분석 과제', esc(r.project)]], DEMO)}
        ${sec('처리 정보', [['상태', '<span class="st st--teal">처리 완료</span>'], ['시작 · 종료', `${cur.started} – ${cur.finished.slice(11)}`, 'n'], ['소요 · 실행자', `${cur.dur} · ${esc(r.requester)}`]])}
        ${sec(cur.input, [['기준 · 크기', `${cur.baseDt} · 28.4 GB`, 'n'], ['데이터명', `${esc(r.project)}_${cur.baseDt.replace(/\./g, '')}`], ['출처', '남원시 농정과 드론 촬영']])}
        ${sec('분석 범위', [['기준 · 크기', `${cur.baseDt} · 6.2 KB`, 'n'], ['범위 유형', '분석 구역'], ['데이터명', `${esc(r.project)} 범위`]])}</div>
      <button type="button" class="btn btn--l btn--block" data-act="process">발행 처리</button></div></div>`;
}

/* ── 발행 처리 패널 ── */
function processHtml(r) {
  const all = r.perms.length >= D.PERMS.length;
  return `<form class="proc" id="proc" novalidate aria-labelledby="proc-h">
    <header class="proc-h"><h3 id="proc-h" class="d">발행 처리</h3><button type="button" class="dt-x" data-act="proc-cancel" aria-label="발행 처리 닫기">${icon('x')}</button></header>
    <div class="proc-b"><p class="flab" id="proc-sl">상태 변경<em class="req">*</em></p>
      <fieldset class="proc-st" aria-labelledby="proc-sl">${D.STATUSES.map((s) => `<label><input type="radio" name="proc-status" value="${s}"${s === r.status ? ' checked' : ''}>${s}</label>`).join('')}</fieldset>
      <p class="proc-hint" id="proc-hint" aria-live="polite"></p>
      <div class="proc-rej" id="proc-rej" hidden><p class="flab"><label for="proc-reason">반려 사유</label><em class="req">*</em><span class="sp"></span><span class="cnt" data-for="proc-reason"></span></p>
        <textarea class="inp" id="proc-reason" maxlength="500" placeholder="반려 사유를 입력해 주세요" aria-describedby="proc-reason-e">${esc(r.reject || '')}</textarea><p class="err" id="proc-reason-e" role="alert" hidden>반려 사유를 입력해 주세요</p></div>
      <p class="flab" id="proc-pl">권한 선택<em class="req">*</em><span class="sp"></span><span>선택 <b class="n" id="proc-pn">${r.perms.length}</b> / ${D.PERMS.length}</span></p>
      <div class="proc-perm" tabindex="-1"><table class="tbl" aria-labelledby="proc-pl"><colgroup><col style="width:34px"><col style="width:44%"><col></colgroup>
        <thead><tr><th><label class="ck"><input type="checkbox" id="proc-all" aria-label="권한 전체 선택"${all ? ' checked' : ''}></label></th><th>기관명</th><th>권한명</th></tr></thead>
        <tbody>${D.PERMS.map((p, i) => `<tr><td><label class="ck"><input type="checkbox" class="proc-p" value="${esc(p.role)}" aria-label="${esc(p.org)} ${esc(p.role)}"${r.perms.includes(p.role) ? ' checked' : ''} id="proc-p${i}"></label></td><td class="o">${esc(p.org)}</td><td class="pr">${esc(p.role)}</td></tr>`).join('')}</tbody></table></div>
      <p class="err" id="proc-perm-e" role="alert" hidden>권한을 1개 이상 선택해 주세요</p></div>
    <footer class="proc-f"><button type="button" class="txt-b" data-act="proc-cancel">취소</button><button type="submit" class="btn btn--l">확인</button></footer></form>`;
}
function bindProcess(r) {
  const f = $('#proc'); if (!f) return;
  const hint = () => {
    const to = $('input[name="proc-status"]:checked', f).value;
    $('#proc-hint').textContent = `현재 ${r.status} → ${to}${to === '승인' ? ' · 승인하면 카드가 발행됩니다' : to === '반려' ? ' · 사유가 요청자에게 전달됩니다' : ''}`;
    $('#proc-rej').hidden = to !== '반려';
  };
  const count = () => { const n = $$('.proc-p:checked', f).length; $('#proc-pn').textContent = n; const a = $('#proc-all'); a.checked = n === D.PERMS.length; a.indeterminate = n > 0 && n < D.PERMS.length; if (n) $('#proc-perm-e').hidden = true; };
  hint(); count(); bindCounters(f);
  f.addEventListener('change', (e) => {
    if (e.target.name === 'proc-status') hint();
    if (e.target.id === 'proc-all') $$('.proc-p', f).forEach((c) => { c.checked = e.target.checked; });
    count();
  });
  f.addEventListener('click', (e) => { const tr = e.target.closest('tbody tr'); if (!tr || e.target.closest('label')) return; const c = $('.proc-p', tr); c.checked = !c.checked; count(); });
  $('#proc-reason').addEventListener('input', () => { $('#proc-reason-e').hidden = true; $('#proc-reason').removeAttribute('aria-invalid'); });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const to = $('input[name="proc-status"]:checked', f).value, patch = { status: to };
    if (to === '반려') {
      const reason = $('#proc-reason').value.trim();
      if (!reason) { $('#proc-reason-e').hidden = false; $('#proc-reason').setAttribute('aria-invalid', 'true'); $('#proc-reason').focus(); return; }
      patch.reject = reason;
    }
    const perms = $$('.proc-p:checked', f).map((c) => c.value);
    if (!perms.length) { $('#proc-perm-e').hidden = false; $('#proc-p0').focus(); return; }
    patch.perms = perms; D.patchRequest(r.id, patch);
    say({ '대기': '대기 상태로 변경했습니다', '검토중': '검토중으로 변경했습니다', '승인': '카드를 승인(발행)했습니다', '반려': '반려 처리했습니다' }[to]);
    go({ mode: '' }, { replace: true, focus: '[data-act="process"]' });
  });
}

/* ── 개요 수정 ── */
function editHtml(r) {
  const th = (id, label, hint, src) => `<div class="fl" id="${id}-f"><p class="flab">${label}<em class="req">*</em></p><div data-pv>${src ? fig(src, { alt: label }) : '<figure class="imgcard imgcard--none"><span>이미지 없음</span></figure>'}</div>
    <div class="pickrow"><input type="file" id="${id}" accept=".jpg,.jpeg,.png" hidden aria-label="${label} 파일"><button type="button" class="link-b" data-pick="${id}">이미지 선택 ›</button><button type="button" class="link-b link-b--g" data-clear="${id}">제거</button><span class="mic n">${hint}</span></div><p class="err" role="alert" hidden>이미지를 선택해 주세요</p></div>`;
  const auto = (k, v) => `<div class="fl"><p class="flab">${k}<em class="tag tag--auto">자동</em></p><div class="auto">${esc(v)}</div></div>`;
  return `<form class="ed dt-cols" id="ed" novalidate aria-label="발행 정보 수정" style="grid-template-rows:minmax(0,1fr) auto">
    <div class="ev ev-scroll ed-l"><div class="ed-th">${th('ed-card', '카드 썸네일 이미지', 'JPG, PNG · 권장 크기 480x320', r.cardThumb)}${th('ed-dash', '대시보드 썸네일 이미지', 'JPG, PNG · 권장 크기 300x260', r.dashThumb)}</div>
      <div class="fl"><p class="flab"><label for="ed-intro">소개</label><span class="sp"></span><span class="cnt" data-for="ed-intro"></span></p><textarea class="inp" id="ed-intro" maxlength="500" placeholder="서비스 소개">${esc(r.intro)}</textarea></div>
      <div class="fl"><p class="flab"><label for="ed-purpose">개발 목적</label><span class="sp"></span><span class="cnt" data-for="ed-purpose"></span></p><textarea class="inp" id="ed-purpose" maxlength="500" placeholder="개발 목적">${esc(r.purpose)}</textarea></div></div>
    <div class="dc ev-scroll ed-r"><div class="fl"><p class="flab"><label for="ed-name">과제명</label><em class="req">*</em></p><input class="inp" id="ed-name" maxlength="100" value="${esc(r.card)}" aria-describedby="ed-name-e"><p class="err" id="ed-name-e" role="alert" hidden>과제명을 입력해 주세요</p></div>
      <div class="fl"><p class="flab"><label for="ed-model">모델명</label><em class="req">*</em></p><input class="inp inp--num" id="ed-model" maxlength="50" value="${esc(r.model)}" aria-describedby="ed-model-e"><p class="err" id="ed-model-e" role="alert" hidden>모델명을 입력해 주세요</p></div>
      ${auto('분석 과제', r.project)}${auto('학습 결과', r.training)}${auto('탐지 형태', r.det)}${auto('데이터 유형', r.data)}
      <div class="fl"><p class="flab">클래스<em class="tag tag--auto">자동</em></p>${classChips(r.classes)}</div></div>
    <div class="ed-f" style="grid-column:1 / -1"><button type="button" class="txt-b" data-act="edit-cancel">취소</button><button type="submit" class="btn btn--l">저장</button></div></form>`;
}
function bindEdit(r) {
  const f = $('#ed'); if (!f) return;
  const img = { 'ed-card': r.cardThumb, 'ed-dash': r.dashThumb };
  const setPv = (id) => { $(`#${id}-f [data-pv]`).innerHTML = img[id] ? fig(img[id], { alt: '' }) : '<figure class="imgcard imgcard--none"><span>이미지 없음</span></figure>'; if (img[id]) $(`#${id}-f .err`).hidden = true; };
  bindCounters(f);
  f.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pick]'); if (p) $(`#${p.dataset.pick}`).click();
    const c = e.target.closest('[data-clear]'); if (c) { img[c.dataset.clear] = ''; setPv(c.dataset.clear); }
  });
  f.addEventListener('change', (e) => {
    if (e.target.type !== 'file' || !e.target.files[0]) return;
    const id = e.target.id, rd = new FileReader(); rd.onload = () => { img[id] = rd.result; setPv(id); }; rd.readAsDataURL(e.target.files[0]);
  });
  f.addEventListener('input', (e) => { const er = $(`#${e.target.id}-e`); if (er) { er.hidden = true; e.target.removeAttribute('aria-invalid'); } });
  f.addEventListener('submit', (e) => {
    e.preventDefault(); let first = null;
    for (const id of ['ed-name', 'ed-model']) { const el = $(`#${id}`), bad = !el.value.trim(); $(`#${id}-e`).hidden = !bad; el.toggleAttribute('aria-invalid', bad); if (bad) { el.setAttribute('aria-invalid', 'true'); first ||= el; } }
    for (const id of ['ed-card', 'ed-dash']) { const bad = !img[id]; $(`#${id}-f .err`).hidden = !bad; if (bad) first ||= $(`[data-pick="${id}"]`); }
    if (first) { first.focus(); return; }
    D.patchRequest(r.id, { card: $('#ed-name').value.trim(), model: $('#ed-model').value.trim(), intro: $('#ed-intro').value.trim(), purpose: $('#ed-purpose').value.trim(), cardThumb: img['ed-card'], dashThumb: img['ed-dash'] });
    say('발행 정보를 수정했습니다'); go({ mode: '' }, { replace: true, focus: '[data-act="edit"]' });
  });
}

function drawDetail() {
  const el = $('#detail'), r = S.open ? D.findRequest(S.open) : null;
  labeling?.destroy(); labeling = null; plate.park();
  el.hidden = !r; if (!r) { el.innerHTML = ''; return; }
  const tabCount = { members: D.membersOf(r.pid).length, labeling: (D.LABELING[r.pid] || []).length, analysis: r.analyses.length };
  if (S.mode === 'edit') {
    el.innerHTML = `<header class="dt-h dt-h--edit"><h2 class="d">발행 정보 수정</h2><span class="dt-m">${esc(r.project)} · ${esc(r.status)}</span></header><div id="dt-body" data-swap>${editHtml(r)}</div>`;
    bindEdit(r); return;
  }
  const body = S.mode === 'process' ? overviewHtml(r, true) : S.tab === 'members' ? membersHtml(r) : S.tab === 'labeling' ? (S.lab != null && D.LABELING[r.pid]?.[S.lab]?.lng ? '' : labelingHtml(r)) : S.tab === 'training' ? trainingHtml(r) : S.tab === 'analysis' ? analysisHtml(r) : overviewHtml(r, false);
  el.innerHTML = `<header class="dt-h"><h2 class="d">${esc(r.project)}</h2>${stWord(r.status)}<span class="dt-m">${esc(r.type)} · ${esc(r.training)}</span><span class="sp"></span><span class="dt-r">요청<span class="n">${esc(r.date)}</span></span><button type="button" class="dt-x" data-act="close" aria-label="세부 닫기">${icon('x')}</button></header>
    <div class="tabs" role="tablist" aria-label="검토 항목">${TABS.map(([k, l]) => `<button type="button" role="tab" id="tab-${k}" data-tab="${k}" aria-selected="${k === S.tab}" aria-controls="dt-body" tabindex="${k === S.tab ? 0 : -1}">${l}${tabCount[k] != null ? `<span class="n">${tabCount[k]}</span>` : ''}</button>`).join('')}</div>
    <div id="dt-body" role="tabpanel" aria-labelledby="tab-${S.tab}" data-swap>${body}</div>`;
  if (S.mode === 'process') bindProcess(r);
  if (!body) { labeling = openLabeling($('#dt-body'), { req: r, idx: S.lab, onClose: () => go({ lab: null }, { focus: `[data-lab="${S.lab}"]` }) }); return; }
  const slot = $('[data-slot="plate"]', el);
  if (slot) {
    plate.place(slot);
    if (S.tab === 'analysis' && !S.mode) { const a = D.analysesOf(r)[S.an ?? 0]; plate.show(r.pid, a?.real ? { mode: 'extent', legend: true, capL: `${D.REAL[a.real].res.title} ${D.REAL[a.real].res.year} · V-World 위성` } : { mode: 'base', gap: '이 분석 결과의 도형은 원본에서 임의 배치였습니다 — 실 결과 GeoJSON 이 없어 지도에 올리지 않습니다', capL: `${a?.name || ''} · V-World 위성` }); }
    else plate.show(r.pid, { mode: 'evidence' });
  }
}

function render(focus = '') {
  const r = S.open ? D.findRequest(S.open) : null, keep = document.activeElement?.closest?.('#q-list [data-id]')?.dataset.id;
  document.title = `${r ? `${r.card} · ` : ''}카드 발행 관리 — Land-XI`;
  drawTiles(); drawCrumbs(r); drawQueue(); drawDetail();
  const f = focus ? $(focus) : keep ? $(`#q-list [data-id="${keep}"]`) : null; f?.focus({ preventScroll: false });
  $(`#q-list [aria-current="true"]`)?.scrollIntoView({ block: 'nearest' });
}

/* ── 이벤트 ── */
$('#pst').addEventListener('click', (e) => { const b = e.target.closest('.pst'); if (b) go({ status: b.dataset.status }, { focus: `.pst[data-status="${b.dataset.status}"]` }); });
$('.crumbs')?.addEventListener('click', (e) => { if (e.target.closest('[data-nav]')) { e.preventDefault(); go({ status: '', open: '', who: '', from: '', to: '', search: false }); } });
$('#q-search-t').addEventListener('click', () => go({ search: !S.search }, { replace: true, focus: S.search ? '#q-search-t' : '#q-who' }));
$('#q-refresh').addEventListener('click', () => { render('#q-refresh'); say('발행 요청 목록을 새로 고쳤습니다'); });
$('#q-search').addEventListener('submit', (e) => { e.preventDefault(); go({ who: $('#q-who').value.trim(), from: $('#q-from').value, to: $('#q-to').value }, { focus: '#q-list' }); });
$('#q-search').addEventListener('reset', (e) => { e.preventDefault(); go({ who: '', from: '', to: '' }, { focus: '#q-who' }); });
$('#q-list').addEventListener('click', (e) => {
  if (e.target.closest('#q-void-reset')) { go({ status: '', who: '', from: '', to: '' }, { focus: '#q-list' }); return; }
  const a = e.target.closest('a[data-id]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault(); go({ open: a.dataset.id, tab: 'overview', mode: '', lab: null, an: null }, { focus: `#q-list [data-id="${a.dataset.id}"]` });
});
$('#q-list').addEventListener('keydown', (e) => {
  const a = e.target.closest('a[data-id]'); if (!a || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const all = $$('#q-list a[data-id]'), i = all.indexOf(a), n = all[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { e.preventDefault(); n.focus(); }
});
$('#detail').addEventListener('click', (e) => {
  const t = e.target.closest('#detail > .tabs [role="tab"]'); if (t) { go({ tab: t.dataset.tab, mode: '', lab: null, an: null }, { focus: `#tab-${t.dataset.tab}` }); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'close') go({ open: '' }, { focus: `#q-list [data-id="${S.open}"]` });
  if (act === 'edit') go({ mode: 'edit', tab: 'overview' }, { focus: '#ed-name' });
  if (act === 'process') go({ mode: 'process', lab: null }, { focus: 'input[name="proc-status"]:checked' });
  if (act === 'proc-cancel') go({ mode: '' }, { focus: '[data-act="process"]' });
  if (act === 'edit-cancel') go({ mode: '' }, { focus: '[data-act="edit"]' });
  const lab = e.target.closest('[data-lab]'); if (lab && D.LABELING[D.findRequest(S.open).pid][+lab.dataset.lab].lng) go({ lab: +lab.dataset.lab }, { focus: '.lm-t' });
  const an = e.target.closest('[data-an]'); if (an) go({ an: +an.dataset.an }, { focus: `[data-an="${an.dataset.an}"]` });
});
$('#detail').addEventListener('keydown', (e) => {
  const t = e.target.closest('#detail > .tabs [role="tab"]');
  if (t && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
    e.preventDefault(); const i = TABS.findIndex(([k]) => k === t.dataset.tab), n = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    go({ tab: TABS[n][0], mode: '', lab: null, an: null }, { focus: `#tab-${TABS[n][0]}` });
  }
  if (e.key === 'Escape' && S.mode && !document.body.hasAttribute('data-modal')) { e.preventDefault(); go({ mode: '' }, { focus: S.mode === 'edit' ? '[data-act="edit"]' : '[data-act="process"]' }); }
});
addEventListener('popstate', () => { read(); render(); });

read(); render();
