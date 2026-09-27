/* K4 region.js — 지역 선택(시도 → 시군구 · 검색). 콤보 1개(.t-input) · 최근 지역 localStorage.
   결과 = { sgg_cd, name, sido, bbox, has_imagery, deploys[] }
   const r = await regionPicker(el, { onPick: (region) => stage.go(region), public: false });
   loadRegions() — GET /regions(서버 S-3). 아직 없으면 배포 기록(/deploys)의 배포 지역으로 대신한다(approx:true · 지역 문자열 하드코딩 0). */
import { h, esc, api, LS, bboxOf, hasRoute, session } from './util.js';
import { t } from './i18n.js';

const KR = [124.0, 32.5, 132.5, 39.5];
const inKR = (b) => b && b[0] >= KR[0] && b[2] <= KR[2] && b[1] >= KR[1] && b[3] <= KR[3];
const RECENT = 'lx_kit_recent_regions';
let CACHE = null;

const splitName = (full = '') => {
  const p = String(full).trim().split(/\s+/);
  if (p.length >= 2) return { sido: p[0], name: p.slice(1).join(' ') };
  return { sido: p[0] || '', name: p[0] || '' };
};

export async function loadRegions({ public: pub = false, force = false } = {}) {
  if (CACHE && !force) return CACHE;
  if (await hasRoute('/regions')) try {
    const j = await api('/regions' + (pub ? '?public=1' : ''));
    CACHE = (j.items || []).map((r) => ({ ...splitName(r.name?.ko || r.name), ...r, name: r.name?.ko ? splitName(r.name.ko).name : r.name, full: r.name?.ko || r.name }));
    CACHE.source = 'regions';
    return CACHE;
  } catch { /* S-3 이전 — 배포 기록으로 */ }
  if (!pub && session.get()) try {
    const j = await api('/deploys');
    const by = new Map();
    for (const d of j.items || []) {
      if (/-test(-\d+)?$/.test(d.id)) continue;
      const b = bboxOf(d.aoi);
      if (!inKR(b)) continue;
      const key = d.region_profile || d.tenant_id;
      const full = d.region_name?.ko || key;
      const cur = by.get(key) || { sgg_cd: key, ...splitName(full), full, bbox: b, has_imagery: null, deploys: [], approx: true };
      cur.bbox = [Math.min(cur.bbox[0], b[0]), Math.min(cur.bbox[1], b[1]), Math.max(cur.bbox[2], b[2]), Math.max(cur.bbox[3], b[3])];
      cur.deploys.push({ id: d.id, card: d.card_id, stage: d.stage });
      by.set(key, cur);
    }
    CACHE = [...by.values()].sort((a, b) => a.full.localeCompare(b.full, 'ko'));
    CACHE.source = 'deploys';
    return CACHE;
  } catch { /* 세션 없음 */ }
  CACHE = []; CACHE.source = 'none'; return CACHE;
}

export const recent = () => LS.get(RECENT, []);
const remember = (r) => LS.set(RECENT, [r.sgg_cd, ...recent().filter((k) => k !== r.sgg_cd)].slice(0, 5));

export async function regionPicker(el, { onPick, public: pub = false, value } = {}) {
  el.classList.add('k-region');
  const input = h('input.t-input.k-region-i', { type: 'search', placeholder: t('region.placeholder'), 'aria-label': t('region.placeholder'), role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list', autocomplete: 'off', spellcheck: 'false' });
  const list = h('ul.k-region-l', { role: 'listbox', hidden: true });
  el.innerHTML = ''; el.append(h('span.k-region-ico', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/></svg>' }), input, list);
  const items = await loadRegions({ public: pub });
  let opts = [], sel = -1;
  const norm = (s) => String(s || '').replace(/\s+/g, '');

  const draw = () => {
    const q = norm(input.value);
    let html = '';
    opts = [];
    const push = (r) => { opts.push(r); return `<li role="option" id="k-rg-${opts.length - 1}" data-i="${opts.length - 1}" aria-selected="false"><b>${esc(r.name)}</b><small>${esc(r.sido !== r.name ? r.sido : '')}</small></li>`; };
    if (!q) {
      const rc = recent().map((k) => items.find((r) => r.sgg_cd === k)).filter(Boolean);
      if (rc.length) html += `<li class="k-region-g" role="presentation">${esc(t('region.recent'))}</li>` + rc.map(push).join('');
      const groups = new Map();
      for (const r of items) { if (!groups.has(r.sido)) groups.set(r.sido, []); groups.get(r.sido).push(r); }
      for (const [g, rs] of groups) html += `<li class="k-region-g" role="presentation">${esc(g)}</li>` + rs.map(push).join('');
    } else {
      const hit = items.filter((r) => norm(r.full).includes(q) || norm(r.name).includes(q));
      html = hit.map(push).join('');
    }
    list.innerHTML = html || `<li class="k-region-none" role="presentation">${esc(t('region.none'))}</li>`;
    sel = q && opts.length ? 0 : -1; mark();
  };
  const mark = () => { [...list.querySelectorAll('[role=option]')].forEach((li) => li.setAttribute('aria-selected', String(+li.dataset.i === sel))); input.setAttribute('aria-activedescendant', sel >= 0 ? 'k-rg-' + sel : ''); list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); };
  const open = () => { draw(); list.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const pick = (r) => { if (!r) return; input.value = r.name; close(); remember(r); el.dataset.sgg = r.sgg_cd; onPick?.(r); };

  input.addEventListener('focus', open);
  input.addEventListener('input', () => { list.hidden = false; draw(); });
  input.addEventListener('blur', () => setTimeout(close, 140));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) open(); if (!opts.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length; mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(opts[sel] || opts[0]); }
    else if (e.key === 'Escape') { close(); }
  });
  list.addEventListener('mousedown', (e) => { const li = e.target.closest('[role=option]'); if (li) { e.preventDefault(); pick(opts[+li.dataset.i]); } });
  if (value) { const r = items.find((x) => x.sgg_cd === value); if (r) input.value = r.name; }
  return { el, items, pick: (code) => pick(items.find((r) => r.sgg_cd === code)), input };
}
