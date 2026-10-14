/* report-draft.js — 보고서 서랍 '초안 작성' 탭의 F2-A 몫(F2-E 에이전트가 XI.provide('report-draft') 로 맡으면 그쪽이 그린다).
   내려받기 = 서버 GET /survey/reports/draft?format=hwpx(한글 문서 · 공용 서식 · LLM 없이 · 10-14 원칙 250). 서버가 안 되면 '내려받지 못했습니다'.
   (브라우저에서 문서를 따로 짓지 않는다 — 모든 문서는 서버 한 곳 · 같은 서식)
   고정 문구: 'AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님'. 숫자는 전부 봉투(화면) · 문서에는 출처 줄. 성명 열 0. */
import { E, loadLite, loadEmd, loadRules, stateOf, STATE_KO, draftDoc, routeOn, routeNote } from './api-survey.js';
import { numHtml } from '../fx/provenance.js';
import { toast } from '../fx/glass.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FIXED = 'AI 추론 · 결과 확인 전 · 현장 확인 전 · 위법 판정 아님 — 현장조사 대상 후보 목록이며 행정 처분의 근거가 아니다.';

/** 초안 데이터(서버 draft json 과 같은 뼈대) */
export async function draftData({ emd_cd = '', rule = '', top = 20 }) {
  const [L, M, R] = await Promise.all([loadLite(), loadEmd(), loadRules()]);
  const rows = (L?.items || []).filter((f) => (!emd_cd || f.emd_cd === emd_cd) && (!rule || f.rule === rule));
  const byRule = {}, byPrio = { A: 0, B: 0, C: 0 }, byState = {};
  for (const f of rows) { (byRule[f.rule] ||= { A: 0, B: 0, C: 0, n: 0 }); byRule[f.rule][f.priority]++; byRule[f.rule].n++; byPrio[f.priority]++; const s = stateOf(f); byState[s] = (byState[s] || 0) + 1; }
  const emd = M?.rows.find((r) => r.emd_cd === emd_cd);
  const topRows = [...rows].sort((a, b) => b.score - a.score || a.rank - b.rank).slice(0, top);
  return {
    title: `실태조사 초안 · ${emd ? emd.emd : '남원시 전역'} · ${rule ? `${rule} ${R?.items.find((r) => r.id === rule)?.name || ''}` : '규칙 R1–R6'}`,
    emd, rule, top, n: rows.length, parcels: new Set(rows.map((f) => f.pnu)).size, emdParcels: emd?.parcels ?? M?.totals.parcels, byRule, byPrio, byState, topRows,
    rules: R?.items || [], as_of: '2026-09-24', source: 'findings-lite.json · findings-emd.json(02. 데이터/survey 사본)',
  };
}

export async function renderDraft(slot, q = {}) {
  slot.innerHTML = '<p class="xi-hint">초안 만드는 중 · 실데이터</p>';
  const d = await draftData(q);
  const src = d.source;
  const pct = d.emdParcels ? ((d.parcels / d.emdParcels) * 100).toFixed(1) : null;
  const ruleRows = Object.entries(d.byRule).sort();
  slot.innerHTML = `
    <h2>${esc(d.title)}</h2>
    <p class="xi-hint">서식 survey-emd · 영상 2023 25cm 항공 · 2025 LX 드론(A02) · 대장 V-World 연속지적 2026-09-24 · 규칙 v1.0 · 임계 <b data-basis="estimate">추정</b> 초기값</p>
    <div class="sv-dl"><button type="button" class="xi-btn xi-btn--ink sv-doc">한글 문서 내려받기</button><button type="button" class="xi-btn xi-btn--br sv-dcsv">CSV(BOM)</button><small class="sv-dvia">${routeOn() ? '' : esc(routeNote())}</small></div>
    <h3>1. 개요</h3>
    <p>${esc(d.emd ? d.emd.emd : '남원시')} 필지 ${numHtml(E(d.emdParcels, '필지', 'recorded', 'V-World 연속지적 2026-09-24'), { unit: false })}필지를 2023 AI 분석 결과와 대조한 결과, 규칙 ${esc(d.rule || 'R1–R6')}에 해당하는 의심 ${numHtml(E(d.n, 'count', 'inferred', src), { unit: false })}건(${numHtml(E(d.parcels, '필지', 'inferred', src), { unit: false })}필지${pct ? ` · ${pct}%` : ''})이 현장조사 대상 후보로 추출되었다.</p>
    <h3>2. 집계 · 규칙 × 등급 × 상태</h3>
    <table class="xi-table"><thead><tr><th>규칙</th><th class="r">A</th><th class="r">B</th><th class="r">C</th><th class="r">계</th></tr></thead><tbody>
      ${ruleRows.map(([k, v]) => `<tr><td>${esc(k)} ${esc(d.rules.find((r) => r.id === k)?.name || '')}</td>${['A', 'B', 'C'].map((p) => `<td class="r">${numHtml(E(v[p], 'count', 'inferred', src), { unit: false })}</td>`).join('')}<td class="r">${numHtml(E(v.n, 'count', 'inferred', src), { unit: false })}</td></tr>`).join('')}</tbody></table>
    <p class="xi-hint">상태 ${Object.entries(d.byState).map(([k, v]) => `${STATE_KO[k]} ${v.toLocaleString('ko-KR')}`).join(' · ')}</p>
    <h3>3. 의심 상위 ${d.topRows.length}</h3>
    <table class="xi-table"><thead><tr><th>#</th><th>PNU · 지번</th><th>지목</th><th>규칙</th><th class="r">근거㎡</th><th class="r">신뢰도</th><th>상태</th></tr></thead><tbody>
      ${d.topRows.map((f, i) => `<tr><td>${i + 1}</td><td><span class="mono">${esc(f.pnu)}</span><br>${esc(f.emd)} ${esc(f.ri)} ${esc(f.jibun)}</td><td>${esc(f.jimok)}</td><td>${esc(f.rule)} ${esc(f.priority)}</td><td class="r">${numHtml(E(Math.round(f.evid_m2), 'm2', 'inferred', src), { unit: false })}</td><td class="r">${numHtml(E(f.conf, 'ratio', 'inferred', src), { unit: false, digits: 2 })}</td><td>${esc(STATE_KO[stateOf(f)])}</td></tr>`).join('')}</tbody></table>
    <h3>4. 근거 영상</h3><p>2023 항공정사 25cm(전북 비도시 도엽) · AI 4클래스 재추론(aerial25/best · 검수 전). 드론 AOI(덕과면 0.8×0.9 km) 안은 2025-04/06/08/10 4시점, 밖은 2023 · 2025 두 시점.</p>
    <h3>5. 법적 근거</h3><p><span class="cw-void xi-void">법령 인용 · 2차(법령 RAG) — 농지법 §54 등 [법령 확인]</span></p>
    <h3>6. 조치 제안</h3><p>상위 등급(A)부터 현장조사 배정 → 현장 확인(사진·GPS) → 판정 입력. 건축물대장·농지전용 허가 대장과 먼저 대조하면 R1·R6 오탐을 줄일 수 있다.</p>
    <p class="sv-fixed">${esc(FIXED)}</p>`;
  slot.querySelector('.sv-doc').addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    const file = routeOn() ? await draftDoc(q) : null;
    b.disabled = false;
    if (!file) { toast('내려받지 못했습니다'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file.blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('내려받았습니다');
    document.documentElement.dataset.doc = file.name;
  });
  slot.querySelector('.sv-dcsv').addEventListener('click', () => {
    const cols = ['순위', '등급', '점수', '규칙', 'PNU', '읍면동', '리', '지번', '지목', '필지면적_m2', '근거면적_m2', '신뢰도', '상태'];
    const rows = d.topRows.map((f) => [f.rank, f.priority, f.score, f.rule, f.pnu, f.emd, f.ri, f.jibun, f.jimok, f.parcel_m2, f.evid_m2, f.conf, STATE_KO[stateOf(f)]]);
    const text = '﻿' + ['# ' + FIXED, cols.join(','), ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = `실태조사_초안_상위${d.topRows.length}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  slot.dataset.ready = '1';
  return d;
}
