/* 요청 관리 · 분석 요청 탭(now 페이지 질문 16 ⓐ · 원칙 122 '결재가 아니라 관리') —
   맨 위 띠(지금 분석 중 · 기다리는 분석 · 동시에 도는 분석 · 최근 기다린 시간) → 순번 목록(▲▼ · 급함) → 한 건 서랍(영상 · 관리 칸 · 무엇을 · 누가 왜 · 보류 · 거절 · 승인).
   값은 서버 한 곳(GET /requests/manage · POST /requests/{id}/manage · 승인 · 거절 = POST /approvals/{id}/decide). 조정은 모두 처리 기록에 남는다. */
import { drawer, toast, devlog, empty } from '../../kit/index.js';
import { h, esc, api } from '../../kit/util.js';

const md = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`; };
const hm = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const ST_LV = { pending: 'wait', held: 'gap', approved: 'ok', analyzing: 'ok' };
const THUMBS = new Map();
function authImg(url, img) {
  if (!THUMBS.has(url)) THUMBS.set(url, api(url, { raw: true }).then(async (r) => (r.ok && r.status === 200 ? URL.createObjectURL(await r.blob()) : null)).catch(() => null));
  THUMBS.get(url).then((u) => { if (u && img.isConnected) { img.src = u; img.parentElement.dataset.ok = '1'; } });
}
function thumb(x) {
  const fig = h('span.rq-th', { 'aria-hidden': 'true' }, h('img', { alt: '' }));
  const img = fig.querySelector('img');
  if (x.overlay) { img.src = x.overlay; fig.dataset.ok = '1'; }
  else if (x.imagery_id) authImg(`/catalog/imagery/${encodeURIComponent(x.imagery_id)}/thumb`, img);
  return fig;
}

export function mountRequests(root, { host, onChanged }) {
  const strip = h('div.rq-strip');
  const line = h('p.rq-line', { text: '분석은 한 번에 한 건씩 돕니다. 순번은 그 한 줄에 선 차례이고, 2번은 1번이 끝난 뒤 시작합니다.' });
  const list = h('div.rq-list', { role: 'list' });
  const none = h('div.rq-none');
  const logBox = h('details.rq-log', {}, h('summary', { text: '처리 기록 — 승인 · 거절 · 보류 · 순번 · 급함 · 담당을 누가 언제 했는지' }), h('ul'));
  root.append(strip, line, list, none, logBox);
  let D = null, openId = null, sheet = null, busy = false;

  async function load() {
    try { D = await api('/requests/manage'); } catch (e) { devlog('requests/manage', e.code || e.message); if (!D) { none.hidden = false; empty(none, { kind: 'error', compact: true }); } return D; }
    paint();
    return D;
  }
  const count = () => (D?.items || []).filter((x) => x.can_decide).length;

  function paintStrip() {
    const s = D.strip || {};
    const ru = val(s.running), wa = val(s.waiting), w = val(s.wait_s), c = s.concurrent;
    const cell = (k, v, u, sub) => h('div.rq-cell', {}, h('span.rq-k', { text: k }), h('b.num', {}, String(v), u ? h('small', { text: u }) : null), sub ? h('small.rq-sub', { text: sub }) : null);
    strip.replaceChildren(
      cell('지금 분석 중', ru ? ru : '없음', ru ? '건' : ''),
      cell('기다리는 분석', wa ?? '—', '건'),
      cell('동시에 도는 분석', c ? c.hot_now : '—', c ? ` / ${c.max_hot_gpus}건` : '', '전력 규칙 — 한 번에 한 건'),
      cell('최근 기다린 시간', w == null ? '—' : w < 60 ? w : Math.round(w / 60), w == null ? '' : w < 60 ? '초' : '분', '하루 동안 거의 가장 길었던 대기'));
  }

  function row(x, i, all) {
    const prev = all[i - 1], next = all[i + 1];
    const up = h('button.rq-mv', { type: 'button', 'aria-label': `${x.n}번 순번 올리기`, text: '▲', disabled: !prev || prev.urgent !== x.urgent || x.running || prev.running });
    const dn = h('button.rq-mv', { type: 'button', 'aria-label': `${x.n}번 순번 내리기`, text: '▼', disabled: !next || next.urgent !== x.urgent || x.running });
    const ur = h('button.rq-ur', { type: 'button', 'aria-pressed': String(x.urgent), text: '급함', disabled: x.running });
    up.addEventListener('click', (e) => { e.stopPropagation(); act(x, 'up'); });
    dn.addEventListener('click', (e) => { e.stopPropagation(); act(x, 'down'); });
    ur.addEventListener('click', (e) => { e.stopPropagation(); x.urgent ? act(x, 'calm') : askReason(x, 'urgent'); });
    const el = h('div.rq-row', { role: 'listitem', tabindex: '0', dataset: { id: x.id, st: x.state }, 'aria-label': `${x.n}번 ${x.org} ${x.service}` },
      h('b.rq-n.num', { text: String(x.n) }),
      thumb(x),
      h('span.rq-who', {}, h('b', { text: x.org || '기관' }), h('small', { text: `${x.service} · ${md(x.created_at)}` })),
      h('span.rq-where', {}, h('span', { text: x.place || '범위' }), h('small', { text: [x.area_word, x.image_word].filter(Boolean).join(' · ') })),
      h('span.rq-st', {}, h('span.t-chip', { dataset: { lv: ST_LV[x.state] || '' }, text: x.state_word })),
      h('span.rq-as', {}, h('span', { text: x.assignee?.name || '담당 없음' }), h('small', { text: x.assignee ? 'LX 담당' : 'LX 관리자가 봄' })),
      h('span.rq-eta', { dataset: { now: String(/바로|곧|분석 중/.test(x.eta)) }, text: x.eta }),
      h('span.rq-adj', {}, up, dn, ur));
    el.classList.toggle('is-on', x.id === openId);
    el.addEventListener('click', () => open(x.id));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(x.id); });
    return el;
  }

  function paint() {
    paintStrip();
    const items = D.items || [];
    none.hidden = !!items.length; list.hidden = !items.length;
    if (!items.length) { none.innerHTML = ''; empty(none, { kind: 'first', title: '처리할 분석 요청이 없습니다', compact: true }); }
    list.replaceChildren(h('div.rq-row.rq-h', { 'aria-hidden': 'true' }, ...['순번', '영상', '기관 · 서비스 · 요청일', '어디 · 넓이 · 영상', '상태', '담당', '예상 시작', ''].map((t) => h('span', { text: t }))),
      ...items.map((x, i) => row(x, i, items)));
    const ul = logBox.querySelector('ul');
    const lg = D.log || [];
    logBox.hidden = !lg.length;
    ul.replaceChildren(...lg.map((l) => h('li', {}, h('span.num', { text: `${md(l.at)} ${hm(l.at)}` }), h('span', { text: `${l.who} — ${l.target} ${l.what}${l.reason ? ` · ${l.reason}` : ''}` }))));
    if (openId) { const x = items.find((i) => i.id === openId); if (x) fill(x); else sheet?.close(true); }
  }

  async function act(x, action, extra = {}) {
    if (busy) return;
    busy = true;
    try {
      const r = await api(`/requests/${encodeURIComponent(x.id)}/manage`, { method: 'POST', body: { action, ...extra } });
      toast(`${x.org} ${r.done}`);
      await load(); onChanged?.();
    } catch (e) { toast(e.message || '지금은 바꿀 수 없습니다'); devlog('manage', `${x.id} · ${action} · ${e.code}`); }
    busy = false;
  }

  /* 급함 · 보류 사유 — 작은 창(서랍이 열려 있으면 서랍의 사유 칸을 쓴다) */
  function askReason(x, action) {
    const word = action === 'urgent' ? '급함' : '보류';
    const inp = h('input.t-input.oc-reason', { type: 'text', maxlength: '120', placeholder: action === 'urgent' ? '급한 사유 — 기록에 남습니다' : '보류 사유 — 기관 ‘내 요청’에 보입니다', 'aria-label': `${word} 사유` });
    const ok = h('button.t-btn', { type: 'button', text: word });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '닫기' });
    const d = drawer({ title: `${x.n}번 ${x.org} — ${word}`, body: h('div.oc-sheet', {}, inp, h('div.oc-acts', {}, no, ok)), host, slot: 'approval', width: 420,
      onClose: () => { if (openId === x.id) open(x.id); } });
    setTimeout(() => inp.focus(), 60);
    no.addEventListener('click', () => d.close());
    const go = async () => { if (!inp.value.trim()) { inp.classList.add('is-need'); inp.focus(); return; } d.close(true); await act(x, action, { reason: inp.value.trim() }); if (openId === x.id) open(x.id); };
    ok.addEventListener('click', go);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  /* 한 건 서랍 */
  let body = null;
  function open(id) {
    openId = id;
    const x = (D.items || []).find((i) => i.id === id); if (!x) return;
    list.querySelectorAll('.rq-row[data-id]').forEach((r) => r.classList.toggle('is-on', r.dataset.id === id));
    body = h('div.oc-sheet.rq-sheet');
    sheet = drawer({ title: `분석 요청 · ${x.org}`, body, host, slot: 'approval', onClose: () => { openId = null; list.querySelectorAll('.rq-row.is-on').forEach((r) => r.classList.remove('is-on')); } });
    fill(x);
  }
  function fill(x) {
    if (!body) return;
    const total = (D.items || []).length;
    const pic = h('figure.rq-pic', {}, thumb(x), h('figcaption', {}, h('b', { text: `${x.place || '범위'}${x.area_word ? ` · ${x.area_word}` : ''}` }), h('small', { text: x.image_word || '' })));
    const mg = h('div.rq-mg');
    const r = (k, ...v) => mg.append(h('div.rq-mg-r', {}, h('span.rq-mg-k', { text: k }), h('span.rq-mg-v', {}, ...v)));
    const up = h('button.rq-mv', { type: 'button', text: '▲', 'aria-label': '순번 올리기' }), dn = h('button.rq-mv', { type: 'button', text: '▼', 'aria-label': '순번 내리기' });
    up.onclick = () => act(x, 'up'); dn.onclick = () => act(x, 'down');
    up.disabled = dn.disabled = x.running;
    r('순번', h('b.num', { text: String(x.n) }), h('span.rq-of.num', { text: ` / ${total}` }), up, dn);
    const tg = h('button.rq-tg', { type: 'button', role: 'switch', 'aria-checked': String(x.urgent), 'aria-label': '급함', disabled: x.running }, h('i'));
    tg.onclick = () => (x.urgent ? act(x, 'calm') : askReason(x, 'urgent'));
    r('급함', tg, h('small', { text: '켜면 맨 앞으로 · 사유가 남습니다' }));
    const sel = h('select.t-input.rq-sel', { 'aria-label': '담당' }, h('option', { value: '', text: '담당 없음 — LX 관리자가 봄' }),
      ...(D.staff || []).map((s) => h('option', { value: s.id, text: [s.name, s.name === s.role ? '' : s.role, s.dept].filter(Boolean).join(' · ') })));
    sel.value = x.assignee?.id || '';
    sel.onchange = () => act(x, 'assign', { user_id: sel.value || null });
    r('담당', sel);
    r('예상 시작', h('b.rq-eta', { dataset: { now: String(/바로|곧|분석 중/.test(x.eta)) }, text: x.eta }));
    const what = h('dl.oc-ch'); const put = (k, v) => { if (v) what.append(h('dt', { text: k }), h('dd', { text: v })); };
    const who = h('dl.oc-ch');
    put('서비스', x.service);
    body.replaceChildren(pic, mg, h('p.t-label', { text: '무엇을 분석하나' }), what);
    if (x.state === 'held' && x.held_reason) body.append(h('p.oc-mine', { text: `보류 중 · ${x.held_reason}` }));
    body.append(h('p.t-label', { text: '누가 · 왜' }), who);
    const wput = (k, v) => { if (v) who.append(h('dt', { text: k }), h('dd', { text: v })); };
    wput('요청한 사람', `${x.requested_by_name || x.org} · ${md(x.created_at)} ${hm(x.created_at)}`);
    wput('메모', x.memo);
    api(`/requests/${encodeURIComponent(x.id)}`).then((d) => {   // 판단 근거(서버 basis — 예상 시간 · 분석 모델 · 이 기관 이번 달 사용)
      const B = Object.fromEntries(d.basis || []);
      put('분석 모델', B['분석 모델']); put('걸리는 시간', B['예상 시간']);
      wput('이번 달 사용', B['이 기관 이번 달 사용']);
      if (B['올린 파일'] || B['표준본']) {
        const f = h('details.rq-file', {}, h('summary', { text: `파일 · 보관 ${[B['올린 파일'], B['표준본']].filter(Boolean).join(' · ')}` }));
        const dl = h('dl.oc-ch'); for (const k of ['올린 파일', '표준본', '원본 지울 날짜']) if (B[k]) dl.append(h('dt', { text: k }), h('dd', { text: B[k] }));
        f.append(dl); who.after(f);
      }
    }).catch((e) => devlog('request', e.code || e.message));
    if (!x.can_decide) { body.append(h('p.oc-mine', { text: x.running ? '지금 분석 중입니다. 끝나면 결과가 그 서비스의 새 시점으로 기관에 갑니다.' : '승인한 요청입니다. 순번 · 급함 · 담당은 계속 바꿀 수 있습니다.' })); return; }
    const reason = h('input.t-input.oc-reason', { type: 'text', maxlength: '120', placeholder: '사유(거절 · 보류할 때는 꼭 적습니다)', 'aria-label': '사유' });
    const note = h('p.oc-need', { role: 'status' });
    const hold = h('button.t-btn.t-btn--2', { type: 'button', text: x.state === 'held' ? '보류 풀기' : '보류' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '거절' });
    const ok = h('button.t-btn', { type: 'button', text: '승인' });
    body.append(reason, note, h('div.oc-acts.rq-acts', {}, hold, no, ok));
    const need = (t) => { note.textContent = t; reason.classList.remove('is-need'); void reason.offsetWidth; reason.classList.add('is-need'); reason.focus(); };
    hold.onclick = async () => {
      if (x.state === 'held') return act(x, 'resume');
      if (!reason.value.trim()) return need('보류 사유를 적어 주세요. 기관 ‘내 요청’에 이 사유가 보입니다.');
      act(x, 'hold', { reason: reason.value.trim() });
    };
    const decide = async (dec) => {
      if (dec === 'reject' && !reason.value.trim()) return need('거절 사유를 적어 주세요. 요청한 기관에 이 사유가 보입니다.');
      if (!x.approval_id) return toast('지금은 처리할 수 없습니다');
      ok.disabled = no.disabled = hold.disabled = true;
      try {
        await api(`/approvals/${encodeURIComponent(x.approval_id)}/decide`, { method: 'POST', body: { decision: dec, reason: reason.value.trim() || (dec === 'approve' ? '승인' : '') } });
        toast(dec === 'approve' ? '승인했습니다 — 순번대로 분석합니다' : '거절했습니다');
        await load(); onChanged?.();
      } catch (e) {
        toast(e.message || '지금은 처리할 수 없습니다'); devlog('decide', `${x.id} · ${e.code}`);
        ok.disabled = no.disabled = hold.disabled = false;
      }
    };
    ok.onclick = () => decide('approve');
    no.onclick = () => decide('reject');
  }

  return { load, count, close() { sheet?.close(true); openId = null; } };
}
