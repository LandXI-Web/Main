/* gov-report docx.js — 화면에서 본 보고서를 그대로 .docx 로(브라우저에서 조립 · 외부 라이브러리 없음).
   구성 = 제목 · 한 줄(기관 · 작성일 · 자료 기준 · 규칙) → ① 개요 ② 소견 ③ 조치 제안(화면 문단 그대로) → 부속 표 → 인용(본문이 인용한 것만).
   개발 정보(경로 · 표 이름 · 코드 · 요청)는 넣지 않는다 — 호출하는 쪽이 사용자 말만 넘긴다.
   buildDocx({title, meta, sections:[{h, paras[]}], tables:[{h, note?, head[], rows[][]}], notes[], foot}) → Blob */

const X = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const FONT = '<w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕" w:cs="Malgun Gothic"/>';
const run = (t, { b = false, sz = 21, color = '191F28' } = {}) =>
  `<w:r><w:rPr>${FONT}${b ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${X(t)}</w:t></w:r>`;
const para = (t, o = {}) => {
  const sp = `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 120}" w:line="${o.line ?? 320}" w:lineRule="auto"/>`;
  return `<w:p><w:pPr>${o.keep ? '<w:keepNext/>' : ''}${sp}${o.align ? `<w:jc w:val="${o.align}"/>` : ''}</w:pPr>${run(t, o)}</w:p>`;
};
const cell = (t, { head = false, w } = {}) =>
  `<w:tc><w:tcPr>${w ? `<w:tcW w:w="${w}" w:type="dxa"/>` : ''}${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F4F6"/>' : ''}<w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/></w:tcMar></w:tcPr>` +
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${run(t, { b: head, sz: 18, color: head ? '4E5968' : '191F28' })}</w:p></w:tc>`;
const border = (k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="E5E8EB"/>`;
const table = (head, rows) =>
  `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'bottom', 'insideH'].map(border).join('')}</w:tblBorders><w:tblLayout w:type="autofit"/></w:tblPr>` +
  `<w:tblGrid>${head.map(() => `<w:gridCol w:w="${Math.floor(9298 / head.length)}"/>`).join('')}</w:tblGrid>` +
  `<w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((h) => cell(h, { head: true })).join('')}</w:tr>` +
  rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c) => cell(c)).join('')}</w:tr>`).join('') + '</w:tbl>';

function documentXml({ title, meta, sections = [], tables = [], notes = [], foot }) {
  const b = [];
  b.push(para(title, { b: true, sz: 32, after: 80 }));
  if (meta) b.push(para(meta, { sz: 18, color: '6B7684', after: 360 }));
  sections.forEach((s) => {
    b.push(para(s.h, { b: true, sz: 26, before: 240, after: 120, keep: true }));
    for (const p of s.paras) b.push(para(p));
  });
  if (tables.length) b.push(para('부속 표', { b: true, sz: 26, before: 360, after: 120, keep: true }));
  tables.forEach((t) => {
    b.push(para(t.h, { b: true, sz: 21, before: 200, after: 80, keep: true }));
    if (t.note) b.push(para(t.note, { sz: 17, color: '6B7684', after: 80, keep: true }));
    b.push(table(t.head, t.rows.length ? t.rows : [t.head.map((_, i) => (i ? '' : '해당 없음'))]));
  });
  if (notes.length) {
    b.push(para('인용', { b: true, sz: 21, before: 360, after: 80, keep: true }));
    for (const n of notes) b.push(para(n, { sz: 18, color: '4E5968', after: 40 }));
  }
  if (foot) b.push(para(foot, { sz: 17, color: '8B95A1', before: 360, align: 'right' }));
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + b.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1304" w:bottom="1418" w:left="1304" w:header="851" w:footer="851" w:gutter="0"/></w:sectPr></w:body></w:document>';
}

const CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
const core = (title, who) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
  `<dc:title>${X(title)}</dc:title><dc:creator>${X(who)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`;

/* ── 저장 전용(STORE) zip ── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(), parts = [], dir = [];
  let off = 0;
  const d = new Date(), dt = ((d.getFullYear() - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) | (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const [name, text] of files) {
    const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(10, dt, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint32(12, dt, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    dir.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const size = dir.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...dir, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export function buildDocx(doc) {
  return zip([
    ['[Content_Types].xml', CT],
    ['_rels/.rels', RELS],
    ['docProps/core.xml', core(doc.title, doc.author || '')],
    ['word/document.xml', documentXml(doc)],
  ]);
}
