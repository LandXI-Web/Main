import fs from 'node:fs';
// B5-DataMgmt 아트보드 생성기 — rail2.html(B3 레일 발췌) · gh-path/ch-path(실좌표 SVG 경로)는 스크래치에서 만들었다. 재생성 시 S 경로를 맞출 것.
const S = process.env.B5_SCRATCH || '.';
const rail = fs.readFileSync(S + '/rail2.html', 'utf8');
const GH = fs.readFileSync(S + '/gh-path.txt', 'utf8');
const CH = fs.readFileSync(S + '/ch-path.txt', 'utf8');
const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', AMB = '#FFB633';
const TW = 240, TH = 147, COLS = [128, 380, 632, 884, 1136], ROWS = [140, 320, 500, 680];

const br = (w, h, color, k = 12, sw = 1) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block;pointer-events:none"><path d="M0 ${k}V0h${k}M${w - k} 0h${k}v${k}M${w} ${h - k}v${k}h-${k}M${k} ${h}H0v-${k}" fill="none" stroke="${color}" stroke-width="${sw}"/></svg>`;
const ticks = (done, fail, onWhite) => {
  const on = onWhite ? INK : '#FFFFFF', off = onWhite ? INK : 'rgba(255,255,255,.75)';
  let s = '<div style="position:absolute;right:8px;top:8px;display:flex;gap:4px">';
  for (let i = 1; i <= 4; i++) {
    const f = i <= done ? on : (i === fail ? AMB : 'none');
    s += `<div style="width:9px;height:9px;background:${f};border:1px solid ${i === fail ? AMB : (i <= done ? on : off)}"></div>`;
  }
  return s + '</div>';
};
const shelf = (state, actions) => `<div style="position:absolute;left:0;right:0;bottom:0;height:18px;background:${INK};display:flex;align-items:center;padding:0 8px;gap:8px">
<div class="n" style="font-size:9px;letter-spacing:.06em;color:#FFFFFF;white-space:nowrap">${state}</div>
<div class="n" style="font-size:9px;letter-spacing:.02em;color:rgba(255,255,255,.72);margin-left:auto;white-space:nowrap">${actions.join(' · ')}</div></div>`;
const word = (t, dark) => `<div class="n" style="position:absolute;left:8px;top:8px;font-size:9px;letter-spacing:.08em;color:${dark ? '#FFFFFF' : G};white-space:nowrap">${t}</div>`;
const stepLabel = (t) => `<div class="n" style="position:absolute;left:8px;bottom:7px;font-size:9px;letter-spacing:.06em;color:#FFFFFF;white-space:nowrap">${t}</div>`;
const demo = (dark) => `<span class="n" style="border:1px dotted ${dark ? 'rgba(255,255,255,.5)' : C};color:${dark ? 'rgba(255,255,255,.7)' : C};padding:0 3px;font-size:8px;letter-spacing:.06em">시연</span>`;

function cap(name, meta, opts = {}) {
  const c = opts.dim ? C : INK, m = opts.dim ? C : G;
  let s = `<div class="n" style="margin-top:7px;font-size:11px;line-height:14px;letter-spacing:-.005em;display:flex;gap:0;color:${c}"><span style="flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span><span style="flex:none;white-space:nowrap;color:${m}">&nbsp;· ${meta}</span></div>`;
  if (opts.sub) s += `<div class="n" style="font-size:10.5px;line-height:13px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${INK}"><span style="color:${AMB}">■</span> ${opts.sub}</div>`;
  return s;
}
function tile(col, row, inner, caption) {
  return `<div style="position:absolute;left:${COLS[col]}px;top:${ROWS[row]}px;width:${TW}px">
<div style="position:relative;width:${TW}px;height:${TH}px;overflow:hidden;background:#FFFFFF">${inner}</div>${caption}</div>
`;
}
const img = (src, style = '') => `<img src="${src}" alt="" style="position:absolute;left:0;top:0;width:${TW}px;height:${TH}px;object-fit:cover;display:block;${style}">`;
const reveal = (src, pct, live) => `${img(src, `filter:grayscale(1);opacity:${live ? '.30' : '.18'}`)}
<div style="position:absolute;left:0;top:0;width:${TW}px;height:${TH}px;clip-path:inset(0 ${100 - pct}% 0 0);${live ? '' : 'opacity:.5;filter:grayscale(.5)'}">${img(src)}</div>
<div style="position:absolute;top:0;left:${(TW * pct / 100).toFixed(1)}px;width:1px;height:${TH}px;background:${live ? ACC : C}"></div>`;
const whiteBox = (dashed) => `<div style="position:absolute;inset:0;border:1px ${dashed ? 'dashed' : 'solid'} ${dashed ? C : H}"></div>`;
const tree = (color) => `<div class="n" style="position:absolute;left:12px;top:26px;font-size:9.5px;line-height:15px;letter-spacing:.01em;color:${color};white-space:pre">camera_org_202604/
├ 20260412/
│  ├ DJI_0001.JPG
│  ├ DJI_0002.JPG
│  └ … 4,820장
└ index.csv</div>`;

const T = [];
// Row 1 — 데이터 업로드
T.push(tile(0, 0, `${whiteBox(true)}
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px">
<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter"><path d="M11 2v13M5.5 9.5 11 15l5.5-5.5"/><path d="M3 19.25h16"/></svg>
<div style="font-size:13px;letter-spacing:-.014em;color:${INK}">끌어다 놓거나 클릭</div>
<div class="n" style="font-size:9.5px;letter-spacing:.03em;color:${G}">최대 1 TB · ECW TIF ZIP SHP XLSX</div></div>`,
  cap('업로드', '검증 3 — 허용 형식 · 1 TB 한도 · 파일 없음')));
T.push(tile(1, 0, `${reveal('tile-up-live.jpg', 62, true)}${word('업로드', true)}${shelf(`업로드중 <span style="color:${ACC}">62%</span>`, ['일시정지', '업로드 취소', '세부 정보'])}`,
  cap('NW_ortho_정사영상_202604_section_C_v3.tif', '2026.04.10 · 55.4 GB')));
T.push(tile(2, 0, `${reveal('tile-up-pause.jpg', 41, false)}${word('업로드', true)}${shelf('일시정지 41%', ['재개', '업로드 취소', '세부 정보'])}`,
  cap('NW_ortho_202604_section_D.tif', '2026.04.10 · 41.2 GB', { dim: true })));
T.push(tile(3, 0, `${reveal('tile-up-abort.jpg', 34, false)}${word('업로드', true)}${shelf('중단됨 34%', ['이어 올리기', '업로드 취소', '세부 정보'])}`,
  cap('남원시_산내면_4월_드론촬영_정사영상_권역A.ecw', '2026.04.09 · 60.2 GB', { dim: true })));
T.push(tile(4, 0, `${whiteBox(false)}${tree(C)}${word('업로드', false)}${shelf('대기중 0%', ['업로드 취소', '세부 정보'])}`,
  cap('camera_org_202604.zip', '대기 3건 중 1 · 4,820장', { dim: true })));

// Row 2 — 업로드 완료
T.push(tile(0, 1, `${img('tile-done-x.jpg')}${br(TW, TH, INK, 14, 1)}${word('완료 · 아카이빙 1회', true)}${shelf('선택', ['지도 레이어 발행 ›'])}`,
  cap('NW_ortho_202604_zone_X.ecw', '2026.04.12 · 47.6 GB')));
T.push(tile(1, 1, `${whiteBox(false)}
<table class="n" style="position:absolute;left:10px;top:30px;width:220px;border-collapse:collapse;font-size:8.5px;line-height:17px;letter-spacing:0;color:${INK}">
<tr style="color:${G};border-bottom:1px solid ${INK}"><td>pnu</td><td>emd</td><td>cls</td><td style="text-align:right">area</td></tr>
<tr style="border-bottom:1px solid ${H}"><td>4519025022…0001</td><td>사매면</td><td>경작</td><td style="text-align:right">1,284</td></tr>
<tr style="border-bottom:1px solid ${H}"><td>4519025022…0007</td><td>사매면</td><td>비경작</td><td style="text-align:right">612</td></tr>
<tr style="border-bottom:1px solid ${H}"><td>4519025023…0012</td><td>사매면</td><td>경작</td><td style="text-align:right">2,031</td></tr>
<tr style="color:${G}"><td colspan="4">… 2,098행</td></tr></table>${word('완료 · 아카이빙 0회', false)}
<div style="position:absolute;right:8px;top:8px">${demo(false)}</div>`,
  cap('농지이용_행정정보_202604.xlsx', '2026.04.09 · 287.3 KB')));
T.push(tile(2, 1, `${whiteBox(false)}<svg width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}" style="position:absolute;left:0;top:0;display:block"><path d="${CH}" fill="none" stroke="${INK}" stroke-width=".7" stroke-linejoin="miter"/></svg>${word('완료 · 아카이빙 0회', false)}
<div class="n" style="position:absolute;right:8px;bottom:7px;font-size:9px;letter-spacing:.06em;color:${G}">EPSG:5186 · 456 polygon</div>`,
  cap('NW_change_2504_2506.shp', '2026.06.20 · 48.2 MB')));
T.push(tile(3, 1, `${img('tile-done-ecw.jpg')}${word('완료 · 아카이빙 1회', true)}`,
  cap('남원_운봉_드론_4월.ecw', '2026.04.08 · 62.7 GB')));
T.push(tile(4, 1, `${img('tile-done-2.jpg')}${word('완료 · 아카이빙 0회', true)}`,
  cap('NW_ortho_202604_section_A.tif', '2026.04.10 · 58.3 GB')));

// Row 3 — 레이어 발행중
T.push(tile(0, 2, `${img('tile-pub-1.jpg')}${ticks(2, 0, false)}${word('발행중', true)}${stepLabel('2/4 공간정보 분석')}`,
  cap('NW_road_defect_labels_202604.shp', '2026.06.20 · 48.2 MB')));
T.push(tile(1, 2, `${whiteBox(false)}<svg width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}" style="position:absolute;left:0;top:0;display:block"><path d="${GH}" fill="none" stroke="${INK}" stroke-width=".7"/></svg>${ticks(1, 2, true)}${br(TW, TH, AMB, 14, 1)}${word('발행중 · 실패', false)}
<div class="n" style="position:absolute;right:8px;top:23px;font-size:9px;letter-spacing:.06em;color:${G}">EPSG 없음 · 53 polygon</div>${shelf('실패 1/4 파일 확인', ['좌표계 지정', '발행 취소', '세부 정보'])}`,
  cap('NW_greenhouse_labels_202603.shp', '2026.06.18 · 39.4 MB', { sub: '좌표체계 정보를 확인할 수 없습니다. 좌표계를 지정해 다시 발행해 주세요.' })));
T.push(tile(2, 2, `${img('tile-pub-3.jpg')}${ticks(3, 0, false)}${word('발행중', true)}${stepLabel('3/4 지도 데이터 변환')}`,
  cap('kuksan_change_a68_a71.tif', '2026.05.02 · 12.9 GB')));
T.push(tile(3, 2, `${img('tile-pub-4.jpg')}${ticks(1, 0, false)}${word('발행중', true)}${stepLabel('1/4 파일 확인')}`,
  cap('kuksan_ortho_202605_a71.tif', '2026.05.02 · 14.1 GB')));
T.push(tile(4, 2, `${img('tile-pub-5.jpg')}${ticks(4, 0, false)}${word('발행중', true)}${stepLabel('4/4 레이어 발행')}`,
  cap('NW_farmland_2025_polygons.shp', '2026.05.30 · 61.0 MB')));

// Row 4 — 아카이브
T.push(tile(0, 3, `${img('tile-arc-a.jpg')}${word('아카이브 · 정사영상 · 표시', true)}${shelf('표시', ['숨김', '공유', '공간 편집', '삭제', '상세'])}`,
  cap('남원 정사영상 2026-04 A구역', '2026.04.10 · 1.08 cm')));
T.push(tile(1, 3, `<div style="position:absolute;inset:0;opacity:.34">${img('tile-arc-hid.jpg')}</div>${word('아카이브 · 정사영상 · 숨김', false)}${shelf('숨김 — 삭제 아님', ['표시', '공유', '공간 편집', '삭제', '상세'])}`,
  cap('운봉읍 드론 정사영상 2026-04', '2026.04.08 · 1.69 cm', { dim: true })));
T.push(tile(2, 3, `${whiteBox(true)}
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px">
<div style="font-size:11px;letter-spacing:-.01em;color:${G}">미리보기 없음</div>
<div class="n" style="font-size:9px;letter-spacing:.04em;color:${C}">좌표계 없음 · 판에 세우지 않는다</div></div>${word('아카이브 · 공간정보 · 표시', false)}`,
  cap('남원 도로파손 라벨 셰입 2026-04', '2026.06.20 · 48.2 MB')));
T.push(tile(3, 3, `${whiteBox(false)}${tree(INK)}${word('아카이브 · 이미지셋 · 표시', false)}`,
  cap('순찰차량 도로영상 2026-04', '2026.04.12 · 4,820장')));
T.push(tile(4, 3, `${img('tile-arc-yeosu.jpg')}${word('아카이브 · 정사영상 · 표시', true)}`,
  cap('여수 해양쓰레기 조사 2026', '2026 · 드론')));

// ---------- 셸 ----------
const chip = (t, n) => `<div style="display:flex;align-items:baseline;gap:6px;border:1px solid ${INK};padding:6px 10px 6px;font-size:12px;letter-spacing:-.014em;color:${INK};white-space:nowrap">${t}<span class="n" style="font-size:11px;color:${G}">${n}</span></div>`;
const dd = (t) => `<div style="display:flex;align-items:center;gap:8px;border:1px solid ${H};padding:6px 10px;font-size:12px;letter-spacing:-.014em;color:${G};white-space:nowrap">${t}<svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="${G}" stroke-width="1.25"><path d="M.5.5 4.5 5 8.5.5"/></svg></div>`;

const head = `
<div style="position:absolute;left:128px;top:19px;display:flex;align-items:baseline;gap:14px">
<div class="d" style="font-size:21px;line-height:26px;letter-spacing:-.02em">데이터 관리</div>
<div class="n" style="font-size:11px;letter-spacing:.02em;color:${G}">25건 · 업로드 6 · 완료 8 · 발행중 7 · 아카이브 4 — 원본 4탭을 한 그리드에 · 20 표시, 나머지는 스크롤</div></div>
<div style="position:absolute;right:56px;top:0;height:64px;display:flex;align-items:center;gap:14px">
<div style="display:flex;align-items:baseline;gap:3px"><div class="n" style="font-size:64px;line-height:64px;letter-spacing:-.03em;color:${INK}">96</div><div class="n" style="font-size:18px;color:${G}">%</div></div>
<div style="display:flex;flex-direction:column;gap:4px">
<div class="n" style="font-size:10px;letter-spacing:.1em;color:${G}">내 디스크 사용량 · ${demo(false)}</div>
<div class="n" style="font-size:11px;letter-spacing:.02em;color:${INK}">1,965.0 / 2,048.0 GB · 잔여 83.0 GB</div>
<div style="font-size:11px;letter-spacing:-.01em;color:${INK};border-bottom:1px solid ${INK};align-self:flex-start">디스크 증량 신청 ›</div></div></div>
<div style="position:absolute;left:72px;top:64px;width:1368px;height:1px;background:${H}"></div>

<div style="position:absolute;left:128px;top:80px;width:820px;height:28px;display:flex;align-items:center;gap:8px">
${chip('데이터 업로드', 6)}${chip('업로드 완료', 8)}${chip('레이어 발행중', 7)}${chip('아카이브', 4)}
${dd('형식 · 전체')}${dd('유형 · 전체')}
<div style="display:flex;align-items:center;gap:8px;width:150px;border-bottom:1px solid ${INK};padding-bottom:5px;margin-left:8px">
<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="${G}" stroke-width="1.25"><circle cx="6.2" cy="6.2" r="4.6"/><path d="M9.6 9.6 13 13"/></svg>
<div style="font-size:11.5px;color:${C};letter-spacing:-.01em;white-space:nowrap">파일명 · 데이터명</div></div>
<div style="margin-left:auto;display:flex;align-items:center;gap:12px">
<div style="display:flex">
<div style="width:26px;height:26px;background:${INK};display:flex;align-items:center;justify-content:center"><svg width="12" height="12" viewBox="0 0 12 12" fill="#FFFFFF"><rect x="0" y="0" width="5" height="5"/><rect x="7" y="0" width="5" height="5"/><rect x="0" y="7" width="5" height="5"/><rect x="7" y="7" width="5" height="5"/></svg></div>
<div style="width:26px;height:26px;border:1px solid ${H};border-left:0;display:flex;align-items:center;justify-content:center"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${G}" stroke-width="1.25"><path d="M0 2h12M0 6h12M0 10h12"/></svg></div></div></div></div>
<div style="position:absolute;left:128px;top:124px;width:1256px;height:1px;background:${H}"></div>
`;

const foot = `
<div style="position:absolute;left:128px;top:862px;width:1256px;height:1px;background:${H}"></div>
<div style="position:absolute;left:128px;top:874px;display:flex;gap:18px;align-items:baseline">
<div style="font-size:10px;color:${G}">개인정보처리방침</div><div style="font-size:10px;color:${G}">이용약관</div><div style="font-size:10px;color:${G}">이메일주소무단수집거부</div>
<div class="n" style="font-size:10px;letter-spacing:.02em;color:${C}">(우)54870 전북 전주시 덕진구 기지로 120 · 고객센터 063-713-1213, 1216</div>
<div style="font-size:10px;color:${G};display:flex;align-items:center;gap:6px">Family Site<svg width="8" height="5" viewBox="0 0 9 6" fill="none" stroke="${G}" stroke-width="1.25"><path d="M.5.5 4.5 5 8.5.5"/></svg></div></div>
`;

// ---------- 드로어(발행 폼 + 공유 권한 표) ----------
const field = (label, value, req, dropdown) => `<div style="display:flex;align-items:baseline;gap:12px;padding:11px 0 10px;border-bottom:1px solid ${H}">
<div class="n" style="width:78px;flex:none;font-size:10px;letter-spacing:.06em;color:${G}">${label}${req ? ` <span style="color:${INK}">*</span>` : ''}</div>
<div style="flex:1;font-size:12.5px;letter-spacing:-.01em;color:${INK};display:flex;align-items:center;justify-content:space-between">${value}${dropdown ? `<svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="${INK}" stroke-width="1.25"><path d="M.5.5 4.5 5 8.5.5"/></svg>` : ''}</div></div>`;
const seg = (sel) => ['권한 없음', '뷰어', '편집'].map(o => `<span style="${o === sel ? `color:${INK};border-bottom:1px solid ${INK}` : `color:${C}`};margin-left:10px">${o}</span>`).join('');
const permRow = (org, sel) => `<div style="display:flex;align-items:baseline;padding:10px 0 9px;border-bottom:1px solid ${H}"><div style="flex:1;font-size:12px;letter-spacing:-.01em;color:${INK}">${org}</div><div class="n" style="font-size:10.5px;letter-spacing:.02em">${seg(sel)}</div></div>`;

const drawer = `
<div style="position:absolute;left:960px;top:64px;width:480px;height:836px;background:#FFFFFF;border-left:1px solid ${INK};z-index:20;padding:26px 32px 0">
<div class="n" style="font-size:10px;letter-spacing:.1em;color:${G}">업로드 완료 → 지도 레이어 발행</div>
<div class="d" style="font-size:21px;line-height:26px;letter-spacing:-.02em;margin-top:6px">지도 레이어 발행</div>
<div class="n" style="font-size:11px;letter-spacing:.01em;color:${G};margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">NW_ortho_202604_zone_X.ecw · 47.6 GB · 2026.04.12 · 아카이빙 1회 ${demo(false)}</div>
<div style="position:relative;width:416px;height:200px;margin-top:18px;overflow:hidden;background:#010102"><img src="tile-done-x.jpg" alt="" style="width:100%;height:100%;object-fit:cover;display:block">${br(416, 200, '#FFFFFF', 14, 1)}
<div class="n" style="position:absolute;left:10px;bottom:8px;font-size:9.5px;letter-spacing:.05em;color:#FFFFFF">127.3481,35.5276 ~ 127.3567,35.5347 · EPSG:5186 → 4326 · GSD 1.69 cm</div>
<div class="n" style="position:absolute;right:10px;top:8px;font-size:8px;letter-spacing:.06em;color:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.5);padding:0 3px">측정</div></div>
<div style="margin-top:14px">
${field('발행 유형', '정사영상 레이어', true, true)}
${field('기준 일자', '<span class="n">2026.04.12</span>', true, false)}
${field('데이터명', '남원 정사영상 2026-04 X권역', true, false)}
${field('출처', 'LX · 드론', false, false)}
${field('설명', '권역 X 정사영상 · 기준일 2026.04.12', false, false)}
</div>
<div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:22px;padding-bottom:7px;border-bottom:1px solid ${INK}">
<div class="n" style="font-size:10px;letter-spacing:.1em;color:${G}">공유 권한</div><div class="n" style="font-size:10px;letter-spacing:.06em;color:${G}">기관명 / 권한명</div></div>
${permRow('LX 한국국토정보공사', '편집')}
${permRow('남원시청', '뷰어')}
<div style="padding:8px 0 0;font-size:11px;color:${G}">+ 기관 추가</div>
<div style="display:flex;align-items:center;gap:10px;margin-top:26px">
<div style="position:relative;width:120px;height:38px;display:flex;align-items:center;justify-content:center">${br(120, 38, INK, 12, 1)}<span class="d" style="font-size:14px;letter-spacing:.01em">취소</span></div>
<div style="width:120px;height:38px;background:${INK};display:flex;align-items:center;justify-content:center"><span class="d" style="font-size:14px;color:#FFFFFF">발행</span></div>
<div class="n" style="font-size:9.5px;letter-spacing:.03em;color:${G};margin-left:6px;line-height:1.5">기준 일자 · 데이터명 필수<br>발행하면 <span style="color:${INK}">?tab=publishing</span> 으로 옮겨진다</div></div>
<div class="n" style="position:absolute;left:32px;bottom:18px;font-size:9.5px;letter-spacing:.04em;color:${C}">드로어는 우·하 마진을 뚫는다 — 이 화면의 일탈 1회</div>
</div>`;

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>
@font-face{font-family:"Paperlogy";font-weight:800;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2") format("woff2")}
@font-face{font-family:"Paperlogy";font-weight:700;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2") format("woff2")}
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
*{box-sizing:border-box}
body{margin:0;background:#FFFFFF;color:#010102;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;font-weight:400;font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.01em}
.n{font-family:'Inter','Pretendard',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
</style></helmet>
<div style="width:1440px;height:900px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;color:#010102">
${rail}
${head}
${T.join('')}
${foot}
${drawer}
</div>
</x-dc>
</body>
</html>
`;
fs.writeFileSync('F:/Land-XI 플랫폼/01. 디자인/design-canvas/v2/B5-DataMgmt.dc.html', html);
console.log('written', html.length);
