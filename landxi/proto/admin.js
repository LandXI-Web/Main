/* 서비스 관리(admin) 공용 — 저장소 · 셸 · URL 상태 · 패싯 밴드 · 기간 빠른 선택 · 편집기 · 첨부 · 기간 축.
   원판 design-canvas/v2/B6-Admin-*.dc.html(생성기 tools/design/gen-b6-admin.mjs) · 원본 landxi7/admin-*.html 1:1.
   데이터 변경은 메모리 + sessionStorage — 탭을 닫으면 시드로 돌아간다(콘티). */
import { mountShell, TABS, icon, esc, $, $$, say } from './shell.js';
import { AS_OF, INF, USERS, INQUIRIES, NOTICES, FAQS, MAX_FILES, MAX_SIZE_MB, ATT_EXT } from './admin-data.js';

export { AS_OF, INF };
export const SEEDS = { users: USERS, inquiries: INQUIRIES, notices: NOTICES, faqs: FAQS };
const SKEY = (name) => `lx-admin-v1:${name}`;

/* ── 저장소 ─────────────────────────────────────────────────────────────── */
/* 새로고침 = 시드로 복귀(콘티). 탭 사이를 오가는 동안에는 남는다 — 서비스 지원(support-contact.js)과 같은 규칙. */
try { if (performance.getEntriesByType('navigation')[0]?.type === 'reload') Object.keys(SEEDS).forEach((k) => sessionStorage.removeItem(SKEY(k))); } catch { /* 저장소 차단 */ }
const SUPPORT_INQ = 'lx.support.inquiries';            // 서비스 지원 › 문의하기의 저장소(있을 때만 잇는다)
export function loadStore(name) {
  const list = loadOwn(name);
  if (name === 'inquiries') try {                       // 사용자가 문의하기에서 새로 등록한 문의를 받아 온다
    const theirs = JSON.parse(sessionStorage.getItem(SUPPORT_INQ) || 'null');
    if (Array.isArray(theirs)) for (const q of theirs) if (q && Number.isFinite(q.id) && !list.some((x) => x.id === q.id)) list.push({ id: q.id, title: String(q.title || ''), content: String(q.content || ''), author: '관리자', authorDept: '', status: 'pending', createdAt: String(q.createdAt || ''), attachments: Array.isArray(q.attachments) ? q.attachments : [] });
  } catch { /* 모양이 다르면 잇지 않는다 */ }
  return list;
}
function loadOwn(name) {
  try {
    const raw = sessionStorage.getItem(SKEY(name));
    if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) return v; }
  } catch { /* 저장소 차단 · 손상 → 시드 */ }
  return structuredClone(SEEDS[name]);
}
export function saveStore(name, list) {
  try { sessionStorage.setItem(SKEY(name), JSON.stringify(list)); } catch { /* 저장소 차단 */ }
  if (name === 'inquiries') try {                       // 답변을 문의하기 쪽에도 돌려준다(그쪽 저장소가 이미 있을 때만)
    const theirs = JSON.parse(sessionStorage.getItem(SUPPORT_INQ) || 'null');
    if (Array.isArray(theirs)) { for (const t of theirs) { const m = list.find((x) => x.id === t.id); if (m && m.status === 'replied') Object.assign(t, { status: 'replied', answer: m.answer, answeredAt: m.answeredAt }); } sessionStorage.setItem(SUPPORT_INQ, JSON.stringify(theirs)); }
  } catch { /* 잇지 못해도 이 화면은 동작한다 */ }
  refreshTabCounts();
}

/* ── 시각 — 기준일(시드 최신일)의 오늘 + 실제 시분초 ───────────────────── */
const p2 = (n) => String(n).padStart(2, '0');
export function nowIso() { const d = new Date(); return `${AS_OF}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; }
export const dt = (iso, n = 16) => (iso ? iso.replace('T', ' ').replace(/-/g, '.').substring(0, n) : '-');
export const fsize = (b) => (b < 1024 * 1024 ? (b / 1024).toFixed(1) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB');
const iso10 = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export function monthsBack(m) { const to = new Date(AS_OF + 'T00:00:00'); const from = new Date(to); from.setMonth(from.getMonth() - m); return { from: iso10(from), to: iso10(to) }; }
export function weeksAhead(w) { const from = new Date(AS_OF + 'T00:00:00'); const to = new Date(from); to.setDate(to.getDate() + w * 7); return { from: iso10(from), to: iso10(to) }; }

/* ── 셸 — 레일 활성 = 서비스 관리 · 5탭(빨간 숫자 = 조치 필요 건수) ─────── */
const pendingCounts = () => ({
  inquiry: loadStore('inquiries').filter((q) => q.status !== 'replied').length,
  users: loadStore('users').filter((u) => (u.action || 'pending') === 'pending').length,
});
export function mountAdmin(tab) {
  const c = pendingCounts();
  const shell = mountShell({
    active: 'admin', title: '서비스 관리', tabStyle: 'line', tab, fit: true,
    tabs: TABS.admin.map((t) => ({ ...t, count: c[t.key] || '' })),
    asOf: AS_OF, asOfLabel: '기준일', demo: true,
  });
  document.body.classList.add('adm');
  return shell;
}
export function refreshTabCounts() {
  const c = pendingCounts();
  for (const t of TABS.admin) {
    const a = $(`.ptabs a[href$="${t.href}"]`); if (!a) continue;
    let b = $('b', a); const n = c[t.key] || 0;
    if (!n) { b?.remove(); continue; }
    if (!b) { b = document.createElement('b'); b.className = 'n'; a.append(b); }
    b.textContent = String(n);
  }
}

/* ── URL 이 상태다 — 기본값과 다른 키만 쿼리에 남긴다 ───────────────────── */
export function urlState(defaults) {
  const num = new Set(Object.keys(defaults).filter((k) => typeof defaults[k] === 'number'));
  const read = () => {
    const q = new URLSearchParams(location.search), s = { ...defaults };
    for (const k of Object.keys(defaults)) if (q.has(k)) { const v = q.get(k); s[k] = num.has(k) ? (Number.isFinite(+v) ? +v : defaults[k]) : v; }
    return s;
  };
  const write = (s, push = true) => {
    const q = new URLSearchParams();
    for (const k of Object.keys(defaults)) if (s[k] !== defaults[k] && s[k] !== '' && s[k] != null) q.set(k, s[k]);
    const url = location.pathname + (q.toString() ? '?' + q : '');
    if (url === location.pathname + location.search) return;
    history[push ? 'pushState' : 'replaceState'](null, '', url);
  };
  return { read, write };
}

/* ── 패싯 밴드 — 원본의 셀렉트 필터를 숫자 붙은 패싯으로(원판 §8-4). 선택 = 잉크 3px 밑줄 ──
   cells: [{ label, w, items: [{ id, n, unit, tone: 'acc'|'warn'|'dim', on }], note, noteWarn }] · right = 오른쪽 HTML */
export function facetBand(cells, right = '') {
  return `<div class="fband" role="group" aria-label="상태로 거르기">${cells.map((c, i) => `
<div class="fb-cell"${c.w ? ` style="width:${c.w}px"` : ''}${i ? ' data-sep' : ''}>
  <p class="lb">${esc(c.label)}</p>
  <div class="fb-items">${c.items.map((it) => `<button type="button" class="fb-i fb-i--${it.n === 0 ? 'zero' : it.tone || 'acc'}" data-facet="${esc(it.id)}" aria-pressed="${it.on ? 'true' : 'false'}" aria-label="${esc(c.label)} ${esc(it.unit)} ${it.n}건"><b class="d">${it.n}</b><span>${esc(it.unit)}</span></button>`).join('')}${c.note ? `<span class="fb-note${c.noteWarn ? ' st--warn' : ''}">${esc(c.note)}</span>` : ''}</div>
</div>`).join('')}<span class="sp"></span>${right ? `<div class="fb-right">${right}</div>` : ''}</div><hr class="hr fb-rule">`;
}

/* ── 기간 빠른 선택 — 전체/1/3/6/12개월. 기준일에서 거꾸로 센다 ─────────── */
export const QUICK = [[0, '전체'], [1, '1개월'], [3, '3개월'], [6, '6개월'], [12, '12개월']];
export const periodHtml = (label, f) => `<span class="f-lab">${esc(label)}</span><input class="inp n" type="date" name="from" value="${esc(f.from)}" aria-label="${esc(label)} 시작"><span class="tilde">~</span><input class="inp n" type="date" name="to" value="${esc(f.to)}" aria-label="${esc(label)} 끝"><span class="chips" role="group" aria-label="${esc(label)} 빠른 선택">${QUICK.map(([m, l]) => `<button type="button" class="chip-b" data-months="${m}" aria-pressed="${+f.q === m ? 'true' : 'false'}">${l}</button>`).join('')}</span>`;
export const searchBtns = `<span class="filters-acts"><button type="reset" class="btn-br" style="width:76px">초기화</button><button type="submit" class="btn" style="width:84px">${icon('search', 14)}검색</button></span>`;
/* 검색 행의 빠른 선택 · 날짜 직접 입력을 묶는다. 빠른 선택은 원본처럼 날짜만 채운다(검색 버튼이 거른다). */
export function bindPeriod(form) {
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-months]'); if (!b) return;
    const m = +b.dataset.months, r = m ? monthsBack(m) : { from: '', to: '' };
    form.elements.from.value = r.from; form.elements.to.value = r.to;
    $$('[data-months]', form).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  form.addEventListener('change', (e) => { if (e.target.name === 'from' || e.target.name === 'to') $$('[data-months]', form).forEach((x) => x.setAttribute('aria-pressed', 'false')); });
}
export const quickOf = (form) => +($('[data-months][aria-pressed="true"]', form)?.dataset.months || 0);

/* ── 본문 HTML 거르기 — 편집기 · 시드 본문은 허용 태그만 남긴다 ─────────── */
const OK_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'U', 'S', 'STRIKE', 'I', 'EM', 'UL', 'OL', 'LI', 'A', 'IMG', 'DIV', 'SPAN']);
export function cleanHtml(html) {
  const t = document.createElement('template'); t.innerHTML = String(html || '');
  const walk = (node) => {
    for (const el of [...node.children]) {
      walk(el);
      if (!OK_TAGS.has(el.tagName)) { el.replaceWith(...el.childNodes); continue; }
      for (const a of [...el.attributes]) {
        const keep = (el.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:|#|[\w./-]+$)/i.test(a.value)) || (el.tagName === 'IMG' && (a.name === 'alt' || (a.name === 'src' && /^(https?:|data:image\/|[\w./-]+$)/i.test(a.value)))) || (a.name === 'style' && /^text-align:\s*(left|center|right);?$/i.test(a.value));
        if (!keep) el.removeAttribute(a.name);
      }
      if (el.tagName === 'A') { el.setAttribute('rel', 'noopener'); el.setAttribute('target', '_blank'); }
    }
  };
  walk(t.content);
  return t.innerHTML.trim();
}
/** 줄바꿈만 있는 평문(문의 질문 · 일부 답변)과 HTML 을 함께 받는다. */
export const richHtml = (s) => (/<[a-z][^>]*>/i.test(s || '') ? cleanHtml(s) : esc(s || '').replace(/\n/g, '<br>'));
export const isBlankHtml = (h) => { const t = document.createElement('div'); t.innerHTML = h || ''; return !t.textContent.trim() && !t.querySelector('img'); };

/* ── 편집기 — 원본 도구막대(공지 · FAQ = 11 · 문의 답변 = 7). contenteditable + execCommand ── */
const RTE_FULL = [['bold', '<b>B</b>', '굵게'], ['underline', '<u>U</u>', '밑줄'], ['strikeThrough', '<s>S</s>', '취소선'], '|', ['insertUnorderedList', '• 목록', '글머리 기호'], ['insertOrderedList', '1. 목록', '번호 목록'], '|', ['justifyLeft', '⟵', '왼쪽 정렬'], ['justifyCenter', '⎯', '가운데 정렬'], ['justifyRight', '⟶', '오른쪽 정렬'], '|', ['link', '링크', '링크'], ['image', '이미지', '이미지'], ['removeFormat', '↺', '서식 지우기']];
const RTE_REPLY = RTE_FULL.filter((b) => b === '|' || !/^justify|^image$/.test(b[0])).filter((b, i, a) => !(b === '|' && a[i - 1] === '|'));
export function rteHtml({ id, label, placeholder, html = '', reply = false, describedby = '' }) {
  const bar = (reply ? RTE_REPLY : RTE_FULL).map((b) => (b === '|' ? '<i class="rte-sep"></i>' : `<button type="button" class="rte-b" data-cmd="${b[0]}" title="${b[2]}" aria-label="${b[2]}" tabindex="-1">${b[1]}</button>`)).join('');
  return `<div class="rte" data-rte><div class="rte-bar" role="toolbar" aria-label="${esc(label)} 서식">${bar}</div><div class="rte-body" id="${id}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(label)}" data-placeholder="${esc(placeholder)}"${describedby ? ` aria-describedby="${describedby}"` : ''}>${cleanHtml(html)}</div></div>`;
}
/** 도구막대는 한 개의 Tab 정지점(←→ 로 이동). 링크 · 이미지는 주소를 묻는다(원본과 같이). */
export function bindRte(root, askUrl) {
  $$('[data-rte]', root).forEach((rte) => {
    const bar = $('.rte-bar', rte), body = $('.rte-body', rte), btns = $$('.rte-b', bar);
    if (btns[0]) btns[0].tabIndex = 0;
    let saved = null;
    const keep = () => { const s = getSelection(); if (s.rangeCount && body.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
    const back = () => { body.focus(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } };
    body.addEventListener('keyup', keep); body.addEventListener('mouseup', keep); body.addEventListener('blur', keep);
    const run = async (cmd) => {
      if (cmd === 'link' || cmd === 'image') {
        const url = await askUrl(cmd === 'link' ? '링크 주소를 입력하세요' : '이미지 주소를 입력하세요');
        if (!url) return; back();
        document.execCommand(cmd === 'link' ? 'createLink' : 'insertImage', false, url);
      } else { back(); document.execCommand(cmd, false, null); }
      body.dispatchEvent(new Event('input', { bubbles: true }));
    };
    bar.addEventListener('mousedown', (e) => { if (e.target.closest('.rte-b')) e.preventDefault(); });
    bar.addEventListener('click', (e) => { const b = e.target.closest('.rte-b'); if (b) run(b.dataset.cmd); });
    bar.addEventListener('keydown', (e) => {
      const i = btns.indexOf(document.activeElement); if (i < 0) return;
      const go = (j) => { e.preventDefault(); btns.forEach((b, k) => { b.tabIndex = k === j ? 0 : -1; }); btns[j].focus(); };
      if (e.key === 'ArrowRight') go((i + 1) % btns.length);
      if (e.key === 'ArrowLeft') go((i - 1 + btns.length) % btns.length);
    });
  });
}

/* ── 첨부 — 최대 3개 · 파일당 10 MB · 허용 확장자 13종(원본 문구) ─────────── */
export const ATT_HINT = `허용 확장자: ${ATT_EXT.join(', ')} · 파일당 최대 ${MAX_SIZE_MB.toFixed(1)} MB · 최대 ${MAX_FILES}개`;
export const ATT_HINT_S = `허용 확장자 13종(.jpg ~ .hwp) · 파일당 최대 ${MAX_SIZE_MB.toFixed(1)} MB · 최대 ${MAX_FILES}개`;
export const attachView = (files) => ((files || []).length ? files.map((a) => `<div class="att">${icon('clip', 15)}<span class="att-n">${esc(a.name)}</span><span class="n att-s">${fsize(a.size)}</span></div>`).join('') : '<span class="att-none">첨부된 파일이 없습니다.</span>');
/** 폼의 첨부 묶음. host = 빈 요소, files = 배열(그 자리에서 고친다). */
export function mountAttach(host, files, { hint = ATT_HINT, inline = false } = {}) {
  host.classList.add('attf'); if (inline) host.classList.add('attf--inline');
  host.innerHTML = `<div class="attf-top"><button type="button" class="btn-br btn-br--s" data-add>+ 파일 추가</button><input type="file" multiple hidden accept="${ATT_EXT.join(',')}"><div class="attf-list" aria-live="polite"></div></div><p class="attf-hint">${esc(hint)}</p>`;
  const list = $('.attf-list', host), input = $('input[type=file]', host);
  const draw = () => { list.innerHTML = files.length ? files.map((a, i) => `<div class="att">${icon('clip', 15)}<span class="att-n att-n--plain">${esc(a.name)}</span><span class="n att-s">${fsize(a.size)}</span><button type="button" class="att-x" data-rm="${i}" aria-label="${esc(a.name)} 삭제">삭제</button></div>`).join('') : '<span class="att-none">첨부된 파일이 없습니다.</span>'; };
  $('[data-add]', host).addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    for (const f of input.files) {
      if (files.length >= MAX_FILES) { say(`첨부 파일은 최대 ${MAX_FILES}개까지 가능합니다.`); break; }
      if (f.size > MAX_SIZE_MB * 1024 * 1024) { say(`"${f.name}"은(는) 최대 ${MAX_SIZE_MB}MB 제한을 초과합니다.`); continue; }
      files.push({ name: f.name, size: f.size });
    }
    input.value = ''; draw();
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; files.splice(+b.dataset.rm, 1); draw(); $('[data-add]', host).focus(); });
  draw();
}

/* ── 게시 기간 축 ───────────────────────────────────────────────────────── */
const TD = Date.parse(AS_OF + 'T12:00:00'), DAY = 86400000;
const AX0 = Date.parse('2025-12-01'), AX1 = Date.parse('2026-06-30');
const pct = (t, a, b) => Math.max(0, Math.min(100, ((t - a) / (b - a)) * 100));
export const isLive = (n) => Date.parse(n.startAt) <= TD && (n.endAt === INF || Date.parse(n.endAt) >= TD);
export const popupLive = (n) => !!(n.popupOn && n.popupTo && Date.parse(n.popupTo) >= TD);
/** 목록 행의 작은 막대 — 파랑 = 게시 중 · 회색 = 종료 · 세로선 = 기준일 · › = 무한 게시 */
export function tlBar(n) {
  const inf = n.endAt === INF, a = pct(Date.parse(n.startAt), AX0, AX1), b = inf ? 100 : pct(Date.parse(n.endAt), AX0, AX1);
  return `<span class="tlb${isLive(n) ? ' tlb--live' : ''}${inf ? ' tlb--inf' : ''}" aria-hidden="true"><i style="left:${a.toFixed(2)}%;width:max(3px,${(b - a).toFixed(2)}%)"></i><em style="left:${pct(TD, AX0, AX1).toFixed(2)}%"></em></span>`;
}
/** 열람 판 · 폼의 큰 축(게시 + 팝업 두 줄). 기간에 맞춰 늘어난다 — 16일 이하 = 일 눈금, 그 밖 = 월 눈금. */
export function tlBig(pub, pop) {
  const s0 = Date.parse(pub[0]); if (!Number.isFinite(s0)) return '';
  const starts = [s0].concat(pop ? [Date.parse(pop[0])] : []).filter(Number.isFinite);
  const ends = [pub[1], pop && pop[1]].filter((e) => e && e !== INF).map((e) => Date.parse(e)).filter(Number.isFinite);
  const lo = Math.min(...starts), inf = pub[1] === INF || !ends.length;
  let a, b;
  if (inf) { a = lo - 7 * DAY; b = Math.max(lo + 120 * DAY, TD + 14 * DAY); } else { const hi = Math.max(...ends, lo + DAY), pad = Math.max(DAY, (hi - lo) * 0.25); a = lo - pad; b = hi + pad; }
  const X = (t) => pct(t, a, b), daily = b - a <= 16 * DAY;
  let ticks = '', d = new Date(a);
  let cur = daily ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() : new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  while (cur < b) {
    const c = new Date(cur), x = X(cur), lab = daily ? `${p2(c.getMonth() + 1)}.${p2(c.getDate())}` : `${String(c.getFullYear()).slice(2)}.${p2(c.getMonth() + 1)}`;
    ticks += `<i class="tl-tick" style="left:${x.toFixed(2)}%"></i>${x < 90 ? `<span class="tl-lab n" style="left:${x.toFixed(2)}%">${lab}</span>` : ''}`;
    cur = daily ? cur + DAY : new Date(c.getFullYear(), c.getMonth() + 1, 1).getTime();
  }
  const bar = (p, cls, label) => {
    if (!p) return `<div class="tl-row tl-row--off"><span class="tl-k">${label}</span><div class="tl-track"><span class="tl-none">표시 안 함</span></div></div>`;
    const x0 = X(Date.parse(p[0])), x1 = p[1] === INF ? 100 : X(Date.parse(p[1]));
    return `<div class="tl-row"><span class="tl-k">${label}</span><div class="tl-track"><i class="tl-bar ${cls}${p[1] === INF ? ' tl-bar--inf' : ''}" style="left:${x0.toFixed(2)}%;width:max(4px,${(x1 - x0).toFixed(2)}%)"></i></div></div>`;
  };
  const today = TD > a && TD < b ? `<span class="tl-today" style="left:${X(TD).toFixed(2)}%"><em>기준일</em></span>` : '';
  return `<div class="tl" role="img" aria-label="게시 기간과 팝업 기간의 시간 축"><div class="tl-plot">${ticks}${today}</div>${bar(pub, 'tl-bar--pub', '게시')}${bar(pop, 'tl-bar--pop', '팝업')}<div class="tl-axis"></div></div>`;
}

/* ── 한 쪽 행 수를 화면 높이에 맞춘다 ─────────────────────────────────────
   발주자: "업무 화면은 한 화면에서 끝난다" · "모니터마다 최적화를 해야지".
   틀을 줄이고 행 높이를 화면에 맞춘 뒤에도(admin.css 아래쪽) 짧은 모니터에서는
   표가 몇 줄 넘친다. 넘치는 만큼만 한 쪽의 행 수를 줄이고, 길면 다시 늘린다.
   쪽넘김이 `총 21건 중 1~N 행` 을 계속 말하므로 지운 것이 아니다.
   사용자가 페이지 크기를 직접 고르면(S._pref) 그 값을 기준으로 삼는다. */
let fitPass = 0;
export function fitRows(S, render, { min = 4, pref = 10 } = {}) {
  if (S._pref) return;                 // 사용자가 페이지 크기를 직접 골랐으면 그 뜻을 따른다
  const wrap = $('.split-l > .tbl-wrap');
  const tb = wrap && $('tbody', wrap);
  if (!wrap || !tb || !tb.rows.length) { fitPass = 0; return; }
  const want = pref;
  const rh = Math.max(24, tb.rows[0].getBoundingClientRect().height);
  const over = wrap.scrollHeight - wrap.clientHeight;
  let next = S.size;
  if (over > 2) next = Math.max(min, S.size - Math.ceil(over / rh));
  else if (S.size < want && -over >= rh) next = Math.min(want, S.size + Math.floor(-over / rh));
  if (next !== S.size && fitPass < 6) { fitPass++; S.size = next; S.page = 1; render(); return; }
  fitPass = 0;
}
/** 창 크기가 바뀌면 다시 잰다(한 번만 건다). */
export function watchFit(fn) {
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(fn, 180); });
}

/* ── 자잘한 것 ──────────────────────────────────────────────────────────── */
export const metaFoot = (o) => `<p class="meta-foot">${[['등록자', o.author], ['등록 일시', dt(o.createdAt, 19)], ['수정자', o.updater], ['수정 일시', dt(o.updatedAt, 19)]].map(([l, v]) => `<span>${l} <b class="${/일시/.test(l) ? 'n' : ''}">${esc(v || '-')}</b></span>`).join('')}</p>`;
/** 열람 판을 갈아 끼울 때 500ms 진입(법전 §4). */
export function swapIn(el) { el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in'); }
/** 주소를 묻는 작은 모달(편집기의 링크 · 이미지). */
export function makeAskUrl(openModal) {
  return (msg) => new Promise((res) => {
    let val = null;
    const m = openModal({ title: '확인', width: 440, content: `<div class="field"><div class="field-h"><label class="field-l" for="ask-url">${esc(msg)}</label></div><input id="ask-url" class="inp" type="url" placeholder="https://"></div>`,
      actions: [{ label: '취소', kind: 'bracket' }, { label: '확인', kind: 'primary', onClick: (ctx) => { val = $('#ask-url', ctx.el).value.trim(); } }], onClose: () => res(val) });
    $('#ask-url', m.el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { val = e.target.value.trim(); m.close(); } });
  });
}
