export function createDrawer({ side = 'right', width = 392, height = 280, host = document.body } = {}) {
  const el = document.createElement('aside'); el.className = `drawer drawer--${side}`; el.dataset.open = 'false';
  el.style.setProperty('--w', width + 'px'); el.style.setProperty('--h', height + 'px');
  el.innerHTML = `<div class="drawer__body"></div>`; host.append(el);
  const api = { el, open(html) { const b = el.querySelector('.drawer__body'); typeof html === 'string' ? (b.innerHTML = html) : (b.replaceChildren(html)); el.dataset.open = 'true'; return api; }, close() { el.dataset.open = 'false'; return api; }, toggle() { el.dataset.open = el.dataset.open === 'true' ? 'false' : 'true'; return api; } };
  return api;
}
