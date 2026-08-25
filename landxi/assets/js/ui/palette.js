import { icon } from './icon.js';
export function initPalette({ sources, onPlace }) {
  const d = document.createElement('dialog'); d.className = 'palette';
  d.innerHTML = `<div class="palette__box">${icon('search', 18)}<input class="palette__input" placeholder="프로젝트, 카드, 사용자, 공지, 주소·지번 검색" aria-label="검색"><kbd>Esc</kbd></div><ul class="palette__list" role="listbox"></ul>`;
  document.body.append(d);
  const input = d.querySelector('input'), list = d.querySelector('ul'); let items = [], cur = 0;
  const TYPE = { project: '프로젝트', card: '카드', user: '사용자', notice: '공지', place: '장소' };
  function render() { const q = input.value.trim().toLowerCase(); items = sources().filter(i => !q || (i.label + ' ' + (i.sub || '')).toLowerCase().includes(q)).slice(0, 8); cur = 0;
    list.innerHTML = items.map((i, k) => `<li class="palette__item" role="option" data-type="${i.type}" aria-selected="${k === cur}"><span class="palette__type">${TYPE[i.type]}</span><b>${i.label}</b><small>${i.sub || ''}</small></li>`).join('') || `<li class="palette__empty">결과가 없습니다. 다른 이름이나 주소로 검색해 보세요.</li>`; }
  function go(i) { if (!i) return; d.close(); i.type === 'place' ? onPlace?.(i) : (location.href = i.href); }
  input.addEventListener('input', render);
  input.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { cur = Math.min(cur + 1, items.length - 1); } else if (e.key === 'ArrowUp') { cur = Math.max(cur - 1, 0); } else if (e.key === 'Enter') { return go(items[cur]); } else return; e.preventDefault(); [...list.children].forEach((li, k) => li.setAttribute('aria-selected', k === cur)); });
  list.addEventListener('click', e => { const li = e.target.closest('.palette__item'); if (li) go(items[[...list.children].indexOf(li)]); });
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  const open = () => { if (d.open) return; input.value = ''; render(); d.showModal(); input.focus(); };
  document.addEventListener('keydown', e => { if (e.key === '/' && !/input|textarea/i.test(e.target.tagName)) { e.preventDefault(); open(); } });
  document.querySelectorAll('[data-palette]').forEach(b => b.addEventListener('click', open));
  return { open };
}
