/* ops-core 데이터 한 곳 — 게이트웨이(:8700) 실응답만. 결재·할 일·지도 점의 파생 규칙은 여기서만 정한다(같은 지표 = 같은 값).
   서버 S-9(`GET /approvals?state=pending` · `power_budget` · Origin 4173 SSE)가 있으면 그것을 쓰고,
   아직 없으면 같은 모양으로 접는 어댑터(배포 기록 → 결재 대기)로 대신한다. 어느 쪽인지는 ?dev=1 서랍에만 남긴다. */
import { api, hasRoute, bboxOf, isEnvelope } from '../../kit/util.js';
import { devlog } from '../../kit/dev-drawer.js';

export const D = { deploys: [], tenants: [], usage: [], alerts: null, gpus: null, cards: [], srvApprovals: null, at: 0, mode: 'adapter', ok: false };
const safe = (p) => api(p).catch((e) => { devlog('api fail', `${p} · ${e.code || e.status || e.message}`); return null; });

let S9 = null;
/** 서버 S-9 가 들어왔는가(approvals 읽기 경로 유무로 판정 · 404 로 콘솔을 더럽히지 않게 openapi 로 확인) */
export async function hasS9() { if (S9 === null) S9 = await hasRoute('/approvals'); return S9; }

export async function loadAll() {
  const s9 = await hasS9();
  const [d, t, u, a, g, c, ap] = await Promise.all([
    safe('/deploys'), safe('/tenants'), safe('/ops/tenants'), safe('/ops/alerts'), safe('/ops/gpus'), safe('/registry/cards'),
    s9 ? safe('/approvals?state=pending') : Promise.resolve(null),
  ]);
  if (d) D.deploys = d.items || [];
  if (t) D.tenants = t.items || [];
  if (u) D.usage = u.items || [];
  if (a) D.alerts = a;
  if (g) D.gpus = g;
  if (c) D.cards = c.items || [];
  D.srvApprovals = ap ? (ap.items || []) : null;
  D.mode = ap ? 'server' : 'adapter';
  if (d || ap) D.ok = true;          // 결재 대기의 출처(배포 기록 또는 결재 표)가 한 번이라도 왔는가
  D.at = Date.now();
  devlog('결재 출처', D.mode === 'server' ? 'GET /approvals?state=pending' : '어댑터: /deploys 파생(S-9 전)');
  return D;
}
export async function loadFast() {
  const [d, g] = await Promise.all([safe('/deploys'), safe('/ops/gpus')]);
  if (d) D.deploys = d.items || [];
  if (g) D.gpus = g;
  if (D.mode === 'server') { const ap = await safe('/approvals?state=pending'); if (ap) D.srvApprovals = ap.items || []; }
  D.at = Date.now();
}

/* ── 이름(사용자 말) ─────────────────────── */
const PROV = /^.*?(특별자치도|특별자치시|광역시|[가-힣]+도)\s+/;
export function tenantName(id) {
  const t = D.tenants.find((x) => x.id === id);
  return (t?.name?.ko || '').replace(PROV, '').replace(/\s*\(.*\)$/, '') || '기관';
}
export const regionName = (d) => {
  const ko = String(d.region_name?.ko || '').replace(PROV, '');
  const p = ko.trim().split(/\s+/);          // 시도 이름이 규칙 밖(통합특별시 등)이어도 시군구만 — '여수시'
  return d.sgg_cd && p.length > 1 ? p.slice(1).join(' ') : ko;
};
export const cardName = (id) => (D.cards.find((c) => c.id === id)?.name || '').replace(/\s*\(해외\)$/, '').replace(/ 행정서비스$| 서비스$/, '').replace(/판독/g, 'AI 분석') || '서비스';
/** 배포 주체: 기관 배포 = 기관 이름 · LX 자체 배포 = 지역 이름 */
export const whoOf = (d) => (d.tenant_id === 'lx' ? regionName(d) : tenantName(d.tenant_id));

/* ── 배포본: 시험 잔여(-test-n)·영업 계량 기관은 관제 판단에서 뺀다(서버 S-9 시드 정리 전 임시) ── */
export const canon = () => D.deploys.filter((d) => d.tenant_id !== 'lx-demo' && !/-test(-\d+)?$/.test(d.id));

const decidedSince = (d, since) => (d.approvals || []).some((a) => new Date(a.at).getTime() >= new Date(since || 0).getTime() - 1000);

export const KIND = { deploy: '배포 승인', rule: '규칙 임계', quota: '쿼터 변경', port: '다른 지역 적용' };
const STAGE_KO = { draft: '초안', shadow: '검증', canary: '시범', ga: '운영', rolled_back: '롤백' };

/** 결재 대기 — 큰 숫자 · 레일 · 결재 표가 모두 이 목록 하나를 센다.
    항목: { key, kind, kindKo, target, requester, at, deploy?, ref, changes:[[이름, 전, 후]] } */
export function pending() {
  if (D.mode === 'server' && D.srvApprovals) return D.srvApprovals.map(fromServer).filter(Boolean).sort(byAt);
  const out = [];
  for (const d of canon()) {
    if (d.stage === 'canary' && !decidedSince(d, d.updated_at)) {
      out.push({ key: 'deploy:' + d.id, kind: 'deploy', kindKo: KIND.deploy, target: `${whoOf(d)} ${cardName(d.card_id)}`, requester: '—', at: d.updated_at, deploy: d, ref: d.id,
        changes: [['단계', STAGE_KO.canary, STAGE_KO.ga], ['버전', '', d.version || '']] });
    } else if (d.stage === 'draft' && d.from_deploy_id && !decidedSince(d, d.created_at)) {
      const src = D.deploys.find((x) => x.id === d.from_deploy_id);
      out.push({ key: 'port:' + d.id, kind: 'port', kindKo: KIND.port, target: `${whoOf(d)} ${cardName(d.card_id)}`, requester: '—', at: d.created_at, deploy: d, ref: d.id,
        changes: [['지역', src ? regionName(src) : '', regionName(d)], ['서비스', '', cardName(d.card_id)], ['단계', '', STAGE_KO.shadow]] });
    }
  }
  return out.sort(byAt);
}
const byAt = (a, b) => String(b.at || '').localeCompare(String(a.at || ''));

/* 서버 approvals 행(S-9 · GET /approvals) → 같은 항목. 모양: {id, kind: deploy|deploy_ga|rule|quota, subject{type,id}, title, requested_by, at, payload}
   deploy + payload.action 'port' = 이식 · deploy_ga(카나리 ga 대기) · deploy(그 밖) = 배포 승인 · rule = 규칙 임계 · quota = 쿼터 변경 */
const QDIM = { storage_gb: '저장', gpu_s_month: 'GPU 시간', area_km2_month: '분석 면적', concurrent_jobs: '동시 작업', egress_gb_month: '내보내기', vworld_calls_day: '지도 호출', llm_tokens_month: 'AI 도우미 사용량' };
const val = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
const fmtN = (v) => (v == null || v === '' ? '' : typeof val(v) === 'number' ? Number(val(v)).toLocaleString('ko-KR') : String(val(v)));
/** 요청자 = 사람 말로(사용자 id 는 화면에 내지 않는다) */
function requesterOf(r, kind, sid) {
  const u = String(r.requested_by || '');
  if (!u) return '—';
  if (/^u_lx_admin/.test(u)) return 'LX 관리자';
  if (/^u_lx_staff/.test(u)) return 'LX 직원';
  if (/^u_lx_sales/.test(u)) return 'LX 영업';
  if (kind === 'quota') return tenantName(sid);
  return '—';
}
function fromServer(r) {
  if ((r.state || 'pending') !== 'pending') return null;
  const act = r.payload?.action;
  const kind = r.kind === 'deploy' ? (act === 'port' ? 'port' : 'deploy') : r.kind === 'deploy_ga' ? 'deploy' : r.kind === 'rule' ? 'rule' : r.kind === 'quota' ? 'quota' : null;
  if (!kind) return null;
  const sid = r.subject?.id || r.subject_id;
  const d = kind === 'deploy' || kind === 'port' ? D.deploys.find((x) => x.id === sid) : null;
  if (d && (d.tenant_id === 'lx-demo' || /-test(-\d+)?$/.test(d.id))) return null;
  let target, changes = [];
  if (d) target = kind === 'port' && d.sgg_cd && d.tenant_id !== 'lx' ? `${tenantName(d.tenant_id)} ${regionName(d)} ${cardName(d.card_id)}` : `${whoOf(d)} ${cardName(d.card_id)}`;
  else if (kind === 'quota') target = tenantName(sid);
  else target = String(r.title || '').replace(PROV, '').replace(/\s*\(해외\)$/, '') || '—';
  if (kind === 'port') {
    const src = D.deploys.find((x) => x.id === (r.payload?.from_deploy_id || d?.from_deploy_id));
    changes = [['지역', src ? regionName(src) : '', d ? regionName(d) : ''], ['서비스', '', d ? cardName(d.card_id) : ''], ['단계', STAGE_KO.draft, STAGE_KO.shadow]];
  } else if (kind === 'deploy') {
    changes = [['단계', STAGE_KO[d?.stage] || STAGE_KO.canary, STAGE_KO.ga], ['버전', '', d?.version || '']];
  } else if (kind === 'rule') {
    target = String(r.payload?.name || target);
    changes = Object.entries(r.payload?.thresholds || {}).slice(0, 4).map(([k, v]) => ['임계', '', `${k} ${fmtN(v)}`]);
  } else if (kind === 'quota') {
    const pl = r.payload || {}, cur = D.usage.find((u) => u.tenant_id === sid)?.dims?.[pl.dim] || {};
    changes = [['항목', '', QDIM[pl.dim] || '한도']];
    if (pl.soft != null) changes.push(['소프트', fmtN(cur.soft), fmtN(pl.soft)]);
    if (pl.hard != null) changes.push(['하드', fmtN(cur.hard), fmtN(pl.hard)]);
  }
  changes = changes.filter(([, , b]) => b);
  return { key: kind + ':' + (r.id || sid), id: r.id, kind, kindKo: KIND[kind], target, requester: requesterOf(r, kind, sid), at: r.at, deploy: d, ref: sid, raw: r, changes };
}

/* ── 할 일(카드) ─────────────────────────── */
const DIM = { storage_gb: '저장', gpu_s_month: 'GPU 시간', area_km2_month: '분석 면적', llm_tokens_month: 'AI 도우미 사용량' };
/** 조치할 경보만(닫힌 것 · 언어 모델 상주로 차는 VRAM 경보 제외) */
export const openAlerts = () => (D.alerts?.items || []).filter((a) => !a.closed_at && !/^vram_/.test(a.rule));
export function power() {
  const pb = D.gpus?.power_budget;
  if (pb && pb.max_hot != null) return { hot: +pb.hot_now || 0, max: +pb.max_hot, ok: pb.ok !== false };
  const g = D.gpus?.gpus || [];
  const hot = g.filter((x) => (x.util_ma5?.value ?? 0) >= 50).length;
  return { hot, max: 1, ok: hot <= 1 };           // 전력 규칙: 동시 고부하 ≤ 1장
}
export function nearLimits() {
  const out = [];
  for (const u of D.usage) {
    if (u.tenant_id === 'lx-demo') continue;
    for (const [dim, v] of Object.entries(u.dims || {})) {
      const used = v.used?.value;
      if (!DIM[dim] || used == null || !v.soft) continue;
      if (used >= v.soft) out.push({ tenant: u.tenant_id, name: tenantName(u.tenant_id), dim: DIM[dim], over: v.hard && used >= v.hard });
    }
  }
  return out;
}

/* ── 지도 점(기관 × 지역 하나) ──────────────── */
/** 단계 = 잉크 농도(§2.12 단계와 같은 말): ga 운영 · canary 시범 · shadow 검증 · 결재 전 이식 = 이식 요청(속 빈 고리) */
export function points() {
  const pend = new Set(pending().filter((p) => p.kind === 'port').map((p) => p.ref));
  const by = new Map();
  for (const d of canon()) {
    const k = d.tenant_id + '|' + d.region_profile;
    const b = bboxOf(d.aoi);
    if (!b) continue;
    const cur = by.get(k) || { key: k, name: whoOf(d), bbox: b, deploys: [], stage: null, port: false };
    cur.bbox = [Math.min(cur.bbox[0], b[0]), Math.min(cur.bbox[1], b[1]), Math.max(cur.bbox[2], b[2]), Math.max(cur.bbox[3], b[3])];
    cur.deploys.push(d);
    if (pend.has(d.id)) cur.port = true;
    by.set(k, cur);
  }
  const rank = { ga: 3, canary: 2, shadow: 1 };
  const out = [];
  for (const p of by.values()) {
    const best = p.deploys.filter((d) => rank[d.stage]).sort((a, b) => rank[b.stage] - rank[a.stage])[0];
    p.stage = best ? ({ ga: 'ga', canary: 'pilot', shadow: 'verify' })[best.stage] : p.port ? 'port' : null;
    if (!p.stage) continue;
    p.lead = best || p.deploys.find((d) => pend.has(d.id));
    p.lnglat = [(p.bbox[0] + p.bbox[2]) / 2, (p.bbox[1] + p.bbox[3]) / 2];
    p.abroad = !(p.lnglat[0] >= 124 && p.lnglat[0] <= 132.5 && p.lnglat[1] >= 32.5 && p.lnglat[1] <= 39.5);
    out.push(p);
  }
  return out;
}

/** 큰 숫자 봉투(결재 대기) — 출처는 호버에서 '배포 기록'으로 읽힌다 */
export function pendingEnv(list = pending()) {
  return { value: list.length, unit: 'count', basis: 'recorded', as_of: new Date(D.at || Date.now()).toISOString(), source: D.mode === 'server' ? 'approvals · deploys' : 'deploys approvals' };
}

/* ── 결정(쓰기) — 서버 계약 그대로 ─────────── */
export async function decide(item, decision, reason) {
  const r = reason || (decision === 'approve' ? '승인' : '');
  const step = async () => {        // 승인 뒤 단계: 배포 승인 = 운영. 다른 지역 적용(port)은 서버 한 흐름이 영상 확인 뒤 검증 단계로 올린다(화면은 올리지 않는다)
    if (decision !== 'approve' || item.kind !== 'deploy') return;
    const to = item.kind === 'deploy' ? 'ga' : 'shadow';
    try { await api(`/deploys/${item.ref}/rollout`, { method: 'POST', body: { stage: to } }); } catch (e) { devlog('rollout', `${item.ref} → ${to} · ${e.code}`); }
  };
  if (D.mode === 'server' && item.id) {   // S-9: 결재 한 줄로 결정(효과·이벤트는 서버)
    const res = await api(`/approvals/${encodeURIComponent(item.id)}/decide`, { method: 'POST', body: { decision, reason: r } });
    await step();
    return res;
  }
  if (item.kind === 'deploy' || item.kind === 'port') {
    const res = await api(`/deploys/${item.ref}/approve`, { method: 'POST', body: { decision, reason: r } });
    await step();
    return res;
  }
  if (item.kind === 'rule' && decision === 'approve') return api(`/survey/rules/${item.ref}/activate`, { method: 'POST', body: { reason: r } });
  throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
}
export { isEnvelope };
