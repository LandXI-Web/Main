/* 기관에서 온 촬영 요청 — LX 관리자가 받는다(구현 5차 2묶음 · 확인 대장 18차 촬영-1 ⓑ · 원칙 120 '촬영 요청은 LX 관리자가 맡아 직접 하거나 담당자를 배정'.
   담당 지정 화면은 다음 설계(기관-11 '새 화면으로') — 지금은 LX 관리자가 이 목록에서 답한다.
   한 건 = 기관 · 보낸 사람 · 범위(지도) · 넓이 · 원하는 시기 · 찍은 뒤 분석할 서비스 · 메모 · 대략 비용(넓이 × 고시 기준 · 서버 셈) →
   답 = 촬영 시기 · 확정 금액(대략 값에서 조정) · 한 줄 → 기관 '보낸 요청'에 도착 · 기관이 진행 · 취소를 정한다. 반려는 사유 한 줄.
   숫자는 서버 값 그대로 · 공문 · 계약은 바깥 절차. */
import { createStage, toast, empty, drawer } from '../kit/index.js';
import { h, api, bboxOf } from '../kit/util.js';

const nf = (v) => Number(v || 0).toLocaleString('ko-KR');
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };
const km2 = (e) => `${Number(e?.value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}㎢`;
const LV = { sent: 'wait', answered: '', accepted: '', cancelled: 'gap', rejected: 'warn' };

/** 머리 아래 한 줄 — '촬영 요청 n건 · 답 기다림 m' · 누르면 목록(주소 #shoots 로 바로) */
export function shootStrip() {
  const b = h('button.t-btn.t-btn--2.ib-shoot', { type: 'button' }, h('span', { text: '촬영 요청' }), h('b.num', { text: '' }), h('small', { text: '' }));
  const load = async () => {
    try {
      const j = await api('/shoots');
      const w = j.waiting?.value || 0;
      b.querySelector('b').textContent = `${nf(j.total || 0)}건`;
      b.querySelector('small').textContent = w ? `답 기다림 ${nf(w)}` : '';
      b.dataset.wait = w ? '1' : '';
      return j;
    } catch { b.hidden = true; return null; }
  };
  b.addEventListener('click', () => openList());
  load().then((j) => { if (j && location.hash === '#shoots') openList(j); });
  addEventListener('hashchange', () => { if (location.hash === '#shoots') openList(); });
  document.addEventListener('lx:shoots', load);
  return b;
}

async function openList(j0) {
  const body = h('div.ib-sh');
  const d = drawer({ title: '기관에서 온 촬영 요청', body, label: '촬영 요청', width: 520 });
  let j = j0;
  if (!j) { const w = h('div'); body.append(w); empty(w, { kind: 'loading' }).set({ progress: null }); try { j = await api('/shoots'); } catch { body.replaceChildren(); empty(body, { kind: 'error' }); return; } }
  const items = j.items || [];
  body.replaceChildren(h('p.ib-sh-d', { text: '기관이 지도에 그린 범위를 찍어 달라는 요청입니다. 시기와 확정 금액을 답하면 기관이 진행 여부를 정합니다.' }));
  if (!items.length) { const w = h('div'); body.append(w); empty(w, { kind: 'first', title: '아직 온 촬영 요청이 없습니다', compact: true }); return; }
  body.append(h('ul.ib-sh-l', {}, ...items.map((x) => h('li', {}, h('button.ib-sh-r', { type: 'button', onclick: () => { d.close(); openOne(x.id); } },
    h('span.ib-sh-t', {}, h('b', { text: `${x.place && x.org && x.place.startsWith(x.org) ? x.place : [x.org, x.place || '그린 범위'].filter(Boolean).join(' · ')} ${km2(x.area_km2)}` }),
      h('small', { text: [x.sender, `대략 ${nf(x.approx?.value)}원`, `${ymd(x.created_at)} 보냄`].filter(Boolean).join(' · ') })),
    h('span.t-chip', { text: x.state_word, dataset: LV[x.state] ? { lv: LV[x.state] } : {} }))))));
}

async function openOne(id) {
  const body = h('div.ib-sh');
  const d = drawer({ title: '촬영 요청', body, label: '촬영 요청', width: 520 });
  let x;
  try { x = await api('/shoots/' + encodeURIComponent(id)); } catch { empty(body, { kind: 'error' }); return; }
  const place = x.place || '그린 범위';
  d.title(x.org && !place.startsWith(x.org) ? `${x.org} · ${place}` : place);
  const mapEl = h('div.ib-sh-map', { 'aria-label': '찍을 범위' });
  const kv = (k, v) => (v ? h('div', {}, h('dt', { text: k }), h('dd', { text: v })) : null);
  body.append(mapEl, h('dl.ib-facts.ib-sh-kv', {},
    kv('상태', x.state_word), kv('보낸 사람', [x.org, x.sender].filter(Boolean).join(' ')),
    kv('범위', `${x.place || '그린 범위'} · ${km2(x.area_km2)}${x.region_type_word ? ' · ' + x.region_type_word : ''}`),
    kv('원하는 시기', x.timing), kv('찍은 뒤 분석', x.card_name), kv('메모', x.memo),
    kv('대략 비용', `${nf(x.approx?.value)}원 — 넓이로 계산한 대략의 값`), kv('보낸 날', ymd(x.created_at))));
  if (x.answer) body.append(h('section.ib-sh-ans', {}, h('p.t-label', { text: '보낸 답' }), h('dl.ib-facts', {},
    kv('촬영 시기', x.answer.timing), kv('확정 금액', `${nf(x.answer.amount?.value)}원`), kv('한 줄', x.answer.line), kv('답한 사람', x.answer.by))));
  if (x.state === 'rejected' && x.reason) body.append(h('p.ib-sh-warn', { text: `거절 · 사유: ${x.reason}` }));
  if (x.state === 'sent' || x.state === 'answered') {
    const timing = h('input.t-input', { type: 'text', maxlength: '40', value: x.answer?.timing || x.timing || '', 'aria-label': '촬영 시기' });
    const amount = h('input.t-input.num', { type: 'text', inputmode: 'numeric', value: nf(x.answer?.amount?.value ?? x.approx?.value ?? 0), 'aria-label': '확정 금액(원)' });
    const line = h('input.t-input', { type: 'text', maxlength: '200', value: x.answer?.line || '', placeholder: '예: 10월 하순 맑은 날 촬영 · 분석 대가 포함', 'aria-label': '한 줄' });
    const send = h('button.t-btn', { type: 'button', text: x.answer ? '답 고쳐 보내기' : '답 보내기' });
    const reason = h('input.t-input', { type: 'text', maxlength: '200', placeholder: '거절 사유 한 줄', 'aria-label': '거절 사유' });
    const rej = h('button.t-btn.t-btn--2', { type: 'button', text: '거절' });
    const row = (label, el, sub) => h('label.ib-sh-f', {}, h('span', {}, h('b', { text: label }), sub ? h('small', { text: sub }) : null), el);
    body.append(h('section.ib-sh-form', { 'aria-label': '답하기' }, h('p.t-label', { text: '답하기' }),
      row('촬영 시기', timing), row('확정 금액(원)', amount, '대략 값에서 조정 — 끝수 · 최소 · 부가세 · 분석 대가 등'), row('한 줄', line, '선택'),
      h('div.ib-sh-acts', {}, send), h('div.ib-sh-rej', {}, reason, rej)));
    const post = async (b, ok) => {
      try { await api(`/shoots/${encodeURIComponent(x.id)}/answer`, { method: 'POST', body: b }); toast(ok); document.dispatchEvent(new CustomEvent('lx:shoots')); document.dispatchEvent(new CustomEvent('lx:reviews')); d.close(); openOne(x.id); }
      catch (e) { toast(e.message || '보내지 못했습니다'); }
    };
    send.addEventListener('click', () => post({ timing: timing.value, amount: amount.value, line: line.value }, '답을 보냈습니다 · 기관이 진행 여부를 정합니다'));
    rej.addEventListener('click', () => { if (!reason.value.trim()) { reason.focus(); toast('거절 사유를 적어 주세요'); return; } post({ reject: true, reason: reason.value }, '거절했습니다'); });
  }
  if (x.aoi) {
    try {
      const st = createStage(mapEl, { interactive: true, scale: true, padding: { top: 20, bottom: 20, left: 20, right: 20 } });
      await st.ready;
      await st.geo('aoi', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: x.aoi }] }, 'focus');
      const b = bboxOf(x.aoi); if (b) st.go(b, { ms: 0, maxZoom: 16 });
    } catch { mapEl.hidden = true; }
  } else mapEl.hidden = true;
}
