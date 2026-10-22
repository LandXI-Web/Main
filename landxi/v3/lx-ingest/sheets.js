/* lx-ingest sheets.js — 영상 등록 시트 · 대장 형식 시트(K5 서랍 · K11 드롭존 · K13 토스트).
   영상 등록 = 파일 끌어 놓기(구현 4차 fixes · 확인 대장 1차 FR-1 '기존 자산 기준으로' · 원칙 41 · 49 · 사용자 규칙 2 파일 경로 노출 금지):
     기관 분석 요청과 같은 조각 올리기(kit/dropzone.js uploadQueue) — 여러 파일 · 파일마다 진행 막대 · 멈춤 · 이어 올리기 · 취소.
     촬영 연도 · 해상도 · 위치는 서버가 파일에서 읽는다(입력 칸 없음 · 연도가 파일에 없으면 '촬영 연도 모름'). 다 올리면 저절로 등록 →
     시트가 닫히고 그 지역 서랍 '영상'에 새 줄(다른 지역 영상이면 그 지역으로). 시트를 닫아도 올리기는 이어지고, 다시 열면 같은 목록이다.
     못 읽는 파일은 고르는 순간 · 등록할 때 창 하나로 알린다(구현 확인 3차 M-2 · 원칙 109). 서버 경로 등록은 LX 관리자 도구로만.
   대장 형식(대장 종류 · 열 이름 → 뜻 · 저장).
   K5 스택 규칙 '같은 자리 이전 서랍 닫힘': 시트가 열려 있는 동안 지역 서랍(under)은 숨기고, 시트가 닫히면 되돌린다. */
import * as K from '../kit/index.js';
import { uploadQueue, fileProblem } from '../kit/dropzone.js';
import * as D from './data.js';
import { API, session } from '../kit/util.js';

const field = (label, input) => K.h('label.lxi-f', {}, K.h('span.t-label', { text: label }), input);
const fail = (retry, why) => K.toast(why || '등록하지 못했습니다', { action: { label: '다시 시도', onClick: retry } });

/** 지역 서랍 숨김 ↔ 복원(시트 닫힘 한 번만) */
function stack(under) {
  under?.el.classList.add('lxi-under');
  let back = false;
  return () => { if (back) return; back = true; under?.el.classList.remove('lxi-under'); };
}

/* ── 영상 등록 ─────────────────────────────────────────────────────────────
   올리는 칸 하나를 이 화면이 열려 있는 동안 유지한다(시트를 닫았다 열어도 같은 목록 · 올리기는 이어진다). */
const HINT = '촬영 연도 · 해상도 · 위치는 파일에서 읽습니다';
const UP = { box: null, q: null, st: null, bar: null, draft: null, key: '', busy: false, near: null, onDone: null, sheet: null, restore: null };

function imageryBox() {
  if (UP.box) return UP.box;
  const queue = K.h('div.lxi-up-q');
  UP.st = K.h('p.lxi-up-s', { role: 'status', text: HINT });
  UP.bar = K.h('div.t-progress.lxi-bar.is-indet', { hidden: true, role: 'progressbar', 'aria-label': '등록하는 중' }, K.h('i'));
  UP.box = K.h('div.lxi-up', {}, queue, UP.st, UP.bar);
  D.formats().then((f) => {
    UP.q = uploadQueue(queue, {
      base: D.UPLOADS,
      fields: () => ({ draft_id: UP.draft || undefined }),
      allow: [...(f.raster || []), ...(f.sidecar || [])],
      max: f.limit?.size || 20e9,
      title: '영상 파일을 끌어 놓거나 눌러 고르세요',
      kinds: ['여러 장도 한 번에 넣을 수 있습니다', '위치 파일(TFW 등)이 있으면 함께 넣어 주세요'],
      onStart: (s) => { if (s.draft_id) UP.draft = s.draft_id; },
      onChange: (items) => { register(items); },
    });
  });
  return UP.box;
}

/* 다 올라가면(멈춘 · 올리는 중인 파일 없이) 저절로 등록 — 같은 묶음을 두 번 보내지 않는다 */
async function register(items) {
  if (!UP.q || UP.busy || !UP.draft || UP.q.busy()) return;
  const done = items.filter((i) => i.state === 'done');
  if (!done.length || done.length !== items.filter((i) => i.state !== 'bad').length) return;
  const key = UP.draft + ':' + done.map((i) => i.id).join(',');
  if (key === UP.key) return;
  UP.key = key;
  UP.busy = true;
  UP.st.textContent = '올린 영상을 살펴보고 등록하는 중';
  UP.bar.hidden = false;
  try {
    const out = await D.registerDraft(UP.draft, UP.near?.sgg_cd);
    const its = out.items || [];
    const where = [...new Set(its.map((x) => x.region).filter(Boolean))].join(' · ');
    K.toast(`${where} ${D.kindWord(its[0]?.gsd_m)} ${its.length}장을 등록했습니다`);
    UP.q.clear(); UP.draft = null; UP.key = '';
    UP.st.textContent = HINT;
    if (UP.sheet?.el.isConnected) { UP.sheet.close(true); UP.restore?.(); }
    UP.onDone?.(out);
  } catch (e) {
    K.devlog('imagery register', e.code || e.message);
    UP.st.textContent = '등록하지 못한 파일이 있습니다 — 빼거나 다른 파일로 바꿔 주세요';
    const names = e.detail?.files?.length ? e.detail.files : done.map((i) => i.file.name);
    const why = (n) => e.detail?.reasons?.[n] || e.message || '등록하지 못했습니다';
    fileProblem({
      files: names.map((n) => ({ name: n, why: why(n) })),
      title: e.code === 'mixed' ? '등록할 수 없는 파일이 있습니다' : undefined,
      onPick: () => {                                   // 안 맞는 파일은 빼고(서버에서도 지운다) 다른 파일을 고른다
        for (const it of UP.q.items()) if (names.includes(it.file.name)) it.el.querySelector('.x')?.click();
        UP.q.input.click();
      },
    });
  } finally {
    UP.busy = false;
    UP.bar.hidden = true;
  }
}

/** 영상 등록 — 파일 끌어 놓기(조각 올리기 /catalog/imagery/uploads → POST /catalog/imagery {draft_id}) */
export function imagerySheet({ host, region, under, onDone }) {
  UP.near = region; UP.onDone = onDone;
  const body = imageryBox();
  const restore = stack(under);
  const d = K.drawer({ title: '영상 등록', body, host, slot: 'sheet', onClose: restore });
  d.el.classList.add('lxi-sheet');
  UP.sheet = d; UP.restore = restore;
  return d;
}

/** 대장 형식 — PUT /registry/cards/{id}/ledger_schema(S-6) · 견본 파일을 놓으면 열 이름을 읽어 고르게 한다 */
export function ledgerSheet({ host, under, onDone }) {
  const kind = K.h('select.t-input', { name: 'kind' }, ...D.LEDGER_KINDS.map((k, i) => K.h('option', { value: String(i), text: k.label })));
  const drop = K.h('div.lxi-drop');
  const map = K.h('div.lxi-map');
  const go = K.h('button.t-btn.lxi-go', { type: 'submit', text: '저장' });
  const form = K.h('form.lxi-form', { novalidate: true }, field('대장 종류', kind), drop, K.h('div.lxi-map-w', {}, K.h('span.t-label', { text: '열 이름 → 뜻' }), map), go);
  const restore = stack(under);
  const d = K.drawer({ title: '대장 형식', body: form, host, slot: 'sheet', onClose: restore });
  d.el.classList.add('lxi-sheet');

  let headers = [];
  const HINT = { pnu: /pnu|필지.?코드|고유번호/i, jibun: /지번|jibun|번지|소재지/i, status: /상태|state|status|현황|경작|여부/i, date: /일자|날짜|date|기준일|허가일|등록일/i };
  const guess = (role) => headers.find((h) => HINT[role].test(h)) || '';
  let drawn = 0;
  const draw = async () => {
    const my = ++drawn;
    const k = D.LEDGER_KINDS[+kind.value];
    const saved = await D.cardSchema(k.card);
    if (my !== drawn) return;
    const got = new Map(saved?.kind === k.kind ? (saved.columns || []).map((c) => [c.role, c.label || c.key]) : []);
    map.replaceChildren(...D.MEANINGS.map((m) => {
      const v = (headers.length ? guess(m.role) : '') || got.get(m.role) || '';
      const inp = headers.length
        ? K.h('select.t-input', { name: m.role, 'aria-label': m.label }, K.h('option', { value: '', text: '—' }), ...headers.map((h) => K.h('option', { value: h, text: h, selected: h === v || undefined })))
        : K.h('input.t-input', { type: 'text', name: m.role, value: v, autocomplete: 'off', spellcheck: 'false', 'aria-label': m.label });
      return K.h('div.lxi-m', {}, inp, K.h('span.lxi-arrow', { 'aria-hidden': 'true', text: '→' }), K.h('span.lxi-mean', { text: m.label }));
    }));
  };
  kind.addEventListener('change', draw);
  K.dropzone(drop, {
    onFile: async (file, prog) => {
      prog(0.3);
      let cols = [];
      if (/\.csv$/i.test(file.name)) cols = (await file.slice(0, 64 * 1024).text()).split(/\r?\n/)[0].replace(/^﻿/, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      else if (/\.geojson$/i.test(file.name)) { try { cols = Object.keys(JSON.parse(await file.text()).features?.[0]?.properties || {}); } catch { cols = []; } }
      prog(0.9);
      return { cols };
    },
    onDone: (out) => { headers = out?.cols || []; draw(); },
    onError: () => {},
  });
  draw();
  const submit = async () => {
    const k = D.LEDGER_KINDS[+kind.value];
    const columns = D.MEANINGS.map((m) => ({ role: m.role, name: (map.querySelector(`[name="${m.role}"]`)?.value || '').trim() })).filter((c) => c.name);
    if (!columns.some((c) => c.role === 'pnu' || c.role === 'jibun')) { const f = map.querySelector('[name="pnu"]'); f?.setAttribute('aria-invalid', 'true'); f?.focus(); return; }
    go.disabled = true;
    try {
      await D.saveLedgerSchema({ kind: k.kind, card: k.card, columns });
      d.close(true); restore();
      K.toast('등록했습니다');
      onDone?.();
    } catch (e) {
      K.devlog('ledger schema', e.code || e.message);
      go.disabled = false;
      fail(submit, /성명|연락처/.test(e.message || '') ? '성명·연락처 열은 넣을 수 없습니다' : null);
    }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  return d;
}


/* ── 벡터 등록(10-22 CHANGE-DEMO P0-3 · G7) — 구역선 · 필지 목록을 이 프로젝트의 대상지(분석 범위)로 ─────────────────────
   구역선(선 · 면 — geojson · shp 압축 · gpkg) + 버퍼 m → 서버가 범위(EPSG:5179)로 저장 · 좌표계 없는 연속지적도는 벨트를 스스로 찾는다.
   필지 목록(txt · csv의 PNU 19자리) → 그 필지 면을 합친 범위. 등록하면 국토 변화 분석서비스 · XI ChatGEO 가 이 범위를 쓴다. */
export function vectorSheet({ host, under, project, onDone }) {
  const kind = K.h('select.t-input', { name: 'kind', 'aria-label': '종류' }, K.h('option', { value: 'line', text: '구역선(도로구역 · 철도용지 등)' }), K.h('option', { value: 'pnu', text: '필지 목록(PNU)' }));
  const buf = K.h('input.t-input', { type: 'number', min: '0', max: '1000', step: '10', value: '50', name: 'buffer_m', 'aria-label': '버퍼(m)' });
  const file = K.h('input', { type: 'file', name: 'file', accept: '.geojson,.json,.zip,.gpkg,.txt,.csv', 'aria-label': '파일' });
  const out = K.h('p.lxi-vec-s', { 'aria-live': 'polite' });
  const go = K.h('button.t-btn.lxi-go', { type: 'submit', text: '등록' });
  const form = K.h('form.lxi-form', { novalidate: true }, field('종류', kind), field('파일', file), field('버퍼(m)', buf), out, go);
  const restore = stack(under);
  const d = K.drawer({ title: '벡터 등록', body: form, host, slot: 'sheet', onClose: restore });
  d.el.classList.add('lxi-sheet');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = file.files?.[0];
    if (!f) { out.textContent = '파일을 골라 주세요'; return; }
    go.disabled = true; out.textContent = '범위를 만드는 중';
    try {
      const fd = new FormData();
      fd.append('file', f); fd.append('buffer_m', String(Math.max(0, +buf.value || 0))); fd.append('name', f.name.replace(/\.[^.]+$/, '')); if (project) fd.append('project_id', project);
      const s = session.get();
      const r = await fetch(API.prefix + '/change/ranges', { method: 'POST', body: fd, headers: s ? { authorization: 'Bearer ' + s.token } : {} });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || '등록하지 못했습니다');
      out.textContent = `${j.kind_label} · 버퍼 ${j.buffer} · 범위 ${Number(j.area?.value ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}㎢ · 영상 ${(j.imagery_years || []).map((y) => y.label).join(' · ')}`;
      K.toast('대상지를 등록했습니다', { action: { label: '지도에서 보기', href: new URL('../lx-map/?' + new URLSearchParams({ ...(project ? { project } : {}), range: j.id }), import.meta.url).href } });
      onDone?.(j);
    } catch (err) { out.textContent = err.message || '등록하지 못했습니다'; }
    finally { go.disabled = false; }
  });
  return d;
}
