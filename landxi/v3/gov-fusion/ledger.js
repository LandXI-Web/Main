/* 대장 반입(브라우저 안) — XLSX · CSV 를 읽어 {headers, rows} 로. 외부 라이브러리 0.
   XLSX = zip(deflate) · DecompressionStream('deflate-raw') 로 풀고 sharedStrings + 첫 시트만 읽는다.
   성명 열은 읽지 않는다(열 이름에 성명·소유자·주민이 들어가면 버린다). */

const DROP_COLS = /성명|소유자\s*명|주민|전화|연락처/;

export async function readLedger(file) {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  let table;
  if (u8[0] === 0x50 && u8[1] === 0x4b) table = await readXlsx(u8);
  else table = readCsv(decodeText(u8));
  // 머리행: 첫 번째로 칸이 2개 이상 찬 행
  let hi = table.findIndex((r) => r.filter((c) => String(c ?? '').trim()).length >= 2);
  if (hi < 0) throw new Error('표를 찾지 못했습니다');
  const raw = table[hi].map((h, i) => String(h ?? '').trim() || `열${i + 1}`);
  const keep = raw.map((h) => !DROP_COLS.test(h));
  const headers = raw.filter((_, i) => keep[i]);
  const rows = [];
  for (let r = hi + 1; r < table.length; r++) {
    const src = table[r]; if (!src || !src.some((c) => String(c ?? '').trim())) continue;
    const o = {}; let j = 0;
    raw.forEach((h, i) => { if (keep[i]) o[headers[j++]] = src[i] ?? ''; });
    rows.push(o);
  }
  return { name: file.name, headers, rows, dropped: raw.filter((_, i) => !keep[i]) };
}

/* ── 글자 인코딩: UTF-8 먼저, 깨지면 EUC-KR(공공 CSV 관례) ── */
function decodeText(u8) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); }
  catch { return new TextDecoder('euc-kr').decode(u8); }
}

function readCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false;
  const sep = (text.split('\n', 1)[0].match(/\t/g) || []).length > (text.split('\n', 1)[0].match(/,/g) || []).length ? '\t' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); out.push(row); }
  return out;
}

/* ── XLSX ── */
async function readXlsx(u8) {
  const files = unzipIndex(u8);
  const text = async (name) => { const e = files.get(name); return e ? new TextDecoder().decode(await inflate(u8, e)) : null; };
  const ss = await text('xl/sharedStrings.xml');
  const shared = ss ? [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1])) : [];
  let sheet = 'xl/worksheets/sheet1.xml';
  const wb = await text('xl/workbook.xml'); const rels = await text('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const rid = (wb.match(/<sheet\b[^>]*r:id="([^"]+)"/) || [])[1];
    const tgt = rid && (rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`)) || [])[1];
    if (tgt) sheet = 'xl/' + tgt.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const xml = await text(sheet);
  if (!xml) throw new Error('시트를 찾지 못했습니다');
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = [];
    if (rm[1]) for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]; const body = cm[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
      const col = ref ? colIndex(ref) : r.length;
      const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      let v = '';
      if (t === 'inlineStr') v = xmlText(body);
      else {
        const vm = body.match(/<v>([\s\S]*?)<\/v>/); const raw = vm ? unesc(vm[1]) : '';
        v = t === 's' ? (shared[+raw] ?? '') : t === 'str' || t === 'b' ? raw : raw === '' ? '' : Number(raw);
      }
      r[col] = v;
    }
    rows.push(r);
  }
  return rows;
}
const colIndex = (s) => [...s].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const xmlText = (s) => unesc([...s.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

function unzipIndex(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('XLSX 형식이 아닙니다');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const map = new Map(); const td = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    map.set(td.decode(u8.subarray(p + 46, p + 46 + nl)), { method, csize, off });
    p += 46 + nl + xl + cl;
  }
  return map;
}
async function inflate(u8, e) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
  const data = u8.subarray(start, start + e.csize);
  if (e.method === 0) return data;
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([data]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/* ── 열 뜻 추정 ── */
export const ROLES = [
  ['pnu', '필지번호'], ['addr', '소재지'], ['jibun', '지번'], ['jimok', '지목'], ['area', '면적'], ['attr', '참고'], ['skip', '쓰지 않음'],
];
export const JIMOK = ['전', '답', '과수원', '목장용지', '임야', '광천지', '염전', '대', '공장용지', '학교용지', '주차장', '주유소용지', '창고용지', '도로', '철도용지', '제방', '하천', '구거', '유지', '양어장', '수도용지', '공원', '체육용지', '유원지', '종교용지', '사적지', '묘지', '잡종지', '과'];

export function guessColumns(headers, rows) {
  const sample = rows.slice(0, 400);
  const frac = (h, re) => { let n = 0, m = 0; for (const r of sample) { const v = String(r[h] ?? '').trim(); if (!v) continue; m++; if (re.test(v)) n++; } return m ? n / m : 0; };
  const used = new Set();
  const out = headers.map((h) => {
    const vals = sample.map((r) => String(r[h] ?? '').trim()).filter(Boolean);
    let role = 'attr';
    if (/연번|순번|번호$/.test(h) && !/지번|필지|고유/.test(h) && frac(h, /^\d{1,6}$/) > 0.9) role = 'skip';
    else if (frac(h, /^\d{19}$/) > 0.8 || /PNU|고유번호|필지번호/i.test(h)) role = 'pnu';
    else if (/소재|주소|위치/.test(h) || frac(h, /[가-힣]+(읍|면|동|리|가)(\s|$)/) > 0.8) role = 'addr';
    else if (/지번/.test(h) || frac(h, /^(산\s*)?\d+(-\d+)?$/) > 0.9) role = 'jibun';
    else if (/지목/.test(h) || (vals.length && vals.filter((v) => JIMOK.includes(v)).length / vals.length > 0.9)) role = 'jimok';
    else if (/면적/.test(h) && frac(h, /^[\d.,]+$/) > 0.8) role = 'area';
    if (['pnu', 'addr', 'jibun', 'jimok', 'area'].includes(role)) { if (used.has(role)) role = 'attr'; used.add(role); }
    return { col: h, role, sample: vals.slice(0, 1)[0] ?? '' };
  });
  return out;
}

/** 대장 종류(카드의 ledger_schema.kind) — 지목 값 분포로 */
export function ledgerKind(cols, rows) {
  const j = cols.find((c) => c.role === 'jimok'); if (!j) return 'generic';
  const vs = rows.slice(0, 2000).map((r) => String(r[j.col] ?? '').trim()).filter(Boolean);
  const farm = vs.filter((v) => ['전', '답', '과수원', '과'].includes(v)).length;
  return vs.length && farm / vs.length > 0.8 ? 'farm_ledger' : 'generic';
}
