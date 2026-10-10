/* lx-release — 프로젝트 안 '추론' · '배포 신청'(확인 대장 배포-1 · 배포-2 · 원칙 151 · 152 · 158).
   ?project=<id>&stage=infer   추론 — 이 프로젝트에서 학습한 모델(판 고르기)로 배포 신청 없이 영상 분석 → 결과 목록(보는 사람 = 나 · 프로젝트 참여자)
                               분석은 지금 있는 분석 작업 대기열로만(POST /release/projects/{id}/infer → POST /jobs) · 결과 보기 = XI맵 기록 보기
                               (결과를 지도 서비스에서 보는 화면은 설계 확인 전 — 지금은 XI맵으로 잇는다)
   ?project=<id>&stage=publish 배포 신청 — 신청서 = 서버 값(모델 · 검증 정확도 · 학습 데이터 · 결과 확인 · 결과 장면) + 메모 한 칸 · 지난 판 없으면 '첫 판입니다'
                               상태 줄(검토 중 · 승인 · 거절 사유 → 고쳐서 다시 신청). 승인 · 기관 공유는 LX 관리자 '배포' 메뉴.
   숫자는 모두 서버 값(봉투). 아이콘 0 · PC 1440 기준. */
import { shell } from '../kit/shell.js';
import { gate } from '../kit/auth-gate.js';
import { toast } from '../kit/toast.js';
import { devDrawer, devlog } from '../kit/dev-drawer.js';
import { hold } from '../kit/loader.js';   // 불러오는 중 = 화면 가운데 하나(원칙 161)
import { nf } from '../kit/i18n.js';
import { h, api, API, session, isEnvelope } from '../kit/util.js';
import { PID, projectRail, attachProject, refreshRail, loadProject, stageHref } from '../lx-project/context.js';
import { staffMenu } from '../kit/lx-menu.js';

const who = await gate('lx-release');
const q = new URLSearchParams(location.search);
const STAGE = q.get('stage') === 'publish' ? 'publish' : 'infer';
if (!PID) { location.replace(new URL('../lx-project/', import.meta.url).pathname); await new Promise(() => {}); }
const PR = projectRail(STAGE);
const S = shell({ who, home: 'lx-release', rail: PR || staffMenu('projects') });
const PROJ = attachProject(S, PR, STAGE);
devDrawer({ who });

const page = h('div.rl-page', { dataset: { stage: STAGE } });
S.main.append(page);
const base = `/release/projects/${encodeURIComponent(PID)}`;

/* ── 작은 말 도우미 ── */
const val = (e) => (isEnvelope(e) ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const md = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()}`; };
const mdhm = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const pct = (e) => (val(e) == null ? '—' : `${nf(val(e))}%`);
const km2 = (e) => (val(e) == null || val(e) < 0.01 ? '' : `${nf(val(e), val(e) < 1 ? 2 : val(e) < 100 ? 1 : 0)}km²`);   // 관리자 화면과 같은 자릿수
const join = (...xs) => xs.filter((x) => x !== null && x !== undefined && x !== '').join(' · ');
const unitsEl = (tag, text) => { const el = h(tag); String(text || '').split(' · ').forEach((u, i) => { if (i) el.append(' · '); el.append(h('span.rl-u', { text: u })); }); return el; };
const card = (title, sub, ...kids) => h('section.t-card.rl-card', {}, h('header.rl-h', {}, h('h2', { text: title }), sub ? unitsEl('span.rl-sub', sub) : null), ...kids);
function bar(v, dim = false) { const b = h('span.rl-bar', { class: dim ? 'is-dim' : '' }); b.append(h('i', { style: `width:${Math.max(0, Math.min(100, val(v) || 0))}%` })); return b; }
async function thumb(img, id) {
  try {
    const s = session.get();
    const r = await fetch(`${API.prefix}/release/imagery/${encodeURIComponent(id)}/thumb`, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
    if (r.status !== 200) { img.closest('.rl-thumb')?.classList.add('is-none'); return; }
    img.src = URL.createObjectURL(await r.blob());
  } catch { img.closest('.rl-thumb')?.classList.add('is-none'); }
}
async function loading(p) { const done = hold({ onRetry: () => location.reload() }); try { return await p; } finally { done(); } }

/* ════════════════ 추론 ════════════════ */
async function drawInfer() {
  let d;
  try { d = await loading(api(base + '/infer')); } catch (e) { page.replaceChildren(h('p.rl-empty', { text: e.message || '추론 화면을 열 수 없습니다' })); return; }
  const st = { model: null, img: null, emd: '', ranges: null };
  const models = d.models || [];
  st.model = (models.find((m) => m.status === 'registered') || models[0])?.id || null;

  /* 왼쪽 — 모델 · 영상 · 범위 · 시작 */
  const mList = h('ul.rl-models', { role: 'radiogroup', 'aria-label': '모델 고르기' });
  const drawModels = () => mList.replaceChildren(...models.map((m) => {
    const on = st.model === m.id;
    const li = h('li', { class: on ? 'is-on' : '' },
      h('label', {},
        h('input', { type: 'radio', name: 'model', value: m.id, checked: on, onchange: () => { st.model = m.id; drawModels(); drawImgs(); } }),
        h('span.rl-m-l', {}, h('b', { text: `${m.n}번째 학습` }), unitsEl('span', join(m.name, (m.classes || []).join(' · '), m.gsd_word)),
          unitsEl('small', join(`${mdhm(m.at)} 학습`, m.status_label, m.deployed ? `${m.deployed}판에 쓰임` : '배포 전'))),
        h('span.rl-acc', {}, h('em', { text: '정확도' }), h('b', { text: pct(m.acc) }), bar(m.acc, !on))));
    return li;
  }));
  drawModels();

  const pick = () => models.find((m) => m.id === st.model);
  const fits = (img) => { const m = pick(); if (!m?.gsd_m || !img.gsd_m) return true; const r = img.gsd_m / m.gsd_m; return r <= 2 && r >= 0.5; };
  const find = h('input.t-input.rl-find', { type: 'search', placeholder: '공유 데이터셋에서 지역 이름으로 찾기', 'aria-label': '영상 찾기' });
  const iProj = h('ul.rl-imgs'), iShared = h('ul.rl-imgs');
  const SHOW = 6;
  function imgRow(it) {
    const on = st.img === it.id;
    const im = h('img', { alt: '' });
    const li = h('li', { class: on ? 'is-on' : '' },
      h('label', {},
        h('input', { type: 'radio', name: 'img', value: it.id, checked: on, onchange: () => { st.img = it.id; st.emd = ''; drawImgs(); loadRanges(); } }),
        h('span.rl-thumb', {}, im),
        h('span.rl-i-l', {}, h('b', { text: it.name }), unitsEl('span', join(it.gsd_word, it.when ? `${it.when}년` : '', it.where, km2(it.area))),
          fits(it) ? null : h('em', { text: '모델이 배운 해상도와 다릅니다' }))));
    li._img = im; li._id = it.id;
    return li;
  }
  function drawImgs() {
    const p = (d.imagery?.project || []).map(imgRow);
    iProj.replaceChildren(...(p.length ? p : [h('li.rl-none', { text: '프로젝트 대상 지역에 분석할 수 있는 영상이 없습니다' })]));
    const k = find.value.trim();
    const all = (d.imagery?.shared || []).filter((x) => !k || `${x.name} ${x.where || ''}`.includes(k));
    const sel = all.find((x) => x.id === st.img);
    const list = all.slice(0, SHOW);
    if (sel && !list.includes(sel)) list.unshift(sel);
    iShared.replaceChildren(...list.map(imgRow), ...(all.length > list.length ? [h('li.rl-more', { text: `외 ${nf(all.length - list.length)}개 — 지역 이름으로 찾아 주세요` })] : []),
      ...(all.length ? [] : [h('li.rl-none', { text: '찾는 영상이 없습니다' })]));
    for (const li of [...iProj.children, ...iShared.children]) if (li._img) thumb(li._img, li._id);
  }
  find.addEventListener('input', drawImgs);

  const rangeSel = h('select.t-input.rl-range', { 'aria-label': '범위' });
  const rangeNote = h('small.rl-note');
  async function loadRanges() {
    const it = [...(d.imagery?.project || []), ...(d.imagery?.shared || [])].find((x) => x.id === st.img);
    rangeSel.replaceChildren(h('option', { value: '', text: it ? `영상 전체 · ${km2(it.area)}` : '영상을 먼저 고르세요' }));
    rangeNote.textContent = '';
    if (!it) return;
    try {
      const r = await api(`${base}/infer/ranges?imagery_id=${encodeURIComponent(it.id)}`);
      if (st.img !== it.id) return;
      for (const x of r.items || []) rangeSel.append(h('option', { value: x.code, text: `${x.name} · ${km2(x.area)}` }));
      rangeNote.textContent = (r.items || []).length ? '읍면동 하나로 작게 먼저 돌려 볼 수 있습니다' : '';
    } catch (e) { devlog('ranges', e.code || e.message); }
  }
  rangeSel.addEventListener('change', () => { st.emd = rangeSel.value; });

  /* 설정(질문 6 ⓐ) — 접어 두고 두 가지만. 기본값 = 서버 값(d.settings.default) · 바꾸면 이번 작업에만 */
  const DEF = d.settings?.default || { conf: 0.25, min_area_m2: 4 };
  const LIM = d.settings?.limit || { conf: [0.05, 0.95], min_area_m2: [0, 500] };
  const confIn = h('input.t-input.rl-num', { type: 'number', step: '0.05', min: String(LIM.conf[0]), max: String(LIM.conf[1]), value: String(DEF.conf), 'aria-label': '신뢰도 기준' });
  const minIn = h('input.t-input.rl-num', { type: 'number', step: '1', min: String(LIM.min_area_m2[0]), max: String(LIM.min_area_m2[1]), value: String(DEF.min_area_m2), 'aria-label': '최소 크기' });
  const setNote = h('small.rl-note');
  const reset = h('button.t-btn.t-btn--text.rl-reset', { type: 'button', text: '기본값으로', onclick: () => { confIn.value = String(DEF.conf); minIn.value = String(DEF.min_area_m2); sync(); } });
  const sumEl = h('span.rl-set-v');
  function sync() {
    const c = +confIn.value, a = +minIn.value;
    const same = c === +DEF.conf && a === +DEF.min_area_m2;
    sumEl.textContent = same ? '기본값' : '바꿈 · 이번 분석에만';
    setNote.textContent = same ? '' : '바꾼 값은 이번 분석에만 쓰입니다';
    reset.hidden = same;
  }
  confIn.addEventListener('input', sync); minIn.addEventListener('input', sync);
  const setBox = h('details.rl-set', {},
    h('summary', {}, h('span', { text: '설정' }), sumEl),
    h('div.rl-set-b', {},
      h('label.rl-set-r', {}, h('span.rl-set-k', {}, h('b', { text: '신뢰도 기준' }), h('small', { text: 'AI가 이만큼 확실할 때만 결과로 남깁니다(0~1)' })), confIn),
      h('label.rl-set-r', {}, h('span.rl-set-k', {}, h('b', { text: '최소 크기' }), h('small', { text: '이보다 작은 것은 결과에서 뺍니다' })), h('span.rl-set-u', {}, minIn, h('em', { text: '㎡' }))),
      h('div.rl-set-f', {}, setNote, reset)));
  sync();

  const go = h('button.t-btn', { type: 'button', text: '분석 시작' });
  const msg = h('p.rl-msg', { role: 'status' });
  go.addEventListener('click', async () => {
    if (!st.model) { msg.textContent = '모델을 고르세요'; return; }
    if (!st.img) { msg.textContent = '영상을 고르세요'; return; }
    go.disabled = true; msg.textContent = '';
    try {
      await api(base + '/infer', { method: 'POST', body: { model_id: st.model, imagery_id: st.img, ...(st.emd ? { emd_cd: st.emd } : {}),
        conf: +confIn.value, min_area_m2: +minIn.value } });
      toast('분석을 대기열에 넣었습니다');
      await drawJobs(true);
    } catch (e) {
      devlog('infer', e.code || e.message);
      msg.textContent = e.code === 'power_budget' ? '지금은 GPU 가 바쁩니다 — 잠시 뒤 다시 시작해 주세요'
        : e.code === 'aoi_too_large' || e.code === 'too_large' ? '범위가 너무 큽니다 — 읍면동 하나를 골라 주세요' : (e.message || '분석을 시작하지 못했습니다');
    } finally { go.disabled = false; }
  });

  const can = d.can?.run;
  const left = card('추론', '배포 신청 없이 · 이 프로젝트 모델로 분석',
    h('p.rl-lede', { text: '학습한 모델로 영상을 바로 분석해 봅니다. 결과는 나와 프로젝트 참여자만 봅니다.' }),
    h('div.rl-step', {}, h('h3', { text: '모델' }), models.length ? mList : h('p.rl-empty', { text: '아직 학습한 모델이 없습니다 — 학습 단계에서 먼저 학습해 주세요' })),
    h('div.rl-step', {}, h('h3', { text: '영상' }),
      h('p.rl-grp', { text: '프로젝트 영상' }), iProj,
      h('p.rl-grp', { text: '공유 데이터셋' }), find, iShared),
    h('div.rl-step', {}, h('h3', { text: '범위' }), rangeSel, rangeNote),
    setBox,
    h('footer.rl-foot', {}, h('p', {}, unitsEl('span', '분석은 작업 대기열 순서대로 · GPU 한 장씩 돕니다')), can ? go : h('p.rl-note', { text: '추론은 프로젝트장 · 구성원이 합니다' })), msg);

  /* 오른쪽 — 결과 목록 */
  const jl = h('ol.rl-jobs');
  const right = card('추론 결과', join(`보는 사람 ${nf(val(d.viewers))}명`, '나 · 프로젝트 참여자'), jl,
    h('p.rl-note', { text: '결과 보기는 XI맵에서 그 분석 기록을 엽니다.' }));
  page.replaceChildren(h('div.rl-grid', {}, h('div.rl-col', {}, left), h('div.rl-col', {}, right)));
  drawImgs(); loadRanges();

  let timer = 0;
  async function drawJobs(fresh = false) {
    let jobs = d.jobs || [];
    if (fresh) { try { d = { ...d, ...(await api(base + '/infer')) }; jobs = d.jobs || []; } catch { /* 지난 목록 그대로 */ } }
    jl.replaceChildren(...(jobs.length ? jobs.map((j) => h('li', { dataset: { st: j.state } },
      h('div.rl-j-l', {}, h('b', { text: join(j.imagery?.name, j.range) }), unitsEl('span', join(j.model?.name, km2(j.area),
        j.settings?.conf != null ? `신뢰도 기준 ${j.settings.conf}` : '', j.settings?.min_area_m2 != null ? `최소 ${nf(j.settings.min_area_m2)}㎡` : '')),
        unitsEl('small', join(mdhm(j.at), j.by))),
      h('div.rl-j-r', {},
        j.state === 'done' ? h('b.rl-found', { text: val(j.found) == null ? '—' : `${nf(val(j.found))}건` }) : h('span.t-chip', { dataset: { lv: j.state === 'failed' ? 'warn' : 'wait' },
          text: j.progress && j.progress.shards_total ? `${j.state_label} ${nf(Math.round((j.progress.shards_done / j.progress.shards_total) * 100))}%` : j.state_label }),
        j.href ? h('a.rl-link', { href: j.href, text: '결과 보기' }) : null)))
      : [h('li.rl-none', { text: '아직 추론한 결과가 없습니다' })]));
    clearTimeout(timer);
    if (jobs.some((j) => j.state === 'queued' || j.state === 'running')) timer = setTimeout(async () => { await drawJobs(true); refreshRail(S, PR, await loadProject(), STAGE); }, 5000);
  }
  drawJobs();
}

/* ════════════════ 배포 신청 ════════════════ */
async function drawPublish() {
  let d;
  try { d = await loading(api(base + '/apply')); } catch (e) { page.replaceChildren(h('p.rl-empty', { text: e.message || '배포 신청 화면을 열 수 없습니다' })); return; }
  const st = { model: d.pick, scene: d.scenes?.[0]?.job || '' };
  const s = d.status || { state: 'none' };
  const prev = d.prev;
  const ver = d.next_version;
  const canApply = d.can?.apply && s.state !== 'pending';
  const m = () => (d.models || []).find((x) => x.id === st.model) || null;

  /* 신청서 — 서버 값 */
  const dl = h('dl.rl-dl');
  const row = (k, ...v) => dl.append(h('div', {}, h('dt', { text: k }), h('dd', {}, ...v)));
  const svcName = h('input.t-input', { type: 'text', maxlength: '60', value: d.service?.name || d.service?.default_name || '', 'aria-label': '서비스 이름' });
  const mSel = h('select.t-input', { 'aria-label': '모델' }, ...(d.models || []).map((x) => h('option', { value: x.id, disabled: !x.can_apply,
    text: join(`${x.n}번째 학습`, x.name, pct(x.acc), x.can_apply ? '' : '모델 등록 승인 뒤 신청할 수 있습니다') })));
  if (st.model) mSel.value = st.model;
  const accEl = h('div.rl-cmp'), lowEl = h('p.rl-low', { role: 'note' }), dataEl = h('div'), sceneEl = h('div.rl-scenes', { role: 'radiogroup', 'aria-label': '결과 장면' });
  const ledger = h('select.t-input', { 'aria-label': '대장 형식' }, ...(d.ledger_kinds || []).map((k) => h('option', { value: k.kind, text: k.label })));
  function drawModelBits() {
    const x = m();
    accEl.replaceChildren(
      h('span', {}, h('em', { text: '이번 판' }), h('b', { text: pct(x?.acc) }), bar(x?.acc)),
      h('span', {}, h('em', { text: prev ? `지난 판 ${prev.version}` : '지난 판' }), h('b', { text: prev ? pct(prev.model?.acc) : '—' }), bar(prev?.model?.acc, true)));
    /* 기반 · 지난 판보다 낮으면 빨간 경고 한 줄(질문 9 ⓑ) — 막지 않는다 · 관리자 신청서에도 같은 줄 */
    lowEl.textContent = x?.low ? `${x.low} — 신청은 할 수 있고, 관리자가 보고 판단합니다` : '';
    lowEl.hidden = !x?.low;
    dataEl.replaceChildren(x?.sample
      ? unitsEl('b', join(`표본 ${nf(val(x.sample.images))}장`, `${md(x.sample.at)} 올림`))
      : h('b.rl-warn', { text: '이 모델은 프로젝트 학습 데이터와 연결 기록이 없습니다' }));
  }
  mSel.addEventListener('change', () => { st.model = mSel.value; drawModelBits(); });
  drawModelBits();
  const scenes = d.scenes || [];
  sceneEl.replaceChildren(...(scenes.length ? scenes.slice(0, 6).map((j) => h('label', { class: st.scene === j.job ? 'is-on' : '' },
    h('input', { type: 'radio', name: 'scene', value: j.job, checked: st.scene === j.job, onchange: () => { st.scene = j.job; sceneEl.querySelectorAll('label').forEach((l) => l.classList.toggle('is-on', l.querySelector('input').checked)); } }),
    h('b', { text: join(j.imagery?.name, j.range) }), unitsEl('span', join(val(j.found) == null ? '' : `${nf(val(j.found))}건`, km2(j.area), md(j.finished_at))),
    j.href ? h('a.rl-link', { href: j.href, text: '결과 보기' }) : null))
    : [h('p.rl-empty', {}, h('span', { text: '이 프로젝트에서 추론한 결과가 없습니다 — ' }), h('a', { href: stageHref(PID, 'infer'), text: '추론에서 먼저 분석해 보세요' }))]));

  if (d.first) row('서비스', svcName, h('small', { text: '첫 판입니다 — 승인되면 새 분석 서비스가 됩니다' }));
  else row('서비스', h('b', { text: d.service?.name || '' }), d.service?.line ? h('small', { text: d.service.line }) : null);
  row('모델', mSel);
  row('정확도', accEl, lowEl, h('small', { text: '학습 끝 검증 값' }));
  row('학습 데이터', dataEl);
  const rv = d.review;
  row('결과 확인', d.review_skip ? h('b', { text: '해당 없음' }) : h('b', { class: d.review_done ? '' : 'rl-warn', text: rv ? `${nf(rv.n)}/${nf(rv.total)}` : '—' }),
    d.review_done || d.review_skip ? null : h('small', { text: '결과 확인 단계가 남았습니다 — 관리자 신청서에 그대로 보입니다' }));
  row('결과 장면', sceneEl);
  if (d.first && (d.ledger_kinds || []).length) row('대장 형식', ledger);

  const memo = h('textarea.t-input.rl-memo', { rows: '3', maxlength: '300', placeholder: '관리자에게 남길 말(선택)', 'aria-label': '메모' });
  const go = h('button.t-btn', { type: 'button', text: s.state === 'rejected' ? '고쳐서 다시 신청' : '배포 신청' });
  const msg = h('p.rl-msg', { role: 'status' });
  go.addEventListener('click', async () => {
    go.disabled = true; msg.textContent = '';
    try {
      const r = await api(base + '/apply', { method: 'POST', body: { model_id: st.model, memo: memo.value.trim(), scene_job: st.scene || undefined,
        ...(d.first ? { name: svcName.value.trim(), ledger_kind: ledger.value || undefined } : {}) } });
      toast(r.again ? '고쳐서 다시 신청했습니다' : '배포를 신청했습니다 — LX 관리자가 검토합니다');
      await drawPublish();
      refreshRail(S, PR, await loadProject(), STAGE);
    } catch (e) { devlog('apply', e.code || e.message); msg.textContent = e.message || '신청하지 못했습니다'; go.disabled = false; }
  });
  const lead = d.can?.lead;
  const foot = h('footer.rl-foot', {}, h('p', {}, unitsEl('span', '신청서의 값은 모두 서버 기록입니다 · 직원이 적는 것은 메모 한 칸입니다')),
    canApply ? go : h('p.rl-note', { text: s.state === 'pending' ? 'LX 관리자가 검토 중입니다' : `배포 신청은 프로젝트장${lead ? `(${lead})` : ''}이 합니다` }));
  const head = card('배포 신청', join(d.service?.name || svcName.value, `${ver}판`), h('p.rl-ver', { text: prev ? `지난 판 ${prev.version} · ${md(prev.approved_at)} 승인` : '첫 판입니다' }),
    dl, h('div.rl-step', {}, h('h3', { text: '메모' }), memo), foot, msg);
  if (!canApply) { [mSel, memo, svcName, ledger].forEach((x) => { x.disabled = true; }); sceneEl.querySelectorAll('input').forEach((x) => { x.disabled = true; }); }

  /* 오른쪽 — 신청 상태 · 지난 판 · 공유된 기관 */
  const steps = [
    { k: 'none', t: '신청 전', s: `${ver}판 · 아직 보내지 않음` },
    { k: 'pending', t: '검토 중', s: s.state === 'pending' ? join(`${s.version}판`, `${mdhm(s.at)} 신청`, val(s.tries) > 1 ? `${nf(val(s.tries))}번째 신청` : '') : 'LX 관리자가 신청서를 보고 판단합니다' },
    { k: 'approved', t: '승인', s: s.state === 'approved' ? join(`${s.version}판`, `${md(s.at)} 승인`, s.by) : '분석 서비스가 되고, 관리자가 기관에 공유합니다' },
    { k: 'rejected', t: '거절', s: '사유를 보고 고쳐서 다시 신청합니다' },
  ];
  const flow = h('ol.rl-flow', {}, ...steps.map((x) => h('li', { dataset: { st: x.k === s.state ? 'now' : '' }, class: x.k === 'rejected' ? 'is-alt' : '' },
    h('b', { text: x.t }), unitsEl('small', x.s))));
  const rej = s.state === 'rejected' ? h('div.rl-reject', {}, h('p', {}, h('b', { text: '거절 사유 ' }), h('span', { text: s.reason || '—' })),
    unitsEl('small', join(`${s.version}판`, s.decided_at ? `${mdhm(s.decided_at)} 거절` : ''))) : null;
  const hist = h('ul.rl-hist', {}, ...(d.versions || []).filter((v) => v.state !== 'none' || v.approved_at).map((v) => h('li', {},
    h('b', { text: v.version }), h('div', {}, unitsEl('span', join(v.state_label, md(v.state === 'approved' ? v.approved_at : v.requested_at), v.approved_by)),
      unitsEl('small', join(v.model?.name, pct(v.model?.acc), v.state === 'rejected' && v.reason ? `사유 ${v.reason}` : (v.memo || v.changelog || '')))))));
  const shared = d.shared || [];
  const right = h('div.rl-col', {},
    card('신청 상태', null, flow, rej),
    card('지난 판', (d.versions || []).length ? `${nf((d.versions || []).length)}판` : null, (d.versions || []).length ? hist : h('p.rl-empty', { text: '첫 판입니다' })),
    card('공유된 기관', shared.length ? `${nf(shared.length)}곳` : null, shared.length ? h('ul.rl-hist.rl-hist--org', {}, ...shared.map((o) => h('li', {}, h('b', { text: o.name }),
      h('div', {}, h('span', { text: o.year ? `${o.year}년부터` : '공유 중' }))))) : h('p.rl-empty', { text: '아직 공유된 기관이 없습니다 — 승인 뒤 LX 관리자가 공유합니다' })));
  page.replaceChildren(h('div.rl-grid', {}, h('div.rl-col', {}, head), right));
}

if (STAGE === 'infer') drawInfer(); else drawPublish();
PROJ.then((pr) => { if (pr) document.title = `${STAGE === 'infer' ? '추론' : '배포 신청'} · ${pr.name} · Land-XI`; });
