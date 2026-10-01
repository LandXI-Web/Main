/* ops-infra 데이터 — 게이트웨이(:8700) 실응답만. 파생 규칙은 여기 한 곳(같은 지표 = 같은 값).
   S-9(power_budget · 시드 정리 · Origin 4173)이 서버에 들어오기 전에는 계약 준수 어댑터로 같은 모양을 만든다. */
import { api, devlog } from './kit.js';

export const S = {
  gpus: null, hist: new Map(), watts: new Map(), queues: null, storage: null, nodes: null, models: [], llm: null, health: null,
  tenants: [], usage: [], deploys: [], cards: [], regModels: [], jobs24: null, mods: {}, at: 0,
};
const safe = (p) => api(p).catch((e) => { devlog('api 실패', `${p} · ${e.status || ''} ${e.code || e.message}`); return null; });

/* ── 전력 예산: 서버 power_budget(S-9) 우선 · 없으면 같은 규칙(이동평균 부하 ≥ 50% = 고부하 · 동시 1장)으로 ── */
export const HOT = 50;
/** 전력 고부하 선(서버 전력 규칙 '다른 GPU 100 W 초과면 멈춤'과 같은 선) */
export const HOT_W = 100;
export function budget() {
  const pb = S.gpus?.power_budget;
  const g = S.gpus?.gpus || [];
  if (pb && pb.max_hot != null) return { n: pb.hot_now ?? 0, m: pb.max_hot, ok: pb.ok ?? (pb.hot_now ?? 0) <= pb.max_hot, server: true };
  const n = g.filter((x) => (x.util_ma5?.value ?? 0) >= HOT).length;
  return { n, m: 1, ok: n <= 1, server: false };
}

export async function loadGpus() {
  const g = await safe('/ops/gpus');
  if (!g) return false;
  S.gpus = g;
  for (const x of g.gpus || []) {
    const h = S.hist.get(x.index) || [];
    if (!h.length && x.util_ma5?.samples) for (const s of x.util_ma5.samples.slice(-12)) h.push(s.v);
    h.push(x.util_ma5?.value ?? x.util_pct?.value ?? 0);
    while (h.length > 96) h.shift();
    S.hist.set(x.index, h);
    const w = S.watts.get(x.index) || [];
    w.push(x.power_w?.value ?? 0);
    while (w.length > 96) w.shift();
    S.watts.set(x.index, w);
  }
  return true;
}
export async function loadInfra() {
  const [q, st, n, m, lm, hl, j] = await Promise.all([
    safe('/ops/queues'), safe('/ops/storage'), safe('/ops/nodes'), safe('/ops/models'), safe('/ops/llm/models'), safe('/health'), safe('/jobs?limit=500'),
  ]);
  if (q) S.queues = q; if (st) S.storage = st; if (n) S.nodes = n; if (m) S.models = m.items || []; if (lm) S.llm = lm; if (hl) S.health = hl;
  if (j) {
    const since = Date.now() - 24 * 3600 * 1000;
    const items = j.items || [];
    S.jobs = items;
    S.jobs24 = { value: items.filter((x) => new Date(x.created_at).getTime() >= since).length, unit: 'count', basis: 'measured', as_of: j.as_of, source: '분석 작업 기록' };
  }
}
export async function loadOrg() {
  const [t, u, d, c, rm, mods] = await Promise.all([
    safe('/tenants'), safe('/ops/tenants'), safe('/deploys'), safe('/registry/cards'), safe('/registry/models'),
    Object.keys(S.mods).length ? null : fetch('/landxi/ops/data/i18n-ko.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (t) S.tenants = t.items || []; if (u) S.usage = u.items || []; if (d) S.deploys = d.items || []; if (c) S.cards = c.items || [];
  if (rm) S.regModels = rm.items || [];
  if (mods?.module) S.mods = mods.module;
  S.at = Date.now();
}
export const loadDeploys = async () => { const d = await safe('/deploys'); if (d) S.deploys = d.items || []; };
export const loadUsage = async () => { const u = await safe('/ops/tenants'); if (u) S.usage = u.items || []; };

/* ── 이름(사용자 말) ─────────────────── */
const trimRegion = (s) => String(s || '').replace(/^.*?(특별자치도|특별자치시|광역시)\s+/, '');
export function tenantName(id) {
  if (id === 'lx') return 'LX';
  const t = S.tenants.find((x) => x.id === id);
  return trimRegion(t?.name?.ko || t?.name?.en || '기관').replace(/\s*\(.*\)$/, '');
}
const sggWord = (d) => { const p = String(d.region_name?.ko || '').trim().split(/\s+/); return p.length > 1 ? p.slice(1).join(' ') : ''; };
/** 배포 주체 — LX 자체 = 지역 · 기관 = 기관(시군구에 적용한 배포본이 기관 관할 여러 곳 중 하나면 시군구를 붙인다: '광주전남특별시 여수시') */
export const whoOf = (d) => (d.tenant_id === 'lx' ? trimRegion(d.region_name?.ko || d.region_name?.en || 'LX')
  : d.sgg_cd && d.region_profile == null && sggWord(d) && !tenantName(d.tenant_id).endsWith(sggWord(d)) ? `${tenantName(d.tenant_id)} ${sggWord(d)}` : tenantName(d.tenant_id));
export const cardName = (id) => (S.cards.find((c) => c.id === id)?.name || '서비스').replace(/\s*(행정)?서비스$/, '').replace(/판독/g, 'AI 분석');   // 용어표: 판독 → AI 분석(서버 카드명 정비 전 화면 쪽 표기)
export const verOf = (d) => d.version || (d.card_version_id ? 'v' + d.card_version_id.split('@')[1] : '');
export const verOfId = (cv) => (cv ? 'v' + String(cv).split('@')[1] : '');
export function modName(k) {
  if (S.mods[k]) return S.mods[k];
  let hit = Object.keys(S.mods).filter((m) => k.startsWith(m)).sort((a, b) => b.length - a.length)[0];
  if (!hit) { const fam = k.split('-').slice(0, 2).join('-'); hit = Object.keys(S.mods).find((m) => m.startsWith(fam + '-') && k.includes(m.split('-').pop())); }
  return hit ? S.mods[hit] : '전용 기능';
}
/* ── 모델 교체 — 배포본 계보(/registry/lineage)·카드 모델과 같은 계열(작업 · 계열 · 학습 데이터 뿌리)만 ── */
const LIN = new Map();
export async function loadLineage(did) {
  if (!LIN.has(did)) LIN.set(did, safe(`/registry/lineage/${encodeURIComponent(did)}`).then((r) => (r?.chain || []).filter((c) => c.kind === 'model').map((c) => c.id)));
  return LIN.get(did);
}
const learned = (m) => !!m && !!m.weights_uri && m.status !== 'retired' && !/^(index|survey|change)/.test(m.family || '');
const famBase = (f) => String(f || '').replace(/^(yolo\d+)[nslmx]?/, '$1');
const root = (id) => String(id).split('/')[0];
/** 지금 쓰는 모델 id — 교체값 · 계보(분석에 실제로 쓴 모델 · 서버 흐름 기록) 순. 계보가 없을 때만 카드 모델
    (r3-train 3차: 계보는 기본 모델인데 카드 모델까지 '쓰는 중'으로 표시해 직원 화면과 다른 모델을 말했다 — 한 출처) */
export function currentModels(d, lin = []) {
  const card = S.cards.find((c) => c.id === d.card_id);
  const ran = d.flow?.model?.id ? [d.flow.model.id] : [];
  return [...new Set([d.model_override, ...ran, ...(lin.length || ran.length ? lin : card?.models || [])].filter(Boolean))];
}
/** 교체 후보: 학습 모델만(규칙·변화 지수 같은 비교체 항목 제외) · 지금 모델과 작업·계열·데이터 뿌리가 같은 것 */
export function swapModels(d, lin = []) {
  const cur = currentModels(d, lin).map((id) => S.regModels.find((m) => m.id === id)).filter(learned);
  if (!cur.length) return [];
  const ok = (m) => learned(m) && cur.some((c) => c.task === m.task && famBase(c.family) === famBase(m.family) && root(c.id) === root(m.id));
  const list = S.regModels.filter(ok);
  return labelModels(list).sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}
/* 원시 클래스 → 사용자 말: '비닐하우스_단동' '비닐하우스_다동' → '비닐하우스(단동·다동)' */
function targets(classes) {
  const ko = (classes || []).filter((c) => /[가-힣]/.test(c));
  const groups = new Map();
  for (const c of ko) { const [a, b] = c.split('_'); const g = groups.get(a) || []; if (b) g.push(b); groups.set(a, g); }
  if (['수단그라스', '호밀', '옥수수'].filter((c) => groups.has(c)).length >= 2) return '사료작물';
  const words = [...groups].map(([a, sub]) => (sub.length ? `${a}(${sub.join('·')})` : a));
  if (!words.length) return '';
  return words.slice(0, 2).join('·') + (words.length > 2 ? ' 외' : '');
}
const HINT = { growth: '생육', production: '생산', cultivate: '', vinyl: '', silage: '' };
function hint(id) { const k = String(id).split('/')[1] || ''; const w = Object.keys(HINT).find((x) => k.toLowerCase().startsWith(x)); return w ? HINT[w] : ''; }
function precision(m) {
  const v = Object.values(m.metrics || {}).map((x) => +x?.value).filter((x) => x > 0 && x <= 1);
  if (!v.length) return '';
  return Math.max(...v) >= 0.95 ? '✓' : '~';
}
/** 목록 라벨 — 탐지 대상 (+ 쓰임) · 같은 이름이면 학습 차수 · 정밀도 ✓(높음) / ~(보통). 같은 문자열 0 */
function labelModels(list) {
  const rows = list.map((m) => {
    const t = targets(m.classes) || (m.task === 'obb' ? '차량' : '분석');
    const hn = hint(m.id);
    return { m, id: m.id, base: `${t}${hn ? ' ' + hn : ''} 탐지`.replace(/ 외 (\S+) 탐지$/, ' 외 $1 탐지'), mark: precision(m) };
  });
  const byBase = new Map();
  for (const r of rows) (byBase.get(r.base) || byBase.set(r.base, []).get(r.base)).push(r);
  for (const g of byBase.values()) {
    if (g.length > 1) g.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })).forEach((r, i) => { r.base += ` · ${i + 1}차`; });
  }
  const seen = new Set();
  for (const r of rows) { let l = r.base, n = 2; while (seen.has(l)) l = `${r.base} (${n++})`; seen.add(l); r.label = l; }
  return rows;
}
/** 모델 → 사용자 말(다른 곳에서 쓰는 한 줄 이름) */
export function modelName(id) {
  const m = S.regModels.find((x) => x.id === id);
  const t = targets(m?.classes);
  if (t) return t + ' 탐지';
  if (m?.task === 'obb' || /car|vehicle/.test(id)) return '차량 탐지';
  if (/ndvi|index/.test(id)) return '식생 지수';
  return '분석 모델';
}
export const POOL = { a6000: 'GPU 서버', cpu: '일반 서버' };
export const poolName = (p) => POOL[p] || '증설 서버';

/* 단계 — 잉크 농도(크롬 채도 0) */
export const STAGE = { draft: '초안', shadow: '검증', canary: '시범', ga: '운영', rolled_back: '롤백' };
export const STAGES = ['draft', 'shadow', 'canary', 'ga'];
export const FORWARD = { draft: 'shadow', shadow: 'canary', canary: 'ga', rolled_back: 'shadow' };

/** 배포본 정리 — 체험 계정 제외 · 시험 잔여 복제(-test-n)는 한 칸으로 접는다(S-9 시드 정리 전 어댑터) */
export function deploys() {
  const by = new Map();
  for (const d of S.deploys) {
    if (d.tenant_id === 'lx-demo') continue;
    const k = d.id.replace(/-test(-\d+)?$/, '');
    const cur = by.get(k);
    const score = (x) => (/-test/.test(x.id) ? 1e3 : 0) + x.id.length;
    if (!cur || score(d) < score(cur)) by.set(k, d);
  }
  const order = { ga: 0, canary: 1, rolled_back: 2, shadow: 3, draft: 4 };
  return [...by.values()].sort((a, b) => order[a.stage] - order[b.stage] || cardName(a.card_id).localeCompare(cardName(b.card_id), 'ko'));
}

/* ── 기관 사용량(막는 한도 없음 — 원칙 83 · 11차 "GPU 는 무상 정책") ─────────── */
export const DIM = {
  storage_gb: { ko: '저장', unit: 'GB', k: 1, d: 0 },
  gpu_s_month: { ko: 'GPU 시간', unit: 'h', k: 1 / 3600, d: 1 },
  area_km2_month: { ko: '분석 면적', unit: '㎢', k: 1, d: 0 },
  // AI 도우미 사용량(토큰 · 이번 달) — usage_events llm_tokens 합(서버 /ops/tenants 한 출처) · 고리 대신 기관 사용량 표 한 줄(ring:false)
  llm_tokens_month: { ko: 'AI 도우미 사용량', unit: '토큰', k: 1, d: 0, ring: false },
};
export const RING_DIMS = Object.keys(DIM).filter((k) => DIM[k].ring !== false);
/** AI 도우미 사용량 표 — 기관 화면과 같은 기관(서비스 사용자) + LX. 값 = /ops/tenants dims.llm_tokens_month */
export function llmUsage() {
  const users = S.tenants.filter((t) => t.kind === 'user').map((t) => t.id);
  const rows = S.usage.filter((u) => users.includes(u.tenant_id) || u.tenant_id === 'lx').map((u) => {
    const v = u.dims?.llm_tokens_month || {};
    return { id: u.tenant_id, name: tenantName(u.tenant_id), used: v.used || null, requests: u.dims?.llm_requests_month?.used || null, state: dimState(v),
      scope: S.tenants.find((t) => t.id === u.tenant_id)?.scope };
  });
  return rows.sort((a, b) => (a.id === 'lx') - (b.id === 'lx') || (a.scope === b.scope ? a.name.localeCompare(b.name, 'ko') : a.scope === 'local' ? -1 : 1));
}
export const POLICY = { notify: '알림', queue_low: '우선순위 낮춤', reject: '거절' };
export function dimState(v) {
  const used = v?.used?.value;
  if (used == null || !v.hard) return 'ok';
  if (used >= v.hard) return 'over';
  if (v.soft && used >= v.soft) return 'near';
  return 'ok';
}
export const STATE_KO = { ok: '여유', near: '임박', over: '초과' };
export function orgs() {
  const users = S.tenants.filter((t) => t.kind === 'user').map((t) => t.id);
  return S.usage.filter((u) => users.includes(u.tenant_id)).map((u) => {
    const st = Object.keys(DIM).map((k) => dimState(u.dims?.[k]));
    const worst = st.includes('over') ? 'over' : st.includes('near') ? 'near' : 'ok';
    return { id: u.tenant_id, name: tenantName(u.tenant_id), dims: u.dims || {}, state: worst, scope: S.tenants.find((t) => t.id === u.tenant_id)?.scope };
  }).sort((a, b) => (a.scope === b.scope ? a.name.localeCompare(b.name, 'ko') : a.scope === 'local' ? -1 : 1));
}

/* ── 언어 모델 — 모델별 줄(서버 GET /ops/llm/models 한 출처 · 운영 도구 ops_models 와 같은 값) ── */
export function llmRows() {
  const L = S.llm;
  if (!L || !L.items) return null;
  return {
    items: L.items.map((x) => ({ slot: x.slot, role: x.role, name: x.name, on: !!x.on, gpu: x.gpu, startable: x.slot === 'brain' || x.slot === 'router' })),
    on: L.on_n?.value ?? L.items.filter((x) => x.on).length,
    promo: L.promo?.state || '연결 전',
  };
}
/** 꺼져 있을 때만 켠다(서버가 전력 · GPU 점유를 다시 검사) — 끄기 · 재시작은 없다 */
export async function startLlm(slot) {
  const r = await api('/ops/llm/start', { method: 'POST', body: { slot } });
  const lm = await safe('/ops/llm/models'); if (lm) S.llm = lm;
  return r;
}

/* ── 서버 다시 시작(C9 원스톱) — 게이트웨이만 · 작업기 · 언어 모델은 그대로. 새 기동 시각이 보일 때까지 기다린다 ── */
export async function restartServer() {
  return api('/ops/gateway/restart', { method: 'POST', body: {} });
}
export async function waitBoot(prev, maxMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, 2000));
    const h = await api('/health').catch(() => null);
    if (h?.boot_at && h.boot_at !== prev) { S.health = h; return h; }
  }
  return null;
}

/* ── 판정 표기(M14) — 큰 숫자와 행이 같은 판정(서버 judge_power · 표본 하나에 한 번)을 같은 숫자로 ── */
/** 판정 시각 'hh:mm:ss' — AI 도우미 답의 '… 기준' 과 같은 표본 시각 */
export function judgedAt() {
  const at = S.gpus?.power_budget?.at;
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
}
/** 행 작업 칸 뒤에 붙는 고부하 표시 — 판정은 실측(서버 judge_power · impl-1): 전력으로 셌으면 판정에 쓴 최근 평균 W,
    전력 값이 없어 사용률로 셌으면 부하 %, 측정값이 하나도 없는 장만 임대로 '고부하 · 작업 중'. 분석 작업이 쥐고만 있으면(held) 표시 없음 */
export function hotNote(g) {
  const p = (S.gpus?.power_budget?.per || []).find((x) => x.gpu === g.index);
  if (!p || !p.hot) return '';
  if (p.why === 'power' && p.power_w != null) return `고부하 · 최근 평균 ${Math.round(p.power_w)} W`;
  if (p.why === 'util' && p.util_pct != null) return `고부하 · 부하 ${Math.round(p.util_pct)}%`;
  return p.why === 'lease' ? '고부하 · 작업 중' : '고부하';
}

/* ── 작업 이름 ─────────────────────── */
export const KIND = { infer: 'AI 분석', survey: '실태조사', train: '학습', tile: '영상 준비', index: '위성 지수', export: '내보내기' };
export function gpuWork(g) {
  // 분석 작업기가 전력 규칙으로 멈춘 GPU(서버 판정 why='yield') — 언어 모델이 다른 GPU 를 쓰는 동안 양보
  const why = (S.gpus?.power_budget?.per || []).find((p) => p.gpu === g.index)?.why;
  if (why === 'yield') return '분석 잠시 멈춤';
  if (g.job_id || why === 'lease' || why === 'held') { const j = (S.jobs || []).find((x) => x.id === g.job_id); return KIND[j?.kind] || 'AI 분석'; }
  const llm = (g.external || []).some((e) => /llama|vllm|python|ollama/i.test(e.name || ''));
  if (llm && (!g.worker || (g.util_ma5?.value ?? 0) >= 10)) return '언어 모델';
  if (g.worker) return why === 'power' ? '사용 중' : '대기';   // 전력으로 고부하인데 '대기'라고 쓰지 않는다(답의 'in use' 와 같게)
  return why === 'power' ? '사용 중' : '—';
}
