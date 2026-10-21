/* 숏츠 2판 이야기 판(10-21 사용자 "왜 영상이 모바일 버젼이지?" → PC 화면 · "로딩중이 계속 뜨는데 이런게 뜨면 안된다")
   PC 화면(1920×1080 · 그림 2880×1620)을 세로 화면(1080×1920) 위쪽 무대(1080×1620)에: 먼저 화면 전체(폭 1080 · 위아래는 같은 그림을 흐리고 밝게) → 보여 줄 곳으로 천천히 확대.
   cam = [컷 안 초, 가운데 x, 가운데 y, 창 폭] (PC 화면 좌표 · 창 높이 = 폭 × 1.5 · 사이는 ease-in-out). 폭 1920 = 화면 전체.
   조각은 로딩 표시가 보인 구간(raw2/capture-log.json loading)을 피해서 고름 — shorts-v2-edit 가 다시 검사한다.
   화면 글은 'XI ChatGEO'(10-18 "LLM 기반은 삭제하자") · 숫자는 화면에 나온 것만(자막엔 숫자 없음). */
export const XF = 0.35, IN = 0.25;
export const CH = { 1: '메인 화면', 2: '전국 단위 AI 분석 결과', 3: 'XI ChatGEO 지도 분석 · 보고서' };
const FULL = [960, 540, 1920];
export const SHOTS = [
  { id: 'main-hero', ch: 1, cap: ['Hyper GeoAI 통합 플랫폼 서비스', 'Hyper Performance · Hyper Solution'], still: 1.2,
    pieces: [{ clip: 'd1-main', from: 0.4, to: 2.6 }, { clip: 'd1-main', from: 2.6, to: 4.4, speed: 1.3 }],
    cam: [[0, ...FULL], [1.6, ...FULL], [3.4, 1000, 560, 1500]] },
  { id: 'main-fill', ch: 1, cap: ['AI가 전국 단위로 분석', '위성 · 항공 · 드론 영상을 한 지도에'], still: 2.9,
    pieces: [{ clip: 'd1-main', from: 4.4, to: 9.6, speed: 1.6 }],
    cam: [[0, 1000, 560, 1500], [1.6, 1200, 540, 720], [3.3, 1200, 540, 720]] },
  { id: 'nat-all', ch: 2, cap: ['전국 단위 AI 분석 결과', '하천구역 안 건물 · 농지 이용(경작지 · 비닐하우스)'], still: 1.2,
    pieces: [{ clip: 'd2-nat-a', from: 0.3, to: 2.6 }, { clip: 'd2-fly', from: 0, to: 4.5, speed: 1.3 }],
    cam: [[0, ...FULL], [1.9, ...FULL], [5.5, 1000, 540, 720]] },
  { id: 'nat-zoom', ch: 2, cap: ['가까이 가면 객체 하나하나', '건물 · 경작지 · 비닐하우스 — 함양군 강가 들녘'], still: 2.8,
    pieces: [{ clip: 'd2-nat-b', from: 0.2, to: 3.8 }],
    cam: [[0, 1000, 540, 720], [3.6, 940, 520, 640]] },
  { id: 'chat-ask', ch: 3, cap: ['XI ChatGEO', '말로 묻고, 지도로 분석하고'], still: 2.3,
    pieces: [{ clip: 'd3-chat', from: 1.3, to: 2.85, speed: 1.2 }, { clip: 'd3-chat', from: 11.15, to: 12.88 }],
    cam: [[0, 1000, 540, 720], [1.2, 1000, 540, 720], [2.3, 1000, 540, 1240], [2.9, 1000, 540, 1240]] },
  { id: 'chat-stats', ch: 3, cap: ['읍면동별 통계를 지도와 함께', '색칠을 끄면 영상과 결과가 또렷이'], still: 1.6,
    pieces: [{ clip: 'd3-chat', from: 13.0, to: 15.0 }, { clip: 'd3-chat', from: 30.4, to: 33.0 }],
    cam: [[0, 1556, 540, 720], [1.9, 1556, 540, 720], [3.3, 1150, 540, 1240], [4.4, 1150, 540, 1240]] },
  { id: 'chat-report', ch: 3, cap: ['“보고서 만들어 줘”', '보고서(한글 문서)까지 바로'], still: 5.0,
    pieces: [{ clip: 'd3-chat', from: 33.5, to: 35.25, speed: 1.7 }, { clip: 'd3-chat', from: 36.65, to: 38.4 }, { clip: 'd3-chat', from: 38.6, to: 42.0 }],
    cam: [[0, 1000, 540, 720], [2.4, 1000, 540, 720], [3.6, 1280, 760, 440], [5.7, 1280, 760, 440]] },
  { id: 'end', ch: 0, full: true, still: 3.0, pieces: [{ clip: 'e1-end', from: 0.1, to: 3.6, raw: 'raw' }] },
];
