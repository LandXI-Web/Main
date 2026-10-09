/* me.js — 내 정보(본인이 고친다 · 구현 5차 · 확인 17차 P-5 ⓐ · 원칙 105 · 121 · 시안 design-r8/project-page new-me).
   머리의 내 이름(셸 역할 칸)을 누르면 가운데 창(kit/modal.js): 아이디(메일 · 고정) · 이름 · 부서 · 연락처(선택) — 관리자 승인 없이 바로 바뀌고
   바뀐 기록은 서버 감사 기록에 남는다. 아래에 나에게 할당된 자원 = 저장 용량(서버 GET /me/profile 한 출처).
   · 저장 용량(제안 S-19): 할당이 있으면 '할당 n GB 중 m 사용' 막대 + '용량 늘리기 요청'(원하는 할당 · 이유 한 줄 → LX 관리자 승인 · 반려 → 알림).
     할당이 없으면 '할당 없음 · 지금 쓴 양'만(지어내지 않는다). 90% 를 넘으면 한 줄로 늘리기 요청을 권한다(막지 않는다 — 원칙 91).
   · 부서(제안 S-21): LX 부서 목록에서 고르기(검색 · kit/dept.js) — 목록에 없는 부서(지사 등)는 적은 그대로. 지금 적힌 이름이 목록에 없으면 안내만.
   LX 직원 · LX 관리자 · LX 영업 계정(기관 계정은 확인 범위 밖 — 셸이 버튼을 붙이지 않는다).
   · 창은 두 단(직원-5 ⓐ · 10-09): 왼쪽 = 내 정보 칸 · 오른쪽 = 저장 용량(큰 숫자 · 프로젝트별 막대) + 늘리기 요청 이력(GET /me/storage).
   openMe({ onSaved(profile) }) · openStorageRequest({ storage, onDone(profile) }) — 파일 올리는 자리의 창에서도 같은 요청 창을 쓴다 */
import { h, api } from './util.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const CSS = new URL('./me.css', import.meta.url).href;
const sheet = () => { if (!document.querySelector('link[data-k-me]')) document.head.append(h('link', { rel: 'stylesheet', href: CSS, 'data-k-me': '' })); };
const v = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const stamp = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const md = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()}`; };
/** 크기 — 10진(서버 사용 현황과 같은 단위) */
export function size(b) {
  const n = Number(b) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n > 0) return `${Math.max(0.1, n / 1e3).toFixed(1)} KB`;
  return '0 MB';
}
/** 할당 GB — 100 → "100 GB" · 0.03 → "0.03 GB"(소수 둘째 자리까지 · 서버 gb_word 와 같은 말) */
export const gb = (x) => `${Number(x).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} GB`;

/** 저장 용량 한 줄(글) — 내 계정 탭 · 계정 관리 목록이 같이 쓴다 */
export function storageText(st = {}) {
  const used = Number(v(st.used)) || 0, q = v(st.quota_gb);
  return q !== null && q !== undefined ? `할당 ${gb(q)} 중 ${size(used)} 사용` : `할당 없음 · 지금 쓴 양 ${size(used)}`;
}

/** 저장 용량 칸 — 할당이 있으면 '할당 n GB 중 m 사용' + 막대 + 늘리기 요청, 없으면 '할당 없음 · 지금 쓴 양'.
    onAsk = '용량 늘리기 요청'을 눌렀을 때(없으면 버튼 없음 — 내 계정 탭처럼 보기만) */
export function storageBlock(st = {}, { onAsk } = {}) {
  sheet();
  const used = Number(v(st.used)) || 0, quota = v(st.quota_gb), n = Number(v(st.projects)) || 0, pct = v(st.pct);
  const has = quota !== null && quota !== undefined;
  const box = h('div.k-me-st', { class: st.warn ? 'is-warn' : '' });
  const ask = has && onAsk && !st.pending ? h('button.k-me-ask', { type: 'button', text: '용량 늘리기 요청', onclick: () => onAsk() }) : null;
  box.append(h('div.k-me-sth', {}, h('p.k-me-l', { text: '저장 용량' }), ask));
  if (has) {
    const w = Math.min(100, Math.max(used > 0 ? 1 : 0, Number(pct) || 0));
    box.append(h('p.k-me-sv', {}, h('span', {}, `할당 ${gb(quota)} 중`), ' ', h('span', {}, h('b.num', { text: size(used) }), ' 사용'),
      pct !== null && pct !== undefined ? h('small.num', { text: ` ${pct}%` }) : null),
    h('div.k-me-bar', { role: 'img', 'aria-label': `할당의 ${pct ?? 0}% 사용` }, h('i', { style: `width:${w}%` })));
  } else {
    box.append(h('p.k-me-sv', {}, h('span', {}, '할당 없음 ·'), ' ', h('span', {}, '지금 쓴 양 ', h('b.num', { text: size(used) }))));
  }
  box.append(h('p.k-me-sub', { text: n ? `내가 프로젝트장인 프로젝트 ${n}개의 학습데이터 · 올린 파일` : '내가 프로젝트장인 프로젝트가 없습니다' }));
  if (st.warn) box.append(h('p.k-me-warn', {}, h('span', { text: `할당의 ${pct}%를 썼습니다.` }), ' ',
    h('span', { text: st.pending ? '늘리기 요청을 보냈습니다' : '더 필요하면 늘리기 요청을 보내 주세요' })));
  if (st.pending) {
    box.append(h('p.k-me-req', {}, h('span', { text: `늘리기 요청 중 ${gb(v(st.pending.want_gb))} ·` }), ' ', h('span', { text: `${md(st.pending.at)} 보냄 · LX 관리자 확인 전` })));
  } else if (st.last) {
    const ok = st.last.state === 'approved';
    box.append(h('p.k-me-req', { class: ok ? '' : 'is-no' },
      h('span', { text: `지난 요청 ${gb(v(st.last.want_gb))} · ${md(st.last.at)} ${ok ? '승인' : '반려'}${!ok && st.last.reason ? ' ·' : ''}` }),
      !ok && st.last.reason ? ' ' : null, !ok && st.last.reason ? h('span', { text: `사유 ${st.last.reason}` }) : null));
  }
  return box;
}

/** 프로젝트별 막대 줄(이름 | 막대 | 크기) — 대시보드 '저장 용량' 칸과 내 정보 창 오른쪽 단이 같이 쓴다(직원-4 ⓐ · 직원-5 ⓐ · 같은 모양 한 벌).
    막대 = 내가 쓴 전체 가운데 그 프로젝트 몫. 보관한 프로젝트는 이름 뒤 '보관'. max 를 넘으면 '외 n개' 한 줄 */
export function projectBars(projects = [], used = 0, { max = 4 } = {}) {
  sheet();
  const all = Number(used) || 0;
  const list = projects.slice(0, max).map((p) => {
    const w = all ? Math.round((p.bytes / all) * 100) : 0;
    return h('li', {}, h('span.k-me-pn', { text: p.name + (p.archived ? ' · 보관' : ''), title: p.name }),
      h('span.k-me-bar', { role: 'img', 'aria-label': `전체의 ${w}%` }, h('i', { style: `width:${Math.max(p.bytes > 0 ? 1 : 0, w)}%` })),
      h('span.k-me-pv.num', { text: size(p.bytes) }));
  });
  const ul = h('ul.k-me-bars', {}, ...list);
  if (projects.length > max) ul.append(h('li.k-me-more', { text: `외 ${projects.length - max}개` }));
  return ul;
}

/** 큰 숫자(29.8 MB) — 숫자 · 단위 · 회색 한 줄 */
export function bigSize(bytes, note) {
  sheet();
  const [n, u] = size(bytes).split(' ');
  return h('p.k-me-big', {}, h('b.num', { text: n }), h('span', { text: u }), note ? h('small', { text: note }) : null);
}

/** 내 정보 창 오른쪽 단 — 저장 용량(큰 숫자 · 프로젝트별 막대 · 늘리기 요청) + 늘리기 요청 이력(서버 GET /me/storage 한 출처) */
function storageSide(S, { onAsk } = {}) {
  const st = S.storage || {};
  const used = Number(v(st.used)) || 0, quota = v(st.quota_gb), pct = v(st.pct);
  const has = quota !== null && quota !== undefined;
  const ask = has && onAsk && !st.pending ? h('button.k-me-ask', { type: 'button', text: '용량 늘리기 요청', onclick: () => onAsk() }) : null;
  const a = h('div.k-me-st', { class: st.warn ? 'is-warn' : '' },
    h('div.k-me-sth', {}, h('p.k-me-l', { text: '저장 용량' }), ask || h('span.k-me-tag', { text: has ? `할당 ${gb(quota)}` : '할당 없음' })),
    bigSize(used, has ? `할당 ${gb(quota)} 중${pct !== null && pct !== undefined ? ` · ${pct}%` : ''}` : '지금 쓴 양'));
  if (has) {
    const w = Math.min(100, Math.max(used > 0 ? 1 : 0, Number(pct) || 0));
    a.append(h('div.k-me-bar', { role: 'img', 'aria-label': `할당의 ${pct ?? 0}% 사용` }, h('i', { style: `width:${w}%` })));
  }
  const ps = S.projects || [];
  if (ps.length) a.append(projectBars(ps, used, { max: 5 }));
  a.append(h('p.k-me-sub', { text: ps.length ? `내가 프로젝트장인 프로젝트 ${ps.length}개의 학습데이터 · 올린 파일` : '내가 프로젝트장인 프로젝트가 없습니다' }));
  if (st.warn) a.append(h('p.k-me-warn', {}, h('span', { text: `할당의 ${pct}%를 썼습니다.` }), ' ',
    h('span', { text: st.pending ? '늘리기 요청을 보냈습니다' : '더 필요하면 늘리기 요청을 보내 주세요' })));

  const R = S.requests || [];
  const wait = R.filter((r) => r.state === 'pending').length;
  const ST = { pending: '대기', approved: '승인', rejected: '반려' };
  const b = h('div.k-me-st', {},
    h('div.k-me-sth', {}, h('p.k-me-l', { text: '늘리기 요청 이력' })),
    h('p.k-me-big', { class: R.length ? '' : 'is-zero' }, h('b.num', { text: String(R.length) }), h('small', { text: `보낸 요청 · 대기 ${wait}` })));
  if (R.length) {
    b.append(h('ul.k-me-rows', {}, ...R.slice(0, 5).map((r) => h('li', {},
      h('span.k-me-rw.num', { text: md(r.at) }),
      h('span.k-me-rt', {}, h('b', { text: `${r.from_gb !== null ? gb(r.from_gb) : '할당 없음'} → ${gb(r.want_gb)}` }), r.why ? h('i', { text: r.why }) : null,
        r.state === 'rejected' && r.reason ? h('small', { text: `사유 ${r.reason}` }) : null),
      h('span.k-me-rs', { class: r.state === 'rejected' ? 'is-no' : '', text: ST[r.state] || r.state })))));
  }
  b.append(h('p.k-me-sub', { text: has ? '보낸 요청의 승인 · 반려가 여기 쌓입니다' : "할당이 정해지면 '용량 늘리기 요청'을 보낼 수 있고, 승인 · 반려가 여기 쌓입니다" }));
  return h('div.k-me-r', {}, a, b);
}

/** 용량 늘리기 요청 창 —원하는 할당(GB) · 이유 한 줄. 보내면 LX 관리자 계정 관리 '저장 용량 요청'에 한 건 */
export function openStorageRequest({ storage = {}, onDone } = {}) {
  sheet();
  const q = v(storage.quota_gb), used = Number(v(storage.used)) || 0, pct = v(storage.pct);
  const want = h('input.t-input', { type: 'number', name: 'want_gb', min: String(q || 0), step: '1', inputmode: 'decimal', autocomplete: 'off', 'aria-label': '원하는 할당(GB)' });
  const why = h('input.t-input', { type: 'text', name: 'why', maxlength: '120', autocomplete: 'off', placeholder: '예: 2차 학습데이터 추가' });
  const go = h('button.t-btn', { type: 'button', text: '요청 보내기', disabled: true });
  const cancel = h('button.t-btn.t-btn--text.k-me-x', { type: 'button', text: '취소' });
  const err = h('p.k-me-err', { role: 'alert', hidden: true });
  const ready = () => { err.hidden = true; go.disabled = !(Number(want.value) > Number(q || 0) && why.value.trim()); };
  want.addEventListener('input', ready); why.addEventListener('input', ready);
  const body = h('div.k-me', {},
    h('p.k-me-now', {}, h('span', { text: `지금 할당 ${gb(q)} 중` }), ' ', h('span', { text: `${size(used)} 사용${pct !== null && pct !== undefined ? ` · ${pct}%` : ''}` })),
    h('label.k-me-f', {}, h('span.k-me-l', { text: '원하는 할당' }), h('span.k-me-gb', {}, want, h('i', { text: 'GB' })),
      h('small.k-me-hint', { text: `지금 할당 ${gb(q)}보다 크게 적습니다` })),
    h('label.k-me-f', {}, h('span.k-me-l', { text: '이유 한 줄' }), why),
    h('p.k-me-say', {}, h('span', { text: 'LX 관리자가 승인하면 할당이 늘고,' }), ' ', h('span', { text: '승인 · 반려를 알림으로 받습니다' })),
    err, h('div.k-me-act', {}, go, cancel));
  const m = modal({ title: '저장 용량 늘리기 요청', body });
  m.el.classList.add('k-me-md');
  cancel.addEventListener('click', () => m.close());
  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      const out = await api('/me/storage-request', { method: 'POST', body: { want_gb: Number(want.value), why: why.value.trim() } });
      m.close(true);
      toast('늘리기 요청을 보냈습니다');
      onDone?.(out);
    } catch (e) { err.textContent = e.message || '보내지 못했습니다'; err.hidden = false; go.disabled = false; }
  });
  setTimeout(() => want.focus({ preventScroll: true }), 0);
  return m;
}

let cur = null;
export function openMe({ onSaved } = {}) {
  if (cur) return cur;
  sheet();
  const body = h('div.k-me', {}, h('p.k-me-wait', { text: '불러오는 중' }));
  const m = modal({ title: '내 정보', body, onClose: () => { cur = null; } });
  m.el.classList.add('k-me-md', 'k-me-wide');          // 두 단(직원-5 ⓐ) — 왼쪽 내 정보 · 오른쪽 저장 용량 · 늘리기 요청 이력
  cur = m;
  /* 오른쪽 단 = GET /me/storage(프로젝트별 · 요청 이력). 못 받으면 내 정보의 저장 용량 한 칸(예전 모양)으로 */
  const side = () => api('/me/storage').catch(() => null);
  const load = () => Promise.all([api('/me/profile'), side()]).then(([p, s]) => draw(p, s))
    .catch(() => { body.replaceChildren(h('p.k-me-wait', { text: '내 정보를 불러오지 못했습니다' })); });
  load();

  function draw(p, S) {
    const field = (label, input, opt, tag = 'label.k-me-f') => h(tag, {}, h('span.k-me-l', {}, label, opt ? h('small', { text: '선택' }) : null), input);
    const name = h('input.t-input', { type: 'text', name: 'name', maxlength: '40', autocomplete: 'name', value: p.name || '' });
    const dept = h('input.t-input', { type: 'text', name: 'dept', maxlength: '60', autocomplete: 'off', value: p.dept || '', placeholder: '부서 이름 일부를 적으면 찾습니다', 'aria-label': '부서' });
    const contact = h('input.t-input', { type: 'text', name: 'contact', maxlength: '30', autocomplete: 'tel', value: p.contact || '', placeholder: '내선 또는 휴대전화' });
    const save = h('button.t-btn', { type: 'button', text: '저장', disabled: true });
    const cancel = h('button.t-btn.t-btn--text.k-me-x', { type: 'button', text: '취소' });
    const err = h('p.k-me-err', { role: 'alert', hidden: true });
    const dirty = () => { save.disabled = !name.value.trim() || (name.value.trim() === (p.name || '') && dept.value.trim() === (p.dept || '') && contact.value.trim() === (p.contact || '')); };
    for (const x of [name, dept, contact]) x.addEventListener('input', () => { err.hidden = true; dirty(); });
    const deptBox = field('부서', dept, false, 'div.k-me-f');
    /* 저장 용량 칸 — 늘리기 요청을 보내면 이 칸만 새로 그린다(고치던 이름 · 부서는 그대로) */
    let stBox = null;
    const again = () => side().then((s) => { if (s) stDraw(s); });
    const stDraw = (s, fb = p.storage) => {
      const st = s ? s.storage : fb;
      const onAsk = () => openStorageRequest({ storage: st, onDone: (out) => (s ? again() : stDraw(null, out.storage)) });
      const nb = s ? storageSide(s, { onAsk }) : h('div.k-me-r', {}, storageBlock(st, { onAsk }));
      if (stBox) stBox.replaceWith(nb);
      stBox = nb;
      return nb;
    };
    body.replaceChildren(h('div.k-me-two', {},
      h('div.k-me', {},
        h('div.k-me-f', {}, h('span.k-me-l', { text: '아이디' }), h('p.k-me-ro', { text: p.login, title: '아이디(메일)는 바꿀 수 없습니다' })),
        field('이름', name), deptBox, field('연락처', contact, true),
        h('p.k-me-say', {}, h('span', { text: '관리자 승인 없이 바로 바뀌고,' }), ' ', h('span', { text: '바꾼 기록이 남습니다' }), h('br'),
          `마지막 바꿈 ${p.changed_at ? stamp(p.changed_at) : '없음'}`),
        err, h('div.k-me-act', {}, save, cancel)),
      stDraw(S)));
    import('./dept.js').then((d) => d.deptPicker(dept).ready).then((has) => { if (!has) dept.placeholder = '부서 이름'; })
      .catch(() => { dept.placeholder = '부서 이름'; });
    cancel.addEventListener('click', () => m.close());
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const out = await api('/me/profile', { method: 'PATCH', body: { name: name.value.trim(), dept: dept.value.trim(), contact: contact.value.trim() } });
        m.close(true); cur = null;
        toast('내 정보를 바꿨습니다');
        onSaved?.(out);
      } catch (e) { err.textContent = e.message || '저장하지 못했습니다'; err.hidden = false; dirty(); }
    });
    setTimeout(() => name.focus({ preventScroll: true }), 0);
  }
  return m;
}
