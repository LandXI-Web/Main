/* sheets.js — 프로젝트 한 장의 세 칸(구현 5차 · 확인 17차 · 시안 design-r8/project-page).
   · 재학습 근거(P-3 ⓐ)   retrainCard(pr, …) — 시간 띠 하나(서버 기록의 실제 시각) + 칩 셋(기관 검토 요청 · 새 영상 시점 · 앞 단계 남음)
                          + 근거가 적으면 회색 한 줄(막지 않음). '재학습 시작'을 누를 때만 작은 창에서 사유 하나 → 서버 회차 기록(reason)
                          → LX 관리자 결재 화면에 같은 사유. 재학습은 프로젝트장만(서버도 같은 규칙).
   · 기록 · 메모 · 파일(P-4 ⓐ) logCard(pr) — 최근 3줄 + 메모 한 줄 · 파일 올리기 + '모두 보기' 서랍(거르기 칩: 전체 · 자동 · 메모 · 파일).
                          구성원 · 프로젝트장 · LX 관리자만(서버 판정 can.log) — 기관은 안 봄.
   · 프로젝트장 넘기기(P-5 ⓐ) openHandover(pr, …) — 받을 사람 · 메모(선택) → 받는 사람에게 알림 · 기록 한 줄 · 넘긴 사람은 구성원.
   창은 키트 가운데 창(kit/modal.js) · 서랍은 키트 서랍(kit/panel.js). 숫자 · 날짜는 모두 서버 값(지어낸 값 0) · 서버 저장 위치는 내지 않는다(파일 이름만). */
import { h, api, API, session } from '../kit/util.js';
import { modal } from '../kit/modal.js';
import { drawer } from '../kit/panel.js';
import { toast } from '../kit/toast.js';
import { nb, units } from './context.js';

const two = (n) => String(n).padStart(2, '0');
/** 기록 · 띠의 시각 — 올해면 MM.DD HH:MM, 그 밖은 YYYY.MM.DD */
export function at(s, { time = true } = {}) {
  const d = new Date(s || '');
  if (Number.isNaN(+d)) return '';
  const md = `${two(d.getMonth() + 1)}.${two(d.getDate())}`;
  if (d.getFullYear() !== new Date().getFullYear()) return `${d.getFullYear()}.${md}`;
  return time ? `${md} ${two(d.getHours())}:${two(d.getMinutes())}` : md;
}
/** 띠의 시각 — 좁은 칸에 맞게 앞 0 없이(9.30 14:27 · 다른 해는 2025.9.30) */
function short(s) {
  const d = new Date(s || '');
  if (Number.isNaN(+d)) return '';
  const md = `${d.getMonth() + 1}.${d.getDate()}`;
  return d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}.${md}` : `${md} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
/** 크기(10진 — 서버 사용 현황과 같은 단위) */
export function size(b) {
  const n = Number(b) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.max(0.1, n / 1e3).toFixed(1)} KB`;
}
const v = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const u = (t) => h('span.lxp-u', { text: t });          // 뜻 한 덩어리 — 덩어리 사이에서만 꺾인다(줄바꿈 규칙 9)

/** 문제는 창으로 알린다(원칙 109) — 한 줄 + 다음 할 일 */
function problem(title, line, next) {
  const m = modal({ title, body: h('div.lxp-sh', {}, h('p.lxp-say', { text: line }), next ? h('p.lxp-sh-n', { text: next }) : null,
    h('div.lxp-act', {}, h('button.t-btn', { type: 'button', text: '확인', onclick: () => m.close() }))) });
  return m;
}

/* ── 재학습 근거(P-3 ⓐ) ─────────────────────────────────────── */
function since(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(+d)) return '';
  const hrs = Math.floor((Date.now() - d) / 3600000);
  return hrs < 24 ? `마지막 학습 뒤 ${Math.max(hrs, 1)}시간` : `마지막 학습 뒤 ${Math.floor(hrs / 24)}일`;
}
const reviewsWord = (b) => `${v(b.reviews) ?? 0}건`;
const imageryWord = (b) => (v(b.imagery) ? `${v(b.imagery)}개` : '없음');

/** 재학습 칸 — 공개된 서비스만(서버 basis). onStart = 다음 회차로 바뀐 뒤(프로젝트 응답) */
export function retrainCard(pr, { onStart } = {}) {
  const b = pr.basis || {};
  const round = v(pr.round) || 1;
  const sec = h('section.t-card.lxp-retrain', { 'aria-label': '재학습' });
  sec.append(h('div.lxp-kh', {}, h('h2.lxp-h', { text: '재학습' }), b.trained_at ? h('span.lxp-ksub', { text: since(b.trained_at) }) : null));
  const pts = [...(b.points || []), { kind: 'now', label: '지금', at: b.now }];
  const band = h('ol.lxp-band', { 'aria-label': '재학습 근거 — 시간 순서', style: `--n:${pts.length}` });
  for (const p of pts) {
    band.append(h('li.lxp-pt', { dataset: { kind: p.kind }, class: p.kind === 'now' ? 'is-now' : p.signal ? 'is-sig' : '' },
      h('i', { 'aria-hidden': 'true' }), h('b', { text: p.label }), h('span.num', { text: short(p.at) })));
  }
  sec.append(band);
  const sig = h('div.lxp-sig', {},
    h('span', {}, '기관 검토 요청 ', h('b', { text: reviewsWord(b) })),
    h('span', {}, '새 영상 시점 ', h('b', { text: imageryWord(b) })),
    b.before ? h('span.is-warn', {}, '앞 단계 ', h('b', { text: b.before })) : null);
  sec.append(sig);
  const foot = h('div.lxp-rt-f');
  if (pr.can?.retrain) {
    foot.append(h('p', { text: b.thin ? '지금은 다시 학습할 근거가 적습니다' : '배포는 LX 관리자 승인 뒤 바뀝니다' }));
    const btn = h('button.t-btn.t-btn--2.lxp-rt', { type: 'button', text: `${round + 1}차 재학습 시작` });
    btn.addEventListener('click', () => openRetrain(pr, { onStart }));
    foot.append(btn);
  } else {
    foot.append(h('p', { text: '재학습은 프로젝트장이 시작합니다' }));
  }
  sec.append(foot);
  return sec;
}

const REASONS = ['검토 요청 반영', '새 영상 시점', '성능 보완', '직접 입력'];
/** 재학습 시작 — 작은 창에서 '왜 다시 학습하나' 하나를 골라야 시작(사유는 서버 회차 기록 · 관리자 결재에 같은 말로) */
export function openRetrain(pr, { onStart } = {}) {
  const b = pr.basis || {};
  const n = (v(pr.round) || 1) + 1;
  let pick = null;
  const chips = h('div.lxp-chips', { role: 'radiogroup', 'aria-label': '왜 다시 학습하나' });
  const own = h('input.t-input.lxp-own', { type: 'text', maxlength: '200', autocomplete: 'off', 'aria-label': '사유 직접 입력', placeholder: '사유 한 줄', hidden: true });
  const go = h('button.t-btn', { type: 'button', text: `${n}차 재학습 시작`, disabled: true });
  const ready = () => { go.disabled = !pick || (pick === '직접 입력' && !own.value.trim()); };
  for (const r of REASONS) {
    const c = h('button.t-chip.lxp-chip', { type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-pressed': 'false', text: r });
    c.addEventListener('click', () => {
      pick = r;
      chips.querySelectorAll('.lxp-chip').forEach((x) => { x.setAttribute('aria-pressed', String(x === c)); x.setAttribute('aria-checked', String(x === c)); });
      own.hidden = r !== '직접 입력';
      if (!own.hidden) own.focus();
      ready();
    });
    chips.append(c);
  }
  own.addEventListener('input', ready);
  const now = [`검토 요청 ${reviewsWord(b)}`, `새 영상 ${imageryWord(b)}`, b.before].filter(Boolean).join(' · ');
  const cancel = h('button.t-btn.t-btn--text.lxp-cancel', { type: 'button', text: '취소' });
  const body = h('div.lxp-sh', {}, chips, own,
    h('p.lxp-say', {}, '회차 기록과 LX 관리자 승인에 같은 근거가 남습니다.', h('br'), nb(`지금 근거: ${now}`)),
    h('div.lxp-act', {}, go, cancel));
  const m = modal({ title: `${n}차 재학습 — 왜 다시 학습하나`, body });
  m.el.classList.add('lxp-md');
  cancel.addEventListener('click', () => m.close());
  go.addEventListener('click', async () => {
    const reason = pick === '직접 입력' ? own.value.trim() : pick;
    if (!reason) return;
    go.disabled = true;
    try {
      const p2 = await api(`/projects/${pr.id}/rounds`, { method: 'POST', body: { reason } });
      m.close(true);
      toast(`${n}차 학습 단계로 돌아갔습니다`);
      onStart?.(p2);
    } catch (e) { m.close(true); problem('재학습을 시작하지 못했습니다', e.message || '잠시 뒤 다시 해 주세요'); }
  });
  return m;
}

/* ── 프로젝트장 넘기기(P-5 ⓐ) ─────────────────────────────────── */
const whoText = (u) => (!u ? '—' : u.name && u.name !== u.role_label ? `${u.name} · ${u.role_label}` : u.role_label || u.name);
export function openHandover(pr, { onDone } = {}) {
  const sel = h('select.t-input', { 'aria-label': '받을 사람', disabled: true }, h('option', { value: '', text: '불러오는 중' }));
  const note = h('input.t-input', { type: 'text', maxlength: '300', autocomplete: 'off', 'aria-label': '메모', placeholder: '예: 10월 전출로 넘깁니다' });
  const go = h('button.t-btn', { type: 'button', text: '넘기기', disabled: true });
  const cancel = h('button.t-btn.t-btn--text.lxp-cancel', { type: 'button', text: '취소' });
  const meLead = !!pr.lead_is_me;
  const say = h('p.lxp-say', {}, '넘기면 ', h('b', { text: '받는 사람에게 알림' }), '이 가고,', h('br'), '기관 검토 요청 · 분석 요청 받는 사람도 함께 바뀝니다.', h('br'),
    meLead ? '나는 ' : '앞 프로젝트장은 ', h('b', { text: '구성원' }), '으로 남고, 기록에 한 줄 남습니다.');
  const body = h('div.lxp-sh', {},
    h('div.lxp-f', {}, h('p.lxp-l', { text: '받을 사람' }), sel),
    h('div.lxp-f', {}, h('p.lxp-l', {}, '메모', h('small', { text: '선택' })), note),
    say, h('div.lxp-act', {}, go, cancel));
  const m = modal({ title: '프로젝트장 넘기기', body });
  m.el.classList.add('lxp-md');
  cancel.addEventListener('click', () => m.close());
  api('/projects/people').then((j) => {
    const opts = (j.items || []).filter((x) => x.id !== pr.lead?.id);
    if (!opts.length) {
      sel.replaceWith(h('p.lxp-none', { text: '넘길 사람이 없습니다' }));
      return;
    }
    sel.replaceChildren(h('option', { value: '', text: '고르기' }), ...opts.map((x) => h('option', { value: x.id, text: whoText(x) })));
    sel.disabled = false;
    sel.addEventListener('change', () => { go.disabled = !sel.value; });
  }).catch(() => { sel.replaceChildren(h('option', { value: '', text: '불러오지 못했습니다' })); });
  go.addEventListener('click', async () => {
    if (!sel.value) return;
    go.disabled = true;
    try {
      const out = await api(`/projects/${pr.id}/handover`, { method: 'POST', body: { to: sel.value, note: note.value.trim() || null } });
      m.close(true);
      toast('프로젝트장을 넘겼습니다');
      onDone?.(out);
    } catch (e) { m.close(true); problem('넘기지 못했습니다', e.message || '잠시 뒤 다시 해 주세요'); }
  });
  return m;
}

/* ── 기록 · 메모 · 파일(P-4 ⓐ) ────────────────────────────────── */
const FILTERS = [['all', '전체'], ['auto', '자동'], ['memo', '메모'], ['file', '파일']];
const ACCEPT = '.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp';

/** 한 줄 — 시각 · 무엇(굵게) · 덧말 · 누가 · (파일) 이름 칩 · (메모 · 파일) 지우기 — 쓴 사람 · 프로젝트장 · LX 관리자에게만(서버 can_remove) */
function line(pr, x, onChange) {
  const what = h('span.lxp-lg-t');
  if (x.kind === 'memo') what.append(h('b', { text: '메모 ' }), x.text);
  else if (x.kind === 'file') {
    what.append(h('b', { text: '파일 ' }), x.text && x.text !== '파일' ? x.text : '');
    if (x.file) {
      const f = h('button.lxp-file', { type: 'button', title: `${x.file.name} 내려받기 · ${size(v(x.file.bytes))}`, text: x.file.name });
      f.addEventListener('click', () => download(pr, x.file));
      what.append(h('br'), f);
    }
  } else {
    what.append(h('b', { text: x.text }));
    if (x.sub) what.append(' — ', units(x.sub));
  }
  what.append(h('i', { text: x.who }));
  if ((x.kind === 'memo' || x.kind === 'file') && x.can_remove && x.id) {
    const rm = h('button.lxp-lg-rm', { type: 'button', text: '지우기', 'aria-label': `${x.kind === 'file' ? '파일' : '메모'} 지우기` });
    rm.addEventListener('click', () => openRemove(pr, x, onChange));
    what.append(rm);
  }
  return h('li', { dataset: { kind: x.kind } }, h('span.lxp-lg-w.num', { text: at(x.at) }), what);
}

/** 지우기 확인 창(S-20) — 지우면 되돌릴 수 없고, 기록에는 '누가 · 메모를 지움' 한 줄만(내용은 남지 않음). 파일은 저장 공간에서 빠진다 */
function openRemove(pr, x, onChange) {
  const file = x.kind === 'file';
  const what = file ? (x.file?.name || '파일') : x.text;
  const go = h('button.t-btn.lxp-rm-go', { type: 'button', text: '지우기' });
  const cancel = h('button.t-btn.t-btn--text.lxp-cancel', { type: 'button', text: '취소' });
  const body = h('div.lxp-sh', {},
    h('p.lxp-rm-what', {}, h('b', { text: file ? '파일 ' : '메모 ' }), what, file && x.file ? h('small.num', { text: ` · ${size(v(x.file.bytes))}` }) : null),
    h('p.lxp-say', {}, '지우면 되돌릴 수 없습니다.', h('br'),
      u(`기록에는 '${file ? '파일을' : '메모를'} 지움' 한 줄만 남고`), ' ', u('내용은 남지 않습니다.'),
      file ? h('br') : null, file ? u('파일 크기만큼 저장 공간이 줄어듭니다.') : null),
    h('div.lxp-act', {}, go, cancel));
  const m = modal({ title: file ? '파일 지우기' : '메모 지우기', body });
  m.el.classList.add('lxp-md');
  cancel.addEventListener('click', () => m.close());
  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      await api(`/projects/${pr.id}/notes/${encodeURIComponent(x.id)}`, { method: 'DELETE' });
      m.close(true);
      toast(file ? '파일을 지웠습니다' : '메모를 지웠습니다');
      await onChange?.();
    } catch (e) { m.close(true); problem('지우지 못했습니다', e.message || '잠시 뒤 다시 해 주세요.'); }
  });
  return m;
}

/* ── 저장 용량 — 파일 올리는 자리(S-19 · 막지 않음 · 원칙 91 · 109) ─────────────── */
const gbw = (x) => `${Number(x).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} GB`;
/** 90% 넘음 한 줄 — 올린 파일은 프로젝트장의 저장 용량에 더해진다(서버 lead_storage 한 출처). 없으면 null */
function storageLine(st) {
  if (!st?.warn) return null;
  const pct = v(st.pct);
  const who = st.lead_is_me ? '내 저장 용량' : '프로젝트장 저장 용량';
  const el = h('p.lxp-quota', { role: 'status' }, h('span', { text: `${who} 할당의 ${pct}%를 썼습니다.` }), ' ',
    h('span', { text: '올리기는 그대로 됩니다' }));
  if (st.lead_is_me) {
    const ask = h('button.lxp-quota-ask', { type: 'button', text: '늘리기 요청' });
    ask.addEventListener('click', () => askMore());
    el.append(' ', ask);
  }
  return el;
}
async function askMore() {
  const { openStorageRequest } = await import('../kit/me.js');
  try { const p = await api('/me/profile'); openStorageRequest({ storage: p.storage }); }
  catch { problem('지금은 요청할 수 없습니다', '잠시 뒤 내 정보에서 다시 해 주세요.'); }
}
/** 파일을 올린 뒤 90% 를 넘었으면 창으로 한 번 권한다(이 창을 연 동안 한 번 — 계속 띄우지 않는다) */
let warned = false;
function storageWindow(st) {
  if (!st?.warn || !st.lead_is_me || warned) return;
  warned = true;
  const ask = h('button.t-btn', { type: 'button', text: '늘리기 요청' });
  const ok = h('button.t-btn.t-btn--text.lxp-cancel', { type: 'button', text: '닫기' });
  const m = modal({ title: '저장 용량이 거의 찼습니다', body: h('div.lxp-sh', {},
    h('p.lxp-say', {}, u(`할당 ${gbw(v(st.quota_gb))} 중`), ' ', u(`${size(v(st.used))}(${v(st.pct)}%)를 썼습니다.`), h('br'),
      u('올리기는 막지 않고 그대로 됩니다.'), ' ', u('더 필요하면 늘리기 요청을 보내 주세요.')),
    h('div.lxp-act', {}, ask, ok)) });
  m.el.classList.add('lxp-md');
  ok.addEventListener('click', () => m.close());
  ask.addEventListener('click', () => { m.close(true); askMore(); });
}

async function download(pr, f) {
  try {
    const s = session.get();
    const r = await fetch(`${API.prefix}/projects/${pr.id}/files/${f.id}`, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
    if (!r.ok) throw new Error();
    const url = URL.createObjectURL(await r.blob());
    const a = h('a', { href: url, download: f.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch { problem('파일을 내려받지 못했습니다', '잠시 뒤 다시 해 주세요.'); }
}

/** 메모 한 줄 · 파일 · 남기기 — 한 장과 서랍이 같은 줄을 쓴다. done = 남긴 뒤 다시 그리기 */
function writer(pr, limits, done) {
  const memo = h('input.t-input.lxp-lg-m', { type: 'text', maxlength: '300', autocomplete: 'off', 'aria-label': '메모 한 줄', placeholder: '메모 한 줄' });
  const pickIn = h('input', { type: 'file', accept: ACCEPT, hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
  const fileBtn = h('button.t-btn.t-btn--2.lxp-lg-f', { type: 'button', text: '파일', 'aria-label': '파일 고르기' });
  const save = h('button.t-btn.lxp-lg-s', { type: 'button', text: '남기기', disabled: true });
  const picked = h('div.lxp-lg-pk', { hidden: true });
  let file = null;
  const ready = () => { save.disabled = !(memo.value.trim() || file); };
  const showPick = () => {
    picked.hidden = !file;
    picked.replaceChildren();
    if (!file) return;
    const x = h('button.lxp-x', { type: 'button', 'aria-label': `${file.name} 빼기`, text: '×' });
    x.addEventListener('click', () => { file = null; pickIn.value = ''; showPick(); ready(); });
    picked.append(h('span.lxp-file.is-pk', { text: `${file.name} · ${size(file.size)}` }), x);
  };
  fileBtn.addEventListener('click', () => pickIn.click());
  pickIn.addEventListener('change', () => {
    const f = pickIn.files?.[0];
    pickIn.value = '';
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const maxMb = v(limits.file_max_mb) || 20;
    if (!f.name.includes('.') || !(limits.file_types || ACCEPT.replace(/\./g, '').split(',')).includes(ext)) {
      problem('이 파일은 올릴 수 없습니다', '문서(PDF · 한글 · 워드 · 엑셀 · 파워포인트 · 글 · CSV)와 그림(PNG · JPG · GIF · WEBP)만 올릴 수 있습니다.',
        '영상과 학습데이터는 데이터 올리기에서 올립니다.');
      return;
    }
    if (f.size > maxMb * 1024 * 1024) { problem('파일이 너무 큽니다', `한 파일은 ${maxMb}MB 까지 올릴 수 있습니다.`, '나눠서 올리거나 줄여서 올려 주세요.'); return; }
    if (!f.size) { problem('빈 파일입니다', '내용이 있는 파일을 골라 주세요.'); return; }
    file = f; showPick(); ready();
  });
  memo.addEventListener('input', ready);
  memo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && !save.disabled) { e.preventDefault(); save.click(); } });
  save.addEventListener('click', async () => {
    const text = memo.value.trim();
    save.disabled = true;
    let up = null;
    try {
      if (file) {
        const fd = new FormData();
        fd.append('file', file, file.name);
        if (text) fd.append('text', text);
        const s = session.get();
        const r = await fetch(`${API.prefix}/projects/${pr.id}/files`, { method: 'POST', headers: s ? { authorization: 'Bearer ' + s.token } : {}, body: fd });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error?.message || '');
        up = j?.lead_storage || null;
      } else {
        await api(`/projects/${pr.id}/notes`, { method: 'POST', body: { text } });
      }
      memo.value = ''; file = null; showPick();
      toast('남겼습니다');
      await done?.();
      storageWindow(up);
    } catch (e) { problem('남기지 못했습니다', e.message || '잠시 뒤 다시 해 주세요.'); }
    ready();
  });
  const stSlot = h('div.lxp-quota-slot');
  const wr = h('div.lxp-lg-wr', {}, stSlot, picked, h('div.lxp-lg-in', {}, memo, fileBtn, save, pickIn));
  wr.storage = (st) => { stSlot.replaceChildren(...[storageLine(st)].filter(Boolean)); };     // 기록을 다시 읽을 때마다 한 줄을 새로
  return wr;
}

/** 기록 칸 — 최근 3줄 + 모두 보기 n + 메모 · 파일 */
export function logCard(pr) {
  const sec = h('section.t-card.lxp-log', { 'aria-label': '기록 · 메모 · 파일' });
  const more = h('button.lxp-more', { type: 'button', text: '모두 보기' });
  const list = h('ul.lxp-lg', { 'aria-live': 'polite' });
  sec.append(h('div.lxp-kh', {}, h('h2.lxp-h', { text: '기록 · 메모 · 파일' }), more), list);
  let J = null;
  const draw = async () => {
    try { J = await api(`/projects/${pr.id}/log`); } catch { list.replaceChildren(h('li.lxp-lg-none', { text: '기록을 불러오지 못했습니다' })); return; }
    const items = J.items || [];
    list.replaceChildren(...(items.length ? items.slice(0, 3).map((x) => line(pr, x, draw)) : [h('li.lxp-lg-none', { text: '아직 기록이 없습니다' })]));
    more.textContent = `모두 보기 ${v(J.counts?.all) ?? items.length}`;
    wr.storage(J.lead_storage);
  };
  more.addEventListener('click', () => openLog(pr, { onChange: draw }));
  const wr = writer(pr, { get file_max_mb() { return J?.file_max_mb; }, get file_types() { return J?.file_types; } }, draw);
  sec.append(wr);
  draw();
  return sec;
}

/** 모두 보기 — 오른쪽 서랍(휴대폰은 아래 시트) · 거르기 칩 · 시간순 전체 · 아래 메모 · 파일 */
export function openLog(pr, { onChange } = {}) {
  const chips = h('div.lxp-chips.lxp-lg-chips', { role: 'tablist', 'aria-label': '기록 거르기' });
  const list = h('ul.lxp-lg.lxp-lg--all');
  const body = h('div.lxp-lg-dr', {}, chips, list);
  const d = drawer({ title: '기록 · 메모 · 파일', label: '기록 · 메모 · 파일', body, slot: 'lxp-log' });
  d.el.classList.add('lxp-dr');
  let J = null, kind = 'all';
  const draw = () => {
    chips.replaceChildren(...FILTERS.map(([k, l]) => {
      const n = v(J?.counts?.[k]);
      const c = h('button.t-chip.lxp-chip', { type: 'button', role: 'tab', 'aria-selected': String(k === kind), 'aria-pressed': String(k === kind) },
        l, n !== undefined ? h('small.num', { text: ` ${n}` }) : null);
      c.addEventListener('click', () => { kind = k; draw(); });
      return c;
    }));
    const items = (J?.items || []).filter((x) => kind === 'all' || x.kind === kind);
    list.replaceChildren(...(items.length ? items.map((x) => line(pr, x, changed)) : [h('li.lxp-lg-none', { text: kind === 'all' ? '아직 기록이 없습니다' : '이 묶음에 기록이 없습니다' })]));
    wr.storage(J?.lead_storage);
  };
  const load = async () => {
    try { J = await api(`/projects/${pr.id}/log`); } catch { list.replaceChildren(h('li.lxp-lg-none', { text: '기록을 불러오지 못했습니다' })); return; }
    draw();
  };
  const changed = async () => { await load(); await onChange?.(); };
  const wr = writer(pr, { get file_max_mb() { return J?.file_max_mb; }, get file_types() { return J?.file_types; } }, changed);
  body.append(wr);
  load();
  return d;
}
