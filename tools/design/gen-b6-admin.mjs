// B6-Admin-* 아트보드 생성기 — 서비스 관리 5페이지(공지사항 · 문의 · FAQ · 사용자 · 지도 속성), 원본 landxi7/admin-*.html 1:1(기능 추가 0).
// 셸 = B5(레일 72 · 마스트헤드 64 · H1 34 + 파랑 4px 룰 · 푸터). 레일 활성 = 서비스 관리. 원본 admin-tabnav 5탭 = H1 행 우측 탭(빨간 숫자 = 조치 필요 건수).
// 권장 구조 = SPLIT 작업공간: 좌 목록(원장) + 우 작업 패널(열람·폼·답변) — 원본의 목록→상세 페이지 전환을 한 화면으로 접는다. 기능·라벨·시드는 원본 그대로.
// 사람 이름·이메일·전화는 원본 데모 시드를 **마스킹**(성 + ○○ · 앞 2자 + *** · 끝 4자리 ****)하고 `시연` 을 단다. 기준일 = 시드 최신일 2026.04.23.
// usage: node tools/design/gen-b6-admin.mjs   (repo root) — 멱등. 렌더: node design-canvas/v2/render.mjs B6-Admin-Users-Opt2 …
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const OUTDIR = path.join(root, 'design-canvas/v2');
const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', TEAL = '#0FA9A0', WARN = '#D1352B';
const W = 1440, HT = 900, X0 = 128, CW = 1256, XR = 1384;
const BAND_Y = 174, RULE1 = 254, SEARCH_Y = 266, LIST_Y = 318, BOT = 838;
const SP = { L: { x: 128, w: 740 }, R: { x: 908, w: 476 }, div: 888 };          // 기본 분할(목록 넓음 · 패널 좁음)
const FOCUS_Y = 174;                                                            // 폼 상태 = 밴드·검색 행을 걷고 작업공간을 위로 올린다(원본도 폼 뷰에서 목록·검색을 숨긴다)
const SF = { L: { x: 128, w: 560 }, R: { x: 728, w: 656 }, div: 708 };          // 폼 분할(목록 축약 · 폼 넓음)
const TODAY = '2026-04-23';

const svg = (d, size = 16, color = ACC, extra = '') => `<svg style="color:${color};flex:none;display:block${extra}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter">${d}</svg>`;
const IC = {
  mark: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M8.5 8.5h3v3h-3z" fill="currentColor" stroke="none"/>',
  dash: '<path d="M3 3h14v14H3z"/><path d="M3 8.5h14M10.5 8.5V17"/>',
  data: '<path d="M3 3h10v10H3z"/><path d="M7 7h10v10H7z"/>',
  proj: '<path d="M2.5 2.5h5v5h-5z"/><path d="M12.5 2.5h5v5h-5z"/><path d="M7.5 12.5h5v5h-5z"/><path d="M7.5 5h5M15 7.5v4H10v1"/>',
  anal: '<path d="M3 3h14v14H3z"/><path d="M3 10h14" stroke-dasharray="2 2"/><path d="M6 5.5h3v3H6z"/><path d="M11.5 11.5h3.5v3.5h-3.5z"/>',
  map: '<path d="M4.5 4.5h11v11h-11z"/><path d="M10 1v18M1 10h18"/>',
  sup: '<path d="M3 3h14v9.5H8.5L4.5 17v-4.5H3z"/><path d="M6.5 7.5h7"/>',
  pub: '<path d="M3 6h10v11H3z"/><path d="M9 11 17 3M12 3h5v5"/>',
  adm: '<path d="M6 3v14M14 3v14"/><path d="M4 6.5h4v2.5H4z"/><path d="M12 11h4v2.5h-4z"/>',
  my: '<path d="M3 3h14v14H3z"/><path d="M8 6h4v4H8z"/><path d="M5.5 17v-3h9v3"/>',
  out: '<path d="M11 3H3.5v14H11"/><path d="M8.5 10H17M13.5 6.5 17 10l-3.5 3.5"/>',
  notice: '<path d="M3 3.5h14v9H3z"/><path d="M6 12.5V17"/><path d="M6 7h8M6 9.5h5"/>',
  user: '<path d="M7 3.5h6v6H7z"/><path d="M3.5 17v-4.5h13V17"/>',
  mail: '<path d="M3 4.5h14v11H3z"/><path d="M3 5l7 6 7-6"/>',
  faq: '<path d="M3 3h14v14H3z"/><path d="M6 7h8M6 10h8M6 13h5"/>',
  search: '<path d="M4 4h9v9H4z"/><path d="M13 13l4 4"/>',
  clip: '<path d="M6 3h8v14H6z"/><path d="M9 6h2v6H9z"/>',
  check: '<path d="M4 10.5 8.5 15 16 5.5"/>',
  layers: '<path d="M10 3 17 7l-7 4-7-4z"/><path d="M3 11l7 4 7-4"/>',
  x: '<path d="M4.5 4.5l11 11M15.5 4.5l-11 11"/>',
  clock: '<path d="M3 3h14v14H3z"/><path d="M10 6v4.5h3.5"/>',
};

// ---------- 공용 부품 ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dt = (iso, n = 16) => iso ? iso.replace('T', ' ').replace(/-/g, '.').substring(0, n) : '-';
const hl = (x, y, w, col = H) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:1px;background:${col}"></div>`;
const vl = (x, y, h, col = H) => `<div style="position:absolute;left:${x}px;top:${y}px;width:1px;height:${h}px;background:${col}"></div>`;
const box = (x, y, w, h, style, inner) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;${h ? `height:${h}px;` : ''}${style || ''}">${inner || ''}</div>`;
const demo = `<span class="chip" style="height:22px;line-height:20px;padding:0 7px">시연</span>`;
const corners = (c = INK, s = 9, t = 1.5) => [['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']].map(([a, b]) => `<span style="position:absolute;${a}:0;${b}:0;width:${s}px;height:${s}px;border-${a}:${t}px solid ${c};border-${b}:${t}px solid ${c}"></span>`).join('');
const btn1 = (label, w, h = 38, extra = '') => `<span style="display:inline-flex;align-items:center;justify-content:center;gap:8px;height:${h}px;${w ? `width:${w}px;` : 'padding:0 22px;'}background:${INK};color:#FFFFFF;font-size:16px;font-weight:500;letter-spacing:-.01em;white-space:nowrap;flex:none;${extra}">${label}</span>`;
const btn2 = (label, w, h = 38, col = INK, extra = '') => `<span style="position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:${h}px;${w ? `width:${w}px;` : 'padding:0 18px;'}color:${col};font-size:16px;font-weight:500;letter-spacing:-.01em;white-space:nowrap;flex:none;${extra}">${corners(col)}${label}</span>`;
const btnS = (label, col = INK) => `<span style="position:relative;display:inline-flex;align-items:center;height:28px;padding:0 12px;color:${col};font-size:14.5px;font-weight:500;white-space:nowrap;flex:none">${corners(col, 7, 1)}${label}</span>`;
const inp = (ph, w, val, extra = '') => `<span style="display:inline-flex;align-items:center;height:36px;${w ? `width:${w}px;` : 'flex:1;min-width:0;'}border:1px solid ${H};padding:0 10px;font-size:15.5px;color:${val ? INK : '#8A8A8A'};white-space:nowrap;overflow:hidden;${extra}">${esc(val || ph)}</span>`;
const sel = (val, w, extra = '') => `<span style="display:inline-flex;align-items:center;justify-content:space-between;height:36px;${w ? `width:${w}px;` : ''}border:1px solid ${H};padding:0 10px;font-size:15.5px;color:${INK};white-space:nowrap;flex:none;${extra}">${esc(val)}<span style="font-size:14px;color:${G};margin-left:8px">▾</span></span>`;
const dateIn = (val, w = 116, dis) => `<span class="n" style="display:inline-flex;align-items:center;height:36px;width:${w}px;border:1px solid ${H};padding:0 9px;font-size:14.5px;letter-spacing:.01em;color:${dis ? C : val ? INK : '#8A8A8A'};white-space:nowrap;flex:none;${dis ? 'background:#FAFAFA;' : ''}">${val || 'YYYY-MM-DD'}</span>`;
const timeIn = (val, dis) => `<span class="n" style="display:inline-flex;align-items:center;height:36px;width:64px;border:1px solid ${H};padding:0 9px;font-size:14.5px;color:${dis ? C : INK};flex:none;${dis ? 'background:#FAFAFA;' : ''}">${val}</span>`;
const quick = (label, on, dis) => `<span style="display:inline-flex;align-items:center;height:30px;padding:0 9px;border:1px solid ${on ? ACC : H};background:${on ? T1 : '#FFFFFF'};color:${dis ? C : on ? ACC : G};font-size:14.5px;white-space:nowrap;flex:none">${label}</span>`;
const cb = (on, dis) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1px solid ${dis ? C : on ? INK : '#9A9A9A'};background:${on ? INK : '#FFFFFF'};flex:none">${on ? svg(IC.check, 12, '#FFFFFF') : ''}</span>`;
const radio = (on) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1px solid ${on ? INK : '#9A9A9A'};flex:none">${on ? `<span style="width:8px;height:8px;background:${INK}"></span>` : ''}</span>`;
const word = (s, col) => `<span style="color:${col};font-weight:500;white-space:nowrap">${s}</span>`;
const mask = (n) => (!n || ['시스템', '관리자', '남원시 홍보전산과'].includes(n)) ? (n || '-') : n[0] + '○○';
const maskMail = (e) => { const [a, b] = e.split('@'); return a.slice(0, 2) + '***@' + b; };
const maskTel = (p) => p ? p.replace(/\d{4}$/, '****') : '-';
const fsize = (b) => b < 1024 * 1024 ? (b / 1024).toFixed(1) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB';

// ---------- 레일(관리자 메뉴 9 · 활성 = 서비스 관리) ----------
function railItem(y, label, icon, on, sub) {
  return `<div style="position:absolute;left:0;top:${y}px;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px" title="${sub || ''}">
${on ? `<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:${INK}"></div>` : ''}
${svg(IC[icon], 20, on ? INK : G)}
<div style="font-size:14px;line-height:1.15;letter-spacing:-.02em;text-align:center;white-space:pre-line;color:${on ? INK : G}">${label}</div></div>`;
}
const rail = `
<div style="position:absolute;left:0;top:0;width:72px;height:${HT}px;background:#FFFFFF;z-index:3">
<div style="position:absolute;left:0;top:0;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
${svg(IC.mark, 19, INK)}
<div class="d" style="font-size:14px;letter-spacing:.1em;margin-right:-.1em;line-height:1">LAND XI</div></div>
<div style="position:absolute;left:12px;top:58px;width:48px;height:1px;background:${H}"></div>
${railItem(72, '대시보드', 'dash', false, 'dashboard.html')}
${railItem(130, '데이터\n관리', 'data', false, 'dataset.html')}
${railItem(188, '프로젝트', 'proj', false, 'ai-project.html')}
${railItem(246, '분석 서비스', 'anal', false, 'analysis-ai.html')}
${railItem(304, '지도 서비스', 'map', false, 'ximap.html')}
${railItem(596, '서비스 지원', 'sup', false, 'notice.html')}
${railItem(654, '카드 발행\n관리', 'pub', false, 'admin-publish.html')}
${railItem(712, '서비스 관리', 'adm', true, 'admin-notice.html · 현재 화면군')}
${railItem(770, 'MY', 'my', false, 'mypage.html')}
${railItem(828, '로그아웃', 'out', false, 'logout')}
</div>
<div style="position:absolute;left:72px;top:0;width:1px;height:${HT}px;background:${H};z-index:3"></div>`;

// ---------- 마스트헤드 · H1 · 탭(원본 admin-tabnav 5) ----------
const TABS = [['notice', '공지사항 관리', '', 'admin-notice.html'], ['inquiry', '문의 관리', '6', 'admin-inquiry.html'], ['faq', '자주 묻는 질문 관리', '', 'admin-faq.html'], ['users', '사용자 관리', '1', 'admin-users.html'], ['map', '지도 속성 관리', '', 'admin-map.html']];
function shell(tab) {
  const tabs = TABS.map(([k, l, n, href]) => `<div title="${href}" style="height:44px;display:flex;align-items:center;gap:6px;border-bottom:3px solid ${k === tab ? INK : 'transparent'};white-space:nowrap"><span style="font-size:16.5px;letter-spacing:-.01em;font-weight:${k === tab ? 500 : 400};color:${k === tab ? INK : G}">${l}</span>${n ? `<span class="n" style="font-size:14.5px;color:${WARN}">${n}</span>` : ''}</div>`).join('');
  return `${rail}
<div style="position:absolute;left:${X0}px;top:0;width:${CW}px;height:64px;display:flex;align-items:center;gap:12px">
${svg(IC.notice, 16, G)}
<span class="chip">공지</span>
<span style="font-size:16px;letter-spacing:-.01em">고위험 탐지 건 긴급 처리 안내</span>
<span class="n" style="font-size:14.5px;color:${G};letter-spacing:.02em">2026.04.15</span>
<span style="font-size:14.5px;color:${G};margin-left:6px">전체 보기 ›</span>
<div style="flex:1"></div>
<span class="mic">기준일</span>
<span class="n" style="font-size:16px;letter-spacing:.02em;color:${G}">2026.04.23</span>${demo}
</div>${hl(72, 64, 1368)}
<div style="position:absolute;left:${X0}px;top:92px"><div>
<span class="d" style="font-size:34px;line-height:40px"><span style="display:inline-block;border-bottom:4px solid ${ACC};padding-bottom:8px;margin-bottom:-12px">서비스 관리</span></span></div></div>
<div style="position:absolute;right:${W - XR}px;top:113px;height:44px;display:flex;gap:30px">${tabs}</div>
${hl(X0, 156, CW)}
${hl(72, 850, 1368)}
<div class="mic" style="position:absolute;left:${X0}px;top:864px;white-space:nowrap">LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부</div>
<div style="position:absolute;left:640px;top:862px;width:744px;display:flex;align-items:center;justify-content:flex-end;gap:12px"><div class="chip">Family Site ▾</div></div>`;
}

// 밴드 셀: 라벨 + 큰 숫자(들). items = [[값, 단위/라벨, 색, 활성?]]
function bandCell(x, w, label, items, note) {
  const its = items.map(([v, u, col, on]) => `<div style="display:flex;align-items:baseline;gap:6px;padding-bottom:5px;border-bottom:3px solid ${on ? INK : 'transparent'}"><span class="d" style="font-size:42px;line-height:42px;letter-spacing:-.02em;color:${col || ACC}">${v}</span><span style="font-size:15.5px;color:${on ? INK : G};white-space:nowrap">${u}</span></div>`).join('');
  return box(x, BAND_Y, w, 72, '', `<div class="lab" style="white-space:nowrap">${label}</div><div style="margin-top:9px;display:flex;align-items:flex-end;gap:26px">${its}${note ? `<div style="padding-bottom:9px;white-space:nowrap">${note}</div>` : ''}</div>`);
}
const bandSep = (x) => vl(x, BAND_Y, 68);

// 검색 행(전폭) — children 은 flex 아이템
const searchRow = (children) => box(X0, SEARCH_Y, CW, 36, 'display:flex;align-items:center;gap:10px;white-space:nowrap', children);
const fLab = (s) => `<span class="lab" style="flex:none;letter-spacing:0">${s}</span>`;
const period = (label, from, to, q = 0) => `${fLab(label)}${dateIn(from, 112)}<span style="color:${G};font-size:14px;flex:none">~</span>${dateIn(to, 112)}<span style="display:inline-flex;gap:4px;flex:none">${[['전체', 0], ['1개월', 1], ['3개월', 3], ['6개월', 6], ['12개월', 12]].map(([l, m]) => quick(l, m === q)).join('')}</span>`;
const searchBtns = `<span style="flex:none;display:inline-flex;gap:8px;margin-left:4px">${btn2('초기화', 76, 36)}${btn1(svg(IC.search, 14, '#FFFFFF') + '검색', 84, 36)}</span>`;

// 목록 표: cols=[{l,w,a}] rows=[{c:[html…], sel, dim}]
function table(x, y, w, cols, rows, rowH = 45, opts = {}) {
  const pad = 12;
  let s = `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;border-top:1px solid ${INK}">
<div style="height:32px;background:${T1};display:flex;align-items:center;padding:0 ${pad}px;gap:12px">${cols.map(c => `<div class="lab" style="${c.w ? `width:${c.w}px;flex:none` : 'flex:1;min-width:0'};text-align:${c.a || 'left'};letter-spacing:0;white-space:nowrap">${c.l}</div>`).join('')}</div>`;
  rows.forEach(r => {
    s += `<div style="height:${rowH}px;display:flex;align-items:center;padding:0 ${pad}px;gap:12px;border-bottom:1px solid ${H};position:relative;${r.sel ? `background:${T1};` : ''}${r.warn ? '' : ''}">${r.sel ? `<span style="position:absolute;left:0;top:0;width:3px;height:100%;background:${ACC}"></span>` : ''}${r.c.map((h, i) => `<div style="${cols[i].w ? `width:${cols[i].w}px;flex:none` : 'flex:1;min-width:0'};text-align:${cols[i].a || 'left'};font-size:${opts.fs || 15.5}px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${r.dim ? G : INK}">${h}</div>`).join('')}</div>`;
  });
  return s + `</div>`;
}
function pager(x, y, w, page, pages, total, from, to, compact) {
  const b = (l, dis, on) => `<span class="${/^\d+$/.test(l) ? 'n' : ''}" style="display:inline-flex;align-items:center;justify-content:center;height:28px;min-width:28px;padding:0 ${/^\d+$/.test(l) ? 0 : 8}px;font-size:14.5px;border:1px solid ${on ? INK : 'transparent'};color:${dis ? C : on ? INK : G};white-space:nowrap">${l}</span>`;
  let nums = ''; for (let p = 1; p <= pages; p++) nums += b(String(p), false, p === page);
  return box(x, y, w, 28, `display:flex;align-items:center;gap:${compact ? 2 : 4}px;white-space:nowrap`, `${b('처음', page <= 1)}${b('이전', page <= 1)}${nums}${b('다음', page >= pages)}${b('마지막', page >= pages)}
<span style="display:inline-flex;align-items:center;gap:6px;margin-left:${compact ? 6 : 14}px"><span class="n" style="display:inline-flex;align-items:center;height:28px;padding:0 8px;border:1px solid ${H};font-size:14.5px">10<span style="font-size:14px;color:${G};margin-left:6px">▾</span></span><span class="mic">페이지 크기</span></span>
<div style="flex:1"></div><span class="mic">총 <span class="n" style="color:${INK};font-weight:500">${total}</span>건 중 <span class="n">${from}~${to}</span>행</span>`);
}

// 우 패널 틀: 머리띠(틴트) + 본문(흐름) + 바닥 액션
function panel(R, title, right, body, foot, y = LIST_Y) {
  const h = BOT - y;
  return `${vl(R.x - 20, y, h)}
<div style="position:absolute;left:${R.x}px;top:${y}px;width:${R.w}px;height:${h}px;border-top:1px solid ${INK};display:flex;flex-direction:column">
<div style="height:32px;background:${T1};display:flex;align-items:center;padding:0 12px;gap:10px;flex:none;white-space:nowrap"><span style="font-size:15.5px;font-weight:500;letter-spacing:-.01em">${title}</span><div style="flex:1"></div>${right || ''}</div>
<div style="flex:1;min-height:0;overflow:hidden;position:relative">${body}</div>
${foot ? `<div style="flex:none;height:54px;border-top:1px solid ${H};display:flex;align-items:flex-end;gap:10px">${foot}</div>` : ''}
</div>`;
}
const fld = (label, val, w, extra = '') => `<div style="${w ? `width:${w}px;flex:none` : 'flex:1;min-width:0'};${extra}"><div class="lab" style="letter-spacing:0;white-space:nowrap">${label}</div><div style="margin-top:4px;font-size:16px;line-height:24px;letter-spacing:-.01em;white-space:nowrap;display:flex;align-items:center;gap:8px;min-height:28px">${val}</div></div>`;
const secRow = (label, inner, last) => `<div style="display:flex;gap:0;padding:11px 0 10px;${last ? '' : `border-bottom:1px solid ${H};`}"><div style="width:58px;flex:none;font-size:14.5px;font-weight:500;color:${INK};padding-top:1px;white-space:nowrap">${label}</div><div style="flex:1;min-width:0">${inner}</div></div>`;

// 모달(평면 · 그림자 0): 배경 딤 + 흰 판 + 잉크 1px
function modal(w, h, title, body, foot, sub) {
  const x = Math.round(72 + (1368 - w) / 2), y = Math.round((HT - h) / 2);
  return `<div style="position:absolute;left:0;top:0;width:${W}px;height:${HT}px;background:rgba(1,1,2,.46);z-index:20"></div>
<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#FFFFFF;border:1px solid ${INK};z-index:21;display:flex;flex-direction:column">
<div style="height:60px;flex:none;display:flex;align-items:center;padding:0 28px;gap:12px;border-bottom:1px solid ${H};white-space:nowrap"><span class="d" style="font-size:22px">${title}</span>${sub || ''}<div style="flex:1"></div>${svg(IC.x, 18, INK)}</div>
<div style="flex:1;min-height:0;position:relative;padding:0 28px">${body}</div>
${foot ? `<div style="flex:none;height:70px;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 28px;border-top:1px solid ${H}">${foot}</div>` : ''}
</div>`;
}
const confirmModal = (msg, okLabel = '확인') => modal(440, 236, '확인', `<div style="padding-top:26px;font-size:17px;line-height:1.6;letter-spacing:-.01em;white-space:pre-line">${msg}</div>`, `${btn2('취소', 96)}${btn1(okLabel, 96)}`);
const emptyBlock = (msg, why, h = 132) => `<div style="border:1px dashed ${C};height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px"><div style="font-size:16.5px;color:${G}">${msg}</div>${why ? `<div class="mic" style="color:#8A8A8A">${why}</div>` : ''}</div>`;

// =====================================================================
// 사용자 관리 — 원본 admin-users.html DEFAULT_SEED 21 · LOGIN_HISTORY · PWD_HISTORY (마스킹은 표시 단계에서)
// =====================================================================
const U = (id, email, name, phone, dept, rank, status, pwdFails, joined, action, actionBy, actionAt, role, withdrawnAt) => ({ id, email, name, phone, dept, rank, status, pwdFails, joined, action, actionBy, actionAt, role, withdrawnAt });
const USERS = [
  U(1, 'admin@namwon.go.kr', '김관리', '063-620-6000', '홍보전산과', '팀장', 'active', 0, '2025-04-10T11:18:00', 'approved', '시스템', '2025-04-10T11:18:30', 'admin'),
  U(2, 'leejuwon@namwon.go.kr', '이주원', '063-620-6134', '홍보전산과', '주무관', 'active', 0, '2025-04-10T11:20:00', 'approved', '김관리', '2025-04-10T14:22:10', 'admin'),
  U(3, 'ngii@kakao.com', '이상준', '010-7568-5253', '홍보전산과', '대리', 'active', 0, '2026-03-17T08:39:00', 'approved', '관리자', '2026-03-17T08:41:22', 'general'),
  U(4, 'jyong1@korea.kr', '정재용', '010-5002-6724', '홍보전산과', '주무관', 'active', 0, '2026-03-16T09:23:00', 'approved', '남원시 홍보전산과', '2026-03-16T09:24:45', 'general'),
  U(5, 'dbwjdakrso4235@gmail.com', '고유정', '010-7227-4235', '홍보전산과', '대리', 'active', 0, '2026-01-13T15:07:00', 'approved', '관리자', '2026-01-13T15:08:30', 'general'),
  U(6, 'test8@korea.kr', '테스터', '010-0000-0000', '홍보전산과', '주무관', 'active', 0, '2025-12-30T10:51:00', 'approved', '박상현', '2025-12-30T10:53:14', 'general'),
  U(7, 'hanlee@namwon.go.kr', '이한길', '063-620-7321', '도로관리과', '과장', 'active', 0, '2025-02-11T09:40:00', 'approved', '김관리', '2025-02-11T11:02:00', 'farmland'),
  U(8, 'parkjs@namwon.go.kr', '박정수', '063-620-7335', '도로관리과', '주무관', 'active', 0, '2025-03-04T14:10:00', 'approved', '이한길', '2025-03-04T16:18:40', 'forage'),
  U(9, 'ohgilsu@namwon.go.kr', '오길수', '063-620-7340', '도로관리과', '주임', 'active', 1, '2025-08-22T10:03:15', 'approved', '이한길', '2025-08-22T11:40:00', 'general'),
  U(10, 'jsk@namwon.go.kr', '조수경', '063-620-8520', '농업기술센터', '주무관', 'active', 1, '2025-09-18T20:23:19', 'approved', '노명석', '2025-09-19T09:02:00', 'forage'),
  U(11, 'noh.ms@namwon.go.kr', '노명석', '063-620-8534', '농업기술센터', '팀장', 'active', 0, '2024-11-03T09:12:00', 'approved', '김관리', '2024-11-03T10:15:00', 'crop'),
  U(12, 'chnam@namwon.go.kr', '차남호', '063-620-9411', '환경관리과', '과장', 'active', 0, '2024-12-05T09:00:00', 'approved', '김관리', '2024-12-05T10:30:00', 'farmland'),
  U(13, 'kimsy@namwon.go.kr', '김서영', '063-620-9425', '환경관리과', '주무관', 'active', 0, '2025-01-20T09:45:00', 'approved', '차남호', '2025-01-20T11:00:00', 'farmland'),
  U(14, 'hong.js@namwon.go.kr', '홍지수', '063-620-9302', '기획감사실', '실장', 'active', 0, '2024-10-14T10:10:00', 'approved', '김관리', '2024-10-14T11:22:00', 'admin'),
  U(15, 'yoo.jh@namwon.go.kr', '유정호', '063-620-9318', '기획감사실', '주임', 'active', 0, '2025-08-12T15:00:00', 'approved', '홍지수', '2025-08-12T16:30:00', 'general'),
  U(16, 'hyun.mk@namwon.go.kr', '현미경', '063-620-6145', '홍보전산과', '주무관', 'active', 0, '2025-11-03T11:25:00', 'approved', '이주원', '2025-11-03T13:00:00', 'crop'),
  U(17, 'kang.hw@kovis.co.kr', '강해원', '010-4822-1177', '홍보전산과', '외부협력', 'active', 0, '2025-12-01T10:00:00', 'approved', '이주원', '2025-12-01T14:12:00', 'general'),
  U(18, 'newreq@namwon.go.kr', '신청자', '063-620-9990', '농업기술센터', '주무관', 'active', 0, '2026-04-22T09:15:00', 'pending', '', '', ''),
  U(19, 'parkmj@namwon.go.kr', '박민지', '063-620-9430', '환경관리과', '주무관', 'active', 5, '2025-12-24T10:07:00', 'approved', '차남호', '2025-12-24T10:12:00', 'general'),
  U(20, 'reject.aa@gmail.com', '김거절', '010-0000-9999', '외부', '', 'withdrawn', 0, '2026-04-18T10:20:00', 'rejected', '김관리', '2026-04-18T13:15:00', '', '2026-04-18T13:15:00'),
  U(21, 'choi.ys@namwon.go.kr', '최영수', '063-620-9320', '기획감사실', '실장', 'withdrawn', 0, '2024-12-18T13:15:00', 'approved', '김관리', '2024-12-18T14:02:00', '', '2026-01-15T09:30:00'),
].sort((a, b) => b.joined.localeCompare(a.joined));
const LOGIN_HISTORY = {
  4: [['211.252.232.17', true, '', '2026-04-21T11:04:12', '2026-04-21T18:00:00'], ['211.252.232.17', false, '비밀번호 불일치', '2026-03-10T16:00:00', ''], ['211.252.232.17', false, '비밀번호 불일치', '2026-03-10T15:59:30', ''], ['211.252.232.17', false, '비밀번호 불일치', '2026-03-10T15:58:50', ''], ['211.252.232.17', true, '', '2026-03-04T09:18:22', '2026-03-04T17:30:00']],
  19: [['211.252.232.22', false, '비밀번호 5회 초과로 잠금', '2025-12-24T10:08:05', ''], ['211.252.232.22', false, '비밀번호 불일치', '2025-12-24T10:08:00', '']],
};
const PWD_HISTORY = {
  4: [['2026-03-10T16:10:00', '김관리', '비밀번호 실패 초기화'], ['2026-03-16T09:24:00', '이주원', '최초 계정 발급']],
  19: [['2025-12-24T10:15:00', '차남호', '5회 실패로 계정 잠금 해제'], ['2025-12-24T10:10:00', '차남호', '최초 계정 발급']],
};
const ROLES = [['admin', '남원시청 관리자'], ['forage', '사료작물 분석'], ['farmland', '농지 활용 분석'], ['crop', '영농 정보 분석'], ['general', '일반사용자']];
const stWord = (u) => u.status === 'active' ? word('정상', INK) : word('탈퇴', G);
const acWord = (u) => u.action === 'approved' ? word('승인', ACC) : u.action === 'rejected' ? word('거부', G) : word('대기', WARN);
const byId = (id) => USERS.find(u => u.id === id);

function usersBand() {
  return bandCell(X0, 250, '가입 승인 대기 · 처리 상태 = 대기', [[1, '건', WARN]], `<span style="font-size:15.5px;font-weight:500;color:${WARN}">승인 필요</span>`)
    + bandSep(396) + bandCell(420, 430, '계정 상태', [[21, '전체', ACC, true], [19, '정상', ACC], [2, '탈퇴', G]])
    + bandSep(872) + bandCell(896, 300, '처리 상태', [[19, '승인', ACC], [1, '거부', G]])
    + box(1180, BAND_Y + 40, 204, 24, 'display:flex;justify-content:flex-end;align-items:center;gap:8px;white-space:nowrap', `<span class="mic">숫자를 누르면 그 상태로 거른다</span>`)
    + hl(X0, RULE1, CW);
}
function usersSearch(v = {}) {
  return searchRow(`${inp('아이디(이메일)', 0, v.email)}${inp('이름', 0, v.name)}${inp('전화번호', 0, v.phone)}${inp('부서명', 0, v.dept)}${period('가입일', '', '', 0)}${searchBtns}`);
}
function usersList(L, selId, rows = USERS.slice(0, 10)) {
  const cols = [{ l: '이름', w: 62 }, { l: '아이디(이메일)' }, { l: '부서 · 직위', w: 156 }, { l: '계정상태', w: 56 }, { l: '가입일시', w: 134 }, { l: '처리상태', w: 56 }];
  const r = rows.map(u => ({ sel: u.id === selId, dim: u.status === 'withdrawn', c: [esc(mask(u.name)), `<span class="n" style="font-size:14.5px">${maskMail(u.email)}</span>`, `${u.dept}${u.rank ? `<span style="color:${G}"> · ${u.rank}</span>` : ''}`, stWord(u), `<span class="n" style="font-size:14.5px;color:${G}">${dt(u.joined)}</span>`, acWord(u)] }));
  return table(L.x, LIST_Y, L.w, cols, r);
}
function userPanel(R, u, opts = {}) {
  const pending = u.action === 'pending', wd = u.status === 'withdrawn';
  const lh = (LOGIN_HISTORY[u.id] || []).length, ph = (PWD_HISTORY[u.id] || []).length;
  const idx = USERS.indexOf(u) + 1;
  const head = `<div style="padding:14px 0 12px;border-bottom:1px solid ${H}">
<div style="display:flex;align-items:baseline;gap:10px;white-space:nowrap"><span class="d" style="font-size:26px;line-height:32px">${mask(u.name)}</span><span style="font-size:15.5px;color:${G}">${u.dept}${u.rank ? ' · ' + u.rank : ''}</span><div style="flex:1"></div><span style="font-size:16px">${pending ? word('승인 대기', WARN) : wd ? word('탈퇴', G) : word('정상 · 승인', ACC)}</span></div>
<div style="display:flex;align-items:center;gap:10px;margin-top:${pending ? 6 : 2}px;white-space:nowrap"><span class="n" style="font-size:15px;color:${G};letter-spacing:.01em">${maskMail(u.email)}</span><div style="flex:1"></div>${pending ? `${btn2('거부', 84, 38)}${btn1('승인', 124, 38)}` : ''}</div></div>`;
  const body = `<div style="padding:0 2px">${head}
${secRow('소속', `<div style="display:flex;gap:12px">${fld('전화번호', `<span class="n" style="font-size:15px">${maskTel(u.phone)}</span>`, 124)}${fld('부서', u.dept || '-', 128)}${fld('직위', u.rank || '-')}</div>`)}
${secRow('계정', `<div style="display:flex;gap:12px">${fld('계정 상태', `${stWord(u)}${wd ? '' : btnS('탈퇴')}`, 124)}${fld('가입일시', `<span class="n" style="font-size:15px">${dt(u.joined)}</span>`, 128)}${fld('탈퇴일시', `<span class="n" style="font-size:15px">${dt(u.withdrawnAt)}</span>`)}</div>
<div style="display:flex;align-items:center;gap:10px;margin-top:8px;white-space:nowrap"><span class="lab" style="letter-spacing:0">비밀번호 실패 횟수</span><span class="n" style="font-size:16px;font-weight:500">${u.pwdFails}</span><span style="font-size:14.5px;color:${G};margin-left:-6px">회</span>${btnS('비밀번호 초기화')}</div>`)}
${secRow('권한', `<div style="display:flex;gap:12px">${fld('처리 상태', acWord(u), 124)}${fld('처리자', esc(mask(u.actionBy)), 128)}${fld('처리일시', `<span class="n" style="font-size:15px">${dt(u.actionAt)}</span>`)}</div>
<div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px">${ROLES.map(([k, l]) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:15px;white-space:nowrap;color:${k === u.role ? INK : G}">${cb(k === u.role)}${l}</span>`).join('')}</div>`)}
</div>`;
  const foot = `<span class="mic" style="padding-bottom:9px">권한은 1인 1개 · 저장 시 반영</span><div style="flex:1"></div>${btn2('삭제', 84)}${btn1('저장', 108)}`;
  const links = `<span style="display:inline-flex;gap:16px;font-size:14.5px;white-space:nowrap"><span style="border-bottom:1px solid ${INK};line-height:20px">로그인 이력 <span class="n">${lh}</span> ›</span><span style="border-bottom:1px solid ${INK};line-height:20px">비밀번호 변경 이력 <span class="n">${ph}</span> ›</span></span>`;
  return panel(R, '사용자 정보 열람', links, body, foot);
}

function boardUsersOpt2(selId, over = '') {
  return shell('users') + usersBand() + usersSearch() + usersList(SP.L, selId) + pager(SP.L.x, 808, SP.L.w, 1, 3, 21, 1, 10) + userPanel(SP.R, byId(selId)) + over;
}

// 선택 1 — 원장 한 장(원본 10열 전부) + 승인 대기 띠
function boardUsersOpt1() {
  const p = byId(18);
  let s = shell('users') + usersBand() + usersSearch();
  // 승인 대기 띠 (318–390)
  s += box(X0, LIST_Y, CW, 72, `background:${T1};border-top:1px solid ${INK};display:flex;align-items:center;padding:0 16px;gap:26px;white-space:nowrap`,
    `<div style="display:flex;align-items:center;gap:8px"><span style="font-size:16.5px;font-weight:500;color:${WARN}">승인 대기</span></div>
<div><div class="d" style="font-size:20px;line-height:26px">${mask(p.name)}</div><div class="n" style="font-size:14.5px;color:${G}">${maskMail(p.email)}</div></div>
${fld('전화번호', `<span class="n" style="font-size:15px">${maskTel(p.phone)}</span>`, 124)}${fld('부서 · 직위', `${p.dept} · ${p.rank}`, 170)}${fld('가입일시', `<span class="n" style="font-size:15px">${dt(p.joined)}</span>`, 140)}
<div style="flex:1"></div><span style="font-size:15px;color:${G};border-bottom:1px solid ${G}">정보 열람 ›</span>${btn2('거부', 88, 40)}${btn1('승인', 120, 40)}`);
  const cols = [{ l: '아이디(이메일)' }, { l: '이름', w: 64 }, { l: '전화번호', w: 126 }, { l: '부서', w: 100 }, { l: '직위', w: 70 }, { l: '계정상태', w: 60 }, { l: '가입일시', w: 134 }, { l: '처리상태', w: 60 }, { l: '처리자', w: 120 }, { l: '처리일시', w: 134 }];
  const num = (t) => `<span class="n" style="font-size:14.5px;color:${G}">${t}</span>`;
  const rows = USERS.slice(0, 10).map(u => ({ dim: u.status === 'withdrawn', c: [`<span class="n" style="font-size:14.5px;color:${ACC}">${maskMail(u.email)}</span>`, mask(u.name), num(maskTel(u.phone)), u.dept, u.rank || '-', stWord(u), num(dt(u.joined)), acWord(u), esc(mask(u.actionBy)), num(dt(u.actionAt))] }));
  s += table(X0, 406, CW, cols, rows, 36.5, { fs: 15 });
  s += pager(X0, 810, CW, 1, 3, 21, 1, 10);
  return s;
}

// 선택 3 — 승인 데스크(좌) + 부서별 카드 보드(우 · 부서 표식 칸 + 사람 카드가 한 흐름으로 감긴다)
function boardUsersOpt3() {
  const p = byId(18);
  let s = shell('users') + usersBand() + usersSearch();
  const DX = X0, DW = 324;
  s += `<div style="position:absolute;left:${DX}px;top:${LIST_Y}px;width:${DW}px;height:${BOT - LIST_Y}px;border:1px solid ${INK};display:flex;flex-direction:column">
<div style="height:34px;flex:none;background:${T1};display:flex;align-items:center;gap:8px;padding:0 14px;white-space:nowrap"><span style="font-size:16px;font-weight:500;color:${WARN}">승인 대기 1</span><div style="flex:1"></div><span class="n mic">01 / 01</span></div>
<div style="padding:12px 18px 0;flex:1;min-height:0">
<div class="d" style="font-size:28px;line-height:34px">${mask(p.name)}</div>
<div class="n" style="font-size:15px;line-height:20px;color:${G}">${maskMail(p.email)}</div>
<div style="margin-top:10px;border-top:1px solid ${H}">
${[['부서', p.dept], ['직위', p.rank], ['전화번호', `<span class="n" style="font-size:15px">${maskTel(p.phone)}</span>`], ['가입일시', `<span class="n" style="font-size:15px">${dt(p.joined)}</span>`], ['계정 상태', stWord(p)], ['비밀번호 실패 횟수', `<span class="n">0</span> 회`], ['로그인 이력', `<span style="color:${G}">로그인 이력이 없습니다.</span>`]].map(([l, v]) => `<div style="display:flex;align-items:center;height:31px;border-bottom:1px solid ${H};white-space:nowrap"><span class="lab" style="width:128px;letter-spacing:0">${l}</span><span style="font-size:15.5px">${v}</span></div>`).join('')}
</div>
<div class="lab" style="margin-top:12px;letter-spacing:0">권한 · 1인 1개</div>
<div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:6px">${ROLES.map(([k, l]) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:15px;line-height:22px;white-space:nowrap;color:${G}">${cb(false)}${l}</span>`).join('')}</div>
</div>
<div style="flex:none;display:flex;gap:10px;padding:0 18px 16px">${btn2('거부', 96, 42)}${btn1('승인', DW - 36 - 106 - 2, 42)}</div></div>`;
  const depts = ['홍보전산과', '도로관리과', '농업기술센터', '환경관리과', '기획감사실', '외부'];
  const bx = DX + DW + 28, bw = XR - bx, gap = 8, per = 4, cwid = (bw - gap * (per - 1)) / per, ch = 58;
  const cells = [];
  depts.forEach(d => { const us = USERS.filter(u => u.dept === d); cells.push({ d, n: us.length }); us.forEach(u => cells.push({ u })); });
  cells.forEach((c, i) => {
    const x = bx + (i % per) * (cwid + gap), y = LIST_Y + Math.floor(i / per) * (ch + gap);
    if (c.d) { s += box(x, y, cwid, ch, `border-top:1px solid ${INK};background:${T1};padding:8px 12px 0;white-space:nowrap`, `<div style="font-size:16px;font-weight:500;line-height:22px">${c.d}</div><div class="mic"><span class="n">${c.n}</span>명</div>`); return; }
    const u = c.u, pend = u.action === 'pending', wd = u.status === 'withdrawn';
    s += box(x, y, cwid, ch, `border:1px solid ${pend ? INK : H};padding:7px 12px 0;white-space:nowrap;overflow:hidden;${pend ? `background:${T1};` : ''}`,
      `<div style="display:flex;align-items:baseline;gap:7px;line-height:22px"><span style="font-size:16px;font-weight:500;color:${wd ? G : INK}">${mask(u.name)}</span><span style="font-size:14px;color:${G}">${u.rank || '-'}</span><div style="flex:1"></div><span style="font-size:14.5px">${pend ? word('대기', WARN) : wd ? word(u.action === 'rejected' ? '거부 · 탈퇴' : '탈퇴', G) : word('승인', ACC)}</span></div>
<div class="n" style="font-size:14px;line-height:20px;color:${G};overflow:hidden;text-overflow:ellipsis">${maskMail(u.email)}</div>`);
  });
  const lastY = LIST_Y + Math.ceil(cells.length / per) * (ch + gap);
  s += box(bx, 808, bw, 28, 'display:flex;align-items:center;white-space:nowrap', `<span class="mic">부서 6 · 가입일 내림차순 · 카드를 누르면 사용자 정보 열람</span><div style="flex:1"></div><span class="mic">총 <span class="n" style="color:${INK};font-weight:500">21</span>건</span>`);
  return s;
}

function historyModal(u, tab, empty) {
  const lh = empty ? [] : (LOGIN_HISTORY[u.id] || []), ph = empty ? [] : (PWD_HISTORY[u.id] || []);
  const isLogin = tab === 'login';
  const tabs = `<div style="display:flex;gap:26px;height:48px;align-items:flex-end;border-bottom:1px solid ${H}">${[['login', '로그인 이력', lh.length], ['pwd', '비밀번호 변경 이력', ph.length]].map(([k, l, n]) => `<div style="height:40px;display:flex;align-items:center;gap:6px;border-bottom:3px solid ${k === tab ? INK : 'transparent'};margin-bottom:-1px;white-space:nowrap"><span style="font-size:16.5px;font-weight:${k === tab ? 500 : 400};color:${k === tab ? INK : G}">${l}</span><span class="n" style="font-size:14.5px;color:${G}">${n}</span></div>`).join('')}</div>`;
  const num = (t) => `<span class="n" style="font-size:14.5px">${t}</span>`;
  let tb;
  const MW = 1000 - 56;
  if (isLogin) {
    const cols = [{ l: '로그인 ID' }, { l: '접속 IP', w: 124 }, { l: '성공 여부', w: 70 }, { l: '실패 사유', w: 190 }, { l: '접속 일시', w: 150 }, { l: '로그아웃 일시', w: 150 }];
    const rows = lh.map(r => ({ c: [num(maskMail(u.email)), num(r[0]), r[1] ? word('성공', ACC) : word('실패', INK), r[2] || `<span style="color:${C}">-</span>`, num(dt(r[3], 19)), r[4] ? num(dt(r[4], 19)) : `<span style="color:${C}">-</span>`] }));
    tb = table(0, 64, MW, cols, rows, 44).replace('position:absolute;left:0px', 'position:absolute;left:28px');
  } else {
    const cols = [{ l: '로그인 ID' }, { l: '변경 일시', w: 170 }, { l: '변경자', w: 110 }, { l: '변경 사유', w: 300 }];
    const rows = ph.map(r => ({ c: [num(maskMail(u.email)), num(dt(r[0], 19)), esc(mask(r[1])), r[2]] }));
    tb = table(0, 64, MW, cols, rows, 44).replace('position:absolute;left:0px', 'position:absolute;left:28px');
  }
  const n = isLogin ? lh.length : ph.length;
  const emptyMsg = isLogin ? '로그인 이력이 없습니다.' : '비밀번호 변경 이력이 없습니다.';
  const why = isLogin ? '승인 전 계정 — 접속 기록 없음' : '승인 전 계정 — 비밀번호 발급 전';
  const body = `${tabs}${tb}${n === 0 ? `<div style="position:absolute;left:28px;top:${64 + 33 + 16}px;width:${MW}px">${emptyBlock(emptyMsg, why)}</div>` : ''}
${pager(28, 64 + 33 + Math.max(n, 0) * 44 + (n === 0 ? 164 : 14), MW, 1, 1, n, n ? 1 : 0, n)}`;
  const h = 60 + 48 + 16 + 33 + (n === 0 ? 164 : n * 44 + 14) + 28 + 26 + 70;
  return modal(1000, h, '접속 · 비밀번호 이력', body, btn2('닫기', 96), `<span style="font-size:16px;color:${G}">${mask(u.name)} · <span class="n" style="font-size:15px">${maskMail(u.email)}</span></span>${demo}`);
}

// =====================================================================
// 공지사항 관리 — admin-notice.html DEFAULT_SEED 12
// =====================================================================
const INF = '9999-12-31T23:59:59';
const N = (id, cat, title, startAt, endAt, popup, files, createdAt, updater, updatedAt) => ({ id, cat, title, startAt, endAt, popup, files, author: '이주원', createdAt, updater, updatedAt });
const NOTICES = [
  N(12, 'urgent', '[긴급] 정기 서버 점검 안내 (4/25 01:00~04:00)', '2026-04-23T09:00:00', '2026-04-25T04:00:00', ['2026-04-23T00:00:00', '2026-04-25T04:00:00'], [], '2026-04-23T09:00:00'),
  N(11, 'general', '4월 정사영상·카메라 AI 추론 모델 v2.3 배포', '2026-04-15T00:00:00', INF, null, [['모델v2.3_릴리즈노트.pdf', 820000]], '2026-04-15T10:02:00'),
  N(10, 'work', '개인정보 처리방침 개정 안내 (4/10 시행)', '2026-04-03T00:00:00', INF, null, [['개인정보처리방침_개정_비교표.xlsx', 58000]], '2026-04-03T14:20:00', '이주원', '2026-04-05T09:10:00'),
  N(9, 'general', '지도 서비스 배경 레이어에 2026 최신 정사영상 추가', '2026-03-28T00:00:00', INF, null, [], '2026-03-28T09:14:00'),
  N(8, 'work', '2026년 상반기 사용자 교육 일정 안내 (5/14·5/28)', '2026-03-25T00:00:00', '2026-05-28T18:00:00', null, [['교육일정_상세안내.pdf', 480000]], '2026-03-25T10:00:00'),
  N(7, 'urgent', '[긴급] 카메라 AI 추론 서비스 일시 지연 현상 해결 안내', '2026-03-18T16:00:00', '2026-03-20T00:00:00', null, [], '2026-03-18T16:00:00'),
  N(6, 'general', '월간 보고서 엑셀 템플릿 v2 배포', '2026-03-10T00:00:00', INF, null, [['월간보고서_v2_샘플.xlsx', 132000]], '2026-03-10T09:42:00'),
  N(5, 'work', '영상 업로드 용량 제한 상향 (파일당 2GB → 5GB)', '2026-02-25T00:00:00', INF, null, [], '2026-02-25T11:08:00'),
  N(4, 'general', '지도 서비스 신규 레이어 공개 - 도로 포장 재질 구분', '2026-02-14T00:00:00', INF, null, [], '2026-02-14T15:22:00'),
  N(3, 'work', '2026년 1월 월간 운영 실적 공유', '2026-02-03T00:00:00', INF, null, [['2026_1월_실적요약.pdf', 92000]], '2026-02-03T09:00:00'),
  N(2, 'general', 'Land-XI(NAMWON GEOVISION) 서비스 정식 오픈 및 이용 가이드', '2025-12-24T09:28:00', INF, ['2025-12-24T00:00:00', '2026-01-24T23:59:59'], [['이용가이드_v1.0.pdf', 1245000]], '2025-12-24T09:28:37'),
  N(1, 'general', 'AI 분석 방법 안내', '2025-12-24T15:39:00', INF, null, [], '2025-12-24T15:39:07'),
];
const CAT = { urgent: '긴급', general: '일반', work: '업무' };
const catWord = (c) => c === 'urgent' ? word('긴급', WARN) : `<span style="color:${G}">${CAT[c]}</span>`;
const AX0 = Date.parse('2025-12-01'), AX1 = Date.parse('2026-06-30'), TD = Date.parse(TODAY + 'T12:00:00');
const axx = (iso, w) => Math.max(0, Math.min(w, (Date.parse(iso) - AX0) / (AX1 - AX0) * w));
// 게시 기간 막대: 게시 중 = 파랑 · 종료 = 회색 · 무한 게시 = 우측 끝까지 열린 막대(›)
function tlBar(n, w, h = 6) {
  const inf = n.endAt === INF, a = axx(n.startAt, w), b = inf ? w : axx(n.endAt, w), live = Date.parse(n.startAt) <= TD && (inf || Date.parse(n.endAt) >= TD);
  return `<div style="position:relative;width:${w}px;height:${h + 8}px;flex:none"><div style="position:absolute;left:0;top:${4 + h / 2}px;width:${w}px;height:1px;background:${H}"></div>
<div style="position:absolute;left:${a.toFixed(1)}px;top:4px;width:${Math.max(3, b - a).toFixed(1)}px;height:${h}px;background:${live ? ACC : C}"></div>
${inf ? `<div style="position:absolute;right:-7px;top:${h / 2 - 5}px;font-size:14px;line-height:18px;color:${live ? ACC : C}">›</div>` : ''}
<div style="position:absolute;left:${axx(TODAY, w).toFixed(1)}px;top:0;width:1px;height:${h + 8}px;background:${INK}"></div></div>`;
}
const periodTxt = (n, short) => { const f = (iso) => short ? iso.substring(2, 10).replace(/-/g, '.') : dt(iso); return `${f(n.startAt)} ~ ${n.endAt === INF ? '무한 게시' : f(n.endAt)}`; };

function noticeBand() {
  return bandCell(X0, 200, '공지사항', [[12, '건 전체', ACC, true]])
    + bandSep(346) + bandCell(370, 420, '구분', [[2, '긴급', WARN], [6, '일반', ACC], [4, '업무', ACC]])
    + box(900, BAND_Y + 30, 484, 40, 'display:flex;justify-content:flex-end;align-items:center;gap:10px', `${btn2('선택 삭제', 110, 40)}${btn1('+ 등록', 120, 40)}`)
    + hl(X0, RULE1, CW);
}
const noticeSearch = () => searchRow(`${fLab('검색어')}${sel('전체', 92)}${inp('검색어', 0, '')}${period('게시 기간', '', '', 0)}${searchBtns}`);
function noticeList(L, selId, compact, y = LIST_Y) {
  const bw = compact ? 190 : 150;
  const pop = (n) => n.popup && Date.parse(n.popup[1]) >= TD ? ` <span style="font-size:14px;color:${ACC};margin-left:4px">팝업</span>` : '';
  if (compact) {
    const rows = NOTICES.slice(0, 10).map(n => ({ sel: n.id === selId, c: [`<div style="display:flex;align-items:center;gap:10px;line-height:24px"><span style="font-size:14.5px;width:30px;flex:none">${catWord(n.cat)}</span><span style="overflow:hidden;text-overflow:ellipsis">${esc(n.title)}</span>${pop(n)}</div>
<div style="display:flex;align-items:center;gap:12px;margin-top:1px;padding-left:40px"><span class="n" style="font-size:14px;line-height:18px;color:${G};width:170px;flex:none">${periodTxt(n, true)}</span>${tlBar(n, bw, 5)}</div>`] }));
    return table(L.x, y, L.w, [{ l: `공지사항 목록 · <span class="n">12</span>건 — 게시 기간 막대: 파랑 = 게시 중 · 회색 = 종료 · 세로선 = 기준일` }], rows, 58);
  }
  const cols = [{ l: cb(false), w: 16 }, { l: '구분', w: 36 }, { l: '제목' }, { l: `게시 시작 ~ 게시 종료`, w: bw + 8 }, { l: '등록자', w: 46 }, { l: '등록 일시', w: 126 }];
  const rows = NOTICES.slice(0, 10).map(n => {
    const per = `<div><div class="n" style="font-size:14px;line-height:17px;color:${G};letter-spacing:0">${periodTxt(n, true)}</div><div style="margin-top:3px">${tlBar(n, bw, 5)}</div></div>`;
    return { sel: n.id === selId, c: [cb(false), catWord(n.cat), `${esc(n.title)}${pop(n)}`, per, mask(n.author), `<span class="n" style="font-size:14.5px;color:${G}">${dt(n.createdAt)}</span>`] };
  });
  return table(L.x, y, L.w, cols, rows, 45);
}
// 상세 패널의 큰 타임라인(게시 + 팝업 두 줄 · 월 눈금)
function tlBig(w, pub, pop) {
  const D = 86400000, LW = 44, aw = w - LW;
  const starts = [Date.parse(pub[0])].concat(pop ? [Date.parse(pop[0])] : []), ends = [pub[1], pop && pop[1]].filter(e => e && e !== INF).map(e => Date.parse(e));
  const lo = Math.min(...starts), inf = pub[1] === INF;
  let a, b;
  if (inf) { a = lo - 7 * D; b = Math.max(lo + 120 * D, TD + 14 * D); } else { const hi = Math.max(...ends), pad = Math.max(D, (hi - lo) * .25); a = lo - pad; b = hi + pad; }
  const X = (t) => LW + Math.max(0, Math.min(aw, (t - a) / (b - a) * aw));
  let s = `<div style="position:relative;width:${w}px;height:74px;margin-top:6px">`;
  const daily = (b - a) <= 16 * D;
  const t0 = new Date(a); let cur = daily ? Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), t0.getUTCDate() + 1) - 9 * 3600000 : Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() + 1, 1) - 9 * 3600000;
  while (cur < b) { const d = new Date(cur + 9 * 3600000), x = X(cur); const lab = daily ? `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}` : `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    s += `<div style="position:absolute;left:${x.toFixed(1)}px;top:12px;width:1px;height:42px;background:${H}"></div>${x < w - 44 ? `<div class="n" style="position:absolute;left:${(x + 4).toFixed(1)}px;top:58px;font-size:14px;color:${G};line-height:16px">${lab}</div>` : ''}`;
    cur = daily ? cur + D : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 9 * 3600000; }
  const bar = (p, y, col, label, hgt) => { let r = `<div style="position:absolute;left:0;top:${y - 4}px;font-size:14px;line-height:18px;color:${p ? INK : G}">${label}</div>`; if (!p) return r + `<div style="position:absolute;left:${LW}px;top:${y + hgt / 2}px;width:${aw}px;height:1px;border-top:1px dashed ${C}"></div><div style="position:absolute;left:${LW + 8}px;top:${y - 5}px;font-size:14px;line-height:18px;color:${G};background:#FFFFFF;padding:0 6px">표시 안 함</div>`; const x0 = X(Date.parse(p[0])), x1 = p[1] === INF ? LW + aw : X(Date.parse(p[1])); return r + `<div style="position:absolute;left:${x0.toFixed(1)}px;top:${y}px;width:${Math.max(4, x1 - x0).toFixed(1)}px;height:${hgt}px;background:${col}"></div>${p[1] === INF ? `<div style="position:absolute;right:-2px;top:${y - 5}px;font-size:16px;line-height:20px;color:${col};background:#FFFFFF;padding-left:3px">›</div>` : ''}`; };
  s += `<div style="position:absolute;left:${LW}px;top:54px;width:${aw}px;height:1px;background:${INK}"></div>`;
  s += bar(pub, 18, ACC, '게시', 10) + bar(pop, 36, INK, '팝업', 10);
  if (TD > a && TD < b) s += `<div style="position:absolute;left:${X(TD).toFixed(1)}px;top:0;width:1px;height:54px;border-left:1px dashed ${INK}"></div><div style="position:absolute;left:${(X(TD) + 5).toFixed(1)}px;top:-3px;font-size:14px;line-height:16px;color:${INK};background:#FFFFFF;padding:0 3px;white-space:nowrap">기준일</div>`;
  return s + `</div>`;
}
const N12_CONTENT = `<p>안녕하세요, Land-XI 운영팀입니다.</p><p>서비스 안정화를 위해 아래와 같이 정기 점검을 시행합니다. 점검 시간 동안 전체 서비스 접속이 제한됩니다.</p><ul><li><b>점검 일시:</b> 2026-04-25(금) 01:00 ~ 04:00 (3시간)</li><li><b>점검 내용:</b> DB 인덱스 재구성, OS 보안 패치, AI 추론 엔진 업그레이드</li><li><b>영향:</b> 관리자 페이지·지도 서비스·분석 실행 전면 중단</li></ul><p>불편을 드려 죄송합니다. 점검 완료 시 별도 공지 드리겠습니다.</p>`;
const vRow = (label, val, last) => `<div style="display:flex;padding:7px 0;${last ? '' : `border-bottom:1px solid ${H};`}"><div class="lab" style="width:72px;flex:none;letter-spacing:0;padding-top:4px">${label}</div><div style="flex:1;min-width:0;font-size:15.5px;line-height:24px;letter-spacing:-.01em">${val}</div></div>`;
const attachList = (files, removable) => files.length ? files.map(([n, b]) => `<div style="display:flex;align-items:center;gap:8px;height:30px;white-space:nowrap">${svg(IC.clip, 15, G)}<span style="font-size:15px;border-bottom:1px solid ${removable ? 'transparent' : INK}">${esc(n)}</span><span class="n" style="font-size:14px;color:${G}">${fsize(b)}</span>${removable ? `<span style="font-size:14px;color:${G};border-bottom:1px solid ${G};margin-left:4px">삭제</span>` : ''}</div>`).join('') : `<span style="color:${G};font-size:15px">첨부된 파일이 없습니다.</span>`;
const metaFoot = (o) => `<div style="display:flex;gap:18px;white-space:nowrap;font-size:14.5px;color:${G};padding-top:10px">${[['등록자', mask(o.author)], ['등록 일시', dt(o.createdAt, 19)], ['수정자', mask(o.updater)], ['수정 일시', dt(o.updatedAt, 19)]].map(([l, v]) => `<span>${l} <span class="${/일시/.test(l) ? 'n' : ''}" style="color:${INK};font-size:14.5px">${v}</span></span>`).join('')}</div>`;
function noticeViewPanel(R, n) {
  const body = `<div style="padding:12px 2px 0">
<div style="display:flex;align-items:center;gap:10px;font-size:15px">${catWord(n.cat)}<span class="mic">구분</span></div>
<div style="font-size:19px;line-height:27px;font-weight:500;letter-spacing:-.015em;margin-top:2px">${esc(n.title)}</div>
<div style="margin-top:10px;border-top:1px solid ${H}">
${vRow('게시 기간', `<span class="n" style="font-size:14.5px">${periodTxt(n)}</span>`)}
${vRow('팝업 설정', n.popup ? `메인화면 팝업 표시 · <span class="n" style="font-size:14.5px">${dt(n.popup[0])} ~ ${dt(n.popup[1])}</span>` : `<span style="color:${G}">표시 안 함</span>`)}
</div>
${tlBig(R.w - 4, [n.startAt, n.endAt], n.popup)}
<div style="border-top:1px solid ${H};margin-top:6px"></div>
${vRow('내용', `<div style="display:flex;gap:8px"><div class="rte" style="height:104px;overflow:hidden;font-size:15px;line-height:23px;flex:1">${N12_CONTENT}</div>${scrollBar(104)}</div>`)}
${vRow('첨부 파일', attachList(n.files), true)}
</div>`;
  const foot = `${btn2('목록', 84)}<div style="flex:1"></div>${btn2('삭제', 84)}${btn1('수정', 108)}`;
  return panel(R, '공지사항 열람', `<span class="n mic">No. ${n.id}</span>`, body + `<div style="position:absolute;left:2px;right:0;bottom:6px;background:#FFFFFF;border-top:1px solid ${H}">${metaFoot(n)}</div>`, foot);
}
const fLabel = (s, req, right) => `<div style="display:flex;align-items:baseline;gap:4px;white-space:nowrap;margin-bottom:5px"><span class="lab" style="letter-spacing:0;color:${INK}">${s}</span>${req ? `<span style="color:${ACC};font-size:14px">*</span>` : ''}<div style="flex:1"></div>${right || ''}</div>`;
const errMsg = (s) => `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:14px;line-height:18px;font-weight:500;color:${INK};white-space:nowrap"><span style="width:3px;height:14px;background:${INK}"></span>${s}</div>`;
const rte = (h, content, btns, ph) => `<div style="border:1px solid ${H}"><div style="height:34px;display:flex;align-items:center;gap:2px;padding:0 6px;border-bottom:1px solid ${H};background:#FAFAFA;white-space:nowrap">${btns.map(b => b === '|' ? `<span style="width:1px;height:16px;background:${H};margin:0 5px"></span>` : `<span style="display:inline-flex;align-items:center;justify-content:center;height:26px;min-width:26px;padding:0 6px;font-size:14.5px;color:${INK}">${b}</span>`).join('')}</div><div class="rte" style="height:${h}px;overflow:hidden;padding:8px 12px;font-size:15px;line-height:23px;color:${content ? INK : '#8A8A8A'}">${content || ph}</div></div>`;
const RTE_FULL = ['<b>B</b>', '<u>U</u>', '<s>S</s>', '|', '• 목록', '1. 목록', '|', '⟵', '⎯', '⟶', '|', '링크', '이미지', '↺'];
const RTE_REPLY = ['<b>B</b>', '<u>U</u>', '<s>S</s>', '|', '• 목록', '1. 목록', '|', '링크', '↺'];
const ATT_HINT_S = '허용 확장자 13종(.jpg ~ .hwp) · 파일당 최대 10.0 MB · 최대 3개';
const ATT_HINT = '허용 확장자: .jpg, .jpeg, .png, .gif, .bmp, .pdf, .xlsx, .xls, .doc, .docx, .ppt, .pptx, .hwp · 파일당 최대 10.0 MB · 최대 3개';
function noticeFormPanel(R, n, err, y = FOCUS_Y) {
  const E = !!err, on = n && n.popup;
  const body = `<div style="padding:12px 2px 0">
<div style="display:flex;gap:16px"><div style="width:132px;flex:none">${fLabel('구분', true)}${sel(n ? CAT[n.cat] : '선택', 132, E ? `border-color:${INK};` : '')}${E ? errMsg('구분을 선택해 주세요.') : ''}</div>
<div style="flex:1;min-width:0">${fLabel('제목', true, `<span class="n mic" style="font-size:14px"><span style="color:${INK}">${n ? n.title.length : 0}</span>자/200자</span>`)}<div style="display:flex">${inp('제목을 입력해 주세요.', 0, n && n.title, E ? `border-color:${INK};` : '')}</div>${E ? errMsg('제목을 입력해 주세요.') : ''}</div></div>
<div style="margin-top:${E ? 8 : 9}px">${fLabel('게시 기간', true)}<div style="display:flex;align-items:center;gap:6px;white-space:nowrap">${dateIn(n ? n.startAt.substring(0, 10) : '')}${timeIn(n ? n.startAt.substring(11, 16) : '00:00')}<span style="color:${G};margin:0 4px">~</span>${dateIn(n ? n.endAt.substring(0, 10) : '')}${timeIn(n ? n.endAt.substring(11, 16) : '23:59')}<span style="display:inline-flex;align-items:center;gap:6px;font-size:15px;margin-left:12px">${cb(false)}무한 게시</span></div>${E ? errMsg('게시 기간을 입력해 주세요.') : ''}</div>
<div style="margin-top:${E ? 8 : 9}px">${fLabel('팝업 설정', true)}<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><span style="display:inline-flex;align-items:center;gap:6px;font-size:15px;margin-right:8px">${cb(on)}메인화면 팝업 표시</span>${dateIn(on ? n.popup[0].substring(0, 10) : '', 116, !on)}${timeIn(on ? n.popup[0].substring(11, 16) : '00:00', !on)}<span style="color:${G};margin:0 4px">~</span>${dateIn(on ? n.popup[1].substring(0, 10) : '', 116, !on)}${timeIn(on ? n.popup[1].substring(11, 16) : '23:59', !on)}</div>
<div style="display:flex;align-items:center;gap:4px;margin-top:6px;white-space:nowrap"><span class="mic" style="margin-right:6px">팝업 기간 빠른 선택</span>${['1주일', '2주일', '3주일', '4주일'].map(l => quick(l, false, !on)).join('')}</div></div>
${n ? tlBig(R.w - 4, [n.startAt, n.endAt], n.popup) : ''}
<div style="margin-top:${n ? 4 : E ? 8 : 12}px">${fLabel('내용', true)}${rte(n ? 62 : E ? 84 : 190, n ? N12_CONTENT : '', RTE_FULL, '내용을 입력하세요')}${E ? errMsg('내용을 입력해 주세요.') : ''}</div>
<div style="margin-top:${E ? 8 : 7}px">${fLabel('첨부 파일')}<div style="display:flex;align-items:center;gap:14px">${btnS('+ 파일 추가')}<div>${attachList(n ? n.files : [], true)}</div></div><div style="margin-top:5px;font-size:14px;line-height:18px;color:${G}">${ATT_HINT}</div></div>
</div>`;
  return panel(R, n ? '공지사항 수정' : '공지사항 등록', n ? `<span class="n mic">No. ${n.id}</span>` : `<span class="mic"><span style="color:${ACC}">*</span> 필수 입력</span>`, body, `<div style="flex:1"></div>${btn2('취소', 84)}${btn1('저장', 108)}`, y);
}

// =====================================================================
// 문의 관리 — admin-inquiry.html SEED 12 (답변 대기 6)
// =====================================================================
const Q = (id, title, author, dept, status, createdAt, files, answeredAt, content, answer) => ({ id, title, author, dept, status, createdAt, files: files || [], answeredAt, answeredBy: answeredAt ? '이주원' : '', content, answer });
const INQ = [
  Q(115, '사용자 매뉴얼 PDF 최신본을 어디서 받을 수 있나요?', '차남호', '환경관리과', 'pending', '2026-04-22T15:08:33', [], '', '서비스 지원 > 사용자 매뉴얼 링크가 비어있어 다운로드가 되지 않습니다. 최신본(v2.3 기준) 받을 수 있는 경로 알려주세요.'),
  Q(114, '분석 결과 지도 위에 중첩되는 표시 투명도를 조절할 수 있나요?', '박정수', '도로관리과', 'pending', '2026-04-20T10:41:02', [], '', '도로 포장 재질 레이어와 포트홀 탐지 결과를 동시에 보니 가독성이 떨어집니다. 레이어별 투명도 슬라이더가 있으면 좋겠습니다.'),
  Q(113, '지도 서비스에서 확대하면 일부 영역이 회색으로 표시됩니다', '박정수', '도로관리과', 'replied', '2026-04-17T13:20:44', [['회색표시_캡처.png', 1820000]], '2026-04-18T09:55:10',
    '인월면 동쪽 산간 지역을 18단계 이상 확대하면 정사영상이 회색 타일로 바뀌는데, 최신 영상이 해당 구역만 누락된 것인지 캐시 문제인지 확인 부탁드립니다.\n\n브라우저: Chrome 122, 사용자 계정: pa***@namwon.go.kr',
    '안녕하세요, 도로관리과 기술지원입니다.\n\n확인 결과 해당 구역(인월면 동쪽 산간)은 2026-03 촬영분에서 구름 때문에 촬영 누락된 구역입니다. 2026-05 재촬영 일정에 포함돼 있어, 6월 초 배포 시 정상 표시 예정입니다.\n\n임시로 2024년 정사영상 레이어를 사용하시면 해당 구역도 확인 가능합니다.'),
  Q(112, '농업기술센터용 대시보드 위젯 커스터마이징 요청', '노명석', '농업기술센터', 'pending', '2026-04-16T11:12:05'),
  Q(111, '분석 이력 검색 시 날짜 범위 최대치 제한이 있나요?', '유정호', '기획감사실', 'replied', '2026-04-14T16:45:00', [], '2026-04-15T08:30:00'),
  Q(110, '곤포사일리지 탐지 결과가 실제 현장과 차이 나는 경우가 있어요', '손지영', '농업기술센터', 'replied', '2026-04-14T14:22:10', [['운봉면4권역_현장사진.zip', 4832000], ['필지_지번_목록.xlsx', 28500]], '2026-04-16T10:12:40'),
  Q(109, '환경관리과 업무용으로 지도 레이어 권한 분리 요청', '차남호', '환경관리과', 'pending', '2026-04-11T09:30:12'),
  Q(108, '회원가입 신청 후 승인까지 얼마나 걸리나요?', '강해원', '홍보전산과(외부협력)', 'replied', '2026-04-09T10:15:22', [], '2026-04-09T14:02:11'),
  Q(107, '보고서 PDF 에 지도 캡처 이미지가 잘려서 나옵니다', '김서영', '환경관리과', 'pending', '2026-04-07T16:22:08', [['보고서_세로방향_잘림.pdf', 740000]]),
  Q(106, 'AI 추론 보고서 활용 방법 문의', '이한길', '도로관리과', 'replied', '2026-04-03T10:00:59', [], '2026-04-04T09:12:00'),
  Q(105, '비밀번호 5회 실패 후 잠금 해제는 어떻게 하나요?', '오길수', '도로관리과', 'replied', '2026-03-28T14:10:40', [], '2026-03-28T15:22:01'),
  Q(104, '모바일에서 지도가 느리게 로딩됩니다', '정용찬', '홍보전산과', 'pending', '2026-03-25T11:08:00'),
];
const qWord = (q) => q.status === 'replied' ? word('답변 완료', ACC) : word('답변 대기', WARN);
function inquiryBand() {
  return bandCell(X0, 250, '미답변 문의 · 상태 = 답변 대기', [[6, '건', WARN]], `<span style="font-size:15.5px;font-weight:500;color:${WARN}">답변 필요</span>`)
    + bandSep(396) + bandCell(420, 420, '상태', [[12, '전체', ACC, true], [6, '답변 완료', ACC]])
    + box(1000, BAND_Y + 40, 384, 24, 'display:flex;justify-content:flex-end;white-space:nowrap', `<span class="mic">서비스 지원 › 문의하기(contact.html)와 같은 저장소</span>`)
    + hl(X0, RULE1, CW);
}
const inquirySearch = () => searchRow(`${fLab('검색어')}${sel('전체', 92)}${inp('검색어', 0, '')}${period('등록일', '', '', 0)}${searchBtns}`);
function inquiryList(L, selId, compact, y = LIST_Y) {
  const num = (t) => `<span class="n" style="font-size:14px;color:${G}">${t}</span>`;
  const clip = (q) => q.files.length ? ` <span style="display:inline-block;vertical-align:-2px;margin-left:2px">${svg(IC.clip, 14, G, ';display:inline-block')}</span>` : '';
  const two = (a, b) => `<div style="line-height:19px">${a}</div><div style="line-height:17px">${b}</div>`;
  if (compact) {
    const rows = INQ.slice(0, 10).map(q => ({ sel: q.id === selId, c: [`<div style="line-height:24px;overflow:hidden;text-overflow:ellipsis">${esc(q.title)}${clip(q)}</div><div style="display:flex;gap:10px;font-size:14px;line-height:18px;color:${G};margin-top:1px"><span style="font-size:14px">${qWord(q)}</span><span>${mask(q.author)} · ${num(dt(q.createdAt))}</span>${q.answeredAt ? `<span>답변 ${mask(q.answeredBy)} · ${num(dt(q.answeredAt))}</span>` : ''}</div>`] }));
    return table(L.x, y, L.w, [{ l: `문의 목록 · <span class="n">12</span>건` }], rows, 58);
  }
  const cols = [{ l: '제목' }, { l: '상태', w: 66 }, { l: '등록자 · 등록 일시', w: 124 }, { l: '답변자 · 답변 일시', w: 124 }];
  const rows = INQ.slice(0, 10).map(q => ({ sel: q.id === selId, c: [`${esc(q.title)}${clip(q)}`, qWord(q), two(mask(q.author), num(dt(q.createdAt))), q.answeredAt ? two(mask(q.answeredBy), num(dt(q.answeredAt))) : `<span style="color:${C}">-</span>`] }));
  return table(L.x, y, L.w, cols, rows, 45);
}
const scrollBar = (h, k = .45) => `<div style="width:3px;height:${h}px;background:${H};flex:none;position:relative"><div style="position:absolute;left:0;top:0;width:3px;height:${Math.round(h * k)}px;background:${G}"></div></div>`;
function inquiryPanel(R, q, focus, y = LIST_Y) {
  const replied = q.status === 'replied';
  const nl = (s) => esc(s).replace(/\n/g, '<br>');
  const qh = focus ? 0 : 69;
  const body = `<div style="padding:12px 2px 0">
<div style="display:flex;align-items:center;gap:10px;white-space:nowrap"><span style="font-size:14.5px;font-weight:500;border:1px solid ${INK};padding:0 7px;line-height:22px">질문</span><span style="font-size:15px">${qWord(q)}</span><div style="flex:1"></div><span style="font-size:14.5px;color:${G}">등록자 ${mask(q.author)} · ${q.dept} · <span class="n">${dt(q.createdAt, 19)}</span></span></div>
<div style="font-size:${focus ? 21 : 18.5}px;line-height:${focus ? 30 : 26}px;font-weight:500;letter-spacing:-.015em;margin-top:8px">${esc(q.title)}</div>
<div style="display:flex;gap:8px;margin-top:6px"><div style="flex:1;font-size:${focus ? 16 : 15}px;line-height:${focus ? 26 : 23}px;color:#2A2A2C;${qh ? `height:${qh}px;overflow:hidden` : ''}">${nl(q.content)}</div>${qh ? scrollBar(qh, .6) : ''}</div>
<div style="margin-top:${focus ? 12 : 6}px;display:flex;align-items:center;gap:10px"><span class="lab" style="letter-spacing:0;width:62px">첨부 파일</span><div>${q.files.length ? attachList(q.files) : `<span style="color:${G};font-size:15px">첨부된 파일이 없습니다.</span>`}</div></div>
<div style="border-top:1px solid ${INK};margin-top:${focus ? 16 : 8}px;padding-top:${focus ? 14 : 8}px">
<div style="display:flex;align-items:center;gap:10px;white-space:nowrap;margin-bottom:8px"><span style="font-size:14.5px;font-weight:500;background:${INK};color:#FFFFFF;padding:0 7px;line-height:24px">답변</span><span style="font-size:14.5px;color:${replied ? G : WARN}">${replied ? `답변자 ${mask(q.answeredBy)} · <span class="n">${dt(q.answeredAt, 19)}</span>` : '미답변'}</span><div style="flex:1"></div><span class="mic">답변 내용</span></div>
<div style="${focus ? `outline:2px solid ${ACC};outline-offset:-1px` : ''}">${rte(focus ? 236 : 100, replied ? nl(q.answer) : (focus ? `<span style="display:inline-block;width:1px;height:18px;background:${INK};vertical-align:-3px;margin-right:2px"></span>답변을 입력하세요. 저장 시 문의 상태가 '답변 완료'로 변경됩니다.` : ''), RTE_REPLY, "답변을 입력하세요. 저장 시 문의 상태가 '답변 완료'로 변경됩니다.")}</div>
<div style="margin-top:8px;display:flex;align-items:center;gap:12px;white-space:nowrap">${btnS('+ 파일 추가')}<span style="font-size:14px;line-height:17px;color:${G};${focus ? 'white-space:normal' : ''}">${focus ? ATT_HINT : ATT_HINT_S}</span></div>
<div style="margin-top:4px;font-size:15px;line-height:22px;color:${G}">첨부된 파일이 없습니다.</div>
</div></div>`;
  return panel(R, replied ? '문의 열람 · 답변 수정' : '문의 열람 · 답변 작성', `<span class="n mic">No. ${q.id}</span>`, body, `${btn2('목록', 84)}<div style="flex:1"></div>${replied ? '' : `<span class="mic" style="padding-bottom:9px">저장 시 '답변 완료'로 변경</span>`}${btn1('답변 저장', 124)}`, y);
}

// =====================================================================
// 자주 묻는 질문 관리 — admin-faq.html 시드 15 · 구분 6
// =====================================================================
const FCAT = { '01': '서비스 이용', '02': '데이터 업로드', '03': '분석 서비스', '04': '오류 및 점검', '05': '자료 다운로드', '06': '기타' };
const FQ = (id, cat, q, createdAt, files) => ({ id, cat, q, createdAt, files: files || [], author: '이주원', updater: '', updatedAt: '' });
const FAQS = [
  FQ(15, '01', '담당자가 변경된 경우 기존 계정을 어떻게 해야 하나요?', '2026-04-18T14:20:00'),
  FQ(14, '04', '갑자기 분석 작업이 "실패" 로 표시돼요.', '2026-04-10T11:02:00', [['지원포맷_상세표.pdf', 184000]]),
  FQ(13, '03', '정사영상과 카메라 영상의 분석 결과는 어떻게 다른가요?', '2026-03-25T09:30:00'),
  FQ(12, '05', '보고서를 공문서 양식으로 자동 변환할 수 있나요?', '2026-03-15T16:40:00'),
  FQ(11, '02', 'GeoTIFF 파일 업로드 시 좌표계가 깨져 나옵니다.', '2026-03-08T10:12:00', [['QGIS_좌표계_변환_가이드.pdf', 620000]]),
  FQ(10, '06', '서비스 운영 시간이 정해져 있나요?', '2026-02-28T13:50:00'),
  FQ(9, '01', '여러 사용자가 같은 계정으로 동시 접속할 수 있나요?', '2026-02-20T09:05:00'),
  FQ(8, '03', '분석 대상 지역을 어떻게 지정하나요?', '2026-01-18T15:30:00'),
  FQ(7, '06', '모바일에서도 동일하게 사용할 수 있나요?', '2025-12-24T10:30:00'),
  FQ(6, '05', '분석 결과를 엑셀이나 PDF로 내려받을 수 있나요?', '2025-12-24T10:25:00'),
];
const F14_ANSWER = `<p>원인은 크게 두 가지입니다.</p><ol><li><b>영상 포맷 문제:</b> mp4(H.264/H.265), tiff 지원. 그 외 코덱은 업로드 단계에서 거부되지만, 드물게 통과 후 추론 단계에서 실패합니다.</li><li><b>추론 서버 혼잡:</b> 여러 사용자의 대용량 작업이 동시 요청된 경우. 추론 이력 &gt; 재분석 으로 재시도 부탁드립니다.</li></ol>`;
function faqBand() {
  const counts = [['01', 4], ['02', 2], ['03', 3], ['04', 2], ['05', 2], ['06', 2]];
  const its = [[15, '전체', ACC, true], ...counts.map(([k, n]) => [n, FCAT[k], ACC])];
  return bandCell(X0, 960, '자주 묻는 질문 · 구분', its)
    + box(1100, BAND_Y + 30, 284, 40, 'display:flex;justify-content:flex-end;align-items:center;gap:10px', `${btn2('선택 삭제', 110, 40)}${btn1('+ 등록', 120, 40)}`)
    + hl(X0, RULE1, CW);
}
const faqSearch = () => searchRow(`${fLab('검색어')}${sel('전체', 92)}${inp('검색어 — 질문 · 답변', 0, '')}${searchBtns}`);
function faqList(L, selId, compact, y = LIST_Y) {
  if (compact) {
    const rows = FAQS.map(f => ({ sel: f.id === selId, c: [`<div style="line-height:24px;overflow:hidden;text-overflow:ellipsis">${esc(f.q)}</div><div style="font-size:14px;line-height:18px;color:${G};margin-top:1px">${FCAT[f.cat]} · <span class="n">${dt(f.createdAt)}</span>${f.files.length ? ' · 첨부 ' + f.files.length : ''}</div>`] }));
    return table(L.x, y, L.w, [{ l: `질문 목록 · <span class="n">15</span>건` }], rows, 58);
  }
  const cols = compact ? [{ l: cb(false), w: 16 }, { l: '구분', w: 92 }, { l: '제목' }] : [{ l: cb(false), w: 16 }, { l: '구분', w: 92 }, { l: '제목' }, { l: '등록자', w: 46 }, { l: '등록 일시', w: 128 }];
  const rows = FAQS.map(f => { const c = [cb(false), `<span style="color:${G}">${FCAT[f.cat]}</span>`, `${esc(f.q)}${f.files.length ? ` <span style="display:inline-block;vertical-align:-2px;margin-left:2px">${svg(IC.clip, 14, G, ';display:inline-block')}</span>` : ''}`]; if (!compact) c.push(mask(f.author), `<span class="n" style="font-size:14.5px;color:${G}">${dt(f.createdAt)}</span>`); return { sel: f.id === selId, c }; });
  return table(L.x, LIST_Y, L.w, cols, rows, 45);
}
function faqViewPanel(R, f) {
  const body = `<div style="padding:12px 2px 0">
<div style="font-size:15px;color:${G}">${FCAT[f.cat]}<span class="mic" style="margin-left:8px">구분</span></div>
<div style="display:flex;gap:10px;margin-top:6px"><span class="d" style="font-size:26px;line-height:30px;color:${ACC}">Q</span><div style="font-size:21px;line-height:30px;font-weight:500;letter-spacing:-.015em">${esc(f.q)}</div></div>
<div style="display:flex;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid ${H}"><span class="d" style="font-size:26px;line-height:30px;color:${INK}">A</span><div class="rte" style="font-size:16.5px;line-height:28px">${F14_ANSWER}</div></div>
<div style="margin-top:12px;border-top:1px solid ${H}">${vRow('첨부 파일', attachList(f.files), true)}</div>
</div>`;
  return panel(R, '질문 열람', `<span class="n mic">No. ${f.id}</span>`, body + `<div style="position:absolute;left:2px;right:0;bottom:6px;border-top:1px solid ${H}">${metaFoot(f)}</div>`, `${btn2('목록', 84)}<div style="flex:1"></div>${btn2('삭제', 84)}${btn1('수정', 108)}`);
}
function faqFormPanel(R, f, y = FOCUS_Y) {
  const body = `<div style="padding:12px 2px 0">
<div style="display:flex;gap:16px"><div style="width:168px;flex:none">${fLabel('구분', true)}${sel(FCAT[f.cat], 168)}</div>
<div style="flex:1;min-width:0">${fLabel('제목', true, `<span class="n mic" style="font-size:14px"><span style="color:${INK}">${f.q.length}</span>자/200자</span>`)}<div style="display:flex">${inp('질문을 입력해 주세요.', 0, f.q)}</div></div></div>
<div style="margin-top:14px">${fLabel('내용', true)}${rte(292, F14_ANSWER, RTE_FULL, '답변을 입력하세요')}</div>
<div style="margin-top:12px">${fLabel('첨부 파일')}<div style="display:flex;align-items:center;gap:12px">${btnS('+ 파일 추가')}<span style="font-size:14px;line-height:18px;color:${G}">${ATT_HINT}</span></div><div style="margin-top:6px">${attachList(f.files, true)}</div></div>
</div>`;
  return panel(R, '질문 수정', `<span class="n mic">No. ${f.id}</span>`, body, `<div style="flex:1"></div>${btn2('취소', 84)}${btn1('저장', 108)}`, y);
}

// =====================================================================
// 지도 속성 관리 — admin-map.html GROUPS · map-props.js DEFAULTS (8 속성) + 실 정사영상 미리보기 판
// =====================================================================
const MP_DEF = { lxColor: '#FFF59D', lxWidth: 1, baseMap: 'satellite', searchStrokeColor: '#FFFFFF', searchWidth: 2, searchFillColor: '#FFFFFF', searchFillOpacity: 12, polyWidth: 2 };
const BASE_OPTS = [['base', '일반'], ['gray', '흑백'], ['night', '야간'], ['satellite', '위성'], ['none', '빈화면']];
const PV = { w: 700, h: 578 };
// b6-admin-ortho.jpg(700×578) 위 좌표 — 필지 경계(LX 맵) · 검색 결과 필지 · 탐지 영역(건물·시설)
const PARCELS = ['155,132 292,50 325,108 208,178', '210,183 328,113 342,200 250,248', '252,252 345,205 350,260 280,330 260,300', '52,345 112,320 108,435 55,425', '116,322 160,340 155,442 111,436', '162,342 208,350 205,440 158,442', '210,352 265,360 285,415 282,435 208,440', '302,415 402,358 425,380 310,445', '312,450 428,385 445,420 340,482', '345,488 448,425 465,445 365,510', '630,155 700,150 700,190 638,192', '640,198 700,195 700,250 650,252', '655,258 700,255 700,340 662,342'];
const SEARCH_POLY = '385,270 450,200 500,185 528,192 530,220 505,265 500,300 520,340 590,375 605,415 645,460 685,520 665,540 530,480 475,440 450,400 430,355 400,325';
const DETECT = ['108,95 200,38 225,75 148,129', '275,355 370,305 400,352 300,412', '612,34 629,33 615,145 600,144', '580,15 595,10 600,32 582,38'];
function previewPlate(x, y, w, h, s, changed) {
  const k = Math.max(w / PV.w, h / PV.h), iw = PV.w * k, ih = PV.h * k, ox = (iw - w) / 2, oy = (ih - h) / 2;
  const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
  const base = s.baseMap;
  const filt = base === 'gray' ? 'filter:grayscale(1) contrast(1.05);' : base === 'night' ? 'filter:grayscale(1) brightness(.45) contrast(1.2);' : 'filter:saturate(.92) contrast(1.03);';
  const lab = (px, py, t, col, abs) => `<div style="position:absolute;left:${abs ? px : Math.round(px * k - ox)}px;top:${abs ? py : Math.round(py * k - oy)}px;background:rgba(1,1,2,.8);color:#FFFFFF;font-size:14px;line-height:22px;padding:0 8px;white-space:nowrap;border-left:3px solid ${col}">${t}</div>`;
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:${INK}">
<img src="b6-admin-ortho.jpg" alt="" style="position:absolute;left:${(-ox).toFixed(1)}px;top:${(-oy).toFixed(1)}px;width:${iw.toFixed(1)}px;height:${ih.toFixed(1)}px;max-width:none;display:block;${filt}">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(ox / k).toFixed(2)} ${(oy / k).toFixed(2)} ${(w / k).toFixed(2)} ${(h / k).toFixed(2)}" width="${w}" height="${h}" style="position:absolute;left:0;top:0;display:block">
${PARCELS.map(p => `<polygon points="${p}" fill="none" stroke="${s.lxColor}" stroke-width="${(s.lxWidth / k).toFixed(2)}" stroke-linejoin="miter"/>`).join('')}
<polygon points="${SEARCH_POLY}" fill="${rgba(s.searchFillColor, s.searchFillOpacity / 100)}" stroke="${s.searchStrokeColor}" stroke-width="${(s.searchWidth / k).toFixed(2)}" stroke-linejoin="miter"/>
${DETECT.map(p => `<polygon points="${p}" fill="rgba(15,169,160,.16)" stroke="${TEAL}" stroke-width="${(s.polyWidth / k).toFixed(2)}" stroke-linejoin="miter"/>`).join('')}
</svg>
${lab(14, 14, `기본 배경 지도 · ${BASE_OPTS.find(o => o[0] === base)[1]}`, '#FFFFFF', true)}
${lab(330, 96, `LX 맵 경계선 ${s.lxWidth} px`, s.lxColor)}
${lab(408, 232, `검색 결과 · 선 ${s.searchWidth} px · 면 ${s.searchFillOpacity} %`, s.searchStrokeColor)}
${lab(404, 330, `탐지 영역 외곽선 ${s.polyWidth} px`, TEAL)}
<div style="position:absolute;left:0;right:0;bottom:0;height:30px;background:rgba(1,1,2,.8);display:flex;align-items:center;padding:0 12px;gap:10px;white-space:nowrap;color:#FFFFFF;font-size:14px"><span>${changed ? '미리보기 — 저장 전 값으로 다시 그림' : '미리보기 — 저장된 값'}</span><div style="flex:1"></div><span class="n" style="color:rgba(255,255,255,.8)">남원 농경지 정사영상 2025.04 · 드론 GSD 1.08 cm</span></div>
</div>`;
}
const swatch = (hex) => `<span style="display:inline-block;width:22px;height:22px;background:${hex};border:1px solid ${/^#F/i.test(hex) ? '#9A9A9A' : hex};flex:none"></span>`;
const lineSample = (px, col = INK) => `<span style="display:inline-block;width:44px;height:${px}px;background:${col};flex:none"></span>`;
function mapBoard(edit) {
  const s = edit ? { ...MP_DEF, lxWidth: 2, searchFillOpacity: 28, polyWidth: 4, searchStrokeColor: '#FFFFFF' } : MP_DEF;
  const L = { x: X0, w: 568 }, PX = 724, PW = XR - 724;
  const chg = (key) => edit && s[key] !== MP_DEF[key];
  const chTag = (key, unit) => chg(key) ? `<span style="font-size:14px;color:${ACC};white-space:nowrap">변경됨 · 저장값 ${MP_DEF[key]}${unit}</span>` : '';
  const colorF = (key, label) => edit
    ? `<div style="flex:1;min-width:0">${fLabel(label)}<div style="display:flex;gap:6px">${swatch(s[key]).replace('width:22px;height:22px', 'width:36px;height:36px')}<span class="n" style="display:inline-flex;align-items:center;height:36px;flex:1;border:1px solid ${H};padding:0 10px;font-size:15px">${s[key]}</span></div></div>`
    : `<div style="flex:1;min-width:0"><div class="lab" style="letter-spacing:0">${label}</div><div style="display:flex;align-items:center;gap:8px;margin-top:8px">${swatch(s[key])}<span class="n" style="font-size:15.5px">${s[key]}</span></div></div>`;
  const numF = (key, label, unit, hint) => edit
    ? `<div style="flex:1;min-width:0">${fLabel(`${label} (${unit})`)}<div style="display:flex;align-items:center;gap:10px"><span class="n" style="display:inline-flex;align-items:center;justify-content:space-between;height:36px;width:92px;border:1px solid ${chg(key) ? ACC : H};padding:0 10px;font-size:15.5px;flex:none">${s[key]}<span style="font-size:14px;color:${G};line-height:9px;text-align:center">▴<br>▾</span></span>${chTag(key, unit === 'px' ? ' px' : ' %')}</div>${hint ? `<div class="mic" style="margin-top:5px;font-size:14px;line-height:18px">${hint}</div>` : ''}</div>`
    : `<div style="flex:1;min-width:0"><div class="lab" style="letter-spacing:0">${label}</div><div style="display:flex;align-items:center;gap:10px;margin-top:8px;height:24px">${unit === 'px' ? lineSample(s[key]) : ''}<span class="n" style="font-size:15.5px">${s[key]} ${unit}</span></div></div>`;
  const grp = (icon, title, inner, key) => `<div style="border-top:1px solid ${INK};padding-bottom:${edit ? 14 : 12}px"><div style="height:32px;background:${T1};display:flex;align-items:center;gap:8px;padding:0 12px;white-space:nowrap">${svg(icon, 15, ACC)}<span style="font-size:15.5px;font-weight:500">${title}</span></div><div style="padding:${edit ? 12 : 13}px 12px 0">${inner}</div></div>`;
  const baseRow = edit
    ? `<div>${fLabel('기본 배경 지도')}<div style="display:flex;gap:16px;height:36px;align-items:center">${BASE_OPTS.map(([k, l]) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:15.5px;white-space:nowrap">${radio(k === s.baseMap)}${l}</span>`).join('')}</div></div>`
    : `<div style="flex:1;min-width:0"><div class="lab" style="letter-spacing:0">기본 배경 지도</div><div style="margin-top:8px;font-size:16px;font-weight:500">${BASE_OPTS.find(o => o[0] === s.baseMap)[1]}</div></div>`;
  let s2 = shell('map');
  // 밴드: 현재 저장값 요약(8 속성 중 핵심 3) + 모드
  s2 += box(X0, BAND_Y, 700, 72, '', `<div class="lab">지도 속성 · 지도 서비스(ximap.html)가 실제 렌더에 쓰는 값과 1:1</div><div style="margin-top:12px;display:flex;align-items:center;gap:14px;white-space:nowrap"><span class="d" style="font-size:26px;line-height:34px">${edit ? '속성 변경' : '속성 조회'}</span><span style="font-size:15.5px;color:${G}">${edit ? '지도 표시 속성을 변경합니다. 변경 후 저장하세요' : 'LX 맵 구분 스타일 · 기본 배경 지도 · 탐지 결과 색상·두께'}</span></div>`);
  s2 += box(900, BAND_Y + 30, 484, 40, 'display:flex;justify-content:flex-end;align-items:center;gap:10px;white-space:nowrap', edit ? `${btn2('기본값 복원', 120, 40)}<span style="width:14px"></span>${btn2('취소', 84, 40)}${btn1('저장', 120, 40)}` : `${btn1('수정', 120, 40)}`);
  s2 += hl(X0, RULE1, CW);
  const GY = 274;
  s2 += `<div style="position:absolute;left:${L.x}px;top:${GY}px;width:${L.w}px;display:flex;flex-direction:column;gap:${edit ? 12 : 16}px">
${grp(IC.map, 'LX 맵', `<div style="display:flex;gap:20px">${colorF('lxColor', 'LX 맵 경계선 색상')}${numF('lxWidth', 'LX 맵 경계선 두께', 'px')}</div>`)}
${grp(IC.search, '검색 결과 표시', `<div style="display:flex;gap:20px">${colorF('searchStrokeColor', '검색 결과 경계선 색')}${numF('searchWidth', '검색 결과 경계선 두께', 'px')}</div><div style="display:flex;gap:20px;margin-top:${edit ? 12 : 18}px">${colorF('searchFillColor', '검색 결과 면 색')}${numF('searchFillOpacity', '검색 결과 면 투명도', '%', edit ? '숫자가 낮을수록 투명, 높을수록 불투명 (0 = 완전 투명)' : '')}</div>`)}
${grp(IC.layers, '배경 지도 / 탐지 표시', edit ? `${baseRow}<div style="display:flex;gap:20px;margin-top:12px">${numF('polyWidth', '탐지 영역 외곽선 두께', 'px')}<div style="flex:1"></div></div>` : `<div style="display:flex;gap:20px">${baseRow}${numF('polyWidth', '탐지 영역 외곽선 두께', 'px')}</div>`)}
${edit ? '' : grp(IC.clock, '수정 기록', `<div style="display:flex;gap:20px"><div style="flex:1"><div class="lab" style="letter-spacing:0">수정자</div><div style="margin-top:8px;font-size:16px;color:${G}">-</div></div><div style="flex:1"><div class="lab" style="letter-spacing:0">수정 일시</div><div style="margin-top:8px;font-size:16px;color:${G}">- <span class="mic" style="margin-left:8px">저장 이력 없음 · 기본값 상태</span></div></div></div>`)}
</div>`;
  s2 += vl(PX - 20, GY, BOT - GY);
  s2 += previewPlate(PX, GY, PW, BOT - GY, s, edit);
  return s2;
}

// =====================================================================
// 아트보드 조립 · 출력
// =====================================================================
const CSS = `
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
@font-face{font-family:"Paperlogy";font-weight:800;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2") format("woff2")}
@font-face{font-family:"Paperlogy";font-weight:700;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2") format("woff2")}
*{box-sizing:border-box}
body{margin:0;background:#FFFFFF;color:#010102;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;font-weight:400;font-size:18px;line-height:1.6;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.01em}
.n{font-family:'Inter',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.lab{font-size:14px;line-height:1.2;color:#686868;letter-spacing:.04em}
.mic{font-size:14px;line-height:1.35;color:#686868}
.chip{height:24px;line-height:22px;padding:0 9px;border:1px solid #DDDDDD;color:#686868;font-size:14px;white-space:nowrap;display:inline-block}
.rte p{margin:0 0 6px}.rte ul,.rte ol{margin:0 0 6px;padding-left:20px}.rte b{font-weight:500}
[data-line]{clip-path:inset(-5px 0px);overflow:clip;display:block}
@keyframes lineIn{from{transform:translateY(20px)}to{transform:translateY(0)}}
.in [data-line]>*{animation:lineIn 600ms cubic-bezier(.15,1,.3,1) both}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;
function write(name, body) {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>${CSS}</style></helmet>
<div style="width:${W}px;height:${HT}px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;color:#010102">
${body}
</div>
</x-dc>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUTDIR, `${name}.dc.html`), html, 'utf8');
  console.log('wrote', name, html.length);
}

const noticeBase = (L, selId) => shell('notice') + noticeBand() + noticeSearch() + noticeList(L, selId);
const noticeFocus = (selId) => shell('notice') + noticeList(SF.L, selId, true, FOCUS_Y) + pager(SF.L.x, 808, SF.L.w, 1, 2, 12, 1, 10, true);
const faqFocus = (selId) => shell('faq') + faqList(SF.L, selId, true, FOCUS_Y) + pager(SF.L.x, 808, SF.L.w, 1, 2, 15, 1, 10, true);
const inquiryBase = (selId) => shell('inquiry') + inquiryBand() + inquirySearch() + inquiryList(SP.L, selId) + pager(SP.L.x, 808, SP.L.w, 1, 2, 12, 1, 10);
const faqBase = (L, selId, compact) => shell('faq') + faqBand() + faqSearch() + faqList(L, selId, compact);

const BOARDS = {
  'B6-Admin-Users-Opt1': boardUsersOpt1(),
  'B6-Admin-Users-Opt2': boardUsersOpt2(18),
  'B6-Admin-Users-Opt3': boardUsersOpt3(),
  'B6-Admin-Users-Detail': boardUsersOpt2(19),
  'B6-Admin-Users-Approve': boardUsersOpt2(18, confirmModal('이 사용자의 가입을 승인하시겠습니까?')),
  'B6-Admin-Users-Login': boardUsersOpt2(4, historyModal(byId(4), 'login')),
  'B6-Admin-Users-Pwd': boardUsersOpt2(4, historyModal(byId(4), 'pwd')),
  'B6-Admin-Users-Login-Empty': boardUsersOpt2(18, historyModal(byId(18), 'login', true)),
  'B6-Admin-Users-Pwd-Empty': boardUsersOpt2(18, historyModal(byId(18), 'pwd', true)),
  'B6-Admin-Users-Empty': shell('users') + usersBand() + usersSearch({ dept: '산림과' }) + table(SP.L.x, LIST_Y, SP.L.w, [{ l: '이름', w: 62 }, { l: '아이디(이메일)' }, { l: '부서 · 직위', w: 156 }, { l: '계정상태', w: 56 }, { l: '가입일시', w: 134 }, { l: '처리상태', w: 56 }], [])
    + box(SP.L.x, LIST_Y + 49, SP.L.w, 0, '', emptyBlock('검색 조건에 맞는 사용자가 없습니다.', '부서 = “산림과” · 시연 시드 21명 중 일치 0 — 초기화로 전체 목록 복귀', 424)) + pager(SP.L.x, 808, SP.L.w, 1, 1, 0, 0, 0)
    + panel(SP.R, '사용자 정보 열람', '', `<div style="padding-top:16px">${emptyBlock('선택된 사용자가 없습니다', '목록에서 행을 고르면 여기서 열람 · 승인 · 권한 저장', 454)}</div>`, ''),
  'B6-Admin-Notice': noticeBase(SP.L, 12) + pager(SP.L.x, 808, SP.L.w, 1, 2, 12, 1, 10) + noticeViewPanel(SP.R, NOTICES[0]),
  'B6-Admin-Notice-Form': noticeFocus(12) + noticeFormPanel(SF.R, NOTICES[0]),
  'B6-Admin-Notice-Form-Error': noticeFocus(0) + noticeFormPanel(SF.R, null, true),
  'B6-Admin-Notice-Delete': noticeBase(SP.L, 12) + pager(SP.L.x, 808, SP.L.w, 1, 2, 12, 1, 10) + noticeViewPanel(SP.R, NOTICES[0]) + confirmModal('이 공지사항을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.', '삭제'),
  'B6-Admin-Inquiry': inquiryBase(113) + inquiryPanel(SP.R, INQ[2]),
  'B6-Admin-Inquiry-Reply': shell('inquiry') + inquiryList(SF.L, 115, true, FOCUS_Y) + pager(SF.L.x, 808, SF.L.w, 1, 2, 12, 1, 10, true) + inquiryPanel(SF.R, INQ[0], true, FOCUS_Y),
  'B6-Admin-Faq': faqBase(SP.L, 14) + pager(SP.L.x, 808, SP.L.w, 1, 2, 15, 1, 10) + faqViewPanel(SP.R, FAQS[1]),
  'B6-Admin-Faq-Form': faqFocus(14) + faqFormPanel(SF.R, FAQS[1]),
  'B6-Admin-Map': mapBoard(false),
  'B6-Admin-Map-Edit': mapBoard(true),
};
for (const [name, body] of Object.entries(BOARDS)) write(name, body);
