// 데이터 관리 — 데이터 조립층.
// 규칙 두 가지.
//  1) 기능은 원본과 1:1 이다. 원본
//     https://mini531.github.io/namwon-smart-village/landxi7/dataset.html
//     (+ 프래그먼트 dataset-upload / dataset-manage / dataset-manage-publishing / dataset-archive)
//     의 4탭·필터·폼·액션·모달이 전부이고, 표에 없는 기능은 만들지 않는다.
//     대조표: docs/superpowers/proto/2026-08-26-dataset-parity.md
//     인벤토리: docs/superpowers/specs/2026-08-26-landxi7-function-inventory.md §3
//  2) 목록의 시드(파일명·크기·등록자·일시)는 **원본 목업 그대로**다. 이 페이지는 자산
//     목록이라 원본 시드가 곧 파리티 대상이다(design-canvas/v2/NOTES.md §7).
//     원본 `dataset-archive-data.js` 는 이 저장소에 없으므로 디자인 마스터
//     design-canvas/v2/B2-DataMgmt-{Upload,List}.dc.html 에 옮겨 적힌 값을 그대로 쓴다.
//     지어낸 운영 서사는 더하지 않는다(콘티 원칙 §7) — 화면은 이 목록을 `시연` 으로 밝힌다.
//  3) 판 위 범위·GSD 는 지어내지 않는다. landxi/assets/data/imagery.js 의 실측값이다.
import { IMAGERY } from '../assets/data/imagery.js';
import { CROPS } from '../assets/data/crops.js';

export const nf = new Intl.NumberFormat('ko-KR');

/** 이 화면의 목록 데이터는 전부 원본 목업 시드다 — 화면이 그렇게 말한다. */
export const SEED_TAG = '시연';

/* ── 탭 4종 — 원본 `?tab=` 값과 라벨이 같다 ─────────────────────────── */
export const TABS = [
  { id: 'upload', name: '데이터 업로드', frag: 'dataset-upload.html' },
  { id: 'manage', name: '업로드 완료', frag: 'dataset-manage.html' },
  { id: 'publishing', name: '레이어 발행중', frag: 'dataset-manage-publishing.html' },
  { id: 'archive', name: '아카이브', frag: 'dataset-archive.html' },
];
export const TAB_IDS = TABS.map((t) => t.id);
export const DEFAULT_TAB = 'upload';

/* ── 필터 ────────────────────────────────────────────────────────────
   업로드/업로드 완료/레이어 발행중 = 파일형식 7 · 아카이브 = 유형 4. 원본 그대로. */
export const FMT_FILTERS = ['전체', 'ECW', 'TIF', 'ZIP', 'SHP', 'XLSX/XLS', '기타'];
export const KIND_FILTERS = ['전체', '정사영상', '이미지셋', '공간정보'];
/** 필터 칩 ↔ 확장자 — `기타` 는 앞의 다섯에 들지 않는 전부다. */
const FMT_MAP = { ECW: ['ecw'], TIF: ['tif', 'tiff'], ZIP: ['zip'], SHP: ['shp'], 'XLSX/XLS': ['xlsx', 'xls'] };
export const extOf = (name) => String(name).split('.').pop().toLowerCase();
export function matchFmt(name, chip) {
  if (chip === '전체') return true;
  const e = extOf(name);
  if (chip === '기타') return !Object.values(FMT_MAP).some((xs) => xs.includes(e));
  return (FMT_MAP[chip] || []).includes(e);
}

/* ── 업로드 폼 — 원본 드롭존 문구·허용 형식 5 ────────────────────────── */
export const DROP = {
  title: '파일을 드래그하여 놓거나 클릭',
  sub: '여러 파일을 한 번에 · 최대 1 TB',
  accepts: [
    { label: 'ECW (.ecw)', ext: '.ecw' },
    { label: 'GeoTIFF (.tif)', ext: '.tif' },
    { label: 'ZIP (.zip)', ext: '.zip' },
    { label: 'SHP (.shp)', ext: '.shp' },
    { label: '엑셀 (.xlsx)', ext: '.xlsx' },
  ],
  maxBytes: 1024 ** 4,          // 1 TB
};
export const ACCEPT_EXT = DROP.accepts.map((a) => a.ext);

/* ── 업로드 진행 목록 6건 — 상태 4종. 마스터가 4건을 노출하고 2건을 접는다. ── */
export const UP_ST = { run: '업로드중', pause: '일시정지', stop: '중단됨', wait: '대기중' };
/** 상태별 액션 — 원본 카드의 버튼 구성 그대로(일시정지/재개/이어 올리기/업로드 취소/세부 정보). */
export const UP_ACTIONS = {
  run: ['pause', 'cancel', 'detail'],
  pause: ['resume', 'cancel', 'detail'],
  stop: ['retry', 'cancel', 'detail'],
  wait: ['cancel', 'detail'],
};
export const ACT_NAME = {
  pause: '일시정지', resume: '재개', retry: '이어 올리기', cancel: '업로드 취소', detail: '세부 정보',
};

export const UPLOADS = [
  { id: 'u1', st: 'run', fmt: 'TIF', file: 'NW_ortho_정사영상_202604_section_C_v3.tif', pct: 62, size: '55.4 GB' },
  { id: 'u2', st: 'pause', fmt: 'TIF', file: 'NW_ortho_202604_section_D.tif', pct: 41, size: '51.0 GB' },
  { id: 'u3', st: 'stop', fmt: 'ECW', file: '남원시_산내면_4월_드론촬영_정사영상_권역A.ecw', pct: 34, size: '60.2 GB' },
  { id: 'u4', st: 'wait', fmt: 'ZIP', file: 'camera_org_202604.zip', pct: 0, size: '18.7 GB' },
  { id: 'u5', st: 'wait', fmt: 'SHP', file: 'NW_road_defect_labels_202604.shp', pct: 0, size: '48.2 MB' },
  { id: 'u6', st: 'wait', fmt: 'XLSX', file: '농지이용_행정정보_202604.xlsx', pct: 0, size: '287.3 KB' },
];
/** 마스터가 접어 둔 지점 — `대기중 n건 더 · 전체 보기`. 원본 목록 자체는 6건 그대로다. */
export const UP_FOLD = 4;

/* ── 내 디스크 사용량 + 증량 신청 모달 ──────────────────────────────── */
export const DISK = { used: 1965.0, total: 2048.0 };
DISK.pct = Math.round((DISK.used / DISK.total) * 100);      // 96
DISK.free = +(DISK.total - DISK.used).toFixed(1);           // 83.0
export const QUOTA_PRESETS = [32, 64, 128, 256, 512, 1024];

/* ── 아카이브 — 유형·데이터명·원본 파일명·크기·기준일·등록자·등록일시 ─── */
const crop = (k, i = 0) => (CROPS[k] && CROPS[k][i] ? '../' + CROPS[k][i].file : null);

export const ARCHIVE = [
  {
    id: 'a1', kind: '정사영상', name: '남원 정사영상 2026-04 A구역',
    file: 'NW_ortho_202604_section_A.tif', size: '58.3 GB', basis: '2026.04.10',
    by: '김현우', at: '2026.04.11 09:00', hidden: false,
    thumb: crop('namwon-farmland-2025', 0),
    imagery: 'namwon_2504',
    detail: {
      데이터명: '남원 정사영상 2026-04 A구역',
      출처: 'LX · 드론 · EPSG:5186 → 4326',
      설명: '권역 A 정사영상 · 기준일 2026.04.10',
    },
    bands: [
      ['Band 1 / 2 / 3', 'Red · Green · Blue · 8bit'],
      ['GSD', '0.0108 m'],
      ['크기', '58.3 GB · 2026.04.10'],
    ],
  },
  {
    id: 'a2', kind: '정사영상', name: '운봉읍 드론 정사영상 2026-04',
    file: '남원_운봉_드론_4월.ecw', size: '62.7 GB', basis: '2026.04.08',
    by: '이서연', at: '2026.04.09 10:00', hidden: true,
    thumb: crop('namwon-epoch', 2),
    imagery: 'namwon_2506',
    detail: {
      데이터명: '운봉읍 드론 정사영상 2026-04',
      출처: 'LX · 드론 · EPSG:5186 → 4326',
      설명: '운봉읍 드론 정사영상 · 기준일 2026.04.08',
    },
    bands: [
      ['Band 1 / 2 / 3', 'Red · Green · Blue · 8bit'],
      ['GSD', '0.0169 m'],
      ['크기', '62.7 GB · 2026.04.08'],
    ],
  },
  {
    id: 'a3', kind: '공간정보', name: '남원 도로파손 라벨 쉐입 2026-04',
    file: 'NW_road_defect_labels_202604.shp', size: '48.2 MB', basis: '2026.06.20',
    by: '김현우', at: '2026.06.20 12:30', hidden: false,
    thumb: null,
    imagery: null,
    detail: {
      데이터명: '남원 도로파손 라벨 쉐입 2026-04',
      출처: 'LX · 라벨링 · EPSG:5186',
      설명: '도로파손 라벨 폴리곤 · 기준일 2026.06.20',
    },
    bands: [
      ['geom', 'Polygon · EPSG:5186'],
      ['cls', '포트홀 · 크랙 · 보수흔적'],
      ['크기', '48.2 MB · 2026.06.20'],
    ],
  },
  {
    id: 'a4', kind: '이미지셋', name: '순찰차량 도로영상 2026-04',
    file: 'camera_org_202604.zip', size: '4,820장', basis: '2026.04.12',
    by: '김현우', at: '2026.04.13 08:30', hidden: false,
    thumb: null,
    imagery: null,
    detail: {
      데이터명: '순찰차량 도로영상 2026-04',
      출처: 'LX · 차량 카메라',
      설명: '순찰 차량 전방 카메라 원본 이미지셋 · 기준일 2026.04.12',
    },
    bands: [
      ['프레임', '4,820 장 · JPEG'],
      ['좌표', 'GPS 로그 동봉 · EPSG:4326'],
      ['크기', '18.7 GB · 2026.04.12'],
    ],
  },
  {
    // 마스터 B5 r4c5 — 실제 GeoJSON 이 있는 벡터 자산. 판에는 탐지 결과 격자(86셀)가 그대로 선다.
    id: 'a5', kind: '공간정보', name: '여수 해양쓰레기 조사 2026',
    file: 'yeosu-marine-2026-drone-grid100.geojson', size: '24.4 KB', basis: '2026.03.15',
    by: '이서연', at: '2026.03.20 11:00', hidden: false,
    thumb: '../assets/proto/crops/yeosu-marine-2026-drone/1-clean.jpg',
    imagery: null,
    geo: { file: '../assets/data/geo/results/yeosu-marine-2026-drone-grid100.geojson', bounds: [127.6423, 34.5681, 127.7127, 34.6369], count: 86, unit: '100 m 격자' },
    detail: {
      데이터명: '여수 해양쓰레기 조사 2026',
      출처: 'LX · 드론 · results/yeosu-marine-2026-drone · EPSG:4326',
      설명: '해양쓰레기 탐지 결과 100 m 격자 86셀 · 기준일 2026.03.15',
    },
    bands: [
      ['geom', 'Polygon · EPSG:4326 · 86 셀'],
      ['top', 'styrofoam · mean_conf'],
      ['크기', '24.4 KB · 2026.03.15'],
    ],
  },
];

/* ── 타일 그림 — 마스터 B5 의 tile-*.jpg 는 이 실자산 크롭에서 떴다(tools/design/tiles-b5.mjs).
   프로토는 캔버스 사본이 아니라 crops/** 원본을 그대로 쓴다. 그림이 없는 자산은 흰 액자다. ── */
const C = (d, n, clean = true) => `../assets/proto/crops/${d}/${n}${clean ? '-clean' : ''}.jpg`;
export const THUMB = {
  u1: C('namwon-farmland-2025', 3), u2: C('namwon-farmland-2025', 5), u3: C('namwon-farmland-2025', 7),
  d1: C('namwon-farmland-2025', 4), d2: C('namwon-greenhouse-2025', 1), d4: C('namwon-greenhouse-2025', 4), d5: C('namwon-greenhouse-2025', 3),
  p3: C('namwon-greenhouse-2025', 6), p4: C('namwon-greenhouse-2025', 5), p7: C('namwon-greenhouse-2025', 7),
};
/** 벡터 실루엣 — 실좌표 GeoJSON 을 타일 캔버스에 그린다(마스터 유보 3: 판이 아니라 실좌표 렌더). */
export const SILHOUETTE = {
  // 비닐하우스 라벨 SHP = 남원 비닐하우스 결과 폴리곤의 밀집 셀 하나(EPSG 없음 → 실패 사유와 짝).
  d7: { file: '../assets/data/geo/results/namwon-greenhouse-2025.geojson', bbox: [127.296, 35.316, 127.308, 35.328], crs: 'EPSG 없음' },
  p2: { file: '../assets/data/geo/results/namwon-greenhouse-2025.geojson', bbox: [127.296, 35.316, 127.308, 35.328], crs: 'EPSG 없음' },
  a5: { file: '../assets/data/geo/results/yeosu-marine-2026-drone-grid100.geojson', bbox: null, crs: 'EPSG:4326' },
};
/** XLSX 첫 행 미리보기 — results.js 의 필드(pnu/emd/cls/area). */
export const XLSX_ROWS = {
  head: ['pnu', 'emd', 'cls', 'area'],
  rows: [['4519025022…0001', '사매면', '경작', '1,284'], ['4519025022…0007', '사매면', '비경작', '612'], ['4519025023…0012', '사매면', '경작', '2,031']],
  tail: '… 2,098행',
};
/** ZIP 파일 트리 — camera_org_202604.zip. */
export const ZIP_TREE = `camera_org_202604/
├ 20260412/
│  ├ DJI_0001.JPG
│  ├ DJI_0002.JPG
│  └ … 4,820장
└ index.csv`;
export const FAIL_ACTIONS = ['crs', 'cancel', 'detail'];

/** 공유 설정 모달 — 원본 공유 권한 표(기관명 · 권한명). */
export const ORGS = ['LX 한국국토정보공사', '남원시청'];
export const PERMS = ['권한 없음', '뷰어', '편집'];
export const SHARE_DEFAULT = [
  { org: 'LX 한국국토정보공사', perm: '편집' },
  { org: '남원시청', perm: '뷰어' },
];

/* ── 업로드 완료 8건 → `지도 레이어 발행` ───────────────────────────── */
export const DONE_UP = [
  { id: 'd1', fmt: 'TIF', file: 'NW_ortho_정사영상_202604_section_C_v3.tif', size: '55.4 GB', at: '2026.04.10 14:22', by: '최수현', arch: 0 },
  { id: 'd2', fmt: 'ECW', file: 'NW_ortho_202604_zone_X.ecw', size: '47.6 GB', at: '2026.04.12 09:30', by: '정민재', arch: 1 },
  { id: 'd3', fmt: 'XLSX', file: '농지이용_행정정보_202604.xlsx', size: '287.3 KB', at: '2026.04.09 15:40', by: '이주원', arch: 0 },
  { id: 'd4', fmt: 'TIF', file: 'NW_ortho_202604_section_A.tif', size: '58.3 GB', at: '2026.04.11 09:00', by: '김현우', arch: 2 },
  { id: 'd5', fmt: 'ECW', file: '남원_운봉_드론_4월.ecw', size: '62.7 GB', at: '2026.04.09 10:00', by: '이서연', arch: 1 },
  { id: 'd6', fmt: 'SHP', file: 'NW_road_defect_labels_202604.shp', size: '48.2 MB', at: '2026.06.20 10:00', by: '김현우', arch: 0 },
  { id: 'd7', fmt: 'SHP', file: 'NW_greenhouse_labels_202603.shp', size: '39.4 MB', at: '2026.06.18 16:05', by: '이서연', arch: 0 },
  { id: 'd8', fmt: 'ZIP', file: 'camera_org_202604.zip', size: '18.7 GB', at: '2026.04.13 08:30', by: '김현우', arch: 0 },
];
export const DONE_FOLD = 3;

/** 발행 폼 — 발행 유형 / 기준 일자 / 데이터명 / 출처 / 설명 / 공유 권한 표. */
export const PUB_TYPES = ['정사영상 레이어', '공간정보 레이어', '이미지셋 레이어'];
export const PUB_PREFILL = {
  d1: { type: '정사영상 레이어', basis: '2026-04-10', name: '남원 정사영상 2026-04 C구역', src: 'LX · 드론', desc: '권역 C 정사영상 · 기준일 2026.04.10' },
  d4: { type: '정사영상 레이어', basis: '2026-04-10', name: '남원 정사영상 2026-04 A구역', src: 'LX · 드론', desc: '권역 A 정사영상 · 기준일 2026.04.10' },
};

/* ── 레이어 발행중 7건 (진행 5 · 실패 2) ────────────────────────────── */
export const PUB_STEPS = ['파일 확인', '공간정보 분석', '지도 데이터 변환', '레이어 발행'];
export const PUBLISHING = [
  { id: 'p1', fmt: 'SHP', st: 'run', step: 2, file: 'NW_road_defect_labels_202604.shp', size: '48.2 MB', at: '2026.06.20 10:00', by: '김현우' },
  { id: 'p2', fmt: 'SHP', st: 'fail', step: 2, file: 'NW_greenhouse_labels_202603.shp', size: '39.4 MB', at: '2026.06.18 16:05', by: '이서연',
    why: '좌표체계 정보를 확인할 수 없습니다. 좌표계를 지정해 다시 발행해 주세요.', short: '좌표계 없음' },
  { id: 'p3', fmt: 'TIF', st: 'run', step: 3, file: 'NW_ortho_202604_section_A.tif', size: '58.3 GB', at: '2026.04.11 09:20', by: '김현우' },
  { id: 'p4', fmt: 'ECW', st: 'run', step: 1, file: 'NW_ortho_202604_zone_X.ecw', size: '47.6 GB', at: '2026.04.12 09:40', by: '정민재' },
  { id: 'p5', fmt: 'XLSX', st: 'run', step: 4, file: '농지이용_행정정보_202604.xlsx', size: '287.3 KB', at: '2026.04.09 15:52', by: '이주원' },
  { id: 'p6', fmt: 'ZIP', st: 'fail', step: 1, file: 'camera_org_202604.zip', size: '18.7 GB', at: '2026.04.13 08:41', by: '김현우',
    why: '압축 파일 안에서 지원하는 이미지 형식을 찾지 못했습니다. 원본을 확인해 주세요.', short: '이미지 형식 없음' },
  { id: 'p7', fmt: 'ECW', st: 'run', step: 2, file: '남원_운봉_드론_4월.ecw', size: '62.7 GB', at: '2026.04.09 10:12', by: '이서연' },
];
export const PUB_ST = { run: '진행중', fail: '실패' };
/** 단계 → 그림 위 리빌 비율(단계 완료분 + 진행분). 4/4 = 레이어 발행 중. */
export const PUB_PCT = [12, 37, 62, 87];
/** 타일 크기 4단 — 열 수. 발주: "4배수 개념으로 카드 이미지도 커스텀". 기본 M. */
export const SIZES = { S: 6, M: 4, L: 3, XL: 2 };
export const SIZE_KEY = 'lx_ds_size';

/* ── 판 — 실측 범위만 실선, 좌표계 없는 파일은 파선 ─────────────────── */
export const IMG = IMAGERY;
const byId = (id) => IMAGERY.find((i) => i.id === id);
const gsdCm = (i) => +(i.gsd * 100).toFixed(2);
const fx = (n) => n.toFixed(4);

/** 마스터 Upload 의 코너 브래킷 3 + 파선 액자 1 — 좌표는 imagery.js 실측값이다. */
const nw = byId('namwon_2504'), ku = byId('kuksan_a68'), ku2 = byId('kuksan_a71');
export const EXTENTS = [
  {
    id: 'ex-namwon', measured: true, title: '남원 · namwon_2504–2510',
    bounds: nw.bounds,
    sub: `${fx(nw.bounds[0])},${fx(nw.bounds[1])} ~ ${fx(nw.bounds[2])},${fx(nw.bounds[3])} · GSD ${gsdCm(byId('namwon_2504'))} – ${gsdCm(byId('namwon_2506'))} cm`,
  },
  {
    id: 'ex-kuksan', measured: true, capAbove: true, title: '국산리 · kuksan_a68 / a71',
    bounds: [
      Math.min(ku.bounds[0], ku2.bounds[0]), Math.min(ku.bounds[1], ku2.bounds[1]),
      Math.max(ku.bounds[2], ku2.bounds[2]), Math.max(ku.bounds[3], ku2.bounds[3]),
    ],
    sub: '',
  },
  {
    // 여수 해양쓰레기 조사 범위 — 정사영상 도엽이 아니라 조사 범위다(results.js 유래).
    id: 'ex-yeosu', measured: true, capAbove: true, title: '여수 · 해양쓰레기 조사 범위',
    bounds: [127.5093, 34.5547, 127.7495, 34.7503],
    sub: '127.5093,34.5547 ~ 127.7495,34.7503',
  },
  {
    // 결손 자백 — 좌표계가 없는 업로드 대기 파일. 삭제하지 않고 파선으로 남긴다.
    id: 'ex-pending', measured: false, capAbove: true, title: '업로드 대기 · 좌표 미확정',
    bounds: [126.62, 36.58, 126.98, 36.86],
    sub: 'NW_ortho_202602_field_01.tif · 범위 미확정',
  },
];
EXTENTS[1].sub = `${fx(EXTENTS[1].bounds[0])},${fx(EXTENTS[1].bounds[1])} ~ ${fx(EXTENTS[1].bounds[2])},${fx(EXTENTS[1].bounds[3])} · GSD ${gsdCm(ku)} cm`;

/** 판 머리 한 줄 — 보관 도엽 수·시점 수는 세어서 적는다. */
export const PLATE_HEAD = {
  sheets: IMAGERY.length,
  epochs: new Set(IMAGERY.filter((i) => /^namwon_25\d\d$/.test(i.id)).map((i) => i.captured)).size,
  crs: 'V-World 정사영상 · EPSG:4326',
};

export const ATTRIB = '자료제공: 브이월드 · LX 한국국토정보공사';
export const FOOT_LINKS = ['개인정보처리방침', '이용약관', '이메일주소무단수집거부'];
export const FOOT_ADDR = '(우)54870 전북 전주시 덕진구 기지로 120 · 고객센터 063-713-1213, 1216';
