export function initTabs(root) {
  const tabs = [...root.querySelectorAll('[role=tab]')];
  const select = (tab) => {
    tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls')); if (p) p.hidden = !on; });
    root.dispatchEvent(new CustomEvent('tabchange', { detail: { id: tab.id, controls: tab.getAttribute('aria-controls') }, bubbles: true }));
  };
  tabs.forEach(t => { t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => { const i = tabs.indexOf(t); if (e.key === 'ArrowRight') { tabs[(i + 1) % tabs.length].focus(); select(tabs[(i + 1) % tabs.length]); } if (e.key === 'ArrowLeft') { tabs[(i - 1 + tabs.length) % tabs.length].focus(); select(tabs[(i - 1 + tabs.length) % tabs.length]); } }); });
  const initial = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0]; if (initial) select(initial);
  return { select: (id) => select(tabs.find(t => t.id === id)) };
}
