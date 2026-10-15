/* board.js — 프로젝트 '학습' 화면 = AI 모델 작업 흐름(학습-작업흐름-v3 · 10-12 11:26 '이대로 구현' · 원칙 183 · 200 · 208 · 209).
   시안 landxi/proto/review/mock/train-flow-3 를 실제 화면으로 옮김 — 세로 한 줄기:
   ① 흐름 판 — 블록(학습 데이터 · 기반 모델 · 학습 설정 · 학습 · 추론 · 배포 신청 — 10-13 '평가'→'추론' · '추론 시험'은 '추론'과 같은 것이라 하나로)을 위 칩에서 끌어다 놓거나 눌러 더하고,
      출구 ○ → 다음 블록으로 잇는다. 같은 블록 여러 개 · D 복제 · Delete 지우기 · 선 누르면 끊기 · 블록 누르면 오른쪽 서랍.
      처음 판 = 학습 서식('기본' 하나 · GET /train-templates · 결정 ⓑ 블록까지 바꿈 · 10-12 12:45 · 10-13 기본 하나) —
      블록 자리는 서식, 값은 이 프로젝트의 가장 최근 학습. 직원은 블록 넣기 · 빼기 · 잇기를 바꾸고 '기본 흐름으로 되돌리기'로 처음 모양.
      학습 데이터 블록 선택지에 '수정된 부분 n장'(10-13 저절로-문구 · 사용자 말 그대로)(GET /train-data/xi — 이 프로젝트가 만든 분석서비스에서 고친 곳이 모인 학습 데이터 · 10-13 데이터-개념 ⓐ)
      — 학습은 XI 재학습(쉬는 시간)이 같은 칸으로 한다.
      '다시 돌리기' = 판 위 학습 블록마다 학습 한 건(그 블록에 이은 학습 데이터 · 기반 모델 · 학습 설정) → 작업 대기열(/jobs/quote → /jobs · 전력 규칙은 서버).
   ② 이번 학습 — 반복마다 정확도 그래프 하나(학습 기록 · 지난 판 겹침 · 기준선 없음) + 핵심 수치.
   ③ 학습 이력 — 목록(날짜 · 판 · AI 모델 정확도 · 학습 데이터 n장 · 상태).
   학습 장비는 고르는 자리 없음 — 'LX 관리자가 배정 · 프로젝트 하나에 한 장' 한 줄(원칙 200). 화면 글은 'GPU' 대신 '학습 장비'.
   숫자 = GET /projects/{id}/train(모델 기록 · 학습 기록 · 묶음 기록 · 검증 결과) · 서비스 중 = /cards/deck(분석하기 카드와 같은 규칙 kit/acc.js). 지어낸 값 0. */
import { h, api } from '../kit/util.js';
import { modal } from '../kit/modal.js';
import { toast } from '../kit/toast.js';
import { empty } from '../kit/empty.js';
import { nf } from '../kit/i18n.js';
import { serviceAcc } from '../kit/acc.js';
import { sse, JOB_EVENTS } from '../../shared/api-v1.js';
import { stageHref } from '../lx-project/context.js';

let cssOn = false;
function sheet() {
  if (cssOn || document.querySelector('link[data-tb]')) return;
  cssOn = true;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./board.css', import.meta.url).href, dataset: { tb: '1' } }));
}

const v = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const md = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
const mdhm = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${md(s)} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const dur = (sec) => {
  if (sec == null) return '';
  const m = Math.round(sec / 60);
  if (m < 1) return `${Math.max(1, Math.round(sec))}초`;
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
};
const pct = (x) => (x == null ? '—' : `${nf(Math.round(x))}%`);
const ORD = ['첫', '두 번째', '세 번째', '네 번째', '다섯 번째', '여섯 번째', '일곱 번째', '여덟 번째', '아홉 번째', '열 번째'];
const ordName = (i) => `${ORD[i] || `${i + 1}번째`} 판`;
const clsWords = (cls = []) => [...new Set(cls.map((c) => String(c).split('_')[0]))];
const LIVE = new Set(['queued', 'running']);

const KIND = { data: '학습 데이터', base: '기반 모델', cfg: '학습 설정', train: '학습', eval: '추론', deploy: '배포 신청' };   // 10-13 '평가' → '추론'(원칙 235) · '추론 시험' 블록은 '추론'과 하나로
const IN = { train: ['data', 'base', 'cfg'], eval: ['train'], deploy: ['eval'] };
const ONE = { train: ['data', 'base', 'cfg'], eval: ['train'], deploy: ['eval'] };
const WHY = { train: '학습에는 학습 데이터 · 기반 모델 · 학습 설정만 들어와요', eval: '추론은 학습이 끝난 모델에만 이어요', deploy: '배포 신청에는 추론만 이어요',
  data: '학습 데이터 앞에는 아무것도 오지 않아요', base: '기반 모델 앞에는 아무것도 오지 않아요', cfg: '학습 설정 앞에는 아무것도 오지 않아요' };
const ONE_WHY = { data: '학습 하나에 학습 데이터는 하나만 — 다른 데이터로 보려면 학습 블록을 하나 더 놓아요',
  base: '학습 하나에 기반 모델은 하나만 — 둘을 나란히 보려면 학습 블록을 하나 더 놓아요',
  cfg: '학습 하나에 학습 설정은 하나만 — 설정을 바꿔 보려면 학습 블록을 하나 더 놓아요',
  train: '추론 하나에 학습 하나만 이어요', eval: '배포 신청 하나에 추론 하나만 이어요' };
const W = 168, C0 = 20, C1 = 250, C2 = 480, C3 = 710, R = [16, 112, 200];
const EPOCHS = [3, 10, 20], SIZES = [640, 1280], BATCH = [4, 8], EP_MAX = 50;
const GPU_LINE = '학습 장비 — LX 관리자가 배정 · 프로젝트 하나에 한 장';

/** 프로젝트 학습 화면을 host(셸 판)에 그린다. project = GET /projects/{id} 응답 */
export async function trainBoard({ host, project: P }) {
  sheet();
  const pane = h('div.tb-pane');
  const col = h('div.tb-col');
  pane.append(col);
  const side = h('aside.tb-side', { hidden: true, 'aria-label': '블록 설정' });
  host.append(pane, side);
  const wait = h('div'); col.append(wait);
  empty(wait, { kind: 'loading' });                       // 가운데 '불러오는 중' 하나(로딩-1 · 원칙 212)

  let T, deck = null, smp = null, TPL = null, XU = null, SHR = null;
  try {
    [T, deck, smp, TPL, XU, SHR] = await Promise.all([api(`/projects/${encodeURIComponent(P.id)}/train`),
      api('/cards/deck').catch(() => null), api('/training/samples?project=' + encodeURIComponent(P.id)).catch(() => null),
      api('/train-templates').catch(() => null), api('/train-data/xi?project=' + encodeURIComponent(P.id)).catch(() => null),
      api('/training/samples?shared=1').catch(() => null)]);   // 관리자가 공개한 학습 데이터(공유 데이터 · 10-14 공유데이터-탭)
  } catch (e) {
    col.replaceChildren(); const x = h('div'); col.append(x);
    empty(x, { kind: 'error', title: '학습 기록을 불러오지 못했습니다', onRetry: () => location.reload() });
    return;
  }
  wait.remove();

  /* ── 기록 정리 ── */
  const runs = T.runs || [];                                   // 최근 순
  const asc = [...runs].reverse();
  const nameOf = new Map(asc.map((r, i) => [r.job, ordName(i)]));
  const byModel = new Map(runs.filter((r) => r.model).map((r) => [r.model.id, r]));
  const base0 = T.base || null;                                // 원판
  const svc = serviceAcc(deck?.items || [], { card: P.card || null, models: runs.map((r) => r.model?.id).filter(Boolean) });
  const serving = svc?.model || null;
  const baseWord = (id) => {
    if (base0 && id === base0.id) return { short: '원판', long: `원판 · ${clsWords(base0.classes).length}종 모델` };
    const r = byModel.get(id);
    return r ? { short: nameOf.get(r.job), long: nameOf.get(r.job) } : { short: '기반 모델', long: '기반 모델' };
  };
  const cur = runs[0] || null;
  const live = cur && LIVE.has(cur.state);
  const canRun = !!P.can?.train;

  /* 상태 말(이력 · 핵심 수치) */
  function stateOf(r) {
    if (r.state === 'running') return ['live', '학습 중'];
    if (r.state === 'queued') return ['live', '기다리는 중'];
    if (r.model?.id && r.model.id === serving) return ['ok', '서비스 중'];
    const s = r.same, sb = s?.base;
    if (r.model && ['candidate', 'pending'].includes(r.model.status)) {
      if (s && sb && v(s.value) < v(sb.value)) return ['down', `추론 ${pct(v(s.value))} · 원판 ${pct(v(sb.value))}보다 낮아 후보로 남음`];
      return ['', r.model.status === 'pending' ? '승인 대기' : '후보'];
    }
    return ['', '지난 판'];
  }

  /* ── 판의 블록 — 학습 서식(업무별 기본 흐름)의 블록 자리 + 이 프로젝트 가장 최근 학습의 값 ── */
  const nodes = {};
  const links = [];
  let picked = null, from = null, seq = 100;
  const dataOf = (r) => (r?.data ? { ref: r.data.ref, name: r.data.name, images: v(r.data.images), val: v(r.data.val), kind: r.data.kind,
    with: v(r.data.with), without: v(r.data.without) } : null);
  const tpl = TPL?.items?.['기본'] || { blocks: ['data', 'base', 'cfg', 'train', 'eval', 'deploy'], params: { epochs: 3, imgsz: 640, batch: 4 } };
  const tplCfg = tpl.params || tpl.cfg || { epochs: 3, imgsz: 640, batch: 4 };
  const EPM = TPL?.caps?.params?.epochs || EP_MAX;
  /** 기본 흐름 — 서식의 블록을 정해진 자리에 놓고 잇는다(처음 열 때 · '기본 흐름으로 되돌리기') */
  function defaultFlow() {
    for (const k of Object.keys(nodes)) delete nodes[k];
    links.length = 0;
    const has = (k) => tpl.blocks.includes(k);
    const put = (id, kind, x, y, extra) => { nodes[id] = { id, kind, x, y, ...extra }; };
    put('data1', 'data', C0, R[0], { data: cur ? dataOf(cur) : null });
    put('base1', 'base', C0, R[1], { base: cur?.base?.id || null });
    put('cfg1', 'cfg', C0, R[2], { cfg: cur ? { epochs: v(cur.epochs), imgsz: cur.imgsz, batch: cur.batch } : { ...tplCfg } });
    put('train1', 'train', C1, R[1], { run: cur || null });
    links.push({ a: 'data1', b: 'train1' }, { a: 'base1', b: 'train1' }, { a: 'cfg1', b: 'train1' });
    if (has('eval')) { put('eval1', 'eval', C2, R[1], { run: cur || null }); links.push({ a: 'train1', b: 'eval1' }); }
    if (has('deploy') && has('eval')) { put('deploy1', 'deploy', C3, R[1], { run: cur || null }); links.push({ a: 'eval1', b: 'deploy1' }); }
    picked = null; from = null;
  }
  defaultFlow();

  /* 고를 수 있는 것 — 학습 데이터(이 프로젝트 학습데이터 + 지난 학습에 쓴 데이터) · 기반 모델(원판 + 이 프로젝트가 만든 모델) */
  const DATA = [];
  for (const s of smp?.items || []) DATA.push({ ref: s.id, name: s.task_name, images: v(s.images), kind: 'sample', day: md(s.created_at) });
  for (const r of runs) { const d = dataOf(r); if (d?.ref && !DATA.some((x) => x.ref === d.ref)) DATA.push(d); }
  /* 수정된 부분 — 이 프로젝트가 만든 분석서비스의 결과를 XI맵에서 고친 곳 n장(서비스가 있을 때만) · 학습은 XI 재학습으로 */
  if (XU?.cards?.length) DATA.push({ ref: 'xi-edits', name: '수정된 부분', images: v(XU.tiles) ?? 0, kind: 'edits' });
  /* 공유 데이터에서 고르기 — LX 관리자가 '공유 데이터 · 학습 데이터'에서 공개한 다른 프로젝트의 올린 묶음(장수 = 같은 n_images) */
  const SHARED = (SHR?.items || []).filter((s) => !DATA.some((x) => x.ref === s.id))
    .map((s) => ({ ref: s.id, name: s.task_name, images: v(s.images), kind: 'sample', day: md(s.created_at) }));
  const BASES = [];
  if (base0) BASES.push({ id: base0.id, name: baseWord(base0.id).long, sub: `${clsWords(base0.classes).join(' · ')}${base0.id === serving ? ' · 서비스 중' : ''}`, acc: v(base0.acc) });
  for (const r of runs) if (r.model && r.state === 'done') BASES.push({ id: r.model.id, name: nameOf.get(r.job), sub: `${md(r.finished_at)}${r.model.id === serving ? ' · 서비스 중' : ''}`, acc: v(r.acc) });

  /* ── 화면 틀 ── */
  const go = h('button.tb-go', { type: 'button' });
  const hint = h('p');
  const add = h('div.tb-add', {}, h('span.tb-add-k', { text: '블록 더하기' }));
  const cv = h('div.tb-cv');
  const wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); wires.classList.add('tb-wires');
  cv.append(wires, h('div.tb-how', {}, '출구 ○ 를 누른 뒤 다음 블록을 눌러 이어요 · 선을 누르면 끊어요', h('b', { text: 'D' }), '복제', h('b', { text: 'Del' }), '삭제'));
  const reset = h('button.tb-reset', { type: 'button', text: '기본 흐름으로 되돌리기', onclick: () => { defaultFlow(); render(); } });
  const board = h('section.tb-card.tb-board', { 'aria-label': '학습 작업 흐름' },
    h('div.tb-board-h', {}, h('h1', { text: '학습 · AI 모델 작업 흐름' }), hint, go), add, h('div.tb-cv-w', {}, cv),
    h('div.tb-lock', {}, reset));
  const perf = h('section.tb-card.tb-perf', { 'aria-label': '이번 학습' });
  const keys = h('section.tb-card.tb-keys', { 'aria-label': '핵심 수치' });
  const hist = h('section.tb-card.tb-hist', { 'aria-label': '학습 이력' });
  col.append(board, h('div.tb-cur', {}, perf, keys), hist);

  if (!cur) hint.textContent = '아직 학습 기록이 없습니다 · 블록을 눌러 학습 데이터와 기반 모델을 고른 뒤 학습을 시작하세요';
  else if (live) hint.textContent = cur.state === 'queued' ? '학습이 대기열에서 차례를 기다리는 중입니다' : '학습 중입니다 · 반복마다 정확도가 아래 그래프에 차오릅니다';
  else hint.textContent = `${md(cur.finished_at)} 에 끝난 학습 · 같은 설정으로 다시 돌리거나 블록을 바꿔 새로 돌릴 수 있어요`;
  go.textContent = live ? '멈추기' : cur ? '다시 돌리기' : '학습 시작';
  go.disabled = !canRun;
  if (!canRun) go.title = P.published ? '공개된 서비스의 다시 학습은 프로젝트장이 시작합니다' : '학습은 프로젝트장 · 구성원이 시작합니다';
  go.addEventListener('click', () => (live ? stop() : start()));

  /* 블록 더하기 칩 */
  for (const k of Object.keys(KIND)) {
    const c = h('button.tb-chip', { type: 'button', draggable: 'true', dataset: { k }, text: KIND[k] });
    c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', k); c.classList.add('is-drag'); });
    c.addEventListener('dragend', () => c.classList.remove('is-drag'));
    c.addEventListener('click', () => { const [x, y] = freeSpot(); addNode(k, x, y); });
    add.append(c);
  }
  cv.addEventListener('dragover', (e) => { e.preventDefault(); cv.classList.add('is-over'); });
  cv.addEventListener('dragleave', () => cv.classList.remove('is-over'));
  cv.addEventListener('drop', (e) => {
    e.preventDefault(); cv.classList.remove('is-over');
    const k = e.dataTransfer.getData('text/plain'); if (!KIND[k]) return;
    const r = cv.getBoundingClientRect();
    addNode(k, Math.max(8, Math.min(e.clientX - r.left - W / 2, cv.clientWidth - W - 8)), Math.max(8, Math.min(e.clientY - r.top - 24, cv.clientHeight - 70)));
  });
  /** 눌러 더한 블록의 자리 — 다른 블록과 겹치지 않는 첫 칸(아래 줄부터 · 없으면 비켜 놓기) */
  function freeSpot() {
    const xs = [C1, C2, C3, C3 + 196, C0], ys = [R[2], R[0], R[1]];
    const busy = (x, y) => Object.values(nodes).some((n) => Math.abs(n.x - x) < W + 8 && Math.abs(n.y - y) < 72);
    for (const y of ys) for (const x of xs) if (x + W < Math.max(cv.clientWidth, 940) - 8 && !busy(x, y)) return [x, y];
    return [C1 + (seq % 5) * 24, R[2] + (seq % 3) * 8];
  }
  function addNode(k, x, y, src) {
    const id = `${k}${seq++}`;
    const n = { id, kind: k, x, y };
    if (k === 'cfg') n.cfg = src?.cfg ? { ...src.cfg } : { epochs: 3, imgsz: 640, batch: 4 };
    if (k === 'data') n.data = src?.data || null;
    if (k === 'base') n.base = src?.base || null;
    if (['train', 'eval', 'deploy'].includes(k)) n.run = null;      // 새로 놓은 학습 = 아직 돌지 않은 학습
    nodes[id] = n; picked = id; render(); return id;
  }
  const onKey = (e) => {
    if (!pane.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'Escape') { picked = null; from = null; render(); return; }
    if (!picked || !nodes[picked]) return;
    if (e.key === 'd' || e.key === 'D') { const n = nodes[picked]; addNode(n.kind, Math.min(n.x + 24, cv.clientWidth - W - 8), Math.min(n.y + 40, cv.clientHeight - 70), n); }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      for (let i = links.length - 1; i >= 0; i--) if (links[i].a === picked || links[i].b === picked) links.splice(i, 1);
      delete nodes[picked]; picked = null; render();
    }
  };
  document.addEventListener('keydown', onKey);

  /* 같은 종류가 둘 이상이면 이름 뒤 표(학습 A · B · 학습 데이터 1 · 2) */
  function label(n) {
    const same = Object.values(nodes).filter((m) => m.kind === n.kind);
    const b = h('b', { text: KIND[n.kind] });
    if (same.length > 1) b.append(h('em', { text: n.kind === 'train' ? String.fromCharCode(65 + same.indexOf(n)) : String(same.indexOf(n) + 1) }));
    return b;
  }
  const inputs = (id, kind) => links.filter((l) => l.b === id && !l.c && nodes[l.a]?.kind === kind).map((l) => nodes[l.a]);
  const upTrain = (n) => (n.kind === 'train' ? n : n.kind === 'eval' ? inputs(n.id, 'train')[0] : n.kind === 'deploy' ? upTrain(inputs(n.id, 'eval')[0] || {}) : null);

  /** 블록 한 장의 글(이름 아래 줄 · 수 · 꼬리표 · 진행 막대 · 상태) */
  function face(n) {
    const o = { line: '', num: '', tag: null, bar: null, cls: '' };
    if (n.kind === 'data') {
      if (n.data) o.line = [n.data.name, n.data.images != null ? `${nf(n.data.images)}장` : null].filter(Boolean).join(' · ');
      else { o.line = '학습 데이터를 고르세요'; o.cls = 'need'; }
    } else if (n.kind === 'base') {
      if (n.base) o.line = baseWord(n.base).long; else { o.line = '모델을 고르세요'; o.cls = 'need'; }
    } else if (n.kind === 'cfg') {
      o.line = `반복 ${n.cfg.epochs}회 · 크기 ${n.cfg.imgsz} · 한 번에 ${n.cfg.batch}장`;   // 뜻 덩어리 안에서 꺾이지 않게(규칙 9)
    } else if (n.kind === 'train') {
      const r = n.run;
      if (!r) { o.line = '시작 전 · 대기열'; o.cls = 'need'; }
      else if (r.state === 'running') { const k = liveEp(); o.line = `학습 중 · ${k} / ${v(r.epochs)}회`; o.bar = Math.round((k / Math.max(1, v(r.epochs))) * 100); o.cls = 'live'; o.tag = [`${mdhm(r.started_at)} 시작`, '']; }
      else if (r.state === 'queued') { o.line = '대기열에서 차례를 기다리는 중'; o.cls = 'live'; }
      else { o.num = r.acc ? `학습 끝 검증 ${pct(v(r.acc))}` : ''; o.line = `끝남 · ${mdhm(r.finished_at)} · ${v(r.epochs)}회`; }
    } else if (n.kind === 'eval') {
      const r = (upTrain(n) || {}).run;
      if (!r || LIVE.has(r.state)) o.line = '학습이 끝나면';
      else if (r.same) {
        o.line = pct(v(r.same.value));
        const b = r.same.base;
        if (b) { const d = v(r.same.value) - v(b.value); o.tag = [d < 0 ? `원판 ${pct(v(b.value))}보다 낮음` : d > 0 ? `원판 ${pct(v(b.value))}보다 높음` : `원판 ${pct(v(b.value))}와 같음`, d < 0 ? 'down' : d > 0 ? 'ok' : '']; }
      } else o.line = '—';
    } else if (n.kind === 'deploy') {
      const r = (upTrain(n) || {}).run;
      const [k, t] = r ? stateOf(r) : ['', ''];
      if (!r || LIVE.has(r.state)) { o.line = '추론 뒤에 켜져요'; o.cls = 'off'; }
      else if (k === 'ok') o.line = '서비스 중';
      else if (k === 'down') { o.line = '원판보다 낮아 꺼짐'; o.cls = 'off'; }
      else o.line = t === '지난 판' ? '지난 판' : '배포 신청으로';
    }
    return o;
  }

  /* ── 판 그리기 ── */
  function render() {
    cv.querySelectorAll('.tb-node,.tb-say').forEach((x) => x.remove());
    for (const n of Object.values(nodes)) {
      const f = face(n);
      const el = h('div.tb-node', { role: 'button', tabindex: '0', dataset: { id: n.id, kind: n.kind }, style: `left:${n.x}px;top:${n.y}px`,
        class: [f.cls, picked === n.id ? 'on' : ''].filter(Boolean).join(' ') });
      if (IN[n.kind]) el.append(h('i.tb-port.in', { 'aria-hidden': 'true' }));
      el.append(label(n));
      if (f.num) el.append(h('small.num', { text: f.num }));
      el.append(h('small', { text: f.line }));
      if (f.bar != null) el.append(h('div.tb-bar', {}, h('i', { style: `width:${f.bar}%` })));
      if (f.tag && f.tag[0]) el.append(h('span.tb-tag', { class: f.tag[1] || '', text: f.tag[0] }));
      if (n.kind !== 'deploy') el.append(h('i.tb-port', { class: from === n.id ? 'is-from' : '', 'aria-hidden': 'true', title: '이어 갈 블록 고르기' }));
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('tb-port') && !e.target.classList.contains('in')) { from = from === n.id ? null : n.id; render(); return; }
        if (from && from !== n.id) { connect(from, n.id); from = null; return; }
        if (from === n.id) { from = null; render(); say(n, '같은 블록끼리는 이을 수 없어요', true); return; }
        picked = picked === n.id ? null : n.id; render();
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
      cv.append(el);
    }
    drawWires(); drawSide();
  }
  function box(id) { const el = cv.querySelector(`.tb-node[data-id="${id}"]`); return { x: nodes[id].x, y: nodes[id].y, w: el ? el.offsetWidth : W, h: el ? el.offsetHeight : 60 }; }
  function drawWires() {
    wires.innerHTML = links.filter((l) => nodes[l.a] && nodes[l.b]).map((l) => {
      const a = box(l.a), b = box(l.b); const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2; const dx = Math.max(40, (x2 - x1) / 2);
      const run = nodes[l.b].kind === 'eval' ? nodes[l.a].run : null;
      const cls = l.c || (run && LIVE.has(run.state) ? 'live' : nodes[l.b].kind === 'deploy' && face(nodes[l.b]).cls === 'off' ? 'off' : '');
      return `<path class="${cls}" data-i="${links.indexOf(l)}" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`;
    }).join('');
    wires.querySelectorAll('path').forEach((p) => p.addEventListener('click', () => { links.splice(+p.dataset.i, 1); render(); }));
  }
  function connect(a, b) {
    const A = nodes[a], B = nodes[b];
    if (links.some((l) => l.a === a && l.b === b)) { render(); say(B, '이미 이어져 있어요'); return; }
    let why = null;
    if (A.kind === B.kind) why = '같은 블록끼리는 이을 수 없어요';
    else if (!(IN[B.kind] || []).includes(A.kind)) why = WHY[B.kind];
    else if ((ONE[B.kind] || []).includes(A.kind) && links.some((l) => l.b === b && nodes[l.a]?.kind === A.kind)) why = ONE_WHY[A.kind];
    if (why) {
      const L = { a, b, c: 'bad' }; links.push(L); B.bad = true; render(); cv.querySelector(`.tb-node[data-id="${b}"]`)?.classList.add('bad'); say(B, why, true);
      setTimeout(() => { const i = links.indexOf(L); if (i >= 0) links.splice(i, 1); delete B.bad; render(); }, 2800);
      return;
    }
    links.push({ a, b }); render();
  }
  function say(n, text, bad = false) {
    cv.querySelectorAll('.tb-say').forEach((s) => s.remove());
    if (!nodes[n.id]) return;
    const b = box(n.id);
    const el = h('div.tb-say', { class: bad ? 'bad' : '', role: 'status', text, style: `left:${Math.min(n.x, cv.clientWidth - 300)}px;top:${Math.min(n.y + b.h + 8, cv.clientHeight - 44)}px` });
    cv.append(el); setTimeout(() => el.remove(), 2800);
  }

  /* ── 서랍 — 고른 블록(닫으면 사라짐) ── */
  const opt = (on, title, sub, num, onClick) => {
    const b = h('button.tb-opt', { type: 'button', 'aria-pressed': String(!!on) }, h('i', { 'aria-hidden': 'true' }), h('span', {}, title, sub ? h('small', { text: sub }) : null), num ? h('span.n', { text: num }) : null);
    b.addEventListener('click', onClick); return b;
  };
  const kv = (rows) => h('div.tb-dkv', {}, ...rows.filter(Boolean).flatMap(([k, val, num]) => [h('b', { text: k }), h('span', { class: num ? 'num' : '', text: val })]));
  const seg = (vals, cur, word, onPick) => h('div.tb-seg', {}, ...vals.map((x) => h('button', { type: 'button', 'aria-pressed': String(x === cur), text: word(x), onclick: () => onPick(x) })));
  function drawSide() {
    const n = picked && nodes[picked];
    if (!n) { side.hidden = true; side.replaceChildren(); return; }
    side.hidden = false;
    const x = h('button.tb-x', { type: 'button', 'aria-label': '닫기', text: '×', onclick: () => { picked = null; render(); } });
    const head = h('h2', {}, ...label(n).childNodes);
    const out = [x, head];
    const back = () => render();
    if (n.kind === 'data') {
      out.push(h('p.tb-lab', { text: '학습 데이터' }));
      if (!DATA.length) out.push(h('p', { text: '아직 이 프로젝트 학습데이터가 없습니다 · 학습데이터 구축에서 올려 주세요' }), h('a.tb-dbtn', { href: stageHref(P, 'label'), text: '학습데이터 구축' }));
      for (const d of DATA) out.push(opt(n.data?.ref === d.ref, d.name || '학습 데이터',
        d.kind === 'edits' ? ''
          : d.kind === 'asset' && d.with != null ? `있는 칸 ${nf(d.with)}${d.without ? ` + 없는 칸 ${nf(d.without)}` : ''}` : d.day ? `${d.day} 올림` : '',
        d.images != null ? `${nf(d.images)}장` : '', () => { n.data = d; back(); }));
      if (SHARED.length) out.push(h('p.tb-lab', { text: '공유 데이터에서 고르기' }));
      for (const d of SHARED) out.push(opt(n.data?.ref === d.ref, d.name || '학습 데이터', d.day ? `${d.day} 올림` : '',
        d.images != null ? `${nf(d.images)}장` : '', () => { n.data = d; back(); }));
      out.push(h('p', { text: '다른 학습 데이터로 보려면 학습 데이터 블록과 학습 블록을 하나씩 더 놓아 이어요.' }));
    } else if (n.kind === 'base') {
      out.push(h('p.tb-lab', { text: '지금 있는 모델' }));
      for (const b of BASES) out.push(opt(n.base === b.id, b.name, b.sub, b.acc != null ? pct(b.acc) : '', () => { n.base = b.id; back(); }));
      out.push(h('p', { text: '기반 모델은 이미 배운 것을 품고 시작해요. 영상 해상도가 같은 모델이 좋아요. 둘을 나란히 보려면 학습 블록도 둘이어야 해요.' }));
    } else if (n.kind === 'cfg') {
      const c = n.cfg;
      const own = h('input', { type: 'number', min: '1', max: String(EPM), value: EPOCHS.includes(c.epochs) ? '' : String(c.epochs), 'aria-label': '반복 횟수 직접', placeholder: '직접' });
      own.addEventListener('change', () => { const k = Math.max(1, Math.min(EPM, Math.round(+own.value || 0))); if (k) { c.epochs = k; back(); } });
      const sg = seg(EPOCHS, c.epochs, (k) => `${k}회`, (k) => { c.epochs = k; back(); }); sg.append(own);
      out.push(h('p.tb-lab', { text: `반복 횟수 · 최대 ${EPM}회` }), sg);
      const per = cur && cur.state === 'done' && v(cur.took) && v(cur.epochs) ? v(cur.took) / v(cur.epochs) : null;
      if (per) out.push(h('p', { text: `많을수록 오래 걸려요 — 지난 학습은 한 번 반복에 약 ${dur(per)}이었어요.` }));
      out.push(h('p.tb-lab', { text: '이미지 크기' }), seg(SIZES, c.imgsz, String, (k) => { c.imgsz = k; back(); }),
        h('p.tb-lab', { text: '한 번에' }), seg(BATCH, c.batch, (k) => `${k}장`, (k) => { c.batch = k; back(); }),
        h('p', { style: 'margin-top:10px', text: '다른 설정으로 한 번 더 보려면 학습 설정 블록을 하나 더 놓고(D) 다른 학습에 이어요.' }));
    } else if (n.kind === 'train') {
      const r = n.run;
      if (!r) out.push(h('span.tb-verdict', { text: '시작 전' }), h('p', { style: 'margin-top:10px', text: '위 \'다시 돌리기\'를 누르면 이 블록에 이은 학습 데이터 · 기반 모델 · 학습 설정으로 대기열에 들어가요.' }));
      else if (LIVE.has(r.state)) out.push(h('span.tb-verdict', { text: r.state === 'queued' ? '대기열에서 기다리는 중' : `학습 중 · ${v(r.epochs)}회 중 ${liveEp()}회째` }),
        kv([['시작', mdhm(r.started_at || r.created_at), true], ['반복', `${v(r.epochs)}회`, true]]));
      else out.push(h('span.tb-verdict.ok', { text: `끝남 · ${mdhm(r.finished_at)}` }),
        kv([r.data?.images ? ['학습 데이터', `${nf(v(r.data.images))}장`, true] : null, ['기반 모델', baseWord(r.base?.id).long], ['설정', `반복 ${v(r.epochs)}회 · 크기 ${r.imgsz} · 한 번에 ${r.batch}장`],
          r.took ? ['걸린 시간', dur(v(r.took)), true] : null, r.acc ? ['학습 끝 검증', pct(v(r.acc)), true] : null]));
    } else if (n.kind === 'eval') {
      const r = (upTrain(n) || {}).run;
      if (!r || LIVE.has(r.state)) out.push(h('span.tb-verdict', { text: '학습이 끝나면 추론합니다' }));
      else if (!r.same) out.push(h('span.tb-verdict', { text: '추론 값 없음' }));
      else {
        const s = r.same, b = s.base, low = b && v(s.value) < v(b.value);
        out.push(h('span.tb-verdict', { class: low ? 'down' : b ? 'ok' : '', text: `${md(s.at)}${b ? ` · ${low ? '원판보다 낮음' : '원판보다 높거나 같음'}` : ''}` }),
          kv([['이 판', pct(v(s.value)), true], b ? ['원판', pct(v(b.value)), true] : null]));
      }
      out.push(h('a.tb-dbtn', { href: stageHref(P, 'infer'), text: '추론 열기' }));
    } else if (n.kind === 'deploy') {
      const r = (upTrain(n) || {}).run;
      const [k] = r ? stateOf(r) : [''];
      out.push(h('span.tb-verdict', { class: k === 'ok' ? 'ok' : k === 'down' ? 'down' : '', text: !r || LIVE.has(r.state) ? '추론이 끝나면 켜져요' : k === 'ok' ? '이 판이 서비스 중이에요' : k === 'down' ? '원판보다 낮아 꺼져 있어요' : '배포 신청할 수 있어요' }),
        h('p', { style: 'margin-top:10px', text: '배포 신청은 프로젝트 마지막 단계에서 해요. LX 관리자가 비교 값을 보고 승인해요.' }), h('a.tb-dbtn', { href: stageHref(P, 'publish'), text: '배포 신청 열기' }));
    }
    side.replaceChildren(...out);
  }

  /* ── ② 이번 학습 — 반복마다 정확도(학습 기록) + 핵심 수치 ── */
  let liveLog = cur && cur.log ? [...v(cur.log)] : [];
  function liveEp() { return liveLog.length; }
  function drawPerf() {
    const r = cur;
    const vals = (r ? liveLog : []).map((x) => x * 100);
    const N = r ? v(r.epochs) : 0;
    const head = h('div.tb-ph', {}, h('h2', { text: '이번 학습 · 반복마다 정확도' }));
    if (r) head.append(h('p', { text: [r.started_at ? `${mdhm(r.started_at)}${r.finished_at ? ` → ${mdhm(r.finished_at)}` : ''}` : '', `반복 ${N}회`].filter(Boolean).join(' · ') }));
    const bigV = r && r.state === 'done' && r.acc ? v(r.acc) : vals.length ? Math.round(vals[vals.length - 1]) : null;
    if (bigV != null) head.append(h('span.tb-big', {}, pct(bigV), h('small', { text: r.state === 'done' ? '학습 끝 검증' : '지금까지' })));
    if (vals.length < 2) {
      perf.replaceChildren(head, h('p.tb-nolog', { text: !r ? '학습을 시작하면 반복마다 정확도가 여기에 차오릅니다' : LIVE.has(r.state) ? (vals.length ? '두 번째 반복이 끝나면 선으로 그려집니다' : '첫 반복이 끝나면 여기에 그려집니다') : '이 학습은 반복마다 기록이 없습니다' }));
      return;
    }
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(2, (hi - lo) * 0.18); lo = Math.max(0, Math.floor(lo - pad)); hi = Math.min(100, Math.ceil(hi + pad));
    const Wd = 760, Hd = 220, L = 40, Rr = 48, Tp = 14, Bb = 26, pw = Wd - L - Rr, ph = Hd - Tp - Bb;
    const total = Math.max(N, vals.length);
    const X = (e) => L + (e - 1) / Math.max(1, total - 1) * pw, Y = (y) => Tp + (hi - y) / (hi - lo || 1) * ph;
    let g = '';
    for (let i = 0; i <= 4; i++) { const y = lo + (hi - lo) * i / 4; g += `<line class="tb-grid" x1="${L}" x2="${L + pw}" y1="${Y(y)}" y2="${Y(y)}"/><text class="tb-ax" x="${L - 6}" y="${Y(y) + 4}" text-anchor="end">${Math.round(y)}%</text>`; }
    const ticks = [...new Set([1, ...[0.25, 0.5, 0.75].map((f) => Math.round(total * f)), total])].filter((e) => e >= 1 && e <= total);
    for (const e of ticks) g += `<text class="tb-ax" x="${X(e)}" y="${Hd - 8}" text-anchor="middle">${e}회</text>`;
    const pts = vals.map((y, i) => [X(i + 1), Y(y)]);
    g += `<path class="tb-area" d="M${pts[0][0]},${Y(lo)} ${pts.map((p) => 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')} L${pts[pts.length - 1][0]},${Y(lo)} Z"/>`;
    g += `<path class="tb-ser" d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
    pts.slice(0, -1).forEach((p) => { g += `<circle class="tb-dotp" cx="${p[0]}" cy="${p[1]}" r="2"/>`; });
    const last = pts[pts.length - 1];
    g += `<circle class="tb-dot" cx="${last[0]}" cy="${last[1]}" r="4.5"/><text class="tb-lbl" x="${Math.min(last[0] + 8, Wd - 40)}" y="${last[1] - 6}">${Math.round(vals[vals.length - 1])}%</text>`;
    const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s2.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`); s2.setAttribute('preserveAspectRatio', 'none'); s2.setAttribute('role', 'img');
    s2.setAttribute('aria-label', `반복마다 정확도 — 1회 ${pct(vals[0])} → ${vals.length}회 ${pct(vals[vals.length - 1])}`);
    s2.innerHTML = g + `<line class="tb-cross" y1="${Tp}" y2="${Tp + ph}" style="display:none"/>`;
    const plot = h('div.tb-plot', {}, s2);
    const tip = h('div.tb-tip', { style: 'display:none' }); plot.append(tip);
    const cross = s2.querySelector('.tb-cross');
    s2.addEventListener('mousemove', (e) => {
      const rc = s2.getBoundingClientRect(); const xx = (e.clientX - rc.left) / rc.width * Wd; const ep = Math.round((xx - L) / pw * (total - 1)) + 1;
      if (ep < 1 || ep > vals.length) { tip.style.display = cross.style.display = 'none'; return; }
      cross.style.display = ''; cross.setAttribute('x1', X(ep)); cross.setAttribute('x2', X(ep));
      tip.textContent = `반복 ${ep}회 · ${(Math.round(vals[ep - 1] * 10) / 10).toLocaleString('ko-KR')}%`; tip.style.display = '';
      tip.style.left = Math.min(X(ep) / Wd * rc.width + 10, rc.width - 130) + 'px'; tip.style.top = (e.clientY - rc.top - 36) + 'px';
    });
    s2.addEventListener('mouseleave', () => { tip.style.display = cross.style.display = 'none'; });
    perf.replaceChildren(head, plot);
  }
  function drawKeys() {
    const r = cur;
    if (!r) { keys.replaceChildren(h('h2', { text: '핵심 수치' }), h('p.tb-foot', { text: '첫 학습이 끝나면 여기에 학습 데이터 · 설정 · 정확도가 보입니다' }), h('p.tb-gpu', { text: GPU_LINE })); return; }
    const [k, t] = stateOf(r);
    const short = k === 'down' ? '끝남 · 후보로 남음' : k === 'live' ? t : r.state === 'done' && k !== 'ok' ? `끝남 · ${t}` : t;
    const s = r.same, b = s?.base;
    const rows = [
      ['학습 데이터', r.data?.images ? `${nf(v(r.data.images))}장` : '—', 'num'],
      ['기반 모델', baseWord(r.base?.id).long, 'txt'],
      ['반복 · 크기 · 한 번에', `${v(r.epochs)}회 · ${r.imgsz} · ${r.batch}장`, 'num'],
      [r.state === 'done' ? '학습 끝 검증' : '지금까지', r.state === 'done' ? pct(v(r.acc)) : liveLog.length ? pct(liveLog[liveLog.length - 1] * 100) : '—', 'num'],
      ['추론', s ? `${pct(v(s.value))}${b ? ` (원판 ${pct(v(b.value))})` : ''}` : r.state === 'done' ? '—' : '끝나면', `num${s && b && v(s.value) < v(b.value) ? ' down' : ''}`],
      [r.state === 'done' ? '걸린 시간' : '시작', r.state === 'done' ? (r.took ? dur(v(r.took)) : '—') : mdhm(r.started_at || r.created_at), 'num'],
    ];
    keys.replaceChildren(h('h2', {}, '핵심 수치', h('span.tb-st', { class: k, text: short })),
      h('div.tb-kv', {}, ...rows.flatMap(([a, b2, c]) => [h('span', {}, h('b', { text: a })), h('span', { class: c, text: b2 })])),
      h('p.tb-gpu', { text: GPU_LINE }));
  }
  /* ── ③ 학습 이력 ── */
  function drawHist() {
    const rows = runs.map((r, i) => {
      const [k, t] = stateOf(r);
      const how = [r.base?.id ? `${baseWord(r.base.id).short}${r.base.root ? '에서' : '에서 이어서'}` : '', `반복 ${v(r.epochs)}회`, `크기 ${r.imgsz}`].filter(Boolean).join(' · ');
      return h('tr', { class: i === 0 ? 'is-now' : '' },
        h('td.num', { text: md(r.finished_at || r.started_at || r.created_at) }),
        h('td', {}, nameOf.get(r.job), h('small', { text: how })),
        h('td.num', {}, h('b', { text: r.acc ? pct(v(r.acc)) : '—' }), i === 0 && r.same ? h('small', { text: `추론 ${pct(v(r.same.value))}` }) : null),
        h('td.num', { text: r.data?.images ? `${nf(v(r.data.images))}장` : '—' }),
        h('td', {}, h('span.tb-st', { class: k, text: t })));
    });
    if (base0) rows.push(h('tr', {}, h('td.num', { text: md(base0.day) }), h('td', {}, '원판', h('small', { text: `${clsWords(base0.classes).join(' · ')} ${clsWords(base0.classes).length}종 모델` })),
      h('td.num', {}, h('b', { text: base0.acc ? pct(v(base0.acc)) : '—' })), h('td.num', { text: '—' }),
      h('td', {}, base0.id === serving ? h('span.tb-st.ok', { text: '서비스 중' }) : null, base0.id === serving ? ' ' : null, h('span.tb-st.base', { text: '기반 모델' }))));   // 공개 서비스가 원판을 쓰면 '서비스 중'(분석하기 카드와 같은 규칙)
    hist.replaceChildren(h('h2', {}, '학습 이력', h('small', { text: '최근 순' })),
      rows.length ? h('div.tb-tbl-w', {}, h('table.tb-tbl', {}, h('thead', {}, h('tr', {}, ...[['날짜', ''], ['판', ''], ['AI 모델 정확도', 'num'], ['학습 데이터', 'num'], ['상태', '']].map(([a, c]) => h('th', { class: c, text: a })))),
        h('tbody', {}, ...rows))) : h('p.tb-foot', { text: '아직 학습 기록이 없습니다' }));
  }

  /* ── 시작 · 멈추기 ── */
  function plan() {
    const trains = Object.values(nodes).filter((n) => n.kind === 'train');
    const out = [], bad = [];
    for (const t of trains) {
      if (t.run && LIVE.has(t.run.state)) continue;
      const d = inputs(t.id, 'data')[0], b = inputs(t.id, 'base')[0], c = inputs(t.id, 'cfg')[0];
      const miss = !d ? '학습 데이터 블록을 이어 주세요' : !d.data ? '학습 데이터 블록에서 데이터를 골라 주세요'
        : d.data.kind === 'edits' ? '수정된 부분은 XI 재학습에서 학습합니다' : !b ? '기반 모델 블록을 이어 주세요'
        : !b.base ? '기반 모델 블록에서 모델을 골라 주세요' : !c ? '학습 설정 블록을 이어 주세요' : null;
      if (miss) bad.push([t, miss]); else out.push({ t, d: d.data, b: b.base, c: c.cfg });
    }
    return { out, bad };
  }
  function start() {
    const { out, bad } = plan();
    if (bad.length) { picked = null; render(); say(bad[0][0], bad[0][1], true); return; }
    if (!out.length) { toast('돌릴 학습 블록이 없습니다'); return; }
    const okB = h('button.t-btn', { type: 'button', text: out.length > 1 ? `학습 ${out.length}건 시작` : '학습 시작' });
    const no = h('button.t-btn.t-btn--text', { type: 'button', text: '취소' });
    const body = h('div.tb-md', {},
      h('p', { text: '대기열에 들어가 차례가 오면 돌아요. 끝나면 이 화면 이력에 쌓이고, 배포는 LX 관리자 승인 뒤 바뀝니다.' }),
      h('ul', {}, ...out.map((x) => h('li', {}, `${x.d.name || '학습 데이터'}${x.d.images != null ? ` ${nf(x.d.images)}장` : ''} · ${baseWord(x.b).long}`,
        h('small', { text: `반복 ${x.c.epochs}회 · 크기 ${x.c.imgsz} · 한 번에 ${x.c.batch}장` })))),
      h('div.tb-md-act', {}, no, okB));
    const m = modal({ title: '학습을 시작할까요', body });
    no.addEventListener('click', () => m.close());
    okB.addEventListener('click', async () => {
      okB.disabled = true;
      let n = 0, why = '';
      for (const x of out) {
        const req = { kind: 'train', base_model: x.b, samples: [x.d.ref], options: { epochs: x.c.epochs, imgsz: x.c.imgsz, batch: x.c.batch, project_id: P.id, task_name: P.task || undefined },
          label: `학습 · ${P.task || P.name}` };
        try {
          const q = await api('/jobs/quote', { method: 'POST', body: req });
          if (q && q.allowed === false) { why = (q.reasons || []).some((r) => (r?.code || r) === 'power_budget') ? '지금 다른 학습이 돌고 있어 시작할 수 없습니다 · 끝난 뒤 다시 해 주세요' : '지금은 학습을 시작할 수 없습니다'; break; }
          await api('/jobs', { method: 'POST', body: req }); n++;
        } catch (e) { why = e?.message || '지금은 학습을 시작할 수 없습니다'; break; }
      }
      m.close(true);
      if (n) { toast(n > 1 ? `학습 ${n}건을 대기열에 넣었습니다` : '학습을 대기열에 넣었습니다'); setTimeout(() => location.reload(), 900); }
      if (why) toast(why, { ms: 8000 });
    });
  }
  function stop() {
    const okB = h('button.t-btn', { type: 'button', text: '멈추기' });
    const no = h('button.t-btn.t-btn--text', { type: 'button', text: '계속 두기' });
    const m = modal({ title: '이 학습을 멈출까요', body: h('div.tb-md', {}, h('p', { text: '멈추면 지금까지 반복한 결과는 모델로 남지 않습니다.' }), h('div.tb-md-act', {}, no, okB)) });
    no.addEventListener('click', () => m.close());
    okB.addEventListener('click', async () => {
      okB.disabled = true;
      try { await api(`/jobs/${encodeURIComponent(cur.job)}/cancel`, { method: 'POST' }); m.close(true); toast('학습을 멈췄습니다'); setTimeout(() => location.reload(), 600); }
      catch (e) { m.close(true); toast(e?.message || '멈추지 못했습니다'); }
    });
  }

  /* 도는 학습 — 반복마다 값이 오면 그래프가 차오른다(작업 사건 흐름) */
  if (live && cur.events_url) {
    const s = sse(cur.events_url, {
      events: [...JOB_EVENTS, 'train.epoch'],                 // 반복마다 값(train.epoch)은 기본 작업 사건 목록에 없다 — 따로 듣는다
      on: (name, d) => {
        if (name === 'job.started' && cur.state === 'queued') { cur.state = 'running'; render(); drawKeys(); }
        if (name === 'train.epoch' && d && d.epoch > 0 && d.map50 != null) {
          cur.state = 'running';
          liveLog[d.epoch - 1] = +d.map50; liveLog = liveLog.filter((x) => x != null);
          render(); drawPerf(); drawKeys();
        }
        if (name === 'job.done' || name === 'job.failed' || name === 'job.cancelled') { s.close(); setTimeout(() => location.reload(), 800); }
      },
    });
  }

  render(); drawPerf(); drawKeys(); drawHist();
  /* 판 글꼴 · 스타일이 늦게 붙으면 블록 크기가 바뀐다 — 선을 다시 긋는다(블록 자리는 그대로) */
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (cv.isConnected) drawWires(); }).observe(cv);
  document.fonts?.ready?.then(() => { if (cv.isConnected) drawWires(); });
  document.documentElement.dataset.trainBoard = '1';
}
