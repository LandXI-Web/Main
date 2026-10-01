/* 서비스 대시보드의 '이력' · '통계·보고서' 탭(구현 5차 2묶음 · 확인 대장 18차 N-1 ⓐ 묶음 · 기관-9 ⓑ · 시안 design-r9/gov-2 dash.html?tab=history|stats).
   이력 = 그 서비스에서 일어난 일 한 줄기(결과 공개 · AI 분석 · 확인 기록 · 검토 요청 · 분석 요청 · 촬영 요청 · 내려받기) — 서버 GET /history · 거르기 칩 · 날짜별 · 엑셀(CSV).
   통계·보고서 = 다섯 숫자(의심 필지 · 현장 확인 필요 · 확인 끝 · 오탐 · 현장 확인 예정) · 읍면별 표 · 월별 확인 기록 · 보고서 만들기 · 자료 내려받기(내려받기는 이 탭 한 곳).
   숫자는 서버 값 그대로(GET /history/stats · 결과 설명서) · 지어내지 않는다 · 필지 대조가 없는 서비스는 '필지 대조가 없는 서비스' 한 줄과 내려받기만. */
import * as K from '../kit/index.js';
import { api } from '../../shared/api-v1.js';
import { h } from '../kit/util.js';
import { download as fetchFile, val } from '../gov-space/guide.js';

const nf = (v) => Number(v || 0).toLocaleString('ko-KR');
const md = (iso) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[1]}.${m[2]}` : ''; };
const USE = { geojson: '지도 프로그램용', parcels: '필지 목록 · 확인 결과 · 메모', summary: '숫자만 한 장' };

/* ═════════ 이력 ═════════ */
export async function renderHistory(main, side, { s, B }) {
  const box = h('section.t-card.gd-box.gy-hist', { 'aria-label': '이력' });
  main.append(box);
  side.append(h('section.t-card.gd-box.gy-legend', { 'aria-label': '이력에 남는 것' }, h('div.gd-box-h', {}, h('h2', { text: '이력에 남는 것' })),
    h('dl.gy-leg', {}, ...[['결과 공개', 'LX가 새 판 · 회차를 열 때'], ['확인 기록', '담당자가 필지 카드에 적은 메모 · 다음 확인 날짜'], ['검토 요청', '보낸 메모와 LX 답'],
      ['분석 요청', '보냄 → LX 확인 → 분석 끝'], ['촬영 요청', '보냄 → LX 답(시기 · 금액)'], ['내려받기', '누가 무엇을 받았나']]
      .map(([k, d]) => h('div', {}, h('dt', {}, h('span.t-chip', { text: k })), h('dd', { text: d })))),
    h('p.gd-note', { text: '모두 서버에 이미 쌓이는 기록을 한 줄기로 보이는 것입니다.' })));
  let j;
  try { j = await api('/history?' + new URLSearchParams({ card: s.card })); }
  catch { const x = h('div'); box.append(x); K.empty(x, { kind: 'error', title: '이력을 불러오지 못했습니다' }); return; }
  const items = j.items || [];
  let on = 'all';
  const chips = h('div.gy-chips', { role: 'tablist', 'aria-label': '거르기' });
  const list = h('div.gy-days');
  const csv = h('button.t-btn.t-btn--text.gd-more', { type: 'button', text: '엑셀로 내려받기' });
  box.append(h('div.gd-box-h', {}, h('h2', { text: '이력' }), h('span.gd-small', { text: '이 서비스에서 일어난 일 · 시간순' })), chips, csv, list);
  const kinds = [['all', '전체', items.length], ...Object.entries(j.counts || {}).map(([k, e]) => [k, (items.find((x) => x.kind === k) || {}).kind_ko || KO[k], val(e)])];
  const draw = () => {
    chips.replaceChildren(...kinds.map(([k, t, n]) => h('button.gy-chip', { type: 'button', role: 'tab', 'aria-selected': String(on === k), onclick: () => { on = k; draw(); } },
      t, h('b.num', { text: ` ${nf(n)}` }))));
    const rows = items.filter((x) => on === 'all' || x.kind === on);
    if (!rows.length) { list.replaceChildren(h('p.gs-none', { text: on === 'all' ? '아직 이력이 없습니다' : '이 종류의 이력이 없습니다' })); return; }
    const days = new Map();
    for (const x of rows) { const d = md(x.at); if (!days.has(d)) days.set(d, []); days.get(d).push(x); }
    const row = (x) => h('div.gy-row', { dataset: { k: x.kind } }, h('span.t-chip.gy-k', { text: x.kind_ko }),
      h('span.gy-t', {}, h('b', { text: x.title }), x.sub ? h('small', { text: x.sub }) : null), h('span.gy-who', { text: x.who || '' }));
    /* 하루에 다섯 줄까지 — 나머지는 '이날 n건 더'(시안) */
    list.replaceChildren(...[...days].map(([d, xs]) => {
      const sec = h('section.gy-day', {}, h('p.gy-date.num', { text: d }), ...xs.slice(0, 5).map(row));
      if (xs.length > 5) {
        const more = h('button.t-btn.t-btn--text.gd-more.gy-more', { type: 'button', text: `이날 ${xs.length - 5}건 더` });
        more.addEventListener('click', () => { more.replaceWith(...xs.slice(5).map(row)); });
        sec.append(more);
      }
      return sec;
    }));
  };
  draw();
  csv.addEventListener('click', () => {
    const rows = items.filter((x) => on === 'all' || x.kind === on);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = ['날짜,종류,내용,덧붙임,누가', ...rows.map((x) => [String(x.at || '').slice(0, 10), x.kind_ko, x.title, x.sub, x.who].map(q).join(','))].join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })), download: `${(B.short || '').replace(/\s+/g, '')}_${s.name.replace(/\s+/g, '')}_이력.csv` });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  });
}
const KO = { publish: '결과 공개', analysis: 'AI 분석', check: '확인 기록', review: '검토 요청', request: '분석 요청', shoot: '촬영 요청', download: '내려받기' };

/* ═════════ 통계 · 보고서 ═════════ */
export async function renderStats(main, side, { s, B, rep, pre }) {
  let period = 'all';
  const top = h('div.gs-stats-top');
  const nums = h('div.gs-nums');
  const table = h('section.t-card.gd-box.gs-emd', { 'aria-label': '읍면별' });
  const month = h('section.t-card.gd-box.gs-month', { 'aria-label': '월별 확인 기록' });
  const files = h('section.t-card.gd-box.gs-files', { 'aria-label': '보고서 · 자료 내려받기' });
  (pre || main).append(top, nums);
  main.append(table);
  side.append(month, files);
  let survey = false;
  const draw = async () => {
    let j;
    try { j = await api('/history/stats?' + new URLSearchParams({ card: s.card, period })); }
    catch { table.replaceChildren(h('p.gs-none', { text: '통계를 불러오지 못했습니다' })); return; }
    survey = !!j.survey;
    /* 다섯 숫자 = 지금 상태(기준일) · 기간 칩은 월별 확인 기록에만 건다(숫자를 기간으로 자르지 않는다) */
    top.replaceChildren(h('span.gs-date', { text: `기준 ${String(j.as_of || '').slice(0, 10).replace(/-/g, '.')} · 지금 상태` }));
    if (!j.survey) {
      nums.replaceChildren(); month.hidden = true;
      table.replaceChildren(h('div.gd-box-h', {}, h('h2', { text: '통계' })), h('p.gs-none', { text: '이 서비스는 필지 대조(실태조사)가 없어 필지 통계가 없습니다.' }));
      top.hidden = true;
      return;
    }
    const n = j.numbers || {};
    nums.replaceChildren(...[['suspect', '의심 필지 · 확인 전'], ['field_check', '현장 확인 필요'], ['closed', '확인 끝'], ['fp', '오탐 · AI가 잘못 봄'], ['planned', '현장 확인 예정']]
      .map(([k, l]) => h('div.gs-num', { dataset: { k } }, h('b', { html: K.numHtml(n[k]) }), h('span', { text: l }))));
    /* 읍면별 표 — 우선순위 A 많은 곳부터 열두 줄 + 그 밖 + 전체 · '모두 펼치기' */
    const rows = j.emd || [];
    const max = Math.max(1, ...rows.map((r) => val(r.prio_a) || 0));
    let all = false;
    const tb = h('tbody');
    const fill = () => {
      const show = all ? rows : rows.slice(0, 12), rest = all ? [] : rows.slice(12);
      const tr = (r, cls) => h('tr', { class: cls || '' }, h('td', { text: r.name }), h('td.num', { text: nf(val(r.suspect)) }),
        h('td.gs-bar-c', {}, h('i', { style: `--w:${Math.max(2, Math.round(((val(r.prio_a) || 0) / (cls === 'is-rest' ? (val(r.prio_a) || 1) : max)) * 100))}%` })),
        h('td.num', { text: nf(val(r.prio_a)) }), h('td.num', { text: nf(val(r.closed)) }), h('td.num', { text: nf(val(r.fp)) }));
      const sum = (k, xs) => xs.reduce((a, r) => a + (val(r[k]) || 0), 0);
      const restRow = rest.length ? tr({ name: `그 밖 ${rest.length}곳`, suspect: sum('suspect', rest), prio_a: sum('prio_a', rest), closed: sum('closed', rest), fp: sum('fp', rest) }, 'is-rest') : null;
      tb.replaceChildren(...show.map((r) => tr(r)), ...(restRow ? [restRow] : []),
        tr({ name: `${B.short} 전체`, suspect: val(n.suspect), prio_a: val(n.prio_a), closed: val(n.closed), fp: val(n.fp) }, 'is-total'));
    };
    fill();
    const more = rows.length > 12 ? h('button.t-btn.t-btn--text.gd-more.gs-all', { type: 'button', text: `${rows.length}곳 모두 펼치기`, onclick: () => { all = !all; more.textContent = all ? '줄이기' : `${rows.length}곳 모두 펼치기`; fill(); } }) : null;
    table.replaceChildren(h('div.gd-box-h', {}, h('h2', { text: '읍면별' }), h('span.gd-small', { text: `우선순위 A ${nf(val(n.prio_a))} 중 판정 전 ${nf(val(n.field_check))}` })),
      h('div.gs-tbl-w', {}, h('table.gs-tbl', {}, h('thead', {}, h('tr', {}, h('th', { text: '읍면동' }), h('th.num', { text: '의심 필지' }), h('th', { text: '' }),
        h('th.num', { text: '우선순위 A' }), h('th.num', { text: '확인 끝' }), h('th.num', { text: '오탐' }))), tb)), more);
    /* 월별 확인 기록 — 담당자가 적은 것(상태 기록) */
    month.hidden = false;
    const ms = j.monthly || [];
    const mmax = Math.max(1, ...ms.map((m) => val(m.n) || 0));
    const chips = h('div.gs-period', { role: 'group', 'aria-label': '기간' }, ...[['all', '전체'], ['year', '올해'], ['month', '이번 달']].map(([k, t]) =>
      h('button.gy-chip', { type: 'button', 'aria-pressed': String(period === k), onclick: () => { period = k; draw(); } }, t)));
    month.replaceChildren(h('div.gd-box-h', {}, h('h2', { text: '월별 확인 기록' }), h('span.gd-small', { text: '담당자가 적은 것' })), chips,
      ms.length ? h('div.gs-mbars', {}, ...ms.map((m) => h('div.gs-mbar', { class: val(m.n) ? '' : 'is-zero' }, h('b.num', { text: nf(val(m.n)) }), h('i', { style: `--h:${Math.max(4, Math.round(((val(m.n) || 0) / mmax) * 100))}%` }),
        h('span', { text: `${Number(m.month.slice(5))}월` })))) : h('p.gs-none', { text: '이 기간에 적은 확인 기록이 없습니다' }),
      h('p.gd-note', { text: `확인 기록 ${nf(val(j.checks))}건 · 필지 카드에서 적은 메모 · 다음 확인 날짜가 쌓입니다` }));
  };
  await draw();
  /* 보고서 · 자료 내려받기 — 내려받기는 이 탭 한 곳(N-1 ⓐ) · 분기 공간 1단 서버 그대로(관할 안만 · 처음 한 번 이용 약속 · 기록) */
  files.append(h('div.gd-box-h', {}, h('h2', { text: '보고서 · 자료 내려받기' })));
  if (survey) files.append(h('div.gs-file', {}, h('span.gs-file-t', {}, h('b', { text: '실태조사 보고서' }), h('small', { text: '읍면별 표 · 확인 결과 · 지도 그림' })),
    h('a.t-btn.gd-ci', { href: rep('report'), text: '만들기' })));
  let me = null, g = null;
  try { [me, g] = await Promise.all([api('/spaces/me'), api('/spaces/me/guides/' + encodeURIComponent(s.card))]); } catch { /* 결과 설명서가 없는 서비스 */ }
  for (const f of g?.body?.format?.files || []) {
    const btn = h('button.t-btn.t-btn--2', { type: 'button', text: '받기', disabled: !f.ok });
    btn.addEventListener('click', () => fetchFile(g, f, btn, me));
    files.append(h('div.gs-file', { class: f.ok ? '' : 'is-off' }, h('span.gs-file-t', {}, h('b', { text: f.label }), h('small', { text: f.ok ? (USE[f.fmt] || f.kind || '') : (f.why || '받을 수 없습니다') })), btn));
  }
  files.append(h('p.gd-note', { text: `${B.short} 관할 안 결과만. 처음 받을 때 이용 약속에 한 번 동의하고, 누가 무엇을 받았는지 이력에 남습니다.` }));
}
