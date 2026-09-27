/* K11 dropzone.js — 업로드 드롭존(.t-empty 변형). 확장자 allowlist · 20MB · 진행 막대 1.
   dropzone(el, { upload: { path: '/t/{tenant}/survey/registry/import', fields: { kind: 'farm' } } | undefined,
                  onFile(file) → Promise (upload 없을 때 화면이 직접 처리), onDone(json, file), onError(err, file) })
   upload 를 주면 XHR multipart(Bearer)로 게이트웨이에 보내고 진행 막대를 채운다. */
import { h, API, session } from './util.js';
import { t } from './i18n.js';

export const ALLOW = ['xlsx', 'csv', 'shp', 'zip', 'gpkg', 'geojson'];
export const MAX = 20 * 1024 * 1024;
const ext = (n) => (/\.([a-z0-9]+)$/i.exec(n || '') || [])[1]?.toLowerCase() || '';

export function dropzone(el, { upload, onFile, onDone, onError, allow = ALLOW, max = MAX } = {}) {
  el.classList.add('t-empty', 'k-drop');
  el.setAttribute('role', 'button'); el.tabIndex = 0;
  const input = h('input', { type: 'file', accept: allow.map((a) => '.' + a).join(','), hidden: true });
  const ico = h('span.k-drop-i', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 32 32"><path d="M16 21V7m0 0l-6 6m6-6l6 6M6 21v4h20v-4"/></svg>' });
  const title = h('h6', { text: t('drop.hint') });
  const kinds = h('p.k-drop-k', { text: t('drop.kinds') });
  const name = h('p.k-drop-n');
  const bar = h('div.t-progress.k-drop-p', { hidden: true, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: '0%' } }));
  el.innerHTML = ''; el.append(input, ico, h('div.k-drop-b', {}, title, kinds, name, bar));

  const prog = (p) => { bar.hidden = false; bar.firstChild.style.width = Math.round(p * 100) + '%'; bar.setAttribute('aria-valuenow', Math.round(p * 100)); };
  const warn = (msg) => { kinds.textContent = msg; kinds.classList.add('is-warn'); };
  const reset = () => { kinds.textContent = t('drop.kinds'); kinds.classList.remove('is-warn'); };

  async function take(file) {
    if (!file) return;
    reset(); name.textContent = file.name;
    if (!allow.includes(ext(file.name))) { warn(t('drop.kinds')); el.dataset.state = 'bad'; onError?.(Object.assign(new Error('ext'), { code: 'bad_ext' }), file); return; }
    if (file.size > max) { warn(t('drop.big')); el.dataset.state = 'bad'; onError?.(Object.assign(new Error('size'), { code: 'too_large' }), file); return; }
    el.dataset.state = 'busy'; prog(0);
    try {
      let out;
      if (upload) out = await xhr(upload, file, prog);
      else out = await onFile?.(file, prog);
      prog(1); el.dataset.state = 'done'; onDone?.(out, file);
    } catch (e) { el.dataset.state = 'bad'; bar.hidden = true; onError?.(e, file); }
  }
  input.addEventListener('change', () => take(input.files[0]));
  el.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('is-over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('is-over'); take(e.dataTransfer.files[0]); });
  return { el, take, reset: () => { reset(); name.textContent = ''; bar.hidden = true; delete el.dataset.state; } };
}

function xhr({ path, fields = {}, field = 'file' }, file, onProg) {
  return new Promise((res, rej) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append(field, file);
    const x = new XMLHttpRequest();
    x.open('POST', API.prefix + path);
    const s = session.get(); if (s) x.setRequestHeader('authorization', 'Bearer ' + s.token);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProg(e.loaded / e.total * 0.95); };
    x.onload = () => { let j = null; try { j = JSON.parse(x.responseText); } catch { /* */ } if (x.status >= 200 && x.status < 300) res(j); else rej(Object.assign(new Error((j && j.error && j.error.message) || 'upload'), { code: (j && j.error && j.error.code) || 'http_' + x.status, status: x.status })); };
    x.onerror = () => rej(Object.assign(new Error('network'), { code: 'network' }));
    x.send(fd);
  });
}
