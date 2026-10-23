/* kit/uploads.js — 영상 업로드 한 벌(원칙 326 · 10-23 사용자 "너무 불친절하다 … 상태창 · 최소화 · 펼치기" ·
   "다른 화면으로 넘어가고 다른 작업 하면 그냥 멈춰버리네? 이러면 무용지물이지").
   쓰는 곳 두 군데가 같은 부품: LX 관리자 '공유 데이터 → 영상 업로드'(ops-infra/js/shared.js) · 분석 서비스 카드 '내 영상 올려서 분석'(lx-analyze).

   ① 고르기 전 안내(uploadPicker) — 서버가 실제로 받는 형식(GET /catalog/imagery/uploads/formats) · 한 파일 한도 · 좌표계 · 한 장/여러 장 · 걸리는 시간.
   ② 올리기는 '업로드 창'(따로 열리는 작은 창 · landxi/v3/upload/)이 맡는다 — 각 화면은 따로 된 페이지라 화면을 옮기면 그 화면의 일이 끝난다.
      업로드 창이 파일을 쥐고 조각을 보내므로, 그 창을 열어 둔 채 다른 화면에서 일해도 계속 올라간다(창은 작게 줄여 두어도 된다).
   ③ 다른 모든 LX 화면은 머리줄 '업로드 중' 표시 + 왼쪽 아래 상태 창(접기 · 펼치기)으로 진행을 본다 — 업로드 창이 BroadcastChannel 로 알리는 값을 그대로.
      멈춤 · 이어서 업로드 · 취소는 업로드 창으로 넘긴다. 보통 화면에는 '나가시겠습니까' 창이 없다(업로드 창을 닫을 때만 묻는다).
   ④ 업로드 창을 실수로 닫으면 — 고른 파일의 손잡이(Chrome 파일 손잡이 · 복사 없음)가 이 브라우저 보관함(IndexedDB)에 있어,
      상태 창의 '업로드 창 열기' 한 번으로 서버가 받은 자리부터 이어 간다(허락이 풀렸으면 업로드 창에서 '이어서 업로드' 한 번 · 손잡이가 없으면 같은 파일을 다시 고르기).
   ⑤ 다 올리면 쓰임대로 등록 — 공유 데이터: POST /catalog/imagery {draft_id} · 내 영상: POST /cards/{카드}/my-imagery {draft_id}.
      끝나면 모든 화면에 'lx:upload-done' 알림 + 창에 결과 한 줄과 갈 곳.
   조각 올리기 약속은 kit/dropzone.js uploadQueue 와 같다(64MB 조각 · 끊기면 30분까지 저절로 다시 · 받은 자리부터). */
import { h, api, API, session, durWord } from './util.js';
import { fileWhy, fileProblem, quickFingerprint, extOf } from './dropzone.js';
import { toast } from './toast.js';
import { MEASURE } from './lint/overlap.mjs';   // 겹침 검사기와 같은 재는 식 — 창 자리 고르기

const BASE = '/catalog/imagery/uploads';
const HOST = /\/landxi\/v3\/upload\/?$/.test(location.pathname);   // 이 화면이 업로드 창인가
const HOST_URL = '/landxi/v3/upload/';
const bc = 'BroadcastChannel' in self ? new BroadcastChannel('lx-uploads') : null;
let hostSeen = 0;                           // (보통 화면) 업로드 창 소식을 마지막으로 받은 때
const FLAG = 'lx-up';                       // 셸이 다음 화면에서 이 부품을 부를지(남은 올리기가 있나)
const FOLD = 'lx-up.fold';
const SPEED = 5.5 * 1e6;                    // 이 서버로 잰 올리기 속도(초당 약 5.5MB · 10-22 P1 시험) — 고르기 전 '걸리는 시간' 안내에만
const KIND_WORD = { tif: 'GeoTIFF(COG 포함)', tiff: 'GeoTIFF(COG 포함)', jp2: 'JPEG2000', j2k: 'JPEG2000', ecw: 'ECW', img: 'ERDAS IMG', jpg: 'JPG(위치 파일과 함께)', jpeg: 'JPG(위치 파일과 함께)' };
const KIND_ORDER = ['tif', 'tiff', 'jp2', 'j2k', 'ecw', 'img', 'jpg', 'jpeg'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MBf = (n) => { const m = n / 1048576; return m >= 1024 ? `${(m / 1024).toFixed(1)}GB` : m >= 10 ? `${Math.round(m)}MB` : `${m.toFixed(1)}MB`; };
const GB = (n) => (n >= 1e12 ? `${(n / 1e9).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}GB` : n >= 1e9 ? `${+(n / 1e9).toFixed(1)}GB` : MBf(n));
const pctOf = (a, b) => (b ? Math.min(100, Math.floor((a / b) * 100)) : 0);

/* ───────── 보관함(IndexedDB) — 묶음 · 파일(손잡이 포함 · 파일 내용은 넣지 않음) ───────── */
const DB = 'lx-uploads', ST = 'state';
function idb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(ST);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function load() {
  try {
    const d = await idb();
    return await new Promise((res) => { const t = d.transaction(ST).objectStore(ST).get('all'); t.onsuccess = () => { d.close(); res(t.result || null); }; t.onerror = () => { d.close(); res(null); }; });
  } catch { return null; }
}
let saving = null, again = false;
async function save() {
  if (!HOST) return;
  if (saving) { again = true; return saving; }
  const snap = { batches: [...B.values()].map((b) => ({ ...b })), files: [...F.values()].map(({ file, ac, el, ...x }) => ({ ...x, state: x.state === 'up' ? 'wait' : x.state })) };
  saving = (async () => {
    try {
      const d = await idb();
      await new Promise((res) => { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(snap, 'all'); t.oncomplete = res; t.onerror = res; t.onabort = res; });
      d.close();
    } catch { /* 보관함을 못 쓰면 이 화면 안에서만 */ }
    try { if (B.size) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch { /* */ }
  })();
  await saving; saving = null;
  if (again) { again = false; return save(); }
}

/* ───────── 상태 ───────── */
const B = new Map();     // 묶음 id → { id, purpose:{kind:'shared'|'own', card?, cardName?}, draft, state:'up'|'reg'|'done'|'bad', why?, result?, at }
const F = new Map();     // 파일 key → { key, batch, name, size, fp, uid, bytes, state:'wait'|'up'|'paused'|'need'|'bad'|'done'|'else', why?, handle?, file?(이 화면만) }
let ui = null, started = false;
const listeners = new Set();
const mine = new Set();  // 이 탭이 지금 올리는 파일
let castT = 0;
const cast = () => {                         // 업로드 창 → 모든 화면(0.4초에 한 번까지)
  if (!HOST || !bc || castT) return;
  castT = setTimeout(() => { castT = 0; bc.postMessage({ t: 'state', at: Date.now(), batches: [...B.values()].map(({ registering, ...b }) => b),
    files: [...F.values()].map(({ file, ac, handle, ...x }) => ({ ...x, hasHandle: !!handle })) }); }, 400);
};
const changed = () => { paint(); cast(); for (const fn of listeners) { try { fn(); } catch { /* */ } } };
const hostless = () => !HOST && Date.now() - hostSeen > 5000;

const purposeWord = (p) => p.label || (p.kind === 'own' ? `내 영상${p.cardName ? ` · ${p.cardName}` : ''}` : p.kind === 'project' ? `프로젝트 · ${p.name || ''}` : '공유 데이터');
const busy = () => [...F.values()].some((f) => ['wait', 'up'].includes(f.state));

/** 셸 · 화면이 부른다(한 번만) — 업로드 창이면 보관함에서 이어서 업로드를 맡고, 보통 화면이면 업로드 창의 소식을 받아 상태 창을 그린다 */
export async function mountUploads() {
  if (started) return;
  started = true;
  return HOST ? mountHost() : mountView();
}
async function restore() {
  const st = await load();
  const day = Date.now() - 24 * 3600 * 1000;
  B.clear(); F.clear();
  for (const b of st?.batches || []) if (!(b.state === 'done' && b.at < day)) B.set(b.id, { ...b, registering: false });   // 끝난 지 하루 지난 결과 줄은 정리
  for (const f of st?.files || []) if (B.has(f.batch)) F.set(f.key, { ...f, state: ['done', 'bad', 'paused'].includes(f.state) ? f.state : 'wait' });   // 사람이 멈춘 것은 멈춘 채로
}
async function mountHost() {
  /* 업로드 창은 하나만 — 이미 열린 창이 있으면 그 창을 쓰라고 알리고 이 창은 아무것도 하지 않는다 */
  const one = await new Promise((res) => {
    if (!navigator.locks?.request) { res(true); return; }
    navigator.locks.request('lx-up-host', { ifAvailable: true }, (lock) => { res(!!lock); return lock ? new Promise(() => {}) : null; });
  });
  if (!one) { hostOther = true; draw(); paint(); return; }
  await restore();
  addEventListener('beforeunload', (e) => { if (mine.size || [...F.values()].some((f) => f.state === 'wait')) { e.preventDefault(); e.returnValue = ''; } });   // 업로드 창을 닫을 때만 묻는다
  const adds = new Set();
  bc?.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.t === 'ping') cast();
    else if (m.t === 'add' && m.id) {
      bc.postMessage({ t: 'added', id: m.id });
      if (adds.has(m.id)) return;
      adds.add(m.id);
      addUploads(m.picks || [], m.purpose || { kind: 'shared' });
    } else if (m.t === 'cmd') {
      const f = F.get(m.key), b = B.get(m.bid);
      if (m.op === 'pause' && f) pause(f);
      else if (m.op === 'resume' && f) resume(f);
      else if (m.op === 'cancel' && f) cancel(f);
      else if (m.op === 'register' && b) register(b);
      else if (m.op === 'clear') clearDone();
      else if (m.op === 'focus') { try { window.focus(); } catch { /* */ } }
    }
  });
  setInterval(cast, 2000);                                      // 살아 있다는 소식(보통 화면이 '업로드 창이 닫힘'을 알아보게)
  draw();
  paint(); cast();
  pump();
  for (const b of B.values()) if (b.state === 'reg') register(b);
}
async function mountView() {
  if (!bc) return;
  let got = false;
  bc.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.t === 'state') {
      got = true; hostSeen = Date.now();
      B.clear(); F.clear();
      for (const b of m.batches || []) B.set(b.id, b);
      for (const f of m.files || []) F.set(f.key, f);
      if (B.size) { draw(); }
      changed();
    } else if (m.t === 'done') {
      dispatchEvent(new CustomEvent('lx:upload-done', { detail: { purpose: m.purpose, result: m.result } }));
      if (m.line) toast(m.line);
    }
  });
  bc.postMessage({ t: 'ping' });
  setTimeout(async () => {                                      // 업로드 창 소식이 없으면 — 보관함에 남은 것을 보이고 '업로드 창 열기'
    if (got) return;
    await restore();
    if (B.size) { draw(); changed(); }
  }, 2500);
  setInterval(() => { if (B.size) paint(); }, 3000);            // 업로드 창이 닫히면 몇 초 안에 '닫힘'으로
}
let hostOther = false;

/* ───────── 올리기(조각) ───────── */
async function fileOf(f) {
  if (f.file) return f.file;
  if (!f.handle) return null;
  try {
    let p = await f.handle.queryPermission?.({ mode: 'read' });
    if (p !== 'granted') return null;
    const file = await f.handle.getFile();
    if (file.size !== f.size) return null;
    f.file = file;
    return file;
  } catch { return null; }
}
let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const f = [...F.values()].find((x) => x.state === 'wait');
      if (!f) break;
      if (f.uid && f.size && f.bytes >= f.size) { await finishOnly(f); continue; }   // 다 보냈는데 끝 확인 전에 화면을 옮김 — 파일 없이 끝 확인만
      const file = await fileOf(f);
      if (!file) { f.state = 'need'; changed(); continue; }
      const run = async (lock) => { if (lock === null) { f.state = 'else'; changed(); return; } await send(f); };
      if (navigator.locks?.request) await navigator.locks.request(`lx-up-${f.key}`, { ifAvailable: true }, run);
      else await run(true);
    }
  } finally { pumping = false; }
  for (const b of B.values()) maybeRegister(b);
  if ([...F.values()].some((x) => x.state === 'else')) setTimeout(() => { for (const x of F.values()) if (x.state === 'else') x.state = 'wait'; pump(); }, 15000);   // 다른 탭이 업로드 중 — 그 탭이 닫히면 이어받는다
}
let lastKeep = Date.now();
function keepLogin() {
  if (Date.now() - lastKeep < 15 * 60 * 1000 || !session.get()) return;
  lastKeep = Date.now();
  api('/auth/extend', { method: 'POST' }).then((j) => {
    const s = session.get(); if (s && j?.expires_at) { s.expires_at = j.expires_at; session.set(s); dispatchEvent(new CustomEvent('lx:session-extended', { detail: { expires_at: j.expires_at } })); }
  }).catch(() => {});
}
async function send(f) {
  const b = B.get(f.batch);
  if (!b) return;
  f.state = 'up'; f.why = ''; mine.add(f.key); changed();
  let st;
  try {
    f.fp = f.fp ?? await quickFingerprint(f.file).catch(() => null);
    st = await api(BASE, { method: 'POST', body: { draft_id: b.draft || undefined, filename: f.name, size: f.size, quick_fp: f.fp } });
    f.uid = st.id; f.bytes = st.bytes || 0;
    if (st.draft_id && st.draft_id !== b.draft) b.draft = st.draft_id;
    save();
  } catch (e) { return fail(f, e, true); }
  const maxC = st.chunk?.max?.size || 8 * 1048576;
  let chunk = Math.min(maxC, st.chunk?.size || 1048576), fails = 0, failSince = 0, lastSave = 0;
  f.t0 = performance.now(); f.b0 = f.bytes;
  while (f.bytes < f.size) {
    if (f.state !== 'up') { mine.delete(f.key); save(); return; }          // 멈춤 · 취소
    keepLogin();
    const end = Math.min(f.size, f.bytes + chunk);
    f.ac = new AbortController();
    const timer = setTimeout(() => f.ac.abort(), 95000);
    const ts = performance.now();
    let r = null, j = null;
    try {
      const tok = session.get()?.token;
      r = await fetch(API.prefix + `${BASE}/${encodeURIComponent(f.uid)}?offset=${f.bytes}`, { method: 'PUT', body: f.file.slice(f.bytes, end), signal: f.ac.signal,
        headers: { 'content-type': 'application/octet-stream', ...(tok ? { authorization: 'Bearer ' + tok } : {}) } });
      j = await r.json().catch(() => null);
    } catch { r = null; }
    clearTimeout(timer);
    if (f.state !== 'up') { mine.delete(f.key); save(); return; }
    if (r && r.ok && j) {
      const sec = Math.max(0.2, (performance.now() - ts) / 1000);
      chunk = Math.max(256 * 1024, Math.min(maxC, Math.round(((j.bytes - f.bytes) / sec) * 30)));   // 다음 조각 ≈ 30초 분량
      f.bytes = j.bytes; fails = 0; failSince = 0; f.why = '';
    } else if (r && r.status === 409 && j?.error?.detail?.bytes != null) {
      f.bytes = j.error.detail.bytes;
    } else if (r && [400, 401, 403, 404, 409, 413].includes(r.status)) {
      return fail(f, Object.assign(new Error(j?.error?.message || 'upload'), { code: j?.error?.code, status: r.status }));
    } else {
      fails++; failSince ||= Date.now(); chunk = Math.max(256 * 1024, Math.round(chunk / 2));
      if (Date.now() - failSince > 30 * 60 * 1000) { f.state = 'paused'; f.why = '연결이 30분 넘게 끊겨 멈췄습니다'; mine.delete(f.key); save(); changed(); return; }
      f.why = '연결이 끊겨 다시 잇는 중'; changed();
      await sleep(Math.min(30000, 1500 * 2 ** Math.min(fails - 1, 5)));
      continue;
    }
    const el = (performance.now() - f.t0) / 1000;
    f.bps = el > 2 ? (f.bytes - f.b0) / el : f.bps;
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save(); }
    changed();
  }
  try {
    f.why = '다 올렸습니다 — 확인하는 중'; changed();
    await api(`${BASE}/${encodeURIComponent(f.uid)}/finish`, { method: 'POST', body: {} });
    f.state = 'done'; f.why = '';
  } catch (e) { mine.delete(f.key); return fail(f, e); }
  mine.delete(f.key);
  await save(); changed();
}
async function finishOnly(f) {
  f.state = 'up'; f.why = '다 올렸습니다 — 확인하는 중'; changed();
  try { await api(`${BASE}/${encodeURIComponent(f.uid)}/finish`, { method: 'POST', body: {} }); f.state = 'done'; f.why = ''; }
  catch (e) { return fail(f, e); }
  await save(); changed();
}
function fail(f, e, atStart = false) {
  mine.delete(f.key);
  const user = e?.status === 401 ? '로그인이 끝났습니다 — 다시 로그인하면 이어 올립니다'
    : e?.message && e.code !== 'network' && !/^http_/.test(e.code || '') && e.status && e.status < 500 ? e.message : null;
  if (atStart && user && e.status !== 401) {                      // 보내기 전에 서버가 거절(같은 파일 · 저장 공간 · 형식) — 창으로 알리고 줄을 뺀다
    F.delete(f.key);
    fileProblem({ files: [{ name: f.name, why: user }] });
    dropEmpty(f.batch);
    save(); changed();
    return;
  }
  f.state = user ? 'bad' : 'paused';
  f.why = user || '올리지 못했습니다 — 이어서 업로드를 누르면 이어서 올립니다';
  save(); changed();
}
function dropEmpty(bid) {
  if (![...F.values()].some((x) => x.batch === bid)) B.delete(bid);
}

/* ───────── 등록(다 올린 묶음) ───────── */
function maybeRegister(b) {
  const fs = [...F.values()].filter((x) => x.batch === b.id);
  if (b.state !== 'up' || !fs.length || !b.draft || fs.some((x) => x.state !== 'done')) return;
  register(b);
}
async function register(b) {
  if (b.registering) return;
  b.registering = true; b.state = 'reg'; b.why = ''; save(); changed();
  try {
    const p = b.purpose;
    const r = p.kind === 'own'
      ? await api(`/cards/${encodeURIComponent(p.card)}/my-imagery`, { method: 'POST', body: { draft_id: b.draft } })
      : await api('/catalog/imagery', { method: 'POST', body: { draft_id: b.draft, near: p.near || undefined } });
    if (p.kind === 'project' && p.pid) {                       // 새 프로젝트 — 등록한 영상을 그 프로젝트에(대상지 = 영상 자리)
      const ids = (r.items || []).map((x) => x.id);
      if (ids.length) r.project = await api(`/projects/${encodeURIComponent(p.pid)}/imagery`, { method: 'POST', body: { imagery: ids } });
    }
    b.state = 'done';
    b.ids = p.kind === 'own' ? [r.id] : (r.items || []).map((x) => x.id);   // 등록한 영상(기록 · 정리용 — 화면 글에는 없음)
    const where = [...new Set((r.items || []).map((x) => x.region).filter(Boolean))].join(' · ');
    b.result = p.kind === 'project'
      ? { line: `영상 ${(r.items || []).length}장을 등록했습니다${(r.project?.regions || []).length ? ` · 대상지 ${r.project.regions.map((g) => g.name).join(' · ')}` : ''}`, href: p.href, go: '프로젝트 보기' }
      : p.kind === 'own'
      ? { line: `${r.region?.name || ''} ${r.imagery?.gsd_word || ''} 영상을 올렸습니다`.replace(/\s+/g, ' ').trim(), fit: r.imagery?.fit_text || '', id: r.id, region: r.region?.sgg_cd,
        href: `/landxi/v3/lx-analyze/?${new URLSearchParams({ card: p.card, region: r.region?.sgg_cd || '', imagery: r.id })}`, go: '이 영상으로 분석하기' }
      : p.from === 'ingest'
        ? { line: `${where ? where + ' ' : ''}영상 ${(r.items || []).length}장을 등록했습니다`, href: p.href || '/landxi/v3/lx-ingest/', go: '데이터 올리기에서 보기', n: (r.items || []).length }
        : { line: `영상 ${(r.items || []).length}장을 공유 데이터에 등록했습니다`, href: '/landxi/v3/ops-infra/#/shared', go: '공유 데이터 보기', n: (r.items || []).length };
    for (const f of [...F.values()]) if (f.batch === b.id) F.delete(f.key);
    b.files = undefined;
    dispatchEvent(new CustomEvent('lx:upload-done', { detail: { purpose: p, result: r } }));
    bc?.postMessage({ t: 'done', purpose: p, result: r, line: b.result.line });
    setTimeout(() => { if (![...B.values()].some((x) => ['up', 'reg', 'bad'].includes(x.state))) setFold(true); }, 8000);   // 다 끝나면 창은 접고 위쪽 표시만(결과 · 갈 곳은 펼치면 그대로)
    toast(b.result.line);
  } catch (e) {
    b.state = 'bad';
    b.why = e?.message || '등록하지 못했습니다';
    if (e?.detail?.files?.length) fileProblem({ files: e.detail.files.map((n) => ({ name: n, why: e.detail?.reasons?.[n] || b.why })) });
  } finally { b.registering = false; await save(); changed(); }
}

/* ───────── 화면이 부르는 것 ───────── */
/** 묶음 하나 더하기 — picks: [{file, handle?}] · purpose: {kind, card?, cardName?} */
export async function addUploads(picks, purpose) {
  if (!HOST) return startUploads(picks, purpose);
  if (!started) await mountUploads();
  const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  B.set(id, { id, purpose, draft: null, state: 'up', at: Date.now() });
  for (const p of picks) {
    const key = id + ':' + p.file.name + ':' + p.file.size;
    F.set(key, { key, batch: id, name: p.file.name, size: p.file.size, bytes: 0, state: 'wait', handle: p.handle || null, file: p.file });
  }
  ui = ui || draw();
  setFold(false);
  await save();
  dispatchEvent(new CustomEvent('lx:uploads-start', { detail: { purpose } }));
  changed();
  pump();
  return id;
}
/** 보통 화면 → 업로드 창에 맡기기(누름 안에서 부른다 — 업로드 창이 없으면 그 순간 연다). → 맡겼으면 true */
export function startUploads(picks, purpose) {
  if (!started) mountUploads();
  if (!bc) { toast('이 브라우저에서는 업로드 창을 쓸 수 없습니다 — Chrome 이나 Edge 로 열어 주세요'); return Promise.resolve(false); }
  if (hostless() && !openHost()) return Promise.resolve(false);
  const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return new Promise((res) => {
    const t0 = Date.now();
    const send = () => bc.postMessage({ t: 'add', id, picks, purpose });
    const on = (e) => { if (e.data?.t === 'added' && e.data.id === id) { end(); res(true); } };
    const end = () => { bc.removeEventListener('message', on); clearInterval(iv); };
    bc.addEventListener('message', on);
    send();
    const iv = setInterval(() => { if (Date.now() - t0 > 20000) { end(); toast('업로드 창이 열리지 않았습니다 — 다시 눌러 주세요'); res(false); } else send(); }, 700);
    dispatchEvent(new CustomEvent('lx:uploads-start', { detail: { purpose } }));
  });
}
/** 업로드 창이 살아 있나(보통 화면) */
export const hostAlive = () => HOST || !hostless();
/** 업로드 창 열기 — 누름 안에서(팝업 막힘이면 알림) */
export function openHost() {
  const w = window.open(HOST_URL, 'lx-upload', 'popup=yes,width=560,height=720');
  if (!w) { toast('팝업이 막혀 업로드 창을 열지 못했습니다 — 주소창 오른쪽의 팝업 허용을 눌러 주세요'); return null; }
  hostSeen = Date.now();                                        // 열리는 동안은 닫힘으로 보지 않는다
  return w;
}
/** 화면이 바뀜을 듣는다(그 쓰임의 진행을 보이고 싶을 때) */
export function onUploads(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function uploadsOf(kind, card) {
  return [...B.values()].filter((b) => b.purpose.kind === kind && (!card || b.purpose.card === card))
    .map((b) => ({ ...b, files: [...F.values()].filter((f) => f.batch === b.id) }));
}

/* ───────── 업로드 상태 창 ───────── */
const CSS = `
.k-upchip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid var(--rule);border-radius:999px;background:var(--bg-1);color:var(--ink);font:500 var(--fs-aux)/1 var(--font-body);cursor:pointer;white-space:nowrap}
.k-upchip[hidden]{display:none}
.k-upchip:hover{border-color:var(--ink)}
.k-upchip i{display:block;width:44px;height:4px;border-radius:2px;background:var(--bg-0);overflow:hidden}
.k-upchip i b{display:block;height:100%;background:var(--accent)}
.k-upchip[data-need] {border-color:var(--warn);color:var(--warn)}
.k-up{position:fixed;z-index:30;left:calc(var(--rail, 80px) + 16px);bottom:16px;width:min(380px,calc(100vw - var(--rail, 80px) - 32px));max-height:min(60vh,520px);display:flex;flex-direction:column;background:var(--bg-1);border:1px solid var(--rule);border-radius:var(--r-12, 12px);box-shadow:0 12px 32px rgba(15,23,42,.16)}
.k-up[hidden]{display:none}
.k-up-h{display:flex;align-items:center;gap:8px;padding:12px 12px 10px 16px;border-bottom:1px solid var(--rule)}
.k-up-h b{flex:1;font:600 var(--fs-body)/22px var(--font-body);color:var(--ink)}
.k-up-h button{height:30px;padding:0 10px;border:1px solid var(--rule);border-radius:var(--r-8);background:var(--bg-1);font:500 var(--fs-tag)/1 var(--font-body);color:var(--ink);cursor:pointer}
.k-up-l{overflow:auto;padding:8px 12px 12px;display:flex;flex-direction:column;gap:10px}
.k-up-g{display:flex;flex-direction:column;gap:6px}
.k-up-gh{margin:0;font:600 var(--fs-tag)/20px var(--font-body);color:var(--sub)}
.k-up-r{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;align-items:center;padding:10px 12px;background:var(--bg-0);border-radius:var(--r-8)}
.k-up-n{font:500 var(--fs-aux)/21px var(--font-body);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.k-up-a{display:flex;gap:4px}
.k-up-a button{height:28px;padding:0 10px;border:1px solid var(--rule);border-radius:var(--r-8);background:var(--bg-1);font:500 var(--fs-tag)/1 var(--font-body);color:var(--ink);cursor:pointer}
.k-up-a button:hover{border-color:var(--ink)}
.k-up-a .x{width:28px;padding:0;color:var(--sub)}
.k-up-r .t-progress{grid-column:1/-1}
.k-up-s{grid-column:1/-1;margin:0;font:400 var(--fs-tag)/20px var(--font-body);color:var(--sub)}
.k-up-r[data-st="bad"] .k-up-s,.k-up-r[data-st="need"] .k-up-s{color:var(--warn)}
.k-up-done{display:flex;flex-direction:column;gap:4px;padding:10px 12px;background:var(--bg-0);border-radius:var(--r-8);font:400 var(--fs-aux)/21px var(--font-body);color:var(--ink)}
.k-up-done small{color:var(--sub);font-size:var(--fs-tag)}
.k-up-done a{font-weight:600;color:var(--accent)}
.k-up-done[data-st="bad"]{color:var(--warn)}
.k-up-gone{display:flex;flex-direction:column;gap:8px;margin:8px 12px 0;padding:10px 12px;border-radius:var(--r-8);background:var(--bg-0);font:500 var(--fs-aux)/21px var(--font-body);color:var(--warn)}
.k-up-gone[hidden]{display:none}
.k-up-gone .t-btn{align-self:flex-start}
.k-up-note{margin:8px 16px 0;font:400 var(--fs-aux)/21px var(--font-body);color:var(--sub);word-break:keep-all}
.k-up--page{position:static;width:auto;max-width:640px;max-height:none;margin:24px auto;box-shadow:none}
@media (max-width:640px){.k-upchip{height:32px;padding:0 10px}}
@media (max-width:960px){.k-up{width:calc(100vw - 24px);bottom:calc(64px + 12px + env(safe-area-inset-bottom));max-height:min(45vh,420px)}.k-upchip i{display:none}}`;
function style() {
  if (document.getElementById('k-up-css')) return;
  document.head.append(Object.assign(document.createElement('style'), { id: 'k-up-css', textContent: CSS }));
}
const isFold = () => { try { return localStorage.getItem(FOLD) === '1'; } catch { return false; } };
function setFold(v) { if (HOST) return; try { localStorage.setItem(FOLD, v ? '1' : '0'); } catch { /* */ } if (ui) { ui.win.hidden = v || !B.size; ui.chip.setAttribute('aria-expanded', String(!v)); if (v) forced = false; else blocked = false; place(); } }
function draw() {
  if (ui) return ui;
  style();
  const chip = h('button.k-upchip', { type: 'button', 'aria-controls': 'k-up', 'aria-expanded': 'true', hidden: true }, h('span.t'), h('i', {}, h('b', { style: { width: '0%' } })));
  const list = h('div.k-up-l', { 'aria-live': 'polite' });
  const fold = h('button', { type: 'button', text: '접기', 'aria-label': '업로드 창 접기' });
  const close = h('button', { type: 'button', text: '닫기', hidden: true });
  const gone = h('div.k-up-gone', { hidden: true }, h('span', { text: '업로드 창이 닫혀 멈췄습니다. 열면 받은 자리부터 이어 올립니다.' }),
    h('button.t-btn', { type: 'button', text: '업로드 창 열기', onclick: () => openHost() }));
  const other = HOST && hostOther ? h('div.k-up-gone', {}, h('span', { text: '이미 열린 업로드 창이 있습니다 — 그 창을 쓰세요. 이 창은 닫아도 됩니다.' })) : null;
  const note = HOST ? h('p.k-up-note', { text: '이 창을 열어 두면 다른 화면에서 일해도 계속 올립니다. 작게 줄여 두어도 됩니다 — 닫으면 멈추고, 다시 열면 받은 자리부터 이어 갑니다.' }) : null;
  const win = h('section.k-up' + (HOST ? '.k-up--page' : ''), { id: 'k-up', 'data-zone': 'uploads', 'aria-label': '영상 업로드', hidden: !HOST }, h('div.k-up-h', {}, h('b', { text: '영상 업로드' }), close, HOST ? null : fold), note, other, gone, list);
  chip.addEventListener('click', () => { if (hostless() && [...F.values()].some((f) => f.state !== 'done')) { openHost(); return; } const open = win.hidden; forced = open; setFold(!open); });
  fold.addEventListener('click', () => setFold(true));
  close.addEventListener('click', () => { if (HOST) clearDone(); else ask('clear'); });
  const placeChip = () => {
    const mast = document.querySelector('.k-mast');
    if (!mast) return false;
    if (!chip.isConnected) mast.insertBefore(chip, mast.querySelector('.k-help') || null);
    return true;
  };
  if (!HOST && !placeChip()) { const mo = new MutationObserver(() => { if (placeChip()) mo.disconnect(); }); mo.observe(document.body, { childList: true, subtree: true }); }
  (HOST ? (document.querySelector('main') || document.body) : document.body).append(win);
  ui = { chip, win, list, close, gone };
  setInterval(place, 2000);                          // 아래 대화 줄 · 메뉴 줄이 늦게 자리를 잡는 화면(지도)
  paint();
  return ui;
}
function rowOf(f) {
  const bar = h('div.t-progress', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `${f.name} 업로드 진행` }, h('i', { style: { width: Math.max(f.state === 'up' ? 2 : 0, pctOf(f.bytes, f.size)) + '%' } }));
  const act = h('span.k-up-a');
  const btn = (t, fn, cls = '') => h('button' + cls, { type: 'button', text: t, onclick: fn });
  if (f.state === 'up' || f.state === 'wait') act.append(btn('멈춤', () => pause(f)));
  if (f.state === 'paused') act.append(btn('이어서 업로드', () => resume(f)));
  if (f.state === 'need') act.append(btn(f.handle || f.hasHandle ? '이어서 업로드' : '파일 다시 고르기', () => repick(f)));
  if (f.state !== 'done') act.append(h('button.x', { type: 'button', 'aria-label': `${f.name} 취소`, title: '취소', text: '×', onclick: () => cancel(f) }));
  const left = f.bps > 0 && f.state === 'up' ? (f.size - f.bytes) / f.bps : null;
  const say = f.why ? `${f.why}${f.bytes ? ` · ${MBf(f.bytes)} / ${MBf(f.size)}` : ''}`
    : f.state === 'up' ? `${MBf(f.bytes)} / ${MBf(f.size)} 올림${left != null ? ` · 남은 시간 약 ${durWord(left)}` : ''}`
      : f.state === 'wait' ? (f.bytes ? `이어 올릴 차례 · ${MBf(f.bytes)} / ${MBf(f.size)}` : '기다리는 중')
        : f.state === 'paused' ? `멈춤 · ${MBf(f.bytes)} / ${MBf(f.size)} 올림`
          : f.state === 'need' ? (f.handle || f.hasHandle ? `멈춤 · 이어서 업로드를 누르면 받은 자리(${MBf(f.bytes)})부터 이어 갑니다` : '이어서 업로드 — 파일을 다시 골라 주세요(받은 자리부터 이어 갑니다)')
            : f.state === 'else' ? '다른 창에서 업로드 중' : f.state === 'done' ? `${MBf(f.size)} · 다 올렸습니다` : '';
  return h('div.k-up-r', { dataset: { st: f.state } }, h('span.k-up-n', { text: f.name, title: f.name, 'data-lint-skip': '' }), act, bar, h('p.k-up-s', { role: 'status', text: say }));
}
/* 창 자리(겹침 0 · 원칙 309) — 겹침 검사기(kit/lint/overlap.mjs)의 재는 식을 그대로 돌려, 왼쪽 아래부터 위 · 오른쪽으로 훑어
   이 창이 아무것과도 겹치지 않는 첫 자리에 둔다(지도 카드 · 범례 · 국토 변화 카드 · ChatGEO · 서랍 · 아래 대화 줄).
   빈 자리가 없으면 창을 접고 머리줄 '업로드 중' 표시만 둔다(사람이 표시를 누르면 가장 덜 가리는 자리에 연다). 지금 자리가 깨끗하면 옮기지 않는다. */
let forced = false, blocked = false, spotAt = null, measureFn = null;
const measure = () => { try { measureFn ??= new Function('return ' + MEASURE); return measureFn(); } catch { return null; } };   // 검사기와 같은 식(문자열) 한 출처
const myHit = () => (measure()?.overlaps || []).filter((o) => /#k-up\b/.test(`${o.a} ${o.b}`)).reduce((a, o) => a + o.w * o.h, 0);
function place() {
  if (!ui || HOST || !B.size || isFold()) return;
  const win = ui.win;
  win.hidden = false;
  const w = win.offsetWidth, hh = win.offsetHeight;
  const mast = document.querySelector('.k-mast')?.getBoundingClientRect();
  const rail = document.querySelector('.k-rail')?.getBoundingClientRect();
  const sideRail = rail && rail.height > rail.width && rail.width > 0;
  const floor = rail && !sideRail && rail.top > innerHeight / 2 ? rail.top : innerHeight;   // 휴대폰 아래 메뉴 줄
  const L = sideRail ? rail.right + 16 : 12, R = innerWidth - 16 - w, T = (mast ? mast.bottom : 64) + 12, Bt = Math.max(T, floor - 12 - hh);
  const box = (m) => (m?.boxes || []).filter((b) => !/#k-up|k-mast/.test(b.name));
  const put = ([x, y]) => { win.style.left = Math.round(x) + 'px'; win.style.top = Math.round(y) + 'px'; win.style.bottom = 'auto'; win.style.right = 'auto'; };
  if (spotAt && spotAt[1] + hh <= floor - 8 && spotAt[0] + w <= innerWidth - 8) { put(spotAt); if (!myHit()) { blocked = false; delete ui.chip.dataset.blocked; return; } }
  /* 빈 자리 찾기 — 검사기가 잰 떠 있는 상자들을 피해 아래 → 위 · 왼쪽 → 오른쪽으로 훑는다(한 번 재고 셈만) · 고른 자리는 검사기 식으로 한 번 더 확인 */
  const obs = box(measure());
  const clear = (x, y) => obs.every((b) => !(Math.min(x + w, b.x + b.w) - Math.max(x, b.x) > 4 && Math.min(y + hh, b.y + b.h) - Math.max(y, b.y) > 4));
  const xs = innerWidth <= 960 ? [12] : [...new Set([L, ...Array.from({ length: Math.max(0, Math.floor((R - L) / 120)) }, (_, k) => L + (k + 1) * 120).filter((x) => x < R), R])];
  for (let y = Bt; y >= T; y -= 24) for (const x of xs) {
    if (!clear(x, y)) continue;
    put([x, y]);
    if (!myHit()) { spotAt = [x, y]; blocked = false; delete ui.chip.dataset.blocked; return; }
  }
  spotAt = null;
  if (forced) { put([L, Bt]); return; }
  win.hidden = true; blocked = true; ui.chip.dataset.blocked = '1';
}
addEventListener('resize', () => place());
addEventListener('click', () => setTimeout(place, 400), true);   // 대화창 · 서랍을 열고 닫으면 자리를 다시
function paint() {
  if (!ui) return;
  const fs = [...F.values()];
  const live = fs.filter((f) => f.state !== 'done');
  const tot = fs.reduce((a, f) => a + f.size, 0), got = fs.reduce((a, f) => a + (f.bytes || 0), 0);
  const need = fs.some((f) => ['need', 'paused', 'bad'].includes(f.state)) || [...B.values()].some((b) => b.state === 'bad');
  const reg = [...B.values()].some((b) => b.state === 'reg');
  const up = fs.find((f) => f.state === 'up');
  const left = up?.bps > 0 ? fs.filter((f) => f.state !== 'done').reduce((a, f) => a + f.size - (f.bytes || 0), 0) / up.bps : null;
  ui.chip.hidden = !B.size;
  const small = innerWidth <= 640;                               // 휴대폰 머리줄은 좁다 — 짧은 말만
  ui.chip.querySelector('.t').textContent = !B.size ? '' : need ? (small ? '업로드 멈춤' : '업로드 멈춤 · 눌러서 보기') : reg ? '등록하는 중'
    : live.length ? (small ? `업로드 ${pctOf(got, tot)}%` : `업로드 중 ${pctOf(got, tot)}%${left != null ? ` · 약 ${durWord(left)}` : ''}`) : '업로드 끝';
  ui.chip.querySelector('i b').style.width = pctOf(got, tot) + '%';
  if (need) ui.chip.dataset.need = '1'; else delete ui.chip.dataset.need;
  ui.win.hidden = HOST ? false : isFold() || !B.size || blocked;
  place();
  ui.close.hidden = !(B.size && !live.length && ![...B.values()].some((b) => b.state === 'reg' || b.state === 'up'));
  const gone = hostless() && live.length > 0;
  ui.gone.hidden = !gone;
  if (gone) ui.chip.querySelector('.t').textContent = small ? '업로드 멈춤' : '업로드 멈춤 · 업로드 창 열기';
  ui.list.replaceChildren(...[...B.values()].map((b) => {
    const rows = fs.filter((f) => f.batch === b.id).map(rowOf);
    const g = h('div.k-up-g', {}, h('p.k-up-gh', { text: purposeWord(b.purpose) }), ...rows);
    if (b.state === 'reg') g.append(h('div.k-up-done', { text: b.purpose.kind === 'own' ? '다 올렸습니다 — 좌표계 · 범위 · 해상도를 확인하는 중' : '다 올렸습니다 — 영상을 살펴보고 등록하는 중' }));
    if (b.state === 'done' && b.result) g.append(h('div.k-up-done', {}, h('span', { text: b.result.line }), b.result.fit ? h('small', { text: `이 서비스 조건 · ${b.result.fit}` }) : null, b.result.href ? h('a', { href: b.result.href, text: b.result.go }) : null));
    if (b.state === 'bad') g.append(h('div.k-up-done', { dataset: { st: 'bad' } }, h('span', { text: b.why || '등록하지 못했습니다' }), h('a', { href: '#', text: '다시 등록', onclick: (e) => { e.preventDefault(); if (HOST) register(b); else ask('register', null, b); } })));
    return g;
  }));
}
/* 보통 화면의 누름 → 업로드 창으로(닫혀 있으면 열기) */
function ask(op, f, b) {
  if (hostless()) { openHost(); return; }
  bc?.postMessage({ t: 'cmd', op, key: f?.key, bid: b?.id });
}
function clearDone() { for (const b of [...B.values()]) if (['done', 'bad'].includes(b.state) && ![...F.values()].some((f) => f.batch === b.id && f.state !== 'done')) B.delete(b.id); save(); changed(); }
function pause(f) {
  if (!HOST) return ask('pause', f);
  if (f.state === 'wait') { f.state = 'paused'; save(); changed(); return; }
  if (f.state !== 'up') return;
  f.state = 'paused'; f.ac?.abort(); mine.delete(f.key); save(); changed();
}
function resume(f) { if (!HOST) return ask('resume', f); f.state = 'wait'; f.why = ''; changed(); pump(); }
async function repick(f) {
  if (!HOST) { if (hostless()) openHost(); else bc?.postMessage({ t: 'cmd', op: 'focus' }); toast('업로드 창에서 이어서 업로드를 눌러 주세요'); return; }
  if (f.handle) {
    try { if ((await f.handle.requestPermission({ mode: 'read' })) === 'granted') { const file = await f.handle.getFile(); if (file.size === f.size) { f.file = file; resume(f); return; } } } catch { /* 손잡이를 못 쓰면 다시 고르기 */ }
  }
  const inp = h('input', { type: 'file', hidden: true });
  inp.addEventListener('change', () => {
    const file = inp.files[0]; inp.remove();
    if (!file) return;
    if (file.name !== f.name || file.size !== f.size) { fileProblem({ files: [{ name: file.name, why: `올리던 파일(${f.name} · ${MBf(f.size)})과 다른 파일입니다 — 같은 파일을 골라 주세요` }], onPick: () => repick(f) }); return; }
    f.file = file; resume(f);
  });
  document.body.append(inp); inp.click();
}
async function cancel(f) {
  if (!HOST) return ask('cancel', f);
  const was = f.state;
  f.state = 'cancel'; f.ac?.abort(); mine.delete(f.key);
  if (f.uid && was !== 'done') { try { await api(`${BASE}/${encodeURIComponent(f.uid)}`, { method: 'DELETE' }); } catch { /* 이미 없음 */ } }
  F.delete(f.key);
  const b = B.get(f.batch);
  if (b && ![...F.values()].some((x) => x.batch === b.id)) {
    if (b.draft && b.state !== 'done') { try { await api(`/catalog/imagery/drafts/${encodeURIComponent(b.draft)}`, { method: 'DELETE' }); } catch { /* */ } }
    B.delete(b.id);
  } else if (b) maybeRegister(b);
  await save(); changed();
}

/* ───────── 고르기 칸(고르기 전 안내 + 끌어 놓기) ───────── */
let FMT = null;
const formats = () => (FMT ??= api(BASE + '/formats').catch(() => ({ raster: ['tif', 'tiff', 'jp2', 'j2k', 'ecw', 'img', 'jpg', 'jpeg'], sidecar: ['tfw', 'prj', 'jgw', 'j2w', 'wld', 'aux.xml', 'ovr'], unavailable: {}, limit: { size: 2e12 } })));
const est = (s) => (s >= 3 * 3600 ? Math.round(s / 3600) * 3600 : s);    // 어림 — 3시간 넘으면 시간 단위로
const timeLine = () => [1e9, 10e9, 100e9].map((n) => `${GB(n)} 약 ${durWord(est(n / SPEED))}`).join(' · ');

/** 고르기 칸 — el 안에 '올릴 수 있는 영상' 안내 + 끌어 놓는 칸. one = 영상 한 장만(내 영상 분석). purpose = 등록 쓰임. onAdded(batchId) */
export async function uploadPicker(el, { purpose, one = false, onAdded, hold = false, onPicks } = {}) {
  if (!started) mountUploads();                                 // 업로드 창 소식 받기 시작(이미 열려 있으면 바로 맡긴다)
  let held = [];
  style();
  const f = await formats();
  const un = f.unavailable || {};
  const rasters = (f.raster || []).filter((e) => !un[e]);
  const kinds = [...new Set([...rasters].sort((a, b) => (KIND_ORDER.indexOf(a) + 1 || 99) - (KIND_ORDER.indexOf(b) + 1 || 99)).map((e) => KIND_WORD[e] || e.toUpperCase()))];
  const max = f.limit?.size || 2e12;
  const guide = h('dl.k-upg', {},
    h('dt', { text: '파일 형식' }), h('dd', {}, ...kinds.flatMap((k, i) => [i ? ' · ' : '', h('span.k-upg-k', { text: k })])),
    h('dt', { text: '위치 정보' }), h('dd', { text: one ? '좌표계가 든 파일만 분석할 수 있습니다 — 좌표계가 따로 있으면 PRJ 파일을 함께 넣어 주세요' : '좌표계가 든 파일 — 위치 파일(TFW · PRJ 등)이 따로 있으면 함께 넣어 주세요' }),
    h('dt', { text: '크기 · 개수' }), h('dd', { text: one ? `영상 한 장 · 한 파일 ${GB(max)}까지` : `한 파일 ${GB(max)}까지 · 여러 장을 한 번에 넣을 수 있습니다` }),
    h('dt', { text: '걸리는 시간' }), h('dd', {}, timeLine(), h('small', { text: '이 서버로 잰 속도(초당 약 5.5MB) 기준 · 사무실 회선에 따라 다릅니다' })),
    h('dt', { text: '올리는 동안' }), h('dd', { text: '따로 열리는 업로드 창이 올립니다 — 그 창을 열어 두면 다른 화면에서 일해도 계속 올라가고, 어느 화면에서든 위쪽 \'업로드 중\' 표시로 진행을 봅니다' }));
  const zone = h('div.t-empty.k-drop.k-upz', { role: 'button', tabindex: '0', 'aria-label': '영상 파일 고르기' },
    h('span.k-drop-i', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 32 32"><path d="M16 21V7m0 0l-6 6m6-6l6 6M6 21v4h20v-4"/></svg>' }),
    h('div.k-drop-b', {}, h('h6', { text: one ? '영상 파일 한 장을 끌어 놓거나 눌러 고르세요' : '영상 파일을 끌어 놓거나 눌러 고르세요' })));
  const input = h('input', { type: 'file', multiple: !one, hidden: true, accept: [...rasters, ...(f.sidecar || [])].map((e) => '.' + e).join(',') });
  el.replaceChildren(guide, zone, input);
  el.classList.add('k-upp');
  pstyle();
  const allow = [...rasters, ...(f.sidecar || [])];
  async function take(picks) {
    if (!picks.length) return;
    const bad = [], ok = [];
    for (const p of picks) {
      const why = await fileWhy(p.file, { allow, max, unavailable: un }).catch(() => null);
      if (why) bad.push({ name: p.file.name, why }); else ok.push(p);
    }
    const nr = ok.filter((p) => rasters.includes(extOf(p.file.name))).length;
    if (one && nr > 1) { fileProblem({ files: ok.map((p) => ({ name: p.file.name, why: '분석은 한 번에 영상 하나만 합니다 — 영상 파일 한 장만 골라 주세요' })), onPick: () => pick() }); return; }
    if (!nr && ok.length) { fileProblem({ files: ok.map((p) => ({ name: p.file.name, why: '영상 파일이 없습니다 — 위치 파일은 영상 파일과 함께 넣어 주세요' })), onPick: () => pick() }); return; }
    if (bad.length) fileProblem({ files: bad, ok: ok.length, onPick: () => pick() });
    if (!ok.length) return;
    const pur = typeof purpose === 'function' ? purpose() : purpose;
    if (HOST) { onAdded?.(await addUploads(ok, pur)); return; }
    if (hold) {                                                 // 화면이 나중에(예: 새 프로젝트 '만들기') 맡긴다 — 고른 파일만 보인다
      held = one ? ok : [...held, ...ok.filter((p) => !held.some((q) => q.file.name === p.file.name && q.file.size === p.file.size))];
      drawHeld(); onPicks?.(held.slice()); return;
    }
    /* 고른 파일 + '업로드 시작' — 누르는 순간 업로드 창을 연다(팝업은 누름 안에서만 열린다) */
    const tot = ok.reduce((a, p) => a + p.file.size, 0);
    const go = h('button.t-btn', { type: 'button', text: '업로드 시작' });
    const list = h('ul.k-upq', {}, ...ok.map((p) => h('li', {}, h('b', { text: p.file.name, 'data-lint-skip': '' }), h('span', { text: MBf(p.file.size) }))));
    const box = h('div.k-upq-w', {}, list, h('p.k-upq-n', { text: `${ok.length}개 · ${GB(tot)} · 예상 약 ${durWord(est(tot / SPEED))} — 따로 열리는 업로드 창이 올립니다. 그 창을 열어 두면 다른 화면에서 일해도 계속 올라갑니다.` }), go);
    el.querySelector('.k-upq-w')?.remove();
    zone.after(box);
    go.addEventListener('click', async () => {
      go.disabled = true; go.textContent = '업로드 창에 맡기는 중';
      const done = await startUploads(ok, pur);
      if (done) onAdded?.(true); else { go.disabled = false; go.textContent = '업로드 시작'; }
    });
  }
  async function pick() {
    if (window.showOpenFilePicker) {                     // 손잡이로 고르면 다른 화면에서도 이어 올린다(파일을 복사하지 않음)
      try {
        const hs = await window.showOpenFilePicker({ multiple: !one, excludeAcceptAllOption: false, types: [{ description: '영상 파일', accept: { 'application/octet-stream': allow.filter((e) => !e.includes('.')).map((e) => '.' + e) } }] });
        take(await Promise.all(hs.map(async (hd) => ({ file: await hd.getFile(), handle: hd }))));
        return;
      } catch (e) { if (e?.name === 'AbortError') return; }
    }
    input.click();
  }
  input.addEventListener('change', () => { take([...input.files].map((file) => ({ file }))); input.value = ''; });
  zone.addEventListener('click', pick);
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('is-over');
    const items = [...(e.dataTransfer?.items || [])].filter((i) => i.kind === 'file');
    const hs = items.map((i) => (i.getAsFileSystemHandle ? i.getAsFileSystemHandle() : null));   // 놓는 순간에 받아야 한다(뒤에서는 못 받음)
    const files = items.map((i) => i.getAsFile());
    Promise.all(hs.map((p) => (p ? p.catch(() => null) : null))).then((handles) => take(files.map((file, i) => ({ file, handle: handles[i]?.kind === 'file' ? handles[i] : null })).filter((x) => x.file)));
  });
  function drawHeld() {
    el.querySelector('.k-upq-w')?.remove();
    if (!held.length) return;
    const tot = held.reduce((a, p) => a + p.file.size, 0);
    const list = h('ul.k-upq', {}, ...held.map((p) => h('li', {}, h('b', { text: p.file.name, 'data-lint-skip': '' }), h('span', {}, MBf(p.file.size) + ' ',
      h('button.k-upq-x', { type: 'button', 'aria-label': `${p.file.name} 빼기`, text: '×', onclick: () => { held = held.filter((q) => q !== p); drawHeld(); onPicks?.(held.slice()); } })))));
    zone.after(h('div.k-upq-w', {}, list, h('p.k-upq-n', { text: `${held.length}개 · ${GB(tot)} · 예상 약 ${durWord(est(tot / SPEED))} — 만들면 따로 열리는 업로드 창이 올립니다` })));
  }
  return { pick, picks: () => held.slice(), clear: () => { held = []; drawHeld(); } };
}
let pcss = false;
function pstyle() {
  if (pcss) return; pcss = true;
  document.head.append(Object.assign(document.createElement('style'), { textContent: `
.k-upp{display:flex;flex-direction:column;gap:12px}
.k-upg{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 16px;margin:0;padding:12px 16px;background:var(--bg-0);border-radius:var(--r-8)}
.k-upg dt{font:600 var(--fs-aux)/21px var(--font-body);color:var(--ink);white-space:nowrap}
.k-upg dd{margin:0;font:400 var(--fs-aux)/21px var(--font-body);color:var(--sub);word-break:keep-all}
.k-upg dd small{display:block;font-size:var(--fs-tag);line-height:20px}
.k-upg-k{white-space:nowrap}
.k-upp .k-drop{min-height:104px;padding:16px}
.k-upq-w{display:flex;flex-direction:column;gap:8px}
.k-upq{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.k-upq li{display:flex;justify-content:space-between;gap:12px;padding:8px 12px;border-radius:var(--r-8);background:var(--bg-0);font:400 var(--fs-aux)/21px var(--font-body);color:var(--sub)}
.k-upq b{font-weight:500;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.k-upq-n{margin:0;font:400 var(--fs-aux)/21px var(--font-body);color:var(--sub);word-break:keep-all}
.k-upq-w .t-btn{align-self:flex-end}
.k-upq-x{margin-left:6px;padding:0 4px;border:0;background:none;color:var(--sub);cursor:pointer;font:500 var(--fs-aux)/1 var(--font-body)}
@media (max-width:640px){.k-upg{grid-template-columns:minmax(0,1fr);gap:2px}.k-upg dd{margin-bottom:6px}}` }));
}
