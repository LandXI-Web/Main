// B5 대시보드(뷰어 = LX 직원·결과 열람형) 마스터 생성기 — design-canvas/v2/B5-Dashboard-Viewer.dc.html
// 원본: https://mini531.github.io/namwon-smart-village/landxi7/dashboard3.html (LX 직원 대시보드)
//   기능 1:1 — 공지 스트립 · 권한 부여 AI 분석 결과 최신 3건 탭(JOB-2026-040/043/044) · 결과 지도(+범례·확대/축소·자세한 지도 보기)
//   · 통계(도넛 + 구분/면적 ㎡ 표 + 합계) · 이용 가능한 분석 카드 6/8종 좌우 이동 · 도움 4(공지·FAQ·문의·매뉴얼) · 푸터. 새 기능 0.
// 셸: tools/design/gen-b5.mjs · B5-Dashboard-Data.dc.html(관리자 보드)와 같은 레일 72 · 마스트 64 · H1+파랑 룰 · KPI 띠 · 좌 판 / 우 패널.
// 규칙: design/system.md §1–§5 (Paperlogy/Pretendard/Inter tabular · T3 #006DF7 · 틴트 · radius/shadow/gradient 0 · 글자 바닥 14 · 값마다 단위)
//   색 역할 — 파랑 정보/선택 · 빨강 조치(뷰어에는 조치 항목이 없어 0회) · 검정 본문 · 청록 AI 결과 · 앰버 탐지 순간(0회).
// 데이터: 원본 dashboard3.html RESULTS/CARDS/PERMITTED 만(데모 고정값 = `시연`). 지도 판 = 원본과 같은 V-World Satellite WMTS 실타일(z15) 위에
//   원본 fields 실좌표 폴리곤을 SVG 로 투영(원본 OpenLayers 렌더와 같은 웹메르카토르). 카드 썸네일 = 저장소 실영상(원본 model_*.png 은 저장소에 없음).
// usage: node tools/design/gen-b5-dashboard-viewer.mjs [--plates]   (repo root)
//   --plates 는 V-World 타일을 받아 design-canvas/v2/img/db-vw-{silage,greenhouse,farmland}.jpg 를 굽는다. 없으면 판만 다시 쓴다(멱등).
//   그다음 node design-canvas/v2/render.mjs B5-Dashboard-Viewer → design-canvas/v2/renders/B5-Dashboard-Viewer.png
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'design-canvas/v2');
const imgDir = path.join(dir, 'img');
const PLATES = process.argv.includes('--plates');
const wr = (f, s) => { fs.writeFileSync(path.join(dir, f), s, 'utf8'); console.log('wrote', f, s.length); };

const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', TEAL = '#0FA9A0';
const X0 = 128, CW = 1256, XE = X0 + CW, PAGE_H = 1048;
const fmt = n => Math.round(n).toLocaleString('ko-KR');

// ---------- 원본 데이터 (dashboard3.html RESULTS · 그대로) ----------
const RESULTS = {
  silage: {
    job: 'JOB-2026-040', tab: '2026년 4월 운봉읍 사료작물 생육 현황', jobLabel: '사료작물(생육기) 정사영상', center: [127.531, 35.4305], date: '2026.04',
    classes: [['IRG', 'IRG(생육기)'], ['Rye', '호밀(생육기)'], ['Corn', '옥수수(생육기)'], ['Sudan_Grass', '수단그라스(생육기)']],
    regions: { '운봉읍': { IRG: 32045, Rye: 18220, Corn: 2450, Sudan_Grass: 14380 }, '인월면': { IRG: 12400, Rye: 5100, Corn: 820, Sudan_Grass: 3240 }, '아영면': { IRG: 8200, Rye: 3400, Corn: 0, Sudan_Grass: 1680 }, '산내면': { IRG: 4500, Rye: 1200, Corn: 0, Sudan_Grass: 940 }, '주천면': { IRG: 2100, Rye: 640, Corn: 0, Sudan_Grass: 420 } },
  },
  greenhouse: {
    job: 'JOB-2026-043', tab: '2026년 4월 운봉읍·인월면 비닐하우스 현황 분석', jobLabel: '비닐하우스 정사영상', center: [127.444, 35.392], date: '2026.04',
    classes: [['Greenhouse_Single', '비닐하우스(단동)'], ['Greenhouse_Multi', '비닐하우스(다동)']],
    regions: { '송동면': { Greenhouse_Single: 18420, Greenhouse_Multi: 9320 }, '주생면': { Greenhouse_Single: 12450, Greenhouse_Multi: 5820 }, '수지면': { Greenhouse_Single: 8240, Greenhouse_Multi: 3140 }, '주천면': { Greenhouse_Single: 6320, Greenhouse_Multi: 2640 }, '대강면': { Greenhouse_Single: 4220, Greenhouse_Multi: 1820 }, '금지면': { Greenhouse_Single: 2400, Greenhouse_Multi: 980 } },
  },
  farmland: {
    job: 'JOB-2026-044', tab: '2026년 4월 시 중앙권 농지 활용 현황 분석', jobLabel: '농지 활용 정사영상', center: [127.3669, 35.4014], date: '2026.04',
    classes: [['Cultivated', '경작지'], ['Uncultivated', '비경작지']],
    regions: { '동충동': { Cultivated: 18420, Uncultivated: 5240 }, '죽항동': { Cultivated: 14560, Uncultivated: 8940 }, '금동': { Cultivated: 12340, Uncultivated: 4680 }, '노암동': { Cultivated: 10820, Uncultivated: 6520 }, '조산동': { Cultivated: 8640, Uncultivated: 3120 }, '하정동': { Cultivated: 7240, Uncultivated: 4150 }, '광치동': { Cultivated: 5380, Uncultivated: 2840 }, '신정동': { Cultivated: 3920, Uncultivated: 5640 }, '내척동': { Cultivated: 6720, Uncultivated: 1980 } },
  },
};
const ACTIVE = 'silage';   // 원본 초기 탭 renderResult('silage')
// 원본 fields(실좌표 [lng,lat] 링) — 스크래치 추출본(tools/design/data/dashboard3-fields.json). 없으면 폴리곤 없이 판만.
const FIELDS = (() => { const p = path.join(root, 'tools/design/data/dashboard3-fields.json'); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}; })();

// 원본 CARDS 8 · PERMITTED 6 (isPublic && 권한) — 썸네일은 저장소 실영상으로 대체
const CARDS = [
  ['도로안전 정사영상', '드론 정사영상 · 포트홀·균열·노면 파손', true, true, 'tile-arc-a.jpg'],
  ['도로안전 카메라', '차량 탑재 카메라 · 노면 파손·시설물 이상', true, true, 'pj-road.jpg'],
  ['사료작물(생육기) 탐지', '드론영상 · 사료작물 4종 · 필지 재배면적', true, true, 'tile-ep-2.jpg'],
  ['사료작물(생산기) 탐지', '수확 직전 생산량 · 수확 가능 필지', true, false, ''],
  ['곤포사일리지 탐지', '드론영상 · 위치·개수·보관 상태', true, true, 'crop-farm-6.jpg'],
  ['비닐하우스 탐지', '단동·다동 구분 · 동 수·면적·분포', true, true, 'pj-hero.jpg'],
  ['농지 활용 분석', '다시기 영상 · 경작·비경작 필지 분류', true, true, 'tile-farm-clean.jpg'],
  ['방치 쓰레기 탐지', '도로변·공터 방치 쓰레기 · 불법 투기', false, true, ''],
];
const VISIBLE = CARDS.filter(c => c[2] && c[3]);
const HELP = [['공지사항', '서비스 소식·안내', 'notice'], ['자주 묻는 질문', '자주 찾는 답변', 'faq'], ['문의하기', '1:1 문의 접수', 'mail'], ['사용자 매뉴얼', '이용 가이드 문서', 'doc']];

// ---------- 집계 (원본 classTotals) ----------
const totals = scn => scn.classes.map(([k, label]) => [k, label, Object.values(scn.regions).reduce((a, r) => a + (r[k] || 0), 0)]);
const grand = scn => totals(scn).reduce((a, t) => a + t[2], 0);
const scn = RESULTS[ACTIVE];
const TOT = totals(scn), GRAND = grand(scn);
const LATEST = Object.values(RESULTS).map(r => r.date).sort().at(-1);

// ---------- 웹 메르카토르 · 판 창 (gen-b5-map.mjs 와 같은 수식) ----------
const R = 256, PW = 572, PH = 300, Z = 15;
const merc = (lon, lat, z) => { const n = R * 2 ** z; return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n]; };
const win = key => { const [x, y] = merc(...RESULTS[key].center, Z); return { z: Z, W: PW, H: PH, x0: Math.round(x - PW / 2), y0: Math.round(y - PH / 2) }; };
const mPerPx = lat => 40075016.686 * Math.cos(lat * Math.PI / 180) / (R * 2 ** Z);
function polysIn(fields, w) {
  const out = [];
  for (const f of fields) {
    const pts = f.r.map(([lo, la]) => { const [x, y] = merc(lo, la, w.z); return [x - w.x0, y - w.y0]; });
    if (pts.every(([x]) => x < 0) || pts.every(([x]) => x > w.W) || pts.every(([, y]) => y < 0) || pts.every(([, y]) => y > w.H)) continue;
    out.push({ c: f.c, d: pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('') + 'Z' });
  }
  return out;
}
const VW_KEY = '88CF60F1-99BC-3338-8893-0FE768F13E61';   // 원본 map.js 와 같은 V-World 키
async function plates() {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');
  for (const key of Object.keys(RESULTS)) {
    const w = win(key);
    const tx0 = Math.floor(w.x0 / R), ty0 = Math.floor(w.y0 / R), tx1 = Math.floor((w.x0 + w.W) / R), ty1 = Math.floor((w.y0 + w.H) / R);
    const tiles = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const r = await fetch(`https://api.vworld.kr/req/wmts/1.0.0/${VW_KEY}/Satellite/${w.z}/${ty}/${tx}.jpeg`, { headers: { Referer: 'https://mini531.github.io/' } });
      if (!r.ok) continue;
      tiles.push({ src: 'data:image/jpeg;base64,' + Buffer.from(await r.arrayBuffer()).toString('base64'), dx: tx * R - w.x0, dy: ty * R - w.y0 });
    }
    const data = await page.evaluate(async ({ tiles, W, H }) => {
      const c = document.getElementById('c'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#DDD'; g.fillRect(0, 0, W, H);
      for (const t of tiles) { const im = new Image(); im.src = t.src; try { await im.decode(); g.drawImage(im, t.dx, t.dy, 256, 256); } catch (e) { } }
      return c.toDataURL('image/jpeg', 0.86);
    }, { tiles, W: w.W, H: w.H });
    const buf = Buffer.from(data.split(',')[1], 'base64');
    fs.writeFileSync(path.join(imgDir, `db-vw-${key}.jpg`), buf);
    console.log('plate', key, w.z, tiles.length, 'tiles', buf.length);
  }
  await browser.close();
}

// ---------- 레일 72 — 뷰어(LX 직원)는 원본 STAFF_MENU = 대시보드 · 분석 서비스 · 지도 서비스 · 서비스 지원 · MY (+로그아웃) ----------
const RAIL = (() => {
  const src = fs.readFileSync(path.join(root, 'tools/design/b5-rail.html'), 'utf8').replace(/\r\n/g, '\n');
  const items = src.split('\n<div style="position:absolute;left:0;top:');
  const head = items[0].replace('height:900px', `height:${PAGE_H}px`);
  const keep = { '72px': 72, '246px': 130, '304px': 188, '596px': 712, '770px': 770, '828px': 828 };   // 원 top → 새 top
  const out = [head];
  for (const it of items.slice(1)) {
    const top = it.slice(0, it.indexOf(';'));
    if (!(top in keep)) continue;
    const on = top === '72px';
    let s = it.replace(top, keep[top] + 'px').replace(/<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:#010102"><\/div>\n?/, '').replace(/color:#010102/g, `color:${G}`);
    if (on) s = s.replace(/color:#686868/g, `color:${INK}`).replace('gap:6px">', `gap:6px">\n<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:${INK}"></div>`);
    out.push(s);
  }
  return out.join('\n<div style="position:absolute;left:0;top:') + `\n<div style="position:absolute;left:72px;top:0;width:1px;height:${PAGE_H}px;background:${H}"></div>`;
})();

// ---------- 프리미티브 ----------
const div = (x, y, w, h, extra = '', inner = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">${inner}</div>\n`;
const hl = (x, y, w, col = H) => div(x, y, w, 1, `background:${col}`);
const vl = (x, y, h, col = H) => div(x, y, 1, h, `background:${col}`);
const ICONS = {
  notice: '<path d="M3 3.5h14v9H3z"/><path d="M6 12.5V17"/><path d="M6 7h8M6 9.5h5"/>',
  map: '<path d="M3 5.5 8 3l4 2.5L17 3v11.5L12 17l-4-2.5-5 2.5z"/><path d="M8 3v11.5M12 5.5V17"/>',
  chart: '<path d="M4 16V9M10 16V4M16 16v-6"/>',
  card: '<path d="M3 4h14v12H3z"/><path d="M3 9h14M7 13h4"/>',
  help: '<path d="M3 3h14v14H3z"/><path d="M7.5 8a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5"/><path d="M10 14.5v.1"/>',
  faq: '<path d="M3 3h14v14H3z"/><path d="M6 7.5h8M8.5 12.5h5.5"/><path d="M5.5 11h2v3h-2z"/>',
  mail: '<path d="M3 5h14v10H3z"/><path d="m3 5 7 5.5L17 5"/>',
  doc: '<path d="M5 2h7l4 4v12H5z"/><path d="M12 2v4h4M7 10h6M7 13h6"/>',
  expand: '<path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6"/>',
  plus: '<path d="M10 4v12M4 10h12"/>', minus: '<path d="M4 10h12"/>', chevL: '<path d="M12 4l-6 6 6 6"/>', chevR: '<path d="M8 4l6 6-6 6"/>',
};
const ico = (k, col = INK, sz = 16) => `<svg width="${sz}" height="${sz}" viewBox="0 0 20 20" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="butt" style="flex:none;display:block">${ICONS[k]}</svg>`;
const secHead = (y, icon, title, right = '') => `<div style="position:absolute;left:${X0}px;top:${y}px;width:${CW}px;height:28px;display:flex;align-items:center;gap:12px;color:${G}">${ico(icon, ACC)}<span class="d" style="font-size:18px;color:${INK}">${title}</span><div style="flex:1"></div>${right}</div>\n`;

// ---------- 마스트 64 (원본 공지 스트립 · 기준일) ----------
const mast = `
<div style="position:absolute;left:${X0}px;top:0;width:${CW}px;height:64px;display:flex;align-items:center;gap:12px">
${ico('notice', G)}<span class="chip">공지</span>
<span style="font-size:16px;letter-spacing:-.01em">고위험 탐지 건 긴급 처리 안내</span>
<span class="n" style="font-size:14.5px;color:${G};letter-spacing:.02em">2026.04.15</span>
<span style="font-size:14.5px;color:${G};margin-left:6px">전체 보기 ›</span>
<div style="flex:1"></div>
<span class="mic">기준일 현재</span><span class="n" style="font-size:16px;letter-spacing:.02em;color:${G}">2026.08.26</span>
</div>${hl(72, 64, 1368)}`;

// ---------- H1 + 파랑 룰 ----------
const h1 = `
<div style="position:absolute;left:${X0}px;top:92px;display:flex;align-items:baseline;gap:16px" data-line><div>
<span class="d" style="font-size:34px;line-height:40px">LX 대시보드</span>
<span style="font-size:17px;color:${G};letter-spacing:-.01em;margin-left:14px">권한 부여된 분석 결과와 통계</span></div></div>
${div(X0, 140, 106, 4, `background:${ACC}`)}${hl(X0, 156, CW)}`;

// ---------- KPI 띠 4 — 원본 데이터에서만 유도 (열람 가능 결과 · 이용 가능 카드 · 최근 결과 · 선택 결과 면적) ----------
const KPI = [
  ['열람 가능 분석 결과', '3', '건', `권한 부여 · 최신 3건`],
  ['이용 가능한 분석 카드', String(VISIBLE.length), '종', `전체 ${CARDS.length} · 비공개 ${CARDS.filter(c => !c[2]).length} · 미부여 ${CARDS.filter(c => c[2] && !c[3]).length}`],
  ['최근 분석 결과', LATEST, '', `${RESULTS.farmland.job} · 시 중앙권 농지 활용`],
  ['선택 결과 탐지 면적', fmt(GRAND), '㎡', `${scn.classes.length}종 · ${Object.keys(scn.regions).length}개 읍면 <span class="tag">시연</span>`],
];
const kpi = (() => {
  const w = (CW - 3 * 36) / 4; let s = '';
  KPI.forEach(([lab, n, u, sub], i) => {
    const x = X0 + i * (w + 36);
    s += `<div style="position:absolute;left:${x}px;top:174px;width:${w}px">
<div class="lab">${lab}</div>
<div style="margin-top:8px;display:flex;align-items:baseline;gap:8px"><span class="d" style="font-size:58px;line-height:1;letter-spacing:-.02em;color:${ACC}">${n}</span>${u ? `<span style="font-size:17px;color:${G}">${u}</span>` : ''}</div>
<div class="mic n" style="margin-top:10px;letter-spacing:.02em;white-space:nowrap">${sub}</div></div>\n`;
    if (i) s += vl(x - 18, 174, 104);
  });
  return s + hl(X0, 302, CW);
})();

// ---------- 결과 탭 3 (원본 rtab-bar) ----------
const tabs = (() => {
  let s = `<div style="position:absolute;left:${X0}px;top:326px;width:${CW}px;height:28px;display:flex;align-items:center;gap:1px">`;
  for (const [k, r] of Object.entries(RESULTS)) {
    const on = k === ACTIVE;
    s += `<div style="height:28px;line-height:26px;padding:0 12px;font-size:14.5px;letter-spacing:-.01em;white-space:nowrap;border:1px solid ${on ? ACC : H};background:${on ? T1 : '#FFFFFF'};color:${on ? ACC : G};display:flex;gap:8px;align-items:baseline">${r.tab}<span class="n" style="font-size:14px;letter-spacing:.02em;color:${on ? ACC : C}">${r.job}</span></div>`;
  }
  s += `</div>\n`;
  return s;
})();

// ---------- 좌 판 572×300 — V-World z15 실타일 + 원본 폴리곤(청록 = AI 결과) + 범례 · 확대/축소 · 자세한 지도 보기 ----------
const TEALS = [TEAL, '#0B6E69', '#7FD3CD', '#C6EAE7'];   // 청록 램프 = AI 결과 클래스(원본 4색은 시스템 밖)
const clsColor = k => TEALS[scn.classes.findIndex(c => c[0] === k)] || TEAL;
const plate = (() => {
  const w = win(ACTIVE);
  const ps = polysIn(FIELDS[ACTIVE] || [], w);
  const paths = ps.map((p, i) => { const col = p.c ? clsColor(p.c) : TEALS[i % scn.classes.length]; return `<path d="${p.d}" fill="${col}" fill-opacity=".55" stroke="${col}" stroke-width="1.2"/>`; }).join('');
  const scaleM = 200, scalePx = Math.round(scaleM / mPerPx(scn.center[1]));
  const legend = scn.classes.map(([k, label]) => `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><span style="width:10px;height:10px;display:inline-block;background:${clsColor(k)};border:1px solid #FFF;flex:none"></span>${label}</div>`).join('');
  return `<div class="plate" style="position:absolute;left:${X0}px;top:366px;width:${PW}px;height:${PH}px;overflow:hidden;background:${INK}">
<img src="db-vw-${ACTIVE}.jpg" alt="" style="width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.8) contrast(1.04)">
<svg style="position:absolute;left:0;top:0" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}">${paths}</svg>
<div style="position:absolute;left:12px;top:12px;display:flex;align-items:center;gap:8px"><div style="height:24px;line-height:22px;padding:0 10px;font-size:14px;letter-spacing:-.01em;white-space:nowrap;border:1px solid #FFFFFF;background:#FFFFFF;color:${INK};display:flex;align-items:center;gap:6px">${ico('map', ACC, 14)}AI 분석 결과</div><span class="hud"><span style="color:${TEAL}">${ps.length}</span> 필지<span class="tag" style="border-color:rgba(255,255,255,.6);color:#FFF">시연</span></span></div>
<div style="position:absolute;right:12px;top:12px;height:24px;line-height:22px;padding:0 10px;font-size:14px;letter-spacing:-.01em;white-space:nowrap;border:1px solid #FFFFFF;background:rgba(1,1,2,.35);color:#FFFFFF;display:flex;align-items:center;gap:6px">${ico('expand', '#FFFFFF', 13)}자세한 지도 보기 ›</div>
<div style="position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column"><div style="width:26px;height:26px;background:#FFFFFF;display:flex;align-items:center;justify-content:center">${ico('plus', INK, 13)}</div><div style="width:26px;height:26px;background:#FFFFFF;border-top:1px solid ${H};display:flex;align-items:center;justify-content:center">${ico('minus', INK, 13)}</div></div>
<div class="hud" style="position:absolute;left:52px;bottom:14px;display:flex;align-items:flex-end;gap:6px"><div style="width:${scalePx}px;height:5px;border:1px solid #FFF;border-top:0"></div>${scaleM} m · z${Z}</div>
<div style="position:absolute;right:12px;bottom:10px;display:flex;flex-direction:column;gap:3px;font-size:14px;line-height:14px;color:#FFFFFF;letter-spacing:-.01em"><div class="hud" style="margin-bottom:2px">${scn.jobLabel}</div>${legend}</div>
</div>\n`;
})();

// ---------- 우 통계 648×300 — 합계 큰 수 + 스택 바(dashboard.html 스토리지 S 스타일) + 구분×읍면 표(㎡) ----------
const stats = (() => {
  const X = 736, W = 648, Y = 366;
  let s = div(X, Y, W, PH, `border:1px solid ${H}`);
  s += `<div style="position:absolute;left:${X}px;top:${Y}px;width:${W}px;height:28px;background:${T1};display:flex;align-items:center;gap:10px;padding:0 12px">${ico('chart', ACC, 15)}<span class="d" style="font-size:15.5px">통계</span><span class="mic">구분 · 읍면별 면적</span><div style="flex:1"></div><span class="mic n">단위 ㎡</span></div>\n`;
  // 합계 + 스택 바
  s += `<div style="position:absolute;left:${X + 16}px;top:${Y + 40}px;display:flex;align-items:baseline;gap:8px"><span class="d" style="font-size:34px;line-height:1;letter-spacing:-.02em;color:${ACC}">${fmt(GRAND)}</span><span style="font-size:14px;color:${G}">㎡ 합계</span></div>\n`;
  let x = X + 16; const BW = W - 32, BY = Y + 84;
  TOT.forEach(([k, label, v], i) => { const bw = BW * v / GRAND; s += div(x, BY, bw, 20, `background:${clsColor(k)};border-right:1px solid #FFF`); x += bw; });
  s += `<div class="n" style="position:absolute;left:${X + 16}px;top:${BY + 28}px;width:${BW}px;display:flex;gap:14px;font-size:14px;color:${G};letter-spacing:.02em;white-space:nowrap">${TOT.map(([k, label, v]) => `<span style="display:flex;align-items:center;gap:5px"><i style="width:10px;height:10px;background:${clsColor(k)};display:inline-block"></i>${label.replace(/\(.*\)/, '')} <b style="font-weight:400;color:${INK}">${(v / GRAND * 100).toFixed(1)}</b>%</span>`).join('')}</div>\n`;
  // 표: 행 = 구분(클래스) · 열 = 읍면 + 합계
  const regs = Object.keys(scn.regions);
  const TY = BY + 58, RH = 24, c0 = 148, cw = (BW - c0) / (regs.length + 1);
  s += `<div class="n" style="position:absolute;left:${X + 16}px;top:${TY}px;width:${BW}px;height:${RH}px;display:flex;align-items:center;font-size:14px;color:${G};letter-spacing:.02em;border-bottom:1px solid ${INK}"><span style="width:${c0}px;font-family:Pretendard,system-ui,sans-serif;letter-spacing:-.01em">구분</span>${regs.map(r => `<span style="width:${cw}px;text-align:right;font-family:Pretendard,system-ui,sans-serif;letter-spacing:-.01em">${r}</span>`).join('')}<span style="width:${cw}px;text-align:right;font-family:Pretendard,system-ui,sans-serif;letter-spacing:-.01em;color:${INK}">면적(㎡)</span></div>\n`;
  TOT.forEach(([k, label, v], i) => {
    s += `<div class="n" style="position:absolute;left:${X + 16}px;top:${TY + RH * (i + 1)}px;width:${BW}px;height:${RH}px;display:flex;align-items:center;font-size:14.5px;color:${INK};letter-spacing:.01em;border-bottom:1px solid ${H}"><span style="width:${c0}px;font-family:Pretendard,system-ui,sans-serif;letter-spacing:-.01em;display:flex;align-items:center;gap:6px"><i style="width:9px;height:9px;background:${clsColor(k)};display:inline-block"></i>${label}</span>${regs.map(r => { const n = scn.regions[r][k] || 0; return `<span style="width:${cw}px;text-align:right;color:${n ? INK : C}">${n ? fmt(n) : '–'}</span>`; }).join('')}<span style="width:${cw}px;text-align:right;color:${ACC}">${fmt(v)}</span></div>\n`;
  });
  const ry = TY + RH * (TOT.length + 1);
  s += `<div class="n" style="position:absolute;left:${X + 16}px;top:${ry}px;width:${BW}px;height:${RH}px;display:flex;align-items:center;font-size:14.5px;color:${INK};letter-spacing:.01em"><span style="width:${c0}px;font-family:Pretendard,system-ui,sans-serif;letter-spacing:-.01em;color:${G}">합계</span>${regs.map(r => `<span style="width:${cw}px;text-align:right">${fmt(Object.values(scn.regions[r]).reduce((a, b) => a + b, 0))}</span>`).join('')}<span style="width:${cw}px;text-align:right;font-weight:500">${fmt(GRAND)}</span></div>\n`;
  return s;
})();

// ---------- 지도 기반 AI 분석 서비스 — 이용 가능 카드 6/8 (이미지 카드 · 좌우 이동) ----------
const cards = (() => {
  const Y = 698, CY = 736, n = VISIBLE.length, gap = 16, cw = (CW - gap * (n - 1)) / n, ih = 112;
  const nav = `<div style="display:flex"><div style="width:26px;height:26px;border:1px solid ${H};display:flex;align-items:center;justify-content:center">${ico('chevL', C, 14)}</div><div style="width:26px;height:26px;border:1px solid ${H};border-left:0;display:flex;align-items:center;justify-content:center">${ico('chevR', C, 14)}</div></div>`;
  let s = hl(X0, 686, CW) + secHead(Y, 'card', '지도 기반 AI 분석 서비스', `<span class="mic n">이용 가능 <span style="color:${INK}">${n}</span> / ${CARDS.length}종 · 카드 → XI맵</span><div style="width:12px"></div>${nav}`);
  VISIBLE.forEach(([name, sub, , , thumb], i) => {
    const x = X0 + i * (cw + gap);
    s += `<div style="position:absolute;left:${x}px;top:${CY}px;width:${cw}px;height:${ih + 62}px;border:1px solid ${H}">
<div style="position:absolute;left:0;top:0;width:${cw - 2}px;height:${ih}px;overflow:hidden;background:${INK}"><img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.85)"><span class="n" style="position:absolute;left:8px;top:8px;font-size:14px;color:#FFFFFF;letter-spacing:.06em;text-shadow:0 0 3px rgba(1,1,2,.9)">0${i + 1}</span></div>
<div style="position:absolute;left:10px;top:${ih + 9}px;right:10px;font-size:15.5px;font-weight:500;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${INK}">${name}</div>
<div class="mic" style="position:absolute;left:10px;top:${ih + 33}px;right:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div></div>\n`;
  });
  return s;
})();

// ---------- 도움이 필요하신가요 — 4 링크 ----------
const help = (() => {
  const Y = 928, n = 4, gap = 16, w = (CW - gap * (n - 1)) / n;
  let s = hl(X0, 916, CW);
  HELP.forEach(([name, sub, icon], i) => {
    const x = X0 + i * (w + gap);
    s += `<div style="position:absolute;left:${x}px;top:${Y}px;width:${w}px;height:48px;border:1px solid ${H};display:flex;align-items:center;gap:10px;padding:0 12px">${ico(icon, ACC, 15)}<span class="d" style="font-size:15.5px;white-space:nowrap">${name}</span><span class="mic" style="white-space:nowrap">${sub}</span><div style="flex:1"></div><span class="mic">›</span></div>\n`;
  });
  return s;
})();

// ---------- 푸터 ----------
const foot = `${hl(72, 1014, 1368)}<div class="mic" style="position:absolute;left:${X0}px;top:1022px;white-space:nowrap">LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부</div>
<div style="position:absolute;left:640px;top:1021px;width:744px;display:flex;align-items:center;justify-content:flex-end;gap:12px">
<div class="mic" style="color:${C};white-space:nowrap">색 역할 — <span style="color:${ACC}">파랑</span> 정보/선택 · 검정 본문 · <span style="color:${TEAL}">청록</span> AI 결과 · 조치 항목 없음(빨강 0)</div>
<div class="chip">Family Site ▾</div></div>\n`;

const HELMET = `<helmet><style>
@font-face{font-family:"Paperlogy";font-weight:800;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2") format("woff2")}
@font-face{font-family:"Paperlogy";font-weight:700;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2") format("woff2")}
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
*{box-sizing:border-box}
body{margin:0;background:#FFFFFF;color:#010102;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;font-weight:400;font-size:18px;line-height:1.6;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.01em}
.n{font-family:'Inter',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.lab{font-size:14px;line-height:1.2;color:#686868;letter-spacing:.04em}
.mic{font-size:14px;line-height:1.35;color:#686868}
.chip{height:24px;line-height:22px;padding:0 9px;border:1px solid #DDDDDD;color:#686868;font-size:14px;white-space:nowrap;display:inline-block}
.tag{border:1px dotted #CCCCCC;padding:0 5px;font-size:14px;line-height:18px;color:#686868;margin-left:5px;display:inline-block;vertical-align:1px;font-family:'Pretendard',system-ui,sans-serif;letter-spacing:0}
.hud{font-family:'Inter','Pretendard',system-ui,sans-serif;font-size:14px;letter-spacing:.04em;color:#FFFFFF;white-space:nowrap;text-shadow:0 0 2px rgba(1,1,2,.9),0 0 6px rgba(1,1,2,.7)}
[data-line]{clip-path:inset(-5px 0px);overflow:clip;display:block}
@keyframes lineIn{from{transform:translateY(20px)}to{transform:translateY(0)}}
@keyframes plateIn{from{clip-path:inset(100% 0 0)}to{clip-path:inset(0)}}
.in [data-line]>*{animation:lineIn 600ms cubic-bezier(.15,1,.3,1) both}
.in .plate img{animation:plateIn 1000ms cubic-bezier(.15,1,.3,1) both}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></helmet>`;

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
${HELMET}
<div style="width:1440px;height:${PAGE_H}px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;color:#010102">
<!-- ══ 뷰어(LX 직원) 대시보드 — 원본 dashboard3.html 1:1 · 관리자 보드(B5-Dashboard-Data)와 같은 셸 · 파리티 docs/superpowers/proto/2026-08-26-dashboard-parity.md § 뷰어 ══ -->
${RAIL}
${mast}
${h1}
${kpi}
${tabs}
${plate}
${vl(712, 326, 340)}
${stats}
${cards}
${help}
${foot}
</div>
</x-dc>
</body>
</html>
`;

if (PLATES) await plates();
wr('B5-Dashboard-Viewer.dc.html', html);
