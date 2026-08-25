import { openDialog } from '../ui/dialog.js';
import { scaleOf, tickUnit, unitLabel } from './rulebar-math.js';
export { scaleOf, metersPerPixel, tickUnit, unitLabel, UNITS, UNIT_FALLBACK } from './rulebar-math.js';

// 정부 표준 사이트 정보(푸터) — 눈금줄 오른쪽 ⓘ 에서 연다.
const SITE_INFO = `
<ul class="siteinfo__links">
  <li><a href="#" data-info-link="privacy"><b>개인정보처리방침</b></a></li>
  <li><a href="#" data-info-link="terms">이용약관</a></li>
  <li><a href="#" data-info-link="nospam">이메일주소무단수집거부</a></li>
</ul>
<p class="siteinfo__addr">(우)54870 전라북도 전주시 덕진구 기지로 120 (중동) LX</p>
<p class="siteinfo__tel">고객센터 <b>063-713-1213, 1216</b></p>
<p class="siteinfo__copy">© LX 한국국토정보공사. All rights reserved.</p>`;

// DOM 은 한 번만 짓는다. 매 프레임 innerHTML 을 갈아끼우면 ⓘ 버튼의 키보드 포커스가
// 날아가고 눈금 막대의 width 트랜지션도 매번 초기화된다.
const SKELETON = `<span class="rulebar__coord"><b></b>, <b></b></span>`
  + `<span>축척 <b class="rulebar__scale-n"></b></span>`
  + `<span class="rulebar__scale"><i></i><span class="rulebar__unit"></span></span>`
  + `<span>정사영상 <b class="rulebar__captured"></b></span>`
  + `<span class="rulebar__ai"></span>`
  + `<span class="rulebar__spacer"></span>`
  + `<button type="button" class="rulebar__info" aria-label="사이트 정보" data-footer-info>ⓘ</button>`;

export function createRulebar(host, api) {
  const el = document.createElement('div'); el.className = 'rulebar mono'; el.innerHTML = SKELETON; host.append(el);
  const state = { captured: '2026.04.12 · GSD 8cm', model: 'XI-VFM v2.1' };
  const [latEl, lngEl] = el.querySelectorAll('.rulebar__coord b');
  const scaleEl = el.querySelector('.rulebar__scale-n');
  const unitEl = el.querySelector('.rulebar__unit');
  const capturedEl = el.querySelector('.rulebar__captured');
  const aiEl = el.querySelector('.rulebar__ai');
  let key = null;

  function update(p = {}) {
    Object.assign(state, p);
    const c = state.lnglat || api.getCenter();
    const z = state.zoom == null ? api.getZoom() : state.zoom;
    const lat = c[1].toFixed(4), lng = c[0].toFixed(4);
    const s = scaleOf(z, c[1]);
    const { unit, px } = tickUnit(z, c[1]);
    const next = `${lat}|${lng}|${s}|${unit}|${Math.round(px)}|${state.captured}|${state.model}`;
    if (next === key) return;                                  // 값이 그대로면 DOM 을 만지지 않는다
    key = next;
    latEl.textContent = lat; lngEl.textContent = lng;
    scaleEl.textContent = `1:${s.toLocaleString()}`;
    unitEl.textContent = unitLabel(unit);
    capturedEl.textContent = state.captured;
    aiEl.textContent = `● ${state.model}`;
    el.style.setProperty('--tick', Math.round(px) + 'px');
  }

  el.addEventListener('click', e => {
    if (!e.target.closest('[data-footer-info]')) return;
    openDialog({ title: 'Land-XI', body: `<div class="siteinfo">${SITE_INFO}</div>`, size: 'sm' });
  });

  api.on('move', ({ center, zoom }) => update({ lnglat: center, zoom }));
  update();
  return { el, update };
}
