/* 작업 카드(XI ChatGEO 대화 안 · 국토 변화 탐지 · 수정 지시서 v2 F3)
   서버 블록 {type:'job', job_id, label, href?, show?} → 2초마다 GET /change/runs/{작업}/status 를 읽어
   상태(작업 대기 · 분석 중 · 끝남 · 실패 · 취소됨 · 시간 초과) · 진행 막대 · 영상 칸 k/K · 지난 시간 · 남은 시간(어림)을 보인다.
   단추: 취소 · 다시 시도 · (10분 넘으면) 계속 기다리기 · 끝나면 알림 받기. 끝나면 지도 동작(show = change_show)을 한 번 낸다.
   같은 작업은 프로젝트 4단계(추론) 목록에도 같은 기록으로 있다(href). */
import { h, api } from './util.js';

const POLL_MS = 2000;
const dur = (s) => {
  s = Math.max(0, Math.round(Number(s) || 0));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m}분 ${r}초` : `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
};
const val = (e) => (e && typeof e === 'object' ? e.value : e);

/** 블록 하나 → 카드 요소(대화 칸에 붙인다). 칸이 화면에서 빠지면 읽기를 멈춘다. */
export function jobCard(b) {
  let job = b.job_id, timer = 0, shown = false, waitOk = false, busy = false, live = false;   // live = 이 카드가 끝나기 전을 봤다(지난 대화 다시 보기에서는 지도를 바꾸지 않음)
  const st = h('p.k-job-st', { role: 'status', 'aria-live': 'polite' });
  const bar = h('span.k-job-bar-i');
  const barW = h('div.k-job-bar', { 'aria-hidden': 'true' }, bar);
  const meta = h('p.k-job-meta');
  const ask = h('div.k-job-ask', { hidden: true });
  const acts = h('div.k-job-acts');
  const el = h('div.k-ck-blk.k-ck-blk--job', { 'data-kind': 'job', 'data-job': job },
    h('p.k-ck-bt', { text: String(b.label || '변화 탐지').split(' · ').pop(), title: b.label || '' }), st, barW, meta, ask, acts);

  const post = async (path) => {
    busy = true;
    try { return await api(`/change/runs/${encodeURIComponent(job)}/${path}`, { method: 'POST', body: {} }); }
    catch (err) { meta.textContent = err?.message || '요청을 보내지 못했습니다 — 잠시 뒤 다시 눌러 주세요'; return null; }
    finally { busy = false; }
  };
  const btn = (text, on, cls = '') => h(`button.k-job-b${cls}`, { type: 'button', text, onclick: on });

  function draw(s) {
    el.dataset.state = s.state;
    const pct = val(s.progress);
    const stage = s.stage ? ` · ${s.stage}` : '';
    st.textContent = s.state === 'done' ? '끝났습니다'
      : s.state === 'running' ? `${s.word}${stage}${pct != null ? ` · ${pct}%` : ''}`
      : s.state === 'queued' ? `${s.word}${s.queue ? ` · 앞에 ${Math.max(0, s.queue.position - 1)}건` : ''}`
      : s.word;
    barW.hidden = !['running', 'queued', 'done'].includes(s.state);
    bar.style.width = `${s.state === 'done' ? 100 : Math.max(2, Number(pct) || 0)}%`;
    const bits = [];
    if (s.state === 'running') {
      if (s.tiles?.total) bits.push(`영상 칸 ${s.tiles.n}/${s.tiles.total}`);
      if (val(s.elapsed) != null) bits.push(`지난 시간 ${dur(val(s.elapsed))}`);
      if (val(s.remaining) != null) bits.push(`남은 시간 약 ${dur(val(s.remaining))}`);
    } else if (s.state === 'queued' && val(s.waited) != null) bits.push(`기다린 시간 ${dur(val(s.waited))}`);
    else if (['failed', 'timeout'].includes(s.state) && s.reason) bits.push(s.reason);
    meta.textContent = bits.join(' · ');
    meta.hidden = !bits.length;

    // 10분이 넘으면 묻는다(한 번 '계속 기다리기'를 누르면 다시 묻지 않음)
    ask.replaceChildren();
    ask.hidden = !(s.ask && !waitOk && !s.notify);
    if (!ask.hidden) {
      ask.append(h('p', { text: '10분이 넘었습니다. 어떻게 할까요?' }),
        h('div.k-job-acts', {},
          btn('계속 기다리기', () => { waitOk = true; ask.hidden = true; }),
          btn('끝나면 알림 받기', async () => { const r = await post('later'); if (r) draw(r); }),
          btn('취소', async () => { const r = await post('cancel'); if (r) draw(r); }, '.is-quiet')));
    }
    acts.replaceChildren();
    if (s.notify && s.can_cancel) acts.append(h('span.k-job-note', { text: '끝나면 알림으로 알려 드립니다' }));
    if (s.can_cancel && ask.hidden) acts.append(btn('취소', async () => { const r = await post('cancel'); if (r) draw(r); }, '.is-quiet'));
    if (s.can_retry) {
      acts.append(btn('다시 시도', async () => {
        const r = await post('retry');
        if (r?.job_id) { live = true; job = r.job_id; el.dataset.job = job; if (b.show) b.show = { ...b.show, job_id: job }; shown = false; waitOk = false; tick(); }
      }));
    }
    if (s.state === 'done' && b.show) acts.append(btn('지도에서 보기', () => showMap(true)));
    if (b.href) acts.append(h('a.k-job-a', { href: b.href, text: '프로젝트 추론 단계에서 보기' }));
    acts.hidden = !acts.children.length;
  }
  function showMap(force = false) {
    if (!b.show || (shown && !force)) return;
    shown = true;
    document.dispatchEvent(new CustomEvent('kit:agent-action', { detail: { ...b.show, job_id: job }, cancelable: true }));
  }
  async function tick() {
    clearTimeout(timer);
    if (!el.isConnected && el.dataset.seen) return;         // 대화에서 빠진 카드는 읽지 않는다
    if (el.isConnected) el.dataset.seen = '1';
    let s = null;
    if (!busy) {
      try { s = await api(`/change/runs/${encodeURIComponent(job)}/status`); } catch { s = null; }
    }
    if (s) {
      draw(s);
      if (s.state === 'done') { if (live) showMap(); return; }
      live = true;
      if (['failed', 'timeout', 'cancelled'].includes(s.state)) return;
    } else if (!st.textContent) st.textContent = '상태를 읽는 중';
    timer = setTimeout(tick, POLL_MS);
  }
  tick();
  return el;
}
