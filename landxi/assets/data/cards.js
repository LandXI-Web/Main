// 서비스 카드 대장 — 이 플랫폼의 상품 (2026-09-20 발주자 정의)
// 근거: docs/superpowers/specs/2026-09-20-platform-roles.md · 2026-09-20-card-architecture.md
//
//   "카드 발행 관리는 잘 만들어진 AI 모델 분석 서비스를 카드 형태로 발행하는 기능이다."
//   "예: 남원시 영농관리 서비스 카드, 생활환경 위험요소 탐지 서비스"
//   "LX에서 만든 서비스들이 지자체 · 글로벌사업 분기가 필요하다"
//   "지자체나 글로벌 나라는 분석 결과를 행정에 잘 활용하는 거지"
//   "글로벌도 지자체도 LX와 연계 체계가 고려되어야 하고, 기본 구조는 비슷하게 가야 한다"
//   "23년 남원시 생활환경 위험요소, 25년 영농관리 행정서비스, 26년 도로 안전관리, 27년 인파관리 …
//    디테일한 서비스를 공통 표준으로 하긴 어렵다. 기본 틀은 갖추되 필요한 세부 기능은 따로 만들어야 한다"
//   "남원에 분기한 이 AI 서비스를 또 다른 지자체에 이식할 수 있도록 / 모듈형도 고려"
//
// ── 구조 세 겹 ──────────────────────────────────────────────────────────
//   1) MODULES   공통 모듈(모든 카드가 상속) + 전용 모듈(그 서비스에만 있는 세부 기능)
//   2) CARDS     카드 = 표준 틀. 공통 모듈 + 전용 모듈 조합 + 묶은 AI 모델(services.js id)
//   3) DEPLOYS   이식 배포본 = 카드를 특정 지역에 심은 것(남원 23·25·26·27년 …). 다른 지자체로 복제한다.
// 이식이란 카드를 그대로 두고 DEPLOY 의 지역·경계·기준값·주기만 갈아 끼우는 일이다.
import { serviceById } from './services.js';

/* ══ 0. 종류 선언 — "튀는 구조"를 흡수하는 자리 ═══════════════════════════
 * (2026-09-20 발주자: "앞으로 튀는 구조도 많아질 거야. 그래서 조금은 유연한 구조도 필요해.
 *  인파 관리는 드론 영상에서 사람, 교통혼잡 지도 가시화 하는 서비스를 해야 하거든")
 *
 * 카드마다 무엇을 **먹고**(input) 무엇을 **내놓고**(output) 어떻게 **보여주는지**(viz) 선언한다.
 * 화면은 카드 이름을 모른 채 이 선언만 보고 UI 를 고른다 — 새 종류가 생기면
 * 여기 한 줄 + 렌더러 하나를 더하면 되고, 화면 코드는 그대로다.
 *
 *   정사영상 → 폴리곤 → 레이어      (영농·변화탐지)   … 지금까지의 기본형
 *   드론 영상 → 점·밀도 → 히트맵·재생 (인파관리)       … 튀는 구조 1호
 *   차량 카메라 → 구간 → 등급        (도로안전)
 */
export const INPUT_KINDS = [
  { id: 'ortho', name: '정사영상', unit: '도엽', note: '드론·항공 정사영상 한 시점', tier: 'raw' },
  { id: 'video', name: '드론 영상', unit: '비행', note: '이동 촬영 동영상 — 시간축이 있다', tier: 'raw' },
  { id: 'camera', name: '차량 카메라', unit: '주행', note: '노선을 따라가는 연속 촬영', tier: 'raw' },
  { id: 'satellite', name: '위성 영상', unit: '장면', note: '광역·저해상 — 글로벌 사업의 기본 입력', tier: 'raw' },
];
export const OUTPUT_KINDS = [
  { id: 'polygon', name: '면(폴리곤)', note: '필지·건물·훼손지 — 면적을 센다' },
  { id: 'point', name: '점', note: '개별 객체 — 개수를 센다' },
  { id: 'density', name: '밀도', note: '격자·면 단위 집계값 — 혼잡도·분포' },
  { id: 'segment', name: '구간', note: '선형(도로·해안선)을 잘라 등급을 매긴다' },
  { id: 'series', name: '시계열', note: '같은 자리의 시간에 따른 변화' },
];
export const VIZ_KINDS = [
  { id: 'layer', name: '결과 레이어', note: '지도 위 벡터 — 클릭하면 속성' },
  { id: 'heatmap', name: '히트맵', note: '밀도를 색 농도로 — 격자/커널' },
  { id: 'playback', name: '시간 재생', note: '타임라인을 끌면 그 시각의 상태' },
  { id: 'grade', name: '등급 색칠', note: '구간·구역을 등급으로 칠한다' },
  { id: 'chart', name: '차트', note: '표·막대·선 — 통계 서랍에서' },
];
export const kindName = (list, id) => (list.find((k) => k.id === id) || {}).name || id;

/** 카드의 선언이 요구하는 화면 장치 — 화면은 이 결과만 보고 UI 를 켠다. */
export function needsOf(card) {
  const k = card.kind || { input: ['ortho'], output: ['polygon'], viz: ['layer'] };
  return {
    ...k,
    timeAxis: k.output.includes('series') || k.viz.includes('playback'),   // 타임라인·재생 필요
    grid: k.output.includes('density'),                                     // 격자 집계·히트맵 범례
    lineRef: k.output.includes('segment'),                                  // 선형 기준(노선·해안선) 필요
    videoPlayer: k.input.includes('video'),                                 // 영상 플레이어 + 프레임 추출
    parcelRef: k.output.includes('polygon'),                                // 지적·대장 대조 가능
  };
}

/* ══ 1. 모듈 ═══════════════════════════════════════════════════════════ */
/** 공통 모듈 — 모든 카드가 자동으로 갖는다. 이것이 "기본 틀"이다. */
export const CORE_MODULES = [
  { id: 'ingest', name: '영상 수집·정사화', desc: '드론·항공·위성 영상을 받아 좌표를 맞춘다', screen: 'dataset.html' },
  { id: 'infer', name: 'AI 추론 실행', desc: '카드가 묶은 모델을 선택 구역에 돌린다', screen: 'analysis-ai.html' },
  { id: 'review', name: '결과 검수·수정', desc: '오탐을 지우고 누락을 보탠다 — LX 권한', screen: 'ai-project.html' },
  { id: 'mapview', name: '지도 결과 열람', desc: '결과 레이어·시점 비교·속성 조회', screen: 'ximap.html' },
  { id: 'stats', name: '행정구역 통계', desc: '행정 단위로 집계해 표·그래프로 만든다', screen: 'stats-standard.html' },
  { id: 'report', name: '보고서 발급', desc: '공문에 붙일 수 있는 형식으로 내보낸다', screen: 'report-standard.html' },
  { id: 'perm', name: '권한·공유', desc: '기관·부서 단위 열람/편집 권한', screen: 'admin-users.html' },
];

/**
 * 전용 모듈 — 그 서비스에만 있는 세부 기능. **공통 표준으로 흡수하지 않는다.**
 * 발주자의 핵심 난제가 여기다: 틀은 같아도 이 칸은 서비스마다 따로 만든다.
 * build: 'done' 만든 것 · 'wip' 만드는 중 · 'todo' 설계만
 */
export const EXT_MODULES = {
  farm: [
    { id: 'parcel-match', name: '필지 대장 대조', desc: '탐지 결과를 지적 필지(PNU)와 맞춰 경작·비경작을 판정', build: 'done' },
    { id: 'crop-cycle', name: '영농 주기 판정', desc: '4시점 영상으로 휴경·이모작을 구분', build: 'done' },
    { id: 'house-count', name: '비닐하우스 동수 집계', desc: '단동/다동을 나눠 세고 면적을 환산', build: 'done' },
    { id: 'farm-subsidy', name: '직불금 대상 검토', desc: '경작 판정 결과를 농업경영체 등록정보와 대조', build: 'todo' },
  ],
  living: [
    { id: 'pile-size', name: '폐기물 더미 규모 추정', desc: '면적·높이로 처리 물량을 추정', build: 'wip' },
    { id: 'burn-trace', name: '소각 흔적 판별', desc: '그을음·재 패턴으로 불법 소각을 구분', build: 'wip' },
    { id: 'civil-link', name: '민원 연계', desc: '접수된 민원 좌표와 탐지 지점을 맞춰 중복을 줄임', build: 'todo' },
    { id: 'patrol-route', name: '현장 점검 동선', desc: '점검 대상지를 묶어 순회 순서를 만든다', build: 'todo' },
  ],
  road: [
    { id: 'road-seg', name: '노선 구간화', desc: '탐지점을 도로 노선·구간(100 m)에 배정', build: 'done' },
    { id: 'pave-grade', name: '포장 상태 등급', desc: '파손 밀도로 구간 등급(A–E)을 매김', build: 'done' },
    { id: 'multi-view', name: '다시점 대조', desc: '차량 카메라와 정사영상 결과를 한 지점에서 합침', build: 'done' },
    { id: 'repair-plan', name: '보수 우선순위', desc: '등급·교통량으로 보수 순서를 제안', build: 'todo' },
  ],
  crowd: [
    { id: 'person-detect', name: '사람 탐지·계수', desc: '드론 영상 프레임에서 사람을 세고 중복을 지운다', build: 'todo' },
    { id: 'density-grid', name: '인파 밀도 격자', desc: '구역을 격자로 나눠 ㎡당 인원을 집계한다', build: 'todo' },
    { id: 'traffic-flow', name: '교통 혼잡도', desc: '차량 탐지와 이동 속도로 도로 혼잡 등급을 매긴다', build: 'todo' },
    { id: 'time-scrub', name: '시간 재생', desc: '비행 시각을 끌면 그 시점의 밀도·혼잡을 본다', build: 'todo' },
    { id: 'event-zone', name: '행사 구역 설정', desc: '행사·축제 구역을 그려 그 안만 집계한다', build: 'todo' },
    { id: 'threshold', name: '혼잡 임계 경보', desc: '구역별 임계를 넘으면 표시한다', build: 'todo' },
  ],
  change: [
    { id: 'pair-epoch', name: '시점 쌍 정합', desc: '두 시점 영상을 같은 격자에 맞춘다', build: 'done' },
    { id: 'change-class', name: '변화 유형 분류', desc: '신축·소실·식생 증감으로 나눔', build: 'done' },
    { id: 'illegal-check', name: '무허가 대조', desc: '건축물대장과 대조해 무허가 후보를 추림', build: 'todo' },
  ],
  marine: [
    { id: 'debris-type', name: '쓰레기 종류 분류', desc: '스티로폼·어구·플라스틱을 나눠 셈', build: 'done' },
    { id: 'shore-seg', name: '해안선 구간화', desc: '해안선을 따라 구간별로 집계', build: 'wip' },
    { id: 'collect-plan', name: '수거 계획 산출', desc: '물량·접근성으로 수거 우선순위', build: 'todo' },
  ],
};
export const extModules = (key) => EXT_MODULES[key] || [];

/* ══ 2. 분기(대상 사업) ═════════════════════════════════════════════════ */
export const SCOPES = [
  { id: 'local', name: '지자체 사업', short: '지자체',
    desc: '시·군·구와 중앙부처의 법정 조사·단속 업무를 AI 분석으로 대체·보조한다.',
    unitLabel: '행정구역', unitExample: '읍·면·동', crs: 'EPSG:5186 (중부원점)', source: '드론 · 항공 정사영상' },
  { id: 'global', name: '글로벌 사업', short: '글로벌',
    desc: '해외 정부·기관에 같은 분석 체계를 제공한다(ODA · 수출). 화면 구조는 지자체 사업과 같다.',
    unitLabel: '행정단위', unitExample: '주 · 군(district)', crs: 'EPSG:4326 (WGS84)', source: '위성 영상 중심' },
];
export const scopeById = (id) => SCOPES.find((s) => s.id === id) || SCOPES[0];

/** LX 연계 체계 — 두 분기 공통. 카드가 LX 와 이어지는 방식. */
export const LINK = [
  { k: '모델 개발', v: 'AI 모델의 개발·학습은 LX 가 수행한다 (프로젝트)' },
  { k: '품질 책임', v: '분석 결과의 검수·수정·삭제 권한은 LX 가 가진다' },
  { k: '갱신', v: '모델이 오르면 카드 버전이 오르고 배포본에 갱신 이력이 간다' },
  { k: '이식', v: '검증된 카드는 다른 지자체·국가로 배포본을 복제해 심는다' },
  { k: '지원', v: '운영 문의·오류 신고는 서비스 지원으로 모인다' },
];

/* ══ 3. 카드(표준 틀) ══════════════════════════════════════════════════ */
/**
 * id · name(행정 업무명) · scope · duty(행정 근거 업무) · services[](묶은 AI 모델)
 * ext(전용 모듈 키) · status('운영'|'검토'|'준비 중') · version · projectId(만든 LX 프로젝트)
 * portable: 다른 지역으로 이식 가능한가 · needs: 이식에 필요한 것
 */
export const CARDS = [
  { id: 'card-farm', name: '영농관리 행정서비스', scope: 'local', duty: '농지 이용 실태조사 · 농업경영체 등록정보 확인',
    kind: { input: ['ortho'], output: ['polygon'], viz: ['layer', 'chart'] },
    services: ['farmland', 'greenhouse', 'feedcrop', 'silage'], ext: 'farm',
    status: '운영', version: 'v2.1', projectId: 'pj-greenhouse', portable: true,
    needs: ['지적 필지(PNU) 레이어', '영농기·수확기 2시점 정사영상'],
    summary: '드론 정사영상에서 경작·비경작 필지와 비닐하우스를 자동 판독해 농지 이용 실태조사를 대체한다.' },
  { id: 'card-living', name: '생활환경 위험요소 탐지 서비스', scope: 'local', duty: '생활폐기물 · 불법 소각 · 방치폐기물 단속',
    kind: { input: ['ortho', 'video'], output: ['point', 'polygon'], viz: ['layer', 'chart'] },
    services: ['trash', 'incinerator', 'river'], ext: 'living',
    status: '운영', version: 'v1.3', projectId: 'pj-living', portable: true,
    needs: ['시·군 행정경계', '민원 접수 좌표(선택)'],
    summary: '항공·드론 영상에서 방치 폐기물 더미와 불법 소각 흔적을 찾아 현장 점검 대상지를 좁힌다.' },
  { id: 'card-road', name: '도로 안전관리 서비스', scope: 'local', duty: '도로 포장 파손 정기 점검 · 보수 계획',
    kind: { input: ['camera', 'ortho'], output: ['point', 'segment'], viz: ['layer', 'grade', 'chart'] },
    services: ['pothole'], ext: 'road',
    status: '운영', version: 'v2.1', projectId: 'pj-road', portable: true,
    needs: ['도로 노선망 레이어', '차량 카메라 영상(선택)'],
    summary: '차량 카메라와 정사영상을 함께 판독해 포트홀·균열·보수 흔적을 등급화한다.' },
  { id: 'card-crowd', name: '인파관리 서비스', scope: 'local', duty: '다중운집 행사 안전관리',
    kind: { input: ['video'], output: ['point', 'density', 'series'], viz: ['heatmap', 'playback', 'chart'] },
    services: [], ext: 'crowd',
    status: '준비 중', version: null, projectId: null, portable: true,
    needs: ['행사 구역 도면', '드론 비행 계획(반복 항로)', '사람·차량 탐지 모델(개발 전)'],
    gap: '2027년 사업 — 모델 개발 전',
    summary: '드론 영상에서 사람과 차량을 탐지해 구역별 인파 밀도와 교통 혼잡도를 지도에 가시화한다. 시간을 끌면 그 시각의 상태를 본다.' },
  { id: 'card-change', name: '국토 변화 탐지 서비스', scope: 'local', duty: '지적 재조사 · 무허가 건축물 확인',
    kind: { input: ['ortho'], output: ['polygon', 'series'], viz: ['layer', 'chart'] },
    services: ['change', 'building', 'greenbelt'], ext: 'change',
    status: '검토', version: 'v1.0', projectId: 'pj-change', portable: true,
    needs: ['같은 지역 2시점 이상 정사영상', '건축물대장(선택)'],
    summary: '같은 지역 두 시점의 정사영상을 비교해 신축·소실·식생 변화를 자동으로 집계한다.' },
  { id: 'card-marine', name: '해양쓰레기 실태조사 서비스', scope: 'local', duty: '해안 쓰레기 실태조사 · 수거 계획',
    kind: { input: ['ortho', 'video'], output: ['point', 'segment'], viz: ['layer', 'chart'] },
    services: ['marine'], ext: 'marine',
    status: '운영', version: 'v1.2', projectId: 'pj-marine', portable: true,
    needs: ['해안선 레이어', '간조 시각 촬영'],
    summary: '해안선 항공·드론 영상에서 쓰레기 군집을 종류별로 세어 수거 우선순위를 만든다.' },
  { id: 'card-forest', name: '산림·탄소 관리 서비스', scope: 'local', duty: '산림 훼손 점검 · 탄소 흡수량 산정',
    kind: { input: ['satellite', 'ortho'], output: ['polygon', 'density'], viz: ['layer', 'heatmap'] },
    services: ['forest', 'carbon'], ext: null,
    status: '준비 중', version: null, projectId: null, portable: false,
    needs: ['임상도', '수종별 흡수계수'], gap: '학습 데이터 구축 전',
    summary: '산림 훼손지와 식생 밀도를 판독해 탄소 흡수량 산정의 기초 자료를 만든다.' },
  // ── 글로벌 사업: 같은 카드 문법, 맥락만 다르다. 실데이터가 없어 수치를 지어내지 않는다. ──
  { id: 'card-global-farm', name: '농지 이용 실태 분석 (해외)', scope: 'global', duty: 'Agricultural land use survey',
    kind: { input: ['satellite'], output: ['polygon'], viz: ['layer', 'chart'] },
    services: ['farmland', 'greenhouse'], ext: 'farm',
    status: '준비 중', version: null, projectId: 'pj-greenhouse', portable: true,
    needs: ['대상국 행정경계', '위성 영상 조달', '현지 필지 체계'],
    gap: '대상국 미정 — 지자체 카드를 위성 기반으로 옮기는 구조만 준비',
    summary: '지자체 영농관리 체계를 위성 영상 기반으로 옮긴 것. 판독 대상과 결과 표현은 같다.' },
  { id: 'card-global-disaster', name: '재해 피해 판독 (해외)', scope: 'global', duty: 'Post-disaster damage assessment',
    kind: { input: ['satellite'], output: ['polygon', 'series'], viz: ['layer', 'chart'] },
    services: ['building', 'change'], ext: 'change',
    status: '준비 중', version: null, projectId: null, portable: true,
    needs: ['재해 전후 위성 영상', '대상국 건물 레이어'],
    gap: '대상국 미정 — 구조만 준비',
    summary: '재해 전후 위성 영상을 비교해 건물 피해와 지형 변화를 집계한다.' },
];

/* ══ 4. 배포본(이식) ═══════════════════════════════════════════════════ */
/**
 * 카드를 특정 지역에 심은 것. 남원은 연도별로 사업이 이어진다 — 발주자 실제 사업 연혁.
 * year · region · status('운영'|'구축'|'예정') · scale(대상 규모) · note
 * 다른 지자체 이식 = 같은 cardId 로 region 만 바꾼 배포본을 하나 더 만드는 일이다.
 */
export const DEPLOYS = [
  { id: 'dp-nw-living-23', cardId: 'card-living', year: 2023, region: '전북특별자치도 남원시', status: '운영',
    scale: '시 전역 752 km²', note: '첫 사업 — 생활환경 위험요소 판독 체계 수립' },
  { id: 'dp-nw-farm-25', cardId: 'card-farm', year: 2025, region: '전북특별자치도 남원시', status: '운영',
    scale: '농경지 2,098 필지 · 비닐하우스 9,664 동', note: '4시점 정사영상으로 영농 주기 판정' },
  { id: 'dp-nw-road-26', cardId: 'card-road', year: 2026, region: '전북특별자치도 남원시', status: '구축',
    scale: '관내 도로 6개 권역', note: '차량 카메라 + 정사영상 다시점' },
  { id: 'dp-nw-crowd-27', cardId: 'card-crowd', year: 2027, region: '전북특별자치도 남원시', status: '예정',
    scale: '미정', note: '행사 구역 중심 — 모델 개발 전' },
  { id: 'dp-nw-change', cardId: 'card-change', year: 2025, region: '전북특별자치도 남원시 · 국산리', status: '구축',
    scale: '2시점 드론', note: '변화탐지 실증' },
  { id: 'dp-ys-marine', cardId: 'card-marine', year: 2025, region: '전라남도 여수시', status: '운영',
    scale: '해안선 · 항공 + 드론 2시점', note: '남원 밖 첫 이식 사례' },
];

export const cardById = (id) => CARDS.find((c) => c.id === id) || null;
export const cardsOfScope = (scope) => CARDS.filter((c) => c.scope === scope);
export const cardsOfService = (sid) => CARDS.filter((c) => (c.services || []).includes(sid));
export const deploysOfCard = (cardId) => DEPLOYS.filter((d) => d.cardId === cardId);
export const deploysOfRegion = (re) => DEPLOYS.filter((d) => re.test(d.region));
export const regionsOfCard = (cardId) => [...new Set(deploysOfCard(cardId).map((d) => d.region))];

/** 카드가 묶은 모델을 실제 서비스 레코드로 편다. */
export const modelsOfCard = (card) => (card.services || []).map((id) => serviceById(id)).filter(Boolean);

/** 카드 실적 = 묶인 모델들의 실측 합계. 결과가 없으면 null(지어내지 않는다). */
export function cardTotals(card) {
  const ms = modelsOfCard(card).filter((m) => m.real && m.count > 0);
  if (!ms.length) return null;
  return { models: ms.length, items: ms.reduce((a, m) => a + m.count, 0), lastRun: ms.map((m) => m.lastRun).sort().pop() };
}

/** 모듈 구성 — 공통 몇 개 + 전용 몇 개. 카드 상세의 "무엇으로 이루어졌나". */
export function moduleSet(card) {
  const ext = extModules(card.ext);
  return { core: CORE_MODULES, ext, done: ext.filter((m) => m.build === 'done').length, total: ext.length };
}

/** 이식 가능성 — 다른 지자체로 옮길 때 무엇이 필요한가. */
export function portability(card) {
  return { portable: !!card.portable, needs: card.needs || [], deployed: regionsOfCard(card.id),
    extTodo: extModules(card.ext).filter((m) => m.build !== 'done').map((m) => m.name) };
}

/** 분기별 집계 — 목록 머리의 숫자. */
export function scopeSummary(scope) {
  const cs = cardsOfScope(scope);
  return { total: cs.length, live: cs.filter((c) => c.status === '운영').length,
    review: cs.filter((c) => c.status === '검토').length, ready: cs.filter((c) => c.status === '준비 중').length,
    models: new Set(cs.flatMap((c) => c.services || [])).size,
    deploys: DEPLOYS.filter((d) => cs.some((c) => c.id === d.cardId)).length };
}

export const cardNamesOfService = (sid) => cardsOfService(sid).map((c) => c.name);
export const STATUS_TONE = { '운영': 'ok', '검토': 'accent', '준비 중': 'mute', '구축': 'accent', '예정': 'mute' };
export default CARDS;
