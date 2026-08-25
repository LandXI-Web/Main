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
/* 흰 아틀라스에서는 커서가 **판 위에서만** 크로스헤어가 된다.
   흰 종이 위에서는 브라우저 기본 커서 그대로 둔다 — 흰 바탕의 흰 십자는 보이지도 않고
   좌표를 읽어 줄 대상도 없다. */
export function makeCursor(el, label, map, insidePlate) {
  let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty, on = false;
  addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; on = true; }, { passive: true });
  addEventListener('pointerleave', () => { on = false; });
  return () => {
    x = lerp(x, tx, 0.16); y = lerp(y, ty, 0.16);
    const over = on && (!insidePlate || insidePlate(tx, ty));
    el.style.opacity = over ? '1' : '0';
    if (!over) return;
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
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
  const line = cssv('--hair') || '#DDDDDD';
  const fg = cssv('--ink') || '#010102';
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
export async function cropFromTiles(tpl, lng, lat, z, size, geom, color = '#FFB633', under = null) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#0A0D12'; cx.fillRect(0, 0, size, size);
  const px = lon2x(lng, z) * 256, py = lat2y(lat, z) * 256;
  const x0 = px - size / 2, y0 = py - size / 2;
  const tx0 = Math.floor(x0 / 256), tx1 = Math.floor((x0 + size) / 256);
  const ty0 = Math.floor(y0 / 256), ty1 = Math.floor((y0 + size) / 256);
  // 우리 정사영상 타일셋은 촬영 범위가 사각형이 아니라 성기다 — 빈 칸이 검은 구멍으로 남으면
  // "굽다 만 이미지"로 읽힌다. 밑에 V-World 를 한 겹 깔아 두면 언제나 실제 지면이 보인다.
  const draw = async (src, count) => {
    let n = 0;
    const jobs = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
      jobs.push(loadImg(tileURL(src, z, tx, ty)).then((img) => {
        if (!img || img.width < 8) return;
        n++;
        cx.drawImage(img, tx * 256 - x0, ty * 256 - y0, 256, 256);
      }));
    }
    await Promise.all(jobs);
    return count ? n : 0;
  };
  if (under) await draw(under, false);
  const hit = await draw(tpl, true) + (under ? 1 : 0);
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
  cx.fillStyle = '#0A0D12'; cx.fillRect(0, 0, w, h);
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

/* ── 판 굽기 (bakePlate) ────────────────────────────────────
   결과 아틀라스의 행은 **실제 타일 모자이크**로 구운 판을 쓴다. 지도는 한 대뿐이므로
   화면에 살아 있는 행 하나만 지도가 맡고, 나머지 행은 여기서 구운 진짜 픽셀이 맡는다.
   플레이스홀더를 그리지 않는다는 규칙을 지키면서 7개 결과를 한 지면에 놓는 유일한 방법이다.

   그리고 여기서만 되는 것이 하나 더 있다 — **선택적 채도**.
   MapLibre 는 래스터를 벡터로 마스킹하지 못하지만 캔버스는 한다: 무채로 눌러 깐 판 위에
   AI 폴리곤 경로로 clip 한 뒤 원본 색 판을 다시 그리면 "AI 가 본 곳에서만 색이 산다"가
   문자 그대로 성립한다(취향 프로필 §4 영상 처리). */

export const tileURL = (src, z, x, y) => (/\{z\}/.test(src)
  ? src.replace('{z}', z).replace('{x}', x).replace('{y}', y)
  : `../assets/tiles/${src}/${z}/${x}/${y}.webp`);

export async function bakePlate({ src, bounds, z, w, h }) {
  const px0 = lon2x(bounds[0], z) * 256, px1 = lon2x(bounds[2], z) * 256;
  const py0 = lat2y(bounds[3], z) * 256, py1 = lat2y(bounds[1], z) * 256;
  const sw = Math.max(1, px1 - px0), sh = Math.max(1, py1 - py0);
  const k = Math.max(w / sw, h / sh);          // cover
  const ox = (w - sw * k) / 2, oy = (h - sh * k) / 2;
  const color = document.createElement('canvas');
  color.width = w; color.height = h;
  const cx = color.getContext('2d');
  cx.fillStyle = '#0A0D12'; cx.fillRect(0, 0, w, h);
  const x0 = Math.floor((px0 - ox / k) / 256), x1 = Math.floor((px1 + ox / k) / 256);
  const y0 = Math.floor((py0 - oy / k) / 256), y1 = Math.floor((py1 + oy / k) / 256);
  let hit = 0;
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    jobs.push(loadImg(tileURL(src, z, x, y)).then((img) => {
      // 성긴 타일셋의 빈 칸은 서버가 투명 1×1 로 답한다 — 그건 타일이 아니다.
      if (!img || img.width < 8) return;
      hit++;
      cx.drawImage(img, ox + (x * 256 - px0) * k, oy + (y * 256 - py0) * k, 256 * k, 256 * k);
    }));
  }
  await Promise.all(jobs);
  const gray = document.createElement('canvas');
  gray.width = w; gray.height = h;
  const gc = gray.getContext('2d');
  gc.filter = 'saturate(0.35) contrast(1.10) brightness(0.95)';
  gc.drawImage(color, 0, 0);
  const project = (c) => [ox + (lon2x(c[0], z) * 256 - px0) * k, oy + (lat2y(c[1], z) * 256 - py0) * k];
  return { color, gray, project, w, h, hit, z };
}

// 폴리곤/점 하나를 경로로. 이 축척에서 5px 이하로 사라지는 탐지는 최소 사각형으로 세운다.
function tracePath(x, pl, geom, minPx) {
  if (!geom) return 0;
  let n = 0;
  const box = (cxp, cyp, s) => {
    x.moveTo(cxp - s, cyp - s); x.lineTo(cxp + s, cyp - s);
    x.lineTo(cxp + s, cyp + s); x.lineTo(cxp - s, cyp + s); x.closePath(); n++;
  };
  const ring = (r) => {
    if (!Array.isArray(r) || r.length < 3) return;
    let lo0 = Infinity, lo1 = Infinity, hi0 = -Infinity, hi1 = -Infinity;
    const pts = r.map((c) => {
      const p = pl.project(c);
      lo0 = Math.min(lo0, p[0]); lo1 = Math.min(lo1, p[1]);
      hi0 = Math.max(hi0, p[0]); hi1 = Math.max(hi1, p[1]);
      return p;
    });
    if (hi0 < -8 || hi1 < -8 || lo0 > pl.w + 8 || lo1 > pl.h + 8) return;
    if (hi0 - lo0 < minPx || hi1 - lo1 < minPx) return box((lo0 + hi0) / 2, (lo1 + hi1) / 2, minPx / 2);
    pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
    x.closePath(); n++;
  };
  const pt = (c) => {
    const p = pl.project(c);
    if (p[0] < -8 || p[1] < -8 || p[0] > pl.w + 8 || p[1] > pl.h + 8) return;
    box(p[0], p[1], minPx / 2);
  };
  const g = geom;
  if (g.type === 'Polygon') g.coordinates.forEach(ring);
  else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly) => poly.forEach(ring));
  else if (g.type === 'Point') pt(g.coordinates);
  else if (g.type === 'MultiPoint') g.coordinates.forEach(pt);
  return n;
}

/* 판을 칠한다. 임계 이하 탐지는 **삭제하지 않고 무채로** 남긴다(Palantir 디밍 규약).
   reveal(0–1) 은 탐지 리빌 — 신뢰도 순위 상위 reveal 만큼만 도착한 상태다. */
export function paintPlate(cv, pl, feats, cut = -1, reveal = 1) {
  if (!pl || !cv) return;
  if (cv.width !== pl.w || cv.height !== pl.h) { cv.width = pl.w; cv.height = pl.h; }
  const x = cv.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, pl.w, pl.h);
  x.drawImage(pl.gray, 0, 0);
  if (!feats || !feats.length) return;
  const lim = Math.round(Math.max(0, Math.min(1, reveal)) * feats.length);
  const on = [], off = [];
  for (let i = 0; i < lim; i++) {
    const f = feats[i];
    ((f.conf == null || f.conf >= cut) ? on : off).push(f);
  }
  if (off.length) {
    x.save(); x.beginPath();
    let n = 0;
    for (const f of off) n += tracePath(x, pl, f.g, 4);
    if (n) { x.strokeStyle = 'rgba(226,228,232,.32)'; x.lineWidth = 1; x.stroke(); }
    x.restore();
  }
  if (on.length) {
    x.save(); x.beginPath();
    let n = 0;
    for (const f of on) n += tracePath(x, pl, f.g, 5);
    if (n) { x.clip(); x.drawImage(pl.color, 0, 0); }
    x.restore();
    const byColor = new Map();
    for (const f of on) {
      const c = f.color || '#FFFFFF';
      if (!byColor.has(c)) byColor.set(c, []);
      byColor.get(c).push(f);
    }
    for (const [c, list] of byColor) {
      x.save(); x.beginPath();
      let n2 = 0;
      for (const f of list) n2 += tracePath(x, pl, f.g, 5);
      if (n2) { x.strokeStyle = c; x.lineWidth = 1.2; x.stroke(); }
      x.restore();
    }
  }
}
