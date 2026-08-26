// B5 프로젝트 4판 — 재택 세션 3판(B5-Projects · B5-Project-Overview · B5-Project-Data)을 브리프에 맞춰 보정하고
// B5-Project-Train 을 Data 판의 머리(레일 · 접힌 헤더 96 · 탭 6)에서 이어 만든다.
// usage: node tools/design/gen-b5-project.mjs   (repo root)   — 멱등: 이미 보정된 판은 건너뛴다
import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(process.cwd(), 'design-canvas/v2');
const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', TEAL = '#0FA9A0';
const rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/
/g, '
');
const wr = (f, s) => { fs.writeFileSync(path.join(dir, f), s, 'utf8'); console.log('wrote', f, s.length); };
function rep(s, a, b, tag) { if (!s.includes(a)) throw new Error('anchor missing: ' + (tag || a.slice(0, 60))); return s.replace(a, b); }
const mic = (x, y, w, t, extra = '') => `<div class="mic" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;${extra}">${t}</div>\n`;
const lab = (x, y, t, extra = '') => `<div class="lab" style="position:absolute;left:${x}px;top:${y}px;white-space:nowrap;${extra}">${t}</div>\n`;
const hl = (x, y, w, col = H) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:1px;background:${col}"></div>\n`;
const vl = (x, y, h, col = H) => `<div style="position:absolute;left:${x}px;top:${y}px;width:1px;height:${h}px;background:${col}"></div>\n`;
const txt = (x, y, t, size = 13, col = INK, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;font-size:${size}px;letter-spacing:-.01em;color:${col};white-space:nowrap;${extra}">${t}</div>\n`;
const num = (x, y, t, size = 13, col = INK, extra = '') => `<div class="n" style="position:absolute;left:${x}px;top:${y}px;font-size:${size}px;letter-spacing:.01em;color:${col};white-space:nowrap;${extra}">${t}</div>\n`;
const box = (x, y, w, h, border, inner = '', extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:1px solid ${border};display:flex;align-items:center;padding:0 10px;gap:8px;font-size:12.5px;letter-spacing:-.014em;white-space:nowrap;${extra}">${inner}</div>\n`;
const btn = (x, y, w, t, kind = 'line') => kind === 'fill'
  ? `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:28px;background:${INK};display:flex;align-items:center;justify-content:center;font-size:12.5px;letter-spacing:-.014em;color:#FFFFFF;white-space:nowrap">${t}</div>\n`
  : `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:28px;border:1px solid ${kind === 'ink' ? INK : H};display:flex;align-items:center;justify-content:center;font-size:12.5px;letter-spacing:-.014em;color:${kind === 'ink' ? INK : G};white-space:nowrap">${t}</div>\n`;
const chev = (col = G) => `<svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="${col}" stroke-width="1.25" style="flex:none"><path d="M.5.5 4.5 5 8.5.5"/></svg>`;
const sel = (x, y, w, t, col = G) => box(x, y, w, 28, H, `<span style="color:${col}">${t}</span><span style="flex:1"></span>${chev()}`);
const chk = (x, y, on) => `<div style="position:absolute;left:${x}px;top:${y}px;width:14px;height:14px;border:1px solid ${on ? INK : C};background:${on ? INK : '#FFFFFF'}"></div>` + (on ? `<svg width="14" height="14" viewBox="0 0 14 14" style="position:absolute;left:${x}px;top:${y}px" fill="none" stroke="#FFFFFF" stroke-width="1.5"><path d="M3 7.2 6 10l5-6"/></svg>` : '') + '\n';
const brk = (x, y, w, h, col = INK, k = 12) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:${x}px;top:${y}px;display:block;pointer-events:none"><path d="M0 ${k}V0h${k}M${w - k} 0h${k}v${k}M${w} ${h - k}v${k}h-${k}M${k} ${h}H0v-${k}" fill="none" stroke="${col}" stroke-width="1"/></svg>\n`;
const img = (x, y, w, h, src, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:#FFFFFF;${extra}"><img src="${src}" alt="" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;object-fit:cover;display:block"></div>\n`;
const tag = (t) => `<span class="tag">${t}</span>`;
const ink = (t) => `<span style="color:${INK}">${t}</span>`;
const BADGE5 = '학습</span><span class="n" style="font-size:12px;letter-spacing:.02em;color:#CCCCCC">5</span>';
const BADGE4 = BADGE5.replace('>5<', '>4<');

/* ───────── 1. B5-Projects — 대표 이미지 affordance · 빈/로딩 상태 메모 ───────── */
{
  let s = rd('B5-Projects.dc.html');
  if (!s.includes('대표 이미지: 자동')) {
    s = rep(s, '라벨링 1,674 · 학습 1 · 구성원 —</div>\n',
      `라벨링 1,674 · 학습 1 · 구성원 —</div>\n` +
      mic(554, 434, 402, `대표 이미지: 자동(AOI 정사영상 · 남원 농경지 2025.06 도엽) <span style="color:${C}">·</span> ${ink('변경')} <span style="color:${C}">— 호버 시</span>`, 'white-space:nowrap'), 'pj-hover');
    s = rep(s, '카드 썸네일 = 우리 실자산 크롭 · 청록 도형은 결과가 있는 프로젝트에만(남원시 비닐하우스 조사 2025 · 1,674 필지 · 측정)</div></div>',
      `대표 이미지 = 이미 추가된 정사영상의 첫 도엽 AOI 크롭(자동) · <span style="color:${INK}">변경</span>은 프로젝트 파일 안에서만(새 업로드 없음) · 청록 = 결과 있는 프로젝트만</div>` +
      `<div class="mic" style="color:${G};line-height:17px">빈 상태 — 0건: <span style="color:${INK}">'프로젝트가 없습니다 · 초기화'</span> 한 줄, 첫 진입은 만들기 CTA만 · 로딩(400 ms↑): 점선 액자 + 회색 캡션 막대</div></div>`, 'pj-note');
    s = rep(s, 'left:128px;top:838px;white-space:nowrap;color:#CCCCCC">일탈 1회', 'left:128px;top:848px;white-space:nowrap;color:#CCCCCC">일탈 1회');
    wr('B5-Projects.dc.html', s);
  } else console.log('skip B5-Projects (done)');
}

/* ───────── 2. B5-Project-Overview — 파생 CTA 설명 · 인라인 수정 · 초대 인라인 · 데이터 요약 · 최근 활동 ───────── */
{
  let s = rd('B5-Project-Overview.dc.html');
  if (!s.includes('데이터 요약 —')) {
    // 헤더 메모 3줄
    s = rep(s, /<div style="position:absolute;left:128px;top:252px;width:812px;border-left:1px dotted #CCCCCC;padding-left:10px">[\s\S]*?<\/div><\/div>\n/.exec(s)[0],
      `<div style="position:absolute;left:128px;top:252px;width:812px;border-left:1px dotted ${C};padding-left:10px">` +
      `<div class="mic" style="color:${G};line-height:17px">다음 할 일 CTA = 상태에서 파생한 <span style="color:${INK}">링크</span>뿐 — 라벨 없는 도엽 있음 → 라벨링 탭 · 데이터셋 있고 학습 0 → 학습 탭 · 학습 완료 → 분석 탭(새 서버 기능 없음)</div>` +
      `<div class="mic" style="color:${G};line-height:17px">수정 = 인라인 편집(프로젝트명 · 탐지유형 · 학습데이터 유형 · 권장 해상도) — 아래 '프로젝트 정보' 패널에 수정 중 상태를 그려 둠 · 구성원 초대 = 구성원 표 아래 인라인 행(원본 모달과 같은 3필드)</div>` +
      `<div class="mic" style="color:${G};line-height:17px">삭제 = 확인 모달 — 원본의 빨강은 쓰지 않는다(상태색 규칙, 잉크) · 목록 = 마스트헤드 ‹ 프로젝트 목록과 같은 링크</div></div>\n`, 'ov-note');
    // 프로젝트 정보 패널 — 수정 중 상태(프로젝트명 입력 + 저장/취소)
    s = rep(s, `<div class="lab" style="position:absolute;left:128px;top:400px;white-space:nowrap;">프로젝트 정보</div>`,
      `<div class="lab" style="position:absolute;left:128px;top:400px;white-space:nowrap;">프로젝트 정보 <span style="color:${C}">·</span> 수정 중</div>` +
      `<div class="mic" style="position:absolute;left:128px;top:400px;width:288px;text-align:right;white-space:nowrap"><span style="color:${INK}">저장</span> <span style="color:${C}">·</span> 취소</div>`, 'ov-edit-lab');
    s = rep(s, `<div class="n" style="position:absolute;left:128px;top:429px;width:288px;text-align:right;font-size:12.5px;letter-spacing:.01em;white-space:nowrap">비닐하우스 탐지</div>`,
      `<div style="position:absolute;left:214px;top:425px;width:202px;height:22px;border:1px solid ${INK};padding:0 6px;font-size:12.5px;line-height:20px;letter-spacing:-.01em;text-align:right;white-space:nowrap">비닐하우스 탐지<span class="n" style="color:${C};margin-left:6px">7/100</span></div>`, 'ov-edit-name');
    s = rep(s, `<div class="n" style="position:absolute;left:128px;top:457px;width:288px;text-align:right;font-size:12.5px;letter-spacing:.01em;white-space:nowrap">Object Detection</div>`,
      `<div style="position:absolute;left:214px;top:453px;width:202px;height:22px;border:1px solid ${H};padding:0 6px;font-size:12.5px;line-height:20px;letter-spacing:-.01em;display:flex;align-items:center;justify-content:flex-end;gap:8px;white-space:nowrap">Object Detection ${chev()}</div>`, 'ov-edit-type');
    // 구성원 — 초대 인라인 행(원본 모달 3필드: 아이디 확인 → 이름 자동 · 역할)
    s = rep(s, /<div class="mic" style="position:absolute;left:472px;top:558px;width:896px;color:#686868">구성원 3의[^<]*<\/div>/.exec(s)[0],
      lab(472, 552, `초대 <span style="color:${C}">·</span> 인라인`) +
      box(552, 548, 220, 22, INK, `<span style="color:${C}">아이디(이메일) 입력</span>`) +
      `<div style="position:absolute;left:778px;top:548px;width:44px;height:22px;border:1px solid ${INK};display:flex;align-items:center;justify-content:center;font-size:12px;letter-spacing:-.014em">확인</div>` +
      txt(834, 552, `이름 <span style="color:${C}">— 확인 후 자동</span>`, 12, G) +
      box(980, 548, 110, 22, H, `<span style="color:${G}">역할 · 편집자</span><span style="flex:1"></span>${chev()}`) +
      `<div style="position:absolute;left:1100px;top:548px;width:52px;height:22px;border:1px solid ${INK};display:flex;align-items:center;justify-content:center;font-size:12px;letter-spacing:-.014em">초대</div>` +
      mic(1164, 552, 204, `표는 비움 — 담당자명 금지(§5)`, 'white-space:nowrap'), 'ov-invite');
    // 히스토그램 → 데이터 요약(실 썸네일 2) — 924–1384 · 640–760
    const hStart = s.indexOf('<div class="lab" style="position:absolute;left:924px;top:640px');
    const hEndMarker = '<div class="mic" style="position:absolute;left:924px;top:732px;white-space:nowrap;color:#686868"></div>';
    const hEnd = s.indexOf(hEndMarker) + hEndMarker.length;
    if (hStart < 0 || hEnd < hStart) throw new Error('histogram block not found');
    s = s.slice(0, hStart) +
      lab(924, 640, `데이터 요약 — 파일 <span class="n" style="color:${INK}">10</span> · 데이터셋 <span class="n" style="color:${INK}">2</span>`) +
      `<div class="mic" style="position:absolute;left:924px;top:640px;width:460px;text-align:right;white-space:nowrap;color:${INK}">데이터 탭 <span style="color:${G}">›</span></div>` +
      img(924, 662, 120, 72, 'tile-arc-a.jpg') + img(1052, 662, 120, 72, 'tile-gh-clean.jpg') +
      num(924, 738, '남원 농경지 2025.04', 11, G) + num(1052, 738, '남원 농경지 2025.06', 11, G) +
      txt(1188, 664, `정사영상 도엽 <span class="n">10</span> · GSD <span class="n">0.011 – 2.00</span> m/px`, 12) +
      txt(1188, 684, `데이터셋 <span class="n">v1.0</span> × 2 (<span class="n">1,469 · 205</span>)${tag('추정')}`, 12) +
      txt(1188, 704, `라벨 수 — 도엽 단위 집계 없음`, 12, G) +
      txt(1188, 724, `대표 이미지 = 도엽 1(자동)`, 12, G) +
      s.slice(hEnd);
    // 하단 메모 폭 축소 + 최근 활동(기록된 시각만)
    s = rep(s, '<div style="position:absolute;left:456px;top:776px;width:928px;border-left:1px dotted #CCCCCC;padding-left:10px">', '<div style="position:absolute;left:456px;top:776px;width:444px;border-left:1px dotted #CCCCCC;padding-left:10px">');
    s = rep(s, '<div class="mic" style="position:absolute;left:456px;top:830px;width:928px;color:#686868">Data source', '<div class="mic" style="position:absolute;left:456px;top:830px;width:444px;color:#686868;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Data source');
    s = rep(s, `<div style="position:absolute;left:72px;top:866px;width:1368px;height:1px;background:#DDDDDD"></div>`,
      lab(924, 776, `최근 활동 — 기록된 시각만(활동 로그 없음)`) +
      hl(924, 794, 460) +
      num(924, 800, '2026-06-06', 12, INK) + txt(1004, 800, `분석 결과 저장 — 남원시 비닐하우스 조사 2025 · <span class="n">1,674</span> 필지`, 12) +
      num(924, 818, '2025-07', 12, INK) + txt(1004, 818, `최근 학습 — <span class="n">best(Vinylhouse).pt</span>`, 12) +
      num(924, 836, '—', 12, C) + txt(1004, 836, `등록일시 · 대장에 없음`, 12, G) +
      `<div style="position:absolute;left:72px;top:866px;width:1368px;height:1px;background:#DDDDDD"></div>`, 'ov-activity');
    s = s.replace(BADGE5, BADGE4);
    s = s.replace('라벨링 3 · 학습 5 · 배포 1 = 원본 시드(시연)', '라벨링 3 · 배포 1 = 원본 시드(시연) · 학습 4 = 시연 시드 정정(§15)');
    wr('B5-Project-Overview.dc.html', s);
  } else console.log('skip B5-Project-Overview (done)');
}

/* ───────── 3. B5-Project-Data — 툴바 재배치 · 파일 추가 드로어(열림) · 데이터셋 표 폭 · 데이터셋 상세 ───────── */
{
  let s = rd('B5-Project-Data.dc.html');
  if (!s.includes('아카이브 목록에서 선택')) {
    // 마스트헤드 우측 텍스트 · 메모 — 드로어 밖으로
    s = rep(s, '<div class="n" style="position:absolute;left:128px;top:84px;width:1256px;text-align:right;', '<div class="n" style="position:absolute;left:128px;top:84px;width:812px;text-align:right;');
    s = rep(s, '<div class="mic" style="position:absolute;text-align:right;left:764px;top:131px;width:620px;color:#686868">헤더 접힘 96', '<div class="mic" style="position:absolute;text-align:right;left:660px;top:131px;width:280px;color:#686868">헤더 접힘 96');
    // 툴바: 전체(352,80) · 데이터명(440,96) · 검색어(544,100) · 초기화 652 · 검색 712 · 선택 제외 780 · 파일 추가 864(채움 = 열린 드로어의 트리거)
    const tStart = s.indexOf('<div style="position:absolute;left:352px;top:176px;width:96px');
    const tEnd = s.indexOf('<div style="position:absolute;left:128px;top:216px;width:1256px;height:1px');
    if (tStart < 0 || tEnd < tStart) throw new Error('toolbar not found');
    s = s.slice(0, tStart) +
      sel(352, 176, 80, '전체') + sel(440, 176, 96, '데이터명') +
      box(544, 176, 100, 28, H, `<span style="color:${C}">검색어</span>`) +
      btn(652, 176, 52, '초기화') + btn(712, 176, 52, '검색', 'ink') +
      btn(780, 176, 76, `<span>선택 제외&nbsp;<span class="n" style="color:${INK}">1</span></span>`) +
      btn(864, 176, 84, '파일 추가', 'fill') +
      s.slice(tEnd);
    // 데이터셋 표 — 폭 812(드로어 밖) · 첫 행 선택
    s = s.replace(/left:128px;top:(636|664|688|720|748)px;width:1256px/g, 'left:128px;top:$1px;width:812px');
    s = rep(s, 'left:672px;top:672px;width:120px', 'left:560px;top:672px;width:80px');
    s = rep(s, 'left:812px;top:672px;width:240px', 'left:660px;top:672px;width:120px');
    s = rep(s, 'left:1084px;top:672px;width:300px', 'left:800px;top:672px;width:140px');
    s = s.replace(/left:672px;top:(697|725)px;width:120px/g, 'left:560px;top:$1px;width:80px');
    s = s.replace(/left:812px;top:(697|725)px;width:240px/g, 'left:660px;top:$1px;width:120px');
    s = s.replace(/left:1084px;top:(697|725)px;width:300px/g, 'left:800px;top:$1px;width:140px');
    s = rep(s, '<div style="position:absolute;left:128px;top:697px;width:520px;white-space:nowrap;overflow:hidden"><span style="font-size:13.5px;letter-spacing:-.01em">비닐하우스 단동 라벨셋</span>',
      `<div style="position:absolute;left:128px;top:697px;width:420px;white-space:nowrap;overflow:hidden"><span style="font-size:13.5px;letter-spacing:-.01em;border-bottom:1px solid ${INK}">비닐하우스 단동 라벨셋</span>`);
    s = rep(s, '<div style="position:absolute;left:128px;top:725px;width:520px;', '<div style="position:absolute;left:128px;top:725px;width:420px;');
    // 하단 메모 2블록 → 데이터셋 상세(선택 행) + 만들기 드로어 필드 한 줄
    const nStart = s.indexOf('<div style="position:absolute;left:128px;top:762px;width:620px;border-left');
    const nEnd = s.indexOf('<div style="position:absolute;left:72px;top:866px');
    if (nStart < 0 || nEnd < nStart) throw new Error('notes not found');
    const ghost = (x, y, w) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:10px;border:1px dotted ${C}"></div>\n`;
    s = s.slice(0, nStart) +
      lab(128, 762, `선택 데이터셋 — 비닐하우스 단동 라벨셋 <span class="n">v1.0</span> · 라벨 <span class="n" style="color:${INK}">1,469</span> · 도엽 <span class="n" style="color:${INK}">4</span>`) +
      txt(128, 784, '학습 : 검증', 12, G) + ghost(214, 787, 190) + txt(412, 784, `학습 시 지정 — 기본 <span class="n">80 : 20</span>`, 12, G) +
      txt(128, 806, '클래스 분포', 12, G) + `<div style="position:absolute;left:214px;top:809px;width:190px;height:10px;background:${INK}"></div>` + txt(412, 806, `비닐하우스_단동 <span class="n" style="color:${INK}">1,469</span> · 100 %`, 12, G) +
      lab(640, 762, '샘플 — 주생면 도엽 3') +
      img(640, 780, 92, 46, 'tile-gh-clean.jpg') + img(740, 780, 92, 46, 'pj-hero.jpg') + img(840, 780, 92, 46, 'tile-done-ecw.jpg') +
      mic(128, 830, 812, `<span style="color:${INK}">데이터셋 만들기</span> = 같은 우측 드로어(지금은 닫힘): 데이터셋명* · 버전* · 라벨링 데이터 선택 표(체크 · 이름 · 파일 · 라벨 n · 날짜) · 취소 / 만들기 — 원본 별도 페이지를 드로어로 · <span style="color:${INK}">선택 삭제</span>는 표 머리 우측`, 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis') +
      mic(128, 848, 812, `일탈 1회 — 파일 추가 드로어가 우·하 마진을 뚫고 4–5열(도엽 4·5·9·10)을 덮는다 · 구현은 드로어가 열리면 그리드가 3열로 물러난다(B5-DataMgmt §13.6과 같음)`, `white-space:nowrap;color:${C}`) +
      s.slice(nEnd);
    // 파일 추가 드로어 480 (960–1440 · 64–900)
    const rows = [
      ['남원 정사영상 2026-04 A구역', '정사영상', '2026.04.10 · 1.08 cm · 47.6 GB', true, false, true],
      ['운봉읍 드론 정사영상 2026-04', '정사영상', '2026.04.08 · 1.69 cm', true, false, true],
      ['남원 전역 2025.10', '정사영상', '2025-10 · 2.00 m/px · 남원 전역', false, true, false],
      ['국산리 드론 A68 2025.08', '정사영상', '2025-08 · 0.05 m/px', false, true, false],
      ['남원 도로파손 라벨 셰입 2026-04', '공간정보', '2026.04 · 좌표계 없음 · 미리보기 없음', false, false, true],
      ['순찰차량 도로영상 2026-04', '이미지셋', '2026.04.12 · 4,820장', false, false, true],
      ['여수 해양쓰레기 조사 2026', '공간정보', '2026 · 86 셀 · EPSG:5186', false, false, false],
      ['제주 항공 정사영상 2020.12', '정사영상', '2020-12 · 0.10 m/px', false, true, false],
    ];
    let d = `<div style="position:absolute;left:960px;top:64px;width:480px;height:836px;background:#FFFFFF"></div>\n` + vl(960, 64, 836, INK) +
      `<div style="position:absolute;left:984px;top:82px;"><span class="d" style="font-size:20px;line-height:26px">파일 추가</span></div>\n` +
      `<div style="position:absolute;left:1404px;top:86px;"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${G}" stroke-width="1.3"><path d="M.75.75l10.5 10.5M11.25.75.75 11.25"/></svg></div>\n` +
      mic(984, 114, 432, `아카이브 목록에서 선택 — 이미 올라온 자산만 고른다(새 업로드 없음) · <span class="n" style="color:${INK}">8</span>건`, 'white-space:nowrap') +
      hl(984, 138, 432) +
      sel(984, 150, 92, '유형 · 전체') + box(1084, 150, 220, 28, H, `<span style="color:${C}">검색어</span>`) + btn(1312, 150, 48, '초기화') + btn(1368, 150, 48, '검색', 'ink') +
      hl(984, 192, 432);
    let y = 200;
    for (const [name, type, meta, on, added, demo] of rows) {
      const dim = added;
      d += chk(984, y + 12, on) +
        `<div style="position:absolute;left:1010px;top:${y + 6}px;width:330px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="font-size:13px;letter-spacing:-.01em;color:${dim ? C : INK}">${name}</span>${demo ? tag('시연') : ''}</div>\n` +
        num(1010, y + 26, meta, 11, dim ? C : G) +
        `<span class="chip" style="position:absolute;left:1340px;top:${y + 8}px;color:${dim ? C : G};border-color:${H}">${dim ? '추가됨' : type}</span>\n` +
        hl(984, y + 47, 432);
      y += 48;
    }
    d += `<div style="position:absolute;left:984px;top:${y + 8}px;font-size:12.5px;letter-spacing:-.014em;color:${G};white-space:nowrap">처음 <span style="padding:0 6px"></span>이전 <span style="padding:0 6px"></span><span class="n" style="display:inline-block;width:20px;height:20px;border:1px solid ${INK};text-align:center;line-height:18px;color:${INK}">1</span><span style="padding:0 6px"></span> 다음 <span style="padding:0 6px"></span>마지막</div>\n` +
      `<div class="n" style="position:absolute;left:984px;top:${y + 10}px;width:432px;text-align:right;font-size:12px;color:${G}">총 8건 중 1–8행 · 페이지 크기 10</div>\n` +
      mic(984, y + 40, 432, `추가됨 = 이 프로젝트 파일 목록에 이미 있는 자산(감쇠 · 선택 불가) · 체크 2 = <span style="color:${INK}">선택 2건</span>`, 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis') +
      `<div style="position:absolute;left:984px;top:845px;"><span style="font-size:13.5px;line-height:18px;letter-spacing:-.014em;color:${G}">취소</span></div>\n` +
      `<div style="position:absolute;left:1308px;top:836px;width:108px;height:36px;border:1px solid ${INK};display:flex;align-items:center;justify-content:center;font-size:12.5px;letter-spacing:-.014em;color:${INK};white-space:nowrap">추가 <span class="n" style="margin-left:6px">2</span></div>\n`;
    s = rep(s, '\n</div>\n</x-dc>', '\n' + d + '</div>\n</x-dc>', 'data-close');
    s = s.replace(BADGE5, BADGE4);
    wr('B5-Project-Data.dc.html', s);
  } else console.log('skip B5-Project-Data (done)');
}

/* ───────── 4. B5-Project-Train — 새 판 ───────── */
{
  const data = rd('B5-Project-Data.dc.html');
  const headEnd = data.indexOf('<div style="position:absolute;left:352px;top:176px;width:80px'); // 툴바 첫 요소 앞까지가 아니라 세그먼트부터 잘라야 한다
  const segStart = data.indexOf('<div style="position:absolute;left:128px;top:176px;width:88px');
  if (segStart < 0) throw new Error('segment start not found');
  let head = data.slice(0, segStart);
  head = head.replace('<span class="d" style="font-size:14.5px;color:#010102">데이터</span><span class="n" style="font-size:12px;letter-spacing:.02em;color:#010102">10</span></div><div style="position:absolute;left:192px;top:158px;width:103px;height:2px;background:#010102"></div>',
    '<span class="d" style="font-size:14.5px;color:#686868">데이터</span><span class="n" style="font-size:12px;letter-spacing:.02em;color:#CCCCCC">10</span></div>');
  head = head.replace('<span class="d" style="font-size:14.5px;color:#686868">학습</span><span class="n" style="font-size:12px;letter-spacing:.02em;color:#CCCCCC">4</span></div>',
    `<span class="d" style="font-size:14.5px;color:#010102">학습</span><span class="n" style="font-size:12px;letter-spacing:.02em;color:#010102">4</span></div><div style="position:absolute;left:390px;top:158px;width:80px;height:2px;background:${INK}"></div>`);
  head = head.replace('헤더 접힘 96 — 프로젝트명 24 + 탭만(원본 3겹 레일 667px → 레일 72 한 겹)', '학습 탭 — 지도 없음 · 상태 열 4 · 카드 클릭 = 결과 드로어');
  head = head.replace('Object Detection · 정사영상 · 도엽 10 · 결과 1,674 필지', 'Object Detection · 정사영상 · 도엽 10 · 학습 4 · 기반 모델 XI-VFM v2.1 고정');
  if (!head.includes('top:158px;width:80px')) throw new Error('train tab swap failed');

  let b = '';
  // 툴바
  b += btn(128, 176, 120, '새로 학습하기', 'fill');
  b += box(260, 176, 160, 28, H, `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="${G}" stroke-width="1.5" style="flex:none"><circle cx="8.5" cy="8.5" r="5.75"/><path d="m12.75 12.75 4 4"/></svg><span style="color:${C}">학습명</span>`);
  b += mic(436, 184, 300, `학습 이력 <span class="n" style="color:${INK}">4</span> — 대기 1 · 진행 1 · 완료 2 · 실패 0${tag('시연')}`, 'white-space:nowrap');
  b += hl(128, 216, 812);
  // 상태 열 4
  const cols = [[128, '대기', 1], [331, '진행', 1], [534, '완료', 2], [737, '실패', 0]];
  for (const [x, name, n] of cols) {
    b += `<div style="position:absolute;left:${x}px;top:232px;"><span class="d" style="font-size:14.5px;line-height:20px">${name}</span><span class="n" style="font-size:12px;letter-spacing:.02em;color:${n ? INK : C};margin-left:8px">${n}</span></div>\n`;
    b += hl(x, 256, 191, INK);
  }
  const card = (x, y, name, l1, l2, l3, opts = {}) => {
    let s = '';
    if (opts.sel) s += brk(x, y, 191, 108, INK, 12);
    s += `<div style="position:absolute;left:${x + 10}px;top:${y + 12}px;width:171px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span class="d" style="font-size:13.5px;line-height:18px">${name}</span></div>\n`;
    s += num(x + 10, y + 36, l1, 11, G) + num(x + 10, y + 54, l2, 11, opts.sel ? INK : G) + num(x + 10, y + 72, l3, 11, G);
    if (opts.word) s += `<div class="mic" style="position:absolute;left:${x + 10}px;top:${y + 90}px;white-space:nowrap;color:${INK}">${opts.word}</div>\n`;
    s += hl(x, y + 108, 191);
    return s;
  };
  b += card(128, 266, '학습 #5', '시작 2026.06.11 22:30 · 소요 —', '라벨 4,200 · IoU — · F1 —', 'XI-VFM v2.1 · 에폭 — · 배치 —', { word: '대기 — 앞에 진행 1' });
  b += card(331, 266, '학습 #4', '시작 2026.06.11 21:45 · 소요 —', '라벨 4,200 · IoU — · F1 —', 'XI-VFM v2.1 · 에폭 — · 배치 —', { word: '진행 중 · 경과 —' });
  b += card(534, 266, '비닐하우스 v2.0', '시작 2026.04.15 08:50 · 소요 —', 'IoU <b style="font-weight:400">0.84</b> · F1 0.89 · 라벨 3,450', 'XI-VFM v2.1 · 에폭 100 · 배치 16', { sel: true, word: '완료 · 결과 드로어 열림 ›' });
  b += card(534, 386, '비닐하우스 v1.0', '시작 2026.03.20 · 소요 —', 'IoU 0.76 · F1 0.81 · 라벨 1,800', 'XI-VFM v2.1 · 에폭 — · 배치 —', { word: '완료' });
  b += `<div style="position:absolute;left:737px;top:266px;width:191px;height:108px;border:1px dashed ${C}"></div>\n`;
  b += mic(749, 292, 170, `실패 없음 — 실패 시 이 열에 <span style="color:${INK}">앰버 브래킷</span> + 사유 원문 1줄(원본 상태칩 → 말)`, 'line-height:17px');
  b += mic(128, 512, 812, `카드 = 원본 이력 카드 7필드(이름 · 상태 · 시작 · 소요 · 라벨 · IoU · F1) + 기반 모델 · 에폭/배치 — 값 없는 칸은 —, 지어내지 않는다`, 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
  b += hl(128, 540, 812);
  // 인셋 — 라벨링/분석 풀블리드 모드 320×200
  const ix = 128, iy = 560, iw = 320, ih = 200;
  b += lab(ix, iy - 6 + 0, '라벨링 · 분석 = 풀블리드 모드(T6) — 320 축소', '');
  const top = iy + 16;
  b += `<div style="position:absolute;left:${ix}px;top:${top}px;width:${iw}px;height:${ih}px;border:1px solid ${H};overflow:hidden;background:#FFFFFF">` +
    `<div style="position:absolute;left:0;top:0;width:16px;height:${ih}px;border-right:1px solid ${H}"></div>` +
    [30, 50, 70, 90, 110].map(t => `<div style="position:absolute;left:5px;top:${t}px;width:6px;height:6px;border:1px solid ${C}"></div>`).join('') +
    `<div style="position:absolute;left:5px;top:70px;width:6px;height:6px;background:${INK}"></div>` +
    `<div style="position:absolute;left:17px;top:0;width:${iw - 17}px;height:14px;border-bottom:1px solid ${H}"></div>` +
    `<div style="position:absolute;left:24px;top:5px;width:40px;height:4px;background:${INK}"></div>` +
    [70, 84, 98, 112, 126, 140].map(l => `<div style="position:absolute;left:${l}px;top:5px;width:10px;height:4px;background:${C}"></div>`).join('') +
    `<div style="position:absolute;left:17px;top:15px;width:${iw - 17}px;height:${ih - 15}px;overflow:hidden"><img src="pj-hero.jpg" alt="" style="position:absolute;left:-40px;top:-20px;width:${iw + 60}px;height:${ih + 40}px;object-fit:cover;display:block"></div>` +
    `<svg width="${iw}" height="${ih}" viewBox="0 0 ${iw} ${ih}" style="position:absolute;left:0;top:0"><rect x="140" y="60" width="70" height="26" fill="rgba(15,169,160,.12)" stroke="${TEAL}" stroke-width="1"/><rect x="138" y="90" width="76" height="26" fill="rgba(15,169,160,.12)" stroke="${TEAL}" stroke-width="1"/><rect x="146" y="120" width="70" height="22" fill="rgba(15,169,160,.12)" stroke="${TEAL}" stroke-width="1"/></svg>` +
    `<div style="position:absolute;left:17px;top:15px;width:72px;height:${ih - 15}px;background:#FFFFFF;border-right:1px solid ${INK}"></div>` +
    [30, 54, 78].map(t => `<div style="position:absolute;left:24px;top:${t}px;width:58px;height:16px;border-bottom:1px solid ${H}"></div><div style="position:absolute;left:24px;top:${t + 4}px;width:34px;height:3px;background:${INK}"></div><div style="position:absolute;left:24px;top:${t + 10}px;width:48px;height:2px;background:${C}"></div>`).join('') +
    `<div style="position:absolute;left:${iw - 72}px;top:15px;width:72px;height:${ih - 15}px;background:#FFFFFF;border-left:1px solid ${INK}"></div>` +
    [28, 42, 56, 70, 84, 98, 112, 126].map((t, i) => `<div style="position:absolute;left:${iw - 66}px;top:${t}px;width:60px;height:12px;border-bottom:1px solid ${H}"></div><div style="position:absolute;left:${iw - 66}px;top:${t + 3}px;width:5px;height:5px;border:1px solid ${INK}"></div><div style="position:absolute;left:${iw - 57}px;top:${t + 4}px;width:${i % 2 ? 26 : 34}px;height:3px;background:${INK}"></div>`).join('') +
    `<div style="position:absolute;left:${iw - 66}px;top:${ih - 22}px;width:60px;height:12px;background:${INK}"></div>` +
    [26, 40, 54, 68].map(t => `<div style="position:absolute;left:${iw - 88}px;top:${t}px;width:12px;height:12px;background:#FFFFFF;border:1px solid ${H}"></div>`).join('') +
    `</div>\n`;
  b += mic(ix, top + ih + 6, 320, `헤더 접힘 · 레일 72 + 지도 <span class="n" style="color:${INK}">1,384</span> · 좌 드로어 320 = 영상 목록 3(라벨링) / 픽커 3단(분석) · 우 드로어 320 = 라벨 목록(체크 · 클래스 · #n · 작성자 · 형태 · ×) + <span style="color:${INK}">클래스 일괄 변경</span> · 상단 툴바 8(사각형 · 원형 · 폴리곤 · 도형 복사 · 공간 정보 불러오기 · 실행 취소 · 저장 · 닫기) · 우측 플로팅 지도 툴바 — 라벨링 아트보드는 다음 판`, 'line-height:16px');
  // 새로 학습하기 드로어(닫힘) — 폼 필드
  const fx = 480, fy = 560;
  b += lab(fx, fy - 6, `새로 학습하기 = 같은 우측 드로어(지금은 결과 드로어가 열려 있음) — 폼 필드 원본 1:1`);
  const rowsF = [
    ['학습명 *', '예: 학습 #6', C], ['기반 모델(백본)', 'XI-VFM v2.1 · 고정 — 이 과제는 위 기반 모델 위에서 학습', INK],
    ['이전 학습 이어가기', '없음 (새로 시작) ▾ — 이 과제의 이전 결과를 이어받아 추가 학습(선택)', G],
    ['데이터셋 *', '선택 ▾ — 데이터 탭에서 만든 데이터셋 1개만', G], ['탐지 형태', 'Object Detection — 프로젝트 설정을 따름(변경 불가)', INK],
    ['고급 옵션 ›', '입력 크기 640×640 · 학습:검증 80:20 · 배치 16 · 에폭 100 · IoU 0.5 · Confidence 0.25', G],
    ['', `취소 · <span style="color:${INK}">학습 시작</span> — 필수 2필드 미입력 시 비활성`, G],
  ];
  let fyy = fy + 16;
  for (const [k, v, col] of rowsF) {
    b += lab(fx, fyy + 4, k) + `<div class="n" style="position:absolute;left:${fx + 130}px;top:${fyy + 3}px;width:330px;font-size:12px;letter-spacing:.01em;color:${col};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v}</div>\n` + hl(fx, fyy + 24, 460);
    fyy += 26;
  }
  b += mic(fx, fyy + 6, 460, `추가 기능 없음 확인 — 상태 열 4 = 원본 상태칩 3(대기중 · 진행중 · 완료)의 재배치 + 실패(Prefect 어휘) · 검색 = 학습명 · 카드 클릭 = 결과 드로어(원본과 같음) · 취소/재시작 · 로그 보기 · 비교는 원본에 없어 <span style="color:${INK}">넣지 않았다</span>`, 'line-height:16px');
  // 학습 결과 드로어 480
  let d = `<div style="position:absolute;left:960px;top:64px;width:480px;height:836px;background:#FFFFFF"></div>\n` + vl(960, 64, 836, INK) +
    `<div style="position:absolute;left:984px;top:82px;"><span class="d" style="font-size:20px;line-height:26px">학습 결과</span></div>\n` +
    `<div style="position:absolute;left:1404px;top:86px;"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${G}" stroke-width="1.3"><path d="M.75.75l10.5 10.5M11.25.75.75 11.25"/></svg></div>\n` +
    mic(984, 114, 432, `비닐하우스 v2.0 · 완료 · 원본 드로어 5섹션 그대로${tag('시연')}`, 'white-space:nowrap') + hl(984, 138, 432);
  const kv2 = (y, a, b1, c, d1) => `<div style="position:absolute;left:984px;top:${y}px;font-size:12px;letter-spacing:-.01em;color:${G};white-space:nowrap">${a}</div><div class="n" style="position:absolute;left:1090px;top:${y}px;font-size:12.5px;letter-spacing:.01em;white-space:nowrap">${b1}</div>` +
    (c ? `<div style="position:absolute;left:1220px;top:${y}px;font-size:12px;letter-spacing:-.01em;color:${G};white-space:nowrap">${c}</div><div class="n" style="position:absolute;left:1316px;top:${y}px;font-size:12.5px;letter-spacing:.01em;white-space:nowrap">${d1}</div>` : '') + '\n';
  d += lab(984, 150, '학습 정보');
  d += kv2(170, '학습명', '비닐하우스 v2.0', '상태', '완료');
  d += kv2(192, '학습 시작', '2026.04.15 08:50', '소요 시간', `<span style="color:${C}">—</span>`);
  d += kv2(214, '라벨 수', '3,450', '클래스 수', '2');
  d += hl(984, 238, 432);
  d += lab(984, 250, '학습 설정');
  d += txt(984, 270, '구성 라벨링 데이터', 12, G) + txt(1090, 270, `주생면 1구역 정사영상 <span style="color:${C}">·</span> 주생면 2구역 정사영상`, 12.5);
  d += kv2(292, '기반 모델(백본)', 'XI-VFM v2.1', '입력 크기', '640 × 640');
  d += kv2(314, '이전 학습', '없음 (새로 시작)', '탐지 형태', 'Object Detection');
  d += kv2(336, '학습 : 검증', '80 : 20', '배치 크기', '16');
  d += kv2(358, '에폭', '100', 'IoU · Conf', '0.5 · 0.25');
  d += hl(984, 382, 432);
  d += lab(984, 394, '학습 결과');
  d += `<div class="n" style="position:absolute;left:984px;top:412px;font-size:32px;line-height:36px;letter-spacing:-.01em;color:${ACC}">0.84</div>` + txt(984, 452, '영역 일치도 (IoU)', 12, G);
  d += `<div class="n" style="position:absolute;left:1120px;top:412px;font-size:32px;line-height:36px;letter-spacing:-.01em;color:${INK}">0.89</div>` + txt(1120, 452, '종합 정확도 (F1)', 12, G);
  d += num(1256, 424, '검증 셋 20 % 기준 · 시드 값', 11, G) + num(1256, 440, 'v1.0 대비 IoU +0.08 · F1 +0.08', 11, G);
  d += hl(984, 474, 432);
  d += lab(984, 486, '클래스별 성능 — Precision · Recall · F1');
  for (const [i, cname] of ['비닐하우스_단동', '비닐하우스_다동'].entries()) {
    const y = 508 + i * 22;
    d += txt(984, y, cname, 12) + `<div style="position:absolute;left:1120px;top:${y + 4}px;width:220px;height:10px;border:1px dotted ${C}"></div>` + num(1350, y + 1, '— · — · —', 11, C);
  }
  d += mic(984, 554, 432, `점선 = 값 없음 — 모델 대장에 클래스별 지표가 없다(원본 표의 숫자는 도로안전 데모) · 있으면 헤어라인 막대 + 소수 3자리`, 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
  d += hl(984, 576, 432);
  d += lab(984, 588, '오분류 행렬 — 행 = 실제 · 열 = 예측 · 값 = 라벨 수');
  const cls = ['단동', '다동', '배경'];
  const gx = 984, gy = 608, cw = 96, ch = 22, hw = 80;
  d += `<div style="position:absolute;left:${gx + hw}px;top:${gy}px;width:${cw * 3}px;height:${ch}px;display:flex">` + cls.map(c => `<div class="n" style="width:${cw}px;text-align:center;font-size:11px;line-height:${ch}px;color:${G}">예측 ${c}</div>`).join('') + '</div>\n';
  for (const [r, c] of cls.entries()) {
    const y = gy + ch * (r + 1);
    d += hl(gx, y, hw + cw * 3) + `<div class="n" style="position:absolute;left:${gx}px;top:${y}px;width:${hw}px;font-size:11px;line-height:${ch}px;color:${G}">실제 ${c}</div>`;
    for (let k = 0; k < 3; k++) d += `<div class="n" style="position:absolute;left:${gx + hw + cw * k}px;top:${y}px;width:${cw}px;text-align:center;font-size:12px;line-height:${ch}px;color:${r === k ? INK : C}">${r === k ? '—' : '—'}</div>`;
    d += '\n';
  }
  d += hl(gx, gy + ch * 4, hw + cw * 3);
  for (let k = 0; k <= 3; k++) d += vl(gx + hw + cw * k, gy + ch, ch * 3);
  d += mic(984, gy + ch * 4 + 8, 432, `대각선 = 맞춘 수(잉크) · 나머지 = 오분류(회색) — 시드 없음이라 전부 — · 5×5 원본 표를 클래스 2 + 배경 = 3×3 로`, 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
  d += `<div style="position:absolute;left:984px;top:845px;"><span style="font-size:13.5px;line-height:18px;letter-spacing:-.014em;color:${G}">닫기</span></div>\n`;
  d += `<div class="mic" style="position:absolute;left:1100px;top:846px;width:316px;text-align:right;white-space:nowrap;color:${C}">배포 탭의 발행 폼에서 이 결과를 고른다(원본 픽커)</div>\n`;

  const foot = `<div style="position:absolute;left:72px;top:866px;width:888px;height:1px;background:${H}"></div><div class="mic" style="position:absolute;left:128px;top:876px;white-space:nowrap">LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부</div>\n`;
  wr('B5-Project-Train.dc.html', head + b + foot + d + '</div>\n</x-dc>\n</body>\n</html>\n');
}
