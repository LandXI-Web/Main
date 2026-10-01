/* 기관 브랜드 한 벌(구현 2차 T3 · GF-1 · GF-3 · GF-5 ⓐ · 원칙 48 · 64) — 기관 메인(gov-home) · 서비스 선택(gov-select) · 기관 정보 고치기 ·
   LX 관리자 기관 서랍이 같이 쓴다. 정본은 서버(GET /brand/{기관}) — 화면은 읽어서 입힌다.
   기관색이 쓰이는 자리는 넷뿐(법전 · brand.md): 마크 · 현재 위치 표시 · 진행 막대 · 서비스 얼굴 판. 나머지는 법전 토큰 그대로.
   대비 검사식은 서버(landxi_api/brand.py check_colors)와 같다 — 화면은 미리 보여 주기만 하고, 저장 여부는 서버가 정한다. */
import { api, API } from '../../shared/api-v1.js';
import { h, esc } from '../kit/util.js';
import { emblemOf } from '../../assets/data/emblems.js';

/* 브랜드 스타일 한 벌 — 이 모듈을 쓰는 화면(LX 관리자 화면 포함)에 한 번만 붙인다 */
{
  const href = new URL('./brand.css', import.meta.url).href;
  if (typeof document !== 'undefined' && ![...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === href)) {
    document.head.append(h('link', { rel: 'stylesheet', href }));
  }
}

export const LIMITS = { platform: 30, short: 12, mark_line: 6, headline_line: 20, line: 60, item: 40, contact: 30 };
export const MARK_RULE = { bytes: 1_000_000, min: 64, max: 2048, types: ['image/png', 'image/jpeg', 'image/webp'] };

/* ── 대비 검사(서버와 같은 식) ─────────────────────────────── */
const HEX = /^#[0-9A-Fa-f]{6}$/;
export function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; }
/** → 걸린 것 [{key, why}] · 비면 통과 */
export function checkColors(accent, tint) {
  if (!HEX.test(accent || '')) return [{ key: 'accent', why: '진한 색은 #RRGGBB 형식이어야 합니다' }];
  if (!HEX.test(tint || '')) return [{ key: 'tint', why: '연한 바탕은 #RRGGBB 형식이어야 합니다' }];
  const bad = [];
  const w = contrast(accent, '#FFFFFF');
  if (w < 4.5) bad.push({ key: 'accent', why: `진한 색이 흰 바탕에서 잘 읽히지 않습니다(대비 ${w} — 4.5 이상)` });
  if (lum(accent) < 0.05) bad.push({ key: 'accent', why: '검정에 가까운 색은 기관색으로 쓸 수 없습니다' });
  if (contrast(tint, '#FFFFFF') > 1.6) bad.push({ key: 'tint', why: '연한 바탕이 너무 짙습니다(흰 바탕과 차이 1.6 이하)' });
  if (contrast(accent, tint) < 3) bad.push({ key: 'tint', why: '진한 색과 연한 바탕의 차이가 작습니다(대비 3 이상)' });
  return bad;
}
/** 두 색 섞기(연한 바탕 위 선 색) */
export function mix(a, b, t) {
  return '#' + [1, 3, 5].map((i) => { const x = parseInt(a.slice(i, i + 2), 16), y = parseInt(b.slice(i, i + 2), 16); return Math.round(x + (y - x) * t).toString(16).padStart(2, '0'); }).join('').toUpperCase();
}

/* ── 읽기 · 입히기 ─────────────────────────────────────────── */
/** 서버 정본 — 로그인 전에도 읽힌다(공개 정보만). 세션이 있으면 고칠 수 있는지(can_edit)도 온다 */
export const loadBrand = (id) => api(`/brand/${encodeURIComponent(id)}`);

/** 기관색을 CSS 변수로(--ci 진한 · --ci-t1 연한 · --ci-line 판 위 선). 서비스 얼굴 판(emblems)은 .gb-face 안에서 이 값을 쓴다 */
export function applyBrand(el, b) {
  const a = b?.color?.accent, t = b?.color?.tint;
  if (!HEX.test(a || '') || !HEX.test(t || '')) return;
  el.style.setProperty('--ci', a);
  el.style.setProperty('--ci-t1', t);
  el.style.setProperty('--ci-line', mix(t, a, 0.2));
}

/** 마크 — 그림이 있으면 그림, 없으면 두 줄 글자(기관색) */
export function markEl(b, { size = 'md' } = {}) {
  const img = b?.mark?.image;
  if (img) return h('span.gb-mark.gb-mark--img', { dataset: { size } }, h('img', { src: API.base + img, alt: `${b.platform || ''} 마크`, decoding: 'async' }));
  const lines = (b?.mark?.text || []).slice(0, 2);
  const long = lines.some((s) => [...s].length > 2) ? '1' : '0';   // 세 글자 넘는 줄(영문 약자 등)은 한 단계 작게 — 마크 칸 안에
  return h('span.gb-mark', { dataset: { size, lines: String(lines.length), long }, 'aria-hidden': 'true' }, ...lines.map((s) => h('span', { text: s })));
}

/** 서비스 얼굴 판 — LX 가 서비스마다 그린 판(emblems.js 선언표)에 기관색이 입혀진다. 선언이 없으면 빈 판 */
export function faceEl(card, cls = '') {
  const svg = (emblemOf(card) || '<svg class="em" viewBox="0 0 160 100" aria-hidden="true"><rect width="160" height="100" fill="var(--t1)"/></svg>')
    .replace(/preserveAspectRatio="[^"]*"/, '').replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ');   // 판을 자리 가득(가로세로가 달라도 빈 띠 없이)
  return h('div.gb-face', { class: cls, html: svg, 'aria-hidden': 'true' });
}

/** 한 줄 소개 — ' · ' 앞에서 줄이 바뀌어 줄 머리에 가운뎃점이 오지 않게(§2-1) */
export function joinLine(s) {
  return String(s || '').replace(/ · /g, ' · ');
}

/** 상태 칩 농도 — 운영·시범 = 잉크 · 첫 결과 전 = 대기 · 내년·예정 = 점선(법전 §1 상태 칩 3단) */
export const statusLv = (s) => (s === '운영' || s === '시범' ? '' : s === '첫 결과 전' ? 'wait' : 'gap');
export const chip = (s) => h('span.t-chip', { text: s, dataset: statusLv(s) ? { lv: statusLv(s) } : {} });

/** 메인 머리 — 줄바꿈은 기관이 정한 곳에서만(§2-1) · 약칭은 기관색으로 */
export function headlineHtml(b) {
  const short = (b?.short || '').trim();
  return String(b?.intro?.headline || b?.platform || '').split('\n').filter(Boolean).slice(0, 2)
    .map((ln) => { const e = esc(ln); return short ? e.replace(esc(short), `<b>${esc(short)}</b>`) : e; }).join('<br>');
}

/** 브라우저 탭 아이콘 — 마크 글자를 기관색으로(그림 마크면 그림) */
export function favicon(b) {
  let href;
  if (b?.mark?.image) href = API.base + b.mark.image;
  else {
    const t = (b?.mark?.text || []).slice(0, 2), a = b?.color?.accent || '#1C1F25';
    const txt = t.map((s, i) => `<text x="32" y="${t.length > 1 ? 29 + i * 24 : 42}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="${t.length > 1 ? 22 : 28}" fill="${a}">${esc(s)}</text>`).join('');
    href = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#fff"/>${txt}</svg>`);
  }
  let l = document.querySelector('link[rel=icon]');
  if (!l) { l = h('link', { rel: 'icon' }); document.head.append(l); }
  l.href = href;
}

/** 주소에 붙은 기관의 짧은 행정 주소 — '전북특별자치도 남원시 운봉읍 권포리 1229-3' → '운봉읍 권포리 1229-3' */
export function shortAddr(addr, regionName) {
  const a = String(addr || '').trim();
  const r = String(regionName || '').trim();
  if (r && a.startsWith(r + ' ')) return a.slice(r.length + 1);
  const m = /(?:\S+[시군구])\s+(\S+[읍면동가]\s.*)$/.exec(a);
  return m ? m[1] : a;
}

/** 로그인 뒤 기관 화면 머리 = 기관 마크 · 플랫폼 이름(확인된 것 3 "로그인 뒤 머리에 기관 마크·이름·색" · 원칙 64).
    키트 관문(kit/auth-gate.js gate)이 기관 세션의 화면마다 부른다 — 셸이 그려지면 머리 글자(.k-word)만 기관 것으로 바꾼다(화면 코드 수정 0). */
export async function brandMast(tenant) {
  let b = null;
  try { b = await loadBrand(tenant); } catch { return null; }
  applyBrand(document.documentElement, b); favicon(b);
  const paint = () => {
    const w = document.querySelector('.k-mast .k-word');
    if (!w) return false;
    if (w.dataset.brand !== b.tenant) { w.replaceChildren(markEl(b), h('span.word.gb-plat', { text: b.platform })); w.dataset.brand = b.tenant; w.setAttribute('aria-label', b.platform); }
    return true;
  };
  if (!paint()) {
    const mo = new MutationObserver(() => { if (paint()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 20000);
  }
  return b;
}
