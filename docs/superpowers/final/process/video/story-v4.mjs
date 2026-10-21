/* 소개 영상 4판 이야기 판(원칙 297 · 10-18 3판 피드백 반영 — 3판 틀 그대로)
   4판에서 바뀐 것: 지자체 다음 LX 관리자(기관 공간 · 기관에 공유) · 영농관리 = 카드 → 현황 → 결과 지도(다 그려진 뒤) · 자막 '드론 촬영 / AI 분석 요청' ·
     지도 서비스 = 강진군 경작·휴경(원주 건축물 뺌) · XI ChatGEO 보고서 = 물은 대상 그대로(635e9d05) · 끝 = 흰 바탕 LAND-XI PLATFORM + LX CI(A안)
   학습데이터 구축 = 지도 위 라벨링(16b5b5ee · 저장 · 라벨 완료는 가로챈 가짜 성공)
   (아래 3판 설명은 기록으로 남김)
   - 2판과 같은 틀: 커서 없음 · 화면은 자르지 않고 통째로 줄여 위(SCREEN) · 자막은 아래 띠에만 · 확대(줌) 없음
   - 바뀐 것: 전국 지도 차오름 끝까지 · 직원 대시보드 잘림 없음(큰 창) · 영업 → 활용 사례 · 영농관리 결과 지도 + 드론 촬영 요청 ·
     학습 = 블록 끌어 놓고 이어 학습 시작 · 지도 서비스 = 원주 건축물 결과(남원 비닐하우스 X) · XI ChatGEO 한 흐름(물음 → 지도 → 통계 → 보고서) ·
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
    pieces: [{ clip: 's1-sales', from: 2.0, to: 4.9, speed: 2.2 }, { clip: 's1-sales', from: 5.2, to: 8.4 }, { clip: 's1-sales', from: 10.6, to: 14.0 }] },
  { id: 'gov', ch: 2, cap: ['지자체 화면 · 남원시', '기관에 공유된 AI 분석서비스'],
    narr: '지자체는 기관 전용 주소로 들어와, 공유받은 분석서비스를 바로 씁니다.',
    pieces: [{ clip: 'n1-nw', from: 0.3, to: 4.4 }] },
  { id: 'admin', ch: 2, cap: ['지자체 서비스 만들기 · 기관에 공유', 'LX 관리자가 기관 공간을 열고, 승인된 분석서비스를 공유합니다'],
    narr: 'LX 관리자는 기관마다 전용 공간을 열고, 승인된 분석서비스를 체크 하나로 기관에 공유합니다.', keep: true,
    pieces: [{ clip: 'a1-admin', from: 0.3, to: 3.3, speed: 2.0 }, { clip: 'a1-admin', from: 3.4, to: 14.7, speed: 2.8 }, { clip: 'a1-admin', from: 14.8, to: 18.6 }] },
  { id: 'gov-farm', ch: 2, cap: ['영농관리 서비스 · 결과 지도', '경작 · 휴경 분석 결과를 지도에서 바로'],
    narr: '남원시는 영농관리 서비스를 열어, 경작과 휴경 분석 결과를 현황과 결과 지도에서 바로 확인합니다.', keep: true,
    pieces: [{ clip: 'n1-nw', from: 4.5, to: 7.4 }, { clip: 'n1-nw', from: 12.0, to: 14.5 }, { clip: 'n1-nw', from: 18.7, to: 26.8, speed: 3.0 }, { clip: 'n1-nw', from: 30.5, to: 33.8 }] },
  { id: 'gov-req', ch: 2, cap: ['드론 촬영 / AI 분석 요청', '찍을 곳을 그리면 대략 비용까지 · 찍은 뒤 바로 분석'],
    narr: '드론 촬영이 필요하면, 찍을 곳을 그려 촬영과 분석을 함께 요청합니다.', keep: true,
    pieces: [{ clip: 'n2-req', from: 2.6, to: 6.6, speed: 1.4 }, { clip: 'n2-req', from: 7.6, to: 13.2, speed: 2.4 }, { clip: 'n2-req', from: 13.2, to: 16.0 }] },

  { id: 'project', ch: 3, cap: ['AI 모델 개발 프로젝트', '데이터 올리기부터 배포 신청까지 여섯 단계'],
    narr: 'AI 모델은 프로젝트로 만듭니다. 데이터 올리기부터 배포 신청까지 여섯 단계입니다.',
    pieces: [{ clip: 'p1-list', from: 0, to: 6.4 }] },
  { id: 'label', ch: 3, cap: ['학습데이터 구축 · 라벨링', '지도 위 영상에 직접 그려 학습데이터를 만듭니다'],
    narr: '학습데이터 구축 단계에서는 지도 위 영상에 직접 그려 라벨을 만들고, 화면 단위로 학습 그림을 만듭니다.', keep: true,
    pieces: [{ clip: 'p2-label', from: 2.6, to: 7.2, speed: 2.0 }, { clip: 'p2-label', from: 9.0, to: 23.7, speed: 2.7 }, { clip: 'p2-label', from: 23.6, to: 27.6 }] },
  { id: 'train', ch: 3, cap: ['학습 · 블록을 끌어 놓고 잇기', '데이터 · 모델 · 설정을 이으면 학습 시작'],
    narr: '학습은 블록을 끌어 놓고 이어 만듭니다. 학습 시작을 누르면 대기열에 들어가 차례대로 돌아갑니다.', keep: true,
    pieces: [{ clip: 'p3-train', from: 1.6, to: 6.9, speed: 2.0 }, { clip: 'p3-train', from: 6.9, to: 17.5, speed: 3.6 }, { clip: 'p3-train', from: 20.2, to: 22.6 }, { clip: 'p3-train', from: 24.3, to: 27.6 }] },
  { id: 'models', ch: 3, cap: ['업무별 모델', 'AI 모델 정확도를 한눈에'],
    narr: '완성된 모델은 업무별로 모아, AI 모델 정확도와 함께 관리합니다.',
    pieces: [{ clip: 'p4-models', from: 0, to: 5.9 }] },

  { id: 'map', ch: 4, cap: ['지도 서비스 · 강진군 경작지', '분석서비스 결과를 켜고, 도형마다 필지 정보까지'],
    narr: '지도 서비스에서는 분석서비스 결과를 켜고, 도형을 누르면 분류와 면적, 필지 정보까지 봅니다.', keep: true,
    pieces: [{ clip: 'q1-map', from: 2.6, to: 9.5, speed: 2.0 }, { clip: 'q1-map', from: 18.6, to: 24.0, speed: 2.2 }, { clip: 'q1-map', from: 29.9, to: 34.6 }] },

  // 10-18 사용자: "LLM 기반 XI ChatGEO 부분 LLM 기반은 삭제하자. 그냥 XI ChatGEO 서비스 개발 로 하자."
  { id: 'chat', ch: 5, cap: ['XI ChatGEO 서비스 개발', '말로 묻고, 지도로 분석하고, 통계 보고까지'],
    narr: 'XI맵의 XI ChatGEO는 대화로 쓰는 지도 분석 서비스입니다. 말로 물으면, 지도가 그곳을 분석해 보여 줍니다.', keep: true,
    pieces: [{ clip: 'x1-chat', from: 1.8, to: 6.7, speed: 1.6 }, { clip: 'x1-chat', from: 6.7, to: 14.8 }] },
  { id: 'chat-stats', ch: 5, cap: ['통계 보기', '읍면동별 통계가 지도와 함께'],
    narr: '통계를 열면 읍면동별 경작지 통계가 지도와 함께 펼쳐집니다.', keep: true,
    pieces: [{ clip: 'x1-chat', from: 14.8, to: 27.5, speed: 2.1 }] },
  { id: 'chat-report', ch: 5, cap: ['“남원시 경작지 통계 보고서 만들어 줘”', '보고서 초안(한글 문서)을 바로 내려받습니다'],
    narr: '보고서를 만들어 달라고 하면, 같은 통계로 보고서 초안을 한글 문서로 바로 만들어 줍니다.', keep: true,
    // 10-21 사용자 "대화형 보고서 만들기 옆에 기존 통계 등 차트 바가 그대로 있으니 별로 마음에 안든다. 이 부분은 조금은 더 길더라도 잘 보여야 한다"
    // → 통계 판 없이 다시 찍은 x2-report: 물음(기다림 6.4–7.6 '답을 찾는 중' 잘라 냄) → 지도 위 답 → 대화 서랍(답 + 한글 문서 줄)에 약 11초 · 서랍 쪽으로 천천히 1.5배(서랍 글 다 들어옴)
    pieces: [{ clip: 'x2-report', from: 0.3, to: 6.3, speed: 1.5 }, { clip: 'x2-report', from: 7.7, to: 10.9 }, { clip: 'x2-report', from: 11.1, to: 16.0, zoom: { z: 1.4, cx: 1632, cy: 470, ramp: 2.5 } }] },
  // 10-21 사용자 "이후 통계 보고서가 안보이네. 통계 보고서는 대시보드 형태로 보여주는걸로 하자." → 답의 '보고서 보기'(89526271) — 대시보드 보고서를 천천히 훑음(큰 숫자 · 요약 → 막대 · 지도 → 순위 표)
  { id: 'chat-dash', ch: 5, cap: ['통계 보고서 · 대시보드로 바로', '숫자 · 읍면동 막대 · 지도 · 순위 표 — 한글 문서 · 엑셀 내려받기까지'],
    narr: '보고서 보기를 누르면, 같은 숫자로 만든 통계 보고서가 대시보드로 열리고 한글 문서와 엑셀로도 내려받습니다.', keep: true,
    pieces: [{ clip: 'x2-report', from: 17.2, to: 20.7 }, { clip: 'x2-report', from: 20.7, to: 26.6, speed: 1.4 }, { clip: 'x2-report', from: 26.6, to: 31.0, speed: 1.1 }] },

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
