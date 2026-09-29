/* report-draft.js — 보고서 서랍 '초안 작성' 탭의 F2-A 몫(F2-E 에이전트가 XI.provide('report-draft') 로 맡으면 그쪽이 그린다).
   F2-S 경로가 있으면 GET /survey/reports/draft?format=docx(서버 · python-docx · LLM 없이)를 그대로 내려받고,
   없으면 같은 서식(survey-emd)을 이 브라우저에서 실데이터로 조립해 .docx(OOXML · 무압축 zip)를 만든다 — 어느 경우에도 버튼은 닫힌다.
   고정 문구: 'AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님'. 숫자는 전부 봉투(화면) · 문서에는 출처 줄. 성명 열 0. */
import { E, loadLite, loadEmd, loadRules, stateOf, STATE_KO, draftDocx, routeOn, routeNote } from './api-survey.js';
import { numHtml } from '../fx/provenance.js';
import { toast } from '../fx/glass.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FIXED = 'AI 추론 · 결과 확인 전 · 현장 확인 전 · 위법 판정 아님 — 현장조사 대상 후보 목록이며 행정 처분의 근거가 아니다.';

/** 초안 데이터(서버 draft json 과 같은 뼈대) */
export async function draftData({ emd_cd = '', rule = '', top = 20 }) {
  const [L, M, R] = await Promise.all([loadLite(), loadEmd(), loadRules()]);
  const rows = (L?.items || []).filter((f) => (!emd_cd || f.emd_cd === emd_cd) && (!rule || f.rule === rule));
  const byRule = {}, byPrio = { A: 0, B: 0, C: 0 }, byState = {};
  for (const f of rows) { (byRule[f.rule] ||= { A: 0, B: 0, C: 0, n: 0 }); byRule[f.rule][f.priority]++; byRule[f.rule].n++; byPrio[f.priority]++; const s = stateOf(f); byState[s] = (byState[s] || 0) + 1; }
  const emd = M?.rows.find((r) => r.emd_cd === emd_cd);
  const topRows = [...rows].sort((a, b) => b.score - a.score || a.rank - b.rank).slice(0, top);
  return {
    title: `실태조사 초안 · ${emd ? emd.emd : '남원시 전역'} · ${rule ? `${rule} ${R?.items.find((r) => r.id === rule)?.name || ''}` : '규칙 R1–R6'}`,
    emd, rule, top, n: rows.length, parcels: new Set(rows.map((f) => f.pnu)).size, emdParcels: emd?.parcels ?? M?.totals.parcels, byRule, byPrio, byState, topRows,
    rules: R?.items || [], as_of: '2026-09-24', source: 'findings-lite.json · findings-emd.json(02. 데이터/survey 사본)',
  };
}

export async function renderDraft(slot, q = {}) {
  slot.innerHTML = '<p class="xi-hint">초안 만드는 중 · 실데이터</p>';
  const d = await draftData(q);
  const src = d.source;
  const pct = d.emdParcels ? ((d.parcels / d.emdParcels) * 100).toFixed(1) : null;
  const ruleRows = Object.entries(d.byRule).sort();
  slot.innerHTML = `
    <h2>${esc(d.title)}</h2>
    <p class="xi-hint">서식 survey-emd · 영상 2023 25cm 항공 · 2025 LX 드론(A02) · 대장 V-World 연속지적 2026-09-24 · 규칙 v1.0 · 임계 <b data-basis="estimate">추정</b> 초기값</p>
    <div class="sv-dl"><button type="button" class="xi-btn xi-btn--ink sv-docx">.docx 내려받기</button><button type="button" class="xi-btn xi-btn--br sv-dcsv">CSV(BOM)</button><small class="sv-dvia">${routeOn() ? 'GET /survey/reports/draft?format=docx(F2-S · LLM 없이)' : `브라우저 조립 .docx · ${esc(routeNote())}`}</small></div>
    <h3>1. 개요</h3>
    <p>${esc(d.emd ? d.emd.emd : '남원시')} 필지 ${numHtml(E(d.emdParcels, '필지', 'recorded', 'V-World 연속지적 2026-09-24'), { unit: false })}필지를 2023 AI 분석 결과와 대조한 결과, 규칙 ${esc(d.rule || 'R1–R6')}에 해당하는 의심 ${numHtml(E(d.n, 'count', 'inferred', src), { unit: false })}건(${numHtml(E(d.parcels, '필지', 'inferred', src), { unit: false })}필지${pct ? ` · ${pct}%` : ''})이 현장조사 대상 후보로 추출되었다.</p>
    <h3>2. 집계 · 규칙 × 등급 × 상태</h3>
    <table class="xi-table"><thead><tr><th>규칙</th><th class="r">A</th><th class="r">B</th><th class="r">C</th><th class="r">계</th></tr></thead><tbody>
      ${ruleRows.map(([k, v]) => `<tr><td>${esc(k)} ${esc(d.rules.find((r) => r.id === k)?.name || '')}</td>${['A', 'B', 'C'].map((p) => `<td class="r">${numHtml(E(v[p], 'count', 'inferred', src), { unit: false })}</td>`).join('')}<td class="r">${numHtml(E(v.n, 'count', 'inferred', src), { unit: false })}</td></tr>`).join('')}</tbody></table>
    <p class="xi-hint">상태 ${Object.entries(d.byState).map(([k, v]) => `${STATE_KO[k]} ${v.toLocaleString('ko-KR')}`).join(' · ')}</p>
    <h3>3. 의심 상위 ${d.topRows.length}</h3>
    <table class="xi-table"><thead><tr><th>#</th><th>PNU · 지번</th><th>지목</th><th>규칙</th><th class="r">근거㎡</th><th class="r">신뢰도</th><th>상태</th></tr></thead><tbody>
      ${d.topRows.map((f, i) => `<tr><td>${i + 1}</td><td><span class="mono">${esc(f.pnu)}</span><br>${esc(f.emd)} ${esc(f.ri)} ${esc(f.jibun)}</td><td>${esc(f.jimok)}</td><td>${esc(f.rule)} ${esc(f.priority)}</td><td class="r">${numHtml(E(Math.round(f.evid_m2), 'm2', 'inferred', src), { unit: false })}</td><td class="r">${numHtml(E(f.conf, 'ratio', 'inferred', src), { unit: false, digits: 2 })}</td><td>${esc(STATE_KO[stateOf(f)])}</td></tr>`).join('')}</tbody></table>
    <h3>4. 근거 영상</h3><p>2023 항공정사 25cm(전북 비도시 도엽) · AI 4클래스 재추론(aerial25/best · 검수 전). 드론 AOI(덕과면 0.8×0.9 km) 안은 2025-04/06/08/10 4시점, 밖은 2023 · 2025 두 시점.</p>
    <h3>5. 법적 근거</h3><p><span class="cw-void xi-void">법령 인용 · 2차(법령 RAG) — 농지법 §54 등 [법령 확인]</span></p>
    <h3>6. 조치 제안</h3><p>상위 등급(A)부터 현장조사 배정 → 현장 확인(사진·GPS) → 판정 입력. 건축물대장·농지전용 허가 대장과 먼저 대조하면 R1·R6 오탐을 줄일 수 있다.</p>
    <p class="sv-fixed">${esc(FIXED)}</p>`;
  slot.querySelector('.sv-docx').addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    let file = routeOn() ? await draftDocx(q) : null;
    let via = 'F2-S 서버 docx';
    if (!file) { file = { blob: buildDocx(d), name: `실태조사_초안_${d.emd ? d.emd.emd : '남원'}_${d.rule || '전체'}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.docx` }; via = '브라우저에서 만든 docx'; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file.blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`${file.name} · ${via}`, { basis: via.startsWith('F2-S') ? null : 'demo' });
    document.documentElement.dataset.docx = file.name; b.disabled = false;
    slot.dataset.docx = via;
  });
  slot.querySelector('.sv-dcsv').addEventListener('click', () => {
    const cols = ['순위', '등급', '점수', '규칙', 'PNU', '읍면동', '리', '지번', '지목', '필지면적_m2', '근거면적_m2', '신뢰도', '상태'];
    const rows = d.topRows.map((f) => [f.rank, f.priority, f.score, f.rule, f.pnu, f.emd, f.ri, f.jibun, f.jimok, f.parcel_m2, f.evid_m2, f.conf, STATE_KO[stateOf(f)]]);
    const text = '﻿' + ['# ' + FIXED, cols.join(','), ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = `실태조사_초안_상위${d.topRows.length}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  slot.dataset.ready = '1';
  return d;
}

/* ── 최소 OOXML(.docx) — 무압축 zip · 문단·표만 · 맑은 고딕(종이 무대 · 기관 문서 표준) ── */
const X = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const run = (t, { b = false, sz = 20 } = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:eastAsia="맑은 고딕" w:hAnsi="Malgun Gothic"/>${b ? '<w:b/>' : ''}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${X(t)}</w:t></w:r>`;
const para = (t, o = {}) => `<w:p>${o.box ? '<w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="010102"/><w:left w:val="single" w:sz="6" w:space="4" w:color="010102"/><w:bottom w:val="single" w:sz="6" w:space="4" w:color="010102"/><w:right w:val="single" w:sz="6" w:space="4" w:color="010102"/></w:pBdr></w:pPr>' : ''}${run(t, o)}</w:p>`;
const table = (head, rows) => `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="010102"/><w:bottom w:val="single" w:sz="4" w:color="DDDDDD"/><w:insideH w:val="single" w:sz="4" w:color="DDDDDD"/></w:tblBorders></w:tblPr>${[head, ...rows].map((r, i) => `<w:tr>${r.map((c) => `<w:tc><w:p>${run(c, { b: i === 0, sz: 18 })}</w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
export function buildDocx(d) {
  const src = d.source;
  const body = [
    para(d.title, { b: true, sz: 32 }),
    para(`서식 survey-emd · 영상 2023 25cm 항공 · 2025 LX 드론(A02) · 대장 V-World 연속지적 2026-09-24 · 규칙 v1.0 · 임계 [추정 초기값] · 출처 ${src}`, { sz: 16 }),
    para('1. 개요', { b: true, sz: 24 }),
    para(`${d.emd ? d.emd.emd : '남원시'} 필지 ${Number(d.emdParcels).toLocaleString('ko-KR')}필지(기록 · V-World 연속지적)를 2023 AI 분석(결과 확인 전)과 대조한 결과, 규칙 ${d.rule || 'R1–R6'}에 해당하는 의심 ${d.n.toLocaleString('ko-KR')}건(${d.parcels.toLocaleString('ko-KR')}필지 · AI 추론 · 결과 확인 전)이 현장조사 대상 후보로 추출되었다.`),
    para('2. 집계 · 규칙 × 등급', { b: true, sz: 24 }),
    table(['규칙', 'A', 'B', 'C', '계'], Object.entries(d.byRule).sort().map(([k, v]) => [`${k} ${d.rules.find((r) => r.id === k)?.name || ''}`, v.A, v.B, v.C, v.n].map(String))),
    para(`상태: ${Object.entries(d.byState).map(([k, v]) => `${STATE_KO[k]} ${v}`).join(' · ')}`, { sz: 18 }),
    para(`3. 의심 상위 ${d.topRows.length}`, { b: true, sz: 24 }),
    table(['#', 'PNU', '지번', '지목', '규칙', '근거㎡', '신뢰도', '상태'], d.topRows.map((f, i) => [i + 1, f.pnu, `${f.emd} ${f.ri} ${f.jibun}`, f.jimok, `${f.rule} ${f.priority}`, Math.round(f.evid_m2).toLocaleString('ko-KR'), f.conf, STATE_KO[stateOf(f)]].map(String))),
    para('4. 근거 영상', { b: true, sz: 24 }),
    para('2023 항공정사 25cm(전북 비도시 도엽) · AI 4클래스 재추론(aerial25/best · 결과 확인 전). 드론 AOI(덕과면) 안은 2025 4시점, 밖은 2023 · 2025 두 시점.'),
    para('5. 법적 근거', { b: true, sz: 24 }), para('[법령 확인 · 2차 법령 RAG] 농지법 §54 등'),
    para('6. 조치 제안', { b: true, sz: 24 }), para('상위 등급(A)부터 현장조사 배정 → 현장 확인(사진·GPS) → 판정 입력. 건축물대장·농지전용 허가 대장과 먼저 대조.'),
    para(FIXED, { b: true, box: true }),
  ].join('');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', doc],
  ];
  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
let CRC = null;
function crc32(u8) { CRC ||= Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const [name, text] of files) {
    const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true);
    c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const cs = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
