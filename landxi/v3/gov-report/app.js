/* gov-report — 할 일 · 현장 배정 · 판정 · 보고서(기관 · 현장 모바일 앱 없음).
   정문 로그인 → 관문(K2) → 셸(K1) → [할 일] 판정 대기 큰 숫자(K6) · 표(K12) · 행 → 미니 지도(K3) + 판정 3택
   → 상태 쓰기(POST /survey/findings/{fid}/state) → 표 갱신 · 큰 숫자 감소 · SSE /events/tenant 로 다른 창의 변경도 반영.
   [보고서] 읍면동 · 규칙 → POST /agent/report/draft → SSE 토큰 스트리밍(개요 · 소견 · 조치 제안) → .docx 내려받기.
   관할 = 로그인 기관(세션). 지역 고정값 없음. */
import { shell, gate, createStage, drawer, bignum, numHtml, table, toast, empty, devDrawer, devlog, FRONT } from '/landxi/v3/kit/index.js';
import { api, esc, h, hasRoute, bboxOf, isDev, session } from '/landxi/v3/kit/util.js';
import { sse } from '/landxi/shared/api-v1.js';
import { buildDocx } from './docx.js';

const $ = (s, r = document) => r.querySelector(s);
const MOBILE = () => matchMedia('(max-width: 760px)').matches;
const V = { violation: '위반', match_fp: '대장과 같음', unclear: '불명확' };
const VCODE = Object.fromEntries(Object.entries(V).map(([k, v]) => [v, k]));
const ST = { assigned: '배정', inspected: '확인됨', hold: '보류', closed: '종결' };
const KINDS = ['안내', '시정명령', '이행강제금', '원상복구', '없음'];
const JIMOK = { 전: '전(밭)', 답: '답(논)', 과: '과수원', 목: '목장용지', 임: '임야', 대: '대지', 잡: '잡종지' };
/* 각주 · 문장에서 개발 정보(경로 · 요청 · 규칙 코드)를 걷어 낸다 — 사용자 말만 */
const plain = (s) => String(s || '').split(/\s+·\s+/).filter((x) => !/\/|\b(GET|POST)\b|\bapi\b/i.test(x)).join(' · ');
const uncode = (s) => String(s || '').replace(/\bR\d\s*·\s*/g, '').replace(/\bR\d\s+(?=[가-힣])/g, '');

/* ═════════ 실패 처리 ═════════
   401/403 = 세션이 끊김 → 관문(K2)과 같은 방식으로 정문(?next=지금 주소)으로.
   그 밖(503 · 네트워크) = 이전 행 · 큰 숫자를 그대로 두고 토스트 한 줄. 빈 상태 카드는 서버가 200 으로 빈 목록을 줄 때만. */
const isAuth = (e) => !!e && (e.status === 401 || e.status === 403);
let leaving = false;
function toFront() {
  if (leaving) return; leaving = true;
  try { session.clear(); } catch { /* */ }
  location.replace(FRONT + '?next=' + encodeURIComponent(location.pathname + location.search));
}
/* 오류 한 줄 — 같은 순간 여러 요청이 실패해도 토스트는 한 번 */
let lastErr = 0;
function failLine(e, text = '불러오지 못했습니다') {
  if (isAuth(e)) { toFront(); return true; }
  if (Date.now() - lastErr > 2500) { lastErr = Date.now(); toast(text); }
  return false;
}
/* 판정 카드를 옛 상태로 두지 않는다 — 최신 상태를 못 읽었으면 판정 버튼을 모두 잠근다(다음 성공 때 다시 그림) */
function staleCard() {
  if ($('#det').hidden) return;
  for (const b of $('#verdict').querySelectorAll('button')) b.disabled = true;
  $('#det').dataset.stale = '1';
  clearTimeout(retry); retry = setTimeout(() => load({ quiet: true }), 8000);   // 조용히 다시 읽어 풀어 준다
}
let retry = 0;

const S = { who: null, key: '', rows: [], pend: null, sel: null, stage: null, s2: false, emd: [], rules: [], tab: 'todo', seen: new Set(), run: null };

/* ═════════ 관문 · 셸 ═════════ */
const who = await gate('gov-report');
S.who = who;
S.key = `gr:${who.me.tenant_id}`;
const org = (who.org || who.name || '').replace(/\s*담당자$/, '').split(/\s+/).pop();
const app = shell({ who: { ...who, org }, home: 'gov-report', title: org });
app.main.append($('#tpl').content.cloneNode(true));
document.title = `${org} · 할 일 · Land-XI`;
devDrawer({ who });

/* S-2(판정 · 조치 · 담당 확장)가 서버에 들어왔는가.
   들어오기 전: 판정은 상태 전이 + 사유(서버 기록)로 쓰고, 담당 · 조치는 서버에 둘 곳이 없으므로 **잠근다**
   (이 브라우저에만 남는 저장은 다른 사람 · 다른 기기에 안 보이므로 저장 버튼을 두지 않는다). */
S.s2 = await hasRoute('/survey/actions');
devlog('S-2', S.s2 ? 'server' : 'locked (no shared store)');
/* 조치 종류 5 ↔ 서버 kind 5 — 서버 kind 가 더 거칠어 종류 · 근거 조문은 note 에 사용자 말 그대로 남긴다 */
const KIND_CODE = { 안내: 'notice', 시정명령: 'correction', 이행강제금: 'referral', 원상복구: 'revisit', 없음: 'other' };
const actOf = (a) => {
  if (!a) return null;
  const parts = String(a.note || '').split(' · ');
  const kind = KINDS.includes(parts[0]) ? parts.shift() : (Object.entries(KIND_CODE).find(([, c]) => c === a.kind) || ['없음'])[0];
  return { kind, law: parts.join(' · '), due: a.due || '' };
};

/* ═════════ 지도(미니) ═════════ */
S.stage = createStage($('#map'), { padding: { top: 40, bottom: 40, left: 40, right: 40 } });

/* ═════════ 데이터 ═════════ */
const shortAddr = (a) => String(a || '').split(/\s+/).slice(2).join(' ');
const verdictOf = (f) => {
  if (f.verdict && V[f.verdict_code]) return f.verdict_code;
  const r = String(f.reason || '');
  if (VCODE[r]) return VCODE[r];
  if (f.state === 'dismissed') return 'match_fp';   // 오탐 처리 = 대장과 같음
  return '';
};
const stateOf = (f, v) => (f.state === 'closed' || f.state === 'dismissed' ? 'closed' : f.state === 'inspected' ? (v === 'unclear' ? 'hold' : 'inspected') : 'assigned');

function rowOf(f) {
  const v = verdictOf(f), st = stateOf(f, v);
  return { id: f.id, f, pnu: f.pnu, where: shortAddr(f.addr) || f.pnu, emd: f.emd, rule: f.rule_nm || f.rule, assignee: f.assignee || '', st, v, at: f.updated_at || '' };
}

async function load({ keep = true, quiet = false } = {}) {
  let pend = null, done = null;
  try {
    [pend, done] = await Promise.all([
      api('/survey/findings?state=assigned,inspected&sort=updated&limit=200'),
      api('/survey/findings?state=closed,dismissed&sort=updated&limit=20'),
    ]);
  } catch (e) {
    devlog('findings', `${e.status || ''} ${e.message}`);
    /* 이전 행 · 큰 숫자 유지 · 판정 카드는 잠금 · 조용히 다시 시도(빈 상태 카드 없음) */
    if (isAuth(e)) { toFront(); return null; }
    if (!S.loaded) {
      /* 처음 읽기부터 실패 — 유지할 이전 행이 없으므로 판 안에 한 줄(빈 상태 카드 아님) · 다시 읽히면 표로 바뀐다 */
      const box = $('#empty'); box.hidden = false; box.replaceChildren(h('p.gr-err', { role: 'status', text: '불러오지 못했습니다' }));
    } else if (!quiet) failLine(e);
    staleCard();
    clearTimeout(retry); retry = setTimeout(() => load({ quiet: true }), 8000);
    return null;
  }
  clearTimeout(retry);
  S.loaded = true;
  const p = (pend && pend.items) || [], d = (done && done.items) || [];
  const room = Math.max(0, 20 - p.length);
  /* 판정 대기 = 배정 · 확인됨 상태의 행 수 — 기관이 남긴 상태 기록을 센 값이므로 추정치(~)가 아니라 확인됨(✓) */
  S.pend = pend && pend.total ? { ...pend.total, value: pend.counts ? (pend.counts.assigned || 0) + (pend.counts.inspected || 0) : pend.total.value, basis: 'recorded', note: '기관이 남긴 배정 · 확인 기록' } : null;
  const prev = new Set(S.rows.map((r) => r.id + r.st));
  S.rows = [...p, ...d.slice(0, Math.max(room, 5))].map(rowOf);
  S.fresh = S.rows.map((r) => r.at).sort().pop();
  render(prev);
  /* 선택 필지는 늘 새 행 객체로 바꿔 끼운다 — 옛 행(판정 전 상태)을 들고 있으면 종결 필지가 '배정'으로 보이고 판정이 409 로 막힌다 */
  if (keep && S.sel) {
    const id = S.sel.id;
    let r = S.rows.find((x) => x.id === id);
    let lost = false;
    if (!r) {
      try { r = rowOf(await api(`/survey/findings/${encodeURIComponent(id)}`)); }
      catch (e) { devlog('finding', e.message); r = null; if (e.status !== 404) { lost = true; if (failLine(e)) return S.rows; } }
    }
    if (r) { S.sel = r; showDetail(r, { fly: false }); }
    else if (lost) staleCard();   // 못 읽음 ≠ 없음 — 카드는 두되 판정 버튼을 잠근다
    else { S.sel = null; $('#det').hidden = true; }
  }
  return S.rows;
}

/* ═════════ 할 일: 큰 숫자 + 표 ═════════ */
const big = bignum($('#big'), null, { label: '판정 대기', unit: '건' });
const tbl = table($('#table'), {
  cols: [
    { key: 'where', label: '지번', fmt: (v, r) => `<span class="gr-j">${esc(v)}</span>` },
    { key: 'rule', label: '규칙' },
    { key: 'assignee', label: '담당', fmt: (v) => esc(v || '—') },
    { key: 'st', label: '상태', fmt: (v) => `<span class="t-chip gr-st" data-lv="${v}">${ST[v]}</span>` },
    { key: 'v', label: '판정', fmt: (v) => `<span class="gr-v" data-v="${v || 'none'}">${v ? V[v] : '—'}</span>` },
  ],
  rows: [], limit: 20, onRow: (r) => pick(r),
});

function render(prev = new Set()) {
  $('#big').hidden = false;
  big.set(S.pend);
  const has = S.rows.length > 0;
  $('#table').hidden = !has; $('#empty').hidden = has;
  if (!has) empty($('#empty'), { kind: 'first', text: '배정한 필지가 아직 없습니다', action: { label: '내 대장 × AI', href: '/landxi/v3/gov-fusion/' } });
  tbl.set(S.rows);
  const trs = $('#table').querySelectorAll('tbody tr');
  (tbl.el._vis || []).forEach((r, i) => {
    const tr = trs[i]; if (!tr) return;
    tr.setAttribute('aria-selected', S.sel && S.sel.id === r.id ? 'true' : 'false');
    if (prev.size && !prev.has(r.id + r.st)) tr.classList.add('is-new');
  });
  app.fresh(S.fresh || null);
  mapPoints();
}

/* 지도: 할 일 점 · 선택 필지 */
async function mapPoints() {
  const fc = { type: 'FeatureCollection', features: S.rows.filter((r) => r.f.lnglat).map((r) => ({ type: 'Feature', properties: { id: r.id }, geometry: { type: 'Point', coordinates: r.f.lnglat } })) };
  await S.stage.geo('todo', fc, 'point');
}
function regionBox() {
  const pts = S.rows.filter((r) => r.f.lnglat).map((r) => r.f.lnglat);
  if (!pts.length) return null;
  const b = bboxOf({ type: 'MultiPoint', coordinates: pts });
  const px = Math.max(0.02, (b[2] - b[0]) * 0.15), py = Math.max(0.02, (b[3] - b[1]) * 0.15);
  return [b[0] - px, b[1] - py, b[2] + px, b[3] + py];
}

/* ═════════ 행 → 미니 지도 + 판정 3택 ═════════ */
async function pick(r) {
  S.sel = r;
  for (const tr of $('#table').querySelectorAll('tbody tr')) tr.setAttribute('aria-selected', 'false');
  const i = (tbl.el._vis || []).findIndex((x) => x.id === r.id);
  const tr = $('#table').querySelectorAll('tbody tr')[i]; if (tr) tr.setAttribute('aria-selected', 'true');
  if (MOBILE()) document.body.dataset.sheet = '1';
  showDetail(r, { fly: true });
}

async function showDetail(r, { fly }) {
  $('#det').hidden = false; delete $('#det').dataset.stale;
  $('#det-t').textContent = r.where;
  const st = $('#det-st'); st.textContent = ST[r.st]; st.dataset.lv = r.st;
  const f = r.f;
  $('#det-m').innerHTML = [f.jimok && `<span>지목 ${esc(JIMOK[f.jimok] || f.jimok)}</span>`, f.evid_m2 && `<span>AI 판독 ${numHtml(f.evid_m2, { digits: 0 })}</span>`].filter(Boolean).join('<i>·</i>');
  const allow = f.state === 'assigned' ? ['violation', 'match_fp', 'unclear'] : f.state === 'inspected' ? ['violation', 'match_fp'] : [];
  for (const b of $('#verdict').querySelectorAll('button')) {
    b.setAttribute('aria-checked', r.v === b.dataset.v ? 'true' : 'false');
    b.disabled = !allow.includes(b.dataset.v);
  }
  paintLock(r);
  paintAct(r);
  if (S.s2 && (fly || r.next === undefined)) {   // 고를 때마다 최신 상태 확인
    api(`/survey/findings/${encodeURIComponent(r.id)}`).then((d) => {
      r.next = d.allowed_next || [];
      if (d.verdict_code && V[d.verdict_code] && !r.v) r.v = d.verdict_code;
      if (S.sel && S.sel.id === r.id) paintLock(r);
    }).catch((e) => {
      /* 이 필지의 최신 상태를 못 읽었다 — 표의 옛 상태로 판정 버튼을 열어 두지 않는다 */
      devlog('finding', e.message); r.next = undefined;
      if (!failLine(e) && S.sel && S.sel.id === r.id) staleCard();
    });
  }
  if (S.s2 && r.act === undefined) {
    api(`/survey/actions?finding_id=${encodeURIComponent(r.id)}&limit=1`).then((j) => {
      r.act = actOf((j.items || []).find((x) => x.state !== 'cancelled')) || null;
      if (S.sel && S.sel.id === r.id) paintAct(r);
    }).catch((e) => { devlog('actions', e.message); failLine(e); });
  }
  if (!fly) return;
  try {
    const p = await api(`/survey/parcels/${encodeURIComponent(r.pnu)}?with=geom`);
    if (S.sel !== r) return;
    const g = p.geometry;
    await S.stage.geo('sel', { type: 'FeatureCollection', features: g ? [{ type: 'Feature', properties: {}, geometry: g }] : [] }, 'ai');
    const b = g ? bboxOf(g) : [f.lnglat[0] - 0.002, f.lnglat[1] - 0.002, f.lnglat[0] + 0.002, f.lnglat[1] + 0.002];
    const pad = Math.max(b[2] - b[0], b[3] - b[1]) * 0.9;
    S.stage.go([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], { ms: 1600, maxZoom: 18 });
  } catch (e) { devlog('parcel', e.message); if (isAuth(e)) return toFront(); if (f.lnglat) S.stage.go([f.lnglat[0] - 0.003, f.lnglat[1] - 0.003, f.lnglat[0] + 0.003, f.lnglat[1] + 0.003], { ms: 1600, maxZoom: 17 }); }
}

/* 담당 · 조치 — 서버에 남아 다른 사람 · 기기에 보이는 쓰기만 보인다. 죽은(잠긴) 버튼은 두지 않는다.
   담당 바꾸기 = 서버가 같은 상태 안의 담당 변경을 허용할 때(S.reassign — 착지 때 한 번 확인)만 보인다.
   필지마다 상세(allowed_next)를 기다리지 않으므로 상세가 오기 전후로 버튼 · 문장이 바뀌지 않는다. */
function paintLock(r) {
  const f = r.f;
  $('#b-assignee').hidden = !(S.reassign && ['assigned', 'inspected'].includes(f.state));
  $('#b-action').hidden = !S.s2;
  const line = $('#lock-line');
  line.textContent = S.s2 ? '' : '조치 기록은 아직 기관 전체에 공유되지 않습니다';
  line.hidden = !line.textContent;
}
/* 서버가 같은 상태 안에서 담당만 바꾸기를 허용하는가 — 판정 대기 필지 하나의 allowed_next 에 지금 상태가 들어 있으면 허용 */
async function probeReassign() {
  S.reassign = false;
  const r = S.s2 && S.rows.find((x) => ['assigned', 'inspected'].includes(x.f.state));
  if (!r) return;
  try {
    const d = await api(`/survey/findings/${encodeURIComponent(r.id)}`);
    r.next = d.allowed_next || [];
    S.reassign = r.next.includes(d.state || r.f.state);
  } catch (e) { devlog('reassign', e.message); }
  devlog('reassign', S.reassign ? 'server' : 'hidden (same-state assignee not allowed)');
}
function paintAct(r) {
  const a = r.act, line = $('#act-line');
  line.hidden = !a;
  if (a) line.innerHTML = `<span>조치</span>${esc([a.kind, a.law, a.due && a.due.replace(/-/g, '.')].filter(Boolean).join(' · '))}`;
}

/* 판정 저장 — 서버 전이표(assigned → inspected → closed · assigned → dismissed)를 따라 쓰고, 판정은 사유로 남긴다.
   S-2 가 들어오면 같은 요청의 verdict · verdict_code 가 그대로 읽힌다(closed(match_fp) → 오탐 기록 자동). */
async function decide(code) {
  const r = S.sel; if (!r) return;
  const f = r.f, word = V[code];
  const post = (state) => api(`/survey/findings/${encodeURIComponent(f.id)}/state`, {
    method: 'POST', body: { client_id: 'gr-' + crypto.randomUUID(), state, reason: word, verdict: code, verdict_code: code, note: word },
  });
  const box = $('#verdict'); box.dataset.busy = '1';
  try {
    if (S.s2) {
      /* S-2: 위반 · 대장과 같음 = 확인 → 종결(판정 실음 · closed(match_fp) 는 서버가 오탐 기록을 자동으로 남긴다) · 불명확 = 확인 + 보류 */
      if (f.state === 'assigned') await post('inspected');
      if (code !== 'unclear') await post('closed');
    } else if (f.state === 'assigned') {
      if (code === 'match_fp') await post('dismissed');
      else { await post('inspected'); if (code === 'violation') await post('closed'); }
    } else if (f.state === 'inspected') await post('closed');
    /* S-2 전: 서버가 판정 → 검수 기록(오탐 자동)을 아직 안 남긴다 — 같은 finding id 로 검수 기록을 직접 남겨 LX 정밀도 보드에 반영 */
    if (!S.s2) {
      const note = { violation: '검수:맞음', match_fp: '검수:오탐', unclear: '검수:모름' }[code] + ' · 기관 판정 ' + word;
      await api('/feedback', { method: 'POST', body: { kind: code === 'match_fp' ? 'fp' : 'other', set: 'review:' + f.rule, fid: f.id, pnu: f.pnu, lnglat: f.lnglat, note } })
        .catch((e) => devlog('feedback', e.message));
    }
    toast('저장했습니다');
    await load();
  } catch (e) {
    devlog('state', `${e.status || ''} ${e.code} ${e.message}`);
    if (isAuth(e)) return toFront();
    staleCard();   // 일부만 저장됐을 수 있다 — 최신 상태를 다시 읽기 전까지 판정 버튼을 잠근다
    toast('저장하지 못했습니다'); lastErr = Date.now();
    await load({ quiet: true });
  } finally { delete box.dataset.busy; }
}
$('#verdict').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled && b.getAttribute('aria-checked') !== 'true') decide(b.dataset.v); });

/* 담당 바꾸기 */
$('#b-assignee').addEventListener('click', () => {
  const r = S.sel; if (!r || !S.reassign) return;
  const known = [...new Set([who.name, ...S.rows.map((x) => x.assignee)].filter(Boolean))];
  const input = h('input.t-input', { value: r.assignee || '', autocomplete: 'off', 'aria-label': '담당' });
  const chips = h('div.gr-who', {}, ...known.map((n) => h('button', { type: 'button', text: n, onclick: () => { input.value = n; input.focus(); } })));
  const save = h('button.t-btn', { type: 'submit', text: '저장' });
  const form = h('form.gr-form2', {}, h('label.gr-field', {}, h('span.t-label', { text: '담당' }), input), chips, save);
  const d = drawer({ title: '담당 바꾸기', body: form });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim(); if (!name) return input.focus();
    save.disabled = true;
    try {
      await api(`/survey/findings/${encodeURIComponent(r.id)}/state`, { method: 'POST', body: { client_id: 'gr-' + crypto.randomUUID(), state: r.f.state, assignee: name } });
      d.close(); toast('저장했습니다'); await load();
    } catch (err) {
      devlog('assignee', `${err.code} ${err.message}`); if (isAuth(err)) return toFront(); d.close();
      toast(err.status === 409 || err.code === 'finding_state_invalid' ? '담당을 바꾸지 못했습니다' : '저장하지 못했습니다');
    }
  });
  setTimeout(() => input.focus(), 380);
});

/* 조치 기록 */
$('#b-action').addEventListener('click', () => {
  const r = S.sel; if (!r || !S.s2) return;
  const cur = r.act || {};
  const kinds = h('div.gr-kinds', { role: 'radiogroup', 'aria-label': '종류' }, ...KINDS.map((k, i) => h('label', {}, h('input', { type: 'radio', name: 'kind', value: k, checked: cur.kind ? cur.kind === k : i === 0 }), h('span', { text: k }))));
  const law = h('input.t-input', { value: cur.law || '', placeholder: '예: 농지법 제42조', 'aria-label': '근거 조문' });
  const due = h('input.t-input', { type: 'date', value: cur.due || '', 'aria-label': '기한' });
  const save = h('button.t-btn', { type: 'submit', text: '저장' });
  const form = h('form.gr-form2', {},
    h('div.gr-field', {}, h('span.t-label', { text: '종류' }), kinds),
    h('label.gr-field', {}, h('span.t-label', { text: '근거 조문' }), law),
    h('label.gr-field', {}, h('span.t-label', { text: '기한' }), due), save);
  const d = drawer({ title: '조치 기록', body: form });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rec = { kind: form.querySelector('input[name=kind]:checked')?.value || '없음', law: law.value.trim(), due: due.value, at: new Date().toISOString() };
    save.disabled = true;
    try {
      await api('/survey/actions', { method: 'POST', body: { finding_id: r.id, kind: KIND_CODE[rec.kind] || 'other', note: [rec.kind, rec.law].filter(Boolean).join(' · '), due: rec.due || undefined } });
      r.act = rec;
      d.close(); toast('저장했습니다'); showDetail(r, { fly: false });
    } catch (err) { devlog('action', err.message); if (isAuth(err)) return toFront(); save.disabled = false; toast('저장하지 못했습니다'); }
  });
});

/* 지도에서 보기 — 미니 지도를 판 전체로 */
const bigMap = (on) => {
  document.body.dataset.big = on ? '1' : '0';
  setTimeout(() => { S.stage.map.resize(); if (S.sel && on) showDetail(S.sel, { fly: true }); }, 780);
};
$('#b-map').addEventListener('click', () => bigMap(document.body.dataset.big !== '1'));
$('#side-x').addEventListener('click', () => {
  if (document.body.dataset.big === '1' && !MOBILE()) return bigMap(false);
  if (MOBILE()) { document.body.dataset.sheet = '0'; if (document.body.dataset.big === '1') bigMap(false); }
});
/* 모바일 시트: 판(표 바깥)을 누르거나 손잡이를 아래로 끌면 닫힌다 */
$('.gr-board').addEventListener('click', (e) => { if (MOBILE() && document.body.dataset.sheet === '1' && !e.target.closest('tbody tr, .gr-tabs, .gr-back')) closeSheet(); });
const closeSheet = () => { document.body.dataset.sheet = '0'; if (document.body.dataset.big === '1') bigMap(false); };
{ let y0 = null; const side = $('#side');
  side.addEventListener('touchstart', (e) => { if (MOBILE() && !e.target.closest('.gr-map canvas')) y0 = e.touches[0].clientY; }, { passive: true });
  side.addEventListener('touchend', (e) => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 60) closeSheet(); y0 = null; }, { passive: true }); }
addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.dataset.big === '1' && !document.querySelector('.k-drawer')) bigMap(false); });

/* ═════════ 탭 ═════════ */
function tab(k) {
  S.tab = k; document.body.dataset.tab = k;
  for (const b of document.querySelectorAll('.gr-tabs button')) b.setAttribute('aria-selected', b.dataset.tab === k ? 'true' : 'false');
  for (const p of document.querySelectorAll('.gr-pane')) p.hidden = p.dataset.pane !== k;
  if (document.body.dataset.big === '1') bigMap(false);
  if (k === 'report') { document.body.dataset.sheet = '0'; initReport(); }
  history.replaceState(null, '', k === 'report' ? '?tab=report' + (isDev() ? '&dev=1' : '') : location.pathname + (isDev() ? '?dev=1' : ''));
}
for (const b of document.querySelectorAll('.gr-tabs button')) b.addEventListener('click', () => tab(b.dataset.tab));

/* ═════════ 보고서 ═════════ */
let rpReady = null;
function initReport() {
  if (rpReady) { focusEmd(); return rpReady; }
  rpReady = (async () => {
    let st, ru;
    try { [st, ru] = await Promise.all([api('/survey/stats?by=emd'), api('/survey/rules')]); }
    catch (e) {
      /* 못 읽음 ≠ 결과 없음 — 빈 상태 카드를 그리지 않고 한 줄만, 탭을 다시 열면 다시 읽는다 */
      devlog('report', e.message); rpReady = null;
      if (isAuth(e)) return toFront();
      $('#rp-form').hidden = true;
      const box = $('#doc-empty'); box.hidden = false; box.replaceChildren(h('p.gr-err', { role: 'status', text: '불러오지 못했습니다' }));
      setTimeout(() => { if (S.tab === 'report' && !rpReady) initReport(); }, 8000);   // 조용히 다시 읽는다
      return;
    }
    S.emd = (st && st.items) || [];
    S.rules = (ru && ru.items) || [];
    const count = (arr, key) => arr.reduce((m, r) => m.set(r[key], (m.get(r[key]) || 0) + 1), new Map());
    const byEmd = count(S.rows.map((r) => ({ e: r.f.emd_cd })), 'e');
    const byRule = count(S.rows.map((r) => ({ k: r.f.rule })), 'k');
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const sel = $('#rp-emd'), rs = $('#rp-rule');
    sel.innerHTML = S.emd.map((e) => `<option value="${esc(e.cd)}">${esc(e.key)}</option>`).join('');
    rs.innerHTML = S.rules.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    const e0 = top(byEmd), r0 = top(byRule);
    if (e0 && S.emd.some((e) => e.cd === e0)) sel.value = e0;
    if (r0 && S.rules.some((r) => r.id === r0)) rs.value = r0;
    const off = !S.emd.length;
    $('#rp-form').hidden = off;
    docEmpty(off ? '보고할 결과가 아직 없습니다' : null);
    sel.addEventListener('change', focusEmd);
    focusEmd();
  })();
  return rpReady;
}
function focusEmd() {
  const e = S.emd.find((x) => x.cd === $('#rp-emd').value);
  if (e && e.bbox && e.bbox.length === 4) S.stage.go(e.bbox, { ms: 1600, maxZoom: 13.5 });
}
function docEmpty(text) {
  const box = $('#doc-empty');
  box.hidden = false;
  empty(box, { kind: 'first', title: '보고서 초안', text: text || '읍면동을 고르면 세 문단 초안을 씁니다', char: 'aircraft' });
}

/* 문장 다듬기(서버 초안 글이 고쳐지기 전 화면 쪽 보정 · 서버가 고쳐지면 걸러질 것이 없다)
   ① 질의 결과 수 복창 · 봉투 꼬리표 문장은 뺀다 ② 기관 이름 고정(남원시)은 로그인 기관으로
   ③ 숫자 칩 뒤 조사 · 문장부호 앞 공백을 붙인다('31,211필지 임' → '31,211필지임') — 인용 [n] 앞 공백은 둔다 */
const PART = '(?:임|이|가|은|는|을|를|의|에|에서|에는|로|으로|와|과|도|만|이며|이고|이다|입니다|임을|이므로|으로서|로서|까지|부터|이나|씩)';
const RE_PART = new RegExp(`(\\}\\})\\s+(?=${PART}(?![가-힣]))`, 'g');
const RE_CHIP_GAP = new RegExp(`<!--k-->\\s+(?=[,.;:!?)]|${PART}(?![가-힣]))`, 'g');
const TAG = /반환한|유의하며|검수\s*전\s*·\s*현장\s*확인\s*전|위법\s*판정\s*아님/;
function tidy(line) {
  let s = String(line).split(/(?<=[.!?])\s+/).filter((x) => !TAG.test(x)).join(' ');
  if (org && !/남원/.test(org)) s = s.replace(/남원시\s*/g, `${org} `);
  return s.replace(RE_PART, '$1').replace(/\s+([,.;:!?)])/g, '$1').trim();
}
/* 문단 글 = 화면 DOM 그대로(칩은 숫자 · 단위만, 인용은 [n]) — 브라우저 innerText 의 줄 · 칸 삽입 없이 */
function textOf(el) {
  let s = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.nodeValue;
    else if (n.nodeType === 1 && !n.classList.contains('gr-caret')) s += n.classList.contains('gr-chip') || n.tagName === 'SUP' ? n.textContent.trim() : textOf(n);
  }
  return s;
}
const tight = (s) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?)])/g, '$1').trim();

/* 자리표 {{env:eN}} → 숫자 칩(봉투 · 신뢰 기호) · 인용 [n] → 각주 번호 */
function paint(md, envs, cites, live) {
  const secs = { '개요': [], '소견': [], '조치 제안': [] };
  let cur = null;
  const body = String(md || '').replace(/\{\{\s*(?:env|unv)\s*:\s*[A-Za-z0-9_]*$/, '').replace(/\{\{?$/, '');
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const m = /^#{1,4}\s*(개요|소견|조치\s*제안)/.exec(line);
    if (m) { cur = m[1].replace(/\s+/, ' '); continue; }
    if (!cur || !line) continue;
    const t = tidy(line.replace(/^[-*]\s+/, '').replace(/\*\*/g, ''));
    if (t) secs[cur].push(t);
  }
  const cmap = new Map((cites || []).map((c) => [String(c.n), c]));
  const fmt = (s) => esc(uncode(s))
    .replace(/\{\{\s*(env|unv)\s*:\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, t, k) => {
      const e = envs && envs[k];
      if (t === 'env' && e) return `<span class="gr-chip">${numHtml(e)}</span><!--k-->`;
      return (envs ? '<span class="gr-chip">—</span>' : '<span class="gr-chip gr-chip--wait" aria-hidden="true"></span>') + '<!--k-->';
    })
    /* 칩 바로 뒤 공백 — 조사 · 문장부호 앞이면 붙인다(tidy · .docx 와 같은 규칙) */
    .replace(RE_CHIP_GAP, '').replace(/<!--k-->/g, '')
    .replace(/\[(\d{1,2}(?:\s*[,·]\s*\d{1,2})*)\]/g, (_, ns) => ns.split(/\s*[,·]\s*/).map((n) => {
      const c = cmap.get(n); const tip = c ? uncode(shortAddr(c.addr) || plain(c.label)) : '';
      return `<sup class="gr-cite"${tip ? ` title="${esc(tip)}"` : ''}>[${n}]</sup>`;
    }).join(''));
  let last = null;
  for (const [k, lines] of Object.entries(secs)) {
    const sec = document.querySelector(`.gr-sec[data-sec="${k}"]`);
    if (!lines.length) { sec.hidden = true; continue; }
    sec.hidden = false; requestAnimationFrame(() => sec.classList.add('is-in'));
    sec.querySelector('.gr-p').innerHTML = lines.map((l) => `<p>${fmt(l)}</p>`).join('');
    last = sec;
  }
  if (live && last) last.querySelector('.gr-p p:last-child')?.insertAdjacentHTML('beforeend', '<i class="gr-caret" aria-hidden="true"></i>');
  if (live) { const d = $('#doc'); d.scrollTop = d.scrollHeight; }
}
function notes(cites, md) {
  const ol = $('#notes');
  /* 본문이 실제로 인용한 번호만 — 인용되지 않은 근거는 목록에 두지 않는다 */
  const used = new Set();
  for (const m of String(md || '').matchAll(/\[(\d{1,2}(?:\s*[,·]\s*\d{1,2})*)\]/g)) for (const n of m[1].split(/\s*[,·]\s*/)) used.add(n);
  const list = (cites || []).filter((c) => c && c.n && used.has(String(c.n)));
  ol.hidden = !list.length;
  ol.innerHTML = list.map((c) => `<li><b>[${esc(c.n)}]</b>${esc(uncode(shortAddr(c.addr) || plain(c.label) || ''))}</li>`).join('');
}

$('#rp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const emd_cd = $('#rp-emd').value, rule = $('#rp-rule').value;
  if (!emd_cd) return;
  S.run?.close();
  const go = $('#rp-go'); go.disabled = true;
  $('#doc-act').hidden = true; $('#notes').hidden = true;
  for (const s of document.querySelectorAll('.gr-sec')) { s.hidden = true; s.classList.remove('is-in'); s.querySelector('.gr-p').innerHTML = ''; }
  const box = $('#doc-empty'); box.hidden = false;
  const ld = empty(box, { kind: 'loading', text: '근거를 모으는 중' });
  /* 실패 = 한 번만: 스트림 닫기 · 버튼 풀기 · 한 줄. 세션이 끊겼으면 정문으로 */
  let over = false, first = 0, errs = 0, run = null;
  const fail = (why, e) => {
    if (over) return; over = true;
    clearTimeout(first); run?.close();
    devlog('draft', why);
    if (isAuth(e)) return toFront();
    go.disabled = false; docEmpty('초안을 만들지 못했습니다');
  };
  let r;
  try { r = await api('/agent/report/draft', { method: 'POST', body: { template: 'survey-emd', emd_cd, rule } }); }
  catch (err) { return fail(err.message, err); }
  devlog('run', r.run?.id);
  let buf = '', steps = 0;
  /* 30초 안에 첫 이벤트가 없으면 실패 */
  first = setTimeout(() => fail('no first event in 30s'), 30000);
  /* 스트림이 안 열리거나 끊김(401 · 503 · 네트워크) — EventSource 는 상태 코드를 주지 않으므로 세션을 한 번 확인한다.
     세션이 끊겼으면 정문으로, 살아 있으면 연속 오류 2회(첫 이벤트 전) · 3회(도중)에서 실패. 이벤트가 오면 횟수는 0 */
  const onState = (st) => {
    if (over || st !== 'error') return;
    errs++;
    const n = errs;
    api('/me').then(() => { if (!over && n >= (buf || steps ? 3 : 2)) fail(`stream error x${n}`); })
      .catch((e) => fail(`stream error · ${e.status || e.message}`, e));
  };
  run = S.run = sse(r.events_url.replace(/^\/api\/v1/, ''), {
    onState,
    events: ['agent.plan', 'agent.tool.call', 'agent.tool.result', 'agent.token', 'agent.done', 'agent.failed', 'agent.rejected'],
    on: async (name, d) => {
      if (over) return;
      clearTimeout(first); errs = 0;
      if (name === 'agent.tool.result') { steps++; ld.set({ progress: Math.min(0.9, steps / 5) }); }
      if (name === 'agent.token') { if (!buf) box.hidden = true; buf += d?.delta || ''; paint(buf, null, null, true); }
      if (name === 'agent.done') {
        over = true; run.close(); box.hidden = true;
        paint(d.answer_md || buf, d.envelopes || {}, d.citations, false);
        notes(d.citations, d.answer_md || buf);
        go.disabled = false;
        armDocx({ emd_cd, rule, as_of: d.as_of });
        toast('초안을 만들었습니다');
      }
      if (name === 'agent.failed' || name === 'agent.rejected') fail(d?.message || name);
    },
  });
});

/* .docx = 화면에서 본 세 문단 그대로(같은 제목 아래) + 부속 표(집계 · 상위 10건 · 조치 기록) + 본문이 인용한 각주.
   파일 안 글은 모두 사용자 말 — 기관 이름은 로그인 기관, 규칙은 규칙 이름, 개발 정보(표 이름 · 요청 · 코드)는 넣지 않는다. */
const W_ST = { open: '미배정', assigned: '배정', inspected: '확인됨', closed: '종결', dismissed: '종결' };
const n0 = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('ko-KR'));
const ymd = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
function armDocx({ emd_cd, rule }) {
  const emd = (S.emd.find((e) => e.cd === emd_cd) || {}).key || '';
  const ruleNm = (S.rules.find((r) => r.id === rule) || {}).name || '';
  /* 부속 표 자료 — 초안이 끝나는 즉시 모아 둔다(내려받기 누를 때 기다리지 않게) */
  const q = (x) => api(`/survey/findings?emd_cd=${emd_cd}&rule=${encodeURIComponent(rule)}${x}`).catch(() => null);
  const data = Promise.all([q('&sort=score&limit=10'), q('&priority=A&limit=1'), q('&priority=B&limit=1'), q('&priority=C&limit=1'),
    q('&state=assigned,inspected,closed,dismissed&sort=updated&limit=200'), S.s2 ? api('/survey/actions?limit=500').catch(() => null) : null]);
  const a = $('#docx');
  a.onclick = async (ev) => {
    ev.preventDefault();
    try {
      const [top, pa, pb, pc, worked, acts] = await data;
      const sections = [...document.querySelectorAll('.gr-sec:not([hidden])')].map((sec, i) => ({
        h: `${'①②③'[i] || ''} ${sec.querySelector('h3').textContent}`.trim(),
        paras: [...sec.querySelectorAll('.gr-p p')].map((p) => tight(textOf(p))).filter(Boolean),
      }));
      const c = (top && top.counts) || {};
      const g = [pa, pb, pc].map((x) => (x && x.total ? x.total.value : null));
      const sum = g.every((v) => v !== null) ? g.reduce((x, y) => x + y, 0) : null;
      const tables = [
        { h: '부속 표 1 · 등급 × 상태', note: '등급 = AI 판독 점수 순 · 상태 = 기관이 남긴 기록',
          head: ['규칙', 'A', 'B', 'C', '계', '미배정', '배정', '확인됨', '종결'],
          rows: [[ruleNm, ...g.map(n0), n0(sum), n0(c.open), n0(c.assigned), n0(c.inspected), n0((c.closed || 0) + (c.dismissed || 0))]] },
        { h: '부속 표 2 · 의심 상위 10건(점수 순)', note: 'AI 판독 면적 · 비율 = 추정치(현장 확인 전)',
          head: ['순위', '소재지', '지목', '등급', 'AI 판독 면적(㎡)', '필지 대비', '상태', '판정'],
          rows: ((top && top.items) || []).map((f, i) => {
            const v = verdictOf(f);
            return [String(i + 1), shortAddr(f.addr) || '—', JIMOK[f.jimok] || f.jimok || '—', f.priority || '—',
              n0(f.evid_m2 && f.evid_m2.value !== null ? Math.round(f.evid_m2.value) : null),
              f.evid_pct && f.evid_pct.value !== null ? `${Math.round(f.evid_pct.value)}%` : '—', ST[stateOf(f, v)] || W_ST[f.state] || '—', v ? V[v] : '—'];
          }) },
      ];
      const where = new Map(((worked && worked.items) || []).map((f) => [f.id, f]));
      const seen = new Set();   // 필지마다 가장 최근 조치 한 줄
      const acRows = ((acts && acts.items) || []).filter((x) => x.state !== 'cancelled' && where.has(x.finding_id) && !seen.has(x.finding_id) && seen.add(x.finding_id)).map((x) => {
        const f = where.get(x.finding_id), ac = actOf(x) || {};
        return [shortAddr(f.addr) || '—', ac.kind || '—', ac.law || '—', ac.due ? ac.due.replace(/-/g, '.') : '—', f.assignee || '—'];
      });
      tables.push({ h: '부속 표 3 · 조치 기록', note: '할 일 표에서 기관이 기록한 조치', head: ['소재지', '종류', '근거 조문', '기한', '담당'], rows: acRows });
      const notesTxt = [...document.querySelectorAll('#notes li')].map((li) => li.innerText.replace(/\s+/g, ' ').replace(/^\[(\d+)\]\s*/, '[$1] ').trim());
      const now = new Date();
      const title = `${emd} 실태조사 보고서(초안)`;
      const blob = buildDocx({
        title, author: org,
        meta: [org, `작성 ${ymd(now)}`, ruleNm && `규칙 ${ruleNm}`].filter(Boolean).join(' · '),
        sections, tables, notes: notesTxt, foot: 'AI 판독 결과는 참고자료이며, 위법 여부는 현장 확인으로 정합니다.',
      });
      const u = URL.createObjectURL(blob);
      const t = document.createElement('a'); t.href = u; t.download = `실태조사_초안_${emd}_${ymd(now).replace(/\./g, '')}.docx`;
      document.body.append(t); t.click(); t.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      toast('내려받았습니다');
    } catch (err) { devlog('docx', err.message); toast('내려받지 못했습니다'); }
  };
  $('#doc-act').hidden = false;
}

/* ═════════ 실시간: 다른 창(내 대장 × AI 등)의 배정 · 판정 ═════════ */
let tmr = 0;
let probeAt = 0;
sse('/events/tenant', {
  events: ['finding.state'],
  on: () => { clearTimeout(tmr); tmr = setTimeout(() => load({ quiet: true }), 400); },
  /* 끊기면 세션을 한 번 확인(10초에 한 번) — 끊긴 세션이면 누르기 전에 정문으로 */
  onState: (st) => { if (st === 'error' && Date.now() - probeAt > 10000) { probeAt = Date.now(); api('/me').catch((e) => { if (isAuth(e)) toFront(); }); } },
});

/* ═════════ 착지 ═════════ */
await load({ keep: false });
const want = new URLSearchParams(location.search).get('tab');
if (want === 'report') tab('report');   // 지도 비행을 기다리지 않는다
await probeReassign();
document.body.dataset.state = 'land';
await S.stage.ready;
S.stage.map.resize();   // 눌린 띠로 한 번 그려지는 것을 막는다 — 보이기 직전에 크기를 맞춤
$('#map').classList.add('is-on');
let box = want === 'report' ? null : regionBox();
if (!box && want !== 'report' && S.loaded) {   // 배정 전 관할 — 그 기관 배포본 범위로 내려간다(지역 고정값 없음)
  try { const j = await api('/deploys'); const own = (j.items || []).filter((d) => d.tenant_id === who.me.tenant_id && d.aoi);
    if (own.length) box = bboxOf({ type: 'MultiPolygon', coordinates: own.flatMap((d) => d.aoi.type === 'MultiPolygon' ? d.aoi.coordinates : [d.aoi.coordinates]) });
  } catch (e) { devlog('deploys', e.message); if (isAuth(e)) toFront(); }
}
if (box) await S.stage.go(box, { ms: 2400, maxZoom: 12.5 });
if (want === 'report') { /* 위에서 열었다 */ }
else if (!MOBILE() && S.rows.length) {
  const first = S.rows.find((r) => r.st === 'assigned' || r.st === 'inspected' || r.st === 'hold') || S.rows[0];
  pick(first);
} else if (!S.rows.length && S.loaded) $('#det').hidden = true;
