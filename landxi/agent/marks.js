/* marks.js — 에이전트 도착 락온 마커(F2-E 임시 층 · 2차 판정 뒤).
   '5필지 도착'이 HUD 숫자만 바꾸고 지도에는 다섯 필지가 129,420 판독 폴리곤 속에 묻히던 문제 → 필지 중심에 인용 번호 [n] 락온 마커를 찍는다.
   · 크기는 줌과 무관(최소 40px 브래킷 · 필지가 크면 필지 bbox) · 락온 380 = tokens-v2 .cw-lock(성장 180 → 앰버 80 → 청록 120)
   · 시점: XI.arrive 의 'sweep' 단계에서 스윕 선이 그 필지의 x 를 지나는 순간(스윕 → 락온 → 숫자). sweep 이 없으면(감속 모션) 도착 직후 한 번에.
   · 필지 윤곽 강조 층(청록 2.5px + 흰 테두리)은 락온 단계에 올린다 — 도착 스윕 마스크(B 캔버스)를 건드리지 않게.
   · 마커 클릭 = 인용 [n] 과 같다(flyTo + 필지 카드).
   브리지(window.XI)에 마커·투영 부품이 없어(F2-A 요청: XI.lock({lngLat,bbox,html}) · XI.project) 지도 핸들은 XI 가 테스트용으로 내놓은
   window.__xi.A(MapLibre) 를 읽기만 하고, 그리는 것은 에이전트 소유 DOM(#locks 안 .ag-mks)과 'ag-hl-*' 임시 층뿐이다. */

const HL = ['ag-hl-casing', 'ag-hl-line'];
const S = { root: null, map: null, items: [], off: [], hlSrc: null };

function mapA() { return window.__xi?.A || null; }

export function clearMarks() {
  for (const f of S.off) { try { f(); } catch { /* */ } }
  S.off = [];
  S.root?.remove(); S.root = null; S.items = [];
  const m = S.map;
  if (m) {
    for (const id of HL) if (m.getLayer?.(id)) m.removeLayer(id);
    if (m.getSource?.('ag-hl')) m.removeSource('ag-hl');
  }
  S.map = null;
  delete document.documentElement.dataset.agentMarks;
  delete document.documentElement.dataset.agentMarksLocked;
}

function place(it) {
  const m = S.map; if (!m) return;
  const c = m.project(it.center);
  let w = 40, h = 40;
  if (it.bbox) {
    const a = m.project([it.bbox[0], it.bbox[3]]), b = m.project([it.bbox[2], it.bbox[1]]);
    w = Math.max(40, Math.min(240, Math.abs(b.x - a.x) + 16)); h = Math.max(40, Math.min(240, Math.abs(b.y - a.y) + 16));
  }
  it.el.style.width = w + 'px'; it.el.style.height = h + 'px';
  it.el.style.translate = `${(c.x - w / 2).toFixed(1)}px ${(c.y - h / 2).toFixed(1)}px`;
  it.x = c.x;
}

function highlight(features) {
  const m = S.map; if (!m || !features?.length) return;
  try {
    const data = { type: 'FeatureCollection', features };
    if (m.getSource('ag-hl')) m.getSource('ag-hl').setData(data);
    else {
      m.addSource('ag-hl', { type: 'geojson', data });
      m.addLayer({ id: 'ag-hl-casing', type: 'line', source: 'ag-hl', paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 6], 'line-opacity': 0.9 } });
      m.addLayer({ id: 'ag-hl-line', type: 'line', source: 'ag-hl', paint: { 'line-color': '#0FA9A0', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 3] } });
    }
  } catch (e) { console.warn('[agent] 강조 층', e?.message); }
}

function lockOne(it) {
  if (it.locked) return;
  it.locked = true;
  place(it);
  it.el.hidden = false;
  it.el.classList.add('cw-lock');           // 380 락온(성장 → 앰버 → 청록) — tokens-v2 키프레임 재사용
  it.el.dataset.lockAt = String(Math.round(performance.now()));
  const n = S.items.filter((x) => x.locked).length;
  document.documentElement.dataset.agentMarksLocked = String(n);
}

/**
 * 도착 전에 부른다. cits = [{n, pnu, addr, center, bbox, rule, priority}] · features = 필지 윤곽 GeoJSON Feature[] · onPick(n).
 * 반환 { lockAll() } — XI.arrive 가 끝나면 부른다(스윕이 없던 경우 남은 마커를 한 번에).
 */
export function arrivalMarks(cits, features, { onPick } = {}) {
  clearMarks();
  const m = mapA();
  const stage = document.getElementById('locks');
  const list = (cits || []).filter((c) => c.kind === 'parcel' && (c.center || c.bbox));
  if (!m || !stage || !list.length) { document.documentElement.dataset.agentMarks = m ? '0' : 'nomap'; return { lockAll() {} }; }
  S.map = m;
  const root = document.createElement('div');
  root.className = 'ag-mks'; root.setAttribute('aria-label', '에이전트 도착 필지');
  stage.appendChild(root);
  S.root = root;
  for (const c of list) {
    const center = c.center || [(c.bbox[0] + c.bbox[2]) / 2, (c.bbox[1] + c.bbox[3]) / 2];
    const el = document.createElement('div');
    el.className = 'ag-mk'; el.hidden = true; el.dataset.n = String(c.n);
    const short = String(c.addr || c.pnu || '').replace(/^(전북특별자치도\s*)?남원시\s*/, '').replace(/^\S+[읍면동]\s+/, '');
    el.innerHTML = `<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>`
      + `<button type="button" class="ag-mk-n" data-cite="${c.n}" aria-label="근거 ${c.n} · ${short}">${c.n}</button>`
      + `<span class="ag-mk-flag">${short.replace(/[<>&"]/g, '')}<small>${(c.rule || '')} ${(c.priority || '')}</small></span>`;
    el.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onPick?.(c.n); });
    root.appendChild(el);
    S.items.push({ n: c.n, el, center, bbox: c.bbox, locked: false, x: 0 });
  }
  const move = () => { for (const it of S.items) if (it.locked) place(it); };
  m.on('move', move); S.off.push(() => m.off('move', move));
  window.addEventListener('resize', move); S.off.push(() => window.removeEventListener('resize', move));
  document.documentElement.dataset.agentMarks = String(S.items.length);
  // 스윕 선 x(t) = x0 + (x1 − x0)·t/1000 (fx/arrive.js 와 같은 식) → 그 필지의 x 를 지나는 순간 락온
  const onPhase = (ev) => {
    const p = ev.detail?.phase;
    if (ev.detail?.scene && ev.detail.scene !== 'bridge') return;
    if (p === 'sweep') {
      const bb = S.items.reduce((b, it) => { const bx = it.bbox || [it.center[0], it.center[1], it.center[0], it.center[1]]; return [Math.min(b[0], bx[0]), Math.min(b[1], bx[1]), Math.max(b[2], bx[2]), Math.max(b[3], bx[3])]; }, [180, 90, -180, -90]);
      const W = m.getContainer().clientWidth;
      const x0 = Math.max(0, Math.min(W, m.project([bb[0], (bb[1] + bb[3]) / 2]).x)), x1 = Math.max(x0 + 1, Math.min(W, m.project([bb[2], (bb[1] + bb[3]) / 2]).x));
      const t0 = performance.now();
      for (const it of S.items) {
        const x = m.project(it.center).x;
        const d = Math.max(0, Math.min(1000, ((x - x0) / (x1 - x0)) * 1000));
        const tm = setTimeout(() => { lockOne(it); }, d);
        S.off.push(() => clearTimeout(tm));
      }
      document.documentElement.dataset.agentMarksSweepAt = String(Math.round(t0));
    } else if (p === 'lock') {
      highlight(features);
    } else if (p === 'count' || p === 'arrived') {
      for (const it of S.items) lockOne(it);
    }
  };
  document.addEventListener('xi-phase', onPhase); S.off.push(() => document.removeEventListener('xi-phase', onPhase));
  return {
    lockAll() { for (const it of S.items) lockOne(it); highlight(features); },
  };
}
