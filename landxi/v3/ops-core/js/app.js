/* LX/OPS 핵심판 부트 — 관문(관리자 세션) · 라우터(메뉴 5) · 폴링(GPU 2s · 나머지 10s) · 마스트 신선도 점 하나
 * 세션: 정문(/landxi/v3/login/)이 api-v1 session(localStorage lx_api_session · 같은 :4173 origin)에 남긴 토큰을 그대로 쓴다.
 * 정문이 아직 없으면 같은 계약(POST /auth/login)으로 이 화면의 문을 연다 — 세션 주입 없음. */
import { API, session, probe, api } from '/landxi/shared/api-v1.js';
import { S, loadAll, loadGpus, inbox } from './store.js';
import { initMap, paint, fly } from './map.js';
import * as V from './views.js';

const $ = (s) => document.querySelector(s);
const TITLES = { overview: '운영 현황', infra: '인프라', tenants: '기관', deploys: '배포', approvals: '결재' };
const FRONT = '/landxi/v3/login/';
let view = null, gT = null, aT = null, mapP = null;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}
V.ctx.toast = toast;
V.ctx.go = (v, sel) => { V.ctx.sel = sel || null; if (location.hash === '#/' + v) render(); else location.hash = '#/' + v; };
V.ctx.refresh = () => { badge(); if (view !== 'infra') render(true); };

function badge() {
  const n = inbox().length; const b = $('#badge');
  b.hidden = !n; b.textContent = n;
}
function render(keep) {
  const v = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const next = TITLES[v] ? v : 'overview';
  if (!keep) V.closeSheet();
  view = next;
  document.body.dataset.view = next;
  document.title = `LX/OPS · ${TITLES[next]}`;
  $('#title').textContent = TITLES[next];
  document.querySelectorAll('.ri[data-go]').forEach((a) => a.classList.toggle('on', a.dataset.go === next));
  const el = $('#view'); el.innerHTML = '';
  V[next](el, V.ctx.sel); V.ctx.sel = null;
  badge();
}

/* ── 신선도 점 · 시계 ───────────────────── */
function tick() {
  const d = new Date(); $('#clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  const age = S.at.gpus ? (Date.now() - S.at.gpus) / 1000 : null;
  const f = $('#fresh');
  f.dataset.s = age == null ? 'none' : age < 6 ? 'live' : 'stale';
  f.querySelector('em').textContent = age == null ? '연결 중' : age < 6 ? '실시간' : `${Math.round(age)}초 전`;
  f.title = S.gpus ? `최근 수신 ${new Date(S.at.gpus).toLocaleTimeString('ko-KR')}` : '';
}

async function pollGpu() {
  if (await loadGpus()) {
    if (view === 'infra') V.infraTick($('#view'));
    if (view === 'overview') V.overviewTick($('#view'));
  }
}
async function pollAll() {
  const before = JSON.stringify(inbox().map((x) => x.key));
  await loadAll(); badge(); paint(false);
  const after = JSON.stringify(inbox().map((x) => x.key));
  if (before !== after && !$('#sheet').classList.contains('open') && view !== 'infra') render(true);
}

/* ── 관문 ─────────────────────────────── */
async function hasFront() { try { const r = await fetch(FRONT, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; } }
function isAdmin(s) { return s && s.realm === 'lx' && s.role === 'admin'; }

async function door(msg) {
  document.body.dataset.view = 'door';
  if (!new URLSearchParams(location.search).has('door') && await hasFront()) {
    location.replace(FRONT + '?next=' + encodeURIComponent(location.pathname + location.hash));
    return new Promise(() => {});
  }
  const d = $('#door'); d.hidden = false; $('#d-err').textContent = msg || '';
  setTimeout(() => $('#d-login').focus(), 50);
  return new Promise((resolve) => {
    $('#door-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button'); btn.disabled = true; $('#d-err').textContent = '';
      try {
        const r = await api('/auth/login', { method: 'POST', body: { realm: 'lx', login: $('#d-login').value.trim(), password: $('#d-pw').value } });
        if (r.role !== 'admin') { $('#d-err').textContent = '관리자 계정만 들어올 수 있습니다'; btn.disabled = false; return; }
        session.set(r); d.hidden = true; resolve(r);
      } catch (err) { $('#d-err').textContent = err.message || '들어갈 수 없습니다'; btn.disabled = false; }
    };
  });
}

async function boot() {
  mapP = initMap($('#map'), { pick: (r) => V.regionSheet(r) }).catch(() => null);
  await probe(true);
  if (API.mode !== 'on') { await mapP; document.body.dataset.view = 'door'; $('#door').hidden = false; $('#door-form').innerHTML = '<div class="door-mark"><b>LX</b><span>OPS</span></div><h2>연결 없음</h2><p class="door-err">관제 서버에 닿지 않습니다</p>'; return; }
  let s = session.get();
  if (s) { try { await api('/me'); } catch { session.clear(); s = null; } }
  if (!isAdmin(s)) s = await door(s ? '관리자 계정으로 들어오세요' : '');
  $('#who').textContent = s.user?.name || '관리자';
  $('#logout').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch { /* */ } session.clear(); location.href = (await hasFront()) ? FRONT : location.pathname; };

  await Promise.all([loadAll(), loadGpus()]);
  await mapP;
  document.body.dataset.view = 'overview';
  addEventListener('hashchange', () => render());
  render();
  paint(true); fly('kr');
  tick(); setInterval(tick, 1000);
  gT = setInterval(pollGpu, 2000);
  aT = setInterval(pollAll, 10000);
}
boot();
