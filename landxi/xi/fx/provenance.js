/* provenance.js — 7문법 #7. 봉투(F1-CONTRACT §2)만 숫자가 된다. 봉투가 아니면 throw — 그리지 않는다.
   prov(el, env)  → 칩 `실측 · source · as_of` (호버 = 브래킷 카드: unit · note · gsd · crs)
   num(env, d)    → 표기 문자열(천 단위 · null = '—') + 호출부가 data-basis 로 꼬리표를 단다
   void_(el, why) → 결손 칩(점선 무채 + 이유 한 줄) */
import { assertEnvelope, BASIS_KO, fmt } from '../../shared/api-v1.js';

/* 화면 말(용어표 2026-09-29) — 공용 BASIS_KO 의 '시연'·'검수 전'을 화면에서만 바꿔 부른다(키·판정은 그대로) */
const LABEL = { ...BASIS_KO, demo: '예시', inferred: 'AI 추론 · 결과 확인 전' };
export const tag = (basis) => LABEL[basis] || basis;
export function num(e, digits, where = '') { assertEnvelope(e, where); return fmt(e, digits); }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const day = (s) => (s || '').slice(0, 10);

/** 봉투 칩. opts.label = 앞에 붙는 한 단어, opts.extra = {gsd, crs} */
export function prov(el, e, { label = '', extra = {}, compact = false, tagText = '' } = {}) {
  assertEnvelope(e, label);
  const tg = tagText || tag(e.basis);   // 같은 basis 라도 더 정확한 말이 있으면(예: 변화 지수 · 검수 전)
  el.classList.add('cw-prov', 'xi-prov');
  el.dataset.basis = e.basis;
  const src = String(e.source).replace(/^.*[\\/]/, (m) => (m.length > 42 ? '…/' : m));
  el.innerHTML = `${label ? `<span class="xi-prov-l">${esc(label)}</span>` : ''}<b>${esc(tg)}</b><span>${esc(compact ? src.slice(0, 40) : src)}</span><span>${esc(day(e.as_of))}</span>`;
  el.tabIndex = 0;
  el.setAttribute('role', 'note');
  el.title = '';
  const card = document.createElement('span');
  card.className = 'xi-prov-card';
  card.innerHTML = `<span class="br tl"></span><span class="br tr"></span><span class="br bl"></span><span class="br br_"></span>
    <b>${esc(tg)}</b> · 값 ${esc(fmt(e))} ${esc(e.unit)}<br>출처 ${esc(e.source)}<br>시각 ${esc(e.as_of)}${e.note ? `<br>${esc(e.note)}` : ''}${extra.gsd ? `<br>GSD ${esc(extra.gsd)}` : ''}${extra.crs ? ` · ${esc(extra.crs)}` : ''}`;
  el.appendChild(card);
  return el;
}
/** 결손 칩 */
export function void_(el, why) {
  el.className = 'cw-void xi-void';
  el.textContent = why;
  el.dataset.void = '1';
  return el;
}
/** 숫자 + 꼬리표 조각(HTML). 봉투 강제. */
export function numHtml(e, { digits, unit = true, cls = '' } = {}) {
  assertEnvelope(e, 'numHtml');
  return `<span class="xi-n ${cls}" data-basis="${e.basis}" title="${esc(tag(e.basis))} · ${esc(e.source)}">${esc(fmt(e, digits))}${unit && e.unit ? `<small>${esc(unitKo(e.unit))}</small>` : ''}</span>`;
}
export const unitKo = (u) => ({ polygons: '개', count: '건', krw_m2: '원/m²', km2: 'km²', m2: 'm²', ha: 'ha', gpu_s: 'GPU·s', 'KRW/m2': '원/m²', chips_per_s: '칩/s', ratio: '', ms: 'ms', s: 's' }[u] ?? u);
