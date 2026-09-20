/* 카드 발행 관리 — 시드 + 세션 저장 (B6 · 선택 3 분할 검토 데스크).
   원본: landxi7/admin-publish.html(REQUESTS 6) · assets/js/ai-project-data.js(AI_PROJECTS 8 · AI_PERMISSIONS 13 ·
   AI_TRAIN_RESULTS · AI_LABELING_DATA · AI_PROJECT_MEMBERS · AI_MODEL_CARDS) · ai-card.html(cards 8) · page-ai-publish6.js.
   값은 원본 그대로(= `시연`). 사람 이름은 성 + ○○ 로 가린다. 실측은 results.js 두 벌(남원 농지이용 · 비닐하우스)뿐이다.
   변경(발행 처리 · 개요 수정 · 발행 요청 · 카드 발행)은 메모리 + sessionStorage — 탭을 닫으면 시드로 돌아간다. */
import { RESULTS } from '../assets/data/results.js';

const mask = (name) => (name ? `${name[0]}○○` : '—');
const CROP = '../assets/proto/crops/';

/* ── 프로젝트 8 (원본 AI_PROJECTS + PROJECT_EXTRA). real = 실 결과 GeoJSON 이 있는 과제 ── */
export const PROJECTS = {
  1: { name: '도로안전 정사영상', type: '폴리곤 (Polygon)', dataType: 'ortho', trainRuns: 3, classes: ['포트홀', '크랙', '보수흔적', '공동의심', '쓰레기'],
    desc: '드론 정사영상 기반 도로 포장 손상(포트홀·크랙·보수흔적·공동의심) 및 쓰레기 자동 탐지',
    purpose: '드론 정사영상으로 도로 포장 손상을 신속·정밀하게 탐지하여 유지보수 우선순위 산정과 예산 집행의 객관적 근거를 제공합니다.',
    thumb: CROP + 'namwon-farmland-2025/3-clean.jpg', thumbNote: '요청 지역 정사영상 · 결과 폴리곤 없음' },
  2: { name: '도로안전 카메라', type: '폴리곤 (Polygon)', dataType: 'imageset', trainRuns: 2, classes: ['포트홀', '중앙분리대', '시선유도봉', '보행시설', '교통표지판', '차선불량', '컬러맨홀', '불법주정차'],
    desc: '순찰 차량 전방 카메라 영상에서 도로 시설물 이상 탐지',
    purpose: '순찰 차량 전방 카메라 영상을 분석해 도로 시설물 이상을 상시 점검하고 안전 관리 효율을 높입니다.',
    thumb: null },
  3: { name: '사료작물(생육기) 탐지', type: '폴리곤 (Polygon)', dataType: 'ortho', trainRuns: 3, classes: ['IRG(생육기)', '호밀(생육기)', '옥수수(생육기)', '수단그라스(생육기)'],
    desc: '고해상도 드론영상을 기반으로 생육 단계의 사료작물 4종(IRG, 호밀, 옥수수, 수단그라스)을 빠르게 탐지하고, 필지 단위로 재배면적 및 생산량을 자동 검출하는 AI 분석 서비스',
    purpose: '드론영상을 기반으로 사료작물을 자동 검출하여 조사료 수급 모니터링을 안정화하고, 보조금 대상지 검증 및 축산행정 효율화에 기여',
    thumb: CROP + 'namwon-farmland-2025/2-clean.jpg', thumbNote: '요청 지역 정사영상 · 결과 폴리곤 없음' },
  4: { name: '사료작물(생산기) 탐지', type: '폴리곤 (Polygon)', dataType: 'ortho', trainRuns: 2, classes: ['IRG(생산기)', '호밀(생산기)', '옥수수(생산기)', '수단그라스(생산기)'],
    desc: '고해상도 드론영상을 기반으로 생산 단계의 사료작물 4종(IRG, 호밀, 옥수수, 수단그라스)을 빠르게 탐지하고, 필지 단위로 재배면적 및 생산량을 자동 검출하는 AI 분석 서비스',
    purpose: '드론영상을 기반으로 사료작물을 자동 검출하여 조사료 수급 모니터링을 안정화하고, 보조금 대상지 검증 및 축산행정 효율화에 기여',
    thumb: CROP + 'namwon-farmland-2025/4-clean.jpg', thumbNote: '요청 지역 정사영상 · 결과 폴리곤 없음' },
  5: { name: '곤포사일리지 탐지', type: '바운딩 박스 (Bounding Box)', dataType: 'ortho', trainRuns: 2, classes: ['곤포사일리지'],
    desc: '고해상도 드론영상을 기반으로 곤포사일리지를 자동으로 검출하는 AI 분석 서비스',
    purpose: '드론영상을 기반으로 곤포사일리지를 자동 검출하여 조사료 재고 현황을 파악하고, 수급 계획 수립 및 축산행정 효율화에 기여',
    thumb: '../assets/proto/publish/silage.jpg', thumbNote: 'V-World 위성 크롭 · 결과 상자 없음' },
  6: { name: '비닐하우스 탐지', type: '폴리곤 (Polygon)', dataType: 'ortho', trainRuns: 2, classes: ['비닐하우스(단동)', '비닐하우스(다동)'],
    desc: '고해상도 드론 영상을 기반으로 비닐하우스(단동/다동)를 자동으로 검출하고, 수량을 산출해주는 AI 분석 서비스',
    purpose: '드론영상을 기반으로 비닐하우스(단동/다동)를 자동 검출하여 영농 시설 현황을 정확히 파악하고, 보조금 관리·실태조사 등 데이터 기반 스마트 영농 행정 구현에 기여',
    thumb: CROP + 'namwon-greenhouse-2025/3-clean.jpg', thumbNote: '요청 지역 실크롭 · 결과 폴리곤은 검토 지도에', real: 'namwon-greenhouse-2025' },
  7: { name: '농지 활용 분석', type: '폴리곤 (Polygon)', dataType: 'ortho', trainRuns: 3, classes: ['경작지', '비경작지'],
    desc: '고해상도 드론 영상을 기반으로 농지 이용 현황(경작, 비경작)을 자동으로 검출해주는 AI 분석 서비스',
    purpose: '드론영상을 기반으로 농지 이용 현황(경작·비경작)을 자동 검출하여 농지이용 실태조사 및 취득자격 심사 업무를 간소화하고 농지 행정 효율화에 기여',
    thumb: CROP + 'namwon-farmland-2025/6-clean.jpg', thumbNote: '요청 지역 실크롭 · 결과 폴리곤은 검토 지도에', real: 'namwon-farmland-2025' },
  8: { name: '방치 쓰레기 탐지', type: '바운딩 박스 (Bounding Box)', dataType: 'imageset', trainRuns: 1, classes: ['방치 쓰레기'],
    desc: '고해상도 드론영상을 기반으로 방치되어 쌓여 있는 쓰레기 더미를 검출해주는 AI 분석 서비스',
    purpose: '대규모 지역을 모니터링, 불법으로 버려진 쓰레기를 신속하게 탐지함으로써 환경 보호와 위생 개선, 공공 안전 향상에 기여',
    thumb: null },
};
export const pidByName = (name) => Object.keys(PROJECTS).find((k) => PROJECTS[k].name === name) || null;
export const dataTypeLabel = (dt) => (dt === 'ortho' ? '정사영상' : dt === 'imageset' ? '이미지셋' : '-');

/* ── 실 결과 2벌 — 지도에 올리는 유일한 도형. view = 증거 판이 서는 자리(라벨 풀 권역의 실 필지 밀집지) ── */
const R = (id) => RESULTS.find((r) => r.id === id);
export const REAL = {
  'namwon-farmland-2025': { res: R('namwon-farmland-2025'), url: '../assets/data/geo/results/namwon-farmland-2025.geojson', unit: '필지',
    view: { center: [127.301575, 35.353139], km: 0.25 }, place: '금지면',
    classes: [{ key: '경작지', label: '경작지', dash: false }, { key: '비경작지', label: '비경작지', dash: true }] },
  'namwon-greenhouse-2025': { res: R('namwon-greenhouse-2025'), url: '../assets/data/geo/results/namwon-greenhouse-2025.geojson', unit: '필지',
    view: { center: [127.321168, 35.37436], km: 0.25 }, place: '주생면',
    classes: [{ key: '비닐하우스_단동', label: '비닐하우스(단동)', dash: false }, { key: '비닐하우스_다동', label: '비닐하우스(다동)', dash: true }] },
};

/* ── 권한 13 (원본 AI_PERMISSIONS) ── */
export const PERMS = [
  ['LX 한국국토정보공사', 'LX 관리자'], ['LX 한국국토정보공사', 'LX 일반 사용자'], ['LX 한국국토정보공사', 'LX 하천 관리'],
  ['남원시청', '남원시청 관리자'], ['남원시청', '사료작물 분석'], ['남원시청', '농지 활용 분석'], ['남원시청', '영농 정보 분석'], ['남원시청', '일반사용자'],
  ['전라남도', '전라남도 관리자'], ['전라남도', '해운항만과'], ['전라남도', '신안군'], ['전라남도', '완도군'], ['전라남도', '전라남도 사용자'],
].map(([org, role]) => ({ org, role }));

/* ── 발행 요청 6 (원본 REQUESTS). id 는 대시보드 `검토 ›` 딥링크(pa-1 · pa-6)와 같다 ── */
const MOCK_ANALYSES = {
  '도로안전 정사영상': ['도로안전 정사영상 분석 #1', '도로안전 정사영상 분석 #3'], '사료작물(생육기) 탐지': ['사료작물(생육기) 분석 #2'],
  '도로안전 카메라': ['도로안전 카메라 분석 #1'], '비닐하우스 탐지': ['비닐하우스 탐지 분석 #2'], '곤포사일리지 탐지': ['곤포사일리지 분석 #1'],
  '농지 활용 분석': ['농지 활용 분석 #1', '농지 활용 분석 #4'],
};
const SEED_REQUESTS = [
  { id: 'pa-1', card: '도로안전 정사영상 v2.1', type: '신규 과제', project: '도로안전 정사영상', training: '도로안전 정사영상 v2.1', model: 'v2.1', perms: ['LX 관리자', '남원시청 관리자'], requester: '김현우', date: '2026.06.10 14:30', status: '대기' },
  { id: 'pa-2', card: '사료작물(생육기) v3.0', type: '신규 과제', project: '사료작물(생육기) 탐지', training: '사료작물(생육기) v3.0', model: 'v3.0', perms: ['남원시청 관리자', '사료작물 분석'], requester: '이서연', date: '2026.06.08 10:15', status: '검토중' },
  { id: 'pa-3', card: '도로안전 카메라 v1.3', type: '신규 과제', project: '도로안전 카메라', training: '도로안전 카메라 v1.3', model: 'v1.3', perms: ['남원시청 관리자'], requester: '김현우', date: '2026.05.28 09:00', status: '승인' },
  { id: 'pa-4', card: '비닐하우스 탐지 v1.0', type: '신규 과제', project: '비닐하우스 탐지', training: '비닐하우스 v1.0', model: 'v1.0', perms: ['남원시청 관리자'], requester: '박지훈', date: '2026.05.25 16:40', status: '반려', reject: '학습 정확도가 기준 미달입니다. F1 0.75 이상 필요' },
  { id: 'pa-5', card: '곤포사일리지 v1.2', type: '신규 과제', project: '곤포사일리지 탐지', training: '곤포사일리지 v1.2', model: 'v1.2', perms: ['사료작물 분석'], requester: '박지훈', date: '2026.05.20 11:20', status: '승인' },
  { id: 'pa-6', card: '농지 활용 분석 v2.0', type: '과제 고도화', project: '농지 활용 분석', training: '농지 분류 v2.0', model: 'v2.0', perms: ['남원시청 관리자', '농지 활용 분석'], requester: '김현우', date: '2026.05.15 08:50', status: '대기' },
];
export const STATUSES = ['대기', '검토중', '승인', '반려'];
export const ST_CLASS = { '대기': 'st--warn', '검토중': 'st--acc', '승인': '', '반려': 'st--dim' };

/* ── 학습 결과 (원본 AI_TRAIN_RESULTS) · 시각/소요는 원본 MOCK_TIMES/MOCK_DURS 의 같은 자리 ── */
export const TRAIN = {
  1: [{ id: 'r1-3', labeling: '도로안전 정사영상 v2.1', date: '2026.05.18', labels: 3842, iou: 0.82, f1: 0.87 }, { id: 'r1-2', labeling: '도로안전 정사영상 v2.0', date: '2026.05.10', labels: 2800, iou: 0.78, f1: 0.83 }, { id: 'r1-1', labeling: '도로안전 정사영상 v1.0', date: '2026.04.15', labels: 1560, iou: 0.71, f1: 0.76 }],
  2: [{ id: 'r2-1', labeling: '도로안전 카메라 v1.3', date: '2026.05.15', labels: 5620, iou: 0.79, f1: 0.84 }],
  3: [{ id: 'r3-1', labeling: '사료작물(생육기) v3.0', date: '2026.05.10', labels: 2890, iou: 0.81, f1: 0.86 }, { id: 'r3-2', labeling: '사료작물(생육기) v2.1', date: '2026.04.01', labels: 1850, iou: 0.75, f1: 0.80 }],
  4: [{ id: 'r4-1', labeling: '사료작물(생산기) v2.0', date: '2026.04.28', labels: 2100, iou: 0.80, f1: 0.85 }],
  5: [{ id: 'r5-1', labeling: '곤포사일리지 v1.2', date: '2026.04.20', labels: 1560, iou: 0.77, f1: 0.82 }],
  6: [{ id: 'r6-1', labeling: '비닐하우스 v2.0', date: '2026.04.15', labels: 3450, iou: 0.84, f1: 0.89 }, { id: 'r6-2', labeling: '비닐하우스 v1.0', date: '2026.03.20', labels: 1800, iou: 0.76, f1: 0.81 }],
  7: [{ id: 'r7-1', labeling: '농지 분류 v2.0', date: '2026.03.30', labels: 4200, iou: 0.83, f1: 0.88 }, { id: 'r7-2', labeling: '농지 분류 v1.0', date: '2026.03.25', labels: 2600, iou: 0.77, f1: 0.82 }],
  8: [{ id: 'r8-1', labeling: '방치 쓰레기 v1.0', date: '2026.03.25', labels: 720, iou: 0.72, f1: 0.78 }],
};
const MOCK_TIMES = ['09:14', '10:05', '07:40', '14:30', '11:10', '13:20', '08:50'];
const MOCK_DURS = ['1시간 22분', '1시간 17분', '1시간 35분', '35분', '1시간 15분', '48분', '58분'];
export function trainingOf(req) {
  const list = TRAIN[req.pid] || [];
  const i = Math.max(0, list.findIndex((t) => t.labeling === req.training));
  const t = list[i]; if (!t) return null;
  const n = (PROJECTS[req.pid]?.classes || []).length;
  return { ...t, time: MOCK_TIMES[i % MOCK_TIMES.length], dur: MOCK_DURS[i % MOCK_DURS.length], classes: n,
    recall: Math.max(0, t.f1 - 0.02), precision: Math.min(0.99, t.f1 + 0.01),
    perf: (PROJECTS[req.pid]?.classes || []).map((name, ci) => {                 // 원본 식: seed = IoU + 0.03·i
      const seed = t.iou + ci * 0.03, p = +Math.min(0.99, seed + 0.05).toFixed(2), r = +Math.min(0.99, seed - 0.03).toFixed(2);
      return { name, p, r, f: +((2 * p * r) / (p + r)).toFixed(2) };
    }) };
}

/* ── 라벨링 데이터 (원본 AI_LABELING_DATA). lng/lat = 라벨 풀 대표 좌표(원본 시드) ── */
export const LABELING = {
  1: [{ name: '남원 도로구간 A 정사영상', file: 'NW_ortho_202604_section_A.tif', gsd: '5cm/px', labels: 342, last: '2026.05.18 14:30', lng: 127.3852, lat: 35.4142 }, { name: '남원 도로구간 B 정사영상', file: 'NW_ortho_202604_section_B.tif', gsd: '5cm/px', labels: 210, last: '2026.05.17 11:05', lng: 127.4032, lat: 35.4216 }, { name: '남원 도로 보수구간 정사영상', file: 'NW_ortho_202603_road_01.ecw', gsd: '8cm/px', labels: 0, last: '-', lng: 127.3948, lat: 35.4052 }],
  2: [{ name: '남원시 도로카메라 4월 원본', photos: 16, labels: 121, last: '2026.05.19 10:45' }, { name: '남원시 도로카메라 5월 원본', photos: 12, labels: 86, last: '2026.05.20 09:30' }],
  3: [{ name: '운봉읍 정사영상', file: 'NW_ortho_202604_unbong.tif', gsd: '7cm/px', labels: 280, last: '2026.05.10 09:15', lng: 127.5215, lat: 35.4305 }, { name: '인월면 정사영상', file: 'NW_ortho_202604_inwol.tif', gsd: '7cm/px', labels: 156, last: '2026.05.09 16:20', lng: 127.5548, lat: 35.4602 }],
  4: [{ name: '대산면 1구역 정사영상', file: 'NW_ortho_202602_field_01.tif', gsd: '7cm/px', labels: 198, last: '2026.04.28 16:40', lng: 127.3152, lat: 35.4048 }, { name: '대산면 2구역 정사영상', file: 'NW_ortho_202602_field_02.tif', gsd: '7cm/px', labels: 0, last: '-', lng: 127.3046, lat: 35.4152 }],
  5: [{ name: '보절면 정사영상', file: 'NW_ortho_202603_bale_01.tif', gsd: '10cm/px', labels: 120, last: '2026.04.20 11:20', lng: 127.4552, lat: 35.4748 }],
  6: [{ name: '주생면 1구역 정사영상', file: 'NW_ortho_202603_green_01.tif', gsd: '8cm/px', labels: 240, last: '2026.04.15 08:50', lng: 127.3452, lat: 35.3918 }, { name: '주생면 2구역 정사영상', file: 'NW_ortho_202603_green_02.tif', gsd: '8cm/px', labels: 88, last: '2026.04.14 13:10', lng: 127.3348, lat: 35.3852 }],
  7: [{ name: '금지면 정사영상', file: 'NW_ortho_202603_farm_01.tif', gsd: '12cm/px', labels: 310, last: '2026.03.30 15:05', lng: 127.3302, lat: 35.3308 }],
  8: [{ name: '방치 쓰레기 드론 촬영 꾸러미', photos: 3, labels: 14, last: '2026.04.05 11:10' }],
};

/* ── 구성원 (원본 AI_PROJECT_MEMBERS) — 이름은 성 + ○○ ── */
const OWNER = ['김현우', '관리자', 1240, '2026.05.19 16:20'];
const MEMBER_SEED = {
  1: [OWNER, ['이서연', '라벨러', 860, '2026.05.19 14:05'], ['박지호', '라벨러', 412, '2026.05.18 11:30']], 2: [OWNER, ['정민재', '라벨러', 540, '2026.05.17 10:00']],
  3: [OWNER, ['이서연', '라벨러', 720, '2026.05.10 09:10'], ['박지호', '라벨러', 510, '2026.05.09 16:20'], ['최수현', '뷰어', 0, '-']], 4: [OWNER],
  5: [OWNER, ['정민재', '라벨러', 380, '2026.04.20 11:00']], 6: [OWNER, ['이서연', '라벨러', 640, '2026.04.15 08:40'], ['최수현', '뷰어', 0, '-']],
  7: [OWNER, ['박지호', '라벨러', 900, '2026.03.30 14:50']], 8: [OWNER],
};
export const membersOf = (pid) => (MEMBER_SEED[pid] || []).map(([name, role, labels, last]) => ({ name: mask(name), role, labels, last }));

/* ── 분석 결과 — 원본 MOCK_ANALYSES + 원본 식. 실 결과가 있는 과제는 첫 건을 실측으로 잇는다 ── */
export function analysesOf(req) {
  const pj = PROJECTS[req.pid], real = pj?.real ? REAL[pj.real] : null;
  return (req.analyses || []).map((name, i) => {
    const date = `2026.${String(5 + (i % 2)).padStart(2, '0')}.${String(10 + i * 3).padStart(2, '0')}`;
    const base = { name, idx: i, baseDt: date, started: `${date} 09:14`, finished: `${date} 10:36`, dur: `${((60 + i * 17) % 120) + 30}분`, input: pj?.dataType === 'imageset' ? '이미지셋' : '정사 영상' };
    if (real && i === 0) return { ...base, real: pj.real, dets: real.res.stats.count, unit: real.unit, date: real.res.stats.analyzedAt.replace(/-/g, '.'), tag: '실측' };
    return { ...base, real: null, dets: 40 + ((i * 37 + (+req.pid || 1) * 23) % 180), unit: '건', date, tag: '시연' };
  });
}

/* ── 발행 모델 카드 (원본 AI_MODEL_CARDS) ── */
const CARD_VERSIONS = {
  1: [['v3(포트홀 강화)', '2026.05.19 10:00', '3.0'], ['v2(균열 추가학습)', '2026.04.22 09:30', '2.0'], ['v1(기본)', '2026.02.10 14:00', '1.0']],
  2: [['v1(기본)', '2026.03.05 11:00', '1.0']],
  3: [['v4(IRG 정밀)', '2026.05.11 09:00', '4.0'], ['v3(호밀 추가)', '2026.04.18 10:00', '3.0'], ['v2(옥수수 보강)', '2026.03.27 13:00', '2.0'], ['v1(기본)', '2026.02.02 09:00', '1.0']],
  4: [['v3(IRG 정밀)', '2026.05.05 09:00', '3.0'], ['v2(혼파 보정)', '2026.04.12 10:00', '2.0'], ['v1(기본)', '2026.02.20 09:00', '1.0']],
  5: [['v2(소형 객체 보정)', '2026.05.07 11:00', '2.0'], ['v1(기본)', '2026.03.14 09:00', '1.0']],
  6: [['v5(단동/연동 분리)', '2026.05.20 09:00', '5.0'], ['v4(반사광 보정)', '2026.04.30 10:00', '4.0'], ['v3(군집 분리)', '2026.04.09 10:00', '3.0'], ['v2(경계 정밀)', '2026.03.21 10:00', '2.0'], ['v1(기본)', '2026.02.15 09:00', '1.0']],
  7: [['v1(기본)', '2026.05.01 09:00', '1.0']],
  8: [['v2(소형 더미 보정)', '2026.04.26 10:00', '2.0'], ['v1(기본)', '2026.03.08 09:00', '1.0']],
};
export const MODEL_TYPES = [['020401', '해양쓰레기 분석결과 (드론)'], ['020402', '해양쓰레기 분석결과 (항공)'], ['020403', '해양쓰레기 분석결과 (위성)'], ['020411', '사료작물(생육기) 탐지결과'], ['020412', '사료작물(생산기) 탐지결과'], ['020413', '곤포사일리지 탐지결과'], ['020414', '비닐하우스 탐지결과'], ['020415', '농지 활용 분석결과'], ['020416', '방치 쓰레기 탐지결과'], ['020417', '도로안전 정사영상'], ['020418', '도로안전 카메라'], ['020421', '하천·계곡 불법 점용시설 탐지 (항공)'], ['020422', '하천·계곡 불법 점용시설 탐지 (드론)']];
export const ALGOS = [['YOLOV11', 'YOLO v11'], ['YOLOV11seg', 'YOLO v11-seg'], ['UNETV1', 'UNET v1']];
export const DET_TYPES = [['SGMTT', 'Segmentation'], ['PLG', '폴리곤(Polygon)'], ['BDB', '바운딩 박스(Bounding Box)'], ['BDBPLG', '바운딩 박스(Bounding Box), 폴리곤(Polygon)']];
export const PROJ_TO_TYPE = { 1: '020417', 2: '020418', 3: '020411', 4: '020412', 5: '020413', 6: '020414', 7: '020415', 8: '020416' };
const ALGO = { 1: 'YOLOV11seg', 2: 'YOLOV11', 3: 'YOLOV11seg', 4: 'YOLOV11seg', 5: 'YOLOV11', 6: 'YOLOV11seg', 7: 'UNETV1', 8: 'YOLOV11' };
const SLUG = { 1: 'road-ortho', 2: 'road-camera', 3: 'silage-grow', 4: 'silage-prod', 5: 'bale', 6: 'greenhouse', 7: 'farmland', 8: 'trash' };
const LATEST_MOD = { 1: '2026.05.21 09:10', 2: '2026.03.06 10:00', 3: '2026.05.13 14:20', 4: '2026.05.06 11:00', 5: '2026.05.08 09:30', 6: '2026.05.21 16:40', 7: '2026.05.02 10:15', 8: '2026.04.27 09:00' };
export function modelCards(pid) {
  const p = PROJECTS[pid]; if (!p) return [];
  const over = load().cards?.[pid] || {};
  return (CARD_VERSIONS[pid] || []).map(([v, d, tag], i) => {
    const m = /^([^(]*)\(([^)]*)\)\s*$/.exec(v);
    const base = { name: v, ver: m ? m[1].trim() : v, published: d, modified: i === 0 ? LATEST_MOD[pid] : d, useYn: i === 0, typeCd: PROJ_TO_TYPE[pid], algoId: ALGO[pid],
      detCd: p.type.includes('바운딩') ? 'BDB' : 'PLG', tile: p.dataType === 'imageset' ? 640 : 1024, image: `landxi/${SLUG[pid]}`, tag, desc: m ? m[2].trim() : '', screen: `/jn/aidetect/${SLUG[pid].replace(/-/g, '_')}.html` };
    return { ...base, ...(over[i] || {}) };
  });
}

/* ── 발행된 카드 8 (원본 ai-card.html cards) — 카드 하나 = 프로젝트 하나(cid = pid) ── */
export const CARDS = [
  ['도로안전 정사영상', '2026.05.19 10:00', true], ['도로안전 카메라', '2026.05.16 14:30', true], ['사료작물(생육기) 탐지', '2026.05.11 09:00', true], ['사료작물(생산기) 탐지', '2026.04.30 09:00', true],
  ['곤포사일리지 탐지', '2026.04.21 11:00', true], ['비닐하우스 탐지', '2026.04.16 10:00', true], ['농지 활용 분석', '2026.04.01 14:00', true], ['방치 쓰레기 탐지', '2026.04.05 16:00', false],
].map(([name, published, isPublic], i) => ({ cid: i + 1, name, published, isPublic, thumb: PROJECTS[i + 1].thumbClean || PROJECTS[i + 1].thumb, imageset: PROJECTS[i + 1].dataType === 'imageset' }));

/* ── 전역 발행 요청의 분석 결과 후보 (원본 page-ai-publish6.js analysisResults) ── */
const AN_REGIONS = ['이백면 일대', '운봉읍 일대', '인월면 일대', '산내면 일대', '주천면 일대', '아영면 일대'];
const AN_DATES = ['2026.05.18', '2026.05.12', '2026.05.04', '2026.04.27', '2026.04.20', '2026.04.12'];
export function analysisCandidates(pid) {
  const pj = PROJECTS[pid]; if (!pj) return [];
  const num = +pid || 1, count = 4 + (num % 3);
  return Array.from({ length: count }, (_, i) => ({ id: `AN-${pid}-${i + 1}`, name: `${pj.name} 분석 #${i + 1}`, region: AN_REGIONS[(num + i) % AN_REGIONS.length], date: AN_DATES[(num + i) % AN_DATES.length], dets: 40 + ((i * 37 + num * 23) % 180) }));
}

/* ── 세션 저장 ── */
const KEY = 'lx_publish_v1';
let mem = null;
function load() {
  if (mem) return mem;
  try { mem = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { mem = null; }
  if (!mem || typeof mem !== 'object') mem = {};
  mem.req ||= {}; mem.added ||= []; mem.cards ||= {}; mem.labels ||= {};
  return mem;
}
function save() { try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* 저장소 차단 · 용량 초과 — 메모리만 */ } }

function hydrate(seed) {
  const pid = pidByName(seed.project), pj = PROJECTS[pid] || {};
  const r = { pid, det: pj.type || '-', data: dataTypeLabel(pj.dataType), intro: pj.desc || '', purpose: pj.purpose || '', classes: pj.classes || [],
    cardThumb: pj.thumb || '', dashThumb: pj.thumbClean || pj.thumb || '', analyses: MOCK_ANALYSES[seed.project] || [], ...seed, requester: seed.masked ? seed.requester : mask(seed.requester) };
  return Object.assign(r, load().req[seed.id] || {});
}
export function requests() { const s = load(); return [...s.added.map((a) => hydrate({ ...a, masked: true })), ...SEED_REQUESTS.map(hydrate)]; }
export const findRequest = (id) => requests().find((r) => r.id === id) || null;
export function patchRequest(id, patch) { const s = load(); s.req[id] = { ...(s.req[id] || {}), ...patch }; save(); }
export function addRequest(item) { const s = load(); const id = `pa-${SEED_REQUESTS.length + s.added.length + 1}`; s.added.unshift({ ...item, id }); save(); return id; }
export function counts(list = requests()) { const c = { '전체': list.length }; STATUSES.forEach((k) => { c[k] = list.filter((r) => r.status === k).length; }); return c; }
export function patchModelCard(pid, idx, patch) { const s = load(); s.cards[pid] ||= {}; s.cards[pid][idx] = { ...(s.cards[pid][idx] || {}), ...patch }; save(); }
/* 라벨 클래스 일괄 변경 — { [pid:idx]: { [featureId]: className } } */
export const labelOverrides = (key) => load().labels[key] || {};
export function patchLabels(key, map) { const s = load(); s.labels[key] = { ...(s.labels[key] || {}), ...map }; save(); }
