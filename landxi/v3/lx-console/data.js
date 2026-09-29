/* data.js — LX 직원 집(생산 콘솔)이 읽는 실데이터 한 곳. 숫자는 전부 게이트웨이 응답에서만 나온다.
   명세 LANDXI-FINAL-SPEC §2.3 '데이터/API' 그대로:
     오늘   GET /survey/findings?priority=A&state=open&limit=1 · GET /feedback?since=30d · GET /deploys?stage=draft · GET /feedback?kind=report
     지도   GET /regions(S-3 · 없으면 키트 K4 가 배포 기록으로 대신) · GET /deploys(해외 · 점 호버)
     ③     GET /registry/cards(S-6 ledger_schema) · GET /registry/models · GET /catalog/layers?region= · GET /survey/rules
   서버가 아직 거르지 않는 조건(since · kind · stage)은 같은 뜻으로 여기서 한 번 더 거른다(계약 준수 어댑터). */
import { api, isEnvelope, bboxOf } from '../kit/util.js';
import { loadRegions } from '../kit/region.js';
import { devlog } from '../kit/dev-drawer.js';
import { summary, total } from './summary.js';
import { say } from './words.js';

export const D = { regions: [], deploys: [], abroad: [], cards: [], models: [], rules: [], layers: [], today: null, failed: [] };

const isTest = (id) => /-test(-\d+)?$/.test(String(id || ''));
const KR = [124.0, 32.5, 132.5, 39.5];
const inKR = (b) => b && b[0] >= KR[0] && b[2] <= KR[2] && b[1] >= KR[1] && b[3] <= KR[3];
const settle = async (label, p) => { try { return await p; } catch (e) { D.failed.push(label); devlog('실패 ' + label, `${e.status || ''} ${e.code || ''}`); return null; } };

/** 봉투 하나 — 목록 응답을 센 수(✓ 기록) */
const counted = (n, asOf, source) => ({ value: n, unit: 'count', basis: 'recorded', as_of: asOf || new Date().toISOString(), source });

export async function load({ force = false } = {}) {
  D.failed = [];
  const [fA, fb30, drafts, reports, deploys, cards, sum] = await Promise.all([
    settle('findings', api('/survey/findings?priority=A&state=open&limit=1')),
    settle('feedback30', api('/feedback?since=30d')),
    settle('drafts', api('/deploys?stage=draft')),
    settle('reports', api('/feedback?kind=report')),
    settle('deploys', api('/deploys')),
    settle('cards', api('/registry/cards')),
    summary({ force }),   // 대표 수치(결과 확인 대기 · 기관 신고) 한 출처
  ]);
  D.summary = sum;
  D.asOf = deploys?.as_of || fA?.as_of || new Date().toISOString();
  D.cards = cards?.items || []; D.cardsAsOf = cards?.as_of || D.asOf;
  D.deploys = (deploys?.items || []).filter((d) => !isTest(d.id) && !d.test);
  D.regions = await loadRegions({ force });
  devlog('regions', `${D.regions.source} · ${D.regions.length}`);
  /* 해외 — 전국 판 밖 배포 지역(지역 키마다 하나) */
  const far = new Map();
  for (const d of D.deploys) { const b = bboxOf(d.aoi); if (b && !inKR(b)) far.set(d.region_profile || d.tenant_id, d); }
  D.abroad = [...far.values()];
  D.today = today({ fA, fb30, drafts, reports, sum });
  return D;
}

/** ③ 조립 자료 — 서랍을 열 때 한 번(지역이 바뀌면 영상만 다시) */
export async function loadAssembly(region) {
  const q = region?.sgg_cd ? '?region=' + encodeURIComponent(region.sgg_cd) : '';
  const detail = region?.sgg_cd && !region.approx && D.regions.source !== 'deploys' ? settle('region', api('/regions/' + encodeURIComponent(region.sgg_cd))) : null;
  const [cards, models, rules, layers, reg] = await Promise.all([
    D.cards.length ? { items: D.cards, as_of: D.cardsAsOf } : settle('cards', api('/registry/cards')),
    D.models.length ? { items: D.models } : settle('models', api('/registry/models')),
    D.rules.length ? { items: D.rules } : settle('rules', api('/survey/rules')),
    settle('layers', api('/catalog/layers' + q)),
    detail,
  ]);
  D.region = reg && reg.sgg_cd === region?.sgg_cd ? reg : null;   // S-3 지역 상세(영상 목록 · 필지 · 대장)
  D.cards = cards?.items || []; D.cardsAsOf = cards?.as_of || D.asOf;
  D.models = models?.items || []; D.rules = rules?.items || []; D.layers = layers?.items || [];
  D.assemblyOk = !!cards && !!models;
  return D;
}

/* ── 지역 ─────────────────────────────────────────── */
const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const inter = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
const union = (bs) => bs.reduce((u, b) => (u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b.slice()), null);
const mid = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const one = (r) => ({ kind: 'sgg', key: r.sgg_cd, sgg_cd: r.sgg_cd, name: r.name, bbox: r.bbox, center: r.center || mid(r.bbox), regs: [r] });

/** 배포본 → 자리. 한 시군구(배포 구역이 그 시군구와 거의 같으면) 또는 시도 묶음(여러 시군구에 걸친 배포본).
    시도 묶음 = 배포 구역과 가장 넓게 겹치는 시도의 시군구들(구역 상자가 이웃 시도로 삐져나온 조각은 뺀다). */
export function placeOf(d) {
  if (!d) return null;
  if (d.sgg_cd) { const r = regionByKey(d.sgg_cd); if (r?.bbox) return one(r); }
  const regs = D.regions.filter((r) => r.bbox && (r.deploys || []).some((x) => x.id === d.id));
  if (!regs.length) return null;
  const box = bboxOf(d.aoi);
  const iou = (r) => { if (!box) return 0; const i = inter(r.bbox, box); return i / (area(r.bbox) + area(box) - i || 1); };
  const best = regs.slice().sort((a, b) => iou(b) - iou(a))[0];
  if (regs.length === 1 || iou(best) >= 0.5 || !regs[0].sido) return one(best);
  const w = new Map();
  for (const r of regs) w.set(r.sido, (w.get(r.sido) || 0) + (box ? inter(r.bbox, box) : area(r.bbox)));
  const sido = [...w].sort((a, b) => b[1] - a[1])[0][0];
  const members = regs.filter((r) => r.sido === sido);
  const bbox = union(members.map((r) => r.bbox));
  return { kind: 'sido', key: 'sido:' + sido, sgg_cd: null, name: d.region_name?.ko || sido,   // 기관 이름과 한 표기(lx-deploy 와 같은 출처)
    bbox, center: mid(bbox), regs: members };
}
/** 배포본 → 지역(비행·URL 용) — 걸친 지역 전부의 상자 */
export const regionOfDeploy = (d) => placeOf(d);
/** 점 → 그 점을 품은 가장 작은 지역 */
export function regionAt(p) {
  if (!p) return null;
  const hit = D.regions.filter((r) => r.bbox && p[0] >= r.bbox[0] && p[0] <= r.bbox[2] && p[1] >= r.bbox[1] && p[1] <= r.bbox[3]);
  return hit.sort((a, b) => area(a.bbox) - area(b.bbox))[0] || null;
}
export const regionByKey = (k) => D.regions.find((r) => r.sgg_cd === k) || null;
const lnglatOf = (x) => x?.lnglat || (x?.geometry?.type === 'Point' ? x.geometry.coordinates : null);

/* ── 오늘 네 칸 ────────────────────────────────────── */
export const REPORT_MIN = 5;   // 한 결과 층에 열린 오탐 신고 5건 이상 = 재학습(명세 §2.3)
const V3 = '/landxi/v3/';
const q = (o) => '?' + Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

function today({ fA, fb30, drafts, reports, sum }) {
  if (!fA && !fb30 && !drafts && !reports && !sum) return { error: true, cells: [] };
  const since = Date.now() - 30 * 864e5;
  /* 검수 대기 — A등급 열린 의심 필지(서버 봉투 그대로) */
  const top = fA?.items?.[0];
  const rTop = regionAt(lnglatOf(top));
  /* 결과 확인 대기 — 수는 대표 수치 한 출처(summary review_pending · 전국 합) · 이동할 곳만 첫 순위 의심 필지 */
  const rv = total(sum, 'review_pending');
  const review = { k: 'review', label: rv?.label || '결과 확인 대기', env: isEnvelope(rv) ? rv : null, region: rTop,
    href: V3 + 'lx-review/' + q({ region: rTop?.sgg_cd, finding: top?.id }) };
  /* 재학습 — 지난 30일 열린 오탐 신고가 한 결과 층에 5건 이상 */
  const bySet = new Map();
  for (const f of fb30?.items || []) {
    if (f.state !== 'open' || !f.set_id || (f.at && Date.parse(f.at) < since)) continue;
    bySet.set(f.set_id, [...(bySet.get(f.set_id) || []), f]);
  }
  const due = [...bySet.values()].filter((l) => l.length >= REPORT_MIN).sort((a, b) => b.length - a.length);
  const rTrain = due[0] && (regionAt(lnglatOf(due[0].find(lnglatOf))) || regionByKey(due[0][0].tenant_id));
  const retrain = { k: 'retrain', label: '재학습', env: fb30 ? counted(due.length, fb30.as_of, '기관 확인 기록') : null, region: rTrain,
    href: V3 + 'lx-train/' + q({ region: rTrain?.sgg_cd }) };
  /* 이식 요청 — 초안 배포본(최근 요청 먼저 · 같은 시각이면 id 순 — 서버 순서에 따라 대상이 바뀌지 않게) */
  const dl = (drafts?.items || []).filter((d) => d.stage === 'draft' && !isTest(d.id))
    .map((d, i) => [d, i]).sort((a, b) => String(b[0].updated_at || '').localeCompare(String(a[0].updated_at || '')) || String(a[0].id || '').localeCompare(String(b[0].id || '')) || a[1] - b[1]).map(([d]) => d);
  const rPort = placeOf(dl[0]);
  const port = { k: 'port', label: '적용 요청', env: drafts ? counted(dl.length, drafts.as_of, '배포 기록') : null, region: rPort, maxZoom: 8.5,
    href: V3 + 'lx-deploy/' + q({ deploy: dl[0]?.id, region: dl[0]?.sgg_cd || rPort?.sgg_cd }), first: dl[0] };
  /* 기관 신고 — 열린 기관 신고(최근 먼저) */
  const open = (reports?.items || []).filter((f) => f.state === 'open').sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const rRep = open[0] && (regionAt(lnglatOf(open[0])) || regionByKey(open[0].tenant_id));
  /* 기관 신고 — 수는 summary reports(전국 합 · lx-deploy 서비스 관리 표 합계와 같은 계산) · 이동할 곳만 최근 열린 신고 */
  const rp = total(sum, 'reports');
  const report = { k: 'report', label: rp?.label || '기관 신고', env: isEnvelope(rp) ? rp : null, region: rRep,
    href: V3 + 'lx-deploy/' + q({ region: rRep?.sgg_cd, tab: 'ops' }) + '#ops' };
  devlog('today', `summary ${sum ? 'ok' : '없음'} · 결과 확인 대기 ${review.env?.value ?? '—'} · 재학습 ${due.map((l) => l[0].set_id + ' ' + l.length).join(', ') || 0} · 적용 요청 ${dl.map((d) => d.id).join(', ') || 0} · 기관 신고 ${report.env?.value ?? '—'}`);
  return { error: false, cells: [review, retrain, port, report] };
}

/* ── 지도 점 ──────────────────────────────────────────
   전국(level 'nat') = 배포본 자리마다 하나(여러 시군구에 걸친 배포본은 시도 1점) · 확대(level 'sgg') = 시군구로 분해. */
export const STAGE_KO = { ga: '운영', canary: '시범', shadow: '시범', draft: '적용 요청' };
const RANK = { ga: 0, canary: 1, shadow: 2, draft: 3 };
export function pins(level = 'nat') {
  const by = new Map();
  for (const d of D.deploys) {
    const b = bboxOf(d.aoi); if (b && !inKR(b)) continue;
    const at = placeOf(d);
    if (!at) continue;
    const spots = level === 'sgg' ? at.regs.map(one) : [at];
    for (const s of spots) {
      const cur = by.get(s.key) || { ...s, deploys: [] };
      cur.deploys.push({ id: d.id, card: d.card_id, stage: d.stage, sgg_cd: d.sgg_cd || null });
      by.set(s.key, cur);
    }
  }
  return [...by.values()].map((p) => {
    const best = p.deploys.slice().sort((a, b) => (RANK[a.stage] ?? 9) - (RANK[b.stage] ?? 9))[0];
    return { ...p, best, rank: RANK[best?.stage] ?? 9, stage: best?.stage === 'shadow' ? 'canary' : best?.stage, draft: p.deploys.some((x) => x.stage === 'draft') };
  }).filter((p) => p.best);
}
export const legend = () => ({ abroad: D.abroad.length });

/* ── 이름(사용자 말) ─────────────────────────────── */
export const cardName = (id) => {
  const c = D.cards.find((x) => x.id === id);
  const d = D.deploys.find((x) => x.card_id === id);
  return say(c?.name || d?.name || '').replace(/\s*\((해외|global)\)/i, '').replace(/\s*(행정서비스|실태조사 서비스|관리 서비스|탐지 서비스|서비스)$/, '').replace(/\s*·\s*이식$/, '') || '서비스';
};
