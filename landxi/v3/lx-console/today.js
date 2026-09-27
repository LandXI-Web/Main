/* today.js — '오늘' 띠: LX 직원이 오늘 할 일 네 종류. 누르면 지도가 그곳으로 가고 해당 단의 서랍이 열린다.
   검수 대기 = A등급 의심 필지(열림) · 재학습 = 신고 5건 이상 쌓인 결과 층 · 이식 요청 = 초안 배포본 · 기관 신고 = 열린 오탐 신고 */
import { D, n, esc, shortRegion, cardShort, retrainDue, portRequests, openReports } from './data.js';

export function cells() {
  const port = portRequests();
  return [
    { k: 'review', v: D.reviewA?.value ?? null, l: '검수 대기', tip: 'A등급 의심 필지', go: ['review', {}] },
    { k: 'retrain', v: retrainDue().length, l: '재학습', tip: retrainDue().map((g) => g.name).join(' · '), go: ['train', {}] },
    { k: 'port', v: port.length, l: '이식 요청', tip: port.map((d) => `${shortRegion(d)} ${cardShort(d.card_id)}`).join(' · '), go: ['deploy', { deployId: port[0]?.id }] },
    { k: 'report', v: openReports().length, l: '기관 신고', tip: '열린 오탐 신고', go: ['ops', {}] },
  ];
}

export function mountToday(el, dateEl, ui) {
  const d = new Date();
  dateEl.textContent = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
  const cs = cells();
  el.innerHTML = cs.map((c) => `<button class="tcell ${c.v ? 'is-due' : 'is-zero'}" data-k="${c.k}" title="${esc(c.tip)}" ${c.v ? '' : 'disabled'}>
    <b class="num">${c.v == null ? '—' : n(c.v)}</b><span>${c.l}</span></button>`).join('');
  el.querySelectorAll('.tcell').forEach((b) => b.addEventListener('click', () => {
    const c = cs.find((x) => x.k === b.dataset.k);
    el.querySelectorAll('.tcell').forEach((x) => x.classList.toggle('is-on', x === b));
    ui.open(c.go[0], { ...c.go[1], from: 'today' });
  }));
}
export const clearToday = (el) => el.querySelectorAll('.tcell').forEach((x) => x.classList.remove('is-on'));
