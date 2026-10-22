/* XI ChatGEO 답 ↔ 지도 강조(10-18 원칙 292 — "대화해서 실제 지도에 하이라이팅 기능을 만들던가. 지도와 동적으로 움직이는게 맞다.")
   서버가 답과 함께 보낸 map_refs(답이 가리키는 읍면동 · 시군구 — 도구 결과에서 · 관할 밖 0 · server/agent/tools/ext/hl.py)를 지도에 그린다.
     ① 답에 나온 곳 = 테두리 + 옅은 면(AI 색) · 같은 시군구의 나머지 읍면동은 옅게 덮는다(고른 곳만 남길 때는 더 짙게)
     ② 답 글(답 띠 · 대화 서랍)의 이름과 그 뒤 숫자를 지도와 잇는다 — 올리면 그 곳이 빛나고, 누르면 그 곳으로 + 그 읍면동만(조건)
     ③ 이어 묻기('그중 가장 큰 곳은?' · '송동면만')는 서버가 앞 답 목록에서 골라 보낸 새 map_refs 로 강조가 바뀐다
   글자를 읽어 지명을 추측하지 않는다 — 잇는 이름은 map_refs 의 이름뿐. 지역 고정값 0 · 토큰 색(--ai)만. 끄기 = 주소에 ?hl=0. */
const AI = '#0FA9A0';
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bboxOf = (gs) => { let w = 180, s = 90, e = -180, n = -90; const walk = (c) => (typeof c[0] === 'number' ? (w = Math.min(w, c[0]), e = Math.max(e, c[0]), s = Math.min(s, c[1]), n = Math.max(n, c[1])) : c.forEach(walk)); gs.forEach((g) => g && walk(g.coordinates)); return w < e ? [w, s, e, n] : null; };
const EMPTY = { type: 'FeatureCollection', features: [] };

/**
 * @param {object} o
 * @param {maplibregl.Map} o.map
 * @param {(sgg:string)=>Promise<{cd:string,nm:string,geometry:object}[]>} o.emds   그 시군구 읍면동(코드 · 이름 · 경계)
 * @param {(k:string)=>{geometry:object,name:string}|null} o.sgg                       시군구 경계(관할 안 목록에서만)
 * @param {(bbox:number[], o?:object)=>any} o.go                                      카메라
 * @param {(ref:object, item:object)=>boolean|void} o.focus                          누름 — 그 곳으로 + 조건(화면이 처리하면 true)
 * @param {()=>({on:boolean, sgg:string|null})} o.om                                  지도 위 통계(색칠)가 같은 시군구를 보이고 있나
 */
export function createChatHL({ map, emds, sgg, go, focus, om = () => ({ on: false, sgg: null }) }) {
  const HL = { cur: null, feats: new Map(), on: [], pulse: null, seq: 0 };
  function ensure() {
    if (map.getSource('xk-hl')) { for (const id of ['xk-hl-dim', 'xk-hl-fill', 'xk-hl-glow', 'xk-hl-case', 'xk-hl-line']) if (map.getLayer(id)) map.moveLayer(id); return; }   // 늘 맨 위(통계 색칠보다 위)
    map.addSource('xk-hl-o', { type: 'geojson', data: EMPTY });
    map.addSource('xk-hl', { type: 'geojson', data: EMPTY, promoteId: 'k' });
    map.addLayer({ id: 'xk-hl-dim', type: 'fill', source: 'xk-hl-o', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': ['coalesce', ['get', 'a'], 0.3] } });
    map.addLayer({ id: 'xk-hl-fill', type: 'fill', source: 'xk-hl', paint: { 'fill-color': AI, 'fill-opacity': ['case', ['boolean', ['feature-state', 'hv'], false], 0.26, 0.1] } });
    map.addLayer({ id: 'xk-hl-glow', type: 'line', source: 'xk-hl', paint: { 'line-color': AI, 'line-width': 16, 'line-blur': 10, 'line-opacity': ['coalesce', ['feature-state', 'p'], 0] } });
    map.addLayer({ id: 'xk-hl-case', type: 'line', source: 'xk-hl', paint: { 'line-color': '#FFFFFF', 'line-width': 6, 'line-opacity': 0.92 } });
    map.addLayer({ id: 'xk-hl-line', type: 'line', source: 'xk-hl', paint: { 'line-color': AI, 'line-width': ['case', ['boolean', ['feature-state', 'hv'], false], 4, 2.6] } });
    if (window.__xc?.hlVisible === false) for (const id of ['xk-hl-dim', 'xk-hl-fill', 'xk-hl-glow', 'xk-hl-case', 'xk-hl-line']) map.setLayoutProperty(id, 'visibility', 'none');
  }
  function paintOn() { map.getSource('xk-hl')?.setData({ type: 'FeatureCollection', features: HL.on.map((k) => HL.feats.get(k)).filter(Boolean).map((f) => ({ type: 'Feature', id: f.k, properties: { k: f.k, name: f.name }, geometry: f.geometry })) }); }
  const fs = (k, s) => { try { map.setFeatureState({ source: 'xk-hl', id: k }, s); } catch { /* 층 없음 */ } };
  function stopPulse() { if (HL.pulse) { cancelAnimationFrame(HL.pulse.raf); fs(HL.pulse.k, { p: 0, hv: false }); HL.pulse = null; } }
  /** 올림 — 그 곳이 숨 쉬듯 빛난다(손을 떼면 멈춤) */
  function pulse(k) {
    if (HL.pulse?.k === k) return;
    stopPulse();
    if (!k || !HL.feats.has(k)) return;
    const P = { k, raf: 0 }; HL.pulse = P;
    fs(k, { hv: true });
    if (RM()) { fs(k, { p: 0.7 }); return; }
    const t0 = performance.now();
    (function step(now) { if (HL.pulse !== P) return; fs(k, { p: 0.35 + 0.45 * (0.5 - 0.5 * Math.cos(((now - t0) / 900) * Math.PI * 2)) }); P.raf = requestAnimationFrame(step); })(t0);
  }
  /** 답이 왔을 때 한 번 — 강조한 곳이 차례로 반짝 */
  function flash(ks) {
    if (RM()) return;
    const my = HL.seq, t0 = performance.now();
    (function step(now) {
      if (my !== HL.seq) return;
      let live = false;
      ks.forEach((k, i) => { const t = (now - t0 - i * 120) / 900; if (t < 1) live = true; if (HL.pulse?.k !== k) fs(k, { p: t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI) * 0.8 }); });
      if (live) requestAnimationFrame(step);
    })(t0);
  }
  function clear() {
    HL.seq++; stopPulse(); HL.cur = null; HL.feats.clear(); HL.on = [];
    map.getSource('xk-hl')?.setData(EMPTY); map.getSource('xk-hl-o')?.setData(EMPTY);
    if (window.__xc) window.__xc.hl = null;
  }
  /** map_refs 를 지도에 */
  async function show(refs) {
    if (!refs?.items?.length) { if (HL.cur && HL.cur.src !== 'dash') clear(); return false; }
    const my = ++HL.seq; stopPulse();
    const only = refs.mode === 'only';
    const want = new Set(only ? refs.items.map((it) => it.k) : (refs.named?.length ? refs.named : []));
    let all = [];
    if (refs.level === 'emd' && refs.sgg) {
      let rows = await emds(String(refs.sgg)).catch(() => []);
      if (!rows?.length && my === HL.seq) { await new Promise((r) => setTimeout(r, 700)); rows = await emds(String(refs.sgg)).catch(() => []); }   // 첫 질문에서 경계가 늦으면 한 번 더
      all = (rows || []).map((e) => ({ k: e.cd, name: e.nm, geometry: e.geometry }));
    }
    else if (refs.level === 'sgg') all = refs.items.map((it) => { const g = sgg(it.k); return g ? { k: it.k, name: g.name || it.name, geometry: g.geometry } : null; }).filter(Boolean);
    if (my !== HL.seq) return false;
    all = all.filter((f) => f.geometry);
    const has = new Set(all.map((f) => f.k));
    const items = refs.items.filter((it) => has.has(it.k));      // 경계가 없는 곳(관할 밖 · 다른 시군구)은 잇지도 그리지도 않는다
    if (!items.length) { clear(); return false; }
    ensure();
    HL.cur = { ...refs, items };
    HL.feats = new Map(all.filter((f) => items.some((it) => it.k === f.k)).map((f) => [f.k, f]));
    const on = all.filter((f) => want.has(f.k));
    HL.on = on.map((f) => f.k); paintOn();
    const o = om();
    const dash = o.on && refs.level === 'emd' && String(o.sgg || '') === String(refs.sgg);
    const dimA = only ? 0.62 : dash ? 0.22 : 0.34;
    map.getSource('xk-hl-o').setData(refs.level === 'emd' && on.length ? { type: 'FeatureCollection', features: all.filter((f) => !want.has(f.k)).map((f) => ({ type: 'Feature', properties: { a: dimA }, geometry: f.geometry })) } : EMPTY);
    if (window.__xc) window.__xc.hl = { level: refs.level, mode: refs.mode, n: on.length, keys: on.map((f) => f.k), names: on.map((f) => f.name), linked: items.length };
    flash(on.map((f) => f.k));
    document.dispatchEvent(new CustomEvent('xk:hl-shown', { detail: { run: refs.run } }));   // 답 띠 · 서랍의 이름 잇기를 다시(강조가 답보다 늦게 끝난 경우)
    // 카메라 — 고른 곳 하나 = 그 곳으로 + 조건(누름과 같은 길) · 여럿 = 그 곳들이 다 보이게. 통계 색칠이 같은 시군구를 그리는 중이면 그쪽이 카메라를 잡는다
    if (only && refs.focus && HL.feats.has(refs.focus)) focusK(refs.focus);
    else if (!dash && on.length && refs.level === 'emd') { const b = bboxOf(on.map((f) => f.geometry)); if (b) go(b, { maxZoom: on.length === 1 ? 13 : 12 }); }
    return true;
  }
  function focusK(k) {
    const it = HL.cur?.items.find((x) => x.k === k), f = HL.feats.get(k);
    if (!it || !f) return;
    if (!HL.on.includes(k)) { HL.on.push(k); paintOn(); }   // 테두리가 없던 곳을 누르면 그 곳도 강조 줄에 넣는다
    if (focus?.(HL.cur, it) !== true) { const b = bboxOf([f.geometry]); if (b) go(b, { maxZoom: 13 }); }
    if (window.__xc?.hl) window.__xc.hl.focus = k;
  }

  /* ── 답 글의 이름 · 숫자 잇기 ── */
  const NUM = '(?:\\s*[0-9][0-9,]*(?:\\.[0-9]+)?\\s*(?:곳|동|개|필지|건|㎡|㎢|ha|%|곳\\/㎢)?)?';
  function link(el) {
    const R = HL.cur; if (!el || !R?.items?.length) return 0;
    if (el.dataset.hlRun === String(R.run || '') && el.querySelector('.xk-ref')) return el.querySelectorAll('.xk-ref').length;
    const names = [...new Set(R.items.map((it) => it.name).filter((n) => n && n.length >= 2))].sort((a, b) => b.length - a.length);
    if (!names.length) return 0;
    const byName = new Map(R.items.map((it) => [it.name, it.k]));
    const rx = new RegExp(`(${names.map(esc).join('|')})${NUM}`, 'g');
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest('.xk-ref, button, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = []; for (let n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n);
    let got = 0;
    for (const n of nodes) {
      const s = n.nodeValue; rx.lastIndex = 0; let m, last = 0, loc = 0; const frag = document.createDocumentFragment();
      while ((m = rx.exec(s))) {
        const pre = s.slice(Math.max(0, m.index - 1), m.index), post = s.slice(m.index + m[1].length, m.index + m[1].length + 1);
        if (/[가-힣]/.test(pre) || (/[가-힣]/.test(post) && !/^[은는이가을를의에과와도만로으입]/.test(post))) continue;   // 더 긴 낱말의 일부('송동면사무소')는 잇지 않는다
        const txt = m[0].trimEnd();
        frag.append(s.slice(last, m.index));
        const sp = document.createElement('span');
        sp.className = 'xk-ref'; sp.dataset.hl = byName.get(m[1]); sp.tabIndex = 0; sp.setAttribute('role', 'button'); sp.title = `${m[1]} — 지도에서 보기`;
        sp.textContent = txt; frag.append(sp);
        last = m.index + txt.length; loc++;
      }
      if (!loc) continue;
      frag.append(s.slice(last));
      const tail = n.nextSibling;                       // 이름 바로 뒤의 숫자 칩(봉투 · '운봉읍 241')도 같은 곳으로
      const lastRef = [...frag.childNodes].reverse().find((x) => x.nodeType === 1);
      const gap = frag.lastChild?.nodeType === 3 ? frag.lastChild.nodeValue : '';
      n.replaceWith(frag);
      if (tail?.nodeType === 1 && tail.classList?.contains('k-ck-n') && lastRef?.classList?.contains('xk-ref') && /^\s*$/.test(gap) && !/[0-9]/.test(lastRef.textContent.slice(-1))) {
        tail.classList.add('xk-ref-n'); tail.dataset.hl = lastRef.dataset.hl;
      }
      got += loc;
    }
    el.dataset.hlRun = String(R.run || '');
    return got;
  }
  // 올림 · 누름(답 띠 · 대화 서랍 어디서나 · 키보드 Enter)
  const refOf = (e) => e.target.closest?.('[data-hl]');
  document.addEventListener('mouseover', (e) => { const r = refOf(e); if (r) pulse(r.dataset.hl); });
  document.addEventListener('mouseout', (e) => { const r = refOf(e); if (r && !r.contains(e.relatedTarget)) stopPulse(); });
  document.addEventListener('focusin', (e) => { const r = refOf(e); if (r) pulse(r.dataset.hl); });
  document.addEventListener('focusout', (e) => { if (refOf(e)) stopPulse(); });
  document.addEventListener('click', (e) => { const r = refOf(e); if (!r) return; e.preventDefault(); focusK(r.dataset.hl); });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const r = refOf(e); if (!r) return; e.preventDefault(); focusK(r.dataset.hl); });
  // 지도에서 강조한 곳에 올리면 답 글의 그 이름도 함께
  map.on('mousemove', (e) => {
    if (!HL.cur || !map.getLayer('xk-hl-fill')) return;
    const f = map.queryRenderedFeatures(e.point, { layers: ['xk-hl-fill'] })[0], k = f?.properties?.k || null;
    document.querySelectorAll('.xk-ref.is-hv, .xk-ref-n.is-hv').forEach((x) => { if (x.dataset.hl !== k) x.classList.remove('is-hv'); });
    if (k) document.querySelectorAll(`[data-hl="${CSS.escape(k)}"]`).forEach((x) => x.classList.add('is-hv'));
  });
  /** 지도 강조 켜고 끄기(대화 서랍 · 10-22) — 강조 층만 숨김/보임(답 · 이름 잇기는 그대로) */
  let vis = true;
  function setVisible(on) {
    vis = on !== false;
    for (const id of ['xk-hl-dim', 'xk-hl-fill', 'xk-hl-glow', 'xk-hl-case', 'xk-hl-line']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis ? 'visible' : 'none');
    if (window.__xc) window.__xc.hlVisible = vis;
  }
  return { show, clear, link, pulse, focus: focusK, setVisible, get visible() { return vis; }, get cur() { return HL.cur; } };
}
