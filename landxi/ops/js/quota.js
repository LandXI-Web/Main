/* 쿼터 링 6차원 — 사용 실측 vs 한도[추정 기반 초기값] · 여유 구간 · 초과 예상 월 [추정] 점선 고스트 · 슬라이더 → 링 500 → PUT(사유) */
import { h, t, fmt, setText, prov, tag, SRC, write, guardWrite, toast, errText } from './boot.js';
import { ring } from './rings.js';

export const DIMS = ['storage_gb', 'gpu_s_month', 'area_km2_month', 'concurrent_jobs', 'egress_gb_month', 'vworld_calls_day'];
const MONTHLY = new Set(['gpu_s_month', 'area_km2_month', 'egress_gb_month']);
const UNIT = { storage_gb: 'GB', gpu_s_month: 'gpu_s', area_km2_month: 'km²', concurrent_jobs: '건', egress_gb_month: 'GB', vworld_calls_day: '회' };

/** 선형 예측(quota.estimator 와 같은 식) — 월 누계 ÷ 경과일 × 월 일수. 월 단위 차원만. [추정] */
export function project(dim, used) {
  if (!MONTHLY.has(dim) || used == null) return null;
  const d = new Date(); const day = d.getDate(); const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return used / day * n;
}
export const monthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
function scaleOf(dim, q, draft) {
  const used = q.used?.value ?? 0; const pj = project(dim, used) ?? 0; const hard = draft?.hard ?? q.hard; const soft = draft?.soft ?? q.soft;
  const ref = Math.max(hard ?? 0, soft ?? 0, pj, used);
  if (!ref) return 10;
  return hard != null ? Math.max(hard, pj, used) * 1.12 : ref * 1.6;
}

export function quotaRing(host, dim, { size = 116, onPick } = {}) {
  const btn = h('button', { class: 'tn-ring', type: 'button', 'aria-pressed': 'false', 'data-dim': dim, onclick: () => onPick && onPick(dim) });
  host.append(btn);
  const r = ring(btn, { size, stroke: 6, label: t('dims.' + dim, dim) });
  const big = h('b', {}, '—'); const sub = h('span', {}, '—'); r.center.append(big, sub);
  const name = h('div', { class: 'tn-dim' }, t('dims.' + dim, dim)); const pol = h('div', { class: 'tn-pol' }, '—'); const ghost = h('div', { class: 'tn-ghost', hidden: true });
  btn.append(name, pol, ghost);
  let scale = null;
  return {
    el: btn,
    draw(q, draft = null, { rescale = false } = {}) {
      if (!q) return;
      const used = q.used?.value; const hard = draft?.hard !== undefined ? draft.hard : q.hard; const soft = draft?.soft !== undefined ? draft.soft : q.soft;
      if (scale == null || rescale) scale = scaleOf(dim, q, draft);
      const S = scale; const f = (v) => (v == null ? null : Math.min(1, v / S));
      if (used == null) {
        r.set({ segs: [], ticks: [hard != null ? { kind: 'hard', at: f(hard) } : null, soft != null ? { kind: 'soft', at: f(soft) } : null].filter(Boolean) }).state({ void: true });
        setText(big, '—'); setText(sub, q.used?.note ? '계량 전' : '없음'); btn.title = `${t('dims.' + dim)} · ${q.used?.note || '결손'}`;
      } else {
        const pj = project(dim, used); const over = hard != null && pj != null && pj > hard;
        r.set({ segs: [
          ...(hard != null ? [{ id: 'room', kind: 'room', from: f(used), to: f(hard), title: `여유 ${fmt(hard - used)} ${UNIT[dim]}` }] : []),
          { id: 'used', kind: 'value', from: 0, to: f(used), title: `사용 ${fmt(used)} ${UNIT[dim]} · 실측` }],
        ticks: [hard != null ? { kind: 'hard', at: f(hard) } : null, soft != null ? { kind: 'soft', at: f(soft) } : null, hard != null ? { kind: 'caution', at: f(hard * 0.8) } : null].filter(Boolean),
        ghost: pj != null && pj > used ? { from: f(used), to: f(pj), caution: over } : null })
          .state({ caution: hard != null && used / hard > 0.8, fault: hard != null && used > hard, void: false });
        setText(big, fmt(used, Number.isInteger(used) ? 0 : 1));
        setText(sub, hard == null ? '/ 무제한' : `/ ${fmt(hard)}`);
        ghost.hidden = pj == null; ghost.dataset.caution = over ? '1' : '0';
        if (pj != null) ghost.textContent = over ? `초과 예상 ${monthKey()} [추정]` : `월말 ${fmt(Math.round(pj))} [추정]`;
        btn.title = `${t('dims.' + dim)} · 사용 ${fmt(used)} ${UNIT[dim]} (${q.used.basis === 'measured' ? '실측' : q.used.basis}) · ${q.used.source}${q.used.note ? ' · ' + q.used.note : ''}`;
      }
      pol.textContent = `${t('policy.' + (draft?.policy || q.policy), q.policy)}${q.note ? ' · ' + (hard == null ? '무제한' : '[추정 기반 초기값]') : ''}`;
    },
    press(on) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); },
  };
}

/** 한도 편집 판 — 슬라이더(soft · hard) · 정책 · 사유(필수) · 저장(PUT /tenants/{id}/quota) */
export function quotaEditor(host, { onDraft, onSaved } = {}) {
  const box = h('div', { class: 'tn-edit' }); host.append(box);
  let cur = null;
  const open = (tenantId, dim, q) => {
    const used = q.used?.value ?? 0; const pj = project(dim, used) ?? used;
    const max = Math.max(10, Math.ceil(Math.max(q.hard ?? 0, pj * 2, used * 2, dim === 'gpu_s_month' ? 10000 : 10) / 100) * 100);
    const step = max > 1000 ? 100 : max > 100 ? 10 : 1;
    const draft = { soft: q.soft ?? Math.round(max * 0.4 / step) * step, hard: q.hard ?? Math.round(max * 0.5 / step) * step, policy: q.policy };
    cur = { tenantId, dim, q, draft };
    const vSoft = h('b', { class: 'og-num' }, fmt(draft.soft)); const vHard = h('b', { class: 'og-num' }, fmt(draft.hard));
    const sSoft = h('input', { type: 'range', min: 0, max, step, value: draft.soft, 'aria-label': 'soft 한도' });
    const sHard = h('input', { type: 'range', min: 0, max, step, value: draft.hard, 'aria-label': 'hard 한도' });
    const pol = h('select', { class: 'og-select', 'aria-label': '초과 정책' }, ...['queue_low', 'reject', 'notify'].map((p) => h('option', { value: p, ...(p === draft.policy ? { selected: true } : {}) }, t('policy.' + p, p))));
    const reason = h('input', { class: 'og-input', placeholder: '변경 사유(필수 · 결재·감사 기록에 남는다)', 'aria-label': '변경 사유' });
    const save = h('button', { class: 'og-btn is-primary', type: 'button' }, '저장 · 결재');
    const msg = h('span', { class: 'og-why' }, SRC.writable ? '' : SRC.why);
    let touched = false;
    const upd = () => {
      draft.soft = Number(sSoft.value); draft.hard = Number(sHard.value); if (draft.soft > draft.hard) { draft.soft = draft.hard; sSoft.value = draft.hard; }
      draft.policy = pol.value; setText(vSoft, fmt(draft.soft)); setText(vHard, fmt(draft.hard)); if (touched) onDraft && onDraft(tenantId, dim, { ...draft });
    };
    const touch = () => { touched = true; upd(); };
    sSoft.addEventListener('input', touch); sHard.addEventListener('input', touch); pol.addEventListener('change', touch);
    save.addEventListener('click', async () => {
      if (!reason.value.trim()) { reason.focus(); reason.setAttribute('aria-invalid', 'true'); msg.textContent = '사유가 필요하다'; return; }
      save.disabled = true;
      try {
        const r = await write(`/tenants/${tenantId}/quota`, 'PUT', { dims: { [dim]: { soft: draft.soft, hard: draft.hard, policy: draft.policy } }, reason: reason.value.trim() });
        toast(`<b>한도 저장</b> · ${tenantId} · ${t('dims.' + dim)} soft ${fmt(draft.soft)} / hard ${fmt(draft.hard)} · 결재 ${r.approval?.id || ''}`);
        onSaved && onSaved(tenantId, dim, r); reason.value = ''; msg.textContent = '';
      } catch (e) { msg.textContent = errText(e); toast(`<b>저장 실패</b> · ${errText(e)}`, 'err'); }
      finally { save.disabled = !SRC.writable; }
    });
    guardWrite(save); if (!SRC.writable) { sSoft.disabled = sHard.disabled = pol.disabled = reason.disabled = true; }
    box.replaceChildren(
      h('div', { class: 'tn-sl' }, h('div', { class: 'pn-row' }, h('span', { class: 'og-lbl' }, `${t('dims.' + dim)} · soft`), vSoft, h('span', { class: 'og-lbl' }, UNIT[dim])), sSoft),
      h('div', { class: 'tn-sl' }, h('div', { class: 'pn-row' }, h('span', { class: 'og-lbl' }, 'hard'), vHard, h('span', { class: 'og-lbl' }, UNIT[dim]), tag('estimate', '[추정 기반 초기값]')), sHard),
      h('div', { class: 'tn-sl' }, h('span', { class: 'og-lbl' }, '초과 정책'), pol),
      h('div', { class: 'tn-save' }, reason, save, msg));
    upd();
  };
  return { el: box, open, get cur() { return cur; } };
}
