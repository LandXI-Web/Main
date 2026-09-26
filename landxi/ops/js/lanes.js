/* 작업 대기열 — 큐 행(취소 · 재큐 · 우선순위 실동작) + 스윔레인(행 = 워커 · 가로 30분 · 블록 = job · 기관 색) + 리더선(배정 순간 380 --e-ui).
 * 값이 바뀔 때만 다시 그린다: queue.sample · job.state · (실행 중 블록의 끝 = 수신 시각, 2s 샘플 때만 늘어난다). */
import { h, t, hhmmss, setText, write, guardWrite, confirmBox, toast, errText, SRC } from './boot.js';
const focusJob = () => new URLSearchParams(location.search).get('job');   // F1-∑ — ?job= 딥링크(렌더마다 읽어 replaceState 도 따라간다)

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, a = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
const WIN = 30 * 60e3;

export function swimlanes(host, { workers = ['a6000-0', 'a6000-1', 'cpu-0'], height = 30 } = {}) {
  const wrap = h('div', { class: 'ln' }); host.append(wrap);
  const W = () => Math.max(320, wrap.clientWidth - 28); const LBL = 78;
  let svg = null; let lanes = []; let seen = new Set(); let now = Date.now();
  const draw = () => {
    const w = W(); const H = workers.length * (height + 8) + 26;
    if (!svg) { svg = sv('svg', { height: H, role: 'img', 'aria-label': '작업 대기열 스윔레인 · 최근 30분' }); wrap.append(svg); }
    svg.setAttribute('viewBox', `0 0 ${w} ${H}`); svg.setAttribute('width', w); svg.replaceChildren();
    const x = (ms) => LBL + ((ms - (now - WIN)) / WIN) * (w - LBL - 4);
    workers.forEach((wk, i) => {
      const y = 4 + i * (height + 8);
      svg.append(sv('rect', { class: 'ln-row', x: LBL, y, width: w - LBL - 4, height }));
      const tx = sv('text', { class: 'ln-lbl', x: 0, y: y + height / 2 + 5 }); tx.textContent = wk; svg.append(tx);
      svg.dataset['y' + i] = y;
      const lane = lanes.find((l) => l.worker === wk);
      for (const b of lane?.blocks || []) {
        const f = Date.parse(b.from); const to = b.to ? Date.parse(b.to) : now; if (to < now - WIN) continue;
        const x0 = Math.max(LBL, x(f)); const x1 = Math.max(x0 + 3, x(to));
        const key = wk + b.job_id + b.from;
        const r = sv('rect', { class: 'ln-blk' + (seen.has(key) ? '' : ' is-new'), x: x0, y: y + 4, width: x1 - x0, height: height - 8, 'data-state': b.state, 'data-tenant': b.tenant_id, 'data-job': b.job_id });
        r.append(Object.assign(sv('title'), { textContent: `${b.job_id} · ${b.tenant_id} · ${t('job_state.' + b.state, b.state)} · ${hhmmss(b.from)}–${b.to ? hhmmss(b.to) : '실행 중'}${b.via ? ' · ' + b.via : ''}` }));
        svg.append(r); seen.add(key);
      }
    });
    const yA = workers.length * (height + 8) + 6;
    for (let m = 0; m <= 30; m += 5) { const xx = x(now - WIN + m * 60e3); svg.append(sv('line', { class: 'ln-axis', x1: xx, x2: xx, y1: yA, y2: yA + 5 })); const tx = sv('text', { class: 'ln-lbl', x: xx - (m === 30 ? 26 : m === 0 ? 0 : 14), y: yA + 20 }); tx.textContent = m === 30 ? '지금' : `-${30 - m}분`; svg.append(tx); }
    svg.append(sv('line', { class: 'ln-now', x1: x(now), x2: x(now), y1: 0, y2: yA }));
  };
  new ResizeObserver(() => draw()).observe(wrap);
  return {
    el: wrap,
    set(q) { lanes = q?.lanes || []; now = Date.now(); draw(); },
    tick() { if (lanes.some((l) => l.blocks.some((b) => !b.to))) { now = Date.now(); draw(); } },
    rowY(worker) { const i = workers.indexOf(worker); return i < 0 ? null : 4 + i * (height + 8); },
  };
}

/** 큐 행 — GET /jobs + job.state. 버튼은 계약 §4.4 POST /jobs/{id}/cancel|requeue|priority */
export function queueRows(host, { onChange } = {}) {
  const box = h('div', { class: 'q-rows' }); host.append(box);
  const jobs = new Map();
  const render = () => {
    const list = [...jobs.values()].sort((a, b) => ({ running: 0, queued: 1 }[a.state] ?? 2) - ({ running: 0, queued: 1 }[b.state] ?? 2) || String(b.created_at || b.at).localeCompare(String(a.created_at || a.at))).slice(0, 5);
    const keep = new Set(list.map((j) => j.id));
    for (const el of [...box.children]) if (!keep.has(el.dataset.job)) el.remove();
    if (!list.length) { if (!box.querySelector('.q-empty')) box.replaceChildren(h('div', { class: 'q-empty og-note' }, '대기열 비어 있음 · job 0 — 제출되면 여기에 행이 서고 노드로 리더선이 간다')); return; }
    box.querySelector('.q-empty')?.remove();
    list.forEach((j, i) => {
      let row = box.querySelector(`[data-job="${j.id}"]`);
      if (!row) { row = h('div', { class: 'q-row is-new', 'data-job': j.id }); box.insertBefore(row, box.children[i] || null); }
      else if (box.children[i] !== row) box.insertBefore(row, box.children[i] || null);
      row.classList.toggle('is-focus', !!j.id && j.id === focusJob());   // F1-∑ — XI맵에서 ?job= 로 넘어온 같은 작업
      const sig = [j.state, j.priority, j.shards_done, j.shards_total].join('|'); if (row.dataset.sig === sig) return; row.dataset.sig = sig;
      const st = h('span', { class: 'q-st', 'data-s': j.state }, t('job_state.' + j.state, j.state));
      const prog = j.shards_total ? `${(j.shards_done ?? 0).toLocaleString('ko-KR')}/${j.shards_total.toLocaleString('ko-KR')} shard` : '';
      const act = h('div', { class: 'q-act' });
      const btn = (label, kind, on) => { const b = h('button', { class: 'og-btn is-s' + (kind ? ' ' + kind : ''), type: 'button', onclick: on }, label); guardWrite(b); return b; };
      if (['queued', 'running'].includes(j.state)) act.append(btn('취소', 'is-caution', () => doAct(j, 'cancel')));
      if (['cancelled', 'failed', 'done'].includes(j.state)) act.append(btn('재큐', '', () => doAct(j, 'requeue')));
      if (j.state === 'queued' || j.state === 'running') {
        const sel = h('select', { class: 'og-select', 'aria-label': '우선순위' }, ...[0, 1, 2, 3].map((p) => h('option', { value: p, ...(p === j.priority ? { selected: true } : {}) }, `P${p}`)));
        sel.addEventListener('change', () => doAct(j, 'priority', { priority: Number(sel.value) }));
        if (!SRC.writable) { sel.disabled = true; sel.title = SRC.why; }
        act.append(sel);
      }
      act.append(h('span', { class: 'og-num-s', style: { marginLeft: 'auto' } }, prog));
      if (!SRC.writable) act.append(h('span', { class: 'og-why' }, SRC.why));
      row.replaceChildren(h('span', { class: 'q-id', title: j.id }, j.id), st, h('span', { class: 'og-note', style: { gridColumn: '1 / -1' } }, `${j.tenant_id} · ${j.model_id || j.kind || ''} · ${j.pool}${j.label ? ' · ' + j.label : ''}${j.via ? ' · 게이트웨이' : ''}`), act);
    });
  };
  async function doAct(j, action, extra = {}) {
    let reason = null;
    if (action === 'cancel') { reason = await confirmBox({ title: 'job 취소', text: `<b>${j.id}</b> 를 취소한다. 워커는 다음 shard 경계에서 멈춘다.`, ok: '취소 실행', danger: true }); if (!reason) return; }
    try { const r = await write(`/jobs/${j.id}/${action}`, 'POST', { ...extra, ...(reason ? { reason } : {}) }); jobs.set(j.id, { ...jobs.get(j.id), ...r, _at: Date.now() }); render(); onChange && onChange(); toast(`<b>${action}</b> · ${j.id} → ${t('job_state.' + (r.state || j.state), r.state)}`); }
    catch (e) { toast(`<b>${action} 실패</b> · ${errText(e)}`, 'err'); }
  }
  return {
    el: box,
    load(items) { for (const j of items || []) jobs.set(j.id, j); render(); },
    event(ev) { const j = jobs.get(ev.job_id) || { id: ev.job_id, created_at: ev.at };
      if (j._at && Date.parse(ev.at) < j._at - 50) return;   // 쓰기 응답보다 먼저 발행된 이벤트가 늦게 도착 — 되돌리지 않는다
      jobs.set(ev.job_id, { ...j, state: ev.state, tenant_id: ev.tenant_id, pool: ev.pool, label: ev.label ?? j.label, priority: ev.priority ?? j.priority, via: ev.via || j.via }); render(); },
    patch(id, p) { const j = jobs.get(id); if (j) { jobs.set(id, { ...j, ...p }); render(); } },
    row(id) { return box.querySelector(`[data-job="${id}"]`); },
    get jobs() { return jobs; },
  };
}

/** 리더선: 큐 행 → 노드 카드 GPU 행. 배정 순간 380 --e-ui 로 그어지고, 끝에서 락온 380 → 2400 뒤 사라진다. */
export function leader(fromEl, toEls) {
  if (!fromEl || !toEls.length) return;
  const svg = sv('svg', { class: 'leader', width: innerWidth, height: innerHeight, 'aria-hidden': 'true' });
  const a = fromEl.getBoundingClientRect();
  for (const to of toEls) {
    const b = to.getBoundingClientRect();
    const x0 = a.left + 8, y0 = a.top + a.height / 2, x1 = b.left + 70, y1 = b.top + b.height / 2;
    const d = `M ${x0} ${y0} C ${x0 - 60} ${y0}, ${x1 - 80} ${y1}, ${x1} ${y1}`;
    const p = sv('path', { d, class: 'is-draw' }); svg.append(p);
    const len = p.getTotalLength ? 0 : 0; void len;
    const r = sv('rect', { x: b.left + 4, y: b.top + 4, width: b.width - 8, height: b.height - 8, class: 'is-lock' }); svg.append(r);
  }
  document.body.append(svg);
  for (const p of svg.querySelectorAll('path')) { const L = p.getTotalLength(); p.style.setProperty('--len', L); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; }
  svg.querySelectorAll('rect').forEach((r) => { r.style.animationDelay = '380ms'; });
  setTimeout(() => { svg.style.transition = 'opacity var(--d-500) var(--e-ui)'; svg.style.opacity = '0'; }, 2400);
  setTimeout(() => svg.remove(), 2900);
  return svg;
}
