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

/* ── 커서 ──────────────────────────────────────────────── */
export function makeCursor(el, label, map) {
  let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty, on = false;
  addEventListener('pointermove', (e) => {
    tx = e.clientX; ty = e.clientY; on = true;
    const t = e.target;
    el.classList.toggle('on-ui', !!(t && t.closest && t.closest('#ui button, #ui input, #ui a, #swipe-grip')));
  }, { passive: true });
  addEventListener('pointerleave', () => { on = false; });
  return () => {
    x = lerp(x, tx, 0.16); y = lerp(y, ty, 0.16);
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
    el.style.opacity = on ? '1' : '0';
    if (!on) return;
    try {
      const ll = map.unproject([x, y]);
      label.textContent = `${ll.lat.toFixed(4)}  ${ll.lng.toFixed(4)}`;
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
export function drawHist(cv, bins, cut, ramp, lo = 0.5, hi = 1) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = cv.clientWidth || 300, h = cv.clientHeight || 56;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  const max = Math.max(1, ...bins);
  const bw = w / bins.length;
  const span = hi - lo || 1;
  bins.forEach((v, i) => {
    const t = lo + (i + 0.5) / bins.length * span;
    const bh = Math.max(v > 0 ? 1.5 : 0, (v / max) * (h - 10));
    const active = t >= cut;
    x.fillStyle = active ? ramp[Math.min(ramp.length - 1, Math.floor((t - lo) / span * ramp.length))]
                         : 'rgba(140,152,170,.28)';
    x.fillRect(i * bw + 0.6, h - bh, bw - 1.2, bh);
  });
  const cx = (cut - lo) / span * w;
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, h); x.stroke();
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
