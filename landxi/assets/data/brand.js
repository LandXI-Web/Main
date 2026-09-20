// 포털 기본 틀 — LX 가 만들어 파는 생산품 (2026-09-20 발주자 정의)
//
//   "지자체 포털의 **CI 등 기본 틀은 LX가 만들어 낼 수 있고 생산화** 할 수 있도록 하는 거지."
//
// 지자체가 포털을 따로 발주해 만들면 기관마다 화면이 다르고, 고칠 때마다 그 기관 용역을
// 다시 돌려야 한다. 그러면 LX 는 모델만 넣는 하청이 된다.
// **틀을 LX 가 찍어내면** — 기관은 CI 한 벌만 내고, 화면 개선은 LX 가 한 번 해서 전부에 내린다.
//
//   LX 생산   포털 골격(레일·마스트헤드·카드 홈·작업공간 5탭·푸터·로그인) + 디자인 법
//             ─ 한 번 만들고 모든 기관에 같은 것을 내린다. 고치면 전부 같이 좋아진다.
//   기관 제공  CI 한 벌 (명칭·마크·상징색·행정단위 말·문의처) ← **바꿀 수 있는 것은 이것뿐**
//
// 디자인 법(타이포·간격·라운드 0·그림자 0·표 규칙)은 **잠겨 있다**. 기관이 못 바꾼다.
// 그래야 50곳이 되어도 한 벌로 유지되고, 개선이 전부에 퍼진다.
import { TENANTS, tenantById } from './portal.js';
import { PROFILES } from './registry.js';

/* ══ 1. LX 가 생산하는 골격 — 기관이 손대지 않는 부분 ════════════════ */
export const SHELL_PARTS = [
  { id: 'rail', name: '좌측 레일 72px', what: '메뉴 · 로고 자리 · MY 플라이아웃', ci: '마크만 교체' },
  { id: 'mast', name: '마스트헤드 64px', what: '공지 띠 · 기준일', ci: '없음' },
  { id: 'home', name: '서비스 카드 홈', what: '내 지역에 깔린 카드 격자 + 머리 숫자', ci: '기관명 · 상징색' },
  { id: 'work', name: '작업공간 5탭', what: '현황 · 분석결과 · 지도 · 통계 · 보고서', ci: '없음' },
  { id: 'map', name: '지도 서비스', what: 'MapLibre · 레이어 · 속성 조회', ci: '경계 · 좌표계' },
  { id: 'report', name: '보고서 서식', what: '공문용 표지 · 표 · 발급 내역', ci: '기관명 · 마크 · 직인 자리' },
  { id: 'auth', name: '로그인 · 계정', what: '로그인 · 가입 · 찾기 · 마이페이지', ci: '기관명 · 문의처' },
  { id: 'support', name: '서비스 지원', what: '공지 · FAQ · 문의 · 활용사례 · 매뉴얼', ci: '문의처' },
];

/** 잠긴 값 — 기관 CI 로 못 덮는다. design/system.md 가 원본이다. */
export const LOCKED = {
  display: 'Paperlogy 700', body: 'Pretendard 400·500', numeral: 'Inter tabular',
  floorPx: 14, radius: 0, shadow: 0, gradient: 0, backdrop: 0,
  rail: 72, masthead: 64, margin: 56,
  rule: '채운 파란 버튼 없음 · 선과 여백으로 나눈다',
};

/* ══ 2. 기관이 내는 CI 한 벌 — 이것만 갈아 끼운다 ═══════════════════ */
/** 허용 토큰. 여기 없는 키는 generator 가 버린다(가드). */
export const CI_KEYS = ['name', 'short', 'mark', 'accent', 'tint', 'unitLabel', 'crs', 'contact', 'sealNote'];

export const THEMES = {
  lx: { name: 'LX 한국국토정보공사', short: 'LAND XI', mark: 'LAND/XI',
    accent: '#006DF7', tint: '#E8F1FF', unitLabel: '지자체', crs: 'EPSG:5186',
    contact: '063-713-1213', sealNote: 'LX 국토정보플랫폼부' },
  namwon: { name: '전북특별자치도 남원시', short: '남원시', mark: '남원/XI',
    accent: '#1F6F4A', tint: '#E9F3ED', unitLabel: '읍·면·동', crs: 'EPSG:5186',
    contact: '063-620-6114', sealNote: '남원시장' },
  'gwangju-jeonnam': { name: '광주전남특별시', short: '광주전남', mark: '光全/XI',
    accent: '#0B5FA5', tint: '#E6EFF7', unitLabel: '시·군·구', crs: 'EPSG:5186',
    contact: '062-613-2114', sealNote: '광주전남특별시장' },
  kuksan: { name: '해외 사업(대상국 미정)', short: 'GLOBAL', mark: 'G/XI',
    accent: '#5A4FCF', tint: '#ECEAF9', unitLabel: 'District', crs: 'EPSG:4326',
    contact: '—', sealNote: '—' },
};

export const themeOf = (tenantId) => {
  const t = tenantById(tenantId);
  return { id: t.id, ...(THEMES[t.profile || t.id] || THEMES.lx) };
};

/**
 * CI 를 CSS 변수로. shell.css 가 이미 쓰는 변수 이름에 **덮어쓰기만** 한다 —
 * 새 변수를 만들지 않는다. 그래야 골격 CSS 한 벌이 모든 기관에 그대로 돈다.
 */
export function cssVars(tenantId) {
  const th = themeOf(tenantId);
  return `:root{--accent:${th.accent};--tint-1:${th.tint};--tint-2:${mix(th.tint, th.accent, 0.12)}}`;
}
const mix = (a, b, t) => '#' + [0, 2, 4].map((i) => {
  const x = parseInt(a.slice(1 + i, 3 + i), 16), y = parseInt(b.slice(1 + i, 3 + i), 16);
  return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
}).join('').toUpperCase();

/* ══ 3. 가드 — 기관 CI 가 법을 깨지 못하게 ══════════════════════════ */
const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };

/** CI 한 벌이 쓸 수 있는 것인가. 배포 전에 돌린다. */
export function brandGuard(tenantId) {
  const th = themeOf(tenantId); const bad = [];
  const onWhite = contrast(th.accent, '#FFFFFF');
  if (onWhite < 4.5) bad.push({ key: 'accent', why: `흰 바탕 대비 ${onWhite} < 4.5 — 본문 글자로 못 쓴다` });
  if (contrast(th.tint, '#FFFFFF') > 1.6) bad.push({ key: 'tint', why: '연한 바탕이 너무 짙다 — 위에 얹는 글자가 죽는다' });
  Object.keys(th).forEach((k) => { if (!CI_KEYS.includes(k) && k !== 'id') bad.push({ key: k, why: '허용 토큰이 아니다 — 골격은 LX 가 정한다' }); });
  return { tenant: tenantId, contrast: onWhite, ok: !bad.length, bad };
}

/* ══ 4. 생산화 — 새 기관 포털 한 벌을 어떻게 찍어내나 ═══════════════ */
/** 기관이 내야 하는 것. 이게 다 모이면 포털이 선다. */
export const INTAKE = [
  { id: 'ci', name: 'CI 한 벌', what: '정식 명칭 · 약칭 · 마크 · 상징색 · 문의처', who: '기관', min: true },
  { id: 'boundary', name: '행정경계', what: `${'읍·면·동'} 경계 shp 또는 코드`, who: '기관', min: true },
  { id: 'unit', name: '행정단위 말', what: '읍·면·동 / 시·군·구 / District', who: '기관', min: true },
  { id: 'imagery', name: '정사영상', what: '현지 확보 — 원본은 LX 가 보관', who: '기관', min: true },
  { id: 'accounts', name: '담당자 계정', what: '부서 · 권한 범위', who: '기관', min: false },
  { id: 'seal', name: '보고서 직인', what: '공문 서식 표지 문구', who: '기관', min: false },
];

/** 한 기관 포털을 세우는 절차. 사람 손이 들어가는 칸이 적을수록 생산화다. */
export const PRODUCE = [
  { step: 1, name: 'CI 등록', by: '자동', what: 'THEMES 에 한 벌 추가 → CSS 변수로 나간다' },
  { step: 2, name: '프로파일 등록', by: '자동', what: 'PROFILES 에 경계 · 면적 · 단위 한 줄' },
  { step: 3, name: '배포본 심기', by: '자동', what: '줄 카드마다 DEPLOYS 한 줄 — 이식은 복사가 아니다' },
  { step: 4, name: '화면 생성', by: '자동', what: '명세(studio.js) → Claude Code 가 화면을 찍는다' },
  { step: 5, name: '영상 연결', by: '수동', what: '현지 정사영상 수급 · 타일 생성' },
  { step: 6, name: '검수 · 개통', by: '수동', what: 'brandGuard · healthCheck 통과 후 연다' },
];

/** 지금 몇 곳이 서 있고, 한 곳 더 세우는 데 무엇이 남았나. */
export function produceState() {
  const users = TENANTS.filter((t) => t.kind === 'user');
  return {
    tenants: users.length,
    themes: Object.keys(THEMES).length,
    profiles: PROFILES.length,
    guards: users.map((t) => brandGuard(t.id)),
    autoSteps: PRODUCE.filter((p) => p.by === '자동').length,
    manualSteps: PRODUCE.filter((p) => p.by === '수동').length,
    line: '골격 8개 부위는 LX 가 한 벌로 찍는다 — 기관은 CI 한 벌만 낸다',
  };
}
