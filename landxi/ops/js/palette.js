/* ⌘K 팔레트(Linear 밀도) — 노드 · 기관 · 배포본 · 화면 검색 → 해당 화면으로. 키보드만으로 끝난다. */
import { h, get, t } from './boot.js';

let items = null;
async function load() {
  if (items) return items;
  const [nodes, tenants, deploys] = await Promise.all([get('nodes'), get('tenants'), get('deploys')]);
  items = [
    ...['index', 'infra', 'tenants', 'deploys'].map((p) => ({ k: '화면', label: t('rail.' + p), sub: p + '.html', href: `/landxi/ops/${p}.html` })),
    ...(nodes?.items || []).map((n) => ({ k: '노드', label: n.id, sub: n.state === 'pending' ? '등록 대기' : (n.cpu || ''), href: `/landxi/ops/infra.html#${n.id}` })),
    ...(tenants?.items || []).map((x) => ({ k: '기관', label: x.name?.ko || x.id, sub: x.id, href: `/landxi/ops/tenants.html?t=${x.id}` })),
    ...(deploys?.items || []).map((d) => ({ k: '배포본', label: d.id, sub: `${d.name} · ${d.stage}`, href: `/landxi/ops/deploys.html?d=${d.id}` })),
  ];
  return items;
}
export function mountPalette() {
  let open = null;
  const show = async () => {
    if (open) return; const all = await load();
    const input = h('input', { type: 'search', placeholder: '노드 · 기관 · 배포본 · 화면', 'aria-label': '명령 팔레트 검색', autocomplete: 'off' });
    const list = h('ul', { role: 'listbox' }); let sel = 0; let shown = all;
    const render = () => {
      const q = input.value.trim().toLowerCase();
      shown = all.filter((x) => !q || (x.label + ' ' + x.sub + ' ' + x.k).toLowerCase().includes(q)).slice(0, 12);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.replaceChildren(...shown.map((x, i) => h('li', { role: 'option', 'aria-selected': i === sel ? 'true' : 'false', onclick: () => go(x) }, h('b', {}, x.label), x.sub, h('span', {}, x.k))));
    };
    const go = (x) => { close(); location.href = x.href; };
    const close = () => { open?.remove(); open = null; };
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[sel]) go(shown[sel]);
      else if (e.key === 'Escape') close();
    });
    open = h('div', { class: 'og-pal-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': '명령 팔레트', onclick: (e) => { if (e.target === open) close(); } }, h('div', { class: 'og-pal' }, input, list));
    document.body.append(open); render(); input.focus();
  };
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open ? (open.remove(), open = null) : show(); } });
  document.querySelectorAll('[data-palette]').forEach((b) => b.addEventListener('click', show));
}
