/* flow.js — LX 생산 원스톱(r3-train · C5): 데이터 올리기 → 라벨 확인 → 학습 → 결과 확인·등록 → 서비스 만들기 → 다른 지역에 적용.
   기능이 보이는 최소 화면(디자인 판단은 Fable). 숫자는 서버 응답 봉투에서만(표본 수·클래스별 개수 = 올린 파일에서 센 값,
   성능 = 학습 끝 검증값). 화면 글에 파일 경로·작업 번호·GPU 이름 0. 상태는 URL(?flow=1&sample=&job=&model=&card=)에 남아 새로고침해도 이어진다.
   서버: /training/samples(올리기·미리보기·빼기) · /jobs/quote → /jobs {kind:'train'} · /events/jobs/{id} · /registry/models ·
         /registry/model-register · /registry/model-decide(관리자) · /survey/rules · /registry/ledger_kinds · /registry/cards */
import { drawer } from '../kit/panel.js';
import { toast } from '../kit/toast.js';
import { devlog } from '../kit/dev-drawer.js';
import { regionPicker } from '../kit/region.js';
import { nf } from '../kit/i18n.js';
import { sig } from '../kit/sig.js';
import { h, esc, api, API, session, isEnvelope } from '../kit/util.js';
import { sse, JOB_EVENTS } from '../../shared/api-v1.js';

const V3 = '/landxi/v3/';
const val = (e) => (isEnvelope(e) ? e.value : e);
const num = (e, d = 0) => (val(e) == null ? '—' : `<span class="num">${nf(val(e), d)}</span>${sig(e)}`);
const perf = (m) => {
  const k = Object.keys(m?.metrics || {});
  const key = ['metrics/mAP50(M)', 'metrics/mAP50(B)', 'mask_mAP50', 'box_mAP50', 'mAP50'].find((x) => k.includes(x));
  return key ? m.metrics[key] : null;
};
const gsdWord = (g) => (g == null ? '' : g < 0.1 ? `${+(g * 100).toFixed(1)}cm 드론` : `${Math.round(g * 100)}cm 항공`);
const CLS_KO = { vehicle: '차량', building: '건물', parking: '주차장', cropland: '경작지', greenhouse: '비닐하우스' };
const clsWord = (c) => CLS_KO[String(c).toLowerCase()] || String(c).split('_')[0];
const baseName = (m) => m.name || [gsdWord(m.gsd_trained_m), [...new Set((m.classes || []).map(clsWord))].slice(0, 4).join('·')].filter(Boolean).join(' · ');
const MB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const IMG_RE = /\.(jpe?g|png|tiff?|bmp)$/;
const MAX_IMAGES = 200;

/** zip 목차(끝부분 중앙 디렉터리)만 읽어 그림·라벨·클래스 이름 파일을 센다 — 올리기 전에 거절 사유를 알린다(파일 전체를 읽지 않음).
    ZIP64 · 읽기 실패면 null(서버가 판정). */
async function zipPeek(file) {
  try {
    const tl = Math.min(file.size, 65557);
    const tail = new DataView(await file.slice(file.size - tl).arrayBuffer());
    let e = -1;
    for (let i = tl - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return { bad: true };
    const n = tail.getUint16(e + 10, true), size = tail.getUint32(e + 12, true), off = tail.getUint32(e + 16, true);
    if (n === 0xffff || off === 0xffffffff || size === 0xffffffff) return null;
    if (off + size > file.size) return { bad: true };
    const cd = await file.slice(off, off + size).arrayBuffer();
    const v = new DataView(cd), dec = new TextDecoder('utf-8');
    let p = 0, images = 0, labels = 0, names = false;
    for (let k = 0; k < n && p + 46 <= cd.byteLength; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const fl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      const low = dec.decode(new Uint8Array(cd, p + 46, fl)).replace(/\\/g, '/').toLowerCase();
      if (!low.endsWith('/') && !low.startsWith('__macosx')) {
        const parts = low.split('/');
        if (parts.includes('images') && IMG_RE.test(low)) images++;
        else if (parts.includes('labels') && low.endsWith('.txt') && !low.endsWith('classes.txt')) labels++;
        else if (/\.ya?ml$/.test(low) || low.endsWith('classes.txt')) names = true;
      }
      p += 46 + fl + xl + cl;
    }
    return { images, labels, names };
  } catch { return null; }
}

function setQ(patch) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(patch)) (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  history.replaceState(history.state, '', u.pathname + u.search + u.hash);
}
const Q = () => new URLSearchParams(location.search);

async function authBlob(path) {
  const s = session.get();
  const r = await fetch(API.prefix + path, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
  if (!r.ok) throw Object.assign(new Error('preview'), { status: r.status });
  return URL.createObjectURL(await r.blob());
}

/** 원스톱 서랍 — host = 학습 판 · who = 관문 결과(역할) */
export function openFlow({ host, who }) {
  const isAdmin = who?.me?.role === 'admin';
  const body = h('div.tf');
  const d = drawer({ title: '새 모델 만들기', body, host, slot: 'right', label: '새 모델 만들기',
    onClose: () => { closed = true; stream?.close(); setQ({ flow: null, sample: null, job: null, model: null, card: null }); } });
  d.el.classList.add('tf-drawer');
  let closed = false, stream = null;
  setQ({ flow: '1' });

  const sec = (n, title) => {
    const s = h('section.tf-s', { dataset: { step: n } }, h('h3.tf-h', {}, h('b', { text: String(n) }), h('span', { text: title })), h('div.tf-b'));
    body.append(s);
    return s.querySelector('.tf-b');
  };
  const s1 = sec(1, '데이터 올리기');
  const s2 = sec(2, '라벨 확인');
  const s3 = sec(3, '학습');
  const s4 = sec(4, '결과 확인 · 등록');
  const s5 = sec(5, '서비스 만들기');
  const lock = (el, on) => el.closest('.tf-s').classList.toggle('is-lock', on);
  [s2, s3, s4, s5].forEach((x) => lock(x, true));

  let sample = null, model = null, card = null;

  /* ── ① 데이터 올리기 ───────────────────────────── */
  const task = h('input.t-input', { type: 'text', name: 'task', placeholder: '업무 이름 (예: 비닐하우스)', maxlength: '40', 'aria-label': '업무 이름' });
  const regEl = h('div.tf-reg');
  const file = h('input.tf-file', { type: 'file', accept: '.zip,application/zip', 'aria-label': '라벨 표본 묶음(zip)' });
  const up = h('button.t-btn', { type: 'button', text: '올리기', disabled: true });
  const upBar = h('div.t-progress.tf-bar', { hidden: true, role: 'progressbar', 'aria-label': '올리기 진행', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i'));
  const upMsg = h('p.t-label.tf-msg', { role: 'status', 'aria-live': 'polite' });
  const prev = h('select.t-input', { 'aria-label': '올린 표본', hidden: true });
  let region = null, LIMIT = 400 * 1048576;
  s1.append(h('label.t-label', { text: '업무' }), task, h('label.t-label', { text: '표본 지역(선택)' }), regEl,
    h('label.t-label', { text: '라벨 표본 묶음(zip · 그림 200장 이하)' }), file, h('div.tf-act', {}, up), upBar, upMsg, prev);
  regionPicker(regEl, { onPick: (r) => { region = r; } });
  const say1 = (t, lv = '') => { upMsg.textContent = t; upMsg.dataset.lv = lv; };
  let bad = false;
  const ready = () => { up.disabled = bad || !(task.value.trim() && file.files?.length); };
  task.addEventListener('input', ready);
  /* 파일을 고르면 바로 목차를 본다 — 200장 초과·라벨 없음·클래스 이름 없음은 올리기 전에 알린다 */
  file.addEventListener('change', async () => {
    bad = false; upBar.hidden = true; up.textContent = '올리기';
    const f = file.files?.[0];
    if (!f) { say1(''); ready(); return; }
    if (f.size > LIMIT) { bad = true; say1(`묶음이 ${MB(f.size)} MB 입니다 — ${MB(LIMIT)} MB 이하로 나눠 묶어 주세요`, 'warn'); ready(); return; }
    const pk = await zipPeek(f);
    const why = !pk ? null : pk.bad ? 'zip 파일을 열 수 없습니다' : !pk.images ? '그림(images 폴더)이 없습니다'
      : !pk.labels ? '라벨(labels 폴더)이 없습니다' : pk.images > MAX_IMAGES ? `그림이 ${nf(pk.images)}장입니다 — 작은 표본은 ${MAX_IMAGES}장 이하입니다`
        : !pk.names ? '클래스 이름(dataset.yaml)이 없습니다' : null;
    bad = !!why;
    say1(why || (pk ? `${MB(f.size)} MB · 그림 ${nf(pk.images)}장` : `${MB(f.size)} MB`), why ? 'warn' : '');
    ready();
  });

  /** 나눠 올리기 — 조각마다 한 요청(바깥 주소 앞단의 요청 한 번 100초 한도 · 한 번에 올리면 큰 묶음이 끊겼다).
      조각 크기는 잰 속도로 약 30초 분량(256 KB–8 MB). 끊기면 받은 자리부터 이어 간다(같은 파일을 다시 골라도). */
  async function sendChunked(f, body, onProg) {
    const tok = session.get()?.token;
    const st = await api('/training/uploads', { method: 'POST', body: { ...body, filename: f.name, size: f.size, key: `${f.name}|${f.size}|${f.lastModified}` } });
    LIMIT = st.limit?.size || LIMIT;
    const maxC = st.chunk?.max?.size || 8 * 1048576;
    let off = st.bytes || 0, chunk = Math.min(maxC, 512 * 1024), fails = 0;
    const t0 = performance.now(), off0 = off;
    onProg(off, f.size, null);
    while (off < f.size) {
      const end = Math.min(f.size, off + chunk);
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 95000);
      const ts = performance.now();
      let r = null;
      try {
        r = await fetch(API.prefix + `/training/uploads/${encodeURIComponent(st.id)}?offset=${off}`, { method: 'PUT', body: f.slice(off, end), signal: ac.signal,
          headers: { 'content-type': 'application/octet-stream', ...(tok ? { authorization: 'Bearer ' + tok } : {}) } });
      } catch { r = null; }
      clearTimeout(timer);
      const j = r ? await r.json().catch(() => null) : null;
      if (r && r.ok && j) {
        const sec = Math.max(0.2, (performance.now() - ts) / 1000);
        chunk = Math.max(256 * 1024, Math.min(maxC, Math.round(((j.bytes - off) / sec) * 30)));   // 다음 조각 ≈ 30초 분량
        off = j.bytes; fails = 0;
      } else if (r && r.status === 409 && j?.error?.detail?.bytes != null) {
        off = j.error.detail.bytes;                                        // 서버가 받은 자리부터
      } else if (r && [400, 401, 403, 404, 413].includes(r.status)) {
        throw Object.assign(new Error(j?.error?.message || 'upload'), { user: r.status === 401 ? '로그인이 끝났습니다 — 다시 로그인해 주세요' : j?.error?.message });
      } else {
        fails++; chunk = Math.max(256 * 1024, Math.round(chunk / 2));
        devlog('upload', `조각 실패 ${fails} · ${r ? r.status : '연결 끊김'} · 다음 조각 ${MB(chunk)} MB`);
        if (fails > 5) throw Object.assign(new Error('network'), { user: `연결이 여러 번 끊겨 멈췄습니다 — ${MB(f.size)} MB 중 ${MB(off)} MB 올림. 다시 누르면 이어서 올립니다` });
        await wait(1500 * fails);
      }
      const bps = (off - off0) / Math.max(0.5, (performance.now() - t0) / 1000);
      onProg(off, f.size, bps > 0 ? (f.size - off) / bps : null);
    }
    return api(`/training/uploads/${encodeURIComponent(st.id)}/finish`, { method: 'POST', body: {} });
  }
  const left = (s) => (s == null ? '' : s < 60 ? ` · 남은 시간 ${Math.max(1, Math.round(s))}초` : ` · 남은 시간 약 ${Math.round(s / 60)}분`);
  up.addEventListener('click', async () => {
    const f = file.files[0];
    up.disabled = true; upBar.hidden = false; upBar.querySelector('i').style.width = '2%';
    say1('올리는 중');
    try {
      const j = await sendChunked(f, { task_name: task.value.trim(), ...(region?.sgg_cd ? { region: region.sgg_cd } : {}) }, (done, total, sec) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        upBar.querySelector('i').style.width = Math.max(2, pct) + '%'; upBar.setAttribute('aria-valuenow', String(pct));
        say1(done >= total ? '다 올렸습니다 — 묶음을 풀어 검사하는 중' : `올리는 중 ${MB(done)} / ${MB(total)} MB${left(sec)}`);
      });
      say1(''); upBar.hidden = true; up.textContent = '올리기';
      toast('표본을 올렸습니다');
      showSample(j);
    } catch (e) {
      devlog('sample', `${e.code || ''} ${e.message}`);
      say1(e.user || (['too_large', 'bad_request', 'forbidden'].includes(e.code) ? e.message : '올리지 못했습니다 — 다시 누르면 이어서 올립니다'), 'warn');
      up.textContent = '이어 올리기';
      ready();
    }
  });
  /* 이전에 올린 표본 이어 쓰기 */
  api('/training/samples').then((j) => {
    const items = j?.items || [];
    if (!items.length) return;
    prev.hidden = false;
    prev.innerHTML = '<option value="">이전에 올린 표본 이어 쓰기</option>' + items.map((x) =>
      `<option value="${esc(x.id)}">${esc(x.task_name)}${x.region_name ? ' · ' + esc(x.region_name) : ''} · ${nf(val(x.images))}장 · ${esc(String(x.created_at || '').slice(0, 10).replace(/-/g, '.'))}</option>`).join('');
    prev.addEventListener('change', async () => { if (prev.value) showSample(await api('/training/samples/' + prev.value)); });
  }).catch(() => {});

  /* ── ② 라벨 확인 ─────────────────────────────── */
  const PAGE = 9;
  let shown = 0;
  function showSample(j) {
    sample = j;
    setQ({ sample: j.id });
    lock(s2, false); lock(s3, false);
    s1.closest('.tf-s').classList.add('is-done');
    const ex = new Set((j.excluded || []).map((x) => x.index));
    s2.innerHTML = '';
    const head = h('p.tf-sum', { html: `<b>${esc(j.task_name)}</b>${j.region_name ? ' · ' + esc(j.region_name) : ''} · 그림 ${num(j.images)}장 (학습 ${num(j.train)} · 검증 ${num(j.val)})` + (ex.size ? ` · 뺀 그림 ${nf(ex.size)}` : '') });
    const tbl = h('table.tf-cls', { 'aria-label': '클래스별 개수' });
    tbl.innerHTML = '<thead><tr><th>클래스</th><th>객체</th><th>그림</th></tr></thead><tbody>'
      + (j.classes || []).map((c) => `<tr><td>${esc(c.name)}</td><td>${num(c.objects)}</td><td>${num(c.images)}</td></tr>`).join('') + '</tbody>';
    const grid = h('div.tf-grid');
    const more = h('button.t-btn.t-btn--text', { type: 'button', text: '더 보기' });
    const total = (val(j.images) || 0) + ex.size;
    shown = 0;
    const page = () => {
      const to = Math.min(total, shown + PAGE);
      for (let i = shown; i < to; i++) grid.append(tile(i, ex.has(i)));
      shown = to; more.hidden = shown >= total;
    };
    s2.append(head, tbl, grid, more);
    more.addEventListener('click', page);
    page();
    buildTrain();
  }
  function tile(i, off) {
    const img = h('img', { alt: `표본 그림 ${i + 1}`, decoding: 'async' });
    const b = h('button.tf-x', { type: 'button', text: off ? '다시 넣기' : '빼기' });
    const t = h('figure.tf-t', { dataset: { off: off ? '1' : '' } }, img, b);
    authBlob(`/training/samples/${sample.id}/preview/${i}?size=384`).then((u) => { img.src = u; }).catch(() => { t.dataset.fail = '1'; });
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const j = await api(`/training/samples/${sample.id}/exclude`, { method: 'POST', body: { images: [i], restore: !!t.dataset.off } });
        showSample(j);
      } catch (e) { devlog('exclude', e.code || e.message); toast(e.message || '지금은 뺄 수 없습니다'); b.disabled = false; }
    });
    return t;
  }

  /* ── ③ 학습 ──────────────────────────────────── */
  const baseSel = h('select.t-input', { 'aria-label': '기반 모델' });
  const go = h('button.t-btn', { type: 'button', text: '학습 실행' });
  const bar = h('div.t-progress.tf-bar', { hidden: true, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i'));
  const trMsg = h('p.t-label.tf-msg', { role: 'status', 'aria-live': 'polite' });
  const epochs = h('ol.tf-ep');
  let MODELS = [];
  /** 모델 목록 — 게이트웨이가 잠깐 끊겨도(502 · 재기동) 두 번 더 불러 본다. 그래도 안 되면 예외(부른 쪽이 안내 + 다시 시도) */
  async function loadModels() {
    let last;
    for (let i = 0; i < 3; i++) {
      try { MODELS = (await api('/registry/models?with=train'))?.items || []; return MODELS; }
      catch (e) { last = e; devlog('models', `${e.code || e.status || ''} ${e.message}`); if (i < 2) await wait(1500 * (i + 1)); }
    }
    throw last;
  }
  const retryBtn = (fn) => { const b = h('button.t-btn.t-btn--2', { type: 'button', text: '다시 시도' }); b.addEventListener('click', fn); return b; };
  /** 기반 모델 기본값 — 업무 이름을 클래스로 가진 원 모델(재학습본 아님) → 없으면 전국 등록 영상과 같은 항공 25cm 원 분할 모델 */
  function pickBase() {
    const t = (sample?.task_name || '').trim();
    const opts = [...baseSel.options].map((o) => MODELS.find((m) => m.id === o.value)).filter(Boolean);
    const hasTask = (m) => !!t && (m.classes || []).some((c) => clsWord(c) === t);
    const gap = (m) => Math.abs(Math.log((m.gsd_trained_m || 1) / 0.25));
    const best = [...opts].sort((a, b) => (hasTask(b) - hasTask(a)) || (!a.train_job - !b.train_job) * -1 || gap(a) - gap(b) || (a.task === 'seg' ? -1 : 1))[0];
    if (best) baseSel.value = best.id;
  }
  async function buildTrain() {
    if (s3.childElementCount) { pickBase(); return; }
    s3.append(h('label.t-label', { text: '기반 모델' }), baseSel, h('p.t-label.tf-note', { text: '작은 표본 · 3회차 · 한 번에 한 건(대기열)' }), h('div.tf-act', {}, go), bar, trMsg, epochs);
    let all = [];
    try { all = await loadModels(); } catch { trMsg.textContent = '모델 목록을 불러오지 못했습니다'; trMsg.dataset.lv = 'warn'; trMsg.after(retryBtn(() => { s3.innerHTML = ''; buildTrain(); })); return; }
    const ms = all.filter((m) => ['seg', 'det', 'obb'].includes(m.task) && m.status === 'registered' && m.weights_uri !== null);
    /* 같은 이름(같은 날 재학습)은 만든 시각으로 가른다 — 목록에 같은 글자 0 */
    const seen = {}, nth = new Map();
    for (const m of ms) { const n = baseName(m); seen[n] = (seen[n] || 0) + 1; nth.set(m.id, seen[n]); }
    const two = (x) => String(x).padStart(2, '0');
    const when = (s) => { const d = new Date(s); return isNaN(d) ? '' : `${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };
    const label = (m) => { const n = baseName(m); return seen[n] > 1 ? `${n} · ${m.created_at ? when(m.created_at) : nth.get(m.id) + '번째'}` : n; };
    ms.sort((a, b) => (!!a.train_job - !!b.train_job) || label(a).localeCompare(label(b), 'ko'));
    baseSel.innerHTML = ms.map((m) => `<option value="${esc(m.id)}">${esc(label(m))}</option>`).join('');
    pickBase();
  }
  go.addEventListener('click', async () => {
    if (!sample) return;
    const body = { kind: 'train', base_model: baseSel.value, samples: [sample.id], region: sample.sgg_cd || undefined,
      options: { epochs: 3, batch: 4, imgsz: 640 }, label: `학습 · ${sample.task_name}` };
    go.disabled = true; trMsg.dataset.lv = ''; trMsg.textContent = '대기열에 넣는 중';
    try {
      const q = await api('/jobs/quote', { method: 'POST', body });
      if (q?.allowed === false) throw Object.assign(new Error('quote'), { reasons: q.reasons });
      const j = await api('/jobs', { method: 'POST', body });
      const job = j.job || j;
      setQ({ job: job.id });
      toast('학습을 대기열에 넣었습니다');
      track(job.id);
    } catch (e) {
      devlog('train', e.code || e.message);
      const pw = e.code === 'power_budget' || (e.reasons || e.detail?.reasons || []).includes('power_budget');
      trMsg.textContent = pw ? '다른 학습이 도는 중입니다 — 끝난 뒤 다시 실행하세요' : '지금은 학습을 시작할 수 없습니다';
      trMsg.dataset.lv = 'warn'; go.disabled = false;
    }
  });
  function track(jobId) {
    go.disabled = true; bar.hidden = false; bar.querySelector('i').style.width = '4%';
    let queued = true;
    const pos = async () => {
      if (!queued || closed) return;
      const l = await api('/jobs?state=queued&limit=200').catch(() => null);
      const qs = (l?.items || []).sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.created_at).localeCompare(String(b.created_at)));
      const i = qs.findIndex((x) => x.id === jobId);
      if (queued) trMsg.textContent = i >= 0 ? `대기 ${nf(i + 1)}번째` : '학습 준비 중';
      if (queued) setTimeout(pos, 3000);
    };
    pos();
    const seen = new Set();
    stream?.close();
    stream = sse('/events/jobs/' + jobId, {
      events: [...JOB_EVENTS, 'train.epoch', 'train.hold', 'train.resume'],
      on: async (name, x) => {
        if (name === 'job.started' || name === 'shard.started') { queued = false; trMsg.textContent = '학습 중'; }
        if (name === 'train.hold') trMsg.textContent = '다른 GPU 사용이 끝날 때까지 잠시 멈춤';
        if (name === 'train.resume') trMsg.textContent = '학습 중';
        if (name === 'train.epoch' && x) {
          queued = false;
          const n = x.epochs || 3;
          bar.querySelector('i').style.width = Math.max(4, ((x.epoch || 0) / n) * 100) + '%';
          bar.setAttribute('aria-valuenow', String(Math.round(((x.epoch || 0) / n) * 100)));
          if (x.epoch > 0 && !seen.has(x.epoch)) {
            seen.add(x.epoch);
            epochs.append(h('li', { html: `<span class="num">${x.epoch}/${n}</span> 회차 · 검증 성능 <span class="num">${x.map50 == null ? '—' : nf(x.map50, 3)}</span>` }));
          }
          trMsg.textContent = x.epoch > 0 ? `${x.epoch}/${n} 회차 끝` : `0/${n} 회차 · 시작`;
        }
        if (name === 'job.done') {
          stream?.close(); queued = false;
          bar.querySelector('i').style.width = '100%';
          trMsg.textContent = '학습 끝';
          s3.closest('.tf-s').classList.add('is-done');
          if (x?.model_id) showModel(x.model_id);
          else showModelOfJob(jobId);
        }
        if (name === 'job.failed' || name === 'job.cancelled') {
          stream?.close(); queued = false;
          trMsg.textContent = '학습이 끝나지 못했습니다'; trMsg.dataset.lv = 'warn'; go.disabled = false; bar.hidden = true;
          devlog('train failed', x?.error || name);
        }
      },
    });
  }

  /* ── ④ 결과 확인 · 등록 ────────────────────────── */
  /** 학습 작업 → 그 작업이 만든 모델(작업 끝 이벤트에 모델 id 가 없을 때 · 마무리가 조금 늦게 끝나도 몇 번 더 찾는다) */
  async function showModelOfJob(jobId, tries = 0) {
    lock(s4, false);
    let ms = null;
    try { ms = await loadModels(); } catch { /* 아래 안내 */ }
    const m = ms?.find((x) => x.train_job === jobId);
    if (m) return showModel(m.id);
    if (tries < 4) { s4.textContent = '결과를 불러오는 중'; setTimeout(() => showModelOfJob(jobId, tries + 1), 3000); return; }
    s4.innerHTML = '';
    s4.append(h('p.t-label.tf-msg', { dataset: { lv: 'warn' }, text: '학습 결과를 불러오지 못했습니다' }), retryBtn(() => showModelOfJob(jobId)));
  }
  async function showModel(mid) {
    setQ({ model: mid });
    lock(s4, false);
    let ms;
    try { ms = await loadModels(); }
    catch {
      s4.innerHTML = '';
      s4.append(h('p.t-label.tf-msg', { dataset: { lv: 'warn' }, text: '결과를 불러오지 못했습니다 — 잠시 뒤 다시 시도하세요' }), retryBtn(() => showModel(mid)));
      return;
    }
    model = ms.find((m) => m.id === mid);
    if (!model) { s4.innerHTML = ''; s4.append(h('p.t-label.tf-msg', { text: '모델 기록을 찾지 못했습니다' }), retryBtn(() => showModel(mid))); return; }
    /* 기반 모델 = 그 학습 작업이 실제로 고른 모델(서버 작업 기록) — 선택 상자의 지금 값이 아님(새로고침하면 기본값으로 돌아간다) */
    const base = ms.find((m) => m.id === model.base_model) || null;
    s4.innerHTML = '';
    const dl = h('dl.tf-dl');
    const row = (k, v) => dl.append(h('dt.t-label', { text: k }), h('dd', { html: v }));
    row('새 모델', esc(model.name || '새 모델'));
    row('성능(학습 끝 검증)', num(perf(model), 3));
    if (base) row('기반 모델', esc(baseName(base)));
    if (base && perf(base)) row('기반 모델 성능', num(perf(base), 3));
    row('클래스', esc((model.classes || []).join(' · ')));
    row('상태', `<span class="t-chip" data-st="${esc(model.status)}">${esc(model.status_label || model.status)}</span>`);
    s4.append(dl);
    const act = h('div.tf-act');
    s4.append(act, h('p.t-label.tf-msg', { role: 'status' }));
    if (model.status === 'candidate') {
      const reg = h('button.t-btn', { type: 'button', text: '등록 요청' });
      reg.addEventListener('click', async () => {
        reg.disabled = true;
        try { await api('/registry/model-register', { method: 'POST', body: { model_id: mid } }); toast('관리자 승인을 요청했습니다'); await showModel(mid); }
        catch (e) { devlog('register', e.code || e.message); toast('요청을 보내지 못했습니다'); reg.disabled = false; }
      });
      act.append(reg);
    } else if (model.status === 'pending') {
      if (isAdmin) {
        const ok = h('button.t-btn', { type: 'button', text: '승인' });
        const no = h('button.t-btn.t-btn--2', { type: 'button', text: '반려' });
        const run = async (dec) => {
          ok.disabled = no.disabled = true;
          try { await api('/registry/model-decide', { method: 'POST', body: { model_id: mid, decision: dec } }); toast(dec === 'approve' ? '승인했습니다' : '반려했습니다'); showModel(mid); }
          catch (e) { devlog('decide', e.code || e.message); toast('지금은 처리할 수 없습니다'); ok.disabled = no.disabled = false; }
        };
        ok.addEventListener('click', () => run('approve')); no.addEventListener('click', () => run('reject'));
        act.append(no, ok);
      } else {
        act.append(h('p.t-label', { text: 'LX 관리자 승인을 기다립니다' }));
        const again = h('button.t-btn.t-btn--text', { type: 'button', text: '다시 보기' });
        again.addEventListener('click', () => showModel(mid)); act.append(again);
      }
    } else if (model.status === 'registered') {
      s4.closest('.tf-s').classList.add('is-done');
      buildService();
    }
  }

  /* ── ⑤ 서비스 만들기 ───────────────────────────── */
  async function buildService() {
    lock(s5, false);
    if (s5.childElementCount) return;
    const name = h('input.t-input', { type: 'text', maxlength: '60', value: `${sample?.task_name || model?.name?.split(' · ')[0] || ''}`.trim(), 'aria-label': '서비스 이름' });
    const rulesEl = h('div.tf-rules');
    const ledger = h('select.t-input', { 'aria-label': '대장 형식' });
    const mk = h('button.t-btn', { type: 'button', text: '서비스 만들기' });
    const out = h('div.tf-out');
    s5.append(h('label.t-label', { text: '서비스 이름' }), name, h('p.t-label', { text: '모델' }), h('p.tf-m', { text: model?.name || '' }),
      h('p.t-label', { text: '규칙' }), rulesEl, h('label.t-label', { text: '대장 형식' }), ledger, h('div.tf-act', {}, mk), out);
    /* 규칙 = 이 모델이 찾는 대상으로 평가할 수 있는 것만 고를 수 있다(서버 판정 · 서비스 만들기도 같은 판정으로 거절) */
    const [rl, lk] = await Promise.all([api('/registry/model-rules?model_id=' + encodeURIComponent(model.id)).catch(() => null), api('/registry/ledger_kinds').catch(() => null)]);
    const cls = (model?.classes || []).join(' ');
    const items = rl?.items || [];
    for (const r of items) {
      const on = r.fits && (/비닐|하우스/.test(cls) ? /비닐하우스/.test(r.name) : false);
      rulesEl.append(h('label.tf-rule', { dataset: { off: r.fits ? '' : '1' }, title: r.fits ? '' : '이 모델이 찾지 않는 대상의 규칙' },
        h('input', { type: 'checkbox', value: r.id, checked: on, disabled: !r.fits, 'aria-label': r.name }), h('span', { text: r.name })));
    }
    if (!items.some((r) => r.fits)) rulesEl.append(h('p.t-label.tf-note', { text: '이 모델의 탐지 대상에 맞는 규칙이 없습니다 — AI 분석까지 하는 서비스가 됩니다' }));
    ledger.innerHTML = (lk?.items || []).filter((x) => x.ready).map((x) => `<option value="${esc(x.kind)}">${esc(x.label)}</option>`).join('');
    const pre = (lk?.items || []).find((x) => x.ready && /greenhouse/.test(x.kind) && /비닐|하우스/.test(cls));
    if (pre) ledger.value = pre.kind;
    mk.addEventListener('click', async () => {
      mk.disabled = true;
      const rules = [...rulesEl.querySelectorAll('input:checked')].map((x) => x.value);
      try {
        card = await api('/registry/cards', { method: 'POST', body: { name: name.value.trim(), model_id: model.id, rules, ledger_kind: ledger.value, domain: sample?.task_name } });
        setQ({ card: card.id });
        toast('서비스를 만들었습니다');
        showCard(out);
      } catch (e) { devlog('card', e.code || e.message); toast(e.message || '서비스를 만들지 못했습니다'); mk.disabled = false; }
    });
    if (Q().get('card')) { card = { id: Q().get('card') }; mk.disabled = true; showCard(out); }
  }
  async function showCard(out) {
    const cards = (await api('/registry/cards').catch(() => null))?.items || [];
    const c = cards.find((x) => x.id === card.id);
    out.innerHTML = '';
    if (!c) return;
    s5.closest('.tf-s').classList.add('is-done');
    out.append(h('p.tf-sum', { html: `서비스 목록에 추가됨 · <b>${esc(String(c.name || '').replace(/\s*(행정서비스|서비스)$/, ''))}</b>` }),
      h('a.t-btn', { href: `${V3}lx-deploy/?card=${encodeURIComponent(c.id)}`, text: '다른 지역에 적용' }));
  }

  /* ── 새로고침 뒤 이어 보기(URL 상태) ─────────────────── */
  (async () => {
    const q = Q();
    if (q.get('sample')) { try { showSample(await api('/training/samples/' + q.get('sample'))); } catch { setQ({ sample: null }); } }
    if (q.get('model')) { await buildTrain(); showModel(q.get('model')); }
    else if (q.get('job')) {
      await buildTrain();
      const j = await api('/jobs/' + q.get('job')).catch(() => null);
      if (j && j.state === 'done') {
        const ms = await loadModels();
        const m = ms.find((x) => x.train_job === q.get('job'));
        if (m) showModel(m.id); else track(q.get('job'));
      } else if (j) track(q.get('job'));
    }
  })();
  return d;
}
