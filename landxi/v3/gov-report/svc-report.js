/* 기관 '보고서' 탭 = 고르면 바로 만들어지는 보고서(10-18 15:52 now 답 영농-보고서 "시안 A 고르면 바로 만들어지는 보고서" · 원칙 291 · 293).
   왼쪽 = 넣을 결과(체크 · 하나도 여럿도) · 대장(넣지 않아도 됨) · 범위(관할 전체 · 읍면동) — 고르는 순간 오른쪽 보고서가 채워진다. 적어 넣는 칸 없음.
   보고서 = 개요 · 시점 비교(둘 이상) · 종류별 · 지도 · 읍면동별 · 대장과 견준 결과(대장을 넣었을 때) — 모두 서버 값(자동).
   아래 = 발급 목록(발급 일시 · 넣은 결과 · 요청자 · 내려받은 횟수 · 다시 받기). 한글 문서 · 엑셀 모두 같은 고르기 · 같은 숫자.
   서버: GET /spaces/me/report/pick · /report/multi · /report/multi.hwpx · /report/multi.xlsx · /report/issues · /report/map.png(서비스마다).
   숫자 한 출처 = 결과 설명서 결과 세트 × 관할(대시보드 큰 숫자 · 필지 목록 · 행정정보와 비교와 같은 행). 대장 칸은 건수만(지번 없음 → 바로 받음).
   어느 지역이든 같은 화면(지역 이름 · 코드 고정값 0 — 관할 = 로그인한 기관). */
import { api, h } from '../kit/util.js';
import { toast, devlog, during } from '../kit/index.js';
import { farmDash } from '../kit/farm-dash.js';

const $ = (s, r = document) => r.querySelector(s);
const nf = (v, d = 0) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const val = (e) => (e && typeof e === 'object' ? e.value : e);
const dot = (s) => String(s || '').slice(0, 10).replace(/-/g, '.');
const hm = (s) => { const m = /T(\d{2}:\d{2})/.exec(String(s || '')); return m ? m[1] : ''; };
const TOP = 10;
const MAPS = 4;

export function svcReport({ svc, onAuth, fusionHref }) {
  const S = { picks: new Set(), emd: '', led: '', data: null, seq: 0, avail: [], imgs: [] };
  const pane = $('.gr-pane[data-pane="report"]');
  document.body.dataset.rp = 'multi';               // 보고서 탭은 판 전체(오른쪽 지도 칸 없음 — 시안 A)
  const picks = h('div.rp-picks', { role: 'group', 'aria-label': '넣을 결과' });
  const ledSel = h('select.t-input.rp-sel', { 'aria-label': '대장 고르기' });
  const emdSel = h('select.t-input.rp-sel', { 'aria-label': '범위' });
  const bH = h('button.t-btn', { type: 'button', text: '한글 문서 내려받기' });
  const bX = h('button.t-btn.t-btn--2', { type: 'button', text: '엑셀로 내려받기' });
  const bZ = h('button.t-btn.t-btn--2.rp-zip', { type: 'button', text: '첨부 묶음 받기', title: '한글 문서 · 엑셀 · 지도 그림을 한 번에(.zip)' });
  const doc = h('article.rp-doc', { 'aria-label': '보고서 미리 보기', 'aria-live': 'polite' });
  const list = h('div.rp-list-b');
  const pick = h('section.rp-pick', { 'aria-label': '넣을 결과 고르기' },
    h('h2.rp-h', { text: '넣을 결과' }), h('p.rp-help', { text: '하나만 골라도, 여러 시점을 골라도 됩니다.' }), picks,
    h('p.rp-grp', { text: '대장(넣지 않아도 됩니다)' }), ledSel,
    h('p.rp-grp', { text: '범위' }), emdSel,
    h('div.rp-btns', {}, bH, bX, bZ), h('p.rp-help', {}, '첨부 묶음은 한글 · 엑셀 ·', h('br'), '지도 그림을 한 번에 받습니다.'));
  const root = h('div.rp', {},
    h('div.rp-grid', {}, pick, doc),
    h('section.rp-list', { 'aria-label': '발급 목록' }, h('h2.rp-h', { text: '발급 목록' }),
      h('p.rp-help', {}, '내려받은 보고서는 여기에 남습니다.', h('br'), '같은 고르기로 다시 받을 수 있습니다.'), list));
  pane.replaceChildren(root);

  const wait = (t) => doc.replaceChildren(h('p.gr-wait', { role: 'status', text: t }));
  const lockDl = (on) => { bH.disabled = on; bX.disabled = on; bZ.disabled = on; };

  /* 처음 — 고를 것(결과 · 대장 · 발급 목록)을 한 번에 */
  async function boot() {
    wait('');   // 첫인상-3: 칸 글 대신 가운데 하나(during)
    let j;
    try { j = await during(api('/spaces/me/report/pick')); }
    catch (e) { devlog('report pick', e.message); if (e.status === 401 || e.status === 403) return onAuth?.(); doc.replaceChildren(h('p.gr-err', { role: 'status', text: '불러오지 못했습니다' })); return; }
    S.avail = j.services || [];
    if (!S.avail.length) { doc.replaceChildren(h('p.gr-err', { role: 'status', text: '아직 보고서로 만들 결과가 없습니다' })); lockDl(true); return; }
    S.picks = new Set([S.avail.some((s) => s.card === svc) ? svc : S.avail[0].card]);
    paintPicks();
    ledSel.replaceChildren(h('option', { value: '', text: '넣지 않음' }),
      ...(j.ledgers || []).filter((g) => g.items.length).map((g) => h('optgroup', { label: g.label }, ...g.items.slice(0, 20).map((x) => h('option', { value: x.import_id, text: `${x.name} · ${dot(x.date)}` })))));
    paintIssues(j.issues || []);
    load();
  }

  function paintPicks() {
    picks.replaceChildren(...S.avail.map((s) => {
      const ck = h('input', { type: 'checkbox', value: s.card, checked: S.picks.has(s.card) });
      ck.addEventListener('change', () => {
        if (ck.checked) S.picks.add(s.card); else S.picks.delete(s.card);
        lab.classList.toggle('on', ck.checked);
        load();
      });
      const lab = h('label.rp-ck', { class: S.picks.has(s.card) ? 'on' : '' }, ck,
        h('span.rp-ck-t', {}, h('b', { text: s.name }), h('small', { text: [s.shot, s.analyzed ? `분석 ${dot(s.analyzed)}` : null].filter(Boolean).join(' · ') })));
      return lab;
    }));
  }

  const q = () => {
    const o = { cards: [...S.picks].join(',') };
    if (S.emd) o.emd = S.emd;
    if (S.led) o.import_id = S.led;
    return new URLSearchParams(o);
  };

  /* 고르는 순간 — 보고서를 다시 채운다(늦게 온 옛 응답은 버린다) */
  async function load() {
    const my = ++S.seq;
    if (!S.picks.size) { S.data = null; lockDl(true); doc.replaceChildren(h('p.gr-wait', { role: 'status', text: '넣을 결과를 하나 이상 골라 주세요' })); return; }
    const slow = setTimeout(() => { if (my === S.seq) doc.classList.add('is-busy'); }, 250);
    let d;
    try { d = await api('/spaces/me/report/multi?' + q()); }
    catch (e) {
      clearTimeout(slow); doc.classList.remove('is-busy');
      if (my !== S.seq) return;
      devlog('report multi', e.message);
      if (e.status === 401 || e.status === 403) return onAuth?.();
      if (e.status === 404 && S.emd) { S.emd = ''; return load(); }          // 고른 읍면동에 고른 결과가 없으면 관할 전체로
      doc.replaceChildren(h('p.gr-err', { role: 'status', text: '불러오지 못했습니다' })); return;
    }
    clearTimeout(slow); doc.classList.remove('is-busy');
    if (my !== S.seq) return;
    S.data = d; lockDl(false);
    emdSel.replaceChildren(h('option', { value: '', text: `${d.place || '관할'} 전체` }), ...(d.emds || []).map((x) => h('option', { value: x, text: x })));
    emdSel.value = S.emd;
    paint(d);
  }

  function paint(d) {
    const P = d.picked || [];
    const one = P.length === 1;
    const title = `${d.region} ${P.map((s) => s.short).join(' · ')} 결과`;
    const meta = [P.map((s) => s.short).join(' · '), d.emd || `${d.place || '관할'} 전체`, `만든 날 ${d.made}`].join(' · ');
    const art = h('div.gr-rdoc', { dataset: { metric: 'AI 분석 결과', v: one ? String(val(P[0].total) ?? '') : '' } },
      h('p.gr-rdoc-k', { text: 'AI 분석 결과 보고서' }), h('h2.gr-rdoc-t', { text: title }), h('p.gr-rdoc-m', { text: meta }));
    /* 대시보드(영농-6 · 원칙 299) — 큰 숫자 · 종류별 도넛 · 읍면동별 막대 · 시점 비교 선(둘 이상) · 곤포 생산량(값 있을 때만). XI ChatGEO 보고서 보기와 같은 칸 부품 */
    const byDate = [...P].sort((x, y) => String(x.analyzed || '').localeCompare(String(y.analyzed || '')));
    const L = byDate[byDate.length - 1];
    const sameUnit = P.every((s) => s.unit === L.unit);
    const kpis = [{ label: one ? 'AI 분석 결과' : `AI 분석 결과 · ${L.short}`, value: val(L.total), unit: L.unit },
      { label: '넓이', value: val(L.area_ha), unit: 'ha', d: 1 },
      ...(val(L.acc) != null ? [{ label: 'AI 모델 정확도', value: val(L.acc), unit: '%', d: 1 }] : []),
      ...(d.ledger ? [{ label: '올린 대장 필지', value: val(d.ledger.parcels), unit: '필지' }] : [])];
    const holder = h('div.rp-dash', { dataset: { metric: 'AI 분석 결과', v: String(val(L.total) ?? '') } });
    art.append(holder);
    farmDash({
      kpis, classes: L.classes.map((c) => ({ label: c.name, v: val(c.n) })), classTitle: `종류별${one ? '' : ` · ${L.short}`}`, classUnit: L.unit,
      emds: (L.emd_rows || []).map((r) => ({ label: r.emd, v: r.n, k: r.emd })), emdTitle: `읍면동별${one ? '' : ` · ${L.short}`}`, emdUnit: L.unit,
      trend: !one && sameUnit ? byDate.filter((s) => s.analyzed).map((s) => ({ t: dot(s.analyzed).slice(2), v: val(s.total) })) : [], trendTitle: '시점 비교', trendUnit: L.unit,
      yields: L.classes.filter((c) => val(c.yield)).map((c) => ({ label: `${c.name} 생산량`, value: val(c.yield), unit: 'kg', sub: `${nf(val(c.n))}개` })),
      onEmd: d.emd ? null : (k) => { if ((d.emds || []).includes(k)) { S.emd = k; emdSel.value = k; load(); } },
    }).then((el) => { if (holder.isConnected) holder.replaceChildren(el); }).catch((e) => devlog('farm dash', e.message));
    if (!one) {
      art.append(sec('시점 비교'), tbl(['결과', '분석한 날', 'AI 분석 결과', '넓이(ha)'], byDate.map((s) => [s.short, s.analyzed || '—', `${nf(val(s.total))}${s.unit}`, nf(val(s.area_ha), 1)]), [0, 1], null));
    }
    /* 지도 — 고른 결과마다(넷까지) */
    art.append(sec('지도'));
    const maps = h('div.rp-maps', { class: P.length > 1 ? 'two' : '' });
    for (const s of P.slice(0, MAPS)) {
      const fig = h('figure.gr-map-fig', {}, h('div.gr-map-img', { 'aria-label': `${s.short} 지도 그림` }), h('figcaption', { text: `${s.short} · 읍면동 경계 위 AI 분석 결과` }));
      maps.append(fig);
      drawMap(fig.firstChild, s.card, d.emd);
    }
    art.append(maps);
    /* 읍면동별 */
    /* 대장과 견준 결과 */
    if (d.ledger) art.append(...ledgerSec(d.ledger, P));
    art.append(h('p.rp-note', {}, 'AI 분석 결과는 참고자료입니다.', h('br'), '처분은 담당자가 정합니다.'));
    for (const u of S.imgs.splice(0)) URL.revokeObjectURL(u);
    doc.replaceChildren(art);
  }

  const sec = (t) => h('h3', {}, t, h('span.rp-auto', { text: '자동' }));
  const box = (label, text) => h('div.gr-ov-i', {}, h('small', { text: label }), h('b.rp-txt', { text }));
  function num(label, env, unit) {
    const v = val(env);
    return h('div.gr-ov-i', {}, h('small', { text: label }), h('b', { dataset: { metric: label, v: String(v ?? '') } }, h('span.num', { text: nf(v) }), h('i', { text: unit })));
  }
  /* 표 — cols: 머리 · rows: 칸 글 · left: 왼쪽 맞춤 칸 · last: 마지막 줄 class */
  function tbl(cols, rows, left = [0], last = null) {
    const L = new Set(left);
    return h('div.rp-tw', {}, h('table.gr-rtb', {}, h('thead', {}, h('tr', {}, ...cols.map((c, i) => h(L.has(i) ? 'th' : 'th.n', { text: c })))),
      h('tbody', {}, ...rows.map((r, ri) => h('tr', { class: last && ri === rows.length - 1 ? last : '' }, ...r.map((c, i) => h(L.has(i) ? 'td' : 'td.n', { text: c })))))));
  }
  function ledgerSec(L, P) {
    const one = P.length === 1, lb = L.labels || {};
    const cmp = h('div.gr-cmp');
    cmp.append(h('div', {}, h('small', { text: '올린 대장' }), h('b.gr-cmp-n', { text: `${L.name} · ${nf(val(L.parcels))}필지` })));
    if (!val(L.parcels)) return [sec('대장과 견준 결과'), h('p.gr-rdoc-p', { text: `${L.name}에는 이 범위의 필지가 없습니다.` })];
    const card = (label, env, metric) => h('div', {}, h('small', { text: label }), h('b', { dataset: { metric: metric || label, v: String(val(env) ?? '') } }, h('span.num', { text: nf(val(env)) }), h('i', { text: '필지' })));
    if (one) {
      cmp.append(card(lb.found || 'AI 결과가 있는 필지', L.per[0].found), card(lb.missing || 'AI 결과가 없는 필지', L.per[0].missing));
      for (const x of (L.lines || []).filter((x) => val(x.n))) cmp.append(card(x.short || x.label, x.n, x.label));
    } else {
      cmp.append(card(lb.all || '고른 결과 모두 있음', L.all), card(lb.some || '하나 이상 없음', L.some));
      for (const x of L.per) cmp.append(card(`${x.short} AI 결과 없음`, x.missing));
    }
    return [sec('대장과 견준 결과'), cmp, h('p.gr-rdoc-p', {}, '필지 목록(지번)은 ', h('a.gr-a', { href: fusionHref(), text: '행정정보와 비교' }), '에서 봅니다.')];
  }

  async function drawMap(el, card, emd) {
    el.dataset.state = 'loading';
    try {
      const r = await api('/spaces/me/report/map.png?' + new URLSearchParams({ card, ...(emd ? { emd } : {}) }), { raw: true });
      if (!r.ok) throw Object.assign(new Error('http ' + r.status), { status: r.status });
      const u = URL.createObjectURL(await r.blob()); S.imgs.push(u);
      el.replaceChildren(h('img', { src: u, alt: '읍면동 경계 위 AI 분석 결과 지도 그림' }));
      el.dataset.state = 'on';
    } catch (e) { devlog('report map', e.message); el.dataset.state = 'none'; el.replaceChildren(h('p.gr-err', { text: e.status === 404 ? '이 범위에는 이 결과가 없습니다' : '지도 그림을 불러오지 못했습니다' })); }
  }

  /* 내려받기 — 한글 문서 · 엑셀(같은 고르기) → 발급 목록에 한 줄(같은 사람 · 같은 고르기면 횟수만 늘어남) */
  async function download(fmt, qs = q()) {
    lockDl(true);
    try {
      const r = await api(fmt === 'zip' ? '/spaces/me/report/bundle.zip?' + qs : `/spaces/me/report/multi.${fmt}?` + qs, { raw: true });
      if (!r.ok) throw Object.assign(new Error('http ' + r.status), { status: r.status });
      const m = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get('content-disposition') || '');
      const name = m ? decodeURIComponent(m[1]) : `AI분석결과보고서.${fmt}`;
      const u = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      toast('내려받았습니다');
      api('/spaces/me/report/issues').then((j) => paintIssues(j.items || [])).catch(() => {});
    } catch (e) { devlog('report dl', e.message); if (e.status === 401 || e.status === 403) return onAuth?.(); toast('내려받지 못했습니다'); }
    finally { lockDl(!S.data); }
  }

  function paintIssues(items) {
    if (!items.length) { list.replaceChildren(h('p.rp-none', { text: '아직 내려받은 보고서가 없습니다' })); return; }
    const row = (x) => {
      const again = h('button.t-btn.t-btn--2.rp-sm', { type: 'button', text: '다시 받기' });
      again.addEventListener('click', async () => {
        const known = x.cards.filter((c) => S.avail.some((s) => s.card === c));
        if (!known.length) { toast('이 결과는 지금 받을 수 없습니다'); return; }
        S.picks = new Set(known); S.emd = x.emd || ''; S.led = x.import_id || '';
        ledSel.value = S.led; paintPicks(); await load();
        await download(x.fmt === 'xlsx' ? 'xlsx' : x.fmt === 'zip' ? 'zip' : 'hwpx');
      });
      return h('tr', {}, h('td.num', { text: `${dot(x.at)} ${hm(x.at)}` }), h('td', { text: x.title || '—' }), h('td', { text: x.who }),
        h('td.n', { text: `${nf(val(x.downloads))}회` }), h('td.rp-act', {}, again));
    };
    list.replaceChildren(h('div.rp-tw', {}, h('table.gr-rtb.rp-iss', {}, h('thead', {}, h('tr', {}, h('th', { text: '발급 일시' }), h('th', { text: '넣은 결과' }),
      h('th', { text: '요청자' }), h('th.n', { text: '내려받은 횟수' }), h('th', { text: '' }))), h('tbody', {}, ...items.slice(0, 12).map(row)))));
  }

  ledSel.addEventListener('change', () => { S.led = ledSel.value; load(); });
  emdSel.addEventListener('change', () => { S.emd = emdSel.value; load(); });
  bH.addEventListener('click', () => download('hwpx'));
  bX.addEventListener('click', () => download('xlsx'));
  bZ.addEventListener('click', () => download('zip'));
  boot();
  return { reload: load };
}
