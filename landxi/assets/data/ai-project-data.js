/* ──────────────────────────────────────────────
   AI 프로젝트 공용 데이터 + 사이드바 동기화
   - 모든 ai-project-* 화면이 공유하는 단일 데이터 소스
   - 사이드바 숫자/링크를 현재 pid 기준으로 통일 (화면 이동 시 값이 바뀌던 오류 방지)
────────────────────────────────────────────── */
(function () {
  'use strict';

  window.AI_PROJECTS = {
    '1': { name: '도로안전 정사영상', type: '폴리곤 (Polygon)', dataType: 'ortho', status: 'warn', statusLabel: '진행중', desc: '드론 정사영상 기반 도로 포장 손상(포트홀·크랙·보수흔적·공동의심) 및 쓰레기 자동 탐지', created: '2026.01.05 09:30', lastTrain: '2026.05.18 14:30', imagery: 36, labeling: 4, trainRuns: 3, classes: [{c:'#E63946',n:'포트홀'},{c:'#F4A261',n:'크랙'},{c:'#2A9D8F',n:'보수흔적'},{c:'#9B5DE5',n:'공동의심'},{c:'#FFB703',n:'쓰레기'}] },
    '2': { name: '도로안전 카메라', type: '폴리곤 (Polygon)', dataType: 'imageset', status: 'warn', statusLabel: '진행중', desc: '순찰 차량 전방 카메라 영상에서 도로 시설물 이상 탐지', created: '2026.01.10 14:20', lastTrain: '2026.05.15 10:00', imagery: 120, labeling: 2, trainRuns: 2, classes: [{c:'#E63946',n:'포트홀'},{c:'#F4A261',n:'중앙분리대'},{c:'#2A9D8F',n:'시선유도봉'},{c:'#9B5DE5',n:'보행시설'},{c:'#FFB703',n:'교통표지판'},{c:'#00B4D8',n:'차선불량'},{c:'#F15BB5',n:'컬러맨홀'},{c:'#8AC926',n:'불법주정차'}] },
    '3': { name: '사료작물(생육기) 탐지', type: '폴리곤 (Polygon)', dataType: 'ortho', status: 'ok', statusLabel: '완료', desc: '고해상도 드론영상을 기반으로 생육 단계의 사료작물 4종(IRG, 호밀, 옥수수, 수단그라스)을 빠르게 탐지하고, 필지 단위로 재배면적 및 생산량을 자동 검출하는 AI 분석 서비스', created: '2026.02.01 10:15', lastTrain: '2026.05.10 09:15', imagery: 12, labeling: 3, trainRuns: 3, classes: [{c:'#f44336',n:'IRG(생육기)'},{c:'#ce7e00',n:'호밀(생육기)'},{c:'#2986cc',n:'옥수수(생육기)'},{c:'#6a329f',n:'수단그라스(생육기)'}] },
    '4': { name: '사료작물(생산기) 탐지', type: '폴리곤 (Polygon)', dataType: 'ortho', status: 'ok', statusLabel: '완료', desc: '고해상도 드론영상을 기반으로 생산 단계의 사료작물 4종(IRG, 호밀, 옥수수, 수단그라스)을 빠르게 탐지하고, 필지 단위로 재배면적 및 생산량을 자동 검출하는 AI 분석 서비스', created: '2026.02.15 11:00', lastTrain: '2026.04.28 16:40', imagery: 8, labeling: 2, trainRuns: 2, classes: [{c:'#744700',n:'IRG(생산기)'},{c:'#8fce00',n:'호밀(생산기)'},{c:'#16537e',n:'옥수수(생산기)'},{c:'#c90076',n:'수단그라스(생산기)'}] },
    '5': { name: '곤포사일리지 탐지', type: '바운딩 박스 (Bounding Box)', dataType: 'ortho', status: 'ok', statusLabel: '완료', desc: '고해상도 드론영상을 기반으로 곤포사일리지를 자동으로 검출하는 AI 분석 서비스', created: '2026.03.01 08:45', lastTrain: '2026.04.20 11:20', imagery: 15, labeling: 1, trainRuns: 2, classes: [{c:'#bf9000',n:'곤포사일리지'}] },
    '6': { name: '비닐하우스 탐지', type: '폴리곤 (Polygon)', dataType: 'ortho', status: 'ok', statusLabel: '완료', desc: '고해상도 드론 영상을 기반으로 비닐하우스(단동/다동)를 자동으로 검출하고, 수량을 산출해주는 AI 분석 서비스', created: '2026.03.10 16:30', lastTrain: '2026.04.15 08:50', imagery: 24, labeling: 2, trainRuns: 2, classes: [{c:'#e6a42b',n:'비닐하우스(단동)'},{c:'#c88c5c',n:'비닐하우스(다동)'}] },
    '7': { name: '농지 활용 분석', type: '폴리곤 (Polygon)', dataType: 'ortho', status: 'ok', statusLabel: '완료', desc: '고해상도 드론 영상을 기반으로 농지 이용 현황(경작, 비경작)을 자동으로 검출해주는 AI 분석 서비스', created: '2026.03.20 13:10', lastTrain: '2026.03.30 15:05', imagery: 18, labeling: 3, trainRuns: 3, classes: [{c:'#38761d',n:'경작지'},{c:'#134f5c',n:'비경작지'}] },
    '8': { name: '방치 쓰레기 탐지', type: '바운딩 박스 (Bounding Box)', dataType: 'imageset', status: 'warn', statusLabel: '진행중', desc: '고해상도 드론영상을 기반으로 방치되어 쌓여 있는 쓰레기 더미를 검출해주는 AI 분석 서비스', created: '2026.04.01 15:45', lastTrain: '2026.03.25 13:30', imagery: 10, labeling: 1, trainRuns: 1, classes: [{c:'#0b5394',n:'방치 쓰레기'}] }
  };

  /* 권한 마스터 (기관 / 권한 아이디 / 권한 명) - 등록·개요 화면 공용 */
  window.AI_PERMISSIONS = [
    { org: 'LX 한국국토정보공사', roleId: 'ROLE_LX_MANAGER', roleName: 'LX 관리자' },
    { org: 'LX 한국국토정보공사', roleId: 'ROLE_LX_USER', roleName: 'LX 일반 사용자' },
    { org: 'LX 한국국토정보공사', roleId: 'ROLE_LX_RIVER', roleName: 'LX 하천 관리' },
    { org: '남원시청', roleId: 'ROLE_NAMWON_MANAGER', roleName: '남원시청 관리자' },
    { org: '남원시청', roleId: 'ROLE_NAMWON_01', roleName: '사료작물 분석' },
    { org: '남원시청', roleId: 'ROLE_NAMWON_02', roleName: '농지 활용 분석' },
    { org: '남원시청', roleId: 'ROLE_NAMWON_03', roleName: '영농 정보 분석' },
    { org: '남원시청', roleId: 'ROLE_NAMWON_USER', roleName: '일반사용자' },
    { org: '전라남도', roleId: 'ROLE_JEONNAM_MANAGER', roleName: '전라남도 관리자' },
    { org: '전라남도', roleId: 'ROLE_JEONNAM_03', roleName: '해운항만과' },
    { org: '전라남도', roleId: 'ROLE_JEONNAM_01', roleName: '신안군' },
    { org: '전라남도', roleId: 'ROLE_JEONNAM_02', roleName: '완도군' },
    { org: '전라남도', roleId: 'ROLE_JEONNAM_USER', roleName: '전라남도 사용자' }
  ];

  /* 개요/등록 화면 공용 추가 메타 - 사용여부 / 개발 목적 / 썸네일 / 권한(선택된 roleId).
     카드 썸네일: 원본 이미지, 대시보드 썸네일: 축소(s) 버전. 도로(1·2)는 대시보드 썸네일 미보유. */
  var PROJECT_EXTRA = {
    '1': { active: true, recoGsd: '0.05 m/px (5cm급)', cardThumb: 'assets/images/model_orthophoto.jpg', dashThumb: 'assets/images/model_orthophoto.jpg',
           purpose: '드론 정사영상으로 도로 포장 손상을 신속·정밀하게 탐지하여 유지보수 우선순위 산정과 예산 집행의 객관적 근거를 제공합니다.',
           perms: ['ROLE_LX_MANAGER', 'ROLE_NAMWON_MANAGER', 'ROLE_NAMWON_USER'] },
    '2': { active: true, recoGsd: '1920×1080 이상', cardThumb: 'assets/images/model_camera.jpg', dashThumb: 'assets/images/model_camera.jpg',
           purpose: '순찰 차량 전방 카메라 영상을 분석해 도로 시설물 이상을 상시 점검하고 안전 관리 효율을 높입니다.',
           perms: ['ROLE_NAMWON_MANAGER', 'ROLE_NAMWON_USER'] },
    '3': { active: true, recoGsd: '0.07 m/px (7cm급)', cardThumb: 'assets/images/models/model_1.png', dashThumb: 'assets/images/models/model_1s.png',
           purpose: '드론영상을 기반으로 사료작물을 자동 검출하여 조사료 수급 모니터링을 안정화하고, 보조금 대상지 검증 및 축산행정 효율화에 기여',
           perms: ['ROLE_NAMWON_MANAGER', 'ROLE_NAMWON_01', 'ROLE_NAMWON_USER'] },
    '4': { active: true, recoGsd: '0.07 m/px (7cm급)', cardThumb: 'assets/images/models/model_2.png', dashThumb: 'assets/images/models/model_2s.png',
           purpose: '드론영상을 기반으로 사료작물을 자동 검출하여 조사료 수급 모니터링을 안정화하고, 보조금 대상지 검증 및 축산행정 효율화에 기여',
           perms: ['ROLE_NAMWON_MANAGER', 'ROLE_NAMWON_01'] },
    '5': { active: true, recoGsd: '0.10 m/px (10cm급)', cardThumb: 'assets/images/models/model_3.png', dashThumb: 'assets/images/models/model_3s.png',
           purpose: '드론영상을 기반으로 곤포사일리지를 자동 검출하여 조사료 재고 현황을 파악하고, 수급 계획 수립 및 축산행정 효율화에 기여',
           perms: ['ROLE_NAMWON_01', 'ROLE_NAMWON_USER'] },
    '6': { active: true, recoGsd: '0.08 m/px (8cm급)', cardThumb: 'assets/images/models/model_4.png', dashThumb: 'assets/images/models/model_4s.png',
           purpose: '드론영상을 기반으로 비닐하우스(단동/다동)를 자동 검출하여 영농 시설 현황을 정확히 파악하고, 보조금 관리·실태조사 등 데이터 기반 스마트 영농 행정 구현에 기여',
           perms: ['ROLE_NAMWON_MANAGER', 'ROLE_NAMWON_03'] },
    '7': { active: true, recoGsd: '0.12 m/px (12cm급)', cardThumb: 'assets/images/models/model_5.png', dashThumb: 'assets/images/models/model_5s.png',
           purpose: '드론영상을 기반으로 농지 이용 현황(경작·비경작)을 자동 검출하여 농지이용 실태조사 및 취득자격 심사 업무를 간소화하고 농지 행정 효율화에 기여',
           perms: ['ROLE_NAMWON_MANAGER', 'ROLE_NAMWON_02', 'ROLE_NAMWON_USER'] },
    '8': { active: true, recoGsd: '4000×3000 이상', cardThumb: 'assets/images/models/model_6.png', dashThumb: 'assets/images/models/model_6s.png',
           purpose: '대규모 지역을 모니터링, 불법으로 버려진 쓰레기를 신속하게 탐지함으로써 환경 보호와 위생 개선, 공공 안전 향상에 기여',
           perms: ['ROLE_NAMWON_MANAGER', 'ROLE_LX_MANAGER'] }
  };
  Object.keys(PROJECT_EXTRA).forEach(function (k) {
    if (!window.AI_PROJECTS[k]) return;
    var ex = PROJECT_EXTRA[k];
    for (var f in ex) { if (ex.hasOwnProperty(f)) window.AI_PROJECTS[k][f] = ex[f]; }
  });

  /* 학습 결과 (mock) - 카드 발행/열람 공용 */
  window.AI_TRAIN_RESULTS = {
    '1': [
      { id: 'r1-3', labeling: '도로안전 정사영상 v2.1', date: '2026.05.18', labels: 3842, iou: 0.82, f1: 0.87 },
      { id: 'r1-2', labeling: '도로안전 정사영상 v2.0', date: '2026.05.10', labels: 2800, iou: 0.78, f1: 0.83 },
      { id: 'r1-1', labeling: '도로안전 정사영상 v1.0', date: '2026.04.15', labels: 1560, iou: 0.71, f1: 0.76 }
    ],
    '2': [ { id: 'r2-1', labeling: '도로안전 카메라 v1.3', date: '2026.05.15', labels: 5620, iou: 0.79, f1: 0.84 } ],
    '3': [
      { id: 'r3-1', labeling: '사료작물(생육기) v3.0', date: '2026.05.10', labels: 2890, iou: 0.81, f1: 0.86 },
      { id: 'r3-2', labeling: '사료작물(생육기) v2.1', date: '2026.04.01', labels: 1850, iou: 0.75, f1: 0.80 }
    ],
    '4': [ { id: 'r4-1', labeling: '사료작물(생산기) v2.0', date: '2026.04.28', labels: 2100, iou: 0.80, f1: 0.85 } ],
    '5': [ { id: 'r5-1', labeling: '곤포사일리지 v1.2', date: '2026.04.20', labels: 1560, iou: 0.77, f1: 0.82 } ],
    '6': [
      { id: 'r6-1', labeling: '비닐하우스 v2.0', date: '2026.04.15', labels: 3450, iou: 0.84, f1: 0.89 },
      { id: 'r6-2', labeling: '비닐하우스 v1.0', date: '2026.03.20', labels: 1800, iou: 0.76, f1: 0.81 }
    ],
    '7': [
      { id: 'r7-1', labeling: '농지 분류 v2.0', date: '2026.03.30', labels: 4200, iou: 0.83, f1: 0.88 },
      { id: 'r7-2', labeling: '농지 분류 v1.0', date: '2026.03.25', labels: 2600, iou: 0.77, f1: 0.82 }
    ],
    '8': [ { id: 'r8-1', labeling: '방치 쓰레기 v1.0', date: '2026.03.25', labels: 720, iou: 0.72, f1: 0.78 } ]
  };

  /* 라벨링 데이터 (단일 라벨 풀) - 라벨링 목록/학습 워크플로우 공용. items[].name = 데이터명 */
  // lng/lat = 라벨 풀(촬영 권역) 대표 좌표 (남원 관내). 배경 지도 라벨 폴리곤 배치 + 풀 선택 시 지도 이동에 사용
  window.AI_LABELING_DATA = {
    '1': { type: 'ortho', items: [
      { name: '남원 도로구간 A 정사영상', file: 'NW_ortho_202604_section_A.tif', gsd: '5cm/px', labels: 342, last: '2026.05.18 14:30', lng: 127.3852, lat: 35.4142, locked: true },
      { name: '남원 도로구간 B 정사영상', file: 'NW_ortho_202604_section_B.tif', gsd: '5cm/px', labels: 210, last: '2026.05.17 11:05', lng: 127.4032, lat: 35.4216 },
      { name: '남원 도로 보수구간 정사영상', file: 'NW_ortho_202603_road_01.ecw', gsd: '8cm/px', labels: 0, last: '-', lng: 127.3948, lat: 35.4052 }
    ]},
    // 이미지셋(카메라): 꾸러미 단위 목록 - 한 행 = 한 꾸러미(사진 묶음)
    '2': { type: 'imageset', items: [
      { name: '남원시 도로카메라 4월 원본', photos: 16, labels: 121, last: '2026.05.19 10:45', thumb: 'assets/images/camera_org_16.png', lng: 127.3760, lat: 35.4112, locked: true },
      { name: '남원시 도로카메라 5월 원본', photos: 12, labels: 86, last: '2026.05.20 09:30', thumb: 'assets/images/camera_org_08.png', lng: 127.3812, lat: 35.4188 }
    ]},
    '3': { type: 'ortho', items: [
      { name: '운봉읍 정사영상', file: 'NW_ortho_202604_unbong.tif', gsd: '7cm/px', labels: 280, last: '2026.05.10 09:15', lng: 127.5215, lat: 35.4305, locked: true },
      { name: '인월면 정사영상', file: 'NW_ortho_202604_inwol.tif', gsd: '7cm/px', labels: 156, last: '2026.05.09 16:20', lng: 127.5548, lat: 35.4602 }
    ]},
    '4': { type: 'ortho', items: [
      { name: '대산면 1구역 정사영상', file: 'NW_ortho_202602_field_01.tif', gsd: '7cm/px', labels: 198, last: '2026.04.28 16:40', lng: 127.3152, lat: 35.4048, locked: true },
      { name: '대산면 2구역 정사영상', file: 'NW_ortho_202602_field_02.tif', gsd: '7cm/px', labels: 0, last: '-', lng: 127.3046, lat: 35.4152 }
    ]},
    '5': { type: 'ortho', items: [
      { name: '보절면 정사영상', file: 'NW_ortho_202603_bale_01.tif', gsd: '10cm/px', labels: 120, last: '2026.04.20 11:20', lng: 127.4552, lat: 35.4748, locked: true }
    ]},
    '6': { type: 'ortho', items: [
      { name: '주생면 1구역 정사영상', file: 'NW_ortho_202603_green_01.tif', gsd: '8cm/px', labels: 240, last: '2026.04.15 08:50', lng: 127.3452, lat: 35.3918, locked: true },
      { name: '주생면 2구역 정사영상', file: 'NW_ortho_202603_green_02.tif', gsd: '8cm/px', labels: 88, last: '2026.04.14 13:10', lng: 127.3348, lat: 35.3852 }
    ]},
    '7': { type: 'ortho', items: [
      { name: '금지면 정사영상', file: 'NW_ortho_202603_farm_01.tif', gsd: '12cm/px', labels: 310, last: '2026.03.30 15:05', lng: 127.3302, lat: 35.3308, locked: true }
    ]},
    '8': { type: 'imageset', items: [
      { name: '방치 쓰레기 드론 촬영 꾸러미', photos: 3, labels: 14, last: '2026.04.05 11:10', thumb: 'assets/images/drone_02.png', lng: 127.3905, lat: 35.4158, locked: true }
    ]}
  };

  /* 프로젝트 데이터셋 (mock) - 라벨링 완료 데이터(정사영상/이미지셋 다수)를 묶어 표준 형식으로 생성
     학습 워크플로우의 데이터셋 노드에서 1개만 선택해 사용 */
  window.AI_PROJECT_DATASETS = {
    '1': [
      { id: 'DS-2', name: '도로안전 데이터셋', version: 'v2', items: ['남원 도로구간 A 정사영상', '남원 도로구간 B 정사영상'], imageCount: 1840, labelCount: 552, created: '2026.06.12', owner: '김현우' },
      { id: 'DS-1', name: '도로안전 데이터셋', version: 'v1', items: ['남원 도로구간 A 정사영상'], imageCount: 1120, labelCount: 342, created: '2026.05.21', owner: '김현우' }
    ],
    '2': [
      { id: 'DS-1', name: '도로카메라 데이터셋', version: 'v1', items: ['남원시 도로카메라 4월 원본'], imageCount: 16, labelCount: 121, created: '2026.05.22', owner: '윤서준' }
    ]
  };

  /* 발행 모델 카드 (mock) - 카드 발행/열람 공용. 코드값 포함(수정 화면 로드용) */
  (function buildModelCards() {
    var CARD_VERSIONS = {
      '1': [ { v: 'v3(포트홀 강화)', d: '2026.05.19 10:00', tag: '3.0' }, { v: 'v2(균열 추가학습)', d: '2026.04.22 09:30', tag: '2.0' }, { v: 'v1(기본)', d: '2026.02.10 14:00', tag: '1.0' } ],
      '2': [ { v: 'v1(기본)', d: '2026.03.05 11:00', tag: '1.0' } ],
      '3': [ { v: 'v4(IRG 정밀)', d: '2026.05.11 09:00', tag: '4.0' }, { v: 'v3(호밀 추가)', d: '2026.04.18 10:00', tag: '3.0' }, { v: 'v2(옥수수 보강)', d: '2026.03.27 13:00', tag: '2.0' }, { v: 'v1(기본)', d: '2026.02.02 09:00', tag: '1.0' } ],
      '4': [ { v: 'v3(IRG 정밀)', d: '2026.05.05 09:00', tag: '3.0' }, { v: 'v2(혼파 보정)', d: '2026.04.12 10:00', tag: '2.0' }, { v: 'v1(기본)', d: '2026.02.20 09:00', tag: '1.0' } ],
      '5': [ { v: 'v2(소형 객체 보정)', d: '2026.05.07 11:00', tag: '2.0' }, { v: 'v1(기본)', d: '2026.03.14 09:00', tag: '1.0' } ],
      '6': [ { v: 'v5(단동/연동 분리)', d: '2026.05.20 09:00', tag: '5.0' }, { v: 'v4(반사광 보정)', d: '2026.04.30 10:00', tag: '4.0' }, { v: 'v3(군집 분리)', d: '2026.04.09 10:00', tag: '3.0' }, { v: 'v2(경계 정밀)', d: '2026.03.21 10:00', tag: '2.0' }, { v: 'v1(기본)', d: '2026.02.15 09:00', tag: '1.0' } ],
      '7': [ { v: 'v1(기본)', d: '2026.05.01 09:00', tag: '1.0' } ],
      '8': [ { v: 'v2(소형 더미 보정)', d: '2026.04.26 10:00', tag: '2.0' }, { v: 'v1(기본)', d: '2026.03.08 09:00', tag: '1.0' } ]
    };
    var TYPE_LABEL = { '1': '도로안전 정사영상', '2': '도로안전 카메라', '3': '사료작물(생육기) 탐지결과', '4': '사료작물(생산기) 탐지결과', '5': '곤포사일리지 탐지결과', '6': '비닐하우스 탐지결과', '7': '농지 활용 분석결과', '8': '방치 쓰레기 탐지결과' };
    var DATASET_CODE = { '1': '020417', '2': '020418', '3': '020411', '4': '020412', '5': '020413', '6': '020414', '7': '020415', '8': '020416' };
    var ALGO = { '1': 'YOLO v11-seg', '2': 'YOLO v11', '3': 'YOLO v11-seg', '4': 'YOLO v11-seg', '5': 'YOLO v11', '6': 'YOLO v11-seg', '7': 'UNET v1', '8': 'YOLO v11' };
    var ALGO_ID = { 'YOLO v11': 'YOLOV11', 'YOLO v11-seg': 'YOLOV11seg', 'UNET v1': 'UNETV1' };
    var DOCKER_SLUG = { '1': 'road-ortho', '2': 'road-camera', '3': 'silage-grow', '4': 'silage-prod', '5': 'bale', '6': 'greenhouse', '7': 'farmland', '8': 'trash' };
    var LATEST_MODIFIED = { '1': '2026.05.21 09:10', '2': '2026.03.06 10:00', '3': '2026.05.13 14:20', '4': '2026.05.06 11:00', '5': '2026.05.08 09:30', '6': '2026.05.21 16:40', '7': '2026.05.02 10:15', '8': '2026.04.27 09:00' };
    function detCode(t) { return (t && t.indexOf('바운딩') > -1) ? 'BDB' : 'PLG'; }

    window.AI_MODEL_CARDS = {};
    Object.keys(CARD_VERSIONS).forEach(function (pid) {
      var p = window.AI_PROJECTS[pid] || {};
      var members = (window.AI_PROJECT_MEMBERS && window.AI_PROJECT_MEMBERS[pid]) || [];
      var owner = (members[0] && members[0].name) || '김현우';
      var tile = p.dataType === 'imageset' ? 640 : 1024;
      var slug = DOCKER_SLUG[pid] || 'model';
      var algoLabel = ALGO[pid] || 'YOLO v11';
      var results = window.AI_TRAIN_RESULTS[pid] || [];
      window.AI_MODEL_CARDS[pid] = CARD_VERSIONS[pid].map(function (cv, i) {
        // 버전명 "v3(포트홀 강화)" → 모델 명(ver) "v3" + 모델 설명(괄호 안) "포트홀 강화"
        var m = /^([^(]*)\(([^)]*)\)\s*$/.exec(cv.v);
        var ver = m ? m[1].trim() : cv.v.trim();
        var mdesc = m ? m[2].trim() : '';
        return {
          name: cv.v,            // 목록/상세 표시용 (버전 + (설명))
          ver: ver,              // 모델 명 (버전)
          published: cv.d,
          publisher: owner,
          modified: (i === 0 && LATEST_MODIFIED[pid]) ? LATEST_MODIFIED[pid] : cv.d,
          modifier: owner,
          useYn: i === 0,
          datasetType: TYPE_LABEL[pid] || p.name || '-',
          datasetSeCd: DATASET_CODE[pid] || '',
          algo: algoLabel,
          algoId: ALGO_ID[algoLabel] || '',
          detTp: p.type || '-',
          detTpCode: detCode(p.type),
          tileSz: tile,
          dockerImage: 'landxi/' + slug,
          dockerTag: cv.tag,
          modelDesc: mdesc,      // 모델 설명 (괄호 안 텍스트)
          explnScrn: '/jn/aidetect/' + slug.replace(/-/g, '_') + '.html',
          resultId: (results[0] && results[0].id) || ''
        };
      });
    });
  })();

  /* 프로젝트 구성원 (협업) - 프로젝트마다 등록자(김현우) 포함, 신규 프로젝트는 등록자 1인.
     실명 사용 가능, '강상우'만 금지 */
  var OWNER = { id: 'm1', name: '김현우', role: '관리자', email: 'hwkim@namwon.go.kr', labels: 1240, lastWork: '2026.05.19 16:20' };
  window.AI_PROJECT_MEMBERS = {
    '1': [ OWNER,
      { id: 'm2', name: '이서연', role: '라벨러', email: 'sylee@namwon.go.kr', labels: 860, lastWork: '2026.05.19 14:05' },
      { id: 'm3', name: '박지호', role: '라벨러', email: 'jhpark@namwon.go.kr', labels: 412, lastWork: '2026.05.18 11:30' } ],
    '2': [ OWNER,
      { id: 'm4', name: '정민재', role: '라벨러', email: 'mjjeong@namwon.go.kr', labels: 540, lastWork: '2026.05.17 10:00' } ],
    '3': [ OWNER,
      { id: 'm5', name: '이서연', role: '라벨러', email: 'sylee@namwon.go.kr', labels: 720, lastWork: '2026.05.10 09:10' },
      { id: 'm6', name: '박지호', role: '라벨러', email: 'jhpark@namwon.go.kr', labels: 510, lastWork: '2026.05.09 16:20' },
      { id: 'm7', name: '최수현', role: '뷰어', email: 'shchoi@namwon.go.kr', labels: 0, lastWork: '-' } ],
    '4': [ OWNER ],
    '5': [ OWNER,
      { id: 'm8', name: '정민재', role: '라벨러', email: 'mjjeong@namwon.go.kr', labels: 380, lastWork: '2026.04.20 11:00' } ],
    '6': [ OWNER,
      { id: 'm9', name: '이서연', role: '라벨러', email: 'sylee@namwon.go.kr', labels: 640, lastWork: '2026.04.15 08:40' },
      { id: 'm10', name: '최수현', role: '뷰어', email: 'shchoi@namwon.go.kr', labels: 0, lastWork: '-' } ],
    '7': [ OWNER,
      { id: 'm11', name: '박지호', role: '라벨러', email: 'jhpark@namwon.go.kr', labels: 900, lastWork: '2026.03.30 14:50' } ],
    '8': [ OWNER ]
  };

  /* 프로젝트별 학습 워크플로우 (학습 메뉴 = ai-project-training). 목록·개요 KPI 공용 소스 */
  window.AI_PROJECT_WORKFLOWS = {
    '1': [
      { id: 1, name: '학습 #1', runs: 3, created: '2026.01.15 09:00', owner: '김현우' },
      { id: 2, name: '학습 #2', runs: 1, created: '2026.03.20 10:00', owner: '이서연' }
    ],
    '2': [ { id: 1, name: '학습 #1', runs: 2, created: '2026.02.01 10:00', owner: '김현우' } ],
    '3': [ { id: 1, name: '학습 #1', runs: 3, created: '2026.02.10 10:00', owner: '김현우' } ],
    '4': [ { id: 1, name: '학습 #1', runs: 2, created: '2026.03.01 10:00', owner: '김현우' } ],
    '5': [ { id: 1, name: '학습 #1', runs: 1, created: '2026.03.10 09:00', owner: '김현우' } ],
    '6': [ { id: 1, name: '학습 #1', runs: 2, created: '2026.03.15 10:00', owner: '김현우' } ],
    '7': [ { id: 1, name: '학습 #1', runs: 2, created: '2026.03.22 10:00', owner: '김현우' } ],
    '8': [ { id: 1, name: '학습 #1', runs: 1, created: '2026.04.05 10:00', owner: '김현우' } ]
  };

  function getPid() {
    return new URLSearchParams(window.location.search).get('pid') || '1';
  }
  window.getProjectPid = getPid;

  /* ──────────────────────────────────────────────
     공용 사이드바 (5단계) - 모든 ai-project-* 화면이 동일하게 렌더
     개요 / 학습 데이터 / 라벨링 / 학습 / 학습 결과
  ────────────────────────────────────────────── */
  var SIDEBAR_ICONS = {
    overview: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
    imagery: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    labeling: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    training: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    results: '<path d="M9 17H7A5 5 0 017 7h2"/><path d="M15 7h2a5 5 0 010 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>'
  };

  var SIDEBAR_ITEMS = [
    { key: 'overview', label: '개요', file: 'ai-project-detail.html' },
    { key: 'imagery', label: '학습 데이터', file: 'ai-project-imagery.html', count: 'imagery' },
    { key: 'labeling', label: '라벨링', file: 'ai-project-detector.html' },
    { key: 'training', label: '학습', file: 'ai-project-training.html' },
    { key: 'results', label: '학습 결과', file: 'ai-project-detector-report.html' }
  ];

  /* 현재 파일명 → 활성 메뉴 키 */
  var ACTIVE_MAP = {
    'ai-project-detail.html': 'overview',
    'ai-project-imagery.html': 'imagery',
    'ai-project-detector.html': 'labeling',
    'ai-project-detector-train.html': 'labeling',
    'ai-project-training.html': 'training',
    'ai-project-detector-report.html': 'results',
    'ai-project-results.html': 'results',
    'ai-project-reports.html': 'results'
  };

  function renderSidebar() {
    var aside = document.querySelector('.project-sidebar');
    if (!aside) return;
    var pid = getPid();
    var p = window.AI_PROJECTS[pid] || window.AI_PROJECTS['1'];
    var current = (location.pathname.split('/').pop() || '').toLowerCase();
    var activeKey = ACTIVE_MAP[current] || '';

    var html = '<nav class="project-sidebar-nav">';
    SIDEBAR_ITEMS.forEach(function (it) {
      var active = it.key === activeKey ? ' is-active' : '';
      var count = (it.count && p[it.count] != null)
        ? '<span class="project-sidebar-count">' + p[it.count] + '</span>' : '';
      html += '<a href="' + it.file + '?pid=' + pid + '" class="project-sidebar-item' + active + '">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + SIDEBAR_ICONS[it.key] + '</svg>'
        + '<span>' + it.label + '</span>' + count + '</a>';
    });
    html += '</nav>';
    aside.innerHTML = html;
  }
  window.applyProjectSidebar = renderSidebar;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSidebar);
  } else {
    renderSidebar();
  }
})();
