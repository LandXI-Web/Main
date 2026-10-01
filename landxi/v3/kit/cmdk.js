/* K10 cmdk.js — XI ChatGEO 채팅창(이름 10-01 사용자 · 옛 'AI 도우미' · 확인 요청 9차 채팅-1 · 채팅-2 ⓐ · 원칙 82). vLLM · 게이트웨이 경유만: POST /agent/runs → SSE /events/agent/{run}.
   · 자리: 로그인한 모든 v3 화면 오른쪽 아래 같은 자리의 동그란 도우미 버튼(로그인 전 화면 · 메인 소개 · 게스트에는 그리지 않는다) → 누르면 그 위로 채팅창(PC 380 × 560 · 뒤 화면을 어둡게 하지 않음 ·
     휴대폰 ≤ 640 은 아래에서 올라오는 전체 폭 시트 72%). 범례 · 축척(왼쪽 아래)과 겹치지 않고, 오른쪽에 붙은 서랍 · 시트 · 버튼 · 글자가
     그 자리에 있으면 그 왼쪽(서랍) 또는 위로 비킨다.
   · 머리 '물어보기' 버튼 · 'Ctrl K' 표기 없음. 키보드 단축키(Ctrl · ⌘ K)는 남김(화면 표기 없음 — 채팅-2 ⓐ). Esc = 닫기.
   · 창: 머리(마스코트 · 'XI ChatGEO' · 닫기) → 대화(내 말 · 도우미 답) → 역할 · 화면별 추천 질문 셋 → 입력 칸 + 보내기.
     도우미 답 = 지금까지의 답 블록 그대로: 계획 줄(지도 동작 ✓ · 실패 표시) · 답(숫자 = 봉투 칩 · 법령 원문 인용) ·
     실행 확인 카드(쓰기 도구: 실행/취소) · 차트(막대 · 값 = 봉투) · 파일(내려받기) · 영상 조각(+ 꼬리표).
   · 생각 중: 한 줄('결과를 찾고 있습니다' — 지금 하는 일) + 마스코트 '생각 중' 표정. 문제 = 한 줄(경고색) + '다시 시도'(공통 모양).
   · 대화는 화면을 옮겨도 이어진다(이 브라우저 창 sessionStorage · 계정별) · 앞 답 기억(prev_run) · 답을 기다리던 중 옮기면 새 화면에서 이어 받는다.
   · 마스코트 그림은 assistant-mascot.js 한 곳(랜디로 바꾸는 자리).
   한 페이지에 창 하나 — 셸이 먼저 붙이고(shell.js), 화면이 mountCmdk 를 부르면 같은 창에 stage · context · onAction 을 더한다.
   const k = mountCmdk({ stage, guest: !who, context: () => ({ region: sgg }), onAction: (a) => {} });
   k.open('질문') · k.close() · k.renderBlocks(blocks, envs, lang) · k.button() = 빈 자리표(옛 화면 호출 호환 — 머리에 아무것도 서지 않는다)
   옛 화면 호환: k.el = 채팅창(.k-ck) · 그 안의 form · .k-ck-i(입력) · 지금 차례의 .k-ck-plan · .k-ck-c · .k-ck-a · .k-ck-blocks(한 벌 — 지나간
   차례는 같은 내용을 .k-chat-plan · .k-chat-a · .k-chat-blocks 로 옮겨 둔다) · data-state(busy | done | rejected | failed) · data-busy.
   k.close() = 화면이 부르는 '지도 보이기'(답 뒤 자동 접기) — PC 는 지도를 가리지 않으므로 그대로 두고, 휴대폰은 시트를 내린다.
   k.close({ force: true }) = 닫기.
   C2(plan 3.2·3.3·3.6) 그대로:
   · 질문 언어로 문구(계획 줄 · 확인 카드 · 오류 · 단위) — langOf(질문)
   · 동작: kit:agent-action(detail = ui_action · cancelable). 화면이 직접 처리하면 e.preventDefault() 하고 끝나면
     kit:agent-action-done {op, ok} 를 낸다. 아무도 막지 않으면 키트 기본 처리(stage.map: map_region · map_zoom · map_view)
     후 키트가 kit:agent-action-done 을 낸다. 받은 done 은 이 run 의 기록(data-acts · data-acts-ok)으로 남긴다. */
import { h, esc, api, isEnvelope, bboxOf } from './util.js';
import { sse } from '../../shared/api-v1.js';
import { devlog } from './dev-drawer.js';
import { t, tl, langOf, nf, locale } from './i18n.js';
import { bars } from './chart.js';
import { faceImg } from './assistant-mascot.js';

const EVENTS = ['agent.route', 'agent.plan', 'agent.tool.call', 'agent.tool.result', 'agent.confirm', 'agent.confirm.decided', 'agent.token', 'agent.done', 'agent.failed', 'agent.rejected'];
const KIT_OPS = new Set(['map_region', 'map_zoom', 'map_view', 'map_layer']);   // 화면이 처리하지 않을 때 키트가 지도로 하는 동작
/* 그리기 · 보여 주기(10-01 사용자 "시각화한 거 맞어? 안 보이는데?") — 화면에 실제로 그려진 것을 확인한 뒤에만 '그렸습니다'.
   화면이 처리하면 화면이 끝 신호를, 아니면 키트가 지도에 그리고 보이는지 잰 뒤 끝 신호를 낸다. 지도가 없는 화면이면 그리지 못했다고 말하고
   채팅 안에 작은 결과(표) + 'XI맵에서 크게 보기'(그 지역 · 그 규칙을 켠 XI맵). */
const VIS = new Set(['map_on', 'map_arrive', 'map_frame', 'map_flyto']);
const TRACK = new Set([...KIT_OPS, ...VIS]);    // R3 M5 — 답이 '했습니다'라고 말하는 지도 동작(성공·실패를 답에 반영)
const DEADEND = /아직\s*할\s*수\s*없|할\s*수\s*없습니다|지원하지\s*않|can't do that|cannot do that|not (?:available|supported) yet/i;   // 막다른 말 — 다음 할 일을 붙인다
const ACT_WAIT_MS = 3000;                                                       // 답이 끝난 뒤 이 시간 안에 동작 끝 신호가 없으면 '확인되지 않음'
const KEEP_TURNS = 30;                                                          // 이어 보는 대화(이 창) — 오래된 차례부터 버린다

/* 창 글(화면 로캘) · 생각 중 한 줄(질문 언어) — 새 업무 용어 없이 */
const STR = {
  ko: {
    title: 'XI ChatGEO', sub: '말로 지도 · 분석 · 보고서', open: 'XI ChatGEO 열기', close: '닫기', tag: 'XI ChatGEO', send: '보내기',
    ph: '지도를 움직이거나 결과를 물어보세요', intro: '말로 지도를 움직이고, 결과 · 보고서 · 법령을 찾아 드립니다.', sugg: '추천 질문', log: '대화',
    draw: '이 화면 지도에는 그 결과 층이 없어 그리지 못했습니다', drawNomap: '이 화면에는 지도가 없어 지도에 그리지 못했습니다', xi: 'XI맵에서 크게 보기',
    found: '찾은 필지', next: '이렇게 해 볼 수 있습니다', mapCan: '이 화면 지도에서는 이동 · 확대 · 축소 · 기울이기 · 영상 층 켜고 끄기를 할 수 있습니다.',
    nomap: '이 화면에는 지도가 없습니다. 지도는 XI맵에서 크게 볼 수 있습니다.', nextMap: ['지도 확대해 줘', '3D로 기울여 줘', '어느 지역에 어떤 결과가 있어?'],
    doing: { _: '답을 찾고 있습니다', find: '결과를 찾고 있습니다', map: '지도를 움직이고 있습니다', law: '법령 조문을 찾고 있습니다', report: '보고서 초안을 만들고 있습니다',
      ops: '운영 현황을 확인하고 있습니다', run: 'AI 분석을 준비하고 있습니다', img: '영상을 살펴보고 있습니다', parcel: '필지를 찾고 있습니다', ledger: '대장과 AI 결과를 맞추고 있습니다' },
  },
  en: {
    title: 'XI ChatGEO', sub: 'Map · analysis · reports', open: 'Open XI ChatGEO', close: 'Close', tag: 'XI ChatGEO', send: 'Send',
    ph: 'Move the map or ask about results', intro: 'Move the map by chat, and ask about results and reports.', sugg: 'Suggested questions', log: 'Conversation',
    draw: "This map has no layer for that result, so it wasn't drawn", drawNomap: "This screen has no map, so it wasn't drawn", xi: 'Open in XI map',
    found: 'Parcels found', next: 'You can try', mapCan: 'On this map you can move, zoom, tilt and turn the imagery on or off.',
    nomap: 'This screen has no map. Open the XI map to see it large.', nextMap: ['Zoom in on the map', 'Tilt the map in 3D', 'What results do we have here?'],
    doing: { _: 'Looking for the answer', find: 'Looking up the results', map: 'Moving the map', law: 'Finding the provision', report: 'Drafting the report',
      ops: 'Checking operations', run: 'Preparing the AI analysis', img: 'Looking at the imagery', parcel: 'Finding the parcel', ledger: 'Matching the register and AI results' },
  },
};
const LOC = locale() === 'en' ? 'en' : 'ko';
const S = STR[LOC];
const doingOf = (tool) => (/^(map_|screen_open|global_map)/.test(tool) ? 'map' : tool === 'law_search' ? 'law' : tool === 'report_draft' ? 'report'
  : /^ops_/.test(tool) ? 'ops' : /^(analysis_|jobs_|survey_build)/.test(tool) ? 'run' : /^(vlm_|crop_tiles)/.test(tool) ? 'img'
  : /^(parcel_|survey_parcel)/.test(tool) ? 'parcel' : /^(ledger_|fusion_)/.test(tool) ? 'ledger' : tool ? 'find' : '_');

/* 추천 질문 셋 — 역할(LX 직원 · LX 관리자 · 기관) × 지금 화면(지역을 고른 지도 화면인가). 모두 지금 AI 도우미가 답하는 질문. */
const SUGG = {
  staffHere: ['이 지역 현장 확인 필요 필지 몇 건이야?', '이 지역 결과 요약해 줘', '이 지역 보고서 초안 만들어 줘'],
  staff: ['어느 지역에 어떤 결과가 있어?', '현장 확인 필요 필지가 많은 지역은?', '농지 전용 근거 조문 알려 줘'],
  admin: ['분석 대기열 요약해 줘', '기관별 사용량 보여 줘', '지금 경보 있어?'],
  tenant: ['우리 지역 현장 확인 필요 필지 몇 건이야?', '농지 전용 근거 조문 알려 줘', '보고서 초안 만들어 줘'],
  en: ['What results do we have here?', 'Zoom in on the map', 'Show the imagery layer'],
};

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
    .replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').replace(/\*\*(.+?)\*\*/g, '$1');
}
/** 채팅 답 — 문단은 <p>, 법령 원문 인용(「법령」 제n조 … 줄 + “원문”)은 인용 블록. 줄바꿈 한 번은 줄을 바꾼다. */
function answerHtml(md, envs = {}, lang = 'ko') {
  return String(md || '').split(/\n{2,}/).map((para) => {
    const p = para.trim(); if (!p) return '';
    const law = /^([^\n]{2,160})\n\s*“([\s\S]+)”\s*$/.exec(p);
    if (law && /「[^」]+」|제\s*\d+\s*조|Article\s+\d+/.test(law[1])) {
      return `<blockquote class="k-ck-law"><b>${fill(law[1], envs, lang)}</b>${fill(law[2], envs, lang).replace(/\n/g, '<br>')}</blockquote>`;
    }
    return `<p>${fill(p, envs, lang).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}
const rel = (href) => String(href || '').replace(/^.*?\/api\/v1(?=\/)/, '');
const isPhone = () => matchMedia('(max-width: 640px)').matches;
const LIVE_CLS = { 'k-ck-plan': 'k-chat-plan', 'k-ck-a': 'k-chat-a', 'k-ck-blocks': 'k-chat-blocks' };

let CHAT = null;   // 한 페이지에 창 하나

/** 도우미 창 붙이기 — 이미 있으면 같은 창에 설정만 더한다(셸이 먼저 · 화면이 나중) */
export function mountCmdk(opts = {}) {
  if (CHAT) { CHAT.configure(opts); return CHAT.api; }
  CHAT = create(opts);
  return CHAT.api;
}

function create(opts) {
  const cfg = { stage: null, guest: false, context: () => ({}), onAction: null, who: null, home: '' };
  const configure = (o = {}) => {
    if (o.stage) cfg.stage = o.stage;
    if (typeof o.context === 'function') cfg.context = o.context;
    if (typeof o.onAction === 'function') cfg.onAction = o.onAction;
    if (o.who !== undefined) cfg.who = o.who;
    if (o.home) cfg.home = o.home;
    if (o.guest !== undefined) cfg.guest = !!o.guest;
    applyGuest(); drawSugg(); bindStore();
  };

  /* ── 창 ── */
  const input = h('input.k-ck-i', { type: 'text', maxlength: '300', autocomplete: 'off', spellcheck: 'false' });
  const send = h('button.k-chat-send', { type: 'submit', 'aria-label': S.send, html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M11 5l5 5-5 5"/></svg>' });
  const form = h('form.k-ck-f.k-chat-in', {}, input, send);
  const plan = h('ol.k-ck-plan', { hidden: true });
  const ans = h('div.k-ck-a', { hidden: true });
  const blk = h('div.k-ck-blocks', { hidden: true });
  const conf = h('div.k-ck-c', { hidden: true });
  const hdFace = h('span.k-chat-face.k-chat-face--hd', { 'data-face': 'idle' }, faceImg('idle'));
  const xBtn = h('button.k-chat-x', { type: 'button', 'aria-label': S.close, html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>' });
  const head = h('header.k-chat-h', {}, hdFace, h('span.k-chat-tt', {}, h('b', { text: S.title }), h('small', { text: S.sub })), xBtn);
  const intro = h('div.k-chat-msg.ai.k-chat-intro', {}, h('span.k-chat-face', { 'data-face': 'idle' }, faceImg('idle')), h('div.k-chat-bub', {}, h('p', { text: S.intro })));
  const log = h('div.k-chat-b', { role: 'log', 'aria-live': 'polite', 'aria-label': S.log }, intro);
  const sugg = h('div.k-chat-sugg', { role: 'group', 'aria-label': S.sugg });
  const box = h('section.k-ck.k-chat', { id: 'k-chat', role: 'dialog', 'aria-modal': 'false', 'aria-label': S.title, hidden: true }, head, log, sugg, form);
  const fabFace = h('span.k-chat-face.k-chat-face--fab', { 'data-face': 'idle' }, faceImg('idle'));
  const fab = h('button.k-chat-fab', { type: 'button', 'aria-label': S.open, 'aria-controls': 'k-chat', 'aria-expanded': 'false' }, fabFace);
  const tag = h('span.k-chat-tag', { 'aria-hidden': 'true', text: S.tag });
  const root = h('div.k-chat-root', {}, tag, fab, box);
  document.body.append(root);

  let stream = null, runId = null, lang = LOC;
  const urls = [];
  const acts = { sent: 0, done: 0, ok: 0, ops: [], items: [] };
  trackMaps();

  /* 로그인하지 않은 화면(메인 소개 · 게스트)에는 도우미 버튼 · 창을 그리지 않는다(사용자 10-01 — 로그인해야 쓸 수 있으므로) */
  const applyGuest = () => {
    root.hidden = cfg.guest;
    if (cfg.guest && !box.hidden) hide();
    input.disabled = cfg.guest; send.disabled = cfg.guest;
    input.placeholder = cfg.guest ? t('cmdk.guest') : S.ph;
    input.setAttribute('aria-label', cfg.guest ? t('cmdk.guest') : S.ph);
    box.dataset.guest = cfg.guest ? '1' : '';
    intro.querySelector('p').textContent = cfg.guest ? t('cmdk.guest') : S.intro;
  };
  const ctxNow = () => { try { return cfg.context() || {}; } catch { return {}; } };
  function suggestions() {
    if (cfg.guest) return [];
    if (LOC === 'en') return SUGG.en;
    const home = cfg.home || document.body.dataset.home || location.pathname.split('/').filter(Boolean).pop() || '';
    const key = cfg.who?.key || '';
    if (/^ops-/.test(home)) return SUGG.admin;
    if (key.startsWith('tenant/') || /^gov-/.test(home)) return SUGG.tenant;
    const c = ctxNow();
    return (c.region || c.region_name) && key !== 'lx/sales' ? SUGG.staffHere : SUGG.staff;
  }
  function drawSugg() {
    const list = suggestions();
    sugg.innerHTML = '';
    for (const q of list) sugg.append(h('button.k-chat-chip', { type: 'button', 'data-q': q, text: q }));
    sugg.hidden = !list.length;
  }
  const faces = (kind) => {
    for (const el of [hdFace, live?.face].filter(Boolean)) {
      if (el.dataset.face === kind) continue;
      el.dataset.face = kind; el.replaceChildren(faceImg(kind));
    }
  };

  /* ── 열기 · 닫기 · 단축키 ── */
  /* R3 — 여는 즉시 입력 칸에 초점(다음 프레임을 기다리지 않는다): 연 직후 친 글자가 사라지지 않고, 앞 질문은 선택돼 새 글자로 바뀐다(두 번 붙기 0) */
  let openedAt = 0;
  const open = (q, { focus = true } = {}) => {
    if (cfg.guest) return;                                          // 로그인 전에는 열지 않는다
    const was = box.hidden;
    if (was) openedAt = Date.now();
    box.hidden = false; root.dataset.open = '1'; fab.setAttribute('aria-expanded', 'true'); tag.hidden = true;
    if (was) { drawSugg(); place(true); requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); }
    store.data.open = true; save();
    if (cfg.guest) return;
    if (q) input.value = q;
    if (!focus) return;
    try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    input.select();
    requestAnimationFrame(() => { if (!box.hidden && document.activeElement !== input) input.focus({ preventScroll: true }); });
  };
  const hide = () => {
    if (box.hidden) return;
    const inside = box.contains(document.activeElement);
    box.hidden = true; delete root.dataset.open; fab.setAttribute('aria-expanded', 'false'); tag.hidden = false;
    store.data.open = false; save();
    if (inside) { try { fab.focus({ preventScroll: true }); } catch { /* */ } }
    place();
  };
  /** 화면이 부르는 닫기 = 지도 보이기(답 뒤 자동 접기) — PC 는 지도를 가리지 않으므로 그대로 · 휴대폰은 시트를 내린다 */
  const close = (o = {}) => { if (o.force || isPhone()) hide(); };
  fab.addEventListener('click', () => (box.hidden ? open() : hide()));
  tag.addEventListener('click', () => open());
  xBtn.addEventListener('click', hide);
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { if (cfg.guest) return; e.preventDefault(); box.hidden ? open() : hide(); }
    else if (e.key === 'Escape' && !box.hidden && !e.defaultPrevented && !document.querySelector('.k-md-bg')) { e.stopPropagation(); hide(); }
    else if (!box.hidden && !cfg.guest && e.target !== input && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing
      && (e.target === document.body || box.contains(e.target) || e.target === fab)
      && !(e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))) {
      // 열린 창 안(방금 누른 버튼 등)에 초점이 남아 있을 때 친 글자 → 입력 칸으로 넘긴다
      e.preventDefault();
      input.focus({ preventScroll: true });
      input.setRangeText(e.key, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end');
    }
  }, true);

  /* ── 차례(내 말 + 도우미 답) ── */
  let live = null, turnSeq = 0;
  const meMsg = (q) => h('div.k-chat-msg.me', {}, h('div.k-chat-bub', {}, h('p', { text: q })));
  const thinkEl = () => h('div.k-chat-think', {}, h('span.k-ck-dots', { 'aria-hidden': 'true', html: '<i></i><i></i><i></i>' }), h('span.k-chat-doing', { text: S.doing._ }));
  /** 지금 차례의 살아 있는 칸(plan · conf · ans · blk 한 벌)을 지난 차례 칸으로 옮겨 둔다(내용 · 버튼 그대로) */
  function archive() {
    if (!live) return;
    clearTimeout(snapT); snap();                                   // 나가는 차례를 지금 기록(미뤄 둔 기록이 다음 차례로 가지 않게)
    live.msg.classList.remove('is-live');
    live.bub.querySelector('.k-chat-think')?.remove();
    for (const el of [plan, ans, blk]) {
      const cls = LIVE_CLS[[...el.classList].find((c) => LIVE_CLS[c])];
      const a = document.createElement(el.tagName);
      a.className = cls; a.hidden = el.hidden;
      while (el.firstChild) a.append(el.firstChild);
      el.replaceWith(a);
      el.hidden = true;
    }
    conf.remove(); conf.innerHTML = ''; conf.hidden = true;
    if (live.face.dataset.face !== 'answer') { live.face.dataset.face = 'answer'; live.face.replaceChildren(faceImg('answer')); }
    live = null;
  }
  function newTurn(q, { reuse = true, rec = null } = {}) {
    // 같은 질문을 화면이 서버로 다시 넘긴 경우(대장 경로 → 서버) — 새 차례 대신 지금 차례를 비워 쓴다
    if (reuse && live && live.q === q && !live.run && Date.now() - live.at < 30000) {
      plan.innerHTML = ''; plan.hidden = true; ans.innerHTML = ''; ans.hidden = true; blk.innerHTML = ''; blk.hidden = true; conf.hidden = true;
      return live;
    }
    archive();
    const face = h('span.k-chat-face', { 'data-face': 'think' }, faceImg('think'));
    const bub = h('div.k-chat-bub', {}, thinkEl(), plan, conf, ans, blk);
    const msg = h('div.k-chat-msg.ai.is-live', {}, face, bub);
    plan.innerHTML = ''; plan.hidden = true; ans.innerHTML = ''; ans.hidden = true; blk.innerHTML = ''; blk.hidden = true; conf.innerHTML = ''; conf.hidden = true;
    const me = meMsg(q);
    log.append(me, msg);
    intro.hidden = true;
    const r = rec || { id: `t${Date.now().toString(36)}${++turnSeq}`, q, html: '', state: 'busy', run: null, at: Date.now() };
    if (!rec) { store.data.turns.push(r); store.data.turns = store.data.turns.slice(-KEEP_TURNS); }
    live = { id: r.id, q, run: r.run, at: Date.now(), me, msg, bub, face, rec: r };
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    return live;
  }
  const doing = (kind, lg = lang) => { const el = live?.bub.querySelector('.k-chat-doing'); if (el) el.textContent = (STR[lg] || S).doing[kind] || S.doing._; };

  /* 보내기 — 창(capture)이 먼저 차례를 세운다: 화면의 가로채기(대장 경로 · 영어 꼬리)보다 앞서 내 말 · 빈 답 칸이 선다 */
  addEventListener('submit', (e) => {
    if (e.target !== form || cfg.guest) return;
    const raw = input.value.trim(); if (!raw) return;
    newTurn(raw);
    live.fresh = true;
    box.dataset.state = 'busy';                     // 화면이 가로채 스스로 답하면 화면이 done 으로 바꾼다
    faces('think'); save();
    setTimeout(() => { if (input.value.trim() === raw || input.value.trim().startsWith(raw + '\n')) input.value = ''; }, 40);
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
  /* 판정 — 카메라(이동 · 확대 · 시점 · 층) 묶음과 그리기 묶음을 따로: 묶음 안에서 하나라도 되면 됨 · 모두 실패면 실패 · 끝 신호가 안 오면 확인되지 않음.
     둘 다 되면 ok · 하나만 되면 partial. 끝 신호를 기다리는 동작이 남아 있으면 final(3초) 까지 기다린다. */
  const groupOf = (xs) => (!xs.length ? 'none' : xs.some((x) => x.state === 'ok') ? 'ok' : xs.every((x) => x.state === 'fail') ? 'failed' : 'pending');
  const actVerdict = (final) => {
    const tr = acts.items.filter((x) => TRACK.has(x.op));
    if (!tr.length) return null;
    if (!final && tr.some((x) => x.state === 'sent')) return null;
    const norm = (g) => (g === 'pending' ? 'unconfirmed' : g);
    const cam = norm(groupOf(tr.filter((x) => !VIS.has(x.op)))), vis = norm(groupOf(tr.filter((x) => VIS.has(x.op))));
    const good = (g) => g === 'ok' || g === 'none';
    const v = good(cam) && good(vis) ? 'ok' : cam === 'ok' || vis === 'ok' ? 'partial' : [cam, vis].includes('unconfirmed') ? 'unconfirmed' : 'failed';
    return { v, cam, vis };
  };
  const hasMap = () => !!(cfg.stage?.map || liveMap());
  function settleActs(final) {
    if (!shown || shown.run !== runId) return;
    const r = actVerdict(final || shown.expired);
    if (!r || r.v === shown.v) return;
    shown.v = r.v; box.dataset.actsVerdict = r.v;
    let md = shown.md;
    if (r.v !== 'ok') {
      const tr = acts.items.filter((x) => TRACK.has(x.op));
      const L = STR[shown.lang] || S;
      const lines = [];
      if (r.vis !== 'ok' && r.vis !== 'none') lines.push(`${hasMap() ? L.draw : L.drawNomap}.`);
      if (r.cam === 'failed') lines.push(tr.filter((x) => !VIS.has(x.op)).map((x) => failLine(x, shown.lang)).join(' '));
      else if (r.cam === 'unconfirmed') lines.push(`${tl(shown.lang, 'cmdk.act.unconfirmed')}.`);
      const line = lines.join(' ');
      const claims = (shown.claims || []).filter((c) => c && md.includes(c));
      if (claims.length) { md = md.replace(claims[0], line); for (const c of claims.slice(1)) md = md.replace(c, '').replace(/[ \t]{2,}/g, ' '); }
      else md = `${md}${md ? '\n\n' : ''}${line}`;
    }
    ans.hidden = !md; ans.innerHTML = answerHtml(md, shown.envs, shown.lang);
    if (r.v !== 'ok') nextSteps({ lang: shown.lang, drawn: r.vis === 'ok' || r.vis === 'none' });
    snap();
    const items = acts.items.filter((x) => TRACK.has(x.op)).map((x) => ({ op: x.op, ok: x.state === 'ok', done: x.state !== 'sent', ...(x.reason ? { reason: x.reason } : {}) }));
    api(`/agent/runs/${shown.run}/acts`, { method: 'POST', body: { sent: items.length, done: items.filter((x) => x.done).length, ok: items.filter((x) => x.ok).length, items, verdict: r.v } })
      .catch((err) => devlog('agent acts', String(err?.message || err)));
  }
  /* 막다른 말 대신 다음 할 일 — (가) 가장 가까운 일: 지도가 없거나 그리지 못했으면 그 지역 · 그 규칙을 켠 XI맵 · 찾은 필지는 작은 표로
     (나) 할 수 있는 것 두세 개(누르면 바로 묻는다) (다) 이유 한 줄. 한 답에 한 번. */
  let nextFor = null;                                              // 이 답의 다음 할 일 상태(막다른 말 · 그리지 못함을 합쳐 한 덩이로)
  function nextSteps({ lang: lg = lang, drawn, deadend } = {}) {
    if (!nextFor || nextFor.run !== runId) nextFor = { run: runId, drawn: true, deadend: false };
    if (drawn === false) nextFor.drawn = false;
    if (deadend) nextFor.deadend = true;
    ({ drawn, deadend } = nextFor);
    blk.querySelector('.k-chat-next')?.remove();
    const L = STR[lg] || S;
    const arr = acts.items.find((x) => x.op === 'map_arrive')?.a, on = acts.items.find((x) => x.op === 'map_on')?.a;
    const sgg = arr?.sgg_cd || on?.sgg_cd || on?.filter?.sgg_cd || ctxNow().region || '';
    const rule = on?.filter?.rule || arr?.features?.[0]?.properties?.rule || '';
    const el = h('div.k-ck-blk.k-chat-next', { 'data-kind': 'next' });
    if (!drawn && arr?.features?.length) {                                    // 찾은 필지 — 작은 표(상위 5)
      const rows = arr.features.slice(0, 5).map((f, i) => {
        const p = f.properties || {};
        const v = p.evid_m2 != null ? `${nf(p.evid_m2, 0, lg)}㎡` : p.score != null ? nf(p.score, 1, lg) : '';
        return h('tr', {}, h('td.n', { text: String(p.n ?? i + 1) }), h('td', { text: p.addr || p.pnu || '' }), h('td.v', { text: v }));
      });
      el.append(h('p.k-ck-bt', { text: `${L.found} ${nf(arr.features.length, 0, lg)}` }), h('table.k-chat-tbl', {}, h('tbody', {}, ...rows)));
    }
    if (!hasMap() && deadend) el.append(h('p.k-chat-why', { text: L.nomap }));
    else if (hasMap() && (deadend || !drawn)) el.append(h('p.k-chat-why', { text: L.mapCan }));
    const xiOk = !!document.querySelector('.k-mast a.k-xi') && !/\/xi-clean\//.test(location.pathname);
    const btns = h('div.k-chat-acts');
    if (xiOk && (!drawn || !hasMap())) {
      const q = new URLSearchParams(); if (sgg) q.set('region', String(sgg)); if (rule) q.set('rule', String(rule));
      btns.append(h('a.t-btn.t-btn--2.k-chat-xi', { href: new URL('../xi-clean/' + (q.toString() ? '?' + q : ''), location.href).href, text: L.xi }));
    }
    const asked = live?.q || '';
    const chips = (hasMap() ? L.nextMap : suggestions()).filter((x) => x !== asked).slice(0, btns.children.length ? 2 : 3);
    for (const c of chips) btns.append(h('button.k-chat-chip', { type: 'button', 'data-q': c, text: c }));
    if (btns.children.length) el.append(h('p.k-ck-bt', { text: L.next }), btns);
    if (el.children.length) { blk.append(el); blk.hidden = false; }
  }

  /* 끝 상태를 분명히: data-state = busy(생각 중 한 줄 · aria-busy) → done | rejected(서버 거절 문구 그대로 한 줄) | failed('지금은 답할 수 없습니다' + 다시 시도).
     무응답 0 — SSE 연결 실패 3회 · 끝 이벤트 없이 45초 · 빈 답이면 failed 로 닫는다. */
  const SERVER_LINE = new Set(['forbidden', 'out_of_scope', 'unauthorized']);   // 서버 문구를 그대로 보일 오류(개발 정보 없는 한 줄)
  const TIMEOUT_MS = 45000;
  const POLL_AFTER_MS = 4000, POLL_EVERY_MS = 1500;          // 스트림 무응답 → 짧은 조회(impl-1)
  let seq = 0, guard = 0;
  const settle = (state, text) => {
    clearTimeout(guard); delete box.dataset.busy; box.dataset.state = state; box.removeAttribute('aria-busy');
    if (text != null) { ans.hidden = false; ans.textContent = text; }
    stream?.close();
  };
  const say = (text) => settle('rejected', text);
  /** 문제 — 그 자리 한 줄(경고색) + '다시 시도'(공통 모양 · 같은 질문을 다시 보낸다) */
  const errLine = (lg, q) => [h('span.k-chat-err', { text: tl(lg, 'cmdk.error') }), q ? h('button.k-chat-retry', { type: 'button', 'data-q': q, text: tl(lg, 'empty.retry') }) : null].filter(Boolean);
  const fail = (why) => {
    devlog('agent', why);
    settle('failed');
    ans.hidden = false; ans.replaceChildren(...errLine(lang, live?.q));
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (cfg.guest) return;
    const msg = input.value.trim(); if (!msg) return;
    if (!live?.fresh) newTurn(msg, { reuse: false });
    live.fresh = false;
    const turn = live;
    const my = ++seq;
    lang = langOf(msg); box.dataset.lang = lang;
    acts.sent = acts.done = acts.ok = 0; acts.ops = []; acts.items = []; box.dataset.acts = '0'; box.dataset.actsDone = '0'; box.dataset.actsOk = '0';
    shown = null; clearTimeout(actTimer); delete box.dataset.actsVerdict;
    stream?.close(); clearTimeout(guard); plan.innerHTML = ''; plan.hidden = true; conf.hidden = true; clearBlocks();
    ans.hidden = true; ans.innerHTML = '';
    doing('_', lang);
    box.dataset.busy = '1'; box.dataset.state = 'busy'; box.setAttribute('aria-busy', 'true');
    guard = setTimeout(() => { if (my === seq && box.dataset.state === 'busy') fail('끝 이벤트 없이 시간 초과'); }, TIMEOUT_MS);
    const ctx = { ...ctxNow() };
    if (runId) ctx.prev_run = runId;   // 이 창의 바로 앞 답('1위 필지' 같은 말은 이 답의 목록으로만 푼다 · 같은 계정 다른 창 답과 섞이지 않게)
    if (cfg.stage?.map) { const b = cfg.stage.map.getBounds(); ctx.bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; ctx.zoom = cfg.stage.map.getZoom(); }
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
    turn.run = runId; turn.rec.run = runId; store.data.run = runId; save();
    follow(my, runId, r.events_url);
  });

  /** 한 run 의 사건 받기 — 스트림(SSE) + 막히면 짧은 조회. replay = 다른 화면에서 시작한 답을 이어 받기(지도 동작은 다시 하지 않는다) */
  function follow(my, run, eventsUrl, { replay = false } = {}) {
    let buf = '', errs = 0, got = false, polling = false;
    const seen = new Set();
    /* 답 받기 연결이 막혀도 서버가 끝낸 답은 받는다(impl-1 · r3-ops 실증 3차 — 탭이 많은 브라우저에서 스트림 연결 칸이 모자라 45초 뒤 '답할 수 없습니다'):
       POLL_AFTER_MS 안에 사건이 하나도 안 오거나 스트림이 세 번 끊기면 짧은 조회(GET /agent/runs/{id}/events)로 같은 사건을 받아 같은 처리기로 넘긴다. */
    const startPoll = () => {
      if (polling || my !== seq || box.dataset.state !== 'busy') return;
      polling = true; devlog('agent', '답 받기 연결 없음 · 조회로 받음');
      let last = null;
      const tick = async () => {
        if (my !== seq || box.dataset.state !== 'busy') return;
        try {
          const j = await api(`/agent/runs/${encodeURIComponent(run)}/events${last ? '?after=' + encodeURIComponent(last) : ''}`);
          for (const it of j?.items || []) { last = it.id; handle(it.event, it.data, it.id); }
          if (j?.done) return;
        } catch (err) { devlog('agent poll', err.code || err.message); if (replay && (err.status === 404 || err.status === 403)) { fail('이어 받을 답 없음'); return; } }
        setTimeout(tick, POLL_EVERY_MS);
      };
      tick();
    };
    if (replay || !eventsUrl) { startPoll(); return; }
    setTimeout(() => { if (!got) startPoll(); }, POLL_AFTER_MS);
    stream = sse(eventsUrl.replace(/^\/api\/v1/, ''), {
      events: [...EVENTS, 'agent.fallback', 'agent.tool.progress'],
      onState: (s) => {
        if (my !== seq || box.dataset.state !== 'busy') return;
        if (s === 'open') errs = 0;
        if (s === 'error' && ++errs >= 3 && !got) startPoll();
      },
      on: (name, d, id) => handle(name, d, id),
    });
    function handle(name, d, id) {
      if (my !== seq) return;
      if (id) { if (seen.has(id)) return; seen.add(id); }       // 스트림과 조회가 같은 사건을 두 번 넘기지 않게
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
        if (steps[0]) doing(doingOf(steps[0].tool));
      }
      if (name === 'agent.tool.call') doing(doingOf(d?.tool));
      if (name === 'agent.tool.result') {
        const li = plan.querySelector(`li[data-i="${d?.i}"]`);
        // 단계 표시 = 실제 결과: 도구 실패면 실패 표시 · 지도 동작(TRACK)은 화면의 끝 신호를 받고 나서 완료/실패(M5 — 실패한 동작에 ✓ 0)
        const mapActs = !replay && (d?.ui_actions || []).some((a) => TRACK.has(a?.op));
        if (li) li.classList.add(d?.ok === false ? 'is-fail' : mapActs ? 'is-wait' : 'is-done');
        if (!replay) for (const a of d?.ui_actions || []) act(a, d?.i);
      }
      if (name === 'agent.tool.progress' && !replay) for (const a of d?.ui_actions || []) act(a, d?.i);
      if (name === 'agent.confirm') confirmCard(d);
      if (name === 'agent.confirm.decided') conf.hidden = true;
      if (name === 'agent.token') { buf += d?.delta || ''; ans.hidden = false; ans.textContent = clean(buf); const th = live?.bub.querySelector('.k-chat-think'); if (th) th.hidden = true; keepDown(); }
      if (name === 'agent.done') {
        const md = String(d?.answer_md || buf || '').trim();
        devlog('vllm', `${d?.model?.id || ''} · ${d?.perf?.total_ms ?? '—'} ms · ${md.slice(0, 200)}`);
        if (!md && !(d?.blocks || []).length) { fail('빈 답'); return; }
        settle('done'); ans.hidden = !md; ans.innerHTML = answerHtml(md, d?.envelopes, d?.lang || lang);
        renderBlocks(d?.blocks || [], d?.envelopes || {}, d?.lang || lang);
        shown = { run, md, envs: d?.envelopes || {}, lang: d?.lang || lang, claims: d?.act_claims || [], v: null, expired: false };
        settleActs(false);
        if (DEADEND.test(md)) nextSteps({ lang: d?.lang || lang, deadend: true });   // 막다른 말로 끝내지 않는다
        clearTimeout(actTimer);
        actTimer = setTimeout(() => { if (shown && shown.run === runId) { shown.expired = true; settleActs(true); } }, ACT_WAIT_MS);
      }
      if (name === 'agent.rejected') say(d?.message || tl(lang, 'cmdk.error'));
      if (name === 'agent.failed') fail(`failed · ${d?.error || ''}`);
    }
  }

  function confirmCard(d) {
    conf.hidden = false;
    conf.innerHTML = '';
    conf.append(h('p.k-ck-cq', { text: d?.title || d?.say || tl(lang, `tool.${d?.tool}`) || tl(lang, 'cmdk.confirm') }),   // plan 3.4 — 도구가 준 제목 먼저
      h('div.k-ck-cb', {},
        h('button.t-btn', { type: 'button', text: tl(lang, 'cmdk.run'), onclick: () => decide(d.confirm_id, 'approve') }),
        h('button.t-btn.t-btn--2', { type: 'button', text: tl(lang, 'cmdk.cancel'), onclick: () => decide(d.confirm_id, 'reject') })));
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });   // 실행 확인은 꼭 보이게
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
    cfg.onAction?.(a);
    const ev = new CustomEvent('kit:agent-action', { detail: a, cancelable: true });
    document.dispatchEvent(ev);
    if (ev.defaultPrevented) return;                 // 화면이 직접 처리(끝나면 화면이 done 을 낸다)
    const stage = cfg.stage;
    const map = stage?.map || liveMap();
    if (a.op === 'map_arrive') {
      // 찾은 필지를 지도에 — 필지 면 + 잘 보이는 점(줌과 상관없이) · 필지 범위로 맞춤(채팅창이 가리는 쪽은 비움) · 실제로 보이는지 잰 뒤 끝 신호
      const fc = a.features?.length ? { type: 'FeatureCollection', features: a.features } : null;
      if (!map || !fc) done(a.op, false, 'kit', tl(lang, `cmdk.why.${map ? 'nolayer' : 'nomap'}`));
      else drawArrive(map, fc, stage).then((ok) => { done(a.op, ok, 'kit', ok ? '' : tl(lang, 'cmdk.why.nolayer')); if (ok && isPhone()) hide(); });
    } else if (a.op === 'map_flyto') {
      const b = a.bbox || (a.center && [a.center[0] - 0.003, a.center[1] - 0.003, a.center[0] + 0.003, a.center[1] + 0.003]);
      if (!map || !b) done(a.op, false, 'kit', tl(lang, 'cmdk.why.nomap'));
      else { map.fitBounds(b, { padding: padNow(), maxZoom: 17, duration: 1200 }); done(a.op, true); }
    } else if (a.op === 'map_frame') {
      if (!map || !a.geojson) done(a.op, false, 'kit', tl(lang, 'cmdk.why.nomap'));
      else if (stage) { stage.geo('agent-frame', { type: 'Feature', properties: {}, geometry: a.geojson }, 'focus'); done(a.op, true); }
      else ready(map).then(() => { upsert(map, 'k-chat-frame', { type: 'Feature', properties: {}, geometry: a.geojson }, [{ id: 'k-chat-frame-l', type: 'line', paint: { 'line-color': '#FFFFFF', 'line-width': 1.6, 'line-dasharray': [2, 1.5] } }]); done(a.op, true); })
        .catch(() => done(a.op, false, 'kit', tl(lang, 'cmdk.why.nolayer')));
    } else if (a.op === 'map_on' && !map) {
      done(a.op, false, 'kit', tl(lang, 'cmdk.why.nomap'));     // 지도가 없는 화면 — 켤 층이 없다(지도가 있으면 그 화면이 켜고 끝 신호를 낸다 · 안 오면 '확인되지 않음')
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
      done(a.op, true);                              // 화면 열기(XI맵 등 · c2-xi) — 답 한 줄을 읽을 틈을 두고 그 주소로 간다(대화는 그 화면에서 이어진다)
      setTimeout(() => { snap(); location.assign(a.href); }, 900);
    } else if (!['map_arrive', 'map_flyto', 'map_frame', 'map_on', 'parcel_card', 'drawer_open'].includes(a.op)) {
      done(a.op, false);                             // 처리하는 화면이 없는 동작(analysis_watch 등) — 실패로 기록
    }
  }

  /* 지도 그리기 도우미 — 스타일이 선 뒤 · 같은 id 면 데이터만 바꾼다 */
  const ready = (map) => (map.isStyleLoaded() ? Promise.resolve() : new Promise((res) => { map.once('idle', res); setTimeout(res, 3000); }));
  function upsert(map, sid, data, layers) {
    if (map.getSource(sid)) map.getSource(sid).setData(data);
    else { map.addSource(sid, { type: 'geojson', data }); for (const l of layers) map.addLayer({ ...l, source: sid }); }
  }
  /** 지도 가장자리 여백 — PC 에서 채팅창이 열려 있으면 그 폭만큼 오른쪽을 비운다 */
  const padNow = () => (!isPhone() && !box.hidden ? { top: 72, bottom: 72, left: 72, right: 380 + 56 } : { top: 56, bottom: 56, left: 40, right: 40 });
  async function drawArrive(map, fc, stage) {
    try {
      await ready(map);
      const pts = { type: 'FeatureCollection', features: fc.features.map((f, i) => {
        const b = bboxOf(f);
        return b && { type: 'Feature', properties: { n: f.properties?.n ?? i + 1 }, geometry: { type: 'Point', coordinates: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] } };
      }).filter(Boolean) };
      if (stage) await stage.geo('agent', fc, 'ai');
      else upsert(map, 'k-chat-arr', fc, [
        { id: 'k-chat-arr-f', type: 'fill', paint: { 'fill-color': '#0FA9A0', 'fill-opacity': 0.28 } },
        { id: 'k-chat-arr-l', type: 'line', paint: { 'line-color': '#0FA9A0', 'line-width': 1.6 } }]);
      upsert(map, 'k-chat-pt', pts, [{ id: 'k-chat-pt', type: 'circle', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 6, 14, 9], 'circle-color': '#0FA9A0', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5 } }]);
      const b = bboxOf(fc);
      const moved = new Promise((res) => { map.once('moveend', res); setTimeout(res, 2600); });
      map.fitBounds(b, { padding: padNow(), maxZoom: 15, duration: 1400 });
      await moved;
      await new Promise((res) => setTimeout(res, 300));
      return map.queryRenderedFeatures({ layers: ['k-chat-pt'] }).length > 0;   // 실제로 화면에 그려졌나
    } catch (err) { devlog('agent arrive', String(err?.message || err)); return false; }
  }

  /* 블록(plan 3.3) — chart {type:'chart', kind:'bar', title, rows:[{label, env}]} · file {type:'file', label, href} · image {type:'image', src, caption, tag} */
  function clearBlocks() { blk.innerHTML = ''; blk.hidden = true; }
  function loadImg(img) {
    const src = img.dataset.src || '';
    if (/^(data:|blob:)/.test(src)) { img.src = src; return; }
    api(rel(src), { raw: true }).then(async (r) => { if (!r.ok) throw new Error(r.status); const u = URL.createObjectURL(await r.blob()); urls.push(u); img.src = u; })
      .catch((err) => { devlog('agent image', String(err?.message || err)); const fig = img.closest('figure'); if (fig) fig.dataset.fail = '1'; img.replaceWith(h('p.k-ck-imgx', { text: tl(lang, 'cmdk.img.fail') })); });
  }
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
        const btn = h('button.k-ck-file', { type: 'button', 'data-href': b.href, 'data-label': b.label || '', 'data-lang': lg },
          h('span.k-ck-file-i', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 20 20"><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12"/></svg>' }),
          h('span.k-ck-file-l', { text: b.label || tl(lg, 'cmdk.download') }), h('span.k-ck-file-a', { text: tl(lg, 'cmdk.download') }));
        blk.append(h('div.k-ck-blk.k-ck-blk--file', { 'data-kind': 'file' }, btn));
      } else if (b?.type === 'image' && b.src) {
        const img = h('img.k-ck-img', { alt: b.caption || '', decoding: 'async', 'data-src': String(b.src) });
        const fig = h('figure.k-ck-blk.k-ck-blk--image', { 'data-kind': 'image' }, img,
          h('figcaption.k-ck-cap', {}, b.caption ? h('span', { text: b.caption }) : null, h('span.k-ck-tag', { text: b.tag || tl(lg, 'cmdk.img.tag') })));
        blk.append(fig);
        loadImg(img);
      }
    }
    blk.hidden = !blk.children.length;
  }
  /* 창 안 누르기(지난 차례도 같은 처리) — 내려받기 · 다시 시도 · 추천 질문 */
  box.addEventListener('click', async (e) => {
    const file = e.target.closest('button.k-ck-file[data-href]');
    if (file) {
      const lg = file.dataset.lang || lang;
      file.disabled = true;
      try {
        const r = await api(rel(file.dataset.href), { raw: true });
        if (!r.ok) throw new Error(r.status);
        const u = URL.createObjectURL(await r.blob());
        const a = h('a', { href: u, download: file.dataset.label || 'file' }); document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 4000);
      } catch (err) { devlog('agent file', String(err?.message || err)); const l = file.querySelector('.k-ck-file-a'); if (l) l.textContent = tl(lg, 'cmdk.file.fail'); }
      finally { file.disabled = false; }
      return;
    }
    const q = e.target.closest('.k-chat-retry[data-q], .k-chat-chip[data-q]')?.dataset.q;
    if (q && !cfg.guest && box.dataset.state !== 'busy') { input.value = q; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }
  });
  const keepDown = () => { const near = log.scrollHeight - log.scrollTop - log.clientHeight < 160; if (near) requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); };
  /** 답이 끝나면 내 말부터 답 머리까지 보이게(긴 답도 첫 줄부터 읽는다) */
  const reveal = () => requestAnimationFrame(() => { if (live?.me?.isConnected) log.scrollTop = Math.max(0, live.me.offsetTop - 12); });

  /* ── 대화 이어 보기(이 브라우저 창 · 계정별) ── */
  const store = { key: null, data: { turns: [], run: null, open: false } };
  function save() { if (!store.key) return; try { sessionStorage.setItem(store.key, JSON.stringify(store.data)); } catch { /* 저장 불가 창 */ } }
  /** 지금 차례 → 기록(확인 카드 · 생각 중 줄은 빼고, 살아 있는 칸 이름은 지난 차례 이름으로) */
  function snap() {
    if (!live?.rec || !store.key) return;
    const c = live.bub.cloneNode(true);
    c.querySelectorAll('.k-ck-c, .k-chat-think').forEach((x) => x.remove());
    for (const [k, v] of Object.entries(LIVE_CLS)) c.querySelectorAll('.' + k).forEach((x) => { x.classList.remove(k); x.classList.add(v); });
    c.querySelectorAll('img.k-ck-img[data-src]').forEach((x) => x.removeAttribute('src'));
    live.rec.html = c.innerHTML; live.rec.state = box.dataset.state || 'done'; live.rec.run = live.run || live.rec.run || null;
    save();
  }
  let snapT = 0;
  const snapSoon = () => { clearTimeout(snapT); snapT = setTimeout(snap, 250); };
  new MutationObserver((ms) => {
    if (ms.some((m) => m.type === 'attributes' && m.attributeName === 'data-state')) {
      const st = box.dataset.state;
      faces(st === 'busy' ? 'think' : st === 'done' ? 'answer' : 'idle');
      if (st !== 'busy') reveal();
    }
    if (live) snapSoon();
  }).observe(box, { attributes: true, attributeFilter: ['data-state'], childList: true, subtree: true, characterData: true });
  addEventListener('pagehide', snap);
  function bindStore() {
    if (store.key || cfg.guest || !cfg.who) return;
    const me = cfg.who.me || {};
    const uid = [cfg.who.key, me.user?.id || me.id || cfg.who.name || '', me.tenant_id || ''].join('|');
    store.key = 'landxi.chat.v1:' + uid;
    let d = null; try { d = JSON.parse(sessionStorage.getItem(store.key) || 'null'); } catch { d = null; }
    if (!d || !Array.isArray(d.turns)) return;
    store.data = { turns: d.turns.slice(-KEEP_TURNS), run: d.run || null, open: !!d.open };
    runId = store.data.run;
    const last = store.data.turns[store.data.turns.length - 1];
    for (const r of store.data.turns) {
      if (r === last && r.state === 'busy' && r.run) continue;                 // 기다리던 답 — 아래에서 이어 받는다
      const face = h('span.k-chat-face', { 'data-face': 'answer' }, faceImg('answer'));
      const bub = h('div.k-chat-bub', { html: r.state === 'busy' ? '' : r.html || '' });
      if (r.state === 'busy') { r.state = 'failed'; bub.append(h('div.k-chat-a', {}, ...errLine(langOf(r.q), r.q))); }   // 답을 받기 전에 화면을 옮겼고 이어 받을 답이 없다
      log.append(meMsg(r.q), h('div.k-chat-msg.ai', {}, face, bub));
      bub.querySelectorAll('img.k-ck-img[data-src]').forEach(loadImg);
    }
    intro.hidden = store.data.turns.length > 0;
    if (last && last.state === 'busy' && last.run) {
      newTurn(last.q, { reuse: false, rec: last });
      live.run = last.run; runId = last.run;
      const my = ++seq; lang = langOf(last.q);
      box.dataset.busy = '1'; box.dataset.state = 'busy'; box.setAttribute('aria-busy', 'true');
      guard = setTimeout(() => { if (my === seq && box.dataset.state === 'busy') fail('끝 이벤트 없이 시간 초과'); }, TIMEOUT_MS);
      follow(my, last.run, null, { replay: true });
    }
    if (store.data.open) open(null, { focus: false });
  }

  /* ── 자리: 오른쪽 아래 같은 자리 · 오른쪽에 붙은 서랍 · 시트는 그 왼쪽으로 · 누르는 것 · 글자가 있으면 위로 비킨다 ──
     (셸 화면만 — 스크롤하는 소개 화면은 늘 같은 자리. 휴대폰은 누르는 것만 비킨다. 지도 · 사진 위는 비키지 않는다) */
  const CTRL = 'a[href],button,input,select,textarea,summary,label,[role=button],[role=tab],[role=link],[contenteditable=""],[contenteditable=true]';
  const isMapish = (el) => !!el.closest('.maplibregl-canvas-container, .maplibregl-marker, .maplibregl-popup, canvas');
  /** 오른쪽에 붙어 떠 있는 판(서랍 · 시트) */
  function dock(el, mr) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.matches('.k-main, .k-app, .k-stage, .k-stage-map')) return null;
      const p = getComputedStyle(n).position;
      if (p !== 'fixed' && p !== 'absolute' && p !== 'sticky') continue;
      const r = n.getBoundingClientRect();
      if (r.right >= mr.right - 48 && r.width < mr.width * 0.7 && r.height > 160) return r;
    }
    return null;
  }
  /** 오른쪽 띠(left 부터) 안에서 실제로 보이는 누르는 것 · 글자 줄의 사각형 */
  function obstacles(mr, left) {
    const out = { ctl: [], text: [] };
    const inStrip = (r) => r.width > 0 && r.height > 0 && r.right > left && r.left < mr.right && r.bottom > mr.top && r.top < mr.bottom;
    const shown = (r, el) => {                                     // 가려지거나 스크롤 밖이면 빼다
      const x = (Math.max(r.left, left) + Math.min(r.right, mr.right)) / 2, y = (r.top + r.bottom) / 2;
      const top = document.elementsFromPoint(x, y).find((n) => !root.contains(n));
      return !!top && (top === el || el.contains(top) || top.contains(el)) && !isMapish(top);
    };
    for (const el of document.querySelectorAll(CTRL)) {
      if (root.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (inStrip(r) && shown(r, el)) out.ctl.push(r);
    }
    const tw = document.createTreeWalker(document.querySelector('.k-app') || document.body, 4, { acceptNode: (n) => (/\S/.test(n.nodeValue) ? 1 : 2) });
    const rg = document.createRange();
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const p = n.parentElement;
      if (!p || root.contains(p) || !inStrip(p.getBoundingClientRect())) continue;
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (inStrip(r) && shown(r, p)) out.text.push(r);
    }
    return out;
  }
  let placing = false;
  function place(force = false) {
    if (placing || !root.isConnected || root.hidden) return;
    if (!force && !box.hidden && !isPhone() && Date.now() - openedAt > 4000) return;   // 열려 있는 동안은 자리를 옮기지 않는다(막 연 4초 — 화면이 서는 동안은 옮긴다)
    placing = true;
    const W = innerWidth, H = innerHeight, phone = isPhone(), gap = phone ? 16 : 24;
    const main = document.querySelector('.k-main');
    let mr = main?.getBoundingClientRect();
    if (!mr || !mr.width || !mr.height) mr = { left: 0, top: 0, right: W, bottom: H, width: W, height: H };
    const R0 = Math.max(0, W - mr.right) + gap, B0 = Math.max(0, H - mr.bottom) + gap;
    let R = R0, B = B0, withTag = !phone;
    if (main) {                                                     // 셸 화면만 비킨다(스크롤하는 소개 화면은 늘 같은 자리 — 스크롤 중에 움직이지 않게)
      const tagW = phone ? 0 : (tag.offsetWidth || 80) + 12;         // 휴대폰은 꼬리표 없음
      root.style.pointerEvents = 'none';
      try {
        // 서랍 · 시트 — 같은 자리 둘레 다섯 점에서 찾고, 있으면 그 왼쪽
        const cx = W - R0 - 28, cy = H - B0 - 28;
        for (const [x, y] of [[cx, cy], [cx - 24, cy - 24], [cx + 24, cy + 24], [cx - 24, cy + 24], [cx + 24, cy - 24]]) {
          const el = document.elementsFromPoint(x, y).find((n) => !root.contains(n));
          const d = el && !isMapish(el) && dock(el, mr);
          if (d) { if (d.left - 16 - 56 - tagW > mr.left + 8) R = W - d.left + 16; break; }
        }
        const ob = obstacles(mr, W - R - 56 - tagW - 12);
        const box4 = (b, tw) => ({ x1: W - R + 6, y1: H - b + 6, x0: W - R - 56 - tw - 6, y0: H - b - 62 });
        const over = (f) => (r) => r.left < f.x1 && r.right > f.x0 && r.top < f.y1 && r.bottom > f.y0;
        const free = (b, tw, strict = true) => { const f = box4(b, tw); return f.y0 >= mr.top + 8 && !ob.ctl.some(over(f)) && !(strict && ob.text.some(over(f))); };
        const search = (tw, strict = true, span = mr.height * 0.6) => { for (let b = B0; b < B0 + span; b += 4) if (free(b, tw, strict)) return { b, tw }; return null; };
        /* 글자가 빽빽한 화면(현황판 등) — 누르는 것은 피하고, 가리는 글자가 가장 적은 자리(같은 자리에서 300 안) · 꼬리표 없이 */
        const least = () => {
          let best = null;
          for (let b = B0; b <= B0 + 300; b += 4) {
            const f = box4(b, 0);
            if (f.y0 < mr.top + 8 || ob.ctl.some(over(f))) continue;
            const area = ob.text.reduce((s, r) => s + Math.max(0, Math.min(r.right, f.x1) - Math.max(r.left, f.x0)) * Math.max(0, Math.min(r.bottom, f.y1) - Math.max(r.top, f.y0)), 0);
            if (!best || area < best.area - 1) best = { b, tw: 0, area };
          }
          return best;
        };
        /* 휴대폰 — 좁은 화면은 어디든 글이라 누르는 것(버튼 · 링크 · 입력)만, 같은 자리에서 180 안에서만 비킨다(스크롤 화면 한가운데로 뛰지 않게) */
        const pick = phone ? search(0, false, 180) || { b: B0, tw: 0 } : search(tagW) || search(0) || least() || { b: B0, tw: tagW };
        B = pick.b; withTag = pick.tw > 0;
      } catch (err) { devlog('chat place', String(err?.message || err)); R = R0; B = B0; }
      root.style.pointerEvents = '';
    }
    root.toggleAttribute('data-notag', !withTag);
    root.style.setProperty('--k-chat-r', R + 'px');
    root.style.setProperty('--k-chat-b', B + 'px');
    // 창: 버튼 위 12 · 위 머리까지 들어가지 않게(넘치면 아래로 내린다)
    const top = mr.top + 16;
    let cb = B + 56 + 12;
    if (H - cb - top < 420) cb = Math.max(gap, H - top - 560);
    root.style.setProperty('--k-chat-cb', cb + 'px');
    root.style.setProperty('--k-chat-max', Math.max(320, H - cb - top) + 'px');
    placing = false;
  }
  let placeT = 0, placeFirst = 0;
  const placeSoon = () => {
    const now = Date.now(); if (!placeFirst) placeFirst = now;
    clearTimeout(placeT);
    placeT = setTimeout(() => { placeFirst = 0; place(); }, now - placeFirst > 1500 ? 0 : 300);
  };
  new MutationObserver((ms) => { if (ms.some((m) => !root.contains(m.target))) placeSoon(); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'aria-hidden'] });
  addEventListener('resize', () => { place(true); });
  addEventListener('load', () => placeSoon());
  setTimeout(() => place(), 0);
  setTimeout(() => place(), 1200);

  /** 옛 화면 호환 — 머리에 끼우던 트리거 자리(아무것도 서지 않는다 · 셸이 머리에 넣지 않는다) */
  function button() { return h('span.k-ck-btn', { hidden: true, 'aria-hidden': 'true' }, h('span')); }

  configure(opts);
  const apiObj = { el: box, open, close, button, renderBlocks, acts, fab };
  return { api: apiObj, configure };
}
