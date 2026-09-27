/* 매칭 사다리 — PNU 19자리 직접 → 지번 문자열 해석(읍면동·리 → V-World 로 법정리 코드 1회) → 행별 V-World 조회 → 미결합(사유 1줄).
   V-World 는 게이트웨이 프록시(/proxy/vworld/search)로만 부른다(키는 서버에). */
import { api } from '../kit/util.js';

const pad4 = (s) => String(s || '0').padStart(4, '0');
const RE_JIBUN = /^(산\s*)?(\d{1,4})(?:-(\d{1,4}))?$/;

export function parseAddr(addr, jibunCell) {
  const t = String(addr || '').trim().split(/\s+/).filter(Boolean);
  let emd = '', ri = '', rest = [], pre = [];
  for (const w of t) {
    if (!emd && /(시|군|구)$/.test(w)) { pre.push(w); continue; }
    if (!emd && /[가-힣\d]+(읍|면|동|가)$/.test(w) && !/(시|군|구|도)$/.test(w)) { emd = w; continue; }
    if (emd && !ri && /[가-힣\d]+리$/.test(w)) { ri = w; continue; }
    if (emd) rest.push(w);
  }
  let jb = String(jibunCell ?? '').trim() || rest.join(' ');
  jb = jb.replace(/\s*번지$/, '').replace(/^산\s*/, '산 ').trim();
  const m = jb.match(RE_JIBUN);
  return { pre: pre.join(' '), emd, ri, key: (emd + ' ' + ri).trim(), jb: m ? (m[1] ? '산 ' : '') + m[2] + (m[3] ? '-' + m[3] : '') : null, san: !!(m && m[1]), bon: m && m[2], bu: m && m[3] };
}

async function vwSearch(q) {
  const qs = new URLSearchParams({ service: 'search', request: 'search', version: '2.0', size: '5', query: q, type: 'address', category: 'parcel', format: 'json' });
  const j = await api('/proxy/vworld/search?' + qs.toString());
  const it = j && j.response && j.response.result && j.response.result.items;
  return Array.isArray(it) ? it : [];
}

async function pool(items, n, fn) {
  const q = items.slice(); const out = [];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) { const it = q.shift(); out.push(await fn(it)); } }));
  return out;
}

/**
 * rows(대장 행) · cols(열 뜻) · region({name, sgg, emdBBox(cd)→bbox}) · index(AiIndex|null)
 * → { rows:[{i, pnu, how, why}], counts:{direct, jibun, vworld, miss}, reasons }
 */
export async function matchLedger({ rows, cols, region, index, onStep }) {
  const pcol = (cols.find((c) => c.role === 'pnu') || {}).col;
  const jcols = cols.filter((c) => c.role === 'jibun').map((c) => c.col);
  const where = (a) => `${a.pre || region.name} ${a.key} ${a.jb}`;
  const res = rows.map((_, i) => ({ i, pnu: null, how: null, why: null, cand: null }));
  const C = { direct: 0, jibun: 0, vworld: 0, miss: 0 };
  const step = (phase, extra = {}) => onStep && onStep({ phase, counts: { ...C }, total: rows.length, ...extra });

  // ① PNU 직접
  const keyRows = new Map();
  rows.forEach((r, i) => {
    const p = pcol ? String(r[pcol] ?? '').replace(/\D/g, '') : '';
    if (p.length === 19) { res[i].cand = p; res[i].how = 'direct'; return; }
    const a = parseAddr(jcols.map((c) => String(r[c] ?? '').trim()).filter(Boolean).join(' '), '');
    if (!a.emd || !a.jb) { res[i].why = '지번 형식'; return; }
    res[i].a = a;
    if (!keyRows.has(a.key)) keyRows.set(a.key, []);
    keyRows.get(a.key).push(i);
  });
  step('keys', { keys: keyRows.size });

  // ② 지번 해석 — 법정리(읍면동+리)마다 V-World 한 번으로 10자리 코드를 얻는다
  const prefix = new Map();
  const pts = [];   // 해석된 법정리의 대표 위치(AI 색인이 없는 관할에서 카메라가 대장 쪽으로 간다)
  await pool([...keyRows.keys()], 6, async (key) => {
    const idx = keyRows.get(key);
    for (const i of idx.slice(0, 3)) {
      const a = res[i].a;
      let items = [];
      try { items = await vwSearch(where(a)); } catch { /* 다음 행 */ }
      const hit = items.find((it) => String(it.address && it.address.parcel || '').includes(key)) || null;
      if (hit && /^\d{19}$/.test(hit.id)) { prefix.set(key, hit.id.slice(0, 10)); if (hit.point) pts.push([+hit.point.x, +hit.point.y]); break; }
    }
    step('keys', { keys: keyRows.size, resolved: prefix.size });
  });
  for (const [key, idx] of keyRows) {
    const pf = prefix.get(key);
    for (const i of idx) {
      if (!pf) { res[i].why = '소재지 확인 불가'; continue; }
      const a = res[i].a; res[i].cand = pf + (a.san ? '2' : '1') + pad4(a.bon) + pad4(a.bu); res[i].how = 'jibun';
    }
  }

  // 관할 확인
  const own = [].concat(region.sgg || []);
  for (const r of res) if (r.cand && own.length && !own.some((c) => r.cand.startsWith(c))) { r.why = '관할 밖'; r.cand = null; r.how = null; }

  // ③ AI 색인 적재(대장이 걸친 읍면동만)
  if (index) {
    const emds = [...new Set(res.filter((r) => r.cand).map((r) => r.cand.slice(0, 8)))];
    const bbs = emds.map((cd) => region.emdBBox(cd)).filter(Boolean);
    step('tiles', { emds: emds.length });
    await index.load(bbs, (d, n) => step('tiles', { emds: emds.length, tiles: d, tilesN: n }));
  }

  // ④ 확인 · 행별 V-World 조회(색인에 없는 후보)
  const retry = [];
  for (const r of res) {
    if (!r.cand) continue;
    if (!index || index.get(r.cand)) { r.pnu = r.cand; C[r.how]++; }
    else if (r.a) retry.push(r);
    else { r.why = '연속지적에 없음'; }
  }
  step('verify');
  await pool(retry.slice(0, 400), 8, async (r) => {
    let items = [];
    try { items = await vwSearch(where(r.a)); } catch { /* */ }
    const exact = items.find((it) => /^\d{19}$/.test(it.id) && String(it.address && it.address.parcel || '').replace(/\s+/g, ' ').endsWith(`${r.a.key} ${r.a.jb}`.replace(/\s+/g, ' ')));
    if (exact && (!index || index.get(exact.id))) { r.pnu = exact.id; r.how = 'vworld'; C.vworld++; }
    else r.why = exact ? 'AI 판독 범위 밖' : '연속지적에 없음';
    step('vworld');
  });
  for (const r of retry.slice(400)) r.why = '연속지적에 없음';
  for (const r of res) if (!r.pnu) { r.how = null; C.miss++; }
  const reasons = {};
  for (const r of res) if (!r.pnu) reasons[r.why || '기타'] = (reasons[r.why || '기타'] || 0) + 1;
  step('done');
  return { rows: res, counts: C, reasons, pts: pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) };
}
