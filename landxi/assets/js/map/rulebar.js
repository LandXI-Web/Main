import { openDialog } from '../ui/dialog.js';

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

/** 축척 분모(천 단위 반올림). 559082264 = 적도 기준 zoom 0 축척 분모. */
export function scaleOf(zoom, lat) {
  return Math.round(559082264 / Math.pow(2, zoom) * Math.cos(lat * Math.PI / 180) / 1000) * 1000;
}
/** 화면 1px 이 나타내는 실제 거리(m). */
export function metersPerPixel(zoom, lat) {
  return 156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
}
const UNITS = [100, 500, 1000, 5000, 10000, 50000];

export function createRulebar(host, api) {
  const el = document.createElement('div'); el.className = 'rulebar mono'; host.append(el);
  const state = { captured: '2026.04.12 · GSD 8cm', model: 'XI-VFM v2.1' };

  function update(p = {}) {
    Object.assign(state, p);
    const c = state.lnglat || api.getCenter();
    const z = state.zoom == null ? api.getZoom() : state.zoom;
    const s = scaleOf(z, c[1]);
    const mPerPx = metersPerPixel(z, c[1]);
    const unit = UNITS.find(u => u / mPerPx >= 60) || 100000;
    el.style.setProperty('--tick', Math.round(unit / mPerPx) + 'px');
    el.innerHTML = `<span><b>${c[1].toFixed(4)}</b>, <b>${c[0].toFixed(4)}</b></span>`
      + `<span>축척 <b>1:${s.toLocaleString()}</b></span>`
      + `<span class="rulebar__scale"><i></i>${unit >= 1000 ? unit / 1000 + ' km' : unit + ' m'}</span>`
      + `<span>정사영상 <b>${state.captured}</b></span>`
      + `<span class="rulebar__ai">● ${state.model}</span>`
      + `<span class="rulebar__spacer"></span>`
      + `<button type="button" class="rulebar__info" aria-label="사이트 정보" data-footer-info>ⓘ</button>`;
  }

  el.addEventListener('click', e => {
    if (!e.target.closest('[data-footer-info]')) return;
    openDialog({ title: 'Land-XI', body: `<div class="siteinfo">${SITE_INFO}</div>`, size: 'sm' });
  });

  api.on('move', ({ center, zoom }) => update({ lnglat: center, zoom }));
  update();
  return { el, update };
}
