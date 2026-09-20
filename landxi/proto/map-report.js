/* 보고서 — 같은 우 서랍의 탭 둘(원본 mountReportTabs: 발급 요청 · 발급 내역).
   원판 B7-Report-Issue · -Issue-Error · -List · -List-Empty · -Pledge.
   체크한 읍면동은 지도에 켜지고, 미리보기 수치(필지 · ha)는 실 GeoJSON 집계다 — 서버 호출 없음. */
import { mountPager, bindRows, say, icon, esc, nf, $, $$ } from './shell.js';
import * as D from './map-data.js';
import { openPledge } from './map-pledge.js';

let tab = 'issue', host = null, api = null, C = null;
let form = { title: '', cls: [], emds: [], touched: false };
let q = { k: '전체', q: '', state: 'all', from: '', to: '', quick: 'all' }, page = 1, size = 10, sel = '';

export function mountReport(el, ctx, o = {}) {
  host = el; api = o; C = ctx; tab = o.tab === 'list' ? 'list' : 'issue';
  size = sizePref;                         // 들어올 때마다 원하는 쪽 크기에서 다시 재 본다
  if (!bound) { bound = true; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (host?.isConnected) { size = sizePref; draw(); } }, 180); }); }
  const rows = ctx.geo ? D.byEmd(ctx.geo) : [];
  if (!form.touched) {
    form.title = `${D.today().getFullYear()}년 ${D.today().getMonth() + 1}월 ${D.adminOf(ctx.geo?.features?.[0]?.properties.pnu).sgg} ${task()} 현황 보고서`;
    form.cls = [...(ctx.layer?.classes || [])];
    form.emds = [...rows].sort((a, b) => b.n - a.n).slice(0, 5).map((r) => r.emd);
  }
  draw();
  if (tab === 'issue') api.onFocusEmd?.(form.emds);
  else api.onFocusEmd?.(emdsOf(list()[0]));
}
const task = () => (C.layer?.service === 'farmland' ? '농지 활용' : C.layer?.service === 'greenhouse' ? '비닐하우스' : C.layer?.service === 'marine' ? '해양쓰레기' : '분석');
const emdsOf = (r) => (!r ? [] : r.all ? (C.geo ? D.byEmd(C.geo).map((x) => x.emd) : []) : r.emds);

function draw() {
  const n = D.reports().length;
  /* 서랍 속 구조 — 왼쪽은 `무엇을 넣을지`(탭 · 폼 · 거르개), 오른쪽은 `그 결과`
     (미리보기 · 발급 목록). 넓은 서랍에서는 좌우로 선다(map.css `.dw--split`). */
  host.innerHTML = `<div class="dw dw--split">
  <div class="dw-h"><div><p class="lb">보고서</p><h2>${esc(task())} 보고서 발급 ${tab === 'issue' ? '요청' : '내역'}</h2>
    <p class="dw-sub">AI 분석 과제(${esc(task())} 분석)의 ${esc((C.layer?.classes || []).map(D.clsLabel).join('·'))} 면적을 엑셀 보고서로 발급받을 수 있습니다.</p></div>
    <button type="button" class="x" id="rp-x" aria-label="닫기">${icon('x', 18)}</button></div>
  <div class="dw-l">
  <div class="dw-tabs" role="tablist"><button type="button" role="tab" data-rt="issue" aria-selected="${tab === 'issue'}">보고서 발급 요청</button>
    <button type="button" role="tab" data-rt="list" aria-selected="${tab === 'list'}">보고서 발급 내역<span class="n" style="margin-left:6px;color:var(--grey)">${n}</span></button></div>
  ${tab === 'issue' ? issueFormHtml() + previewHtml() : listFilterHtml()}</div>
  <div class="dw-r" id="rp-b">${tab === 'issue' ? scopeHtml() + emdsHtml() : listHtml()}</div></div>
  ${tab === 'issue' ? `<div class="dw-f"><span class="mic">접수되면 발급 내역에서 진행 상태를 확인합니다</span><button type="button" class="btn-br" id="rp-cancel" style="width:84px">취소</button><button type="button" class="btn" id="rp-go" style="width:110px">발급 요청</button></div>` : ''}`;
  bind();
}

/* ── 발급 요청 ──────────────────────────────────────────────────────── */
function issueFormHtml() {
  const rows = C.geo ? D.byEmd(C.geo) : [];
  const all = C.emdGeo ? C.emdGeo.features.map((f) => f.properties.nm) : rows.map((r) => r.emd);
  const ad = D.adminOf(C.geo?.features?.[0]?.properties.pnu);
  const err = (k) => form.touched && ((k === 'title' && !form.title.trim()) || (k === 'cls' && !form.cls.length) || (k === 'emd' && !form.emds.length));
  return `
  <div class="form">
    <div class="field field--12"><div class="field-h"><label class="field-l" for="rp-title">보고서 제목<em class="req">*</em></label></div>
      <input id="rp-title" class="inp" maxlength="80" value="${esc(form.title)}"${err('title') ? ' aria-invalid="true" aria-describedby="rp-title-e"' : ''}>
      ${err('title') ? '<p class="err" id="rp-title-e">보고서 제목을 입력해 주세요.</p>' : ''}</div>
  </div>`;
  void all; void ad;
}
/* 무엇을(탐지 클래스) · 어디를(대상 지역) — 보고서가 담을 범위라 한 칸에 모은다.
   왼쪽 칸에 다 쌓았을 때 1280×720 에서 32px 가 넘쳤다. */
function scopeHtml() {
  const err = (k) => form.touched && ((k === 'cls' && !form.cls.length) || (k === 'emd' && !form.emds.length));
  return `<div class="field field--12"><div class="field-h"><span class="field-l">탐지 클래스<em class="req">*</em></span></div>
      <div class="rp-cls"><label class="ck"><input type="checkbox" id="rp-cls-all"${form.cls.length === (C.layer?.classes || []).length ? ' checked' : ''}>전체 선택</label><span class="bar"></span>
        ${(C.layer?.classes || []).map((c) => `<label class="ck"><input type="checkbox" data-cls="${esc(c)}"${form.cls.includes(c) ? ' checked' : ''}>${esc(D.clsLabel(c))}</label>`).join('')}</div>
      ${err('cls') ? '<p class="err">탐지 클래스를 하나 이상 선택해 주세요.</p>' : ''}</div>`;
}
/* 대상 지역 — 읍·면·동 32개 체크. 가장 넓은 자리가 필요해서 넓은 칸(.dw-r)에 둔다.
   왼쪽에 다 쌓았을 때는 왼쪽 칸이 551px 이 되고 오른쪽은 235px 로 비어 있었다. */
function emdsHtml() {
  const rows = C.geo ? D.byEmd(C.geo) : [];
  const all = C.emdGeo ? C.emdGeo.features.map((f) => f.properties.nm) : rows.map((r) => r.emd);
  const ad = D.adminOf(C.geo?.features?.[0]?.properties.pnu);
  const err = form.touched && !form.emds.length;
  return `
  <div class="field field--12"><div class="field-h"><span class="field-l">대상 지역<em class="req">*</em></span>
      <span class="mic">${esc(C.ctx.unitExample)} ${all.length} · 여러 개 선택</span></div>
    <div class="field-row"><span class="sel" style="flex:1"><select aria-label="시도"><option>${esc(ad.sido)}</option></select></span><span class="arrow">${icon('chevR', 14)}</span>
      <span class="sel" style="flex:1"><select aria-label="시군구"><option>${esc(ad.sgg)}</option></select></span></div>
    <div class="rp-emds"><div class="all"><label class="ck"><input type="checkbox" id="rp-emd-all"${form.emds.length === all.length ? ' checked' : ''}>전체 선택</label></div>
      <div class="grid">${all.map((nm) => `<label class="ck"><input type="checkbox" data-emd="${esc(nm)}"${form.emds.includes(nm) ? ' checked' : ''}${rows.some((r) => r.emd === nm) ? '' : ' disabled'}>${esc(nm)}</label>`).join('')}</div></div>
    ${err ? '<p class="err">대상 지역을 하나 이상 선택해 주세요.</p>' : ''}</div>`;
}
/** 미리보기 — 오른쪽 칸. 폼을 건드릴 때마다 여기만 다시 그린다(syncIssue). */
function previewHtml() {
  const rows = C.geo ? D.byEmd(C.geo) : [];
  const picked = rows.filter((r) => form.emds.includes(r.emd)).sort((a, b) => b.area - a.area);
  const nP = picked.reduce((a, r) => a + r.n, 0), area = picked.reduce((a, r) => a + r.area, 0);
  const max = Math.max(...picked.map((r) => r.area), 1);
  return `
  <div class="rp-pre"><div class="l"><p class="t">발급 미리보기 · 엑셀 1 파일</p>
      <b class="k">${nf.format(nP)}</b><span class="u">${esc(C.layer?.unit || '건')}</span>
      <b>${D.ha(area).toFixed(1)}</b><span class="u">ha</span>
      <p class="s">${esc(C.ctx.unitExample)} ${picked.length} · 클래스 ${form.cls.length}</p></div>
    <div class="r">${picked.slice(0, 5).map((r) => `<div class="row"><span class="nm">${esc(r.emd)}</span><span class="cnt">${nf.format(r.n)} ${esc(C.layer?.unit || '')}</span><span class="m"><i style="width:${Math.round((r.area / max) * 100)}%"></i></span><span class="v">${nf.format(Math.round(r.area))} ㎡</span></div>`).join('') || '<p class="mic">대상 지역을 고르면 여기에 요약이 섭니다</p>'}
      ${picked.length > 5 ? `<p class="mic">그 외 ${picked.length - 5} ${esc(C.ctx.unitExample)}</p>` : ''}</div></div>`;
}

/* ── 발급 내역 ──────────────────────────────────────────────────────── */
function list() {
  return D.reports().filter((r) => (q.state === 'all' || r.state === q.state) && (!q.q || r.title.includes(q.q)));
}
/** 거르개 — 왼쪽 칸(발급 내역 탭) */
function listFilterHtml() {
  return `
  <form class="dw-filters" id="rp-q" role="search">
    <span class="f" style="flex:26"><span class="lb">검색어</span><span class="sel"><select name="k" aria-label="검색 항목"><option>전체</option><option>제목</option><option>요청자</option></select></span></span>
    <span class="f" style="flex:44"><span class="lb">&nbsp;</span><input class="inp" name="q" placeholder="검색어를 입력하세요." aria-label="검색어" value="${esc(q.q)}"></span>
    <span class="f" style="flex:26"><span class="lb">상태</span><span class="sel"><select name="state" aria-label="상태">${D.REPORT_STATES.map((s) => `<option value="${s.k}"${q.state === s.k ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></span></span>
    <span class="g"><button type="reset" class="mic">초기화</button><button class="btn-br" style="width:84px">검색</button></span>
    <span class="f" style="flex:100 1 100%"><span class="lb">발급 일자</span><span class="field-row"><input class="inp inp--s" type="date" name="from" aria-label="시작"><span class="tilde">~</span><input class="inp inp--s" type="date" name="to" aria-label="끝"></span></span>
    <span class="f" style="flex:100 1 100%"><span class="chips" role="group" aria-label="기간">${[['all', '전체'], ['1', '1개월'], ['3', '3개월'], ['6', '6개월'], ['12', '12개월']].map(([k, l]) => `<button type="button" class="chip-b" data-q="${k}" aria-pressed="${q.quick === k}">${l}</button>`).join('')}</span></span>
  </form>`;
}
function listHtml() {
  const rows = list();
  const from = (page - 1) * size, part = rows.slice(from, from + size);
  return `
  <div class="dw-sec-h"><span class="lb" style="font-size:16px;color:var(--ink)">보고서 목록</span>
    <span class="mic">전체 ${rows.length}건 중 ${rows.length ? from + 1 : 0}~${Math.min(rows.length, from + size)}행</span><em class="tag">시연</em>
    <span class="sp"></span><button type="button" class="btn" id="rp-new" style="width:84px">발급</button></div>
  ${rows.length ? `<ul class="rp-list" id="rp-tb">${part.map((r) => `<li><button type="button" class="rp" data-row tabindex="0" data-id="${esc(r.id)}" aria-selected="${sel === r.id}">
      <span class="l1"><span class="st${r.state === 'done' ? ' st--acc' : r.state === 'fail' || r.state === 'doing' ? ' st--warn' : ''}">${esc(D.repStateLabel(r.state))}</span><span class="n">${esc(r.at)}</span><span>요청자 ${esc(r.by)}</span><span>다운로드 <span class="n">${r.dl}</span>회</span></span>
      <span class="l2">${esc(r.title)}</span>
      <span class="l3"><span>탐지 클래스 <b>${esc(r.cls.map(D.clsLabel).join(', '))}</b></span><span>대상 지역 <b>${esc(r.all ? '남원시 전역' : r.emds.join('·'))}</b></span></span>
      ${r.state === 'done' ? `<span class="btn-br btn-br--s dl" role="presentation">${icon('down', 14)} 엑셀 다운로드</span>` : r.state === 'doing' ? '<span class="pr"><i style="width:46%"></i></span>' : ''}</button></li>`).join('')}</ul>
    <nav id="rp-pg" style="margin-top:8px"></nav>`
    : `<div class="empty">${icon('clip', 30)}<p class="empty-t">검색 결과가 없어요.</p><p class="empty-w">검색어 · 상태 · 발급 일자를 바꿔 다시 찾아 보세요</p></div>
       <div class="dw-ghost"><div class="gc"></div><div class="gc"></div></div>`}`;
}

function bind() {
  $('#rp-x').onclick = () => api.onClose?.();
  host.querySelector('.dw-tabs').onclick = (e) => { const t = e.target.closest('[data-rt]'); if (!t) return; tab = t.dataset.rt; api.setTab?.(tab); };
  if (tab === 'issue') {
    const b = host;                                  // 폼이 두 칸에 나뉘어 있어 서랍 전체에서 받는다
    $('#rp-title').oninput = (e) => { form.title = e.target.value; };
    b.onchange = (e) => {
      const t = e.target;
      if (t.id === 'rp-cls-all') { form.cls = t.checked ? [...(C.layer?.classes || [])] : []; $$('[data-cls]', host).forEach((x) => { x.checked = t.checked; }); return syncIssue(); }
      if (t.dataset.cls) { form.cls = t.checked ? [...new Set([...form.cls, t.dataset.cls])] : form.cls.filter((c) => c !== t.dataset.cls); return syncIssue(); }
      if (t.id === 'rp-emd-all') {
        const rows = C.geo ? D.byEmd(C.geo) : [];
        const usable = (C.emdGeo ? C.emdGeo.features.map((f) => f.properties.nm) : rows.map((r) => r.emd)).filter((nm) => rows.some((r) => r.emd === nm));
        form.emds = t.checked ? usable : [];
        $$('[data-emd]', host).forEach((x) => { x.checked = !x.disabled && t.checked; });
        return syncIssue();
      }
      if (t.dataset.emd) { form.emds = t.checked ? [...new Set([...form.emds, t.dataset.emd])] : form.emds.filter((x) => x !== t.dataset.emd); return syncIssue(); }
    };
    $('#rp-cancel').onclick = () => api.onClose?.();
    $('#rp-go').onclick = submit;
  } else {
    const f = $('#rp-q');
    f.onsubmit = (e) => { e.preventDefault(); const d = new FormData(f); q = { ...q, k: d.get('k'), q: (d.get('q') || '').trim(), state: d.get('state') }; page = 1; draw(); };
    f.onreset = () => setTimeout(() => { q = { k: '전체', q: '', state: 'all', from: '', to: '', quick: 'all' }; page = 1; draw(); }, 0);
    f.onclick = (e) => { const c = e.target.closest('[data-q]'); if (!c) return; q.quick = c.dataset.q; $$('[data-q]', f).forEach((x) => x.setAttribute('aria-pressed', String(x === c))); };
    $('#rp-new').onclick = () => { tab = 'issue'; api.setTab?.('issue'); };
    const tb = $('#rp-tb');
    if (tb) {
      bindRows(tb, (r) => { sel = r.dataset.id; api.onFocusEmd?.(emdsOf(D.reports().find((x) => x.id === sel))); });
      $$('.rp', tb).forEach((btn) => {
        btn.onmouseenter = () => api.onFocusEmd?.(emdsOf(D.reports().find((x) => x.id === btn.dataset.id)));
        btn.onclick = (e) => {
          sel = btn.dataset.id;
          const r = D.reports().find((x) => x.id === sel);
          $$('.rp', tb).forEach((x) => x.setAttribute('aria-selected', String(x === btn)));
          api.onFocusEmd?.(emdsOf(r));
          if (e.target.closest('.dl')) openPledge({ targets: C.layer ? [C.layer] : [], title: '보안 서약서', kind: '엑셀', onDone: (v) => say(`엑셀 다운로드가 시작되었습니다 · ${esc(r.title)} · ${v.name}`, 6000) });
        };
      });
      mountPager($('#rp-pg'), { total: list().length, page, size, sizes: sizeList(), onChange: (st) => { page = st.page; sizePref = size = st.size; draw(); } });
      fitRows();
    }
  }
}

/* 한 쪽 줄 수를 화면 높이에 맞춘다 — map-stats.js 의 같은 장치와 같은 뜻이다.
   쪽넘김이 `총 N건 중 1~M 행` 을 계속 말하므로 지운 것이 아니다. */
const MIN_ROWS = 3;
let sizePref = 10, fitPass = 0, bound = false, rt = 0, raf = 0;
const sizeList = () => [...new Set([size, 5, 10, 20])].sort((a, b) => a - b);
function fitRows() {
  const dw = host.querySelector('.dw'), tb = $('#rp-tb');
  if (!dw || !tb || !tb.children.length) { fitPass = 0; return; }
  const rh = Math.max(24, tb.children[0].getBoundingClientRect().height);
  const over = dw.scrollHeight - dw.clientHeight;
  let next = size;
  if (over > 2) next = Math.max(MIN_ROWS, size - Math.ceil(over / rh));
  else if (size < sizePref && -over >= rh) next = Math.min(sizePref, size + Math.floor(-over / rh));
  if (next !== size && fitPass < 6) { fitPass++; size = next; page = 1; draw(); return; }
  fitPass = 0;
  // 글꼴·그림이 늦게 앉으면 높이가 바뀐다 — 한 프레임 뒤에 한 번 더 잰다
  cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (host?.isConnected) fitRows(); });
}
/** 체크 한 번에 다시 그리는 것은 미리보기 · 전체 선택 상태 · 지도뿐이다(폼과 포커스는 그대로). */
function syncIssue() {
  const rows = C.geo ? D.byEmd(C.geo) : [];
  const all = C.emdGeo ? C.emdGeo.features.map((f) => f.properties.nm) : rows.map((r) => r.emd);
  const usable = all.filter((nm) => rows.some((r) => r.emd === nm));
  const clsAll = $('#rp-cls-all'), emdAll = $('#rp-emd-all');
  if (clsAll) clsAll.checked = form.cls.length === (C.layer?.classes || []).length;
  if (emdAll) emdAll.checked = usable.length > 0 && form.emds.length === usable.length;
  const picked = rows.filter((r) => form.emds.includes(r.emd)).sort((a, b) => b.area - a.area);
  const nP = picked.reduce((a, r) => a + r.n, 0), area = picked.reduce((a, r) => a + r.area, 0);
  const max = Math.max(...picked.map((r) => r.area), 1);
  const pre = host.querySelector('.rp-pre');
  if (pre) pre.innerHTML = `<div class="l"><p class="t">발급 미리보기 · 엑셀 1 파일</p>
      <b class="k">${nf.format(nP)}</b><span class="u">${esc(C.layer?.unit || '건')}</span>
      <b>${D.ha(area).toFixed(1)}</b><span class="u">ha</span>
      <p class="s">${esc(C.ctx.unitExample)} ${picked.length} · 클래스 ${form.cls.length}</p></div>
    <div class="r">${picked.slice(0, 5).map((r) => `<div class="row"><span class="nm">${esc(r.emd)}</span><span class="cnt">${nf.format(r.n)} ${esc(C.layer?.unit || '')}</span><span class="m"><i style="width:${Math.round((r.area / max) * 100)}%"></i></span><span class="v">${nf.format(Math.round(r.area))} ㎡</span></div>`).join('') || '<p class="mic">대상 지역을 고르면 여기에 요약이 섭니다</p>'}
      ${picked.length > 5 ? `<p class="mic">그 외 ${picked.length - 5} ${esc(C.ctx.unitExample)}</p>` : ''}</div>`;
  api.onFocusEmd?.(form.emds);
}
function redrawIssue() {
  draw();
  api.onFocusEmd?.(form.emds);
}
function submit() {
  form.touched = true;
  if (!form.title.trim() || !form.cls.length || !form.emds.length) {
    redrawIssue();
    const n = [!form.title.trim(), !form.cls.length, !form.emds.length].filter(Boolean).length;
    say(`필수 항목 ${n}개가 비어 있습니다`);
    $('.err', host)?.previousElementSibling?.focus?.();
    return;
  }
  D.addReport({ id: 'rp-new-' + Date.now(), state: 'wait', at: D.stamp(), by: '관리자', dl: 0, title: form.title.trim(), cls: [...form.cls], emds: [...form.emds] });
  say('보고서 발급을 접수했습니다 — 발급 내역에서 진행 상태를 확인하세요');
  tab = 'list'; sel = ''; page = 1; api.setTab?.('list');
}
