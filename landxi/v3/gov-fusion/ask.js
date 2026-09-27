/* ⌘K — 말 한마디를 '올린 대장 × AI 판독 × V-World' 결합표의 필터로 바꾼다.
   vLLM(Gemma 4 12B · :8000) 에 결합표의 열 목록과 값 예시만 준다(숫자는 주지 않는다 · 결과는 브라우저가 표에서 센다).
   구조화 출력(json_schema) + 스트리밍: 계획 3줄이 먼저 흘러나오고, 끝나면 필터를 표에 건다. */

export const VLLM = { base: (() => { try { return localStorage.getItem('lx_vllm_base') || 'http://127.0.0.1:8000/v1'; } catch { return 'http://127.0.0.1:8000/v1'; } })(), model: 'gemma-4-12b-it' };

export const AI_FIELDS = {
  'AI 건물(㎡)': (p) => p.bld_m2 || 0,
  'AI 경작(㎡)': (p) => p.crop_m2 || 0,
  'AI 주차장(㎡)': (p) => p.park_m2 || 0,
  'AI 비닐하우스(㎡)': (p) => p.gh_m2 || 0,
  'AI 농경 비율': (p) => p.r23_farm || 0,
};
const JM = { 과: '과수원', 목: '목장용지', 임: '임야', 장: '공장용지', 학: '학교용지', 차: '주차장', 주: '주유소용지', 창: '창고용지', 도: '도로', 철: '철도용지', 제: '제방', 천: '하천', 구: '구거', 유: '유지', 양: '양어장', 수: '수도용지', 공: '공원', 체: '체육용지', 원: '유원지', 종: '종교용지', 사: '사적지', 묘: '묘지', 잡: '잡종지', 광: '광천지', 염: '염전' };
export const VW_FIELDS = {
  'V-World 지목': (p) => JM[p.jimok] || p.jimok || '',
  'V-World 용도지역': (p) => p.yongdo || '',
  'V-World 농업진흥': (p) => p.nongup || '',
};

/* 문법 제약(xgrammar EBNF) — 공백 없는 한 줄 JSON 만 허용한다(스키마 제약은 공백 폭주로 멈출 수 있어 쓰지 않는다). */
function grammarFor(fields) {
  const lit = (x) => JSON.stringify(JSON.stringify(x));
  return [
    'root ::= "{\\"steps\\":[" str "," str "," str "],\\"label\\":" str ",\\"where\\":[" conds "],\\"focus\\":" str "}"',
    'conds ::= "" | cond | cond "," cond | cond "," cond "," cond | cond "," cond "," cond "," cond',
    'cond ::= "{\\"field\\":" field ",\\"op\\":" op ",\\"value\\":" val "}"',
    'val ::= str | num | "[" str "]" | "[" str "," str "]" | "[" str "," str "," str "]" | "[" str "," str "," str "," str "]"',
    'num ::= [0-9]+ ("." [0-9]+)?',
    'field ::= ' + fields.map(lit).join(' | '),
    'op ::= ' + ['in', 'not_in', '>=', '<=', '>', '<', '==', 'contains'].map(lit).join(' | '),
    'str ::= "\\"" chr* "\\""',
    'chr ::= [^"\\\\\\n]',
  ].join('\n');
}

function systemPrompt(ledgerCols, samples, region) {
  const lc = ledgerCols.map((c) => `- ${c}${samples[c] ? ` (값 예: ${samples[c]})` : ''}`).join('\n');
  return `너는 Land-XI 융합 분석 비서다. ${region} 담당 공무원이 올린 행정 대장을 AI 판독 결과와 필지(PNU)로 결합한 표가 있다.
질문을 이 표의 필터로 바꿔라. 숫자·결과를 지어내지 말고 필터만 만든다.
[대장 열 — 사용자가 올린 원본]
${lc}
[AI 열 — 2023 항공 25cm 판독, 필지와 겹친 면적]
- AI 건물(㎡) · AI 경작(㎡) · AI 주차장(㎡) · AI 비닐하우스(㎡) · AI 농경 비율(0~1)
[V-World 열 — 연속지적·용도지역 공공 레이어]
- V-World 지목 · V-World 용도지역 · V-World 농업진흥
규칙:
- '대장상 ~' 은 대장 열로 건다. 농지 = 지목 in 전,답,과수원(대장 값 표기를 그대로).
- 'AI가 건물로 본' = AI 건물(㎡) >= 33. '주차장으로 쓰는' = AI 주차장(㎡) >= 100. '비닐하우스' = AI 비닐하우스(㎡) >= 100.
- '경작 안 하는/휴경' = AI 농경 비율 < 0.15 이고 면적 열 >= 1000.
- 목록 값은 쉼표로 잇는다. 지역(리·읍면)을 말하면 focus 에 그 이름, 아니면 빈칸이고 소재지 contains 조건도 함께 건다.
- steps: 사용자에게 보여줄 계획 3줄. 각 줄은 16자 안팎의 명사형('~ 찾기', '~ 고르기', '~ 표시'), 마침표 없이, 쉬운 말, 기술 용어 금지.
- label: 결과 이름(10자 안팎, 명사형).`;
}

/**
 * plan(question, ctx, onStep) → { steps, label, where, focus, ms, first_ms }
 * ctx = { ledgerCols, samples, region }
 */
export async function plan(question, ctx, onStep, signal) {
  const fields = [...ctx.ledgerCols, ...Object.keys(AI_FIELDS), ...Object.keys(VW_FIELDS)];
  const body = {
    model: VLLM.model, stream: true, temperature: 0, max_tokens: 360,
    messages: [{ role: 'system', content: systemPrompt(ctx.ledgerCols, ctx.samples, ctx.region) }, { role: 'user', content: question }],
    structured_outputs: { grammar: grammarFor(fields) },
  };
  const t0 = performance.now(); let first = 0;
  const r = await fetch(VLLM.base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!r.ok) throw new Error('AI 비서 응답 없음');
  const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '', text = ''; const seen = [];
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let k;
    while ((k = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim(); if (d === '[DONE]') continue;
      try { const j = JSON.parse(d); const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (c) { if (!first) first = performance.now() - t0; text += c; } } catch { /* */ }
    }
    const sm = text.match(/"steps"\s*:\s*\[([\s\S]*)/);
    if (sm) {
      const done = [...sm[1].matchAll(/"((?:[^"\\]|\\.)*)"\s*(?=[,\]])/g)].map((m) => JSON.parse('"' + m[1] + '"'));
      for (let i = seen.length; i < Math.min(done.length, 3); i++) { seen.push(done[i]); onStep && onStep(i, done[i]); }
    }
  }
  let j; try { j = JSON.parse(text); } catch { throw new Error('plan_parse: ' + text.slice(-160)); }
  for (let i = seen.length; i < (j.steps || []).length; i++) onStep && onStep(i, j.steps[i]);
  return { ...j, ms: performance.now() - t0, first_ms: first };
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
        case 'contains': return norm(v).includes(String(w.value).trim());
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
