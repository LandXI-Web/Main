/* search.js — 장소 검색. 읍면동 39 로컬 검색(A11 namwon-emd.geojson · 초성·부분 일치)은 항상 동작.
   V-World 장소 검색(/proxy/vworld/search · 키는 서버에만)은 부팅 때 한 번 실측(_lxopt=1 · 콘솔 오류 0):
   200 이면 결손 칩 없이 장소·지번 검색을 켜고, 503(vworld_key_pending)일 때만 '장소 검색 · V-World 키 대기' 결손 칩(F1-B 게이트 통보 반영).
   고르면 1600 으로 그 경계(읍면동) 또는 그 점(z16)에 선다. */
import { API } from '../../shared/api-v1.js';
import { void_ } from '../fx/provenance.js';
import { opt } from '../engine/opt.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const cho = (s) => [...s].map((c) => { const k = c.charCodeAt(0) - 0xac00; return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c; }).join('');
const vwQ = (q, size = 6) => `/proxy/vworld/search?request=search&format=json&type=place&size=${size}&query=${encodeURIComponent(q)}`;
export function search(root, { emd, onPick }) {
  const input = root.querySelector('input'), list = root.querySelector('.xi-search-list'), note = root.querySelector('.xi-search-void');
  const S = { vworld: 'unknown', items: [], seq: 0 };
  const showVoid = (text) => { note.innerHTML = ''; void_(note.appendChild(document.createElement('span')), text); note.hidden = false; };
  // 부팅 실측 — 키 활성이면 결손 칩 0
  (async () => {
    if (API.mode !== 'on') { S.vworld = 'off'; showVoid('장소 검색 · 서버 연결 없음 · 읍면동만'); return; }
    try { const j = await opt(vwQ('남원시청', 1), {}); S.vworld = j?.response?.status === 'OK' ? 'ok' : 'error'; }
    catch (e) { S.vworld = e.code === 'vworld_key_pending' ? 'pending' : e.code === 'no_sw' ? 'unknown' : 'error'; }
    root.dataset.vworld = S.vworld;
    if (S.vworld === 'ok') { note.hidden = true; input.placeholder = '읍면동 · 장소 · 지번(V-World)'; }
    else if (S.vworld === 'pending') showVoid('장소 검색 · V-World 키 대기');
    else if (S.vworld === 'error') showVoid('장소 검색 · V-World 응답 오류 · 읍면동만');
  })();
  const render = async (q) => {
    const k = q.trim(); if (!k) { list.hidden = true; return; }
    const my = ++S.seq, c = cho(k);
    const loc = emd.filter((f) => f.nm.includes(k) || cho(f.nm).startsWith(c)).slice(0, 6).map((f) => ({ kind: 'emd', f, title: f.nm, sub: `남원시 · ${f.cd}` }));
    S.items = loc;
    list.innerHTML = loc.length ? loc.map((it, i) => `<li role="option" data-i="${i}" tabindex="-1"><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></li>`).join('') : '<li class="xi-none">읍면동 일치 없음</li>';
    list.hidden = false;
    if (S.vworld !== 'ok' || k.length < 2) return;
    try {
      const j = await opt(vwQ(k), {});
      if (my !== S.seq) return;
      const vw = (j?.response?.result?.items || []).map((x) => ({ kind: 'place', title: x.title, sub: x.address?.parcel || x.address?.road || x.category || '', ll: [+x.point.x, +x.point.y] })).filter((x) => Number.isFinite(x.ll[0]));
      S.items = [...loc, ...vw];
      list.innerHTML = S.items.length ? S.items.map((it, i) => `<li role="option" data-i="${i}" tabindex="-1" data-kind="${it.kind}"><b>${esc(it.title)}</b><small>${esc(it.sub)}${it.kind === 'place' ? ' · V-World' : ''}</small></li>`).join('') : '<li class="xi-none">일치 없음 · V-World</li>';
    } catch { /* 결손은 읍면동 목록 그대로 */ }
  };
  let t = 0;
  const pick = (it) => { if (!it) return; onPick(it.kind === 'emd' ? it.f : { nm: it.title, point: it.ll, bbox: [it.ll[0] - 0.004, it.ll[1] - 0.003, it.ll[0] + 0.004, it.ll[1] + 0.003] }); list.hidden = true; input.blur(); };
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => render(input.value), 180); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(S.items[0]); if (e.key === 'Escape') { list.hidden = true; input.blur(); } });
  list.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-i]'); if (!li) return; e.preventDefault(); const it = S.items[+li.dataset.i]; input.value = it.title; pick(it); });
  input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 120));
  return S;
}
