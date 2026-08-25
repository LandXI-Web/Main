// HUD · 커서 · 타이포 분해 · 스케일바 · 히스토그램 · 필름스트립 · 스와이프
const D2R = Math.PI / 180;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const smooth = (t) => t * t * (3 - 2 * t);
export const fmt = (n) => n.toLocaleString('ko-KR');

/* ── 문자 단위 분해 (SplitText 없이) ───────────────────── */
export function splitChars(h) {
  const out = [];
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const ch of n.nodeValue) {
          if (ch === ' ') { frag.appendChild(document.createTextNode(' ')); continue; }
          const s = document.createElement('span');
          s.className = 'ch'; s.textContent = ch;
          frag.appendChild(s); out.push(s);
        }
        node.replaceChild(frag, n);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    });
  };
  walk(h);
  return out;
}

/* ── 숫자 현상 (Vantor 4.4) ────────────────────────────────
   글자 하나씩 35–50ms 스태거로 배경색에서 떠오른다. 페이드가 아니라 "현상"으로 읽히도록
   opacity 와 색을 같이 태운다. 이미 같은 값이면 다시 돌리지 않는다. */
export function develop(el, text, stagger = 42) {
  if (el.dataset.dev === text) return;
  el.dataset.dev = text;
  el.textContent = '';
  const spans = [...String(text)].map((ch) => {
    const s = document.createElement('span');
    s.className = 'c'; s.textContent = ch;
    el.appendChild(s);
    return s;
  });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    spans.forEach((s) => { s.style.opacity = '1'; });
    return;
  }
  spans.forEach((s, i) => {
    s.animate(
      [{ opacity: 0, color: 'color-mix(in srgb, currentColor 18%, transparent)' },
       { opacity: 1, color: 'currentColor' }],
      { duration: 560, delay: 60 + i * stagger, easing: 'cubic-bezier(.15,1,.3,1)', fill: 'both' },
    );
  });
}

/* ── 커서 — 지도 위 크로스헤어 / UI 위 브래킷 ────────────── */
export function makeCursor(el, label, map) {
  let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty, on = false;
  addEventListener('pointermove', (e) => {
    tx = e.clientX; ty = e.clientY; on = true;
    const t = e.target;
    el.classList.toggle('on-ui', !!(t && t.closest && t.closest('#ui button, #ui input, #ui a, #ui li, #swipe-grip')));
  }, { passive: true });
  addEventListener('pointerleave', () => { on = false; });
  return () => {
    x = lerp(x, tx, 0.16); y = lerp(y, ty, 0.16);
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
    el.style.opacity = on ? '1' : '0';
    if (!on) return;
    try {
      const ll = map.unproject([x, y]);
      label.textContent = `${ll.lat.toFixed(4)} ${ll.lng.toFixed(4)}`;
    } catch { label.textContent = '—'; }
  };
}

/* ── 마그네틱 버튼 ─────────────────────────────────────── */
export function magnetic(btns) {
  const st = btns.map(() => ({ x: 0, y: 0, tx: 0, ty: 0 }));
  addEventListener('pointermove', (e) => {
    btns.forEach((b, i) => {
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const reach = Math.max(r.width, r.height) * 1.6;
      const d = Math.hypot(dx, dy);
      const k = d < reach ? (1 - d / reach) * 0.42 : 0;
      st[i].tx = dx * k; st[i].ty = dy * k;
    });
  }, { passive: true });
  return () => btns.forEach((b, i) => {
    const s = st[i];
    s.x = lerp(s.x, s.tx, 0.12); s.y = lerp(s.y, s.ty, 0.12);
    b.style.transform = `translate(${s.x.toFixed(2)}px,${s.y.toFixed(2)}px)`;
  });
}

/* ── 스케일바 (실계산) ─────────────────────────────────── */
const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 50000, 200000];
export function scaleBar(map, txt, bar) {
  const z = map.getZoom(), lat = map.getCenter().lat;
  const mpp = 78271.5170 * Math.cos(lat * D2R) / Math.pow(2, z);
  const target = 96 * mpp;
  let m = NICE[0];
  for (const n of NICE) if (n <= target) m = n;
  bar.style.width = (m / mpp).toFixed(1) + 'px';
  txt.textContent = m >= 1000 ? (m / 1000) + ' km' : m + ' m';
}

/* ── 히스토그램 ────────────────────────────────────────── */
/* 축·격자 없음. 데이터 잉크만. 단일 액센트 + 무채 감쇠(취향 프로필 §4 차트).
   값은 sweep 으로 도착한다 — grow(0→1)를 곱해 왼쪽부터 차오른다. */
const cssv = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();
export function drawHist(cv, bins, cut, _ramp, lo = 0.5, hi = 1, grow = 1) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = cv.clientWidth || 300, h = cv.clientHeight || 52;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  const accent = cssv('--v3-accent') || '#006DF7';
  const line = cssv('--cw-line') || '#272727';
  const fg = cssv('--cw-fg') || '#fff';
  const max = Math.max(1, ...bins);
  const bw = w / bins.length;
  const span = hi - lo || 1;
  bins.forEach((v, i) => {
    if (i / bins.length > grow) return;
    const t = lo + (i + 0.5) / bins.length * span;
    const bh = Math.max(v > 0 ? 1 : 0, (v / max) * (h - 8));
    x.fillStyle = t >= cut ? accent : line;
    x.fillRect(i * bw, h - bh, Math.max(1, bw - 1), bh);
  });
  // 기준선 + 임계 커서 — 헤어라인 둘뿐이다.
  x.fillStyle = line; x.fillRect(0, h - 0.5, w, 0.5);
  const cx = (cut - lo) / span * w;
  x.strokeStyle = fg; x.lineWidth = 1;
  x.beginPath(); x.moveTo(cx + 0.5, 0); x.lineTo(cx + 0.5, h); x.stroke();
}

/* ── 타일 좌표 ─────────────────────────────────────────── */
export const lon2x = (l, z) => (l + 180) / 360 * Math.pow(2, z);
export const lat2y = (a, z) => {
  const r = a * D2R;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
};

export function tileRange(bounds, z) {
  return {
    x0: Math.floor(lon2x(bounds[0], z)), x1: Math.floor(lon2x(bounds[2], z)),
    y0: Math.floor(lat2y(bounds[3], z)), y1: Math.floor(lat2y(bounds[1], z)), z,
  };
}

export function loadImg(src) {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => res(null);
    i.src = src;
  });
}

/* ── "Acquired" 크롭 인셋 ────────────────────────────────
   축척이 안 보이는 탐지(수 픽셀짜리 점)를 **실제 타일 z18 크롭**으로 병치한다(Vantor 6.1-⑥).
   지도는 저채도로 눌러 두고 이 크롭만 원본 채도로 둔다 — "AI가 본 곳만 색이 산다".
   폴리곤이 있으면 같은 좌표계로 그 위에 그린다. 가짜 이미지를 만들지 않는다. */
export async function cropFromTiles(tpl, lng, lat, z, size, geom, color = '#FFB633') {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#0A0D12'; cx.fillRect(0, 0, size, size);
  const px = lon2x(lng, z) * 256, py = lat2y(lat, z) * 256;
  const x0 = px - size / 2, y0 = py - size / 2;
  const tx0 = Math.floor(x0 / 256), tx1 = Math.floor((x0 + size) / 256);
  const ty0 = Math.floor(y0 / 256), ty1 = Math.floor((y0 + size) / 256);
  const jobs = [];
  let hit = 0;
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
    const u = tpl.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
    jobs.push(loadImg(u).then((img) => {
      if (!img) return;
      hit++;
      cx.drawImage(img, tx * 256 - x0, ty * 256 - y0, 256, 256);
    }));
  }
  await Promise.all(jobs);
  if (!hit) return null;
  if (geom) {
    const draw = (ring) => {
      cx.beginPath();
      ring.forEach((c, i) => {
        const X = lon2x(c[0], z) * 256 - x0, Y = lat2y(c[1], z) * 256 - y0;
        i ? cx.lineTo(X, Y) : cx.moveTo(X, Y);
      });
      cx.closePath();
      cx.strokeStyle = color; cx.lineWidth = 1.5; cx.stroke();
    };
    const walk = (g) => {
      if (!g) return;
      if (g.type === 'Polygon') g.coordinates.forEach(draw);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach(draw));
      else if (/Point/.test(g.type)) {
        const c = g.type === 'Point' ? g.coordinates : g.coordinates[0];
        const X = lon2x(c[0], z) * 256 - x0, Y = lat2y(c[1], z) * 256 - y0;
        cx.strokeStyle = color; cx.lineWidth = 1.5;
        cx.strokeRect(X - 9, Y - 9, 18, 18);
      }
    };
    walk(geom);
  }
  return cv;
}

/* AOI 실제 타일에서 썸네일을 굽는다 — 가짜 플레이스홀더 없음 */
export async function thumbFromTiles(id, bounds, z, w, h) {
  const r = tileRange(bounds, z);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#0A1320'; cx.fillRect(0, 0, w, h);
  const px0 = lon2x(bounds[0], z) * 256, px1 = lon2x(bounds[2], z) * 256;
  const py0 = lat2y(bounds[3], z) * 256, py1 = lat2y(bounds[1], z) * 256;
  const sw = px1 - px0, sh = py1 - py0;
  const k = Math.max(w / sw, h / sh);           // cover
  const ox = (w - sw * k) / 2, oy = (h - sh * k) / 2;
  const jobs = [];
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) {
    jobs.push(loadImg(`../assets/tiles/${id}/${z}/${x}/${y}.webp`).then((img) => {
      if (!img) return;
      cx.drawImage(img, ox + (x * 256 - px0) * k, oy + (y * 256 - py0) * k, 256 * k, 256 * k);
    }));
  }
  await Promise.all(jobs);
  return cv;
}
