/* 서비스 대시보드 — 장면 먼저(구현 5차 · 확인 대장 '기관 화면 확인' 기관-4 ⓐ · 시안 design-r8/gov-design/mock/rehome-dash.html ·
   2묶음 18차 N-1 ⓐ — 탭 다섯 '현황 · 결과 지도 · 필지 목록 · 이력 · 통계·보고서'(시안 design-r9/gov-2 dash.html) · 내려받기는 통계·보고서 탭 한 곳).
   왼쪽: 결과 장면 위 큰 숫자 하나(업무 결과 · 서버 값) · 읍면별(광역 전체면 시·군·구별) 막대 — 누르면 그 곳 결과 지도 · 시점별 영상과 결과.
   오른쪽: '이 결과는'(결과 설명서 세 줄 + '자세히' 서랍 — 분기 공간 1단 서버 그대로 · 행정정보와 비교) · 내가 확인할 필지 · LX와 주고받은 검토 요청 + LX 담당.
   탭: 현황 · 결과 지도(XI맵 — 지도 위 '보고 있는 결과' 카드 · '이 영상으로 분석 요청') · 필지 목록(필지 대조가 있는 서비스만) · 이력 · 통계·보고서(tabs.js).
   숫자는 모두 서버 값 한 출처(대표 수치 요약 · 실태조사 집계 · 결과 설명서) — 지어내지 않는다. 장면은 그 기관 관할 것만(서버가 거른다).
   지역 고정값 0 — 관할 · 서비스 · 장면 · 담당 모두 로그인 기관에서. */
import * as K from '../kit/index.js';
import { api } from '../../shared/api-v1.js';
import { h, ymd } from '../kit/util.js';
import { drawer } from '../kit/panel.js';
import { shortAddr, joinLine } from './brand.js';
import { setRequestService } from './menu.js';
import { sixCells, val, segs, nf } from '../gov-space/guide.js';
import { renderHistory, renderStats } from './tabs.js';

/* 우리 공간의 설명서 칸 스타일(여섯 칸 · 동의 창)을 같이 쓴다 — 한 번만 붙인다 */
{
  const href = new URL('../gov-space/gov-space.css', import.meta.url).href;
  if (![...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === href)) document.head.append(h('link', { rel: 'stylesheet', href }));
}

const XI = (sgg, extra = {}) => '/landxi/v3/xi-clean/' + (sgg || Object.keys(extra).length ? '?' + new URLSearchParams({ ...(sgg ? { region: sgg } : {}), ...extra }) : '');
const svcShort = (s) => String(s || '').replace(/\s*(행정서비스|서비스)$/, '');
const lastWord = (s) => String(s || '').trim().split(/\s+/).pop();
const when = (iso) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[1]}.${m[2]}` : ''; };

/** 같은 이름의 값을 더한다(광역 전체) — 값 있는 것만 · 하나면 그대로 */
export function total(items, key) {
  const es = items.map((i) => i.metrics?.[key]).filter((e) => e && e.value !== null && e.value !== undefined);
  if (!es.length) return null;
  if (es.length === 1) return es[0];
  return { ...es[0], value: es.reduce((a, e) => a + e.value, 0), as_of: es.map((e) => e.as_of).sort().pop() };
}
/** 큰 숫자 하나 = 업무 결과 — 현장 확인 필요(필지 대조) → 없으면 AI 탐지(덱이 업무 결과로 판정한 것만) → 없으면 없음(첫 결과 전) */
export function primary(items, card) {
  const fc = total(items, 'field_check');
  if (fc && fc.value) return { key: 'field_check', env: fc, label: '현장 확인 필요' };
  if (card?.example && card.example.label === 'AI 탐지') {   // 덱 = 다듬은 결과의 AI 탐지만(분석 칸 도형 수 0 · 사용자 규칙 2)
    const d = total(items, 'detected');
    if (d && d.value) return { key: 'detected', env: d, label: 'AI 탐지' };
  }
  return null;
}

/* ═════════════ 그리기 ═════════════ */
export async function renderDash(ctx) {
  const { page, B, s, card, sum, regP, RAIL, S, head, asOfEl } = ctx;
  const crumb = h('a.gs-crumb', { href: './?list=1', text: '내 서비스' });
  document.title = `${s.name} · ${B.platform}`;
  document.body.dataset.view = 'svc';
  const itemsOf = (cid) => ((sum && sum.items) || []).filter((i) => i.card === cid);

  const regs = ((await regP)?.items || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
  const wide = regs.length > 1;                                   // 광역 기관 — 관할 시군구가 여럿(gov-fusion 과 같은 판정)
  const REG = ctx.REG;
  const reg = wide && REG && regs.some((r) => r.sgg_cd === REG) ? regs.find((r) => r.sgg_cd === REG) : null;
  const all = itemsOf(s.card);
  const cur = reg ? all.filter((i) => i.sgg_cd === reg.sgg_cd) : all;
  const survey = cur.some((i) => i.survey_state || (i.metrics?.field_check && i.metrics.field_check.value !== null));
  const p = s.open ? primary(cur, card) : null;
  const sggOne = reg?.sgg_cd || (!wide ? (cur.find((i) => i.sgg_cd)?.sgg_cd || regs[0]?.sgg_cd) : null);
  const q = (extra = {}) => '?' + new URLSearchParams({ service: s.card, ...(reg ? { region: reg.sgg_cd } : {}), ...extra });
  const mapHref = XI(sggOne, { service: s.card });                // 결과 지도 — 그 서비스의 '보고 있는 결과' 카드가 붙는다(map-extras.js)
  const fusion = '../gov-fusion/' + q(), rep = (tab) => '../gov-report/' + q({ tab });
  const want = new URLSearchParams(location.search).get('tab');
  const TAB = ['history', 'stats'].includes(want) ? want : 'status';
  /* 이 서비스의 배포본(분석 요청 · 결과 시점은 배포본 단위) — 광역은 고른 시·군·구의 것, 없으면 이 서비스의 첫 배포본 */
  const deps = ((await api('/requests/services').catch(() => null))?.items || []).filter((d) => d.card === s.card);
  const dep = (reg && deps.find((d) => d.sgg_cd === reg.sgg_cd)) || deps[0] || null;
  if (dep) setRequestService(RAIL, S.rail, dep.id);

  /* 머리 — 이름 · 한 줄 · 사업 연도 · 최근 결과(덱 = 다듬은 결과의 분석한 날) · 광역은 '광역 전체 / 시·군·구' */
  let pick = null;
  if (wide) {
    pick = h('label.gs-reg', {}, h('span.t-label', { text: '시·군·구' }),
      h('select.t-input', { 'aria-label': '시·군·구' }, h('option', { value: '', text: '광역 전체' }),
        ...regs.map((r) => h('option', { value: r.sgg_cd, text: r.name, selected: reg && r.sgg_cd === reg.sgg_cd ? true : null }))));
    pick.querySelector('select').addEventListener('change', (e) => { const v = e.target.value; location.assign('?' + new URLSearchParams({ service: s.card, ...(v ? { region: v } : {}) })); });
  }
  const sub = joinLine([reg?.full || (wide ? '광역 전체' : ''), s.line, s.year ? `${s.year}년 사업` : ''].filter(Boolean).join(' · '));
  const latest = card?.latest ? h('span.gs-date', { text: `최근 결과 ${ymd(card.latest)}` }) : asOfEl();
  page.append(head({ title: s.name, sub, right: [pick, latest], crumb, line: false }));
  const on = (k) => (TAB === k ? { 'aria-current': 'page' } : {});
  page.append(h('nav.gs-tabs', { 'aria-label': '서비스 기능' },
    h('a.gs-tab', { href: q(), ...on('status'), text: '현황' }),
    s.open ? h('a.gs-tab', { href: mapHref, text: '결과 지도' }) : null,
    survey ? h('a.gs-tab', { href: rep('sus'), text: '필지 목록' }) : null,
    h('a.gs-tab', { href: q({ tab: 'history' }), ...on('history'), text: '이력' }),
    h('a.gs-tab', { href: q({ tab: 'stats' }), ...on('stats'), text: '통계·보고서' })));

  const newLine = h('div.gd-new', { hidden: true });
  const main = h('div.gd-main'), side = h('div.gd-side');
  const pre = h('div.gd-pre');
  page.append(newLine, pre, h('div.gd-grid', {}, main, side));
  if (TAB === 'history') { document.body.dataset.tab = 'history'; await renderHistory(main, side, { s, B }); return; }
  if (TAB === 'stats') { document.body.dataset.tab = 'stats'; await renderStats(main, side, { s, B, rep, pre, survey }); return; }

  /* ── 결과 장면 위 큰 숫자 하나 ── */
  const scenes = (card?.scenes || []);
  const monthly = scenes.filter((x) => /^\d{4}\.\d{2}$/.test(x.when));
  const byWhen = new Map();
  for (const x of (monthly.length >= 2 ? monthly : scenes)) if (!byWhen.has(x.when)) byWhen.set(x.when, x);   // 시점마다 한 장(같은 때 여러 장이면 첫 장)
  const series = [...byWhen.values()];
  const hero = (series.length >= 2 ? series[series.length - 1] : null) || (card?.scene?.src && !card.scene.ex ? card.scene : null) || series[series.length - 1] || null;
  const sc = h('section.gd-scene', { class: hero ? '' : 'is-blank', 'aria-label': '현황', dataset: p ? { metric: p.label, v: String(p.env.value) } : { metric: '', v: '' } });   // 숫자 검사(K16 · 시험)가 읽는 이름 · 값
  main.append(sc);
  if (hero) sc.append(h('img', { src: hero.src, alt: '', decoding: 'async' }));
  const where = reg ? lastWord(reg.name) : B.short;
  if (p) {
    sc.append(h('div.gd-hud', {}, h('p.gd-hud-l', { text: `${p.label} · ${where}` }), h('p.gd-hud-n', { html: K.numHtml(p.env) })));
  } else {
    const first = s.open ? '첫 결과 전' : `${s.year || ''}년 시작`.trim();
    sc.append(h('div.gd-hud.gd-hud--none', {}, h('p.gd-hud-n', { text: first }),
      h('p.gd-hud-l', { text: s.open ? (reg && all.length ? '이 시·군·구에는 아직 결과가 없습니다' : '첫 AI 분석 결과가 나오면 여기에 보입니다') : '사업이 시작되면 여기에 결과가 보입니다' })));
  }
  if (s.open) sc.append(h('div.gd-open', {}, h('a.t-btn.gd-ci', { href: mapHref, text: '결과 지도 열기' }), survey ? h('a.t-btn.t-btn--2', { href: rep('sus'), text: '필지 목록' }) : null));
  if (hero?.caption) sc.append(h('span.gd-cap', { text: hero.caption }));

  /* ── 읍면별(시·군·구 하나) · 시·군·구별(광역 전체) — 많은 곳부터 · 누르면 그 곳 결과 지도 ── */
  const bars = h('section.t-card.gd-box.gd-bars', { hidden: true });
  main.append(bars);
  drawBars(bars, { s, p, wide, reg, all, sggOne, survey, q }).catch((e) => { K.devlog('bars', e.message); bars.hidden = true; });

  /* ── 시점별 영상과 결과 ── */
  if (series.length >= 2) {
    const show = series.slice(-4);
    const years = [...new Set(show.map((x) => x.when.slice(0, 4)))];
    const months = show.every((x) => x.when.length > 4) && years.length === 1 ? show.map((x) => Number(x.when.slice(5))).join('·') + '월' : show.map((x) => x.when).join(' · ');
    main.append(h('section.t-card.gd-box.gd-epochs', { 'aria-label': '시점별 영상과 결과' },
      h('div.gd-box-h', {}, h('h2', { text: `영상과 결과 — ${years.length === 1 ? years[0] + '년 ' : ''}${show.length} 시점` }), h('span.gd-small', { text: months })),
      h('div.gd-ep', {}, ...show.map((x) => h('a.gd-ep-i', { href: mapHref, 'aria-label': `${x.when} 결과 지도` }, h('img', { src: x.src, alt: '', loading: 'lazy', decoding: 'async' }), h('span', { text: x.when })))),
      h('p.gd-note', { text: '시점마다 찍은 영상 위 AI 결과입니다. 판정은 담당자가 현장에서 확정합니다.' })));
  }

  /* ── 오른쪽 ── */
  const about = h('section.t-card.gd-box.gd-about', { 'aria-label': '이 결과는' });
  const todo = h('section.t-card.gd-box.gd-todo', { 'aria-label': '내가 확인할 필지' });
  const talk = h('section.t-card.gd-box.gd-talk', { 'aria-label': 'LX와 주고받은 검토 요청' });
  side.append(...[about, survey && s.open ? todo : null, talk].filter(Boolean));
  await Promise.all([
    drawAbout(about, newLine, { s, B, q, fusion }).catch((e) => { K.devlog('about', e.message); about.hidden = true; }),
    survey && s.open ? drawTodo(todo, { cur, reg, rep, sggOne, card: s.card }).catch((e) => { K.devlog('todo', e.message); }) : null,
    drawTalk(talk, { s, card, deps, mapHref }).catch((e) => { K.devlog('talk', e.message); }),
  ]);
}

async function drawBars(el, { s, p, wide, reg, all, sggOne, survey }) {
  if (!s.open || !p) return;
  let rows = [], title = '', note = '';
  if (wide && !reg) {                                              // 광역 전체 — 시·군·구별(대표 수치 요약 한 출처)
    rows = all.filter((i) => i.sgg_cd).map((i) => ({ name: lastWord(i.region_name), n: total([i], p.key)?.value || 0, href: '?' + new URLSearchParams({ service: s.card, region: i.sgg_cd }) }))
      .filter((r) => r.n > 0);
    title = `시·군·구별 ${p.label}`; note = '시·군·구를 누르면 그 곳의 현황으로 갑니다.';
    if (rows.length < 2) return;                                    // 한 곳뿐이면 막대 대신 큰 숫자로 충분하다
  } else if (survey && p.key === 'field_check' && sggOne) {         // 시·군·구 하나 — 읍면별(실태조사 집계 · 큰 숫자와 같은 식)
    const j = await api('/survey/stats?by=emd&sgg=' + encodeURIComponent(sggOne));
    if (j.state === 'building') return;
    rows = (j.items || []).map((e) => ({ name: e.key, n: e.field_check?.value || 0, href: XI(sggOne, { service: s.card, ...(e.top5?.[0]?.pnu ? { pnu: e.top5[0].pnu } : {}) }) })).filter((r) => r.n > 0);
    title = `읍면별 ${p.label}`; note = '읍면을 누르면 그 읍면의 결과 지도로 갑니다.';
  } else return;
  if (!rows.length) return;
  rows.sort((a, b) => b.n - a.n);
  const top = rows.slice(0, 5), rest = rows.slice(5);
  const max = top[0].n || 1;
  const line = (r, more) => h(r.href ? 'a.gd-bar' : 'div.gd-bar', { ...(r.href ? { href: r.href } : {}), class: more ? 'is-rest' : '' },
    h('span.gd-bar-t', { text: r.name }), h('i', { style: `--w:${Math.max(2, Math.round((r.n / (more ? r.n : max)) * 100))}%` }), h('span.gd-bar-n.num', { text: nf(r.n) }));
  el.hidden = false;
  el.append(h('div.gd-box-h', {}, h('h2', { text: title }), h('span.gd-small', { text: '많은 곳부터' })),
    h('div.gd-bars-l', {}, ...top.map((r) => line(r)), rest.length ? line({ name: `그 밖 ${rest.length}곳`, n: rest.reduce((a, r) => a + r.n, 0) }, true) : null),
    h('p.gd-note', { text: note }));
}

async function drawAbout(el, newLine, { s, B, q, fusion }) {
  el.append(h('div.gd-box-h', {}, h('h2', { text: '이 결과는' })));
  let me = null, g = null;
  try { [me, g] = await Promise.all([api('/spaces/me'), api('/spaces/me/guides/' + encodeURIComponent(s.card))]); }
  catch (e) { if (e.status === 404) { el.hidden = true; return; } throw e; }
  const b = g.body || {};
  el.querySelector('.gd-box-h').append(h('span.gd-small', { text: [`${val(g.edition)}판`, g.published_at ? `${ymd(g.published_at)} 공개` : ''].filter(Boolean).join(' · ') }));
  const tot = b.what?.total, cls = b.what?.classes || [];
  const whatTxt = val(tot) !== null && val(tot) !== undefined
    ? (tot.unit === '필지' ? `판정한 필지 ${nf(val(tot))}` : `AI 탐지 ${nf(val(tot))}${tot.unit && tot.unit !== 'count' ? tot.unit : '건'}`) : String(b.what?.note || '결과가 나오면 붙습니다').split(' — ')[0];
  const sub = [cls.map((c) => `${c.name}${val(c.n) !== null && val(c.n) !== undefined ? ' ' + nf(val(c.n)) : ''}`).join(' · '), val(tot) !== null && val(tot) !== undefined ? `${B.short} 관할 안만` : ''].filter(Boolean).join(' · ');
  const r0 = (b.when?.rounds || [])[0];
  const t = b.trust || {};
  const [t1] = String(t.line || '').split(' — ');
  el.append(h('dl.gd-kv', {},
    h('div', {}, h('dt', { text: '무엇이' }), h('dd', {}, h('span', { text: whatTxt }), sub ? h('small', {}, segs(sub)) : null)),
    r0 ? h('div', {}, h('dt', { text: '언제' }), h('dd', {}, segs([r0.shot, r0.analyzed ? `${ymd(r0.analyzed)} 분석` : ''].filter(Boolean).join(' · ')))) : null,
    t.level ? h('div', {}, h('dt', { text: '믿을 만한 정도' }), h('dd', {}, h('span.gd-lv', { dataset: { lv: t.level }, text: t.level }), t1 ? h('small', { text: t1 }) : null, h('small', { text: '현장 확인 전 참고용' }))) : null));
  const more = h('button.t-btn.t-btn--text.gd-more', { type: 'button', text: '이 결과 설명 자세히' });
  /* 내려받기는 통계·보고서 탭 한 곳(18차 N-1 ⓐ) — 이 카드는 설명 세 줄 · 자세히 · 행정정보와 비교 */
  el.append(h('div.gd-links', {}, more, s.open ? h('a.t-btn.t-btn--text.gd-more', { href: fusion, text: '행정정보와 비교' }) : null));
  el.append(h('p.gd-note', {}, `${B.short} 관할 안 결과만 들어 있습니다. 자료 내려받기는 `, h('a.gd-a', { href: q({ tab: 'stats' }), text: '통계·보고서' }), ' 탭에서.'));

  const open = () => {
    const body = h('div.gd-drawer', {},
      g.change ? h('p.sp-change', {}, h('b', { text: '바뀐 점' }), segs(g.change)) : null,
      sixCells(g), h('p.gd-note', {}, h('a.gd-a', { href: q({ tab: 'stats' }), text: '자료 내려받기는 통계·보고서 탭에서' })));
    drawer({ title: `이 결과 설명 — ${val(g.edition)}판`, body, label: '이 결과 설명', width: 560 });
    if (val(me?.unread)) api('/spaces/me/read', { method: 'POST' }).then(() => { newLine.hidden = true; }).catch(() => {});
  };
  more.addEventListener('click', open);

  /* 새 결과 한 줄 — 이 서비스의 읽지 않은 새 판(공간 안 알림 그대로) */
  const n = (me?.notices || []).find((x) => x.unread && x.card === s.card);
  if (n) {
    newLine.hidden = false;
    newLine.replaceChildren(h('i', { 'aria-hidden': 'true' }), h('b', { text: `새 결과(${val(n.edition)}판)가 왔습니다` }), h('span', {}, segs(n.change || '')),
      h('button.t-btn.t-btn--text.gd-new-go', { type: 'button', text: '이 결과 설명', onclick: open }));
  }
}

async function drawTodo(el, { cur, reg, rep, sggOne, card }) {
  const rp = total(cur, 'review_pending');
  el.append(h('div.gd-box-h', {}, h('h2', { text: '내가 확인할 필지' }), rp ? h('span.gd-small', { html: `결과 확인 대기 ${K.numHtml(rp)}` }) : null));
  const list = h('ul.gd-rows'); el.append(list);
  try {
    const j = await api(`/survey/findings?state=open&rule=R1,R2,R3,R4,R5,R6&sort=score&limit=3${reg ? `&sgg=${encodeURIComponent(reg.sgg_cd)}` : ''}`);
    const its = (j && j.items) || [];
    if (!its.length) { list.replaceWith(h('p.gs-none', { text: '지금 확인할 필지가 없습니다' })); return; }
    const rn = cur[0]?.region_name || reg?.full || '';
    list.append(...its.map((f) => h('li', {}, h('a.gd-row', { href: XI(f.sgg_cd || sggOne, { service: card, ...(f.pnu ? { pnu: f.pnu } : {}) }) },
      h('span.gd-row-t', {}, h('b', { text: shortAddr(f.addr, rn) }), h('small', { text: f.rule_nm || '' })),
      h('span.t-chip', { text: '확인 전', dataset: { lv: 'wait' } })))));
    el.append(h('a.t-btn.t-btn--text.gd-more', { href: rep('sus'), text: '모두 보기' }));
  } catch { list.replaceWith(h('p.gs-none', { text: '지금은 불러올 수 없습니다' })); }
}

async function drawTalk(el, { s, card, deps, mapHref }) {
  el.append(h('div.gd-box-h', {}, h('h2', { text: 'LX와 주고받은 검토 요청' })));
  const name = svcShort(s.name), depIds = new Set(deps.map((d) => d.id));
  const [rv, rq] = await Promise.all([api('/reviews?box=all&limit=50').catch(() => null), api('/requests').catch(() => null)]);
  const rows = [];
  for (const it of rv?.items || []) {
    if (svcShort(it.service) !== name) continue;
    const ans = it.status === 'answered';
    rows.push({ at: it.updated_at || it.at, href: '?' + new URLSearchParams({ service: s.card, review: it.id }),
      t: `${it.where}${it.note ? ` — "${it.note}"` : ''}`,
      sub: it.last && it.last.side === 'lx' ? `LX 답 · ${when(it.last.at)} "${it.last.body}"` : `${when(it.at)} 보냄`,
      chip: ans || (it.last && it.last.side === 'lx') ? ['답 도착', 'ci'] : [it.status === 'seen' ? 'LX 확인 중' : '보냄', ''] });
  }
  for (const x of rq?.items || []) {
    if (!x.mine || !depIds.has(x.service?.id)) continue;
    rows.push({ at: x.decided_at || x.created_at, href: '../gov-request/?' + new URLSearchParams({ service: x.service.id, tab: 'sent' }),
      t: `${x.label || '영상'} → ${svcShort(x.service?.name)} 분석 요청`, sub: `${when(x.created_at)} 보냄`,
      chip: [x.state_word, x.state === 'done' ? 'ci' : x.state === 'rejected' || x.state === 'failed' ? 'warn' : ''] });
  }
  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  el.querySelector('.gd-box-h').append(h('span.gd-small', { text: `${rows.length}건` }));
  if (rows.length) {
    el.append(h('ul.gd-rows', {}, ...rows.slice(0, 3).map((r) => h('li', {}, h('a.gd-row', { href: r.href },
      h('span.gd-row-t', {}, h('b', { text: r.t }), h('small', { text: r.sub })),
      h('span.t-chip', { text: r.chip[0], dataset: r.chip[1] ? { lv: r.chip[1] } : {} }))))));
  } else el.append(h('p.gs-none', { text: '아직 주고받은 요청이 없습니다' }));
  /* LX 담당 — 서비스 카드의 담당(프로젝트장) · 없으면 LX 관리자가 답한다(원칙 63 · 72) */
  el.append(h('div.gd-person', {}, h('span.gd-av', { text: 'LX' }),
    h('span.gd-person-t', {}, h('b', { text: card?.owner ? `${card.owner} · LX 담당` : 'LX 담당 미지정' }),
      h('small', { text: card?.owner ? '검토 요청과 분석 요청에 답합니다' : 'LX 관리자가 대신 답합니다' }))));
  el.append(h('div.gd-acts', {}, h('a.t-btn.t-btn--text.gd-more', { href: mapHref, text: '결과 지도에서 검토 요청 보내기' }),
    rows.length > 3 ? h('a.t-btn.t-btn--text.gd-more', { href: '../gov-request/?tab=sent', text: '모두 보기' }) : null));
}
