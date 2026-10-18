import { api, h } from './util.js';
import { toast } from './toast.js';

let css = false;
function style() {
  if (css) return; css = true;
  document.head.append(h('style', { text: `
.gs-bale{display:flex;flex-direction:column;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--rule)}
.gs-bale-l{margin:0;font:400 var(--fs-aux)/var(--lh-aux) var(--font-body);color:var(--ink-2)}
.gs-bale-l b{color:var(--ink);font-weight:600}
.gs-bale-f{display:flex;flex-direction:column;gap:6px}
.gs-bale-r{display:flex;align-items:center;gap:8px}
.gs-bale-f .t-label{margin:0}
.gs-bale-in{width:120px}
.gs-bale .gd-note{margin:0;font:400 var(--fs-aux)/var(--lh-aux) var(--font-body);color:var(--sub)}` }));
}
/* 곤포사일리지 생산량(10-18 영농-q2 ⓑ "기관이 1개당 무게를 넣으면 생산량도") — 생산량(kg) = 개수 × 1개당 무게(서버 셈 · 숫자 한 출처).
   무게가 없으면 개수만. 무게는 기관 관리자가 넣는다(기관마다 한 값 · PUT /spaces/me/settings/farm). */
export function baleBox(j, classes, onSaved) {
  style();
  const nf0 = (v) => Number(v || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  const kg = j.bale?.kg?.value ?? null;
  const rows = classes.filter((c) => /곤포/.test(c.name));
  const out = h('div.gs-bale');
  for (const c of rows) {
    const n = c.n?.value ?? 0;
    out.append(h('p.gs-bale-l', {}, h('b', { text: c.name }), ' ',
      h('span.num', { text: `${nf0(n)}개` }), kg ? h('span', { text: ` × ${nf0(kg)}kg = 생산량 ` }) : null,
      kg && c.yield ? h('b.num', { text: `${nf0(c.yield.value)}kg` }) : null));
  }
  if (j.bale?.can_edit) {
    const inp = h('input.t-input.gs-bale-in', { type: 'number', min: '0', max: '3000', step: '0.1', value: kg ?? '', placeholder: '예: 500', 'aria-label': '곤포사일리지 1개당 무게(kg)' });
    const save = h('button.t-btn.t-btn--2', { type: 'button', text: '저장' });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try { await api('/spaces/me/settings/farm', { method: 'PUT', body: { bale_kg: inp.value === '' ? null : Number(inp.value) } }); toast(inp.value === '' ? '무게를 지웠습니다 — 개수만 보입니다' : '무게를 저장했습니다'); onSaved?.(); }
      catch (e) { toast(e.message || '저장하지 못했습니다'); save.disabled = false; }
    });
    out.append(h('label.gs-bale-f', {}, h('span.t-label', { text: '곤포사일리지 1개당 무게(kg)' }), h('span.gs-bale-r', {}, inp, save)));
  }
  out.append(kg ? h('p.gd-note', { text: '생산량은 개수 × 기관이 넣은 1개당 무게입니다.' }) : h('p.gd-note', {}, '1개당 무게를 넣으면 생산량(kg)도 셉니다.', h('br'), '넣기 전에는 개수만 보입니다.'));
  return out;
}
