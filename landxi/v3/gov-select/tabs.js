/* 서비스 대시보드의 '이력' · '통계·보고서' 탭(구현 5차 2묶음 · 확인 대장 18차 N-1 ⓐ 묶음 · 기관-9 ⓑ · 시안 design-r9/gov-2 dash.html?tab=history|stats).
   이력 = 그 서비스에서 일어난 일 한 줄기(결과 공개 · AI 분석 · 확인 기록 · 검토 요청 · 분석 요청 · 촬영 요청 · 내려받기) — 서버 GET /history · 거르기 칩 · 날짜별 · 엑셀(CSV).
   통계·보고서 = 숫자 둘(AI 분석 결과 · 오탐) · 읍면별 표 · 보고서 만들기 · 자료 내려받기(내려받기는 이 탭 한 곳).
   원칙 135 기관까지(10-10 확인 8 ⓐ): 현장 확인 필요 · 확인 끝 · 확인 예정 · 월별 확인 기록 · 이력의 확인 기록은 화면에서 쓰지 않는다(서버 기록은 그대로).
   숫자는 서버 값 그대로(GET /history/stats · 결과 설명서) · 지어내지 않는다 · 필지 대조가 없는 서비스는 '필지 대조가 없는 서비스' 한 줄과 내려받기만. */
import * as K from '../kit/index.js';
import { api } from '../../shared/api-v1.js';
import { h } from '../kit/util.js';
import { download as fetchFile, val } from '../gov-space/guide.js';
import { summary, aiResult } from '../lx-console/summary.js';
import { baleBox } from '../kit/bale.js';   // 곤포사일리지 생산량(10-18 영농-q2 ⓑ)   // AI 분석 결과 — LX 화면과 같은 출처 · 같은 계산

const nf = (v) => Number(v || 0).toLocaleString('ko-KR');
const md = (iso) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[1]}.${m[2]}` : ''; };
const USE = { geojson: '지도 프로그램용', parcels: '필지 목록 · 확인 결과 · 메모', summary: '숫자만 한 장' };

/* ═════════ 이력 ═════════ */
export async function renderHistory(main, side, { s, B }) {
  const box = h('section.t-card.gd-box.gy-hist', { 'aria-label': '이력' });
  main.append(box);
  side.append(h('section.t-card.gd-box.gy-legend', { 'aria-label': '이력에 남는 것' }, h('div.gd-box-h', {}, h('h2', { text: '이력에 남는 것' })),
    h('dl.gy-leg', {}, ...[['결과 공개', 'LX가 새 판 · 회차를 열 때'], ['검토 요청', '보낸 메모와 LX 답'],
      ['분석 요청', '보냄 → LX 확인 → 분석 끝'], ['촬영 요청', '보냄 → LX 답(시기 · 금액)'], ['내려받기', '누가 무엇을 받았나']]
      .map(([k, d]) => h('div', {}, h('dt', {}, h('span.t-chip', { text: k })), h('dd', { text: d })))),
    h('p.gd-note', { text: '모두 서버에 이미 쌓이는 기록을 한 줄기로 보이는 것입니다.' })));
  let j;
  try { j = await api('/history?' + new URLSearchParams({ card: s.card })); }
  catch { const x = h('div'); box.append(x); K.empty(x, { kind: 'error', title: '이력을 불러오지 못했습니다' }); return; }
  const items = (j.items || []).filter((x) => x.kind !== 'check');   // 확인 기록(현장 확인 이력)은 화면에서 쓰지 않는다(원칙 135)
  let on = 'all';
  const chips = h('div.gy-chips', { role: 'tablist', 'aria-label': '거르기' });
  const list = h('div.gy-days');
  const csv = h('button.t-btn.t-btn--text.gd-more', { type: 'button', text: 'CSV 파일로 내려받기', title: '엑셀에서 바로 열립니다' });
  box.append(h('div.gd-box-h', {}, h('h2', { text: '이력' }), h('span.gd-small', { text: '이 서비스에서 일어난 일 · 시간순' })), chips, csv, list);
  const kinds = [['all', '전체', items.length], ...Object.entries(j.counts || {}).filter(([k]) => k !== 'check').map(([k, e]) => [k, (items.find((x) => x.kind === k) || {}).kind_ko || KO[k], val(e)])];
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
  const cls = h('section.t-card.gd-box.gs-cls', { 'aria-label': '종류별 · 읍면동별' });
  (pre || main).append(top, nums);
  main.append(table, cls);
  side.append(month, files);
  let survey = false;
  const filesP = Promise.all([api('/spaces/me'), api('/spaces/me/guides/' + encodeURIComponent(s.card))]).catch(() => [null, null]);   // 내려받기 칸 자료를 먼저 물어 둔다(차례로 기다리지 않게 · 원칙 251)
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
    const n = { ...(j.numbers || {}) };
    /* AI 분석 결과 = 요약 한 출처(대시보드 큰 숫자 · LX 화면과 같은 값) — 없으면 그 칸을 접는다 */
    const ai = aiResult(await summary().catch(() => null), (i) => i.card === s.card);
    if (ai) n.ai = ai.env;
    /* '의심 필지'(필지 대조 후보 · 규칙별로 센 수)는 큰 숫자에서 뺀다 — AI 분석 결과보다 큰 다른 뜻의 수가 나란히 서서 헷갈림(원칙 135 · 10-10 고장) */
    nums.replaceChildren(...[['ai', 'AI 분석 결과'], ['fp', '오탐 · AI가 잘못 봄']].filter(([k]) => n[k])
      .map(([k, l]) => h('div.gs-num', { dataset: { k } }, h('b', { html: K.numHtml(n[k]) }), h('span', { text: l }))));
    /* 읍면별 표 — 이 서비스의 AI 분석 결과 필지(GPT3-2 · 원칙 135 — 실태조사 규칙 수 · '의심' · 우선순위 칸 없음).
       필지 목록 · 필지 엑셀과 같은 출처(GET /spaces/me/guides/{서비스}/parcels) · 많은 곳부터 열두 줄 + 그 밖 + 전체 · '모두 펼치기' */
    let pj = null;
    try { pj = await api(`/spaces/me/guides/${encodeURIComponent(s.card)}/parcels?limit=1`); } catch { pj = null; }
    const rows = (pj?.by_emd || []).map((r) => ({ name: r.emd, n: val(r.parcels) || 0 }));
    const tot = val(pj?.total) || 0;
    if (!pj || !rows.length) { table.replaceChildren(h('div.gd-box-h', {}, h('h2', { text: '읍면별' })), h('p.gs-none', { text: pj ? 'AI 분석 결과가 걸친 필지가 없습니다' : '읍면별 통계를 불러오지 못했습니다' })); }
    else {
      const max = Math.max(1, ...rows.map((r) => r.n));
      let all = false;
      const tb = h('tbody');
      const fill = () => {
        const show = all ? rows : rows.slice(0, 12), rest = all ? [] : rows.slice(12);
        const tr = (r, cls) => h('tr', { class: cls || '' }, h('td', { text: r.name }), h('td.num', { text: nf(r.n) }),
          h('td.gs-bar-c', {}, cls ? null : h('i', { style: `--w:${Math.max(2, Math.round((r.n / max) * 100))}%` })));
        const restRow = rest.length ? tr({ name: `그 밖 ${rest.length}곳`, n: rest.reduce((a, r) => a + r.n, 0) }, 'is-rest') : null;
        tb.replaceChildren(...show.map((r) => tr(r)), ...(restRow ? [restRow] : []), tr({ name: `${B.short} 전체`, n: tot }, 'is-total'));
      };
      fill();
      const more = rows.length > 12 ? h('button.t-btn.t-btn--text.gd-more.gs-all', { type: 'button', text: `${rows.length}곳 모두 펼치기`, onclick: () => { all = !all; more.textContent = all ? '줄이기' : `${rows.length}곳 모두 펼치기`; fill(); } }) : null;
      table.replaceChildren(h('div.gd-box-h', {}, h('h2', { text: '읍면별' }), h('span.gd-small', { text: 'AI 분석 결과 필지 많은 곳부터' })),
        h('div.gs-tbl-w', {}, h('table.gs-tbl', {}, h('thead', {}, h('tr', {}, h('th', { text: '읍면동' }), h('th.num', { text: 'AI 분석 결과 필지' }), h('th', { text: '' }))), tb)), more);
    }
    /* 월별 확인 기록(현장 확인 이력)은 화면에서 쓰지 않는다(원칙 135 · 10-10 확인 8 ⓐ) — 아래 그리기는 남겨 둠 */
    month.hidden = true;
    if (month.hidden) return;
    const ms = j.monthly || [];
    const mmax = Math.max(1, ...ms.map((m) => val(m.n) || 0));
    const chips = h('div.gs-period', { role: 'group', 'aria-label': '기간' }, ...[['all', '전체'], ['year', '올해'], ['month', '이번 달']].map(([k, t]) =>
      h('button.gy-chip', { type: 'button', 'aria-pressed': String(period === k), onclick: () => { period = k; draw(); } }, t)));
    month.replaceChildren(h('div.gd-box-h', {}, h('h2', { text: '월별 확인 기록' }), h('span.gd-small', { text: '담당자가 적은 것' })), chips,
      ms.length ? h('div.gs-mbars', {}, ...ms.map((m) => h('div.gs-mbar', { class: val(m.n) ? '' : 'is-zero' }, h('b.num', { text: nf(val(m.n)) }), h('i', { style: `--h:${Math.max(4, Math.round(((val(m.n) || 0) / mmax) * 100))}%` }),
        h('span', { text: `${Number(m.month.slice(5))}월` })))) : h('p.gs-none', { text: '이 기간에 적은 확인 기록이 없습니다' }),
      h('p.gd-note', { text: `확인 기록 ${nf(val(j.checks))}건 · 필지 카드에서 적은 메모 · 다음 확인 날짜가 쌓입니다` }));
  };
  await Promise.all([draw(), renderClassStats(cls, { s, B })]);
  /* 보고서 · 자료 내려받기 — 내려받기는 이 탭 한 곳(N-1 ⓐ) · 분기 공간 1단 서버 그대로(관할 안만 · 처음 한 번 이용 약속 · 기록) */
  files.append(h('div.gd-box-h', {}, h('h2', { text: '보고서 · 자료 내려받기' })));
  let me = null, g = null;
  [me, g] = await filesP;   // 결과 설명서가 없는 서비스면 [null, null]
  /* AI 분석 결과 보고서(10-11 gov-보고서) — 결과가 있는 서비스면 모두(실태조사 여부와 무관) · 읍면동별 표 · 지도 그림 · 한글 문서 */
  if (g?.body?.what?.total?.value) files.append(h('div.gs-file', {}, h('span.gs-file-t', {}, h('b', { text: 'AI 분석 결과 보고서' }), h('small', { text: '읍면동별 개수 · 면적 · 지도 그림' })),
    h('a.t-btn.gd-ci', { href: rep('report'), text: '만들기' })));
  for (const f of g?.body?.format?.files || []) {
    const btn = h('button.t-btn.t-btn--2', { type: 'button', text: '받기', disabled: !f.ok });
    btn.addEventListener('click', () => fetchFile(g, f, btn, me));
    files.append(h('div.gs-file', { class: f.ok ? '' : 'is-off' }, h('span.gs-file-t', {}, h('b', { text: f.label }), h('small', { text: f.ok ? (USE[f.fmt] || f.kind || '') : (f.why || '받을 수 없습니다') })), btn));
  }
  files.append(h('p.gd-note', { text: `${B.short} 관할 안 결과만 바로 받습니다. 누가 무엇을 받았는지 이력에 남습니다. 올린 대장이 든 파일은 이용 약속 뒤 받을 때마다 확인합니다.` }));
}

/* ═════════ 종류별 · 읍면동별(10-18 원칙 286 영농관리 고도화) ═════════
   운영 중인 영농관리 화면의 '클래스별 통계 · 지역별 통계'를 우리 말로 — 종류(예: 옥수수 · 수단그라스 · 경작지 · 비닐하우스 단동)마다 넓이 · 개수,
   읍면동마다 종류별 넓이 · 개수 · 엑셀(CSV). 서버 GET /spaces/me/guides/{서비스}/class-stats — 결과 설명서와 같은 결과 · 같은 관할(숫자 한 출처).
   개수는 서버가 주는 서비스만(분석 칸 조각 수는 싣지 않는다). 지역 이름은 서버 값 그대로 — 어느 지역이든 같은 화면. */
export async function renderClassStats(box, { s, B }) {
  let j;
  try { j = await api(`/spaces/me/guides/${encodeURIComponent(s.card)}/class-stats`); }
  catch { box.hidden = true; return; }
  const classes = j.classes || [], emds = j.emds || [];
  if (!classes.length) { box.hidden = true; return; }
  let unit = 'area', all = false;
  const fmt = (e) => (e && e.value != null ? Number(e.value).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) : '–');
  const pick = (o) => (o ? o[unit] : null);
  const head = h('div.gd-box-h', {}, h('h2', { text: '종류별 · 읍면동별' }), h('span.gd-small', { text: unit === 'area' ? '넓이 ㎡' : '개수' }));
  const chips = h('div.gs-period.gs-cls-unit', { role: 'group', 'aria-label': '단위' });
  const sumT = h('tbody'), embT = h('tbody'), embH = h('tr');
  const more = h('button.t-btn.t-btn--text.gd-more.gs-all', { type: 'button' });
  const csv = h('button.t-btn.t-btn--text.gd-more.gs-cls-csv', { type: 'button', text: 'CSV 파일로 내려받기', title: '엑셀에서 바로 열립니다' });
  const names = classes.map((c) => c.name);
  const nw = j.unit === '필지' ? '필지 수' : '개수';     // 결과 셈 단위(서버) — 결과 설명서 · 대시보드 큰 숫자와 같은 단위
  const draw = () => {
    head.lastChild.textContent = unit === 'area' ? '넓이 ㎡ · 이 서비스 AI 분석 결과' : `${nw} · 이 서비스 AI 분석 결과`;
    chips.replaceChildren(...[['area', '넓이'], ...(j.count ? [['n', nw]] : [])].map(([k, t]) =>
      h('button.gy-chip', { type: 'button', 'aria-pressed': String(unit === k), onclick: () => { unit = k; draw(); } }, t)));
    const tv = Number(pick(j.total)?.value || 0) || 1;
    const max = Math.max(1, ...classes.map((c) => Number(pick(c)?.value || 0)));
    sumT.replaceChildren(...classes.map((c) => h('tr', {}, h('td', { text: c.name }), h('td.num', { text: fmt(pick(c)) }),
      h('td.num.gs-pct', { text: `${Math.round((Number(pick(c)?.value || 0) / tv) * 100)}%` }),
      h('td.gs-bar-c', {}, h('i', { style: `--w:${Math.max(2, Math.round((Number(pick(c)?.value || 0) / max) * 100))}%` })))),
      h('tr.is-total', {}, h('td', { text: '합계' }), h('td.num', { text: fmt(pick(j.total)) }), h('td.num', { text: '100%' }), h('td.gs-bar-c')));
    embH.replaceChildren(h('th', { text: '읍면동' }), h('th.num', { text: '합계' }), ...names.map((n) => h('th.num', { text: n })));
    const ord = [...emds].sort((x, y) => (x.out - y.out) || (Number(pick(y)?.value || 0) - Number(pick(x)?.value || 0)));   // 고른 단위로 많은 곳부터 · 읍면동 밖은 끝
    const show = all ? ord : ord.slice(0, 12);
    embT.replaceChildren(...show.map((e) => h('tr', { class: e.out ? 'is-rest' : '' }, h('td', { text: e.emd }), h('td.num', { text: fmt(pick(e)) }),
      ...names.map((n) => h('td.num', { text: fmt(pick(e.by?.[n])) })))),
      h('tr.is-total', {}, h('td', { text: `${B.short || ''} 전체`.trim() }), h('td.num', { text: fmt(pick(j.total)) }), ...classes.map((c) => h('td.num', { text: fmt(pick(c)) }))));
    more.hidden = emds.length <= 12;
    more.textContent = all ? '줄이기' : `${emds.length}곳 모두 펼치기`;
  };
  more.addEventListener('click', () => { all = !all; draw(); });
  csv.addEventListener('click', () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const v = (e) => (e && e.value != null ? Math.round(Number(e.value) * 10) / 10 : '');
    const yk = (n) => !!classes.find((c) => c.name === n)?.yield;      // 곤포사일리지 생산량 칸(기관이 1개당 무게를 넣었을 때만 · 10-18 영농-q2 ⓑ)
    const cols = ['읍면동', '합계 넓이(㎡)', ...(j.count ? [`합계 ${nw}`] : []), ...names.flatMap((n) => [`${n} 넓이(㎡)`, ...(j.count ? [`${n} ${nw}`] : []), ...(yk(n) ? [`${n} 생산량(kg)`] : [])])];
    const line = (name, tot, by) => [name, v(tot?.area), ...(j.count ? [v(tot?.n)] : []), ...names.flatMap((n) => [v(by(n)?.area), ...(j.count ? [v(by(n)?.n)] : []), ...(yk(n) ? [v(by(n)?.yield)] : [])])].map(q).join(',');
    const body = [cols.map(q).join(','), ...emds.map((e) => line(e.emd, e, (n) => e.by?.[n])),
      line(`${B.short || ''} 전체`.trim(), j.total, (n) => classes.find((c) => c.name === n))].join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' })), download: `${(B.short || '').replace(/\s+/g, '')}_${s.name.replace(/\s+/g, '')}_종류별_읍면동별.csv` });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  });
  box.replaceChildren(head, chips,
    h('div.gs-tbl-w', {}, h('table.gs-tbl.gs-cls-sum', {}, h('thead', {}, h('tr', {}, h('th', { text: '종류' }), h('th.num', { text: '합계' }), h('th.num', { text: '비율' }), h('th', { text: '' }))), sumT)),
    j.bale ? baleBox(j, classes, () => renderClassStats(box, { s, B })) : null,
    h('div.gs-tbl-w.gs-cls-emd', {}, h('table.gs-tbl', {}, h('thead', {}, embH), embT)), more, csv,
    j.note ? h('p.gd-note', { text: '이 서비스는 분석 칸마다 나눈 결과라 넓이만 보여 드립니다.' }) : null);
  draw();
}

