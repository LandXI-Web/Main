/* 요청하기 → 보낸 요청(구현 5차 2묶음 · 확인 대장 17차 촬영-1 · 18차 ⓑ — '보낸 요청'은 요청하기 안의 셋째 탭 · 시안 design-r9/gov-2/mock/requests.html).
   분석 요청 · 촬영 요청 · 검토 요청을 한 목록에(최근 순). 누르면 그 한 건:
     분석 요청 = 분석 요청 탭의 상세(지도 · 결과) · 검토 요청 = 대화 서랍(kit/notify.js openSent) ·
     촬영 요청 = LX 답(시기 · 확정 금액 · 한 줄) + '이 조건으로 진행' / '취소' — 금액은 '대략'과 '확정'을 따로 보인다.
   숫자는 서버 값 그대로 · 상태 말은 서버가 준 말(분석 요청 · 촬영 요청) · 지어내지 않는다. */
import * as K from '../kit/index.js';
import { api, h } from '../kit/util.js';
/* 보낸 요청 줄을 누르면 서랍 — 분석 요청은 분석 요청 탭의 상세로, 검토 요청은 대화 서랍(kit/notify.js) */
import { openSent } from '../kit/notify.js';
import { drawer } from '../kit/panel.js';

const nf = (v) => Number(v || 0).toLocaleString('ko-KR');
const md = (iso) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[1]}.${m[2]}` : ''; };
const short = (s) => String(s || '').replace(/\s*(행정서비스|서비스)$/, '');
const LV = { pending: 'wait', approved: 'wait', analyzing: 'wait', done: 'ci', rejected: 'warn', failed: 'warn', sent: 'wait', answered: 'ci', accepted: 'ci', cancelled: 'gap',
  seen: 'wait', answered_review: 'ci' };

export async function loadSent() {
  const [rq, sh, rv] = await Promise.all([api('/requests').catch(() => null), api('/shoots').catch(() => null), api('/reviews?box=all&limit=100').catch(() => null)]);
  const rows = [];
  for (const x of rq?.items || []) if (x.mine) rows.push({ kind: 'request', kind_ko: '분석 요청', id: x.id, at: x.decided_at || x.created_at, svc: x.service?.id,
    t: `${x.label || '영상'} → ${short(x.service?.name)}`, sub: [x.state_word, x.state === 'done' ? `${md(x.decided_at || x.created_at)} 결과 도착` : `${md(x.created_at)} 보냄`].join(' · '), word: x.state_word, lv: LV[x.state] });
  for (const x of sh?.items || []) if (x.mine) rows.push({ kind: 'shoot', kind_ko: '촬영 요청', id: x.id, at: x.updated_at || x.created_at, x,
    t: `${x.place || '그린 범위'} ${Number(x.area_km2?.value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}㎢`,
    sub: x.answer && ['answered', 'accepted'].includes(x.state) ? `LX 답 — ${x.answer.timing || ''} · 확정 ${nf(x.answer.amount?.value)}원${x.state === 'answered' ? ' · 진행 여부를 정해 주세요' : ''}`
      : x.state === 'rejected' ? `거절 · ${x.reason || ''}` : `${md(x.created_at)} 보냄 · 대략 ${nf(x.approx?.value)}원`,
    word: x.state_word, lv: LV[x.state] });
  for (const x of rv?.items || []) rows.push({ kind: 'review', kind_ko: '검토 요청', id: x.id, at: x.updated_at || x.at,
    t: `${x.where}${x.note ? ` "${x.note}"` : ''}`, sub: x.last && x.last.side === 'lx' ? `답 "${x.last.body}"` : `${md(x.at)} 보냄`,
    word: x.status === 'answered' || (x.last && x.last.side === 'lx') ? '답 도착' : x.status === 'seen' ? 'LX 확인 중' : '보냄', lv: x.status === 'answered' ? 'ci' : 'wait' });
  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return rows;
}

/** 보낸 요청 한 목록 — host 에 그린다 · compact = 오른쪽 작은 칸(세 줄) */
export function drawSent(host, rows, { compact = false, onRequest } = {}) {
  if (!rows.length) { host.replaceChildren(h('p.gs-none', { text: '아직 보낸 요청이 없습니다' })); return; }
  host.replaceChildren(h('ul.sq-sent', {}, ...(compact ? rows.slice(0, 3) : rows).map((r) => h('li', {},
    h('button.sq-sent-r', { type: 'button', dataset: { k: r.kind }, onclick: () => openRow(r, { onRequest, host, rows }) },
      h('span.t-chip.sq-k', { text: r.kind_ko }),
      h('span.sq-sent-t', {}, h('b', { text: r.t }), h('small', { text: r.sub })),
      h('span.t-chip', { text: r.word, dataset: r.lv ? { lv: r.lv } : {} }))))));
}

function openRow(r, { onRequest }) {
  if (r.kind === 'review') { openSent({ id: r.id }); return; }
  if (r.kind === 'request') { onRequest?.(r); return; }
  shootDetail(r.x);
}

/** 촬영 요청 한 건 — LX 답 · 진행 · 취소 */
function shootDetail(x) {
  const body = h('div.sq-det');
  const d = drawer({ title: `촬영 요청 · ${x.place || '그린 범위'}`, body, label: '촬영 요청' });
  const kv = (k, v) => (v ? h('div', {}, h('dt', { text: k }), h('dd', {}, v)) : null);
  body.append(h('dl.gd-kv', {},
    kv('상태', x.state_word), kv('범위', `${x.place || '그린 범위'} · ${Number(x.area_km2?.value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}㎢ · ${x.region_type_word || ''}`),
    kv('원하는 시기', x.timing), kv('찍은 뒤 분석', x.card_name), kv('메모', x.memo),
    kv('대략 비용', `${nf(x.approx?.value)}원 — 넓이로 계산한 대략의 값`)));
  if (x.answer) {
    body.append(h('section.sq-ans', {}, h('p.t-label', { text: 'LX 답' }), h('dl.gd-kv', {},
      kv('촬영 시기', x.answer.timing), kv('확정 금액', `${nf(x.answer.amount?.value)}원`), kv('한 줄', x.answer.line), kv('답한 사람', x.answer.by))));
  }
  if (x.state === 'rejected') body.append(h('p.sq-warn', { text: `거절 · 사유: ${x.reason || ''}` }));
  const acts = h('div.sq-acts');
  const act = async (path, msg) => {
    try { await api(`/shoots/${encodeURIComponent(x.id)}/${path}`, { method: 'POST', body: {} }); K.toast(msg); d.close(); document.dispatchEvent(new CustomEvent('gq:sent')); }
    catch (e) { K.toast(e.message || '지금은 할 수 없습니다'); }
  };
  if (x.state === 'answered') acts.append(h('button.t-btn.gd-ci', { type: 'button', text: '이 조건으로 진행', onclick: () => act('accept', '진행으로 알렸습니다 · LX 담당자가 촬영 일정을 안내합니다') }));
  if (x.state === 'sent' || x.state === 'answered') acts.append(h('button.t-btn.t-btn--2', { type: 'button', text: '요청 취소', onclick: () => act('cancel', '촬영 요청을 취소했습니다') }));
  if (acts.childElementCount) body.append(acts);
  body.append(h('p.gd-note', { html: '공문 · 계약은 LX 담당자가 따로 안내합니다.<br>찍은 영상은 우리 기관 지도에 들어옵니다.<br>들어온 영상으로 바로 분석을 요청할 수 있습니다.' }));
}
