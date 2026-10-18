/* 소개 영상 이야기 판 — 조각(원본 녹화 구간)과 자막. 시간은 raw/<clip>.marks.json 을 보고 정한 값(초).
   speed: 빠르게(1.3 = 1.3배) · zoom: [끝 배율, 중심 x, 중심 y] 천천히 다가가기 · blur: [x, y, w, h] 가림(로그인 아이디 칸) · xf: 앞 조각과의 교차 전환(초) */
export const XF = 0.45;   // 장면 사이
const IN = 0.3;           // 장면 안 이음

export const SEGMENTS = [
  // 1 메인 — 지구 → 전국 지도(전국 분석 결과가 차오름)
  { scene: 'main', clip: 's1-main', from: 0.5, to: 3.9 },
  { scene: 'main', clip: 's1-main', from: 4.2, to: 11.0, speed: 1.7, xf: IN },
  { scene: 'main', clip: 's1-main', from: 17.5, to: 21.8, xf: IN },
  // 2 로그인 → LX 직원 대시보드 → 칸 크기 · 테마
  { scene: 'login', clip: 's2-login', from: 0.4, to: 6.0, speed: 1.3, blur: [326, 558, 366, 54] },
  { scene: 'login', clip: 's2-login', from: 10.9, to: 13.6 },
  { scene: 'login', clip: 's2-login', from: 17.9, to: 26.4, speed: 2.0, xf: IN },
  { scene: 'login', clip: 's2-login', from: 29.4, to: 33.2, speed: 1.4, xf: IN },
  // 3 XI맵 — 왼쪽 위 한 줄 → 시도 · 시군구 칩 → 서비스 → 지도
  { scene: 'xi', clip: 's3-xi', from: 1.2, to: 12.8, speed: 1.5 },
  { scene: 'xi', clip: 's3-xi', from: 20.9, to: 24.2, xf: IN },
  // 4 XI ChatGEO — 묻고 → 지도가 따라감
  { scene: 'chat', clip: 's4-chat', from: 3.6, to: 11.8, speed: 1.25 },
  { scene: 'chat', clip: 's4-chat', from: 19.2, to: 28.4, speed: 1.3, xf: IN },
  // 5 프로젝트 — 새 프로젝트 → 공유 데이터 → 크게 보기 → 분석하기
  { scene: 'project', clip: 's5-project', from: 0.6, to: 10.9, speed: 1.9 },
  { scene: 'project', clip: 's5-project', from: 12.6, to: 20.8, speed: 1.6, xf: IN },
  { scene: 'project', clip: 's5-project', from: 29.0, to: 32.4, xf: IN },
  // 6 기관 서비스(남원시) — 내 서비스 → 서비스 → 통계 · 대장 견주기 · 보고서
  { scene: 'namwon', clip: 's6a-nw', from: 0.8, to: 4.3 },
  { scene: 'namwon', clip: 's6a-nw', from: 6.2, to: 9.4, xf: IN },
  { scene: 'namwon', clip: 's6a-nw', from: 11.4, to: 15.2, xf: IN },
  { scene: 'namwon', clip: 's6b-feed', from: 1.2, to: 10.4, speed: 1.5, zoom: [1.14, 0.97, 0.5], xf: IN },
  { scene: 'namwon', clip: 's6c-report', from: 1.0, to: 4.4, speed: 1.3, xf: IN },
  { scene: 'namwon', clip: 's6c-report', from: 7.0, to: 12.6, speed: 1.3, xf: IN },
  // 7 해외(키르기스스탄) — 경작지 → 공식 통계와 나란히
  { scene: 'overseas', clip: 's7-kg', from: 1.6, to: 14.2, speed: 1.9 },
  { scene: 'overseas', clip: 's7-kg', from: 17.0, to: 23.4, zoom: [1.32, 1, 0.72], xf: IN },
  // 8 끝 — 모토 + LX 한국국토정보공사
  { scene: 'end', clip: 's8-end', from: 0.2, to: 5.4 },
];

/* 자막 — seg: 위 조각 번호 · at: 그 조각 시작부터 몇 초 · 첫 줄 = 제목, 다음 줄 = 한 줄 설명(의미 단위 · 2줄 이내) */
const XI = 'left:120px;bottom:118px', TL = 'left:120px;top:150px';
export const CAPTIONS = [
  { seg: 1, at: 2.4, dur: 6.0, scene: 'main', kicker: 'Hyper Performance · Solution · GeoAI', lines: ['Land-XI 플랫폼', 'AI가 위성·항공·드론 영상을 전국 단위로 분석합니다'] },
  { seg: 3, at: 0.6, dur: 3.6, scene: 'login', pos: 'tr', lines: ['로그인하면', '역할별 첫 화면으로 바로 갑니다'] },
  { seg: 5, at: 0.3, dur: 6.6, scene: 'dashboard', css: 'left:120px;bottom:60px', lines: ['내 대시보드를 내 방식으로', '칸 크기 · 자리 · 테마를 사람마다 기억합니다'] },
  { seg: 7, at: 2.6, dur: 5.6, scene: 'ximap', css: XI, lines: ['XI맵', '어느 시군구에 어떤 서비스가 있는지 한눈에'] },
  { seg: 8, at: 0.2, dur: 3.6, scene: 'ximap-result', css: XI, lines: ['누르면 그 결과가 바로 지도에', '시도 → 시군구 → 서비스 · 마지막 분석 날짜까지'] },
  { seg: 9, at: 0.2, dur: 6.4, scene: 'chatgeo', css: TL, lines: ['XI ChatGEO', '말로 묻고, 지도로 답합니다'] },
  { seg: 10, at: 2.0, dur: 5.6, scene: 'chatgeo-follow', css: TL, lines: ['“그중 가장 큰 곳은?”', '답을 따라 지도가 그곳을 비춥니다'] },
  { seg: 11, at: 0.4, dur: 5.6, scene: 'project', css: 'right:64px;bottom:72px', lines: ['새 프로젝트', '공유 데이터 영상을 고릅니다'] },
  { seg: 12, at: 0.6, dur: 4.6, scene: 'viewer', css: 'left:96px;top:150px', lines: ['크게 펼쳐 자세히 보고', '닫으면 고르던 자리 그대로'] },
  { seg: 13, at: 0.3, dur: 3.0, scene: 'analyze', css: 'right:64px;bottom:72px', lines: ['분석하기', '서비스를 골라 AI 분석을 맡깁니다'] },
  { seg: 14, at: 0.3, dur: 6.0, scene: 'namwon', css: 'right:64px;bottom:120px', kicker: '기관 서비스 · 남원시', lines: ['영농관리 행정서비스', 'AI 분석 결과와 통계를 기관이 바로 봅니다'] },
  { seg: 17, at: 0.4, dur: 5.6, scene: 'feed', css: 'left:480px;bottom:60px', lines: ['대장과 AI 결과 견주기', '사료작물 신청 필지를 읍면동별로 맞음 · 다름'] },
  { seg: 18, at: 0.6, dur: 6.4, scene: 'report', css: 'left:120px;bottom:60px', lines: ['고르면 바로 만들어지는 보고서', '한글 문서 · 엑셀로 내려받기'] },
  { seg: 20, at: 0.4, dur: 6.2, scene: 'overseas', css: 'left:40px;top:150px', kicker: '해외 · 키르기스스탄 농업부', lines: ['경작지 면적 분석', '같은 플랫폼, 해외 기관 화면'] },
  { seg: 21, at: 0.5, dur: 5.2, scene: 'official', css: 'left:64px;bottom:72px', lines: ['공식 통계와 나란히', 'AI 경작지 면적 · 공식 면적 · 차이'] },
];
