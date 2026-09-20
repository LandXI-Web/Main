// B6-MapWork — "AI 학습데이터를 구축하고 관리하는 모든 기능을 지도에서" 컨셉 원판 3안 (2026-09-20 발주자 구상 · 자동 설계)
// 기능 발명 0: 원본 프로젝트 8스텝(파일·라벨링·데이터셋·학습·분석·모델 등록·발행 요청) + 데이터 관리 아카이브를 **한 판의 지도** 위로 옮긴 배치 실험.
// 선택 1 파이프라인 도크 · 선택 2 단계 분할 · 선택 3 레이어가 곧 작업.  usage: node tools/design/gen-b6-mapwork.mjs (repo root, 멱등)
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const OUTDIR = path.join(root, 'design-canvas/v2');
const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', TEAL = '#0FA9A0', WARN = '#D1352B';
const W = 1440, HT = 900;

const svg = (d, size = 16, color = G, extra = '') => `<svg style="color:${color};flex:none;display:block${extra}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter">${d}</svg>`;
const IC = {
  mark: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M8.5 8.5h3v3h-3z" fill="currentColor" stroke="none"/>',
  dash: '<path d="M3 3h14v14H3z"/><path d="M3 8.5h14M10.5 8.5V17"/>', data: '<path d="M3 3h10v10H3z"/><path d="M7 7h10v10H7z"/>',
  proj: '<path d="M2.5 2.5h5v5h-5z"/><path d="M12.5 2.5h5v5h-5z"/><path d="M7.5 12.5h5v5h-5z"/><path d="M7.5 5h5M15 7.5v4H10v1"/>',
  anal: '<path d="M3 3h14v14H3z"/><path d="M3 10h14" stroke-dasharray="2 2"/><path d="M6 5.5h3v3H6z"/><path d="M11.5 11.5h3.5v3.5h-3.5z"/>',
  map: '<path d="M4.5 4.5h11v11h-11z"/><path d="M10 1v18M1 10h18"/>', sup: '<path d="M3 3h14v9.5H8.5L4.5 17v-4.5H3z"/><path d="M6.5 7.5h7"/>',
  pub: '<path d="M3 6h10v11H3z"/><path d="M9 11 17 3M12 3h5v5"/>', adm: '<path d="M6 3v14M14 3v14"/><path d="M4 6.5h4v2.5H4z"/><path d="M12 11h4v2.5h-4z"/>',
  my: '<path d="M3 3h14v14H3z"/><path d="M8 6h4v4H8z"/><path d="M5.5 17v-3h9v3"/>', out: '<path d="M11 3H3.5v14H11"/><path d="M8.5 10H17M13.5 6.5 17 10l-3.5 3.5"/>',
  eye: '<path d="M1.5 10 10 4l8.5 6L10 16z"/><path d="M8 8h4v4H8z"/>', eyeoff: '<path d="M1.5 10 10 4l8.5 6L10 16z" stroke-dasharray="2 2"/>',
  search: '<path d="M4 4h8v8H4z"/><path d="m12 12 5 5"/>', plus: '<path d="M10 4v12M4 10h12"/>', minus: '<path d="M4 10h12"/>', layers: '<path d="M10 3 17 7l-7 4-7-4z"/><path d="m3 11 7 4 7-4"/>',
  up: '<path d="M10 16V5M5.5 9.5 10 5l4.5 4.5"/><path d="M4 3h12"/>', tag: '<path d="M3 3h8l6 7-7 7-7-7z"/><path d="M6.5 6.5h2v2h-2z" fill="currentColor" stroke="none"/>',
  set: '<path d="M3 5h14v4H3z"/><path d="M3 11h14v4H3z"/>', train: '<path d="M2.5 15 7 9l3.5 3.5L17.5 4"/><path d="M13 4h4.5v4.5"/>', run: '<path d="M5 3.5 16 10 5 16.5z"/>',
};
function railItem(y, label, icon, on) {
  return `<div style="position:absolute;left:0;top:${y}px;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">${on ? `<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:${INK}"></div>` : ''}${svg(IC[icon], 20, on ? INK : G)}<div style="font-size:14px;line-height:1.15;letter-spacing:-.02em;text-align:center;white-space:pre-line;color:${on ? INK : G}">${label}</div></div>`;
}
const rail = (active) => `<div style="position:absolute;left:0;top:0;width:72px;height:${HT}px;background:#FFFFFF;z-index:30">
<div style="position:absolute;left:0;top:0;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">${svg(IC.mark, 19, INK)}<div class="d" style="font-size:11px;letter-spacing:.18em;margin-right:-.18em">LAND XI</div></div>
<div style="position:absolute;left:12px;top:58px;width:48px;height:1px;background:${H}"></div>
${railItem(72, '대시보드', 'dash', active === 'dash')}${railItem(130, '데이터\n관리', 'data', active === 'data')}${railItem(188, '프로젝트', 'proj', active === 'proj')}${railItem(246, '분석\n서비스', 'anal', active === 'anal')}${railItem(304, '지도\n서비스', 'map', active === 'map')}
${railItem(556, '서비스\n지원', 'sup', false)}${railItem(618, '카드 발행\n관리', 'pub', false)}${railItem(680, '서비스\n관리', 'adm', false)}${railItem(748, 'MY', 'my', false)}${railItem(806, '로그아웃', 'out', false)}
</div><div style="position:absolute;left:72px;top:0;width:1px;height:${HT}px;background:${H};z-index:31"></div>`;

const css = `
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
@font-face{font-family:"Paperlogy";font-weight:700;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2") format("woff2")}
*{box-sizing:border-box}body{margin:0;background:#FFFFFF;color:${INK};font-family:'Pretendard',system-ui,sans-serif;font-weight:400;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',sans-serif;font-weight:700;letter-spacing:-.01em}
.n{font-family:'Inter',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.mic{font-size:14px;line-height:1.3;color:${G}}.lab{font-size:14px;line-height:1.2;color:${G};letter-spacing:.03em}
.chip{height:26px;line-height:24px;padding:0 10px;border:1px solid ${H};color:${G};font-size:14px;white-space:nowrap;display:inline-block}
.chip.on{border-color:${ACC};color:${ACC};background:${T1}}
.tag{border:1px dotted ${C};padding:0 5px;font-size:14px;line-height:18px;color:${G};margin-left:6px;display:inline-block}
.btn{height:36px;line-height:36px;padding:0 16px;background:${INK};color:#FFF;font-size:15px;font-weight:500;white-space:nowrap;display:inline-block}
.br{position:relative;height:36px;line-height:36px;padding:0 14px;font-size:15px;font-weight:500;white-space:nowrap;display:inline-block}
.br:before,.br:after{content:'';position:absolute;width:10px;height:10px;border:1px solid ${INK}}.br:before{left:0;top:0;border-right:0;border-bottom:0}.br:after{right:0;bottom:0;border-left:0;border-top:0}
a{color:${ACC};text-decoration:none}a:hover{text-decoration:underline}`;
const page = (body) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>${css}</style></helmet>
<div style="width:${W}px;height:${HT}px;position:relative;overflow:hidden;background:#FFFFFF;color:${INK}">
${body}
</div>
</x-dc>
</body>
</html>
`;
// 지도 판(실 V-World 위성 캡처 · 남원) — 원판 공용
const plate = (x, y, w, h, pos = '50% 50%') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:${INK}"><img src="map-vw-z14.jpg" alt="" style="width:100%;height:100%;object-fit:cover;object-position:${pos};display:block;filter:saturate(.82)"></div>`;
// 풋프린트: 흰/파랑 코너 브래킷 + 선택 시 청록 결과 필지
const foot = (x, y, w, h, o = {}) => { const col = o.sel ? ACC : '#FFFFFF', a = 12, bw = o.sel ? 2 : 1;
  const c = (l, t, s) => `<div style="position:absolute;left:${l}px;top:${t}px;width:${a}px;height:${a}px;${s}"></div>`;
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${o.sel ? 6 : 5};${o.fill ? `background:${o.fill};` : ''}${o.dash ? `border:1px dashed rgba(255,255,255,.8);` : ''}">${o.dash ? '' : c(0, 0, `border-left:${bw}px solid ${col};border-top:${bw}px solid ${col}`) + c(w - a, 0, `border-right:${bw}px solid ${col};border-top:${bw}px solid ${col}`) + c(0, h - a, `border-left:${bw}px solid ${col};border-bottom:${bw}px solid ${col}`) + c(w - a, h - a, `border-right:${bw}px solid ${col};border-bottom:${bw}px solid ${col}`)}${o.label ? `<div class="n" style="position:absolute;left:0;top:${h + 6}px;font-size:14px;line-height:18px;color:#FFF;white-space:nowrap;background:rgba(1,1,2,.72);padding:1px 6px">${o.label}</div>` : ''}${o.inner || ''}</div>`; };
const tealParcels = (n, w, h, seed = 3) => { let s = '', r = seed; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < n; i++) { const pw = 14 + rnd() * 26, ph = 8 + rnd() * 14, px = 6 + rnd() * (w - pw - 12), py = 6 + rnd() * (h - ph - 12); s += `<div style="position:absolute;left:${px.toFixed(0)}px;top:${py.toFixed(0)}px;width:${pw.toFixed(0)}px;height:${ph.toFixed(0)}px;border:1px solid ${TEAL};background:rgba(15,169,160,.22);transform:rotate(${(rnd() * 24 - 12).toFixed(0)}deg)"></div>`; } return s; };
const tools = (x, y) => `<div style="position:absolute;left:${x}px;top:${y}px;width:40px;background:#FFF;border:1px solid ${H};z-index:12;display:flex;flex-direction:column;align-items:center">${['search', 'layers', 'plus', 'minus'].map((k, i) => `<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;${i ? `border-top:1px solid ${H}` : ''}">${svg(IC[k], 18, INK)}</div>`).join('')}</div>`;
const scale = (x, y) => `<div class="n" style="position:absolute;left:${x}px;top:${y}px;z-index:12;font-size:14px;color:#FFF;display:flex;align-items:center;gap:10px;background:rgba(1,1,2,.72);padding:3px 8px"><span style="display:inline-block;width:64px;height:6px;border:1px solid #FFF;border-top:0"></span>1 km · 127.3336 E · 35.3377 N · z14 · V-World</div>`;
const thumb = (src, w, h, extra = '') => `<div style="width:${w}px;height:${h}px;overflow:hidden;background:${INK};flex:none;position:relative"><img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.85)">${extra}</div>`;
const head = (title, sub) => `<div style="position:absolute;left:72px;top:0;width:1368px;height:64px;background:#FFF;z-index:20;border-bottom:1px solid ${H};display:flex;align-items:center;gap:14px;padding:0 56px">
<span class="mic">‹ 프로젝트 목록</span><span class="d" style="font-size:26px;line-height:1">비닐하우스 탐지</span><span style="font-size:15px;color:${ACC};font-weight:500">학습 완료 · IoU 0.82</span><span class="tag">시연</span>
<div style="flex:1"></div><span class="mic">${sub}</span></div>`;

// 단계(원본 프로젝트 8스텝을 5단으로: 파일 → 라벨링 → 데이터셋 → 학습 → 분석·발행)
const STAGES = [
  { k: '영상', ic: 'up', n: '10', u: '도엽', sub: '남원 4시점 · 전역 2 · 국산리 2 · 제주 2', src: '원본 ④ 파일 업로드' },
  { k: '라벨링', ic: 'tag', n: '1,674', u: '필지', sub: '라벨링됨 1 · 마감 1 · 미작업 1', src: '원본 ⑤ 라벨링' },
  { k: '데이터셋', ic: 'set', n: '2', u: '건', sub: '단동 1,469 · 다동 205', src: '원본 ⑥ 데이터셋' },
  { k: '학습', ic: 'train', n: '5', u: '회', sub: '완료 1 · 진행 2 · 대기 2', src: '원본 ⑦ AI 학습', tag: 1 },
  { k: '분석 · 발행', ic: 'run', n: '1', u: '건 대기', sub: '분석 완료 2 · 발행 요청 대기 1', src: '원본 ⑧–⑪', warn: 1 },
];

// ═════════ 선택 1 · 파이프라인 도크 ═════════
function opt1() {
  const dockY = 772, cw = 1368 / 5;
  const dock = STAGES.map((s, i) => { const on = i === 1; const x = 72 + i * cw;
    return `<div style="position:absolute;left:${x}px;top:${dockY}px;width:${cw}px;height:128px;background:${on ? T1 : '#FFF'};border-top:${on ? `4px solid ${ACC}` : `1px solid ${H}`};${i ? `border-left:1px solid ${H};` : ''}padding:${on ? 13 : 16}px 22px 0;z-index:20">
<div style="display:flex;align-items:center;gap:8px">${svg(IC[s.ic], 16, on ? ACC : G)}<span style="font-size:15px;font-weight:500;color:${on ? ACC : INK}">${String(i + 1).padStart(2, '0')} ${s.k}</span>${s.tag ? '<span class="tag">시연</span>' : ''}</div>
<div style="display:flex;align-items:baseline;gap:6px;margin-top:6px"><span class="d" style="font-size:40px;line-height:1;color:${s.warn ? WARN : on ? ACC : INK}">${s.n}</span><span style="font-size:15px;color:${G}">${s.u}</span></div>
<div class="mic" style="margin-top:6px;white-space:nowrap;overflow:hidden;color:${s.warn ? WARN : G}">${s.sub}</div></div>`; }).join('');
  const item = (y, src, name, meta, st, on, stc) => `<div style="position:absolute;left:16px;top:${y}px;width:312px;height:96px;display:flex;gap:12px;${on ? `background:${T1};outline:1px solid ${ACC};outline-offset:6px;` : ''}">${thumb(src, 128, 96)}<div style="min-width:0"><div style="font-size:16px;font-weight:500;white-space:nowrap">${name}</div><div class="n mic" style="margin-top:4px">${meta}</div><div style="margin-top:8px;font-size:14px;color:${stc}">${st}</div></div></div>`;
  const left = `<div style="position:absolute;left:88px;top:80px;width:344px;height:676px;background:#FFF;border:1px solid ${H};z-index:15">
<div style="height:48px;background:${T1};display:flex;align-items:center;gap:8px;padding:0 16px">${svg(IC.tag, 16, ACC)}<span class="d" style="font-size:18px;white-space:nowrap">라벨링</span><span class="n" style="font-size:15px;color:${ACC}">3</span><div style="flex:1"></div><span class="mic" style="white-space:nowrap">고르면 판이 그리로 간다</span></div>
${item(64, 'tile-ep-1.jpg', '남원 농경지 2025.04', '0.011 m/px · 라벨 —', '마감', false, G)}
${item(176, 'tile-gh-clean.jpg', '남원 농경지 2025.06', '0.017 m/px · 라벨 1,674', '라벨링됨 · 이어서 편집', true, ACC)}
${item(288, 'tile-ep-4.jpg', '남원 농경지 2025.10', '0.017 m/px · 라벨 0', '미작업', false, G)}
<div style="position:absolute;left:16px;top:400px;width:312px;height:1px;background:${H}"></div>
<div class="lab" style="position:absolute;left:16px;top:414px">클래스 2</div>
<div style="position:absolute;left:16px;top:440px;width:312px;display:flex;flex-direction:column;gap:10px;font-size:15px">
<div style="display:flex;align-items:center;gap:10px"><span style="width:12px;height:12px;background:rgba(15,169,160,.22);border:1px solid ${TEAL}"></span>비닐하우스_단동<div style="flex:1"></div><span class="n">1,469</span></div>
<div style="display:flex;align-items:center;gap:10px"><span style="width:12px;height:12px;border:1px solid ${TEAL}"></span>비닐하우스_다동<div style="flex:1"></div><span class="n">205</span></div></div>
<div style="position:absolute;left:16px;top:520px;width:312px;height:1px;background:${H}"></div>
<div class="mic" style="position:absolute;left:16px;top:534px;width:312px;line-height:1.5">도구 = 사각형 · 원형 · 폴리곤 · 도형 복사 · 공간 정보 불러오기 · 실행 취소 · 저장 (원본 툴바 그대로 — 편집에 들어가면 판 위에 뜬다)</div>
<div style="position:absolute;left:16px;bottom:16px;display:flex;gap:10px;align-items:center"><span class="btn">라벨링 이어하기</span><span class="br">복제</span></div></div>`;
  const insp = `<div style="position:absolute;left:1096px;top:80px;width:328px;height:520px;background:#FFF;border:1px solid ${H};z-index:15;padding:16px">
<div class="lab">선택한 영상</div><div class="d" style="font-size:20px;margin-top:4px">남원 농경지 2025.06</div>
<div style="margin-top:12px">${thumb('tile-gh-clean.jpg', 294, 150)}</div>
<div class="n" style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin-top:12px;font-size:15px"><span class="lab" style="font-family:Pretendard">GSD</span><span>0.017 m/px</span><span class="lab" style="font-family:Pretendard">촬영</span><span>2025-06 · 드론</span><span class="lab" style="font-family:Pretendard">범위</span><span>127.348–.357 E · 35.528–.535 N</span><span class="lab" style="font-family:Pretendard">라벨</span><span style="color:${TEAL}">1,674 필지</span></div>
<div style="height:1px;background:${H};margin:14px 0"></div>
<div class="lab">이 영상으로 다음 단계</div>
<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;font-size:15px"><a>03 데이터셋에 넣기 ›</a><a>04 이 데이터셋으로 학습 ›</a><a>05 이 영상에 분석 실행 ›</a></div></div>`;
  return page(`${rail('proj')}${head('', '단계는 아래 도크 · 목록은 왼쪽 · 판은 항상 같은 지도')}
${plate(72, 64, 1368, 708, '46% 52%')}
${foot(520, 170, 150, 100, { label: '2025.04 · 마감' })}
${foot(700, 300, 240, 170, { sel: 1, label: '2025.06 · 라벨 1,674', inner: tealParcels(16, 240, 170) })}
${foot(960, 500, 120, 90, { label: '2025.10 · 미작업', dash: 1 })}
${left}${insp}${tools(1384, 616)}${scale(448, 736)}${dock}`);
}

// ═════════ 선택 2 · 단계 분할 ═════════
function opt2() {
  const tabs = STAGES.map((s, i) => `<div style="height:48px;display:flex;align-items:center;gap:8px;padding:0 4px;margin-right:24px;white-space:nowrap;${i === 2 ? `border-bottom:2px solid ${INK};` : ''}"><span style="font-size:16px;white-space:nowrap;font-weight:${i === 2 ? 500 : 400};color:${i === 2 ? INK : G}">${s.k}</span><span class="n" style="font-size:14px;color:${s.warn ? WARN : i === 2 ? ACC : G}">${s.n}</span></div>`).join('');
  const pick = (x, y, src, name, meta, on) => `<div style="position:absolute;left:${x}px;top:${y}px;width:160px">${thumb(src, 160, 100, on ? `<div style="position:absolute;left:8px;top:8px;width:20px;height:20px;background:${INK};display:flex;align-items:center;justify-content:center">${svg('<path d="m4 10 4 4 8-9"/>', 14, '#FFF')}</div>` : `<div style="position:absolute;left:8px;top:8px;width:20px;height:20px;border:1px solid #FFF;background:rgba(1,1,2,.3)"></div>`)}<div style="font-size:15px;font-weight:500;margin-top:8px;white-space:nowrap">${name}</div><div class="n mic">${meta}</div></div>`;
  const left = `<div style="position:absolute;left:72px;top:64px;width:600px;height:836px;background:#FFF;border-right:1px solid ${H};z-index:15">
<div style="position:absolute;left:56px;top:0;display:flex;border-bottom:1px solid ${H};width:544px">${tabs}</div>
<div style="position:absolute;left:56px;top:72px;display:flex;align-items:baseline;gap:10px"><span class="d" style="font-size:34px;line-height:42px">데이터셋 만들기</span></div>
<div style="position:absolute;left:56px;top:116px;width:64px;height:4px;background:${ACC}"></div>
<div class="lab" style="position:absolute;left:56px;top:142px">데이터셋명 *</div>
<div style="position:absolute;left:56px;top:164px;width:340px;height:44px;border:1px solid ${INK};padding:0 12px;line-height:42px;font-size:16px">비닐하우스 단동 라벨셋</div>
<div class="lab" style="position:absolute;left:416px;top:142px">버전 *</div>
<div class="n" style="position:absolute;left:416px;top:164px;width:128px;height:44px;border:1px solid ${H};padding:0 12px;line-height:42px;font-size:16px">v1.1</div>
<div style="position:absolute;left:56px;top:236px;display:flex;align-items:baseline;gap:10px"><span class="d" style="font-size:20px">라벨링 데이터 선택</span><span class="n" style="color:${ACC};font-size:15px">2 / 3</span><span class="mic">고르면 오른쪽 판에 청록으로 켜진다</span></div>
${pick(56, 276, 'tile-gh-clean.jpg', '남원 농경지 2025.06', '라벨 1,674', true)}${pick(236, 276, 'tile-farm-clean.jpg', '남원 농경지 2025.08', '라벨 2,098', true)}${pick(416, 276, 'tile-ep-4.jpg', '남원 농경지 2025.10', '라벨 0 · 선택 불가', false)}
<div style="position:absolute;left:56px;top:448px;width:544px;height:1px;background:${H}"></div>
<div style="position:absolute;left:56px;top:466px;display:flex;gap:40px">
<div><div class="lab">합계 라벨</div><div style="display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:50px;line-height:1.1;color:${ACC}">3,772</span><span style="color:${G}">필지</span></div></div>
<div><div class="lab">클래스</div><div style="display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:50px;line-height:1.1">4</span><span style="color:${G}">종</span></div></div>
<div><div class="lab">영상 시점</div><div style="display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:50px;line-height:1.1">2</span><span style="color:${G}">시점</span></div></div></div>
<div style="position:absolute;left:56px;top:566px;width:544px;height:1px;background:${H}"></div>
<div class="d" style="position:absolute;left:56px;top:584px;font-size:20px">데이터셋 목록 <span class="n" style="font-size:15px;color:${ACC};font-family:Inter;font-weight:400">2</span></div>
<div style="position:absolute;left:56px;top:620px;width:520px;font-size:15px">
<div style="display:grid;grid-template-columns:1fr 70px 90px 110px;height:34px;align-items:center;background:${T1};padding:0 10px" class="lab"><span>데이터셋명</span><span>버전</span><span style="text-align:right">라벨</span><span style="text-align:right">만든 날짜</span></div>
<div class="n" style="display:grid;grid-template-columns:1fr 70px 90px 110px;height:42px;align-items:center;border-bottom:1px solid ${H};padding:0 10px"><span style="font-family:Pretendard">비닐하우스 단동 라벨셋<span class="tag">추정</span></span><span>v1.0</span><span style="text-align:right">1,469</span><span style="text-align:right">2026-06-06</span></div>
<div class="n" style="display:grid;grid-template-columns:1fr 70px 90px 110px;height:42px;align-items:center;border-bottom:1px solid ${H};padding:0 10px"><span style="font-family:Pretendard">비닐하우스 다동 라벨셋<span class="tag">추정</span></span><span>v1.0</span><span style="text-align:right">205</span><span style="text-align:right">2026-06-06</span></div></div>
<div style="position:absolute;left:56px;bottom:24px;display:flex;gap:12px;align-items:center"><span class="btn">만들기</span><span class="br">취소</span><span class="mic" style="margin-left:8px">만들면 04 학습 단계로 이어진다</span></div></div>`;
  return page(`${rail('proj')}${head('', '왼쪽 = 지금 단계의 일 · 오른쪽 = 그 일이 놓인 땅')}
${plate(672, 64, 768, 836, '60% 50%')}
${foot(760, 220, 250, 170, { sel: 1, label: '2025.06 · 1,674 필지 · 선택됨', inner: tealParcels(18, 250, 170, 5) })}
${foot(1050, 430, 270, 190, { sel: 1, label: '2025.08 · 2,098 필지 · 선택됨', inner: tealParcels(22, 270, 190, 9) })}
${foot(820, 640, 140, 100, { label: '2025.10 · 라벨 0', dash: 1 })}
${left}${tools(1384, 80)}${scale(688, 864)}`);
}

// ═════════ 선택 3 · 레이어가 곧 작업 ═════════
function opt3() {
  const grp = (y, ic, name, n, rows, on, warn) => `<div style="position:absolute;left:0;top:${y}px;width:336px">
<div style="height:40px;display:flex;align-items:center;gap:8px;padding:0 16px;${on ? `background:${T1};` : ''}border-top:1px solid ${H}">${svg(IC[ic], 16, on ? ACC : G)}<span style="font-size:16px;font-weight:500;color:${on ? ACC : INK}">${name}</span><span class="n" style="font-size:14px;color:${warn ? WARN : on ? ACC : G}">${n}</span><div style="flex:1"></div>${svg(IC.eye, 18, on ? ACC : INK)}</div>
${rows.map((r) => `<div style="height:34px;display:flex;align-items:center;gap:10px;padding:0 16px 0 40px;font-size:15px;color:${r[3] ? C : INK}"><span style="width:10px;height:10px;flex:none;${r[2]}"></span><span style="white-space:nowrap;overflow:hidden">${r[0]}</span><div style="flex:1"></div><span class="n" style="font-size:14px;color:${r[4] || G};white-space:nowrap">${r[1]}</span></div>`).join('')}</div>`;
  const left = `<div style="position:absolute;left:88px;top:80px;width:336px;height:692px;background:#FFF;border:1px solid ${H};z-index:15;overflow:hidden">
<div style="height:52px;display:flex;align-items:center;gap:8px;padding:0 16px">${svg(IC.layers, 18, INK)}<span class="d" style="font-size:20px">레이어 = 작업물</span><div style="flex:1"></div><span class="mic">켜면 판에 선다</span></div>
${grp(52, 'up', '영상', '10 도엽', [['남원 농경지 2025.06', '0.017 m/px', `border:1px solid ${INK}`], ['남원 농경지 2025.04 · 08 · 10', '3 시점', `border:1px solid ${INK}`], ['남원 전역 · 국산리 · 제주', '6 도엽', `border:1px solid ${C}`, 1]], false)}
${grp(196, 'tag', '라벨', '1,674 필지', [['비닐하우스_단동', '1,469', `background:rgba(15,169,160,.22);border:1px solid ${TEAL}`], ['비닐하우스_다동', '205', `border:1px solid ${TEAL}`]], true)}
${grp(306, 'set', '데이터셋', '2 건', [['단동 라벨셋 v1.0', '1,469', `background:${INK}`], ['다동 라벨셋 v1.0', '205', `background:${INK}`]], false)}
${grp(416, 'train', '학습 <span class="tag">시연</span>', '5 회', [['비닐하우스 v2.1', 'IoU 0.82 · 완료', `background:${ACC}`, 0, ACC], ['비닐하우스 v2.0 · 학습 #4', '진행 중 2', `border:1px solid ${ACC}`]], false)}
${grp(526, 'run', '분석 · 발행', '대기 1', [['남원시 비닐하우스 조사', '1,674 필지', `background:rgba(15,169,160,.22);border:1px solid ${TEAL}`], ['카드 발행 요청', '승인 대기', `border:1px solid ${WARN}`, 0, WARN]], false, 1)}
<div style="position:absolute;left:0;bottom:0;width:336px;height:54px;border-top:1px solid ${H};display:flex;align-items:center;gap:10px;padding:0 16px"><span class="btn" style="height:34px;line-height:34px">파일 추가</span><span class="mic">아카이브 목록에서 고른다</span></div></div>`;
  const act = (ic, t, s, primary) => `<div style="display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;${primary ? `background:${INK};color:#FFF` : `border-top:1px solid ${H}`}">${svg(IC[ic], 16, primary ? '#FFF' : INK)}<span style="font-size:15px;font-weight:500">${t}</span><div style="flex:1"></div><span class="n" style="font-size:14px;color:${primary ? '#FFF' : G}">${s}</span></div>`;
  const callout = `<div style="position:absolute;left:1010px;top:250px;width:300px;background:#FFF;border:1px solid ${INK};z-index:16">
<div style="padding:12px 12px 10px"><div class="lab">판에서 고른 자리</div><div class="d" style="font-size:20px;margin-top:2px">남원 농경지 2025.06</div><div class="n mic" style="margin-top:4px">0.017 m/px · 라벨 <span style="color:${TEAL}">1,674</span> · 127.348–.357 E</div></div>
${act('tag', '라벨링 이어하기', '02', true)}${act('set', '데이터셋에 넣기', '03')}${act('train', '이 데이터로 학습', '04')}${act('run', '이 영상에 분석 실행', '05')}</div>
<svg style="position:absolute;left:0;top:0;z-index:14" width="${W}" height="${HT}"><polyline points="920,340 975,340 975,300 1010,300" fill="none" stroke="#FFFFFF" stroke-width="1"/><rect x="917.5" y="337.5" width="5" height="5" fill="#FFFFFF"/></svg>`;
  const ep = (x, src, t, on) => `<div style="position:absolute;left:${x}px;top:10px;width:150px">${thumb(src, 150, 84, on ? `<div style="position:absolute;inset:0;outline:2px solid ${ACC};outline-offset:-2px"></div>` : '')}<div class="n" style="font-size:14px;margin-top:6px;color:${on ? ACC : INK}">${t}</div></div>`;
  const strip = `<div style="position:absolute;left:440px;top:772px;width:1000px;height:128px;background:#FFF;border-top:1px solid ${H};border-left:1px solid ${H};z-index:15">
<div class="lab" style="position:absolute;left:16px;top:12px;width:120px;line-height:1.4">정사영상 시점<br><span class="n" style="color:${INK}">GSD 1.08–1.69 cm</span></div>
${ep(150, 'tile-ep-1.jpg', '2025.04 · 라벨 —')}${ep(316, 'tile-gh-clean.jpg', '2025.06 · 표시 중', true)}${ep(482, 'tile-farm-clean.jpg', '2025.08 · 라벨 2,098')}${ep(648, 'tile-ep-4.jpg', '2025.10 · 라벨 0')}
<div class="mic" style="position:absolute;left:820px;top:14px;width:170px;line-height:1.45">시점을 바꾸면 같은 자리의 라벨·결과가 그 시점 것으로 바뀐다</div></div>`;
  return page(`${rail('proj')}${head('', '목록도 단계도 레이어다 — 판에서 고르고, 그 자리에서 다음 일을 한다')}
${plate(72, 64, 1368, 708, '50% 48%')}
${foot(560, 170, 140, 96, { label: '2025.04' })}
${foot(720, 280, 200, 140, { sel: 1, label: '2025.06 · 라벨 1,674', inner: tealParcels(14, 200, 140, 7) })}
${foot(640, 470, 230, 160, { label: '2025.08 · 라벨 2,098', inner: tealParcels(10, 230, 160, 11) })}
${foot(960, 560, 120, 90, { label: '2025.10', dash: 1 })}
${left}${callout}${tools(1384, 80)}${scale(440, 736)}${strip}
<div style="position:absolute;left:72px;top:772px;width:368px;height:128px;background:#FFF;border-top:1px solid ${H};z-index:15;padding:14px 16px 0 72px"><div class="lab" style="margin-left:-56px">이 프로젝트 한 줄</div><div style="margin-left:-56px;margin-top:6px;font-size:15px;line-height:1.5">영상 <b class="n">10</b> → 라벨 <b class="n" style="color:${TEAL}">1,674</b> → 데이터셋 <b class="n">2</b> → 학습 <b class="n">5</b> → 발행 <b class="n" style="color:${WARN}">대기 1</b></div></div>`);
}

const OUT = { 'B6-MapWork-Opt1': opt1(), 'B6-MapWork-Opt2': opt2(), 'B6-MapWork-Opt3': opt3() };
for (const [k, v] of Object.entries(OUT)) { fs.writeFileSync(path.join(OUTDIR, k + '.dc.html'), v); console.log('wrote', k, v.length); }
