/* 카드 발행 관리 — 네 화면이 같이 쓰는 작은 조각(아이콘 · 그림 · 단계 레일 · 클래스 칩 · 증거 판 조립).
   아이콘은 원판 생성기(tools/design/gen-b6-publish.mjs)의 각진 1.5 stroke 세트 중 shell.js icon() 에 없는 것. */
import { esc, icon } from './shell.js';
import * as D from './publish-data.js';
import * as M from './publish-map.js';

const IC = {
  refresh: '<path d="M16.5 4v4.5H12"/><path d="M16 8.5A6.5 6.5 0 1 0 16.5 12"/>',
  rect: '<path d="M3 4h14v12H3z"/>', circle: '<circle cx="10" cy="10" r="6.5"/>', polygon: '<path d="M10 3l7 5-2.5 8h-9L3 8z"/>',
  copy: '<path d="M7 7h10v10H7z"/><path d="M3 13V3h10"/>', undo: '<path d="M7 5 3 9l4 4"/><path d="M3 9h9.5v7H7"/>',
  minus: '<path d="M4 10h12"/>', fit: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>', globe: '<path d="M3 3h14v14H3z"/><path d="M3 10h14M10 3v14"/>',
  pub: '<path d="M3 6h10v11H3z"/><path d="M9 11 17 3M12 3h5v5"/>',
};
export const ico = (name, size = 16) => (IC[name]
  ? `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true">${IC[name]}</svg>`
  : icon(name, size));

export const DEMO = '<em class="tag">시연</em>';
export const REALTAG = '<em class="tag">실측</em>';

/** 그림 — 실크롭이 있으면 그림, 이미지셋이면 점선 결손(정사영상 크롭이 없는 사진 묶음). */
export function fig(src, { alt = '', cap = '', capR = '', long = false, cls = '' } = {}) {
  if (!src) return `<figure class="imgcard imgcard--none ${cls}"><span>이미지셋${long ? '<br>정사영상 크롭 없음' : ''}</span></figure>`;
  return `<figure class="imgcard ${cls}"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">${cap ? `<figcaption><span>${esc(cap)}</span><span class="sp"></span><span>${esc(capR)}</span></figcaption>` : ''}</figure>`;
}

/** 처리 단계 레일 — 원본 `발행 처리` 라디오 4 의 현재값을 읽기 전용으로. */
export function stageRail(cur) {
  const tone = { '대기': 'is-warn', '검토중': 'is-acc', '승인': '', '반려': 'is-dim' };
  return `<div class="stage steps" role="list" aria-label="처리 단계">${D.STATUSES.map((k) => `<span role="listitem" class="${tone[k]}"${k === cur ? ' aria-current="step"' : ''}>${k}</span>`).join('')}</div>`;
}
export const classChips = (names) => `<div class="cls">${names.map((n, i) => `<span class="cls-c"><i class="sw sw--s${i ? ' sw--d' : ''}"></i>${esc(n)}</span>`).join('')}</div>`;
export const stWord = (s, extra = '') => `<span class="st ${D.ST_CLASS[s] || ''}">${esc(extra || s)}</span>`;

/* ── 증거 판 — 한 화면에 지도 하나. 탭을 옮겨도 같은 지도가 자리를 옮겨 산다. ─────────── */
export class Plate {
  constructor() {
    this.el = document.createElement('div'); this.el.className = 'plate brackets';
    this.el.innerHTML = '<div class="plate-map" role="region" aria-label="결과 지도 — 끌어서 이동, +/− 로 확대·축소"></div><div class="plate-over"></div>';
    this.mapEl = this.el.firstChild; this.over = this.el.lastChild;
    this.map = null; this.ready = null; this.token = 0;
    this.over.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-t]'); if (!b || !this.map) return;
      if (b.dataset.t === 'in') this.map.zoomIn(); if (b.dataset.t === 'out') this.map.zoomOut();
      if (b.dataset.t === 'fit' && this.home) M.frame(this.map, this.home);
      if (b.dataset.t === 'hyb') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); M.setHybrid(this.map, on); }
    });
  }
  /** slot 에 세운다. 지도는 처음 한 번만 만든다. */
  place(slot) {
    slot.replaceWith(this.el);
    if (!M.hasGL()) { this.none('지도 라이브러리를 불러오지 못했습니다', '네트워크 연결을 확인해 주세요'); return Promise.resolve(null); }
    if (!this.ready) this.ready = M.mountPlate(this.mapEl).then((m) => { this.map = m; window.__pubPlate = this; return m; }).catch(() => { this.none('지도를 열 수 없습니다', '이 브라우저가 WebGL 을 지원하지 않습니다'); return null; });
    else requestAnimationFrame(() => this.map?.resize());
    return this.ready;
  }
  park() { this.el.remove(); }
  none(title, why) { this.el.className = 'plate plate--none'; this.over.innerHTML = `<b>${esc(title)}</b><span>${esc(why)}</span>`; this.mapEl.hidden = true; this.el.dataset.state = 'none'; }
  live() { this.el.className = 'plate brackets'; this.mapEl.hidden = false; }
  tools() { return `<div class="plate-tools"><button type="button" data-t="hyb" aria-pressed="false" aria-label="지명 · 도로 겹치기" title="지명 · 도로 겹치기">${ico('globe', 17)}</button><button type="button" data-t="fit" aria-label="결과 범위로" title="결과 범위로">${ico('fit', 17)}</button><span class="gap"></span><button type="button" data-t="in" aria-label="확대">${ico('plus', 17)}</button><button type="button" data-t="out" aria-label="축소">${ico('minus', 17)}</button></div>`; }

  /** 요청 하나의 증거 — 실 결과가 있으면 그 권역의 실 필지를 청록으로, 없으면 도형 없이 이유를 말한다.
      mode 'evidence'(개요 · 구성원 — 라벨 풀 권역) | 'extent'(분석 결과 — 결과 전체 범위) | 'base'(도형 없음) */
  async show(pid, { mode = 'evidence', legend = false, capL = '', gap = '', compact = false } = {}) {
    this.el.toggleAttribute('data-compact', compact);
    const my = ++this.token, pj = D.PROJECTS[pid], real = pj?.real ? D.REAL[pj.real] : null;
    if (!pj || pj.dataType === 'imageset') { this.none('이미지셋', '사진 묶음에는 지도에 세울 좌표가 없습니다 — 원본도 도형을 임의로 놓았습니다'); return; }
    this.live(); this.el.dataset.state = 'loading';
    const map = await this.ready; if (!map || my !== this.token) return;
    const spot = D.LABELING[pid]?.[0];
    const short = (s) => (compact ? s.replace(/.*((.*))/, '$1') : s);
    const keyL = real ? real.classes.map((c) => `${esc(short(c.label))}<i class="k${c.dash ? ' k--d' : ''}"></i>`).join(' ') : '';
    const cap = (l, r) => `<p class="plate-cap"><span>${l}</span><span class="r">${r}</span></p>`;
    if (!real || mode === 'base') {
      M.clearResult(map); this.resId = null;
      if (spot?.lng) { this.home = [spot.lng - 0.004, spot.lat - 0.003, spot.lng + 0.004, spot.lat + 0.003]; M.frame(map, this.home, { instant: REDUCED_(), pad: 0 }); }
      this.over.innerHTML = `${this.tools()}<p class="plate-gap">${esc(gap || '결과 폴리곤 없음 — 이 과제의 실 결과 GeoJSON 이 없습니다(원본은 임의 배치)')}</p>${cap(esc(capL || `요청 지역 · ${spot?.name || pj.name} · V-World 위성`), '결과 폴리곤 없음')}`;
      this.el.dataset.state = 'base'; return;
    }
    this.over.innerHTML = `${this.tools()}<p class="plate-busy">실 결과 GeoJSON 여는 중…</p>`;
    let geo; try { geo = await M.loadGeo(real.url); } catch { if (my === this.token) this.over.innerHTML = `${this.tools()}<p class="plate-gap">결과 GeoJSON 을 읽지 못했습니다 — 도형을 올리지 않습니다</p>`; return; }
    if (my !== this.token) return;
    if (this.resId !== pj.real || !M.hasResult(map)) { M.setResult(map, geo, real.classes); this.resId = pj.real; }
    const st = real.res.stats;
    if (mode === 'extent') this.home = st.bbox;
    else { const f = M.near(geo, real.view.center, real.view.km); this.home = M.bboxOf(f.length ? f : geo.features); }
    M.frame(map, this.home, { instant: REDUCED_(), pad: mode === 'extent' ? 28 : 18 });
    const counts = real.classes.map((c) => `<div class="row"><i class="sw${c.dash ? ' sw--d' : ''}"></i>${esc(c.label)}<span class="n">${(st.classes[c.key] || 0).toLocaleString('ko-KR')}</span><small>${esc(real.unit)}</small></div>`).join('');
    this.over.innerHTML = `${this.tools()}${legend ? `<div class="plate-legend"><span class="lb">탐지결과 오버레이</span>${counts}<p class="note">results.js 실측 · 분석 ${esc(st.analyzedAt)}<br>평균 신뢰도 ${st.confMean.toFixed(2)} · 도형 = 실 결과 GeoJSON<br>시 전체 = 필지 중심점 · 확대하면 폴리곤</p></div>` : ''}${cap(esc(capL || `요청 지역 · ${real.place} 일대 · V-World 위성`), `결과 폴리곤 · ${keyL}`)}`;
    this.el.dataset.state = 'result';
  }
}
const REDUCED_ = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
