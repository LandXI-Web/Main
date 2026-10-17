/* 희망 완료일 — 기관이 분석 요청에 적은 날짜를 '희망 완료일 10월 30일' 로(LX 화면 공통).
   3일 안이거나 지났으면 lv='soon'(차분한 강조 — 글자색만) · 'late'(지남). 날짜가 없으면 null. */
export function dueOf(iso, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const left = Math.round((d - t0) / 86400000);
  const text = `희망 완료일 ${+m[2]}월 ${+m[3]}일`;
  if (left < 0) return { text, lv: 'late', note: '날짜가 지났습니다' };
  if (left <= 3) return { text, lv: 'soon', note: left === 0 ? '오늘까지' : `${left}일 남음` };
  return { text, lv: '', note: '' };
}
