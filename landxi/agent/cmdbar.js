/* cmdbar.js — ⌘K 명령 바(Linear ⌘K · 어두운 팔레트 · 상단 중앙 480 · 라운드 0).
   플레이스홀더 = 지금 화면에 맞는 예시 한 줄(실태조사 모드·층이 켜져 있을 때만 그 예시). 제출 → 스캔 빔(agent.plan 도착까지만).
   모델 칩 = /agent/models 가 돌려준 실제 백엔드(죽으면 점선 · 에이전트 연결 없음). */
import { esc } from './answer.js';

export class CmdBar {
  constructor(slot, { onSubmit, suggestions = () => [], placeholder = () => '' } = {}) {
    this.slot = slot; this.onSubmit = onSubmit; this.suggestions = suggestions; this.placeholder = placeholder; this.sel = -1;
    const el = document.createElement('div');
    el.className = 'ag-cmd'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'GeoAI 에이전트 명령 바');
    el.innerHTML = `<div class="ag-cmd-row"><span class="ag-key" aria-hidden="true">⌘K</span>
      <input type="text" autocomplete="off" spellcheck="false" aria-label="에이전트에게 말하기" maxlength="300">
      <span class="ag-model" data-ok="0" title="실제 백엔드"><i></i>모델 확인 중</span></div>
      <ul class="ag-sugs" role="listbox" aria-label="예시"></ul>
      <p class="ag-cmd-foot"><span><kbd>↵</kbd> 실행</span><span><kbd>↑↓</kbd> 예시</span><span><kbd>esc</kbd> 닫기</span><span class="ag-cmd-note"></span></p>
      <span class="ag-beam" hidden></span>`;
    slot.appendChild(el);
    this.el = el; this.input = el.querySelector('input'); this.beamEl = el.querySelector('.ag-beam'); this.list = el.querySelector('.ag-sugs');
    this.input.addEventListener('keydown', (e) => {
      const items = [...this.list.children];
      if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!items.length) return;
        this.sel = (this.sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((li, k) => li.setAttribute('aria-selected', String(k === this.sel)));
        this.input.value = items[this.sel].dataset.q; return;
      }
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        const q = this.input.value.trim() || (this.input.placeholder || '').trim();
        if (q) this.submit(q);
      }
    });
    this.list.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) this.submit(li.dataset.q); });
  }
  get isOpen() { return !this.el.hidden; }
  open(prefill = '') {
    this.el.hidden = false;
    this.input.placeholder = this.placeholder() || '무엇을 찾을까요 — 예) 운봉읍 비닐하우스 보여줘';
    const sugs = this.suggestions();
    this.list.innerHTML = sugs.map((s) => `<li role="option" aria-selected="false" data-q="${esc(s.q)}"><b>${esc(s.k)}</b>${esc(s.q)}</li>`).join('');
    this.list.hidden = !sugs.length;
    this.sel = -1;
    this.input.value = prefill || '';          // 새 질문은 빈 칸에서(이전 문장에 이어 붙지 않게)
    requestAnimationFrame(() => this.input.focus({ preventScroll: true }));
    document.documentElement.dataset.agentCmd = 'open';
  }
  close() { this.el.hidden = true; this.beam(false); document.documentElement.dataset.agentCmd = 'closed'; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  beam(on) { this.beamEl.hidden = !on; }
  note(t) { this.el.querySelector('.ag-cmd-note').textContent = t || ''; }
  model(m) {
    const c = this.el.querySelector('.ag-model');
    if (!m) { c.dataset.ok = '0'; c.innerHTML = '<i></i>에이전트 연결 없음 <small>기록 재생</small>'; c.title = 'LLM 백엔드 응답 없음 — 실제 run 녹음 재생'; return; }
    c.dataset.ok = m.resident ? '1' : '0';
    c.innerHTML = `<i></i>${esc(m.id)} <small>· ${esc(m.backend === 'vllm' ? 'vLLM' : m.backend === 'ollama' ? 'Ollama' : m.backend)} · 온프레미스</small>`;
    c.title = `${m.family || ''} · ${m.license || ''} · ${m.gpu || ''} · ${m.base || ''} · 헬스 ${m.probe?.value ?? '—'}ms 실측`;
  }
  async submit(q) {
    this.input.value = q; this.beam(true);
    try { await this.onSubmit?.(q); } finally { /* 빔은 agent.plan 도착 때 panel 이 끈다 */ }
  }
}
