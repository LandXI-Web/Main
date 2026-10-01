/* gov-report — 의심 필지 · 할 일 · 판정 · 보고서(기관 · 현장 모바일 앱 없음).
   [의심 필지] 관할 시군구(GET /survey/regions · ?region=)의 의심 필지(GET /survey/findings?sgg=&state=open) → 행 → 판정 3택(위반 · 대장과 같음 · 불명확).
   현장 확인 배정 · 담당 · 시정명령 · 이행강제금 · 공문은 없다(원칙 40 — Land-XI 의 문서 기능은 보고서까지).
   광역 기관(관할 시군구 여럿) = '전체'(관할 합계 · 시군구별 표)로 도착하고 시군구는 사용자가 고른다 — 화면이 대신 고르지 않는다(최근 고른 곳은 기억만).
   [할 일] 판정 대기(보류 · 옛 기록) 큰 숫자(K6) · 표(K12) · 행 → 미니 지도(K3) + 판정 3택
   → 상태 쓰기(POST /survey/findings/{fid}/state) → 표 갱신 · 큰 숫자 감소 · SSE /events/tenant 로 다른 창의 변경도 반영.
   [보고서] 시군구 · 읍면동 · 규칙 → POST /agent/report/draft → SSE 토큰 스트리밍(개요 · 소견 · 조치 제안) → .docx 내려받기.
   관할 = 로그인 기관(세션). 지역 고정값 없음. */
import { shell, gate, createStage, drawer, bignum, numHtml, table, toast, empty, devDrawer, devlog, FRONT } from '../kit/index.js';
import { api, esc, h, hasRoute, bboxOf, isDev, session } from '../kit/util.js';
import { sse } from '../../shared/api-v1.js';
import { buildDocx } from './docx.js';
import { reviewAction } from '../kit/notify.js';   // 필지 카드 '검토 요청'(구현 2차)

const $ = (s, r = document) => r.querySelector(s);
const MOBILE = () => matchMedia('(max-width: 760px)').matches;
const V = { violation: '위반', match_fp: '대장과 같음', unclear: '불명확' };
const VCODE = Object.fromEntries(Object.entries(V).map(([k, v]) => [v, k]));
/* 상태 — 배정이 없으므로 판정 전(open · 옛 기록 assigned) → 확인됨 · 보류 → 종결 */
const ST = { open: '판정 전', assigned: '판정 전', inspected: '확인됨', hold: '보류', closed: '종결' };
/* 조치 기록 = 기관이 한 일의 기록(보고서 부속 표) — 행정 처분(시정명령 · 이행강제금 · 원상복구) 종류는 없다(원칙 40) */
const KINDS = ['안내', '재방문', '이관', '없음'];
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

const S = { who: null, key: '', rows: [], pend: null, sel: null, stage: null, s2: false, emd: [], rules: [], tab: 'todo', seen: new Set(), run: null,
  regions: [], region: null, sus: [] };

/* ═════════ 관문 · 셸 ═════════ */
const who = await gate('gov-report');
S.who = who;
S.key = `gr:${who.me.tenant_id}`;
const org = (who.org || who.name || '').replace(/\s*담당자$/, '').split(/\s+/).pop();
const app = shell({ who: { ...who, org }, home: 'gov-report', title: org, xiRegion: () => S.region });   // XI맵 링크에 지금 시군구
app.main.append($('#tpl').content.cloneNode(true));
document.title = `${org} · 할 일 · Land-XI`;
devDrawer({ who });

/* S-2(판정 · 조치 확장)가 서버에 들어왔는가.
   들어오기 전: 판정은 상태 전이 + 사유(서버 기록)로 쓰고, 조치는 서버에 둘 곳이 없으므로 **잠근다**
   (이 브라우저에만 남는 저장은 다른 사람 · 다른 기기에 안 보이므로 저장 버튼을 두지 않는다). */
S.s2 = await hasRoute('/survey/actions');
devlog('S-2', S.s2 ? 'server' : 'locked (no shared store)');
/* 조치 종류 4 ↔ 서버 kind 4 — 종류 · 근거 조문은 note 에도 사용자 말 그대로 남긴다 */
const KIND_CODE = { 안내: 'notice', 재방문: 'revisit', 이관: 'referral', 없음: 'none' };
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
const stateOf = (f, v) => (f.state === 'closed' || f.state === 'dismissed' ? 'closed' : f.state === 'inspected' ? (v === 'unclear' ? 'hold' : 'inspected') : f.state === 'open' ? 'open' : 'assigned');

function rowOf(f) {
  const v = verdictOf(f), st = stateOf(f, v);
  return { id: f.id, f, pnu: f.pnu, where: shortAddr(f.addr) || f.pnu, emd: f.emd, rule: f.rule_nm || f.rule, st, v, at: f.updated_at || '' };
}

async function load({ keep = true, quiet = false } = {}) {
  let pend = null, done = null;
  try {
    /* 할 일 = 고른 시군구의 필지만(다른 시군구 필지 0) — 시군구를 아직 모르면(결과 없는 기관) 기관 전체 */
    const sq = S.region ? `&sgg=${encodeURIComponent(S.region)}` : '';
    [pend, done] = await Promise.all([
      api(`/survey/findings?state=assigned,inspected&sort=updated&limit=200${sq}`),
      api(`/survey/findings?state=closed,dismissed&sort=updated&limit=20${sq}`),
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
  /* 판정 대기 = 확인됨(보류 포함) · 옛 기록 상태의 행 수 — 기관이 남긴 상태 기록을 센 값이므로 추정치(~)가 아니라 확인됨(✓) */
  S.pend = pend && pend.total ? { ...pend.total, value: pend.counts ? (pend.counts.assigned || 0) + (pend.counts.inspected || 0) : pend.total.value, basis: 'recorded', note: '기관이 남긴 확인 기록' } : null;
  const prev = new Set(S.rows.map((r) => r.id + r.st));
  S.rows = [...p, ...d.slice(0, Math.max(room, 5))].map(rowOf);
  S.fresh = new Date();   // 마지막 갱신 = 이 화면이 방금 읽은 시각(첫 화면과 같은 뜻 · 마지막 조치 시각이 아님)
  render(prev);
  /* 선택 필지는 늘 새 행 객체로 바꿔 끼운다 — 옛 행(판정 전 상태)을 들고 있으면 종결 필지가 '판정 전'으로 보이고 판정이 409 로 막힌다 */
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
  if (!has) empty($('#empty'), { kind: 'first', text: '판정 대기 필지가 없습니다', action: S.regions.length ? { label: '의심 필지 보기', onClick: () => tab('sus') } : { label: '내 대장 × AI', href: '/landxi/v3/gov-fusion/' } });
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
  $('#det-m').innerHTML = [f.jimok && `<span>지목 ${esc(JIMOK[f.jimok] || f.jimok)}</span>`, f.evid_m2 && `<span>AI 분석 ${numHtml(f.evid_m2, { digits: 0 })}</span>`].filter(Boolean).join('<i>·</i>');
  /* 판정 전(open · 옛 기록 assigned) = 3택 · 보류(inspected) = 위반 · 대장과 같음 · 종결 = 잠김 */
  const allow = ['open', 'assigned'].includes(f.state) ? ['violation', 'match_fp', 'unclear'] : f.state === 'inspected' ? ['violation', 'match_fp'] : [];
  for (const b of $('#verdict').querySelectorAll('button')) {
    b.setAttribute('aria-checked', r.v === b.dataset.v ? 'true' : 'false');
    b.disabled = !allow.includes(b.dataset.v);
  }
  paintLock(r);
  paintAct(r);
  paintReview(r);
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

/* 검토 요청 — 이 필지를 LX 담당자에게 메모 한 줄로(선택). 같은 필지를 다시 그릴 때(자동 갱신)는 쓰던 메모를 지우지 않는다 */
function paintReview(r) {
  const det = $('#det');
  if (S.rvFor === r.id && det.querySelector('.k-rv-b, .k-rv-done')) return;
  det.querySelectorAll('.k-rv-b, .k-rv').forEach((x) => x.remove());
  S.rvFor = r.id;
  const f = r.f;
  reviewAction($('.gr-det-act'), { who: S.who, pnu: f.pnu, lnglat: f.lnglat, rule: f.rule, fid: f.id, from: 'gov-report', before: $('#b-map') });
}

/* 조치 — 서버에 남아 다른 사람 · 기기에 보이는 쓰기만 보인다. 죽은(잠긴) 버튼은 두지 않는다.
   필지마다 상세(allowed_next)를 기다리지 않으므로 상세가 오기 전후로 버튼 · 문장이 바뀌지 않는다. */
function paintLock(r) {
  const f = r.f;
  $('#b-action').hidden = !S.s2 || ['open', 'assigned'].includes(f.state);   // 판정한 뒤에 조치를 적는다
  const line = $('#lock-line');
  line.textContent = S.s2 ? '' : '조치 기록은 아직 기관 전체에 공유되지 않습니다';
  line.hidden = !line.textContent;
}
function paintAct(r) {
  const a = r.act, line = $('#act-line');
  line.hidden = !a;
  if (a) line.innerHTML = `<span>조치</span>${esc([a.kind, a.law, a.due && a.due.replace(/-/g, '.')].filter(Boolean).join(' · '))}`;
}

/* 판정 저장 — 서버 전이표(판정 전 → inspected → closed · 판정 전 → dismissed)를 따라 쓰고, 판정은 사유로 남긴다.
   배정 단계는 없다 — 판정 전(open · 옛 기록 assigned) 필지를 바로 판정한다. closed(match_fp) → 오탐 기록 자동. */
async function decide(code) {
  const r = S.sel; if (!r) return;
  const f = r.f, word = V[code];
  const post = (state) => api(`/survey/findings/${encodeURIComponent(f.id)}/state`, {
    method: 'POST', body: { client_id: 'gr-' + crypto.randomUUID(), state, reason: word, verdict: code, verdict_code: code, note: word },
  });
  const box = $('#verdict'); box.dataset.busy = '1';
  try {
    const fresh = ['open', 'assigned'].includes(f.state);
    if (S.s2) {
      /* S-2: 위반 · 대장과 같음 = 확인 → 종결(판정 실음 · closed(match_fp) 는 서버가 오탐 기록을 자동으로 남긴다) · 불명확 = 확인 + 보류 */
      if (fresh) await post('inspected');
      if (code !== 'unclear') await post('closed');
    } else if (fresh) {
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
  if (k === 'sus') loadSus();
  if (k === 'todo') mapPoints();
  const q = new URLSearchParams();
  if (k !== 'todo') q.set('tab', k);
  if (S.region && S.regions.length > 1) q.set('region', S.region);
  if (isDev()) q.set('dev', '1');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
}
for (const b of document.querySelectorAll('.gr-tabs button')) b.addEventListener('click', () => tab(b.dataset.tab));

/* ═════════ 보고서 ═════════ */
let rpReady = null;
function initReport() {
  if (rpReady) { focusEmd(); return rpReady; }
  const lock = (on) => { for (const id of ['#rp-emd', '#rp-rule', '#rp-go', '#rp-docx']) $(id).disabled = on; };
  if (wide() && !S.region) {           // 광역 '전체' — 읍면동 보고서는 시군구를 고른 뒤에(시군구를 대신 고르지 않는다)
    S.emd = [];
    $('#rp-emd').innerHTML = '';
    lock(true);
    $('#rp-form').hidden = false; $('#rp-form').dataset.all = '1';      // 시군구 고르기 한 줄만
    for (const x of document.querySelectorAll('.gr-sec')) x.hidden = true;
    $('#doc-act').hidden = true; $('#notes').hidden = true;
    docEmpty('시군구를 고르면 읍면동 보고서 초안을 씁니다');
    rpReady = Promise.resolve();
    return rpReady;
  }
  lock(false);
  delete $('#rp-form').dataset.all;
  rpReady = (async () => {
    let st, ru;
    try { [st, ru] = await Promise.all([api('/survey/stats?by=emd' + (S.region ? `&sgg=${S.region}` : '')), api('/survey/rules')]); }
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
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const sel = $('#rp-emd'), rs = $('#rp-rule');
    sel.innerHTML = S.emd.map((e) => `<option value="${esc(e.cd)}">${esc(e.key)}</option>`).join('');
    /* 규칙 기본 = 전체(의심 필지 전체 = 읍면동 칸 합 · 숫자 한 출처). 규칙을 고르면 그 규칙 건수만 쓴다 */
    rs.innerHTML = '<option value="">전체 규칙</option>' + S.rules.filter((r) => /^R\d$/.test(r.id)).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    /* 읍면동 기본 = 의심 필지가 가장 많은 곳(서버 칸 n) → 없으면 할 일이 많은 곳. 의심 0건 읍면동도 초안은 쓴다(0필지) */
    const nOf = (e) => +(e.n && e.n.value) || 0;
    const eMax = [...S.emd].sort((a, b) => nOf(b) - nOf(a))[0];
    const e0 = eMax && nOf(eMax) > 0 ? eMax.cd : top(byEmd);
    if (e0 && S.emd.some((e) => e.cd === e0)) sel.value = e0;
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
   ① 질의 결과 수 복창 · 봉투 꼬리표 문장은 뺀다 ② (지역 이름은 서버 자료에서 온다 — 화면에서 바꾸지 않는다)
   ③ 숫자 칩 뒤 조사 · 문장부호 앞 공백을 붙인다('31,211필지 임' → '31,211필지임') — 인용 [n] 앞 공백은 둔다 */
const PART = '(?:임|이|가|은|는|을|를|의|에|에서|에는|로|으로|와|과|도|만|이며|이고|이다|입니다|임을|이므로|으로서|로서|까지|부터|이나|씩)';
const RE_PART = new RegExp(`(\\}\\})\\s+(?=${PART}(?![가-힣]))`, 'g');
const RE_CHIP_GAP = new RegExp(`<!--k-->\\s+(?=[,.;:!?)]|${PART}(?![가-힣]))`, 'g');
const TAG = /반환한|유의하며|검수\s*전\s*·\s*현장\s*확인\s*전|위법\s*판정\s*아님/;
function tidy(line) {
  let s = String(line).split(/(?<=[.!?])\s+/).filter((x) => !TAG.test(x)).join(' ');
  s = s.replace(/([가-힣]{2,}(?:시|군|구|읍|면|동|리))(?:의|에서의)?\s+\1(?![가-힣])/g, '$1');   // '도암면의 도암면' → '도암면'(스트리밍 중에도)
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
  /* 화면 본문이 실제로 인용한 번호만 — 다듬기(tidy)로 빠진 문장의 인용 · 인용되지 않은 근거는 목록에 두지 않는다 */
  const used = new Set([...document.querySelectorAll('.gr-sec:not([hidden]) sup.gr-cite')].map((s) => s.textContent.replace(/\D/g, '')));  const list = (cites || []).filter((c) => c && c.n && used.has(String(c.n)));
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
const W_ST = { open: '판정 전', assigned: '판정 전', inspected: '확인됨', closed: '종결', dismissed: '종결' };
const n0 = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('ko-KR'));
const ymd = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
function armDocx({ emd_cd, rule }) {
  const emd = (S.emd.find((e) => e.cd === emd_cd) || {}).key || '';
  const ruleNm = rule ? (S.rules.find((r) => r.id === rule) || {}).name || '' : '전체';
  /* 부속 표 자료 — 초안이 끝나는 즉시 모아 둔다(내려받기 누를 때 기다리지 않게) · 규칙 '전체' = R1–R6(의심 필지와 같은 범위) */
  const q = (x) => api(`/survey/findings?emd_cd=${emd_cd}&rule=${encodeURIComponent(rule || 'R1,R2,R3,R4,R5,R6')}${x}`).catch(() => null);
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
        { h: '부속 표 1 · 등급 × 상태', note: '등급 = AI 분석 점수 순 · 상태 = 기관이 남긴 기록',
          head: ['규칙', 'A', 'B', 'C', '계', '판정 전', '확인됨', '종결'],
          rows: [[ruleNm, ...g.map(n0), n0(sum), n0((c.open || 0) + (c.assigned || 0)), n0(c.inspected), n0((c.closed || 0) + (c.dismissed || 0))]] },
        { h: '부속 표 2 · 의심 상위 10건(점수 순)', note: 'AI 분석 면적 · 비율 = 추정치(현장 확인 전)',
          head: ['순위', '소재지', '지목', '등급', 'AI 분석 면적(㎡)', '필지 대비', '상태', '판정'],
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
        return [shortAddr(f.addr) || '—', ac.kind || '—', ac.law || '—', ac.due ? ac.due.replace(/-/g, '.') : '—'];
      });
      tables.push({ h: '부속 표 3 · 조치 기록', note: '할 일 표에서 기관이 기록한 조치', head: ['소재지', '종류', '근거 조문', '기한'], rows: acRows });
      const notesTxt = [...document.querySelectorAll('#notes li')].map((li) => li.innerText.replace(/\s+/g, ' ').replace(/^\[(\d+)\]\s*/, '[$1] ').trim());
      const now = new Date();
      const title = `${emd} 실태조사 보고서(초안)`;
      const blob = buildDocx({
        title, author: org,
        meta: [org, `작성 ${ymd(now)}`, ruleNm && `규칙 ${ruleNm}`].filter(Boolean).join(' · '),
        sections, tables, notes: notesTxt, foot: 'AI 분석 결과는 참고자료이며, 위법 여부는 현장 확인으로 정합니다.',
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

/* 문서 내려받기 — 서버 보고서(기관 · 시군구 · 읍면동 이름은 자료에서 · LLM 없이) */
$('#rp-docx').addEventListener('click', async () => {
  const emd_cd = $('#rp-emd').value, rule = $('#rp-rule').value;
  if (!emd_cd) return;
  const b = $('#rp-docx'); b.disabled = true;
  try {
    const r = await api(`/survey/reports/draft?emd_cd=${encodeURIComponent(emd_cd)}${rule ? `&rule=${encodeURIComponent(rule)}` : ''}&format=docx`, { raw: true });
    if (!r.ok) { const e = new Error('http ' + r.status); e.status = r.status; throw e; }
    const blob = await r.blob();
    const emdNm = (S.emd.find((e) => e.cd === emd_cd) || {}).key || emd_cd, sggNm = (regionOf(S.region) || {}).name || '';
    const name = decodeURIComponent(r.headers.get('x-lx-report-name') || '') || `실태조사_초안_${[sggNm, emdNm].filter(Boolean).join('_')}_${ymd(new Date()).replace(/\./g, '')}.docx`;
    const u = URL.createObjectURL(blob);
    const t = document.createElement('a'); t.href = u; t.download = name; document.body.append(t); t.click(); t.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    toast('내려받았습니다');
  } catch (e) { devlog('report docx', e.message); if (isAuth(e)) return toFront(); toast('내려받지 못했습니다'); }
  finally { b.disabled = false; }
});

/* ═════════ 의심 필지(관할 시군구) ═════════
   광역 기관(관할 시군구 여럿) = '전체'(관할 합계 · 시군구별 표)로 도착 — 시군구는 사용자가 고른다(주소 ?region= 로만 좁혀 연다).
   화면이 시군구를 대신 고르지 않는다. 최근 고른 곳은 기억만 해서 고르기 목록 머리에 보여 준다(자동 선택 0). */
const regionOf = (cd) => S.regions.find((r) => r.sgg_cd === cd) || null;
const wide = () => S.regions.length > 1;
const RECENT_K = `gr:recent:${who.me.tenant_id}`;
function recent() {
  let a = [];
  try { a = JSON.parse(localStorage.getItem(RECENT_K) || '[]'); } catch { /* 저장소 없음 */ }
  return (Array.isArray(a) ? a : []).filter((c) => regionOf(c));
}
function remember(cd) {
  try { localStorage.setItem(RECENT_K, JSON.stringify([cd, ...recent().filter((x) => x !== cd)].slice(0, 3))); } catch { /* 저장 불가 — 기억만 못 함 */ }
}
const unionBox = (rs) => rs.filter((r) => r.bbox && r.bbox.length === 4).reduce((a, r) => (a ? [Math.min(a[0], r.bbox[0]), Math.min(a[1], r.bbox[1]), Math.max(a[2], r.bbox[2]), Math.max(a[3], r.bbox[3])] : [...r.bbox]), null);
async function loadRegions() {
  try { const j = await api('/survey/regions'); S.regions = (j.items || []).filter((r) => r.state === 'done' || r.state === 'no_ai'); }
  catch (e) { devlog('regions', e.message); if (isAuth(e)) return toFront(); S.regions = []; }
  const want = new URLSearchParams(location.search).get('region');
  /* 기초 기관(관할 하나) = 그 시군구 · 광역 = 주소로 고른 시군구가 있을 때만 그곳, 없으면 전체(null) */
  S.region = regionOf(want)?.sgg_cd || (S.regions.length === 1 ? S.regions[0].sgg_cd : null);
  paintRegionPick();
}
/* 시군구 고르기 = 전체 · 최근 고른 곳 · 시군구(가나다) — 광역만 보인다 */
function paintRegionPick() {
  const rec = recent();
  const opt = (r) => `<option value="${esc(r.sgg_cd)}">${esc(r.name || r.sgg_cd)}</option>`;
  const byName = [...S.regions].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
  const html = '<option value="">전체</option>'
    + (rec.length ? `<optgroup label="최근 고른 곳">${rec.map((c) => opt(regionOf(c))).join('')}</optgroup>` : '')
    + `<optgroup label="시군구">${byName.map(opt).join('')}</optgroup>`;
  for (const [fid, sid] of [['#sus-rgn-f', '#sus-rgn'], ['#rp-sgg-f', '#rp-sgg']]) {
    $(fid).hidden = !wide();
    $(sid).innerHTML = html;
    $(sid).value = S.region || '';
  }
}
/* 머리 = 고른 시군구 이름 · 광역 전체면 기관 이름 · 창 제목도 같게 */
function paintHead() {
  const rg = regionOf(S.region);
  const nm = (rg && rg.name) || org;
  const el = app.app.querySelector('.k-word .home');
  if (el) el.textContent = nm;
  document.title = `${nm} · 할 일 · Land-XI`;
}
function setRegion(cd) {
  S.region = cd || null;
  if (S.region) remember(S.region);
  paintRegionPick();
  rpReady = null; S.susLoaded = undefined;
  paintHead();
  S.sel = null; $('#det').hidden = true;             // 오른쪽 상세도 새 시군구 기준(옛 시군구 필지를 남기지 않는다)
  load({ keep: false });                              // 할 일 표 = 고른 시군구 필지만
  if (S.tab === 'sus') loadSus(); if (S.tab === 'report') initReport();
  tab(S.tab);
}
$('#sus-rgn').addEventListener('change', (e) => setRegion(e.target.value));
$('#rp-sgg').addEventListener('change', (e) => setRegion(e.target.value));

/* 큰 숫자 = 의심 필지(숫자 한 출처 GET /survey/stats total = survey_sgg · 첫 화면 · XI맵 · 에이전트와 같은 값). 아래 표는 판정 전 목록 */
const susBig = bignum($('#sus-big'), null, { label: '의심 필지', unit: '건' });
const PRI = { A: '우선', B: '보통', C: '참고' };
const susTbl = table($('#sus-table'), {
  cols: [
    { key: 'where', label: '지번', fmt: (v) => `<span class="gr-j">${esc(v)}</span>` },
    { key: 'rule', label: '규칙' },
    { key: 'pri', label: '등급', fmt: (v) => esc(PRI[v] || v || '—') },
    { key: 'area', label: 'AI 분석', fmt: (v, r) => (r.f.evid_m2 ? numHtml(r.f.evid_m2, { digits: 0 }) : '—') },
  ],
  rows: [], limit: 20, onRow: (r) => pick(r),
});
const sggTbl = table($('#sus-sgg'), {
  cols: [
    { key: 'where', label: '시군구', fmt: (v) => `<span class="gr-j">${esc(v)}</span>` },
    { key: 'n', label: '의심 필지', fmt: (v, r) => (r.state === 'no_ai' ? 'AI 분석 전' : v ? numHtml(v, { digits: 0 }) : '—') },
  ],
  rows: [], limit: 40, onRow: (r) => setRegion(r.id),
});
/* 광역 전체 — 큰 숫자 = 관할 합계(GET /survey/stats · 시군구 없이 = 볼 수 있는 전체 · 숫자 한 출처), 표 = 시군구별(누르면 그 시군구로) */
async function loadSusAll() {
  const box = $('#sus-empty');
  $('#sus-table').hidden = true;
  if (S.susLoaded === '*') return;
  let st = null;
  try { st = await api('/survey/stats?by=rule'); } catch (e) { devlog('sus all', e.message); if (failLine(e)) return; }
  S.susLoaded = '*';
  S.sus = [];
  susPoints();
  $('#sus-big').hidden = false;
  if (st && st.state === 'building') { susBig.empty(); const n = $('#sus-big .k-big-none'); if (n) n.textContent = '집계 중'; }
  else susBig.set(st && st.total ? { ...st.total } : null);
  const rows = S.regions.map((r) => ({ id: r.sgg_cd, where: r.name || r.sgg_cd, n: r.findings, state: r.state }))
    .sort((a, b) => (+(b.n && b.n.value) || 0) - (+(a.n && a.n.value) || 0));
  $('#sus-sgg').hidden = !rows.length; box.hidden = !!rows.length;
  if (!rows.length) empty(box, { kind: 'first', text: '실태조사 결과가 아직 없습니다' });
  sggTbl.set(rows);
  const bb = unionBox(S.regions);
  if (bb && S.stage) S.stage.go(bb, { ms: 1600, maxZoom: 11 });
}
async function loadSus() {
  const box = $('#sus-empty');
  if (!S.region && wide()) return loadSusAll();
  $('#sus-sgg').hidden = true;
  if (!S.region) {
    $('#sus-big').hidden = true; $('#sus-table').hidden = true; box.hidden = false;
    empty(box, { kind: 'first', text: '실태조사 결과가 아직 없습니다' });
    return;
  }
  if (S.susLoaded === S.region) { susPoints(); return; }
  let j, st;
  try { [j, st] = await Promise.all([api(`/survey/findings?sgg=${S.region}&state=open&rule=R1,R2,R3,R4,R5,R6&sort=score&limit=200`), api(`/survey/stats?by=rule&sgg=${S.region}`).catch(() => null)]); }
  catch (e) { devlog('sus', e.message); if (failLine(e)) return; return; }
  S.susLoaded = S.region;
  S.sus = (j.items || []).map((f) => ({ ...rowOf(f), pri: f.priority }));
  $('#sus-big').hidden = false;
  if (st && st.state === 'building') { susBig.empty(); const n = $('#sus-big .k-big-none'); if (n) n.textContent = '집계 중'; }
  else susBig.set(st && st.total ? { ...st.total } : null);
  const has = S.sus.length > 0;
  $('#sus-table').hidden = !has; box.hidden = has;
  if (!has) {
    const rg = regionOf(S.region);
    empty(box, { kind: 'first', text: rg && rg.state === 'no_ai' ? 'AI 분석 전입니다' : '현장 확인이 필요한 필지가 없습니다' });
  }
  susTbl.set(S.sus);
  susPoints();
  const rg = regionOf(S.region);
  if (rg && rg.bbox && rg.bbox.length === 4 && S.stage) S.stage.go(rg.bbox, { ms: 1600, maxZoom: 12.5 });
}
async function susPoints() {
  if (!S.stage) return;
  const fc = { type: 'FeatureCollection', features: S.sus.filter((r) => r.f.lnglat && r.f.lnglat[0] != null).map((r) => ({ type: 'Feature', properties: { id: r.id }, geometry: { type: 'Point', coordinates: r.f.lnglat } })) };
  await S.stage.geo('todo', fc, 'point');
}
/* ═════════ 실시간: 다른 창(내 대장 × AI 등)의 판정 ═════════ */
let tmr = 0;
let probeAt = 0;
sse('/events/tenant', {
  events: ['finding.state'],
  on: () => { clearTimeout(tmr); tmr = setTimeout(() => load({ quiet: true }), 400); },
  /* 끊기면 세션을 한 번 확인(10초에 한 번) — 끊긴 세션이면 누르기 전에 정문으로 */
  onState: (st) => { if (st === 'error' && Date.now() - probeAt > 10000) { probeAt = Date.now(); api('/me').catch((e) => { if (isAuth(e)) toFront(); }); } },
});

/* ═════════ 착지 ═════════ */
await loadRegions();
paintHead();
await load({ keep: false });
const want = new URLSearchParams(location.search).get('tab');
if (want === 'report') tab('report');   // 지도 비행을 기다리지 않는다
else if (want === 'sus' || (!S.rows.length && S.regions.length)) tab('sus');
document.body.dataset.state = 'land';
await S.stage.ready;
S.stage.map.resize();   // 눌린 띠로 한 번 그려지는 것을 막는다 — 보이기 직전에 크기를 맞춤
$('#map').classList.add('is-on');
let box = want === 'report' || S.tab === 'sus' ? null : (wide() && !S.region ? unionBox(S.regions) : regionBox());
if (!box && want !== 'report' && S.loaded) {   // 판정 기록이 없는 관할 — 그 기관 배포본 범위로 내려간다(지역 고정값 없음)
  try { const j = await api('/deploys'); const own = (j.items || []).filter((d) => d.tenant_id === who.me.tenant_id && d.aoi);
    if (own.length) box = bboxOf({ type: 'MultiPolygon', coordinates: own.flatMap((d) => d.aoi.type === 'MultiPolygon' ? d.aoi.coordinates : [d.aoi.coordinates]) });
  } catch (e) { devlog('deploys', e.message); if (isAuth(e)) toFront(); }
}
if (!box && S.tab !== 'report') { const rg = regionOf(S.region); box = rg && rg.bbox && rg.bbox.length === 4 ? rg.bbox : (!S.region ? unionBox(S.regions) : null); }
if (box) await S.stage.go(box, { ms: 2400, maxZoom: 12.5 });
if (S.tab === 'sus') susPoints();
if (want === 'report' || S.tab === 'sus') { /* 위에서 열었다 */ }
else if (!MOBILE() && S.rows.length) {
  const first = S.rows.find((r) => r.st === 'assigned' || r.st === 'inspected' || r.st === 'hold') || S.rows[0];
  pick(first);
} else if (!S.rows.length && S.loaded) $('#det').hidden = true;
