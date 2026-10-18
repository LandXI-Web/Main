/* 소개 영상 3판 이야기 판(원칙 297 · 10-18 2판 피드백 반영)
   - 2판과 같은 틀: 커서 없음 · 화면은 자르지 않고 통째로 줄여 위(SCREEN) · 자막은 아래 띠에만 · 확대(줌) 없음
   - 바뀐 것: 전국 지도 차오름 끝까지 · 직원 대시보드 잘림 없음(큰 창) · 영업 → 활용 사례 · 영농관리 결과 지도 + 드론 촬영 요청 ·
     학습 = 블록 끌어 놓고 이어 학습 시작 · 지도 서비스 = 원주 건축물 결과(남원 비닐하우스 X) · XI ChatGEO(LLM) 한 흐름(물음 → 지도 → 통계 → 보고서) ·
     해외 한 컷 · 끝 = 흰 바탕에 LX 한국국토정보공사 CI + Land-XI 플랫폼만(마지막 컷)
   SHOTS: 자막 한 장 = 나레이션 한 줄 = 한 컷. pieces = 원본 녹화 구간(raw/<clip>.mp4, 초) · speed 빠르기 · blur 가림(원본 1920×1080 좌표) · keep = 그림 길이 그대로.
   raw 의 p1-list · p2-label · p4-models · k1-kg 는 2판 원본 그대로(바뀐 것 없음). */
export const SCREEN = { x: 136, y: 18, w: 1648, h: 927 };
export const BAND = { y: 945, h: 135 };
export const BG = '#F2F4F6';
export const XF = 0.4;
export const LEAD = 0.45, TAIL = 0.5;

export const CHAPTERS = { 1: '메인 화면', 2: '직원 · 영업 · 지자체 화면', 3: '학습데이터 구축 · 모델 개발', 4: '지도 서비스', 5: 'XI맵 · XI ChatGEO', 6: '해외 서비스' };

export const SHOTS = [
  { id: 'main', ch: 1, cap: ['Land-XI 플랫폼', 'Hyper Performance · Hyper Solution · Hyper GeoAI 통합 플랫폼 서비스'],
    narr: 'Land-XI는 한국국토정보공사가 제공하는 GeoAI 실태조사 플랫폼입니다.',
    pieces: [{ clip: 'm1-main', from: 0.3, to: 4.17, speed: 0.6 }] },
  { id: 'main-map', ch: 1, cap: ['전국을 한 지도에', '위성 · 항공 · 드론 영상을 AI가 전국 단위로 분석합니다'],
    narr: '위성과 항공, 드론 영상을 AI가 전국 단위로 분석해, 지도에 바로 보여 줍니다.', keep: true,
    pieces: [{ clip: 'm1-main', from: 4.17, to: 6.79, speed: 1.3 }, { clip: 'm1-main', from: 6.79, to: 12.41, speed: 1.35 }, { clip: 'm1-main', from: 12.41, to: 14.6 }] },

  { id: 'staff', ch: 2, cap: ['LX 직원 대시보드', '프로젝트 진행과 할 일을 한 화면에'],
    narr: 'LX 직원은 로그인하면, 대시보드에서 프로젝트 진행과 할 일을 한눈에 봅니다.',
    pieces: [{ clip: 'm2-dash', from: 0.3, to: 4.9, speed: 1.4, blur: [387, 632, 332, 48] }, { clip: 'm2-dash', from: 10.2, to: 17.5 }] },
  { id: 'sales', ch: 2, cap: ['활용 사례', '같은 분석서비스, 지역마다 나온 결과'],
    narr: '활용 사례에서는 같은 분석서비스가 지역마다 낸 결과를 지도와 함께 보여 줍니다.', keep: true,
    pieces: [{ clip: 's1-sales', from: 2.0, to: 4.9, speed: 1.8 }, { clip: 's1-sales', from: 5.2, to: 9.0 }, { clip: 's1-sales', from: 10.6, to: 14.6 }] },
  { id: 'gov', ch: 2, cap: ['지자체 화면 · 남원시', '기관에 공유된 AI 분석서비스'],
    narr: '지자체는 기관 전용 주소로 들어와, 공유받은 분석서비스를 바로 씁니다.',
    pieces: [{ clip: 'n1-nw', from: 0.3, to: 5.6 }] },
  { id: 'gov-farm', ch: 2, cap: ['영농관리 서비스 · 결과 지도', '경작 · 휴경 분석 결과를 지도에서 바로'],
    narr: '영농관리 서비스에서는 경작과 휴경 분석 결과를, 현황판과 결과 지도에서 바로 확인합니다.', keep: true,
    pieces: [{ clip: 'n1-nw', from: 5.7, to: 9.0 }, { clip: 'n1-nw', from: 14.5, to: 18.5, speed: 1.4 }, { clip: 'n1-nw', from: 18.6, to: 26.6, speed: 2.5 }, { clip: 'n1-nw', from: 26.6, to: 28.3 }] },
  { id: 'gov-req', ch: 2, cap: ['드론 촬영 요청', '찍을 곳을 그리면 대략 비용까지 · 찍은 뒤 바로 분석'],
    narr: '드론 촬영이 필요하면, 찍을 곳을 그려 촬영과 분석을 함께 요청합니다.', keep: true,
    pieces: [{ clip: 'n2-req', from: 1.8, to: 6.6, speed: 1.25 }, { clip: 'n2-req', from: 7.6, to: 13.2, speed: 1.7 }, { clip: 'n2-req', from: 13.2, to: 16.6 }] },

  { id: 'project', ch: 3, cap: ['AI 모델 개발 프로젝트', '데이터 올리기부터 배포 신청까지 여섯 단계'],
    narr: 'AI 모델은 프로젝트로 만듭니다. 데이터 올리기부터 배포 신청까지 여섯 단계입니다.',
    pieces: [{ clip: 'p1-list', from: 0, to: 6.4 }] },
  { id: 'label', ch: 3, cap: ['학습데이터 구축(라벨링)', '라벨이 그려진 그림을 한 장씩 확인합니다'],
    narr: '학습데이터 구축 단계에서는 라벨이 그려진 그림을 확인하고, 맞지 않는 그림은 뺍니다.',
    pieces: [{ clip: 'p2-label', from: 1.5, to: 10.4 }] },
  { id: 'train', ch: 3, cap: ['학습 · 블록을 끌어 놓고 잇기', '데이터 · 모델 · 설정을 이으면 학습 시작'],
    narr: '학습은 블록을 끌어 놓고 이어 만듭니다. 학습 시작을 누르면 대기열에 들어가 차례대로 돌아갑니다.', keep: true,
    pieces: [{ clip: 'p3-train', from: 1.6, to: 6.9, speed: 1.6 }, { clip: 'p3-train', from: 6.9, to: 17.5, speed: 3.0 }, { clip: 'p3-train', from: 20.2, to: 22.6 }, { clip: 'p3-train', from: 24.3, to: 27.6 }] },
  { id: 'models', ch: 3, cap: ['업무별 모델', 'AI 모델 정확도를 한눈에'],
    narr: '완성된 모델은 업무별로 모아, AI 모델 정확도와 함께 관리합니다.',
    pieces: [{ clip: 'p4-models', from: 0, to: 5.9 }] },

  { id: 'map', ch: 4, cap: ['지도 서비스', '분석서비스 결과를 켜고, 도형마다 필지 정보까지'],
    narr: '지도 서비스에서는 분석서비스 결과를 켜고, 도형을 누르면 분류와 면적, 필지 정보까지 봅니다.', keep: true,
    pieces: [{ clip: 'q1-map', from: 2.9, to: 8.6, speed: 1.4 }, { clip: 'q1-map', from: 8.6, to: 13.1, speed: 2.0 }, { clip: 'q1-map', from: 19.3, to: 23.6 }] },

  { id: 'chat', ch: 5, cap: ['LLM 기반 XI ChatGEO', '말로 묻고, 지도로 분석하고, 통계 보고까지'],
    narr: 'XI맵의 XI ChatGEO는 LLM 기반 지도 분석 서비스입니다. 말로 물으면, 지도가 그곳을 분석해 보여 줍니다.', keep: true,
    pieces: [{ clip: 'x1-chat', from: 1.8, to: 6.7, speed: 1.3 }, { clip: 'x1-chat', from: 6.7, to: 14.6 }] },
  { id: 'chat-stats', ch: 5, cap: ['통계 보기', '읍면동별 통계가 지도와 함께'],
    narr: '통계를 열면 읍면동별 경작지 통계가 지도와 함께 펼쳐집니다.', keep: true,
    pieces: [{ clip: 'x1-chat', from: 14.6, to: 25.6, speed: 1.4 }] },
  { id: 'chat-report', ch: 5, cap: ['“남원시 경작지 통계 보고서 만들어 줘”', '보고서 초안(한글 문서)을 바로 내려받습니다'],
    narr: '보고서를 만들어 달라고 하면, 지도 그림이 담긴 보고서 초안을 한글 문서로 바로 만들어 줍니다.', keep: true,
    pieces: [{ clip: 'x1-chat', from: 26.0, to: 34.6, speed: 1.7 }, { clip: 'x1-chat', from: 37.9, to: 43.0 }] },

  { id: 'overseas', ch: 6, cap: ['해외 서비스 · 키르기스스탄 농업부', 'AI 경작지 면적을 공식 통계와 나란히'],
    narr: '같은 플랫폼으로 해외 기관도 지원합니다. 키르기스스탄 농업부의 경작지 면적을 공식 통계와 나란히 비교합니다.', keep: true,
    pieces: [{ clip: 'k1-kg', from: 0.3, to: 13.8, speed: 2.4 }, { clip: 'k1-kg', from: 14.6, to: 18.6 }] },

  { id: 'end', ch: 7, cap: null, full: true,
    narr: '한국국토정보공사, Land-XI 플랫폼입니다.',
    pieces: [{ clip: 'e1-end', from: 0, to: 6.0 }] },
];

/* 소리용 글 — 영문 이름을 한국어 발음으로(화면 글은 그대로) */
const SAY = [[/XI ChatGEO/g, '엑스아이 챗지오'], [/XI맵/g, '엑스아이맵'], [/Land-XI/g, '랜드엑스아이'], [/Hyper GeoAI/g, '하이퍼 지오 에이아이'], [/GeoAI/g, '지오 에이아이'],
  [/Hyper Performance/g, '하이퍼 퍼포먼스'], [/Hyper Solution/g, '하이퍼 솔루션'], [/\bLLM/g, '엘엘엠'], [/\bLX\b/g, '엘엑스'], [/\bAI/g, '에이아이']];
export const say = (t) => SAY.reduce((s, [a, b]) => s.replace(a, b), t);
