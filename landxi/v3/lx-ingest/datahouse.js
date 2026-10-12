/* datahouse.js — 데이터하우스 '학습 데이터' 탭(결정 2 ⓐ · 원칙 205 · 217 · 10-12 12:45 확인).
   클래스별(클래스 한 곳 · 올린 학습 데이터 n장 · XI맵에서 고친 것 n건 · 쓰는 서비스) · 고친 것(최근 순) · 승인 대기(새 클래스).
   관리 단추(승인 · 합치기 · 거절)는 LX 관리자만(서버 can_decide). 숫자는 서버 봉투(GET /datahouse/classes · /datahouse/edits) — 지어낸 값 0.
   학습 데이터 1장이 되는 때(결정 3)는 아직 결정 전이라 고친 것은 '고친 것 n건'으로만 센다(서버 core.UNIT 한 곳). 아이콘 0. */
import { h, api } from '../kit/util.js';
import { toast } from '../kit/toast.js';
import { nf } from '../kit/i18n.js';

const v = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const md = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()}`; };
const mdhm = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${md(s)} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const TEST = new URLSearchParams(location.search).get('test') === '1';

export function mountDatahouse(host) {
  if (!document.querySelector('link[data-dh]')) document.head.append(h('link', { rel: 'stylesheet', href: new URL('./datahouse.css', import.meta.url).href, dataset: { dh: '1' } }));
  const pane = h('div.dh-pane');
  const col = h('div.dh-col');
  pane.append(col);
  host.append(pane);
  let D = null, view = 'cls', pickCls = null;

  async function load() {
    col.replaceChildren(h('p.dh-wait', { text: '불러오는 중' }));
    try { D = await api('/datahouse/classes'); } catch (e) { col.replaceChildren(h('p.dh-wait', { text: e?.message || '학습 데이터를 불러오지 못했습니다' })); return; }
    draw();
  }
  function seg() {
    const nP = v(D.pending) || 0;
    const items = [['cls', '클래스별', null], ['edits', '고친 것', v(D.edits)], ['wait', '승인 대기', nP]];
    return h('div.dh-seg', { role: 'tablist', 'aria-label': '학습 데이터 보기' }, ...items.map(([k, t, n]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(view === k), onclick: () => { view = k; pickCls = null; draw(); } }, t, n ? h('b.num', { text: nf(n) }) : null)));
  }
  function draw() {
    const head = h('header.dh-h', {},
      h('div', {}, h('h1', { text: '학습 데이터' }),
        h('p', { text: `XI맵에서 고친 것 ${nf(v(D.edits))}건 · 승인 대기 클래스 ${nf(v(D.pending))}개` })), seg());
    const body = view === 'cls' ? classes() : view === 'edits' ? editsBox(null) : waiting();
    col.replaceChildren(h('section.dh-card', {}, head, body));
  }

  /* ── 클래스별 ── */
  function classes() {
    const rows = [...D.items].filter((x) => x.status === 'approved')
      .sort((a, b) => (v(b.samples) + v(b.edits)) - (v(a.samples) + v(a.edits)) || a.name.localeCompare(b.name, 'ko'));
    const tb = h('table.dh-tbl', {},
      h('thead', {}, h('tr', {}, ...[['클래스', ''], ['구분', ''], ['올린 학습 데이터', 'num'], ['XI맵에서 고친 것', 'num'], ['쓰는 서비스', ''], ['AI 모델', 'num']].map(([t, c]) => h('th', { class: c, text: t })))),
      h('tbody', {}, ...rows.map((x) => h('tr', { class: pickCls === x.id ? 'is-on' : '', tabindex: '0', onclick: () => { pickCls = pickCls === x.id ? null : x.id; draw(); },
        onkeydown: (e) => { if (e.key === 'Enter') { pickCls = pickCls === x.id ? null : x.id; draw(); } } },
      h('td', {}, h('b', { text: x.name })),
      h('td.dh-sub', { text: x.parent ? `세부 · ${x.parent.name}` : '' }),
      h('td.num', { text: v(x.samples) ? `${nf(v(x.samples))}장` : '—' }),
      h('td.num', {}, v(x.edits) ? `${nf(v(x.edits))}건` : '—', v(x.edits_pending) ? h('small', { text: `승인 대기 ${nf(v(x.edits_pending))}` }) : null),
      h('td', { text: x.services.map((s) => `${s.name}${s.state === 'learning' ? ' · 배우는 중' : ''}`).join(' · ') || '—' }),
      h('td.num', { text: v(x.models) ? nf(v(x.models)) : '—' })))));
    const out = h('div', {}, h('div.dh-tbl-w', {}, tb));
    if (pickCls) { const x = D.items.find((y) => y.id === pickCls); out.append(h('h2.dh-h2', { text: `${x?.name || ''} · 고친 것` }), editsBox(pickCls)); }
    out.append(h('p.dh-foot', { text: '올린 학습 데이터 = 프로젝트에서 올린 묶음 중 이 클래스가 든 그림 · XI맵에서 고친 것 = 되돌린 것 · 승인 전 클래스 뺌' }));
    return out;
  }

  /* ── 고친 것 ── */
  function editsBox(cls) {
    const box = h('div.dh-edits', {}, h('p.dh-wait', { text: '불러오는 중' }));
    api('/datahouse/edits?' + new URLSearchParams({ ...(cls ? { cls } : {}), limit: '50', ...(TEST ? { test: '1' } : {}) })).then((j) => {
      const it = j.items || [];
      if (!it.length) { box.replaceChildren(h('p.dh-empty', { text: 'XI맵에서 고친 것이 아직 없습니다 · 객체를 눌러 고치면 여기에 쌓입니다' })); return; }
      box.replaceChildren(h('ul.dh-list', {}, ...it.map((x) => h('li', {},
        h('span.num.dh-t', { text: mdhm(x.at) }),
        h('span', {}, h('b', { text: x.action }), x.after && x.before && x.after !== x.before ? ` ${x.before} → ${x.after}` : x.after ? ` ${x.after}` : x.before ? ` ${x.before}` : ''),
        h('span.dh-sub', { text: [x.service, x.region, x.who].filter(Boolean).join(' · ') }),
        x.pending ? h('span.dh-tag', { text: '승인 대기' }) : null, x.test ? h('span.dh-tag.is-test', { text: '시험' }) : null))));
    }).catch(() => box.replaceChildren(h('p.dh-empty', { text: '고친 것을 불러오지 못했습니다' })));
    return box;
  }

  /* ── 승인 대기(새 클래스) ── */
  function waiting() {
    const rows = D.items.filter((x) => x.status === 'proposed');
    if (!rows.length) return h('p.dh-empty', { text: '승인 대기 클래스가 없습니다 · XI맵 그 자리 고치기에서 새 클래스를 더하면 여기에 올라옵니다' });
    const ok = D.items.filter((x) => x.status === 'approved');
    return h('ul.dh-wl', {}, ...rows.map((x) => {
      const act = h('div.dh-act');
      if (D.can_decide) {
        const sel = h('select.dh-in', { 'aria-label': '합칠 클래스' }, h('option', { value: '', text: '같은 뜻의 클래스' }),
          ...ok.map((c) => h('option', { value: c.id, text: c.parent ? `${c.name} (${c.parent.name} 세부)` : c.name })));
        const merge = h('button.t-btn.t-btn--2', { type: 'button', text: '합치기', onclick: () => { if (!sel.value) { sel.focus(); toast('합칠 클래스를 고르세요'); return; } decide(x, 'merge', sel.value); } });
        act.append(h('button.t-btn', { type: 'button', text: '승인', onclick: () => decide(x, 'approve') }), sel, merge,
          h('button.t-btn.t-btn--2', { type: 'button', text: '거절', onclick: () => decide(x, 'reject') }));
      } else act.append(h('span.dh-sub', { text: 'LX 관리자가 승인 · 합치기 · 거절합니다' }));
      return h('li', {},
        h('div', {}, h('b', { text: x.name }), x.test ? h('span.dh-tag.is-test', { text: '시험' }) : null,
          h('p.dh-sub', { text: [x.parent ? `세부 · 위 클래스 ${x.parent.name} → 나누기 학습` : '새 물체 → 새 모델 프로젝트 후보', x.by, md(x.at), v(x.edits_pending) ? `고친 것 ${nf(v(x.edits_pending))}건` : null].filter(Boolean).join(' · ') })),
        act);
    }));
  }
  async function decide(x, action, into) {
    try {
      await api(`/classes/${encodeURIComponent(x.id)}/decide`, { method: 'POST', body: { action, into } });
      toast(action === 'approve' ? `'${x.name}' 클래스를 승인했습니다` : action === 'merge' ? `'${x.name}'을(를) 합쳤습니다` : `'${x.name}' 클래스를 거절했습니다`);
      load();
    } catch (e) { toast(e?.message || '처리하지 못했습니다'); }
  }

  load();
  return { pane, reload: load };
}
