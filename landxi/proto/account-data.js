/* MY(마이 페이지) 시드 — 원본 landxi7/mypage.html 의 인라인 JS 값 그대로(원판 B6-My-* 와 같은 값 · `시연`).
   PROFILE · STORAGE 612.4 / 2,048 GB · STORAGE_HISTORY 2건 · 프리셋 32–1024 · 직접 입력 10–10240 GB · 심볼 16–50px.
   바뀐 값(회원정보 · 신청 이력)은 메모리 + sessionStorage('lx_my_state') — 탭을 닫으면 시드로 돌아간다.
   브랜드 심볼만 원본과 같이 localStorage('lx_custom_symbol') = { src, w } — 계정(이 브라우저) 단위 설정. */

export const PROFILE = {
  displayName: '관리자', name: '관리자', email: 'admin@namwon.go.kr', phone: '063-620-6102',
  dept: '공간정보사업처', rank: '주무관', joined: '2025-04-10T11:18:44',
  consent: { marketing: false, sms: false, email: false },
};
export const DEPTS = ['공간정보사업처', '공간사업기획처', '디지털국토정보처', '지적측량처', '미래사업처'];
export const STORAGE = { used: 612.4, total: 2048 };
export const HISTORY = [
  { capacity: 100, reason: '정사영상 원본 누적 저장용 - 4월 광역 촬영 건', requestedAt: '2026-04-05T09:20:00', status: 'approved', note: '승인 완료 · 2026.04.08 반영' },
  { capacity: 50, reason: '카메라 분석 추론 결과 백업', requestedAt: '2026-04-12T14:42:00', status: 'pending', note: '검토 중' },
];
export const STATUS = { approved: '승인', pending: '검토 중', rejected: '반려' };
export const PRESETS = [32, 64, 128, 256, 512, 1024];
export const CAP_MIN = 10, CAP_MAX = 10240;
export const UNIT_GB = 16, PLATE_ROWS = 4, GHOST_COLS_MAX = 8;          // 칸 판: 1칸 = 16 GB · 4행 · 고스트는 최대 8열(512 GB)까지 그린다
export const SYMBOL_KEY = 'lx_custom_symbol';
export const SYMBOL_MIN = 16, SYMBOL_MAX = 50, SYMBOL_DEFAULT_W = 35;   // 원본 기본 35px · 범위 16–50px

/* 원본 문구 — 더하지도 빼지도 않는다. */
export const MSG = {
  pwdcEmpty: '비밀번호를 입력해 주세요.',
  phoneEmpty: '전화번호를 입력해 주세요.',
  pwdCurrent: '현재 비밀번호를 입력해 주세요.',
  pwdWeak: '영문·숫자·특수문자를 조합해 8자 이상 입력해 주세요.',
  pwdMismatch: '새 비밀번호가 일치하지 않습니다.',
  capRange: '10GB 이상 10240GB 이하의 용량을 입력해 주세요.',
  reasonEmpty: '신청 사유를 입력해 주세요.',
  fileHint: 'PNG 또는 SVG 파일을 업로드해 주세요.',
  fileType: 'PNG 또는 SVG 파일만 업로드할 수 있습니다.',
  tooBig: '이미지 용량이 너무 커서 저장할 수 없습니다. 더 작은 파일을 업로드해 주세요.',
};
export const TOAST = {
  editSaved: ['변경 완료', '회원정보가 저장되었습니다.'],
  editError: ['입력 오류', '전화번호를 입력해 주세요.'],
  pwdSaved: ['변경 완료', '비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.'],
  storageDone: (gb) => ['신청 완료', `${gb}GB 증량 신청이 접수되었습니다.`],
  brandSaved: ['저장 완료', '브랜드 심볼이 적용되었습니다.'],
  brandReset: ['초기화 완료', '기본 심볼로 초기화되었습니다.'],
  brandFail: ['저장 실패', MSG.tooBig],
};
export const STRONG_PW = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const KEY = 'lx_my_state';
const clone = (v) => JSON.parse(JSON.stringify(v));
export function loadState(search = '') {
  const seed = { profile: clone(PROFILE), history: clone(HISTORY) };
  if (new URLSearchParams(search).get('history') === 'empty') seed.history = [];      // 빈 상태 딥링크(원판 B6-My-History-Empty)
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw && !new URLSearchParams(search).has('history')) { const s = JSON.parse(raw); if (s?.profile && Array.isArray(s.history)) return s; }
  } catch { /* 저장소 차단 — 시드로 */ }
  return seed;
}
export function saveState(state) { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 메모리만 */ } }

export function loadSymbol() {
  try { const c = JSON.parse(localStorage.getItem(SYMBOL_KEY) || 'null'); if (c && c.src) return { src: String(c.src), w: clampW(c.w) }; } catch { /* 기본 */ }
  return null;
}
export const clampW = (w) => Math.min(SYMBOL_MAX, Math.max(SYMBOL_MIN, Math.round(Number(w) || SYMBOL_DEFAULT_W)));
