/* drawer-findings.js — 의심 큐 서랍 Q-1(우 420 · HUD 숫자 아래 · 종이 시트 · Linear 밀도).
   상태 칩 5 · 규칙 6 · 등급 A/B/C · 읍면동 39 · 정렬 3(점수 · 근거면적 · 갱신) · 검색(PNU·지번) · 행 56px ·
   행 ↔ 지도 도형 ↔ 읍면동 막대 삼각 호버 · 체크 다중 선택 → 하단 액션 바(현장조사 배정 · 오탐 · 보고서 초안 · CSV) ·
   서버 페이저(offset · 50) · CSV(UTF-8 BOM · 성명 열 0 · 공개 모드 없음) · 빈 상태 정직('의심 0 · 대조 완료 hh:mm').
   데이터 = api-survey.findings()(on: GET /survey/findings · off: findings-lite 사본) — 숫자는 전부 봉투. */
import { findings, loadLite, stateOf, STATE_KO, onFindingState, E, routeOn } from './api-survey.js';
import { openStateSheet, stateChip } from './actions.js';
import { numHtml, prov } from '../fx/provenance.js';
import { panelIn, panelOut, toast } from '../fx/glass.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const RULE_CLS = { R1: '건물', R2: '농경', R3: '비닐하우스', R4: '주차장', R5: '경작', R6: '건물' };
const STATES = ['open', 'assigned', 'inspected', 'closed', 'dismissed'];
const ST_SHORT = { open: '미조치', assigned: '배정', inspected: '확인', closed: '종결', dismissed: '오탐' };
const BARS = { A: 3, B: 2, C: 1 };
const PER = 50;

export function findingsDrawer(el, ctx) {
  const S = { open: false, q: { state: [], rule: [], priority: [], emd_cd: '', sort: 'score', q: '', offset: 0, limit: PER, ...(ctx.initial || {}) }, items: [], total: null, counts: {}, sel: new Set(), hover: null, seq: 0, doneAt: null };
  const emdName = new Map(ctx.rows.map((r) => [r.emd_cd, r.emd]));
  el.innerHTML = `
    <header><h2><span class="sv-w">의심 </span>큐 <span class="sv-tot"></span></h2><p class="sv-src"></p><button type="button" class="xi-btn xi-btn--br sv-unrail" aria-label="큐 펼치기 · 필지 카드 닫기" title="큐 펼치기 · 필지 카드 닫기">‹ 큐</button><button type="button" class="xi-x" aria-label="닫기">×</button></header>
    <div class="sv-strow"><nav class="sv-states" aria-label="상태"></nav><button type="button" class="sv-ftog" aria-expanded="true" aria-controls="sv-fbox">필터 <i aria-hidden="true">▾</i></button></div>
    <p class="sv-fsum"></p>
    <div class="sv-fbox" id="sv-fbox">
      <nav class="sv-filters" aria-label="규칙 · 등급">${['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].map((r) => `<button type="button" class="sv-chip" data-rule="${r}" aria-pressed="false" title="${esc(ctx.ruleName?.(r) || r)}">${r}</button>`).join('')}<i class="sv-gap"></i>${['A', 'B', 'C'].map((p) => `<button type="button" class="sv-chip" data-prio="${p}" aria-pressed="false">${p}</button>`).join('')}</nav>
      <div class="sv-row2"><select class="sv-emd" aria-label="읍면동"><option value="">읍면동 전체 39</option>${[...ctx.rows].sort((a, b) => a.emd.localeCompare(b.emd, 'ko')).map((r) => `<option value="${r.emd_cd}">${esc(r.emd)}</option>`).join('')}</select>
        <select class="sv-sort" aria-label="정렬"><option value="score">점수순</option><option value="evid_m2">근거면적순</option><option value="updated">갱신순</option></select>
        <input type="search" class="sv-q" placeholder="PNU · 지번" title="PNU · 지번 검색(예 아곡리 1053)" aria-label="PNU · 지번 검색" autocomplete="off"></div>
    </div>
    <div class="sv-hist" aria-label="읍면동별 의심(현재 규칙·등급)"></div><p class="sv-hist-l"><span>서 ← 읍면동 39 → 동</span><span class="sv-hist-v"></span></p>
    <ul class="sv-list" role="list"></ul>
    <div class="sv-sheetform sv-dsheet" hidden></div>
    <footer class="sv-foot"><div class="sv-actbar"></div><nav class="sv-pager"><button type="button" data-p="-1" aria-label="이전 50">‹</button><span class="sv-pg"></span><button type="button" data-p="1" aria-label="다음 50">›</button></nav></footer>`;
  const $ = (s) => el.querySelector(s);
  $('.xi-x').onclick = () => close();
  $('.sv-unrail').onclick = () => ctx.onUnrail?.();
  /* 필터 접기: 사용자가 누르면 그 선택을 따르고, 아니면 목록이 6줄(56×6)보다 짧을 때 자동으로 접는다(1280×800) */
  S.fx = 'auto';
  $('.sv-ftog').onclick = () => { S.fx = el.dataset.fold === '1' ? 'open' : 'closed'; fit(); };
  function fold(on) { el.dataset.fold = on ? '1' : '0'; $('.sv-ftog').setAttribute('aria-expanded', String(!on)); }
  /** 목록 6줄 보장 — 필터를 펼친 상태로 재 보고 모자라면 접는다(사용자 선택 우선) */
  function fit() {
    if (S.fx !== 'auto') { fold(S.fx === 'closed'); return; }
    fold(false);
    const lh = $('.sv-list').clientHeight;
    fold(lh < 6 * 56);
    el.dataset.rows = String(Math.floor($('.sv-list').clientHeight / 56));
  }
  new ResizeObserver(() => { if (S.open && el.dataset.rail !== '1') fit(); }).observe(el);
  function setRail(on) {
    el.dataset.rail = on ? '1' : '0';
    if (!on) requestAnimationFrame(() => fit());
  }
  function pin(pnu) { S.pin = pnu; el.querySelectorAll('.sv-item').forEach((li) => { const on = !!pnu && li.dataset.pnu === pnu; li.classList.toggle('is-pin', on); if (on && el.dataset.rail === '1') li.scrollIntoView({ block: 'nearest' }); }); }
  el.querySelectorAll('[data-rule]').forEach((b) => b.addEventListener('click', () => toggle('rule', b.dataset.rule)));
  el.querySelectorAll('[data-prio]').forEach((b) => b.addEventListener('click', () => toggle('priority', b.dataset.prio)));
  $('.sv-emd').onchange = (e) => { S.q.emd_cd = e.target.value; S.q.offset = 0; refresh(); };
  $('.sv-sort').onchange = (e) => { S.q.sort = e.target.value; S.q.offset = 0; refresh(); };
  let qt = 0; $('.sv-q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { S.q.q = e.target.value.trim(); S.q.offset = 0; refresh(); }, 180); });
  el.querySelectorAll('.sv-pager button').forEach((b) => b.addEventListener('click', () => { S.q.offset = Math.max(0, S.q.offset + +b.dataset.p * PER); refresh(); }));
  function toggle(k, v) { const a = new Set(S.q[k]); a.has(v) ? a.delete(v) : a.add(v); S.q[k] = [...a]; S.q.offset = 0; refresh(); ctx.onFilter?.(S.q); }

  /* 읍면동 막대(서 → 동 · 현재 규칙·등급 필터 · 사본 기준) — 행·지도와 삼각 호버 */
  async function hist() {
    const L = await loadLite(); if (!L) return;
    const R = S.q.rule.length ? new Set(S.q.rule) : null, P = S.q.priority.length ? new Set(S.q.priority) : null;
    const n = new Map(ctx.rows.map((r) => [r.emd_cd, 0]));
    for (const f of L.items) if ((!R || R.has(f.rule)) && (!P || P.has(f.priority))) n.set(f.emd_cd, (n.get(f.emd_cd) || 0) + 1);
    const max = Math.max(1, ...n.values());
    const h = $('.sv-hist');
    h.innerHTML = ctx.rows.map((r) => `<i data-cd="${r.emd_cd}" style="--h:${Math.max(1, Math.round((n.get(r.emd_cd) / max) * 34))}px" title="${esc(r.emd)} · ${n.get(r.emd_cd).toLocaleString('ko-KR')}건"></i>`).join('');
    h.querySelectorAll('i').forEach((b) => {
      b.addEventListener('mouseenter', () => { markEmd(b.dataset.cd); ctx.layers.hoverEmd(b.dataset.cd); $('.sv-hist-v').textContent = `${emdName.get(b.dataset.cd)} ${n.get(b.dataset.cd).toLocaleString('ko-KR')}건`; });
      b.addEventListener('mouseleave', () => { markEmd(null); ctx.layers.hoverEmd(null); $('.sv-hist-v').textContent = ''; });
      b.addEventListener('click', () => { S.q.emd_cd = S.q.emd_cd === b.dataset.cd ? '' : b.dataset.cd; $('.sv-emd').value = S.q.emd_cd; S.q.offset = 0; refresh(); });
    });
  }
  const markEmd = (cd) => { el.querySelectorAll('.sv-hist i').forEach((b) => b.classList.toggle('is-hover', b.dataset.cd === cd)); el.querySelectorAll('.sv-item').forEach((li) => li.classList.toggle('is-hover', !!cd && li.dataset.cd === cd)); };
  /** 지도·카드에서 들어온 호버(pnu) → 행 + 막대 */
  function markPnu(pnu) {
    S.hover = pnu;
    let cd = null;
    el.querySelectorAll('.sv-item').forEach((li) => { const on = !!pnu && li.dataset.pnu === pnu; li.classList.toggle('is-hover', on); if (on) { cd = li.dataset.cd; li.scrollIntoView({ block: 'nearest' }); } });
    el.querySelectorAll('.sv-hist i').forEach((b) => b.classList.toggle('is-hover', !!(pnu && (b.dataset.cd === (cd || String(pnu).slice(0, 8))))));
  }

  const rowHtml = (f) => {
    const src = f._api ? 'GET /survey/findings' : 'findings-lite.json';
    const ratio = f.parcel_m2 ? Math.round((f.evid_m2 / f.parcel_m2) * 100) : null;
    const st = stateOf(f);
    return `<li class="sv-item" data-id="${esc(f.id)}" data-pnu="${esc(f.pnu)}" data-cd="${esc(f.emd_cd)}" data-st="${st}">
      <button type="button" class="xi-check" aria-pressed="${S.sel.has(f.id)}" aria-label="선택"></button>
      <span class="sv-bars" title="등급 ${f.priority} · 점수 ${f.score}"><span>${[0, 1, 2].map((i) => `<i class="${i < BARS[f.priority] ? '' : 'o'}"></i>`).join('')}</span><b>${esc(f.priority)} ${numHtml(E(f.score, 'score', 'inferred', src, '우선순위 점수 · 규칙 기본점 + 근거면적 + 신뢰도 + 보강'), { unit: false, digits: 1 })}</b></span>
      <span class="sv-a">${esc(f.emd)} ${esc(f.ri)} ${esc(f.jibun)}</span><span class="sv-j" title="${esc(f.emd)} ${esc(f.ri)} ${esc(f.jibun)}">${esc(f.ri || f.emd)} ${esc(f.jibun)}</span>
      <span class="sv-r">${esc(f.rule)}</span>
      <span class="sv-b"><b>${esc(f.jimok)}</b> → AI ${RULE_CLS[f.rule]} ${numHtml(E(Math.round(f.evid_m2), 'm2', 'inferred', src, '근거면적 · 검수 전'))}${ratio != null ? `(${ratio}%)` : ''} · 신뢰도 ${numHtml(E(f.conf, 'ratio', 'inferred', src), { unit: false, digits: 2 })}</span>
      <span class="sv-s">${stateChip({ ...f, _row: f })}</span></li>`;
  };
  function actbar() {
    const n = S.sel.size, bar = $('.sv-actbar'); el.classList.toggle('sv-sel', n > 0);
    const pub = ctx.canExport ? '' : 'disabled';
    bar.innerHTML = n
      ? `<button type="button" class="xi-btn xi-btn--ink sv-as" ${ctx.canWrite ? '' : 'disabled'}>${n}건 현장조사 배정 ›</button><button type="button" class="xi-btn xi-btn--br sv-ds" ${ctx.canWrite ? '' : 'disabled'}>오탐(사유)</button><button type="button" class="xi-btn xi-btn--br sv-rp">보고서 초안 ›</button><small>${n}건 선택 · <button type="button" class="xi-btn xi-btn--br sv-clr" style="height:26px;padding:0 6px">해제</button></small>`
      : `<button type="button" class="xi-btn xi-btn--br sv-rp">보고서 초안 ›</button><button type="button" class="xi-btn xi-btn--br sv-csv" ${pub}>CSV</button><small title="${ctx.canWrite ? '행을 체크해 배정·오탐' : '열람 전용'}">${routeOn() ? '저장' : '시연'}</small>`;
    bar.querySelector('.sv-as')?.addEventListener('click', () => sheet('assign'));
    bar.querySelector('.sv-ds')?.addEventListener('click', () => sheet('dismiss'));
    bar.querySelector('.sv-clr')?.addEventListener('click', () => { S.sel.clear(); el.querySelectorAll('.sv-item .xi-check').forEach((c) => c.setAttribute('aria-pressed', 'false')); actbar(); });
    bar.querySelector('.sv-rp')?.addEventListener('click', () => ctx.onReport({ emd_cd: S.q.emd_cd || selEmd() || '', rule: S.q.rule.length === 1 ? S.q.rule[0] : (selRule() || ''), top: 20 }));
    bar.querySelector('.sv-csv')?.addEventListener('click', () => csv());
  }
  const selItems = () => S.items.filter((f) => S.sel.has(f.id));
  const selEmd = () => { const s = new Set(selItems().map((f) => f.emd_cd)); return s.size === 1 ? [...s][0] : ''; };
  const selRule = () => { const s = new Set(selItems().map((f) => f.rule)); return s.size === 1 ? [...s][0] : ''; };
  function sheet(mode) {
    openStateSheet($('.sv-dsheet'), { mode, items: selItems(), role: ctx.role, onDone: (r) => { if (r.ok.length) { S.sel.clear(); refresh(); } ctx.onState?.(r); } });
  }

  async function refresh() {
    const my = ++S.seq;
    el.querySelectorAll('[data-rule]').forEach((b) => b.setAttribute('aria-pressed', String(S.q.rule.includes(b.dataset.rule))));
    el.querySelectorAll('[data-prio]').forEach((b) => b.setAttribute('aria-pressed', String(S.q.priority.includes(b.dataset.prio))));
    $('.sv-sort').value = S.q.sort; $('.sv-emd').value = S.q.emd_cd;
    const r = await findings(S.q);
    if (my !== S.seq) return;
    S.items = r.items; S.total = r.total; S.counts = r.counts; S.via = r.via;
    el.dataset.via = r.via; el.dataset.total = String(r.total.value);
    $('.sv-tot').innerHTML = numHtml(r.total, { unit: false });
    $('.sv-src').innerHTML = '';
    prov($('.sv-src').appendChild(document.createElement('span')), r.total, { label: r.via === 'api' ? 'GET /survey/findings' : '저장 파일' });
    $('.sv-states').innerHTML = STATES.map((k) => `<button type="button" class="sv-chip" data-st="${k}" aria-pressed="${S.q.state.includes(k)}" title="${STATE_KO[k]}">${ST_SHORT[k]} ${r.counts[k] ? numHtml(r.counts[k], { unit: false }) : '<span class="xi-n">0</span>'}</button>`).join('');
    el.querySelectorAll('.sv-states [data-st]').forEach((b) => b.addEventListener('click', () => toggle('state', b.dataset.st)));
    const list = $('.sv-list');
    if (!r.items.length) {
      const t = S.doneAt ? new Date(S.doneAt).toTimeString().slice(0, 5) : '—';
      list.innerHTML = `<li class="cw-void xi-void sv-empty">${S.q.state.length || S.q.q || S.q.rule.length || S.q.priority.length || S.q.emd_cd ? `이 조건의 의심 0 · 대조 완료 ${t}` : `의심 0 · 대조 완료 ${t}`}</li>`;
    } else list.innerHTML = r.items.map(rowHtml).join('');
    list.querySelectorAll('.sv-item').forEach((li) => {
      const f = S.items.find((x) => x.id === li.dataset.id);
      li.addEventListener('mouseenter', () => { ctx.layers.highlight(f.pnu); markPnu(f.pnu); ctx.onHover?.(f); });
      li.addEventListener('mouseleave', () => { ctx.layers.highlight(ctx.pinned?.() || null); markPnu(null); ctx.onHover?.(null); });
      li.querySelector('.xi-check').addEventListener('click', (ev) => { ev.stopPropagation(); const on = !S.sel.has(f.id); on ? S.sel.add(f.id) : S.sel.delete(f.id); ev.currentTarget.setAttribute('aria-pressed', String(on)); actbar(); });
      li.addEventListener('click', () => ctx.onOpen(f));
    });
    const tot = r.total.value || 0;
    $('.sv-pg').innerHTML = tot ? `${(S.q.offset + 1).toLocaleString('ko-KR')}–${Math.min(tot, S.q.offset + PER).toLocaleString('ko-KR')} / ${numHtml(r.total, { unit: false })}` : '0';
    el.querySelector('.sv-pager [data-p="-1"]').disabled = S.q.offset <= 0;
    el.querySelector('.sv-pager [data-p="1"]').disabled = S.q.offset + PER >= tot;
    actbar();
    hist();
    const fs = [S.q.rule.join('·'), S.q.priority.join('·'), S.q.emd_cd ? emdName.get(S.q.emd_cd) : '', S.q.q ? `“${S.q.q}”` : ''].filter(Boolean);
    $('.sv-fsum').textContent = `${fs.length ? fs.join(' · ') : '전체'} · ${{ score: '점수순', evid_m2: '근거면적순', updated: '갱신순' }[S.q.sort]}`;
    el.classList.toggle('sv-sel', S.sel.size > 0);
    if (el.dataset.rail !== '1') fit();
    if (S.pin) pin(S.pin);
    ctx.onUrl?.(S.q);
    document.documentElement.dataset.fq = JSON.stringify({ rule: S.q.rule, priority: S.q.priority, emd: S.q.emd_cd, state: S.q.state, n: tot });
  }
  async function csv() {
    if (!ctx.canExport) return;
    const all = [];
    for (let off = 0; off < 25000; off += 1000) { const r = await findings({ ...S.q, offset: off, limit: 1000 }); all.push(...r.items); if (r.items.length < 1000) break; }
    const cols = [['rank', '순위'], ['priority', '등급'], ['score', '점수'], ['rule', '규칙'], ['pnu', 'PNU'], ['emd', '읍면동'], ['ri', '리'], ['jibun', '지번'], ['jimok', '지목'], ['parcel_m2', '필지면적_m2'], ['evid_m2', '근거면적_m2'], ['conf', '신뢰도'], ['yongdo', '용도지역'], ['nongup', '농업진흥'], ['state', '상태'], ['lng', '경도'], ['lat', '위도']];
    const rows = all.map((f) => cols.map(([k]) => (k === 'state' ? STATE_KO[stateOf(f)] : f[k])));
    const note = ['# AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님 · 임계 [추정 초기값] · 연속지적 2026-09-24 · 소유자 성명 없음'];
    const text = '﻿' + [...note, cols.map((c) => c[1]).join(','), ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = `남원_의심큐_${S.q.rule.join('') || '전체'}${S.q.priority.join('')}_${all.length}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`CSV 내보내기 · ${all.length.toLocaleString('ko-KR')}행 · BOM · 성명 열 없음`);
    document.documentElement.dataset.csv = String(all.length);
  }
  onFindingState(() => { if (S.open) refresh(); });
  async function open(q = {}) {
    Object.assign(S.q, q, { offset: q.offset ?? 0 });
    S.open = true; el.hidden = false; document.documentElement.dataset.fdrawer = '1';
    await refresh();
    fit();
    panelIn(el);
    ctx.onOpenChange?.(true);
  }
  async function close() {
    if (!S.open) return; S.open = false; S.sel.clear();
    await panelOut(el); delete document.documentElement.dataset.fdrawer; el.dataset.rail = '0';
    ctx.layers.highlight(null); ctx.onOpenChange?.(false); ctx.onUrl?.(null);
  }
  return { S, open, close, refresh, markPnu, setRail, pin, fit, setDoneAt: (t) => { S.doneAt = t; }, csv };
}
