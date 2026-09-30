/* K10 cmdk.js — Ctrl K 에이전트 바(vLLM · 게이트웨이 경유만: POST /agent/runs → SSE /events/agent/{run}).
   입력 1줄 · 계획 3줄(사용자 말) · ui_actions → 화면 이벤트 kit:agent-action · 확인 카드(쓰기 도구: 실행/취소) ·
   답 숫자 = 봉투 칩(단위만 · '~' 꼬리 0) · 범위 밖 = 서버 거절 문구 그대로 · 게스트 = 비활성 + 한 줄.
   C2(plan 3.2·3.3·3.6):
   · 질문 언어로 문구(계획 줄·확인 카드·오류·단위) — langOf(질문)
   · 동작: kit:agent-action(detail = ui_action · cancelable). 화면이 직접 처리하면 e.preventDefault() 하고 끝나면
     kit:agent-action-done {op, ok} 를 낸다. 아무도 막지 않으면 키트 기본 처리(stage.map: map_region·map_zoom·map_view)
     후 키트가 kit:agent-action-done 을 낸다. 받은 done 은 이 run 의 기록(data-acts · data-acts-ok)으로 남긴다.
   · 블록: agent.done.blocks 의 chart(막대 · 값 = 봉투) · file(내려받기 버튼) · image(영상 조각 + 꼬리표)를 답 아래에 그린다.
   const k = mountCmdk({ stage, guest: !who, context: () => ({ region: sgg }), onAction: (a) => {} });
   k.open('질문') · k.button() → 마스트에 끼울 트리거 · k.renderBlocks(blocks, envs, lang) */
import { h, esc, api, isEnvelope, bboxOf } from './util.js';
import { sse } from '../../shared/api-v1.js';
import { devlog } from './dev-drawer.js';
import { t, tl, langOf, nf } from './i18n.js';
import { bars } from './chart.js';

const EVENTS = ['agent.route', 'agent.plan', 'agent.tool.call', 'agent.tool.result', 'agent.confirm', 'agent.confirm.decided', 'agent.token', 'agent.done', 'agent.failed', 'agent.rejected'];
const KIT_OPS = new Set(['map_region', 'map_zoom', 'map_view', 'map_layer']);   // 화면이 처리하지 않을 때 키트가 지도로 하는 동작
const TRACK = new Set(['map_region', 'map_zoom', 'map_view', 'map_layer']);    // R3 M5 — 답이 '했습니다'라고 말하는 지도 동작(성공·실패를 답에 반영)
const ACT_WAIT_MS = 3000;                                                       // 답이 끝난 뒤 이 시간 안에 동작 끝 신호가 없으면 '확인되지 않음'

/* R3 M1 — stage 를 넘기지 않은 화면(LX 관리자 대시보드 등)의 지도도 말로 움직이게: 이 페이지에서 쓰인 MapLibre 지도를 기억한다.
   (화면이 stage 를 넘기면 그것이 먼저 · 기억은 지도 동작 메서드를 처음 부를 때 한 번) */
const MAPS = [];
function trackMaps() {
  const P = window.maplibregl?.Map?.prototype;
  if (!P || P.__kitCk) return;
  P.__kitCk = true;
  for (const fn of ['fitBounds', 'jumpTo', 'easeTo', 'flyTo']) {
    const orig = P[fn];
    if (typeof orig !== 'function') continue;
    P[fn] = function kitTracked(...args) { if (!MAPS.includes(this)) MAPS.push(this); return orig.apply(this, args); };
  }
}
trackMaps();
const liveMap = () => {
  for (let i = MAPS.length - 1; i >= 0; i--) { try { if (MAPS[i].getContainer()?.isConnected) return MAPS[i]; } catch { /* 지워진 지도 */ } }
  return null;
};
const REASONS = ['max', 'min', 'nomap', 'nolayer'];
/** 화면이 준 실패 이유(한국어 한 줄) → 질문 언어. 모르는 한국어 이유는 영어 답에서 뺀다. */
function reasonIn(lang, reason) {
  const r = String(reason || '').trim();
  if (!r || lang !== 'en' || !/[가-힣]/.test(r)) return r;
  const k = REASONS.find((x) => tl('ko', `cmdk.why.${x}`) === r.replace(/\.$/, ''));
  return k ? tl('en', `cmdk.why.${k}`) : '';
}
/** 실패한 동작 한 줄 — '지도를 확대하지 못했습니다 — 더 확대할 수 없습니다.' / "Couldn't zoom in — …" */
function failLine(x, lang) {
  const a = x.a || {};
  let k = 'fail';
  if (x.op === 'map_zoom') k = a.zoom != null ? 'zoom' : (+a.delta < 0 ? 'out' : 'in');
  else if (x.op === 'map_layer') k = a.on === false ? 'off' : 'on';
  else if (x.op === 'map_region') k = 'move';
  else if (x.op === 'map_view') k = 'view';
  const layer = tl(lang, `cmdk.layer.${a.layer || 'imagery'}`);
  const why = reasonIn(lang, x.reason);
  return `${tl(lang, `cmdk.act.${k}`, { layer })}${why ? ` — ${why.replace(/\.$/, '')}` : ''}.`;
}

const toolSay = (lang, s) => tl(lang, `tool.${s?.tool}`) || s?.say || tl(lang, 'tool._');
const unitOf = (lang, u) => {
  if (!u || u === 'ndvi') return '';                                  // 무차원 지수(NDVI)는 단위 없음
  const got = tl(lang, `unit.${u}`) || u;
  return lang === 'en' && /[가-힣]/.test(got) ? '' : got;            // 영어 답에 한국어 단위('건')가 새지 않게
};
const clean = (s) => String(s || '').replace(/\{\{[^{}]{0,40}\}\}/g, '…').replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').replace(/\*\*(.+?)\*\*/g, '$1');
/** 봉투 칩 — 숫자 + 단위(질문 언어). 신뢰 기호는 호버 한 줄(뒤 '~' 꼬리 0). */
function chip(env, lang, bare = false) {
  if (!isEnvelope(env) || env.value === null || env.value === undefined) return '—';
  let u = bare ? '' : unitOf(lang, env.unit);
  if (lang === 'en' && Number(env.value) === 1 && /[A-Za-z]s$/.test(u)) u = u.slice(0, -1);   // 1 GPUs → 1 GPU
  const sep = lang === 'en' && u && u !== '%' ? ' ' : '';
  const est = env.basis === 'inferred' || env.basis === 'estimate';
  return `<b class="k-ck-n" data-v="${esc(env.value)}"${est ? ` title="${esc(tl(lang, 'sig.est'))}"` : ''}>${nf(env.value, undefined, lang)}${u ? `${sep}<small>${esc(u)}</small>` : ''}</b>`;
}
// 영어 답: 자리표 뒤 1–3 낱말 안에 모델이 쓴 명사·단위가 있으면('{{env:e1}} suspect parcels' · '{{env:e3}} GB of memory' ·
// '{{env:e4}}°C' · '{{env:e5}} GPUs' · '{{env:e6}} job(s)') 칩 단위를 붙이지 않는다(단위 두 번 0). 전치사·접속사에서 멈춘다.
const NOUN_EN = /^(?:suspicious|parcels?|cases?|fields?|items?|records?|buildings?|greenhouses?|objects?|polygons?|findings?|detections?|instances?|results?|features?|jobs?|gpus?|workers?|models?|hours?|minutes?|seconds?|days?|tokens?|alerts?|nodes?|agencies|agency|districts?|areas?|hectares?|ha|sites?|rows?|entries|entry|requests?|runs?|tasks?|plots?|lots?|units?|percent|degrees?|gb|mb|tb|gib|mib|w|watts?|kw|m²|km²|m2|km2|sqm|people|persons?|times|pixels?|scenes?|images?|layers?|calls?|tiles?|pts|points?|krw|won)$/i;
const STOP_EN = /^(?:in|of|and|or|but|are|is|was|were|be|been|for|to|at|on|from|across|out|with|by|as|this|that|which|while|have|has|had|so|than|per|among|within|under|over|into|about|each|total|overall|currently|now|today|here|there)$/i;
function unitWritten(after, unitLabel) {
  const s = String(after || '');
  if (/^\s?[°%㎡㎢²]/.test(s)) return true;                        // '{{env}}°C' · '{{env}} %'
  const head = s.split(/[.,;:!?\n<{]/)[0];
  const words = head.trim().split(/\s+/).filter(Boolean).slice(0, 3);
  const stem = String(unitLabel || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 3);
  for (const w0 of words) {
    const w = w0.toLowerCase().replace(/\(s\)$/, 's').replace(/[^a-z²0-9]/g, '');
    if (!w || STOP_EN.test(w)) return false;
    if (NOUN_EN.test(w) || (stem.length >= 2 && w.startsWith(stem))) return true;
    if (/ing$/.test(w)) return false;                                  // '{{env}} requiring …' · 'awaiting …' → 칩 단위를 붙인다
  }
  return false;
}
function fill(md, envs = {}, lang = 'ko') {
  return esc(md || '')
    // 영어 답에서 자리표 뒤에 낱말이 바로 오면('… {{env:e1}} flagged parcels') 칩 단위를 붙이지 않는다(단위 두 번 0)
    .replace(/\{\{env:(e\d+)\}\}/g, (m, k, off, str) => chip(envs[k], lang, lang === 'en' && envs[k]?.unit !== 'ratio' && envs[k]?.unit !== '%' && unitWritten(str.slice(off + m.length), unitOf(lang, envs[k]?.unit))))
    .replace(/\{\{[^{}]{0,40}\}\}/g, esc(tl(lang, 'cmdk.unverified')))          // 남은 자리표(서버가 못 지운 것) → '확인되지 않음'
    .replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n{2,}/g, '<br>');
}
const rel = (href) => String(href || '').replace(/^.*?\/api\/v1(?=\/)/, '');

export function mountCmdk({ stage = null, guest = false, context = () => ({}), onAction, host = document.body } = {}) {
  const input = h('input.k-ck-i', { type: 'text', maxlength: '300', autocomplete: 'off', spellcheck: 'false', placeholder: guest ? t('cmdk.guest') : t('cmdk.placeholder'), 'aria-label': guest ? t('cmdk.guest') : t('cmdk.placeholder'), disabled: guest || undefined });
  const plan = h('ol.k-ck-plan', { hidden: true });
  const ans = h('div.k-ck-a', { 'aria-live': 'polite', hidden: true });
  const blk = h('div.k-ck-blocks', { hidden: true });
  const conf = h('div.k-ck-c', { hidden: true });
  const box = h('div.k-ck', { role: 'dialog', 'aria-modal': 'false', 'aria-label': t('cmdk.placeholder'), hidden: true },
    h('form.k-ck-f', {}, h('span.k-ck-ico', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 20 20"><path d="M10 2.5l1.8 4.7 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.7L3.5 9l4.7-1.8z"/></svg>' }), input, h('kbd.k-ck-k', { text: t('cmdk.key') })),
    plan, conf, ans, blk);
  const dim = h('div.k-ck-dim', { hidden: true });
  host.append(dim, box);
  let stream = null, runId = null, lang = 'ko';
  const urls = [];
  const acts = { sent: 0, done: 0, ok: 0, ops: [], items: [] };
  trackMaps();

  /* R3 — 여는 즉시 입력 칸에 초점(다음 프레임을 기다리지 않는다): 연 직후 친 글자가 사라지지 않고, 앞 질문은 선택돼 새 글자로 바뀐다(두 번 붙기 0) */
  const open = (q) => {
    box.hidden = false; dim.hidden = false;
    if (guest) return;
    if (q) input.value = q;
    try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    input.select();
    requestAnimationFrame(() => { if (!box.hidden && document.activeElement !== input) input.focus({ preventScroll: true }); });
  };
  const close = () => { box.hidden = true; dim.hidden = true; };
  dim.addEventListener('click', close);
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.hidden ? open() : close(); }
    else if (e.key === 'Escape' && !box.hidden) { e.stopPropagation(); close(); }
    else if (!box.hidden && !guest && e.target !== input && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing
      && !(e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))) {
      // 열린 바 바깥(방금 누른 버튼 등)에 초점이 남아 있을 때 친 글자 → 입력 칸으로 넘긴다
      e.preventDefault();
      input.focus({ preventScroll: true });
      input.setRangeText(e.key, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end');
    }
  }, true);

  // 동작 끝 기록(plan 3.1·3.2) — 화면·키트가 낸 kit:agent-action-done {op, ok, reason} 을 이 run 의 동작에 짝지어 센다
  document.addEventListener('kit:agent-action-done', (e) => {
    const d = e.detail || {};
    acts.done += 1; if (d.ok) acts.ok += 1;
    box.dataset.actsDone = String(acts.done); box.dataset.actsOk = String(acts.ok);
    const x = acts.items.find((it) => it.op === d.op && it.state === 'sent');
    if (x) { x.state = d.ok ? 'ok' : 'fail'; x.reason = d.reason || ''; markStep(x.step); }
    devlog('agent action', `${d.op || ''} ${d.ok ? 'ok' : 'fail'}${d.by ? ` · ${d.by}` : ''}${d.reason ? ` · ${d.reason}` : ''}`);
    if (x) settleActs(false);
  });

  /* 지도 동작 단계 줄: 그 단계의 동작 중 하나라도 성공 → ✓ · 모두 실패 → 실패 표시 · 끝 신호를 기다리는 중이면 표시 없음(final 이면 그대로 둔다) */
  function markStep(i) {
    if (i == null) return;
    const li = plan.querySelector(`li[data-i="${i}"]`); if (!li) return;
    const tr = acts.items.filter((x) => x.step === i && TRACK.has(x.op));
    if (!tr.length) return;
    const ok = tr.some((x) => x.state === 'ok'), bad = tr.every((x) => x.state === 'fail');
    li.classList.toggle('is-done', ok); li.classList.toggle('is-fail', !ok && bad); li.classList.toggle('is-wait', !ok && !bad);
  }
  /* R3 M5 — 답이 말한 지도 동작이 모두 실패(ok:false)면 동작 문장을 실패 문장으로 바꾼다 · 3초 안에 끝 신호가 없으면 '확인되지 않음'.
     결과는 서버 run 기록(perf.acts_*)에도 남긴다. */
  let shown = null, actTimer = 0;
  const actVerdict = (final) => {
    const tr = acts.items.filter((x) => TRACK.has(x.op));
    if (!tr.length) return null;
    if (tr.some((x) => x.state === 'ok')) return tr.some((x) => x.state === 'sent') && !final ? null : 'ok';
    if (tr.every((x) => x.state === 'fail')) return 'failed';
    return final ? 'unconfirmed' : null;
  };
  function settleActs(final) {
    if (!shown || shown.run !== runId) return;
    const v = actVerdict(final || shown.expired);
    if (!v || v === shown.v) return;
    shown.v = v; box.dataset.actsVerdict = v;
    let md = shown.md;
    if (v !== 'ok') {
      const tr = acts.items.filter((x) => TRACK.has(x.op));
      const line = v === 'failed' ? tr.map((x) => failLine(x, shown.lang)).join(' ') : `${tl(shown.lang, 'cmdk.act.unconfirmed')}.`;
      const claims = (shown.claims || []).filter((c) => c && md.includes(c));
      if (claims.length) { md = md.replace(claims[0], line); for (const c of claims.slice(1)) md = md.replace(c, '').replace(/[ \t]{2,}/g, ' '); }
      else md = `${md}${md ? '\n\n' : ''}${line}`;
    }
    ans.hidden = !md; ans.innerHTML = fill(md, shown.envs, shown.lang);
    const items = acts.items.filter((x) => TRACK.has(x.op)).map((x) => ({ op: x.op, ok: x.state === 'ok', done: x.state !== 'sent', ...(x.reason ? { reason: x.reason } : {}) }));
    api(`/agent/runs/${shown.run}/acts`, { method: 'POST', body: { sent: items.length, done: items.filter((x) => x.done).length, ok: items.filter((x) => x.ok).length, items, verdict: v } })
      .catch((err) => devlog('agent acts', String(err?.message || err)));
  }

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
  const fail = (why) => { devlog('agent', why); settle('failed', tl(lang, 'cmdk.error')); };
  box.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guest) return;
    const msg = input.value.trim(); if (!msg) return;
    const my = ++seq;
    lang = langOf(msg); box.dataset.lang = lang;
    acts.sent = acts.done = acts.ok = 0; acts.ops = []; acts.items = []; box.dataset.acts = '0'; box.dataset.actsDone = '0'; box.dataset.actsOk = '0';
    shown = null; clearTimeout(actTimer); delete box.dataset.actsVerdict;
    stream?.close(); clearTimeout(guard); plan.innerHTML = ''; plan.hidden = true; conf.hidden = true; clearBlocks();
    ans.hidden = false; ans.innerHTML = '<span class="k-ck-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    box.dataset.busy = '1'; box.dataset.state = 'busy'; box.setAttribute('aria-busy', 'true');
    guard = setTimeout(() => { if (my === seq && box.dataset.state === 'busy') fail('끝 이벤트 없이 시간 초과'); }, TIMEOUT_MS);
    const ctx = { ...context() };
    if (runId) ctx.prev_run = runId;   // 이 창의 바로 앞 답('1위 필지' 같은 말은 이 답의 목록으로만 푼다 · 같은 계정 다른 창 답과 섞이지 않게)
    if (stage?.map) { const b = stage.map.getBounds(); ctx.bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; ctx.zoom = stage.map.getZoom(); }
    let r;
    try { r = await api('/agent/runs', { method: 'POST', body: { message: msg, mode: 'map', context: ctx } }); }
    catch (err) {
      if (my !== seq) return;
      devlog('agent', `POST 실패 · ${err.code || ''} ${err.message || ''}`);
      if (SERVER_LINE.has(err.code) && err.message && lang === 'ko') say(err.message); else fail(`POST ${err.code || ''}`);
      return;
    }
    if (my !== seq) return;
    if (!r?.events_url) { fail('events_url 없음'); return; }
    runId = r.run?.id; box.dataset.run = runId || ''; devlog('agent run', runId);
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
          plan.innerHTML = steps.map((s) => `<li data-i="${esc(s.i)}">${esc(toolSay(lang, s))}</li>`).join('');
        }
        if (name === 'agent.tool.result') {
          const li = plan.querySelector(`li[data-i="${d?.i}"]`);
          // 단계 표시 = 실제 결과: 도구 실패면 실패 표시 · 지도 동작(TRACK)은 화면의 끝 신호를 받고 나서 완료/실패(M5 — 실패한 동작에 ✓ 0)
          if (li) li.classList.add(d?.ok === false ? 'is-fail' : (d?.ui_actions || []).some((a) => TRACK.has(a?.op)) ? 'is-wait' : 'is-done');
          for (const a of d?.ui_actions || []) act(a, d?.i);
        }
        if (name === 'agent.tool.progress') for (const a of d?.ui_actions || []) act(a, d?.i);
        if (name === 'agent.confirm') confirmCard(d);
        if (name === 'agent.confirm.decided') conf.hidden = true;
        if (name === 'agent.token') { buf += d?.delta || ''; ans.hidden = false; ans.textContent = clean(buf); }
        if (name === 'agent.done') {
          const md = String(d?.answer_md || buf || '').trim();
          devlog('vllm', `${d?.model?.id || ''} · ${d?.perf?.total_ms ?? '—'} ms · ${md.slice(0, 200)}`);
          if (!md && !(d?.blocks || []).length) { fail('빈 답'); return; }
          settle('done'); ans.hidden = !md; ans.innerHTML = fill(md, d?.envelopes, d?.lang || lang);
          renderBlocks(d?.blocks || [], d?.envelopes || {}, d?.lang || lang);
          shown = { run: runId, md, envs: d?.envelopes || {}, lang: d?.lang || lang, claims: d?.act_claims || [], v: null, expired: false };
          settleActs(false);
          clearTimeout(actTimer);
          actTimer = setTimeout(() => { if (shown && shown.run === runId) { shown.expired = true; settleActs(true); } }, ACT_WAIT_MS);
        }
        if (name === 'agent.rejected') say(d?.message || tl(lang, 'cmdk.error'));
        if (name === 'agent.failed') fail(`failed · ${d?.error || ''}`);
      },
    });
  });

  function confirmCard(d) {
    conf.hidden = false;
    conf.innerHTML = '';
    conf.append(h('p.k-ck-cq', { text: d?.title || d?.say || tl(lang, `tool.${d?.tool}`) || tl(lang, 'cmdk.confirm') }),   // plan 3.4 — 도구가 준 제목 먼저
      h('div.k-ck-cb', {},
        h('button.t-btn', { type: 'button', text: tl(lang, 'cmdk.run'), onclick: () => decide(d.confirm_id, 'approve') }),
        h('button.t-btn.t-btn--2', { type: 'button', text: tl(lang, 'cmdk.cancel'), onclick: () => decide(d.confirm_id, 'reject') })));
  }
  async function decide(cid, decision) {
    conf.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { await api(`/agent/runs/${runId}/confirm`, { method: 'POST', body: { confirm_id: cid, decision } }); }
    catch { fail('확인 카드 전송 실패'); }
    conf.hidden = true;
  }

  const done = (op, ok, by = 'kit', reason = '') => document.dispatchEvent(new CustomEvent('kit:agent-action-done', { detail: { op, ok: !!ok, by, ...(reason ? { reason } : {}) } }));
  function act(a, step) {
    if (!a?.op) return;
    acts.sent += 1; acts.ops.push(a.op); box.dataset.acts = String(acts.sent);
    acts.items.push({ op: a.op, a, state: 'sent', reason: '', step });   // 끝 신호 전에 넣는다(화면이 곧바로 done 을 낼 수 있다)
    onAction?.(a);
    const ev = new CustomEvent('kit:agent-action', { detail: a, cancelable: true });
    document.dispatchEvent(ev);
    if (ev.defaultPrevented) return;                 // 화면이 직접 처리(끝나면 화면이 done 을 낸다)
    const map = stage?.map || liveMap();
    if (a.op === 'map_arrive' && a.features?.length && stage) {
      const fc = { type: 'FeatureCollection', features: a.features };
      stage.geo('agent', fc, 'ai'); stage.go(a.bbox || bboxOf(fc), { maxZoom: 15 });
    } else if (a.op === 'map_flyto' && (a.bbox || a.center) && stage) {
      const b = a.bbox || [a.center[0] - 0.003, a.center[1] - 0.003, a.center[0] + 0.003, a.center[1] + 0.003];
      stage.go(b, { maxZoom: 17 });
    } else if (a.op === 'map_frame' && a.geojson && stage) {
      stage.geo('agent-frame', { type: 'Feature', properties: {}, geometry: a.geojson }, 'focus');
    } else if (KIT_OPS.has(a.op)) {
      // 키트 기본 처리 — 화면이 넘긴 stage 가 없으면 이 페이지의 지도(liveMap). 할 수 없으면 ok:false + 이유 한 줄(plan 3.1)
      let ok = false, reason = '';
      const why = (k) => tl(lang, `cmdk.why.${k}`);
      try {
        const box4 = a.bbox || (a.center && [a.center[0] - 0.05, a.center[1] - 0.05, a.center[0] + 0.05, a.center[1] + 0.05]);
        if (!map && !(a.op === 'map_region' && stage)) reason = why('nomap');
        else if (a.op === 'map_region' && box4) {
          if (stage) stage.go(box4, { maxZoom: 12.5 }); else map.fitBounds(box4, { maxZoom: 12.5, duration: 1200, padding: 40 });
          ok = true;
        } else if (a.op === 'map_zoom') {
          const cur = map.getZoom(), hi = Math.min(19, map.getMaxZoom()), lo = Math.max(3, map.getMinZoom());
          const z = Math.max(lo, Math.min(hi, a.zoom ?? cur + (+a.delta || 1)));
          if (Math.abs(z - cur) < 0.05) reason = why((a.zoom ?? cur + (+a.delta || 1)) >= cur ? 'max' : 'min');
          else { map.easeTo({ zoom: z, duration: 600 }); ok = true; }
        } else if (a.op === 'map_view') {
          map.easeTo({ pitch: +a.pitch || 0, bearing: +a.bearing || 0, duration: 800 }); ok = true;
        } else if (a.op === 'map_layer') {
          const L = map.getStyle()?.layers || [];
          let ids = a.layer === 'imagery' ? L.filter((l) => l.type === 'raster' && /^img-/.test(l.id)).map((l) => l.id) : [];
          if (a.layer === 'imagery' && !ids.length) ids = ['k-eox', 'k-vw'].filter((id) => map.getLayer(id));   // 영상 층이 따로 없는 화면 = 바탕 위성 영상
          if (!ids.length) reason = why('nolayer');
          else { for (const id of ids) map.setLayoutProperty(id, 'visibility', a.on === false ? 'none' : 'visible'); ok = true; }
        }
      } catch (err) { devlog('agent action', `${a.op} 실패 · ${err?.message || err}`); }
      done(a.op, ok, 'kit', reason);
    } else if (a.op === 'screen_open' && /^\/landxi\/v3\/[\w-]+\/(\?[\w=&%.-]*)?$/.test(String(a.href || ''))) {
      done(a.op, true);                              // 화면 열기(XI맵 등 · c2-xi) — 답 한 줄을 읽을 틈을 두고 그 주소로 간다
      setTimeout(() => location.assign(a.href), 900);
    } else if (!['map_arrive', 'map_flyto', 'map_frame', 'map_on', 'parcel_card', 'drawer_open'].includes(a.op)) {
      done(a.op, false);                             // 처리하는 화면이 없는 동작(analysis_watch 등) — 실패로 기록
    }
  }

  /* 블록(plan 3.3) — chart {type:'chart', kind:'bar', title, rows:[{label, env}]} · file {type:'file', label, href} · image {type:'image', src, caption, tag} */
  function clearBlocks() { blk.innerHTML = ''; blk.hidden = true; while (urls.length) URL.revokeObjectURL(urls.pop()); }
  function renderBlocks(blocks = [], envs = {}, lg = lang) {
    clearBlocks();
    for (const b of blocks) {
      if (b?.type === 'chart') {
        const items = (b.rows || []).filter((r) => isEnvelope(envs[r.env])).map((r) => ({ label: r.label, value: envs[r.env] }));
        if (!items.length) continue;
        const u = unitOf(lg, envs[b.rows[0].env]?.unit);
        const el = h('div.k-ck-chart');
        blk.append(h('div.k-ck-blk.k-ck-blk--chart', { 'data-kind': 'chart' }, b.title ? h('p.k-ck-bt', { text: b.title }) : null, el));
        bars(el, { items, ai: true, unit: u, limit: 12, lang: lg });
      } else if (b?.type === 'file' && b.href) {
        const btn = h('button.k-ck-file', { type: 'button' },
          h('span.k-ck-file-i', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 20 20"><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12"/></svg>' }),
          h('span.k-ck-file-l', { text: b.label || tl(lg, 'cmdk.download') }), h('span.k-ck-file-a', { text: tl(lg, 'cmdk.download') }));
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const r = await api(rel(b.href), { raw: true });
            if (!r.ok) throw new Error(r.status);
            const u = URL.createObjectURL(await r.blob()); urls.push(u);
            const a = h('a', { href: u, download: b.label || 'file' }); document.body.append(a); a.click(); a.remove();
          } catch (err) { devlog('agent file', String(err?.message || err)); btn.querySelector('.k-ck-file-a').textContent = tl(lg, 'cmdk.file.fail'); }
          finally { btn.disabled = false; }
        });
        blk.append(h('div.k-ck-blk.k-ck-blk--file', { 'data-kind': 'file' }, btn));
      } else if (b?.type === 'image' && b.src) {
        const img = h('img.k-ck-img', { alt: b.caption || '', decoding: 'async' });
        const fig = h('figure.k-ck-blk.k-ck-blk--image', { 'data-kind': 'image' }, img,
          h('figcaption.k-ck-cap', {}, b.caption ? h('span', { text: b.caption }) : null, h('span.k-ck-tag', { text: b.tag || tl(lg, 'cmdk.img.tag') })));
        blk.append(fig);
        const src = String(b.src);
        if (/^(data:|blob:)/.test(src)) img.src = src;
        else api(rel(src), { raw: true }).then(async (r) => { if (!r.ok) throw new Error(r.status); const u = URL.createObjectURL(await r.blob()); urls.push(u); img.src = u; })
          .catch((err) => { devlog('agent image', String(err?.message || err)); fig.dataset.fail = '1'; img.replaceWith(h('p.k-ck-imgx', { text: tl(lg, 'cmdk.img.fail') })); });
      }
    }
    blk.hidden = !blk.children.length;
  }

  /** 마스트용 트리거(자리표 + Ctrl K) */
  function button() {
    return h('button.k-ck-btn', { type: 'button', 'aria-label': guest ? t('cmdk.guest') : t('cmdk.placeholder'), onclick: () => open() },
      h('span', { text: guest ? t('cmdk.guest') : t('cmdk.placeholder') }), h('kbd', { text: t('cmdk.key') }));
  }
  return { el: box, open, close, button, renderBlocks, acts };
}
