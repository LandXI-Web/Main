/* agency-words.js — 기관(tenant) 세션에서는 'XI맵'이라는 말을 쓰지 않는다(10-23 원칙 328: "기관에는 XI 맵이 다르다. 지도 서비스고
   그 안에 XI ChatGEO 서비스가 들어가야 한다"). 같은 지도 엔진을 기관에는 '지도 서비스'로 부른다 — 화면 글 · 속성 · 탭 제목 ·
   채팅 답(서버 글 포함)을 같은 한 곳에서 바꾼다. LX 직원 · 관리자 세션에서는 아무 일도 하지 않는다. */
const FROM = /XI\s?맵/g, TO = '지도 서비스';
const ATTRS = ['aria-label', 'title', 'placeholder', 'alt', 'data-label'];
let on = false;

/** 기관 글로 바꾼 문장 */
export const agencyText = (s) => String(s ?? '').replace(FROM, TO);

function fix(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (FROM.test(root.nodeValue)) root.nodeValue = agencyText(root.nodeValue); FROM.lastIndex = 0; return; }
  if (root.nodeType !== 1) return;
  const tag = root.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE') return;
  for (const a of ATTRS) { const v = root.getAttribute?.(a); if (v && /XI\s?맵/.test(v)) root.setAttribute(a, agencyText(v)); }
  for (const c of root.childNodes) fix(c);
}

export function agencyWords(who) {
  if (on || !String(who?.key || '').startsWith('tenant/')) return;
  on = true;
  const run = () => { fix(document.body); if (/XI\s?맵/.test(document.title)) document.title = agencyText(document.title); };
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') fix(m.target);
      else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v && /XI\s?맵/.test(v)) m.target.setAttribute(m.attributeName, agencyText(v)); }
      else m.addedNodes.forEach(fix);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  new MutationObserver(() => { if (/XI\s?맵/.test(document.title)) document.title = agencyText(document.title); }).observe(document.head, { subtree: true, childList: true, characterData: true });
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run, { once: true });
}
