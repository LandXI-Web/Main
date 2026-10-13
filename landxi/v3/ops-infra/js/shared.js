/* LX 관리자 메뉴 '공유 데이터'(10-13 관리자-공유데이터 · 원칙 232 · 238) — 직원이 '공유 데이터에서 고르기'로 보는 영상 목록과 같은 목록.
   목록 = GET /projects/imagery?all=1(직원 목록과 한 출처 · 관리자는 비공개까지 · visible) · 찾기 · 한 페이지 12줄.
   올리기 = 영상 등록 그대로(조각 올리기 /catalog/imagery/uploads → POST /catalog/imagery {draft_id} — 새 프로젝트 창 · 데이터 올리기와 같은 길).
   정보 고치기(이름 · 촬영 연도) = PATCH /catalog/imagery/{id} · 공개/비공개(직원에게 보일지) = PATCH {visible} · 지우기(확인 한 번) = DELETE.
   새 말 · 새 아이콘 없음. 기관 계정에는 이 화면이 없다(LX 관리자 화면 관문). */
import { h, api, toast, empty, during, nf } from './kit.js';
import { session } from '../../../shared/api-v1.js';
import { API } from '../../kit/util.js';
import { modal } from '../../kit/modal.js';
import { uploadQueue } from '../../kit/dropzone.js';

const PER = 12;
const UPLOADS = '/catalog/imagery/uploads';
const FALLBACK = { raster: ['tif', 'tiff', 'jpg', 'jpeg', 'jp2', 'j2k', 'ecw', 'img'], sidecar: ['tfw', 'tifw', 'jgw', 'jpgw', 'jpw', 'j2w', 'wld', 'eww', 'prj', 'aux.xml', 'ovr'] };
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

export function mountShared(root) {
  sheet();
  let all = null, page = 1;
  const q = h('input.t-input.sd-q', { type: 'search', placeholder: '영상 이름 · 지역 · 연도', 'aria-label': '영상 찾기', autocomplete: 'off' });
  const up = h('button.t-btn', { type: 'button', text: '영상 올리기', onclick: () => openUpload() });
  const count = h('small.sd-n.num');
  const body = h('div.sd-body');
  const pager = h('nav.sd-pg', { 'aria-label': '페이지' });
  root.append(h('section.t-card.sd-card', { 'aria-label': '공유 데이터' },
    h('header.sd-h', {}, h('h2', {}, '공유 데이터', count), h('div.sd-tools', {}, q, up)), body, pager));
  q.addEventListener('input', () => { page = 1; draw(); });

  async function load() {
    try { all = (await during(api('/projects/imagery?all=1'))).items || []; }
    catch (e) { body.replaceChildren(); const x = h('div'); body.append(x); empty(x, { kind: 'error', compact: true, title: '영상 목록을 불러오지 못했습니다', onRetry: load }); return; }
    draw();
  }
  function draw() {
    const s = q.value.replace(/\s+/g, '');
    const rows = all.filter((x) => !s || [x.name, x.region, x.year, x.kind].some((v) => String(v ?? '').replace(/\s+/g, '').includes(s)));
    count.textContent = `영상 ${nf(all.length)}장`;
    const pages = Math.max(1, Math.ceil(rows.length / PER));
    page = Math.min(page, pages);
    const from = (page - 1) * PER;
    if (!rows.length) { body.replaceChildren(h('p.sd-none', { text: all.length ? '맞는 영상이 없습니다' : '아직 영상이 없습니다' })); pager.replaceChildren(); return; }
    body.replaceChildren(h('div.sd-tbl-w', {}, h('table.sd-tbl', {},
      h('thead', {}, h('tr', {}, ...['', '이름', '지역', '연도', '종류', '직원에게', ''].map((t) => h('th', { text: t })))),
      h('tbody', {}, ...rows.slice(from, from + PER).map(row)))));
    pager.replaceChildren(...(pages > 1 ? [
      h('button', { type: 'button', text: '‹ 앞', disabled: page <= 1 || undefined, onclick: () => { page--; draw(); } }),
      h('span.num', { text: `${page} / ${pages}` }),
      h('button', { type: 'button', text: '다음 ›', disabled: page >= pages || undefined, onclick: () => { page++; draw(); } })] : []));
  }
  function row(x) {
    const im = h('span.sd-im');
    authPic(x.thumb).then((u) => { if (u) im.append(h('img', { src: u, alt: '', decoding: 'async' })); else im.classList.add('is-blank'); });
    const vis = h('button.sd-vis', { type: 'button', 'aria-pressed': String(x.visible !== false), text: x.visible !== false ? '공개' : '비공개',
      'aria-label': `${x.name} 직원에게 ${x.visible !== false ? '공개' : '비공개'}`, onclick: () => setVisible(x, vis) });
    return h('tr', { dataset: { id: x.id } },
      h('td.sd-c-im', {}, im),
      h('td', {}, h('b', { text: x.name })),
      h('td', { text: x.region || '—' }),
      h('td.num', { text: x.year ? String(x.year) : '—' }),
      h('td', { text: x.kind || '—' }),
      h('td', {}, vis),
      h('td.sd-do', {}, h('button.t-btn.t-btn--2', { type: 'button', text: '정보 고치기', onclick: () => openEdit(x) }),
        h('button.t-btn.t-btn--2', { type: 'button', text: '지우기', onclick: () => askDelete(x) })));
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
      try { await api(`/catalog/imagery/${encodeURIComponent(x.id)}`, { method: 'PATCH', body: b }); m.close(true); toast('바꿨습니다'); load(); }
      catch (e) { save.disabled = false; err.textContent = e?.message || '바꾸지 못했습니다'; }
    });
  }
  function askDelete(x) {
    const go = h('button.t-btn', { type: 'button', text: '지우기' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
    const err = h('p.sd-err', { role: 'alert' });
    const m = modal({ title: '이 영상을 지울까요?', body: h('div.sd-form', {}, h('p.sd-del', { text: x.name }), err, h('div.sd-act', {}, no, go)) });
    no.addEventListener('click', () => m.close());
    go.addEventListener('click', async () => {
      go.disabled = true;
      try { await api(`/catalog/imagery/${encodeURIComponent(x.id)}`, { method: 'DELETE' }); m.close(true); toast('지웠습니다'); load(); }
      catch (e) { go.disabled = false; err.textContent = e?.message || '지우지 못했습니다'; }
    });
  }
  function openUpload() {
    const box = h('div.sd-up');
    const err = h('p.sd-err', { role: 'alert' });
    const reg = h('button.t-btn', { type: 'button', text: '영상 등록', disabled: true });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
    const m = modal({ title: '영상 올리기', size: 'lg', body: h('div.sd-form', {}, box, err, h('div.sd-act', {}, no, reg)) });
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
        load();
      } catch (e) { reg.textContent = '영상 등록'; reg.disabled = false; err.textContent = e?.message || '등록하지 못했습니다'; }
    });
  }
  return { load };
}
