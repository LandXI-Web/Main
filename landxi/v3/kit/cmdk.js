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
const KIT_OPS = new Set(['map_region', 'map_zoom', 'map_view']);   // 화면이 처리하지 않을 때 키트가 stage.map 으로 하는 동작

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
  const acts = { sent: 0, done: 0, ok: 0, ops: [] };

  const open = (q) => { box.hidden = false; dim.hidden = false; if (!guest) { if (q) input.value = q; requestAnimationFrame(() => { input.focus(); input.select(); }); } };
  const close = () => { box.hidden = true; dim.hidden = true; };
  dim.addEventListener('click', close);
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.hidden ? open() : close(); }
    else if (e.key === 'Escape' && !box.hidden) { e.stopPropagation(); close(); }
  }, true);

  // 동작 끝 기록(plan 3.2) — 화면·키트가 낸 kit:agent-action-done 을 이 run 에 센다(지어낸 동작 판정 · 개발자 서랍)
  document.addEventListener('kit:agent-action-done', (e) => {
    const d = e.detail || {};
    acts.done += 1; if (d.ok) acts.ok += 1;
    box.dataset.actsDone = String(acts.done); box.dataset.actsOk = String(acts.ok);
    devlog('agent action', `${d.op || ''} ${d.ok ? 'ok' : 'fail'}${d.by ? ` · ${d.by}` : ''}`);
  });

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
    acts.sent = acts.done = acts.ok = 0; acts.ops = []; box.dataset.acts = '0'; box.dataset.actsDone = '0'; box.dataset.actsOk = '0';
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
          plan.querySelector(`li[data-i="${d?.i}"]`)?.classList.add('is-done');
          for (const a of d?.ui_actions || []) act(a);
        }
        if (name === 'agent.tool.progress') for (const a of d?.ui_actions || []) act(a);
        if (name === 'agent.confirm') confirmCard(d);
        if (name === 'agent.confirm.decided') conf.hidden = true;
        if (name === 'agent.token') { buf += d?.delta || ''; ans.hidden = false; ans.textContent = clean(buf); }
        if (name === 'agent.done') {
          const md = String(d?.answer_md || buf || '').trim();
          devlog('vllm', `${d?.model?.id || ''} · ${d?.perf?.total_ms ?? '—'} ms · ${md.slice(0, 200)}`);
          if (!md && !(d?.blocks || []).length) { fail('빈 답'); return; }
          settle('done'); ans.hidden = !md; ans.innerHTML = fill(md, d?.envelopes, d?.lang || lang);
          renderBlocks(d?.blocks || [], d?.envelopes || {}, d?.lang || lang);
        }
        if (name === 'agent.rejected') say(d?.message || tl(lang, 'cmdk.error'));
        if (name === 'agent.failed') fail(`failed · ${d?.error || ''}`);
      },
    });
  });

  function confirmCard(d) {
    conf.hidden = false;
    conf.innerHTML = '';
    conf.append(h('p.k-ck-cq', { text: d?.say || tl(lang, `tool.${d?.tool}`) || tl(lang, 'cmdk.confirm') }),
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

  const done = (op, ok, by = 'kit') => document.dispatchEvent(new CustomEvent('kit:agent-action-done', { detail: { op, ok: !!ok, by } }));
  function act(a) {
    if (!a?.op) return;
    acts.sent += 1; acts.ops.push(a.op); box.dataset.acts = String(acts.sent);
    onAction?.(a);
    const ev = new CustomEvent('kit:agent-action', { detail: a, cancelable: true });
    document.dispatchEvent(ev);
    if (ev.defaultPrevented) return;                 // 화면이 직접 처리(끝나면 화면이 done 을 낸다)
    const map = stage?.map;
    if (a.op === 'map_arrive' && a.features?.length && stage) {
      const fc = { type: 'FeatureCollection', features: a.features };
      stage.geo('agent', fc, 'ai'); stage.go(a.bbox || bboxOf(fc), { maxZoom: 15 });
    } else if (a.op === 'map_flyto' && (a.bbox || a.center) && stage) {
      const b = a.bbox || [a.center[0] - 0.003, a.center[1] - 0.003, a.center[0] + 0.003, a.center[1] + 0.003];
      stage.go(b, { maxZoom: 17 });
    } else if (a.op === 'map_frame' && a.geojson && stage) {
      stage.geo('agent-frame', { type: 'Feature', properties: {}, geometry: a.geojson }, 'focus');
    } else if (KIT_OPS.has(a.op)) {
      let ok = false;
      try {
        if (a.op === 'map_region' && (a.bbox || a.center) && stage) {
          stage.go(a.bbox || [a.center[0] - 0.05, a.center[1] - 0.05, a.center[0] + 0.05, a.center[1] + 0.05], { maxZoom: 12.5 }); ok = true;
        } else if (a.op === 'map_zoom' && map) {
          const z = a.zoom ?? map.getZoom() + (+a.delta || 1);
          map.easeTo({ zoom: Math.max(3, Math.min(19, z)), duration: 600 }); ok = true;
        } else if (a.op === 'map_view' && map) {
          map.easeTo({ pitch: +a.pitch || 0, bearing: +a.bearing || 0, duration: 800 }); ok = true;
        }
      } catch (err) { devlog('agent action', `${a.op} 실패 · ${err?.message || err}`); }
      done(a.op, ok);
    } else if (a.op === 'screen_open' && /^\/landxi\/v3\/[\w-]+\/(\?[\w=&%.-]*)?$/.test(String(a.href || ''))) {
      done(a.op, true);                              // 화면 열기(XI맵 등 · c2-xi) — 답 한 줄을 읽을 틈을 두고 그 주소로 간다
      setTimeout(() => location.assign(a.href), 900);
    } else if (!['map_arrive', 'map_flyto', 'map_frame', 'map_on', 'parcel_card', 'drawer_open'].includes(a.op)) {
      done(a.op, false);                             // 처리하는 화면이 없는 동작(map_layer·analysis_watch 등) — 실패로 기록
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
