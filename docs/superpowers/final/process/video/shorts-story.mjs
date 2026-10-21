/* 숏츠 이야기 판(10-21 사용자: "영상의 주요 내용은 1. 메인화면 2. 전국단위 하천계곡 의심시설/농지이용 AI분석 결과 3. LLM 기반 지도분석 및 보고서 발행의 내용으로 30초 분량")
   화면 글은 'XI ChatGEO'(10-18 "LLM 기반은 삭제하자"). 숫자는 화면에 나온 것만 — 자막엔 숫자를 쓰지 않는다.
   조각(pieces): clip = raw 장면 · from/to = 원본 초 · speed = 빠르게 · steady = 같은 그림 덜어 내기(한 걸음씩 날기 장면 — shorts-capture 'nat'). hold = 끝 그림을 더 머묾(초). */
export const XF = 0.35;      // 컷 사이 교차
export const IN = 0.25;      // 컷 안 조각 이음
export const CH = { 1: '메인 화면', 2: '전국 단위 AI 분석 결과', 3: 'XI ChatGEO 지도 분석 · 보고서' };
export const SHOTS = [
  { id: 'main-hero', ch: 1, still: 1.7, cap: ['Hyper GeoAI 통합 플랫폼 서비스', 'Hyper Performance · Hyper Solution'],
    pieces: [{ clip: 's1-main', from: 0.4, to: 2.5 }, { clip: 's1-main', from: 2.5, to: 4.3, speed: 1.3 }] },
  { id: 'main-fill', ch: 1, cap: ['AI가 전국 단위로 분석', '위성 · 항공 · 드론 영상을 한 지도에'],
    pieces: [{ clip: 's1-main', from: 4.3, to: 9.3, speed: 1.6 }] },
  { id: 'nat-all', ch: 2, still: 1.8, cap: ['전국 단위 AI 분석 결과', '하천구역 안 건물 · 농지 이용(경작지 · 비닐하우스)'],
    pieces: [{ clip: 's2-nat', from: 0.6, to: 3.17 }, { clip: 's2-nat', from: 3.17, to: 25.5, steady: true, speed: 3.6 }] },
  { id: 'nat-zoom', ch: 2, cap: ['가까이 가면 객체 하나하나', '건물 · 경작지 · 비닐하우스 — 함양군 강가 들녘'],
    pieces: [{ clip: 's2-nat', from: 25.5, to: 29.2 }] },
  { id: 'chat-ask', ch: 3, cap: ['XI ChatGEO', '말로 묻고, 지도로 분석하고'],
    pieces: [{ clip: 's3-chat', from: 1.3, to: 3.75, speed: 1.6 }, { clip: 's3-chat', from: 3.75, to: 6.7 }] },
  { id: 'chat-stats', ch: 3, cap: ['읍면동별 통계를 지도와 함께', '색칠을 끄면 영상과 결과가 또렷이'],
    pieces: [{ clip: 's3-chat', from: 9.0, to: 14.3, speed: 1.7 }] },
  { id: 'chat-report', ch: 3, cap: ['“보고서 만들어 줘”', '보고서(한글 문서)까지 바로'],
    pieces: [{ clip: 's3-chat', from: 15.6, to: 18.4, speed: 1.6 }, { clip: 's3-chat', from: 20.1, to: 23.4 }] },
  { id: 'end', ch: 0, full: true, pieces: [{ clip: 'e1-end', from: 0.1, to: 3.9 }] },
];
