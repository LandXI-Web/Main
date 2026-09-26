/* drawer-report.js — 우 서랍 '보고서'. 서랍 틀은 drawer-stats.js 의 drawer() 를 함께 쓴다(한 서랍 · 탭 둘).
   기존 report-standard.html?embed=1 을 iframe 으로(수정 없음). 요청자 = 현재 계정(세션 realm/role 을 쿼리로 넘긴다). */
export function openReport(dr, sess) {
  dr.open('report', { requester: sess?.role ? `${sess.realm}:${sess.role}` : 'guest' });
}
