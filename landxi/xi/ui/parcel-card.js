/* parcel-card.js — 필지 카드(유리 · 380ms 락온 뒤). PNU·지목·면적·공시지가(2021-12 기준) + 겹치는 결과 신뢰도
   + A01 타일 실시간 크롭 4장(AOI 안만 · canvas drawImage · 필지 모양 clip · clip-path 현상 1000 · Roboflow '이미지 1급' 장치)
   AOI 밖은 A03 2시점 2장 + '4시점은 드론 AOI 안만'. P8 이 없으면 지목·공시지가 = '필지 · P8 대기'. */
import { API, parcelAt, env, ApiError } from '../../shared/api-v1.js';
import { numHtml, void_ } from '../fx/provenance.js';
import { clipIn, panelIn, panelOut, anchor, toast, D } from '../fx/glass.js';
import { pmtilesOf } from '../engine/sources.js';
import { bboxOf, lock, clearLocks } from '../fx/arrive.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mx = (lng) => (lng + 180) / 360;
const my = (lat) => { const s = Math.sin((lat * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };

/** 한 시점 크롭: 필지 bbox 를 덮는 타일을 받아 필지 모양으로 잘라 그린다. 반환 canvas | null */
export async function cropOf(url, geom, { maxZ = 19, size = 132 } = {}) {
  const b = bboxOf(geom), pad = 0.1;
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, span = Math.max(mx(b[2]) - mx(b[0]), my(b[1]) - my(b[3])) * (1 + pad * 2);
  let z = maxZ; while (z > 10 && span * 256 * 2 ** z > 700) z--;
  const n = 2 ** z, X0 = mx(cx) - span / 2, Y0 = my(cy) - span / 2;
  const tx0 = Math.floor(X0 * n), tx1 = Math.floor((X0 + span) * n), ty0 = Math.floor(Y0 * n), ty1 = Math.floor((Y0 + span) * n);
  const p = pmtilesOf(url), c = document.createElement('canvas'); c.width = c.height = size * 2;
  const g = c.getContext('2d'), k = (size * 2) / (span * n * 256);
  const ring = (geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0]).map(([x, y]) => [(mx(x) - X0) * n * 256 * k, (my(y) - Y0) * n * 256 * k]);
  let got = 0;
  const jobs = [];
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) jobs.push((async () => {
    const r = await p.getZxy(z, x, y).catch(() => null);
    if (!r || !r.data || !r.data.byteLength) return;
    const bm = await createImageBitmap(new Blob([r.data])).catch(() => null); if (!bm) return;
    got++;
    return [bm, ((x / n) - X0) * n * 256 * k, ((y / n) - Y0) * n * 256 * k, 256 * k];
  })());
  const tiles = (await Promise.all(jobs)).filter(Boolean);
  if (!got) return null;
  g.fillStyle = '#0B1016'; g.fillRect(0, 0, c.width, c.height);
  g.save(); g.globalAlpha = 0.28; for (const [bm, x, y, s] of tiles) g.drawImage(bm, x, y, s + 0.5, s + 0.5); g.restore();   // 필지 밖 = 어둡게(맥락)
  g.save(); g.beginPath(); ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
  for (const [bm, x, y, s] of tiles) g.drawImage(bm, x, y, s + 0.5, s + 0.5);
  g.restore();
  g.beginPath(); ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.strokeStyle = '#FFFFFF'; g.lineWidth = 2; g.stroke();
  c.dataset.z = String(z);
  return c;
}

export function parcelCard(el, ctx) {
  let detach = null, seq = 0;
  const close = () => { seq++; detach && detach(); detach = null; panelOut(el); clearLocks(); ctx.onClose && ctx.onClose(); };
  async function open({ feature, lngLat, source = 'A02' }) {
    const my = ++seq;
    const p = feature.properties, geom = feature.geometry, bb = bboxOf(geom);
    clearLocks();
    const L = lock(ctx.stageEl, ctx.A, { lngLat: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], bbox: bb, html: `<b>${esc(p.cls || '필지')}</b>${esc(p.pnu || '')}` });
    await Promise.race([L.done, new Promise((r) => setTimeout(r, D.d380 + D.d120))]);
    if (my !== seq) return;
    // 필지 속성: on = GET /parcels(P8) · off = P8 PMTiles(있으면) · 없으면 결손 칩
    let parcel = null, why = '필지 · P8 대기';
    if (API.mode === 'on') { try { parcel = await parcelAt(lngLat.lng, lngLat.lat); } catch (e) { why = e instanceof ApiError && e.code === 'parcels_unavailable' ? '필지 · P8 대기' : '필지 · 서버 오류'; } }
    else if (ctx.parcelLookup) parcel = await ctx.parcelLookup(lngLat);
    const inAoi = ctx.aoiBounds && bb[0] >= ctx.aoiBounds[0] && bb[2] <= ctx.aoiBounds[2] && bb[1] >= ctx.aoiBounds[1] && bb[3] <= ctx.aoiBounds[3];
    const src = source === 'A02' ? 'namwon-farmland-2025.geojson' : source;
    el.innerHTML = `
      <header><span class="xi-eyebrow">필지 · ${esc(source === 'A02' ? 'A02 농지이용 2025 · 드론' : source)}</span><button class="xi-x" type="button" aria-label="닫기">×</button></header>
      <p class="xi-pnu"><small>PNU${parcel?.pnu ? ' · P8 필지 2021-12' : ''}</small><b class="mono">${esc(parcel?.pnu || p.pnu || '—')}</b>${parcel?.jibun ? `<span class="xi-jibun">${esc(parcel.jibun)}</span>` : ''}</p>
      <dl class="xi-kv">
        <div><dt>AI 분석</dt><dd><b class="xi-cls">${esc(p.cls || '—')}</b> <span data-basis="inferred" class="xi-tagb">AI 추론 · 결과 확인 전</span></dd></div>
        <div><dt>면적(AI 경계)</dt><dd>${p.area != null || p.area_m2 != null ? numHtml(env(Math.round(p.area ?? p.area_m2), 'm2', 'inferred', src)) : '—'}</dd></div>
        <div><dt>신뢰도</dt><dd>${p.conf != null ? numHtml(env(+(+p.conf).toFixed(2), 'ratio', 'inferred', src), { digits: 2, unit: false }) : '—'}</dd></div>
        <div><dt>지목</dt><dd class="xi-jimok"></dd></div>
        <div><dt>공시지가 <small>2021-12 기준</small></dt><dd class="xi-price"></dd></div>
        ${parcel?.area_m2 ? `<div><dt>공부 면적</dt><dd>${numHtml(parcel.area_m2)}</dd></div>` : ''}
        <div><dt>읍면동</dt><dd>${esc(p.emd || '—')}</dd></div>
      </dl>
      <figure class="xi-crops" aria-label="시점 크롭"></figure>
      <p class="xi-crop-note"></p>
      <footer>${ctx.canFeedback ? '<button type="button" class="xi-btn xi-btn--ink xi-fb">오류 신고 ›</button>' : ''}<button type="button" class="xi-btn xi-btn--br xi-close">닫기</button></footer>`;
    const jd = el.querySelector('.xi-jimok'), pd = el.querySelector('.xi-price');
    if (parcel && parcel.jimok) { jd.innerHTML = `<b>${esc(parcel.jimok)}</b>${parcel.owner_kind ? ` <small>${esc(parcel.owner_kind)}</small>` : ''}`; pd.innerHTML = parcel.price_krw_m2 ? numHtml(parcel.price_krw_m2) : '—'; el.dataset.parcel = parcel.pnu || ''; }
    else { void_(jd.appendChild(document.createElement('span')), why); void_(pd.appendChild(document.createElement('span')), why); }
    el.querySelector('.xi-x').onclick = close; el.querySelector('.xi-close').onclick = close;
    el.querySelector('.xi-fb')?.addEventListener('click', () => ctx.feedback({ pnu: p.pnu, fid: p.id, lnglat: [lngLat.lng, lngLat.lat] }));
    detach && detach(); detach = anchor(el, ctx.A, [bb[2], bb[3]], { avoid: [document.getElementById('hud')] });
    panelIn(el);
    el.dataset.pnu = p.pnu || '';
    // 크롭
    const fig = el.querySelector('.xi-crops'), note = el.querySelector('.xi-crop-note');
    const epochs = inAoi ? ctx.aoiEpochs : ctx.cityEpochs;
    note.textContent = inAoi ? `LX 드론 4시점 · 타일에서 실시간 크롭` : 'A03 남원 전역 2시점(2 m) · 4시점은 드론 AOI 안만';
    fig.innerHTML = epochs.map((e) => `<div class="xi-crop" data-ep="${esc(e.id)}"><div class="xi-crop-img"></div><figcaption>${esc(e.label)}<small>${esc(e.gsd)}</small></figcaption></div>`).join('');
    el.dataset.crops = '0';
    await Promise.all(epochs.map(async (e, i) => {
      const c = await cropOf(e.url, geom, { maxZ: e.maxZ });
      if (my !== seq) return;
      const box = fig.children[i].querySelector('.xi-crop-img');
      if (!c) { void_(box.appendChild(document.createElement('span')), '이 시점 타일 없음'); return; }
      box.appendChild(c); el.dataset.crops = String(+el.dataset.crops + 1);
      await clipIn(c, i * D.d120);
    }));
    el.dataset.ready = '1';
  }
  return { open, close };
}
