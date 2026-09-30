/* lx-train — ② 학습 · 업무별 모델 (LANDXI-FINAL-SPEC §2.5)
   "이 업무의 모델은 쓸 만한가?" — 업무 10 카드(K7 변형: 크롭 = 표본 칩) → 선택 모델 서랍(K5) → 사본 미세조정 시트.
   숫자 출처: /registry/models · /registry/models/{mid} 카드(학습 기록) · /survey/rules/{id}/stats(현장 확인 기준 · S-2) · /feedback(오탐 신고)
   학습: POST /jobs/quote → POST /jobs {kind:'train', base_model, region, samples}(S-8 · 게이트웨이 작업 큐 · 전력 예산은 서버가 판정).
   지역은 변수(지역 문자열 하드코딩 0 · 크롭 경로는 tasks.json 예시 데이터 파일). 개발 정보는 ?dev=1 서랍만. */
import { shell } from '../kit/shell.js';
import { gate, FRONT } from '../kit/auth-gate.js';
import { drawer } from '../kit/panel.js';
import { bignum } from '../kit/bignum.js';
import { sig } from '../kit/sig.js';
import { line } from '../kit/chart.js';
import { empty } from '../kit/empty.js';
import { regionPicker, loadRegions } from '../kit/region.js';
import { toast } from '../kit/toast.js';
import { devDrawer, devlog } from '../kit/dev-drawer.js';
import { nf, df } from '../kit/i18n.js';
import { h, esc, api, API, session, isEnvelope, hasRoute } from '../kit/util.js';
import { sse } from '../../shared/api-v1.js';
import { summary, stageOf } from '../lx-console/summary.js';
import { openFlow } from './flow.js';

const who = await gate('lx-train');
const CFG = await fetch(new URL('./tasks.json', import.meta.url)).then((r) => r.json());
const TASKS = CFG.tasks;
const CROP = '/landxi/assets/proto/crops/';
const q0 = new URLSearchParams(location.search);
const REGION = q0.get('region') || '';
const withRegion = (p) => (REGION ? `${p}${p.includes('?') ? '&' : '?'}region=${encodeURIComponent(REGION)}` : p);

/* ── 셸(K1) · 레일 6단(② 현재) ──────────────────────────────── */
const RAIL = [
  { id: 'ingest', label: '데이터 올리기', href: withRegion('/landxi/v3/lx-ingest/') },
  { id: 'train', label: '학습' },
  { id: 'assemble', label: '서비스 만들기', href: withRegion('/landxi/v3/lx-console/?step=assemble') },
  { id: 'review', label: '결과 확인', href: withRegion('/landxi/v3/lx-review/') },
  { id: 'deploy', label: '배포', href: withRegion('/landxi/v3/lx-deploy/') },
  { id: 'ops', label: '서비스 관리', href: withRegion('/landxi/v3/lx-deploy/') + '#ops' },
];
const S = shell({ who, home: 'lx-train', rail: { kind: 'steps', items: RAIL, current: 1 } });
devDrawer({ who });

const grid = h('div.tr-grid', { role: 'list' });
const newBtn = h('button.t-btn.tr-new', { type: 'button', text: '새 모델 만들기' });
const pane = h('div.tr-pane', {}, h('header.tr-h', {}, h('h1.t-h3.tr-title', { text: '② 학습 · 업무별 모델' }), newBtn), grid);
S.main.append(pane);
/* 원스톱(r3-train): 데이터 올리기 → 라벨 확인 → 학습 → 결과 확인·등록 → 서비스 만들기 → 다른 지역에 적용 */
newBtn.addEventListener('click', () => openFlow({ host: S.main, who }));
if (q0.get('flow')) setTimeout(() => openFlow({ host: S.main, who }), 0);

/* 로드 전: 카드 자리(이름만 · 검은 막대 0) */
const cardEls = new Map();
for (const t of TASKS) {
  const el = h('a.t-card.k-svc.tr-card', { href: '?task=' + t.id, role: 'listitem', dataset: { task: t.id, state: 'load' } },
    h('div.k-svc-crop', {}, h('img', { alt: '', decoding: 'async' })),
    h('div.k-svc-meta', {}, h('span.t-label.tr-year'), h('span.t-chip.tr-chip')),
    h('h3.t-h4.k-svc-t', { text: t.name }),
    h('div.k-svc-n.tr-n'));
  el.addEventListener('click', (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); select(t.id, true); });
  grid.append(el); cardEls.set(t.id, el);
}

/* ── 데이터 ────────────────────────────────────────────────── */
const get = (p) => api(p).catch(() => null);
async function file(url, as = 'json') {
  if (!url) return null;
  const s = session.get();
  try {
    const r = await fetch(API.base + url, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
    if (!r.ok) return null;
    return as === 'json' ? await r.json() : await r.text();
  } catch { return null; }
}

/* 모델 목록·오탐 신고 — 실패(401/403/5xx/네트워크)를 '첫 학습 전'으로 그리지 않는다.
   401/403 → 정문(?next=) · 그 밖 실패 → 카드 목록 대신 결손 카드 한 장(K9 · 행동 1 '다시 시도') */
const getS = (p) => api(p).then((j) => ({ j, s: 200 }), (e) => ({ j: null, s: e?.status || 0 }));
const [mR, fR, SUM, cardsJ] = await Promise.all([getS('/registry/models'), getS('/feedback'), summary(), get('/registry/cards')]);
if ([mR.s, fR.s].some((s) => s === 401 || s === 403)) {
  session.clear();
  location.replace(FRONT + '?next=' + encodeURIComponent(location.pathname + location.search));
  await new Promise(() => {});
}
const modelsJ = mR.j, fbJ = fR.j;
if (modelsJ === null || fbJ === null) {
  devlog('models', `load failed ${mR.s}/${fR.s}`);
  grid.replaceChildren();
  const box = h('div.tr-fail', { role: 'alert' });
  grid.replaceWith(box);
  empty(box, { kind: '404', title: '모델 목록을 불러오지 못했습니다', action: { label: '다시 시도', onClick: () => location.reload() } });
  document.documentElement.dataset.trainReady = '1';
  await new Promise(() => {});
}

/* 라벨 도구(AXIS-Label · 외부 새 창) — 서버 설정(/me label_url)이 정본. 없으면 tasks.json 대체 주소.
   어느 쪽이든 실제로 열려 있을 때만 링크를 그린다(죽은 링크 0). 닫혀 있으면 `라벨 도구 연결 전` 한 줄. */
const LABEL = (async () => {
  const me = await get('/me');
  const url = me?.label_url || me?.links?.label || CFG.labelUrl || '';
  if (!url) return null;
  const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 2500);
  try { await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ac.signal }); return url; }
  catch { devlog('label', 'label tool closed'); return null; }
  finally { clearTimeout(to); }
})();
const OFF = '라벨 도구 연결 전';
/** 라벨 열기 자리 — 열려 있으면 새 창 링크, 아니면 비활성 한 줄 */
function labelSlot(host, cls = 'tr-label') {
  const off = h(`span.t-label.tr-off.${cls}`, { text: OFF, hidden: true });
  host.append(off);
  LABEL.then((u) => {
    if (!u) { off.hidden = false; return; }
    off.replaceWith(h(`a.t-btn.t-btn--text.${cls}`, { href: u, target: '_blank', rel: 'noopener', text: '라벨 열기' }));
  });
}
const MODELS = (modelsJ?.items || []).filter((m) => ['seg', 'obb', 'det'].includes(m.task));
const FB = fbJ?.items || [];
devlog('models', `${MODELS.length} trainable / ${(modelsJ?.items || []).length}`);

/* 모델 학습 기록(카드) — 등록된 것만 읽는다(없는 파일을 두드리지 않는다) */
const CARD = new Map();
await Promise.all(MODELS.map(async (m) => CARD.set(m.id, m.card_url ? await file(m.card_url) : null)));

const dateOf = (m) => CARD.get(m.id)?.ckpt_date || Object.values(m.metrics || {}).find(isEnvelope)?.as_of || '';
const yearOf = (m) => (dateOf(m).match(/^\d{4}/) || [''])[0];
const dayText = (s) => (/^\d{4}-\d{2}$/.test(s) ? s.replace('-', '.') : df(s));

/** 업무 → 대표 모델: 이 업무 클래스 비중이 큰 모델 → 최근 학습 순 */
function modelsFor(t) {
  const hit = MODELS.filter((m) => (m.classes || []).some((c) => t.cls.includes(c)));
  const share = (m) => (m.classes || []).filter((c) => t.cls.includes(c)).length / Math.max(1, (m.classes || []).length);
  return hit.sort((a, b) => share(b) - share(a) || dateOf(b).localeCompare(dateOf(a)));
}

/** 정밀도 한 출처 — 쓰는 가중치(best)가 나온 회차의 기록. 카드·서랍 `정밀도`와 곡선 표시점이 모두 이 값 하나를 읽는다.
    { value, epoch } · epoch 는 학습 로그가 있을 때만(없으면 곡선 없음) */
function bestOf(m) {
  const c = CARD.get(m.id);
  if (!c) return null;
  const k = m.task === 'seg' ? 'M' : 'B';
  const bk = Object.keys(c).find((x) => x.startsWith('best_by'));
  const best = (bk && c[bk]) || c.metrics || c.last;
  const v = best?.[`metrics/precision(${k})`] ?? best?.['metrics/precision(B)'];
  if (v === undefined || v === null) return null;
  return { value: +v, epoch: Number.isFinite(+best.epoch) && best.epoch != null ? +best.epoch : null };
}
/** 이 업무 전용 모델인가 — 모델 클래스가 모두 이 업무 클래스(여러 업무를 함께 보는 모델의 전체 정밀도는 업무 값이 아니다) */
const dedicated = (m, t) => (m?.classes || []).length > 0 && m.classes.every((c) => t.cls.includes(c));
/** 정밀도(학습 검증 영상 기준 · 현장 확인 전 = 추정치 ~) — 이 업무 전용 모델의 기록만. 없으면 null('—') */
function precEnv(m, t) {
  if (!dedicated(m, t)) return null;
  const b = bestOf(m);
  if (!b) return null;
  const c = CARD.get(m.id);
  return { value: b.value, unit: 'ratio', basis: 'estimate', as_of: String(c.ckpt_date || '').slice(0, 10), source: '학습 검증 영상(현장 확인 전)' };
}

/** 해상도 말(서랍 제목 = 카드와 같은 업무명 · 해상도) */
const gsdWord = (g) => (g == null ? '' : g < 0.1 ? `${+(g * 100).toFixed(g < 0.1 ? 1 : 0)}cm 드론` : `${Math.round(g * 100)}cm 항공`);

/** 오탐 신고(열린 것) — 이 업무 결과층 */
const reportsFor = (t) => FB.filter((f) => f.kind === 'fp' && f.state === 'open' && f.set_id && new RegExp(t.sets, 'i').test(f.set_id));

/* 업무 전용 서비스 카드의 결과 보유 — 대표 수치 한 출처(summary stage) · summary 가 없을 때만 카드 기록의 단계 */
const CARDS = new Map((cardsJ?.items || []).map((c) => [c.id, c]));
const stageFor = (t) => (t.card ? stageOf(SUM, t.card) || (SUM ? null : CARDS.get(t.card)?.status_label || null) : null);
const hasResults = (t) => ['운영', '시범'].includes(stageFor(t));

const ROWS = new Map();
for (const t of TASKS) {
  const ms = modelsFor(t);
  const m = ms[0] || null;
  const reports = reportsFor(t);
  /* 모델 기록이 없어도 이 업무 결과가 있으면(summary 운영·시범) '첫 학습 전'이라 하지 않는다 — '학습 기록 없음' */
  const state = !m ? (hasResults(t) ? 'nomodel' : 'first') : reports.length >= CFG.reportMin ? 'retrain' : 'ok';
  ROWS.set(t.id, { t, m, ms, reports, state, prec: m ? precEnv(m, t) : null });
}
devlog('summary', SUM ? TASKS.filter((t) => t.card).map((t) => `${t.card} ${stageOf(SUM, t.card) || '—'}`).join(' · ') || '업무 전용 카드 없음' : '없음 · 카드 기록 단계로 대체');

/* ── 카드 채우기 ────────────────────────────────────────────── */
const CHIP = { ok: ['쓸 수 있음', ''], retrain: ['재학습 필요', 'warn'], first: ['첫 학습 전', 'gap'], nomodel: ['학습 기록 없음', 'gap'] };
for (const [id, r] of ROWS) {
  const el = cardEls.get(id);
  el.dataset.state = r.state;
  /* 크롭 자리: 쓸 수 있음/재학습 = 이 업무 클래스의 실제 결과 크롭 · 첫 학습 전·크롭 없음 = 밝은 타일(--bg-0 격자) + 업무 명사 알약.
     K9 위성 캐릭터는 서랍 빈 상태(첫 학습 전)에만 — 목록에 같은 그림을 되풀이하지 않는다 */
  const img = el.querySelector('img');
  const box = el.querySelector('.k-svc-crop');
  const cardCrop = r.t.card ? CARDS.get(r.t.card)?.crop_url : null;   // 업무 전용 카드의 실제 결과 크롭
  if (!r.t.crop && cardCrop && r.state !== 'first') img.src = cardCrop;
  else if (r.t.crop && r.state !== 'first') {
    img.src = CROP + r.t.crop;
    if (r.t.cropPos) { img.style.objectPosition = r.t.cropPos; img.style.setProperty('--tr-zoom', r.t.cropZoom || 1); img.style.setProperty('--tr-origin', r.t.cropPos); box.classList.add('is-zoom'); }
  } else {
    img.remove(); box.classList.add('is-ph');
    box.append(h('span.tr-ph', { text: r.t.noun || r.t.cls[0] || r.t.name }));
  }
  el.querySelector('.tr-year').textContent = r.m && yearOf(r.m) ? `${yearOf(r.m)} 학습` : '';
  const [txt, lv] = CHIP[r.state];
  const chip = el.querySelector('.tr-chip'); chip.textContent = txt; if (lv) chip.dataset.lv = lv;
  /* 정밀도 — 이 업무의 실제 기록값 · 모델은 있는데 업무 기록이 없으면 '—'(다른 업무 값을 옮겨 쓰지 않는다) · 모델이 없으면 칸 없음 */
  el.querySelector('.tr-n').innerHTML = r.prec ? `<span class="t-label">정밀도</span><span class="k-num tr-p" data-v="${r.prec.value}">${nf(r.prec.value, 2)}</span>${sig(r.prec)}`
    : r.m ? '<span class="t-label">정밀도</span><span class="k-num tr-p" data-v="">—</span>' : '';
}
document.documentElement.dataset.trainReady = '1';
S.fresh(modelsJ?.as_of || fbJ?.as_of || new Date().toISOString());

/* ── 서랍(K5): 선택 모델 ─────────────────────────────────────── */
let D = null, current = null;
document.addEventListener('kit:drawer', (e) => pane.classList.toggle('has-drawer', e.detail.open > 0));

function select(id, push) {
  const r = ROWS.get(id); if (!r) return;
  current = id;
  for (const [k, el] of cardEls) el.toggleAttribute('aria-current', k === id);
  if (push) history.pushState({ task: id }, '', withQuery({ task: id }));
  openDrawer(r);
}
function withQuery(patch) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(patch)) (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  return u.pathname + u.search + u.hash;
}
addEventListener('popstate', () => { const id = new URLSearchParams(location.search).get('task'); if (id) select(id, false); else D?.close(true); });

function openDrawer(r) {
  const body = h('div.tr-dr');
  D = drawer({
    title: r.m ? [r.t.name, gsdWord(r.m.gsd_trained_m)].filter(Boolean).join(' · ') : r.t.name, body, host: S.main, slot: 'right', label: r.t.name,
    onClose: () => { current = null; for (const el of cardEls.values()) el.removeAttribute('aria-current'); history.replaceState({}, '', withQuery({ task: null })); },
  });
  if (!r.m && r.state === 'nomodel') {
    const e = h('div'); body.append(e);
    empty(e, { kind: 'first', title: '학습 기록 없음', text: '이 업무의 AI 결과는 있지만 모델 학습 기록이 아직 등록되지 않았습니다' });
    labelSlot(e.querySelector('.k-empty-b'), 'k-empty-a');
    return;
  }
  if (!r.m) {
    const e = h('div'); body.append(e);
    empty(e, { kind: 'first', title: '첫 학습 전', text: '라벨을 만들면 이 업무의 첫 모델을 학습할 수 있습니다' });
    labelSlot(e.querySelector('.k-empty-b'), 'k-empty-a');
    return;
  }
  /* 큰 숫자 — 현장 확인 기준(S-2 /survey/rules/{id}/stats). 없으면 결손 표기(지어내지 않는다) */
  /* S-2 전(라우트 없음 · 값 없음)에는 블록을 접는다 — 정밀도가 두 번 다르게 보이지 않게. 들어오면 자동으로 열린다 */
  const big = h('div.tr-big', { hidden: true }); body.append(big);
  const B = bignum(big, null, { label: '정밀도(현장 확인 기준)', digits: 2 });
  /* 현장 확인 n건 = 큰 숫자의 분모(같은 응답의 judged) — 큰 숫자 바로 아래 한 줄. 큰 숫자가 접히면 이 줄도 없다 */
  const fc = h('p.t-label.tr-fc', { hidden: true }); big.after(fc);
  fieldPrecision(r.t).then((f) => {
    if (!f) return;
    big.hidden = false; B.set(f.env, { digits: 2, unit: '' });
    if (f.n !== null) { fc.textContent = `현장 확인 ${nf(f.n)}건`; fc.hidden = false; }
  });

  const c = CARD.get(r.m.id);
  const dl = h('dl.tr-dl');
  const row = (k, v) => dl.append(h('dt.t-label', { text: k }), h('dd', { html: v }));
  row('정밀도', r.prec ? `<span class="num">${nf(r.prec.value, 2)}</span>${sig(r.prec)}` : '—');
  row('마지막 학습', `<span class="num">${esc(dayText(dateOf(r.m)) || '—')}</span>`);
  /* 표본 — 서버가 값을 줄 때만 행을 연다(값 없으면 접음 · 큰 숫자 블록과 같은 규칙) */
  const sv = isEnvelope(r.m.samples) ? (r.m.samples.value ?? null) : Number.isFinite(r.m.samples) ? r.m.samples : null;
  if (sv !== null) row('표본', `<span class="num">${nf(sv)}</span>${isEnvelope(r.m.samples) ? sig(r.m.samples) : ''}`);
  row('오탐 신고', `<span class="num${r.reports.length >= CFG.reportMin ? ' tr-warn' : ''}">${nf(r.reports.length)}</span>`);
  body.append(dl);

  /* 학습 곡선 — 학습 로그가 없으면 섹션째 접는다(제목 아래 줄표만 남기지 않는다). 표시점 = 서랍 정밀도와 같은 회차·같은 값 */
  const chartBox = h('section.tr-curve', { hidden: true }, h('p.t-label', { text: '학습 곡선' }));
  const chart = h('div'); chartBox.append(chart); body.append(chartBox);
  if (r.prec) curve(r.m, c).then(({ pts, mark }) => { if (pts.length > 1) { chartBox.hidden = false; drawCurve(chart, pts, mark, r.prec?.value); } });

  const run = h('div.tr-run', { hidden: true }, h('div.t-progress', {}, h('i')), h('p.t-label.tr-q', { role: 'status', 'aria-live': 'polite' }));
  const copy = h('button.t-btn', { type: 'button', text: '사본 만들기' });
  const again = h('button.t-btn.t-btn--2', { type: 'button', text: '학습 시작' });
  body.append(h('div.tr-act', {}, copy, again));
  labelSlot(body);
  body.append(run);
  copy.addEventListener('click', () => openSheet(r));
  again.addEventListener('click', () => start({ kind: 'train', base_model: r.m.id }, { btn: again, run, chart }));
}

/** 큰 숫자(현장 확인 기준 정밀도)와 그 건수 — 한 응답(/survey/rules/{id}/stats)에서 함께 읽는다.
    건수 = judged(정밀도 분모). judged 가 없을 때만 by_state(inspected + closed)로 대체 */
async function fieldPrecision(t) {
  for (const rid of t.rules) {
    const p = `/survey/rules/${rid}/stats`;
    if (!(await hasRoute(p))) return null;
    const j = await get(p);
    const e = j?.precision;
    if (!isEnvelope(e) || e.value === null) continue;
    const bs = j.by_state || {};
    const jd = isEnvelope(j.judged) ? j.judged.value : null;
    const n = Number.isFinite(+jd) && jd !== null ? +jd
      : (bs.inspected || bs.closed) ? (+bs.inspected?.value || 0) + (+bs.closed?.value || 0) : null;
    /* 서랍의 다른 정밀도(0–1 두 자리)와 같은 척도로 — 서버가 % 로 주면 비율로 옮긴다(값은 그대로) */
    const ratio = e.unit === '%' ? +e.value / 100 : +e.value;
    return { env: { ...e, value: ratio, unit: 'ratio', basis: (n ?? 0) >= 100 ? 'measured' : 'estimate' }, n };
  }
  return null;
}

/** K12 선 — 값 범위에 맞춰 세로를 채운다(0–1 고정이면 곡선이 위에 붙어 축 라벨과 멀어짐).
    점+라벨은 표시 회차(mark) 한 곳 — 서랍 정밀도와 같은 회차(best)·같은 값(shown). 진행 중 학습은 mark = 마지막 회차 */
const CH = 112, TOP = 12, LW = 600, LP = { l: 8, r: 64, t: 16, b: 28 };
function drawCurve(el, pts, mark = pts.length - 1, shown) {
  const ys = pts.map((p) => +p.value);
  let lo = Math.floor(Math.min(...ys) * 20) / 20, hi = Math.ceil(Math.max(...ys) * 20) / 20;
  if (hi - lo < 0.1) lo = Math.max(0, hi - 0.1);
  const k = (y) => (y - lo) / (hi - lo || 1);
  line(el, { points: pts.map((p) => ({ label: p.label, value: k(+p.value) })), h: CH });
  const i = Math.min(Math.max(0, mark), pts.length - 1);
  const val = shown ?? ys[i];
  /* K12 의 끝점(원·라벨)을 표시 회차로 옮긴다 — 좌표는 K12 와 같은 식(viewBox 600 × CH) */
  const x = (LP.l + (i / Math.max(1, pts.length - 1)) * (LW - LP.l - LP.r)) / LW * 100;
  const y = TOP + LP.t + (1 - k(ys[i])) * (CH - LP.t - LP.b);   // px · svg 높이 = CH px
  el.querySelector('.k-line-d')?.remove();
  el.querySelector('.tr-mark')?.remove();
  el.append(h('i.tr-mark', { style: `left:${x}%;top:${y}px` }));
  const v = el.querySelector('.k-line-v');
  if (v) { v.textContent = nf(val, 2); v.classList.add('tr-mark-v'); v.style.left = x + '%'; v.style.top = y + 'px'; v.dataset.v = val; }
  el.querySelector('svg')?.setAttribute('aria-label', `학습 곡선 ${pts[0].label} → ${pts[pts.length - 1].label} · ${pts[i].label} ${nf(val, 2)}`);
}

/** 학습 곡선 — 학습 기록(회차별 정밀도). 내부 지표 이름은 여기 밖으로 나가지 않는다 */
const CURVE = new Map();
async function curve(m, c) {
  if (CURVE.has(m.id)) return CURVE.get(m.id);
  let pts = [], mark = -1;
  const best = bestOf(m);
  if (c?.epochs_logged && m.card_url && best?.epoch != null) {
    const csv = await file(m.card_url.replace(/card\.json$/, 'results.csv'), 'text');
    if (csv) {
      const [head, ...lines] = csv.trim().split(/\r?\n/);
      const cols = head.split(',').map((s) => s.trim());
      const k = m.task === 'seg' ? 'M' : 'B';
      const pi = cols.indexOf(`metrics/precision(${k})`) >= 0 ? cols.indexOf(`metrics/precision(${k})`) : cols.indexOf('metrics/precision(B)');
      const ei = cols.indexOf('epoch');
      const all = lines.map((l) => l.split(',')).filter((x) => x.length > pi && pi >= 0).map((x) => ({ ep: +x[ei], label: `${+x[ei]}회차`, value: +x[pi] }));
      /* 표시 회차 = 정밀도의 회차(best). 로그에 그 회차가 없으면 곡선을 그리지 않는다(다른 값 두 개를 보이지 않게) */
      const bi = all.findIndex((p) => p.ep === best.epoch);
      if (bi >= 0) {
        all[bi].value = best.value;   // 같은 회차 · 기록의 같은 값(로그 반올림 차이까지 한 출처로)
        const step = Math.max(1, Math.ceil(all.length / 60));
        pts = all.filter((_, i) => i % step === 0 || i === all.length - 1 || i === bi);
        mark = pts.indexOf(all[bi]);
      }
    }
  }
  const out = { pts, mark };
  CURVE.set(m.id, out);
  return out;
}

/* ── 표본 영상 → 소유 지역(한 영상 = 한 지역) ─────────────────────
   정본 순서: ① 카탈로그가 지정한 지역 코드(sgg_cd · region_cd · region.sgg_cd)
             ② 배포 기록이 지정한 지역 — 배포 region_profile(예: 지역 프로필 키)과 그 region_name 으로 /regions 항목을 찾고,
                카탈로그 영상 id·set 이 그 프로필 키를 낱말로 품으면 그 지역(지역 문자열 하드코딩 0)
             ③ 포함(containment) — 영상 bounds 전체를 품는 지역 bbox. 여럿이면 시군구 경계(정적 geojson)에서 영상 중심을 품는 곳,
                하나도 없으면 영상 중심을 품는 시군구 중 bbox 가 영상의 절반 이상을 덮는 곳
   bbox 교차·'가장 좁은 상자' 규칙은 쓰지 않는다(이웃 시군구 영상이 섞임). */
const whenOf = (i) => {
  if (i.epoch && /^\d{4}(-\d{2})?$/.test(i.epoch)) return i.epoch;
  const s = `${i.name?.en || ''} ${i.name?.ko || ''} ${i.id}`;
  const ym = s.match(/(20\d{2})-(0[1-9]|1[0-2])/) || s.match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  return ym ? (ym[2] ? `${ym[1]}-${ym[2]}` : ym[1]) : '';
};
let SAMPLE = null;
function sampleIndex() {
  if (SAMPLE) return SAMPLE;
  return (SAMPLE = (async () => {
    const [cat, dep, allRg, sgg] = await Promise.all([
      get('/catalog/layers'), get('/deploys'), loadRegions(),
      fetch('/landxi/assets/data/geo/sigungu.geojson').then((x) => (x.ok ? x.json() : null)).catch(() => null),
    ]);
    const imgs = (cat?.items || []).filter((i) => i.role === 'imagery' && i.source === 'pmtiles' && i.bounds && i.gsd_m != null && !/변화|change/i.test(i.id + (i.name?.ko || '')));
    const norm = (s) => String(s || '').replace(/\s+/g, '');
    const byCode = new Map(allRg.map((x) => [x.sgg_cd, x]));
    /* ② 배포 기록: 프로필 키 → 지역 */
    const prof = new Map();
    for (const d of dep?.items || []) {
      const key = d.region_profile; if (!key || prof.has(key)) continue;
      /* 배포 지역 이름(예: '{시도} {시군구}[ {읍면}]') → /regions 항목: 시군구 낱말이 같고 시도가 앞머리로 맞는 곳 */
      const toks = String(d.region_name?.ko || '').trim().split(/\s+/);
      const rg = (d.sgg_cd && byCode.get(d.sgg_cd)) || byCode.get(key)
        || allRg.find((x) => toks.length > 1 && toks.slice(1).includes(x.name) && (!x.sido || toks[0].startsWith(x.sido) || x.sido.startsWith(toks[0])));
      if (rg) prof.set(key, rg);
    }
    const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const hasSeq = (ws, seq) => ws.some((_, k) => seq.every((w, n) => ws[k + n] === w));
    /* ③ 포함 + 시군구 경계 */
    const inRing = (x, y, ring) => { let o = false; for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) { const [xa, ya] = ring[a], [xb, yb] = ring[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) o = !o; } return o; };
    const inGeom = (x, y, g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).some((p) => inRing(x, y, p[0]) && !p.slice(1).some((hh) => inRing(x, y, hh)));
    const polyAt = (x, y) => {
      const f = (sgg?.features || []).find((ft) => ft.geometry && inGeom(x, y, ft.geometry));
      if (!f) return null;
      const pr = f.properties || {};
      return byCode.get(pr.code) || allRg.find((r) => r.name === pr.name && r.bbox && x >= r.bbox[0] && x <= r.bbox[2] && y >= r.bbox[1] && y <= r.bbox[3]) || null;
    };
    const contains = (o, i) => o[0] <= i[0] && o[1] <= i[1] && o[2] >= i[2] && o[3] >= i[3];
    const share = (b, r) => Math.max(0, Math.min(b[2], r[2]) - Math.max(b[0], r[0])) * Math.max(0, Math.min(b[3], r[3]) - Math.max(b[1], r[1])) / ((b[2] - b[0]) * (b[3] - b[1]) || 1);
    const ownerOf = new Map();
    for (const i of imgs) {
      const code = i.sgg_cd || i.region_cd || i.region?.sgg_cd;
      let o = code ? byCode.get(code) : null;
      if (!o) {
        const ws = words(`${i.id} ${i.set || ''}`);
        const k = [...prof.keys()].filter((key) => hasSeq(ws, words(key))).sort((a, b) => b.length - a.length)[0];
        if (k) o = prof.get(k);
      }
      if (!o) {
        const b = i.bounds, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        const inn = allRg.filter((x) => x.bbox && contains(x.bbox, b));
        const at = polyAt(cx, cy);
        if (inn.length === 1) o = inn[0];
        else if (inn.length > 1) o = (at && inn.find((x) => x.sgg_cd === at.sgg_cd)) || null;
        else if (at && at.bbox && share(b, at.bbox) >= 0.5) o = at;
      }
      if (o) ownerOf.set(i.id, o);
    }
    return { imgs, ownerOf, allRg };
  })());
}

/* ── 시트: 미세조정(사본) ────────────────────────────────────── */
async function openSheet(r) {
  const body = h('div.tr-sheet');
  drawer({ title: '미세조정', body, host: S.main, slot: 'sheet' });
  const rp = h('div');
  const sel = h('select.t-input', { 'aria-label': '표본 영상', hidden: true });
  const hint = h('p.t-label.tr-hint', { text: '지역을 먼저 고르세요' });
  const go = h('button.t-btn.tr-go', { type: 'button', text: '시작', disabled: true });
  const run = h('div.tr-run', { hidden: true }, h('div.t-progress', {}, h('i')), h('p.t-label.tr-q', { role: 'status', 'aria-live': 'polite' }));
  const noImg = h('div.tr-noimg', { hidden: true });
  body.append(h('label.t-label', { text: '대상 지역' }), rp, h('label.t-label', { text: '표본 영상' }), hint, sel, noImg, go, run);

  let region = null;
  const { imgs, ownerOf, allRg } = await sampleIndex();
  /* 표본 영상 이름 = `{연월} {해상도} {종류} · {지역}` — 카탈로그 원 이름의 내부 말(AOI·칩·도엽 번호)은 쓰지 않는다 */
  const imgName = (i, rg) => {
    const s = `${i.name?.en || ''} ${i.name?.ko || ''} ${i.id}`;
    const w = whenOf(i);
    const g = +i.gsd_m;
    const res = g < 1 ? `${+(g * 100).toFixed(g < 0.1 ? 1 : 0)}cm` : `${+g.toFixed(1)}m`;
    const kind = /drone|드론/i.test(s) || g < 0.1 ? '드론' : /satell|sentinel|위성/i.test(s) ? '위성' : /aerial|항공/i.test(s) || g < 1 ? '항공' : '정사영상';
    return `${[w.replace('-', '.'), res, kind].filter(Boolean).join(' ')} · ${rg?.name || ''}`.replace(/ · $/, '');
  };
  /* 고른 지역의 표본 영상 = 소유 지역이 그 지역인 영상(sampleIndex 규칙) · 순서 고정: 해상도 ↑ → 촬영 시점 ↓ → id */
  const same = (a, b) => !!a && !!b && (a.sgg_cd === b.sgg_cd || (a.full && b.full && a.full.replace(/\s+/g, '') === b.full.replace(/\s+/g, '')));
  const fill = (rg) => {
    region = rg;
    const list = rg ? imgs.filter((i) => same(ownerOf.get(i.id), rg))
      .sort((a, b) => a.gsd_m - b.gsd_m || whenOf(b).localeCompare(whenOf(a)) || a.id.localeCompare(b.id)) : [];
    sel.innerHTML = list.map((i) => `<option value="${esc(i.id)}">${esc(imgName(i, rg))}</option>`).join('');
    sel.hidden = !list.length; hint.hidden = !!rg; go.disabled = !list.length;
    noImg.hidden = !!list.length || !rg;
    if (!list.length && rg) empty(noImg, { kind: 'ingest', compact: true, action: { label: '영상 등록', href: `/landxi/v3/lx-ingest/?region=${encodeURIComponent(rg.sgg_cd)}` } });
    devlog('samples', `${rg?.sgg_cd} ${list.map((i) => i.id).join(',')}`);
  };
  const picker = await regionPicker(rp, { onPick: fill, value: REGION || undefined });
  if (REGION) { const rg = allRg.find((x) => x.sgg_cd === REGION); if (rg) fill(rg); }
  picker.input.focus();
  go.addEventListener('click', () => start({ kind: 'train', base_model: r.m.id, region: region?.sgg_cd, samples: sel.value ? [sel.value] : [], imagery_id: sel.value || undefined }, { btn: go, run }));
}

/* ── 학습 걸기: 견적 → 제출 → 큐 위치 · 곡선 ─────────────────── */
const FAIL = '지금은 학습을 시작할 수 없습니다';
function powerMsg(e) {
  if (!e) return null;
  if (e.code === 'power_budget') return e.message || null;
  const rs = e.reasons || e.detail?.reasons || [];
  const r = rs.find((x) => (x?.code || x) === 'power_budget' || /power_budget/.test(JSON.stringify(x)));
  return r ? (r.message || r.text || null) : null;
}
async function start(body, ui) {
  const bar = ui.run.querySelector('i'), msg = ui.run.querySelector('.tr-q');
  ui.btn.disabled = true; ui.run.hidden = false; ui.run.classList.remove('is-fail'); bar.style.width = '6%'; msg.textContent = '';
  const fail = (e) => { devlog('train', e?.message || e?.code || 'rejected'); ui.run.classList.add('is-fail'); bar.style.width = '0'; msg.textContent = powerMsg(e) || FAIL; ui.btn.disabled = false; };
  let q;
  try { q = await api('/jobs/quote', { method: 'POST', body }); } catch (e) { return fail(e); }
  if (q && q.allowed === false) return fail({ reasons: q.reasons });
  let j;
  try { j = await api('/jobs', { method: 'POST', body }); } catch (e) { return fail(e); }
  const job = j.job || j; devlog('job', job.id);
  toast('학습을 시작했습니다');
  track(job, j.events_url, ui);
}
function track(job, eventsUrl, ui) {
  const bar = ui.run.querySelector('i'), msg = ui.run.querySelector('.tr-q');
  let queued = true, pts = [];
  const pos = async () => {
    if (!queued) return;
    const l = await get('/jobs?state=queued&limit=200');
    const qs = (l?.items || []).sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.created_at).localeCompare(String(b.created_at)));
    const i = qs.findIndex((x) => x.id === job.id);
    if (i >= 0) msg.textContent = `대기 ${nf(i + 1)}번째`; else if (queued) msg.textContent = '';
    if (queued) setTimeout(pos, 3000);
  };
  pos();
  if (!eventsUrl) return;
  const s = sse(eventsUrl.replace(/^.*\/api\/v1/, ''), {
    on: (name, d) => {
      if (name === 'job.started' || name === 'job.progress') { queued = false; msg.textContent = ''; }
      if (name === 'job.progress') {
        const p = d?.progress ?? (d?.epoch && d?.epochs ? d.epoch / d.epochs : null);
        if (p != null) bar.style.width = Math.max(6, p * 100) + '%';
        const mt = d?.metrics; const v = mt?.precision ?? mt?.['metrics/precision(M)'] ?? mt?.['metrics/precision(B)'];
        if (ui.chart && v != null) { pts.push({ label: `${d.epoch ?? pts.length + 1}회차`, value: +v }); if (pts.length > 1) { const sec = ui.chart.closest('.tr-curve'); if (sec) sec.hidden = false; drawCurve(ui.chart, pts); } }
      }
      if (name === 'job.done') { s.close(); queued = false; bar.style.width = '100%'; ui.btn.disabled = false; }
      if (name === 'job.failed' || name === 'job.cancelled') { s.close(); queued = false; ui.run.classList.add('is-fail'); msg.textContent = FAIL; ui.btn.disabled = false; }
    },
  });
}

/* 첫 진입: URL 상태(?task=) 복원 */
const t0 = q0.get('task');
if (t0 && ROWS.has(t0)) select(t0, false);
