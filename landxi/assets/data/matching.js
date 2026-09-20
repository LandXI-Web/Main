// 매칭 포인트 — 고정된 Geo-AI 산출이 기관 행정 업무 어디에 붙는가 (2026-09-20 발주자 정의)
//
//   "**기본 Geo-AI 서비스는 고정.** 그리고 이걸 **행정 서비스 연계하는 부분에서
//    매칭 포인트를 알려주는** 거고. 이걸 클로드 코드로 디자인해서 **매칭하여 마무리**
//    짓는 데 핵심일 것 같기도 하다."
//
// ── 이 파일이 푸는 문제 ────────────────────────────────────────────────
// 기관마다 요구가 끝없이 다른 이유는 **업무가 다르기 때문**이지 판독이 달라서가 아니다.
// 판독은 고정이다. 달라지는 것은 그 결과를 어느 업무의 어느 단계에 꽂느냐다.
//
//   ┌─ 고정 ─────────────┐   ┌─ 매칭 포인트 ─────┐   ┌─ 가변 ─────────────┐
//   │ Geo-AI 표준 산출    │ → │ 이 산출은 이 업무의 │ → │ 기관 행정 업무 단계 │
//   │ 종류·건수·면적·위치 │   │ 이 단계에 쓰인다   │   │ 대장 대조·우선순위  │
//   │ ·신뢰도·시점·구역   │   │ + 모자란 것은 이것 │   │ ·수거 계획·민원 회신│
//   └────────────────────┘   └──────────────────┘   └────────────────────┘
//                                     ↓
//                          접점 하나 = 화면 선언 한 줄 (views.js)
//                                     ↓
//                          생성기가 찍는다 — 여기서 마무리된다
//
// **접점은 손으로 적지 않는다. 계산해서 알려준다.**
// 산출이 주는 것(gives)과 업무가 필요로 하는 것(wants)을 대조해 후보를 세운다.
// 그래서 새 기관이 와도, 새 카드가 생겨도, 접점 목록이 저절로 나온다.
import { CARDS, DEPLOYS, cardById, needsOf, extModules } from './cards.js';
import { PROFILES, profileOf } from './registry.js';

/* ══ 1. 고정부 — Geo-AI 표준 산출 ══════════════════════════════════
 * 발주자: "기본 Geo-AI 서비스는 고정."
 * 기관 요구에 따라 이 목록을 늘리지 않는다. 늘어나는 것은 매칭과 화면이지 판독이 아니다.
 */
export const GIVES = {
  cls: { name: '종류', what: '무엇인지 분류한다 (포트홀/균열 · 경작/비경작 · 스티로폼/부표)' },
  cnt: { name: '건수', what: '몇 개인지 센다' },
  area: { name: '면적', what: '얼마나 넓은지 잰다' },
  loc: { name: '위치', what: '어디인지 좌표로 찍는다' },
  conf: { name: '신뢰도', what: '얼마나 확실한지 값으로 준다' },
  time: { name: '시점', what: '언제 찍힌 영상인지' },
  zone: { name: '행정구역', what: '어느 읍·면·동인지 붙여 준다' },
  seg: { name: '선형 구간', what: '선 위 어디부터 어디까지인지' },
  dens: { name: '밀도', what: '격자 단위로 얼마나 몰렸는지' },
  ser: { name: '시계열', what: '시각에 따라 어떻게 변했는지' },
};

/** 카드 선언(kind)에서 표준 산출을 뽑는다 — 카드마다 손으로 적지 않는다. */
export function givesOf(cardId) {
  const card = cardById(cardId); if (!card) return [];
  const k = card.kind || {}; const out = new Set(['cls', 'cnt', 'loc', 'conf', 'time', 'zone']);
  (k.output || []).forEach((o) => {
    if (o === 'polygon') out.add('area');
    if (o === 'segment') out.add('seg');
    if (o === 'density') out.add('dens');
    if (o === 'series') out.add('ser');
  });
  return [...out];
}

/* ══ 2. 가변부 — 기관 행정 업무 단계 ═══════════════════════════════
 * LX 가 하지 않는 일들이다(이원화 경계). 기관마다 있는 것과 없는 것이 다르다.
 *   wants  이 업무가 돌아가려면 산출에서 받아야 하는 것
 *   plus   기관이 따로 가진 자료 (LX 가 줄 수 없는 것)
 *   makes  이 업무가 만들어 내는 행정 산출물
 *   viz    그 단계를 화면으로 마무리할 때 쓰는 표현
 */
export const TASKS = [
  { id: 't-ledger', name: '대장 대조', org: '지적·농정', wants: ['loc', 'cls', 'area'], plus: ['필지 대장(PNU)'],
    makes: '대장과 다른 필지 목록', viz: 'table', domain: ['farm', 'change'] },
  { id: 't-subsidy', name: '직불금 대상 검토', org: '농정', wants: ['cls', 'area', 'zone'], plus: ['신청 명부'],
    makes: '검토 대상 명부', viz: 'table', domain: ['farm'] },
  { id: 't-priority', name: '보수 우선순위 산출', org: '건설·도로', wants: ['cls', 'cnt', 'loc', 'seg'], plus: ['교통량', '예산 한도'],
    makes: '보수 순서와 구간', viz: 'table', domain: ['road'] },
  { id: 't-route', name: '노선 구간화', org: '건설·도로', wants: ['loc', 'seg'], plus: ['노선 대장'],
    makes: '구간별 등급', viz: 'map', domain: ['road'] },
  { id: 't-patrol', name: '현장 점검 동선', org: '환경·건설', wants: ['loc', 'cls', 'zone'], plus: ['점검 인력·차량'],
    makes: '점검 순회 경로', viz: 'map', domain: ['living', 'road', 'marine'] },
  { id: 't-civil', name: '민원 연계', org: '민원·환경', wants: ['loc', 'cls', 'time'], plus: ['민원 접수 대장'],
    makes: '민원 회신 근거', viz: 'timeline', domain: ['living', 'change'] },
  { id: 't-collect', name: '수거 계획 산출', org: '해양·환경', wants: ['cls', 'cnt', 'loc', 'area'], plus: ['수거 장비·선박', '처리장 용량'],
    makes: '수거 일정과 물량', viz: 'table', domain: ['marine', 'living'] },
  { id: 't-coast', name: '해안선 구간화', org: '해양', wants: ['loc', 'seg'], plus: ['해안선 관리 구역'],
    makes: '구간별 관리 등급', viz: 'map', domain: ['marine'] },
  { id: 't-illegal', name: '무허가 대조', org: '건축·지적', wants: ['loc', 'cls', 'time', 'area'], plus: ['허가 대장'],
    makes: '무허가 의심 목록', viz: 'table', domain: ['change'] },
  { id: 't-budget', name: '예산 산정', org: '기획·재정', wants: ['cnt', 'area', 'zone'], plus: ['단가표'],
    makes: '소요 예산', viz: 'bar', domain: ['road', 'marine', 'living'] },
  { id: 't-report', name: '정기 보고', org: '공통', wants: ['cnt', 'zone', 'time'], plus: [],
    makes: '공문용 보고서', viz: 'table', domain: ['farm', 'living', 'road', 'marine', 'change', 'crowd'] },
  { id: 't-threshold', name: '혼잡 임계 경보', org: '안전', wants: ['dens', 'ser', 'loc'], plus: ['행사 계획', '통제 기준'],
    makes: '경보 발령 기준', viz: 'line', domain: ['crowd'] },
  { id: 't-eventzone', name: '행사 구역 설정', org: '안전·문화', wants: ['loc', 'dens'], plus: ['행사 개최 계획'],
    makes: '구역별 통제 계획', viz: 'map', domain: ['crowd'] },
];

export const taskById = (id) => TASKS.find((t) => t.id === id) || null;

/* ══ 3. 매칭 — 계산해서 알려준다 ═══════════════════════════════════ */

/**
 * 이 배포본에서 가능한 접점들. **손으로 적은 목록이 아니라 대조 결과다.**
 *   full  산출만으로 업무가 돈다
 *   plus  기관 자료를 더하면 돈다  ← 대부분 여기다
 *   gap   산출이 모자라 아직 안 된다 (카드를 키우거나 다른 카드를 붙여야 한다)
 */
export function matchPoints(deployId) {
  const d = DEPLOYS.find((x) => x.id === deployId); if (!d) return [];
  const card = cardById(d.cardId); if (!card) return [];
  const gives = givesOf(card.id);
  const ext = extModules(card.ext);
  const localNames = ext.filter((m) => m.owner === 'local').map((m) => m.name);

  return TASKS
    .filter((t) => (t.domain || []).includes(card.ext) || t.id === 't-report')
    .map((t) => {
      const miss = t.wants.filter((w) => !gives.includes(w));
      const level = miss.length ? 'gap' : t.plus.length ? 'plus' : 'full';
      // 이 업무를 맡을 전용 모듈이 이미 카드에 있나 (LX 가 아니라 기관 몫인 것)
      const mod = localNames.find((n) => t.name.includes(n.slice(0, 2)) || n.includes(t.name.slice(0, 2)));
      return {
        id: `${deployId}::${t.id}`, deployId, cardId: card.id, taskId: t.id,
        task: t.name, org: t.org, makes: t.makes, viz: t.viz,
        uses: t.wants.filter((w) => gives.includes(w)).map((w) => GIVES[w].name),
        needs: t.plus, missing: miss.map((w) => GIVES[w].name),
        level, module: mod || null,
        why: level === 'full' ? '판독 결과만으로 이 업무가 끝난다'
          : level === 'plus' ? `기관 자료 ${t.plus.length}종을 붙이면 끝난다 — LX 가 줄 수 없는 것들이다`
            : `판독이 ${miss.map((w) => GIVES[w].name).join('·')}를 주지 않는다 — 카드를 키우거나 다른 카드를 붙여야 한다`,
      };
    })
    .sort((a, b) => ({ full: 0, plus: 1, gap: 2 }[a.level] - { full: 0, plus: 1, gap: 2 }[b.level]));
}

/** 접점 하나를 화면 선언으로. **여기가 '매칭하여 마무리'의 실체다.** */
export function viewFromMatch(m) {
  const byViz = { table: { by: 'emd', measure: 'count' }, bar: { by: 'class', measure: 'count' },
    map: { by: 'class', measure: 'count' }, line: { by: 'time', measure: 'count' },
    timeline: { by: 'time', measure: 'count' } };
  const a = byViz[m.viz] || byViz.table;
  return {
    id: `v-${m.taskId}`, tab: m.viz === 'map' ? 'map' : m.viz === 'timeline' ? 'result' : 'stats',
    title: `${m.task} — ${m.makes}`,
    src: m.viz === 'timeline' ? 'run' : 'result', by: a.by, measure: a.measure, viz: m.viz,
    from: `${m.org} · 매칭 포인트에서 생성`,
    needs: m.needs, note: m.why,
  };
}

/** 기관 하나가 이 서비스로 끝낼 수 있는 업무가 몇 개인가 — 도입 설득의 숫자. */
export function coverage(deployId) {
  const ms = matchPoints(deployId);
  return {
    deployId, total: ms.length,
    full: ms.filter((m) => m.level === 'full').length,
    plus: ms.filter((m) => m.level === 'plus').length,
    gap: ms.filter((m) => m.level === 'gap').length,
    orgs: [...new Set(ms.map((m) => m.org))],
    line: `판독 하나로 행정 업무 ${ms.filter((m) => m.level !== 'gap').length}건이 닿는다`,
  };
}

/**
 * 기관 전체 그림 — 이 기관이 가진 카드들이 어느 부서 업무에 닿나.
 * 부서를 가로로 놓으면 "우리 과에 쓸모가 있나"가 한눈에 보인다.
 */
export function orgMatrix(tenantProfileId) {
  const pf = PROFILES.find((p) => p.id === tenantProfileId); if (!pf) return null;
  const ds = DEPLOYS.filter((d) => d.region.includes(pf.region) || pf.region.includes(d.region));
  const orgs = [...new Set(TASKS.map((t) => t.org))];
  const rows = ds.map((d) => {
    const ms = matchPoints(d.id);
    return { deploy: d, card: cardById(d.cardId),
      cells: orgs.map((o) => ms.filter((m) => m.org === o && m.level !== 'gap').length) };
  });
  return { region: pf.region, orgs, rows,
    total: rows.reduce((a, r) => a + r.cells.reduce((x, y) => x + y, 0), 0) };
}

/* ══ 4. 마무리 — 접점을 화면으로 닫는다 ════════════════════════════ */

/**
 * 이 배포본을 '마무리'하려면 무엇을 찍어야 하나.
 * 접점마다 화면 선언 하나 → 생성기가 찍는다 → 그 업무가 화면에서 끝난다.
 */
export function finishPlan(deployId) {
  const ms = matchPoints(deployId);
  const doable = ms.filter((m) => m.level !== 'gap');
  const views = doable.map(viewFromMatch);
  const buy = [...new Set(doable.flatMap((m) => m.needs))];
  return {
    deployId, matches: ms.length, screens: views.length, views,
    procure: buy,
    blocked: ms.filter((m) => m.level === 'gap').map((m) => ({ task: m.task, why: m.why })),
    line: `화면 ${views.length}장은 LX 가 찍는다 · 밖에서 받을 것은 기관 자료 ${buy.length}종뿐이다`,
  };
}

/** 전체 요약 — 이 구조가 감당하는 크기. */
export function matchSummary() {
  const rows = DEPLOYS.map((d) => ({ d, c: coverage(d.id) }));
  const all = DEPLOYS.flatMap((d) => matchPoints(d.id));
  return {
    배포본: rows.length,
    접점: all.length,
    바로닿는것: all.filter((m) => m.level === 'full').length,
    기관자료_필요: all.filter((m) => m.level === 'plus').length,
    아직_못닿음: all.filter((m) => m.level === 'gap').length,
    부서: [...new Set(all.map((m) => m.org))].length,
    고정_산출: Object.keys(GIVES).length,
    행정_업무: TASKS.length,
    line: '판독은 고정이고 접점이 는다 — 새 기관이 와도 접점 목록은 계산으로 나온다',
  };
}
