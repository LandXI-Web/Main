/* K11 dropzone.js — 업로드 드롭존(.t-empty 변형). 확장자 allowlist · 20MB · 진행 막대 1.
   dropzone(el, { upload: { path: '/t/{tenant}/survey/registry/import', fields: { kind: 'farm' } } | undefined,
                  onFile(file) → Promise (upload 없을 때 화면이 직접 처리), onDone(json, file), onError(err, file) })
   upload 를 주면 XHR multipart(Bearer)로 게이트웨이에 보내고 진행 막대를 채운다.
   큰 파일 · 여러 파일(멈춤 · 이어 올리기 · 취소)은 아래 uploadQueue(조각 올리기). */
import { h, API, api, session } from './util.js';
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

/* ── 여러 파일 조각 올리기(확인 대장 1차 FR-1 · 6차 GF-2) ────────────────────────────────────────────
   끌어 놓기 · 여러 파일 · 파일마다 진행 막대 · 멈춤 · 이어 올리기 · 취소. 큰 파일은 조각으로(한 조각 ≈ 30초 · 바깥 주소 앞단의 요청 한 번 100초 한도 아래).
   끊기면 서버가 받은 자리부터 이어 간다(같은 파일을 다시 골라도). 같은 파일은 올리기 전에 빠른 지문(크기 + 앞 · 뒤 1MB)으로 알아본다.
   const q = uploadQueue(el, {
     base: '/requests/uploads',              // 조각 올리기 약속: POST base {filename, size, quick_fp, ...fields()} → {id, bytes, size, chunk:{size, max:{size}}}
     fields: () => ({ draft_id }),           //   PUT base/{id}?offset=N(본문 = 조각) → {bytes} · 자리가 어긋나면 409 {detail:{bytes}}
     allow: ['tif', 'jpg', …], max: bytes,   //   DELETE base/{id} = 취소 · POST base/{id}/finish = 끝
     title, kinds,                           // 놓는 칸 글(제목 · 형식 줄 — 문자열 하나 또는 줄마다 끊은 배열)
     onStart(json, item), onDone(item, json), onError(item, err), onChange(items) })
   → { el, items(), add(files), busy(), clear() } */
const UQ_CSS = `
.k-uq{display:flex;flex-direction:column;gap:8px}
.k-uq .k-drop{min-height:112px;padding:16px}
.k-uq .k-drop h6{margin:4px 0 0}
.k-uq-l{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.k-uq-l:empty{display:none}
.k-uq-r{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;align-items:center;padding:10px 12px;background:var(--bg-0);border-radius:var(--r-8)}
.k-uq-n{font:500 14px/20px var(--font-body);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.k-uq-a{display:flex;gap:4px;align-items:center}
.k-uq-a button{height:28px;padding:0 10px;border:1px solid var(--rule);border-radius:var(--r-8);background:var(--bg-1);font:500 12px/1 var(--font-body);color:var(--ink);cursor:pointer}
.k-uq-a button:hover{border-color:var(--ink)}
.k-uq-a button[hidden]{display:none}
.k-uq-a .x{width:28px;padding:0;color:var(--sub);display:inline-flex;align-items:center;justify-content:center}
.k-uq-r .t-progress{grid-column:1/-1}
.k-uq-s{grid-column:1/-1;margin:0;font:400 12px/18px var(--font-body);color:var(--sub)}
.k-uq-r[data-st="bad"] .k-uq-s{color:var(--warn)}
.k-uq-r[data-st="done"] .t-progress i{background:var(--ink)}
.k-uq-r[data-st="done"] .k-uq-s::before{content:"✓ ";color:var(--ai)}`;
function uqStyle() {
  if (document.getElementById('k-uq-css')) return;
  document.head.append(Object.assign(document.createElement('style'), { id: 'k-uq-css', textContent: UQ_CSS }));
}
const MBf = (n) => { const m = n / 1048576; return m >= 1024 ? `${(m / 1024).toFixed(1)}GB` : m >= 10 ? `${Math.round(m)}MB` : `${m.toFixed(1)}MB`; };
const leftWord = (s) => (s == null || !Number.isFinite(s) ? '' : s < 60 ? ` · 남은 시간 ${Math.max(1, Math.round(s))}초` : ` · 남은 시간 약 ${Math.round(s / 60)}분`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extOf = (n) => { const s = String(n || '').toLowerCase(); return s.endsWith('.aux.xml') ? 'aux.xml' : (/\.([a-z0-9]+)$/.exec(s) || [])[1] || ''; };

/** 빠른 지문 — sha256(크기 + ':' + 앞 1MB + 뒤 1MB). 서버가 다 받은 뒤 같은 식으로 다시 잰다. 안전한 연결이 아니면 null(서버 전체 지문만) */
export async function quickFingerprint(file) {
  if (!globalThis.crypto?.subtle) return null;
  const M = 1 << 20;
  const parts = [new TextEncoder().encode(`${file.size}:`), new Uint8Array(await file.slice(0, Math.min(M, file.size)).arrayBuffer())];
  if (file.size > M) parts.push(new Uint8Array(await file.slice(file.size - M).arrayBuffer()));
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  const d = await crypto.subtle.digest('SHA-256', all);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function uploadQueue(el, { base, fields = () => ({}), allow = null, max = Infinity, title = '파일을 끌어 놓거나 눌러 고르세요', kinds = '',
  onStart, onDone, onError, onChange } = {}) {
  uqStyle();
  el.classList.add('k-uq');
  const input = h('input', { type: 'file', multiple: true, hidden: true, ...(allow ? { accept: allow.map((a) => '.' + a).join(',') } : {}) });
  const zone = h('div.t-empty.k-drop', { role: 'button', tabindex: '0', 'aria-label': title },
    h('span.k-drop-i', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 32 32"><path d="M16 21V7m0 0l-6 6m6-6l6 6M6 21v4h20v-4"/></svg>' }),
    h('div.k-drop-b', {}, h('h6', { text: title }), ...[].concat(kinds || []).map((k) => h('p.k-drop-k', { text: k }))));
  const list = h('ul.k-uq-l', { 'aria-live': 'polite' });
  el.innerHTML = '';
  el.append(input, zone, list);
  const items = [];
  let running = false;
  const changed = () => onChange?.(items.slice());

  function row(it) {
    const bar = h('div.t-progress', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': '올리기 진행' }, h('i', { style: { width: '0%' } }));
    const st = h('p.k-uq-s', { role: 'status' });
    const pause = h('button', { type: 'button', text: '멈춤' });
    const x = h('button.x', { type: 'button', 'aria-label': '취소', html: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6"/></svg>' });
    const li = h('li.k-uq-r', { dataset: { st: 'wait' } }, h('span.k-uq-n', { text: it.file.name, 'data-lint-skip': '' }), h('span.k-uq-a', {}, pause, x), bar, st);
    Object.assign(it, { el: li, bar, st, pauseBtn: pause });
    pause.addEventListener('click', () => (it.state === 'paused' || (it.state === 'bad' && it.retry) ? resume(it) : pauseIt(it)));
    x.addEventListener('click', () => cancel(it));
    list.append(li);
  }
  function paint(it, text) {
    it.el.dataset.st = it.state;
    const pct = it.file.size ? Math.round((it.bytes / it.file.size) * 100) : 0;
    it.bar.firstChild.style.width = Math.max(it.state === 'up' ? 2 : 0, pct) + '%';
    it.bar.setAttribute('aria-valuenow', String(pct));
    it.bar.hidden = it.state === 'bad' && !it.bytes;
    const canResume = it.state === 'paused' || (it.state === 'bad' && it.retry);
    it.pauseBtn.hidden = !(['wait', 'up'].includes(it.state) || canResume);
    it.pauseBtn.textContent = canResume ? '이어 올리기' : '멈춤';
    if (text != null) it.st.textContent = text;
    changed();
  }
  function add(files) {
    for (const f of files || []) {
      const it = { file: f, id: null, state: 'wait', bytes: 0, ac: null, retry: false };
      items.push(it);
      row(it);
      const e = extOf(f.name);
      if (allow && !allow.includes(e)) { it.state = 'bad'; paint(it, '받지 않는 형식입니다'); continue; }
      if (f.size > max) { it.state = 'bad'; paint(it, `한 파일은 ${MBf(max)}까지 올릴 수 있습니다`); continue; }
      if (!f.size) { it.state = 'bad'; paint(it, '빈 파일입니다'); continue; }
      paint(it, '기다리는 중');
    }
    pump();
  }
  async function pump() {
    if (running) return;
    running = true;
    try {
      for (let it = items.find((x) => x.state === 'wait'); it; it = items.find((x) => x.state === 'wait')) await send(it);
    } finally { running = false; changed(); }
  }
  async function send(it) {
    it.state = 'up';
    paint(it, '올리는 중');
    let st;
    try {
      it.fp = it.fp ?? await quickFingerprint(it.file).catch(() => null);
      st = await api(base, { method: 'POST', body: { ...fields(), filename: it.file.name, size: it.file.size, quick_fp: it.fp } });
      it.id = st.id; it.bytes = st.bytes || 0;
      onStart?.(st, it);
    } catch (e) { return fail(it, e); }
    const maxC = st.chunk?.max?.size || 8 * 1048576;
    let chunk = Math.min(maxC, st.chunk?.size || 1048576), fails = 0;
    const t0 = performance.now(), b0 = it.bytes;
    while (it.bytes < it.file.size) {
      if (it.state !== 'up') return;                                    // 멈춤 · 취소
      const end = Math.min(it.file.size, it.bytes + chunk);
      it.ac = new AbortController();
      const timer = setTimeout(() => it.ac.abort(), 95000);
      const ts = performance.now();
      let r = null, j = null;
      try {
        const tok = session.get()?.token;
        r = await fetch(API.prefix + `${base}/${encodeURIComponent(it.id)}?offset=${it.bytes}`, { method: 'PUT', body: it.file.slice(it.bytes, end), signal: it.ac.signal,
          headers: { 'content-type': 'application/octet-stream', ...(tok ? { authorization: 'Bearer ' + tok } : {}) } });
        j = await r.json().catch(() => null);
      } catch { r = null; }
      clearTimeout(timer);
      if (it.state !== 'up') return;
      if (r && r.ok && j) {
        const sec = Math.max(0.2, (performance.now() - ts) / 1000);
        chunk = Math.max(256 * 1024, Math.min(maxC, Math.round(((j.bytes - it.bytes) / sec) * 30)));   // 다음 조각 ≈ 30초 분량
        it.bytes = j.bytes; fails = 0;
      } else if (r && r.status === 409 && j?.error?.detail?.bytes != null) {
        it.bytes = j.error.detail.bytes;                                                         // 서버가 받은 자리부터
      } else if (r && [400, 401, 403, 404, 413].includes(r.status)) {
        return fail(it, Object.assign(new Error(j?.error?.message || 'upload'), { code: j?.error?.code, status: r.status }));
      } else {
        fails++; chunk = Math.max(256 * 1024, Math.round(chunk / 2));
        if (fails > 5) { it.state = 'paused'; paint(it, `연결이 여러 번 끊겨 멈췄습니다 — ${MBf(it.bytes)} / ${MBf(it.file.size)} 올림. 이어 올리기를 누르면 이어서 올립니다`); return; }
        await sleep(1500 * fails);
      }
      const bps = (it.bytes - b0) / Math.max(0.5, (performance.now() - t0) / 1000);
      paint(it, `올리는 중 ${MBf(it.bytes)} / ${MBf(it.file.size)}${leftWord(bps > 0 ? (it.file.size - it.bytes) / bps : null)}`);
    }
    try {
      paint(it, '다 올렸습니다 — 확인하는 중');
      const done = await api(`${base}/${encodeURIComponent(it.id)}/finish`, { method: 'POST', body: {} });
      it.state = 'done';
      paint(it, `${MBf(it.file.size)} · 다 올렸습니다`);
      onDone?.(it, done);
    } catch (e) { fail(it, e); }
  }
  function fail(it, e) {
    const user = e?.status === 401 ? '로그인이 끝났습니다 — 다시 로그인해 주세요'
      : e?.message && e.code !== 'network' && !/^http_/.test(e.code || '') && e.status && e.status < 500 ? e.message : null;
    it.retry = !user;                                              // 연결 문제는 이어 올리기로 · 서버가 거절한 이유(형식 · 같은 파일 · 저장 공간)는 그대로 알린다
    it.state = 'bad';
    paint(it, user || '올리지 못했습니다 — 이어 올리기를 누르면 이어서 올립니다');
    onError?.(it, e);
  }
  function pauseIt(it) {
    if (it.state === 'wait') { it.state = 'paused'; paint(it, '멈춤'); return; }
    if (it.state !== 'up') return;
    it.state = 'paused';
    it.ac?.abort();
    paint(it, `멈춤 — ${MBf(it.bytes)} / ${MBf(it.file.size)} 올림`);
  }
  function resume(it) {
    it.state = 'wait'; it.retry = false;
    paint(it, '기다리는 중');
    pump();
  }
  async function cancel(it) {
    const was = it.state;
    it.state = 'cancel';
    it.ac?.abort();
    if (it.id && was !== 'cancel') { try { await api(`${base}/${encodeURIComponent(it.id)}`, { method: 'DELETE' }); } catch { /* 이미 없음 */ } }
    items.splice(items.indexOf(it), 1);
    it.el.remove();
    changed();
  }
  input.addEventListener('change', () => { add([...input.files]); input.value = ''; });
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('is-over'); add([...(e.dataTransfer?.files || [])]); });
  return {
    el, add, input, items: () => items.slice(),
    busy: () => items.some((x) => ['wait', 'up'].includes(x.state)),
    clear() { for (const it of items.slice()) { it.state = 'cancel'; it.ac?.abort(); it.el.remove(); } items.length = 0; changed(); },
  };
}
