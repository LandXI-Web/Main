/* answer.js — 답변·초안 렌더(자리표 {{env:eN}} → 봉투 칩 · {{unv:uN}} → 취소선 + '검증 안 된 숫자' + 가장 가까운 봉투 · [n] → 인용 버튼).
   봉투 없는 숫자는 그리지 않는다(assertEnvelope throw — 법전 §5). 스트리밍 중 미완 자리표 꼬리는 숨긴다. */
import { assertEnvelope, BASIS_KO } from '../shared/api-v1.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UNIT = { count: '건', '필지': '필지', m2: '㎡', ratio: '', '%': '%', ha: 'ha', km2: 'km²', gpu_s: 'GPU·s', s: '초', ms: 'ms', tokens: '토큰', bytes: 'B',
  krw_m2: '원/㎡', polygons: '개', features: '개', score: '점' };
export const unitKo = (u) => UNIT[u] ?? u ?? '';
const NL = String.fromCharCode(10);

export function fmtVal(e) {
  const v = e.value;
  if (v === null || v === undefined || typeof v !== 'number') return '—';
  if (e.unit === 'ratio') return sig((v * 100), 1) + '%';
  return sig(v, Math.abs(v) < 10 ? 2 : 1);
}

/** 실측 값이 표시 자릿수에서 0 으로 사라지지 않게: |v| < 1 은 유효숫자 2자리(0.003 · 0.0042) · 그 밖은 소수 d 자리(정수는 0).
 *  0 이 아닌 값이 '0' · '0.00' 으로 보이는 경우 0 (e2e f2e-confirm 단언). */
export function sig(v, d = 2) {
  if (Number.isInteger(v)) return v.toLocaleString('ko-KR');
  const a = Math.abs(v);
  if (a > 0 && a < 1) {
    const k = Math.min(12, Math.max(d, 1 - Math.floor(Math.log10(a))));   // 유효숫자 2자리가 되는 소수 자리
    return Number(v.toPrecision(2)).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: k });
  }
  return v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** 봉투 칩 HTML(호버 = 출처 · 시각 · 뜻) */
export function chip(e, { meaning = '', id = '', fresh = false } = {}) {
  assertEnvelope(e, 'agent chip ' + id);
  // 값이 숫자가 아니면(무제한 · 결손) 실측/추정 꼬리표 칩을 그리지 않는다 — 상태 글자만
  if (typeof e.value !== 'number') return `<span class="ag-nv" data-env="${esc(id)}" title="${esc(e.source || '')}">${esc(e.note || '—')}</span>`;
  const tag = BASIS_KO[e.basis] || e.basis;
  return `<span class="ag-n" tabindex="0" data-basis="${esc(e.basis)}" data-env="${esc(id)}" data-v="${esc(e.value)}"${fresh ? ' data-fresh="1"' : ''}>`
    + `${esc(fmtVal(e))}${unitKo(e.unit) ? `<small>${esc(unitKo(e.unit))}</small>` : ''}<i>${esc(tag)}</i>`
    + `<span class="ag-card" role="note"><b>${esc(tag)}</b> · ${esc(meaning || id)}<br>값 ${esc(fmtVal(e))} ${esc(unitKo(e.unit))}<br>출처 ${esc(e.source)}<br>시각 ${esc(e.as_of)}${e.note ? `<br>${esc(e.note)}` : ''}</span></span>`;
}

/** 봉투 뜻 한 줄(로컬 번호 '[1] ' · 괄호 설명은 칩 호버로) */
export const meaningShort = (m) => String(m || '').replace(/^\[\d+\]\s*/, '').replace(/\s*\([^)]*\)/g, '').trim();

function unvHtml(u, envs, meta) {
  const id = u && u.nearest && envs[u.nearest] ? u.nearest : null;
  const near = id ? envs[id] : null;
  const m = id ? meaningShort(meta[id]) : '';
  // nearest: ① 같은 답에서 쓴 자리표 ② 첫 도구 주 봉투 ③ 값 근접 — 뜻 라벨이 없으면 칩을 붙이지 않는다(무관한 봉투 오해 방지)
  return `<span class="ag-unv" data-unv="${esc(u?.id || '')}"><s>${esc(u?.text || '')}</s><em>검증 안 된 숫자</em>`
    + (near && m ? `<span class="ag-near" data-by="${esc(u.nearest_by || '')}">도구 봉투 · ${esc(m)}</span>${chip(near, { meaning: meta[id], id })}` : '') + '</span>';
}

/**
 * md → HTML. opts: { envs, meta, unverified:[{id,text,nearest}], live, fresh:Set, uncited:[] }
 * 줄: '## 제목' → h3 · 빈 줄 → 단락 · [n] → 인용 버튼
 */
export function renderMd(md, { envs = {}, meta = {}, unverified = [], live = false, fresh = null, uncited = [], flags = [] } = {}) {
  let src = String(md || '');
  if (live) src = src.replace(/\{\{[^}]*$/, '').replace(/\{\{[^}]*\}(?!\})$/, '');   // 미완 자리표 꼬리 숨김
  const U = Object.fromEntries((unverified || []).map((u) => [u.id, u]));
  // 표기할 문장(봉투 뜻 확인 필요 · 인용 없음)을 md 단계에서 표지 문자로 감싼다(칩 HTML 이 끼어도 경계가 맞게)
  const marks = [];
  for (const f of flags || []) if (f?.sentence) marks.push({ s: f.sentence.trim(), kind: 'meaning', why: f.reason || '' });
  for (const s of uncited || []) if (s) marks.push({ s: String(s).trim(), kind: 'uncited', why: '인용 없는 문장 — 근거 확인 필요' });
  marks.forEach((mk, k) => { const at = src.indexOf(mk.s); if (at >= 0) src = src.slice(0, at) + `⁣${k}⁤` + mk.s + '⁣/⁤' + src.slice(at + mk.s.length); });
  const inline = (t) => {
    // 자리표 바로 뒤 단위 토큰(건·필지·개·㎡ …)이 칩 단위와 같으면 흡수 — 화면 문장이 .docx 와 같게('387 건 … 건임' 중복 0)
    t = t.replace(/(\{\{\s*env\s*:\s*([A-Za-z0-9_]+)\s*\}\})\s*(건|필지|개|㎡|ha|km²|%|곳)/g, (m, ph, id, u) => (envs[id] && unitKo(envs[id].unit) === u ? ph : m));
    // 스트리밍 중(live): 자리표·인용·표지 밖 숫자(한글 단위 포함)는 한 프레임도 맨숫자로 보이지 않게 '검증 중' 표지 — done 뒤 검증기가 칩/취소선으로 확정
    if (live) t = t.split(/(\{\{[^}]*\}\}|\[\d{1,2}(?:\s*[,·]\s*\d{1,2})*\]|⁣\d+⁤)/).map((seg, i) => (i % 2 ? seg : seg.replace(/\d[\d,.]*(?:\s*(?:만|천|억|조))?/g, '⁣V⁤'))).join('');
    let h = esc(t);
    h = h.replace(/\{\{\s*env\s*:\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, id) => (envs[id] ? chip(envs[id], { meaning: meta[id], id, fresh: fresh ? fresh.has(id) : false })
      : `<span class="ag-unv"><s>${esc(id)}</s><em>검증 안 된 숫자</em></span>`));
    h = h.replace(/\{\{\s*unv\s*:\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, id) => unvHtml(U[id], envs, meta));
    h = h.replace(/\[(\d{1,2}(?:\s*[,·]\s*\d{1,2})*)\]/g, (m, ns) => ns.split(/\s*[,·]\s*/).map((n) => `<button type="button" class="ag-cite" data-cite="${n}" aria-label="근거 ${n}">${n}</button>`).join(''));
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/⁣(\d+)⁤/g, (m, k) => { const mk = marks[+k]; return mk.kind === 'meaning'
      ? `<span class="ag-uncited ag-meaning" data-flag="meaning" title="봉투 뜻 확인 필요 — ${esc(mk.why)}">`
      : `<span class="ag-uncited" data-flag="uncited" title="${esc(mk.why)}">`; });
    h = h.replace(/⁣\/⁤/g, (m) => '</span>');
    if (live) h = h.replace(/⁣V⁤/g, '<span class="ag-pend" title="검증 중 — 도구 봉투와 대조 전 숫자(맨숫자 표시 금지)">검증 중</span>');
    return h;
  };
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  for (const line of src.split(NL)) {
    const l = line.trimEnd();
    if (/^#{1,4}\s/.test(l)) { flush(); out.push(`<h3>${inline(l.replace(/^#+\s*/, ''))}</h3>`); continue; }
    if (!l.trim()) { flush(); continue; }
    para.push(l);
  }
  flush();
  return marks.some((m) => m.kind === 'meaning') ? tagAfterAll(out.join('')) : out.join('');
}

/** 뜻 표지 span 뒤마다 꼬리표 하나(중첩 span 이 있어 정규식 대신 DOM 없이 깊이 세기) */
function tagAfterAll(html) {
  const open = '<span class="ag-uncited ag-meaning"';
  let i = 0, out = '';
  while (true) {
    const a = html.indexOf(open, i);
    if (a < 0) { out += html.slice(i); break; }
    const tEnd = html.indexOf('>', a);
    const why = (/title="봉투 뜻 확인 필요 — ([^"]*)"/.exec(html.slice(a, tEnd + 1)) || [])[1] || '';
    let depth = 1, j = tEnd + 1;
    while (depth && j < html.length) {
      const o = html.indexOf('<span', j), c = html.indexOf('</span>', j);
      if (c < 0) { j = html.length; break; }
      if (o >= 0 && o < c) { depth++; j = o + 5; } else { depth--; j = c + 7; }
    }
    out += html.slice(i, j) + `<em class="ag-flag" title="${why}">봉투 뜻 확인 필요</em>`;
    i = j;
  }
  return out;
}

/** 자리표 id 목록(스트리밍 중 새로 완성된 칩 락온용) */
export const placeholders = (md) => [...String(md || '').matchAll(/\{\{\s*env\s*:\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
