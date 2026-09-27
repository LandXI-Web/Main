/* report-writer.js — 보고서 서랍 '초안 작성' 탭(AG-2 · 종이 무대 SPLIT-5050). XI.provide('report-draft') 로 슬롯을 맡는다.
   POST /agent/report/draft → SSE: 계획 4행(survey_stats · survey_findings · llm_write · survey_reports_draft) → agent.token 도착 즉시 타이핑 →
   숫자 칩 락온 → done(검증기 · 인용 [n]) → '내보내기 .docx'(서버 파일 · Bearer) · 'CSV(BOM)'. [n] 클릭 → 지도 flyTo + 필지 카드 v2(서랍 유지).
   off · llm_unavailable → ag0-report.ndjson(실제 run 녹음) 재생 · 표기 '기록 · 저장 결과 재생'. 법령 인용 = 2차 결손. */
import { API, probe, session } from '../shared/api-v1.js';
import * as A from './api-agent.js';
import { renderMd, placeholders, chip, esc } from './answer.js';
import * as R from './replay.js';

const EMD = { '아영면': '52190450', '운봉읍': '52190250', '인월면': '52190420', '산내면': '52190440', '금지면': '52190350', '대강면': '52190360', '송동면': '52190330', '사매면': '52190380' };
/** 필지 윤곽(실제 연속지적 폴리곤 · 서버 citations.geom) → 56px SVG */
function silhouette(g) {
  const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  const pts = rings.flat(); if (!pts.length) return '';
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = 52 / Math.max(x1 - x0, (y1 - y0) * 1.23, 1e-9);
  const d = rings.map((r) => 'M' + r.map((p) => `${(2 + (p[0] - x0) * k).toFixed(1)} ${(54 - (p[1] - y0) * 1.23 * k).toFixed(1)}`).join('L') + 'Z').join('');
  return `<svg viewBox="0 0 56 56" aria-label="필지 윤곽(연속지적)"><path d="${d}"/></svg>`;
}
const CD2EMD = Object.fromEntries(Object.entries(EMD).map(([k, v]) => [v, k]));

export class ReportWriter {
  constructor(slot, { XI, opts = {}, last = () => null, cite }) {
    this.slot = slot; this.XI = XI; this.cite = cite; this.S = { envs: {}, meta: {}, text: '', citations: [], artifact: null, run: null, replay: false, done: false };
    const lr = last();
    const fromLast = lr?.citations?.find((c) => c.kind === 'stats' && c.emd_cd);
    this.q = { emd_cd: opts.emd_cd || fromLast?.emd_cd || '52190450', rule: opts.rule || 'R1', top: opts.top ? Math.min(+opts.top, 10) : 8 };
    this.emdName = CD2EMD[this.q.emd_cd] || this.q.emd_cd;
    document.documentElement.dataset.agentDraft = '1';
    slot.innerHTML = '';
    const el = document.createElement('div'); el.className = 'ag-paper'; el.dataset.stage = 'paper';
    el.innerHTML = `<div class="ag-paper-top"><b>초안 작성</b><span>서식 survey-emd · ${esc(this.emdName)} · ${esc(this.q.rule)} · 상위 ${this.q.top}</span><span class="ag-pmodel"></span><span class="ag-pmast"></span></div>
      <ol class="ag-paper-plan" aria-label="계획 단계"></ol>
      <div class="ag-split"><article class="ag-doc" aria-live="polite"><h2>${esc(this.emdName)} 농지 실태조사 초안</h2>
        <p class="ag-meta">대장 V-World 연속지적(2026-09-24) · 영상 2023 항공 25cm · 2025 드론(A02) · 규칙 ${esc(this.q.rule)} · 임계 추정 초기값 · <b>초안 · 검토 필요</b></p><div class="ag-body"></div></article>
        <aside class="ag-ev" aria-label="근거 목록"><h4>근거 [n] · 필지 · 봉투</h4><div class="ag-evl"></div></aside></div>
      <div class="ag-paper-bot"><button type="button" class="ag-btn ag-btn--fill ag-docx" disabled>내보내기 .docx</button><button type="button" class="ag-btn ag-btn--line ag-csv" disabled>CSV(BOM)</button>
        <span class="ag-void2">법령 인용 · 2차</span><span class="ag-req"></span><span class="ag-pstate">작성 준비</span></div>`;
    slot.appendChild(el);
    this.el = el;
    const s = session.get(); el.querySelector('.ag-req').textContent = `요청자 ${s?.role ? `${s.realm}·${s.role}` : '현재 계정'}`;
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-cite]'); if (b) { e.preventDefault(); this.go(+b.dataset.cite); } });
    el.querySelector('.ag-docx').addEventListener('click', () => this.docx());
    el.querySelector('.ag-csv').addEventListener('click', () => this.csv());
    this.start();
  }
  $(s) { return this.el.querySelector(s); }
  async start() {
    const p = await probe();
    if (p.mode !== 'on') return this.replay('시연 · 에이전트 연결 없음(LX_API=off)');
    const h = await A.alive();
    if (!h.alive) return this.replay('시연 · 에이전트 연결 없음(llm_unavailable)');
    try {
      const j = await A.startDraft({ emd_cd: this.q.emd_cd, rule: this.q.rule, top: this.q.top });
      this.S.run = j.run.id; document.documentElement.dataset.agentDraftRun = j.run.id;
      this.$('.ag-pstate').textContent = `run ${j.run.id.slice(-6)} · 작성 중`;
      this.stream = A.events(j.run.id, (n, d) => this.on(n, d));
    } catch (e) {
      if (e.code === 'llm_unavailable' || e.status === 503) return this.replay('시연 · 에이전트 연결 없음(llm_unavailable 503)');
      this.$('.ag-body').innerHTML = `<p class="cw-void">${esc(e.code)} · ${esc(e.message)}</p>`;
    }
  }
  async replay(why) {
    this.S.replay = true;
    this.$('.ag-pmast').innerHTML = `<span class="ag-void2">기록 · 저장 결과 재생 — ${esc(why)}</span>`;
    const lines = await R.load(R.pick('보고서', 'report'));
    if (!lines) { this.$('.ag-body').innerHTML = '<p class="cw-void">녹음 파일 없음</p>'; return; }
    this.player = R.play(lines, (n, d) => this.on(n, d));
  }
  on(name, d) {
    if (!d) return;
    const plan = this.$('.ag-paper-plan');
    if (name === 'agent.plan') {
      plan.innerHTML = (d.steps || []).map((s) => `<li data-i="${s.i}" data-state="wait" title="${esc(s.why || '')}"><b>${esc(s.tool)}</b><span class="ms"></span></li>`).join('');
    } else if (name === 'agent.tool.call') {
      const li = plan.querySelector(`[data-i="${d.i}"]`); if (li) li.dataset.state = 'run';
      if (d.tool === 'llm_write') { this.$('.ag-doc').dataset.live = '1'; this.$('.ag-pstate').textContent = '서술 작성 중 · 토큰 도착 즉시'; }
    } else if (name === 'agent.tool.result') {
      const li = plan.querySelector(`[data-i="${d.i}"]`);
      if (li) { li.dataset.state = d.ok ? 'done' : 'err'; li.querySelector('.ms').textContent = `${Number(d.ms).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} ms`; }
      if (d.summary) Object.assign(this.S.envs, d.summary);
      if (d.meta) Object.assign(this.S.meta, d.meta);
      if (d.citations?.length) { this.S.citations.push(...d.citations); this.evidence(); }
      if (d.artifact) this.S.artifact = d.artifact;
    } else if (name === 'agent.token') {
      this.S.text += d.delta || '';
      const body = this.$('.ag-body');
      const known = new Set([...body.querySelectorAll('[data-env]')].map((x) => x.dataset.env));
      const fresh = new Set(placeholders(this.S.text).filter((k) => !known.has(k)));
      body.innerHTML = renderMd(this.S.text, { envs: this.S.envs, meta: this.S.meta, live: true, fresh });
      document.documentElement.dataset.agentDraftTyping = String(this.S.text.length);
    } else if (name === 'agent.done') {
      this.S.done = true;
      if (d.envelopes) Object.assign(this.S.envs, d.envelopes);
      if (d.env_meta) Object.assign(this.S.meta, d.env_meta);
      if (d.citations) { this.S.citations = d.citations; this.evidence(); }
      if (d.artifact) this.S.artifact = d.artifact;
      this.$('.ag-doc').dataset.live = '0';
      this.$('.ag-body').innerHTML = renderMd(d.answer_md || this.S.text, { envs: this.S.envs, meta: this.S.meta, unverified: d.unverified || [], uncited: d.uncited || [], flags: d.meaning_flags || [] })
        + `<p class="ag-meta">${esc(d.artifact?.fixed || 'AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님')}</p>`;
      const m = d.model || {};
      this.$('.ag-pmodel').innerHTML = m.id ? `${esc(m.id)} · ${esc(m.backend === 'vllm' ? 'vLLM' : m.backend || '')} · 온프레미스 · ${d.tokens ? chip(d.tokens, { meaning: '토큰', id: 'tok' }) : ''}` : '';
      this.$('.ag-pstate').textContent = `초안 · 검토 필요 · 인용 없는 문장 ${(d.uncited || []).length} · 검증 안 된 숫자 ${(d.unverified || []).length} · 봉투 뜻 확인 필요 ${(d.meaning_flags || []).length}${d.bad_cites?.length ? ` · 없는 인용 번호 ${d.bad_cites.length} 제거` : ''}${this.S.replay ? ' · 기록 재생' : ''}`;
      this.$('.ag-docx').disabled = !(this.S.artifact && !this.S.replay);
      this.$('.ag-docx').title = this.S.replay ? '기록 재생 — 서버 파일 없음(시연)' : this.S.artifact?.filename || '';
      this.$('.ag-csv').disabled = false;
      document.documentElement.dataset.agentDraftFlags = String((d.meaning_flags || []).length);
      document.documentElement.dataset.agentDraftDocxPath = d.artifact?.docx?.path || '';
      window.LXAgentDraft = { done: d, replay: this.S.replay };      // 검사용(e2e · 판정): 봉투 뜻 · 인용 · 검증기 결과
      document.documentElement.dataset.agentDraftDone = '1';
    } else if (name === 'agent.failed') {
      if (d.error === 'llm_unavailable' && !this.S.replay) { this.replay('시연 · 에이전트 연결 없음(실행 중 llm_unavailable)'); return; }
      this.$('.ag-pstate').textContent = `${d.error} · ${d.message || ''}`;
    }
  }
  evidence() {
    const cits = this.S.citations;
    this.$('.ag-evl').innerHTML = cits.map((c) => {
      const evs = (c.env || []).map((id) => (this.S.envs[id] ? chip(this.S.envs[id], { meaning: this.S.meta[id], id }) : '')).filter(Boolean).slice(0, 2).join(' ');
      return `<div class="ag-evi" data-cite="${c.n}" role="button" tabindex="0"><span class="ag-evn">[${c.n}]</span><div>`
        + `<div class="ag-evt">${esc(c.kind === 'stats' ? c.label.split(' · ')[0] : c.addr || c.label)}</div>`
        + (c.geom ? silhouette(c.geom) : '')
        + `<div class="ag-evs">${c.pnu ? `<span class="mono">${esc(c.pnu)}</span> · ${esc(c.rule || '')} ${esc(c.priority || '')}` : esc(c.label || '')}</div>`
        + `${evs ? `<div class="ag-evs">${evs}</div>` : ''}</div></div>`;
    }).join('');
  }
  go(n) {
    this.el.querySelectorAll('.ag-evi').forEach((x) => x.setAttribute('aria-current', String(+x.dataset.cite === n)));
    document.documentElement.dataset.agentDraftCite = String(n);
    this.cite?.(n, this.S.citations);
  }
  async docx() {
    const a = this.S.artifact; if (!a) return;
    const b = this.$('.ag-docx'); b.disabled = true;
    try {
      const r = await A.downloadDocx(a.docx_url, a.filename);
      this.$('.ag-pstate').textContent = `${r.name} · ${Math.round(r.bytes / 1024)} KB 내려받음`;
      document.documentElement.dataset.agentDocx = r.name;
      this.XI.toast?.(`${r.name} · 서버 파일(${a.source || ''})`);
    } catch (e) { this.$('.ag-pstate').textContent = `${e.code} · ${e.message}`; }
    b.disabled = false;
  }
  csv() {
    const rows = [['n', 'pnu', '주소', '규칙', '등급', '근거면적_m2', '근거', '봉투출처']];
    for (const c of this.S.citations.filter((x) => x.kind === 'parcel')) {
      const e = this.S.envs[(c.env || [])[0]];
      rows.push([c.n, c.pnu, c.addr, c.rule, c.priority, e?.value ?? '', e?.basis ?? '', e?.source ?? '']);
    }
    const txt = '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `실태조사_근거_${this.emdName}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
}
