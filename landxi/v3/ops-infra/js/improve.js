/* 개선 후보 — XI ChatGEO 가 못 한 요청을 모아 묶은 '자주 막히는 요청'(구현 4차 · 확인 대장 16차 개선-1 확인 · 원칙 98 · 72).
   LX 관리자 대시보드 → 배포(서비스 관리) → '개선 후보' 탭 하나(새 메뉴 없음 · 시안 new-e-candidates).
   LX 직원(담당 프로젝트장)은 요청함의 '개선 후보' 칸에서 자기 서비스 · 기관에서 온 것만 같은 모양으로 본다(openImproveDrawer).
   줄마다 채택 · 보류(사유 · 다시 볼 날짜) · 이미 됨(안내 문구 한 줄 → 다음부터 같은 요청의 답에 그 문구와 버튼). 반려 없음.
   채택한 것이 만들어지면 LX 관리자가 '이제 됩니다 보내기' → 물었던 사람의 채팅창 맨 위 한 줄(메일 · 문자 없음).
   숫자는 서버 값 그대로(GET /improve/items) — 지어낸 값 0 · 세지 않은 칸은 '—'. 대화 원문은 서버에도 없다(요지 · 지명 등은 ○○). */
import { api, h, esc, empty, toast, drawer } from './kit.js';
import { modal } from '../../kit/modal.js';

{ const href = new URL('../improve.css', import.meta.url).href;
  if (![...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === href)) document.head.append(h('link', { rel: 'stylesheet', href })); }

const ROLES = [['', '전체'], ['LX 직원', 'LX 직원'], ['LX 관리자', 'LX 관리자'], ['기관', '기관']];
const STATES = [['new', '새로 옴'], ['adopted', '채택'], ['held', '보류'], ['already', '이미 됨'], ['built', '만들어짐']];
const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const nf = (v) => Number(v).toLocaleString('ko-KR');
const cnt = (e) => (val(e) == null ? '—' : nf(val(e)));
const q = (s) => `'${s}'`;
/** 받침에 맞는 '이' · '가'(서버 기본 문구와 같은 규칙) */
const iga = (w) => { const c = String(w || '').replace(/[\s'"”’.…]+$/, '').slice(-1); return c >= '가' && c <= '힣' && (c.charCodeAt(0) - 0xac00) % 28 ? '이' : '가'; };
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** 요청함 칸 숫자 — 내 범위의 '새로 옴' 수(LX 직원) · 실패하면 null */
export async function improveCount() {
  const j = await api('/improve/items');
  return j?.counts?.new ?? null;
}

/** 줄 아래 한 줄 — 비고가 있으면 비고, 없으면 예시 요지 둘(원문 아님 · 가린 뒤) */
function subLine(x) {
  const c = val(x.cancel) ? `확인 카드 취소 ${nf(val(x.cancel))}번` : '';
  let s = '';
  if (x.state === 'new' && x.hold?.reason) s = `지난 보류: ${x.hold.reason}`;
  else if (x.note) s = x.note;
  else s = (x.examples || []).map(q).join(' · ');
  return [s, c].filter(Boolean).join(' · ');
}

/** 결정된 줄의 모습 — 칩 + 한 줄 */
function decided(x, admin) {
  const st = x.state;
  const chip = (t, lv) => `<span class="t-chip im-st"${lv ? ` data-lv="${lv}"` : ''}>${esc(t)}</span>`;
  let line = '', acts = '';
  if (st === 'adopted') {
    line = `${chip('채택 · 확인 대기')}<small>제안 방법 — ${esc(x.how || '')}</small>`;
    if (admin && x.can?.notify) acts += `<button class="t-btn im-b" type="button" data-a="notify">이제 됩니다 보내기</button>`;
  } else if (st === 'held') {
    line = `${chip(`보류 · ${x.hold?.until_md || ''} 다시 봄`, 'wait')}<small>사유 — ${esc(x.hold?.reason || '')}</small>`;
  } else if (st === 'already') {
    line = `${chip('이미 됨')}<small>안내 문구 — "${esc(x.already?.text || '')}"${x.already?.try ? ` · 버튼 ${esc(q(x.already.try))}` : ''}</small>`;
  } else if (st === 'built') {
    const n = val(x.notice?.n) || 0;
    line = `${chip('만들어짐')}<small>${n ? `${nf(n)}명에게 '이제 됩니다' 보냄` : '물었던 사람이 없어 알림 없이 마침'}${x.notice?.md ? ` · ${esc(x.notice.md)}` : ''}</small>`;
  }
  if (x.can?.reopen) acts += `<button class="im-re" type="button" data-a="reopen">다시 고르기</button>`;
  return `<div class="im-dec">${line}</div>${acts ? `<div class="im-acts">${acts}</div>` : ''}`;
}

/** 좁은 화면 · 서랍 — 숫자 칸을 한 줄로(몇 번 · 역할 · 화면 · 다시 물음 · 도움 안 됨 + 분류) */
function meta(x) {
  const segs = [`<b class="num">${cnt(x.n)}</b>번`, (x.roles || []).join(' · ') || null, (x.screens || []).join(' · ') || null,
    `다시 물음 ${cnt(x.reask)}`, `도움 안 됨 ${cnt(x.not_helpful)}`].filter(Boolean);
  return `<span class="im-meta">${segs.map((t, i) => `<span class="im-seg">${t}${i < segs.length - 1 ? ' ·' : ''}</span>`).join(' ')}
    <span class="t-chip im-k">${esc(x.kind_label)}</span></span>`;
}

function buttons(x, admin) {
  if (x.state === 'new') {
    return `<div class="im-acts"><button class="t-btn im-b" type="button" data-a="adopt">채택</button>
      <button class="t-btn t-btn--2 im-b" type="button" data-a="hold">보류</button>
      <button class="t-btn t-btn--2 im-b" type="button" data-a="already">이미 됨</button></div>`;
  }
  return decided(x, admin);
}

/** 판 — admin: LX 관리자(전부 · '이제 됩니다' 보내기) · compact: 서랍 안(카드 모양) */
export function improveBoard(root, { admin = true, compact = false, onCount } = {}) {
  const st = { state: 'new', role: '', data: null };
  const sumEl = h('section.t-card.im-sum', { 'aria-label': '막힌 요청' });
  const filt = h('section.t-card.im-filt', { 'aria-label': '걸러 보기' });
  const box = h('section.t-card.im-box', { 'aria-label': '자주 막히는 요청' });
  const foot = h('p.im-foot');
  root.classList.add('im');
  if (compact) root.classList.add('im--c');
  root.append(h('div.im-top', {}, sumEl, filt), box, foot);

  const hold = (o) => { const x = h('div'); box.replaceChildren(x); empty(x, o); };
  async function load({ quiet = false } = {}) {
    if (!st.data && !quiet) hold({ kind: 'loading', compact: true });
    try { st.data = await api('/improve/items'); }
    catch (e) { if (!st.data) hold({ kind: 'error', compact: true, onRetry: () => load() }); return; }
    onCount?.(st.data.counts?.new ?? 0, st.data);
    paint();
  }

  function paintTop() {
    const d = st.data, s = d.summary || {};
    const mine = d.scope === 'mine';
    const fc = val(s.from_check) || 0;
    sumEl.innerHTML = `<p class="t-label">${mine ? '내 서비스 · 기관에서 막힌 요청' : '막힌 요청'}</p>
      <p class="im-big"><b class="num" data-metric="막힌 요청" data-v="${val(s.blocked) ?? ''}">${cnt(s.blocked)}</b><span>건</span></p>
      <p class="im-sum-s"><span>이번 달 ${cnt(s.blocked_month)}건 · ${cnt(s.groups)}가지로 묶임</span>${fc ? `<span>10-01 점검 ${nf(fc)}건 포함</span>` : ''}</p>`;
    const c = d.counts || {};
    filt.innerHTML = `<div class="im-fr"><span class="im-fl">역할</span><div class="im-chips" data-f="role">${ROLES.map(([k, t]) =>
      `<button type="button" class="im-chip" data-v="${esc(k)}" aria-pressed="${st.role === k}">${esc(t)}</button>`).join('')}</div></div>
      <div class="im-fr"><span class="im-fl">상태</span><div class="im-chips" data-f="state">${STATES.map(([k, t]) =>
      `<button type="button" class="im-chip" data-v="${k}" aria-pressed="${st.state === k}">${esc(t)}${c[k] ? ` <b class="num">${nf(c[k])}</b>` : ''}</button>`).join('')}</div></div>`;
  }

  function rows() {
    return (st.data.items || []).filter((x) => x.state === st.state && (!st.role || (x.roles || []).includes(st.role)));
  }

  function paint() {
    if (!st.data) return;
    paintTop();
    const all = st.data.items || [];
    foot.innerHTML = `<span>'다시 물음 · 도움 안 됨' — 10-01 점검에서 온 줄은 세지 않아 비워 둡니다(—)</span><span>채택하면 확인 대장에 '확인 대기'로 올라갑니다</span>`;
    if (!all.length) { hold({ kind: 'first', title: '아직 막힌 요청이 없습니다', compact: true }); return; }
    const list = rows();
    if (!list.length) { hold({ kind: 'first', title: '이 조건의 요청이 없습니다', compact: true }); return; }
    box.innerHTML = `<table class="im-t">
      <thead><tr><th>자주 막히는 요청</th><th class="num">몇 번</th><th>역할</th><th>화면</th><th class="num">다시 물음</th><th class="num">도움 안 됨</th><th>분류</th><th class="im-th-a"><span class="im-sr">누르기</span></th></tr></thead>
      <tbody>${list.map((x) => `<tr data-id="${esc(x.id)}" data-state="${esc(x.state)}">
        <td data-k="요청" class="im-g"><b>${esc(x.gist)}</b>${subLine(x) ? `<small>${esc(subLine(x))}</small>` : ''}${meta(x)}</td>
        <td data-k="몇 번" class="num"><b data-metric="몇 번" data-v="${val(x.n) ?? ''}">${cnt(x.n)}</b></td>
        <td data-k="역할">${esc((x.roles || []).join(' · ') || '—')}</td>
        <td data-k="화면">${(x.screens || []).length ? x.screens.map((s) => `<span class="im-seg">${esc(s)}</span>`).join(' · ') : '—'}</td>
        <td data-k="다시 물음" class="num">${cnt(x.reask)}</td>
        <td data-k="도움 안 됨" class="num">${cnt(x.not_helpful)}</td>
        <td data-k="분류"><span class="t-chip im-k">${esc(x.kind_label)}</span></td>
        <td class="im-a">${buttons(x, admin)}</td></tr>`).join('')}</tbody></table>`;
  }

  filt.addEventListener('click', (e) => {
    const b = e.target.closest('.im-chip'); if (!b) return;
    const f = b.parentElement.dataset.f;
    st[f] = b.dataset.v;
    paint();
  });

  async function act(id, a, body = {}) {
    try {
      const r = await api(`/improve/items/${encodeURIComponent(id)}/${a}`, { method: 'POST', body });
      const i = st.data.items.findIndex((x) => x.id === id);
      if (i >= 0 && r?.item) st.data.items[i] = r.item;
      const c = st.data.counts = { new: 0, adopted: 0, built: 0, held: 0, already: 0 };
      for (const x of st.data.items) c[x.state] = (c[x.state] || 0) + 1;
      c.all = st.data.items.length;
      onCount?.(c.new, st.data);
      paint();
      return r?.item;
    } catch (err) { toast(err?.message || '지금은 바꿀 수 없습니다'); throw err; }
  }

  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const tr = b.closest('tr[data-id]'); const id = tr?.dataset.id;
    const x = st.data.items.find((y) => y.id === id); if (!x) return;
    const a = b.dataset.a;
    if (a === 'adopt') { b.disabled = true; act(id, 'adopt').then(() => toast("채택했습니다 — 확인 대장 '확인 대기'로 올라갑니다")).catch(() => { b.disabled = false; }); }
    else if (a === 'reopen') { act(id, 'reopen').then(() => toast('새로 옴으로 돌렸습니다')).catch(() => {}); }
    else if (a === 'hold') holdForm(x);
    else if (a === 'already') alreadyForm(x);
    else if (a === 'notify') notifyForm(x);
  });

  /** 가운데 창 폼 — 칸 · 안내 · 버튼(같은 모양) */
  function form(title, x, fields, button, send, note) {
    const msg = h('p.im-msg', { role: 'alert', hidden: true });
    const go = h('button.t-btn', { type: 'submit', text: button });
    const f = h('form.im-form', { novalidate: true },
      h('p.im-form-g', {}, h('span', { text: '요청' }), h('b', { text: x.gist })),
      note ? h('p.im-form-n', { text: note }) : null,
      ...fields.map((d) => h('label.im-f', {}, h('span', { text: d.label }), d.el, d.hint ? h('small', { text: d.hint }) : null)),
      msg, h('div.im-form-a', {}, go));
    const m = modal({ title, body: f, size: 'md' });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.hidden = true;
      go.disabled = true;
      try { await send(); m.close(); }
      catch (err) { msg.textContent = err?.message || '지금은 저장할 수 없습니다'; msg.hidden = false; go.disabled = false; }
    });
    requestAnimationFrame(() => f.querySelector('input')?.focus());
    return m;
  }
  function holdForm(x) {
    const reason = h('input.t-input', { type: 'text', maxlength: '120', placeholder: '예: 다음 학습 회차에 함께 보기로' });
    const until = h('input.t-input', { type: 'date', min: plusDays(1), value: plusDays(14) });
    form('보류', x, [{ label: '사유 한 줄', el: reason }, { label: '다시 볼 날짜', el: until, hint: '그날이 되면 다시 새로 옴으로 올라옵니다' }], '보류하기', async () => {
      await act(x.id, 'hold', { reason: reason.value.trim(), until: until.value });
      toast('보류했습니다');
    });
  }
  function alreadyForm(x) {
    const text = h('input.t-input', { type: 'text', maxlength: '120', placeholder: '예: 분석은 LX가 합니다 — 분석 의뢰를 보내 주세요' });
    const tr = h('input.t-input', { type: 'text', maxlength: '100', placeholder: '예: 분석 의뢰 보내는 법 알려 줘' });
    form('이미 됨', x, [{ label: '안내 문구 한 줄', el: text }, { label: '버튼을 누르면 보낼 질문(고르지 않아도 됩니다)', el: tr }], '저장', async () => {
      await act(x.id, 'already', { text: text.value.trim(), try: tr.value.trim() || undefined });
      toast('저장했습니다 — 다음부터 같은 요청에 이 안내가 나갑니다');
    }, '다음부터 같은 요청을 하면 XI ChatGEO 답에 이 문구와 버튼이 바로 나갑니다');
  }
  function notifyForm(x) {
    const n = val(x.askers) || 0;
    const def = `지난번에 물으신 '${x.gist}'${iga(x.gist)} 이제 됩니다.`;
    const text = h('input.t-input', { type: 'text', maxlength: '120', value: def });
    const tr = h('input.t-input', { type: 'text', maxlength: '100', value: x.gist.includes('○○') ? '' : x.gist, placeholder: '예: 2024년과 2025년 영상을 나란히 보여 줘' });
    const note = n ? `이 요청을 했던 ${nf(n)}명이 다음에 XI ChatGEO 를 열 때 맨 위에 한 줄로 봅니다(메일 · 문자 없음).`
      : "이 요청을 했던 사람이 없습니다(10-01 점검에서 온 줄이거나 90일이 지났습니다). 보내면 '만들어짐'으로만 바뀝니다.";
    form('이제 됩니다 보내기', x, [{ label: '한 줄', el: text }, { label: "'해 보기'를 누르면 보낼 질문", el: tr }], '보내기', async () => {
      const it = await act(x.id, 'notify', { text: text.value.trim(), try: tr.value.trim() || undefined });
      toast(val(it?.notice?.n) ? `${nf(val(it.notice.n))}명에게 보냈습니다` : '만들어짐으로 바꿨습니다');
    }, note);
  }

  return { load, paint, get data() { return st.data; } };
}

/** LX 관리자 대시보드 → 배포 → '개선 후보' 탭(배포 표는 그대로 '배포' 탭) · 깊은 주소 #/deploys/improve */
export function mountImprove(root) {
  const dep = h('div.im-dep');
  dep.append(...root.childNodes);
  const tDep = h('button', { type: 'button', role: 'tab', dataset: { tab: 'dep' }, text: '배포' });
  const tImp = h('button', { type: 'button', role: 'tab', dataset: { tab: 'imp' } }, h('span', { text: '개선 후보' }), h('b.num.im-tab-n'));
  const pane = h('div.im-pane');
  root.append(h('div.im-head', {}, h('nav.im-tabs', { role: 'tablist', 'aria-label': '배포' }, tDep, tImp)), dep, pane);
  const board = improveBoard(pane, { admin: true, onCount: (n) => { tImp.querySelector('.im-tab-n').textContent = n ? nf(n) : ''; } });
  let tab = /\/improve\b/.test(location.hash) ? 'imp' : 'dep', timer = 0;
  function set(t, push = false) {
    tab = t;
    tDep.setAttribute('aria-selected', String(t === 'dep'));
    tImp.setAttribute('aria-selected', String(t === 'imp'));
    dep.hidden = t !== 'dep';
    pane.hidden = t !== 'imp';
    if (push) history.replaceState(null, '', t === 'imp' ? '#/deploys/improve' : '#/deploys');
    clearInterval(timer);
    if (t === 'imp') { board.load(); timer = setInterval(() => { if (!root.hidden && !document.hidden) board.load({ quiet: true }); }, 60000); }
  }
  tDep.addEventListener('click', () => set('dep', true));
  tImp.addEventListener('click', () => set('imp', true));
  addEventListener('hashchange', () => { if (/^#\/deploys/.test(location.hash)) { const t = /\/improve\b/.test(location.hash) ? 'imp' : 'dep'; if (t !== tab) set(t); } });
  set(tab);
  if (tab !== 'imp') board.load({ quiet: true });      // 탭 숫자(새로 옴)만 먼저
  return { show: set, reload: () => board.load() };
}

/** LX 직원 요청함 — '개선 후보' 칸을 누르면 서랍(내가 담당하는 서비스 · 기관에서 온 것만 · 같은 모양) */
export function openImproveDrawer({ onCount } = {}) {
  const body = h('div.im-dr');
  history.replaceState(null, '', location.pathname + location.search + '#improve');
  drawer({ title: '개선 후보', body, label: '개선 후보', width: 'min(720px, 100vw)',
    onClose: () => history.replaceState(null, '', location.pathname + location.search) });
  body.append(h('p.im-dr-s', { text: 'XI ChatGEO 가 내 서비스 · 기관에서 못 한 요청입니다. 채택하면 확인 대장으로 올라가고, 만들어지면 LX 관리자가 물었던 사람에게 알립니다.' }));
  const host = h('div');
  body.append(host);
  improveBoard(host, { admin: false, compact: true, onCount }).load();
}
