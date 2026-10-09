/* me.js — 내 정보(본인이 고친다 · 구현 5차 · 확인 17차 P-5 ⓐ · 원칙 105 · 121 · 시안 design-r8/project-page new-me).
   머리의 내 이름(셸 역할 칸)을 누르면 가운데 창(kit/modal.js): 아이디(메일 · 고정) · 이름 · 부서 · 연락처(선택) — 관리자 승인 없이 바로 바뀌고
   바뀐 기록은 서버 감사 기록에 남는다. 아래에 나에게 할당된 자원 = 저장 용량(서버 GET /me/profile 한 출처).
   · 저장 용량(제안 S-19 · 직원-7): 도넛(가운데 사용량 · 프로젝트별 비중) + 할당 대비 막대 + '증량 신청'(필요한 용량 · 사유 → LX 관리자 승인 · 거절 → 알림).
     할당이 없으면 '할당 없음'(지어내지 않는다). 90% 를 넘으면 한 줄로 증량 신청을 권한다(막지 않는다 — 원칙 91).
   · 부서(제안 S-21): LX 부서 목록에서 고르기(검색 · kit/dept.js) — 목록에 없는 부서(지사 등)는 적은 그대로. 지금 적힌 이름이 목록에 없으면 안내만.
   LX 직원 · LX 관리자 · LX 영업 계정(기관 계정은 확인 범위 밖 — 셸이 버튼을 붙이지 않는다).
   · 창은 두 단(직원-5 ⓐ · 10-09): 왼쪽 = 내 정보 칸 · 오른쪽 = 저장 용량(도넛 · 할당 대비 막대 · 증량 신청 폼이 같은 자리에서 펼쳐짐) + 증량 신청 이력(GET /me/storage).
   openMe({ onSaved, ask }) · openStorageRequest({ onDone }) — 파일 올리는 자리 · 대시보드도 내 정보 창을 열어 같은 자리에서 폼을 펼친다 */
import { h, api } from './util.js';
import { modal } from './modal.js';
import { empty } from './empty.js';
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

/** 저장 용량 칸 — 할당이 있으면 '할당 n GB 중 m 사용' + 막대 + 증량 신청, 없으면 '할당 없음 · 지금 쓴 양'.
    onAsk = '증량 신청'을 눌렀을 때(없으면 버튼 없음 — 내 계정 탭처럼 보기만) */
export function storageBlock(st = {}, { onAsk } = {}) {
  sheet();
  const used = Number(v(st.used)) || 0, quota = v(st.quota_gb), n = Number(v(st.projects)) || 0, pct = v(st.pct);
  const has = quota !== null && quota !== undefined;
  const box = h('div.k-me-st', { class: st.warn ? 'is-warn' : '' });
  const ask = has && onAsk && !st.pending ? h('button.k-me-ask', { type: 'button', text: '증량 신청', onclick: () => onAsk() }) : null;
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
    h('span', { text: st.pending ? '증량 신청을 보냈습니다' : '더 필요하면 증량 신청을 해 주세요' })));
  if (st.pending) {
    box.append(h('p.k-me-req', {}, h('span', { text: `증량 신청 중 ${gb(v(st.pending.want_gb))} ·` }), ' ', h('span', { text: `${md(st.pending.at)} 신청 · LX 관리자 확인 전` })));
  } else if (st.last) {
    const ok = st.last.state === 'approved';
    box.append(h('p.k-me-req', { class: ok ? '' : 'is-no' },
      h('span', { text: `지난 신청 ${gb(v(st.last.want_gb))} · ${md(st.last.at)} ${ok ? '승인' : '거절'}${!ok && st.last.reason ? ' ·' : ''}` }),
      !ok && st.last.reason ? ' ' : null, !ok && st.last.reason ? h('span', { text: `거절 사유 ${st.last.reason}` }) : null));
  }
  return box;
}

/** 프로젝트별 막대 줄(이름 | 막대 | 크기) — 예전 부품(다른 화면이 쓰면 그대로). 저장 용량 칸은 이제 도넛(storageDonut) */
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

/* ── 저장 용량 도넛(직원-7 · 원칙 143 '원형 차트처럼') — 가운데 사용량 · 조각 = 프로젝트별 비중 · 옆(또는 아래) 범례.
      색 0(잉크 농도 4단) · 숫자는 서버 GET /me/storage 한 출처(쓴 양 · 프로젝트별 · 할당). 내 정보 창과 대시보드 칸이 같은 부품 ── */
const SHADE = ['var(--ink)', 'var(--sub-2)', 'var(--sub)', 'var(--mute)'];
/** 할당 가운데 쓴 비율 글 — 0 < x < 0.1 이면 '0.1' · 10 미만은 소수 한 자리 · 할당 없으면 null */
export function pctWord(used, q) {
  if (q === null || q === undefined || !(Number(q) > 0)) return null;
  const x = (Number(used) || 0) / (Number(q) * 1e9) * 100;
  if (x <= 0) return '0';
  if (x < 0.1) return '0.1';
  return x < 10 ? String(Math.round(x * 10) / 10) : String(Math.round(x));
}
/** 프로젝트 조각 — 많으면 셋 + '그 밖 n개'(넷째 농도) */
function slices(projects, used) {
  const ps = projects.length > 4 ? projects.filter((p) => p.bytes > 0) : projects;
  const top = ps.length > 4 ? ps.slice(0, 3) : ps.slice(0, 4);
  const out = top.map((p) => ({ name: p.name + (p.archived ? ' · 보관' : ''), bytes: Number(p.bytes) || 0 }));
  if (ps.length > 4) out.push({ name: `그 밖 ${ps.length - 3}개`, bytes: ps.slice(3).reduce((a, p) => a + (Number(p.bytes) || 0), 0) });
  const all = Number(used) || out.reduce((a, p) => a + p.bytes, 0);
  return out.map((p, i) => ({ ...p, color: SHADE[i], pct: all ? Math.round((p.bytes / all) * 100) : 0 }));
}
/** 도넛 + 범례 — { projects, used(bytes), quota(GB|null), dia(px), legend } */
export function storageDonut({ projects = [], used = 0, quota = null, dia = 160, legend = true } = {}) {
  sheet();
  const pw = pctWord(used, quota);
  const ss = slices(projects, used);
  const C = 2 * Math.PI * 44, all = ss.reduce((a, p) => a + p.bytes, 0);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', pw !== null ? `사용량 ${size(used)} · 할당의 ${pw}%` : `사용량 ${size(used)}`);
  const ring = (stroke, len, off) => {
    const c = document.createElementNS(NS, 'circle');
    for (const [k, x] of [['r', 44], ['cx', 50], ['cy', 50], ['fill', 'none'], ['stroke-width', 12]]) c.setAttribute(k, x);
    c.style.stroke = stroke;
    if (len !== undefined) { c.setAttribute('stroke-dasharray', `${len.toFixed(2)} ${(C - len).toFixed(2)}`); c.setAttribute('stroke-dashoffset', (-off).toFixed(2)); }
    return c;
  };
  svg.append(ring('var(--k-me-dn-bg, var(--bg-1))'));
  let off = 0;
  if (all > 0) for (const p of ss) { const len = (p.bytes / all) * C; if (len > 0) svg.append(ring(p.color, len, off)); off += len; }
  const [n, u] = size(used).split(' ');
  const dn = h('div.k-me-dn', { style: `--dn:${dia}px` }, svg,
    h('div.k-me-dn-c', {}, h('b.num', { text: n }), h('span', { text: u }), h('small', { text: pw !== null ? `할당의 ${pw}%` : '할당 없음' })));
  if (!legend) return dn;
  const lg = h('ul.k-me-lg', {}, ...(ss.length ? ss.map((p) => h('li', {}, h('i', { style: `background:${p.color}` }), h('span', { text: p.name, title: p.name }),
    h('b.num', { text: `${p.pct}%` }), h('small.num', { text: size(p.bytes) }))) : [h('li.k-me-lg-none', { text: '내가 프로젝트장인 프로젝트가 없습니다' })]));
  return h('div.k-me-dnr', {}, dn, lg);
}
/** 할당 대비 막대 — '할당 50 GB 대비 · 0.1%' + 막대. 할당 없으면 null */
export function quotaGauge(used, quota, warn) {
  sheet();
  const pw = pctWord(used, quota);
  if (pw === null) return null;
  const w = Math.min(100, Math.max(Number(used) > 0 ? 1 : 0, Number(pw)));
  return h('div.k-me-gauge', { class: warn ? 'is-warn' : '' },
    h('p.k-me-gk', {}, h('span', { text: `할당 ${gb(quota)} 대비` }), h('b.num', { text: `${pw}%` })),
    h('div.k-me-bar', { role: 'img', 'aria-label': `할당의 ${pw}% 사용` }, h('i', { style: `width:${w}%` })));
}
/** 할당 꼬리표 — '기본 할당 50 GB' · '개별 할당 100 GB' · '할당 없음' */
export const quotaTag = (st = {}) => { const q = v(st.quota_gb); return q === null || q === undefined ? '할당 없음' : `${st.quota_own ? '개별 할당' : '기본 할당'} ${gb(q)}`; };

/** 증량 신청 폼 — 같은 자리에서 펼친다(필요한 용량 GB · 사유) → POST /me/storage-request → onDone(서버 응답) */
function askForm(st, { onDone, onCancel } = {}) {
  const q = v(st.quota_gb);
  const want = h('input.t-input', { type: 'number', name: 'want_gb', min: String(q || 0), step: '1', inputmode: 'decimal', autocomplete: 'off', 'aria-label': '필요한 용량(GB)' });
  const why = h('input.t-input', { type: 'text', name: 'why', maxlength: '120', autocomplete: 'off', 'aria-label': '사유' });
  const go = h('button.t-btn', { type: 'button', text: '신청', disabled: true });
  const cancel = h('button.t-btn.t-btn--text.k-me-x', { type: 'button', text: '취소' });
  const err = h('p.k-me-err', { role: 'alert', hidden: true });
  const ready = () => { err.hidden = true; go.disabled = !(Number(want.value) > Number(q || 0) && why.value.trim()); };
  want.addEventListener('input', ready); why.addEventListener('input', ready);
  cancel.addEventListener('click', () => onCancel?.());
  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      const out = await api('/me/storage-request', { method: 'POST', body: { want_gb: Number(want.value), why: why.value.trim() } });
      toast('증량 신청을 보냈습니다');
      onDone?.(out);
    } catch (e) { err.textContent = e.message || '신청하지 못했습니다'; err.hidden = false; go.disabled = false; }
  });
  const box = h('div.k-me-askf', {},
    h('p.k-me-l', { text: '용량 증량 신청' }),
    h('div.k-me-askf2', {},
      h('label.k-me-f', {}, h('span.k-me-l', { text: '필요한 용량' }), h('span.k-me-gb', {}, want, h('i', { text: 'GB' }))),
      h('label.k-me-f', {}, h('span.k-me-l', { text: '사유' }), why)),
    h('p.k-me-say', {}, h('span', { text: `지금 할당 ${gb(q)}보다 크게 적습니다.` }), ' ', h('span', { text: 'LX 관리자가 승인하면 할당이 늘어나고,' }), ' ', h('span', { text: '결과는 알림으로 받습니다' })),
    err, h('div.k-me-act', {}, go, cancel));
  setTimeout(() => want.focus({ preventScroll: true }), 0);
  return box;
}

const ST_WORD = { pending: '대기', approved: '승인', rejected: '거절' };
/** 내 정보 창 오른쪽 단 — 저장 용량(도넛 · 할당 대비 막대 · 증량 신청 펼침) + 증량 신청 이력(서버 GET /me/storage 한 출처) */
function storageSide(S, { ask = false, onDone } = {}) {
  const st = S.storage || {};
  const used = Number(v(st.used)) || 0, quota = v(st.quota_gb);
  const has = quota !== null && quota !== undefined;
  const ps = S.projects || [];
  const R = S.requests || [];
  const pend = R.find((r) => r.state === 'pending');
  const a = h('div.k-me-st', { class: st.warn ? 'is-warn' : '' },
    h('div.k-me-sth', {}, h('p.k-me-l', { text: '저장 용량' }), h('span.k-me-tag', { text: quotaTag(st) })),
    storageDonut({ projects: ps, used, quota, dia: 128 }));
  const g = quotaGauge(used, quota, st.warn);
  if (g) a.append(g);
  a.append(h('p.k-me-sub', { text: ps.length ? `내가 프로젝트장인 프로젝트 ${ps.length}개의 학습데이터 · 올린 파일` : '내가 프로젝트장인 프로젝트가 없습니다' }));
  if (st.warn) a.append(h('p.k-me-warn', {}, h('span', { text: `할당의 ${pctWord(used, quota)}%를 썼습니다.` }), ' ',
    h('span', { text: pend ? '증량 신청을 보냈습니다' : '더 필요하면 증량 신청을 해 주세요' })));
  const foot = h('div.k-me-foot');
  const closed = () => {
    if (pend) foot.replaceChildren(h('p.k-me-pend', {}, h('span', { text: `증량 신청 중 ${gb(v(pend.want_gb))} ·` }), ' ', h('span', { text: `${md(pend.at)} 신청 · LX 관리자 확인 전` })));
    else if (has) foot.replaceChildren(h('button.k-me-ask', { type: 'button', text: '증량 신청', onclick: () => open() }));
    else foot.replaceChildren(h('p.k-me-sub', { text: '할당이 정해지면 증량 신청을 할 수 있습니다' }));
  };
  const open = () => foot.replaceChildren(askForm(st, { onDone, onCancel: closed }));
  if (ask && has && !pend) open(); else closed();
  a.append(foot);

  const wait = R.filter((r) => r.state === 'pending').length;
  const b = h('div.k-me-st', {},
    h('div.k-me-sth', {}, h('p.k-me-l', { text: '증량 신청 이력' })),
    h('p.k-me-big', { class: R.length ? '' : 'is-zero' }, h('b.num', { text: String(R.length) }), h('small', { text: `신청 · 대기 ${wait}` })));
  if (R.length) {
    b.append(h('ul.k-me-rows', {}, ...R.slice(0, 5).map((r) => h('li', {},
      h('span.k-me-rw.num', { text: md(r.at) }),
      h('span.k-me-rt', {}, h('b', { text: `${v(r.from_gb) !== null && v(r.from_gb) !== undefined ? gb(v(r.from_gb)) : '할당 없음'} → ${gb(v(r.want_gb))}` }),
        r.why ? h('small', { text: `사유 ${r.why}` }) : null,
        r.state === 'rejected' && r.reason ? h('small.is-no', { text: `거절 사유 ${r.reason}` }) : null),
      h('span.k-me-rs', { class: r.state === 'rejected' ? 'is-no' : r.state === 'pending' ? 'is-wait' : '', text: ST_WORD[r.state] || r.state })))));
  } else b.append(h('p.k-me-none', { text: '신청한 적이 없습니다' }));
  b.append(h('p.k-me-sub', { text: '신청의 승인 · 거절이 여기 남습니다' }));
  return h('div.k-me-r', {}, a, b);
}

/** 증량 신청 — 파일 올리는 자리 · 대시보드에서. 내 정보 창을 열고 저장 용량 칸에서 폼을 펼친다(같은 자리 · 직원-7) */
export function openStorageRequest({ onDone } = {}) {
  return openMe({ ask: true, onStorage: onDone });
}

let cur = null;
export function openMe({ onSaved, ask = false, onStorage } = {}) {
  if (cur) return cur;
  sheet();
  const body = h('div.k-me');
  const ld = h('div'); body.append(ld); empty(ld, { kind: 'loading', compact: true });   // 도착 전 = 빈 틀 · 표시는 화면 가운데 하나(원칙 161)
  const m = modal({ title: '내 정보', body, onClose: () => { cur = null; } });
  m.el.classList.add('k-me-md', 'k-me-wide');          // 두 단(직원-5 ⓐ · 직원-7) — 왼쪽 내 정보 · 오른쪽 저장 용량 · 증량 신청 이력
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
    /* 저장 용량 칸 — 증량 신청을 보내면 이 칸만 새로 그린다(고치던 이름 · 부서는 그대로) */
    let stBox = null;
    const again = () => side().then((s) => { if (s) stDraw(s); });
    const stDraw = (s, first = false) => {
      const onDone = (out) => { onStorage?.(out); again(); };
      const nb = s ? storageSide(s, { ask: first && ask, onDone }) : h('div.k-me-r', {}, storageBlock(p.storage || {}));
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
      stDraw(S, true)));
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
    if (!ask) setTimeout(() => name.focus({ preventScroll: true }), 0);
  }
  return m;
}
