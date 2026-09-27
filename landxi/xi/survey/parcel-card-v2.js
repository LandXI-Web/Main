/* parcel-card-v2.js — 필지 카드 v2 P-3 '대장 vs 현황 나란히'(EVIDENCE-PAIR · 560 · 종이 시트). 판독 모드의 필지 카드도 이 부품(기관·직원).
   좌 대장(등록 · 연속지적 2026-09-24): 지목 · 면적 · 용도지역 · 농업진흥 · 공시지가(₩/㎡ · 기준년) · 건축물대장(키 없음 · 점선) · 소유구분(연속지적 미제공 · 점선)
   우 현황(AI 판독 · 검수 전): 시점 라디오 2023 ◉ / 2025 ○ → 막대 500 재성장 + 배경 시점 갈림 — 좌우 같은 행 높이(눈이 가로로 대조).
   크롭(2023 25cm + A03 2시점 · AOI 안이면 A01 4시점) · '왜 의심인가' = 규칙 한 줄 = 한 finding · 결손 점선 · 버튼(배정 · 오탐 · 이력 ▾ · 보고서 초안 ›).
   데이터: on = GET /survey/parcels/{pnu}(F2-S) · off = 필지 타일 속성(namwon-parcel-survey.pmtiles) + findings-lite · detail/{emd}.json + timeline.json(실파일). */
import { numHtml, prov } from '../fx/provenance.js';
import { panelIn, panelOut, clipIn, D, EASE } from '../fx/glass.js';
import { lock, clearLocks } from '../fx/arrive.js';
import { cropOf } from '../ui/parcel-card.js';
import { E, loadLite, loadDetail, loadTimeline, loadRules, parcel as apiParcel, rowOf, stateOf, onFindingState, routeOn, canMove, seedState } from './api-survey.js';
import { openStateSheet, stateChip } from './actions.js';
import { buildEvents, timeline } from './parcel-timeline.js';
import { RULE_CLS } from './drawer-findings.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SRC_T = 'namwon-parcel-survey.pmtiles#parcels';
const SRC_L = 'V-World 연속지적 LP_PA_CBND_BUBUN(수집 2026-09-24)';
const voidHtml = (t) => `<span class="cw-void xi-void">${esc(t)}</span>`;

export function parcelCardV2(el, ctx) {
  const S = { seq: 0, pnu: null, ep: 2023, data: null, open: false, tl: null, epochs: [] };
  const close = () => { S.seq++; S.open = false; panelOut(el); clearLocks(); ctx.onClose?.(S.pnu); S.pnu = null; delete document.documentElement.dataset.pcard; };

  /** 필지 속성 모으기 — 결손은 결손대로(지어내지 않음) */
  async function gather(pnu, hint) {
    const L = await loadLite();
    const finds0 = (L?.byPnu.get(pnu) || []).map(rowOf);
    let g = ctx.layers.parcelGeom(pnu) || (finds0.length ? ctx.layers.parcelGeom(pnu, 'suspects') : null);
    if (!g && ctx.waitTiles) { await ctx.waitTiles(); g = ctx.layers.parcelGeom(pnu) || (finds0.length ? ctx.layers.parcelGeom(pnu, 'suspects') : null); }
    const tp = g?.props || {};
    const emd_cd = String(pnu).slice(0, 8);
    const det = finds0.length ? await loadDetail(emd_cd) : new Map();
    const d0 = finds0.length ? det.get(finds0[0].id) : null;
    const api = routeOn() ? await apiParcel(pnu) : null;
    const f0 = finds0[0] || {};
    const facts = {
      pnu, emd_cd, emd: tp.emd || f0.emd || ctx.emdName?.(emd_cd) || '', ri: f0.ri || '', jibun: f0.jibun || String(tp.jibun || '').replace(/[\s가-힣]+$/, ''),
      jimok: tp.jimok || f0.jimok || api?.jimok || null, area_m2: tp.area_m2 ?? f0.parcel_m2 ?? api?.area_m2?.value ?? null,
      yongdo: tp.yongdo || f0.yongdo || null, nongup: tp.nongup || f0.nongup || null,
      jiga: d0?.jiga ?? api?.price_krw_m2?.value ?? null, gosi_year: d0?.gosi_year ?? null,
      a23: d0?.a23 || { bld_m2: tp.bld_m2 ?? null, crop_m2: tp.crop_m2 ?? null, park_m2: tp.park_m2 ?? null, gh_m2: tp.gh_m2 ?? null },
      a25: d0?.a25 || null, chg: d0?.chg || null, chg_built_new_m2: d0?.chg_built_new_m2 || 0, ai_ids: d0?.ai_ids || '', img_date: d0?.img_date || '2023 항공정사 25cm',
      detailVia: d0 ? 'detail' : 'tile', api,
    };
    // on(F2-S): GET /survey/parcels/{pnu} 가 정본 — 대장(공시지가 as_of) · 2023/2025 현황 · findings 를 서버 값으로 덮는다
    for (const x of api?.findings || []) seedState({ ...x, state_basis: x.state_basis });
    if (api?.facts) {
      const Lg = api.facts.ledger || {}, c23 = api.facts.current?.['2023']?.classes || {}, c25 = api.facts.current?.['2025']?.classes || {};
      const v = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x ?? null);
      facts.jimok = Lg.jimok || facts.jimok; facts.area_m2 = v(Lg.area_m2) ?? facts.area_m2; facts.yongdo = Lg.yongdo ?? facts.yongdo; facts.nongup = Lg.nongup ?? facts.nongup;
      if (Lg.jiga) { facts.jiga = v(Lg.jiga); facts.gosi_year = String(Lg.jiga.as_of || '').slice(0, 4) || facts.gosi_year; }
      facts.a23 = { bld_m2: v(c23.bld?.m2), crop_m2: v(c23.crop?.m2), park_m2: v(c23.park?.m2), gh_m2: v(c23.gh?.m2), bld_n: v(c23.bld?.n), gh_n: v(c23.gh?.n), bld_conf: v(c23.bld?.conf), crop_conf: v(c23.crop?.conf) };
      if (Object.keys(c25).length) facts.a25 = { crop_m2: v(c25.crop?.m2), uncrop_m2: v(c25.uncrop?.m2), gh_m2: v(c25.gh?.m2), gh_n: v(c25.gh?.n) };
      facts.ri = api.ri || facts.ri; facts.jibun = String(api.jibun || facts.jibun).replace(/[\s가-힣]+$/, '');
      facts.detailVia = 'api';
    }
    const finds = finds0.map((f) => ({ ...f, detail: det.get(f.id) || null }));
    return { facts, finds, geom: g?.geom || hint?.geometry || null, bbox: g?.bbox || null, api };
  }

  const ratio = (a, b) => (a != null && b ? Math.round((a / b) * 100) : null);
  function rightRows(facts, ep) {
    const A = facts.area_m2;
    const bar = (cls, label, m2, src, extra = '') => {
      if (m2 == null) return `<div class="sv-cell is-r"><span>${label}</span><span>${voidHtml('판독 없음')}</span><span></span></div>`;
      const r = ratio(m2, A) ?? 0;
      return `<div class="sv-cell is-r" data-cls="${cls}"><span>${label}</span><span class="sv-bar"><i class="${cls}" style="--w:${Math.min(100, r)}%"></i></span><span class="sv-v">${numHtml(E(Math.round(m2), 'm2', 'inferred', src, '검수 전'), { unit: false })}<small>${r}%</small>${extra}</span></div>`;
    };
    if (ep === 2023) {
      const a = facts.a23 || {}, src = facts.detailVia === 'api' ? 'GET /survey/parcels/{pnu} · current.2023' : facts.detailVia === 'detail' ? `detail/${facts.emd_cd}.json(a23_*)` : SRC_T;
      const n = (k) => (a[k + '_n'] ? ` <small>${a[k + '_n']}동</small>` : '');
      const conf = [a.bld_conf != null ? `건물 ${numHtml(E(a.bld_conf, 'ratio', 'inferred', src), { unit: false, digits: 2 })}` : '', a.crop_conf != null ? `경작 ${numHtml(E(a.crop_conf, 'ratio', 'inferred', src), { unit: false, digits: 2 })}` : ''].filter(Boolean).join(' · ');
      return [bar('bld', '건물', a.bld_m2, src, n('bld')), bar('crop', '경작지', a.crop_m2, src), bar('park', '주차장', a.park_m2, src), bar('gh', '비닐하우스', a.gh_m2, src),
        `<div class="sv-cell"><span>신뢰도</span><span>${conf || voidHtml(facts.detailVia === 'tile' ? '객체 신뢰도 · 의심 필지만 사본' : '—')}</span></div>`,
        `<div class="sv-cell"><span>변화 A04</span><span>${facts.chg ? `${esc(facts.chg)}${facts.chg_built_new_m2 ? ` · 신축 ${numHtml(E(facts.chg_built_new_m2, 'm2', 'inferred', 'A04 변화 지수(비지도)'), {})}` : ''}` : voidHtml('드론 AOI 밖 · 변화 지수 없음')}</span></div>`,
        `<div class="sv-cell"><span>영상</span><span><b>2023 · 25cm 항공</b> <small>${esc(facts.ai_ids ? facts.ai_ids.split(',').length + '객체' : '')}</small></span></div>`].join('');
    }
    const a = facts.a25, src = facts.detailVia === 'api' ? 'GET /survey/parcels/{pnu} · current.2025(A02)' : `detail/${facts.emd_cd}.json(a25_*) · A02 2025 드론`;
    if (!a || !((a.crop_m2 || 0) + (a.uncrop_m2 || 0) + (a.gh_m2 || 0))) {
      return [bar('crop', '경작(A02)', null), bar('uncrop', '비경작', null), bar('gh', '비닐하우스', null),
        `<div class="sv-cell"><span>건물·주차</span><span>${voidHtml('2025 A02 는 경작/비경작·비닐하우스만')}</span></div>`,
        `<div class="sv-cell"><span>신뢰도</span><span>—</span></div>`, `<div class="sv-cell"><span>변화 A04</span><span>${voidHtml('드론 AOI 밖')}</span></div>`,
        `<div class="sv-cell"><span>영상</span><span>${voidHtml('이 필지 2025 A02 판독 없음 · 2023 단일 시점')}</span></div>`].join('');
    }
    return [bar('crop', '경작(A02)', a.crop_m2, src), bar('uncrop', '비경작', a.uncrop_m2, src), bar('gh', '비닐하우스', a.gh_m2, src, a.gh_n ? ` <small>${a.gh_n}동</small>` : ''),
      `<div class="sv-cell"><span>건물·주차</span><span>${voidHtml('2025 A02 는 경작/비경작·비닐하우스만')}</span></div>`,
      `<div class="sv-cell"><span>신뢰도</span><span>${voidHtml('A02 객체 신뢰도 · 이력에서')}</span></div>`,
      `<div class="sv-cell"><span>변화 A04</span><span>${facts.chg ? esc(facts.chg) : voidHtml('드론 AOI 밖')}</span></div>`,
      `<div class="sv-cell"><span>영상</span><span><b>2025 · LX 드론(A02)</b> <small>촬영월 미상</small></span></div>`].join('');
  }
  function leftRows(facts) {
    const f = facts;
    const yd = !f.yongdo || f.yongdo === '(미결합)' ? voidHtml('용도지역 미결합(대표점 · 19필지)') : `<b>${esc(f.yongdo)}</b>`;
    const ng = !f.nongup || f.nongup === '(해당없음)' ? '해당 없음' : `<b>${esc(f.nongup)}</b>`;
    return [
      `<div class="sv-cell"><span>지목</span><span><b>${esc(f.jimok || '—')}</b> <small>연속지적 표기</small></span></div>`,
      `<div class="sv-cell"><span>면적</span><span>${f.area_m2 != null ? numHtml(E(Math.round(f.area_m2), 'm2', 'recorded', SRC_L, 'EPSG:5186 계산')) : '—'}</span></div>`,
      `<div class="sv-cell"><span>용도지역</span><span>${yd}</span></div>`,
      `<div class="sv-cell"><span>농업진흥</span><span>${ng}</span></div>`,
      `<div class="sv-cell"><span>공시지가</span><span>${f.jiga ? `${numHtml(E(Math.round(f.jiga), 'krw_m2', 'recorded', SRC_L + ' JIGA', `${f.gosi_year || ''}-01 기준`))} <small>${esc(f.gosi_year || '')}-01</small>` : voidHtml(f.detailVia === 'tile' ? '공시지가 · 필지 타일 미포함(서버 조회)' : '공시지가 공란')}</span></div>`,
      `<div class="sv-cell"><span>건축물대장</span><span>${voidHtml('키 없음 · 건축HUB 대기')}</span></div>`,
      `<div class="sv-cell"><span>소유구분</span><span>${voidHtml('연속지적 미제공')}</span></div>`,
    ].join('');
  }
  async function whyLines(data) {
    const R = await loadRules(); const rule = (id) => R?.items.find((r) => r.id === id);
    const f = data.facts;
    if (!data.finds.length) return `<li class="sv-none">의심 없음 · 규칙 R1–R6 모두 해당 없음(대장과 현황 일치 또는 판독 없음)</li>`;
    const lines = data.finds.map((x) => {
      const r = rule(x.rule), th = r?.thresholds || {}, d = x.detail || {};
      const pct = f.area_m2 ? Math.round((x.evid_m2 / f.area_m2) * 100) : null;
      const nObj = x.rule === 'R1' || x.rule === 'R6' ? (d.a23?.bld_n ? ` ${d.a23.bld_n}동` : '') : x.rule === 'R3' ? (d.a23?.gh_n || d.a25?.gh_n ? ` ${d.a23?.gh_n || d.a25?.gh_n}동` : '') : '';
      const thTxt = { R1: `건물 ≥ ${th.bld_m2_min}㎡`, R2: `농경 < ${Math.round((th.farm_ratio_max || 0) * 100)}% · 필지 ≥ ${th.parcel_m2_min}㎡`, R3: `비닐하우스 ≥ ${th.gh_m2_min}㎡`, R4: `주차장 ≥ ${th.park_m2_min}㎡`, R5: `경작 ≥ ${th.farm_m2_min}㎡ · ${Math.round((th.farm_ratio_min || 0) * 100)}%`, R6: `건물 ≥ ${th.bld_m2_min}㎡` }[x.rule];
      const src = 'findings-lite.json · ' + (d.evidence ? `detail/${f.emd_cd}.json` : 'rules');
      return `<li data-rule="${x.rule}" data-id="${esc(x.id)}"><b>${esc(x.rule)} v1.0<small>${esc(x.priority)} ${numHtml(E(x.score, 'score', 'inferred', src), { unit: false, digits: 1 })}</small></b>
        <span class="sv-seg"><span>지목 ${esc(f.jimok)} ${f.area_m2 ? numHtml(E(Math.round(f.area_m2), 'm2', 'recorded', SRC_L)) : ''}${f.yongdo && f.yongdo !== '(미결합)' ? ' · ' + esc(f.yongdo) : ''}${f.nongup && f.nongup !== '(해당없음)' ? ' · ' + esc(f.nongup) : ''}</span>
          <span>AI ${RULE_CLS[x.rule]}${nObj} ${numHtml(E(Math.round(x.evid_m2), 'm2', 'inferred', src, '근거면적 · 검수 전'))}${pct != null ? `(${pct}%)` : ''} · 신뢰도 ${numHtml(E(x.conf, 'ratio', 'inferred', src), { unit: false, digits: 2 })} · ${esc((d.img_date || f.img_date || '').replace(/\(.*\)/, '').trim() || '2023 25cm')}</span>
          <span>임계 ${esc(thTxt || '')} <b class="sv-th">추정 초기값</b> · 건축물대장 미대조${d.corroboration ? ' · 보강 ' + esc(d.corroboration) : ''}</span></span>
        <span class="sv-lim">${esc(r?.limits || '')}</span></li>`;
    });
    lines.push(`<li class="sv-skip">R-BLDG 건축물대장 대조 · skipped · 건축HUB 키 없음(사용자 조치 대기) — 의심을 만들지 않음</li>`);
    return lines.join('');
  }
  /* 자리: 실측(getBoundingClientRect) 장애물 — HUD 124px 숫자(좌우 24 여백) · HUD 유리 · 마스트 · 검색 · 모드 스위치 · 층 패널 · 서랍/레일 · 스크러버 · 계기 —
     과 교차 0 인 칸 중 가장 긴 세로 칸(판정 2차: 숫자 폭 ≈ 250px 넘침을 가정하지 않고 잰다). 종이 시트 합집합 ≤ 33 % 예산으로 높이를 자른다. */
  function place() {
    if (el.hidden) return;
    const p = planCard({ contentH: el.scrollHeight || 720 });
    el.style.translate = `${p.x}px ${p.y}px`;
    el.style.maxHeight = `${p.h}px`;
    S.rect = p; el.dataset.slot = p.why;
  }
  function crops(data) {
    const fig = el.querySelector('.sv-crops'); if (!fig) return;
    const eps = ctx.cropEpochs(data.bbox);
    fig.style.setProperty('--n', String(eps.length));
    fig.innerHTML = eps.map((e) => `<div data-ep="${esc(e.id)}" data-year="${e.year}"><div class="xi-crop-img"></div><figcaption>${esc(e.label)}<small>${esc(e.gsd)}</small></figcaption></div>`).join('');
    const my = S.seq;
    el.dataset.crops = '0';
    Promise.all(eps.map(async (e, i) => {
      if (!data.geom) { const b = fig.children[i].querySelector('.xi-crop-img'); b.innerHTML = voidHtml('필지 도형 수신 전'); return; }
      const g = data.geom.type === 'MultiPolygon' && data.geom.coordinates.length === 1 ? { type: 'Polygon', coordinates: data.geom.coordinates[0] } : data.geom;
      const c = await cropOf(e.url, biggest(g), { maxZ: e.maxZ });
      if (my !== S.seq) return;
      const box = fig.children[i].querySelector('.xi-crop-img');
      if (!c) { box.innerHTML = voidHtml('이 시점 타일 없음'); return; }
      box.appendChild(c); el.dataset.crops = String(+el.dataset.crops + 1);
      await clipIn(c, i * D.d120);
    })).then(() => { if (my === S.seq) el.dataset.cropsDone = '1'; });
    markCropYear();
  }
  const markCropYear = () => el.querySelectorAll('.sv-crops > div').forEach((d) => { d.dataset.on = +d.dataset.year === S.ep ? '1' : '0'; });
  /** 시점 라디오 → 막대 500 재성장 + 배경 시점 */
  function setEp(y, { bg = true } = {}) {
    S.ep = y;
    const col = el.querySelector('.sv-rcol'); if (!col || !S.data) return;
    col.innerHTML = rightRows(S.data.facts, y);
    el.querySelectorAll('.sv-ep input').forEach((i) => { i.checked = +i.value === y; });
    if (!RM()) col.querySelectorAll('.sv-bar i').forEach((b, i) => b.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: D.d500, delay: i * D.d60, easing: EASE.arrive, fill: 'backwards' }));
    el.dataset.ep = String(y);
    fixRows();
    markCropYear();
    if (bg) ctx.onEpoch?.(y);
  }
  async function toggleTl(force) {
    const box = el.querySelector('.sv-tl'), btn = el.querySelector('.sv-tlb');
    const on = force ?? box.hidden;
    btn.setAttribute('aria-expanded', String(on)); btn.textContent = on ? '이력 ▴' : '이력 ▾';
    if (!on) { box.hidden = true; ctx.onTimeline?.(false); return; }
    box.hidden = false; box.innerHTML = '<p class="xi-hint">이력 읽는 중 · 6,818필지 이력 파일</p>';
    const tl = (await loadTimeline()).get(S.pnu) || null;
    const d = S.data; if (!d) return;
    S.epochs = ctx.parcelEpochs(d.bbox);
    const row = d.finds[0] ? rowOf(d.finds[0]) : null;
    const events = buildEvents({ pnu: S.pnu, facts: d.facts, finds: d.finds.map((f) => ({ ...f, rule_nm: ctx.ruleName?.(f.rule) })), row, tl, epochs: S.epochs });
    S.tl = timeline(box, { events, summary: tl?.summary || [], epochs: S.epochs, onPick: (i) => ctx.scrubTo?.(i) });
    el.dataset.tl = String(events.length);
    if (!RM()) box.animate([{ clipPath: 'inset(0 0 100% 0)', opacity: 0 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }], { duration: D.d750, easing: EASE.arrive });
    await ctx.onTimeline?.(true, S.epochs);
    S.tl.sync(ctx.scrubE?.() ?? 0);
    box.scrollIntoView?.({ block: 'nearest' });
  }
  function actions() {
    const d = S.data, host = el.querySelector('.sv-acts'); if (!host) return;
    const f = d.finds[0] ? rowOf(d.finds[0]) : null;
    const st = f ? stateOf(f) : null, can = (to) => ctx.canWrite && d.finds.some((x) => canMove(stateOf(rowOf(x)), to));
    host.innerHTML = `${f ? `<button type="button" class="xi-btn xi-btn--ink sv-as" ${can('assigned') ? '' : 'disabled'} title="${st === 'open' ? '' : '지금 상태에서 배정 불가'}">${st === 'assigned' ? '배정됨 ✓' : '현장조사 배정 ›'}</button><button type="button" class="xi-btn xi-btn--br sv-ds" ${can('dismissed') ? '' : 'disabled'}>오탐 신고</button>` : ''}
      <button type="button" class="xi-btn xi-btn--br sv-tlb" aria-expanded="false">이력 ▾</button>
      ${f ? '<button type="button" class="xi-btn xi-btn--br sv-rp">보고서 초안 ›</button>' : ''}
      ${f ? stateChip({ ...f, _row: f }) : '<span class="sv-st" data-st="none">의심 없음</span>'}`;
    host.querySelector('.sv-as')?.addEventListener('click', () => sheet('assign'));
    host.querySelector('.sv-ds')?.addEventListener('click', () => sheet('dismiss'));
    host.querySelector('.sv-tlb').addEventListener('click', () => toggleTl());
    host.querySelector('.sv-rp')?.addEventListener('click', () => ctx.onReport?.({ emd_cd: d.facts.emd_cd, rule: f.rule, top: 20, pnu: S.pnu }));
    el.dataset.state = f ? stateOf(f) : 'none';
  }
  function sheet(mode) {
    const d = S.data;
    openStateSheet(el.querySelector('.sv-card-sheet'), { mode, items: d.finds.map(rowOf), role: ctx.role, onDone: async (r) => {
      if (!r.ok.length) return;
      actions();
      if (!el.querySelector('.sv-tl').hidden) await toggleTl(true);
      else await toggleTl(true);   // ■ 마커가 보이게 이력을 편다
      ctx.onState?.(r);
    } });
  }
  onFindingState((ev) => { if (S.open && S.data && ev.pnu === S.pnu) { actions(); if (!el.querySelector('.sv-tl')?.hidden) toggleTl(true); } });

  /**
   * open({ pnu | lngLat, source?, feature? }) — 락온 380 → 카드. 반환 데이터
   */
  async function open({ pnu, lngLat, feature, source = '' } = {}) {
    const my = ++S.seq;
    if (!pnu && lngLat) pnu = ctx.pnuAt(lngLat);
    if (!pnu) { ctx.onVoid?.('이 자리 필지 없음 · 필지 층 z14+'); return null; }
    S.pnu = pnu; S.open = true; document.documentElement.dataset.pcard = pnu;
    ctx.layers.highlight(pnu);
    const data = await gather(pnu, feature);
    if (my !== S.seq) return null;
    S.data = data;
    // 락온(필지 bbox) → 카드
    clearLocks();
    const bb = data.bbox, c = bb ? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] : lngLat ? [lngLat.lng, lngLat.lat] : null;
    if (c) { const L = lock(ctx.stageEl, ctx.A, { lngLat: c, bbox: bb, html: `<b>${esc(data.finds[0]?.rule || '필지')}</b>${esc(data.facts.ri || data.facts.emd)} ${esc(data.facts.jibun)}` }); L.box.querySelector('.xi-lock-flag')?.classList.add('sv-flag'); await Promise.race([L.done, new Promise((r) => setTimeout(r, D.d380 + D.d120))]); }
    if (my !== S.seq) return null;
    const f = data.facts, f0 = data.finds[0];
    const inAoi = ctx.inAoi?.(bb);
    el.innerHTML = `
      <header><span class="sv-eyebrow"><span>필지 · 대장 vs 현황</span>${source ? `<span>· ${esc(source)}</span>` : ''}${data.finds.length ? `<span>· 의심 ${data.finds.length}규칙</span>` : ''}</span><button class="xi-x" type="button" aria-label="닫기">×</button>
        <span class="sv-pnu mono">${esc(pnu)}</span><span></span>
        <span class="sv-addr">남원시 ${esc(f.emd)} ${esc(f.ri)} ${esc(f.jibun)}</span><span></span>
        <p class="sv-headprov"></p></header>
      <section class="sv-pair" aria-label="대장 vs 현황">
        <h4><span>대장 · 등록</span><span class="sv-ep" style="visibility:hidden"><label><input type="radio">x</label></span></h4>
        <h4><span>현황 · AI 판독</span><span class="sv-ep" role="radiogroup" aria-label="판독 시점"><label><input type="radio" name="sv-ep-${my}" value="2023" checked>2023</label><label><input type="radio" name="sv-ep-${my}" value="2025">2025</label></span></h4>
        <div class="sv-lcol">${leftRows(f)}</div><div class="sv-rcol"></div>
      </section>
      <figure class="sv-crops" aria-label="시점 크롭 · ${inAoi ? 'LX 드론 4시점' : '2023 25cm + A03 2시점'}"></figure>
      <section class="sv-why"><h4><span>왜 의심인가</span><span>규칙 한 줄 = 한 판정 · 임계 추정</span></h4><ol>${await whyLines(data)}</ol></section>
      <div class="sv-acts"></div>
      <div class="sv-sheetform sv-card-sheet" hidden></div>
      <section class="sv-tl" hidden></section>`;
    // 좌·우 열을 같은 행 높이로 한 격자에 — 열 단위 div 를 격자 칸으로 풀어 행 i 가 가로로 짝이 되게(EVIDENCE-PAIR)
    const pair = el.querySelector('.sv-pair');
    pair.style.gridTemplateRows = 'auto repeat(7, 36px)';
    el.querySelector('.sv-lcol').style.display = 'contents'; el.querySelector('.sv-rcol').style.display = 'contents';
    prov(el.querySelector('.sv-headprov'), E(f.area_m2 != null ? Math.round(f.area_m2) : null, 'm2', 'recorded', SRC_L, `필지 면적 · ${data.facts.detailVia === 'detail' ? '의심 필지 사본(gpkg)' : '필지 타일 속성'}`), { label: '연속지적' });
    el.querySelector('.xi-x').onclick = close;
    el.querySelectorAll('.sv-ep input[value]').forEach((i) => i.addEventListener('change', () => setEp(+i.value)));
    S.ep = 2023; setEp(2023, { bg: false });
    actions();
    ctx.beforePlace?.();   // 서랍이 열려 있으면 레일(120)로 접는다 — 자리 계산 전에
    // 자리: 보이지 않게 펼쳐 실제 내용 높이를 잰 뒤 같은 프레임에 제자리(첫 프레임부터 · 숫자·크롬 교차 0)
    el.style.visibility = 'hidden'; el.style.maxHeight = 'none'; el.hidden = false;
    place();
    el.style.visibility = '';
    el.dataset.pnu = pnu; el.dataset.finds = String(data.finds.length);
    panelIn(el);
    crops(data);
    ctx.onOpen?.(data);
    el.dataset.ready = '1';
    return data;
  }
  /** 좌·우 칸을 행 쌍으로 재배치(격자 column 흐름: 머리 1 + 7행) */
  function fixRows() {
    const pair = el.querySelector('.sv-pair'), L = [...el.querySelector('.sv-lcol').children], R = [...el.querySelector('.sv-rcol').children];
    pair.querySelectorAll(':scope > h4').forEach((h, i) => { h.style.gridColumn = String(i + 1); h.style.gridRow = '1'; });
    L.forEach((c, i) => { c.style.gridColumn = '1'; c.style.gridRow = String(i + 2); });
    R.forEach((c, i) => { c.style.gridColumn = '2'; c.style.gridRow = String(i + 2); });
    pair.dataset.rows = `${L.length}/${R.length}`;
  }
  addEventListener('resize', () => { if (S.open) place(); });
  // 보고서 초안 서랍(#drawer)이 열리면 카드는 머리 + 버튼만 남긴 요약(compact)으로 서랍 왼쪽 빈 칸에 — 카드 ∩ 서랍 · HUD = 0 · 지도 가시 ≥ 50 %(3차 판정)
  addEventListener('xi:rdrawer', (e) => {
    const on = !!e.detail?.open;
    if (on) el.dataset.compact = '1'; else delete el.dataset.compact;
    if (!S.open) return;
    el.style.maxHeight = 'none';
    place();
  });
  return { S, open, close, setEp, place, syncTimeline: (e) => S.tl?.sync(e), get isOpen() { return S.open; } };
}
/* ── 자리 계산(실측) ── */
const CW = 560, GAP = 8;
const visRect = (e) => { if (!e || e.hidden || e.closest('[hidden]')) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
const box = (r, m = 0, mx = m) => r && { l: r.left - mx, t: r.top - m, r: r.right + mx, b: r.bottom + m };
/** HUD 큰 숫자 bbox(숫자 + 단위 · 실제 그려진 글자 폭) */
export function hudBigRect() {
  const a = visRect(document.getElementById('hud-big')), u = visRect(document.getElementById('hud-unit'));
  if (!a) return null;
  return u ? { left: Math.min(a.left, u.left), top: Math.min(a.top, u.top), right: Math.max(a.right, u.right), bottom: Math.max(a.bottom, u.bottom), width: 1, height: 1 } : a;
}
/** 카드가 피해야 할 화면 요소(실측 · 여백 포함). drawer = 'rail'|'full'|null 이면 서랍을 그 모양으로 가정 */
export function obstacles({ drawer } = {}) {
  const $ = (id) => document.getElementById(id);
  const out = [];
  const add = (name, r, m = GAP, mx = m) => { const b = box(r, m, mx); if (b) out.push({ name, ...b }); };
  add('hud-big', hudBigRect(), GAP, 24);                           // 숫자 좌우 24 · 위아래 8
  add('hud-top', visRect(document.querySelector('#hud .xi-hud-top')));
  add('hud-bot', visRect($('hud-bot')));
  for (const id of ['mast', 'search', 'mode-sw', 'scrub', 'gauge']) add(id, visRect($(id)));
  const pn = $('panel'); add('panel', pn?.dataset.open === '1' ? visRect(pn) : visRect(pn?.querySelector('.xi-rail')));
  const ag = $('agent-slot'); if (ag && ag.firstElementChild) add('agent', visRect(ag.firstElementChild));
  // 보고서 서랍(#drawer · 초안/표준): 패널 진입 변형(transform) 중에도 최종 자리로 — 계산된 top · width 로 잰다
  const rd = $('drawer');
  if (rd && !rd.hidden && getComputedStyle(rd).display !== 'none') {
    const cs = getComputedStyle(rd), w = parseFloat(cs.width) || 600, t = parseFloat(cs.top) || 16, rr = parseFloat(cs.right) || 16;
    add('drawer', { left: innerWidth - rr - w, right: innerWidth - rr, top: t, bottom: innerHeight - (parseFloat(cs.bottom) || 16), width: 1, height: 1 });
  }
  const fd = $('fdrawer'), fr = visRect(fd);
  const mode = drawer !== undefined ? drawer : fr ? (fd.dataset.rail === '1' ? 'rail' : 'full') : null;
  if (mode) { const top = fr ? fr.top : 220, W = innerWidth; add('fdrawer', mode === 'rail' ? { left: W - 16 - RAIL_W, right: W - 16, top, bottom: innerHeight - 16, width: 1, height: 1 } : fr || { left: W - 436, right: W - 16, top, bottom: innerHeight - 16, width: 1, height: 1 }); }
  return out;
}
export const RAIL_W = 120;
/** 카드 자리 — 후보 x 마다 장애물 사이 가장 긴 세로 칸을 찾아 높이(내용 · 예산 안)가 가장 큰 곳. 반환 {x, y, h, why} */
export function planCard({ contentH = 720, drawer } = {}) {
  const W = innerWidth, H = innerHeight, obs = obstacles({ drawer });
  const fd = obs.find((o) => o.name === 'fdrawer'), rd = obs.find((o) => o.name === 'drawer'), big = obs.find((o) => o.name === 'hud-big');
  const leftMin = Math.max(88, ...obs.filter((o) => o.name === 'panel').map((o) => o.r + 4));
  // 종이 예산: 시트 합집합 ≤ 33 %(판정 상한 35 % · 8px 칸 반올림 여유) — 서랍/레일 면적을 먼저 뺀다
  const drawerArea = [fd, rd].reduce((a, o) => a + (o ? (o.r - o.l - 2 * GAP) * (o.b - o.t - 2 * GAP) : 0), 0);
  const budgetH = Math.max(320, Math.floor((0.33 * W * H - drawerArea) / CW));
  const xs = [];
  if (rd) xs.push(['report', rd.l - CW]);                          // 보고서 서랍 바로 왼쪽
  if (fd) xs.push(['drawer', fd.l - CW]);                          // 서랍(레일) 바로 왼쪽
  if (big) xs.push(['left-of-number', big.l - CW]);                 // 숫자 왼쪽 끝 − 24 − 560
  xs.push(['right', W - 16 - CW], ['left', leftMin]);
  let best = null;
  for (const [why, x0] of xs) {
    const x = Math.round(Math.max(leftMin, Math.min(W - 16 - CW, x0)));
    const col = obs.filter((o) => o.l < x + CW && o.r > x).map((o) => [Math.max(16, o.t), Math.min(H - 16, o.b)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    // 빈 세로 칸들
    let y = 16; const gaps = [];
    for (const [a, b] of col) { if (a > y) gaps.push([y, a]); y = Math.max(y, b); }
    if (H - 16 > y) gaps.push([y, H - 16]);
    for (const [a, b] of gaps) {
      const h = Math.min(b - a, budgetH), score = Math.min(h, contentH) - (why === 'right' || why === 'left' ? 24 : 0);
      if (h >= 200 && (!best || score > best.score + 12)) best = { x, y: Math.round(a), h: Math.round(h), why, score };
    }
  }
  return best || { x: W - 16 - CW, y: Math.round((big?.b ?? 280)), h: 240, why: 'fallback', score: 0 };
}
/** MultiPolygon 에서 가장 큰 조각(크롭 틀) — 조각들이 한 필지의 타일 조각이면 bbox 가 제일 큰 것 */
function biggest(g) {
  if (g.type !== 'MultiPolygon') return g;
  let best = null, ba = -1;
  for (const p of g.coordinates) { const r = p[0]; let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a = Math.abs(a); if (a > ba) { ba = a; best = p; } }
  return { type: 'Polygon', coordinates: best };
}
