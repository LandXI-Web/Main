/* 서비스 지원 — 시드 (2026-09-20 B6 구현).
   공지 8 · FAQ 13 · 활용사례 2 · 매뉴얼 5 = ../assets/data/support-data.js (원본과 바이트 동일, 클래식 스크립트 → window.SP_*).
   문의 12건(id 104–115) = 원본 landxi7/contact.html 의 인라인 SEED 를 그대로 옮긴 것. 마스킹: 계정 메일은 앞 2자 + ***. 전부 `시연`. */

const W = typeof window !== 'undefined' ? window : {};

export const AS_OF = '2026-04-22';                       // 원판의 기준일 — 기간 빠른 선택 · 새 문의의 날짜가 이 날을 "오늘"로 쓴다

export const NCAT = { urgent: '긴급', general: '일반', work: '업무' };
export const NCAT_ORDER = ['all', 'urgent', 'general', 'work'];      // 원본 구분 select 순서
export const FCAT = { '01': '서비스 이용', '02': '데이터 업로드', '03': '분석 서비스', '04': '오류 및 점검', '05': '자료 다운로드', '06': '기타' };

/* 원본 정렬: 고정 글이 위, 그다음 등록일 내림차순 */
export const NOTICES = (W.SP_NOTICES || []).slice().sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : b.date.localeCompare(a.date)));
export const FAQS = (W.SP_FAQS || []).slice();
export const USECASES = (W.SP_USECASES || []).slice().sort((a, b) => b.date.localeCompare(a.date));
export const MANUALS = (W.SP_MANUALS || []).slice();

/* 활용사례 그림 — 원본 PNG 대신 남원 2025 정사영상 크롭(원판과 같은 재크롭 924×480). 같은 지역 · 주제이나 해당 사업의 실제 장면이라는 뜻은 아니다 → 라벨로 출처만. */
export const UC_IMG = {
  2: { src: '../assets/proto/support/uc-road.jpg', cap: '남원 정사영상 2025 · 도로 구간 크롭' },
  1: { src: '../assets/proto/support/uc-farm.jpg', cap: '남원 정사영상 2025 · 농지 필지 결과(파랑 = 필지 경계)' },
};
/* 매뉴얼 미리보기 — 개편 원판의 화면 축소. 5번(보고서 생성)은 개편 범위에 화면이 없다. */
export const MAN_IMG = [
  { src: '../assets/proto/support/man-dashboard.jpg', cap: '대시보드 화면 · 개편 원판 B5-Dashboard' },
  { src: '../assets/proto/support/man-ximap.jpg', cap: '지도 서비스(XI맵) 화면 · 개편 원판 B5-Map' },
  { src: '../assets/proto/support/man-datamgmt.jpg', cap: '데이터 관리 화면 · 개편 원판 B5-DataMgmt' },
  { src: '../assets/proto/support/man-analysis.jpg', cap: '분석 실행 검토 화면 · 개편 원판 B5-Analysis-Run-Review' },
  null,
];

export const INQ_MAX_FILES = 5, INQ_MAX_MB = 10;
export const INQ_SEED = [
  { id: 115, title: '사용자 매뉴얼 PDF 최신본을 어디서 받을 수 있나요?',
    content: '서비스 지원 > 사용자 매뉴얼 링크가 비어있어 다운로드가 되지 않습니다. 최신본(v2.3 기준) 받을 수 있는 경로 알려주세요.',
    status: 'pending', createdAt: '2026-04-22T15:08:33', attachments: [], answer: '', answeredAt: '' },
  { id: 114, title: '분석 결과 지도 위에 중첩되는 표시 투명도를 조절할 수 있나요?',
    content: '도로 포장 재질 레이어와 포트홀 탐지 결과를 동시에 보니 가독성이 떨어집니다. 레이어별 투명도 슬라이더가 있으면 좋겠습니다.',
    status: 'pending', createdAt: '2026-04-20T10:41:02', attachments: [], answer: '', answeredAt: '' },
  { id: 113, title: '지도 서비스에서 확대하면 일부 영역이 회색으로 표시됩니다',
    content: '인월면 동쪽 산간 지역을 18단계 이상 확대하면 정사영상이 회색 타일로 바뀌는데, 최신 영상이 해당 구역만 누락된 것인지 캐시 문제인지 확인 부탁드립니다.\n\n브라우저: Chrome 122, 사용자 계정: pa***@namwon.go.kr',
    status: 'replied', createdAt: '2026-04-17T13:20:44',
    attachments: [{ name: '회색표시_캡처.png', size: 1820000 }],
    answer: '안녕하세요, 도로관리과 기술지원입니다.\n\n확인 결과 해당 구역(인월면 동쪽 산간)은 2026-03 촬영분에서 구름 때문에 촬영 누락된 구역입니다. 2026-05 재촬영 일정에 포함돼 있어, 6월 초 배포 시 정상 표시 예정입니다.\n\n임시로 2024년 정사영상 레이어를 사용하시면 해당 구역도 확인 가능합니다.',
    answeredAt: '2026-04-18T09:55:10' },
  { id: 112, title: '농업기술센터용 대시보드 위젯 커스터마이징 요청',
    content: '농업기술센터 업무 특성상 곤포사일리지 탐지·비닐하우스 분포·경작지 면적 변화를 한 화면에서 보고 싶습니다. 부서별 대시보드 위젯을 사용자가 조합할 수 있게 해주실 수 있나요?',
    status: 'pending', createdAt: '2026-04-16T11:12:05', attachments: [], answer: '', answeredAt: '' },
  { id: 111, title: '분석 이력 검색 시 날짜 범위 최대치 제한이 있나요?',
    content: '2024-01-01 ~ 현재까지 전체 기간으로 설정하면 검색이 안 됩니다. 분할해서 검색해야 하는데 1년 단위로 나누는 것이 맞는지 가이드 부탁합니다.',
    status: 'replied', createdAt: '2026-04-14T16:45:00', attachments: [],
    answer: '현재 최대 조회 범위는 12개월 입니다. 성능 최적화를 위한 제약이며, 장기 통계는 보고서 생성 메뉴에서 연간 단위로 내보내기가 가능합니다.\n\n다음 분기 로드맵에서 범위 제한 완화를 검토 중입니다.',
    answeredAt: '2026-04-15T08:30:00' },
  { id: 110, title: '곤포사일리지 탐지 결과가 실제 현장과 차이 나는 경우가 있어요',
    content: '운봉면 4권역 최근 분석(26.04.11)에서 곤포 탐지 개수가 현장 확인보다 약 5~8개 적게 잡혔습니다.\n산그늘이 진 구역은 탐지율이 좀 낮은 듯한데, 이런 경우 보정 방법이나 재분석 요청 절차가 있나요?\n\n첨부로 해당 필지 지번과 현장 사진 올렸습니다. 확인 부탁드립니다.',
    status: 'replied', createdAt: '2026-04-14T14:22:10',
    attachments: [{ name: '운봉면4권역_현장사진.zip', size: 4832000 }, { name: '필지_지번_목록.xlsx', size: 28500 }],
    answer: '안녕하세요. 산그늘 조건의 탐지 정확도 개선이 4월 모델 v2.3 업데이트에 포함되어 있습니다. (4/15 배포)\n\n해당 필지에 대해 추론 이력 > "재분석" 을 실행해 주시면 v2.3 모델로 재처리됩니다. 재분석 후에도 차이가 크다면 첨부하신 현장 사진과 함께 추가 문의 주세요. 개별 필지 보정도 진행 가능합니다.',
    answeredAt: '2026-04-16T10:12:40' },
  { id: 109, title: '환경관리과 업무용으로 지도 레이어 권한 분리 요청',
    content: '환경관리과에서는 영농 관련 탐지 레이어(곤포·비닐하우스)는 필요하지 않습니다. 부서별로 기본 노출 레이어를 다르게 설정할 수 있을까요?',
    status: 'pending', createdAt: '2026-04-11T09:30:12', attachments: [], answer: '', answeredAt: '' },
  { id: 108, title: '회원가입 신청 후 승인까지 얼마나 걸리나요?',
    content: '4/8 오전에 계정 신청을 했는데 아직 활성화가 안 됐습니다. 승인 기준 시간이 있다면 공유 부탁드립니다.',
    status: 'replied', createdAt: '2026-04-09T10:15:22', attachments: [],
    answer: '영업일 기준 1~2일 내 승인이 원칙이며, 신청 내용이 누락된 경우 담당자가 추가 정보 요청을 드립니다. 확인해보니 소속 부서 확인이 필요해 대기 중이었습니다. 방금 처리되었으니 다시 로그인해 주세요.',
    answeredAt: '2026-04-09T14:02:11' },
  { id: 107, title: '보고서 PDF 에 지도 캡처 이미지가 잘려서 나옵니다',
    content: 'A4 세로 방향으로 PDF 를 내보내면 지도 우측 30% 가량이 잘립니다. 가로 방향은 정상이지만 세로로 맞추고 싶어서요.',
    status: 'pending', createdAt: '2026-04-07T16:22:08',
    attachments: [{ name: '보고서_세로방향_잘림.pdf', size: 740000 }], answer: '', answeredAt: '' },
  { id: 106, title: 'AI 추론 보고서 활용 방법 문의',
    content: '월간 보고서에서 정사영상 분석 결과만 골라서 출력할 수 있나요?\n카메라 영상 분석과 정사영상 분석 결과를 분리해서 따로 보고서를 만들고 싶은데, 현재는 두 모델이 합쳐진 형태로만 출력되는 것 같습니다.',
    status: 'replied', createdAt: '2026-04-03T10:00:59', attachments: [],
    answer: '안녕하세요, 도로관리과입니다.\n\n보고서 생성 메뉴에서 모델 종류 필터를 "정사영상" 또는 "카메라" 로 지정하시면 해당 모델의 분석 결과만 포함된 보고서가 생성됩니다.\n\n1) 상단 메뉴 > 보고서 > 보고서 생성\n2) 기본 설정 > 모델 종류 > "정사영상" 선택\n3) 기간·지역·보고서 유형 선택 후 "보고서 생성" 클릭\n4) PDF 다운로드 버튼으로 저장\n\n추가 문의 사항은 언제든지 남겨주세요.',
    answeredAt: '2026-04-04T09:12:00' },
  { id: 105, title: '비밀번호 5회 실패 후 잠금 해제는 어떻게 하나요?',
    content: '직원 중 한 분이 비밀번호를 여러 번 틀려 계정이 잠겼습니다. 관리자 처리가 필요한지 알려주세요.',
    status: 'replied', createdAt: '2026-03-28T14:10:40', attachments: [],
    answer: '사용자 관리 페이지에서 해당 계정 상세 > 비밀번호 실패 초기화 버튼으로 즉시 해제 가능합니다. 잠금 해제 후에는 사용자에게 비밀번호 재설정 링크를 발송해 주세요.',
    answeredAt: '2026-03-28T15:22:01' },
  { id: 104, title: '모바일에서 지도가 느리게 로딩됩니다',
    content: '태블릿(iPad Pro, Safari)에서 지도 서비스가 타일 당 3~4초씩 지연됩니다. 모바일 최적화 일정이 있나요?',
    status: 'pending', createdAt: '2026-03-25T11:08:00', attachments: [], answer: '', answeredAt: '' },
];
