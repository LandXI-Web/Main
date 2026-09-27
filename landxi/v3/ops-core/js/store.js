/* 데이터 한 곳 — 게이트웨이(:8700) 실응답만. 파생 규칙(결재·경보·기관)은 여기서만 정한다(같은 지표 = 같은 값). */
import { api } from '/landxi/shared/api-v1.js';

export const S = {
  tenants: [], deploys: [], cards: [], usage: [], storage: null, alerts: null, queues: null, models: [], llm: [], gpus: null,
  gpuHist: new Map(), at: { gpus: 0, all: 0 }, err: null,
};

export const STAGE = {
  draft: { ko: '준비', c: 'rgba(255,255,255,.72)', order: 0 },
  shadow: { ko: '검증', c: '#8F99A8', order: 1 },
  canary: { ko: '시범', c: '#4E9BFF', order: 2 },
  ga: { ko: '운영', c: '#2BD9CF', order: 3 },
  rolled_back: { ko: '롤백', c: '#FFB633', order: 2 },
};
export const NEXT = { draft: 'shadow', shadow: 'canary', canary: 'ga' };

const safe = (p) => api(p).catch((e) => { S.err = e; return null; });

export async function loadAll() {
  const [t, d, c, u, st, al, q, m, lm] = await Promise.all([
    safe('/tenants'), safe('/deploys'), safe('/registry/cards'), safe('/ops/tenants'), safe('/ops/storage'),
    safe('/ops/alerts'), safe('/ops/queues'), safe('/ops/models'), safe('/agent/models'),
  ]);
  if (t) S.tenants = t.items; if (d) S.deploys = d.items; if (c) S.cards = c.items; if (u) S.usage = u.items;
  if (st) S.storage = st; if (al) S.alerts = al; if (q) S.queues = q; if (m) S.models = m.items; if (lm) S.llm = lm.items || [];
  S.at.all = Date.now();
}
export async function loadGpus() {
  const g = await safe('/ops/gpus');
  if (!g) return false;
  S.gpus = g; S.at.gpus = Date.now();
  for (const x of g.gpus) {
    const h = S.gpuHist.get(x.index) || [];
    if (!h.length && x.util_ma5?.samples) for (const s of x.util_ma5.samples) h.push(s.v);
    h.push(x.util_ma5?.value ?? x.util_pct?.value ?? 0);
    while (h.length > 90) h.shift();
    S.gpuHist.set(x.index, h);
  }
  return true;
}
export const loadDeploys = async () => { const d = await safe('/deploys'); if (d) S.deploys = d.items; };
export const loadUsage = async () => { const u = await safe('/ops/tenants'); if (u) S.usage = u.items; };

/* ── 이름 ─────────────────────────────── */
export function tenantName(id) {
  const t = S.tenants.find((x) => x.id === id);
  if (id === 'lx') return 'LX';
  if (id === 'lx-demo') return 'LX 영업';
  const ko = t?.name?.ko || id;
  return ko.replace(/^.*?(특별자치도|특별자치시|광역시)\s+/, '');
}
export const shortName = (id) => tenantName(id).replace(/\s*\(.*\)$/, '');
/** 사람이 읽는 배포 주체: 기관 이름 · LX 자체 배포는 지역 이름 */
export const who = (d) => (d.tenant_id === 'lx' ? regionShort(d) : tenantName(d.tenant_id));
export function regionShort(d) {
  const ko = d.region_name?.ko || d.region_profile || '';
  return ko.replace(/^.*?(특별자치도|특별자치시|광역시|[가-힣]+도)\s+/, '');
}
export const cardName = (id) => (S.cards.find((c) => c.id === id)?.name || id).replace(/ 서비스$| 행정서비스$/, '');
export const verOf = (d) => d.version || (d.card_version_id ? 'v' + d.card_version_id.split('@')[1] : '');

/* ── 배포본 정리: 같은 기관 × 같은 카드는 한 칸(시험 잔여 복제는 접는다) ── */
export function canonDeploys() {
  const by = new Map();
  for (const d of S.deploys) {
    if (d.tenant_id === 'lx-demo') continue;
    const k = d.id.replace(/-test(-\d+)?$/, '');          // 시험 잔여 복제(-test-n)만 한 칸으로 접는다
    const cur = by.get(k);
    const score = (x) => (/-test/.test(x.id) ? 1 : 0) * 1e3 + x.id.length;
    if (!cur) by.set(k, { ...d, dup: 1 });
    else { const keep = score(d) < score(cur) ? d : cur; by.set(k, { ...keep, dup: cur.dup + 1 }); }
  }
  return [...by.values()];
}

/* 마지막 단계 변경 뒤의 결정만 센다(서버 규칙: 롤백·이식 뒤 승인만 유효 — 그 근사) */
export function decisionSince(d) {
  const since = new Date(d.updated_at || 0).getTime();
  const after = (d.approvals || []).filter((a) => new Date(a.at).getTime() >= since - 1000);
  return after.length ? after[after.length - 1] : null;
}

/* ── 결재함(하나) ─────────────────────── */
/** 결재 = 사람의 결정이 필요한 것(배포 승격 · 한도). 배지 · 큰 숫자 · 결재함이 모두 이 목록 하나를 센다. */
export function inbox() {
  const out = [];
  for (const d of canonDeploys()) {
    if (d.stage === 'canary' && !decisionSince(d)) out.push({ key: 'p:' + d.id, type: 'promote', tk: '배포 승격', d, title: `${who(d)} · ${cardName(d.card_id)}`, sub: `${verOf(d)} 시범 → 운영`, at: d.updated_at });
  }
  for (const u of S.usage) {
    for (const [dim, v] of Object.entries(u.dims || {})) {
      const used = v.used?.value; if (used == null || !v.soft || !DIM[dim]) continue;
      if (used >= v.soft) out.push({ key: 'q:' + u.tenant_id + dim, type: 'quota', tk: '한도', tid: u.tenant_id, title: `${tenantName(u.tenant_id)} · ${DIM[dim].ko}`, sub: `${Math.round((used / (v.hard || v.soft)) * 100)}% 사용`, at: v.used.as_of });
    }
  }
  const rank = { promote: 0, quota: 1 };
  return out.sort((a, b) => rank[a.type] - rank[b.type] || String(b.at).localeCompare(String(a.at)));
}
/** 진행 대기 = 결정은 끝났고 단계를 옮기기만 하면 되는 것(결재 수에 넣지 않는다) */
export function queue() {
  const out = [];
  for (const d of canonDeploys()) {
    const dec = d.stage === 'canary' ? decisionSince(d) : null;
    if (dec?.decision === 'approve') out.push({ key: 'g:' + d.id, type: 'progress', tk: '운영 전환', d, title: `${who(d)} · ${cardName(d.card_id)}`, sub: `${verOf(d)} 승인됨 → 운영`, at: dec.at });
    else if ((d.stage === 'draft' || d.stage === 'shadow') && d.card_version_id) out.push({ key: 's:' + d.id, type: 'progress', tk: '배포 진행', d, title: `${who(d)} · ${cardName(d.card_id)}`, sub: `${verOf(d)} ${STAGE[d.stage].ko} → ${STAGE[NEXT[d.stage]].ko}`, at: d.updated_at });
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
export function decided(n = 5) {
  const rows = [];
  for (const d of canonDeploys()) {
    const aps = (d.approvals || []).slice(-1);
    for (const a of aps) rows.push({ d, a });
  }
  return rows.sort((x, y) => String(y.a.at).localeCompare(String(x.a.at))).slice(0, n);
}

/* ── 기관 한도 차원(관리자가 보는 셋) ───── */
export const DIM = {
  gpu_s_month: { ko: 'GPU 시간', unit: 'h', k: 1 / 3600 },
  storage_gb: { ko: '저장', unit: 'GB', k: 1 },
  area_km2_month: { ko: '분석 면적', unit: 'km²', k: 1 },
};

/* ── 경보: 조치할 일에만 ───────────────── */
export function alerts() {
  const out = [];
  for (const a of S.alerts?.items || []) {
    if (a.closed_at) continue;
    const g = a.gpu != null ? `GPU ${a.gpu}` : '';
    const ko = { gpu_temp_gt_85_5m: `${g} 온도 높음`, worker_down: '워커 응답 없음', job_failed_burst: '작업 실패 반복' }[a.rule];
    if (a.rule.startsWith('vram_')) continue;          // 언어 모델 상주로 차는 VRAM 은 정상 — 끈다
    out.push({ key: a.id, title: ko || a.rule, level: a.level });
  }
  for (const v of S.storage?.volumes || []) {
    const pct = v.used_gb.value / v.total_gb.value;
    if (pct >= 0.9) out.push({ key: 'disk:' + v.mount, title: `${v.mount.replace(':', '')} 드라이브 ${Math.round(pct * 100)}% 사용`, level: 'warn', disk: v });
  }
  return out;
}
export function worstDisk() {
  let w = null;
  for (const v of S.storage?.volumes || []) { const f = v.free_gb.value / v.total_gb.value; if (!w || f < w.f) w = { f, v }; }
  return w;
}
export const heavy = () => (S.gpus?.gpus || []).filter((g) => (g.util_ma5?.value ?? 0) >= 50).length;
export const avgLoad = () => { const g = S.gpus?.gpus || []; return g.length ? g.reduce((s, x) => s + (x.util_ma5?.value ?? 0), 0) / g.length : null; };
export function liveTenants() {
  return new Set(canonDeploys().filter((d) => d.stage === 'ga' && S.tenants.find((t) => t.id === d.tenant_id)?.kind === 'user').map((d) => d.tenant_id));
}
