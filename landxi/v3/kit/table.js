/* K12 table.js — 표(데이터 잉크). 헤어라인 행 · 숫자 Inter tabular · 정렬 1열 · 행 ≤ 20 + `더 보기`.
   table(el, { cols: [{ key, label, num?, fmt?(v,row) → html, width? }], rows, sort: 'key', dir: 'desc', limit: 20, onRow(row) })
   → { set(rows) } · 값이 봉투면 numHtml(숫자 + 신뢰 기호)로 그린다. */
import { esc, isEnvelope } from './util.js';
import { numHtml } from './bignum.js';
import { t, nf } from './i18n.js';

const val = (v) => (isEnvelope(v) ? v.value : v);

export function table(el, { cols, rows = [], sort, dir = 'desc', limit = 20, onRow, caption } = {}) {
  el.classList.add('k-table-w');
  let shown = limit, data = rows, s = { key: sort, dir };
  const draw = () => {
    const sorted = s.key ? [...data].sort((a, b) => { const x = val(a[s.key]), y = val(b[s.key]); const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'ko'); return s.dir === 'asc' ? c : -c; }) : data;
    const vis = sorted.slice(0, shown);
    el.innerHTML = `<table class="k-table">${caption ? `<caption class="t-label">${esc(caption)}</caption>` : ''}<thead><tr>${cols.map((c) => {
      const on = c.key === sort;
      const arrow = on && s.key === c.key ? (s.dir === 'asc' ? '↑' : '↓') : '';
      return `<th scope="col" class="${c.num ? 'num' : ''}"${c.width ? ` style="width:${esc(c.width)}"` : ''}>${on ? `<button type="button" class="k-th-s" data-k="${esc(c.key)}">${esc(c.label)}<i>${arrow}</i></button>` : esc(c.label)}</th>`;
    }).join('')}</tr></thead><tbody>${vis.map((r, i) => `<tr data-i="${i}"${onRow ? ' tabindex="0"' : ''}>${cols.map((c) => {
      const v = r[c.key];
      const html = c.fmt ? c.fmt(v, r) : isEnvelope(v) ? numHtml(v) : c.num ? esc(nf(v)) : esc(v ?? '—');
      return `<td class="${c.num ? 'num' : ''}">${html}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table>${sorted.length > shown ? `<button type="button" class="t-btn--text t-btn k-more">${esc(t('table.more'))}</button>` : ''}`;
    el._vis = vis;
  };
  el.addEventListener('click', (e) => {
    const sb = e.target.closest('.k-th-s'); if (sb) { s.dir = s.dir === 'asc' ? 'desc' : 'asc'; draw(); return; }
    if (e.target.closest('.k-more')) { shown += limit; draw(); return; }
    const tr = e.target.closest('tbody tr'); if (tr && onRow) onRow(el._vis[+tr.dataset.i]);
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest?.('tbody tr'); if (tr && onRow) onRow(el._vis[+tr.dataset.i]); } });
  draw();
  return { el, set(r) { data = r; shown = limit; draw(); } };
}
