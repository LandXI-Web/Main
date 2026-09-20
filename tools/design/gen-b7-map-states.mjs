// B7 지도 서비스 — 감사(2026-09-20 auto-audit) X1m · X2m · X4m · X5m · A13 대응 원판 생성기
//   B7-Map-*    : B5-Map/-Info/-Compare 가 그리지 않은 원본 ximap.html 상태(나란히보기 · 지역 구분/지역 설정 · 펼친 표 · 보안 서약서 · 다운로드 · 레이어 0 · 검색 결과/0 · 로딩 · 측정 · 그리기 · 배경지도 · 레이어 탭)
//   B7-Stats-*  : stats-standard.html — 선택 1 · 2 · 3 + 권장 구조의 클래스별 탭 · 빈 상태 · 분석 결과 찾기
//   B7-Report-* : report-standard-issue.html(발급 요청 · 검증 오류) · report-standard.html(발급 내역 · 검색 결과 0)
// 셸 · 레이어 카드 · 도구 열 · 시점 스트립 · 콜아웃 어휘는 tools/design/gen-b5-map.mjs 의 코드를 그대로 복사했다(아래 "B5 복사" 구간).
// usage: node tools/design/gen-b7-map-states.mjs [--plates]   (repo root · 멱등) — --plates = V-World 타일 스티치(b7-map-*.jpg) + 읍면동 경계 fetch(tools/design/data/b7-namwon-emd.json)
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
// ---------- (B5 plates()/SEL_BOX 는 아래 B7 구간에서 다시 정의) ----------
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
  s += lab(x + 12, y + 10, '정사영상 시점 · 남원 농경지 · 드론 · GSD 1.08–1.69 cm') + txt(EPOCH_W + x - 12 - 96, y + 7, 'LX 정사영상', 12, G) + `<div style="position:absolute;left:${x + EPOCH_W - 12 - 10}px;top:${y + 14}px">${chev()}</div>`;
  EPOCHS.forEach(([d, gsd, src], i) => {
    const xx = x + 12 + i * (TW + GAP), yy = y + 30, on = sel.includes(d);
    s += img(xx, yy, TW, TH, src, on ? brk(TW, TH, ACC, 10, 1.25) : '', `outline:1px solid ${on ? ACC : H}`);
    if (marks[d]) s += `<div class="det" style="left:${xx + 6}px;top:${yy + 6}px;background:${ACC}">${marks[d]}</div>`;
    s += num(xx, yy + TH + 6, d, 12.5, on ? ACC : INK) + (on ? txt(xx + 70, yy + TH + 7, '표시 중', 11, ACC) : '');
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
function layerPanel(x, y, h, tab = 'result', layers = LAYERS, o = {}) {
  const LI = x + 16, LIW = LW - 32;
  let s = div(x, y, LW, h, 'background:#FFFFFF') + vl(x + LW, y, h, INK);
  // 헤더: 접기 ‹ · 탭 2 · 보기 설정 ▾ (원본 그대로)
  s += `<div style="position:absolute;left:${LI}px;top:${y + 18}px">${ico('chevL', G, 14)}</div>`;
  s += `<div class="tab${tab === 'result' ? ' on' : ''}" style="left:${LI + 24}px;top:${y + 14}px">AI 분석 결과<span class="c">5</span></div>`;
  s += `<div class="tab${tab === 'layer' ? ' on' : ''}" style="left:${LI + 152}px;top:${y + 14}px">레이어<span class="c">12</span></div>`;
  s += div(tab === 'result' ? LI + 24 : LI + 152, y + 42, tab === 'result' ? 108 : 64, 2, `background:${INK}`);
  s += `<div style="position:absolute;left:${LI + LIW - 86}px;top:${y + 16}px;display:flex;align-items:center;gap:6px;font-size:14px;color:${G}">${ico('gear', G, 14)}보기 설정${chev()}</div>`;
  s += hl(x, y + 52, LW);
  // 보기 설정 내용(원본 팝오버: 내/공유 · 모두 열기/접기 · 과제별/목록) = 한 줄 칩
  let cx = LI; const yy = y + 62;
  [['내 것', true], ['공유 받은 것', true], ['모두 열기', false], ['목록 보기', false]].forEach(([t, on]) => { s += chip(cx, yy, t, on); cx += t.length * 13.6 + 22; });
  let cy = y + 100;
  if (tab === 'layer') return s + layerTree(LI, cy, LIW);
  for (const g of layers) {
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
      s += txt(tx + 100, cy + 18, it.meta, 11.5, G) + `<div class="st" style="position:absolute;left:${tx + 100}px;top:${cy + 38}px;color:${it.on ? ACC : TEAL}">${it.on && o.loading ? o.loading : it.n}</div>`;
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
  READY0.slice(0, o.ready || 2).forEach(nm => { s += `<div style="position:absolute;left:${LI}px;top:${cy}px">${ico('chevR', C, 12)}</div>` + txt(LI + 18, cy - 4, nm, 13, G) + num(LI + LIW, cy - 2, '0', 12.5, C, 'transform:translateX(-100%)'); cy += 22; });
  s += txt(LI + 18, cy - 4, `그 외 ${READY0.length - (o.ready || 2)} · 준비 중`, 12.5, C);
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
// ====== 여기부터 B7 (위는 gen-b5-map.mjs 복사) ======
// ======================================================================
const tw = (t, px = 14) => [...String(t).replace(/<[^>]+>/g, '')].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? .95 : c === ' ' ? .28 : .58), 0) * px;
const T = (x, y, t, px = 14, col = INK, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;font-size:${Math.max(14, px)}px;letter-spacing:-.01em;color:${col};white-space:nowrap;line-height:1.3;${extra}">${t}</div>\n`;
const N = (x, y, t, px = 14, col = INK, extra = '') => `<div class="n" style="position:absolute;left:${x}px;top:${y}px;font-size:${Math.max(14, px)}px;letter-spacing:.01em;color:${col};white-space:nowrap;line-height:1.3;${extra}">${t}</div>\n`;
const NR = (xr, y, t, px = 14, col = INK) => N(xr, y, t, px, col, 'transform:translateX(-100%)');
const TR = (xr, y, t, px = 14, col = INK, extra = '') => T(xr, y, t, px, col, 'transform:translateX(-100%);' + extra);
const D = (x, y, t, px, col = INK, extra = '') => `<div class="d" style="position:absolute;left:${x}px;top:${y}px;font-size:${px}px;line-height:1.1;color:${col};white-space:nowrap;${extra}">${t}</div>\n`;
const SIYEON = '<span class="tag">시연</span>';
// 2차 버튼 = 코너 브래킷(법전 §2) · 1차 = 잉크 채움(cta)
const bbtn = (x, y, w, t, h = 36, col = INK) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;gap:7px;font-size:15px;font-weight:500;letter-spacing:-.01em;color:${col};white-space:nowrap;background:#FFFFFF">${brk(w, h, col, 8, 1)}${t}</div>\n`;
// 위성 위 글자 = 어두운 띠(X3m: 헤일로만으로는 밝은 논 위에서 안 읽힌다)
const hudBar = (x, y, t, right = false) => `<div class="n" style="position:absolute;${right ? 'right' : 'left'}:${x}px;top:${y}px;height:26px;line-height:26px;padding:0 10px;background:rgba(1,1,2,.66);color:#FFFFFF;font-size:14px;letter-spacing:.03em;white-space:nowrap">${t}</div>\n`;
const searchField2 = (x, y, w, q = '') => fld(x, y, w, `${ico('search', q ? INK : G, 14)}<span style="color:${q ? INK : C}">${q || '명칭 또는 지도 검색'}</span><span style="flex:1"></span>${q ? ico('close', G, 12) : ''}`, q ? `border-color:${INK}` : '');
// 사람이 읽는 라벨(X5m: 내부 키 금지)
const CLS_KO = { veg_gain: '식생 증가', veg_loss: '식생 감소', built_new: '신축', other: '기타' };
// 선택/표식 칩 = 글자와 테두리만 파랑(X4m: 채운 파랑 칩 금지)
const mark = (x, y, t, col = ACC) => `<div style="position:absolute;left:${x}px;top:${y}px;height:22px;line-height:20px;padding:0 7px;border:1px solid ${col};color:${col};background:#FFFFFF;font-size:14px;white-space:nowrap">${t}</div>\n`;
const markR = (xr, y, t, col = ACC) => mark(Math.round(xr - tw(t) - 16), y, t, col);
const scaleBar2 = (x, y, z, lat, note) => { const m = mPerPx(lat, z); let len = 50; for (const l of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) if (l / m <= 200) len = l; const px = Math.round(len / m); return `<div style="position:absolute;left:${x}px;top:${y}px;height:26px;padding:0 10px;background:rgba(1,1,2,.66);display:flex;align-items:center;gap:10px"><div style="width:${px}px;height:6px;border:1px solid #FFFFFF;border-top:0"></div><span class="n" style="font-size:14px;color:#FFFFFF;letter-spacing:.03em;white-space:nowrap">${len >= 1000 ? len / 1000 + ' km' : len + ' m'}${note ? ' · ' + note : ''}</span></div>\n`; };
const radio = (x, y, on) => `<div style="position:absolute;left:${x}px;top:${y}px;width:14px;height:14px;border:1px solid ${on ? ACC : C};background:#FFFFFF"></div>` + (on ? div(x + 4, y + 4, 6, 6, `background:${ACC}`) : '');
const sel = (x, y, w, label, value, dis = false) => (label ? lab(x, y, label) : '') + fld(x, y + (label ? 20 : 0), w, `<span style="color:${dis ? C : INK};overflow:hidden;text-overflow:ellipsis">${value}</span><span style="flex:1"></span>${chev(dis ? C : G)}`, dis ? 'background:#FAFAFA' : '');
const input = (x, y, w, label, value, ph = false, err = false) => (label ? lab(x, y, label) : '') + fld(x, y + (label ? 20 : 0), w, `<span style="color:${ph ? C : INK};overflow:hidden;text-overflow:ellipsis">${value}</span>`, 'height:36px' + (err ? `;border-color:${INK}` : ''));
const req = `<span style="color:${WARN}"> *</span>`;
const errMsg = (x, y, t) => T(x, y, t, 14, WARN);
function pager(x, y, w, total, a, b, size = 10, unit = '건', word = '총', pages = 5, count = true) {
  let s = '', cx = x;
  ['처음', '이전'].forEach(t => { s += T(cx, y, t, 14, C); cx += tw(t) + 14; });
  Array.from({ length: pages }, (_, i) => i + 1).forEach(p => { const on = p === 1; s += `<div class="n" style="position:absolute;left:${cx}px;top:${y - 3}px;width:24px;height:24px;line-height:22px;text-align:center;font-size:14px;border:1px solid ${on ? ACC : 'transparent'};color:${on ? ACC : G}">${p}</div>`; cx += 28; });
  cx += 6; ['다음', '마지막'].forEach(t => { s += T(cx, y, t, 14, pages > 1 ? INK : C); cx += tw(t) + 14; });
  s += fld(cx + 4, y - 6, 64, `<span class="n">${size}</span><span style="flex:1"></span>${chev()}`, 'height:30px') + T(cx + 76, y, '페이지 크기', 14, G);
  if (count) s += `<div style="position:absolute;right:${1440 - (x + w)}px;top:${y}px;font-size:14px;color:${G};white-space:nowrap">${word} <span class="n" style="color:${INK}">${fmt(total)}</span>${unit} 중 <span class="n">${a}~${b}</span>행</div>`;
  return s;
}
const scrim = div(72, 0, 1368, 900, 'background:rgba(1,1,2,.38)');
const modalBox = (x, y, w, h) => div(x, y, w, h, `background:#FFFFFF;border:1px solid ${INK}`);
// 툴 서브메뉴(원본 bm-item) — 도구 열 왼쪽에 붙는 흰 판
function toolMenu(xr, y, title, items, active) {
  const w = 176, h = 34 + items.length * 34 + 6; let s = div(xr - w, y, w, h, `background:#FFFFFF;border:1px solid ${INK}`) + lab(xr - w + 12, y + 10, title);
  items.forEach(([k, t, note], i) => { const yy = y + 34 + i * 34, on = t === active; if (on) s += div(xr - w + 1, yy, w - 2, 34, `background:${T1}`); s += `<div style="position:absolute;left:${xr - w + 12}px;top:${yy + 9}px;width:16px;height:16px">${ICONS[k] ? ico(k, on ? ACC : INK, 15) : k}</div>` + T(xr - w + 40, yy + 7, t, 15, on ? ACC : INK, on ? 'font-weight:500' : '') + (note ? TR(xr - 12, yy + 8, note, 14, G) : ''); });
  return s;
}
const toast = (xr, y, title, lines = []) => { const w = 388, h = 46 + lines.length * 22 + (lines.length ? 8 : 0); return div(xr - w, y, w, h, `background:#FFFFFF;border:1px solid ${INK}`) + div(xr - w, y, 3, h, `background:${INK}`) + T(xr - w + 18, y + 12, title, 16, INK, 'font-weight:500') + `<div style="position:absolute;left:${xr - 30}px;top:${y + 15}px">${ico('close', G, 12)}</div>` + lines.map((l, i) => T(xr - w + 18, y + 40 + i * 22, l, 14, G)).join(''); };

// ---------- 실데이터: 읍면동 집계(geojson properties.emd · cls · area) ----------
function emdStats(feats, classes) {
  const m = {}; for (const f of feats) { const p = f.properties; const e = m[p.emd] ??= { nm: p.emd, n: 0, area: 0, c: Object.fromEntries(classes.map(c => [c, { n: 0, area: 0 }])) }; e.n++; e.area += p.area; e.c[p.cls].n++; e.c[p.cls].area += p.area; }
  return Object.values(m).sort((a, b) => b.area - a.area);
}
const FARM_CLS = ['경작지', '비경작지'];
const FARM_EMD = emdStats(FARM_F, FARM_CLS);
const FARM_TOT = { area: FARM_EMD.reduce((a, e) => a + e.area, 0), c: FARM_CLS.map(c => FARM_EMD.reduce((a, e) => a + e.c[c].area, 0)) };
const ha = m2 => (m2 / 10000).toFixed(1);
// 읍면동 경계(V-World Data API LT_C_ADEMD_INFO · 원본 지역 설정 캐스케이드와 같은 출처) — --plates 때 받아 단순화해 둔다
const EMD_PATH = path.join(root, 'tools/design/data/b7-namwon-emd.json');
const EMD = fs.existsSync(EMD_PATH) ? JSON.parse(fs.readFileSync(EMD_PATH, 'utf8')) : [];
const NW_C = [127.42899, 35.43164];
const WIN11 = (() => { const [x, y] = merc(NW_C[0], NW_C[1], 11); return { z: 11, W: 1792, H: 1024, x0: Math.round(x - 896), y0: Math.round(y - 512) }; })();
const WIN15 = (() => { const [x, y] = merc(127.3868, 35.4135, 15); return { z: 15, W: 1368, H: 745, x0: Math.round(x - 820), y0: Math.round(y - 372) }; })();   // 남원 시내(원본 검색 MOCK 좌표대)
// 전역 판(z11 스티치)을 (cx,cy) 중심 · zEff 로 놓는다 → 같은 투영으로 경계/도형을 그린다
function regionView(cx, cy, zEff) {
  const k = 2 ** (zEff - 11), mx0 = WIN11.x0 + WIN11.W / 2, my0 = WIN11.y0 + WIN11.H / 2;
  const proj = (lo, la) => { const [x, y] = merc(lo, la, 11); return [cx + (x - mx0) * k, cy + (y - my0) * k]; };
  const imgHtml = `<img src="b7-map-vw-namwon.jpg" alt="" style="position:absolute;left:${Math.round(cx - WIN11.W / 2 * k)}px;top:${Math.round(cy - WIN11.H / 2 * k)}px;width:${Math.round(WIN11.W * k)}px;height:${Math.round(WIN11.H * k)}px;display:block;filter:saturate(.6) contrast(1.02) brightness(.86)">`;
  const pathOf = e => e.rings.map(r => r.map(([lo, la], i) => { const [x, y] = proj(lo, la); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join('') + 'Z').join('');
  const center = e => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of e.rings[0]) { const [x, y] = proj(p[0], p[1]); a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [(a + c) / 2, (b + d) / 2]; };
  const box = e => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const r of e.rings) for (const p of r) { const [x, y] = proj(p[0], p[1]); a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d].map(Math.round); };
  return { proj, imgHtml, pathOf, center, box, zEff };
}
// 단계 채움(읍면동별 값 → 청록 5단) — 표의 값을 지도에 다시 그린 것(새 기능 아님)
const STEPS = [.08, .24, .42, .62, .82];
function choropleth(view, stats, valOf, o = {}) {
  const sorted = [...stats].sort((a, b) => valOf(a) - valOf(b)); const rank = Object.fromEntries(sorted.map((e, i) => [e.nm, i / sorted.length])); const by = Object.fromEntries(stats.map(e => [e.nm, valOf(e)]));
  let g = '';
  for (const e of EMD) {
    const v = by[e.nm]; const st = v == null ? -1 : Math.min(4, Math.floor(rank[e.nm] * 5)); const dim = o.only && !o.only.includes(e.nm);
    g += `<path d="${view.pathOf(e)}" fill="${v == null || dim ? 'rgba(255,255,255,.03)' : `rgba(15,169,160,${STEPS[st]})`}" stroke="#FFFFFF" stroke-opacity="${dim ? .4 : .85}" stroke-width=".75" stroke-linejoin="miter"${v == null ? ' stroke-dasharray="2 2"' : ''}/>`;
  }
  return g;
}
const emdLabel = (view, nm, col = '#FFFFFF', dy = 0) => { const e = EMD.find(x => x.nm === nm); if (!e) return ''; const [x, y] = view.center(e); return `<div class="hud" style="left:${Math.round(x)}px;top:${Math.round(y - 9 + dy)}px;transform:translateX(-50%);letter-spacing:0;font-family:'Pretendard',sans-serif;color:${col}">${nm}</div>`; };
function stepLegend(x, y, title, mx, unit) {
  let s = div(x, y, 256, 76, `background:#FFFFFF;border:1px solid ${H}`) + lab(x + 12, y + 10, title);
  STEPS.forEach((o, i) => { s += div(x + 12 + i * 46, y + 32, 46, 10, `background:rgba(15,169,160,${o + .1});border:1px solid ${TEAL};border-left-width:${i ? 0 : 1}px`); });
  s += T(x + 12, y + 48, '적음 · 5분위', 14, G) + NR(x + 242, y + 48, `최대 ${fmt(mx)} ${unit}`, 14, G);
  return s;
}
const plateRaw = (inner, title) => `<div title="${title}" style="position:absolute;left:${MX}px;top:${MY}px;width:${MW}px;height:${MH}px;overflow:hidden;background:#1B2420">${inner}</div>\n`;
// 선택 읍면동 강조(액센트 외곽 + 브래킷)
function emdSelect(view, nm) { const e = EMD.find(x => x.nm === nm); if (!e) return { svg: '', html: '', box: [0, 0, 0, 0] }; const b = view.box(e); return { svg: `<path d="${view.pathOf(e)}" fill="rgba(0,109,247,.18)" stroke="${ACC}" stroke-width="2" stroke-linejoin="miter"/>`, html: brk(b[2] - b[0] + 12, b[3] - b[1] + 12, '#FFFFFF', 12, 1.5, b[0] - 6, b[1] - 6), box: b }; }

// ---------- 타일 스티치 · 읍면동 경계 (--plates) ----------
const vwLayer = (layer, ext) => async (z, x, y) => { const r = await fetch(`https://api.vworld.kr/req/wmts/1.0.0/${VW_KEY}/${layer}/${z}/${y}/${x}.${ext}`, { headers: { Referer: 'https://mini531.github.io/' } }); if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,` + b.toString('base64'); };
function dp(pts, eps) { if (pts.length < 3) return pts; let mx = 0, idx = 0; const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1]; const L = Math.hypot(bx - ax, by - ay) || 1e-12; for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > mx) { mx = d; idx = i; } } if (mx <= eps) return [pts[0], pts[pts.length - 1]]; return [...dp(pts.slice(0, idx + 1), eps).slice(0, -1), ...dp(pts.slice(idx), eps)]; }
async function platesB7() {
  // 읍면동 경계
  const u = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_ADEMD_INFO&key=${VW_KEY}&attrFilter=emd_cd:like:52190&domain=mini531.github.io&size=100&geometry=true&format=json&crs=EPSG:4326`;
  const j = await (await fetch(u, { headers: { Referer: 'https://mini531.github.io/' } })).json();
  const out = j.response.result.featureCollection.features.map(f => ({ nm: f.properties.emd_kor_nm, cd: f.properties.emd_cd, rings: (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map(p => p[0]) : [f.geometry.coordinates[0]]).map(r => { const h = Math.floor(r.length / 2); return [...dp(r.slice(0, h + 1), .0005).slice(0, -1), ...dp(r.slice(h), .0005)].map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]); }).filter(r => r.length > 3) }));
  fs.mkdirSync(path.dirname(EMD_PATH), { recursive: true }); fs.writeFileSync(EMD_PATH, JSON.stringify(out)); console.log('emd', out.length, fs.statSync(EMD_PATH).size);
  const browser = await chromium.launch({ channel: 'chrome' }); const pg = await browser.newPage(); await pg.setContent('<canvas id=c></canvas>');
  await stitch(pg, WIN11, vwTile, 'b7-map-vw-namwon.jpg', 0.8);
  await stitch(pg, WIN15, vwTile, 'b7-map-vw-city.jpg', 0.8);
  await stitch(pg, WIN14, vwLayer('Base', 'png'), 'b7-map-base-z14.jpg', 0.8);
  // 배경지도 서브메뉴 견본 5(같은 중심 · z14 · 112×64)
  const [cx, cy] = merc(127.3868, 35.4135, 13).map(Math.round); const sw = { z: 13, W: 156, H: 88, x0: cx - 78, y0: cy - 44 };
  for (const [ly, ext, nm] of [['Base', 'png', 'base'], ['gray', 'png', 'gray'], ['midnight', 'png', 'night'], ['Satellite', 'jpeg', 'sat']]) await stitch(pg, sw, vwLayer(ly, ext), `b7-map-bm-${nm}.jpg`, 0.8);
  await browser.close();
  for (const [src, dst] of [['namwon-farmland-2025/1@2x.jpg', 'b7-map-crop-cult.jpg'], ['namwon-farmland-2025/2.jpg', 'b7-map-crop-uncult.jpg']]) fs.copyFileSync(path.join(root, 'landxi/assets/proto/crops', src), path.join(imgDir, dst));
}

// ======================================================================
// B7-Map-* — 공통 바닥: z14 기본 화면(B5-Map 과 같은 조판) + 상태별 덧판
// ======================================================================
const TOOLX = 1440 - 16 - 36, TOOLY = MY + 16;
const LAYERS_OFF = LAYERS.map(g => ({ ...g, items: g.items.map(i => ({ ...i, on: false })) }));
function base14(o = {}) {
  const { sub, panel = 'result', layers = LAYERS, tool = '', src = 'map-vw-z14.jpg', polys = true, legendOn = true, epochOn = true, ctaOn = true, q = '', hud = true, filter, polyFilter = () => true, loading } = o;
  const fp = polysIn(FARM_F, WIN14).filter(polyFilter), gp = polysIn(GH_F, WIN14).filter(polyFilter);
  const cult = fp.filter(p => p.f.properties.cls === '경작지').length, unc = fp.length - cult;
  const [clon, clat] = winCenter(WIN14);
  const PX = panel === 'collapsed' ? 36 : LW, LX0 = MX + PX + 24;
  let s = head(sub, '기본');
  s += plate(src, polys ? svgLayer(pathsOf(fp, FARM_STYLE) + `<g opacity=".7">${pathsOf(gp, GH_STYLE)}</g>`) + (o.over || '') : (o.over || ''), 'V-World z14 실타일 · 분석 결과 실좌표 투영', filter);
  s += panel === 'collapsed' ? collapsedLeft(MX, MY, MH) : layerPanel(MX, MY, MH, panel, layers, { loading, ready: o.ready });
  s += searchField2(LX0, MY + 16, 372, q);
  if (hud && polys) s += hudBar(LX0, MY + 58, typeof hud === 'string' ? hud : `창 안 · 경작지 ${fmt(cult)} · 비경작지 ${fmt(unc)} · 비닐하우스 ${fmt(gp.length)} 필지 / 전체 ${fmt(FARM.stats.count)} · ${fmt(GH.stats.count)}`);
  s += mapTools(TOOLX, TOOLY, tool);
  if (ctaOn) s += cta(TOOLX - 12 - 92, TOOLY - 2, 92, '내보내기');
  if (legendOn && polys) s += legend(TOOLX - 12 - 252, MY + MH - 20 - 20 - 4 * 26 - 14 - 26, 252, [[SW.tealFill, '경작지', fmt(FARM.stats.classes['경작지'])], [SW.tealDash, '비경작지', fmt(FARM.stats.classes['비경작지'])], [SW.accFill, '비닐하우스 · 단동', fmt(GH.stats.classes['비닐하우스_단동'])], [SW.accLine, '비닐하우스 · 다동', fmt(GH.stats.classes['비닐하우스_다동'])]], '범례 · 필지 수 · 클릭 = 숨김');
  if (epochOn) s += epochStrip(LX0, MY + MH - 20 - (66 + 56), ['2025.06']);
  if (epochOn) s += scaleBar2(LX0 + EPOCH_W + 16, MY + MH - 20 - 26, 14, clat, `${clon.toFixed(4)} E · ${clat.toFixed(4)} N`);
  return { s, LX0, fp, gp, clat, clon };
}

// ---------- 1. 나란히보기(원본 모드 3 · #map-right 독립 지도 2) ----------
function comparePanel(title = '비교할 분석 선택') {
  let s = div(MX, MY, LW, MH, 'background:#FFFFFF') + vl(MX + LW, MY, MH, INK);
  const LI = MX + 16, LIW = LW - 32;
  s += `<div style="position:absolute;left:${LI}px;top:${MY + 18}px">${ico('chevL', G, 14)}</div>` + `<div class="tab on" style="left:${LI + 24}px;top:${MY + 14}px">${title}<span class="c">2</span></div>` + div(LI + 24, MY + 42, 150, 2, `background:${INK}`) + hl(MX, MY + 52, LW);
  let cx = LI; [['내 것', true], ['공유 받은 것', true], ['과제별', true], ['목록', false]].forEach(([t, on]) => { s += chip(cx, MY + 62, t, on); cx += t.length * 14.2 + 26; });
  s += lab(LI, MY + 104, '정사영상 시점 · 남원 농경지 · 드론 4');
  EPOCHS.forEach(([d, gsd, src], i) => {
    const y = MY + 128 + i * 82; const mk = d === '2025.04' ? '기준' : d === '2025.10' ? '비교 대상' : ''; const on = !!mk;
    if (on) s += div(MX + 1, y - 6, LW - 2, 78, `background:${T1}`);
    s += img(LI, y, 100, 60, src, on ? brk(100, 60, ACC, 8, 1) : '', `outline:1px solid ${on ? ACC : H}`);
    s += disp(LI + 112, y - 2, `남원 농경지 · ${d}`, 13) + num(LI + 112, y + 20, `드론 · GSD ${gsd} · 0.62 km²`, 11.5, G) + T(LI + 112, y + 40, 'LX 정사영상', 14, C);
    if (mk) s += markR(LI + LIW, y + 38, mk);
    s += hl(LI, y + 70, LIW);
  });
  const ry = MY + 128 + 4 * 82 + 4;
  s += lab(LI, ry, '결과 레이어 · 비교 대상에 겹침');
  [['남원 농경지 변화 지수(비지도)', `${fmt(CH_F.length)} 건`, true, 'ev-change.jpg'], [FARM.title, `${fmt(FARM.stats.count)} 필지`, false, 'tile-farm-clean.jpg'], [GH.title, `${fmt(GH.stats.count)} 필지`, false, 'tile-gh-clean.jpg']].forEach(([nm, n, on, src], i) => {
    const y = ry + 26 + i * 50;
    if (on) s += div(MX + 1, y - 6, LW - 2, 46, `background:${T1}`);
    s += chk(LI, y + 8, on, ACC) + img(LI + 24, y, 60, 36, src, on ? brk(60, 36, ACC, 6, 1) : '', `outline:1px solid ${on ? ACC : H}`) + disp(LI + 96, y - 1, nm, 12.5, INK, `width:${LIW - 96}px;overflow:hidden;text-overflow:ellipsis`) + `<div class="st" style="position:absolute;left:${LI + 96}px;top:${y + 20}px;color:${on ? ACC : TEAL}">${n}</div>`;
  });
  return s;
}
const CHS = f => f.properties.cls === 'veg_gain' ? `fill="rgba(15,169,160,.30)" stroke="${TEAL}" stroke-width="1"` : f.properties.cls === 'veg_loss' ? `fill="rgba(15,169,160,.06)" stroke="${TEAL}" stroke-width="1" stroke-dasharray="3 2"` : f.properties.cls === 'built_new' ? `fill="rgba(0,109,247,.30)" stroke="${ACC}" stroke-width="1.25"` : `fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="2 2"`;
function boardParallel() {
  const cp = polysIn(CH_F, WIN18, 1); const [clon, clat] = winCenter(WIN18);
  const VX = MX + LW + 1, VL = 497, VR = 1440 - VX - VL - 2, OFF = 430;
  let s = head('남원 농경지 · 나란히보기 · 2025.04 ∥ 2025.10 · 지도 2 독립', '나란히보기');
  // 선택 변화 객체 = 우 지도 안에서 가장 큰 도형(실 feature) → 우: 브래킷 + 콜아웃(원본 #map-popup-r) / 좌: 같은 자리 점선
  const inV = cp.filter(p => p.box[0] > OFF + 40 && p.box[2] < OFF + VR - 70 && p.box[1] > 230 && p.box[3] < 560).sort((a, b) => b.f.properties.area_m2 - a.f.properties.area_m2);
  const selp = inV.find(p => p.f.properties.cls === 'built_new') || inV[0]; const P = selp.f.properties; const [bx0, by0, bx1, by1] = selp.box.map(Math.round);
  const view = (x, w, src, inner) => `<div style="position:absolute;left:${x}px;top:${MY}px;width:${w}px;height:${MH}px;overflow:hidden;background:#222"><img src="${src}" alt="" style="position:absolute;left:${-OFF}px;top:0;width:${MW}px;height:${MH}px;display:block;filter:saturate(.72) contrast(1.04)"><div style="position:absolute;left:${-OFF}px;top:0;width:${MW}px;height:${MH}px">${inner}</div></div>\n`;
  s += view(VX, VL, 'map-ortho-2504.jpg', svgLayer(`<path d="${selp.d}" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="4 3"/>`) + brk(bx1 - bx0 + 16, by1 - by0 + 16, '#FFFFFF', 12, 1.25, bx0 - 8, by0 - 8));
  s += view(VX + VL + 2, VR, 'map-ortho-2510.jpg', svgLayer(pathsOf(cp, CHS) + `<path d="${selp.d}" fill="rgba(0,109,247,.2)" stroke="${ACC}" stroke-width="2"/>`) + brk(bx1 - bx0 + 16, by1 - by0 + 16, ACC, 12, 1.5, bx0 - 8, by0 - 8));
  s += div(VX + VL, MY, 2, MH, 'background:#FFFFFF');
  // 좌 지도: 트리거 · 도구 열 1벌(원본: 우 툴바가 좌 지도에도 1벌 더)
  const TRG = `background:#FFFFFF;border:1px solid ${INK};display:flex;align-items:center;gap:8px;padding:0 10px;font-size:14px;white-space:nowrap`;
  const trg = (x, k, d, g) => div(x, MY + 16, 250, 32, TRG, `<span class="lab">${k}</span><span class="n">${d}</span><span class="n" style="color:${G};font-size:14px">${g}</span><span style="flex:1"></span><span style="color:${ACC}">변경 ›</span>`);
  const RX0 = VX + VL + 2;
  s += trg(VX + 16, '기준', '2025.04', '1.08 cm') + mapTools(VX + VL - 16 - 36, TOOLY);
  s += hudBar(VX + 16, MY + 58, '원본 영상 · 결과 레이어 없음');
  s += hudBar(VX + bx0 - OFF - 8, MY + by1 + 14, '같은 자리 · 2025.04');
  s += trg(RX0 + 16, '비교 대상', '2025.10', '1.68 cm') + mapTools(TOOLX, TOOLY);
  s += hudBar(RX0 + 16, MY + 58, `변화 ${fmt(CH_F.length)} 건 · ${ha(CH.stats.area_m2)} ha · 변화 지수(비지도)`);
  s += div(TOOLX - 12 - 118, TOOLY, 118, 32, `background:#FFFFFF;border:1px solid ${H};display:flex;align-items:center;gap:6px;padding:0 10px;font-size:14px;color:${G}`, `${ico('chevL', G, 12)}비교 결과`);
  // 콜아웃(우 지도) — 원본 팝업 4행을 사람이 읽는 말로
  const CBW = 300, CBH = 84, CX = Math.min(RX0 + bx1 - OFF + 40, TOOLX - 16 - CBW), CY = MY + Math.max(by0 - 110, 100);
  s += `<svg width="1440" height="900" style="position:absolute;left:0;top:0;pointer-events:none"><path d="M${RX0 + bx1 - OFF + 8} ${MY + by0 - 8}L${CX} ${CY + CBH}" stroke="${ACC}" stroke-width="1.25"/></svg>`;
  s += div(CX, CY, CBW, CBH, `background:#FFFFFF;border:1px solid ${INK}`) + mark(CX + 12, CY + 11, CLS_KO[P.cls]) + TR(CX + CBW - 12, CY + 12, '변화 지수(비지도)', 14, TEAL) + N(CX + 12, CY + 40, `면적 ${fmt(P.area_m2)} ㎡`, 14);
  s += T(CX + 12, CY + 58, '2025.04 → 2025.10 · 남원 농경지', 14, G);
  // 범례(우) · 스케일(좌/우 각자 — 두 지도는 독립 view)
  s += legend(RX0 + 16, MY + MH - 40 - 16 - (20 + 4 * 26 + 14), 232, [[SW.tealFill, '식생 증가', fmt(CH.stats.byClass.veg_gain)], [SW.tealDash, '식생 감소', fmt(CH.stats.byClass.veg_loss)], [SW.accFill, '신축', fmt(CH.stats.byClass.built_new)], [SW.inkDash, '기타', fmt(CH.stats.byClass.other)]], '범례 · 변화 지수(비지도) · 건');
  s += scaleBar2(VX + 16, MY + MH - 40 - 16 - 26, 18, clat, '좌 지도');
  s += scaleBar2(RX0 + 16 + 232 + 12, MY + MH - 40 - 16 - 26, 18, clat, '우 지도');
  s += comparePanel() + hl(MX, MY + MH - 58, LW) + T(MX + 16, MY + MH - 40, '다시 누르면 해제', 14, G) + bbtn(MX + LW - 16 - 92 - 20 - 76, MY + MH - 48, 76, '취소') + cta(MX + LW - 16 - 92, MY + MH - 48, 92, '적용');
  s += bottomBand(VX, MY + MH - 40, VL, '기준 · 2025.04', '', `${fmt(FARM.stats.count)} 필지`) + bottomBand(RX0, MY + MH - 40, VR, '비교 대상 · 2025.10', '', `${fmt(CH_F.length)} 건`);
  s += FOOT;
  return page('B7 지도 서비스 · 나란히보기(독립 지도 2)', s);
}

// ---------- 하단 표 패널(원본 bottom-panel: 탭 3 · 정보 2 · 검색 6필드 · 지역 설정 3 · 접기 · 페이지) ----------
function tablePanel(x, y, w, h, o) {
  const PI = x + 24, PW = w - 48;
  let s = div(x, y, w, h, `background:#FFFFFF;border-top:1px solid ${INK}`);
  // 행 1: 브레드크럼 + 도구
  let cx = PI; o.crumbs.forEach((c, i) => { const last = i === o.crumbs.length - 1; s += T(cx, y + 13, c, 15, last ? INK : G, last ? 'font-weight:500' : ''); cx += tw(c, 15) + 8; if (!last) { s += T(cx, y + 13, '›', 15, C); cx += 16; } });
  s += `<div style="position:absolute;right:${1440 - (PI + PW)}px;top:${y + 8}px;display:flex;gap:18px;align-items:center;font-size:14px;color:${G};height:28px"><span style="display:flex;gap:6px;align-items:center;color:${o.search ? ACC : G}">${ico('search', o.search ? ACC : G, 14)}검색</span>${o.tab === '지역 구분' ? `<span style="display:flex;gap:6px;align-items:center;color:${ACC}">${ico('globe', ACC, 14)}지역 설정</span>` : ''}<span style="display:flex;gap:6px;align-items:center">분석 정보 접기${ico('chevD', G, 12)}</span></div>`;
  s += hl(x, y + 44, w);
  // 행 2: 탭 3 + 정보 탭 2
  cx = PI; ['공간 정보', '지역 구분', '분석 결과'].forEach(t => { const on = t === o.tab; s += T(cx, y + 54, t, 16, on ? INK : G, on ? 'font-weight:500' : ''); if (on) s += div(cx, y + 82, tw(t, 16), 2, `background:${INK}`); cx += tw(t, 16) + 28; });
  if (o.info) { cx += 8; s += vl(cx - 12, y + 56, 20); o.infoTabs.forEach(t => { s += chip(cx, y + 53, t, t === o.info); cx += tw(t) + 28; }); }
  if (o.note) s += TR(PI + PW, y + 56, o.note, 14, G);
  s += hl(x, y + 84, w);
  let ty = y + 85;
  if (o.fields) { s += div(x, ty, w, 66, `background:#FAFAFA`) + o.fields(PI, ty + 8, PW) + hl(x, ty + 66, w); ty += 67; }
  // 표
  const tot = o.cols.reduce((a, c) => a + c[1], 0); let xs = []; let acc = PI; o.cols.forEach(c => { xs.push(acc); acc += c[1] / tot * PW; });
  s += div(x, ty, w, 32, `background:${T1}`);
  o.cols.forEach((c, i) => { const r = c[2] === 'r'; s += r ? TR(xs[i] + c[1] / tot * PW - 28, ty + 7, c[0], 14, G) : T(xs[i], ty + 7, c[0], 14, G); });
  ty += 32;
  o.rows.forEach((r, ri) => {
    const on = ri === o.sel; if (on) s += div(x, ty, w, 30, `background:${T1}`) + div(x, ty, 3, 30, `background:${ACC}`);
    r.forEach((v, i) => { const c = o.cols[i], rr = c[2] === 'r', isN = c[3] === 'n'; const col = on && i === o.accentCol ? ACC : INK; if (typeof v === 'function') { s += v(xs[i], ty, c[1] / tot * PW); return; } s += rr ? (isN ? NR : TR)(xs[i] + c[1] / tot * PW - 28, ty + 6, v, 14, col) : (isN ? N : T)(xs[i], ty + 6, v, 14, col); });
    s += hl(PI, ty + 30, PW); ty += 30;
  });
  s += pager(PI, y + h - 30, PW, o.total, o.range[0], o.range[1], 10, o.unit || '건', '총', o.pages || 5);
  return s;
}

// ---------- 2. 지역 구분 · 지역 설정(시도 › 시군구 › 읍면동 캐스케이드 → 표 드릴다운 + 지도 이동) ----------
function boardRegion() {
  const PH = 352, VH = MH - PH, LCW = 36;
  const view = regionView(LCW + (MW - LCW) / 2, VH / 2 + 8, 10.68);
  const SEL = '운봉읍'; const se = FARM_EMD.find(e => e.nm === SEL); const hi = emdSelect(view, SEL);
  let s = head(`남원시 · 지역 구분 · 읍면동 ${FARM_EMD.length} · ${FARM.title}`, '기본');
  let inner = view.imgHtml + svgLayer(choropleth(view, FARM_EMD, e => e.area) + hi.svg) + hi.html;
  FARM_EMD.slice(0, 9).forEach(e => { inner += emdLabel(view, e.nm, e.nm === SEL ? '#FFFFFF' : '#FFFFFF'); });
  s += plateRaw(inner, 'V-World Satellite z11 실타일 · 읍면동 경계 = V-World Data API LT_C_ADEMD_INFO(원본 지역 설정과 같은 출처) · 채움 = 표의 전체(㎡)');
  s += collapsedLeft(MX, MY, MH);
  s += searchField2(MX + LCW + 24, MY + 16, 372) + hudBar(MX + LCW + 24, MY + 58, `지역 구분 · 남원시 읍면동 ${EMD.length} 중 결과 있는 ${FARM_EMD.length} · 채움 = 분석 면적(㎡)`);
  s += mapTools(TOOLX, TOOLY);
  s += div(TOOLX - 12 - 132, TOOLY, 132, 32, `background:#FFFFFF;border:1px solid ${H};display:flex;align-items:center;gap:6px;padding:0 10px;font-size:14px;color:${G}`, `${ico('chevL', G, 12)}분석 결과/성과`);
  // 선택 읍면동 콜아웃(표의 선택 행과 같은 값)
  const CBW = 300, CBH = 110, CX = MX + hi.box[2] + 48, CY = MY + Math.max(90, hi.box[1] - 30);
  s += `<svg width="1440" height="900" style="position:absolute;left:0;top:0;pointer-events:none"><path d="M${MX + hi.box[2] + 6} ${MY + hi.box[1] - 6}L${CX} ${CY + 20}" stroke="#FFFFFF" stroke-width="1.25"/></svg>`;
  s += div(CX, CY, CBW, CBH, `background:#FFFFFF;border:1px solid ${INK}`) + D(CX + 14, CY + 12, SEL, 18) + TR(CX + CBW - 14, CY + 14, `${fmt(se.n)} 필지`, 14, ACC, 'font-weight:500');
  s += div(CX + 14, CY + 44, CBW - 28, 6, `background:#FFFFFF;border:1px solid ${TEAL}`) + div(CX + 14, CY + 44, Math.round((CBW - 28) * se.c['경작지'].area / se.area), 6, `background:${TEAL}`);
  s += T(CX + 14, CY + 60, '경작지', 14, G) + NR(CX + CBW - 14, CY + 60, `${fmt(se.c['경작지'].area)} ㎡`, 14) + T(CX + 14, CY + 82, '비경작지', 14, G) + NR(CX + CBW - 14, CY + 82, `${fmt(se.c['비경작지'].area)} ㎡`, 14);
  s += stepLegend(MX + LCW + 24, MY + VH - 16 - 76, '범례 · 읍면동별 분석 면적', FARM_EMD[0].area, '㎡');
  s += scaleBar2(MX + LCW + 24 + 256 + 12, MY + VH - 16 - 26, 10.68, NW_C[1], 'V-World 위성');
  // 하단 표(지역 구분 탭 · 지역 설정 열림)
  const bar = (e) => (x, y, w) => stack(x, y + 12, w - 24, 6, e, FARM_EMD[0].area);
  s += tablePanel(MX + LCW + 1, MY + VH, MW - LCW - 1, PH, {
    crumbs: ['농지이용·불법건축물', 'XI-VFM v2.1', FARM.title], tab: '지역 구분', sel: 0, accentCol: 3, total: FARM_EMD.length, range: [1, 4], unit: '개 읍면동', pages: 4,
    note: `집계 단위 = 읍면동 · 합계 ${fmt(FARM_TOT.area)} ㎡`,
    fields: (x, y, w) => sel(x, y, 200, '시도', '전북특별자치도') + T(x + 208, y + 27, '›', 15, C) + sel(x + 224, y, 160, '시군구', '남원시') + T(x + 392, y + 27, '›', 15, C) + sel(x + 408, y, 160, '읍면동', '전체') + bbtn(x + w - 92 - 20 - 84, y + 18, 84, '초기화', 34) + cta(x + w - 92, y + 18, 92, '설정').replace('height:36px', 'height:34px') + T(x + 592, y + 27, '설정하면 표가 한 단계 내려가고 지도가 그 지역으로 이동합니다', 14, G),
    cols: [['연번', 50, 'l', 'n'], ['시도', 130], ['시군구', 80], ['읍면동', 90], ['경작지(㎡)', 120, 'r', 'n'], ['비경작지(㎡)', 120, 'r', 'n'], ['전체(㎡)', 120, 'r', 'n'], ['경작지 ■ · 비경작지 □ · 가장 큰 읍면동 대비', 360]],
    rows: FARM_EMD.slice(0, 4).map((e, i) => [String(i + 1), '전북특별자치도', '남원시', e.nm, fmt(e.c['경작지'].area), fmt(e.c['비경작지'].area), fmt(e.area), bar(e)]),
  });
  s += FOOT;
  return page('B7 지도 서비스 · 지역 구분(지역 설정 캐스케이드 + 읍면동 단계 채움)', s);
}

// ---------- 3. 펼친 표 · 분석 결과 › 탐지 정보 + 검색 6필드 ----------
const pnuParts = p => ({ ri: p.slice(8, 10), san: p[10] === '2' ? '산' : '—', bon: String(+p.slice(11, 15)), bu: String(+p.slice(15, 19)) });
function boardTable() {
  const PH = 346, VH = MH - PH, LCW = 36, SHIFT = 250;
  const fp = polysIn(FARM_F, WIN17, 1), gp = polysIn(GH_F, WIN17, 1); const selp = SEL_BOX(); const P = selp.f.properties;
  const [bx0, by0, bx1, by1] = selp.box.map(Math.round);
  // 표 행 = 창 안 실 feature(선택 객체 포함 · 가까운 순)
  const near = []; const seen = new Set([P.pnu]); for (const q of gp.filter(p => p !== selp && p.f.properties.emd === P.emd && p.box[0] > 180 && p.box[2] < 1150 && p.box[1] > SHIFT + 90 && p.box[3] < SHIFT + VH - 30 && p.f.properties.area > 1500).sort((a, b) => a.box[0] - b.box[0])) { if (seen.has(q.f.properties.pnu)) continue; if ([selp, ...near].some(o => Math.hypot(o.box[0] - q.box[0], o.box[1] - q.box[1]) < 170)) continue; seen.add(q.f.properties.pnu); near.push(q); if (near.length === 3) break; }
  const rowsF = [near[0], selp, near[1], near[2]].filter(Boolean);
  let s = head(`남원시 ${P.emd} · 분석 결과 표 펼침 · ${GH.title}`, '기본');
  const over = `<div style="position:absolute;left:0;top:${-SHIFT}px;width:${MW}px;height:${MH}px"><img src="map-vw-z17.jpg" alt="" style="position:absolute;left:0;top:0;width:${MW}px;height:${MH}px;display:block;filter:saturate(.72) contrast(1.04)">` +
    svgLayer(pathsOf(fp, FARM_STYLE) + `<g opacity=".8">${pathsOf(gp, GH_STYLE)}</g>` + near.map(p => `<path d="${p.d}" fill="none" stroke="#FFFFFF" stroke-width="1.25"/>`).join('') + `<path d="${selp.d}" fill="rgba(0,109,247,.38)" stroke="${ACC}" stroke-width="2"/>`) + brk(bx1 - bx0 + 16, by1 - by0 + 16, ACC, 12, 1.5, bx0 - 8, by0 - 8) +
    near.map((p, i) => `<div class="n" style="position:absolute;left:${Math.round(p.box[0])}px;top:${Math.round(p.box[1]) - 22}px;height:20px;line-height:20px;padding:0 6px;background:#FFFFFF;color:${INK};font-size:14px">${[1, 3, 4][i]}</div>`).join('') +
    `<div class="n" style="position:absolute;left:${bx0 - 8}px;top:${by0 - 32}px;height:22px;line-height:20px;padding:0 7px;background:#FFFFFF;border:1px solid ${ACC};color:${ACC};font-size:14px">2 · 선택 행</div></div>`;
  s += plateRaw(over, 'V-World Satellite z17 실타일 · 표 행 번호 = 판 위 번호');
  s += collapsedLeft(MX, MY, MH);
  s += searchField2(MX + LCW + 24, MY + 16, 372) + hudBar(MX + LCW + 24, MY + 58, `창 안 · 비닐하우스 ${fmt(gp.length)} · 농지 ${fmt(fp.length)} 필지 · 표의 행 = 판 위 번호`);
  s += mapTools(TOOLX, TOOLY);
  s += div(TOOLX - 12 - 132, TOOLY, 132, 32, `background:#FFFFFF;border:1px solid ${H};display:flex;align-items:center;gap:6px;padding:0 10px;font-size:14px;color:${G}`, `${ico('chevL', G, 12)}분석 결과/성과`);
  s += tablePanel(MX + LCW + 1, MY + VH, MW - LCW - 1, PH, {
    crumbs: ['비닐하우스 현황', 'XI-VFM v2.1', GH.title], tab: '분석 결과', info: '탐지 정보', infoTabs: ['기본 정보', '탐지 정보'], search: true, sel: 1, accentCol: 8, total: GH.stats.count, range: [1, 10],
    note: `필지 행정정보 = PNU 에서 파생 · 기준일 ${GH.stats.analyzedAt.replace(/-/g, '.')}`,
    fields: (x, y, w) => { const fw = 138; let t = ''; [['시도', '전북특별자치도'], ['시군구', '남원시'], ['읍면동', P.emd], ['탐지 클래스', '전체'], ['조치 상태', '전체']].forEach(([l, v], i) => { t += sel(x + i * (fw + 10), y, fw, l, v); }); t += input(x + 5 * (fw + 10), y, w - 5 * (fw + 10) - 92 - 84 - 24, '검색어', '검색어를 입력하세요', true).replace('height:36px', 'height:32px'); t += bbtn(x + w - 92 - 20 - 84, y + 19, 84, '초기화', 34) + cta(x + w - 92, y + 19, 92, '검색').replace('height:36px', 'height:34px'); return t; },
    cols: [['연번', 60, 'l', 'n'], ['시도', 150], ['시군구', 90], ['읍면동', 90], ['리(코드)', 90, 'l', 'n'], ['산', 60], ['본번', 80, 'r', 'n'], ['부번', 80, 'r', 'n'], ['탐지 클래스', 190], ['면적(㎡)', 120, 'r', 'n']],
    rows: rowsF.map((p, i) => { const q = p.f.properties, a = pnuParts(q.pnu); return [String(i + 1), '전북특별자치도', '남원시', q.emd, a.ri, a.san, a.bon, a.bu, q.cls.replace('_', ' · '), fmt(q.area)]; }),
  });
  s += FOOT;
  return page('B7 지도 서비스 · 펼친 표(분석 결과 › 탐지 정보 + 검색 6필드)', s);
}

// ---------- 4–5. 내보내기 = 보안 서약서 모달(검증 오류 / 생성 중) · 6. 다운로드 시작 토스트 ----------
const PLEDGE_TXT = '본인은 <b style="font-weight:500">Land-XI 플랫폼</b>의 공간정보 다운로드 환경을 사용함에 있어 해당 자료를 외부로 유출하지 않을 것이며, 업무(과제) 수행에 한해 사용하고 이를 임의로 가공·편집·유출하지 않으며, 신청한 본인 외 제3자 또는 기관 내 타 사용자에게 공유하지 않고, 자료의 사용 및 활용, 목적 외 사용금지, 자료보호조치, 자료오용방지 등에 대한 책임이 있음을 서약하고 이에 본 서약서를 제출합니다.';
function pledgeModal(state, o = {}) {
  const W = 640, X = 72 + Math.round((1368 - W) / 2), Y = 96, HH = 712, I = X + 32, IW = W - 64; const busy = state === 'busy', err = state === 'error', init = state === 'init', ph = o.ph || ['예) 도통동 도로 보수 계획 수립', '예) 포트홀 긴급 보수 우선순위 선정'];
  let s = scrim + modalBox(X, Y, W, HH);
  s += D(I, Y + 26, '보안 서약서', 26) + `<div style="position:absolute;left:${X + W - 44}px;top:${Y + 30}px">${ico('close', G, 14)}</div>` + T(I, Y + 62, '다운로드를 받기 위해서는 해당 내용에 대한 동의가 필요합니다.', 15, G);
  // 내보낼 대상(지금 켜 둔 결과 레이어 — 지도 상태의 표시)
  s += div(I, Y + 96, IW, 62, `background:${T1}`) + lab(I + 12, Y + 104, o.what || '내보낼 대상 · 켜 둔 결과 레이어 2');
  (o.items || [['tile-farm-clean.jpg', FARM.title, `${fmt(FARM.stats.count)} 필지`], ['tile-gh-clean.jpg', GH.title, `${fmt(GH.stats.count)} 필지`]]).forEach(([src, nm, n], i) => { const x = I + 12 + i * 284; s += img(x, Y + 124, 44, 26, src, '', `outline:1px solid ${H}`) + T(x + 52, Y + 126, nm, 14, INK, 'font-weight:500') + N(x + 52 + tw(nm) + 8, Y + 127, n, 14, ACC); });
  s += `<div style="position:absolute;left:${I}px;top:${Y + 172}px;width:${IW}px;height:132px;border:1px solid ${H};padding:12px 14px;font-size:14.5px;line-height:1.62;color:${INK};letter-spacing:-.01em;overflow:hidden">${PLEDGE_TXT}</div>`;
  s += T(I, Y + 316, '신청자 : <b style="font-weight:500">관리자</b> 님', 15);
  s += chk(I, Y + 351, !err && !init, INK) + T(I + 24, Y + 347, `<span style="color:${WARN}">[필수]</span> 위 보안 서약 내용에 동의합니다.`, 15);
  if (err) s += errMsg(I + 24, Y + 370, '보안 서약 내용에 동의해 주셔야 합니다.');
  const fy = Y + 400;
  s += lab(I, fy, '요청명' + req) + input(I, fy + 20, IW, '', init ? ph[0] : '금지면 비닐하우스 현황 점검', init);
  s += lab(I, fy + 72, '활용 기간' + req) + fld(I, fy + 92, 200, `<span class="n">2026.08.27</span>`, 'height:36px') + T(I + 212, fy + 99, '~', 15, G) + fld(I + 236, fy + 92, 200, `<span class="n">2026.09.27</span>`, 'height:36px') + T(I + 452, fy + 100, '기본 = 오늘부터 1개월', 14, G);
  s += lab(I, fy + 144, '사용 목적' + req) + input(I, fy + 164, IW, '', err || init ? ph[1] : '금지면 시설 현황 내부 보고', err || init, err);
  if (err) s += errMsg(I, fy + 204, '사용 목적을 입력해 주세요.');
  s += hl(X + 1, Y + HH - 72, W - 2);
  if (busy) { s += div(X, Y + HH - 73, W, 2, `background:${H}`) + div(X, Y + HH - 73, Math.round(W * .62), 2, `background:${INK}`) + T(I, Y + HH - 46, '파일을 만들고 있습니다 · 창을 닫아도 계속됩니다', 14, G); }
  s += bbtn(X + W - 32 - 148 - 20 - 84, Y + HH - 54, 84, '취소', 36, busy ? C : INK);
  s += busy ? div(X + W - 32 - 148, Y + HH - 54, 148, 36, `background:${C};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500`, '생성 중…') : cta(X + W - 32 - 148, Y + HH - 54, 148, '다운로드 실행');
  return s;
}
function boardPledge(state) {
  const b = base14({ sub: `남원시 · 결과 레이어 2 · 내보내기 · 보안 서약서`, tool: 'download', ctaOn: false });
  return page(`B7 지도 서비스 · 보안 서약서(${state === 'busy' ? '생성 중' : '검증 오류'})`, b.s + FOOT + pledgeModal(state));
}
function boardDownload() {
  const b = base14({ sub: `남원시 · 결과 레이어 2 · 다운로드 시작`, tool: 'download' });
  let s = b.s + toast(TOOLX - 12, TOOLY + 46, '다운로드가 시작되었습니다', ['요청명 · 금지면 비닐하우스 현황 점검', '활용 기간 · 2026.08.27 ~ 2026.09.27', '사용 목적 · 금지면 시설 현황 내부 보고']);
  return page('B7 지도 서비스 · 다운로드 시작(토스트)', s + FOOT);
}

// ---------- 7. 레이어 0(체크 없음 = 범례 · 우 스택 · 하단 표 없음) ----------
function boardEmpty() {
  const b = base14({ sub: '남원시 · 결과 레이어 0 · V-World 위성', layers: LAYERS_OFF, polys: false, ctaOn: false, ready: 6, filter: 'saturate(.9) contrast(1.02)' });
  let s = b.s;
  // 결손 자리(점선 무채 + 이유 한 줄) — 범례가 앉을 자리
  const LGX = TOOLX - 12 - 252, LGY = MY + MH - 20 - 26 - 14 - 86;
  s += `<div style="position:absolute;left:${LGX}px;top:${LGY}px;width:252px;height:86px;border:1px dashed #FFFFFF;background:rgba(1,1,2,.5)"></div>` + T(LGX + 14, LGY + 12, '범례 없음', 14, '#FFFFFF', 'font-weight:500') + T(LGX + 14, LGY + 34, '선택된 작업이 없어요', 14, '#FFFFFF') + T(LGX + 14, LGY + 56, '왼쪽에서 분석 결과를 체크하세요', 14, '#CCCCCC');
  s += hudBar(b.LX0, MY + 58, '결과 레이어 0 · 체크하면 지도가 그 분석의 자리로 이동합니다');
  return page('B7 지도 서비스 · 레이어 0(빈 상태)', s + FOOT);
}

// ---------- 8. 로딩(결과 레이어 불러오는 중) ----------
function boardLoading() {
  const CUT = 760;   // 판 좌표 x — 여기까지 그려짐(실 도형을 자리 순서로 잘랐다)
  const all = polysIn(FARM_F, WIN14).length + polysIn(GH_F, WIN14).length;
  const b = base14({ sub: '남원시 · 결과 레이어 2 · 불러오는 중', polyFilter: p => p.box[2] < CUT, hud: false, loading: '불러오는 중…', legendOn: false });
  let s = b.s; const done = b.fp.length + b.gp.length;
  // 아직 안 온 타일(256 격자) = 흰 헤어라인 + 어두운 면
  let g = ''; const ox = (256 - (WIN14.x0 % 256)) % 256, oy = (256 - (WIN14.y0 % 256)) % 256;
  for (let ty = oy - 256; ty < MH; ty += 256) for (let tx = ox - 256; tx < MW; tx += 256) { if (tx + 256 <= CUT + 120) continue; const late = (Math.round(tx / 256) + Math.round(ty / 256)) % 2 === 0 || tx > 1100; if (late) g += `<rect x="${tx}" y="${ty}" width="256" height="256" fill="rgba(1,1,2,.58)" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-dasharray="3 3"/>`; }
  s = s.replace('</svg>', '</svg>' + svgLayer(g));   // 첫 svg(결과 도형) 바로 뒤 = 판 안
  s += hudBar(b.LX0, MY + 58, `결과 레이어 불러오는 중 · 창 안 ${fmt(done)} / ${fmt(all)} 필지`);
  s += div(b.LX0, MY + 84, 372, 2, `background:rgba(255,255,255,.4)`) + div(b.LX0, MY + 84, Math.round(372 * done / all), 2, 'background:#FFFFFF');
  const LGX = TOOLX - 12 - 252, LGY = MY + MH - 20 - 20 - 4 * 26 - 14 - 26;
  s += legend(LGX, LGY, 252, [[SW.tealFill, '경작지', '—'], [SW.tealDash, '비경작지', '—'], [SW.accFill, '비닐하우스 · 단동', '—'], [SW.accLine, '비닐하우스 · 다동', '—']], '범례 · 필지 수 · 세는 중');
  return page('B7 지도 서비스 · 로딩(결과 레이어 불러오는 중)', s + FOOT);
}

// ---------- 9–10. 검색 결과 / 검색 결과 0 ----------
const MOCK = { name: [['광한루원', '관광지 > 문화재', '전북특별자치도 남원시 요천로 1447', 127.3858, 35.4106], ['춘향테마파크', '관광지 > 테마파크', '전북특별자치도 남원시 양림길 14', 127.3795, 35.4133], ['남원시청', '공공기관 > 시청', '전북특별자치도 남원시 시청로 60', 127.3905, 35.4163]], road: [['시청로', '도로명주소', '전북특별자치도 남원시 시청로', 127.3905, 35.4163], ['광한북로', '도로명주소', '전북특별자치도 남원시 광한북로', 127.3868, 35.4148], ['요천로', '도로명주소', '전북특별자치도 남원시 요천로', 127.3858, 35.4120]], lot: [['도통동 456', '지번주소', '전북특별자치도 남원시 도통동 456', 127.3921, 35.4172], ['향교동 78', '지번주소', '전북특별자치도 남원시 향교동 78', 127.3882, 35.4135]] };
function searchPanel(x, y, w, q, empty) {
  const h = empty ? 214 : MH - 16 - 48 - 20; let s = div(x, y, w, h, `background:#FFFFFF;border:1px solid ${INK}`);
  let cx = x + 16; ['전체', '명칭', '도로명', '지번'].forEach(t => { const on = t === '전체'; s += T(cx, y + 12, t, 15, on ? INK : G, on ? 'font-weight:500' : ''); if (on) s += div(cx, y + 38, tw(t, 15), 2, `background:${INK}`); cx += tw(t, 15) + 22; });
  s += `<div style="position:absolute;left:${x + w - 30}px;top:${y + 15}px">${ico('close', G, 12)}</div>` + hl(x, y + 40, w);
  s += `<div style="position:absolute;left:${x + 16}px;top:${y + 52}px;font-size:15px;white-space:nowrap"><span style="color:${ACC};font-weight:500">“${q}”</span> 검색결과 <span style="color:${C}">|</span> 총 <span class="n" style="font-weight:500">${empty ? '0' : '488,364'}</span> 건${empty ? '' : SIYEON}</div>` + hl(x, y + 84, w);
  if (empty) { s += `<div style="position:absolute;left:${x + 16}px;top:${y + 100}px;width:${w - 32}px;height:98px;border:1px dashed ${C}"></div>` + T(x + 32, y + 118, '검색 결과가 없습니다', 16, INK, 'font-weight:500') + T(x + 32, y + 146, '명칭 · 도로명 · 지번 어디에도 없는 말입니다.', 14, G) + T(x + 32, y + 168, '읍면동 이름이나 지번으로 다시 찾아보세요.', 14, G); return s; }
  let yy = y + 96;
  [['명칭', '7,842', MOCK.name], ['도로명', '90,844', MOCK.road], ['지번', '389,678', MOCK.lot]].forEach(([l, n, items], si) => {
    s += `<div style="position:absolute;left:${x + 16}px;top:${yy}px;display:flex;gap:7px;align-items:baseline;font-size:15px;white-space:nowrap"><span style="font-weight:500">${l}</span><span class="n" style="font-size:14px;color:${ACC}">${n}</span><span style="font-size:14px;color:${G}">건</span></div>` + TR(x + w - 16, yy + 1, `${l} 더 보기 ›`, 14, G); yy += 28;
    items.forEach(([t, sub, addr], i) => { const on = si === 0 && i === 0; if (on) s += div(x + 1, yy - 4, w - 2, 50, `background:${T1}`) + div(x + 1, yy - 4, 3, 50, `background:${ACC}`); s += T(x + 16, yy, t, 15, on ? ACC : INK, 'font-weight:500') + T(x + 16 + tw(t, 15) + 10, yy + 1, sub, 14, G) + T(x + 16, yy + 22, addr, 14, G); yy += 50; s += hl(x + 16, yy - 5, w - 32); });
    yy += 8;
  });
  return s;
}
function boardSearch() {
  const fp = polysIn(FARM_F, WIN15, 1), gp = polysIn(GH_F, WIN15, 1); const [clon, clat] = winCenter(WIN15); const LCW = 36, LX0 = MX + LCW + 24;
  let s = head('남원시 시내 · 검색 “남원” · 명칭 · 도로명 · 지번', '기본');
  const pt = (lo, la) => { const [x, y] = merc(lo, la, 15); return [Math.round(x - WIN15.x0), Math.round(y - WIN15.y0)]; };
  const [sx, sy] = pt(MOCK.name[0][3], MOCK.name[0][4]);
  let over = svgLayer(pathsOf(fp, FARM_STYLE) + `<g opacity=".8">${pathsOf(gp, GH_STYLE)}</g>`);
  [...MOCK.name.slice(1), ...MOCK.road, ...MOCK.lot].forEach(([t, , , lo, la]) => { const [x, y] = pt(lo, la); over += div(x - 4, y - 4, 9, 9, `background:#FFFFFF;border:1px solid ${INK}`); });
  over += brk(56, 56, '#FFFFFF', 12, 1.5, sx - 28, sy - 28) + div(sx - 5, sy - 5, 11, 11, `background:${ACC};border:1px solid #FFFFFF`);
  over += div(sx + 40, sy - 44, 250, 60, `background:#FFFFFF;border:1px solid ${INK}`) + T(sx + 52, sy - 36, '광한루원', 16, INK, 'font-weight:500') + T(sx + 52 + 70, sy - 34, '관광지 > 문화재', 14, G) + N(sx + 52, sy - 12, `${MOCK.name[0][3].toFixed(4)} E · ${MOCK.name[0][4].toFixed(4)} N`, 14, G);
  s += plate('b7-map-vw-city.jpg', over, 'V-World Satellite z15 실타일 · 남원 시내(원본 검색 MOCK 좌표대)');
  s += collapsedLeft(MX, MY, MH) + searchField2(LX0, MY + 16, 420, '남원') + searchPanel(LX0, MY + 56, 420, '남원', false);
  s += mapTools(TOOLX, TOOLY, 'search') + cta(TOOLX - 12 - 92, TOOLY - 2, 92, '내보내기');
  s += hudBar(LX0 + 436, MY + 19, '결과 클릭 = 지도 이동 + 표식 · 흰 점 = 이 창 안의 다른 결과');
  s += scaleBar2(LX0 + 436, MY + MH - 20 - 26, 15, clat, `${clon.toFixed(4)} E · ${clat.toFixed(4)} N`);
  return page('B7 지도 서비스 · 검색 결과(전체 탭 · 명칭/도로명/지번)', s + FOOT);
}
function boardSearchEmpty() {
  const b = base14({ sub: '남원시 · 검색 “금지면 비닐” · 결과 0', q: '금지면 비닐', tool: 'search', hud: false });
  let s = b.s + searchPanel(b.LX0, MY + 56, 372, '금지면 비닐', true);
  return page('B7 지도 서비스 · 검색 결과 0', s + FOOT);
}

// ---------- 11. 측정(거리 완료 1 + 면적 그리는 중) · 12. 그리기(점 · 선 · 면 · 원) · 13. 관심 구역 ----------
function base17(o) {
  const fp = polysIn(FARM_F, WIN17, 1), gp = polysIn(GH_F, WIN17, 1); const [clon, clat] = winCenter(WIN17); const LCW = 36, LX0 = MX + LCW + 24;
  let s = head(o.sub, '기본');
  s += plate('map-vw-z17.jpg', svgLayer(`<g opacity="${o.dim || .55}">${pathsOf(fp, FARM_STYLE)}${pathsOf(gp, GH_STYLE)}</g>` + (o.svg || '')) + (o.html || ''), 'V-World Satellite z17 실타일');
  s += collapsedLeft(MX, MY, MH) + searchField2(LX0, MY + 16, 372) + mapTools(TOOLX, TOOLY, o.tool);
  if (o.hud) s += hudBar(LX0, MY + 58, o.hud);
  s += scaleBar2(LX0, MY + MH - 20 - 26, 17, clat, `${clon.toFixed(4)} E · ${clat.toFixed(4)} N`);
  return { s, LX0, clat };
}
const vtx = (pts, col = '#FFFFFF', fillc = INK) => pts.map(([x, y]) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="${fillc}" stroke="${col}" stroke-width="1.5"/>`).join('');
const pxLen = (pts, m) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0) * m;
const pxArea = (pts, m) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2) * m * m;
const tip = (x, y, t, col = INK) => `<div class="n" style="position:absolute;left:${x}px;top:${y}px;height:26px;line-height:24px;padding:0 9px;background:#FFFFFF;border:1px solid ${col};color:${col};font-size:14px;white-space:nowrap">${t}</div>`;
function boardMeasure() {
  const m = mPerPx(winCenter(WIN17)[1], 17);
  const big = polysIn(GH_F, WIN17, 1).filter(p => p.box[0] > 150 && p.box[2] < 640 && p.box[1] > 200 && p.box[3] < 700).sort((a, b) => b.f.properties.area - a.f.properties.area)[0]; const bg = big.f.geometry; const br = (bg.type === 'Polygon' ? bg.coordinates[0] : bg.coordinates[0][0]).map(([lo, la]) => { const [x, y] = merc(lo, la, 17); return [Math.round(x - WIN17.x0), Math.round(y - WIN17.y0)]; });
  const line = dp(br.slice(0, -1), 8).slice(0, 4);                       // 실 필지 경계를 따라 찍은 점(판 좌표)
  const selp = SEL_BOX(); const gm = selp.f.geometry; const ring = gm.type === 'Polygon' ? gm.coordinates[0] : gm.coordinates[0][0];
  const poly0 = ring.map(([lo, la]) => { const [x, y] = merc(lo, la, 17); return [x - WIN17.x0, y - WIN17.y0]; });
  const polyAll = dp(poly0.slice(0, -1), 4).map(p => p.map(Math.round)); const poly = polyAll.slice(0, -1);
  const cur = polyAll[polyAll.length - 1].map((v, i) => v + (i ? 10 : 14));
  const svg = `<path d="${line.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join('')}" fill="none" stroke="#FFFFFF" stroke-width="2"/>${vtx(line)}` +
    `<path d="${poly.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join('')}" fill="rgba(255,255,255,.18)" stroke="#FFFFFF" stroke-width="2"/><path d="M${poly[poly.length - 1].join(' ')}L${cur.join(' ')}L${poly[0].join(' ')}" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="5 4"/>${vtx(poly, '#FFFFFF', ACC)}`;
  const d = pxLen(line, m), a = pxArea([...poly, cur], m); const c = poly.reduce((q, p) => [q[0] + p[0] / poly.length, q[1] + p[1] / poly.length], [0, 0]);
  const html = tip(line[line.length - 1][0] + 12, line[line.length - 1][1] - 30, `거리 ${d >= 1000 ? (d / 1000).toFixed(2) + ' km' : d.toFixed(1) + ' m'}`) + tip(Math.min(...poly.map(p => p[0])) - 150, Math.round(c[1]) - 13, `면적 ${fmt(a)} m²`, ACC) +
    `<div style="position:absolute;left:${cur[0] + 14}px;top:${cur[1] + 8}px;height:24px;line-height:24px;padding:0 8px;background:rgba(1,1,2,.72);color:#FFFFFF;font-size:14px;white-space:nowrap">클릭하여 꼭지점 추가</div>` +
    `<svg width="20" height="20" viewBox="0 0 20 20" style="position:absolute;left:${cur[0] - 10}px;top:${cur[1] - 10}px"><path d="M10 0v20M0 10h20" stroke="#FFFFFF" stroke-width="1.5"/></svg>`;
  const b = base17({ sub: '남원시 금지면 · 측정 및 분석 · 면적 재는 중', tool: 'ruler', svg, html, hud: '측정 · 거리 1 완료 · 면적 1 그리는 중 · 더블클릭 = 완료', dim: .35 });
  const sw = (d0) => `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">${d0}</svg>`;
  let s = b.s + toolMenu(TOOLX - 8, TOOLY + 72, '측정 및 분석', [['close', '취소'], ['ruler', '거리', 'm · km'], ['grid', '면적', 'm² · km²'], ['globe', '반경', 'm · km']], '면적');
  s += toast(TOOLX - 8 - 176 - 12, TOOLY, '면적 측정', ['지도를 클릭하여 면적을 측정하세요. 더블클릭으로 완료']);
  return page('B7 지도 서비스 · 측정 및 분석(면적 재는 중)', s + FOOT);
}
function boardDraw() {
  const pts = [[330, 250], [372, 300]]; const line = [[250, 520], [380, 440], [470, 470], [560, 380]]; const poly = [[690, 210], [860, 170], [930, 300], [800, 380]]; const cur = [712, 330]; const circ = [1010, 520, 92];
  const m = mPerPx(winCenter(WIN17)[1], 17);
  const svg = pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${ACC}" stroke="#FFFFFF" stroke-width="2"/>`).join('') +
    `<path d="${line.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join('')}" fill="none" stroke="${ACC}" stroke-width="2.5"/><path d="${line.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join('')}" fill="none" stroke="#FFFFFF" stroke-width=".75"/>` +
    `<circle cx="${circ[0]}" cy="${circ[1]}" r="${circ[2]}" fill="rgba(0,109,247,.16)" stroke="${ACC}" stroke-width="2"/>` +
    `<path d="${poly.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join('')}" fill="rgba(0,109,247,.16)" stroke="${ACC}" stroke-width="2"/><path d="M${poly[3].join(' ')}L${cur.join(' ')}L${poly[0].join(' ')}" fill="none" stroke="${ACC}" stroke-width="1.5" stroke-dasharray="5 4"/>${vtx(poly, ACC, '#FFFFFF')}`;
  const html = `<div style="position:absolute;left:${cur[0] + 14}px;top:${cur[1] + 8}px;height:24px;line-height:24px;padding:0 8px;background:rgba(1,1,2,.72);color:#FFFFFF;font-size:14px;white-space:nowrap">클릭하여 꼭지점 추가 · 더블클릭 = 완료</div><svg width="20" height="20" viewBox="0 0 20 20" style="position:absolute;left:${cur[0] - 10}px;top:${cur[1] - 10}px"><path d="M10 0v20M0 10h20" stroke="#FFFFFF" stroke-width="1.5"/></svg>`;
  const b = base17({ sub: '남원시 금지면 · 그리기 도구 · 면 그리는 중', tool: 'pen', svg, html, hud: '그리기 · 점 2 · 선 1 · 원 1 · 면 1 그리는 중', dim: .3 });
  const g = d0 => `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">${d0}</svg>`;
  let s = b.s + toolMenu(TOOLX - 8, TOOLY + 108, '그리기 도구', [['close', '취소'], [g('<circle cx="10" cy="10" r="3" fill="currentColor"/>'), '점'], [g('<path d="M3 16 9 8l4 4 4-8"/>'), '선'], [g('<path d="M4 5l12-1 1 11-10 2z"/>'), '면'], [g('<circle cx="10" cy="10" r="7"/>'), '원']], '면');
  s += toast(TOOLX - 8 - 176 - 12, TOOLY, '면 그리기', ['지도를 클릭하여 면을(를) 그리세요']);
  return page('B7 지도 서비스 · 그리기 도구(면 그리는 중)', s + FOOT);
}
function boardAOI() {
  const poly = [[520, 190], [905, 150], [985, 420], [760, 560], [470, 470]];
  const m = mPerPx(winCenter(WIN17)[1], 17);
  const svg = `<path d="M0 0H${MW}V${MH}H0Z${poly.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join('')}Z" fill="rgba(1,1,2,.46)" fill-rule="evenodd"/><path d="${poly.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join('')}Z" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="8 5"/>${vtx(poly, '#FFFFFF', ACC)}`;
  const html = tip(poly[1][0] + 14, poly[1][1] - 12, `관심 구역 · ${ha(pxArea(poly, m))} ha`);
  const b = base17({ sub: '남원시 금지면 · 관심 구역 설정', tool: 'aoi', svg, html, dim: .9 });
  let s = b.s; const BX = b.LX0, BW = TOOLX - 12 - BX, BY = MY + 58;
  s += div(BX, BY, BW, 48, `background:#FFFFFF;border:1px solid ${INK}`) + `<div style="position:absolute;left:${BX + 14}px;top:${BY + 15}px">${ico('aoi', ACC, 16)}</div>` + T(BX + 40, BY + 13, '지도 위에 도형을 그려 관심 구역을 지정하세요', 15);
  s += bbtn(BX + BW - 8 - 76 - 18 - 76 - 18 - 108 - 18 - 96, BY + 7, 96, '되돌리기', 34) + bbtn(BX + BW - 8 - 76 - 18 - 76 - 18 - 108, BY + 7, 108, '전체 지우기', 34) + bbtn(BX + BW - 8 - 76 - 18 - 76, BY + 7, 76, '취소', 34) + cta(BX + BW - 8 - 76, BY + 7, 76, '저장').replace('height:36px', 'height:34px');
  return page('B7 지도 서비스 · 관심 구역 설정(AOI 도구 막대)', s + FOOT);
}

// ---------- 14. 배경지도 변경(서브메뉴 5 · 일반 선택) · 15. 레이어 탭(트리 12 리프) ----------
function boardBasemap() {
  const b = base14({ sub: '남원시 · 결과 레이어 2 · 배경지도 = 일반', src: 'b7-map-base-z14.jpg', tool: 'globe', filter: 'saturate(.85)', ctaOn: false, hud: false });
  const W = 232, X = TOOLX - 8 - W, Y = TOOLY + 36; const items = [['일반', 'b7-map-bm-base.jpg'], ['흑백', 'b7-map-bm-gray.jpg'], ['야간', 'b7-map-bm-night.jpg'], ['위성', 'b7-map-bm-sat.jpg', '기본'], ['빈화면', null]];
  let s = b.s + div(X, Y, W, 34 + items.length * 56 + 8, `background:#FFFFFF;border:1px solid ${INK}`) + lab(X + 12, Y + 10, '배경지도 변경');
  items.forEach(([t, src, note], i) => { const y = Y + 34 + i * 56, on = i === 0; if (on) s += div(X + 1, y, W - 2, 56, `background:${T1}`); s += src ? img(X + 12, y + 6, 78, 44, src, on ? brk(78, 44, ACC, 8, 1) : '', `outline:1px solid ${on ? ACC : H}`) : div(X + 12, y + 6, 78, 44, `border:1px dashed ${C};background:#FFFFFF`); s += T(X + 102, y + 17, t, 15, on ? ACC : INK, on ? 'font-weight:500' : '') + (note ? TR(X + W - 12, y + 18, note, 14, G) : ''); });
  s += hudBar(b.LX0, MY + 58, '배경지도 = 일반 · 결과 도형은 그대로 · 겹쳐보기/나란히보기에서는 좌·우 함께 바뀝니다');
  return page('B7 지도 서비스 · 배경지도 변경(일반)', s + FOOT);
}
const TREE = [['행정정보', [['사료작물 정보', [['2025.10.31', '사료작물(하계) · 사매면'], ['2025.06.30', '사료작물(IRG · 호밀) · 1권역']]], ['농지이용 정보', [['2025.09.30', '농지이용현황 · 사매면'], ['2025.06.30', '농지이용현황 · 운봉읍', true]]], ['영농시설 정보', [['2025.10.31', '영농시설 · 사매면'], ['2025.09.30', '영농시설 · 금지면', true, true]]]]], ['데이터셋', [['정사영상', [['2025.10.31', '사매면 정사영상 · 10월'], ['2025.08.31', '운봉읍 정사영상 · 8월']]], ['공간정보', [['2025.10.31', '도로망 · 전체'], ['2025.09.30', '지적도 · 전체', false, true]]], ['이미지셋', [['2025.10.15', '사매면 순찰 이미지셋'], ['2025.09.20', '운봉읍 순찰 이미지셋']]]]]];
function layerTree(LI, y0, LIW) {
  let s = '', y = y0 - 4;
  s += lab(LI, y, '발행된 레이어 · 체크 = 지도에 겹침') + `<div style="position:absolute;left:${LI + LIW - 40}px;top:${y - 3}px">${SIYEON}</div>`; y += 28;
  for (const [g, subs] of TREE) {
    s += `<div style="position:absolute;left:${LI}px;top:${y + 4}px">${ico('chevD', INK, 12)}</div>` + D(LI + 20, y, g, 17) + NR(LI + LIW, y + 2, `${subs.reduce((a, x) => a + x[1].filter(l => l[2]).length, 0)}/${subs.reduce((a, x) => a + x[1].length, 0)}`, 14, ACC); y += 32;
    for (const [sg, leaves] of subs) {
      s += `<div style="position:absolute;left:${LI + 14}px;top:${y + 4}px">${ico('chevD', G, 11)}</div>` + T(LI + 32, y, sg, 15, INK, 'font-weight:500'); y += 28;
      for (const [d, nm, on, shared] of leaves) { if (on) s += div(LI - 15, y - 3, LIW + 30, 28, `background:${T1}`); s += chk(LI + 32, y + 3, !!on, ACC) + N(LI + 56, y + 1, d, 14, G) + T(LI + 146, y, nm, 14.5, on ? INK : INK) + (shared ? `<div style="position:absolute;left:${LI + LIW - 14}px;top:${y + 3}px">${ico('share', G, 13)}</div>` : ''); y += 28; }
      y += 4;
    }
    s += hl(LI, y + 2, LIW); y += 16;
  }
  return s;
}
function boardLayerTab() {
  const b = base14({ sub: '남원시 · 레이어 탭 · 발행 레이어 12 · 켠 것 2', panel: 'layer', hud: '레이어 2 겹침 · 농지이용현황 · 운봉읍 / 영농시설 · 금지면 + AI 분석 결과 2' });
  return page('B7 지도 서비스 · 레이어 탭(트리 2단 · 리프 12)', b.s + FOOT);
}

// ======================================================================
// B7-Stats-* · B7-Report-* — 원본 stats-standard.html · report-standard(-issue).html (ximap iframe 모달 · ?task=farmland&embed=1)
// 수치 = results geojson 읍면동 × 클래스 면적 실측 집계. 원본 데모 시드(권역 3건 · 보고서 6건)는 `시연`.
// ======================================================================
const DW = 620, DX = 1440 - DW, DI = DX + 24, DIW = DW - 48, DTX = DX - 16 - 36;
const STAT_TITLE = '농지 활용 통계', STAT_SUB = 'AI 분석 과제(농지 활용 분석)의 경작·비경작 면적 집계를 확인해요';
const JOBS = [[FARM.title, `${FARM.stats.analyzedAt.replace(/-/g, '.')} · XI-VFM v2.1 · ${fmt(FARM.stats.count)} 필지`, false, 'tile-farm-clean.jpg'], ['남원시 3권역 · 농지활용 분석', '2026.04.07 · 농지 활용 분석', true, 'tile-ep-2.jpg'], ['남원시 2권역 · 농지활용 분석', '2026.03.21 · 농지 활용 분석', true, 'tile-ep-4.jpg']];
const stack = (x, y, w, h, e, mx) => div(x, y, Math.max(2, Math.round(w * e.area / mx)), h, `background:#FFFFFF;border:1px solid ${TEAL}`) + div(x, y, Math.max(1, Math.round(w * e.c['경작지'].area / mx)), h, `background:${TEAL}`);
// 지도 작업공간(좌 접힘 + 판 + 도구 열) — 서랍이 열려도 판이 남는다
function wsRegion(sub, o = {}) {
  const LCW = 36, visW = DX - MX - LCW; const view = regionView(LCW + visW / 2, o.cy || 380, o.z || 10.86);
  let s = head(sub, '기본');
  const hi = o.sel ? emdSelect(view, o.sel) : null; const his = (o.multi || []).map(nm => emdSelect(view, nm));
  let inner = view.imgHtml + svgLayer(choropleth(view, FARM_EMD, e => e.area, { only: o.only }) + (hi ? hi.svg : '') + his.map(h => h.svg.replace('stroke-width="2"', 'stroke-width="1.5"')).join('')) + (hi ? hi.html : '');
  (o.labels || FARM_EMD.slice(0, 7).map(e => e.nm)).forEach(nm => { inner += emdLabel(view, nm); });
  s += plateRaw(inner, 'V-World Satellite z11 실타일 · 읍면동 경계 = V-World Data API(원본 통계 · 보고서 지역 캐스케이드와 같은 출처)');
  s += collapsedLeft(MX, MY, MH) + searchField2(MX + LCW + 24, MY + 16, 372) + mapTools(DTX, TOOLY);
  if (o.hud) s += hudBar(MX + LCW + 24, MY + 58, o.hud);
  if (!o.noLegend) s += stepLegend(MX + LCW + 24, MY + MH - 20 - 76, '범례 · 읍면동별 분석 면적', FARM_EMD[0].area, '㎡');
  s += scaleBar2(MX + LCW + 24 + (o.noLegend ? 0 : 256 + 12), MY + MH - 20 - 26, o.z || 10.86, NW_C[1], 'V-World 위성');
  return { s, view, hi };
}
function ws14(sub, o = {}) {
  const LCW = 36, fp = polysIn(FARM_F, WIN14); const [clon, clat] = winCenter(WIN14);
  let s = head(sub, '기본');
  const st = f => o.cls && f.properties.cls !== o.cls ? `fill="none" stroke="${TEAL}" stroke-opacity=".35" stroke-width=".75"` : FARM_STYLE(f).replace('.32', '.5');
  s += `<div style="position:absolute;left:${MX}px;top:${MY}px;width:${MW}px;height:${MH}px;overflow:hidden;background:#DDD"><img src="map-vw-z14.jpg" alt="" style="position:absolute;left:-300px;top:0;width:${MW}px;height:${MH}px;display:block;filter:saturate(.72) contrast(1.04)"><div style="position:absolute;left:-300px;top:0">${svgLayer(o.polys === false ? '' : pathsOf(fp, st))}</div></div>\n`;
  s += collapsedLeft(MX, MY, MH) + searchField2(MX + LCW + 24, MY + 16, 372) + mapTools(DTX, TOOLY);
  if (o.hud) s += hudBar(MX + LCW + 24, MY + 58, o.hud);
  s += scaleBar2(MX + LCW + 24, MY + MH - 20 - 26, 14, clat, 'V-World 위성');
  return { s, fp };
}
// 서랍 머리(제목 · 설명 · 닫기) → 다음 y
function drawerHead(kicker, title, sub) {
  let s = div(DX, MY, DW, MH, 'background:#FFFFFF') + vl(DX, MY, MH, INK);
  s += lab(DI, MY + 16, kicker) + `<div style="position:absolute;left:${DX + DW - 38}px;top:${MY + 16}px">${ico('close', G, 13)}</div>` + D(DI, MY + 36, title, 22) + T(DI, MY + 66, sub, 14, G) + hl(DI, MY + 94, DIW);
  return s;
}
function jobList(y, withActions = true) {
  let s = lab(DI, y, '기준 (최근 분석 결과)') + TR(DI + DIW, y - 2, '더 보기 ›', 14, ACC);
  JOBS.forEach(([t, m, demo], i) => { const yy = y + 24 + i * 30, on = i === 0; if (on) s += div(DX + 1, yy - 3, DW - 1, 30, `background:${T1}`); s += radio(DI, yy + 5, on) + T(DI + 24, yy + 1, t + (demo ? SIYEON : ''), 15, on ? INK : G, on ? 'font-weight:500' : '') + NR(DI + DIW, yy + 2, m, 14, G); });
  if (withActions) s += bbtn(DI + DIW - 108 - 20 - 84, y + 122, 84, '초기화', 34) + cta(DI + DIW - 108, y + 122, 108, '통계 보기').replace('height:36px', 'height:34px') + T(DI, y + 129, '기준을 바꾸면 통계 보기를 다시 누릅니다', 14, G);
  return s;
}
function filterRow(x, y, w, cls = '전체') {
  const av = w - 128 - 18; let s = '', fx = x;
  [['시도', '전북특별자치도', .34], ['시군구', '남원시', .22], ['읍면동', '전체', .22], ['클래스', cls, .22]].forEach(([l, v, k]) => { const fw = Math.floor(av * k); s += sel(fx, y, fw, l, v); fx += fw + 6; });
  s += T(x + w - 60 - 8 - 46, y + 27, '초기화', 14, G) + bbtn(x + w - 60, y + 20, 60, '조회', 32);
  return s;
}
function statTabs(x, y, w, on) {
  let s = '', cx = x; ['지역별 통계', '클래스별 통계'].forEach(t => { const o = t === on; s += T(cx, y, t, 16, o ? INK : G, o ? 'font-weight:500' : ''); if (o) s += div(cx, y + 28, tw(t, 16), 2, `background:${INK}`); cx += tw(t, 16) + 28; });
  if (on === '지역별 통계') s += `<div style="position:absolute;right:${1440 - (x + w)}px;top:${y + 1}px;display:flex;gap:6px;align-items:center;font-size:14px;color:${INK}">${ico('download', INK, 14)}엑셀 다운로드</div>`;
  return s + hl(x, y + 30, w);
}
function kpis(x, y, big = 40, gap = 190) {
  const unit = (t) => `<span style="font-family:'Pretendard';font-weight:400;font-size:15px;color:${G};letter-spacing:0;margin-left:6px">${t}</span>`;
  let s = D(x, y, ha(FARM_TOT.area) + unit('ha 전체'), big, ACC, 'letter-spacing:-.02em');
  const x2 = x + gap + (big > 50 ? 60 : 0);
  s += D(x2, y + big - 28, ha(FARM_TOT.c[0]) + unit('ha'), 28) + div(x2, y + big + 8, 14, 10, SW.tealFill.replace('.32', '1')) + T(x2 + 20, y + big + 3, `경작지 · ${Math.round(100 * FARM_TOT.c[0] / FARM_TOT.area)} %`, 14, G);
  s += D(x2 + gap - 20, y + big - 28, ha(FARM_TOT.c[1]) + unit('ha'), 28) + div(x2 + gap - 20, y + big + 8, 14, 10, `background:#FFFFFF;border:1px solid ${TEAL}`) + T(x2 + gap, y + big + 3, `비경작지 · ${Math.round(100 * FARM_TOT.c[1] / FARM_TOT.area)} %`, 14, G);
  s += N(x, y + big + 4, `${fmt(FARM_TOT.area)} ㎡`, 14, G);
  return s;
}
// 막대 32(읍면동 큰 순) — 데이터 잉크만: 축선 1 + 막대 + 선택 눈금
function bars(x, y, w, h, selIdx, o = {}) {
  const n = FARM_EMD.length, pitch = w / n, bw = Math.max(6, Math.floor(pitch * (o.fat || .62))), mx = FARM_EMD[0].area; let s = '';
  if (o.grid) [1, .5].forEach(f => { const v = Math.round(mx * f / 10000) * 10000; const yy = y + h - Math.round(h * v / mx); s += hl(x, yy, w, H) + N(x - 8, yy - 9, fmt(v), 14, G, 'transform:translateX(-100%)'); });
  FARM_EMD.forEach((e, i) => { const bx = Math.round(x + i * pitch + (pitch - bw) / 2), bh = Math.max(2, Math.round(h * e.area / mx)), ch = Math.round(h * e.c['경작지'].area / mx); const on = i === selIdx;
    s += div(bx, y + h - bh, bw, bh, `background:#FFFFFF;border:1px solid ${TEAL}`) + div(bx, y + h - ch, bw, ch, `background:${TEAL}`);
    if (on) s += div(bx - 3, y - 6, bw + 6, h + 12, `border:1px solid ${ACC}`);
    if (o.names) s += `<div style="position:absolute;left:${bx + bw / 2 - 9}px;top:${y + h + 8}px;writing-mode:vertical-rl;font-size:14px;line-height:18px;color:${on ? ACC : i < 12 || o.allNames ? INK : G};white-space:nowrap;${on ? 'font-weight:500' : ''}">${e.nm}</div>`;
  });
  s += hl(x, y + h, w, INK);
  return s;
}
function emdTable(x, y, w, rowsN, selIdx, rh = 28, start = 0) {
  const cols = [[0, '읍면동'], [.34, '전체(㎡)'], [.52, '경작지(㎡)'], [.72, '비경작지(㎡)']]; const bx = x + w * .74, bw = w * .26 - 12; let s = div(x - 12, y, w + 24, 30, `background:${T1}`);
  s += T(x, y + 6, '읍면동', 14, G) + TR(x + w * .34, y + 6, '전체(㎡)', 14, G) + TR(x + w * .53, y + 6, '경작지(㎡)', 14, G) + TR(x + w * .72, y + 6, '비경작지(㎡)', 14, G) + T(bx, y + 6, '■ 경작 □ 비경작', 14, G);
  FARM_EMD.slice(start, start + rowsN).forEach((e, i) => { const yy = y + 30 + i * rh, on = i + start === selIdx; if (on) s += div(x - 12, yy, w + 24, rh, `background:${T1}`) + div(x - 12, yy, 3, rh, `background:${ACC}`); s += T(x, yy + (rh - 19) / 2, e.nm, 15, on ? ACC : INK, on ? 'font-weight:500' : '') + NR(x + w * .34, yy + (rh - 18) / 2, fmt(e.area), 14) + NR(x + w * .53, yy + (rh - 18) / 2, fmt(e.c['경작지'].area), 14) + NR(x + w * .72, yy + (rh - 18) / 2, fmt(e.c['비경작지'].area), 14) + stack(bx, yy + rh / 2 - 3, bw, 6, e, FARM_EMD[0].area) + hl(x, yy + rh, w); });
  return s;
}

// ---------- 선택 1 · 지도 작업공간 안 우 서랍(권장) ----------
function statsOpt1Body() {
  const SELI = 0, SEL = FARM_EMD[SELI].nm;
  const w = wsRegion(`남원시 · 통계 자세히 보기 · ${FARM.title}`, { sel: SEL, hud: '표의 행 = 지도의 읍면동 · 행에 올리면 그 읍면동이 켜집니다' });
  let s = w.s + drawerHead('통계 자세히 보기', STAT_TITLE, STAT_SUB);
  s += jobList(MY + 106);
  s += hl(DI, MY + 274, DIW) + filterRow(DI, MY + 284, DIW) + statTabs(DI, MY + 350, DIW, '지역별 통계');
  s += kpis(DI, MY + 394);
  s += lab(DI, MY + 466, `읍면동별 분석 면적(㎡) · 큰 순 · ${FARM_EMD.length}`) + bars(DI, MY + 490, DIW, 56, SELI);
  const TY = MY + 560; s += emdTable(DI, TY, DIW, 5, SELI);
  s += TR(DI + DIW, MY + 466, `표 1~5 / ${FARM_EMD.length}행`, 14, G);
  // 리더: 선택 읍면동 ↔ 선택 행
  const b = w.hi.box; s += `<svg width="1440" height="900" style="position:absolute;left:0;top:0;pointer-events:none"><path d="M${MX + b[2] + 6} ${MY + Math.round((b[1] + b[3]) / 2)}H${DX - 40}V${TY + 44}H${DX}" fill="none" stroke="#FFFFFF" stroke-width="1.25"/><rect x="${DX - 3}" y="${TY + 41}" width="6" height="6" fill="${ACC}"/></svg>`;
  return s;
}
const boardStatsOpt1 = () => page('B7 통계 · 선택 1 — 지도 작업공간 안 우 서랍(권장)', statsOpt1Body() + FOOT);

// ---------- 선택 2 · 전면 보고서형 페이지(판 = 증거 인셋) ----------
function boardStatsOpt2() {
  let s = MAST + D(X0, 86, STAT_TITLE, 34) + div(X0, 134, 132, 4, `background:${ACC}`) + T(X0 + 250, 100, STAT_SUB, 16, G) + TR(X0 + CW, 100, '‹ 지도 서비스로', 15, ACC) + hl(X0, 152, CW);
  const LXc = X0, LWc = 300, RXc = X0 + 332, RWc = CW - 332;
  s += lab(LXc, 170, '기준 (최근 분석 결과)') + TR(LXc + LWc, 168, '더 보기 ›', 14, ACC);
  JOBS.forEach(([t, m, demo, src], i) => { const y = 194 + i * 78, on = i === 0; s += div(LXc, y, LWc, 70, `border:1px solid ${on ? ACC : H};background:${on ? T1 : '#FFFFFF'}`) + radio(LXc + 12, y + 28, on) + img(LXc + 36, y + 10, 76, 50, src, on ? brk(76, 50, ACC, 8, 1) : '', `outline:1px solid ${on ? ACC : H}`) + T(LXc + 122, y + 12, (i ? t.replace(' · 농지활용 분석', '') : t) + (demo ? SIYEON : ''), 15, INK, 'font-weight:500') + N(LXc + 122, y + 38, m.split(' · ')[0] + (i ? '' : ` · ${fmt(FARM.stats.count)} 필지`), 14, G); });
  s += bbtn(LXc, 436, 96, '초기화', 36) + cta(LXc + 108, 436, LWc - 108, '통계 보기');
  // 증거 인셋(판)
  const IY = 492, IH = 850 - IY; const view = regionView(LWc / 2, IH / 2 + 8, 9.62); const hi = emdSelect(view, FARM_EMD[0].nm);
  s += `<div style="position:absolute;left:${LXc}px;top:${IY}px;width:${LWc}px;height:${IH}px;overflow:hidden;background:#1B2420">${view.imgHtml}${svgLayer(choropleth(view, FARM_EMD, e => e.area) + hi.svg, LWc, IH)}${hi.html}${hudBar(8, 8, '판 · 읍면동별 분석 면적')}${hudBar(8, IH - 34, FARM_EMD[0].nm + ' · 표의 선택 행')}</div>`;
  // 우 본문
  s += filterRow(RXc, 166, RWc) + statTabs(RXc, 236, RWc, '지역별 통계');
  s += kpis(RXc, 284, 58, 230);
  s += lab(RXc + 60, 386, `읍면동별 분석 면적(㎡) · 큰 순 · ■ 경작지 □ 비경작지`) + bars(RXc + 60, 414, RWc - 60, 170, 0, { names: true, grid: true, allNames: true, fat: .56 });
  s += emdTable(RXc + 12, 668, RWc - 24, 5, 0, 28);
  s += T(RXc, 844, `읍면동별 집계 · ${FARM_EMD.length}행 중 1~5`, 14, G, 'display:none');
  return page('B7 통계 · 선택 2 — 전면 보고서형 페이지(판 = 증거 인셋)', s + FOOT);
}

// ---------- 선택 3 · 지도 위로 올라오는 하단 시트 + 스크러버 ----------
function boardStatsOpt3() {
  const SH = 344, SY = MY + MH - SH, LCW = 36, SX = MX + LCW + 1, SWd = MW - LCW - 1, SELI = 3, E = FARM_EMD[SELI];
  const view = regionView(LCW + (MW - LCW) / 2, (MH - SH) / 2 + 6, 10.66); const hi = emdSelect(view, E.nm);
  let s = head(`남원시 · 통계 자세히 보기 · ${FARM.title}`, '기본');
  let inner = view.imgHtml + svgLayer(choropleth(view, FARM_EMD, e => e.area) + hi.svg) + hi.html; FARM_EMD.slice(0, 7).forEach(e => { inner += emdLabel(view, e.nm); });
  s += plateRaw(inner, 'V-World Satellite z11 실타일 · 읍면동 경계 · 채움 = 분석 면적');
  s += collapsedLeft(MX, MY, MH) + searchField2(MX + LCW + 24, MY + 16, 372) + mapTools(TOOLX, TOOLY) + hudBar(MX + LCW + 24, MY + 58, '막대 위를 움직이면 그 읍면동이 지도에서 켜집니다');
  s += stepLegend(TOOLX - 12 - 256, SY - 16 - 76, '범례 · 읍면동별 분석 면적', FARM_EMD[0].area, '㎡');
  // 시트
  s += div(SX, SY, SWd, SH, `background:#FFFFFF;border-top:1px solid ${INK}`); const PI = SX + 24, PW = SWd - 48;
  s += div(SX + SWd / 2 - 20, SY + 6, 40, 3, `background:${C}`);
  s += D(PI, SY + 20, STAT_TITLE, 20) + fld(PI + 170, SY + 16, 380, `${lab(0, 0, '기준').replace(/position:absolute;left:0px;top:0px;/, '')}<span style="font-weight:500">${FARM.title}</span><span class="n" style="color:${G}">${FARM.stats.analyzedAt.replace(/-/g, '.')}</span><span style="flex:1"></span>${chev()}`) + T(PI + 562, SY + 22, '더 보기 ›', 14, ACC);
  s += cta(PI + PW - 40 - 108, SY + 14, 108, '통계 보기') + `<div style="position:absolute;left:${PI + PW - 16}px;top:${SY + 24}px">${ico('chevD', INK, 16)}</div>` + T(PI + PW - 40 - 108 - 66, SY + 22, '초기화', 14, G);
  s += hl(SX, SY + 60, SWd);
  const fy = SY + 72; let fx = PI;[['시도', '전북특별자치도', 190], ['시군구', '남원시', 150], ['읍면동', '전체', 150], ['클래스', '전체', 150]].forEach(([l, v, w]) => { s += fld(fx, fy, w, `<span style="color:${G}">${l}</span><span>${v}</span><span style="flex:1"></span>${chev()}`); fx += w + 8; });
  s += bbtn(fx + 4, fy, 60, '조회', 32);
  let cx = fx + 100; ['지역별 통계', '클래스별 통계'].forEach(t => { const on = t === '지역별 통계'; s += T(cx, fy + 5, t, 16, on ? INK : G, on ? 'font-weight:500' : ''); if (on) s += div(cx, fy + 32, tw(t, 16), 2, `background:${INK}`); cx += tw(t, 16) + 24; });
  s += `<div style="position:absolute;right:${1440 - (PI + PW)}px;top:${fy + 6}px;display:flex;gap:6px;align-items:center;font-size:14px">${ico('download', INK, 14)}엑셀 다운로드</div>` + hl(SX, fy + 44, SWd);
  // 본문: KPI | 스크럽 막대 | 주변 5행 표
  const by = fy + 60, KW = 250, TW3 = 430, CXs = PI + KW + 70, CWd = PW - KW - 70 - TW3 - 36;
  const unit = (t) => `<span style="font-family:'Pretendard';font-weight:400;font-size:15px;color:${G};letter-spacing:0;margin-left:6px">${t}</span>`;
  s += D(PI, by, ha(FARM_TOT.area) + unit('ha 전체'), 50, ACC, 'letter-spacing:-.02em') + N(PI, by + 58, `${fmt(FARM_TOT.area)} ㎡ · 읍면동 ${FARM_EMD.length}`, 14, G);
  s += div(PI, by + 92, KW - 20, 8, `background:#FFFFFF;border:1px solid ${TEAL}`) + div(PI, by + 92, Math.round((KW - 20) * FARM_TOT.c[0] / FARM_TOT.area), 8, `background:${TEAL}`);
  s += T(PI, by + 108, '경작지', 14, G) + NR(PI + KW - 20, by + 108, `${ha(FARM_TOT.c[0])} ha · ${Math.round(100 * FARM_TOT.c[0] / FARM_TOT.area)} %`, 14) + T(PI, by + 132, '비경작지', 14, G) + NR(PI + KW - 20, by + 132, `${ha(FARM_TOT.c[1])} ha · ${Math.round(100 * FARM_TOT.c[1] / FARM_TOT.area)} %`, 14);
  s += vl(PI + KW, by, 170);
  const BH = 118; s += bars(CXs, by + 6, CWd, BH, SELI, { grid: true, fat: .6 });
  const pitch = CWd / FARM_EMD.length, sx = Math.round(CXs + SELI * pitch + pitch / 2);
  // 스크러버(세로선 + 손잡이 + 값)
  s += div(sx, by - 6, 1, BH + 30, `background:${ACC}`) + div(sx - 6, by + BH + 18, 13, 13, `background:#FFFFFF;border:1.5px solid ${ACC}`) + T(sx + 14, by + BH + 14, `${E.nm} · ${SELI + 1}번째`, 14, ACC, 'font-weight:500') + T(CXs, by + BH + 14, `← 큰 순`, 14, G) + TR(CXs + CWd, by + BH + 14, `${FARM_EMD.length} 읍면동`, 14, G);
  const tx = CXs + CWd - 232; s += div(sx, by + 4, tx + 14 - sx, 1, `background:${ACC}`);
  s += div(tx + 14, by - 8, 214, 66, `background:#FFFFFF;border:1px solid ${INK}`) + T(tx + 24, by - 2, E.nm, 15, INK, 'font-weight:500') + NR(tx + 218, by - 1, `${fmt(E.area)} ㎡`, 14, ACC) + T(tx + 24, by + 20, '경작지', 14, G) + NR(tx + 218, by + 20, fmt(E.c['경작지'].area), 14) + T(tx + 24, by + 38, '비경작지', 14, G) + NR(tx + 218, by + 38, fmt(E.c['비경작지'].area), 14);
  s += emdTable(PI + PW - TW3 + 12, by - 8, TW3 - 12, 5, SELI, 27, 1);
  // 리더: 읍면동 → 스크러버
  const b = hi.box; s += `<svg width="1440" height="900" style="position:absolute;left:0;top:0;pointer-events:none"><path d="M${MX + Math.round((b[0] + b[2]) / 2)} ${MY + b[3] + 6}V${SY - 24}H${sx}V${SY}" fill="none" stroke="#FFFFFF" stroke-width="1.25"/><rect x="${sx - 3}" y="${SY - 3}" width="6" height="6" fill="${ACC}"/></svg>`;
  return page('B7 통계 · 선택 3 — 지도 위 하단 시트 + 스크러버', s + FOOT);
}

// ---------- 권장 구조(서랍) · 클래스별 통계 탭 ----------
function boardStatsClass() {
  const w = ws14(`남원시 · 통계 자세히 보기 · 클래스별 · ${FARM.title}`, { cls: '경작지', hud: '클래스 행에 올리면 그 클래스의 필지만 켜집니다 · 경작지' });
  let s = w.s + drawerHead('통계 자세히 보기', STAT_TITLE, STAT_SUB) + jobList(MY + 106) + hl(DI, MY + 274, DIW) + filterRow(DI, MY + 284, DIW) + statTabs(DI, MY + 350, DIW, '클래스별 통계');
  const TY = MY + 396; s += T(DI, TY - 2, '클래스별 집계', 15, INK, 'font-weight:500') + TR(DI + DIW, TY - 1, '남원시 · 전체 ' + fmt(FARM_TOT.area) + ' ㎡', 14, G) + div(DI - 12, TY + 24, DIW + 24, 30, `background:${T1}`) + T(DI, TY + 30, '클래스', 14, G) + TR(DI + DIW * .62, TY + 30, '면적(㎡)', 14, G) + TR(DI + DIW, TY + 30, '비율(%)', 14, G);
  FARM_CLS.forEach((c, i) => { const y = TY + 54 + i * 52, v = FARM_TOT.c[i], on = i === 0; if (on) s += div(DX + 1, y, DW - 1, 52, `background:${T1}`) + div(DX + 1, y, 3, 52, `background:${ACC}`);
    s += T(DI, y + 8, c, 16, on ? ACC : INK, 'font-weight:500') + NR(DI + DIW * .62, y + 9, fmt(v), 15) + NR(DI + DIW, y + 9, (100 * v / FARM_TOT.area).toFixed(1), 15) + div(DI, y + 36, Math.round(DIW * v / FARM_TOT.c[0]), 8, i ? `background:#FFFFFF;border:1px solid ${TEAL}` : `background:${TEAL}`) + hl(DI, y + 52, DIW); });
  // 클래스 실사 크롭 2(crops.js · V-World · 결과 도형 포함)
  const PY = TY + 54 + 104 + 40, PWd = (DIW - 16) / 2, PHt = MY + MH - 16 - PY - 26; s += lab(DI, PY - 24, '이 클래스로 탐지된 필지 · 실사 크롭');
  [['b7-map-crop-cult.jpg', '경작지', '4,351 ㎡ · V-World 위성', '인월면'], ['b7-map-crop-uncult.jpg', '비경작지', '1,289 ㎡ · V-World 위성', '대강면']].forEach(([src, c, m], i) => { const x = DI + i * (PWd + 16); s += img(x, PY, PWd, PHt, src, brk(PWd, PHt, i ? '#FFFFFF' : ACC, 12, 1.25) + hudBar(8, PHt - 34, m), `outline:1px solid ${i ? H : ACC}`) + T(x, PY + PHt + 5, c, 14, i ? G : ACC, i ? '' : 'font-weight:500'); });
  return page('B7 통계 · 클래스별 통계 탭(권장 구조)', s + FOOT);
}
// ---------- 빈 상태 ----------
function boardStatsEmpty() {
  const w = ws14(`남원시 · 통계 자세히 보기 · 통계 보기 전`, { hud: '기준을 고르고 통계 보기를 누르면 읍면동 집계가 열립니다' });
  let s = w.s + drawerHead('통계 자세히 보기', STAT_TITLE, STAT_SUB) + jobList(MY + 106) + hl(DI, MY + 274, DIW);
  const EY = MY + 298, EH = 344; s += `<div style="position:absolute;left:${DI}px;top:${EY}px;width:${DIW}px;height:${EH}px;border:1px dashed ${C}"></div>`;
  s += `<div style="position:absolute;left:${DI + 28}px;top:${EY + 30}px">${ico('chart', C, 44)}</div>` + D(DI + 28, EY + 96, 'AI 분석이 완료된 후 이용할 수 있어요', 20) + T(DI + 28, EY + 132, '기준 분석과 클래스를 고르고 <b style="font-weight:500">통계 보기</b>를 눌러 주세요', 15, G);
  s += T(DI + 28, EY + 176, '열리는 것', 14, G) + T(DI + 100, EY + 176, '지역별 통계 · 클래스별 통계 · 엑셀 다운로드', 14, INK) + T(DI + 28, EY + 200, '집계 단위', 14, G) + T(DI + 100, EY + 200, '시도 › 시군구 › 읍면동(지역을 고른 단계 아래)', 14, INK);
  { const gx = DI + 28, gw = DIW - 56, gy = EY + 244, gh = 72, n = FARM_EMD.length, pt = gw / n; FARM_EMD.forEach((e, i) => { const bh = Math.max(3, Math.round(gh * e.area / FARM_EMD[0].area)); s += div(Math.round(gx + i * pt), gy + gh - bh, Math.floor(pt * .6), bh, `border:1px dashed ${C}`); }); s += hl(gx, gy + gh, gw, C) + T(gx, gy - 24, '통계 보기를 누르면 이 자리에 읍면동별 막대와 표가 열립니다', 14, C); }
  s += lab(DI, EY + EH + 24, '통계가 없는 과제') + T(DI, EY + EH + 46, '곤포사일리지 탐지는 통계를 제공하지 않습니다 — 버튼이 나오지 않습니다', 14, G);
  return page('B7 통계 · 빈 상태(통계 보기 전)', s + FOOT);
}
// ---------- 더 보기 = 분석 결과 찾기 모달 ----------
function boardStatsFind() {
  const W = 1080, X = 72 + Math.round((1368 - W) / 2), Y = 130, HH = 640, I = X + 32, IW = W - 64;
  let s = statsOpt1Body() + FOOT + scrim + modalBox(X, Y, W, HH);
  s += D(I, Y + 24, '분석 결과 찾기', 24) + `<div style="position:absolute;left:${X + W - 46}px;top:${Y + 28}px">${ico('close', G, 14)}</div>`;
  const fy = Y + 76; s += div(X + 1, fy - 10, W - 2, 76, 'background:#FAFAFA');
  s += sel(I, fy, 92, '검색어', '전체') + fld(I + 100, fy + 20, 190, `<span style="color:${C}">검색어를 입력하세요.</span>`) + sel(I + 302, fy, 140, '실행자', '전체');
  s += lab(I + 454, fy, '기준일') + fld(I + 454, fy + 20, 124, `<span class="n" style="color:${C}">YYYY-MM-DD</span>`) + T(I + 584, fy + 26, '~', 14, G) + fld(I + 600, fy + 20, 124, `<span class="n" style="color:${C}">YYYY-MM-DD</span>`);
  let cx = I + 738; ['전체', '1개월', '3개월', '6개월', '12개월'].forEach((t, i) => { s += chip(cx, fy + 24, t, i === 0); cx += tw(t) + 24; });
  s += hl(X, fy + 66, W) + T(I, fy + 84, 'AI 분석 내역', 16, INK, 'font-weight:500') + bbtn(I + IW - 84 - 20 - 84, fy + 78, 84, '초기화', 32) + bbtn(I + IW - 84, fy + 78, 84, '검색', 32);
  const cols = [['선택', 60], ['기준 일자', 120], ['영상 명', 250], ['분석 범위 유형', 150], ['분석 범위 명', 150], ['분석명', 170], ['분석 과제명', 140]]; const tot = cols.reduce((a, c) => a + c[1], 0); const xs = []; let a = I; cols.forEach(c => { xs.push(a); a += c[1] / tot * IW; });
  const ty = fy + 122; s += div(X + 1, ty, W - 2, 32, `background:${T1}`); cols.forEach((c, i) => { s += T(xs[i], ty + 7, c[0], 14, G); });
  const rows = [[FARM.stats.analyzedAt.replace(/-/g, '.'), '남원 농경지 드론 정사영상 · 2025.06', '농지이용 정보', '남원시 전역', FARM.title, '농지 활용 분석', false], ['2026.04.07', '남원시 3권역 정사영상', '농지이용 정보', '남원시 3권역', '농지 활용 분석', '농지 활용 분석', true], ['2026.03.21', '남원시 2권역 정사영상', '농지이용 정보', '남원시 2권역', '농지 활용 분석', '농지 활용 분석', true], ['2026.03.05', '남원시 1권역 정사영상', '농지이용 정보', '남원시 1권역', '농지 활용 분석', '농지 활용 분석', true]];
  rows.forEach((r, ri) => { const y = ty + 32 + ri * 44, on = ri === 0; if (on) s += div(X + 1, y, W - 2, 44, `background:${T1}`) + div(X + 1, y, 3, 44, `background:${ACC}`); s += radio(xs[0] + 6, y + 15, on); r.slice(0, 6).forEach((v, i) => { s += (i === 0 ? N : T)(xs[i + 1], y + 12, v + (i === 1 && r[6] ? SIYEON : ''), 15, on && i === 3 ? INK : INK); }); s += hl(I, y + 44, IW); });
  s += `<div style="position:absolute;left:${I}px;top:${ty + 32 + 4 * 44 + 14}px;width:${IW}px;height:64px;border:1px dashed ${C}"></div>` + T(I + 16, ty + 32 + 4 * 44 + 35, '농지 활용 분석으로 끝난 작업은 4건입니다 · 다른 과제의 결과는 그 과제의 통계에서 찾습니다', 14, G);
  s += pager(I, Y + HH - 110, IW, 4, 1, 4, 5, '건', '총', 1);
  s += hl(X, Y + HH - 72, W) + bbtn(X + W - 32 - 108 - 20 - 84, Y + HH - 54, 84, '취소') + cta(X + W - 32 - 108, Y + HH - 54, 108, '확인');
  return page('B7 통계 · 분석 결과 찾기 모달(더 보기)', s);
}

// ======================================================================
// 보고서 — 서랍 탭 2(발급 요청 · 발급 내역)
// ======================================================================
const REP_DESC = 'AI 분석 과제(농지 활용 분석)의 경작·비경작 면적을 엑셀 보고서로 발급받을 수 있습니다.';
const REP_TABS = (on, y) => { let s = '', cx = DI; [['보고서 발급 요청', ''], ['보고서 발급 내역', '6']].forEach(([t, c]) => { const o = t === on; s += T(cx, y, t, 16, o ? INK : G, o ? 'font-weight:500' : '') + (c ? N(cx + tw(t, 16) + 6, y + 2, c, 14, o ? ACC : C) : ''); if (o) s += div(cx, y + 28, tw(t, 16), 2, `background:${INK}`); cx += tw(t, 16) + (c ? 46 : 28); }); return s + hl(DI, y + 30, DIW); };
const PICK = ['운봉읍', '송동면', '대강면', '보절면', '대산면'];
const EMD_ORDER = ['운봉읍', '주천면', '수지면', '송동면', '주생면', '금지면', '대강면', '대산면', '사매면', '덕과면', '보절면', '산동면', '이백면', '산내면', '인월면', '아영면', '동충동', '죽항동', '노암동', '금동', '왕정동', '향교동', '도통동', '월락동'];
function boardReportIssue(err) {
  const picks = err ? [] : PICK; const pe = FARM_EMD.filter(e => picks.includes(e.nm));
  const w = wsRegion(`남원시 · 보고서 발급 요청 · ${FARM.title}`, { noLegend: true, multi: picks, only: picks, labels: err ? FARM_EMD.slice(0, 7).map(e => e.nm) : picks, hud: err ? '대상 지역 0 · 체크한 읍면동이 지도에 켜집니다' : `대상 지역 ${picks.length} · 체크한 읍면동이 지도에 켜집니다` });
  let s = w.s + drawerHead('보고서', '농지 활용 보고서 발급 요청', REP_DESC) + REP_TABS('보고서 발급 요청', MY + 108);
  let y = MY + 154;
  s += lab(DI, y, '보고서 제목' + req) + input(DI, y + 20, DIW, '', err ? '예) 2026년 4월 현황 보고서' : '2026년 6월 남원시 농지 활용 현황 보고서', err, err); if (err) s += errMsg(DI, y + 60, '보고서 제목을 입력해 주세요.');
  y += err ? 88 : 70;
  s += lab(DI, y, '탐지 클래스' + req); let cx = DI;[['전체 선택', !err], ['경작지', !err], ['비경작지', !err]].forEach(([t, on], i) => { s += chk(cx, y + 27, on, INK) + T(cx + 22, y + 23, t, 15, INK, i ? '' : 'font-weight:500'); cx += tw(t, 15) + 50; if (!i) { s += vl(cx - 16, y + 24, 20); } });
  if (err) s += errMsg(DI, y + 50, '탐지 클래스를 1개 이상 선택해 주세요.');
  y += err ? 80 : 62;
  s += lab(DI, y, '대상 지역' + req) + sel(DI, y + 22, 220, '', '전북특별자치도') + T(DI + 228, y + 28, '›', 15, C) + sel(DI + 244, y + 22, 180, '', '남원시') + T(DI + 440, y + 29, `읍면동 ${EMD.length} · 여러 개 선택`, 14, G);
  const LY = y + 64, LH = err ? 128 : 124; s += div(DI, LY, DIW, LH, `border:1px solid ${err ? INK : H};overflow:hidden`, '');
  s += chk(DI + 12, LY + 12, false, INK) + T(DI + 34, LY + 8, '전체 선택', 15, INK, 'font-weight:500') + hl(DI + 1, LY + 36, DIW - 2);
  EMD_ORDER.slice(0, 12).forEach((nm, i) => { const col = i % 4, row = Math.floor(i / 4), x = DI + 12 + col * 136, yy = LY + 46 + row * 27, on = picks.includes(nm); s += chk(x, yy + 3, on, ACC) + T(x + 22, yy - 1, nm, 15, on ? ACC : INK, on ? 'font-weight:500' : ''); });
  s += div(DI + DIW - 7, LY + 40, 3, 44, `background:${C}`);
  if (err) s += errMsg(DI, LY + LH + 6, '세부 대상 지역을 1개 이상 선택해 주세요.');
  // 발급 미리보기(엑셀에 담길 것 — 선택의 요약 · 실측 집계)
  const PY = LY + LH + (err ? 38 : 18), PH2 = MY + MH - 66 - PY;
  if (err) { s += `<div style="position:absolute;left:${DI}px;top:${PY}px;width:${DIW}px;height:${PH2}px;border:1px dashed ${C}"></div>` + lab(DI + 16, PY + 14, '발급 미리보기') + T(DI + 16, PY + 38, '제목 · 클래스 · 지역을 고르면 엑셀에 담길 내용이 여기 보입니다', 14, G); }
  else {
    const n = pe.reduce((a, e) => a + e.n, 0), ar = pe.reduce((a, e) => a + e.area, 0);
    const unit = t => `<span style="font-family:'Pretendard';font-weight:400;font-size:15px;color:${G};letter-spacing:0;margin-left:6px">${t}</span>`;
    s += div(DI, PY, DIW, PH2, `background:${T1}`) + lab(DI + 16, PY + 12, '발급 미리보기 · 엑셀 1 파일') + D(DI + 16, PY + 38, fmt(n) + unit('필지'), 34, ACC) + D(DI + 16, PY + 84, ha(ar) + unit('ha'), 28) + T(DI + 16, PY + 122, `읍면동 ${pe.length} · 클래스 2`, 14, G);
    s += vl(DI + 196, PY + 14, PH2 - 28, C);
    pe.forEach((e, i) => { const yy = PY + 14 + i * 26; s += T(DI + 212, yy, e.nm, 14.5) + NR(DI + 340, yy + 1, `${fmt(e.n)} 필지`, 14) + stack(DI + 354, yy + 7, 96, 6, e, FARM_EMD[0].area) + NR(DI + DIW - 16, yy + 1, `${fmt(e.area)} ㎡`, 14); });
  }
  s += hl(DX, MY + MH - 56, DW) + bbtn(DI + DIW - 120 - 20 - 84, MY + MH - 46, 84, '취소') + cta(DI + DIW - 120, MY + MH - 46, 120, '발급 요청') + T(DI, MY + MH - 38, err ? '필수 항목 3개가 비어 있습니다' : '접수되면 발급 내역에서 진행 상태를 확인합니다', 14, err ? WARN : G);
  return page(`B7 보고서 · 발급 요청(${err ? '검증 오류' : '폼 + 미리보기'})`, s + FOOT);
}
const REPORTS = [['처리 완료', '2026.04.23 09:48:12', '관리자', 4, '2026년 4월 농지 활용 현황 보고서', '경작지, 비경작지', '남원시 전역', []], ['처리 완료', '2026.04.20 14:12:08', '사용자', 6, '2026년 1분기 농지 활용 종합 보고서', '경작지, 비경작지', '주천면·운봉읍', ['주천면', '운봉읍']], ['처리중', '2026.04.15 16:45:22', '관리자', 0, '2026년 4월 3주차 농지 활용 점검 보고서', '경작지', '도통동·죽항동', ['도통동', '죽항동']], ['처리 실패', '2026.04.11 11:08:40', '사용자', 0, '2026년 4월 상순 농지 활용 현황', '경작지, 비경작지', '금지면·송동면', ['금지면', '송동면']]];
function reportListBody(empty) {
  const hov = REPORTS[1];
  const w = wsRegion(`남원시 · 보고서 발급 내역 · 농지 활용`, empty ? { noLegend: true, only: [], hud: '조건에 맞는 보고서 0 · 지도에 켤 대상 지역이 없습니다', labels: [] } : { noLegend: true, multi: hov[7], only: hov[7], labels: hov[7], hud: `보고서 행에 올리면 그 보고서의 대상 지역이 켜집니다 · ${hov[6]}` });
  let s = w.s + drawerHead('보고서', '농지 활용 보고서 발급 내역', REP_DESC) + REP_TABS('보고서 발급 내역', MY + 108);
  let y = MY + 152;
  s += sel(DI, y, 92, '검색어', '전체') + fld(DI + 98, y + 20, 196, empty ? '<span>해양쓰레기</span>' : `<span style="color:${C}">검색어를 입력하세요.</span>`) + sel(DI + 306, y, 116, '상태', empty ? '처리 실패' : '전체') + T(DI + DIW - 68 - 10 - 46, y + 27, '초기화', 14, G) + bbtn(DI + DIW - 68, y + 20, 68, '검색', 32);
  y += 62; s += lab(DI, y, '발급 일자') + fld(DI, y + 20, 122, `<span class="n" style="color:${C}">YYYY-MM-DD</span>`) + T(DI + 128, y + 26, '~', 14, G) + fld(DI + 144, y + 20, 122, `<span class="n" style="color:${C}">YYYY-MM-DD</span>`);
  let cx = DI + 280; ['전체', '1개월', '3개월', '6개월', '12개월'].forEach((t, i) => { s += chip(cx, y + 24, t, i === 0); cx += tw(t) + 25; });
  y += 66; s += hl(DI, y, DIW, INK) + D(DI, y + 14, '보고서 목록', 18) + T(DI + 104, y + 17, empty ? '전체 <span class="n" style="color:#010102">0</span>건 중 0~0행' : `전체 <span class="n" style="color:#010102">6</span>건 중 1~4행${SIYEON}`, 14, G) + cta(DI + DIW - 76, y + 8, 76, '발급').replace('height:36px', 'height:32px');
  y += 50;
  if (empty) { s += `<div style="position:absolute;left:${DI}px;top:${y}px;width:${DIW}px;height:170px;border:1px dashed ${C}"></div>` + `<div style="position:absolute;left:${DI + 24}px;top:${y + 26}px">${ico('doc', C, 36)}</div>` + D(DI + 76, y + 28, '검색 결과가 없어요.', 20) + T(DI + 76, y + 62, '검색어 “해양쓰레기” · 상태 처리 실패 에 맞는 보고서가 없습니다', 14, G) + T(DI + 76, y + 86, '이 목록은 농지 활용 과제의 보고서만 담습니다(1과제 = 1보고서)', 14, G) + bbtn(DI + 76, y + 122, 116, '조건 초기화', 32); for (let i = 0; i < 2; i++) { const gy = y + 190 + i * 96; s += `<div style="position:absolute;left:${DI}px;top:${gy}px;width:${DIW}px;height:84px;border:1px dashed ${H}"></div>` + div(DI + 16, gy + 16, 64, 10, `background:${H}`) + div(DI + 16, gy + 38, 300, 12, `background:${H}`) + div(DI + 16, gy + 60, 220, 10, `background:#EEEEEE`); } s += pager(DI, MY + MH - 28, DIW, 0, 0, 0, 10, '건', '전체', 1, false); return s; }
  REPORTS.forEach(([st, at, who, dl, title, cls, reg], i) => {
    const yy = y + i * 96, on = i === 1, done = st === '처리 완료', col = st === '처리 실패' ? WARN : done ? TEAL : ACC;
    if (on) s += div(DX + 1, yy, DW - 1, 96, `background:${T1}`) + div(DX + 1, yy, 3, 96, `background:${ACC}`);
    s += T(DI, yy + 10, st, 15, col, 'font-weight:500') + N(DI + 84, yy + 11, at, 14, G) + T(DI + 244, yy + 10, `요청자 ${who}`, 14, G) + T(DI + 344, yy + 10, `다운로드 <span class="n" style="color:${INK}">${dl}</span>회`, 14, G);
    if (done) s += bbtn(DI + DIW - 128, yy + 6, 128, `${ico('download', INK, 14)}엑셀 다운로드`, 30); else if (st === '처리중') s += div(DI + DIW - 128, yy + 20, 128, 2, `background:${H}`) + div(DI + DIW - 128, yy + 20, 70, 2, `background:${ACC}`);
    s += T(DI, yy + 36, title, 16, INK, 'font-weight:500') + T(DI, yy + 64, `<span style="color:${G}">탐지 클래스</span> ${cls}<span style="color:${C}"> · </span><span style="color:${G}">대상 지역</span> <span style="${on ? `color:${ACC};font-weight:500` : ''}">${reg}</span>`, 14) + hl(DI, yy + 96, DIW);
  });
  s += pager(DI, MY + MH - 28, DIW, 6, 1, 4, 10, '건', '전체', 1, false);
  return s;
}
const boardReportList = empty => page(`B7 보고서 · 발급 내역(${empty ? '검색 결과 0' : '목록'})`, reportListBody(empty) + FOOT);
const boardReportPledge = () => page('B7 보고서 · 엑셀 다운로드 = 보안 서약서(처음 열림)', reportListBody(false) + FOOT + pledgeModal('init', { what: '내려받을 보고서 · 엑셀 1 파일', items: [['tile-farm-clean.jpg', '2026년 1분기 농지 활용 종합 보고서', '']], ph: ['예) 농지 활용 현황 점검', '예) 농지 활용 보고서 내부 공유'] }));

// ======================================================================
const BOARDS = {
  'B7-Map-Parallel': boardParallel, 'B7-Map-Region': boardRegion, 'B7-Map-Table': boardTable,
  'B7-Map-Pledge': () => boardPledge('error'), 'B7-Map-Pledge-Busy': () => boardPledge('busy'), 'B7-Map-Download': boardDownload,
  'B7-Map-Empty': boardEmpty, 'B7-Map-Loading': boardLoading, 'B7-Map-Search': boardSearch, 'B7-Map-Search-Empty': boardSearchEmpty,
  'B7-Map-Measure': boardMeasure, 'B7-Map-Draw': boardDraw, 'B7-Map-AOI': boardAOI, 'B7-Map-Basemap': boardBasemap, 'B7-Map-LayerTab': boardLayerTab,
  'B7-Stats-Opt1': boardStatsOpt1, 'B7-Stats-Opt2': boardStatsOpt2, 'B7-Stats-Opt3': boardStatsOpt3, 'B7-Stats-Class': boardStatsClass, 'B7-Stats-Empty': boardStatsEmpty, 'B7-Stats-Find': boardStatsFind,
  'B7-Report-Issue': () => boardReportIssue(false), 'B7-Report-Issue-Error': () => boardReportIssue(true), 'B7-Report-List': () => boardReportList(false), 'B7-Report-List-Empty': () => boardReportList(true), 'B7-Report-Pledge': boardReportPledge,
};
async function main() {
  if (PLATES) { await platesB7(); console.log('plates done — 다시 실행하면 판이 반영됩니다'); if (!EMD.length) return; }
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  for (const [name, fn] of Object.entries(BOARDS)) if (!only.length || only.includes(name)) wr(`${name}.dc.html`, fn());
}
main().catch(e => { console.error(e); process.exit(1); });
