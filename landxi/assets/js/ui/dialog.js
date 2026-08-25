import { icon } from './icon.js';
export function openDialog({ title = '', body = '', size = 'md', actions = [], onClose } = {}) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = `dialog dialog--${size}`;
    d.innerHTML = `<form method="dialog" class="dialog__form"><header class="dialog__head"><h3 class="dialog__title"></h3><button type="button" class="icon-btn dialog__close" aria-label="닫기">${icon('close', 16)}</button></header><div class="dialog__body"></div><footer class="dialog__foot"></footer></form>`;
    d.querySelector('.dialog__title').textContent = title;
    const b = d.querySelector('.dialog__body'); typeof body === 'string' ? (b.innerHTML = body) : b.append(body);
    const f = d.querySelector('.dialog__foot');
    actions.forEach(a => { const btn = document.createElement('button'); btn.type = 'button'; btn.className = `btn btn--${a.kind || (a.primary ? 'primary' : 'secondary')}`; btn.textContent = a.label; btn.dataset.value = String(a.value); btn.addEventListener('click', () => finish(a.value)); f.append(btn); });
    if (!actions.length) f.hidden = true;
    const finish = (v) => { d.close(); d.remove(); onClose?.(v); resolve(v); };
    d.querySelector('.dialog__close').addEventListener('click', () => finish(null));
    d.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    d.addEventListener('click', e => { if (e.target === d) finish(null); });
    document.body.append(d); d.showModal(); (f.querySelector('.btn--primary') || d.querySelector('.dialog__close')).focus();
  });
}
function toast(message, { type = 'info', ms = 2600 } = {}) {
  let host = document.querySelector('.toast-host'); if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.append(host); }
  const t = document.createElement('div'); t.className = `toast toast--${type}`; t.setAttribute('role', 'status'); t.textContent = message; host.append(t);
  setTimeout(() => { t.classList.add('toast--out'); setTimeout(() => t.remove(), 250); }, ms);
}
export const NotifyUI = {
  alert: (m, title = '알림') => openDialog({ title, body: `<p>${m}</p>`, size: 'sm', actions: [{ label: '확인', value: true, primary: true }] }),
  confirm: (m, title = '확인') => openDialog({ title, body: `<p>${m}</p>`, size: 'sm', actions: [{ label: '취소', value: false }, { label: '확인', value: true, primary: true }] }).then(v => v === true),
  toast, info: m => toast(m, { type: 'info' }), success: m => toast(m, { type: 'success' }), warn: m => toast(m, { type: 'warn' }), error: m => toast(m, { type: 'error' }),
};
window.NotifyUI = NotifyUI; window.openDialog = openDialog;
