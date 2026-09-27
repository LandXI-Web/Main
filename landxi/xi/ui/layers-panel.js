/* layers-panel.js — V8 열람(좌상 유리 360 / 접힘 48 · kepler.gl 유리 사이드 패널 장치).
   층: 카탈로그 role 별 그룹 · 결과 줄은 배포본 snapshot_current 순 · 실자료 없는 줄 = 점선 '시연 · 지도 미연결'.
   표 3종: 지목별(P8 대기 → AI 클래스별로 대신 · 정직 표기) · 필지별(A02 · 페이저) · 도로(준비 중 · 도로 결과 없음).
   표 행 ↔ 도형 ↔ 막대 삼각 호버. 내보내기 GeoJSON/CSV(BOM · export_policy 검사 · 공개 모드 비활성). */
import { numHtml, void_, tag } from '../fx/provenance.js';
import { env } from '../../shared/api-v1.js';
import { toast } from '../fx/glass.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function layersPanel(root, ctx) {
  const S = { open: false, tab: 'layers', table: 'parcel', page: 0, per: 8, rows: [], hoverRow: null, temp: [], survey: null };
  const el = { rail: root.querySelector('.xi-rail'), body: root.querySelector('.xi-panel-body'), toggle: root.querySelector('.xi-panel-toggle') };
  const setOpen = (on) => { S.open = on; root.dataset.open = on ? '1' : '0'; el.toggle.setAttribute('aria-expanded', String(on)); if (on) render(); ctx.onUrl && ctx.onUrl(); };
  el.toggle.addEventListener('click', () => setOpen(!S.open));

  function layerRows() {
    const { catalog, deploys, state } = ctx;
    const res = catalog.items.filter((i) => i.role === 'result');
    const byId = Object.fromEntries(res.map((i) => [i.id, i]));
    const alias = (snap) => (snap ? ({ 'results/namwon/dp-nw-farm-25@2.1': 'namwon-farmland-2025', 'results/namwon/dp-nw-farm-25@2.0': 'namwon-landcover-2023' }[snap] || snap.split('/').pop()) : null);
    const rows = [];
    for (const d of deploys) {
      const id = alias(d.snapshot_current), it = id && byId[id];
      rows.push({ d, it, prev: alias(d.snapshot_prev) && byId[alias(d.snapshot_prev)] });
    }
    const used = new Set(rows.flatMap((r) => [r.it?.id, r.prev?.id]).filter(Boolean));
    for (const it of res) if (!used.has(it.id) && it.kind === 'vector') rows.push({ d: null, it });
    return rows.map(({ d, it, prev }) => {
      const on = it && state.results.has(it.id);
      const name = d ? d.name : it.name.ko;
      if (!it) return `<li class="xi-row xi-row--void" data-deploy="${esc(d.id)}"><span class="xi-row-n">${esc(name)}</span><span class="cw-void xi-void">시연 · 지도 미연결</span><small>${esc(d.stage)} · ${esc(tag(d.basis))}</small></li>`;
      return `<li class="xi-row" data-layer="${esc(it.id)}" data-on="${on ? 1 : 0}">
        <button type="button" class="xi-check" aria-pressed="${on}" aria-label="${esc(name)} 켜기"></button>
        <span class="xi-row-n">${esc(name)}${d ? `<small>${esc(d.version || '')} · ${esc(d.stage)}</small>` : ''}</span>
        ${it.count ? numHtml(it.count, { unit: true }) : ''}
        ${prev ? `<small class="xi-prev">이전 ${esc(prev.name.ko)}</small>` : ''}</li>`;
    }).join('');
  }
  function imageryRows() {
    const { ladder, dates } = ctx;
    return (ladder?.items || []).map((it) => `<li class="xi-row xi-row--img" data-img="${esc(it.id)}"><i class="xi-sw" style="--o:${it.role}"></i><span class="xi-row-n">${esc(it.name.ko)}<small>${esc(it.gsd_m != null ? (it.gsd_m >= 1 ? it.gsd_m + ' m' : (it.gsd_m * 100).toFixed(it.gsd_m < 0.1 ? 2 : 0) + ' cm') : '')} · z${it.ladder.from}–${it.ladder.to}${it.id === 'gibs-hls-s30' ? ' · ' + (dates.hls || '') : ''}</small></span><small class="xi-lic">${esc(it.license || '')}</small></li>`).join('');
  }
  function renderLayers() {
    const { state, roleGates } = ctx;
    el.body.innerHTML = `
      <section class="xi-sec"><h3>배경 · 줌 사다리</h3><ul class="xi-list">${imageryRows()}</ul>
        <details class="xi-sub" ${state.extrude ? 'open' : ''}><summary>지형·입체</summary>
          <label class="xi-switch"><input type="checkbox" class="xi-ex" ${state.extrude ? 'checked' : ''} ${roleGates.extrude ? '' : 'disabled'}><span>비닐하우스 1,674 세우기 · 지형</span></label>
          <p class="xi-hint">높이 = 신뢰도 × 12 m <b data-basis="estimate">추정</b> · pitch ≤ ${ctx.maxPitch}</p></details></section>
      <section class="xi-sec"><h3>결과 · 배포본 순</h3><ul class="xi-list">${layerRows()}</ul></section>
      ${S.temp.length ? `<section class="xi-sec"><h3>에이전트 질의 · 저장 안 됨</h3><ul class="xi-list">${S.temp.map((t) => `<li class="xi-row" data-temp="${esc(t.id)}"><button type="button" class="xi-check" aria-pressed="${t.on !== false}" aria-label="${esc(t.label)}"></button><span class="xi-row-n">${esc(t.label)}<small>${esc(t.note || '저장 안 됨')}</small></span>${t.count ? numHtml(t.count, { unit: true }) : ''}</li>`).join('')}</ul></section>` : ''}
      <section class="xi-sec"><h3>참조</h3><ul class="xi-list">
        <li class="xi-row" data-ref="emd" data-on="${state.emd ? 1 : 0}"><button type="button" class="xi-check" aria-pressed="${state.emd}" aria-label="읍면동 경계"></button><span class="xi-row-n">남원 읍면동 39<small>A11 행정경계</small></span></li>
        <li class="xi-row" data-ref="filament" data-on="${state.filament ? 1 : 0}"><button type="button" class="xi-check" aria-pressed="${state.filament}" aria-label="읍면동 필라멘트"></button><span class="xi-row-n">읍면동 필라멘트<small>z &lt; 11.8 · 경작지 면적</small></span></li>
        ${ctx.parcels ? `<li class="xi-row" data-ref="parcels" data-on="${state.parcelsOn ? 1 : 0}"><button type="button" class="xi-check" aria-pressed="${!!state.parcelsOn}" aria-label="필지 경계"></button><span class="xi-row-n">남원 필지 ${numHtml(env(328966, '필지', 'measured', 'manifest.json#namwon-parcels.pmtiles · features_src'), { unit: false })}<small>C04 국토정보기본도 2.0 · 2021-12 기준 · z15+</small></span></li>`
          : '<li class="xi-row xi-row--void"><span class="xi-row-n">필지(국토정보기본도)</span><span class="cw-void xi-void">필지 · P8 대기</span></li>'}</ul></section>`;
    el.body.querySelectorAll('.xi-row[data-layer] .xi-check').forEach((b) => b.addEventListener('click', () => { const id = b.closest('.xi-row').dataset.layer; ctx.toggleResult(id); renderLayers(); }));
    el.body.querySelector('[data-ref=emd] .xi-check').addEventListener('click', () => { ctx.toggleRef('emd'); renderLayers(); });
    el.body.querySelector('[data-ref=filament] .xi-check').addEventListener('click', () => { ctx.toggleRef('filament'); renderLayers(); });
    el.body.querySelector('[data-ref=parcels] .xi-check')?.addEventListener('click', () => { ctx.toggleRef('parcels'); renderLayers(); });
    el.body.querySelector('.xi-ex').addEventListener('change', (e) => ctx.setExtrude(e.target.checked));
    el.body.querySelectorAll('[data-temp] .xi-check').forEach((b) => b.addEventListener('click', () => { const t = S.temp.find((x) => x.id === b.closest('li').dataset.temp); if (t) { t.on = t.on === false; ctx.toggleTemp?.(t.id, t.on); renderLayers(); } }));
  }
  /* ── 표 ── */
  async function renderTable() {
    const t = S.table;
    const head = `<nav class="xi-tabs2" role="tablist">${[['cat', '지목별'], ['parcel', '필지별'], ['road', '도로지점별']].map(([k, n]) => `<button role="tab" type="button" data-t="${k}" aria-selected="${t === k}">${n}</button>`).join('')}</nav>`;
    if (t === 'road') { el.body.innerHTML = head + '<p class="cw-void xi-void">준비 중 · 도로 결과 없음</p>'; return bindTabs(); }
    if (t === 'cat') {
      const st = await ctx.emdStats();
      const tot = st ? Object.entries(st.total) : [];
      const max = Math.max(1, ...tot.map(([, v]) => v.area_ha));
      el.body.innerHTML = head + `<p class="cw-void xi-void">${ctx.parcels ? '지목별 집계 · 서버 집계 대기(P8 필지 타일 연결됨)' : '지목 · P8 대기'} — 아래는 AI 클래스별(P4 · 검수 전)</p>
        <table class="xi-table"><thead><tr><th>클래스</th><th class="r">개수</th><th class="r">면적</th><th>막대</th></tr></thead><tbody>
        ${tot.map(([k, v], i) => `<tr data-i="${i}" data-cls="${esc(k)}"><td>${esc(k)}</td><td class="r">${numHtml(env(v.n, 'polygons', 'inferred', 'results/namwon-landcover-2023-emd-stats.json'), { unit: false })}</td><td class="r">${numHtml(env(v.area_ha, 'ha', 'inferred', 'results/namwon-landcover-2023-emd-stats.json'), { digits: 1 })}</td><td><i class="xi-hbar" style="--w:${((v.area_ha / max) * 100).toFixed(1)}%"></i></td></tr>`).join('')}</tbody></table>`;
      bindTabs(); bindExport('cat', tot.map(([k, v]) => ({ 클래스: k, 개수: v.n, 면적_ha: v.area_ha, 평균신뢰도: v.conf_mean })));
      return;
    }
    const rows = S.rows.length ? S.rows : (S.rows = await ctx.parcelRows());
    const pages = Math.max(1, Math.ceil(rows.length / S.per)); S.page = Math.min(S.page, pages - 1);
    const view = rows.slice(S.page * S.per, (S.page + 1) * S.per), max = Math.max(1, ...view.map((r) => r.area));
    el.body.innerHTML = head + `<table class="xi-table"><thead><tr><th>PNU</th><th>판독</th><th class="r">면적 m²</th><th>막대</th></tr></thead><tbody>
      ${view.map((r) => `<tr data-fid="${esc(r.id)}"><td class="mono">${esc(r.pnu)}</td><td>${esc(r.cls)}</td><td class="r">${numHtml(env(Math.round(r.area), 'm2', 'inferred', 'namwon-farmland-2025.geojson'), { unit: false })}</td><td><i class="xi-hbar" style="--w:${((r.area / max) * 100).toFixed(1)}%"></i></td></tr>`).join('')}
      </tbody></table>
      <nav class="xi-pager"><button type="button" data-p="-1" ${S.page ? '' : 'disabled'}>‹ 이전</button><span>${S.page + 1} / ${pages} · ${numHtml(env(rows.length, '필지', 'measured', 'namwon-farmland-2025.geojson'), { unit: true })}</span><button type="button" data-p="1" ${S.page < pages - 1 ? '' : 'disabled'}>다음 ›</button></nav>`;
    bindTabs();
    el.body.querySelectorAll('.xi-pager button').forEach((b) => b.addEventListener('click', () => { S.page += +b.dataset.p; renderTable(); }));
    el.body.querySelectorAll('tr[data-fid]').forEach((tr) => {
      tr.addEventListener('mouseenter', () => { ctx.hoverParcel(tr.dataset.fid, 'row'); markRow(tr.dataset.fid); });
      tr.addEventListener('mouseleave', () => { ctx.hoverParcel(null, 'row'); markRow(null); });
      tr.addEventListener('click', () => ctx.focusParcel(tr.dataset.fid));
    });
    bindExport('parcel', rows.map((r) => ({ PNU: r.pnu, 판독: r.cls, 면적_m2: Math.round(r.area), 신뢰도: r.conf, 읍면동: r.emd })));
  }
  function markRow(fid) { S.hoverRow = fid; el.body.querySelectorAll('tr[data-fid]').forEach((tr) => tr.classList.toggle('is-hover', tr.dataset.fid === fid)); }
  function bindTabs() {
    el.body.querySelectorAll('.xi-tabs2 button').forEach((b) => b.addEventListener('click', () => { S.table = b.dataset.t; S.page = 0; renderTable(); }));
  }
  function bindExport(kind, rows) {
    const bar = document.createElement('p'); bar.className = 'xi-export';
    const allowed = ctx.exportAllowed(kind);
    bar.innerHTML = `<button type="button" class="xi-btn xi-btn--br" data-f="csv" ${allowed.ok ? '' : 'disabled'}>CSV</button><button type="button" class="xi-btn xi-btn--br" data-f="geojson" ${allowed.ok && kind === 'parcel' ? '' : 'disabled'}>GeoJSON</button><small>${esc(allowed.why)}</small>`;
    el.body.appendChild(bar);
    bar.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.f === 'csv') {
        const keys = Object.keys(rows[0] || {});
        const csv = '﻿' + [keys.join(','), ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
        download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `landxi-${kind}.csv`);
      } else download(new Blob([JSON.stringify(await ctx.parcelGeoJSON())], { type: 'application/geo+json' }), 'landxi-parcels.geojson');
      toast(`${b.dataset.f.toUpperCase()} 내보내기 · ${rows.length}행`);
    }));
  }
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  function render() {
    root.querySelectorAll('.xi-tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
    root.dataset.tab = S.tab;   // 표 탭은 PNU 19자리 + 판독 + 면적이 한 줄에 들도록 넓힌다(css)
    if (S.tab === 'survey' && S.survey) S.survey(el.body); else if (S.tab === 'layers') renderLayers(); else renderTable();
  }
  const bindTab = (b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; render(); ctx.onUrl && ctx.onUrl(); });
  root.querySelectorAll('.xi-tabs [data-tab]').forEach(bindTab);
  /** 실태조사 모드: '조사' 탭(업무 판 · 규칙)을 맨 앞에 — fn(body) 가 그린다 */
  function showSurvey(fn, { open = true } = {}) {
    S.survey = fn;
    const nav = root.querySelector('.xi-tabs');
    if (!nav.querySelector('[data-tab=survey]')) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = 'survey'; b.textContent = '조사'; nav.prepend(b); bindTab(b); }
    S.tab = 'survey';
    if (open) setOpen(true); else render();
  }
  function hideSurvey() { S.survey = null; root.querySelector('.xi-tabs [data-tab=survey]')?.remove(); if (S.tab === 'survey') S.tab = 'layers'; if (S.open) render(); }
  return { S, setOpen, render, markRow, showSurvey, hideSurvey, openTable(t = 'parcel') { S.tab = 'table'; S.table = t; setOpen(true); },
    addTemp(t) { S.temp = S.temp.filter((x) => x.id !== t.id).concat([t]); if (S.open && S.tab === 'layers') renderLayers(); },
    removeTemp(id) { S.temp = S.temp.filter((x) => x.id !== id); if (S.open && S.tab === 'layers') renderLayers(); } };
}
export { void_ };
