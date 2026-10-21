/* 보고서 탭 '필지 전이' 블록(10-21 원칙 300 · 영농-5 해 바뀜 비교) — 같은 종류 이름을 쓰는 결과를 둘 이상 고르면 보고서 미리 보기에 저절로 붙는다.
   표 = 이전 결과 종류 × 나중 결과 종류(필지 · 넓이) · 바뀐 필지(넓은 순 10). 한글 문서 · 엑셀에도 같은 표(서버 farm_more · 같은 값).
   결과 하나 · 필지로 이어지지 않는 결과 · 같은 종류가 없는 결과 = 블록 없음(지어내지 않는다). 서버: GET /spaces/me/report/transitions?cards=&emd=
   보고서 화면(svc-report.js)은 고치지 않고, 미리 보기가 새로 그려질 때마다 고른 결과 · 범위를 읽어 붙인다. */
import { api, h } from '../kit/util.js';
import { devlog } from '../kit/index.js';

const nf = (v, d = 0) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const val = (e) => (e && typeof e === 'object' ? e.value : e);
const yr = (s) => { const m = /(19|20)\d{2}/.exec(String(s?.shot || '')) || /(19|20)\d{2}/.exec(String(s?.analyzed || '')); return m ? m[0] : ''; };

export function watchTransit(pane) {
  if (!pane) return;
  let seq = 0;
  const run = async (art) => {
    const my = ++seq;
    const cards = [...pane.querySelectorAll('.rp-picks input[type=checkbox]:checked')].map((x) => x.value);
    if (cards.length < 2) return;
    const emd = pane.querySelector('.rp-pick select[aria-label="범위"]')?.value || '';
    let j;
    try { j = await api('/spaces/me/report/transitions?' + new URLSearchParams({ cards: cards.join(','), ...(emd ? { emd } : {}) })); }
    catch (e) { devlog('transit', e.message); return; }
    if (my !== seq || !art.isConnected || !j?.transitions) return;
    const t = j.transitions;
    const A = `${t.from.short}${yr(t.from) ? ` ${yr(t.from)}` : ''}`, Z = `${t.to.short}${yr(t.to) ? ` ${yr(t.to)}` : ''}`;
    const tb = (head, rows, nums, total) => h('div.rp-tw', {}, h('table.gr-rtb', {}, h('thead', {}, h('tr', {}, ...head.map((x, i) => h(nums.includes(i) ? 'th.n' : 'th', { text: x })))),
      h('tbody', {}, ...rows.map((r, ri) => h('tr', { class: total && ri === rows.length - 1 ? 'tot' : '' }, ...r.map((x, i) => h(nums.includes(i) ? 'td.n' : 'td', { text: x })))))));
    const sum = t.rows.reduce((a, x) => a + (val(x.ha) || 0), 0);
    const block = h('section.sp-tr', { dataset: { metric: '필지 전이', v: String(val(t.changed) ?? '') } },
      h('h3', {}, '필지 전이', h('span.rp-auto', { text: '자동' })),
      h('p.sp-tr-k', {}, h('b', { text: `종류가 바뀐 필지 ${nf(val(t.changed))}필지` }), h('small', { text: `${A} → ${Z} · 필지 번호로 맞춤` })),
      tb([A, Z, '필지', '넓이(ha)'], [...t.rows.map((x) => [x.from, x.to, nf(val(x.n)), nf(val(x.ha), 2)]), ['합계', '', nf(val(t.parcels)), nf(sum, 2)]], [2, 3], true),
      t.top.length ? h('p.sp-tr-s', { text: '바뀐 필지(넓은 순 10)' }) : null,
      t.top.length ? tb(['소재지', '읍면동', '바뀜', '넓이(㎡)'], t.top.map((x) => [x.where, x.emd, `${x.from} → ${x.to}`, nf(val(x.area))]), [3]) : null);
    art.querySelector('.sp-tr')?.remove();
    const note = art.querySelector('.rp-note');
    if (note) note.before(block); else art.append(block);
  };
  new MutationObserver(() => {
    const art = pane.querySelector('.rp-doc .gr-rdoc');
    if (art && !art.dataset.spTr) { art.dataset.spTr = '1'; run(art); }
  }).observe(pane, { childList: true, subtree: true });
}
