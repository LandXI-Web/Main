// Land-XI 톤앤매너 v4 — 공용 기반. v3 아트보드는 전부 이 모듈만 쓴다.
// 진단(2026-08-31) 1위 지적 "토큰이 네 곳에 따로 산다"의 해소: 색·글자·격자·부품이 여기 한 곳에만 있다.
// 규칙 출처: design/system.md + design/tone-v4.md (헌장 일곱 조항).
//   서체 셋 · 색은 뜻 · 형태 없음(라운드 0/그림자 0/그라디언트 0) · 격자 고정 · 숫자엔 단위와 기준시점
//   · 이미지가 먼저 · 움직임은 하나. 바닥 14px, 14–20 구간은 14 · 16 · 18 세 단만.

export const T = {
  ink: '#010102', paper: '#FFFFFF',
  grey: '#686868', grey2: '#CCCCCC', line: '#DDDDDD',
  accent: '#006DF7', t1: '#E8F1FF', t2: '#D6E6FF',
  warn: '#D1352B', teal: '#0FA9A0', amber: '#FFB633', amberInk: '#C98A17',
  rail: 72, mast: 64, margin: 56, gutter: 24, ledger: 372,
  disp: `'Paperlogy','Pretendard',system-ui,sans-serif`,
  body: `'Pretendard',system-ui,sans-serif`,
  num: `'Inter','Pretendard',system-ui,sans-serif`,
};

// 글자 사다리 — 이 아홉 단이 전부다. 그 사이 값(14.5·15·17…)은 쓰지 않는다.
export const F = {
  h1: 'font-size:66px;line-height:82px', h2: 'font-size:54px;line-height:59px',
  h3: 'font-size:34px;line-height:42px', h4: 'font-size:30px;line-height:38px',
  h5: 'font-size:26px;line-height:32px', lead: 'font-size:22px;line-height:32px',
  base: 'font-size:18px;line-height:26px', small: 'font-size:16px;line-height:24px',
  label: 'font-size:14px;line-height:16px', kpi: 'font-size:58px;line-height:1',
  stat: 'font-size:126px;line-height:1',
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const disp = (w = 700) => `font-family:${T.disp};font-weight:${w};letter-spacing:-0.01em`;
export const num = () => `font-family:${T.num};font-variant-numeric:tabular-nums;letter-spacing:0.02em`;

export const HELMET = `
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
  <style>
    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
    @font-face{font-family:'Paperlogy';font-weight:800;font-style:normal;font-display:swap;
      src:url('https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2') format('woff2')}
    @font-face{font-family:'Paperlogy';font-weight:700;font-style:normal;font-display:swap;
      src:url('https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2') format('woff2')}
    :root{
      --ink:${T.ink}; --paper:${T.paper}; --grey:${T.grey}; --grey-2:${T.grey2}; --line:${T.line};
      --accent:${T.accent}; --t1:${T.t1}; --t2:${T.t2}; --warn:${T.warn}; --teal:${T.teal}; --amber:${T.amber};
      --rail:${T.rail}px; --mast:${T.mast}px; --m:${T.margin}px; --gap:${T.gutter}px; --ledger:${T.ledger}px;
      --ease:cubic-bezier(0.15,1,0.3,1); --hov:180ms; --hove:cubic-bezier(.22,1,.36,1);
    }
    *{box-sizing:border-box}
    body{margin:0;background:var(--paper);color:var(--ink);font-family:${T.body};font-weight:400;${F.base}}
    a{color:var(--accent);text-decoration:none} a:hover{color:var(--ink)}
    .n{${num()}}
    .u{color:var(--grey);margin-left:5px}                                  /* 단위 — 값보다 두 단 작게 */
    b{font-weight:400;color:var(--accent)}                                  /* 강조는 굵기가 아니라 색 */
    b.w{color:var(--warn)}
    .hair{border:0;border-top:1px solid var(--line);margin:0}
    .rule{height:4px;background:var(--accent)}                              /* 제목 아래 4px */
    table{border-collapse:collapse;width:100%}
  </style>`;

/** 페이지 껍데기 — 레일 + 마스트 + 본문. 모든 화면이 이걸로 시작한다. */
export const page = ({ h = 900, rail, mast, body }) => `
<div style="position:relative;width:1440px;height:${h}px;background:var(--paper);overflow:hidden;display:flex">
  ${rail}
  <div style="flex:1;min-width:0;display:flex;flex-direction:column">
    ${mast}
    <div style="flex:1;min-height:0;padding:0 var(--m);display:flex;flex-direction:column">${body}</div>
  </div>
</div>`;

const ICON = {
  dashboard: '<rect x="1" y="1" width="7" height="7"/><rect x="11" y="1" width="7" height="7"/><rect x="1" y="11" width="7" height="7"/><rect x="11" y="11" width="7" height="7"/>',
  data: '<rect x="1" y="3" width="17" height="4"/><rect x="1" y="12" width="17" height="4"/>',
  project: '<path d="M1 4h6l2 3h9v10H1z"/>',
  analysis: '<path d="M2 16V6M7 16V2M12 16v-7M17 16v-11"/>',
  map: '<path d="M1 4l6-2 6 2 5-2v13l-5 2-6-2-6 2z"/><path d="M7 2v13M13 4v13"/>',
  ximap: '<circle cx="9.5" cy="8" r="5"/><path d="M9.5 13v5M4 18h11"/>',
  card: '<rect x="1" y="3" width="17" height="12"/><path d="M1 7h17"/>',
  admin: '<circle cx="9.5" cy="9" r="3"/><path d="M9.5 1v3M9.5 14v3M1.5 9h3M14.5 9h3M4 3.5l2 2M13 12.5l2 2M15 3.5l-2 2M6 12.5l-2 2"/>',
  support: '<path d="M2 3h15v10H9l-4 4v-4H2z"/>',
  my: '<circle cx="9.5" cy="6" r="3.5"/><path d="M2.5 17c0-3.9 3.1-6 7-6s7 2.1 7 6"/>',
  out: '<path d="M7 1H1v16h6M12 5l4 4-4 4M16 9H6"/>',
};
export const glyph = (k, c = 'currentColor', s = 19) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 19 19" fill="none" stroke="${c}" stroke-width="1.4">${ICON[k] || ICON.dashboard}</svg>`;

/** 좌 레일 72px — 항목 58px, 활성은 좌측 잉크 바 + 잉크 글자. 라벨은 바닥 14px. */
export const rail = (items, active, foot = ['support', 'my', 'out']) => {
  const item = (k, label, on) => `
    <a href="#" style="position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:58px;text-decoration:none;color:${on ? 'var(--ink)' : 'var(--grey)'}">
      ${on ? '<span style="position:absolute;left:0;top:9px;width:2px;height:40px;background:var(--ink)"></span>' : ''}
      ${glyph(k, on ? T.ink : T.grey)}
      <span style="${F.label};text-align:center;letter-spacing:-0.02em;white-space:pre-line">${esc(label)}</span>
    </a>`;
  const FOOT = { support: '서비스\n지원', my: 'MY', out: '로그아웃' };
  return `
  <div style="width:var(--rail);flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column">
    <div style="height:var(--mast);display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--line)">
      <span style="${disp(800)};font-size:14px;line-height:15px;letter-spacing:0.10em;text-align:center">LAND<br>XI</span>
    </div>
    <div style="display:flex;flex-direction:column;padding-top:6px">${items.map(([k, l]) => item(k, l, k === active)).join('')}</div>
    <div style="margin-top:auto;display:flex;flex-direction:column;padding-bottom:8px">${foot.map(k => item(k, FOOT[k], k === active)).join('')}</div>
  </div>`;
};

export const RAIL_ALL = [['dashboard', '대시보드'], ['data', '데이터\n관리'], ['project', '프로젝트'],
  ['analysis', '분석\n서비스'], ['map', '지도\n서비스'], ['ximap', 'XI맵'], ['card', '카드 발행\n관리'], ['admin', '서비스\n관리']];
export const RAIL_STAFF = [['dashboard', '대시보드'], ['data', '데이터\n관리'], ['project', '프로젝트'],
  ['analysis', '분석\n서비스'], ['map', '지도\n서비스'], ['ximap', 'XI맵']];
export const RAIL_VIEWER = [['dashboard', '대시보드'], ['analysis', '분석\n서비스'], ['map', '지도\n서비스']];

/** 마스트헤드 64px — 공지 한 줄 + 기준일. 공지가 없으면 오른쪽만. */
export const mast = ({ notice, date = '2026.06.08', right } = {}) => `
  <div style="height:var(--mast);flex:none;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 var(--m)">
    <div style="display:flex;align-items:center;gap:12px;min-width:0">
      ${notice ? `${glyph('support', T.grey, 17)}
      <span style="border:1px solid var(--line);color:var(--grey);${F.label};padding:4px 8px;flex:none">공지</span>
      <span style="${F.small};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(notice)}</span>
      <span class="n" style="${F.label};color:var(--grey);flex:none">2026.04.15</span>` : ''}
    </div>
    <div style="display:flex;align-items:baseline;gap:10px;flex:none">
      ${right ? `<span style="${F.small};color:var(--grey)">${esc(right)}</span>` : ''}
      <span style="${F.label};color:var(--grey)">기준일</span><span class="n" style="${F.small}">${esc(date)}</span>
    </div>
  </div>`;

/** 화면 제목 — 앞부분만 파랑 4px 룰. sub 는 조용한 한 줄(선택). */
export const title = (lead, rest = '', sub = '') => `
  <div style="padding:30px 0 18px">
    <div style="display:flex;align-items:baseline;gap:14px">
      <h1 style="margin:0;${disp(700)};${F.h3}"><span style="display:inline-block">${esc(lead)}</span>${rest ? ' ' + esc(rest) : ''}</h1>
      ${sub ? `<span class="n" style="${F.label};color:var(--grey)">${esc(sub)}</span>` : ''}
    </div>
    <div class="rule" style="width:${lead.length * 19 + 4}px;margin-top:8px"></div>
  </div>`;

/** KPI 밴드 — 값 58 + 단위 20 + 보조 14. 조치가 필요한 칸만 빨강. */
export const kpiBand = cells => `
  <div style="display:grid;grid-template-columns:repeat(${cells.length},minmax(0,1fr));border-top:1px solid var(--ink);border-bottom:1px solid var(--line)">
    ${cells.map((c, i) => `
      <div style="padding:18px 22px 20px;${i ? 'border-left:1px solid var(--line);' : ''}${c.on ? 'background:var(--t1);' : ''}">
        <div style="${F.small};color:var(--grey)">${esc(c.label)}</div>
        <div style="${disp(700)};${F.kpi};color:${c.act ? 'var(--warn)' : 'var(--accent)'};margin:8px 0 6px">${esc(c.v)}<span style="font-size:20px;color:var(--ink);margin-left:6px;letter-spacing:0">${esc(c.u)}</span></div>
        <div class="n" style="${F.label};color:${c.act ? 'var(--warn)' : 'var(--grey)'}">${esc(c.sub)}</div>
      </div>`).join('')}
  </div>`;

/** 패널 머리 — 글리프 + 제목 + 개수, 오른쪽 링크 하나. 아래는 잉크 1px. */
export const head = (g, t, count = '', right = '') => `
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ink);padding-bottom:9px">
    <div style="display:flex;align-items:center;gap:9px">
      ${glyph(g, T.accent, 18)}<span style="${disp(700)};${F.h5}">${esc(t)}</span>
      ${count !== '' ? `<span class="n" style="${F.small};color:var(--grey)">${esc(count)}</span>` : ''}
    </div>
    ${right ? `<a href="#" style="${F.small}">${esc(right)} ›</a>` : ''}
  </div>`;

/** 표 — 머리띠 틴트1, 행 38px 헤어라인, 합계 위 잉크. 수치 열은 오른쪽 정렬 Inter tabular. */
export const table = ({ cols, rows, total }) => {
  const cell = (c, v, isHead) => {
    const st = `${isHead ? F.label : F.small};${c.n ? num() + ';text-align:right;' : ''}${c.w ? `width:${c.w}px;` : 'flex:1;min-width:0;'}${isHead ? 'color:var(--grey);' : ''}${c.c && !isHead ? `color:${c.c};` : ''}`;
    return `<span style="${st}overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v}</span>`;
  };
  return `
  <div>
    <div style="display:flex;gap:10px;background:var(--t1);padding:9px 12px">${cols.map(c => cell(c, esc(c.t), true)).join('')}</div>
    ${rows.map(r => `<div style="display:flex;gap:10px;align-items:center;height:38px;padding:0 12px;border-bottom:1px solid var(--line)">${cols.map((c, i) => cell(c, r[i], false)).join('')}</div>`).join('')}
    ${total ? `<div style="display:flex;gap:10px;align-items:center;height:38px;padding:0 12px;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink)">${cols.map((c, i) => cell(c, total[i], false)).join('')}</div>` : ''}
  </div>`;
};

/** 이미지 타일 — 상태는 이미지 위, 이름·용량은 아래 한 줄. 타일 안에 버튼 없음. */
export const tile = ({ img, name, meta, state, stateC = T.paper, ar = '240 / 147', tag }) => `
  <div>
    <div style="position:relative;aspect-ratio:${ar};background:var(--ink);overflow:hidden">
      ${img ? `<img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.85) contrast(1.04)">`
            : `<div style="width:100%;height:100%;border:1px dashed var(--grey-2);background:var(--paper)"></div>`}
      ${state ? `<span style="position:absolute;left:8px;bottom:7px;${F.label};${num()};color:${stateC}">${esc(state)}</span>` : ''}
      ${tag ? `<span style="position:absolute;right:8px;top:8px;${F.label};background:var(--paper);color:var(--grey);padding:3px 7px">${esc(tag)}</span>` : ''}
    </div>
    <div style="display:flex;margin-top:7px;${F.label};line-height:17px">
      <span style="flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>
      ${meta ? `<span class="n" style="flex:none;color:var(--grey)">&nbsp;· ${esc(meta)}</span>` : ''}
    </div>
  </div>`;

/** 지도/영상 판 — 판은 마진을 뚫어도 되는 유일한 요소. 범례는 흰 판때기 14px. */
export const plate = ({ img, h = 300, legend = [], scale = '200 m · z15', badge, action }) => `
  <div style="position:relative;height:${h}px;background:var(--ink);overflow:hidden">
    ${img ? `<img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.85) contrast(1.04)">` : ''}
    ${badge ? `<div style="position:absolute;left:10px;top:10px;background:var(--paper);padding:5px 9px;${F.label};display:flex;align-items:center;gap:7px">
      <span style="width:10px;height:10px;background:var(--teal)"></span>${esc(badge)}</div>` : ''}
    ${action ? `<a href="#" style="position:absolute;right:10px;top:10px;background:var(--paper);padding:5px 9px;${F.label}">${esc(action)} ›</a>` : ''}
    ${legend.length ? `<div style="position:absolute;left:10px;bottom:10px;background:var(--paper);padding:7px 9px;display:flex;flex-direction:column;gap:5px">
      ${legend.map(([c, t]) => `<span style="${F.label};display:flex;align-items:center;gap:7px"><span style="width:10px;height:10px;background:${c}"></span>${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="n" style="position:absolute;right:10px;bottom:10px;background:var(--paper);padding:4px 8px;${F.label};color:var(--grey)">${esc(scale)}</div>
  </div>`;

/** 단계 레일 — 끝난 단계는 파랑 채움, 아직인 단계는 점선 무채 + 이유 한 줄. */
export const stages = steps => `
  <div style="display:flex;align-items:stretch">
    ${steps.map((s, i) => `
      ${i ? '<span style="width:10px;height:1px;background:var(--line);align-self:center"></span>' : ''}
      <div style="flex:1;${s.done ? 'background:var(--accent);color:var(--paper);padding:8px 10px;' : 'border:1px dashed var(--grey-2);color:var(--grey);padding:7px 10px;'}display:flex;justify-content:space-between;${F.small}">
        <span>${esc(s.t)}</span><span class="n">${esc(s.v)}</span>
      </div>`).join('')}
  </div>`;

/** 스택 막대 + 범례 — 도넛 대신. 한 계열은 파랑, AI 산출물은 청록. */
export const stack = (parts, h = 20) => `
  <div>
    <div style="display:flex;height:${h}px">${parts.map(p => `<div style="width:${p.pct}%;background:${p.c}"></div>`).join('')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:12px">
      ${parts.map(p => `<span class="n" style="${F.label};display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:${p.c}"></span>${esc(p.t)}</span>`).join('')}
    </div>
  </div>`;

/** 탭 — 선택은 파랑 테두리 + 틴트1 + 파랑 글자. 높이 28 하나. */
export const tabs = items => `
  <div style="display:flex;gap:8px">
    ${items.map(([t, on]) => `<span style="${F.small};padding:6px 14px;${on ? 'border:1px solid var(--accent);background:var(--t1);color:var(--accent);font-weight:500' : 'border:1px solid var(--line)'}">${esc(t)}</span>`).join('')}
  </div>`;

/** 칩 — 높이 24 하나. 선택만 틴트2 채움, 나머지는 헤어라인. */
export const chip = (t, kind = '') => {
  const st = kind === 'on' ? 'background:var(--t2);color:var(--accent)'
    : kind === 'demo' ? 'border:1px dashed var(--grey-2);color:var(--grey)' : 'border:1px solid var(--line);color:var(--grey)';
  return `<span class="n" style="${F.label};padding:4px 10px;${st}">${esc(t)}</span>`;
};

/** 상태어 — 배지가 아니라 글자. */
export const state = (t, kind = '') =>
  `<span style="${F.small};color:${kind === 'act' ? 'var(--warn)' : kind === 'on' ? 'var(--accent)' : kind === 'ai' ? 'var(--teal)' : 'var(--grey)'}">${esc(t)}</span>`;

/** 버튼 — 1차는 잉크 채움(화면당 하나), 2차는 코너 브래킷, 3차는 › 링크. */
export const cta = t => `<span style="background:var(--ink);color:var(--paper);${disp(700)};font-size:18px;padding:12px 22px;display:inline-block;letter-spacing:0">${esc(t)}</span>`;
export const cta2 = t => `<span style="position:relative;display:inline-block;padding:12px 20px;${disp(700)};font-size:18px;letter-spacing:0">
  <span style="position:absolute;left:0;top:0;width:12px;height:12px;border-left:1px solid var(--ink);border-top:1px solid var(--ink)"></span>
  <span style="position:absolute;right:0;bottom:0;width:12px;height:12px;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink)"></span>${esc(t)}</span>`;
export const link = t => `<a href="#" style="${F.small}">${esc(t)} ›</a>`;

/** 빈 상태 — 점선 무채 액자 + 이유 한 줄. 값이 0인 것과 값이 없는 것을 섞지 않는다. */
export const empty = (why, h = 120) => `
  <div style="height:${h}px;border:1px dashed var(--grey-2);display:flex;align-items:center;justify-content:center;${F.label};color:var(--grey);text-align:center">${esc(why)}</div>`;

/** 페이저 — 쪽당 4·6·8·16, 열은 2·3·4·8 로 늘어난다. */
export const pager = (per = 8, page = '1 / 1') => `
  <div style="display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:8px;${F.small}">
      <span style="color:var(--grey)">쪽당</span>
      ${[4, 6, 8, 16].map(n => `<span class="n" style="width:30px;height:26px;line-height:24px;text-align:center;${F.small};${n === per ? 'border:1px solid var(--accent);color:var(--accent);background:var(--t1)' : 'border:1px solid var(--line)'}">${n}</span>`).join('')}
    </div>
    <span class="n" style="${F.small};color:var(--grey)">${esc(page)} &nbsp;‹&nbsp;›</span>
  </div>`;

/** 원장(우측 372) — 화면의 오른쪽 고정 열. 목록은 왼쪽 신축. */
export const split = (left, right) => `
  <div style="flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 1px var(--ledger);column-gap:var(--gap);padding-bottom:20px">
    <div style="min-width:0;display:flex;flex-direction:column">${left}</div>
    <div style="background:var(--line)"></div>
    <div style="min-width:0;display:flex;flex-direction:column">${right}</div>
  </div>`;

export const foot = () => `
  <div style="flex:none;border-top:1px solid var(--line);padding:14px 0 16px;display:flex;justify-content:space-between;${F.label};color:var(--grey)">
    <span>LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관</span>
    <span class="n">Family Site ▾</span>
  </div>`;

/** 아트보드 파일 한 장. */
export const doc = (inner, h = 900) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>${HELMET}
</helmet>
${inner}
</x-dc>
<script data-dc-script data-props='{"$preview":{"width":1440,"height":${h}}}'>
class Component extends DCLogic {}
</script>
</body>
</html>
`;

export { esc };
