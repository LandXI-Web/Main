/* 행정정보와 비교 — 영농관리 결정 두 칸(10-18 원칙 291 · 확인 대장 바퀴 18 now 답).
   ① 사료작물 재배 신청 대장 × 세 시점(생육기 · 생산기 · 곤포사일리지) — "ⓐ 필지마다 견주기만"
      시점마다 서비스를 고르면(고르지 않음 가능) 필지마다 AI 결과 있음 · 없음 → 맞음 · 다름(어느 시점이 없는지). 표 · 지도 칠 · 엑셀.
      읍면동별 묶음(10-18 제안-견주기읍면동묶음) — 읍면동마다 신청 · 맞음 · 다름 · 누르면 지도 · 표가 그 읍면동만 · 엑셀 '읍면동별' 시트.
      경영체로 묶기 · 합계 넓이 · 이행 판정 같은 덧붙인 판단은 하지 않는다. 서버 GET /spaces/me/ledger/feedcrop(숫자 한 출처).
      곤포사일리지 시점에는 개수 — 기관이 1개당 무게를 넣으면 생산량(kg)도(영농-q2 ⓑ).
   ② 행정정보 주제별 목록 — 주제(대장 종류)마다 기준일 · 건수 · 등록자. 줄을 누르면 그 대장으로 맞춤. 서버 GET /spaces/me/ledgers.
   어느 지역이든 같은 화면(지역 이름 · 코드 고정값 0 — 관할 = 로그인한 기관). */
import * as K from '../kit/index.js';
import { api, h } from '../kit/util.js';
import { personalFile } from '../kit/pledge.js';
import { baleBox } from '../kit/bale.js';

const nf = (v, d = 0) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const val = (e) => (e && typeof e === 'object' ? e.value : e);
const md = (s) => { const m = /^(\d{4})[-.](\d{2})[-.](\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };
const SHORT = { growth: '생육기', harvest: '생산기', bale: '곤포' };

/** 사료작물 견주기 — ctx = { pane, bigCard, paintMap, fly, pick(저장된 고르기), onPick(고르기 저장), onList, onNew, padStage } */
export async function showFeed(importId, ctx) {
  const { pane } = ctx;
  pane.replaceChildren(h('p.gf-note', { role: 'status', 'aria-busy': 'true', text: '' }));   // 첫인상-3: 칸 글 대신 가운데 하나(K.during)
  const q = { import_id: importId, geom: '1' };
  for (const k of ['growth', 'harvest', 'bale']) if (ctx.pick[k]) q[k] = ctx.pick[k];
  let c;
  try { c = await K.during(api('/spaces/me/ledger/feedcrop?' + new URLSearchParams(q))); }
  catch (e) { K.devlog('feedcrop', e.message); pane.replaceChildren(h('p.gf-note', { role: 'status', text: '불러오지 못했습니다' })); return null; }
  paint(c, ctx);
  return c;
}

function paint(c, ctx) {
  const { pane, bigCard } = ctx;
  const L = c.ledger;
  /* 시점마다 서비스 고르기 */
  const sels = h('div.gf-slots');
  for (const sl of c.slots) {
    const sel = h('select.t-input.gf-sel', { 'aria-label': `${sl.label} 서비스` },
      h('option', { value: '-', text: '고르지 않음' }), ...c.services.map((s) => h('option', { value: s.card, text: [s.name, s.shot].filter(Boolean).join(' · ') })));
    sel.value = sl.card || '-';
    sel.addEventListener('change', () => { ctx.onPick({ ...ctx.pick, [sl.key]: sel.value }); });
    sels.append(h('label.gf-fld', {}, h('span.t-label', { text: sl.label }), sel));
  }
  const ps = Object.fromEntries((c.per_slot || []).map((x) => [x.key, x]));
  const picked = c.slots.filter((s) => s.card);
  const lines = h('ul.gf-rows');
  lines.append(h('li', {}, h('span', { text: '맞음 · 고른 시점 모두 AI 결과 있음' }), h('b.num', { text: nf(val(c.ok)), dataset: { metric: '맞음', v: String(val(c.ok) ?? '') } })));
  for (const sl of picked) {
    const x = ps[sl.key]; if (!x) continue;
    lines.append(h('li.dim', {}, h('span', { text: `${sl.label} AI 결과 없음` }), h('b.num', { text: nf(val(x.missing)) })));
  }
  if (ps.bale) {
    const y = val(ps.bale.yield);
    lines.append(h('li.dim', {}, h('span', { text: y ? '곤포사일리지 · 생산량' : '곤포사일리지' }), h('b.num', { text: `${nf(val(ps.bale.bales))}개${y ? ` · ${nf(y)}kg` : ''}` })));
  }
  if (L.loose && val(L.loose)) lines.append(h('li.dim', {}, h('span', { text: '필지와 잇지 못한 대장 행' }), h('b.num', { text: nf(val(L.loose)) })));
  /* 표 — 다른 필지 먼저 여덟 줄(읍면동을 고르면 그 읍면동만) */
  const cell = (x, k) => { const v = x.slots[k]; if (!v) return '—'; return v.found ? (k === 'bale' && v.n ? `${nf(v.n)}개` : '있음') : '없음'; };
  const tbw = h('div.gf-tbw');
  const drawTable = () => {
    const top = c.items.filter((x) => x.k === 'diff' && (!ctx.emdOn || (x.emd || '읍면동 밖') === ctx.emdOn)).slice(0, 8);
    tbw.hidden = !top.length;
    tbw.replaceChildren(h('table.gf-tb.gf-tb--feed', {}, h('thead', {}, h('tr', {}, h('th', { text: '지번' }), h('th', { text: '신청 작물' }),
      ...picked.map((s) => h('th', { text: SHORT[s.key] })))),
      h('tbody', {}, ...top.map((x) => h('tr', { tabindex: '0', onclick: () => ctx.fly(x.pnu), onkeydown: (e) => { if (e.key === 'Enter') ctx.fly(x.pnu); } },
        h('td', { text: x.where }), h('td', { text: x.crop }), ...picked.map((s) => h('td', { class: x.slots[s.key]?.found ? '' : 'is-miss', text: cell(x, s.key) })))))));
  };
  const dn = val(c.diff);
  const more = !picked.length ? '견줄 시점을 하나 이상 골라 주세요' : dn ? `다른 필지 ${nf(dn)}곳 모두 지도에 · 목록은 엑셀로` : '고른 시점 모두 AI 결과가 있습니다';
  /* 읍면동별 묶음(10-18 제안-견주기읍면동묶음 넣음) — 읍면동마다 신청 · 맞음 · 다름. 누르면 지도 · 표가 그 읍면동만, 다시 누르면 전체 */
  const emdBox = h('section.gf-emd', { 'aria-label': '읍면동별' });
  const drawEmd = () => {
    const rows = c.by_emd || [];
    if (!picked.length || rows.length < 1) { emdBox.hidden = true; return; }
    emdBox.hidden = false;
    const tr = (e) => h('tr', { tabindex: '0', role: 'button', 'aria-pressed': String(ctx.emdOn === e.emd), class: ctx.emdOn === e.emd ? 'is-on' : '',
      onclick: () => setEmd(ctx.emdOn === e.emd ? null : e.emd), onkeydown: (ev) => { if (ev.key === 'Enter') setEmd(ctx.emdOn === e.emd ? null : e.emd); } },
    h('td', { text: e.emd }), h('td.n', { text: nf(val(e.n)) }), h('td.n', { text: nf(val(e.ok)) }), h('td.n.is-d', { text: nf(val(e.diff)) }));
    emdBox.replaceChildren(h('div.gf-emd-h', {}, h('h4', { text: '읍면동별' }),
      ctx.emdOn ? h('button.t-btn.t-btn--text.gf-list-b', { type: 'button', text: '전체 보기', onclick: () => setEmd(null) }) : h('span', { text: '누르면 지도 · 표가 그 읍면동만' })),
    h('div.gf-tbw', {}, h('table.gf-tb.gf-tb--emd', {}, h('thead', {}, h('tr', {}, h('th', { text: '읍면동' }), h('th.n', { text: '신청' }), h('th.n', { text: '맞음' }), h('th.n', { text: '다름' }))),
      h('tbody', {}, ...rows.map(tr)))));
  };
  const setEmd = (e) => {
    ctx.emdOn = e; drawEmd(); drawTable();
    const all = c.geojson;
    ctx.paintMap(all ? { geojson: e ? { ...all, features: all.features.filter((f) => f.properties.emd === e) } : all } : null);
  };
  const bDl = h('button.t-btn.t-btn--2', { type: 'button', text: '엑셀로 내려받기', title: '올린 대장이 든 파일 — 받을 때마다 사용 목적 · 기간을 확인합니다' });
  const bNew = h('button.t-btn.t-btn--2', { type: 'button', text: '다른 파일' });
  bDl.addEventListener('click', async () => {
    bDl.disabled = true;
    const q = { import_id: L.import_id };
    for (const s of c.slots) q[s.key] = s.card || '-';
    try { await personalFile('/spaces/me/ledger/feedcrop.xlsx?' + new URLSearchParams(q), { name: '사료작물_대장대조.xlsx', label: '사료작물 대장 대조 엑셀' }); }
    catch (e) { K.devlog('feed xlsx', e.message); K.toast('내려받지 못했습니다'); }
    finally { bDl.disabled = false; }
  });
  bNew.addEventListener('click', () => ctx.onNew());
  const baleSl = c.slots.find((s) => s.key === 'bale' && s.card);
  /* 곤포사일리지 1개당 무게 — 기관 설정 한 값(곤포 시점을 고르지 않았어도 넣어 둘 수 있게 늘 보인다) */
  const bale = baleBox({ bale: { kg: c.bale_kg, can_edit: ctx.canEdit } }, baleSl ? [{ name: '곤포사일리지', n: ps.bale?.bales, yield: ps.bale?.yield }] : [], () => ctx.onPick({ ...ctx.pick }));
  pane.replaceChildren(
    h('p.gf-file', {}, L.name, ' ', h('small', {}, [`${nf(val(L.parcels))}필지`, L.base_date ? `기준일 ${L.base_date}` : null, L.uploader?.role].filter(Boolean).join(' · '),
      ctx.canEdit ? h('br') : null, ctx.canEdit ? baseDateEdit(L.import_id, L.base_date, () => ctx.onPick({ ...ctx.pick })) : null)),
    sels,
    h('p.gf-big1', { dataset: { metric: '다름', v: String(dn ?? '') } }, h('span', { text: 'AI 결과가 없는 시점이 있는 신청 필지' }), h('b', { text: nf(dn) }), h('i', { text: '필지' })),
    lines, emdBox, tbw, h('p.gf-note', { text: more }), bale,
    h('div.gf-acts', {}, bDl, bNew), listBtn(ctx.onList));
  bigCard.replaceChildren(h('small', { text: '사료작물 신청 필지 · 다름' }), h('p.gf-bign', {}, h('b', { text: nf(dn) }), h('i', { text: '필지' })),
    h('div.gf-chips', {}, ...picked.map((s) => h('span', {}, `${s.label} 없음 `, h('b', { text: nf(val(ps[s.key]?.missing)) })))));
  bigCard.hidden = false;
  /* 지도 — 맞음 = 청록 · 다름 = 붉은 칠 · 고른 시점 없음 = 흰 선(같은 층 · k 값만 맞춤) */
  const fc = c.geojson ? { ...c.geojson, features: c.geojson.features.map((f) => ({ ...f, properties: { ...f.properties, k: f.properties.k === 'ok' ? 'ai' : f.properties.k } })) } : null;
  c.geojson = fc;
  if (ctx.emdOn && !(c.by_emd || []).some((e) => e.emd === ctx.emdOn)) ctx.emdOn = null;   // 고른 읍면동이 이 대장에 없으면 전체로
  drawEmd(); drawTable();
  ctx.paintMap(fc ? { geojson: ctx.emdOn ? { ...fc, features: fc.features.filter((f) => f.properties.emd === ctx.emdOn) } : fc } : null);
  requestAnimationFrame(ctx.padStage);
}

export function listBtn(onClick) {
  const b = h('button.t-btn.t-btn--text.gf-list-b', { type: 'button', text: '행정정보 목록' });
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** 행정정보 주제별 목록 — ctx = { pane, onOpen(import_id), onBack }. 주제(대장 종류)마다 최근 올린 것부터 · 기준일 · 건수 · 등록자 */
export async function showList(ctx) {
  const { pane } = ctx;
  pane.replaceChildren(h('h3.gf-h', { text: '행정정보 목록' }), h('p.gf-note', { role: 'status', 'aria-busy': 'true', text: '' }));
  let j;
  try { j = await K.during(api('/spaces/me/ledgers')); }
  catch (e) { K.devlog('ledgers', e.message); pane.replaceChildren(h('h3.gf-h', { text: '행정정보 목록' }), h('p.gf-note', { role: 'status', text: '불러오지 못했습니다' })); return; }
  const back = h('button.t-btn.t-btn--2', { type: 'button', text: '돌아가기' });
  back.addEventListener('click', () => ctx.onBack());
  const out = [h('h3.gf-h', { text: '행정정보 목록' }), h('p.gf-note', {}, '주제별로 최근 것부터 보입니다.', h('br'), '누르면 그 대장으로 맞춥니다.')];
  const groups = [...(j.groups || [])].sort((a, b) => String(b.items[0]?.uploaded || '').localeCompare(String(a.items[0]?.uploaded || '')));
  if (!groups.length) out.push(h('p.gf-note', { text: '올린 행정정보가 아직 없습니다' }));
  const row = (x) => h('li', { tabindex: '0', role: 'button', onclick: () => ctx.onOpen(x.import_id), onkeydown: (e) => { if (e.key === 'Enter') ctx.onOpen(x.import_id); } },
    h('p.gf-li-1', {}, h('b.gf-nm', { text: x.name }), h('span.num', { text: x.parcels ? `${nf(val(x.parcels))}필지` : (x.state || '') })),
    h('p.gf-li-2', { text: [x.base_date ? `기준일 ${md(x.base_date)}` : `올린 날 ${md(x.uploaded)}`, `${nf(val(x.rows))}행`, x.who].filter(Boolean).join(' · ') }));
  for (const g of groups) {
    const ul = h('ul.gf-li');
    const first = g.items.slice(0, 5), rest = g.items.slice(5);
    ul.append(...first.map(row));
    const sec = h('section.gf-lst', {}, h('div.gf-lst-h', {}, h('h4', { text: g.label }), h('span', { text: `${nf(val(g.n))}건` })), ul);
    if (rest.length) {
      const more = h('button.t-btn.t-btn--text.gf-list-b', { type: 'button', text: `${nf(rest.length)}건 더 보기` });
      more.addEventListener('click', () => { ul.append(...rest.map(row)); more.remove(); });
      sec.append(more);
    }
    out.push(sec);
  }
  out.push(h('div.gf-acts', {}, back));
  pane.replaceChildren(...out);
}

/** 기준일 적기 · 고치기(기관 관리자) — 결과 화면 파일 줄 옆 작은 단추 → 날짜 칸 */
export function baseDateEdit(importId, cur, onSaved) {
  const b = h('button.t-btn.t-btn--text.gf-bd', { type: 'button', text: cur ? '기준일 고치기' : '기준일 적기' });
  b.addEventListener('click', () => {
    const inp = h('input.t-input.gf-day', { type: 'date', value: String(cur || '').replace(/\./g, '-'), 'aria-label': '기준일' });
    b.replaceWith(inp); inp.focus(); inp.showPicker?.();
    inp.addEventListener('change', async () => {
      try { await api('/spaces/me/ledgers/' + encodeURIComponent(importId), { method: 'PATCH', body: { base_date: inp.value || null } }); K.toast('기준일을 적었습니다'); onSaved?.(); }
      catch (e) { K.toast(e.message || '적지 못했습니다'); }
    });
  });
  return b;
}
