/* boot.js — LX 직원 생산 콘솔(v3 시안 ①). 정문 인증 → 실데이터 적재 → 전국 XI맵 → 오늘 띠 · 6단 레일 · 서랍.
   세션 = api-v1 session(POST /auth/login 이 준 Bearer). 세션이 없거나 서버가 거절하면 이 자리에서 실제 로그인한다(주입 없음). */
import { API, api, probe, session } from '../../shared/api-v1.js';
import { D, load, esc, aoiBox, shortRegion, cardShort, STAGE_RANK } from './data.js';
import * as M from './map.js';
import { STAGES, mountRail, renderStage } from './rail.js';
import { mountToday, clearToday } from './today.js';
import { mountCmdk } from './cmdk.js';

const $ = (s) => document.querySelector(s);
const DEV = new URLSearchParams(location.search).has('dev');

/* ── 정문 ───────────────────────────────────────── */
async function who() {
  await probe();
  if (API.mode !== 'on') return null;
  if (!session.get()) return null;
  try { return await api('/me'); } catch { session.clear(); return null; }
}
/** 정문(v3/login)이 있으면 그리로 보낸다 — 로그인 뒤 ?next 로 이 집에 돌아온다 */
const FRONT = '/landxi/v3/login/';
async function front() {
  if (new URLSearchParams(location.search).has('gate')) return false;
  try { const r = await fetch(FRONT + 'index.html', { method: 'HEAD', cache: 'no-store' }); if (!r.ok) return false; } catch { return false; }
  location.replace(FRONT + '?next=' + encodeURIComponent(location.pathname + location.search.replace(/[?&]gate[^&]*/, '')));
  return true;
}
function gate(msg) {
  return new Promise((done) => {
    const g = $('#gate'), f = $('#gateForm'), err = $('#gateErr');
    g.hidden = false; err.textContent = msg || '';
    f.login.focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!f.login.value.trim() || !f.password.value) { err.textContent = '아이디와 비밀번호를 입력해 주세요.'; return; }
      const btn = f.querySelector('button'); btn.disabled = true;
      try {
        const s = await api('/auth/login', { method: 'POST', body: { realm: 'lx', login: f.login.value.trim(), password: f.password.value } });
        session.set(s);
        const me = await api('/me');
        g.hidden = true; done(me);
      } catch (x) { err.textContent = x.status === 401 || x.code === 'unauthorized' ? '아이디 또는 비밀번호가 맞지 않습니다.' : '서버에 연결하지 못했습니다.'; f.password.select(); }
      finally { btn.disabled = false; }
    };
  });
}

/* ── UI 한 벌 ──────────────────────────────────── */
const ui = {
  map: null, current: null, pins: new Map(),
  async open(key, ctx = {}) {
    const s = STAGES.find((x) => x.key === key); if (!s) return;
    ui.current = key;
    document.body.classList.add('has-drawer');
    $('#drawer').hidden = false;
    $('#drawerNo').textContent = s.no;
    $('#drawerTitle').textContent = s.h;
    document.querySelectorAll('.rstep').forEach((b) => b.classList.toggle('is-on', b.dataset.k === key));
    if (ctx.from !== 'today') clearToday($('#todayCells'));
    ui.pin(null); ui.hud(null);
    const body = $('#drawerBody');
    body.scrollTop = 0;
    await renderStage(key, body, ui, ctx);
  },
  close() {
    ui.current = null;
    $('#drawer').hidden = true;
    document.body.classList.remove('has-drawer');
    document.querySelectorAll('.rstep').forEach((b) => b.classList.remove('is-on'));
    clearToday($('#todayCells'));
    M.clear(ui.map); ui.onClear?.(); ui.pin(null); ui.hud(null);
    M.fly(ui.map, M.KOREA, { maxZoom: 7.2 });
  },
  pin(profile) { for (const [k, el] of ui.pins) el.classList.toggle('is-on', k === profile); },
  hud(h) {
    let el = $('#hud');
    if (!h) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'hud'; el.className = 'hud'; document.body.append(el); }
    el.innerHTML = `<b class="num">${esc(h.v)}</b><span>${esc(h.l)}</span>`;
    el.animate([{ transform: 'translate(-50%, 20px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.15,1,.3,1)' });
  },
};

/** 깔린 곳 — 지역(프로파일)마다 점 하나 · 가장 앞선 단계 색 */
function pins() {
  const by = new Map();
  for (const d of D.deploys) { const k = d.region_profile || d.tenant_id; by.set(k, [...(by.get(k) || []), d]); }
  for (const [k, list] of by) {
    const boxes = list.map(aoiBox).filter(Boolean); if (!boxes.length) continue;
    const b = boxes[0], c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const best = list.slice().sort((a, z) => STAGE_RANK[a.stage] - STAGE_RANK[z.stage])[0];
    const draft = list.find((d) => d.stage === 'draft');
    const el = document.createElement('button');
    el.className = 'pin'; el.dataset.stage = draft && list.every((d) => d.stage === 'draft') ? 'draft' : best.stage;
    el.innerHTML = `<i></i><b>${esc(shortRegion(best))}</b><small>${list.length}</small>`;
    el.title = list.map((d) => `${cardShort(d.card_id)} ${d.version || ''}`).join(' · ');
    el.addEventListener('click', (e) => { e.stopPropagation(); ui.open('deploy', { deployId: (draft || best).id }); });
    new window.maplibregl.Marker({ element: el, anchor: 'left', offset: [-6, 0] }).setLngLat(c).addTo(ui.map);
    ui.pins.set(k, el);
  }
}

/** 해외 배포본 — 전국 판 밖이므로 범례 끝에 한 칸 */
function abroad() {
  const out = D.deploys.filter((d) => { const b = aoiBox(d); return b && !(b[0] > 124 && b[2] < 132 && b[1] > 33 && b[3] < 39); });
  if (!out.length) return;
  const regions = new Set(out.map((d) => d.region_profile));
  const b = document.createElement('button');
  b.className = 'abroad'; b.innerHTML = `해외 <b class="num">${regions.size}</b>곳 →`;
  let far = false;
  b.addEventListener('click', () => {
    far = !far;
    if (!far) { b.innerHTML = `해외 <b class="num">${regions.size}</b>곳 →`; return M.fly(ui.map, M.KOREA, { maxZoom: 7.2 }); }
    const bb = out.map(aoiBox).reduce((a, x) => [Math.min(a[0], x[0]), Math.min(a[1], x[1]), Math.max(a[2], x[2]), Math.max(a[3], x[3])], [180, 90, -180, -90]);
    b.innerHTML = '← 국내';
    M.fly(ui.map, [Math.min(bb[0], 124), Math.min(bb[1], 33), Math.max(bb[2], 131), Math.max(bb[3], 39)], { maxZoom: 5 });
  });
  $('#legend').append(b);
}

function fresh() {
  const t = new Date(D.asOf);
  $('#freshT').textContent = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  $('#fresh').title = `데이터 갱신 ${t.toLocaleString('ko-KR')}`;
  $('#fresh').classList.toggle('is-stale', D.failed > 0);
}

function dev(me) {
  if (!DEV || me.realm !== 'lx') return;
  const el = $('#dev'); el.hidden = false;
  const draw = () => {
    el.innerHTML = `<div>${esc(API.prefix)} · ${esc(me.realm)}/${esc(me.role)} · test deploys hidden ${D.testDeploys}</div>`
      + (D.lastJob ? `<div>job ${esc(D.lastJob)}</div>` : '') + (D.lastRun ? `<div>run ${esc(D.lastRun)}</div>` : '')
      + D.log.slice(-18).reverse().map((l) => `<div>${l.ok ? '·' : '×'} ${l.method} ${esc(l.path)} ${l.ms}ms${l.code ? ' ' + esc(l.code) : ''}</div>`).join('');
  };
  D.onlog = draw; draw();
}

async function start() {
  ui.map = M.createMap($('#map'));
  const mapReady = M.ready(ui.map);
  let me = await who();
  if (!me && API.mode === 'on' && await front()) return;
  if (!me) me = await gate(API.mode === 'on' ? '' : '서버에 연결하지 못했습니다.');
  if (me.realm !== 'lx') {
    $('#gate').hidden = false;
    $('#gateForm').innerHTML = `<p class="gate__err">기관 계정은 서비스 화면을 씁니다.</p><a class="btn btn--ink gate__go" href="../service/">서비스 화면으로</a>`;
    return;
  }
  $('#who').textContent = me.user?.name || 'LX';
  $('#logout').addEventListener('click', async () => { try { await api('/auth/logout', { method: 'POST' }); } catch { /* */ } session.clear(); location.replace((await fetch(FRONT + 'index.html', { method: 'HEAD' }).then((r) => r.ok).catch(() => false)) ? FRONT : location.pathname + '?gate'); });
  await Promise.all([load(), mapReady]);
  await M.base(ui.map, D.catalog);
  fresh(); pins(); abroad();
  mountToday($('#todayCells'), $('#todayDate'), ui);
  mountRail($('#rail'), ui);
  mountCmdk(ui);
  dev(me);
  $('#drawerX').addEventListener('click', () => ui.close());
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#cmdk').hidden && ui.current) ui.close(); });
  document.body.classList.remove('is-booting');
  window.__lxConsole = { ui, D };   // e2e 관측용(읽기 전용)
}

start();
