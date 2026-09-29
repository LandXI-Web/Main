/* 배포 매트릭스 9×6 — 행 = 카드 9 · 열 = 기관 6 · 셀 = stage 색 + 버전 칩 · 빈 셀 점선 '+ 이식'(그 카드의 배포본이 한 곳이라도 있을 때).
 * 새 배포본(이식)은 S1 도착: 프레임 1250 → 스윕 1000 → 락온 380 → 글자 500. */
import { h, t, setText, SRC } from './boot.js';

export function matrix(host, { cards, tenants, onPick, onPort }) {
  const grid = h('div', { class: 'mx', role: 'grid', 'aria-label': '카드 × 기관 배포 매트릭스' }); host.append(grid);
  const cells = new Map(); let D = []; let sel = null;
  grid.append(h('div', { class: 'mx-h' }, '카드 \\ 기관'), ...tenants.map((x) => h('div', { class: 'mx-h', title: x.name?.ko }, t('tenant_short.' + x.id, x.id))));
  for (const c of cards) {
    grid.append(h('div', { class: 'mx-r', role: 'rowheader' }, h('b', { title: c.name }, c.name), h('span', {}, `${c.id.replace('card-', '')} · ${c.status}`)));
    for (const x of tenants) { const cell = h('div', { class: 'mx-c', role: 'gridcell', 'data-card': c.id, 'data-tenant': x.id }); grid.append(cell); cells.set(c.id + '|' + x.id, cell); }
  }
  const render = (opts = {}) => {
    for (const [k, cell] of cells) {
      const [cid, tid] = k.split('|'); const ds = D.filter((d) => d.card_id === cid && d.tenant_id === tid);
      const sig = ds.map((d) => d.id + d.stage + d.card_version_id).join(',') + (sel || '');
      if (cell.dataset.sig === sig && !opts.force) continue; cell.dataset.sig = sig;
      if (!ds.length) {
        const src = D.filter((d) => d.card_id === cid && d.card_version_id);
        const card = cards.find((c) => c.id === cid);
        cell.replaceChildren(src.length && card?.versions?.length ? h('button', { class: 'mx-port', type: 'button', 'data-port': k, title: `${cid} → ${tid} 다른 지역에 적용(같은 카드 버전으로 배포본 하나 더)`, onclick: () => onPort && onPort(cid, tid, src), 'aria-label': `${cid} → ${tid} 다른 지역에 적용` }, h('span', { class: 'pl' }, '+'), h('span', { class: 'tx' }, '적용')) : '');
        continue;
      }
      const row = h('div', { class: 'mx-stack', style: { display: 'flex', flexDirection: ds.length > 1 ? 'column' : 'row', gap: ds.length > 1 ? '2px' : '4px' } });
      const shown = ds.length > 2 ? [...ds.filter((d) => d.id === sel), ...ds.filter((d) => d.id !== sel)].slice(0, 2) : ds;
      for (const d of shown) {
        const b = h('button', { class: 'mx-cell', type: 'button', 'data-id': d.id, 'data-stage': d.stage, 'aria-pressed': d.id === sel ? 'true' : 'false', title: `${d.name} · ${d.id} · ${t('stage.' + d.stage, d.stage)}${d.basis === 'history' ? ' · 이력' : ''}`, onclick: () => onPick && onPick(d.id), style: { flex: '1 1 0', minWidth: 0 } },
          h('i'), h('span', { class: 'v', 'data-k': 'v' }, d.version || '—'), ds.length === 1 ? h('span', { class: 's' }, t('stage.' + d.stage, d.stage)) : null);
        row.append(b);
      }
      if (ds.length > shown.length) row.append(h('span', { class: 'mx-more og-num-s', title: ds.slice(2).map((d) => d.id).join(' · ') }, `+${ds.length - shown.length} 배포본`));
      cell.replaceChildren(row);
    }
  };
  return {
    el: grid,
    set(deploys, opts) { D = deploys; render(opts); },
    select(id) { sel = id; render({ force: true }); },
    cellOf(cid, tid) { return cells.get(cid + '|' + tid); },
    /** S1 도착 — 새 셀 위에 프레임 → 스윕 → 락온. 끝나면 Promise 해결(2.6s) */
    arrive(id) {
      const d = D.find((x) => x.id === id); if (!d) return Promise.resolve();
      const cell = cells.get(d.card_id + '|' + d.tenant_id); if (!cell) return Promise.resolve();
      cell.querySelectorAll('.mx-cell').forEach((b) => b.classList.add('is-hidden-until'));
      const fx = h('div', { class: 'mx-arrive', 'aria-hidden': 'true' }, h('div', { class: 'fr' }), h('div', { class: 'sw' }), h('div', { class: 'lk' })); cell.append(fx);
      return new Promise((res) => setTimeout(() => { fx.remove(); cell.querySelectorAll('.is-hidden-until').forEach((b) => b.classList.remove('is-hidden-until')); res(); }, 2900));
    },
  };
}
