/* 통계 — 지도 작업공간 안 우 서랍 620(B7 선택 1). 원판 B7-Stats-Opt1 · -Class · -Empty · -Find.
   수치는 전부 실 GeoJSON 집계다(byEmd · byClass). 표의 행 = 지도의 읍면동 — 행에 올리면 그 읍면동이 켜진다.
   모달 · 표 · 페이저 · 토스트는 셸 것을 그대로 쓴다. */
import { openModal, mountPager, bindRows, say, icon, esc, nf, $, $$ } from './shell.js';
import * as D from './map-data.js';
import { openPledge } from './map-pledge.js';

let tab = 'region', basis = null, filt = { emd: '', cls: '' }, page = 1, size = 10, pickBar = -1, host = null, api = null, ctxRef = null;

export function mountStats(el, ctx, o = {}) {
  host = el; api = o; ctxRef = ctx;
  if (!basis) basis = D.statsBasis(ctx.layer?.service || 'farmland')[0];
  size = sizePref;                         // 들어올 때마다 원하는 쪽 크기에서 다시 재 본다
  draw();
  if (!bound) { bound = true; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (host?.isConnected) { size = sizePref; draw(); } }, 180); }); }
}
let bound = false, rt = 0, raf = 0;
/* 읍·면·동 막대가 어느 칸에 서는가 —
   칸이 넓으면 조건 칸(.dw-l) 아래, 좁으면 결과 칸(.dw-r) 으로 옮긴다.
   좁아지면 거르개가 두 줄이 되어 왼쪽이 494px 까지 커지는데, 오른쪽은 표가
   쪽 크기를 줄여 스스로 자리를 낸다(fitRows). 무거운 쪽에서 가벼운 쪽으로 옮기는 것이다. */
const chartLeft = () => innerWidth >= 1560;

function draw() {
  const { layer, geo, ctx } = ctxRef;
  const empty = !layer || !geo || !geo.features.length;
  const all = D.statsBasis(layer?.service || 'farmland');
  /* 서랍 속 구조 — `조건(.dw-l)` 과 `결과(.dw-r)` 두 덩어리로 나눠 담는다.
     좁은 서랍에서는 위아래로 쌓이고, 넓은 서랍(짧은 모니터에서 서랍이 넓어질 때)에서는
     좌우로 나란히 선다(map.css `.dw--split`). 대시보드에서 쓴 방법과 같다 —
     세로로 쌓인 줄을 좌우로 펴서 줄 수를 없앤다. 지우는 것은 없다. */
  host.innerHTML = `<div class="dw dw--split">
  <div class="dw-h"><div><p class="lb">통계 자세히 보기</p><h2>${esc(taskName(ctx, layer))} 통계</h2>
    <p class="dw-sub">AI 분석 과제(${esc(taskName(ctx, layer))} 분석)의 ${esc((layer?.classes || []).map(D.clsLabel).join('·'))} 면적 집계를 확인해요</p></div>
    <button type="button" class="x" id="st-x" aria-label="닫기">${icon('x', 18)}</button></div>

  <div class="dw-l">
  <section class="dw-sec"><div class="dw-sec-h"><span class="lb">기준 (최근 분석 결과)</span><button type="button" class="link" id="st-more">더 보기 ›</button>
      <span class="acts"><button type="button" class="btn-br" id="st-reset" style="width:84px">초기화</button><button type="button" class="btn" id="st-run" style="width:100px">통계 보기</button></span></div>
    <ul class="dw-basis" role="radiogroup" aria-label="통계 기준">${all.slice(0, 3).map((b) => `
      <li aria-selected="${basis.id === b.id}"><label class="rd" style="gap:9px"><input type="radio" name="st-basis" value="${esc(b.id)}"${basis.id === b.id ? ' checked' : ''}><span class="t">${esc(b.title)}</span></label>${b.demo ? '<em class="tag">시연</em>' : ''}
      <span class="m">${esc(b.at.replace(/-/g, '.'))}${b.count ? ` · ${esc(b.model)} · ${nf.format(b.count)} ${esc(b.unit)}` : ` · ${esc(b.task)}`}</span></li>`).join('')}</ul>
    <p class="dw-note">기준을 바꾸면 <b>통계 보기</b>를 다시 누릅니다</p></section>

  <form class="dw-filters" id="st-f">
    <span class="f f--sido"><span class="lb">시도</span><span class="sel"><select aria-label="시도"><option>${esc(adminName(geo).sido)}</option></select></span></span>
    <span class="f f--sgg"><span class="lb">시군구</span><span class="sel"><select aria-label="시군구"><option>${esc(adminName(geo).sgg)}</option></select></span></span>
    <span class="f f--emd"><span class="lb">${esc(ctx.unitExample)}</span><span class="sel"><select name="emd" aria-label="${esc(ctx.unitExample)}"><option value="">전체</option>${(empty ? [] : D.byEmd(geo)).map((r) => `<option${filt.emd === r.emd ? ' selected' : ''}>${esc(r.emd)}</option>`).join('')}</select></span></span>
    <span class="f f--cls"><span class="lb">클래스</span><span class="sel"><select name="cls" aria-label="클래스"><option value="">전체</option>${(layer?.classes || []).map((c) => `<option value="${esc(c)}"${filt.cls === c ? ' selected' : ''}>${esc(D.clsLabel(c))}</option>`).join('')}</select></span></span>
    <span class="g"><button type="reset" class="mic">초기화</button><button class="btn-br" style="width:84px">조회</button></span></form>
  ${empty || tab !== 'region' || !chartLeft() ? '' : chartHtml()}</div>

  <div class="dw-r">
  ${empty ? '' : tab === 'region' ? bigHtml() : ''}
  ${empty || tab !== 'region' || chartLeft() ? '' : chartHtml()}
  <div class="dw-tabs" role="tablist"><button type="button" role="tab" data-tab="region" aria-selected="${tab === 'region'}">지역별 통계</button>
    <button type="button" role="tab" data-tab="class" aria-selected="${tab === 'class'}">클래스별 통계</button><span class="sp"></span>
    <button type="button" class="dl" id="st-dl">${icon('down', 15)} 엑셀 다운로드</button></div>
  <div id="st-b">${empty ? emptyHtml() : tab === 'region' ? regionHtml() : classHtml()}</div></div>
</div>`;
  bind(empty);
}
const taskName = (ctx, l) => (l?.service === 'farmland' ? '농지 활용' : l?.service === 'greenhouse' ? '비닐하우스' : l?.service === 'marine' ? '해양쓰레기' : l?.title || '분석');
function adminName(geo) { return D.adminOf(geo?.features?.[0]?.properties.pnu); }

function emptyHtml() {
  return `<div class="empty">${icon('grid', 30)}<p class="empty-t">AI 분석이 완료된 후 이용할 수 있어요</p><p class="empty-w">왼쪽에서 결과 레이어를 켜면 그 결과의 집계가 여기에 섭니다</p></div>
  <div class="dw-ghost"><p class="mic">집계가 서면 이 자리에 ${esc(ctxRef.ctx.unitExample)}별 막대와 표가 그려집니다</p>
    <div class="gb">${Array.from({ length: 32 }, () => '<span style="height:' + (14 + Math.random() * 30).toFixed(0) + 'px"></span>').join('')}</div><div class="gc"></div></div>
  <p class="mic" style="margin-top:12px">곤포 사일리지 등 일부 과제는 원본에서도 통계를 제공하지 않습니다 — 준비 중</p>`;
}

function rowsOf() {
  const { geo } = ctxRef;
  let fs = geo.features;
  if (filt.cls) fs = fs.filter((f) => f.properties.cls === filt.cls);
  if (filt.emd) fs = fs.filter((f) => f.properties.emd === filt.emd);
  return { fc: { type: 'FeatureCollection', features: fs }, n: fs.length };
}
/* 요약은 둘로 나눠 두 칸에 나눠 담는다 — 큰 수치는 표 위(.dw-r), 막대는 조건 아래(.dw-l).
   한 칸에 몰아 두었더니 왼쪽 칸이 507px 이 되어 22px 가 넘쳤다(오른쪽은 413px 로 남고). */
/** 큰 수치 — 결과 칸(.dw-r) 맨 위 */
function bigHtml() {
  const { fc } = rowsOf();
  const total = D.totalArea(fc), byC = D.byClass(fc);
  return `
  <div class="dw-big"><span class="k1"><b>${D.ha(total).toFixed(1)}</b><span class="u">ha 전체</span><span class="s">${nf.format(Math.round(total))} ㎡</span></span>
    ${byC.map((c) => `<span><b>${D.ha(c.area).toFixed(1)}</b><span class="u">ha</span><span class="s"><span class="sw${D.isDashCls(c.cls) ? ' sw--o' : ''}"></span>${esc(c.label)} · ${Math.round(c.pct)} %</span></span>`).join('')}</div>`;
}
/** 읍·면·동별 막대 — 조건 칸(.dw-l) 아래쪽 */
function chartHtml() {
  const { layer, ctx } = ctxRef;
  const { fc } = rowsOf();
  const rows = D.byEmd(fc), cls = layer.classes;
  const max = Math.max(...rows.map((r) => r.area), 1);
  const from = (page - 1) * size;
  return `
  <div class="dw-chart"><div class="hd">${esc(ctx.unitExample)}별 분석 면적(㎡) · 큰 순 · ${rows.length}<span class="sp"></span>표 ${rows.length ? from + 1 : 0}~${Math.min(rows.length, from + size)} / ${rows.length}행</div>
    <div class="dw-bars" role="group" aria-label="${esc(ctx.unitExample)}별 분석 면적">${rows.map((r, i) => `<button type="button" data-bar="${i}" aria-pressed="${pickBar === i}" style="height:${Math.max(6, (r.area / max) * 62)}px" aria-label="${esc(r.emd)} ${nf.format(Math.round(r.area))} 제곱미터" title="${esc(r.emd)} · ${nf.format(Math.round(r.area))} ㎡"><i style="height:${Math.round(((r.cls[cls[0]] || 0) / (r.area || 1)) * 100)}%"></i></button>`).join('')}</div>
    ${pickBar >= 0 && rows[pickBar] ? `<p class="mic" style="margin-top:6px">${esc(rows[pickBar].emd)} · ${nf.format(Math.round(rows[pickBar].area))} ㎡ · ${nf.format(rows[pickBar].n)} ${esc(layer.unit)}</p>` : ''}</div>`;
}
function regionHtml() {
  const { layer, ctx } = ctxRef;
  const { fc } = rowsOf();
  const rows = D.byEmd(fc), cls = layer.classes;
  const max = Math.max(...rows.map((r) => r.area), 1);
  const from = (page - 1) * size, part = rows.slice(from, from + size);
  void layer;
  return `
  <div class="tbl-wrap"><table class="tbl tbl--s"><colgroup><col class="c-emd"><col class="c-n">${cls.map(() => '<col class="c-n">').join('')}<col class="c-bar"></colgroup>
    <thead><tr><th>${esc(ctx.unitExample)}</th><th class="r">전체(㎡)</th>${cls.map((c) => `<th class="r">${esc(D.clsLabel(c))}(㎡)</th>`).join('')}<th><span class="sr">${cls.map(D.clsLabel).join(' · ')} 비율 막대</span>${cls.map((c) => `<span class="sw" style="display:inline-block;width:10px;height:10px;border:1px solid var(--teal);background:${D.isDashCls(c) ? 'none' : 'var(--teal)'}"></span>`).join(' ')}</th></tr></thead>
    <tbody id="st-tb">${part.map((r) => `<tr data-row tabindex="0" data-emd="${esc(r.emd)}" aria-selected="${pickBar === r.rank - 1}"><td><b>${esc(r.emd)}</b></td><td class="num r">${nf.format(Math.round(r.area))}</td>${cls.map((c) => `<td class="num r">${nf.format(Math.round(r.cls[c] || 0))}</td>`).join('')}
      <td><span class="dw-tbl-bar" style="width:${Math.round((r.area / max) * 100)}%"><i style="width:${Math.round(((r.cls[cls[0]] || 0) / (r.area || 1)) * 100)}%"></i></span></td></tr>`).join('')}</tbody></table></div>
  <nav id="st-pg" style="margin-top:8px"></nav>`;
}
function classHtml() {
  const { layer, geo } = ctxRef;
  const { fc } = rowsOf();
  const rows = D.byClass(fc), total = D.totalArea(fc);
  const ad = adminName(geo);
  return `
  <div class="dw-sec-h"><span class="lb" style="font-size:16px;color:var(--ink)">클래스별 집계</span><span class="sp"></span><span class="mic">${esc(ad.sgg)} · 전체 ${nf.format(Math.round(total))} ㎡</span></div>
  <div class="tbl-wrap"><table class="tbl"><colgroup><col><col style="width:150px"><col style="width:110px"></colgroup>
    <thead><tr><th>클래스</th><th class="r">면적(㎡)</th><th class="r">비율(%)</th></tr></thead>
    <tbody id="st-tb">${rows.map((r) => `<tr data-row tabindex="0" data-cls="${esc(r.cls)}" aria-selected="${filt.cls === r.cls}"><td><b>${esc(r.label)}</b></td><td class="num r">${nf.format(Math.round(r.area))}</td><td class="num r">${r.pct.toFixed(1)}</td></tr>
      <tr class="is-dim"><td colspan="3" style="padding:0 12px 8px"><span class="dw-tbl-bar" style="width:${r.pct.toFixed(1)}%"><i style="width:${D.isDashCls(r.cls) ? 0 : 100}%"></i></span></td></tr>`).join('')}</tbody></table></div>
  <p class="lb" style="margin-top:16px">이 클래스로 탐지된 ${esc(layer.unit)} · 실사 크롭</p>
  <div class="dw-crops">${rows.slice(0, 2).map((r, i) => {
    const f = fc.features.filter((x) => x.properties.cls === r.cls).sort((a, b) => (b.properties.area || 0) - (a.properties.area || 0))[0];
    return `<figure><img src="${esc(D.CROP)}${esc(layer.id)}/${i + 1}.jpg" alt="${esc(r.label)} 실사 크롭"><span class="cap">${nf.format(Math.round(f?.properties.area || 0))} ㎡ · LX 정사영상</span><figcaption data-on="${filt.cls === r.cls ? 1 : 0}">${esc(r.label)}</figcaption></figure>`;
  }).join('')}</div>`;
}

function bind(empty) {
  $('#st-x').onclick = () => api.onClose?.();
  $('#st-more').onclick = openFind;
  $('#st-reset').onclick = () => { basis = D.statsBasis(ctxRef.layer?.service || 'farmland')[0]; filt = { emd: '', cls: '' }; page = 1; pickBar = -1; draw(); };
  $('#st-run').onclick = () => { page = 1; draw(); say(`기준 · ${basis.title} 으로 통계를 다시 계산했습니다`); };
  $('#st-dl').onclick = () => openPledge({ targets: ctxRef.layer ? [ctxRef.layer] : [], kind: '엑셀', onDone: (v) => say(`엑셀 다운로드가 시작되었습니다 · ${v.name}`, 6000) });
  host.querySelector('.dw-basis').onchange = (e) => { const b = D.statsBasis(ctxRef.layer?.service || 'farmland').find((x) => x.id === e.target.value); if (b) { basis = b; draw(); } };
  host.querySelector('.dw-tabs').onclick = (e) => { const t = e.target.closest('[data-tab]'); if (!t) return; tab = t.dataset.tab; page = 1; draw(); };
  const f = $('#st-f');
  f.onsubmit = (e) => { e.preventDefault(); const d = new FormData(f); filt = { emd: d.get('emd') || '', cls: d.get('cls') || '' }; page = 1; draw(); if (filt.emd) api.onFocusEmd?.(filt.emd); };
  f.onreset = () => setTimeout(() => { filt = { emd: '', cls: '' }; page = 1; draw(); }, 0);
  if (empty) return;
  const bars = host.querySelector('.dw-bars');
  if (bars) bars.onclick = (e) => { const b = e.target.closest('[data-bar]'); if (!b) return; pickBar = +b.dataset.bar; const r = D.byEmd(rowsOf().fc)[pickBar]; page = Math.floor(pickBar / size) + 1; draw(); api.onFocusEmd?.(r.emd); };
  const tb = $('#st-tb');
  if (tb) {
    bindRows(tb, (tr) => { if (tr.dataset.emd) { pickBar = D.byEmd(rowsOf().fc).findIndex((r) => r.emd === tr.dataset.emd); api.onFocusEmd?.(tr.dataset.emd); } else if (tr.dataset.cls) { filt.cls = filt.cls === tr.dataset.cls ? '' : tr.dataset.cls; draw(); } });
    $$('[data-emd]', tb).forEach((tr) => { tr.onmouseenter = () => api.onFocusEmd?.(tr.dataset.emd); });
  }
  const pg = $('#st-pg');
  if (pg) mountPager(pg, { total: D.byEmd(rowsOf().fc).length, page, size, sizes: sizeList(), onChange: (st) => { page = st.page; sizePref = size = st.size; draw(); } });
  fitRows();
}

/* ── 한 쪽 행 수를 화면 높이에 맞춘다 ──────────────────────────────────
   발주자: "업무 화면은 한 화면에서 끝난다" · "모니터마다 최적화를 해야지".
   서랍을 두 칸으로 편 뒤에도 짧은 모니터에서는 표가 몇 줄 넘친다.
   넘치는 만큼만 한 쪽의 행 수를 줄이고, 길면 다시 늘린다.
   쪽넘김이 `총 32건 중 1~N 행` 을 계속 말하므로 지운 것이 아니다 —
   사용자가 페이지 크기를 직접 고르면 그 값을 기준으로 삼는다. */
const MIN_ROWS = 4;
let sizePref = 10, fitPass = 0;
const sizeList = () => [...new Set([size, 5, 10, 20])].sort((a, b) => a - b);
function fitRows() {
  const dw = host.querySelector('.dw'), tb = $('#st-tb');
  if (tab !== 'region' || !dw || !tb || !tb.rows.length) { fitPass = 0; return; }
  const rh = Math.max(20, tb.rows[0].getBoundingClientRect().height);
  const over = dw.scrollHeight - dw.clientHeight;
  let next = size;
  if (over > 2) next = Math.max(MIN_ROWS, size - Math.ceil(over / rh));
  else if (size < sizePref && -over >= rh) next = Math.min(sizePref, size + Math.floor(-over / rh));
  if (next !== size && fitPass < 6) { fitPass++; size = next; page = 1; draw(); return; }
  fitPass = 0;
  // 글꼴·그림이 늦게 앉으면 높이가 바뀐다 — 한 프레임 뒤에 한 번 더 잰다
  cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (host?.isConnected) fitRows(); });
}

/* ── 분석 결과 찾기 모달(원본 `더 보기`) ─────────────────────────────── */
function openFind() {
  const all = D.statsBasis(ctxRef.layer?.service || 'farmland');
  let pick = basis.id, q = '', quick = 'all';
  const m = openModal({ title: '분석 결과 찾기', width: 1080,
    content: `
<form class="filters" id="fd-f" role="search" style="padding-bottom:14px">
  <span class="f-lab">검색어</span><span class="sel"><select id="fd-k" aria-label="검색 항목"><option>전체</option><option>분석명</option><option>영상 명</option></select></span>
  <input class="inp" id="fd-q" placeholder="검색어를 입력하세요." aria-label="검색어" style="min-width:230px">
  <span class="f-lab">실행자</span><span class="sel"><select aria-label="실행자"><option>전체</option><option>관리자</option><option>사용자</option></select></span>
  <span class="f-lab">기준일</span><input class="inp" type="date" aria-label="시작"><span class="tilde">~</span><input class="inp" type="date" aria-label="끝">
  <span class="chips" role="group" aria-label="기간">${[['all', '전체'], ['1', '1개월'], ['3', '3개월'], ['6', '6개월'], ['12', '12개월']].map(([k, l]) => `<button type="button" class="chip-b" data-q="${k}" aria-pressed="${quick === k}">${l}</button>`).join('')}</span>
</form>
<div class="dw-sec-h"><span class="lb" style="font-size:16px;color:var(--ink)">AI 분석 내역</span><span class="sp"></span><span class="filters-acts"><button type="button" class="btn-br" id="fd-reset" style="width:96px">초기화</button><button type="button" class="btn-br" id="fd-go" style="width:96px">검색</button></span></div>
<div class="tbl-wrap"><table class="tbl tbl--s"><colgroup><col style="width:60px"><col style="width:120px"><col style="width:260px"><col style="width:130px"><col style="width:130px"><col><col style="width:150px"></colgroup>
  <thead><tr><th>선택</th><th>기준 일자</th><th>영상 명</th><th>분석 범위 유형</th><th>분석 범위 명</th><th>분석명</th><th>분석 과제명</th></tr></thead>
  <tbody id="fd-tb"></tbody></table></div>
<p class="mic" style="border:1px solid var(--line);padding:12px 14px;margin:12px 0 0">${esc(taskName(ctxRef.ctx, ctxRef.layer))} 분석으로 끝난 작업은 ${all.length}건입니다 · 다른 과제의 결과는 그 과제의 통계에서 찾습니다</p>
<nav id="fd-pg" style="margin-top:10px"></nav>`,
    actions: [{ label: '취소', kind: 'bracket' }, { label: '확인', kind: 'primary', onClick: () => { const b = all.find((x) => x.id === pick); if (b) { basis = b; draw(); say(`기준을 ${b.title} 으로 바꿨습니다 — 통계 보기를 누르세요`); } } }],
  });
  const rows = () => all.filter((b) => !q || (b.title + b.image).includes(q));
  function fill() {
    const list = rows();
    $('#fd-tb', m.el).innerHTML = list.length ? list.map((b) => `<tr data-row tabindex="0" data-id="${esc(b.id)}" aria-selected="${pick === b.id}">
      <td class="c"><label class="rd"><input type="radio" name="fd" value="${esc(b.id)}"${pick === b.id ? ' checked' : ''}><span class="sr">${esc(b.title)}</span></label></td>
      <td class="num">${esc(b.at.replace(/-/g, '.'))}</td><td>${esc(b.image)}${b.demo ? ' <em class="tag">시연</em>' : ''}</td><td>${esc(b.scopeType)}</td><td>${esc(b.scopeName)}</td><td>${esc(b.title)}</td><td>${esc(b.task)}</td></tr>`).join('')
      : `<tr><td colspan="7"><div class="empty empty--s">${icon('search', 24)}<p class="empty-t">검색 결과가 없습니다</p></div></td></tr>`;
    bindRows($('#fd-tb', m.el), (tr) => { if (tr.dataset.id) { pick = tr.dataset.id; $$(`input[name="fd"]`, m.el).forEach((r) => { r.checked = r.value === pick; }); } });
    mountPager($('#fd-pg', m.el), { total: list.length, page: 1, size: 5, sizes: [5, 10], onChange: () => {} });
  }
  m.el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-q]');
    if (c) { quick = c.dataset.q; $$('[data-q]', m.el).forEach((b) => b.setAttribute('aria-pressed', String(b === c))); return; }
    if (e.target.closest('#fd-go')) { q = $('#fd-q', m.el).value.trim(); fill(); return; }
    if (e.target.closest('#fd-reset')) { q = ''; $('#fd-q', m.el).value = ''; quick = 'all'; $$('[data-q]', m.el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === 'all'))); fill(); }
  });
  $('#fd-f', m.el).onsubmit = (e) => { e.preventDefault(); q = $('#fd-q', m.el).value.trim(); fill(); };
  fill();
}
