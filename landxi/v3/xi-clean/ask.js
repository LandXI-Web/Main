/* ask.js — 검색 한 칸: 읍면동 · 지번은 바로 찾고, 문장은 vLLM(Gemma · :8000)이 지도 조건(읍면동 · 규칙 · 목록)으로 바꾼다.
   모델이 돌려준 JSON 만 쓴다 — 읍면동·규칙은 서버가 준 목록 안의 값만 통과(그 밖이면 버린다). 숫자는 모델이 만들지 않는다. */
import { api } from '../../shared/api-v1.js';

const LLM = (localStorage.getItem('lx_llm_base') || 'http://localhost:8000') + '/v1';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createAsk({ root, input, list, emds, rules, X, onEmd, onParcel, onIntent }) {
  let items = [], sel = -1, seq = 0, model = null;
  const close = () => { list.hidden = true; items = []; sel = -1; };
  const render = () => {
    list.innerHTML = items.map((it, i) => `<li role="option" aria-selected="${i === sel}" class="${it.kind === 'ask' ? 'ask' : ''}" data-i="${i}">${it.html}</li>`).join('');
    list.hidden = !items.length;
  };
  list.addEventListener('mousedown', (e) => { const li = e.target.closest('li'); if (!li) return; e.preventDefault(); pick(items[+li.dataset.i]); });

  async function suggest() {
    const q = input.value.trim(), my = ++seq;
    if (!q) { close(); return; }
    const out = emds.filter((e) => e.nm.includes(q)).slice(0, 4).map((e) => ({ kind: 'emd', e, html: `${esc(e.nm)}<small>읍면동</small>` }));
    if (/\d/.test(q)) {
      try {
        const j = await api('/survey/findings?' + new URLSearchParams({ q, limit: '12', sort: 'score' }));
        const seen = new Set();
        for (const f of j.items || []) {
          if (seen.has(f.pnu) || seen.size >= 4) continue; seen.add(f.pnu);
          const a = String(f.addr || '').split(' ');
          out.push({ kind: 'parcel', f, html: `${esc(a.slice(-2).join(' '))}<small>${esc(f.rule_nm || '')}</small>` });
        }
      } catch { /* 지번 조회 실패 — 제안만 비운다 */ }
    }
    if (my !== seq) return;
    if (q.length >= 2) out.push({ kind: 'ask', q, html: `<b>물어보기</b> “${esc(q)}”` });
    items = out; sel = out.length && out[0].kind !== 'ask' ? 0 : out.length - 1; render();
  }
  let t = 0;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(suggest, 120); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); const q = input.value.trim(); if (!q) return; pick(items[sel] || { kind: 'ask', q }); }
    else if (e.key === 'Escape') { close(); input.blur(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); input.focus(); input.select(); } });

  function pick(it) {
    close();
    if (!it) return;
    if (it.kind === 'emd') { input.value = it.e.nm; onEmd(it.e); input.blur(); }
    else if (it.kind === 'parcel') { input.value = ''; onParcel(it.f); input.blur(); }
    else ask(it.q);
  }

  async function llmModel() {
    if (model) return model;
    const r = await fetch(LLM + '/models'); const j = await r.json();
    return (model = j.data?.[0]?.id);
  }
  async function ask(q) {
    root.dataset.busy = '1';
    const t0 = performance.now();
    try {
      const m = await llmModel();
      const ids = Object.keys(rules);
      const sys = [
        '너는 토지 실태조사 지도(XI맵)의 지도 제어기다. 사용자의 한 문장을 지도 조건 JSON 하나로만 바꾼다.',
        '규칙: ' + ids.map((k) => `${k}=${rules[k].full}(${rules[k].cond})`).join(' / '),
        '읍면동: ' + emds.map((e) => e.nm).join(', '),
        'emd = 문장에 나온 읍면동(없으면 null). rules = 해당 규칙 id(특정되지 않으면 빈 배열). list = 목록·순위·어디·몇 곳을 물으면 true. label = 조건을 12자 안으로 요약.',
      ].join('\n');
      const body = {
        model: m, temperature: 0, max_tokens: 160,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: q }],
        response_format: { type: 'json_schema', json_schema: { name: 'map_query', schema: {
          type: 'object', additionalProperties: false, required: ['emd', 'rules', 'list', 'label'],
          properties: { emd: { type: ['string', 'null'] }, rules: { type: 'array', items: { type: 'string', enum: ids } }, list: { type: 'boolean' }, label: { type: 'string', maxLength: 24 } } } } },
      };
      const r = await fetch(LLM + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('llm ' + r.status);
      const j = await r.json();
      const raw = j.choices?.[0]?.message?.content || '{}';
      const o = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
      const emd = o.emd ? emds.find((e) => e.nm === o.emd) || emds.find((e) => o.emd.includes(e.nm) || e.nm.includes(o.emd)) : null;
      const rs = (o.rules || []).filter((k) => ids.includes(k));
      X.ask = { model: m, ms: Math.round(performance.now() - t0), raw, q };
      input.value = ''; input.blur();
      onIntent({ emd, rules: rs, list: !!o.list, label: String(o.label || q).slice(0, 24) });
    } catch (e) {
      X.ask = { model, ms: Math.round(performance.now() - t0), raw: 'error ' + (e.message || e), q };
      onIntent(null, '지금은 문장을 이해하지 못했습니다. 장소나 지번으로 찾아 주세요');
    } finally { delete root.dataset.busy; }
  }
  return { ask, close };
}
