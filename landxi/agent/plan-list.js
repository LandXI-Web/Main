/* plan-list.js — 계획 단계(Palantir AIP 단계 노출): 도구 이름 = 계약 API 이름 그대로 · ms = 서버 agent_tool_calls.ms(실측) ·
   클라이언트 도구(map_arrive 등)는 브라우저가 잰 ms(표기 '브라우저'). 완료 행 = 청록 락온 380. 실행 중 행 = 헤어라인 스캔 빔(실이벤트). */
import { esc } from './answer.js';
import { recAt } from './replay.js';

const BYK = { runtime: '· 런타임', template: '· 서식', model: '' };
const fmtMs = (ms) => (ms === null || ms === undefined ? '' : Number(ms) >= 1000 ? Number(ms).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) : Number(ms).toLocaleString('ko-KR', { maximumFractionDigits: 1 }));

export class PlanList {
  constructor(el) { this.el = el; this.rows = new Map(); }
  clear() { this.el.innerHTML = ''; this.rows.clear(); }
  /** steps: [{i, tool, why, by, args}] — 이미 있는 행은 유지(계획 개정 시 뒤에만 붙는다) */
  set(steps) {
    for (const s of steps) {
      if (this.rows.has(s.i)) continue;
      const li = document.createElement('li');
      li.className = 'ag-step'; li.dataset.state = 'wait'; li.dataset.by = s.by || 'model'; li.dataset.tool = s.tool;
      li.innerHTML = `<span class="i">${String(s.i).padStart(2, '0')}</span><span class="t" data-byk="${esc(BYK[s.by] || '')}" title="${esc(JSON.stringify(s.args || {}))}">${esc(s.tool)}</span>`
        + `<span class="ms" aria-live="polite"></span><span class="w">${esc(s.why || '')}${argsLine(s.args)}</span>`;
      this.el.appendChild(li);
      this.rows.set(s.i, li);
    }
  }
  call(i) { const r = this.rows.get(i); if (r) r.dataset.state = 'run'; }
  /** rec = 녹음 시각(리플레이) — 있으면 ms 꼬리표는 '기록 · 녹음 시각'(이 세션에서 잰 값이 아님) */
  result(i, { ms, ok = true, error = null, client = false, rec = undefined } = {}) {
    const r = this.rows.get(i); if (!r) return;
    r.dataset.state = ok ? 'done' : 'err';
    const m = r.querySelector('.ms');
    if (!ok) { m.innerHTML = `${esc(error?.code || '실패')}`; r.querySelector('.w').textContent = error?.message || ''; return; }
    if (client) { m.innerHTML = `<small>브라우저 계측 중</small>`; r.dataset.state = 'run'; return; }
    if (rec !== undefined) { m.innerHTML = `${fmtMs(ms)}<small>ms ${esc(recAt(rec, true))}</small>`; m.title = `녹음된 run 의 서버 ms(${rec || '시각 미상'}) — 이 세션에서 잰 값이 아님`; r.dataset.ms = 'recorded'; }
    else { m.innerHTML = `${fmtMs(ms)}<small>ms 실측</small>`; r.dataset.ms = 'measured'; }
    lock(r);
  }
  clientMs(i, ms) {
    const r = this.rows.get(i); if (!r) return;
    r.dataset.state = 'done';
    r.querySelector('.ms').innerHTML = `${fmtMs(ms)}<small>ms 브라우저</small>`;      // 이 세션 브라우저가 잰 값(리플레이에서도 지도 동작은 지금 실행)
    r.dataset.ms = 'browser';
    lock(r);
  }
}

function lock(r) {
  r.querySelector('.lk')?.remove();
  const k = document.createElement('span'); k.className = 'lk'; k.innerHTML = '<i></i><i></i><i></i><i></i>';
  r.appendChild(k);
}

function argsLine(a) {
  if (!a) return '';
  const parts = Object.entries(a).filter(([k, v]) => v !== undefined && v !== null && v !== '' && k !== 'aoi').map(([k, v]) => `${k}=${typeof v === 'object' ? '…' : v}`);
  return parts.length ? ` · <span class="mono">${esc(parts.join(' '))}</span>` : '';
}
