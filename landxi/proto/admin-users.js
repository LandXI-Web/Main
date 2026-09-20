/* 서비스 관리 › 사용자 관리 — 원판 B6-Admin-Users-{Opt2,Detail,Approve,Login,Pwd,Login-Empty,Pwd-Empty,Empty} · 원본 landxi7/admin-users.html 1:1.
   채택 = 선택 2(SPLIT): 좌 목록 6열 + 우 `사용자 정보 열람`. 가입일 내림차순이라 대기 행이 맨 위 + 기본 선택.
   URL: ?id= 선택 · status/action 패싯 · email/name/phone/dept/from/to/q 검색 · page/size · hist=login|pwd 이력 모달. */
import { say, confirmDialog, openModal, mountPager, bindRows, icon, esc, $, $$ } from './shell.js';
import { mountAdmin, loadStore, saveStore, urlState, facetBand, periodHtml, searchBtns, bindPeriod, quickOf, nowIso, dt, swapIn } from './admin.js';
import { ROLES, LOGIN_HISTORY, PWD_HISTORY } from './admin-data.js';

const { main } = mountAdmin('users');
const url = urlState({ id: 0, status: 'all', action: 'all', email: '', name: '', phone: '', dept: '', from: '', to: '', q: 0, page: 1, size: 10, hist: '' });
let list = loadStore('users');
let S = url.read();
let pager, hist = null;

const ST = { active: '정상', withdrawn: '탈퇴' }, AC = { approved: '승인', rejected: '거부', pending: '대기' };
const stWord = (u) => `<span class="st${u.status === 'active' ? '' : ' st--dim'}">${ST[u.status]}</span>`;
const acWord = (u) => { const a = u.action || 'pending'; return `<span class="st ${a === 'approved' ? 'st--acc' : a === 'rejected' ? 'st--dim' : 'st--warn'}">${AC[a]}</span>`; };
const byId = (id) => list.find((u) => u.id === id);

function filtered() {
  const f = S, lc = (s) => (s || '').toLowerCase();
  return list.filter((u) => (!f.email || lc(u.email).includes(lc(f.email))) && (!f.name || lc(u.name).includes(lc(f.name))) && (!f.phone || (u.phone || '').includes(f.phone)) && (!f.dept || (u.dept || '').includes(f.dept))
    && (f.status === 'all' || u.status === f.status) && (f.action === 'all' || (u.action || 'pending') === f.action)
    && (!f.from || (u.joined || '').slice(0, 10) >= f.from) && (!f.to || (u.joined || '').slice(0, 10) <= f.to))
    .sort((a, b) => (b.joined || '').localeCompare(a.joined || ''));
}

main.insertAdjacentHTML('beforeend', `
<div id="band"></div>
<form class="filters" id="search" role="search" aria-label="사용자 검색" novalidate>
  <input class="inp" name="email" placeholder="아이디(이메일)" aria-label="아이디(이메일)">
  <input class="inp" name="name" placeholder="이름" aria-label="이름">
  <input class="inp" name="phone" placeholder="전화번호" aria-label="전화번호">
  <input class="inp" name="dept" placeholder="부서명" aria-label="부서명">
  <span id="period" class="contents"></span>${searchBtns}
</form>
<div class="work"><div class="split">
  <section class="split-l" aria-label="사용자 목록">
    <div class="tbl-wrap"><table class="tbl" id="tbl" aria-label="사용자 목록 — 가입일 내림차순">
      <colgroup><col style="width:80px"><col><col style="width:168px"><col style="width:68px"><col style="width:146px"><col style="width:74px"></colgroup>
      <thead><tr><th scope="col">이름</th><th scope="col">아이디(이메일)</th><th scope="col">부서 · 직위</th><th scope="col">계정상태</th><th scope="col">가입일시</th><th scope="col">처리상태</th></tr></thead>
      <tbody id="rows"></tbody></table></div>
    <div class="empty" id="list-empty" hidden><p class="empty-t">검색 조건에 맞는 사용자가 없습니다.</p><p class="empty-w" id="list-empty-w"></p></div>
    <nav id="pager" aria-label="사용자 목록 페이지"></nav>
  </section>
  <aside class="split-r panel u-panel" id="panel" aria-label="사용자 정보 열람" aria-live="polite"></aside>
</div></div>`);

const form = $('#search'), rowsEl = $('#rows'), panel = $('#panel');
pager = mountPager($('#pager'), { total: 0, page: S.page, size: S.size, onChange: ({ page, size }) => { S.page = page; S.size = size; S.id = 0; commit(); } });
bindRows(rowsEl, (row) => { S.id = +row.dataset.id; url.write(S); drawPanel(true); });

function drawBand() {
  const n = (fn) => list.filter(fn).length, all = S.status === 'all' && S.action === 'all';
  $('#band').innerHTML = facetBand([
    { label: '가입 승인 대기 · 처리 상태 = 대기', w: 244, items: [{ id: 'action:pending', n: n((u) => (u.action || 'pending') === 'pending'), unit: '건', tone: 'warn', on: S.action === 'pending' }], note: n((u) => (u.action || 'pending') === 'pending') ? '승인 필요' : '', noteWarn: true },
    { label: '계정 상태', w: 476, items: [{ id: 'all', n: list.length, unit: '전체', on: all }, { id: 'status:active', n: n((u) => u.status === 'active'), unit: '정상', on: S.status === 'active' }, { id: 'status:withdrawn', n: n((u) => u.status === 'withdrawn'), unit: '탈퇴', tone: 'dim', on: S.status === 'withdrawn' }] },
    { label: '처리 상태', items: [{ id: 'action:approved', n: n((u) => u.action === 'approved'), unit: '승인', on: S.action === 'approved' }, { id: 'action:rejected', n: n((u) => u.action === 'rejected'), unit: '거부', tone: 'dim', on: S.action === 'rejected' }] },
  ], '<span class="mic">숫자를 누르면 그 상태로 거른다</span>');
}
$('#band').addEventListener('click', (e) => {
  const b = e.target.closest('[data-facet]'); if (!b) return;
  const [k, v] = b.dataset.facet.split(':');
  if (k === 'all') { S.status = 'all'; S.action = 'all'; } else S[k] = S[k] === v ? 'all' : v;
  S.page = 1; S.id = 0; commit();
  $(`[data-facet="${b.dataset.facet}"]`)?.focus();
});

function fillForm() {
  for (const k of ['email', 'name', 'phone', 'dept']) form.elements[k].value = S[k];
  $('#period').innerHTML = periodHtml('가입일', S);
}
bindPeriod(form);
form.addEventListener('submit', (e) => {
  e.preventDefault();
  for (const k of ['email', 'name', 'phone', 'dept']) S[k] = form.elements[k].value.trim();
  S.from = form.elements.from.value; S.to = form.elements.to.value; S.q = quickOf(form);
  S.page = 1; S.id = 0; commit();
  const n = filtered().length; say(n ? `사용자 ${n}건` : '검색 조건에 맞는 사용자가 없습니다.');
});
form.addEventListener('reset', (e) => {
  e.preventDefault();
  Object.assign(S, { email: '', name: '', phone: '', dept: '', from: '', to: '', q: 0, status: 'all', action: 'all', page: 1, id: 0 });
  commit(); form.elements.email.focus();
});

function whyEmpty() {
  const p = [['email', '아이디'], ['name', '이름'], ['phone', '전화번호'], ['dept', '부서']].filter(([k]) => S[k]).map(([k, l]) => `${l} = “${S[k]}”`);
  if (S.status !== 'all') p.push(`계정 상태 = ${ST[S.status]}`); if (S.action !== 'all') p.push(`처리 상태 = ${AC[S.action]}`);
  if (S.from || S.to) p.push(`가입일 ${S.from || '…'} ~ ${S.to || '…'}`);
  return `${p.join(' · ') || '조건 없음'} · 시연 시드 ${list.length}명 중 일치 0 — 초기화로 전체 목록 복귀`;
}

function drawList() {
  const all = filtered(), pages = Math.max(1, Math.ceil(all.length / S.size));
  S.page = Math.min(Math.max(1, S.page), pages);
  const page = all.slice((S.page - 1) * S.size, S.page * S.size);
  /* 선택: URL 의 id 가 이 쪽에 있으면 그것, 없으면 맨 위(= 가입일 최신 — 시드에서는 승인 대기자) */
  if (S.id && !all.some((u) => u.id === S.id)) S.id = 0;
  if (S.id && !page.some((u) => u.id === S.id)) { S.page = Math.floor(all.findIndex((u) => u.id === S.id) / S.size) + 1; return drawList(); }
  if (!S.id && page.length) S.id = page[0].id;
  rowsEl.innerHTML = page.map((u) => `<tr data-row data-id="${u.id}" tabindex="0" aria-selected="${u.id === S.id}"${u.status === 'withdrawn' ? ' class="is-dim"' : ''}>
<td>${esc(u.name)}</td><td><span class="n">${esc(u.email)}</span></td><td>${esc(u.dept || '-')}${u.rank ? `<span class="g"> · ${esc(u.rank)}</span>` : ''}</td><td>${stWord(u)}</td><td class="num"><span class="n">${dt(u.joined)}</span></td><td>${acWord(u)}</td></tr>`).join('');
  $('#tbl').parentElement.classList.toggle('is-empty', !all.length);
  $('#list-empty').hidden = !!all.length; if (!all.length) $('#list-empty-w').textContent = whyEmpty();
  pager.set({ total: all.length, page: S.page, size: S.size });
}

function drawPanel(animate) {
  const u = byId(S.id);
  if (!u) {
    panel.innerHTML = `<header class="panel-h"><h2>사용자 정보 열람</h2></header><div class="empty"><p class="empty-t">선택된 사용자가 없습니다</p><p class="empty-w">목록에서 행을 고르면 여기서 열람 · 승인 · 권한 저장</p></div>`;
    return;
  }
  const pending = (u.action || 'pending') === 'pending', wd = u.status === 'withdrawn';
  const lh = (LOGIN_HISTORY[u.id] || []).length, ph = (PWD_HISTORY[u.id] || []).length;
  panel.innerHTML = `
<header class="panel-h"><h2>사용자 정보 열람</h2><span class="sp"></span><span class="links"><button type="button" class="link link--ink" data-hist="login">로그인 이력 <span class="n">${lh}</span> ›</button><button type="button" class="link link--ink" data-hist="pwd">비밀번호 변경 이력 <span class="n">${ph}</span> ›</button></span></header>
<div class="panel-b" id="panel-b">
  <div class="u-head">
    <div class="r1"><h3 class="panel-t">${esc(u.name)}</h3><span class="dept">${esc(u.dept || '-')}${u.rank ? ' · ' + esc(u.rank) : ''}</span><span class="sp"></span>${pending ? '<span class="st st--warn">승인 대기</span>' : wd ? `<span class="st st--dim">탈퇴${u.action === 'rejected' ? ' · 거부' : ''}</span>` : u.action === 'rejected' ? '<span class="st st--dim">정상 · 거부</span>' : '<span class="st st--acc">정상 · 승인</span>'}</div>
    <div class="r2${pending ? ' r2--act' : ''}"><span class="n mail">${esc(u.email)}</span><span class="sp"></span>${pending ? '<button type="button" class="btn-br" style="width:84px" data-act="reject">거부</button><button type="button" class="btn" style="width:124px" data-act="approve">승인</button>' : ''}</div>
  </div>
  <div class="sec"><div class="sec-k">소속</div><div class="sec-v"><div class="flds">
    <div class="fld fld--a"><span class="fld-l">전화번호</span><span class="fld-v"><span class="n">${esc(u.phone || '-')}</span></span></div>
    <div class="fld fld--b"><span class="fld-l">부서</span><span class="fld-v">${esc(u.dept || '-')}</span></div>
    <div class="fld"><span class="fld-l">직위</span><span class="fld-v">${esc(u.rank || '-')}</span></div></div></div></div>
  <div class="sec"><div class="sec-k">계정</div><div class="sec-v"><div class="flds">
    <div class="fld fld--a"><span class="fld-l">계정 상태</span><span class="fld-v">${stWord(u)}${wd ? '' : '<button type="button" class="btn-br btn-br--s" data-act="withdraw">탈퇴</button>'}</span></div>
    <div class="fld fld--b"><span class="fld-l">가입일시</span><span class="fld-v"><span class="n">${dt(u.joined)}</span></span></div>
    <div class="fld"><span class="fld-l">탈퇴일시</span><span class="fld-v"><span class="n">${dt(u.withdrawnAt)}</span></span></div></div>
    <div class="u-fails"><span class="fld-l">비밀번호 실패 횟수</span><b class="n" id="u-fails">${u.pwdFails || 0}</b><span class="u">회</span><button type="button" class="btn-br btn-br--s" data-act="reset">비밀번호 초기화</button></div></div></div>
  <div class="sec"><div class="sec-k">권한</div><div class="sec-v"><div class="flds">
    <div class="fld fld--a"><span class="fld-l">처리 상태</span><span class="fld-v">${acWord(u)}</span></div>
    <div class="fld fld--b"><span class="fld-l">처리자</span><span class="fld-v">${esc(u.actionBy || '-')}</span></div>
    <div class="fld"><span class="fld-l">처리일시</span><span class="fld-v"><span class="n">${dt(u.actionAt)}</span></span></div></div>
    <fieldset class="u-roles" id="u-roles"><legend class="sr">권한 — 1인 1개</legend>${ROLES.map(([k, l]) => `<label class="ck"><input type="checkbox" value="${k}"${k === u.role ? ' checked' : ''}>${esc(l)}</label>`).join('')}</fieldset></div></div>
</div>
<footer class="panel-f"><span class="mic">권한은 1인 1개 · 저장 시 반영</span><button type="button" class="btn-br" data-act="delete">삭제</button><button type="button" class="btn" data-act="save">저장</button></footer>`;
  if (animate) swapIn($('#panel-b'));
}

/* 권한 단일 선택 강제 — 새로 체크하면 나머지를 끈다(전부 해제 = 권한 해지). 원본 그대로 체크박스. */
panel.addEventListener('change', (e) => { const t = e.target; if (!t.matches('#u-roles input') || !t.checked) return; $$('#u-roles input').forEach((c) => { if (c !== t) c.checked = false; }); });
panel.addEventListener('click', async (e) => {
  const h = e.target.closest('[data-hist]'); if (h) { S.hist = h.dataset.hist; url.write(S); openHist(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const u = byId(S.id); if (!u) return;
  const act = b.dataset.act, refocus = (sel) => ($(sel, panel) || $(`tr[data-id="${S.id}"]`))?.focus();
  if (act === 'save') { u.role = $('#u-roles input:checked')?.value || ''; saveStore('users', list); say('권한이 저장되었습니다'); return; }
  if (act === 'approve') {
    if (!await confirmDialog({ title: '확인', body: '이 사용자의 가입을 승인하시겠습니까?' })) return;
    Object.assign(u, { action: 'approved', actionBy: '관리자', actionAt: nowIso() }); saveStore('users', list); render(); say('가입을 승인했습니다 · 시연'); refocus('#u-roles input');
  } else if (act === 'reject') {
    if (!await confirmDialog({ title: '확인', body: '이 사용자의 가입을 거부하시겠습니까?', danger: true })) return;
    Object.assign(u, { action: 'rejected', actionBy: '관리자', actionAt: nowIso() }); saveStore('users', list); render(); say('가입을 거부했습니다 · 시연'); refocus('[data-act="withdraw"]');
  } else if (act === 'withdraw') {
    if (!await confirmDialog({ title: '확인', body: '사용자를 탈퇴 처리하시겠습니까?', danger: true })) return;
    Object.assign(u, { status: 'withdrawn', withdrawnAt: nowIso() }); saveStore('users', list); render(); say('탈퇴 처리했습니다 · 시연'); refocus('[data-act="reset"]');
  } else if (act === 'reset') {
    if (!await confirmDialog({ title: '확인', body: '비밀번호 실패 횟수를 초기화 하시겠습니까?' })) return;
    u.pwdFails = 0; saveStore('users', list); render(); say('비밀번호 실패 횟수를 초기화했습니다 · 시연'); refocus('[data-act="reset"]');
  } else if (act === 'delete') {
    if (!await confirmDialog({ title: '확인', body: '사용자를 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.', okLabel: '삭제', danger: true })) return;
    list = list.filter((x) => x.id !== u.id); saveStore('users', list); S.id = 0; commit(false); say('사용자를 삭제했습니다 · 시연'); refocus('tr[data-row]');
  }
});

/* ── 로그인 이력 / 비밀번호 변경 이력 — 원본은 상세 하단 2탭, 여기서는 같은 2탭을 모달로 ── */
function openHist() {
  const u = byId(S.id); if (!u || hist) return;
  const LH = LOGIN_HISTORY[u.id] || [], PH = PWD_HISTORY[u.id] || [];
  const pend = (u.action || 'pending') === 'pending';
  const dash = '<span class="dim">-</span>';
  const tabs = [
    { k: 'login', label: '로그인 이력', rows: LH, cols: [['로그인 ID', ''], ['접속 IP', 136], ['성공 여부', 82], ['실패 사유', 202], ['접속 일시', 162], ['로그아웃 일시', 168]], empty: '로그인 이력이 없습니다.', why: pend ? '승인 전 계정 — 접속 기록 없음' : '시연 시드에 이 계정의 접속 기록이 없습니다',
      row: (r) => `<td><span class="n">${esc(r.loginId)}</span></td><td><span class="n">${esc(r.ip)}</span></td><td><span class="st${r.success ? ' st--acc' : ''}">${r.success ? '성공' : '실패'}</span></td><td>${r.reason ? esc(r.reason) : dash}</td><td><span class="n">${dt(r.at, 19)}</span></td><td>${r.logoutAt ? `<span class="n">${dt(r.logoutAt, 19)}</span>` : dash}</td>` },
    { k: 'pwd', label: '비밀번호 변경 이력', rows: PH, cols: [['로그인 ID', ''], ['변경 일시', 182], ['변경자', 122], ['변경 사유', 318]], empty: '비밀번호 변경 이력이 없습니다.', why: pend ? '승인 전 계정 — 비밀번호 발급 전' : '시연 시드에 이 계정의 변경 기록이 없습니다',
      row: (r) => `<td><span class="n">${esc(r.loginId)}</span></td><td><span class="n">${dt(r.at, 19)}</span></td><td>${esc(r.by || '-')}</td><td>${esc(r.reason || '-')}</td>` },
  ];
  const content = `<div class="adm-hist"><div class="tabs" role="tablist" aria-label="이력 종류">${tabs.map((t) => `<button type="button" role="tab" id="ht-${t.k}" aria-controls="hp-${t.k}" data-k="${t.k}">${t.label}<span class="n">${t.rows.length}</span></button>`).join('')}</div>
${tabs.map((t) => `<div role="tabpanel" id="hp-${t.k}" aria-labelledby="ht-${t.k}" tabindex="0"><div class="tbl-wrap"><table class="tbl" aria-label="${t.label}"><colgroup>${t.cols.map(([, w]) => `<col${w ? ` style="width:${w}px"` : ''}>`).join('')}</colgroup><thead><tr>${t.cols.map(([l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead><tbody></tbody></table></div><div class="empty" hidden><p class="empty-t">${t.empty}</p><p class="empty-w">${t.why}</p></div><nav aria-label="${t.label} 페이지"></nav></div>`).join('')}</div>`;
  hist = openModal({ title: '접속 · 비밀번호 이력', tag: '시연', width: 1000, content, actions: [{ label: '닫기', kind: 'bracket' }],
    onClose: () => { hist = null; if (S.hist) { S.hist = ''; url.write(S); } } });
  $('.modal-h h2', hist.el).insertAdjacentHTML('afterend', `<span class="adm-hist-sub">${esc(u.name)} · <span class="n">${esc(u.email)}</span></span>`);
  for (const t of tabs) {
    const pane = $(`#hp-${t.k}`, hist.el), st = { page: 1, size: 10 };
    const draw = () => { $('tbody', pane).innerHTML = t.rows.slice((st.page - 1) * st.size, st.page * st.size).map((r) => `<tr>${t.row(r)}</tr>`).join(''); $('.empty', pane).hidden = !!t.rows.length; };
    mountPager($('nav', pane), { total: t.rows.length, page: 1, size: 10, onChange: (p) => { Object.assign(st, p); draw(); } }); draw();
  }
  const tabEls = $$('[role="tab"]', hist.el);
  const pick = (k, focus) => { tabEls.forEach((b) => { const on = b.dataset.k === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $(`#hp-${b.dataset.k}`, hist.el).hidden = !on; if (on && focus) b.focus(); }); if (S.hist !== k) { S.hist = k; url.write(S, false); } };
  $('.tabs', hist.el).addEventListener('click', (e) => { const b = e.target.closest('[role="tab"]'); if (b) pick(b.dataset.k); });
  $('.tabs', hist.el).addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); pick(S.hist === 'login' ? 'pwd' : 'login', true); });
  pick(S.hist === 'pwd' ? 'pwd' : 'login');
  $(`#ht-${S.hist}`, hist.el).focus();
}

function render(animate) { drawBand(); fillForm(); drawList(); drawPanel(animate); }
function commit(push = true) { render(true); url.write(S, push); }
addEventListener('popstate', () => { S = url.read(); if (hist && !S.hist) { const h = hist; hist = null; h.close(); } render(true); if (S.hist) openHist(); });

render();
url.write(S, false);
if (S.hist) openHist();
