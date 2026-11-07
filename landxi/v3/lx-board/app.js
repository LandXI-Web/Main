/* lx-board — LX 게시판(11-07 PM "오른쪽 상단에 ? 이건 지우고 게시판 아이콘을 하나 클릭하면 화면을 전환해서 공지사항, QnA, 활용 사례, 자료집을 추가한다").
   LX 직원 · LX 관리자 머리줄의 게시판 아이콘(kit/shell.js)으로 들어온다. 탭 넷 — 목록 → 글 보기(가장 단순하게).
   · 공지사항 = 이미 있는 공지(GET /announcements · 대시보드 공지사항 칸과 한 출처). 쓰기 = LX 관리자 · 지금 공지를 쓰는 창 그대로(ops-core/js/notice.js).
   · QnA = LX 직원 · LX 관리자 누구나 질문 · LX 관리자가 답(GET/POST /board/qna · /board/qna/{id}/answer).
   · 활용 사례 · 자료집 = LX 관리자가 쓴다(자료집은 파일 하나 — 프로젝트 파일 올리기와 같은 형식 · 크기 한도).
   지어낸 글 0 — 비어 있으면 '아직 글이 없습니다'. 주소 ?tab=notice|qna|case|doc&id= 로 그 탭 · 그 글을 바로 연다(대시보드 '공지사항 →'). */
import * as K from '../kit/index.js';
import { h, api, session, API } from '../kit/util.js';
import { staffMenu } from '../kit/lx-menu.js';
import { modal } from '../kit/modal.js';
import { size } from '../kit/me.js';
import { adminMenu } from '../kit/admin-menu.js';
import { openNoticeWriter } from '../ops-core/js/notice.js';

const who = await K.gate('lx-board');
const admin = who.key === 'lx/admin';
/* 왼쪽 메뉴 — 직원 = LX 직원 메뉴 · 관리자 = LX 관리자 메뉴 한 곳(kit/admin-menu.js · 숫자 포함) */
const rail = admin
  ? adminMenu('board')
  : staffMenu('board');
const S = K.shell({ who, home: 'lx-board', title: admin ? 'LX 관리자 대시보드' : 'LX 직원 대시보드', rail });
K.devDrawer({ who });
S.app.querySelector('.k-board')?.setAttribute('aria-current', 'page');

const TABS = [
  { id: 'notice', label: '공지사항', canWrite: admin },
  { id: 'qna', label: 'QnA', canWrite: true },
  { id: 'case', label: '활용 사례', canWrite: admin },
  { id: 'doc', label: '자료집', canWrite: admin },
];
const two = (n) => String(n).padStart(2, '0');
const day = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
const q = new URLSearchParams(location.search);
const st = { tab: TABS.some((t) => t.id === q.get('tab')) ? q.get('tab') : 'notice', id: q.get('id') || null };

/* ── 판 ── */
const tabs = h('div.bd-tabs', { role: 'tablist', 'aria-label': '게시판' }, ...TABS.map((t) => h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { tab: t.id }, text: t.label })));
const write = h('button.t-btn.bd-write', { type: 'button', text: '글쓰기', hidden: true });
const box = h('section.bd-box.t-card', { 'aria-live': 'polite' });
const page = h('div.bd', {}, h('header.bd-head', {}, h('h1.bd-t', { text: '게시판' })), h('div.bd-bar', {}, tabs, write), box);
S.main.append(page);

tabs.addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b && (b.dataset.tab !== st.tab || st.id)) go(b.dataset.tab, null, true); });
write.addEventListener('click', () => openWriter(st.tab));
addEventListener('popstate', () => { const p = new URLSearchParams(location.search); st.tab = TABS.some((t) => t.id === p.get('tab')) ? p.get('tab') : 'notice'; st.id = p.get('id') || null; draw(); });

function go(tab, id, push) {
  st.tab = tab; st.id = id || null;
  const u = new URL(location.href);
  u.searchParams.set('tab', tab);
  if (id) u.searchParams.set('id', id); else u.searchParams.delete('id');
  history[push ? 'pushState' : 'replaceState'](null, '', u);
  draw();
}

/* ── 자료 — 공지는 /announcements · 나머지는 /board/{탭} ── */
const listOf = async (tab) => {
  if (tab === 'notice') { const j = await api('/announcements?limit=100'); return (j.items || []).map((a) => ({ ...a, kind: 'notice' })); }
  return (await api(`/board/${tab}?limit=200`)).items || [];
};
const oneOf = async (tab, id) => {
  if (tab === 'notice') { const it = (await listOf('notice')).find((a) => a.id === id); if (!it) throw Object.assign(new Error('글이 없습니다'), { code: 'not_found' }); return it; }
  return (await api(`/board/${tab}/${encodeURIComponent(id)}`)).item;
};

const wait = () => { const w = h('div.bd-wait'); box.replaceChildren(w); K.empty(w, { kind: 'loading', compact: true }).set({ progress: null }); };
const fail = (retry) => { const w = h('div.bd-wait'); box.replaceChildren(w); K.empty(w, { kind: 'error', compact: true, onRetry: retry }); };

let seq = 0;
async function draw() {
  for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === st.tab));
  const tab = TABS.find((t) => t.id === st.tab);
  write.hidden = !tab.canWrite || !!st.id;
  write.textContent = st.tab === 'qna' ? '질문하기' : '글쓰기';
  document.title = `${tab.label} · 게시판 · Land-XI`;
  const my = ++seq;
  wait();
  try {
    if (st.id) { const it = await oneOf(st.tab, st.id); if (my === seq) drawOne(it); }
    else { const items = await listOf(st.tab); if (my === seq) drawList(items); }
  } catch (e) {
    if (my !== seq) return;
    if (st.id && e?.code === 'not_found') { box.replaceChildren(h('p.bd-none', { text: '글이 없습니다' }), backBtn()); return; }
    fail(() => draw());
  }
}

function drawList(items) {
  if (!items.length) { box.replaceChildren(h('p.bd-none', { text: '아직 글이 없습니다' })); return; }
  box.replaceChildren(h('ul.bd-list', {}, ...items.map((it) => h('li', {}, h('a.bd-row', { href: `?tab=${st.tab}&id=${encodeURIComponent(it.id)}`, onclick: (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go(st.tab, it.id, true); } },
    h('b.bd-row-t', { text: it.title }),
    st.tab === 'qna' ? h('span.t-chip.bd-chip', { 'data-lv': it.answered ? null : 'wait', text: it.answered ? '답변 완료' : '답변 대기' }) : null,
    st.tab === 'doc' && it.file_name ? h('span.bd-row-f', { text: it.file_name, title: it.file_name }) : null,
    h('small.bd-row-m', {}, h('span', { text: it.by_name || '' }), h('span.num', { text: day(it.at) })))))));
}

function backBtn() { return h('button.bd-back', { type: 'button', text: '← 목록', onclick: () => go(st.tab, null, true) }); }

function drawOne(it) {
  const kids = [backBtn(),
    h('h2.bd-one-t', { text: it.title }),
    h('p.bd-one-m', { text: [it.by_name, day(it.at)].filter(Boolean).join(' · ') })];
  if (it.body) kids.push(h('div.bd-one-b', { text: it.body }));
  if (st.tab === 'doc' && it.file_name) {
    kids.push(h('div.bd-file', {}, h('span', { text: it.file_name }), it.bytes?.value != null ? h('small.num', { text: size(it.bytes.value) }) : null,
      h('button.t-btn.t-btn--2', { type: 'button', text: '내려받기', onclick: () => download(it) })));
  }
  if (st.tab === 'qna') {
    if (it.answer) {
      kids.push(h('section.bd-ans', { 'aria-label': '답' }, h('p.bd-ans-k', { text: '답' }), h('div.bd-one-b', { text: it.answer }),
        h('p.bd-one-m', { text: [it.answer_by_name, day(it.answered_at)].filter(Boolean).join(' · ') })));
    } else if (admin) {
      const ta = h('textarea.t-input.oc-ntc-ta', { maxlength: '4000', rows: '5', placeholder: '답을 적어 주세요', 'aria-label': '답' });
      const err = h('p.oc-ntc-err', { role: 'alert', hidden: true });
      const send = h('button.t-btn', { type: 'button', text: '답 달기', disabled: true });
      ta.addEventListener('input', () => { err.hidden = true; send.disabled = !ta.value.trim(); });
      send.addEventListener('click', async () => {
        send.disabled = true;
        try { await api(`/board/qna/${encodeURIComponent(it.id)}/answer`, { method: 'POST', body: { answer: ta.value.trim() } }); K.toast('답을 달았습니다'); draw(); }
        catch (e) { err.textContent = e.message || '답을 달지 못했습니다'; err.hidden = false; send.disabled = false; }
      });
      kids.push(h('section.bd-ans.oc-ntc', { 'aria-label': '답 달기' }, h('p.bd-ans-k', { text: '답 달기' }), ta, err, h('div.oc-ntc-act', {}, send)));
    } else {
      kids.push(h('p.bd-ans-wait', { text: 'LX 관리자의 답을 기다리고 있습니다' }));
    }
  }
  box.replaceChildren(h('article.bd-one', {}, ...kids));
}

async function download(it) {
  try {
    const s = session.get();
    const r = await fetch(`${API.prefix}/board/doc/${encodeURIComponent(it.id)}/file`, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
    if (!r.ok) throw new Error();
    const url = URL.createObjectURL(await r.blob());
    const a = h('a', { href: url, download: it.file_name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch { K.toast('파일을 내려받지 못했습니다'); }
}

/* ── 쓰기 — 공지는 지금 공지 쓰는 창 그대로 · 나머지는 제목 · 본문(+ 자료집 파일 하나) ── */
const ACCEPT = '.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp';
function openWriter(tab) {
  if (tab === 'notice') { openNoticeWriter({ onChange: () => { if (st.tab === 'notice' && !st.id) draw(); } }); return; }
  const t = TABS.find((x) => x.id === tab);
  const title = h('input.t-input', { type: 'text', maxlength: '80', autocomplete: 'off', placeholder: '제목 한 줄', 'aria-label': '제목' });
  const body = h('textarea.t-input.oc-ntc-ta', { maxlength: '4000', rows: '6', placeholder: tab === 'qna' ? '궁금한 내용' : '내용', 'aria-label': '본문' });
  const file = tab === 'doc' ? h('input.bd-file-in', { type: 'file', accept: ACCEPT, 'aria-label': '파일' }) : null;
  const go2 = h('button.t-btn', { type: 'button', text: '올리기', disabled: true });
  const err = h('p.oc-ntc-err', { role: 'alert', hidden: true });
  const ready = () => { err.hidden = true; go2.disabled = !title.value.trim() || (file && !file.files?.length); };
  title.addEventListener('input', ready); file?.addEventListener('change', ready);
  const wrap = h('div.oc-ntc', {},
    h('label.oc-ntc-f', {}, h('span', { text: '제목' }), title),
    h('label.oc-ntc-f', {}, h('span', {}, '본문', tab === 'doc' ? h('small', { text: '선택' }) : null), body),
    file ? h('label.oc-ntc-f', {}, h('span', {}, '파일', h('small', { text: '문서 · 그림 하나 · 20MB 까지' })), file) : null,
    err, h('div.oc-ntc-act', {}, go2));
  const m = modal({ title: tab === 'qna' ? '질문하기' : `${t.label} 쓰기`, body: wrap, size: 'lg' });
  go2.addEventListener('click', async () => {
    go2.disabled = true;
    try {
      const fd = new FormData();
      fd.append('title', title.value.trim()); fd.append('body', body.value.trim());
      if (file?.files?.[0]) fd.append('file', file.files[0], file.files[0].name);
      const s = session.get();
      const r = await fetch(`${API.prefix}/board/${tab}`, { method: 'POST', headers: s ? { authorization: 'Bearer ' + s.token } : {}, body: fd });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error?.message || '');
      m.close(true);
      K.toast('올렸습니다');
      go(tab, j.item.id, true);
    } catch (e) { err.textContent = e.message || '올리지 못했습니다'; err.hidden = false; go2.disabled = false; }
  });
  setTimeout(() => title.focus({ preventScroll: true }), 0);
}

draw();
