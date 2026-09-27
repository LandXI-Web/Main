/* lx-ingest sheets.js — 영상 등록 시트 · 대장 형식 시트(K5 서랍 · K11 드롭존 · K13 토스트).
   문구는 명세 §2.4 그대로: 영상 등록(파일 또는 경로 · 촬영 연도 · 해상도 · 등록) / 대장 형식(대장 종류 · 열 이름 → 뜻 · 저장).
   K5 스택 규칙 '같은 자리 이전 서랍 닫힘': 시트가 열려 있는 동안 지역 서랍(under)은 숨기고, 시트가 닫히면 되돌린다. */
import * as K from '../kit/index.js';
import * as D from './data.js';

const RES = [0.05, 0.12, 0.25, 0.5, 1, 2];
const field = (label, input) => K.h('label.lxi-f', {}, K.h('span.t-label', { text: label }), input);
const fail = (retry, why) => K.toast(why || '등록하지 못했습니다', { action: { label: '다시 시도', onClick: retry } });

/** 지역 서랍 숨김 ↔ 복원(시트 닫힘 한 번만) */
function stack(under) {
  under?.el.classList.add('lxi-under');
  let back = false;
  return () => { if (back) return; back = true; under?.el.classList.remove('lxi-under'); };
}

/** 영상 등록 — POST /catalog/imagery(S-5) */
export function imagerySheet({ host, region, under, onDone }) {
  const path = K.h('input.t-input', { type: 'text', name: 'path', autocomplete: 'off', spellcheck: 'false', required: true });
  const year = K.h('input.t-input', { type: 'number', name: 'year', min: '1990', max: String(new Date().getFullYear()), value: String(new Date().getFullYear()), inputmode: 'numeric' });
  const res = K.h('select.t-input', { name: 'gsd' }, ...RES.map((g) => K.h('option', { value: String(g), text: D.resText(g), selected: g === 0.25 || undefined })));
  const go = K.h('button.t-btn.lxi-go', { type: 'submit', text: '등록' });
  const form = K.h('form.lxi-form', { novalidate: true }, field('파일 또는 경로', path), K.h('div.lxi-row2', {}, field('촬영 연도', year), field('해상도', res)), go);
  const restore = stack(under);
  const d = K.drawer({ title: '영상 등록', body: form, host, slot: 'sheet', onClose: restore });
  d.el.classList.add('lxi-sheet');
  setTimeout(() => path.focus(), 380);
  const submit = async () => {
    if (!path.value.trim()) { path.setAttribute('aria-invalid', 'true'); path.focus(); return; }
    path.removeAttribute('aria-invalid');
    go.disabled = true;
    try {
      const out = await D.registerImagery({ region, path: path.value.trim(), year: +year.value, gsd: +res.value });
      d.close(true); restore();
      K.toast('등록했습니다');
      onDone?.(out);
    } catch (e) {
      K.devlog('imagery register', e.code || e.message);
      go.disabled = false;
      const why = D.imageryReason(e);
      if (why && /경로|파일/.test(why)) path.setAttribute('aria-invalid', 'true');
      fail(submit, why);
    }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
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
