/* K10 cmdk.js — Ctrl K 에이전트 바(vLLM · 게이트웨이 경유만: POST /agent/runs → SSE /events/agent/{run}).
   입력 1줄 · 계획 3줄(사용자 말) · ui_actions → stage(map_arrive · map_flyto · map_frame · map_on 은 화면 이벤트) ·
   확인 카드(쓰기 도구: 실행/취소) · 답 숫자 = 봉투 칩 · 범위 밖 = 서버 거절 문구 그대로 · 게스트 = 비활성 + 한 줄.
   const k = mountCmdk({ stage, guest: !who, context: () => ({ region: sgg }), onAction: (a) => {} });
   k.open('질문') · k.button() → 마스트에 끼울 트리거 */
import { h, esc, api, isEnvelope, bboxOf } from './util.js';
import { sse } from '../../shared/api-v1.js';
import { numHtml } from './bignum.js';
import { devlog } from './dev-drawer.js';
import { t } from './i18n.js';

const SAY = {
  survey_stats: '건수 확인', survey_findings: '의심 필지 찾기', survey_parcel: '필지 대장 대조', results_stats: 'AI 결과 집계',
  results_features: 'AI 결과 가져오기', parcel_at: '필지 조회', parcel_lookup: '필지 조회', results_parcels_join: '필지와 결합', catalog_layers: '영상 확인',
  jobs_quote: '분석 범위 계산', jobs_submit: '분석 실행', survey_state: '상태 변경', map_arrive: '지도에 표시', map_flyto: '필지로 이동',
  map_on: '층 켜기', map_frame: '범위 표시', drawer_open: '목록 열기', parcel_card: '필지 카드',
  ledger_ingest: '대장 읽기', ledger_match: '대장과 AI 결과 맞추기', ledger_rule: '대조 규칙 적용', ledger_findings: '어긋난 필지 찾기',
  summary_lookup: '보유 결과 확인',
};
const EVENTS = ['agent.route', 'agent.plan', 'agent.tool.call', 'agent.tool.result', 'agent.confirm', 'agent.confirm.decided', 'agent.token', 'agent.done', 'agent.failed', 'agent.rejected'];

const clean = (s) => String(s || '').replace(/\{\{env:e\d+\}\}/g, '…').replace(/\s*\[\d+\]/g, '').replace(/\*\*(.+?)\*\*/g, '$1');
function fill(md, envs = {}) {
  return esc(md || '').replace(/\{\{env:(e\d+)\}\}/g, (_, k) => (isEnvelope(envs[k]) ? `<b>${numHtml(envs[k])}</b>` : '—'))
    .replace(/\s*\[\d+\]/g, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n{2,}/g, '<br>');
}

export function mountCmdk({ stage = null, guest = false, context = () => ({}), onAction, host = document.body } = {}) {
  const input = h('input.k-ck-i', { type: 'text', maxlength: '300', autocomplete: 'off', spellcheck: 'false', placeholder: guest ? t('cmdk.guest') : t('cmdk.placeholder'), 'aria-label': guest ? t('cmdk.guest') : t('cmdk.placeholder'), disabled: guest || undefined });
  const plan = h('ol.k-ck-plan', { hidden: true });
  const ans = h('div.k-ck-a', { 'aria-live': 'polite', hidden: true });
  const conf = h('div.k-ck-c', { hidden: true });
  const box = h('div.k-ck', { role: 'dialog', 'aria-modal': 'false', 'aria-label': t('cmdk.placeholder'), hidden: true },
    h('form.k-ck-f', {}, h('span.k-ck-ico', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 20 20"><path d="M10 2.5l1.8 4.7 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.7L3.5 9l4.7-1.8z"/></svg>' }), input, h('kbd.k-ck-k', { text: t('cmdk.key') })),
    plan, conf, ans);
  const dim = h('div.k-ck-dim', { hidden: true });
  host.append(dim, box);
  let stream = null, runId = null;

  const open = (q) => { box.hidden = false; dim.hidden = false; if (!guest) { if (q) input.value = q; requestAnimationFrame(() => { input.focus(); input.select(); }); } };
  const close = () => { box.hidden = true; dim.hidden = true; };
  dim.addEventListener('click', close);
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.hidden ? open() : close(); }
    else if (e.key === 'Escape' && !box.hidden) { e.stopPropagation(); close(); }
  }, true);

  /* 끝 상태를 분명히: data-state = busy(로딩 점 · aria-busy) → done | rejected(서버 거절 문구 그대로 한 줄) | failed('지금은 답할 수 없습니다').
     무응답 0 — SSE 연결 실패 3회 · 끝 이벤트 없이 45초 · 빈 답이면 failed 로 닫는다. */
  const SERVER_LINE = new Set(['forbidden', 'out_of_scope', 'unauthorized']);   // 서버 문구를 그대로 보일 오류(개발 정보 없는 한 줄)
  const TIMEOUT_MS = 45000;
  let seq = 0, guard = 0;
  const settle = (state, text) => {
    clearTimeout(guard); delete box.dataset.busy; box.dataset.state = state; box.removeAttribute('aria-busy');
    if (text != null) { ans.hidden = false; ans.textContent = text; }
    stream?.close();
  };
  const say = (text) => settle('rejected', text);
  const fail = (why) => { devlog('agent', why); settle('failed', t('cmdk.error')); };
  box.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guest) return;
    const msg = input.value.trim(); if (!msg) return;
    const my = ++seq;
    stream?.close(); clearTimeout(guard); plan.innerHTML = ''; plan.hidden = true; conf.hidden = true; ans.hidden = false; ans.innerHTML = '<span class="k-ck-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    box.dataset.busy = '1'; box.dataset.state = 'busy'; box.setAttribute('aria-busy', 'true');
    guard = setTimeout(() => { if (my === seq && box.dataset.state === 'busy') fail('끝 이벤트 없이 시간 초과'); }, TIMEOUT_MS);
    const ctx = { ...context() };
    if (stage?.map) { const b = stage.map.getBounds(); ctx.bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; ctx.zoom = stage.map.getZoom(); }
    let r;
    try { r = await api('/agent/runs', { method: 'POST', body: { message: msg, mode: 'map', context: ctx } }); }
    catch (err) {
      if (my !== seq) return;
      devlog('agent', `POST 실패 · ${err.code || ''} ${err.message || ''}`);
      if (SERVER_LINE.has(err.code) && err.message) say(err.message); else fail(`POST ${err.code || ''}`);
      return;
    }
    if (my !== seq) return;
    if (!r?.events_url) { fail('events_url 없음'); return; }
    runId = r.run?.id; devlog('agent run', runId);
    let buf = '', errs = 0, got = false;
    stream = sse(r.events_url.replace(/^\/api\/v1/, ''), {
      events: [...EVENTS, 'agent.fallback', 'agent.tool.progress'],
      onState: (s) => {
        if (my !== seq || box.dataset.state !== 'busy') return;
        if (s === 'open') errs = 0;
        if (s === 'error' && ++errs >= 3 && !got) fail('SSE 연결 실패');
      },
      on: (name, d) => {
        if (my !== seq) return;
        got = true;
        // 이벤트가 오는 동안은 기다린다 · 확인 카드(사람 승인) · 분석 작업 진행 중엔 길게
        if (box.dataset.state === 'busy') {
          clearTimeout(guard);
          const wait = name === 'agent.confirm' || name === 'agent.tool.progress' ? 10 * 60000 : TIMEOUT_MS;
          guard = setTimeout(() => { if (my === seq && box.dataset.state === 'busy') fail('끝 이벤트 없이 시간 초과'); }, wait);
        }
        if (name === 'agent.plan') {
          const steps = (d?.steps || []).slice(0, 3);
          plan.hidden = !steps.length;
          plan.innerHTML = steps.map((s) => `<li data-i="${esc(s.i)}">${esc(SAY[s.tool] || '확인')}</li>`).join('');
        }
        if (name === 'agent.tool.result') {
          plan.querySelector(`li[data-i="${d?.i}"]`)?.classList.add('is-done');
          for (const a of d?.ui_actions || []) act(a);
        }
        if (name === 'agent.confirm') confirmCard(d);
        if (name === 'agent.confirm.decided') conf.hidden = true;
        if (name === 'agent.token') { buf += d?.delta || ''; ans.hidden = false; ans.textContent = clean(buf); }
        if (name === 'agent.done') {
          const md = String(d?.answer_md || buf || '').trim();
          devlog('vllm', `${d?.model?.id || ''} · ${d?.perf?.total_ms ?? '—'} ms · ${md.slice(0, 200)}`);
          if (!md) { fail('빈 답'); return; }
          settle('done'); ans.hidden = false; ans.innerHTML = fill(md, d?.envelopes);
        }
        if (name === 'agent.rejected') say(d?.message || t('cmdk.error'));
        if (name === 'agent.failed') fail(`failed · ${d?.error || ''}`);
      },
    });
  });

  function confirmCard(d) {
    conf.hidden = false;
    conf.innerHTML = '';
    const what = SAY[d?.tool] || '실행';
    conf.append(h('p.k-ck-cq', { text: what }),
      h('div.k-ck-cb', {},
        h('button.t-btn', { type: 'button', text: t('cmdk.run'), onclick: () => decide(d.confirm_id, 'approve') }),
        h('button.t-btn.t-btn--2', { type: 'button', text: t('cmdk.cancel'), onclick: () => decide(d.confirm_id, 'reject') })));
  }
  async function decide(cid, decision) {
    conf.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { await api(`/agent/runs/${runId}/confirm`, { method: 'POST', body: { confirm_id: cid, decision } }); }
    catch { fail('확인 카드 전송 실패'); }
    conf.hidden = true;
  }

  function act(a) {
    onAction?.(a);
    document.dispatchEvent(new CustomEvent('kit:agent-action', { detail: a }));
    if (!stage) return;
    if (a.op === 'map_arrive' && a.features?.length) {
      const fc = { type: 'FeatureCollection', features: a.features };
      stage.geo('agent', fc, 'ai'); stage.go(a.bbox || bboxOf(fc), { maxZoom: 15 });
    } else if (a.op === 'map_flyto' && (a.bbox || a.center)) {
      const b = a.bbox || [a.center[0] - 0.003, a.center[1] - 0.003, a.center[0] + 0.003, a.center[1] + 0.003];
      stage.go(b, { maxZoom: 17 });
    } else if (a.op === 'map_frame' && a.geojson) {
      stage.geo('agent-frame', { type: 'Feature', properties: {}, geometry: a.geojson }, 'focus');
    }
  }

  /** 마스트용 트리거(자리표 + Ctrl K) */
  function button() {
    return h('button.k-ck-btn', { type: 'button', 'aria-label': guest ? t('cmdk.guest') : t('cmdk.placeholder'), onclick: () => open() },
      h('span', { text: guest ? t('cmdk.guest') : t('cmdk.placeholder') }), h('kbd', { text: t('cmdk.key') }));
  }
  return { el: box, open, close, button };
}
