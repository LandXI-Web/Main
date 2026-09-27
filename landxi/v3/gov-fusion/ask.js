/* 말 한마디 → '올린 대장 × AI 판독 × V-World' 결합표의 필터.
   게이트웨이 에이전트(POST /agent/runs → SSE /events/agent/{id})를 거친다: 기관 세션·감사 기록(agent_runs)·백엔드 사슬(vLLM → Ollama)은 서버 몫.
   모델에는 열 이름과 값 예시만 준다(숫자는 주지 않는다 · 결과 수는 브라우저가 결합표 전체에서 센다).
   토큰이 흘러오는 대로 계획 3줄을 먼저 보여 주고, 끝나면 필터를 표에 건다. */
import { api } from '../kit/util.js';
import { sse } from '../../shared/api-v1.js';

export const AI_FIELDS = {
  'AI 건물(㎡)': (p) => p.bld_m2 || 0,
  'AI 경작(㎡)': (p) => p.crop_m2 || 0,
  'AI 주차장(㎡)': (p) => p.park_m2 || 0,
  'AI 비닐하우스(㎡)': (p) => p.gh_m2 || 0,
  'AI 농경 비율': (p) => p.r23_farm || 0,
  'AI 건물 비율': (p) => (p.area_m2 ? (p.bld_m2 || 0) / p.area_m2 : 0),
};
const JM = { 과: '과수원', 목: '목장용지', 임: '임야', 장: '공장용지', 학: '학교용지', 차: '주차장', 주: '주유소용지', 창: '창고용지', 도: '도로', 철: '철도용지', 제: '제방', 천: '하천', 구: '구거', 유: '유지', 양: '양어장', 수: '수도용지', 공: '공원', 체: '체육용지', 원: '유원지', 종: '종교용지', 사: '사적지', 묘: '묘지', 잡: '잡종지', 광: '광천지', 염: '염전' };
export const VW_FIELDS = {
  'V-World 지목': (p) => JM[p.jimok] || p.jimok || '',
  'V-World 용도지역': (p) => p.yongdo || '',
  'V-World 농업진흥': (p) => p.nongup || '',
  'V-World 면적(㎡)': (p) => p.area_m2 || 0,
};
const FAL = '경작 흔적 없음';          // 모델이 한 조건으로 말하는 묶음(→ 서버 규칙 결과 한 조건)
const FAL_W = [{ field: 'AI 경작 흔적 없음', op: '==', value: 1 }];   // 서버 규칙(L2 · R2) 결과 집합 — 작은 2의 수와 같은 필지
const OPS = ['in', 'not_in', '>=', '<=', '>', '<', '==', 'contains'];
const EVENTS = ['agent.route', 'agent.plan', 'agent.token', 'agent.tool.call', 'agent.tool.result', 'agent.done', 'agent.failed', 'agent.rejected'];

/* 1,000자 안(게이트웨이 한도). 질문을 맨 앞에 둔다 — 라우터가 앞 300자로 의도를 고른다. */
export function message(question, ctx) {
  const cut = (s, n) => (s.length > n ? s.slice(0, n) : s);
  const ledger = ctx.ledgerCols.map((c) => (ctx.samples[c] ? `${c}(예: ${cut(ctx.samples[c], 40)})` : c));
  const head = `질문: ${cut(question, 200)}\n\n[올린 대장 필터로 바꾸기] 도구 없이 JSON 한 줄만 답한다.\n`;
  const st = ctx.stateCol || '상태', ad = ctx.addrCol || '소재지', pl = (ctx.places || []).find((x) => /리$/.test(x) && !question.includes(x)) || '○○리';   // 예시 지명 = 질문에 없는 대장 속 리
  const rule = `규칙: 대장상 ~ 은 ${st} 열 · 농지=${st} in 전,답,과수원 · 건물=AI 건물(㎡)>=33 · 주차장=AI 주차장(㎡)>=100 · 비닐하우스=AI 비닐하우스(㎡)>=100 · 경작 흔적 없음={"field":"${FAL}","op":"==","value":1} · 농업진흥=V-World 농업진흥 contains 농업진흥 · 리·읍면=${ad} contains 이름, focus 에도\n`
    + `where 는 질문에 나온 말만, 3개 이하. 예) '${pl} 주차장' → [{"field":"${ad}","op":"contains","value":"${pl}"},{"field":"AI 주차장(㎡)","op":">=","value":100}] · 틀림: 묻지 않은 건물·비닐하우스·경작 조건을 덧붙이기\n`
    + `steps 는 쉬운 우리말 · op: ${OPS.join(',')}\n형식: {"steps":["명사형 16자","…","…"],"label":"명사형 10자","where":[{"field":"열","op":"op","value":"값"}],"focus":"지역 또는 빈칸"}`;
  const tail = ` · ${Object.keys(AI_FIELDS).join(' · ')}(0~1) · ${Object.keys(VW_FIELDS).map((k) => (ctx.samples[k] ? `${k}(예: ${cut(ctx.samples[k], 30)})` : k)).join(' · ')}\n`;
  let cols = '열: ' + ledger.join(' · ');
  while (head.length + cols.length + tail.length + rule.length > 990 && ledger.length) { ledger.pop(); cols = '열: ' + ledger.join(' · '); }
  return head + cols + tail + rule;
}

/* 흘러온 글에서 steps 배열의 완성된 문자열만 */
function stepsSoFar(text) {
  const sm = text.match(/"steps"\s*:\s*\[([\s\S]*)/);
  if (!sm) return [];
  const body = sm[1]; const end = body.search(/"\s*\]/);
  const seg = end >= 0 ? body.slice(0, end + body.slice(end).indexOf(']') + 1) : body;
  const out = [];
  for (const m of seg.matchAll(/"((?:[^"\\]|\\.)*)"\s*(?=[,\]])/g)) { try { out.push(JSON.parse('"' + m[1] + '"')); } catch { /* */ } }
  return out;
}
/* 마지막 {"steps" … } 덩어리를 JSON 으로 */
function lastJson(text) {
  const i = text.lastIndexOf('{"steps"');
  const s = i >= 0 ? text.slice(i) : text;
  for (let end = s.length; end > 0; end = s.lastIndexOf('}', end - 1)) {
    try { return JSON.parse(s.slice(0, end + 1)); } catch { /* 더 짧게 */ }
    if (end <= 0) break;
  }
  return null;
}
/* 열 이름 정규화 — 모델이 괄호·범위를 덧붙여도 아는 열로 */
function normField(f, known) {
  const s = String(f || '').trim();
  if (known.includes(s)) return s;
  const bare = (x) => x.replace(/\(.*?\)|\{\{.*?\}\}|[~\s]/g, '');
  return known.find((k) => bare(k) === bare(s)) || known.find((k) => bare(s).startsWith(bare(k))) || null;
}

/* ── 결정적 규칙 매핑(모델 호출 전) — 명세 어휘: 농지 · 건물 · 주차장 · 비닐하우스 · 경작 흔적 없음 · 농업진흥 · 리/읍면 ──
   모델 답(where)이 질문 핵심어와 어긋나면 1회 다시 묻고, 그래도 어긋나면 이 매핑을 쓴다. */
const FARM_V = ['전', '답', '과수원', '과'];
const NUM = (s) => parseFloat(String(s).replace(/,/g, ''));
function areaNear(q, word) {
  // '건물이 500㎡ 넘게' · '건물 500제곱미터 이상'
  const re = new RegExp(word + '[^\\d]{0,12}?(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:㎡|m2|m²|제곱미터|평방미터)');
  const m = re.exec(q); return m ? NUM(m[1]) : null;
}
export function keysOf(q) {
  const s = String(q || '');
  return {
    farm: /농지|농경지|전답|전·답|대장상\s*(답|전|과수원)/.test(s),
    bld: /건물|건축물|주택|창고/.test(s),
    park: /주차장/.test(s),
    gh: /비닐하우스|하우스|온실/.test(s),
    fal: /경작\s*흔적|경작.{0,6}(없|안\s*하|않)|휴경|묵(은|힌)/.test(s),
    ng: /농업\s*진흥/.test(s),
  };
}
/** 질문 → where(규칙) · focus(리/읍면) */
export function rulePlan(question, ctx) {
  const q = String(question || '');
  const k = keysOf(q);
  const where = [];
  const st = ctx.stateCol;
  if (st) {
    const one = /대장(?:상|에서|이|은|의)?\s*(답|과수원)/.exec(q) || /대장(?:상|에서|이|은|의)?\s*(전)(?:인데|이고|인|이며|으로)/.exec(q);
    if (one) where.push({ field: st, op: 'in', value: one[1] === '과수원' ? '과수원,과' : one[1] });
    else if (k.farm || k.fal) where.push({ field: st, op: 'in', value: FARM_V.join(',') });
  }
  if (k.bld) where.push({ field: 'AI 건물(㎡)', op: '>=', value: areaNear(q, '(?:건물|건축물|주택|창고)') ?? 33 });
  if (k.park) where.push({ field: 'AI 주차장(㎡)', op: '>=', value: areaNear(q, '주차장') ?? 100 });
  if (k.gh) where.push({ field: 'AI 비닐하우스(㎡)', op: '>=', value: areaNear(q, '(?:비닐하우스|하우스|온실)') ?? 100 });
  if (k.fal) for (const f of FAL_W) where.push({ ...f });
  if (k.ng) where.push({ field: 'V-World 농업진흥', op: 'contains', value: '농업진흥' });
  const focus = placeOf(q, ctx.places || []);
  if (focus && ctx.addrCol) where.push({ field: ctx.addrCol, op: 'contains', value: focus });
  return { where, focus: focus || '' };
}
/** 질문 속 리·읍면 이름(대장에 실제로 있는 이름만) */
export function placeOf(q, places) {
  let best = '';
  for (const p of places) if (p && p.length >= 2 && q.includes(p) && p.length > best.length) best = p;
  if (best) return best;
  const m = /([가-힣]{1,6}(?:리|읍|면|동))(?:에서|의|에|은|는|\s|$)/.exec(q);
  return m && places.includes(m[1]) ? m[1] : '';
}
/** 규칙 매핑 + 모델이 더한 조건(질문에 그 낱말이 있을 때만) — 같은 질문은 같은 답 */
export function merge(rule, model, question, ctx) {
  const have = new Set(rule.map((w) => w.field));
  const out = rule.slice();
  for (const w of model || []) {
    if (have.has(w.field)) continue;
    const bare = w.field.replace(/^V-World /, '').replace(/\(.*?\)/g, '');
    const said = question.includes(bare) || (w.field === 'V-World 용도지역' && /관리지역|농림지역|녹지|주거지역|보전|용도지역/.test(question)) || (w.field === 'V-World 지목' && /지목/.test(question));
    if (said && !/^AI /.test(w.field)) { out.push(w); have.add(w.field); }
  }
  return out;
}
/** 적용한 조건의 이름(큰 숫자 · 답 · 막대가 같은 라벨을 쓴다) */
export function labelOf(where, ctx, focus) {
  const f = (fld) => where.find((w) => w.field === fld);
  const st = ctx.stateCol && f(ctx.stateCol);
  const ai = where.find((w) => /^AI (건물|주차장|비닐하우스)\(/.test(w.field));
  const fal = f('AI 경작 흔적 없음'), ng = f('V-World 농업진흥');
  let lg = '';
  if (st) { const vals = String(Array.isArray(st.value) ? st.value.join(',') : st.value).split(',').map((x) => x.trim()).filter(Boolean); lg = vals.every((v) => FARM_V.includes(v)) && vals.length >= 3 ? '농지' : vals.filter((x) => x !== '과').join('·'); }
  const cls = ai ? ai.field.replace(/^AI |\(㎡\)$/g, '') : '';
  const parts = [];
  if (focus) parts.push(focus);
  if (ng) parts.push('농업진흥구역');
  if (st && ai) parts.push(`대장은 ${lg} · AI는 ${cls}`);
  else { if (st && !fal) parts.push(`대장은 ${lg}`); if (ai) parts.push(`AI는 ${cls}`); }
  if (fal) parts.push('경작 흔적 없음(확인 필요)');
  return { label: parts.join(' · ') || '찾은 필지', big: !!ai && !fal };
}
/** 모델 where 가 질문 핵심어와 맞는가 */
export function agrees(where, question, ctx) {
  const k = keysOf(question);
  const f = new Set(where.map((w) => w.field));
  const need = [[k.bld, 'AI 건물(㎡)'], [k.park, 'AI 주차장(㎡)'], [k.gh, 'AI 비닐하우스(㎡)'], [k.fal, 'AI 경작 흔적 없음'], [k.ng, 'V-World 농업진흥']];
  for (const [on, fld] of need) { if (on && !f.has(fld)) return false; if (!on && f.has(fld)) return false; }
  if (k.farm && ctx.stateCol && !f.has(ctx.stateCol)) return false;
  const place = placeOf(question, ctx.places || []);
  if (place && !where.some((w) => w.op === 'contains' && String(w.value).includes(place))) return false;
  return where.length > 0;
}
/** 적용한 조건을 사용자 말로(계획 줄 · 0필지 안내) — 3줄: 어디 · 대장 · AI 판독 */
export function conditionLines(where, ctx) {
  const nf = (n) => Number(n).toLocaleString('ko-KR');
  const where1 = [], led = [], ai = [];
  for (const w of where) {
    const v = Array.isArray(w.value) ? w.value.join(',') : String(w.value);
    if (w.field === 'V-World 면적(㎡)' || w.field === 'AI 건물 비율') continue;
    if (w.field === ctx.stateCol) led.push(`대장 ${ctx.stateCol} ${v.split(',').filter((x) => x !== '과').join('·')}`);
    else if (/^AI (건물|주차장|비닐하우스)\(/.test(w.field)) ai.push(`AI ${w.field.replace(/^AI |\(㎡\)$/g, '')} ${nf(NUM(v))}㎡ ${w.op === '>' ? '초과' : w.op === '<' || w.op === '<=' ? '이하' : '이상'}`);
    else if (w.field === 'AI 경작 흔적 없음' || w.field === 'AI 농경 비율') ai.push('AI 경작 흔적 없음');
    else if (w.field === 'V-World 농업진흥') where1.push(v.includes('농업진흥') ? '농업진흥구역' : v);
    else if (w.op === 'contains') where1.unshift(v);
    else led.push(`${w.field.replace(/^V-World /, '')} ${v}`);
  }
  return [where1.join(' · '), led.join(' · '), ai.join(' · ')].filter(Boolean);
}

/**
 * plan(question, ctx, onStep, signal) → { steps, label, where, focus, ms, first_ms, run_id }
 * ctx = { ledgerCols, samples, region }
 */
export async function plan(question, ctx, onStep, signal) {
  const known = [...ctx.ledgerCols, ...Object.keys(AI_FIELDS), ...Object.keys(VW_FIELDS), FAL];
  const t0 = performance.now();
  const r = await api('/agent/runs', { method: 'POST', body: { message: message(question, ctx), mode: 'map', context: { mode: 'ledger' } } });
  const runId = r.run && r.run.id;
  let text = '', first = 0, shown = 0;
  const done = await new Promise((resolve, reject) => {
    const to = setTimeout(() => { h.close(); reject(new Error('timeout')); }, 30000);
    const stop = () => { clearTimeout(to); h.close(); };
    if (signal) signal.addEventListener('abort', () => { stop(); const e = new Error('abort'); e.name = 'AbortError'; reject(e); }, { once: true });
    const h = sse(r.events_url.replace(/^\/api\/v1/, ''), {
      events: EVENTS,
      on: (name, d) => {
        if (name === 'agent.token' && d && d.delta) {
          if (!first) first = performance.now() - t0;
          text += d.delta;
          const st = stepsSoFar(text);
          for (; shown < Math.min(st.length, 3); shown++) onStep && onStep(shown, st[shown]);
        } else if (name === 'agent.plan' && d && d.round) {
          text += '\n';                      // 도구 라운드 경계 — 마지막 라운드의 JSON 만 쓴다
        } else if (name === 'agent.done') { stop(); resolve(d || {}); }
        else if (name === 'agent.failed' || name === 'agent.rejected') { stop(); reject(new Error((d && (d.message || d.error)) || 'failed')); }
      },
    });
  });
  // 원문(토큰)이 먼저 · 없으면 답 본문에서 검증기 자리표시를 되돌려 읽는다
  let j = lastJson(text);
  if (!j && done.answer_md) {
    const back = Object.fromEntries((done.unverified || []).map((u) => [u.id, u.text]));
    j = lastJson(String(done.answer_md).replace(/\{\{unv:(\w+)\}\}/g, (_, id) => back[id] ?? ''));
  }
  if (!j || !Array.isArray(j.where)) throw new Error('plan_parse');
  const where = [];
  for (const w of j.where) {
    const field = normField(w && w.field, known);
    if (!field || !OPS.includes(w.op)) continue;
    if (w.value === '' || w.value === null || w.value === undefined) continue;
    if (field === FAL) { for (const f of FAL_W) if (!where.some((x) => x.field === f.field)) where.push({ ...f }); continue; }
    where.push({ field, op: w.op, value: w.value });
  }
  const steps = (Array.isArray(j.steps) ? j.steps : []).map(String).filter((s) => s && !/^\d+$/.test(s)).slice(0, 3);
  for (let i = shown; i < steps.length; i++) onStep && onStep(i, steps[i]);
  return { steps, label: String(j.label || '찾은 필지').slice(0, 20), where, focus: String(j.focus || '').trim(), ms: performance.now() - t0, first_ms: first, run_id: runId };
}

/** 필터 실행(브라우저 · 결합표 전체) */
export function run(where, rows) {
  const tests = (where || []).map((w0) => {
    let w = w0;
    if (Array.isArray(w.value)) w = { ...w, value: w.value.join(',') };
    const vals = String(w.value).split(',').map((s) => s.trim()).filter(Boolean);
    const num = parseFloat(String(w.value).replace(/,/g, ''));
    const norm = (v) => String(v ?? '').trim();
    const eqv = (a, b) => a === b || (a === '과' && b === '과수원') || (a === '과수원' && b === '과');
    return (r) => {
      const v = r[w.field];
      switch (w.op) {
        case 'in': return vals.some((x) => eqv(norm(v), x));
        case 'not_in': return !vals.some((x) => eqv(norm(v), x));
        case 'contains': return vals.some((x) => norm(v).includes(x));
        case '==': return isNaN(num) || isNaN(parseFloat(v)) ? norm(v) === String(w.value).trim() : +v === num;
        case '>=': return +v >= num; case '<=': return +v <= num; case '>': return +v > num; case '<': return +v < num;
        default: return true;
      }
    };
  });
  const out = [];
  for (let i = 0; i < rows.length; i++) if (rows[i] && tests.every((t) => t(rows[i]))) out.push(i);
  return out;
}
