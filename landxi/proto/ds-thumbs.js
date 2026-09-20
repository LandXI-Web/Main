// 타일 그림 — 비이미지 자산도 타일이다(마스터 B5 장치 9·10).
//   · SHP  = 실좌표 GeoJSON 실루엣(캔버스). 마스터 유보 3: 판이 아니라 실좌표 렌더.
//   · XLSX = 첫 행 미리보기(results.js 필드).
//   · ZIP  = 파일 트리.
//   · 그림도 좌표도 없으면 점선 무채 액자 + 이유 한 줄 — 그럴듯한 그림으로 채우지 않는다.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cache = new Map();
/** GeoJSON 한 번만 받는다 — 같은 파일을 타일 여럿이 쓴다. */
export function loadGeo(file) {
  if (!cache.has(file)) cache.set(file, fetch(file).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(file);
}

const walk = (c, f) => (typeof c[0] === 'number' ? f(c) : c.forEach((x) => walk(x, f)));
export function bboxOf(features) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ft of features) walk(ft.geometry.coordinates, (p) => {
    b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
  });
  return b;
}
const inBox = (ft, bb) => {
  if (!bb) return true;
  const b = bboxOf([ft]);
  return b[2] >= bb[0] && b[0] <= bb[2] && b[3] >= bb[1] && b[1] <= bb[3];
};
/** 폴리곤 링을 캔버스에 긋는다 — 실좌표를 액자에 등축 투영.
 *
 *  2026-09-20 수정(발주 지적: `NW_greenhouse_labels_202603.shp` 이 깨진 점 뭉치로 보인다).
 *  원인 둘.
 *   1) 캔버스를 480×294(1.63:1) 고정으로 그려 놓고 CSS 가 타일 상자(실측 258×105 = 2.5:1)로
 *      늘렸다. 가로만 늘고 세로는 눌려 직사각형 비닐하우스가 납작한 점이 됐다.
 *      → 그릴 때 캔버스를 **화면 상자 픽셀(×dpr)** 로 맞춘다. 늘어나는 일이 없다.
 *   2) 0.7px 헤어라인만 그어서 10 m 남짓 폴리곤이 반픽셀로 흩어졌다.
 *      → 면을 옅게 채우고(fill) 선을 얹는다. 작아도 `모양` 으로 읽힌다.
 *  bbox 는 액자 비율에 맞춰 넓힌다 — 비율을 지키면서 액자를 채운다(찌그러뜨리지 않는다).
 */
export async function silhouette(canvas, spec, opts = {}) {
  const g = await loadGeo(spec.file);
  // 화면 상자 크기로 캔버스를 맞춘다. 상자가 아직 0 이면 속성값(HTML)을 그대로 쓴다.
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (box.width > 2 && box.height > 2) {
    const W0 = Math.round(box.width * dpr), H0 = Math.round(box.height * dpr);
    if (canvas.width !== W0 || canvas.height !== H0) { canvas.width = W0; canvas.height = H0; }
  }
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!g) return 0;
  const fts = g.features.filter((f) => inBox(f, spec.bbox));
  if (!fts.length) return 0;
  // 액자는 **걸러진 피처의 실제 범위**에 맞춘다. spec.bbox 는 무엇을 볼지 고르는 창일 뿐이고,
  // 그걸 그대로 액자로 쓰면 비닐하우스가 액자 한구석에 몰려 점처럼 보였다(발주 지적).
  let bb = bboxOf(fts).slice();
  const s = (v) => Math.round(v * dpr);
  const pad = s(opts.pad ?? 10), pt = s(opts.padTop ?? opts.pad ?? 10), pb = s(opts.padBottom ?? opts.pad ?? 10);
  const aw = Math.max(1, W - pad * 2), ah = Math.max(1, H - pt - pb);
  // 위도 보정 — 경도 1° 는 위도 1° 보다 짧다. 화면 비례 단위로 환산해 비교한다.
  const kc = Math.cos(((bb[1] + bb[3]) / 2) * Math.PI / 180) || 1;
  const bw = (bb[2] - bb[0]) * kc, bh = bb[3] - bb[1];
  if (bw / bh < aw / ah) { const add = ((bh * aw) / ah - bw) / kc / 2; bb = [bb[0] - add, bb[1], bb[2] + add, bb[3]]; }
  else { const add = ((bw * ah) / aw - bh) / 2; bb = [bb[0], bb[1] - add, bb[2], bb[3] + add]; }
  const k = aw / ((bb[2] - bb[0]) * kc);
  const px = (p) => [pad + (p[0] - bb[0]) * kc * k, H - pb - (p[1] - bb[1]) * k];
  ctx.strokeStyle = opts.stroke || '#010102';
  ctx.fillStyle = opts.fill || 'rgba(1,1,2,.24)';
  ctx.lineWidth = Math.max(1, s(opts.width || 0.7));
  ctx.lineJoin = 'miter';
  const ring = (r) => {
    ctx.beginPath();
    r.forEach((p, i) => { const [x, y] = px(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  for (const f of fts) {
    const gm = f.geometry;
    if (gm.type === 'Polygon') gm.coordinates.forEach(ring);
    else if (gm.type === 'MultiPolygon') gm.coordinates.forEach((pg) => pg.forEach(ring));
  }
  return fts.length;
}

/** XLSX 첫 행 미리보기 — 열 이름은 `data-c` 로 남겨 fitFrames 가 어느 열을 접었는지 말할 수 있게 한다.
    꼬리 줄(총 행수)은 표 **밖**에 세운다 — 표 안에 두면 긴 문장이 표 폭을 넓혀 값이 잘렸다. */
export const xlsxTable = (x) => `<table class="xt n" data-cols="${x.head.length}"><tr class="xh">${x.head.map((h) => `<td data-c="${esc(h)}">${esc(h)}</td>`).join('')}</tr>${
  x.rows.map((r) => `<tr class="xr">${r.map((c, i) => `<td data-c="${esc(x.head[i] || '')}">${esc(c)}</td>`).join('')}</tr>`).join('')
  }</table><span class="xtf n" data-tail="${esc(x.tail)}">${esc(x.tail)}</span>`;
export const zipTree = (t, dim) => `<pre class="tree n${dim ? ' tree--dim' : ''}" data-full="${esc(t)}">${esc(t)}</pre>`;
/** 빈 액자 — 무엇이 없는지(t2) 와 그래서 무엇을 해야 하는지(t3). 그럴듯한 그림으로 채우지 않는다. */
export const noneBox = (t1, t2, t3) => `<span class="t1">${esc(t1)}</span>${t2 ? `<span class="t2 n">${esc(t2)}</span>` : ''}${t3 ? `<span class="t3 n">${esc(t3)}</span>` : ''}`;

/* ── 액자 맞춤 — 표·트리가 액자 밖으로 넘쳐 반쯤 잘린 줄을 남기지 않게 한다 ──────
   발주 지적(2026-09-20): `농지이용_행정정보_202604.xlsx` 는 `45190…` 으로 잘려 읽히지 않고,
   `camera_org_202604.zip` 은 파일 트리가 타일 밖으로 넘쳐 잘린다.
   고친 방법 — 지우는 게 아니라 **액자에 맞춰 접고 그 사실을 적는다**:
     · 표  = pnu 열 폭 제한(max-width 66/80px)과 pp 별 열 숨김을 걷었다. 대신 가로가 모자라면
             가운데 열부터 접고 꼬리 줄에 `+ emd` 처럼 접은 열을 적는다. 세로는 들어가는 행까지만
             두고 총 행수 꼬리 줄은 항상 남긴다(미리보기의 본뜻).
     · 트리 = 들어가는 줄까지 두고 마지막 줄(index.csv)은 남긴 뒤 `└ 외 n줄` 로 접은 줄 수를 적는다.
   모니터마다 액자 크기가 다르므로 CSS 상수가 아니라 **실측 높이**로 판정한다. */
export function fitFrames(root) {
  for (const t of root.querySelectorAll('table.xt')) fitTable(t);
  for (const p of root.querySelectorAll('pre.tree')) fitTree(p);
}
function fitTable(t) {
  const rows = [...t.rows];
  if (!rows.length) return;
  const tail = t.parentElement && t.parentElement.querySelector('.xtf');
  for (const r of rows) r.hidden = false;
  for (const td of t.querySelectorAll('td[data-c]')) td.hidden = false;
  const cols = [...t.querySelectorAll('.xh td')].map((td) => td.dataset.c);
  // 가로 — 넘치면 가운데 열부터 접는다(첫 열 = 열쇠값, 끝 열 = 값. 그 둘을 자르면 표가 아니라 글자 부스러기다)
  let live = cols.length;
  let guard = cols.length;
  while (t.scrollWidth > t.clientWidth + 1 && guard-- > 0 && live > 1) {
    const rest = [...t.querySelectorAll('.xh td')].filter((td) => !td.hidden).map((td) => td.dataset.c);
    const drop = rest.length > 2 ? rest[1] : rest[rest.length - 1];
    for (const td of t.querySelectorAll(`td[data-c="${CSS.escape(drop)}"]`)) td.hidden = true;
    live -= 1;
  }
  if (tail) tail.textContent = live < cols.length ? `${tail.dataset.tail} · ${live}/${cols.length}열` : tail.dataset.tail;
  // 세로 — 들어가는 행까지. 머리 줄은 항상 남긴다(꼬리 줄은 표 밖에 있어 늘 보인다).
  const box = t.clientHeight;
  if (box > 8) {
    let y = rows[0].offsetHeight || 20;
    for (const r of rows.slice(1)) {
      const h = r.offsetHeight || 20;
      if (y + h > box) r.hidden = true; else y += h;
    }
  }
}
function fitTree(p) {
  const all = String(p.dataset.full || p.textContent).split('\n');
  const cs = getComputedStyle(p);
  const lh = parseFloat(cs.lineHeight) || 19;
  const box = p.clientHeight;
  if (!box || box < 8) return;
  const fit = Math.max(1, Math.floor((box + 1) / lh));
  if (all.length <= fit) { p.textContent = all.join('\n'); return; }
  if (fit <= 2) { p.textContent = [all[0], `└ 외 ${all.length - 1}줄`].slice(0, fit).join('\n'); return; }
  // 앞줄 → 접은 줄 수 → 마지막 줄(index.csv). 반쯤 잘린 줄은 남기지 않는다.
  const keep = all.slice(0, fit - 2);
  p.textContent = [...keep, `├ 외 ${all.length - keep.length - 1}줄`, all[all.length - 1]].join('\n');
}
/** 코너 브래킷 SVG — 이미지 안 헤어라인 벡터. */
export const bracket = (w, h, color, k = 14) => {
  // 1px 선은 반 픽셀 안쪽에 세워야 overflow:hidden 액자 안에서 온전히 보인다.
  const o = 0.5, W = w - o, H = h - o;
  return `<svg class="br-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="M${o} ${k}V${o}h${k}M${W - k} ${o}h${k}v${k}M${W} ${H - k}v${k}h-${k}M${k} ${H}H${o}v-${k}" fill="none" stroke="${color}" stroke-width="1"/></svg>`;
};
export { esc };
