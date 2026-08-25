// Scene 1 궤도 — 글로브 둘레를 도는 위성·항공·드론 링.
// 링은 SVG 타원(뒤쪽 반원은 점선·흐리게, 앞쪽 반원은 밝게)으로 원근을 만들고,
// 마커는 링 좌표계에서 각도로 계산해 뒤편(sin<0)을 지날 때 흐려진다.
// 글로브 자전은 MapLibre 일 때 카메라 경도를 돌리고, 폴백 엔진에서는 SVG 지구본 경선을 돌린다.
const NS = 'http://www.w3.org/2000/svg';
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const VB = 190;            // viewBox 반폭
const R_OUT = 150;         // viewBox 단위 기준 가장 바깥(위성) 링 반지름
const RY = 0.34;           // 타원 납작함 = 궤도면 기울기
const EARTH_R = 76.9;      // R_OUT / 1.95 — 지구본 반지름(단위)
// MapLibre 글로브의 실제 실루엣 반지름 / 메르카토르 공식값. 5.6 에서 실측(1.028)했다.
const GLOBE_K = 1.028;
// 안쪽부터 드론·항공·위성. k = 글로브 반지름 대비 궤도 반지름(1.30/1.625/1.95 = 1:1.25:1.5).
const RINGS = [
  { kind: 'uav', icon: 'i-drone', label: '드론', k: 1.30, tilt: -16, w: 0.30, a0: 0.7 },
  { kind: 'air', icon: 'i-plane', label: '항공', k: 1.625, tilt: 9, w: 0.18, a0: 2.6 },
  { kind: 'sat', icon: 'i-satellite', label: '위성', k: 1.95, tilt: -5, w: 0.10, a0: 4.4 },
];
const base = () => document.documentElement.dataset.base || '';

/** @returns {{start:()=>void, stop:()=>void, layout:()=>void, globeR:()=>number}} */
export function createOrbit(container, map, { zoom = 1.6, spin = 3.2 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'orbit__svg');
  svg.setAttribute('viewBox', `${-VB} ${-VB} ${VB * 2} ${VB * 2}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = defs() + earth() + atmosphere() + RINGS.map(ring).join('');
  container.append(svg);

  const crafts = RINGS.map((r, i) => ({ ...r, R: R_OUT * r.k / RINGS[RINGS.length - 1].k, el: svg.querySelectorAll('.orbit__craft')[i], a: r.a0 }));
  const meridians = [...svg.querySelectorAll('.orbit__earth .mer')];
  let raf = 0, last = 0, spun = 0, running = false;

  const globeR = () => 512 * Math.pow(2, zoom) / (2 * Math.PI) * (map && map.engine === 'maplibre' ? GLOBE_K : 1);
  function layout() {
    const s = (VB * 2 / R_OUT) * (globeR() * RINGS[RINGS.length - 1].k);
    svg.style.width = svg.style.height = Math.round(s) + 'px';
  }
  function place() {
    for (const c of crafts) {
      const x = c.R * Math.cos(c.a), y = c.R * RY * Math.sin(c.a);
      c.el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      c.el.classList.toggle('is-back', Math.sin(c.a) < 0);
    }
    meridians.forEach((m, i) => m.setAttribute('rx', (EARTH_R * Math.abs(Math.cos(spun + i * Math.PI / 5))).toFixed(2)));
  }
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const c of crafts) c.a += c.w * dt;
    spun += dt * spin * Math.PI / 180;
    if (map && map.engine === 'maplibre' && map.raw) {
      const c = map.getCenter();
      map.jumpTo([c[0] + spin * dt, c[1]], map.getZoom());
    }
    place();
    raf = requestAnimationFrame(frame);
  }

  layout(); place();
  addEventListener('resize', layout);
  return {
    globeR,
    layout,
    start() {
      if (running || REDUCE) { place(); return; }   // 감소 모션이면 정지 상태로 배치만 한다
      running = true; last = performance.now(); raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
  };
}

function defs() {
  return `<defs><radialGradient id="lx-earth" cx="34%" cy="28%" r="78%">`
    + `<stop offset="0" stop-color="#1B3C5E"/><stop offset=".62" stop-color="#102338"/><stop offset="1" stop-color="#060D1A"/>`
    + `</radialGradient></defs>`;
}

// 지구 가장자리의 대기광. 두 엔진 모두에서 보이며 글로브의 윤곽을 잡아준다.
function atmosphere() {
  return `<g class="orbit__atmo"><circle class="glow" r="${EARTH_R}"/><circle class="edge" r="${EARTH_R}"/></g>`;
}

// 폴백 엔진(타일 없음)에서만 보이는 지구본 대역. CSS 로 display 를 켠다.
function earth() {
  const R = EARTH_R;
  const lat = [[0, R, R * 0.17], [R * 0.5, R * 0.87, R * 0.15], [-R * 0.5, R * 0.87, R * 0.15]]
    .map(([cy, rx, ry]) => `<ellipse class="grat" cx="0" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"/>`).join('');
  const mer = [0, 1, 2, 3, 4].map(() => `<ellipse class="grat mer" cx="0" cy="0" rx="${R}" ry="${R}"/>`).join('');
  return `<g class="orbit__earth"><circle class="ball" r="${R}"/>${lat}${mer}<circle class="rim" r="${R}"/></g>`;
}

function ring(r, i) {
  const R = R_OUT * r.k / RINGS[RINGS.length - 1].k, ry = R * RY;
  const back = `M ${-R} 0 A ${R} ${ry} 0 0 1 ${R} 0`;
  const front = `M ${R} 0 A ${R} ${ry} 0 0 1 ${-R} 0`;
  return `<g class="orbit__ring" data-kind="${r.kind}" transform="rotate(${r.tilt})">`
    + `<path class="orbit__arc orbit__arc--back" d="${back}"/>`
    + `<path class="orbit__arc orbit__arc--front" d="${front}"/>`
    + `<g class="orbit__craft" data-kind="${r.kind}"><circle class="halo" r="13"/>`
    + `<g transform="rotate(${-r.tilt})"><use href="${base()}assets/icons.svg#${r.icon}" x="-9" y="-9" width="18" height="18"/></g>`
    + `</g></g>`;
}
