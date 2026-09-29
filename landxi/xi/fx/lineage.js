/* lineage.js — 7문법 #7 계보: 데이터셋 → 학습 런 → 모델 → 카드 버전 → 배포본 → 기관 → 작업.
   GET /registry/lineage/{deploy_id}(on) · deploys-fixture.lineage(off). 관계 순회(Palantir) 장치 — 한 줄 체인, 호버 시 브래킷. */
const KIND = { dataset: '데이터셋', run: '학습 런', model: '모델', card_version: '카드 버전', deploy: '배포본', tenant: '기관', job: '작업' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function lineage(el, chain = []) {
  el.classList.add('xi-lineage');
  if (!chain.length) { el.innerHTML = '<span class="cw-void xi-void">버전 이력 · 기록 없음</span>'; return el; }
  el.innerHTML = chain.map((n, i) => `<span class="xi-ln cw-hover" data-kind="${esc(n.kind)}" tabindex="0"><i>${esc(KIND[n.kind] || n.kind)}</i><b>${esc(n.label || n.id)}</b></span>${i < chain.length - 1 ? '<span class="xi-ln-to" aria-hidden="true">›</span>' : ''}`).join('');
  el.setAttribute('aria-label', '버전 이력 ' + chain.map((n) => `${KIND[n.kind] || n.kind} ${n.label || n.id}`).join(' → '));
  return el;
}
