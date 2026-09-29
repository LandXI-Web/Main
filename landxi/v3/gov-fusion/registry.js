/* 대장 반입 — 명세 §2.9 · §3 S-2. 서버 기록이 정본, 이 창의 IndexedDB 는 캐시.
   반입: POST /t/{tenant}/survey/registry/import(multipart) → POST …/{import_id}/confirm{mapping} → GET …/{import_id}
   이어 열기: GET …/registry?latest=1 → GET …/{import_id} — 어느 반입을 여는지는 서버 기록이 정한다.
   화면의 필지 잇기(PNU → 지번 → V-World)는 브라우저가 먼저 끝낸다(표·질문·지도가 행 단위로 움직인다). 서버에는 행 목록을 돌려주는
   API 가 아직 없어(보고서 '서버 요청'), 행 · 필지 잇기 결과 · AI 판독 색인 조각은 서버 import_id 를 열쇠로 캐시한다.
   다른 기기(캐시 없음)에서는 서버 기록(파일 · 결합률 · 미결합 · 읍면별 결합)을 그대로 연다.
   대장 종류 = 카드 ledger_schema(S-6). 기관 세션이 읽을 GET 이 계약에 없으면 이 기관 배포 카드로 고른다. */
import { api, API, session } from '../kit/util.js';
import { readLedger, guessColumns } from './ledger.js';

const DB = 'landxi-gov-fusion', ST = 'imports', VER = 3;
const idb = () => new Promise((res, rej) => {
  let rq; try { rq = indexedDB.open(DB, VER); } catch (e) { rej(e); return; }
  rq.onupgradeneeded = () => { const d = rq.result; for (const n of [...d.objectStoreNames]) d.deleteObjectStore(n); d.createObjectStore(ST); };
  rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
});
async function tx(mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction(ST, mode); const r = fn(t.objectStore(ST));
    t.oncomplete = () => { d.close(); res(r && 'result' in r ? r.result : undefined); };
    t.onerror = () => { d.close(); rej(t.error); };
  });
}
const uid = () => 'imp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/* 대장 종류 — 서버 kind ↔ 화면 말(명세 §2.9 문구) */
export const KIND_LABEL = { farm_ledger: '농지대장', dev_permit: '개발행위허가 대장', public_asset: '공유재산 대장', river_permit: '점용허가 대장', greenhouse: '시설 신고 대장' };
const KIND_CODE = Object.fromEntries(Object.entries(KIND_LABEL).map(([k, v]) => [v, k]));
const KIND_BY_CARD = { 'card-farm': 'farm_ledger', 'card-change': 'dev_permit', 'card-road': 'river_permit', 'card-marine': 'river_permit', 'card-living': 'greenhouse', 'card-crowd': 'public_asset' };
const KIND_ORDER = Object.keys(KIND_LABEL);
/** 올린 파일의 대장 종류 — 파일 이름 · 열 이름에서(없으면 null → 기관 카드 종류) */
export function kindOfFile(name, headers) {
  const s = String(name || '') + ' ' + (headers || []).join(' ');
  if (/농지|경작|자경|임차/.test(s)) return 'farm_ledger';
  if (/점용|하천|공유수면/.test(s)) return 'river_permit';
  if (/개발\s*행위|허가/.test(s)) return 'dev_permit';
  if (/공유\s*재산|국공유/.test(s)) return 'public_asset';
  if (/시설|비닐하우스|온실|축사/.test(s)) return 'greenhouse';
  return null;
}

/* 계약(openapi) — 경로 × 메서드 */
let OA = null;
const routes = () => (OA ||= fetch(API.prefix + '/openapi.json', { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => j?.paths || {}).catch(() => ({})));
async function has(method, path) {
  const P = await routes();
  const want = path.split('?')[0];
  return Object.entries(P).some(([p, v]) => v && v[method] && new RegExp('^' + p.replace(/^\/api\/v1/, '').replace(/\{[^}]+\}/g, '[^/]+') + '$').test(want));
}

/** 대장 종류 — 이 기관 배포 카드의 ledger_schema.kind(S-6 · GET /t/{tenant}/survey/ledger-schema) → 없으면 이 기관 배포 카드 순서 */
export async function ledgerKind(cardIds, tenant) {
  const cards = [...new Set(cardIds)];
  let tiles;                                   // 정적 필지 층 주소(서버가 알려 줌 · undefined = 모름 → 예전처럼 확인)
  if (tenant && (await has('get', `/t/${tenant}/survey/ledger-schema`))) {
    try {
      const j = await api(`/t/${encodeURIComponent(tenant)}/survey/ledger-schema`);
      const k = (j?.kinds || []).filter((x) => KIND_LABEL[x]).sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))[0];
      tiles = 'parcel_tiles' in (j || {}) ? j.parcel_tiles : undefined;
      if (k) return { label: KIND_LABEL[k], from: 'ledger_schema', tiles };
    } catch { /* 카드 순서로 */ }
  }
  for (const cid of cards) {
    if (!(await has('get', `/registry/cards/${cid}/ledger_schema`))) break;
    try { const j = await api(`/registry/cards/${encodeURIComponent(cid)}/ledger_schema`); const k = j?.ledger_schema?.kind || j?.kind; if (KIND_LABEL[k]) return { label: KIND_LABEL[k], from: 'ledger_schema' }; } catch { /* 다음 카드 */ }
  }
  const code = cards.map((c) => KIND_BY_CARD[c]).filter(Boolean).sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))[0] || 'public_asset';
  return { label: KIND_LABEL[code], from: 'deploy_card', tiles };
}

/** 첫 페인트용 표시(동기) — 이 창에 최근 반입 캐시가 있는가(본문은 서버 · IndexedDB) */
export function lastMark(who) {
  try { return JSON.parse(localStorage.getItem('gf:last:' + slotOf(who)) || 'null'); } catch { return null; }
}
const slotOf = (who) => `${who.me.tenant_id}/${who.me.user?.id || '-'}`;

export async function ledgerStore(who) {
  const tenant = who.me.tenant_id;
  const slot = slotOf(who);
  const base = `/t/${encodeURIComponent(tenant)}/survey/registry`;
  const server = await has('post', base + '/import');
  const mark = (r) => { try { if (r) localStorage.setItem('gf:last:' + slot, JSON.stringify({ id: r.server_id || r.import_id, t: Date.now() })); else localStorage.removeItem('gf:last:' + slot); } catch { /* */ } };

  const rec = { cur: null };
  const store = {
    mode: server ? 'server' : 'local',
    /** 파일 → 202 모양 { import_id, rows, columns_guess } (읽기는 브라우저 · 성명·연락처 열은 읽지 않음) */
    async importFile(file, kind, onProg) {
      onProg?.(0.2);
      const L = await readLedger(file);
      onProg?.(0.8);
      const cols = guessColumns(L.headers, L.rows);
      rec.cur = { import_id: uid(), kind: KIND_LABEL[kindOfFile(L.name, L.headers)] || kind, name: L.name, headers: L.headers, rows: L.rows, columns_guess: cols, mapping: null, matched: null, unmatched: [], as_of: new Date().toISOString() };
      return { import_id: rec.cur.import_id, rows: L.rows.length, columns_guess: cols };
    },
    /** confirm{mapping} — 필지 잇기(matcher) → 계약 모양 */
    async confirm(id, mapping, matcher) {
      const r = rec.cur && rec.cur.import_id === id ? rec.cur : null; if (!r) throw new Error('not_found');
      r.mapping = mapping;
      const m = await matcher(r);
      r.match = m.rows.map((x) => x.pnu || null);
      r.matched = { value: r.rows.length - m.counts.miss, unit: '필지', basis: 'measured', as_of: new Date().toISOString(), source: 'ledger import × 연속지적', note: `대장 ${r.rows.length}행` };
      r.unmatched = m.rows.filter((x) => !x.pnu).map((x) => ({ row: x.i, reason: x.why || '기타' }));
      r.as_of = r.matched.as_of;
      r.pts = m.pts || [];
      rec.cur = r;
      return r;
    },
    /** 서버 반입(S-2) — 대장 전 행(뜻을 고른 열만 · 성명·연락처 0 · 결합된 행은 PNU 를 붙여) → import → confirm. 서버 import_id 를 돌려준다 */
    async serverSave(r, cols) {
      if (!server) return null;
      if (r.server_id) return r.server_id;
      const kind = KIND_CODE[r.kind] || 'farm_ledger';
      const q = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      // 지번 뜻 열이 여럿(소재지 + 지번)이면 이어 붙여 한 칸으로 — 서버가 '○○면 ○○리 123' 을 그대로 해석한다
      const jcols = cols.filter((c) => c.role === 'jibun').map((c) => c.col);
      const pick = { jibun: jcols.length ? jcols : null, status: cols.find((c) => c.role === 'state')?.col, date: cols.find((c) => c.role === 'date')?.col };
      const heads = ['PNU', ...(pick.jibun ? ['지번'] : []), ...(pick.status ? ['상태'] : []), ...(pick.date ? ['날짜'] : [])];
      const lines = [heads.join(',')];
      const jb = (row) => pick.jibun.map((c) => String(row[c] ?? '').trim()).filter(Boolean).join(' ');
      r.rows.forEach((row, i) => { lines.push([r.match[i] || '', ...(pick.jibun ? [jb(row)] : []), ...(pick.status ? [row[pick.status]] : []), ...(pick.date ? [row[pick.date]] : [])].map(q).join(',')); });
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('file', new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }), String(r.name || '대장.csv').replace(/\.csv$/i, '') + '.csv');   // 원래 이름을 남긴다(○○_농지목록.xlsx.csv → 화면은 .xlsx)
      const s = session.get();
      const res = await fetch(API.prefix + base + '/import', { method: 'POST', body: fd, headers: s ? { authorization: 'Bearer ' + s.token } : {} });
      if (!res.ok) throw new Error('import ' + res.status);
      const j = await res.json();
      const mp = { pnu: 'PNU' }; if (pick.jibun) mp.jibun = '지번'; if (pick.status) mp.status = '상태'; if (pick.date) mp.date = '날짜';
      await api(`${base}/${encodeURIComponent(j.import_id)}/confirm`, { method: 'POST', body: { mapping: mp } });
      r.server_id = j.import_id;
      await this.save(r);
      return j.import_id;
    },
    /** 서버 기록 한 건 */
    detail: (id) => api(`${base}/${encodeURIComponent(id)}?limit=1000`),
    /** 이어 열기 — 서버 최근 반입(정본) + 이 창의 캐시.
        → { rec, server, from } · rec = 행이 있는 캐시(없으면 null) · server = GET …/{import_id} 기록 · from = 'server+cache' | 'server' | 'cache' */
    async resume() {
      const local = await this.latest();
      if (!server) return local ? { rec: local, server: null, from: 'cache' } : null;
      let items = [];
      try { items = ((await api(base + '?latest=1')) || {}).items || []; } catch { return local ? { rec: local, server: null, from: 'cache' } : null; }
      const srv = items.filter((x) => x.state === 'matched').sort((a, b) => String(b.confirmed_at || b.created_at).localeCompare(String(a.confirmed_at || a.created_at)))[0] || null;
      // 이 창이 방금 올린 반입이 아직 서버에서 결합 중이면(최근 반입으로 오르기 전) 그 반입을 그대로 연다
      if (local?.server_id && (!srv || srv.import_id !== local.server_id)) {
        const d = await this.detail(local.server_id).catch(() => null);
        if (d && (d.state === 'matching' || d.state === 'uploaded' || (d.state === 'matched' && (!srv || String(d.created_at) >= String(srv.created_at))))) return { rec: local, server: d, from: 'server+cache' };
      }
      if (srv) {
        const d = await this.detail(srv.import_id).catch(() => srv);
        if (local?.server_id === srv.import_id) return { rec: local, server: d, from: 'server+cache' };
        return { rec: null, server: d, from: 'server' };
      }
      if (local && !local.server_id) return { rec: local, server: null, from: 'cache' };   // 서버 반입이 실패했던 창 — 이 창의 캐시만
      return null;
    },
    async latest() { try { return (await tx('readonly', (s) => s.get(slot))) || null; } catch { return null; } },
    async save(r) { try { await tx('readwrite', (s) => s.put(r, slot)); mark(r); } catch { /* 저장 불가 창 — 이번 방문만 */ } },
    async forget() { try { await tx('readwrite', (s) => s.delete(slot)); } catch { /* */ } mark(null); },
  };
  return store;
}
