/* LX 관리자 메뉴 '공유 데이터'(10-13 관리자-공유데이터 · 원칙 232 · 238) — 탭 셋: 영상 · 학습 데이터 · 행정 자료(10-14 공유데이터-탭 · 원칙 240 · 246).
   틀(칸 · 창 크기)은 탭을 바꿔도 같다(원칙 231) — 머리 · 찾기 칸 · 올리기 단추(같은 자리 · 같은 크기) · 몸통 높이가 고정이고 안쪽만 스크롤.
   영상 = GET /projects/imagery?all=1(직원 목록과 한 출처 · 관리자는 비공개까지 · visible) · 찾기 · 한 페이지 12줄.
     올리기 = 영상 등록 그대로(조각 올리기 /catalog/imagery/uploads → POST /catalog/imagery {draft_id}).
     정보 고치기(이름 · 촬영 연도) = PATCH /catalog/imagery/{id} · 공개/비공개 = PATCH {visible} · 지우기 = DELETE.
   학습 데이터 = GET /shared/train-data(프로젝트 학습데이터 = 올린 묶음 + 수정된 부분 · 공유 데이터에서 올린 묶음 = 프로젝트 없음).
     올리기 = 프로젝트 학습데이터 구축과 같은 길(kit/sample-upload.js · /training/uploads · zip: images/ · labels/ YOLO txt · dataset.yaml) — 프로젝트 없이.
     공개/비공개 = PATCH /training/samples/{id} {shared}(공개 = 학습 화면 '공유 데이터에서 고르기').
     공유 데이터에서 올린 묶음만 정보 고치기(이름 · 클래스 — 서버 클래스 목록 GET /classes 에서 고름) · 지우기(학습에 쓴 묶음은 서버가 막음 409).
   행정 자료 = GET /shared/ledgers — LX(여기서 올림: 이름 · 종류 · 행 수 · 공개 · 정보 고치기 · 지우기) + 기관 대장(읽기만) + 브이월드(읽기만).
     올리기 = POST /shared/ledgers(SHP zip · GPKG · GeoJSON · CSV · XLSX — 기관 대장 올리기와 같은 형식 판별) · 공개 = 직원 지도 서비스 '행정 자료' 층.
   새 말 · 새 아이콘 없음. 기관 계정에는 이 화면이 없다(LX 관리자 화면 관문). */
import { h, api, toast, empty, during, nf } from './kit.js';
import { session } from '../../../shared/api-v1.js';
import { API } from '../../kit/util.js';
import { modal } from '../../kit/modal.js';
import { uploadQueue } from '../../kit/dropzone.js';
import { zipPeek, peekWhy, sendChunked } from '../../kit/sample-upload.js';
import { LEDGER } from '../../lx-ingest/data.js';

const PER = 12;
const UPLOADS = '/catalog/imagery/uploads';
const FALLBACK = { raster: ['tif', 'tiff', 'jpg', 'jpeg', 'jp2', 'j2k', 'ecw', 'img'], sidecar: ['tfw', 'tifw', 'jgw', 'jpgw', 'jpw', 'j2w', 'wld', 'eww', 'prj', 'aux.xml', 'ovr'] };
const KINDS0 = { farm_ledger: '농지대장', dev_permit: '개발행위 허가', public_asset: '공유재산', river_permit: '하천 점용 허가', greenhouse: '시설원예 등록' };
const thumbs = new Map();
function authPic(path) {                     // LX 계정만 받는 그림 — 세션을 실어 받는다(새 프로젝트 창과 같은 길)
  if (!thumbs.has(path)) {
    thumbs.set(path, (async () => {
      const s = session.get();
      const r = await fetch(API.prefix + path, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
      if (!r.ok || r.status === 204) return null;
      const b = await r.blob();
      return b.size ? URL.createObjectURL(b) : null;
    })().catch(() => null));
  }
  return thumbs.get(path);
}

let css = false;
function sheet() {
  if (css) return; css = true;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('../shared.css', import.meta.url).href }));
}

const TABS = [['img', '영상'], ['train', '학습 데이터'], ['admin', '행정 자료']];
const HINT = { img: '영상 이름 · 지역 · 연도', train: '이름 · 프로젝트 · 클래스', admin: '기관 · 이름' };
const UP = { img: '영상 올리기', train: '학습 데이터 올리기', admin: '행정 자료 올리기' };
const day = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : '—'; };
const val = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x);
const flat = (s) => String(s ?? '').replace(/\s+/g, '');
const hit = (s, vals) => !s || vals.some((v) => flat(v).includes(s));
const MB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);
function table(cols, rows) {
  return h('div.sd-tbl-w', {}, h('table.sd-tbl', {}, h('thead', {}, h('tr', {}, ...cols.map((t) => h('th', { text: t })))), h('tbody', {}, ...rows)));
}
/* 확인 창(지우기 한 번) — 영상 · 학습 데이터 · 행정 자료 같은 모양 */
function askDrop(title, name, run, done) {
  const go = h('button.t-btn', { type: 'button', text: '지우기' });
  const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
  const err = h('p.sd-err', { role: 'alert' });
  const m = modal({ title, body: h('div.sd-form', {}, h('p.sd-del', { text: name }), err, h('div.sd-act', {}, no, go)) });
  no.addEventListener('click', () => m.close());
  go.addEventListener('click', async () => {
    go.disabled = true;
    try { await run(); m.close(true); toast('지웠습니다'); done(); }
    catch (e) { go.disabled = false; err.textContent = e?.message || '지우지 못했습니다'; }
  });
}
function visBtn(on, label, onclick) {
  return h('button.sd-vis', { type: 'button', 'aria-pressed': String(on), text: on ? '공개' : '비공개', 'aria-label': `${label} ${on ? '공개' : '비공개'}`, onclick });
}
const doBtns = (edit, drop) => h('td.sd-do', {}, h('button.t-btn.t-btn--2', { type: 'button', text: '정보 고치기', onclick: edit }),
  h('button.t-btn.t-btn--2', { type: 'button', text: '지우기', onclick: drop }));

export function mountShared(root) {
  sheet();
  let all = null, page = 1, tab = 'img', KINDS = KINDS0;
  const D = { img: null, train: null, admin: null };
  const q = h('input.t-input.sd-q', { type: 'search', placeholder: HINT.img, 'aria-label': '찾기', autocomplete: 'off' });
  const up = h('button.t-btn.sd-up-b', { type: 'button', text: UP.img, onclick: () => (tab === 'img' ? openUpload() : tab === 'train' ? openTrainUpload() : openAdminUpload()) });
  const count = h('small.sd-n.num');
  const body = h('div.sd-body');
  const pager = h('nav.sd-pg', { 'aria-label': '페이지' });
  const bar = h('div.sd-tabs', { role: 'tablist', 'aria-label': '공유 데이터' });
  const btn = {};
  for (const [k, label] of TABS) {
    btn[k] = h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === tab), text: label, dataset: { tab: k }, onclick: () => go(k) });
    bar.append(btn[k]);
  }
  root.append(h('section.t-card.sd-card', { 'aria-label': '공유 데이터' },
    h('header.sd-h', {}, h('h2', {}, '공유 데이터', count), h('div.sd-tools', {}, q, up)), bar, body, pager));
  q.addEventListener('input', () => { page = 1; draw(); });

  function go(k) {
    if (k === tab) return;
    tab = k; page = 1; q.value = ''; q.placeholder = HINT[k];
    for (const [x] of TABS) btn[x].setAttribute('aria-selected', String(x === k));
    up.textContent = UP[k];                                   // 같은 자리 · 같은 크기(원칙 231) — 탭마다 그 탭의 올리기
    if (D[k]) draw(); else load();
  }
  function wait() { body.replaceChildren(); pager.replaceChildren(); count.textContent = ''; const x = h('div.sd-wait'); body.append(x); empty(x, { kind: 'loading', compact: true }); }
  function fail(title) { body.replaceChildren(); pager.replaceChildren(); const x = h('div'); body.append(x); empty(x, { kind: 'error', compact: true, title, onRetry: load }); }
  async function load() {
    const k = tab;
    wait();
    try {
      if (k === 'img') { D.img = (await during(api('/projects/imagery?all=1'))).items || []; all = D.img; }
      else if (k === 'train') { classList(); D.train = (await during(api('/shared/train-data'))).items || []; }
      else { const j = await during(api('/shared/ledgers')); D.admin = j.items || []; if (j.kinds) KINDS = j.kinds; }
    } catch (e) { if (tab === k) fail(k === 'img' ? '영상 목록을 불러오지 못했습니다' : k === 'train' ? '학습 데이터를 불러오지 못했습니다' : '행정 자료를 불러오지 못했습니다'); return; }
    if (tab === k) draw();
  }
  const reload = (k) => { D[k] = null; if (tab === k) load(); };
  function pages(rows, empty0, emptyQ, cols, mk) {
    const n = Math.max(1, Math.ceil(rows.length / PER));
    page = Math.min(page, n);
    const from = (page - 1) * PER;
    pager.replaceChildren(...(n > 1 ? [
      h('button', { type: 'button', text: '‹ 앞', disabled: page <= 1 || undefined, onclick: () => { page--; draw(); } }),
      h('span.num', { text: `${page} / ${n}` }),
      h('button', { type: 'button', text: '다음 ›', disabled: page >= n || undefined, onclick: () => { page++; draw(); } })] : []));
    if (!rows.length) return h('p.sd-none', { text: q.value.trim() ? emptyQ : empty0 });
    return table(cols, rows.slice(from, from + PER).map(mk));
  }
  function draw() {
    const s = flat(q.value);
    if (tab === 'img') {
      all = D.img || [];
      count.textContent = `영상 ${nf(all.length)}장`;
      const rows = all.filter((x) => hit(s, [x.name, x.region, x.year, x.kind]));
      body.replaceChildren(pages(rows, '아직 영상이 없습니다', '맞는 영상이 없습니다', ['', '이름', '지역', '연도', '종류', '공개', ''], row));
    } else if (tab === 'train') {
      count.textContent = '';
      const rows = (D.train || []).filter((x) => hit(s, [x.name, x.project?.name, ...(x.classes || [])]));
      body.replaceChildren(pages(rows, '아직 학습 데이터가 없습니다', '맞는 학습 데이터가 없습니다', ['이름', '프로젝트', '클래스', '장수', '출처', '날짜', '공개', ''], trainRow));
    } else {
      count.textContent = '';
      const mine = (D.admin || []).filter((x) => x.owner === 'lx' && hit(s, ['LX', x.name, x.kind_label]));
      const org = (D.admin || []).filter((x) => x.owner !== 'lx' && hit(s, [x.tenant, x.name]));
      const led = pages(org, '아직 기관이 올린 대장이 없습니다', '맞는 대장이 없습니다', ['기관', '이름', '날짜', '행 수'], (x) => h('tr', {},
        h('td', { text: x.tenant || '—' }), h('td', { text: x.name || '—' }), h('td.num', { text: day(x.at) }),
        h('td.num', { text: val(x.rows) != null ? `${nf(val(x.rows))}행` : '—' })));
      body.replaceChildren(
        h('h3.sd-sub', { text: 'LX' }),
        mine.length ? table(['이름', '종류', '행 수', '날짜', '공개', ''], mine.map(adminRow))
          : h('p.sd-none', { text: q.value.trim() ? '맞는 행정 자료가 없습니다' : '아직 올린 행정 자료가 없습니다' }),
        h('h3.sd-sub', { text: '기관 대장' }), led,
        h('h3.sd-sub', { text: '브이월드' }),
        table(['이름'], LEDGER.filter((L) => !L.agency).map((L) => h('tr', {}, h('td', { text: L.label })))));
    }
  }

  /* ── 학습 데이터 ── */
  function trainRow(x) {
    const cls = x.classes || [];
    const pub = x.source === 'sample' ? visBtn(!!x.shared, x.name || x.project?.name || '학습 데이터', (e) => setShared(x, e.currentTarget)) : h('span.sd-dash', { text: '—' });
    return h('tr', { dataset: { id: x.id } },
      h('td', {}, h('b', { text: x.source === 'sample' ? x.name || '—' : '—' })),
      h('td', { text: x.project?.name || '—' }),
      h('td.sd-cls', { text: cls.length ? (cls.length > 3 ? `${cls.slice(0, 3).join(' · ')} 외 ${cls.length - 3}` : cls.join(' · ')) : '—', title: cls.join(' · ') }),
      h('td.num', { text: val(x.images) != null ? `${nf(val(x.images))}장` : '—' }),
      h('td', { text: x.source === 'edits' ? '수정된 부분' : '올린 묶음' }),
      h('td.num', { text: day(x.at) }),
      h('td', {}, pub),
      x.edit ? doBtns(() => openTrainEdit(x), () => askDrop('이 학습 데이터를 지울까요?', x.name || '',
        () => api(`/training/samples/${encodeURIComponent(x.id)}`, { method: 'DELETE' }), () => reload('train'))) : h('td.sd-do'));
  }
  async function setShared(x, b) {
    const want = !x.shared;
    b.disabled = true;
    try {
      await api(`/training/samples/${encodeURIComponent(x.id)}`, { method: 'PATCH', body: { shared: want } });
      x.shared = want;
      toast(want ? '공개로 바꿨습니다' : '비공개로 바꿨습니다');
      draw();
    } catch (e) { b.disabled = false; toast(e?.message || '바꾸지 못했습니다'); }
  }
  function openTrainUpload() {
    const nm = h('input.t-input', { type: 'text', maxlength: '40', 'aria-label': '이름' });
    const file = h('input.sd-file', { type: 'file', accept: '.zip,application/zip', 'aria-label': '학습 데이터 묶음(zip)' });
    const bar = h('div.t-progress.sd-bar', { hidden: true, role: 'progressbar', 'aria-label': '올리기 진행', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i'));
    const msg = h('p.sd-msg', { role: 'status', 'aria-live': 'polite' });
    const err = h('p.sd-err', { role: 'alert' });
    const go = h('button.t-btn', { type: 'button', text: '올리기', disabled: true });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
    const m = modal({ title: UP.train, body: h('div.sd-form', {},
      h('label', {}, h('span', { text: '이름' }), nm),
      h('label', {}, h('span', { text: '학습 데이터 묶음(zip · 그림 200장 이하)' }), file), bar, msg, err, h('div.sd-act', {}, no, go)) });
    let bad = false, busy = false;
    const ready = () => { go.disabled = busy || bad || !(nm.value.trim() && file.files?.length); };
    nm.addEventListener('input', ready);
    file.addEventListener('change', async () => {
      err.textContent = ''; bad = false;
      const f = file.files?.[0];
      if (!f) { msg.textContent = ''; ready(); return; }
      if (!nm.value.trim()) nm.value = f.name.replace(/\.zip$/i, '').slice(0, 40);
      const pk = await zipPeek(f);
      const why = peekWhy(pk);
      bad = !!why;
      if (why) { err.textContent = why; msg.textContent = ''; } else msg.textContent = pk ? `${MB(f.size)} MB · 그림 ${nf(pk.images)}장` : `${MB(f.size)} MB`;
      ready();
    });
    no.addEventListener('click', () => m.close());
    go.addEventListener('click', async () => {
      const f = file.files[0];
      busy = true; ready(); err.textContent = '';
      bar.hidden = false; bar.querySelector('i').style.width = '2%';
      try {
        await sendChunked(f, { task_name: nm.value.trim() }, (done, total) => {
          const pct = total ? Math.round((done / total) * 100) : 0;
          bar.querySelector('i').style.width = Math.max(2, pct) + '%'; bar.setAttribute('aria-valuenow', String(pct));
          msg.textContent = done >= total ? '다 올렸습니다 — 묶음을 풀어 검사하는 중' : `올리는 중 ${MB(done)} / ${MB(total)} MB`;
        });
        m.close(true); toast('학습 데이터를 올렸습니다'); reload('train');
      } catch (e) {
        busy = false; bar.hidden = true; msg.textContent = '';
        err.textContent = e.user || e?.message || '올리지 못했습니다'; go.textContent = '이어 올리기'; ready();
      }
    });
  }
  let CLS = null;                                             // 서버 클래스 목록 한 곳(학습 데이터 탭을 열 때 미리 받아 둔다)
  const classList = () => (CLS ||= api('/classes?status=approved').then((j) => [...new Set((j.items || []).map((c) => c.name))].sort((a, b) => a.localeCompare(b, 'ko'))).catch(() => { CLS = null; return []; }));
  async function openTrainEdit(x) {
    const names = await classList();
    const nm = h('input.t-input', { type: 'text', maxlength: '40', value: x.name || '', 'aria-label': '이름' });
    const sels = (x.classes || []).map((c) => h('select.t-input', { 'aria-label': `클래스 ${c}` },
      ...[c, ...names.filter((n) => n !== c)].map((n) => h('option', { value: n, text: n, selected: n === c || undefined }))));
    const err = h('p.sd-err', { role: 'alert' });
    const save = h('button.t-btn', { type: 'button', text: '저장' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
    const m = modal({ title: '정보 고치기', body: h('div.sd-form', {},
      h('label', {}, h('span', { text: '이름' }), nm),
      sels.length ? h('div.sd-cls-f', {}, h('span', { text: '클래스' }), ...sels) : null,
      err, h('div.sd-act', {}, no, save)) });
    no.addEventListener('click', () => m.close());
    save.addEventListener('click', async () => {
      const b = {};
      if (nm.value.trim() !== (x.name || '')) b.name = nm.value.trim();
      const nn = sels.map((s) => s.value);
      if (nn.some((n, i) => n !== x.classes[i])) b.names = nn;
      if (!Object.keys(b).length) { m.close(); return; }
      save.disabled = true;
      try { await api(`/training/samples/${encodeURIComponent(x.id)}`, { method: 'PATCH', body: b }); m.close(true); toast('바꿨습니다'); reload('train'); }
      catch (e) { save.disabled = false; err.textContent = e?.message || '바꾸지 못했습니다'; }
    });
  }

  /* ── 행정 자료(LX) ── */
  function adminRow(x) {
    return h('tr', { dataset: { id: x.id } },
      h('td', {}, h('b', { text: x.name || '—' })),
      h('td', { text: x.kind_label || '—' }),
      h('td.num', { text: val(x.rows) != null ? `${nf(val(x.rows))}행` : '—' }),
      h('td.num', { text: day(x.at) }),
      h('td', {}, visBtn(!!x.shared, x.name || '행정 자료', (e) => setLedShared(x, e.currentTarget))),
      doBtns(() => openAdminEdit(x), () => askDrop('이 행정 자료를 지울까요?', x.name || '',
        () => api(`/shared/ledgers/${encodeURIComponent(x.id)}`, { method: 'DELETE' }), () => reload('admin'))));
  }
  async function setLedShared(x, b) {
    const want = !x.shared;
    b.disabled = true;
    try {
      await api(`/shared/ledgers/${encodeURIComponent(x.id)}`, { method: 'PATCH', body: { shared: want } });
      x.shared = want;
      toast(want ? '공개로 바꿨습니다' : '비공개로 바꿨습니다');
      draw();
    } catch (e) { b.disabled = false; toast(e?.message || '바꾸지 못했습니다'); }
  }
  const kindSel = (cur) => h('select.t-input', { 'aria-label': '종류' },
    ...Object.entries(KINDS).map(([k, t]) => h('option', { value: k, text: t, selected: k === cur || undefined })));
  function openAdminUpload() {
    const nm = h('input.t-input', { type: 'text', maxlength: '60', 'aria-label': '이름' });
    const kd = kindSel('farm_ledger');
    const file = h('input.sd-file', { type: 'file', accept: '.zip,.gpkg,.geojson,.json,.csv,.xlsx', 'aria-label': '파일' });
    const err = h('p.sd-err', { role: 'alert' });
    const go = h('button.t-btn', { type: 'button', text: '올리기', disabled: true });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
    const m = modal({ title: UP.admin, body: h('div.sd-form', {},
      h('label', {}, h('span', { text: '이름' }), nm), h('label', {}, h('span', { text: '종류' }), kd),
      h('label', {}, h('span', { text: '파일(SHP zip · GPKG · GeoJSON · CSV)' }), file), err, h('div.sd-act', {}, no, go)) });
    const ready = () => { go.disabled = !(nm.value.trim() && file.files?.length); };
    nm.addEventListener('input', ready);
    file.addEventListener('change', () => { err.textContent = ''; const f = file.files?.[0]; if (f && !nm.value.trim()) nm.value = f.name.replace(/\.[^.]+$/, '').slice(0, 60); ready(); });
    no.addEventListener('click', () => m.close());
    go.addEventListener('click', async () => {
      go.disabled = true; go.textContent = '올리는 중'; err.textContent = '';
      const fd = new FormData();
      fd.append('file', file.files[0]); fd.append('kind', kd.value); fd.append('name', nm.value.trim());
      try {
        const tok = session.get()?.token;
        const r = await fetch(API.prefix + '/shared/ledgers', { method: 'POST', body: fd, headers: tok ? { authorization: 'Bearer ' + tok } : {} });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error?.message || '올리지 못했습니다');
        m.close(true); toast('행정 자료를 올렸습니다'); reload('admin');
      } catch (e) { go.textContent = '올리기'; ready(); err.textContent = e?.message || '올리지 못했습니다'; }
    });
  }
  function openAdminEdit(x) {
    const nm = h('input.t-input', { type: 'text', maxlength: '60', value: x.name || '', 'aria-label': '이름' });
    const kd = kindSel(x.kind);
    const err = h('p.sd-err', { role: 'alert' });
    const save = h('button.t-btn', { type: 'button', text: '저장' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
    const m = modal({ title: '정보 고치기', body: h('div.sd-form', {},
      h('label', {}, h('span', { text: '이름' }), nm), h('label', {}, h('span', { text: '종류' }), kd), err, h('div.sd-act', {}, no, save)) });
    no.addEventListener('click', () => m.close());
    save.addEventListener('click', async () => {
      const b = {};
      if (nm.value.trim() !== (x.name || '')) b.name = nm.value.trim();
      if (kd.value !== x.kind) b.kind = kd.value;
      if (!Object.keys(b).length) { m.close(); return; }
      save.disabled = true;
      try { await api(`/shared/ledgers/${encodeURIComponent(x.id)}`, { method: 'PATCH', body: b }); m.close(true); toast('바꿨습니다'); reload('admin'); }
      catch (e) { save.disabled = false; err.textContent = e?.message || '바꾸지 못했습니다'; }
    });
  }

  /* ── 영상 ── */
  function row(x) {
    const im = h('span.sd-im');
    authPic(x.thumb).then((u) => { if (u) im.append(h('img', { src: u, alt: '', decoding: 'async' })); else im.classList.add('is-blank'); });
    const vis = visBtn(x.visible !== false, x.name, () => setVisible(x, vis));
    return h('tr', { dataset: { id: x.id } },
      h('td.sd-c-im', {}, im),
      h('td', {}, h('b', { text: x.name })),
      h('td', { text: x.region || '—' }),
      h('td.num', { text: x.year ? String(x.year) : '—' }),
      h('td', { text: x.kind || '—' }),
      h('td', {}, vis),
      doBtns(() => openEdit(x), () => askDrop('이 영상을 지울까요?', x.name,
        () => api(`/catalog/imagery/${encodeURIComponent(x.id)}`, { method: 'DELETE' }), () => reload('img'))));
  }
  async function setVisible(x, b) {
    const want = x.visible === false;
    b.disabled = true;
    try {
      await api(`/catalog/imagery/${encodeURIComponent(x.id)}`, { method: 'PATCH', body: { visible: want } });
      x.visible = want;
      toast(want ? '공개로 바꿨습니다' : '비공개로 바꿨습니다');
      draw();
    } catch (e) { b.disabled = false; toast(e?.message || '바꾸지 못했습니다'); }
  }
  function openEdit(x) {
    const nm = h('input.t-input', { type: 'text', maxlength: '80', value: x.name, 'aria-label': '이름' });
    const yr = h('input.t-input.sd-yr', { type: 'number', min: '1990', max: String(new Date().getFullYear() + 1), value: x.year ? String(x.year) : '', 'aria-label': '촬영 연도' });
    const err = h('p.sd-err', { role: 'alert' });
    const save = h('button.t-btn', { type: 'button', text: '저장' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
    const m = modal({ title: '정보 고치기', body: h('div.sd-form', {},
      h('label', {}, h('span', { text: '이름' }), nm), h('label', {}, h('span', { text: '촬영 연도' }), yr), err, h('div.sd-act', {}, no, save)) });
    no.addEventListener('click', () => m.close());
    save.addEventListener('click', async () => {
      const b = {};
      if (nm.value.trim() !== x.name) b.name = nm.value.trim();
      if (yr.value && +yr.value !== x.year) b.year = +yr.value;
      if (!Object.keys(b).length) { m.close(); return; }
      save.disabled = true;
      try { await api(`/catalog/imagery/${encodeURIComponent(x.id)}`, { method: 'PATCH', body: b }); m.close(true); toast('바꿨습니다'); reload('img'); }
      catch (e) { save.disabled = false; err.textContent = e?.message || '바꾸지 못했습니다'; }
    });
  }
  function openUpload() {
    const box = h('div.sd-up');
    const err = h('p.sd-err', { role: 'alert' });
    const reg = h('button.t-btn', { type: 'button', text: '영상 등록', disabled: true });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
    const m = modal({ title: UP.img, size: 'lg', body: h('div.sd-form', {}, box, err, h('div.sd-act', {}, no, reg)) });
    let qu = null, draft = null;
    const ready = () => { const its = qu ? qu.items().filter((i) => !['bad', 'cancel'].includes(i.state)) : []; reg.disabled = !draft || !its.length || qu.busy() || its.some((i) => i.state !== 'done'); };
    api(UPLOADS + '/formats').catch(() => FALLBACK).then((f) => {
      qu = uploadQueue(box, {
        base: UPLOADS,
        fields: () => ({ draft_id: draft || undefined }),
        allow: [...(f.raster || FALLBACK.raster), ...(f.sidecar || FALLBACK.sidecar)],
        max: f.limit?.size || 20e9,
        title: '영상 파일을 끌어 놓거나 눌러 고르세요',
        onStart: (s) => { if (s.draft_id) draft = s.draft_id; },
        onChange: ready,
      });
    });
    no.addEventListener('click', () => { qu?.clear(); m.close(); });
    reg.addEventListener('click', async () => {
      reg.disabled = true; reg.textContent = '영상 등록하는 중';
      try {
        const r = await api('/catalog/imagery', { method: 'POST', body: { draft_id: draft } });
        m.close(true);
        toast(`영상 ${nf((r.items || []).length)}장을 등록했습니다`);
        reload('img');
      } catch (e) { reg.textContent = '영상 등록'; reg.disabled = false; err.textContent = e?.message || '등록하지 못했습니다'; }
    });
  }
  return { load: () => { D.img = D.train = D.admin = null; load(); } };
}
