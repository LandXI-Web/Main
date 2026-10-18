/* 소개 영상 2판 이야기 판(원칙 297 · 10-18 첫 판 피드백 반영)
   - 커서 없음 · 화면은 자르지 않고 통째로 줄여 위에 놓고(SCREEN), 자막은 화면 아래 띠에만(겹침 0) · 확대(줌) 없음
   - 순서: 1 메인 → 2 직원 · 영업용 · 지자체 → 3 학습데이터 구축(라벨링) – 모델 개발 → 4 지도 서비스 → 5 XI맵(XI ChatGEO) → 6 해외 → 7 마무리(LX CI)
   SHOTS: 자막 한 장 = 나레이션 한 줄 = 한 컷. pieces = 원본 녹화 구간(raw/<clip>.mp4, 초) · speed 빠르기 · blur 가림(원본 좌표) · 컷 길이는 나레이션에 맞춰 늘림(마지막 장면을 멈춰 이어 감, 말은 빠르게 하지 않음).
   narr = 화면에 쓰는 말 그대로(narration.txt). say = 읽기 쉽게 바꾼 소리용 글(영문 이름 → 한글 발음). */
export const SCREEN = { x: 136, y: 18, w: 1648, h: 927 };   // 1920×1080 화면을 0.858 배로(가로세로 비 그대로) · 아래 띠 945–1080
export const BAND = { y: 945, h: 135 };
export const BG = '#F2F4F6';
export const XF = 0.4;            // 컷 사이 교차 전환(초)
export const LEAD = 0.45, TAIL = 0.5;   // 컷 시작 뒤 말 시작 · 말 끝난 뒤 여유

export const CHAPTERS = { 1: '메인 화면', 2: '직원 · 영업 · 지자체 화면', 3: '학습데이터 구축 · 모델 개발', 4: '지도 서비스', 5: 'XI맵 · XI ChatGEO', 6: '해외 서비스' };

export const SHOTS = [
  { id: 'main', ch: 1, cap: ['Land-XI 플랫폼', 'Hyper Performance · Hyper Solution · Hyper GeoAI 통합 플랫폼 서비스'],
    narr: 'Land-XI는 한국국토정보공사가 제공하는 GeoAI 실태조사 플랫폼입니다.',
    pieces: [{ clip: 'm1-main', from: 0.3, to: 4.2, speed: 0.6 }] },
  { id: 'main-map', ch: 1, cap: ['전국을 한 지도에', '위성 · 항공 · 드론 영상을 AI가 전국 단위로 분석합니다'],
    narr: '위성과 항공, 드론 영상을 AI가 전국 단위로 분석해, 지도에 바로 보여 줍니다.',
    pieces: [{ clip: 'm1-main', from: 4.2, to: 10.6, speed: 1.6 }, { clip: 'm1-main', from: 16.9, to: 23.8 }] },

  { id: 'staff', ch: 2, cap: ['LX 직원 대시보드', '프로젝트 진행과 할 일을 한 화면에'],
    narr: 'LX 직원은 로그인하면, 대시보드에서 프로젝트 진행과 할 일을 한눈에 봅니다.',
    pieces: [{ clip: 'm2-dash', from: 0.3, to: 4.9, speed: 1.4, blur: [326, 558, 366, 54] }, { clip: 'm2-dash', from: 9.4, to: 16.6 }] },
  { id: 'sales', ch: 2, cap: ['영업용 서비스 카탈로그', '운영 중인 분석서비스와 활용 사례'],
    narr: '영업 화면에서는 운영 중인 분석서비스와 활용 사례를 기관에 소개합니다.',
    keep: true,
    pieces: [{ clip: 's1-sales', from: 0.3, to: 2.8 }, { clip: 's1-sales', from: 8.0, to: 11.4 }, { clip: 's1-sales', from: 13.6, to: 15.6 }] },
  { id: 'gov', ch: 2, cap: ['지자체 화면 · 남원시', '기관에 공유된 AI 분석서비스'],
    narr: '지자체는 기관 전용 주소로 들어와, 공유받은 분석서비스를 바로 씁니다.',
    pieces: [{ clip: 'n1-nw', from: 0.3, to: 5.6 }] },
  { id: 'gov-farm', ch: 2, cap: ['영농관리 서비스', '경작 · 휴경 결과와 읍면별 통계'],
    narr: '남원시는 영농관리 서비스에서 경작과 휴경 결과, 읍면별 통계를 바로 확인합니다.',
    keep: true,
    pieces: [{ clip: 'n1-nw', from: 5.7, to: 10.2 }, { clip: 'n1-nw', from: 16.5, to: 20.5 }] },

  { id: 'project', ch: 3, cap: ['AI 모델 개발 프로젝트', '데이터 올리기부터 배포 신청까지 여섯 단계'],
    narr: 'AI 모델은 프로젝트로 만듭니다. 데이터 올리기부터 배포 신청까지 여섯 단계입니다.',
    pieces: [{ clip: 'p1-list', from: 0, to: 6.4 }] },
  { id: 'label', ch: 3, cap: ['학습데이터 구축(라벨링)', '라벨이 그려진 그림을 한 장씩 확인합니다'],
    narr: '학습데이터 구축 단계에서는 라벨이 그려진 그림을 확인하고, 맞지 않는 그림은 뺍니다.',
    pieces: [{ clip: 'p2-label', from: 1.5, to: 10.4 }] },
  { id: 'train', ch: 3, cap: ['학습 · AI 모델 작업 흐름', '블록을 이어 학습하고, 정확도를 확인합니다'],
    narr: '학습은 블록을 이어 흐름을 만들고, 반복할수록 오르는 정확도를 바로 확인합니다.',
    pieces: [{ clip: 'p3-train', from: 0, to: 8.4 }] },
  { id: 'models', ch: 3, cap: ['업무별 모델', 'AI 모델 정확도를 한눈에'],
    narr: '완성된 모델은 업무별로 모아, AI 모델 정확도와 함께 관리합니다.',
    pieces: [{ clip: 'p4-models', from: 0, to: 5.9 }] },

  { id: 'map', ch: 4, cap: ['지도 서비스', '결과를 연속지적과 겹쳐 보고, 분석서비스 결과도 켭니다'],
    narr: '지도 서비스에서는 분석 결과를 연속지적과 겹쳐 보고, 분석서비스 결과도 골라 켭니다.', keep: true,
    pieces: [{ clip: 'q1-map', from: 0.3, to: 14.8, speed: 2.0 }, { clip: 'q1-map', from: 19.5, to: 22.0 }] },

  { id: 'xi', ch: 5, cap: ['XI맵', '전국 분석 결과를 한 지도에'],
    narr: 'XI맵은 전국의 분석 결과를 한 지도에 모아 보여 줍니다.',
    pieces: [{ clip: 'x1-chat', from: 0.3, to: 5.0 }] },
  { id: 'chat', ch: 5, cap: ['XI ChatGEO', '“남원시 경작지 현황 보여 줘” — 말로 묻고, 지도로 답합니다'],
    narr: 'XI ChatGEO에 말로 물으면, 지도가 그곳으로 가서 답을 보여 줍니다.',
    keep: true,
    pieces: [{ clip: 'x1-chat', from: 5.0, to: 16.0, speed: 1.2 }] },
  { id: 'chat-follow', ch: 5, cap: ['“그중 가장 큰 곳은?”', '답을 따라 지도가 그곳을 비춥니다'],
    narr: '이어서 그중 가장 큰 곳을 물으면, 답을 따라 지도가 그곳을 강조합니다.',
    keep: true,
    pieces: [{ clip: 'x1-chat', from: 17.0, to: 27.0, speed: 1.15 }] },

  { id: 'overseas', ch: 6, cap: ['해외 서비스 · 키르기스스탄 농업부', '위성영상으로 경작지 면적을 분석합니다'],
    narr: '같은 플랫폼으로 해외 기관도 지원합니다. 키르기스스탄 농업부의 경작지 면적 분석입니다.',
    pieces: [{ clip: 'k1-kg', from: 0.3, to: 13.8, speed: 1.6 }] },
  { id: 'official', ch: 6, cap: ['공식 통계와 나란히', 'AI 경작지 면적 · 공식 면적 · 차이'],
    narr: 'AI가 추정한 경작지 면적은 공식 통계와 나란히 놓고 비교합니다.',
    pieces: [{ clip: 'k1-kg', from: 14.6, to: 21.3 }] },

  { id: 'end', ch: 7, cap: null, full: true,
    narr: 'Hyper Performance, Hyper Solution, Hyper GeoAI. 한국국토정보공사 Land-XI입니다.',
    pieces: [{ clip: 'e1-end', from: 0, to: 9.3 }] },
];

/* 소리용 글 — 영문 이름을 한국어 발음으로(화면 글은 그대로) */
const SAY = [[/XI ChatGEO/g, '엑스아이 챗지오'], [/XI맵/g, '엑스아이맵'], [/Land-XI/g, '랜드엑스아이'], [/Hyper GeoAI/g, '하이퍼 지오 에이아이'], [/GeoAI/g, '지오 에이아이'],
  [/Hyper Performance/g, '하이퍼 퍼포먼스'], [/Hyper Solution/g, '하이퍼 솔루션'], [/\bLX\b/g, '엘엑스'], [/\bAI/g, '에이아이']];
export const say = (t) => SAY.reduce((s, [a, b]) => s.replace(a, b), t);
