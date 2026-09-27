/* parcel-timeline.js — 필지 이력 타임라인 H-1(카드 아래 펼침 750 · Palantir '관계 순회' 장치를 시간축으로).
   마커 6: ◆ 대장 · ▣ 영상 · ● 판독 · ▲ 의심 · ■ 현장 · ▶ 조치. 시간축 = 하단 V5 스크러버와 같은 축 — 스크러버를 끌면 커서가 따라오고
   영상 마커를 누르면 스크러버(배경 영상)가 그 시점으로 간다. 이벤트 원천: 02. 데이터/survey/namwon-parcel-timeline.json(6,818필지) ·
   GET /survey/parcels/{pnu}?with=history(on) · 없으면 대장 + 2023 판독 두 줄과 '이력 · 2023 단일 시점' 결손(정직). */
import { numHtml } from '../fx/provenance.js';
import { E, STATE_KO } from './api-survey.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MK = { ledger: '◆', img: '▣', ai: '●', sus: '▲', field: '■', act: '▶' };
const KO = { ledger: '대장', img: '영상', ai: '판독', sus: '의심', field: '현장', act: '조치' };
const T0 = Date.UTC(2023, 0, 1), T1 = Date.UTC(2026, 11, 31);
const tOf = (s) => { const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(s)); if (!m) return null; return Date.UTC(+m[1], m[2] ? +m[2] - 1 : 6, m[3] ? +m[3] : 1); };
export const xOf = (t) => Math.max(0, Math.min(1, (t - T0) / (T1 - T0)));
const CLS_KO = { bld: '건물', crop: '경작지', park: '주차장', gh: '비닐하우스', uncrop: '비경작지' };

/** 이벤트 목록 조립(원천 섞지 않고 각 이벤트에 출처) */
export function buildEvents({ pnu, facts, finds = [], row = null, tl = null, epochs = [] }) {
  const ev = [];
  const src23 = 'AI 4클래스 재추론 · 2023 항공정사 25cm';
  // ◆ 대장
  if (facts?.gosi_year) ev.push({ k: 'ledger', t: `${facts.gosi_year}-01`, title: `공시지가 기준 ${facts.gosi_year}-01`, body: facts.jiga ? `공시지가 ${numHtml(E(facts.jiga, 'krw_m2', 'recorded', 'V-World 연속지적 JIGA', `${facts.gosi_year}-01 기준`), {})}` : '공시지가 공란', src: 'V-World 연속지적' });
  ev.push({ k: 'ledger', t: '2026-09-24', title: '연속지적 수집 2026-09-24', body: `지목 ${esc(facts?.jimok || '—')} · ${facts?.area_m2 ? numHtml(E(facts.area_m2, 'm2', 'recorded', 'V-World LP_PA_CBND_BUBUN', 'EPSG:5186 계산'), {}) : '—'}`, src: 'V-World LP_PA_CBND_BUBUN' });
  // ▣ 영상(스크러버 시점) + ● 판독
  for (const e of epochs) ev.push({ k: 'img', t: e.date, title: `${e.label} · ${e.gsd}`, body: e.name || '', src: e.id, epoch: e.i });
  const a23 = facts?.a23 || {};
  const a23txt = ['bld', 'crop', 'park', 'gh'].filter((k) => (a23[k + '_m2'] || 0) > 0).map((k) => `${CLS_KO[k]} ${Math.round(a23[k + '_m2']).toLocaleString('ko-KR')}㎡`).join(' · ') || '탐지 없음';
  ev.push({ k: 'ai', t: '2023', title: '2023 판독 · aerial25/best(검수 전 · 촬영월 미상)', body: a23txt, src: src23 });
  // 원천 이력(timeline json · 2025 A02 · 변화지수)
  if (tl?.events) for (const e of tl.events) {
    if (e.kind === 'ai' && String(e.t).startsWith('2025')) ev.push({ k: 'ai', t: String(e.t).slice(0, 7), title: '2025 A02 판독 · 경작/비경작·비닐하우스(촬영월 미상)', body: Object.entries(e.area_m2 || {}).map(([k, v]) => `${CLS_KO[k] || k} ${Math.round(v).toLocaleString('ko-KR')}㎡`).join(' · '), src: e.src });
    if (e.kind === 'change') ev.push({ k: 'ai', t: e.t, title: `변화 지수(비지도) ${e.from} → ${e.t}`, body: `${e.cls} ${Math.round(e.m2)}㎡ · ${e.n}건`, src: e.src, lane: 1 });
  }
  // ▲ 의심(대조 2026-09-24 · 규칙마다)
  for (const f of finds) ev.push({ k: 'sus', t: '2026-09-24', title: `${f.rule} ${f.priority} ${f.score} · 대장 대조`, body: `${esc(f.rule_nm || '')} · 근거 ${Math.round(f.evid_m2).toLocaleString('ko-KR')}㎡`, src: 'survey 규칙 R1–R6 v1.0 [추정 초기 임계]', lane: finds.length > 1 ? 1 : 0 });
  // ■ 현장(배정 · 오탐 · 현장 확인 — 실제 상태 기록만 · 날짜 = 서버 updated_at 또는 이 세션에서 쓴 시각)
  const when = (row?.updated_at || row?.at || '').slice(0, 10) || null;
  if (row && row.state && row.state !== 'open' && when) ev.push({ k: 'field', t: when, title: `${STATE_KO[row.state] || row.state}${row.basis === 'demo' ? ' · 시연' : ''}`, body: [row.assignee, row.planned_for ? `예정 ${row.planned_for}` : '', row.reason].filter(Boolean).map(esc).join(' · '), src: row.saved ? 'POST /survey/findings/{id}/state · audit_log' : '시연 · 저장 안 됨', lane: 1 });
  // ▶ 조치 — 실제 종결(closed) 전이가 있을 때만 레일에 그린다(원천에 없는 날짜 0 · 2차 판정). 없으면 목록 끝 결손 줄(날짜 없음)
  if (row?.state === 'closed' && when) ev.push({ k: 'act', t: when, title: '조치 · 종결', body: esc(row.reason || ''), src: 'POST /survey/findings/{id}/state · audit_log' });
  return ev.filter((e) => tOf(e.t) != null).sort((a, b) => tOf(a.t) - tOf(b.t));
}

/**
 * timeline(host, { events, summary, epochs, scrub, onPick }) — 렌더 + 스크러버 동기. 반환 { sync(e), el }
 * epochs = [{i, date, label, gsd, id}] (스크러버 시점과 같은 순서)
 */
export function timeline(host, { events, summary = [], epochs = [], onPick }) {
  const years = [2023, 2024, 2025, 2026];
  // 같은 자리 마커(예: ▣ 2023 영상 · ● 2023 판독 — 둘 다 촬영월 미상 = 연 중앙)는 윗줄로 비켜 놓는다(겹침 · 클릭 가로챔 0)
  { const last = [-1, -1]; for (const e of events) { const x = xOf(tOf(e.t)); let ln = e.lane ? 1 : 0; if (Math.abs(x - last[ln]) < 0.035) ln = 1 - ln; if (Math.abs(x - last[ln]) < 0.035) ln = e.lane ? 1 : 0; e.lane = ln; last[ln] = x; } }
  host.innerHTML = `<h4><span>이력 · ${events.length}건</span><span>시간축 = 하단 시점 스크러버</span></h4>
    <div class="sv-rail"><i class="ax"></i>${years.map((y) => `<span class="yr" style="left:${(xOf(Date.UTC(y, 0, 1)) * 100).toFixed(2)}%">${y}</span>`).join('')}
      ${events.map((e, i) => `<button type="button" class="sv-mk" data-k="${e.k}" data-t="${esc(e.t)}" data-i="${i}" ${e.lane ? 'data-lane="1"' : ''} ${e.epoch != null ? `data-ep="${e.epoch}"` : ''} style="left:${(xOf(tOf(e.t)) * 100).toFixed(2)}%" aria-label="${esc(KO[e.k])} ${esc(e.t)} ${esc(e.title)}">${MK[e.k]}</button>`).join('')}
      <i class="sv-cursor" hidden></i><div class="sv-tip" hidden></div></div>
    <ul class="sv-tlsum">${summary.length ? summary.map((s) => `<li><span class="sv-k">●</span>${esc(s)}</li>`).join('') : '<li><span class="cw-void xi-void">이력 · 2023 단일 시점(2025 판독·변화 없음)</span></li>'}
      ${events.filter((e) => e.k !== 'img').map((e) => `<li data-k="${e.k}" data-t="${esc(String(e.t).slice(0, 7))}"><span class="sv-k">${MK[e.k]}</span><b>${esc(String(e.t).slice(0, 7))}</b><span>${esc(e.title)}${e.body ? ' — ' + e.body : ''}</span></li>`).join('')}
      ${events.some((e) => e.k === 'act') ? '' : '<li data-k="act" data-void="1"><span class="sv-k">▶</span><span class="cw-void xi-void">조치 · 현장 확인(inspected) 뒤 기록 · 2차</span></li>'}</ul>`;
  const rail = host.querySelector('.sv-rail'), cur = host.querySelector('.sv-cursor'), tip = host.querySelector('.sv-tip');
  host.querySelectorAll('.sv-mk').forEach((b) => {
    const e = events[+b.dataset.i];
    b.addEventListener('mouseenter', () => { tip.hidden = false; tip.style.left = b.style.left; tip.innerHTML = `<b>${MK[e.k]} ${esc(KO[e.k])} · ${esc(e.t)}</b><br>${esc(e.title)}${e.body ? '<br>' + e.body : ''}<br><small>${esc(e.src || '')}</small>`; });
    b.addEventListener('mouseleave', () => { tip.hidden = true; });
    b.addEventListener('click', () => { if (b.dataset.ep != null) onPick?.(+b.dataset.ep); });
  });
  /** 스크러버 e(0..n-1 소수) → 커서 x(시점 날짜 사이 보간) */
  function sync(e) {
    if (!epochs.length) { cur.hidden = true; return; }
    const k = Math.min(epochs.length - 1, Math.floor(e + 1e-6)), f = e - k;
    const ta = tOf(epochs[k].date), tb = tOf(epochs[Math.min(epochs.length - 1, k + 1)].date);
    const x = xOf(ta + (tb - ta) * f);
    cur.hidden = false; cur.style.left = (x * 100).toFixed(2) + '%';
    host.querySelectorAll('.sv-mk[data-ep]').forEach((b) => b.classList.toggle('is-on', +b.dataset.ep === Math.round(e)));
    host.dataset.cursor = (x * 100).toFixed(1);
  }
  return { sync, el: host, rail };
}
