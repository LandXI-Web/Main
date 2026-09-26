/* search.js — 장소 검색. /proxy/vworld/search 가 503(vworld_key_pending)이면 결손 칩 '장소 검색 · V-World 키 대기'(재시도 없음).
   읍면동 39 로컬 검색은 항상 동작(A11 namwon-emd.geojson · 초성·부분 일치). 고르면 1600 으로 그 경계에 선다. */
import { API, api, ApiError } from '../../shared/api-v1.js';
import { void_ } from '../fx/provenance.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const cho = (s) => [...s].map((c) => { const k = c.charCodeAt(0) - 0xac00; return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c; }).join('');
export function search(root, { emd, onPick }) {
  const input = root.querySelector('input'), list = root.querySelector('.xi-search-list'), note = root.querySelector('.xi-search-void');
  const S = { vworld: 'unknown', items: [] };
  /* V-World 검색 프록시는 2026-09-24 현재 키 권한 대기(503 · 계약 §4.3) — 부팅 때 두드리지 않는다(503 도 콘솔 오류로 남는다).
     읍면동에 없는 말을 사용자가 Enter 로 찾을 때만 한 번 부르고, 결과로 칩을 바꾼다(재시도 없음). */
  const showVoid = (text) => { note.innerHTML = ''; void_(note.appendChild(document.createElement('span')), text); note.hidden = false; };
  const probeVworld = async (q) => {
    if (API.mode !== 'on' || S.vworld !== 'unknown') return;
    try { await api('/proxy/vworld/search?query=' + encodeURIComponent(q) + '&type=place&size=5'); S.vworld = 'ok'; note.hidden = true; }
    catch (e) { S.vworld = e instanceof ApiError && e.code === 'vworld_key_pending' ? 'pending' : 'error'; showVoid(S.vworld === 'pending' ? '장소 검색 · V-World 키 대기' : '장소 검색 · 서버 오류'); }
  };
  showVoid('장소 검색 · V-World 키 대기');
  const render = (q) => {
    const k = q.trim(); if (!k) { list.hidden = true; return; }
    const c = cho(k);
    S.items = emd.filter((f) => f.nm.includes(k) || cho(f.nm).startsWith(c)).slice(0, 8);
    list.innerHTML = S.items.length ? S.items.map((f, i) => `<li role="option" data-i="${i}" tabindex="-1"><b>${esc(f.nm)}</b><small>남원시 · ${esc(f.cd)}</small></li>`).join('') : '<li class="xi-none">읍면동 일치 없음</li>';
    list.hidden = false;
  };
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !S.items[0] && input.value.trim()) probeVworld(input.value.trim()); if (e.key === 'Enter' && S.items[0]) { onPick(S.items[0]); list.hidden = true; input.blur(); } if (e.key === 'Escape') { list.hidden = true; input.blur(); } });
  list.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-i]'); if (!li) return; e.preventDefault(); onPick(S.items[+li.dataset.i]); input.value = S.items[+li.dataset.i].nm; list.hidden = true; });
  input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 120));
  return S;
}
