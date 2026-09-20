// 확장 레지스트리 — 서비스가 계속 늘고, 분기되고, 모듈형으로 타 지자체에 이식되는 상황을 버티는 축.
// (2026-09-20 발주자: "서비스가 계속 늘어나고 분기화 되고 모듈형으로 타 지자체에 줘야 되는 상황이
//  계속 많아질 텐데 확장성 측면에서 고려가 필요하다")
//
// 여기 있는 것은 **규칙**이다 — 카드가 6개든 60개든, 지자체가 1곳이든 50곳이든 같은 규칙으로 돈다.
// 화면은 이 레지스트리를 읽어 그리므로, 카드를 더해도 화면 코드를 고치지 않는다.
//
//   1) 분류 축(AXES)      카드를 찾는 방법 — 분야 · 소관 · 상태 · 대상 사업 · 지역
//   2) 모듈 레지스트리     전용 모듈이 몇 서비스에서 반복되는가 → 공통 승격 후보를 기계가 센다
//   3) 지역 프로파일       이식 = 카드는 그대로, 프로파일만 갈아 끼움
//   4) 호환·갱신          카드 버전이 오르면 배포본에 무엇이 필요한가
//   5) 성장 점검          레지스트리 자체의 건강 검사(중복 id · 고아 모듈 · 미충족 의존성)
import { CARDS, DEPLOYS, CORE_MODULES, EXT_MODULES, SCOPES, cardById, extModules, modelsOfCard } from './cards.js';
import { SERVICES } from './services.js';
import { RESULTS } from './results.js';   // 숫자의 출처 검사에 쓴다(countCheck)

/* ══ 1. 분류 축 — 카드가 늘어날수록 목록이 아니라 '찾기'가 된다 ═══════════ */
/** 업무 분야. 새 카드는 반드시 하나를 고른다(없으면 여기에 추가하고 그 이유를 적는다). */
export const DOMAINS = [
  { id: 'agri', name: '농업·농지', cards: ['card-farm', 'card-global-farm'] },
  { id: 'env', name: '환경·생활', cards: ['card-living', 'card-marine'] },
  { id: 'infra', name: '도로·시설', cards: ['card-road'] },
  { id: 'safety', name: '안전·재난', cards: ['card-crowd', 'card-global-disaster'] },
  { id: 'land', name: '국토·지적', cards: ['card-change'] },
  { id: 'forest', name: '산림·탄소', cards: ['card-forest'] },
];
export const domainOf = (cardId) => DOMAINS.find((d) => d.cards.includes(cardId)) || null;

/** 찾기 축 — 화면의 필터는 이 정의만 읽는다. 축을 더하려면 여기 한 줄. */
export const AXES = [
  { id: 'scope', name: '대상 사업', of: (c) => c.scope, options: () => SCOPES.map((s) => ({ v: s.id, n: s.name })) },
  { id: 'domain', name: '분야', of: (c) => domainOf(c.id)?.id, options: () => DOMAINS.map((d) => ({ v: d.id, n: d.name })) },
  { id: 'status', name: '상태', of: (c) => c.status, options: () => ['운영', '검토', '준비 중'].map((v) => ({ v, n: v })) },
  { id: 'region', name: '배포 지역', of: (c) => DEPLOYS.filter((d) => d.cardId === c.id).map((d) => d.region),
    options: () => [...new Set(DEPLOYS.map((d) => d.region))].map((v) => ({ v, n: v })) },
];

/** 한 줄 검색 + 축 필터. 카드 수와 무관하게 같은 함수. */
export function findCards({ q = '', ...filters } = {}) {
  const needle = q.trim().toLowerCase();
  return CARDS.filter((c) => {
    for (const ax of AXES) {
      const want = filters[ax.id]; if (!want) continue;
      const got = ax.of(c);
      if (Array.isArray(got) ? !got.includes(want) : got !== want) return false;
    }
    if (!needle) return true;
    const hay = [c.name, c.duty, c.summary, domainOf(c.id)?.name, ...(c.services || []).map((s) => s)].join(' ').toLowerCase();
    return hay.includes(needle);
  });
}

/* ══ 2. 모듈 레지스트리 — 전용이 반복되면 공통으로 올린다 ════════════════ */
/**
 * 전용 모듈을 이름(name)으로 모아 몇 개 서비스에서 쓰이는지 센다.
 * **승격 규칙**: 두 서비스 이상에서 같은 요구가 나오면 공통 승격 후보(promote:true).
 * 같은 일을 두 번 만들지 않게 하는 장치다.
 */
export function moduleUsage() {
  const byName = new Map();
  for (const [key, mods] of Object.entries(EXT_MODULES)) {
    for (const m of mods) {
      const k = m.name;
      if (!byName.has(k)) byName.set(k, { name: k, ids: [], services: [], build: m.build });
      const e = byName.get(k); e.ids.push(m.id); e.services.push(key);
      if (m.build === 'done') e.build = 'done';
    }
  }
  return [...byName.values()].map((e) => ({ ...e, uses: e.services.length, promote: e.services.length >= 2 }));
}

/** 개념이 겹치는 전용 모듈(다른 이름, 같은 일) — 사람이 판단하도록 후보만 든다. */
export const PROMOTE_WATCH = [
  { concept: '구간화', where: ['road:road-seg', 'marine:shore-seg'],
    note: '선형 객체(도로·해안선)를 따라 결과를 구간으로 묶는 일 — 두 곳에서 반복. 공통 승격 1순위.' },
  { concept: '대장 대조', where: ['farm:parcel-match', 'change:illegal-check'],
    note: '탐지 결과를 공부(지적·건축물대장)와 맞추는 일 — 데이터원만 다르다.' },
  { concept: '우선순위 산출', where: ['road:repair-plan', 'marine:collect-plan', 'living:patrol-route'],
    note: '결과를 행정 처리 순서로 바꾸는 일 — 세 곳에서 반복. 가중치만 서비스별로.' },
];

/** 전용 모듈 총계 — 성장 속도를 보는 숫자. */
export function moduleStats() {
  const all = Object.values(EXT_MODULES).flat();
  return { core: CORE_MODULES.length, ext: all.length,
    done: all.filter((m) => m.build === 'done').length, wip: all.filter((m) => m.build === 'wip').length,
    todo: all.filter((m) => m.build === 'todo').length,
    promote: moduleUsage().filter((m) => m.promote).length + PROMOTE_WATCH.length };
}

/* ══ 3. 지역 프로파일 — 이식의 단위 ═══════════════════════════════════ */
/**
 * 카드를 다른 지자체에 심을 때 **카드는 손대지 않는다**. 바뀌는 것은 이 프로파일뿐이다.
 * 새 지자체 이식 = 프로파일 한 벌 + 배포본 한 줄.
 */
export const PROFILES = [
  { id: 'namwon', region: '전북특별자치도 남원시', code: '52130', scope: 'local',
    crs: 'EPSG:5186', area: 752, units: 23, unitLabel: '읍·면·동',
    layers: ['지적 필지', '도로 노선망', '행정경계', '건축물대장'],
    imagery: ['드론 정사영상 4시점(2025)', '항공 정사영상(2025-10)'], since: 2023 },
  { id: 'gwangju-jeonnam', region: '광주전남특별시', code: '29', scope: 'local',
    crs: 'EPSG:5186', area: 12345, units: 22, unitLabel: '시·군·구',
    layers: ['해안선', '행정경계'], imagery: ['항공(2025)', '드론(2026)'], since: 2025 },
  { id: 'kuksan', region: '전북특별자치도 남원시 국산리', code: '52130-xx', scope: 'local',
    crs: 'EPSG:5186', area: 3, units: 1, unitLabel: '리',
    layers: ['지적 필지'], imagery: ['드론 2시점(2025)'], since: 2025 },
];
export const profileOf = (region) => PROFILES.find((p) => region.includes(p.region) || p.region.includes(region)) || null;

/**
 * 이식 점검표 — 이 카드를 이 지역에 심을 수 있는가.
 * 화면(이식 마법사)은 이 결과를 그대로 그린다.
 */
export function transplantCheck(cardId, profileId) {
  const card = cardById(cardId), pf = PROFILES.find((p) => p.id === profileId);
  if (!card || !pf) return null;
  const have = new Set(pf.layers), imagery = pf.imagery.join(' ');
  const rows = (card.needs || []).map((need) => {
    const layerHit = [...have].some((l) => need.includes(l) || l.includes(need.replace(/\(.*\)/, '').trim()));
    const imgHit = /영상|정사|위성/.test(need) && imagery.length > 0;
    return { need, ok: layerHit || imgHit, by: layerHit ? '레이어 보유' : imgHit ? '영상 보유' : '확보 필요' };
  });
  const ext = extModules(card.ext);
  return { card, profile: pf, rows,
    ready: rows.every((r) => r.ok) && ext.every((m) => m.build === 'done'),
    blockers: [...rows.filter((r) => !r.ok).map((r) => r.need), ...ext.filter((m) => m.build !== 'done').map((m) => `전용 모듈 · ${m.name}`)],
    scopeMatch: card.scope === pf.scope };
}

/* ══ 4. 호환·갱신 — 카드 버전이 오르면 배포본은 어떻게 되나 ═══════════════ */
export const VERSION_RULE = {
  major: '판독 대상·결과 스키마가 바뀐다 — 배포본은 재분석 필요, 과거 결과와 비교 불가',
  minor: '모델 정확도·전용 모듈이 늘어난다 — 배포본은 다음 주기부터 적용, 과거 결과 유지',
  patch: '오탐 규칙·표현만 고친다 — 배포본에 즉시 반영',
};
/** 배포본이 카드 최신 버전과 같은가. 다르면 무엇을 해야 하는가. */
export function updateState(deploy) {
  const card = cardById(deploy.cardId); if (!card || !card.version) return null;
  const at = deploy.version || card.version;
  const [cM, cm] = card.version.replace('v', '').split('.').map(Number);
  const [dM, dm] = String(at).replace('v', '').split('.').map(Number);
  if (cM > dM) return { level: 'major', need: VERSION_RULE.major, from: at, to: card.version };
  if (cm > dm) return { level: 'minor', need: VERSION_RULE.minor, from: at, to: card.version };
  return { level: 'same', need: null, from: at, to: card.version };
}

/* ══ 4-b. 데이터 공유 — 정사영상은 '주는' 것이 아니라 '닿게' 하는 것 ═══════
 * (2026-09-20 발주자: "데이터(정사영상) 공유도 고민해야 하고")
 * 남원 1시점 원본이 2.1 TB 다. 이식할 때 영상을 복사해 보낼 수 없다.
 * 그래서 자산을 등급으로 나누고, 등급마다 공유 방식을 다르게 한다.
 *   **원본은 LX 가 보관하고 영상 이미지(타일)만 공유한다** — 발주자 2026-09-20.
 *   원본 → LX 보관(위치만 알린다) · 영상 이미지 → 권한으로 닿게 한다 · 결과/라벨/모델 → 사본을 준다.
 * **이식의 실체가 여기 있다**: 새 지자체에 영상은 못 주지만 **학습데이터와 모델은 줄 수 있다**.
 * 그 지자체가 자기 영상만 올리면 같은 서비스가 선다.
 */
export const ASSET_TIERS = [
  { id: 'raw', name: '원본 정사영상', size: 'TB', share: 'none', keep: '**LX 보관**',
    how: '원본(GeoTIFF·ECW)은 LX 가 보관한다. 밖으로 복사·전송하지 않는다 — 목록에 위치·촬영일·GSD만 등록.',
    why: '남원 1시점 2.1 TB. 회선·저장 비용도 문제지만, 원본의 보관 책임과 이력 관리를 LX 가 진다(데이터 주권).' },
  { id: 'tile', name: '영상 이미지(타일)', size: 'GB', share: 'grant', keep: 'LX 플랫폼 타일 서버',
    how: '원본에서 한 번 구운 **영상 이미지만 공유**한다. 권한을 받은 기관이 지도에서 본다(원본 다운로드 아님).',
    why: '발주자 2026-09-20: "원본 영상은 LX가 보관하되 영상 이미지만 공유하는 거지." 행정에 필요한 것은 원본 파일이 아니라 화면에 보이는 영상이다.' },
  { id: 'label', name: '학습데이터(라벨)', size: 'MB', share: 'copy', keep: '플랫폼 · 카드에 묶임',
    how: '이식 시 함께 간다. 다른 지역 영상에 그대로 재사용해 모델을 다시 학습한다.',
    why: '이식의 핵심 자산 — 영상은 못 줘도 판독 기준은 줄 수 있다.' },
  { id: 'model', name: '학습 모델', size: 'MB', share: 'copy', keep: '카드 버전에 묶임',
    how: '카드와 함께 배포된다. 지역 영상으로 미세조정(fine-tune)한다.',
    why: '이식 = 모델 + 라벨을 주고 지역 영상만 새로 받는 것.' },
  { id: 'result', name: '분석 결과(GeoJSON)', size: 'MB', share: 'open', keep: '결과 대장',
    how: '권한 안에서 내려받고 공문에 붙인다. 통계·보고서의 원천.',
    why: '행정이 실제로 쓰는 것. 가볍고 공유에 문제가 없다.' },
];
export const tierById = (id) => ASSET_TIERS.find((t) => t.id === id) || null;

/** 공유 방식 라벨 — 화면에서 배지로 쓴다. */
export const SHARE_LABEL = { none: '공유 불가 · 위치만', grant: '권한 부여', copy: '사본 제공', open: '열람·다운로드' };

/**
 * 이식할 때 무엇이 따라가고 무엇이 남는가.
 * 이식 마법사의 "가져갈 것 / 현지에서 준비할 것" 두 칸이 그대로 이 결과다.
 */
export function transplantAssets(cardId) {
  const card = cardById(cardId); if (!card) return null;
  const goes = ASSET_TIERS.filter((t) => t.share === 'copy');           // 라벨 · 모델
  const stays = ASSET_TIERS.filter((t) => t.share === 'none');          // 원본 영상
  const grant = ASSET_TIERS.filter((t) => t.share === 'grant' || t.share === 'open');
  return {
    goes: goes.map((t) => ({ ...t, of: card.name })),
    localNeed: (card.needs || []).filter((n) => /영상|정사|위성/.test(n)),
    layerNeed: (card.needs || []).filter((n) => !/영상|정사|위성/.test(n)),
    stays, grant,
    line: `${card.name} 이식 — 라벨·모델은 따라가고, 정사영상은 현지에서 확보한다.`,
  };
}

/** 지역이 이미 가진 영상으로 이 카드를 돌릴 수 있는가(프로파일 기준). */
export function imageryReady(cardId, profileId) {
  const t = transplantCheck(cardId, profileId); if (!t) return null;
  const need = t.card.needs.filter((n) => /영상|정사|위성/.test(n));
  const have = t.profile.imagery;
  return { need, have, ok: need.length === 0 || have.length > 0,
    note: have.length ? `보유: ${have.join(' · ')}` : '영상 확보 전 — 촬영 또는 조달 필요' };
}

/* ══ 5. 성장 점검 — 레지스트리가 스스로 건강한가 ═══════════════════════ */
/** 카드·모듈·배포본이 늘어날 때 깨지는 것을 미리 잡는다. 화면(관리자)과 테스트가 함께 쓴다. */
export function healthCheck() {
  const issues = [];
  const ids = CARDS.map((c) => c.id);
  ids.forEach((id, i) => { if (ids.indexOf(id) !== i) issues.push({ kind: '중복 카드 id', at: id }); });
  for (const c of CARDS) {
    if (!domainOf(c.id)) issues.push({ kind: '분야 미분류', at: c.id });
    for (const s of c.services || []) if (!SERVICES.some((x) => x.id === s)) issues.push({ kind: '없는 모델 참조', at: `${c.id} → ${s}` });
    if (c.ext && !EXT_MODULES[c.ext]) issues.push({ kind: '없는 전용 모듈 묶음', at: `${c.id} → ${c.ext}` });
    if (c.status === '운영' && !c.version) issues.push({ kind: '운영인데 버전 없음', at: c.id });
  }
  for (const d of DEPLOYS) {
    if (!cardById(d.cardId)) issues.push({ kind: '없는 카드의 배포본', at: d.id });
    if (!profileOf(d.region)) issues.push({ kind: '지역 프로파일 없음', at: `${d.id} · ${d.region}` });
  }
  for (const key of Object.keys(EXT_MODULES)) if (!CARDS.some((c) => c.ext === key)) issues.push({ kind: '고아 전용 모듈 묶음', at: key });
  /* 숫자의 출처(countCheck)는 여기 섞지 않는다 — 성격이 다르다.
     healthCheck 는 **구조**가 성한가를 본다(없는 참조 · 고아 모듈 · 프로파일 없는 배포본).
     숫자가 맞는가는 **사람이 정해야 하는 일**이라 배포를 막는 대신 드러내 놓는다.
     생산 관리가 countCheck() 를 읽어 보여 준다. */
  return { ok: issues.length === 0, issues };
}

/* ── 숫자의 출처 검사 (2026-09-20) ───────────────────────────────────────
 * `real: true` 라고 적힌 숫자는 **결과 대장에서 따라갈 수 있어야 한다.**
 * 그러지 않으면 화면마다 다른 수가 뜬다 — 실제로 그런 일이 있었다:
 * 2027년 해양쓰레기 포털이 앞 배포본의 38,057건을 제 실적처럼 내걸고 있었고,
 * 같은 서비스의 결과 대장 합은 3,938건이었다.
 *
 * 단위가 다르면 어긋난 것이 아니다 — 비닐하우스는 9,664 **동**이 1,674 **필지**에
 * 걸쳐 있다. 세는 대상이 다르므로 그대로 둔다. 같은 단위인데 다를 때만 잡는다.
 */
export function countCheck() {
  const issues = [];
  for (const s of SERVICES) {
    if (!s.real || !s.count) continue;
    const rs = (s.results || []).map((id) => RESULTS.find((r) => r.id === id)).filter(Boolean);
    if (!rs.length) {
      issues.push({ kind: '실측이라는데 출처가 없음', at: `${s.id} · ${s.count}${s.unit || ''}`,
        why: '결과 대장에 연결된 산출이 없다 — results 를 잇거나 real 을 내려야 한다' });
      continue;
    }
    const sameUnit = rs.every((r) => r.unit === s.unit);
    if (!sameUnit) continue;                       // 단위가 다르면 세는 대상이 다른 것이다
    const sum = rs.reduce((a, r) => a + (r.stats?.count || 0), 0);
    if (Math.abs(sum - s.count) >= 1) {
      issues.push({ kind: '실측과 결과 대장이 다름', at: `${s.id} · ${s.count}${s.unit} ≠ ${sum}${s.unit}`,
        why: `결과 ${rs.map((r) => r.id).join(' + ')} 의 합과 맞지 않는다 — 어느 쪽이 맞는지 정해야 한다` });
    }
  }
  return { ok: !issues.length, issues };
}

/** 한눈 요약 — 관리자 화면 머리에 쓰는 성장 지표. */
export function growth() {
  const m = moduleStats();
  return {
    cards: CARDS.length, domains: DOMAINS.length, scopes: SCOPES.length,
    deploys: DEPLOYS.length, regions: new Set(DEPLOYS.map((d) => d.region)).size, profiles: PROFILES.length,
    models: SERVICES.length, modules: m, promoteWatch: PROMOTE_WATCH.length,
    assets: { tiers: ASSET_TIERS.length, copyable: ASSET_TIERS.filter((t) => t.share === 'copy').length },
    health: healthCheck(),
  };
}

/* ══ 성장 규칙(사람이 지키는 것) ═══════════════════════════════════════
 * R1 새 카드는 분야(DOMAINS) 하나에 반드시 속한다. 맞는 분야가 없으면 분야를 먼저 추가한다.
 * R2 전용 모듈은 그 서비스 안에서만 만든다. 두 서비스 이상에서 같은 요구가 나오면(PROMOTE_WATCH)
 *    공통 승격을 검토한다 — 세 번째가 나오기 전에.
 * R3 이식은 카드를 복사하지 않는다. 지역 프로파일 + 배포본 한 줄을 더한다.
 * R4 카드 버전이 오르면 배포본마다 updateState() 로 무엇이 필요한지 알린다.
 * R5 화면은 이 레지스트리만 읽는다 — 카드가 늘어도 화면 코드를 고치지 않는다.
 * R6 healthCheck() 가 비어 있어야 배포한다(테스트가 강제).
 * R7 원본 정사영상은 **LX 가 보관**하고 밖으로 내보내지 않는다. 공유는 **영상 이미지(타일)** 로 한다.
 *    이식에 따라가는 것은 라벨·모델이고, 영상은 현지에서 확보해 LX 가 받아 보관한다.
 * ═══════════════════════════════════════════════════════════════════ */
