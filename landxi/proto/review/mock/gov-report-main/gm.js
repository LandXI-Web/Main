/* 시안 — ?v=report | fusion | q2a | q2b | q3a | q3b. 서버 호출 0. */
(function () {
  const v = new URLSearchParams(location.search).get('v') || 'report';
  const el = document.querySelector(`.view[data-v="${v}"]`) || document.querySelector('.view');
  el.hidden = false;
  const d = new Date();
  document.getElementById('stampT').textContent = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · 바탕은 실제 화면(10-11 17:20) · 숫자는 서버 기록`;
  // 결과 있는 시군구 20곳 점 — 지도 그림 위 대략 자리(시안 · 구현 때는 시군구 경계에 칠함). 운영 기관 2곳은 채움.
  const DOTS = [[933, 557, 1], [884, 623, 1], [848, 646], [883, 607], [925, 590], [923, 556], [1018, 586], [984, 575], [937, 518], [975, 506], [965, 460], [930, 467], [952, 496], [950, 438], [905, 390], [928, 404], [1010, 362], [1046, 334], [940, 356], [962, 530]];
  document.querySelectorAll('.dots-20').forEach((box) => { for (const [x, y, on] of DOTS) { const i = document.createElement('i'); i.style.left = x + 'px'; i.style.top = y + 'px'; if (on) i.className = 'on'; box.append(i); } });
})();
