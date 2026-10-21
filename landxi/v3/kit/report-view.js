/* K19 report-view.js — 통계 보고서 보기(대시보드 모양 · 10-21 사용자 "통계 보고서는 대시보드 형태로 보여주는걸로 하자" · 원칙 299).
   XI ChatGEO '○○ 통계 보고서 만들어 줘'의 '보고서 보기' · XI맵 통계 판 '보고서 보기'가 같은 사양(agent/tools/ext/dash.py · mapsvc._parts_spec)을 그린다.
   숫자 = 사양 값 그대로(통계 판 · 한글 문서 · 엑셀과 한 출처 · 지어낸 숫자 0). 차트 그리기 = XI맵 통계 판(xi-clean/dash.js)과 같은 함수.
     openReport({ href })   — run 파일(report.json · 채팅) · 내려받기 = 같은 run 의 한글 문서 · 엑셀
     openReport({ spec })   — 통계 판에서(내려받기 = 같은 사양을 서버가 문서로)
   닫기 = × · Esc · 바깥 바탕(지도 그대로). */
import { api, esc } from './util.js';

const rel = (href) => String(href || '').replace(/^.*?\/api\/v1(?=\/)/, '');
const nf = (v, d = 0) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
const TOP = 10;
let D = null;                       // xi-clean/dash.js(그리기)
let cssP = null;
const emdCache = new Map();

function css(href) {
  const u = new URL(href, import.meta.url).href;
  if ([...document.styleSheets].some((s) => s.href === u) || document.querySelector(`link[href="${u}"]`)) return Promise.resolve();
  return new Promise((ok) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.onload = l.onerror = () => ok(); document.head.append(l); });
}
function ready() {
  cssP ||= Promise.all([css('./report-view.css'), css('../xi-clean/dash.css'), import('../xi-clean/dash.js').then((m) => { D = m; })]);
  return cssP;
}

/* ── 작은 지도(읍면동 경계 SVG · 값 색은 통계 판 지도와 같은 척도) ── */
async function emdFC(sgg) {
  if (!emdCache.has(sgg)) emdCache.set(sgg, api(`/regions/${sgg}/emd`).catch(() => null));
  return emdCache.get(sgg);
}
function svgMap(fc, m, sel) {
  const fs = (fc?.features || []).filter((f) => f.geometry);
  if (!fs.length) return '';
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c) => (typeof c[0] === 'number' ? (w = Math.min(w, c[0]), e = Math.max(e, c[0]), s = Math.min(s, c[1]), n = Math.max(n, c[1])) : c.forEach(walk));
  fs.forEach((f) => walk(f.geometry.coordinates));
  const k = Math.cos(((s + n) / 2) * Math.PI / 180), W = 400, P = 8;
  const sx = (W - 2 * P) / ((e - w) * k || 1), H = Math.round((n - s) * sx + 2 * P);
  const X = (x) => (P + (x - w) * k * sx).toFixed(1), Y = (y) => (P + (n - y) * sx).toFixed(1);
  const ring = (r) => 'M' + r.map((p) => `${X(p[0])},${Y(p[1])}`).join('L') + 'Z';
  const path = (g) => (g.type === 'Polygon' ? g.coordinates.map(ring).join('') : g.type === 'MultiPolygon' ? g.coordinates.flatMap((p) => p.map(ring)).join('') : '');
  const vals = m?.values || {}, selSet = new Set(sel || []);
  const lab = [];
  const body = fs.map((f) => {
    const kk = String(f.properties.emd_cd ?? f.properties.code ?? ''), nm = f.properties.name || f.properties.emd_nm || m?.labels?.[kk] || '';
    const v = vals[kk], on = v != null;
    const col = on ? D.colorOf(m.scale, v) : '#E9ECEF';
    const hl = selSet.size ? selSet.has(nm) : false;
    return `<path d="${path(f.geometry)}" fill="${col}" class="${on ? 'on' : ''}${hl ? ' hl' : ''}" data-tip="${esc(`<b>${esc(nm)}</b> ${on ? `${nf(v, 1)}${esc(m.unit || '')}` : '결과 없음'}`)}"/>`;
  }).join('');
  // 많은 곳 세 곳 이름(값 큰 순) — 경계 상자 가운데
  const top = Object.entries(vals).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kk]) => kk);
  for (const kk of top) {
    const f = fs.find((x) => String(x.properties.emd_cd ?? x.properties.code ?? '') === kk); if (!f) continue;
    let a = 180, b = 90, c = -180, d = -90; const wk = (q) => (typeof q[0] === 'number' ? (a = Math.min(a, q[0]), c = Math.max(c, q[0]), b = Math.min(b, q[1]), d = Math.max(d, q[1])) : q.forEach(wk)); wk(f.geometry.coordinates);
    if ((c - a) * k * sx < 44 && fs.length > 3) continue;            // 작은 동(시내)은 이름을 겹쳐 쓰지 않는다 — 올리면 말풍선
    lab.push(`<text x="${X((a + c) / 2)}" y="${Y((b + d) / 2)}" text-anchor="middle">${esc(f.properties.name || m?.labels?.[kk] || '')}</text>`);
  }
  return `<svg class="rv-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m?.title || '읍면동 지도')}"><g class="rv-map-p">${body}</g><g class="rv-map-t">${lab.join('')}</g></svg>`;
}

/* ── 그리기 ── */
function emdRows(s) {
  if (s.emd_rows?.length) return s.emd_rows;
  const bar = (s.panels || []).find((p) => p.pick === 'emd' && (p.type === 'bar' || p.type === 'rank'));
  return [...(bar?.rows || [])].sort((a, b) => (b.v || 0) - (a.v || 0));
}
function barCard(s, rows, all, hue) {
  const unit = s.main?.unit || '';
  const list = all ? rows : rows.slice(0, TOP);
  const title = (s.panels || []).find((p) => p.pick === 'emd' && p.type === 'bar')?.title || `읍면동별 ${s.main?.label || ''}`;
  const more = rows.length > TOP ? `<button type="button" class="rv-more" data-more="bar">${all ? '접기' : `더 보기 · ${rows.length}곳 모두`}</button>` : '';
  return `<div class="xd-card xd-p xd-p--bar rv-bar" style="${D.panelVars(hue)}">${D.drawPanel({ type: 'bar', orient: 'h', title, unit, rows: list }, hue).replace(/ data-k="[^"]*"/g, '')}${more}</div>`;
}
function rankCard(s, rows, all, hue) {
  const unit = s.main?.unit || '';
  const tot = rows.reduce((a, r) => a + (r.v || 0), 0);
  const hasD = rows.some((r) => r.d != null), hasM = rows.some((r) => r.m2 != null);
  const list = all ? rows : rows.slice(0, TOP);
  const mx = Math.max(1, ...rows.map((r) => r.v || 0));
  const more = rows.length > TOP ? `<button type="button" class="rv-more" data-more="rank">${all ? '접기' : `더 보기 · ${rows.length}곳 모두`}</button>` : '';
  return `<div class="xd-card rv-rank" style="${D.panelVars(hue)}"><h3>읍면동 순위 <small>${esc(unit)}</small></h3>
    <div class="rv-tw"><table class="rv-tb"><thead><tr><th class="i">순위</th><th>읍면동</th><th class="num">수</th><th class="b" aria-hidden="true"></th><th class="num">비율</th>${hasM ? '<th class="num">면적(ha)</th>' : ''}${hasD ? `<th class="num">㎢당</th>` : ''}</tr></thead>
    <tbody>${list.map((r, i) => `<tr${(s.emd || []).includes(r.label) ? ' class="hl"' : ''}><td class="i num">${i + 1}</td><td class="n">${esc(r.label)}</td><td class="num v">${nf(r.v)}</td><td class="b" aria-hidden="true"><i style="width:${(100 * (r.v || 0)) / mx}%"></i></td><td class="num">${tot ? nf(((r.v || 0) / tot) * 100, 1) + '%' : '—'}</td>${hasM ? `<td class="num">${nf((r.m2 || 0) / 1e4, 1)}</td>` : ''}${hasD ? `<td class="num">${r.d != null ? nf(r.d, 1) : '—'}</td>` : ''}</tr>`).join('')}</tbody>
    ${all || rows.length <= TOP ? `<tfoot><tr><td></td><td>합계</td><td class="num v">${nf(tot)}</td><td class="b" aria-hidden="true"></td><td class="num">${tot ? '100%' : '—'}</td>${hasM ? `<td class="num">${nf(rows.reduce((a, r) => a + (r.m2 || 0), 0) / 1e4, 1)}</td>` : ''}${hasD ? '<td></td>' : ''}</tr></tfoot>` : ''}</table></div>${more}</div>`;
}

function render(st) {
  const { doc, root } = st, s = doc.spec || {};
  const hue = s.map?.scale?.hue || (s.panels || []).find((p) => p.scale?.hue)?.scale.hue || 'teal';
  const means = (s.means || []).filter(([k]) => k !== '비교');
  const meta = [...means, ['기준일', doc.made || '']].map(([k, v]) => `<span><em>${esc(k)}</em>${esc(v)}</span>`).join('');
  const kp = (s.kpis || []).slice(0, 4);
  const rows = emdRows(s);
  const extra = (s.panels || []).filter((p) => !(p.pick === 'emd' && (p.type === 'bar' || p.type === 'rank')) && p.type !== 'table');
  const say = (s.say || []).length ? `<div class="xd-card xd-say rv-say"><p class="xd-sayh"><span class="xd-logo">XI</span>AI 요약</p><div class="xd-say-l">${s.say.map((l) => `<p>${esc(l)}</p>`).join('')}</div></div>` : '';
  const mapCard = s.map ? `<div class="xd-card rv-mapc"><h3>${esc(s.map.title || '읍면동 지도')}</h3><div class="rv-mapw" data-map>${st.mapHtml || '<div class="rv-map-wait"></div>'}</div><div class="rv-leg">${D.scaleHtml(s.map.scale, s.map.unit, 'xd')}</div>${(s.emd || []).length ? `<p class="xd-note"><i class="rv-sw"></i>고른 곳: ${esc(s.emd.join(' · '))}</p>` : ''}</div>` : '';
  const nk = kp.length || 1;
  root.querySelector('.rv-in').innerHTML = `
    <header class="rv-h">
      <div class="rv-ht"><p class="rv-eye">통계 보고서</p><h1>${esc(s.title || '통계 보고서')}</h1><div class="rv-meta">${meta}</div></div>
      <div class="rv-act">
        <button type="button" class="rv-dl" data-f="hwpx"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12"/></svg><span>한글 문서</span></button>
        <button type="button" class="rv-dl" data-f="xlsx"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12"/></svg><span>엑셀</span></button>
      </div>
      <button type="button" class="rv-x" aria-label="보고서 닫기">×</button>
    </header>
    ${s.note ? `<p class="xd-notice rv-note">${esc(s.note)}</p>` : ''}
    <div class="xd-kpis rv-kpis" style="grid-template-columns:${nk > 1 ? `minmax(0,1.5fr) repeat(${nk - 1},minmax(0,1fr))` : 'minmax(0,1fr)'}">${kp.map((k, i) => D.kpiHtml(k, i === 0, hue)).join('')}</div>
    ${say}
    <div class="rv-row">${rows.length ? barCard(s, rows, st.allBar, hue) : ''}${mapCard}</div>
    ${rows.length ? `<div class="rv-row rv-row--b">${rankCard(s, rows, st.allRank, hue)}${extra.length ? `<div class="rv-ex">${extra.map((p) => `<div class="xd-card xd-p xd-p--${p.type}" style="grid-column:span 6;${D.panelVars(p.scale?.hue || hue)}">${D.drawPanel({ ...p, _w: 5 }, hue)}</div>`).join('')}</div>` : ''}</div>` : ''}
    <p class="rv-src">자료: ${esc((s.fuse || []).join(' · ') || 'AI 분석 결과')} · 숫자는 XI맵 통계 판 · 한글 문서 · 엑셀과 같은 값입니다 · 만든 때 ${esc(doc.made_t || doc.made || '')}</p>`;
}

async function download(st, f, b) {
  if (b.disabled) return;
  const lab = b.querySelector('span'), t0 = lab.textContent;
  b.disabled = true; lab.textContent = '내려받는 중';
  try {
    const fi = st.doc.files?.[f];
    const r = fi?.href ? await api(rel(fi.href), { raw: true })
      : await api(f === 'xlsx' ? '/ximap/report.xlsx' : '/ximap/report.hwpx', { method: 'POST', body: { spec: st.doc.spec }, raw: true });
    if (!r.ok) throw new Error('http ' + r.status);
    const cd = r.headers.get('content-disposition') || '', m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const name = fi?.name || (m ? decodeURIComponent(m[1]) : `${String(st.doc.spec?.title || '통계').replace(/[\/:*?"<>|\s·—]+/g, '_')}_보고서.${f}`);
    const u = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    lab.textContent = '내려받았습니다';
  } catch { lab.textContent = '내려받지 못했습니다'; }
  setTimeout(() => { lab.textContent = t0; b.disabled = false; }, 1600);
}

let OPEN = null;
/** 미리 받기(보고서 보기 단추가 화면에 생길 때) — 누르면 바로 열리게 */
export function preload() { return ready().catch(() => {}); }
export function closeReport() {
  if (!OPEN) return;
  const st = OPEN; OPEN = null;
  removeEventListener('keydown', st.onKey, true);
  st.untip?.();
  st.root.classList.remove('in');
  setTimeout(() => st.root.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  document.documentElement.classList.remove('rv-open');
  if (window.__rv) window.__rv.open = false;
  try { st.from?.focus?.({ preventScroll: true }); } catch { /* */ }
}

/** 보고서 보기 열기 — { href } (채팅 run 파일) 또는 { spec } (통계 판) */
export async function openReport({ href, spec, from } = {}) {
  const t0 = performance.now();
  closeReport();
  const root = document.createElement('div');
  root.className = 'rv'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '통계 보고서');
  root.innerHTML = '<div class="rv-in"><p class="rv-wait">보고서를 여는 중</p></div>';
  const st = { root, from, allBar: false, allRank: false, doc: null, mapHtml: '' };
  OPEN = st;
  st.onKey = (e) => { if (e.key === 'Escape' && OPEN === st) { e.preventDefault(); e.stopImmediatePropagation(); closeReport(); } };
  addEventListener('keydown', st.onKey, true);
  const [, doc] = await Promise.all([ready(), href ? api(rel(href)) : Promise.resolve({ v: 1, spec, made: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }), made_t: '', files: {} })]).catch((err) => { closeReport(); throw err; });
  if (OPEN !== st) return;
  if (!doc?.spec) { closeReport(); return; }
  st.doc = doc;
  document.body.append(root);
  document.documentElement.classList.add('rv-open');
  render(st);
  st.untip = D.bindTips(root);
  requestAnimationFrame(() => root.classList.add('in'));
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('.rv-x')) { closeReport(); return; }
    const dl = e.target.closest('.rv-dl[data-f]'); if (dl) { download(st, dl.dataset.f, dl); return; }
    const mo = e.target.closest('.rv-more[data-more]');
    if (mo) { if (mo.dataset.more === 'bar') st.allBar = !st.allBar; else st.allRank = !st.allRank; const y = root.scrollTop; render(st); root.scrollTop = y; }
  });
  root.tabIndex = -1; root.focus({ preventScroll: true });
  const ms = Math.round(performance.now() - t0);
  window.__rv = { open: true, ms, title: doc.spec.title, main: doc.spec.main || null, kpis: (doc.spec.kpis || []).map((k) => [k.label, k.value]), emd: emdRows(doc.spec).length };
  // 작은 지도는 뒤따라(경계 한 번 받으면 기억)
  const m = doc.spec.map;
  if (m?.level === 'emd' && m.sgg) {
    const fc = await emdFC(m.sgg);
    if (OPEN !== st) return;
    st.mapHtml = svgMap(fc, m, doc.spec.emd) || '<p class="rv-map-none">지도를 그리지 못했습니다</p>';
    const w = root.querySelector('[data-map]'); if (w) w.innerHTML = st.mapHtml;
    window.__rv.mapMs = Math.round(performance.now() - t0);
  }
}
