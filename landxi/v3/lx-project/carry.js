/* carry.js — 새 프로젝트 창에서 올리던 영상을 창을 닫고 넘어가도 뒤에서 이어 올린다(원칙 220 · 10-12).
   새 프로젝트 창(new.js)이 '만들기' 때 아직 다 올라가지 않은 파일을 이 브라우저 보관함(IndexedDB — 파일 그대로)에 맡기고 바로 '학습데이터 구축'으로 넘어간다.
   그 프로젝트의 단계 화면(학습데이터 구축 · 학습 · 데이터 올리기 …)이 열리면 마스트 아래 단계 막대 밑에 한 줄로 이어 올린다:
     같은 묶음 · 같은 파일 → 서버가 받은 자리부터(kit/dropzone.js 와 같은 조각 올리기 약속 · /catalog/imagery/uploads) →
     다 올리면 영상 등록(POST /catalog/imagery {draft_id}) → 이 프로젝트에 잇기(POST /projects/{id}/imagery — 대상 지역 = 영상 자리).
   맡긴 파일은 끝나면 지운다. 이 브라우저를 닫았다 열어도 같은 프로젝트 화면에서 이어 간다. 보관함을 못 쓰면 '데이터 올리기'에서 다시 고르게 안내. */
import { h, api, API, session } from '../kit/util.js';

const DB = 'lx-carry', ST = 'up', KEY = 'lx-carry';
const BASE = '/catalog/imagery/uploads';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function db() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(ST, { keyPath: 'pid' });
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(ST, mode);
    const out = fn(t.objectStore(ST));
    t.oncomplete = () => { d.close(); res(out?.result); };
    t.onerror = () => { d.close(); rej(t.error); };
  });
}
const listed = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const mark = (pid, on) => { try { const s = new Set(listed()); if (on) s.add(pid); else s.delete(pid); localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* */ } };
export const hasCarry = (pid) => !!pid && listed().includes(pid);

/** 맡기기 — files: [{file, done}] (done = 이미 다 올린 파일 · 등록 때 묶음에 들어 있음) · draft = 서버 묶음(없으면 이어 올릴 때 새로) */
export async function stash(pid, draft, files) {
  await tx('readwrite', (s) => s.put({ pid, draft: draft || null, files: files.map((x) => ({ file: x.file, name: x.file.name, size: x.file.size, done: !!x.done })), at: Date.now() }));
  mark(pid, true);
}
async function take(pid) { return tx('readonly', (s) => s.get(pid)); }
async function drop(pid) { mark(pid, false); try { await tx('readwrite', (s) => s.delete(pid)); } catch { /* */ } }
async function save(rec) { try { await tx('readwrite', (s) => s.put(rec)); } catch { /* */ } }

/** 이어 올리기 — host = 단계 화면의 마스트 아래 자리(S.sub) · pr = 프로젝트. 한 줄(글 + 진행 막대)을 그 자리에 둔다. */
export async function resumeCarry(host, pr, { onDone } = {}) {
  if (!host || !hasCarry(pr?.id) || host.querySelector('.lxp-carry')) return;
  const text = h('span.lxp-carry-t', { role: 'status' });
  const bar = h('div.t-progress.lxp-carry-b', { role: 'progressbar', 'aria-label': '영상 올리기 진행', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: '0%' } }));
  const act = h('span.lxp-carry-a');
  const line = h('div.lxp-carry', {}, text, bar, act);
  host.append(line);
  const say = (t, pct = null, more = null) => {
    text.textContent = t;
    bar.hidden = pct === null;
    if (pct !== null) { bar.firstChild.style.width = Math.max(2, pct) + '%'; bar.setAttribute('aria-valuenow', String(pct)); }
    act.replaceChildren(...(more ? [more] : []));
  };
  let rec;
  try { rec = await take(pr.id); } catch { rec = null; }
  if (!rec?.files?.length || rec.files.some((f) => !f.done && !(f.file instanceof Blob))) {
    await drop(pr.id);
    say('올리던 영상을 이 브라우저에서 찾지 못했습니다 · 데이터 올리기에서 다시 골라 주세요', null);
    return;
  }
  const total = rec.files.reduce((a, f) => a + f.size, 0);
  let sent = rec.files.filter((f) => f.done).reduce((a, f) => a + f.size, 0);
  const tok = () => session.get()?.token;
  const pctOf = () => Math.round((sent / Math.max(1, total)) * 100);
  const n = rec.files.length;
  const run = async () => {
    try {
      let i = 0;
      for (const f of rec.files) {
        i++;
        if (f.done) continue;
        say(`영상 파일 올리는 중 · ${i}/${n}`, pctOf());
        const st = await api(BASE, { method: 'POST', body: { draft_id: rec.draft || undefined, filename: f.name, size: f.size } });
        if (st.draft_id && st.draft_id !== rec.draft) { rec.draft = st.draft_id; await save(rec); }
        let at = st.bytes || 0, chunk = Math.min(st.chunk?.max?.size || 8 * 1048576, st.chunk?.size || 1048576), fails = 0;
        sent += at;
        while (at < f.size) {
          const end = Math.min(f.size, at + chunk);
          let r = null, j = null;
          try {
            r = await fetch(API.prefix + `${BASE}/${encodeURIComponent(st.id)}?offset=${at}`, { method: 'PUT', body: f.file.slice(at, end),
              headers: { 'content-type': 'application/octet-stream', ...(tok() ? { authorization: 'Bearer ' + tok() } : {}) } });
            j = await r.json().catch(() => null);
          } catch { r = null; }
          if (r && r.ok && j) { sent += j.bytes - at; at = j.bytes; fails = 0; }
          else if (r && r.status === 409 && j?.error?.detail?.bytes != null) { sent += j.error.detail.bytes - at; at = j.error.detail.bytes; }
          else if (r && [400, 401, 403, 404, 413].includes(r.status)) throw Object.assign(new Error(j?.error?.message || '올리지 못했습니다'), { hard: true });
          else { if (++fails > 5) throw new Error('연결이 여러 번 끊겼습니다'); await sleep(1500 * fails); }
          say(`영상 파일 올리는 중 · ${i}/${n}`, pctOf());
        }
        await api(`${BASE}/${encodeURIComponent(st.id)}/finish`, { method: 'POST', body: {} });
        f.done = true;
        await save(rec);
      }
      say('올린 영상을 살펴보고 등록하는 중', 100);
      const reg = await api('/catalog/imagery', { method: 'POST', body: { draft_id: rec.draft } });
      const ids = (reg.items || []).map((x) => x.id);
      const out = ids.length ? await api(`/projects/${encodeURIComponent(pr.id)}/imagery`, { method: 'POST', body: { imagery: ids } }) : pr;
      await drop(pr.id);
      const where = (out.regions || []).map((g) => g.name).join(' · ');
      say(`영상 ${ids.length}장을 등록했습니다${where ? ` · 대상지 ${where}` : ''}`, null);
      onDone?.(out);
      setTimeout(() => line.remove(), 8000);
    } catch (e) {
      const retry = h('button.lxp-carry-r', { type: 'button', text: '다시 시도', onclick: () => run() });
      say(`영상을 다 올리지 못했습니다${e?.hard && e.message ? ` · ${e.message}` : ''}`, null, retry);
    }
  };
  run();
}
