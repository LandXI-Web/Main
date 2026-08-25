import { lon2x, lat2y, loadImg } from './hud.js';

// 시점 비교 / AI 결과 오버레이 — 지도 인스턴스를 하나만 쓰기 위해(파괴 금지 원칙)
// compare 플러그인 대신 B 면 타일을 뷰포트 좌표에 정확히 붙인 뒤 clip-path 로 가른다.
// pitch/bearing 이 0 일 때만 아핀이므로 그 밖에서는 스스로 숨는다.
// recolor 가 주어지면 흑백 세그멘테이션 마스크를 그 색의 반투명 레이어로 다시 칠한다
// (제주 토지형질 마스크는 원본이 검정 바탕 + 흰 영역이라 그대로 얹으면 검은 판이 된다).

const x2lon = (x, z) => x / Math.pow(2, z) * 360 - 180;
const y2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / Math.pow(2, z)))) * 180 / Math.PI;

function recolorTile(img, rgb) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  x.drawImage(img, 0, 0, 256, 256);
  const d = x.getImageData(0, 0, 256, 256);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const lum = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) / 255;
    const a = lum < 0.12 ? 0 : Math.min(1, (lum - 0.12) / 0.5);
    p[i] = rgb[0]; p[i + 1] = rgb[1]; p[i + 2] = rgb[2];
    p[i + 3] = Math.round(a * 235);
  }
  x.putImageData(d, 0, 0);
  return cv;
}

// frame() → [x0, x1] : 커튼이 움직일 가로 구간. 흰 아틀라스에서는 **판의 폭**이다 —
// 판이 화면의 일부만 차지할 때 손잡이가 뷰포트 한가운데 있으면 판 밖에 서 있게 된다.
export function makeSwipe(map, root, frame) {
  const imgs = root.querySelector('#swipe-imgs');
  const line = root.querySelector('#swipe-line');
  const grip = root.querySelector('#swipe-grip');
  const tagA = document.createElement('div'); tagA.className = 'swipe-tag';
  const tagB = document.createElement('div'); tagB.className = 'swipe-tag';
  root.append(tagA, tagB);
  let cfg = null, frac = 0.5, drag = false, token = 0;

  function layout() {
    if (!cfg) return;
    const ok = Math.abs(map.getPitch()) < 0.5 && Math.abs(map.getBearing()) < 0.5;
    root.style.opacity = ok ? '1' : '0';
    if (!ok) return;
    const { z, tiles } = cfg;
    for (const t of tiles) {
      const a = map.project([x2lon(t.x, z), y2lat(t.y, z)]);
      const b = map.project([x2lon(t.x + 1, z), y2lat(t.y + 1, z)]);
      t.el.style.left = a.x.toFixed(2) + 'px';
      t.el.style.top = a.y.toFixed(2) + 'px';
      t.el.style.width = Math.ceil(b.x - a.x + 1) + 'px';
      t.el.style.height = Math.ceil(b.y - a.y + 1) + 'px';
    }
    const fr = (frame && frame()) || [0, innerWidth, 0, innerHeight];
    const px = fr[0] + frac * (fr[1] - fr[0]);
    imgs.style.clipPath = `inset(0 0 0 ${(px / innerWidth * 100).toFixed(3)}%)`;
    line.style.left = px + 'px';
    line.style.top = fr[2] + 'px';
    line.style.bottom = (innerHeight - fr[3]) + 'px';
    tagA.style.right = (innerWidth - px + 14) + 'px';
    tagB.style.left = (px + 14) + 'px';
    tagA.style.top = tagB.style.top = (fr[2] + 14) + 'px';
    grip.style.top = ((fr[2] + fr[3]) / 2).toFixed(0) + 'px';
    lastFrame = fr;
  }
  let lastFrame = [0, innerWidth, 0, innerHeight];

  async function show({ bdir, bounds, z, la, lb, recolor }) {
    hide();
    const me = ++token;
    const x0 = Math.floor(lon2x(bounds[0], z)), x1 = Math.floor(lon2x(bounds[2], z));
    const y0 = Math.floor(lat2y(bounds[3], z)), y1 = Math.floor(lat2y(bounds[1], z));
    const tiles = [];
    cfg = { z, tiles };
    tagA.textContent = la; tagB.textContent = lb;
    root.hidden = false; frac = 0.5;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const src = `../assets/tiles/${bdir}/${z}/${x}/${y}.webp`;
      if (recolor) {
        const img = await loadImg(src);
        if (me !== token) return;
        if (!img) continue;
        const el = recolorTile(img, recolor);
        el.style.position = 'absolute';
        imgs.appendChild(el);
        tiles.push({ el, x, y });
      } else {
        const el = document.createElement('img');
        el.src = src; el.alt = ''; el.decoding = 'async';
        el.addEventListener('error', () => { el.style.display = 'none'; });
        imgs.appendChild(el);
        tiles.push({ el, x, y });
      }
      if (tiles.length % 6 === 0) layout();
    }
    requestAnimationFrame(layout);
  }

  function hide() { token++; cfg = null; root.hidden = true; imgs.innerHTML = ''; }

  const setFromX = (x) => {
    const w = Math.max(1, lastFrame[1] - lastFrame[0]);
    frac = Math.max(0.03, Math.min(0.97, (x - lastFrame[0]) / w));
    layout();
  };
  grip.addEventListener('pointerdown', (e) => { drag = true; grip.setPointerCapture(e.pointerId); e.preventDefault(); });
  addEventListener('pointermove', (e) => { if (drag) setFromX(e.clientX); });
  addEventListener('pointerup', () => { drag = false; });
  grip.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowLeft' ? -0.04 : e.key === 'ArrowRight' ? 0.04 : 0;
    if (d) { e.preventDefault(); frac = Math.max(0.03, Math.min(0.97, frac + d)); layout(); }
  });
  map.on('move', layout);
  addEventListener('resize', layout);

  return { show, hide, layout, get active() { return !!cfg; } };
}
