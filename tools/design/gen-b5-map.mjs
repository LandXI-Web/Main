// B5 지도 서비스 재생성기 — Map(기본: 실타일 + 레이어 카드 패널 + 시점 스트립) · Map-Info(객체 클릭: 브래킷 콜아웃 + 우 탐지 정보) · Map-Compare(겹쳐보기: 2025.04 | 2025.10 스와이프 + 변화 폴리곤)
// 발주 원문(2026-08-27): "지도서비스 화면이 필요하네. XI맵이랑 좀 다르다."
// 규칙 — ① design/system.md §1–§5 ② 파리티 = docs/superpowers/research/2026-08-27-map-inventory.md §2 (원본 ximap.html 22행 · 38 상태)
//        ③ 실데이터 = V-World Satellite 실타일(원본과 같은 WMTS · 같은 키) · results geojson 실좌표(농지 2,098 · 비닐하우스 1,674) · change.js 2504-2510(156) · imagery.js 남원 4시점 실타일
//        ④ 화면당 검정 CTA 1 · 서체 3 · 글자 바닥 14 · radius/shadow/gradient 0
// usage: node tools/design/gen-b5-map.mjs [--plates]   (repo root) — --plates 는 타일 스티치(V-World fetch · 로컬 webp)로 design-canvas/v2/img/map-*.jpg 를 다시 굽는다. 없으면 판 3장만 다시 쓴다(멱등).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { RESULTS } from '../../landxi/assets/data/results.js';
import { CHANGE } from '../../landxi/assets/data/change.js';

const root = process.cwd();
const dir = path.join(root, 'design-canvas/v2');
const imgDir = path.join(dir, 'img');
const PLATES = process.argv.includes('--plates');

// ---------- 레일 72 (b5-rail.html · 지도 서비스 = top 304px 활성) ----------
const RAIL0 = fs.readFileSync(path.join(root, 'tools/design/b5-rail.html'), 'utf8').replace(/\r\n/g, '\n');
const RAIL = (() => {
  const items = RAIL0.split('\n<div style="position:absolute;left:0;top:');
  return items.map((it, i) => {
    if (i === 0) return it;
    const on = it.startsWith('304px');
    let s = it.replace(/<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:#010102"><\/div>\n?/, '').replace(/color:#010102/g, 'color:#686868');
    if (on) s = s.replace(/color:#686868/g, 'color:#010102').replace('gap:6px">', 'gap:6px">\n<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:#010102"></div>');
    return s;
  }).join('\n<div style="position:absolute;left:0;top:');
})();
const wr = (f, s) => { fs.writeFileSync(path.join(dir, f), s, 'utf8'); console.log('wrote', f, s.length); };

const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', TEAL = '#0FA9A0', WARN = '#D1352B', AMB = '#FFB633';
const X0 = 128, CW = 1256;
const fmt = n => Math.round(n).toLocaleString('ko-KR');

// ---------- 실데이터 ----------
const FARM = RESULTS.find(r => r.id === 'namwon-farmland-2025');
const GH = RESULTS.find(r => r.id === 'namwon-greenhouse-2025');
const YA = RESULTS.find(r => r.id === 'yeosu-marine-2025-aerial');
const YD = RESULTS.find(r => r.id === 'yeosu-marine-2026-drone');
const CH = CHANGE.find(c => c.pair === '2504-2510');
const gj = f => JSON.parse(fs.readFileSync(path.join(root, 'landxi/assets/data/geo', f), 'utf8')).features;
const FARM_F = gj('results/namwon-farmland-2025.geojson');
const GH_F = gj('results/namwon-greenhouse-2025.geojson');
const CH_F = gj('namwon-change.geojson').filter(f => f.properties.pair === '2504-2510');
// imagery.js 남원 농경지 4시점 (실타일 · GSD)
const EPOCHS = [['2025.04', '1.08 cm', 'tile-ep-1.jpg', 'namwon_2504'], ['2025.06', '1.69 cm', 'tile-ep-2.jpg', 'namwon_2506'], ['2025.08', '1.54 cm', 'tile-arc-hid.jpg', 'namwon_2508'], ['2025.10', '1.68 cm', 'tile-ep-4.jpg', 'namwon_2510']];
const AOI = [127.3481, 35.5276, 127.3567, 35.5347];
// 남원시 읍면동 실명(1읍 15면 7동 중 결과가 있는 곳 · results.js emd)
const EMD_TOP = Object.entries(FARM.stats.emd).slice(0, 6);

// ---------- 웹 메르카토르 ----------
const R = 256;
const merc = (lon, lat, z) => { const n = R * 2 ** z; return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n]; };
const unmerc = (x, y, z) => { const n = R * 2 ** z; const lon = x / n * 360 - 180; const t = Math.PI * (1 - 2 * y / n); return [lon, Math.atan(Math.sinh(t)) * 180 / Math.PI]; };
const mPerPx = (lat, z) => 40075016.686 * Math.cos(lat * Math.PI / 180) / (R * 2 ** z);
const centroid = f => { let c = f.geometry.coordinates; while (typeof c[0][0] !== 'number') c = c[0]; let x = 0, y = 0; for (const p of c) { x += p[0]; y += p[1]; } return [x / c.length, y / c.length]; };
// 판 창(px 원점) — 특징점이 가장 많이 들어오는 중심을 고른다(실좌표 기반 · 손으로 고르지 않음)
function bestWindow(feats, z, W, H, weight = () => 1) {
  const pts = feats.map(f => [...merc(...centroid(f), z), weight(f)]);
  let best = null;
  for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 400))) {
    const [cx, cy] = pts[i]; const x0 = cx - W / 2, y0 = cy - H / 2; let n = 0;
    for (const [x, y, w] of pts) if (x >= x0 && x < x0 + W && y >= y0 && y < y0 + H) n += w;
    if (!best || n > best.n) best = { n, x0, y0 };
  }
  return { z, W, H, x0: Math.round(best.x0), y0: Math.round(best.y0), n: best.n };
}
const WIN14 = bestWindow([...FARM_F, ...GH_F], 14, 1368, 745);
const WIN17 = bestWindow(GH_F, 17, 1368, 745, f => f.properties.cls === '비닐하우스_단동' ? 1 : 2);
// 비교 창 z18 — AOI 중심(실타일 범위 안)
const WIN18 = (() => { const [x, y] = merc((AOI[0] + AOI[2]) / 2, (AOI[1] + AOI[3]) / 2, 18); return { z: 18, W: 1368, H: 745, x0: Math.round(x - 684), y0: Math.round(y - 372) }; })();
const winCenter = w => unmerc(w.x0 + w.W / 2, w.y0 + w.H / 2, w.z);
// 창 안 폴리곤 → SVG path (좌표 정수 · 창 밖은 버림)
function polysIn(feats, w, dec = 0) {
  const out = [];
  for (const f of feats) {
    const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(p => p[0]);
    let d = '', minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const ring of rings) {
      const pts = ring.map(([lo, la]) => { const [x, y] = merc(lo, la, w.z); return [x - w.x0, y - w.y0]; });
      for (const [x, y] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
      d += pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(dec) + ' ' + p[1].toFixed(dec)).join('') + 'Z';
    }
    if (maxx < 0 || maxy < 0 || minx > w.W || miny > w.H) continue;
    out.push({ d, f, box: [minx, miny, maxx, maxy] });
  }
  return out;
}

// ---------- 타일 스티치 (--plates) ----------
const VW_KEY = '88CF60F1-99BC-3338-8893-0FE768F13E61';   // 원본 ximap.html/map.js 와 같은 V-World 키
async function stitch(page, w, tileSrc, outName, q = 0.86) {
  const tx0 = Math.floor(w.x0 / R), ty0 = Math.floor(w.y0 / R), tx1 = Math.floor((w.x0 + w.W) / R), ty1 = Math.floor((w.y0 + w.H) / R);
  const tiles = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const src = await tileSrc(w.z, tx, ty); if (!src) continue;
    tiles.push({ src, dx: tx * R - w.x0, dy: ty * R - w.y0 });
  }
  const data = await page.evaluate(async ({ tiles, W, H, q }) => {
    const c = document.getElementById('c'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#DDD'; g.fillRect(0, 0, W, H);
    for (const t of tiles) { const im = new Image(); im.src = t.src; try { await im.decode(); g.drawImage(im, t.dx, t.dy, 256, 256); } catch (e) { } }
    return c.toDataURL('image/jpeg', q);
  }, { tiles, W: w.W, H: w.H, q });
  const buf = Buffer.from(data.split(',')[1], 'base64');
  fs.writeFileSync(path.join(imgDir, outName), buf);
  console.log('plate', outName, w.z, tiles.length, 'tiles', buf.length);
}
const vwTile = async (z, x, y) => {
  const r = await fetch(`https://api.vworld.kr/req/wmts/1.0.0/${VW_KEY}/Satellite/${z}/${y}/${x}.jpeg`, { headers: { Referer: 'https://mini531.github.io/' } });
  if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return 'data:image/jpeg;base64,' + b.toString('base64');
};
const localTile = id => async (z, x, y) => { const p = path.join(root, 'landxi/assets/tiles', id, String(z), String(x), y + '.webp'); return fs.existsSync(p) ? 'data:image/webp;base64,' + fs.readFileSync(p).toString('base64') : null; };
async function plates() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');
  await stitch(page, WIN14, vwTile, 'map-vw-z14.jpg');
  await stitch(page, WIN17, vwTile, 'map-vw-z17.jpg');
  // 클릭 객체 크롭 z19 (V-World) — 우 패널 이미지 372×220
  const sel = SEL_BOX(); const [cx, cy] = merc(...centroid(sel.f), 19);
  await stitch(page, { z: 19, W: 372, H: 220, x0: Math.round(cx - 186), y0: Math.round(cy - 110) }, vwTile, 'map-vw-crop.jpg', 0.9);
  await stitch(page, WIN18, localTile('namwon_2504'), 'map-ortho-2504.jpg', 0.8);
  await stitch(page, WIN18, localTile('namwon_2510'), 'map-ortho-2510.jpg', 0.8);
  await browser.close();
}
// 클릭 객체 = z17 창 안 가장 큰 다동 비닐하우스(실 feature)
function SEL_BOX() {
  const ps = polysIn(GH_F, WIN17, 1).filter(p => p.box[0] > 480 && p.box[2] < 980 && p.box[1] > 120 && p.box[3] < 620);
  ps.sort((a, b) => (b.f.properties.cls === '비닐하우스_다동') - (a.f.properties.cls === '비닐하우스_다동') || b.f.properties.area - a.f.properties.area);
  return ps[0];
}

// ---------- 헬멧 ----------
const HELMET = `<helmet><style>
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
/* Paperlogy 700/800 표시 · Pretendard 본문 · Inter 표 숫자 — T3 (발주 결정 2026-08-27) */
@font-face{font-family:'Paperlogy';font-weight:800;font-display:swap;src:url('https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2') format('woff2')}
@font-face{font-family:'Paperlogy';font-weight:700;font-display:swap;src:url('https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2') format('woff2')}
:root{--ink:#010102;--grey:#686868;--grey-2:#CCCCCC;--line:#DDDDDD;--accent:#006DF7;--tint-1:#E8F1FF;--tint-2:#D6E6FF;--teal:#0FA9A0;--warn:#D1352B;--amber:#FFB633}
*{box-sizing:border-box}
body{margin:0;background:#FFFFFF;color:var(--ink);font-family:'Pretendard',system-ui,sans-serif;font-weight:400;font-size:18px;line-height:1.5;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.015em}
.n{font-family:'Inter','Pretendard',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.lab{font-size:14px;line-height:1.2;color:var(--grey);letter-spacing:.04em}
.st{font-size:14px;line-height:1.2;color:var(--accent);font-weight:500;letter-spacing:.01em}
.tag{border:1px dotted var(--grey-2);padding:0 5px;font-size:14px;line-height:18px;color:var(--grey);margin-left:6px;display:inline-block;vertical-align:1px;letter-spacing:0;font-weight:400;font-family:'Pretendard',system-ui,sans-serif}
.tb{position:absolute;height:28px;line-height:30px;font-size:15px;letter-spacing:-.01em;color:var(--ink);white-space:nowrap}
.cta{position:absolute;height:36px;background:var(--ink);color:#FFFFFF;display:flex;align-items:center;justify-content:center;padding:0 20px;font-size:15px;font-weight:500;letter-spacing:-.01em;white-space:nowrap}
.fld{position:absolute;height:32px;border:1px solid var(--line);background:#FFFFFF;display:flex;align-items:center;padding:0 10px;gap:8px;font-size:14.5px;letter-spacing:-.01em;white-space:nowrap;color:var(--ink)}
.chip{height:24px;line-height:22px;padding:0 9px;border:1px solid var(--line);color:var(--ink);font-size:14px;white-space:nowrap;display:inline-block;background:#FFFFFF}
.chip.on{border-color:var(--accent);color:var(--accent);background:var(--tint-1)}
.tab{position:absolute;font-size:16px;letter-spacing:-.01em;color:var(--grey);white-space:nowrap;line-height:22px}
.tab .c{font-family:'Inter',system-ui,sans-serif;font-size:14px;color:var(--grey-2);margin-left:5px}
.tab.on{color:var(--ink)}
.tab.on .c{color:var(--accent)}
.det{position:absolute;height:20px;line-height:20px;padding:0 6px;font-family:'Inter',system-ui,sans-serif;font-size:14px;letter-spacing:.06em;color:#FFFFFF;background:var(--teal);white-space:nowrap}
.hud{position:absolute;font-family:'Inter',system-ui,sans-serif;font-size:14px;letter-spacing:.06em;color:#FFFFFF;white-space:nowrap;text-shadow:0 0 2px rgba(1,1,2,.9),0 0 6px rgba(1,1,2,.7)}
</style></helmet>`;

// ---------- 프리미티브 ----------
const div = (x, y, w, h, extra = '', inner = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">${inner}</div>\n`;
const hl = (x, y, w, col = H) => div(x, y, w, 1, `background:${col}`);
const vl = (x, y, h, col = H) => div(x, y, 1, h, `background:${col}`);
const UP = s => Math.max(14, s + 2);
const txt = (x, y, t, size = 13, col = INK, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;font-size:${UP(size)}px;letter-spacing:-.01em;color:${col};white-space:nowrap;line-height:1.3;${extra}">${t}</div>\n`;
const num = (x, y, t, size = 13, col = INK, extra = '') => `<div class="n" style="position:absolute;left:${x}px;top:${y}px;font-size:${UP(size)}px;letter-spacing:.01em;color:${col};white-space:nowrap;line-height:1.3;${extra}">${t}</div>\n`;
const disp = (x, y, t, size, col = INK, extra = '') => `<div class="d" style="position:absolute;left:${x}px;top:${y}px;font-size:${UP(size)}px;line-height:1.1;color:${col};white-space:nowrap;${extra}">${t}</div>\n`;
const lab = (x, y, t, extra = '') => `<div class="lab" style="position:absolute;left:${x}px;top:${y}px;white-space:nowrap;${extra}">${t}</div>\n`;
const cta = (x, y, w, t) => `<div class="cta" style="left:${x}px;top:${y}px;width:${w}px">${t}</div>\n`;
const chev = (col = G) => `<svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="${col}" stroke-width="1.25" style="flex:none"><path d="M.5.5 4.5 5 8.5.5"/></svg>`;
const fld = (x, y, w, inner, extra = '') => `<div class="fld" style="left:${x}px;top:${y}px;width:${w}px;${extra}">${inner}</div>\n`;
const chk = (x, y, on, col = INK) => `<div style="position:absolute;left:${x}px;top:${y}px;width:14px;height:14px;border:1px solid ${on ? col : C};background:${on ? col : '#FFFFFF'}"></div>` + (on ? `<svg width="14" height="14" viewBox="0 0 14 14" style="position:absolute;left:${x}px;top:${y}px" fill="none" stroke="#FFFFFF" stroke-width="1.5"><path d="M3 7.2 6 10l5-6"/></svg>` : '') + '\n';
const brk = (w, h, col = INK, k = 12, sw = 1, x = 0, y = 0) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:${x}px;top:${y}px;display:block;pointer-events:none;overflow:visible"><path d="M0 ${k}V0h${k}M${w - k} 0h${k}v${k}M${w} ${h - k}v${k}h-${k}M${k} ${h}H0v-${k}" fill="none" stroke="${col}" stroke-width="${sw}"/></svg>`;
const img = (x, y, w, h, src, over = '', extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:#EEE;${extra}"><img src="${src}" alt="" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;object-fit:cover;display:block">${over}</div>\n`;
const chip = (x, y, t, on = false) => `<span class="chip${on ? ' on' : ''}" style="position:absolute;left:${x}px;top:${y}px">${t}</span>\n`;
const ICONS = {
  close: '<path d="M4 4l12 12M16 4 4 16"/>', search: '<circle cx="8.5" cy="8.5" r="5.75"/><path d="m12.75 12.75 4 4"/>',
  globe: '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c3 3 3 11 0 14M10 3c-3 3-3 11 0 14"/>', ruler: '<path d="M3 13 13 3l4 4L7 17z"/><path d="M8 8l2 2M11 5l2 2M5 11l2 2"/>',
  pen: '<path d="M4 16l2-6 7-7 4 4-7 7z"/><path d="M11 5l4 4"/>', download: '<path d="M10 3v10M6 9l4 4 4-4M3 17h14"/>', layers: '<path d="M10 3 3 7l7 4 7-4z"/><path d="M3 11l7 4 7-4"/>',
  plus: '<path d="M10 4v12M4 10h12"/>', minus: '<path d="M4 10h12"/>', share: '<circle cx="5" cy="10" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 9l6-3M7 11l6 3"/>',
  user: '<circle cx="10" cy="7" r="3.5"/><path d="M3.5 17a6.5 6.5 0 0 1 13 0"/>', aoi: '<path d="M10 2.5l2.2 4.7 5.1.6-3.8 3.5 1 5.1L10 13.9l-4.5 2.5 1-5.1-3.8-3.5 5.1-.6z"/>',
  grip: '<path d="M6 5h8M6 10h8M6 15h8"/>', chart: '<path d="M4 16V9M10 16V4M16 16v-6"/>', doc: '<path d="M5 2h7l4 4v12H5z"/><path d="M12 2v4h4M7 10h6M7 13h6"/>',
  chevL: '<path d="M12 4l-6 6 6 6"/>', chevR: '<path d="M8 4l6 6-6 6"/>', chevU: '<path d="M4 12l6-6 6 6"/>', chevD: '<path d="M4 8l6 6 6-6"/>', refresh: '<path d="M16 10a6 6 0 1 1-2-4.5"/><path d="M14 2v4h-4"/>',
  list: '<path d="M4 5h12M4 10h12M4 15h12"/>', grid: '<rect x="3" y="3" width="6" height="6"/><rect x="11" y="3" width="6" height="6"/><rect x="3" y="11" width="6" height="6"/><rect x="11" y="11" width="6" height="6"/>',
  swap: '<path d="M3 7h12l-3-3M17 13H5l3 3"/>', gear: '<circle cx="10" cy="10" r="3"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.3 4.3l2.2 2.2M13.5 13.5l2.2 2.2M4.3 15.7l2.2-2.2M13.5 6.5l2.2-2.2"/>',
};
const ico = (k, col = INK, sz = 16) => `<svg width="${sz}" height="${sz}" viewBox="0 0 20 20" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="butt" style="flex:none">${ICONS[k]}</svg>`;
const ibtn = (x, y, w, k, label = '', on = false, h = 32) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:1px solid ${on ? INK : H};background:${on ? T2 : '#FFFFFF'};display:flex;align-items:center;justify-content:${label ? 'flex-start' : 'center'};gap:8px;padding:0 ${label ? 10 : 0}px;font-size:14.5px;white-space:nowrap">${ico(k, INK, 15)}${label}</div>\n`;
// 우 툴바 — 원본 9(검색 · 배경지도 · 측정 · 그리기 · 내보내기 · 관심 구역 · LX 레이어 · 확대 · 축소) 그대로, 내보내기는 검정 CTA 로 승격되는 판에서는 아이콘 자리 유지
function mapTools(x, y, active = '') {
  let s = '';
  const top = ['search', 'globe', 'ruler', 'pen', 'download', 'aoi', 'layers'];
  top.forEach((k, i) => { const on = k === active; s += div(x, y + i * 36, 36, 36, `background:${on ? T2 : '#FFFFFF'};border:1px solid ${H};border-top-width:${i ? 0 : 1}px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1px`, ico(k, INK, 16) + (k === 'layers' ? `<span class="n" style="font-size:14px;line-height:1;letter-spacing:.06em;transform:scale(.8);color:${INK}">LX</span>` : '')); });
  const y2 = y + top.length * 36 + 12;
  ['plus', 'minus'].forEach((k, i) => { s += div(x, y2 + i * 36, 36, 36, `background:#FFFFFF;border:1px solid ${H};border-top-width:${i ? 0 : 1}px;display:flex;align-items:center;justify-content:center`, ico(k, INK, 16)); });
  return s;
}
const page = (title, body, h = 900) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
${HELMET}
<div style="width:1440px;height:${h}px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard',system-ui,sans-serif;color:#010102">
${RAIL}${vl(72, 0, h)}${body}</div>
</x-dc>
</body>
</html>
`;
const FOOT = hl(72, 866, 1368) + txt(X0, 876, 'LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부', 12, G);
const MAST = `<div style="position:absolute;left:${X0}px;top:0;width:${CW}px;height:64px;display:flex;align-items:center;gap:12px">
<span class="chip" style="color:${G}">공지</span>
<span style="font-size:16px;letter-spacing:-.01em">고위험 탐지 건 긴급 처리 안내</span>
<span class="n" style="font-size:14.5px;color:${G};letter-spacing:.02em">2026.04.15</span>
<span style="font-size:14.5px;color:${G};margin-left:6px">전체 보기 ›</span>
<div style="flex:1"></div>
<span style="font-size:14px;color:${G}">기준일 현재</span>
<span class="n" style="font-size:16px;letter-spacing:.02em;color:${G}">2026.08.27</span>
</div>
` + hl(72, 64, 1368);
// 압축 타이틀 행 64–120 + 원본 모드 탭 3(기본 · 겹쳐보기 · 나란히보기) = 세그먼트
const MODES = ['기본', '겹쳐보기', '나란히보기'];
function head(sub, mode) {
  let s = MAST + disp(X0, 80, '지도 서비스', 20) + txt(X0 + 118, 84, sub, 13.5, G);
  let cx = 1120;
  for (const m of MODES) { const on = m === mode; s += `<div class="tab${on ? ' on' : ''}" style="left:${cx}px;top:84px">${m}</div>\n`; if (on) s += div(cx, 112, m.length * 16, 2, `background:${INK}`); cx += m.length * 16 + 28; }
  return s + hl(72, 120, 1368);
}
const MY = 121, MH = 745, MX = 72, MW = 1368;
// 판(실타일) + 오버레이 — 채도만 살짝 낮춰(선택적 채도) 결과 도형이 앞으로 나온다
const plate = (src, over, title, filter = 'saturate(.72) contrast(1.04)') => `<div title="${title}" style="position:absolute;left:${MX}px;top:${MY}px;width:${MW}px;height:${MH}px;overflow:hidden;background:#DDD"><img src="${src}" alt="" style="position:absolute;left:0;top:0;width:${MW}px;height:${MH}px;display:block;filter:${filter}">${over}</div>\n`;
const svgLayer = (inner, w = MW, h = MH) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block;pointer-events:none">${inner}</svg>`;
const FARM_STYLE = f => f.properties.cls === '경작지' ? `fill="rgba(15,169,160,.32)" stroke="${TEAL}" stroke-width="1"` : `fill="rgba(15,169,160,.08)" stroke="${TEAL}" stroke-width="1" stroke-dasharray="3 2"`;
const GH_STYLE = f => f.properties.cls === '비닐하우스_단동' ? `fill="rgba(0,109,247,.28)" stroke="${ACC}" stroke-width="1"` : `fill="rgba(0,109,247,.10)" stroke="${ACC}" stroke-width="1.25"`;
const pathsOf = (ps, style, extra = '') => ps.map(p => `<path d="${p.d}" ${style(p.f)} stroke-linejoin="miter" ${extra}/>`).join('');
// 스케일 바 + 좌표 캡션(HUD 숫자 = 해설: 단위 · 기준 · 시점)
function scaleBar(x, y, w, z, lat, lonlat, src) {
  const m = mPerPx(lat, z); let len = [100, 200, 500, 1000, 2000, 5000][0];
  for (const l of [100, 200, 500, 1000, 2000, 5000]) if (l / m <= w) len = l;
  const px = Math.round(len / m);
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${px}px;height:6px;border:1px solid #FFFFFF;border-top:0"></div>` +
    `<div class="hud" style="left:${x}px;top:${y - 20}px">${len >= 1000 ? len / 1000 + ' km' : len + ' m'}</div>` +
    `<div class="hud" style="left:${x + px + 16}px;top:${y - 20}px">${lonlat[0].toFixed(4)} E · ${lonlat[1].toFixed(4)} N · z${z} · ${src}</div>`;
}
// 범례 — 설계 스와치(채움/외곽/점선) + 수(전체 실측)
function legend(x, y, w, rows, title = '범례') {
  let s = div(x, y, w, 20 + rows.length * 26 + 14, `background:#FFFFFF;border:1px solid ${H}`) + lab(x + 12, y + 10, title);
  rows.forEach(([sw, name, n, note], i) => {
    const yy = y + 32 + i * 26;
    s += `<div style="position:absolute;left:${x + 12}px;top:${yy + 2}px;width:18px;height:12px;${sw}"></div>` + txt(x + 40, yy - 2, name, 12.5) + (n ? num(x + w - 12, yy - 1, n, 12.5, INK, 'transform:translateX(-100%)') : '') + (note ? txt(x + 40, yy + 15, note, 11, G) : '');
  });
  return s;
}
const SW = { tealFill: `background:rgba(15,169,160,.32);border:1px solid ${TEAL}`, tealDash: `background:rgba(15,169,160,.08);border:1px dashed ${TEAL}`, accFill: `background:rgba(0,109,247,.28);border:1px solid ${ACC}`, accLine: `background:rgba(0,109,247,.10);border:1px solid ${ACC}`, inkDash: `background:transparent;border:1px dashed ${INK}`, ambFill: `background:rgba(255,182,51,.35);border:1px solid ${AMB}` };
// 시점 스트립 — LX 레이어 도구(LX 정사영상 3 라디오) · 레이어 트리 정사영상 2 의 재표현 = imagery.js 남원 농경지 4시점 실타일
const EPOCH_W = 4 * 116 + 3 * 12 + 24;
function epochStrip(x, y, sel = [], marks = {}) {
  const TW = 116, TH = 66, GAP = 12;
  let s = div(x, y, EPOCH_W, TH + 56, `background:#FFFFFF;border:1px solid ${H}`);
  s += lab(x + 12, y + 10, '정사영상 시점 · 남원 농경지 · 드론 · GSD 1.08 / 1.69 / 1.54 / 1.68 cm') + txt(EPOCH_W + x - 12 - 72, y + 6, 'LX 정사영상', 12, G) + `<div style="position:absolute;left:${x + EPOCH_W - 12 - 12}px;top:${y + 10}px">${chev()}</div>`;
  EPOCHS.forEach(([d, gsd, src], i) => {
    const xx = x + 12 + i * (TW + GAP), yy = y + 30, on = sel.includes(d);
    s += img(xx, yy, TW, TH, src, on ? brk(TW, TH, ACC, 10, 1.25) : '', `outline:1px solid ${on ? ACC : H}`);
    if (marks[d]) s += `<div class="det" style="left:${xx + 6}px;top:${yy + 6}px;background:${ACC}">${marks[d]}</div>`;
    s += num(xx, yy + TH + 6, d, 12.5, on ? ACC : INK) + (on ? txt(xx + 66, yy + TH + 7, '표시 중', 11, ACC) : '');
  });
  // 틱 룰러(4시점 · 선택 틱 액센트)
  const ry = y + TH + 50;
  s += div(x + 12, ry, 4 * TW + 3 * GAP, 1, `background:${H}`);
  EPOCHS.forEach(([d], i) => { const xx = x + 12 + i * (TW + GAP) + TW / 2; s += div(xx, ry - 4, sel.includes(d) ? 2 : 1, sel.includes(d) ? 9 : 5, `background:${sel.includes(d) ? ACC : G}`); });
  return s;
}

// ======================================================================
// 레이어 카드 패널(좌 372) — 원본 좌 카드(탭 2 · 보기 설정 · 과제 아코디언 · job 체크/펼침/하위 레이어 3 · 공유 아이콘)를 실결과 카드로
// ======================================================================
const LW = 372;
const LAYERS = [
  { grp: '농지이용·불법건축물', cnt: 1, items: [{ name: FARM.title, meta: '2025.06 · 드론 1.69 cm', n: fmt(FARM.stats.count) + ' 필지', src: 'tile-farm-clean.jpg', on: true, op: 100, sub: [true, true, true], shared: false, sw: SW.tealFill }] },
  { grp: '비닐하우스 현황', cnt: 1, items: [{ name: GH.title, meta: '2025.06 · 드론 1.69 cm', n: fmt(GH.stats.count) + ' 필지', src: 'tile-gh-clean.jpg', on: true, op: 70, sub: [true, false, true], shared: true, sw: SW.accFill }] },
  { grp: '드론 변화탐지', cnt: 1, items: [{ name: '남원 농경지 변화 지수(비지도)', meta: '2025.04 → 2025.10', n: fmt(CH_F.length) + ' 건', src: 'ev-change.jpg', on: false, op: 100, sub: null, shared: false, sw: SW.inkDash }] },
  { grp: '해양쓰레기 실태조사', cnt: 2, items: [{ name: YA.title, meta: '2025 · 항공 12 cm', n: fmt(YA.stats.count) + ' 건', src: 'tile-arc-yeosu-air.jpg', on: false, op: 100, sub: null, shared: true, sw: SW.tealFill }, { name: YD.title, meta: '2026 · 드론 5 cm', n: fmt(YD.stats.count) + ' 건', src: 'tile-yeosu-drone-clean.jpg', on: false, op: 100, sub: null, shared: false, sw: SW.tealFill }] },
];
const READY0 = ['도로안전 다시점 조사', '개발제한구역 훼손', '태양광 설비 현황', '사료작물 재배지', '불법 소각시설', '건축물 변화 탐지', '곤포 사일리지 집계', '방치폐기물 탐지', '하천 불법점용', '산림 훼손 탐지', '탄소 흡수량 산정'];
function layerPanel(x, y, h, tab = 'result') {
  const LI = x + 16, LIW = LW - 32;
  let s = div(x, y, LW, h, 'background:#FFFFFF') + vl(x + LW, y, h, INK);
  // 헤더: 접기 ‹ · 탭 2 · 보기 설정 ▾ (원본 그대로)
  s += `<div style="position:absolute;left:${LI}px;top:${y + 18}px">${ico('chevL', G, 14)}</div>`;
  s += `<div class="tab${tab === 'result' ? ' on' : ''}" style="left:${LI + 24}px;top:${y + 14}px">AI 분석 결과<span class="c">5</span></div>`;
  s += `<div class="tab${tab === 'layer' ? ' on' : ''}" style="left:${LI + 152}px;top:${y + 14}px">레이어<span class="c">12</span></div>`;
  s += div(LI + 24, y + 42, tab === 'result' ? 108 : 0, 2, `background:${INK}`);
  s += `<div style="position:absolute;left:${LI + LIW - 86}px;top:${y + 16}px;display:flex;align-items:center;gap:6px;font-size:14px;color:${G}">${ico('gear', G, 14)}보기 설정${chev()}</div>`;
  s += hl(x, y + 52, LW);
  // 보기 설정 내용(원본 팝오버: 내/공유 · 모두 열기/접기 · 과제별/목록) = 한 줄 칩
  let cx = LI; const yy = y + 62;
  [['내 것', true], ['공유 받은 것', true], ['모두 열기', false], ['목록 보기', false]].forEach(([t, on]) => { s += chip(cx, yy, t, on); cx += t.length * 13.6 + 22; });
  let cy = y + 100;
  for (const g of LAYERS) {
    // 과제 아코디언 헤더(펼침 · 이름 · k/n)
    s += `<div style="position:absolute;left:${LI}px;top:${cy}px">${ico('chevD', G, 12)}</div>` + disp(LI + 18, cy - 3, g.grp, 14) + num(LI + LIW, cy - 1, `${g.items.filter(i => i.on).length}/${g.cnt}`, 12.5, g.items.some(i => i.on) ? ACC : G, 'transform:translateX(-100%)');
    cy += 26;
    for (const it of g.items) {
      // 켜진 레이어 = 큰 카드(투명도 슬라이더 · 하위 레이어 3) · 꺼진 레이어 = 압축 카드(체크 · 썸네일 · 이름 · 수) — 원본 job 행 펼침/접힘과 같은 두 상태
      const CH = it.on ? (it.sub ? 108 : 78) : 58;
      if (it.on) s += div(x + 1, cy - 6, LW - 2, CH + 2, `background:${T1}`);
      s += chk(LI, cy + 2, it.on, ACC);
      const tx = LI + 24;
      s += img(tx, cy, 88, 54, it.src, `<div style="position:absolute;left:0;top:0;width:88px;height:54px;${it.sw};background:none;border-width:0;border-bottom:3px ${it.sw.includes('dashed') ? 'dashed' : 'solid'} ${it.sw.includes('0,109,247') ? ACC : it.sw.includes('15,169,160') ? TEAL : INK}"></div>` + (it.on ? brk(88, 54, ACC, 8, 1) : ''), `outline:1px solid ${it.on ? ACC : H}`);
      s += disp(tx + 100, cy - 2, it.name, 13, INK, `width:${LIW - 124 - 16}px;overflow:hidden;text-overflow:ellipsis`);
      s += txt(tx + 100, cy + 18, it.meta, 11.5, G) + `<div class="st" style="position:absolute;left:${tx + 100}px;top:${cy + 38}px;color:${it.on ? ACC : TEAL}">${it.n}</div>`;
      if (it.shared) s += `<div style="position:absolute;left:${LI + LIW - 40}px;top:${cy + 36}px">${ico('share', G, 13)}</div>`;
      s += `<div style="position:absolute;left:${LI + LIW - 16}px;top:${cy + 18}px">${ico('grip', C, 14)}</div>`;   // 순서 = 드래그 손잡이
      // 투명도 헤어라인 슬라이더(원본 없음 → 표시값만 · 구현 시 레이어 opacity) + 하위 레이어 3 체크(원본: 탐지 결과 · 원본 영상 · 분석 영역)
      const sy = cy + 62;
      if (it.on) s += lab(tx, sy - 1, '투명도') + div(tx + 52, sy + 6, LIW - 24 - 52 - 60, 1, `background:${H}`) + div(tx + 52, sy + 6, Math.round((LIW - 24 - 52 - 60) * it.op / 100), 1, `background:${it.on ? ACC : G}`) + div(tx + 52 + Math.round((LIW - 24 - 52 - 60) * it.op / 100) - 4, sy + 2, 8, 8, `background:#FFFFFF;border:1px solid ${it.on ? ACC : G}`) + num(tx + LIW - 24 - 44, sy - 1, it.op + ' %', 12, G);
      if (it.on && it.sub) {
        const names = ['탐지 결과', '원본 영상', '분석 영역']; let sx = tx;
        names.forEach((nm, i) => { s += chk(sx, sy + 24, it.sub[i], INK) + txt(sx + 20, sy + 20, nm, 12, it.sub[i] ? INK : G); sx += 96; });
      }
      cy += CH + 8;
      s += hl(LI, cy - 4, LIW);
    }
    cy += 6;
  }
  // 준비 중 서비스(services.js count 0 / 결과 없음) — 접힌 아코디언 한 줄씩
  s += lab(LI, cy + 2, '준비 중 · 결과 레이어 없음');
  cy += 22;
  READY0.slice(0, 2).forEach(nm => { s += `<div style="position:absolute;left:${LI}px;top:${cy}px">${ico('chevR', C, 12)}</div>` + txt(LI + 18, cy - 4, nm, 13, G) + num(LI + LIW, cy - 2, '0', 12.5, C, 'transform:translateX(-100%)'); cy += 22; });
  s += txt(LI + 18, cy - 4, `그 외 ${READY0.length - 2} · 준비 중`, 12.5, C);
  return s;
}
// 좌 패널 접힘 탭(원본 `설정 패널 펼치기`)
const collapsedLeft = (x, y, h) => div(x, y, 36, h, `background:#FFFFFF`) + vl(x + 36, y, h, INK) + `<div style="position:absolute;left:${x + 10}px;top:${y + 16}px">${ico('chevR', INK, 14)}</div>` + `<div style="position:absolute;left:${x + 8}px;top:${y + 44}px;writing-mode:vertical-rl;font-size:14px;letter-spacing:.08em;color:${G};white-space:nowrap">설정 패널 펼치기</div>`;
// 검색 필드(원본: 툴바 검색 → 오버레이 · 탭 전체/명칭/도로명/지번)
const searchField = (x, y, w) => fld(x, y, w, `${ico('search', G, 14)}<span style="color:${C}">명칭 또는 지도 검색 · 운봉읍 · 금지면 …</span><span style="flex:1"></span><span style="font-size:14px;color:${G}">전체 · 명칭 · 도로명 · 지번</span>`);
// 하단 행정정보 표 띠(접힌 상태 · 원본 탭 3 · 정보 2 · 검색 · 페이지 · 총 n건)
function bottomBand(x, y, w, title, cols, count) {
  const wide = w > 600, tw = Math.round(title.length * 14.5) + 12;
  let s = div(x, y, w, 40, `background:#FFFFFF;border-top:1px solid ${H}`);
  s += disp(x + 20, y + 11, title, 13) + num(x + 20 + tw, y + 12, cols ? `${count} · ${cols}` : count, 12, G, `width:${w - tw - (wide ? 300 : 80)}px;overflow:hidden;text-overflow:ellipsis`);
  if (wide) s += txt(x + w - 236, y + 11, '공간 정보 · 지역 구분 · 분석 결과', 12, G);
  s += `<div style="position:absolute;left:${x + w - 40}px;top:${y + 12}px;display:flex;gap:10px">${ico('search', G, 14)}${ico('chevU', G, 14)}</div>`;
  return s;
}

// ======================================================================
// 1. B5-Map — 기본: V-World z14 실타일 + 결과 레이어 2(농지 청록 · 비닐하우스 파랑) + 레이어 카드 패널 + 시점 스트립 + 범례 + 툴바 9
// ======================================================================
function boardMap() {
  const fp = polysIn(FARM_F, WIN14), gp = polysIn(GH_F, WIN14);
  const cult = fp.filter(p => p.f.properties.cls === '경작지').length, unc = fp.length - cult;
  const [clon, clat] = winCenter(WIN14);
  let s = head(`남원시 · 결과 레이어 2 · V-World 위성 · 기준일 ${FARM.stats.analyzedAt.replace(/-/g, '.')}`, '기본');
  const over = svgLayer(pathsOf(fp, FARM_STYLE) + `<g opacity=".7">${pathsOf(gp, GH_STYLE)}</g>`) +
    scaleBar(LW + 24 + EPOCH_W + 20, MH - 20, 240, 14, clat, [clon, clat], 'V-World 위성');
  s += plate('map-vw-z14.jpg', over, `V-World Satellite z14 실타일 스티치(원본과 같은 WMTS · 키) · 창 중심 ${clon.toFixed(5)}, ${clat.toFixed(5)} · 창 안 농지 ${fp.length} · 비닐하우스 ${gp.length} (results geojson 실좌표 투영)`);
  s += layerPanel(MX, MY, MH);
  // 지도 위 — 검색 · HUD 해설 · 툴바 · CTA 내보내기(원본 툴바 내보내기 = 보안 서약서 모달)
  s += searchField(MX + LW + 24, MY + 16, 372);
  s += `<div class="hud" style="left:${MX + LW + 24}px;top:${MY + 58}px">창 안 · 경작지 ${fmt(cult)} · 비경작지 ${fmt(unc)} · 비닐하우스 ${fmt(gp.length)} 필지 / 전체 ${fmt(FARM.stats.count)} · ${fmt(GH.stats.count)}</div>`;
  s += mapTools(1440 - 16 - 36, MY + 16);
  s += cta(1440 - 16 - 36 - 12 - 92, MY + 16 - 2, 92, '내보내기');
  // 범례(설계 스와치 · 전체 실측 수) — 우하
  const LGX = 1440 - 16 - 36 - 12 - 252, LGY = MY + MH - 20 - 20 - 4 * 26 - 14 - 26;
  s += legend(LGX, LGY, 252, [[SW.tealFill, '경작지', fmt(FARM.stats.classes['경작지'])], [SW.tealDash, '비경작지', fmt(FARM.stats.classes['비경작지'])], [SW.accFill, '비닐하우스 · 단동', fmt(GH.stats.classes['비닐하우스_단동'])], [SW.accLine, '비닐하우스 · 다동', fmt(GH.stats.classes['비닐하우스_다동'])]], '범례 · 필지 수 · 클릭 = 숨김');
  // 시점 스트립 — 좌하(패널 옆)
  s += epochStrip(MX + LW + 24, MY + MH - 20 - (66 + 56), ['2025.06']);
  // 우 `분석 결과/성과` 는 접힌 상태(원본 접기 가능) — 펼치기 탭
  s += div(1440 - 16 - 36 - 12 - 92 - 12 - 132, MY + 16, 132, 32, `background:#FFFFFF;border:1px solid ${H};display:flex;align-items:center;gap:6px;padding:0 10px;font-size:14px;color:${G}`, `${ico('chevL', G, 12)}분석 결과/성과`);
  s += FOOT;
  return page('B5 지도 서비스 · 기본(실타일 + 레이어 카드 + 시점)', s);
}

// ======================================================================
// 2. B5-Map-Info — 객체 클릭: z17 V-World + 비닐하우스/농지 폴리곤 · 선택 객체 액센트 브래킷 + 리더 + 콜아웃 · 우 탐지 정보(실속성 · 조치 상태 3단 · 메모 · 저장) · 분석 개요 · 통계/보고서 · 하단 표 띠
// ======================================================================
function boardInfo() {
  const fp = polysIn(FARM_F, WIN17, 1), gp = polysIn(GH_F, WIN17, 1);
  const sel = SEL_BOX(); const P = sel.f.properties; const [slon, slat] = centroid(sel.f);
  const [clon, clat] = winCenter(WIN17);
  const RW = 420, RX = 1440 - RW, LCW = 36;
  let s = head(`남원시 ${P.emd} · 객체 선택 · ${GH.title}`, '기본');
  // 콜아웃 위치: 객체 bbox 우상단 → 리더 → 박스
  const [bx0, by0, bx1, by1] = sel.box.map(v => Math.round(v));
  const CBW = 330, CBH = 106;
  const CX = Math.min(bx1 + 60, RX - MX - 36 - 16 - 16 - CBW), CY = Math.max(by0 - 150, 70);
  let over = svgLayer(pathsOf(fp, FARM_STYLE) + `<g opacity=".8">${pathsOf(gp, GH_STYLE)}</g>` +
    `<path d="${sel.d}" fill="rgba(0,109,247,.38)" stroke="${ACC}" stroke-width="2"/>` +
    `<path d="M${bx1} ${by0}L${CX} ${CY + CBH}" stroke="${ACC}" stroke-width="1.25"/>`);
  over += brk(bx1 - bx0 + 16, by1 - by0 + 16, ACC, 12, 1.5, bx0 - 8, by0 - 8);
  // 콜아웃(흰 판 · 헤어라인 · 실속성 — 원본 팝업 4행: 모델 · 클래스 · 주소 · 탐지일시)
  over += div(CX, CY, CBW, CBH, `background:#FFFFFF;border:1px solid ${INK}`) + `<div class="det" style="left:${CX + 12}px;top:${CY + 12}px;background:${ACC}">${P.cls.replace('_', ' · ')}</div>` + num(CX + CBW - 12, CY + 13, `${GH.title.replace('남원시 ', '')} · XI-VFM`, 11.5, G, 'transform:translateX(-100%)') +
    num(CX + 12, CY + 40, `신뢰도 ${P.conf.toFixed(2)} · 면적 ${fmt(P.area)} ㎡ · 객체 ${P.nobj} 동`, 12, INK) + num(CX + 12, CY + 60, `남원시 ${P.emd} · PNU ${P.pnu}`, 12, G) + num(CX + 12, CY + 80, `탐지 ${GH.stats.analyzedAt.replace(/-/g, '.')} · 드론 2025.06`, 12, G);
  over += scaleBar(LCW + 24, MH - 20, 240, 17, clat, [slon, slat], 'V-World Satellite · 선택 객체 좌표');
  s += plate('map-vw-z17.jpg', over, `V-World Satellite z17 실타일 · 창 중심 ${clon.toFixed(5)}, ${clat.toFixed(5)} · 선택 = ${P.id.slice(0, 8)} ${P.cls} ${P.area} ㎡ (namwon-greenhouse-2025.geojson)`);
  s += collapsedLeft(MX, MY, MH);
  s += searchField(MX + LCW + 24, MY + 16, 372);
  s += `<div class="hud" style="left:${MX + LCW + 24}px;top:${MY + 58}px">창 안 · 비닐하우스 ${fmt(gp.length)} · 농지 ${fmt(fp.length)} 필지 · 클릭 = 탐지 정보</div>`;
  s += mapTools(RX - 16 - 36, MY + 16, 'search');
  s += legend(MX + LCW + 24, MY + MH - 20 - 20 - 2 * 26 - 14 - 26, 232, [[SW.accFill, '비닐하우스 · 단동', fmt(GH.stats.classes['비닐하우스_단동'])], [SW.accLine, '비닐하우스 · 다동', fmt(GH.stats.classes['비닐하우스_다동'])]], '범례 · 필지 수');
  // 하단 행정정보 표 띠(원본: 연번 · 시도 · 시군구 · 읍면동 · 리 · 산 · 본번 · 부번 · 탐지 클래스 · 면적 ㎡)
  s += bottomBand(MX + LCW + 1, MY + MH - 40, RX - MX - LCW - 1, '필지 행정정보', '연번 · 시도 · 시군구 · 읍면동 · 리 · 산 · 본번 · 부번 · 탐지 클래스 · 면적 ㎡', `총 ${fmt(GH.stats.count)}건 중 1~10행`);
  // 우 패널 420 — 탐지 정보
  s += div(RX, MY, RW, MH, 'background:#FFFFFF') + vl(RX, MY, MH, INK);
  const RI = RX + 24, RIW = RW - 48;
  s += lab(RI, MY + 16, '탐지 정보') + `<div style="position:absolute;left:${RX + RW - 30}px;top:${MY + 14}px">${ico('close', G, 12)}</div>`;
  s += disp(RI, MY + 34, P.cls.replace('_', ' '), 20) + txt(RI, MY + 62, `${GH.title} · 남원시 ${P.emd} · <span style="color:${TEAL}">처리 완료</span>`, 13, G);
  // 실크롭(V-World z19 · 선택 객체 중심) + 브래킷
  const IH = 176;
  s += img(RI, MY + 92, RIW, IH, 'map-vw-crop.jpg', brk(RIW, IH, ACC, 14, 1.25) + `<div class="det" style="left:12px;top:12px;background:${ACC}">DETECTED ${P.conf.toFixed(2)}</div>` + `<div class="hud" style="left:12px;top:${IH - 30}px">z19 · V-World · ${slon.toFixed(5)} E ${slat.toFixed(5)} N</div>`, `outline:1px solid ${H}`);
  const kv = [['탐지 클래스', P.cls.replace('_', ' ')], ['신뢰도', `${P.conf.toFixed(4)} · SAM ${P.sam.toFixed(2)}`], ['면적', `${fmt(P.area)} ㎡`], ['PNU', P.pnu], ['읍면동', `전북특별자치도 남원시 ${P.emd}`], ['필지 내 객체', `${P.nobj} 동`], ['탐지 일시', GH.stats.analyzedAt.replace(/-/g, '.') + ' · 드론 2025.06'], ['원본 파일', GH.src]];
  const KY = MY + 92 + IH + 14;
  kv.forEach(([k, v], i) => { const y = KY + i * 24; s += lab(RI, y + 3, k) + `<div class="${/PNU|신뢰|면적/.test(k) ? 'n' : ''}" style="position:absolute;left:${RI + 96}px;top:${y}px;font-size:14px;color:${INK};white-space:nowrap;width:${RIW - 96}px;overflow:hidden;text-overflow:ellipsis">${v}</div>`; });
  s += hl(RI, KY + kv.length * 24 + 4, RIW);
  // 조치 상태 변경 3단(원본 상세 모달: 발견 → 조치중 → 완료) + 조치 메모 + 닫기/저장(검정 CTA 1)
  const SY = KY + kv.length * 24 + 16;
  s += lab(RI, SY, '조치 상태 변경');
  const steps = ['발견', '조치중', '완료']; const sw = (RIW - 24) / 3;
  s += div(RI + 8, SY + 30, RIW - 16, 1, `background:${H}`);
  steps.forEach((t, i) => { const x = RI + 8 + i * sw + sw / 2; const on = i === 0; s += div(x - 5, SY + 25, 11, 11, `background:${on ? ACC : '#FFFFFF'};border:1px solid ${on ? ACC : C}`) + txt(x, SY + 42, t, 12.5, on ? ACC : G, 'transform:translateX(-50%)' + (on ? ';font-weight:500' : '')); });
  s += fld(RI, SY + 70, RIW - 92 - 12 - 72 - 12, `<span style="color:${C}">조치 메모 · 예) 4/15 현장 확인</span>`, 'height:36px');
  s += ibtn(RI + RIW - 92 - 12 - 72, SY + 72, 72, 'close', '닫기') + cta(RI + RIW - 92, SY + 70, 92, '저장');
  s += txt(RI, SY + 112, '← 이전으로 · 탐지 목록', 12.5, G);
  s += hl(RI, SY + 136, RIW);
  // 분석 개요(원본 우 카드: 클래스 × 면적 m² + 합계) — 실측 classAreaM2 한 줄 + 통계/보고서 버튼(원본 우 스택 상단 2)
  const OY = SY + 150;
  s += lab(RI, OY, '분석 개요 · 클래스별 면적 · 합계 ' + fmt(GH.stats.areaM2) + ' ㎡');
  const tot = Object.values(GH.stats.classAreaM2).reduce((a, b) => a + b, 0);
  [['비닐하우스_단동', SW.accFill, ACC], ['비닐하우스_다동', SW.accLine, INK]].forEach(([c, swt, col], i) => { const y = OY + 20 + i * 22, w = Math.round((RIW - 190) * GH.stats.classAreaM2[c] / tot); s += `<div style="position:absolute;left:${RI}px;top:${y + 5}px;width:14px;height:10px;${swt}"></div>` + txt(RI + 20, y, c.replace('비닐하우스_', ''), 13) + div(RI + 60, y + 9, RIW - 190, 3, `background:${H}`) + div(RI + 60, y + 9, w, 3, `background:${col}`) + num(RI + RIW, y + 1, `${fmt(GH.stats.classAreaM2[c])} ㎡ · ${Math.round(100 * GH.stats.classAreaM2[c] / tot)} %`, 12, INK, 'transform:translateX(-100%)'); });
  s += ibtn(RI, OY + 68, 150, 'chart', '통계 자세히 보기') + ibtn(RI + 162, OY + 68, 118, 'doc', '보고서 발급');
  s += FOOT;
  return page('B5 지도 서비스 · 객체 정보(브래킷 콜아웃 + 탐지 정보)', s);
}

// ======================================================================
// 3. B5-Map-Compare — 겹쳐보기(원본 모드 2): 2025.04 | 2025.10 실정사영상 스와이프 + 변화 지수(비지도) 폴리곤 156 · 우 `비교 결과` KPI 표 · 시점 스트립 L/R
// ======================================================================
function boardCompare() {
  const cp = polysIn(CH_F, WIN18, 1);
  const byCls = {}; let area = 0; for (const p of cp) { byCls[p.f.properties.cls] = (byCls[p.f.properties.cls] || 0) + 1; area += p.f.properties.area_m2; }
  const [clon, clat] = winCenter(WIN18);
  const RW = 400, RX = 1440 - RW, DIV = Math.round(MW * 0.52);
  let s = head('남원 농경지 · 겹쳐보기 · 2025.04 | 2025.10 · 변화 지수(비지도)', '겹쳐보기');
  const CHS = f => f.properties.cls === 'veg_gain' ? `fill="rgba(15,169,160,.30)" stroke="${TEAL}" stroke-width="1"` : f.properties.cls === 'veg_loss' ? `fill="rgba(15,169,160,.06)" stroke="${TEAL}" stroke-width="1" stroke-dasharray="3 2"` : f.properties.cls === 'built_new' ? `fill="rgba(0,109,247,.30)" stroke="${ACC}" stroke-width="1.25"` : `fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="2 2"`;
  // 판 = 기준(2025.04) 전체 + 비교(2025.10) 우측 클립 + 분할선 + 변화 폴리곤
  let over = `<div style="position:absolute;left:${DIV}px;top:0;width:${MW - DIV}px;height:${MH}px;overflow:hidden"><img src="map-ortho-2510.jpg" alt="" style="position:absolute;left:${-DIV}px;top:0;width:${MW}px;height:${MH}px;display:block;filter:saturate(.72) contrast(1.04)"></div>`;
  over += svgLayer(pathsOf(cp, CHS));
  over += div(DIV - 1, 0, 2, MH, `background:#FFFFFF`) + div(DIV - 14, MH / 2 - 14, 28, 28, `background:#FFFFFF;border:1px solid ${INK};display:flex;align-items:center;justify-content:center;gap:0`, ico('chevL', INK, 10) + ico('chevR', INK, 10));
  over += `<div class="hud" style="left:${DIV - 12}px;top:${MH / 2 + 22}px;transform:translateX(-100%)">2025.04 · 1.08 cm</div><div class="hud" style="left:${DIV + 12}px;top:${MH / 2 + 22}px">2025.10 · 1.68 cm</div>`;
  over += scaleBar(LW + 24, MH - 20, 240, 18, clat, [clon, clat], '남원 농경지 드론 정사영상 · imagery.js');
  s += plate('map-ortho-2504.jpg', over, `기준 namwon_2504 z18 실타일 · 비교 namwon_2510 우측 클립 · 변화 2504-2510 ${cp.length}/${CH_F.length} (namwon-change.geojson · 변화 지수(비지도))`);
  // 상단 트리거 2(원본: 기준 · 변경 / 비교 대상 · 변경)
  const tw = 250, TRG = `background:#FFFFFF;border:1px solid ${INK};display:flex;align-items:center;gap:8px;padding:0 10px;font-size:14px;white-space:nowrap`;
  s += div(MX + LW + 24, MY + 16, tw, 32, TRG, `<span class="lab">기준</span><span>2025.04</span><span class="n" style="color:${G};font-size:14px">1.08 cm</span><span style="flex:1"></span><span style="color:${ACC}">변경 ›</span>`);
  s += div(RX - 16 - 36 - 12 - tw, MY + 16, tw, 32, TRG, `<span class="lab">비교 대상</span><span>2025.10</span><span class="n" style="color:${G};font-size:14px">1.68 cm</span><span style="flex:1"></span><span style="color:${ACC}">변경 ›</span>`);
  s += mapTools(RX - 16 - 36, MY + 16);
  s += legend(MX + LW + 24, MY + MH - 20 - 20 - 4 * 26 - 14 - 26, 252, [[SW.tealFill, '식생 증가 veg_gain', fmt(CH.stats.byClass.veg_gain)], [SW.tealDash, '식생 감소 veg_loss', fmt(CH.stats.byClass.veg_loss)], [SW.accFill, '신축 built_new', fmt(CH.stats.byClass.built_new)], [SW.inkDash, '기타 other', fmt(CH.stats.byClass.other)]], '범례 · 변화 지수(비지도) · 건');
  // 좌 패널 = 비교할 분석 선택(원본 모달: 기준 열 · 비교 대상 열 · 필터 · 과제별/목록) → 시점 4 세로 + L/R 표식 + 결과 레이어 선택
  s += div(MX, MY, LW, MH, 'background:#FFFFFF') + vl(MX + LW, MY, MH, INK);
  const LI = MX + 16, LIW = LW - 32;
  s += `<div style="position:absolute;left:${LI}px;top:${MY + 18}px">${ico('chevL', G, 14)}</div>` + `<div class="tab on" style="left:${LI + 24}px;top:${MY + 14}px">비교할 분석 선택<span class="c">2</span></div>` + div(LI + 24, MY + 42, 150, 2, `background:${INK}`) + hl(MX, MY + 52, LW);
  let cx = LI; [['내 것', true], ['공유 받은 것', true], ['과제별', true], ['목록', false]].forEach(([t, on]) => { s += chip(cx, MY + 62, t, on); cx += t.length * 14.2 + 26; });
  s += lab(LI, MY + 104, '정사영상 시점 · 남원 농경지 · 드론 4') ;
  EPOCHS.forEach(([d, gsd, src, id], i) => {
    const y = MY + 128 + i * 82; const mark = d === '2025.04' ? '기준' : d === '2025.10' ? '비교 대상' : ''; const on = !!mark;
    if (on) s += div(MX + 1, y - 6, LW - 2, 78, `background:${T1}`);
    s += img(LI, y, 100, 60, src, on ? brk(100, 60, ACC, 8, 1) : '', `outline:1px solid ${on ? ACC : H}`);
    s += disp(LI + 112, y - 2, `남원 농경지 · ${d}`, 13) + num(LI + 112, y + 20, `드론 · GSD ${gsd} · 0.62 km²`, 11.5, G) + txt(LI + 112, y + 40, id, 11.5, C);
    if (mark) s += `<div class="det" style="left:${LI + LIW - (mark.length * 14 + 12)}px;top:${y + 40}px;background:${ACC}">${mark}</div>`;
    s += hl(LI, y + 70, LIW);
  });
  const ry = MY + 128 + 4 * 82 + 4;
  s += lab(LI, ry, '결과 레이어 · 비교 대상에 겹침');
  [['남원 농경지 변화 지수(비지도) 2025.04 → 10', `${fmt(CH_F.length)} 건`, true, 'ev-change.jpg'], [FARM.title, `${fmt(FARM.stats.count)} 필지`, false, 'tile-farm-clean.jpg'], [GH.title, `${fmt(GH.stats.count)} 필지`, false, 'tile-gh-clean.jpg']].forEach(([nm, n, on, src], i) => {
    const y = ry + 26 + i * 50;
    if (on) s += div(MX + 1, y - 6, LW - 2, 46, `background:${T1}`);
    s += chk(LI, y + 8, on, ACC) + img(LI + 24, y, 60, 36, src, on ? brk(60, 36, ACC, 6, 1) : '', `outline:1px solid ${on ? ACC : H}`) + disp(LI + 96, y - 1, nm, 12.5, INK, `width:${LIW - 96 - 70}px;overflow:hidden;text-overflow:ellipsis`) + `<div class="st" style="position:absolute;left:${LI + 96}px;top:${y + 20}px;color:${on ? ACC : TEAL}">${n}</div>`;
  });
  // 하단 좌/우 분할 표 띠(원본 cmp-bottom-panels)
  s += bottomBand(MX + LW + 1, MY + MH - 40, DIV - LW - 1, '기준 · 2025.04', '', `${fmt(FARM.stats.count)} 필지`);
  s += bottomBand(MX + DIV, MY + MH - 40, RX - MX - DIV - 8, '비교 대상 · 2025.10', '', `${fmt(CH_F.length)} 건`);
  // 우 패널 400 — 비교 결과(원본 KPI 표: 항목 / 기준 / 비교 대상 · 각 통계 자세히 · 보고서 발급)
  s += div(RX, MY, RW, MH, 'background:#FFFFFF') + vl(RX, MY, MH, INK);
  const RI = RX + 24, RIW = RW - 48;
  s += lab(RI, MY + 16, '비교 결과') + `<div style="position:absolute;left:${RX + RW - 30}px;top:${MY + 14}px">${ico('chevR', G, 12)}</div>`;
  s += disp(RI, MY + 34, '2025.04 → 2025.10', 20) + txt(RI, MY + 62, `남원 농경지 · 6개월 · <span style="color:${TEAL}">변화 지수(비지도)</span> · 학습 모델 탐지 아님`, 13, G);
  s += hl(RI, MY + 90, RIW);
  // 큰 수 2 — 변화 건 액센트 · 면적 잉크
  s += `<div style="position:absolute;left:${RI}px;top:${MY + 106}px;display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:48px;line-height:1;letter-spacing:-.02em;color:${ACC}">${fmt(CH_F.length)}</span><span style="font-size:16px;color:${G}">건</span></div>`;
  s += `<div style="position:absolute;left:${RI + 190}px;top:${MY + 106}px;display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:48px;line-height:1;letter-spacing:-.02em">${(CH.stats.area_m2 / 10000).toFixed(1)}</span><span style="font-size:16px;color:${G}">ha</span></div>`;
  s += lab(RI, MY + 164, '변화 폴리곤 · 창 안 ' + fmt(cp.length)) + lab(RI + 190, MY + 164, '변화 면적 합계');
  s += hl(RI, MY + 190, RIW);
  // 표: 항목 / 기준 / 비교 대상(원본 구조)
  const rows = [['정사영상', '2025.04', '2025.10'], ['GSD', '1.08 cm', '1.68 cm'], ['촬영', '드론', '드론'], ['범위', '0.62 km²', '0.62 km²'], ['결과 레이어', `농지 ${fmt(FARM.stats.count)}`, `변화 ${fmt(CH_F.length)}`]];
  s += lab(RI, MY + 204, '항목') + lab(RI + 120, MY + 204, '기준') + lab(RI + 240, MY + 204, '비교 대상');
  rows.forEach(([k, a, b], i) => { const y = MY + 228 + i * 26; s += txt(RI, y, k, 13) + num(RI + 120, y, a, 13) + num(RI + 240, y, b, 13) + hl(RI, y + 23, RIW); });
  // 클래스 막대 4(실측 byClass · 청록/파랑/잉크)
  const BY = MY + 228 + rows.length * 26 + 14;
  s += lab(RI, BY, '클래스별 · 건 · change.js 2504-2510');
  const mx = Math.max(...Object.values(CH.stats.byClass));
  [['veg_gain', '식생 증가', TEAL], ['built_new', '신축', ACC], ['other', '기타', INK], ['veg_loss', '식생 감소', G]].forEach(([k, nm, col], i) => { const y = BY + 24 + i * 26, w = Math.round((RIW - 150) * CH.stats.byClass[k] / mx); s += txt(RI, y - 2, nm, 13) + div(RI + 84, y + 7, RIW - 150, 3, `background:${H}`) + div(RI + 84, y + 7, w, 3, `background:${col}`) + num(RI + RIW, y - 1, fmt(CH.stats.byClass[k]), 12.5, INK, 'transform:translateX(-100%)'); });
  s += hl(RI, BY + 24 + 4 * 26 + 6, RIW);
  const AY = BY + 24 + 4 * 26 + 20;
  s += lab(RI, AY, '기준 · 남원 농경지 2025.04') + ibtn(RI, AY + 20, 128, 'chart', '통계 자세히') + ibtn(RI + 140, AY + 20, 118, 'doc', '보고서 발급');
  s += lab(RI, AY + 66, '비교 대상 · 2025.10') + ibtn(RI, AY + 86, 128, 'chart', '통계 자세히') + cta(RI + 140, AY + 84, 118, '보고서 발급');
  s += FOOT;
  return page('B5 지도 서비스 · 겹쳐보기(2025.04 | 2025.10 + 변화 지수)', s);
}

async function main() {
  console.log('WIN14', WIN14, 'WIN17', WIN17, 'WIN18', WIN18);
  if (PLATES) await plates();
  wr('B5-Map.dc.html', boardMap());
  wr('B5-Map-Info.dc.html', boardInfo());
  wr('B5-Map-Compare.dc.html', boardCompare());
}
main().catch(e => { console.error(e); process.exit(1); });
