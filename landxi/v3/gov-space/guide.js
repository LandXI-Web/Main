/* 결과 설명서 부품 한 벌(구현 3차 우리 공간에서 떼어 냄 · 구현 5차 기관-4 ⓐ) — 우리 공간(gov-space)과 서비스 대시보드 '이 결과는'(gov-select)이 같이 쓴다.
   여섯 칸(무엇이 · 어디 · 언제 · 어떤 형식 · 믿을 만한 정도 · 버전) · 내려받기 셋(지도 파일 · 필지 엑셀 · 요약) · 처음 한 번 이용 약속(원칙 59).
   서버는 그대로(GET /spaces/me · /spaces/me/guides/{card} · …/download · POST /spaces/me/consent) — 관할 안 결과만 · 누가 언제 받았는지 기록.
   숫자는 서버 값 그대로 · 지어내지 않는다. 같은 일은 같은 모양 · 같은 말(원칙 43). */
import { api, h } from '../kit/util.js';
import { toast } from '../kit/toast.js';
import { modal } from '../kit/modal.js';

export const nf = (v) => Number(v).toLocaleString('ko-KR');
export const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
export const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };
export const md = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${Number(m[1])}.${Number(m[2])}` : ''; };
export const num = (e) => { const v = val(e); return v === null || v === undefined ? '' : `${nf(v)}${e?.unit && !['count', 'ratio', 'm2'].includes(e.unit) ? e.unit : ''}`; };
/** ' · ' 앞에서 줄이 바뀌어 줄 머리에 가운뎃점이 오지 않게(법전 §2-1) */
export const keep = (s) => String(s || '').replace(/ · /g, ' · ').replace(/ → /g, ' → ');
/** 바뀐 점처럼 ' · ' 로 이은 글 — 한 마디씩 묶어 마디 가운데서 줄이 바뀌지 않게(마디가 줄보다 길 때만 그 안에서) */
export const segs = (s) => { const parts = String(s || '').split(' · ').filter(Boolean); const out = h('span.sp-segs'); parts.forEach((x, i) => { const last = i === parts.length - 1; out.append(h('span.sp-seg', { text: x.replace(/ → /g, ' → ') + (last ? '' : ' ·') })); if (!last) out.append(' '); }); return out; };   // 가운뎃점은 앞 마디 끝에 붙여 줄 머리에 오지 않게
export const dl = (rows) => h('dl.sp-dl', {}, ...rows.filter((r) => r && r[1]).map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', {}, v instanceof Node ? v : keep(v)))));

/* ── 여섯 칸 ───────────────────────── */
export function cell(title, content) {
  return h('section.sp-cell', { 'aria-label': title }, h('h3', { text: title }), content);
}

export function what(b) {
  const cls = b.what?.classes || [];
  const tot = b.what?.total;
  const wrap = h('div');
  if (val(tot) !== null && val(tot) !== undefined) wrap.append(h('p.sp-big', {}, h('span.num', { text: nf(val(tot)) }), h('small', { text: (tot.unit && tot.unit !== 'count' ? tot.unit : '건') })),
    h('p.sp-note', { text: '우리 기관 관할 안 결과' }));
  else {   // 첫 결과 전 · 업무 결과가 아닌 결과(분석 칸마다 나눈 도형 조각 — 개수를 싣지 않는다 · 사용자 규칙 2)
    const [n1, n2] = String(b.what?.note || '결과가 나오면 종류와 개수가 붙습니다').split(' — ');
    wrap.append(h('p.sp-none', { text: n1 }), n2 ? h('p.sp-note', { text: n2 }) : null);
  }
  if (cls.length) {
    wrap.append(h('ul.sp-chips', {}, ...cls.map((c) => h('li', {}, h('span', { text: c.name }), val(c.n) !== null && val(c.n) !== undefined ? h('b.num', { text: num(c.n) }) : null))));
  }
  return wrap;
}

export function where(b) {
  const w = b.where || {};
  const out = val(w.outside_emd);
  return dl([
    ['시군구', (w.places || []).join(' · ') || (w.shape ? '' : '결과가 나오면 붙습니다')],
    ['모양', w.shape],
    ['읍면동', (w.emd || out) ? segs([w.emd, out ? `바다 등 읍면동 밖 ${nf(out)}건` : ''].filter(Boolean).join(' · ')) : ''],
    ['필지', w.parcel || (w.shape ? '필지와 잇지 않습니다' : '')],
    ['좌표', w.crs],
  ]);
}

export function when(rounds) {
  if (!rounds.length) return h('p.sp-none', { text: '첫 결과 전 — 결과가 나오면 회차가 붙습니다' });
  return h('div.sp-rounds', {}, ...rounds.map((r) => dl([
    rounds.length > 1 ? ['지역', r.place] : null,
    ['촬영', r.shot], ['분석', ymd(r.analyzed)], ['공개', r.published ? ymd(r.published) : '기록 없음'],
  ])));
}

export function format(b) {
  const f = b.format || {};
  const t = h('table.sp-fields', {}, h('thead', {}, h('tr', {}, h('th', { text: '칸' }), h('th', { text: '단위' }), h('th', { text: '예' }))),
    h('tbody', {}, ...(f.fields || []).map((x) => h('tr', {}, h('td', { text: x.name }), h('td', { text: x.unit || '—' }), h('td', { text: keep(x.ex || '—') })))));
  const kinds = (f.files || []).map((x) => x.label).join(' · ');
  return h('div', {}, h('p.sp-note', { text: `받는 파일: ${kinds}` }), t);
}

export function trust(b) {
  const t = b.trust || {};
  if (!t.level) return h('p.sp-none', { text: t.line || '결과가 나오면 붙습니다' });
  const checks = Object.entries(t.checks || {}).filter(([, e]) => val(e)).map(([k, e]) => `${k} ${nf(val(e))}건`);
  const [l1, l2] = String(t.line || '').split(' — ');   // 뜻 한 줄 · 덧붙임 한 줄(의미 단위로 끊는다)
  return h('div', {}, h('p.sp-level', { dataset: { lv: t.level } }, h('b', { text: t.level }), h('span', { text: l1 }), l2 ? h('span.sp-level-2', { text: l2 }) : null),
    checks.length ? dl([['결과 확인', checks.join(' · ')]]) : null,
    h('p.sp-note', { text: keep(t.note || '') }));
}

export function version(g, b) {
  const hist = g.history || [];
  const list = h('ol.sp-hist', {}, ...hist.slice(0, 4).map((x) => h('li', { class: x.current ? 'is-cur' : '' },
    h('span.sp-hist-n.num', { text: `${val(x.edition)}판` }),
    h('span.sp-hist-t', {}, segs(x.change || ''),
      h('small', { text: [x.published_at ? `${ymd(x.published_at)} 공개` : '', x.current ? '지금 판' : ''].filter(Boolean).join(' · ') })))));
  return h('div', {}, dl([['서비스 버전', (b.version?.service || []).join(' · ')], ['결과 설명서', `${val(g.edition)}판`]]), hist.length > 1 ? list : null);
}

/** 여섯 칸 한 판 */
export function sixCells(g) {
  const b = g.body || {};
  const rounds = b.when?.rounds || [];
  return h('div.sp-cells', {}, cell('무엇이', what(b)), cell('어디', where(b)), cell('언제', when(rounds)),
    cell('어떤 형식', format(b)), cell('믿을 만한 정도', trust(b)), cell('버전', version(g, b)));
}

/* ── 내려받기 — 처음 한 번 이용 약속 · 관할 안만 · 기록 ───────────────────────── */
/** 이용 약속 창 → 동의하면 true. me = GET /spaces/me 결과(consent 칸을 고쳐 둔다) */
export function consent(me) {
  return new Promise((resolve) => {
    let ok = false;
    /* 서버 글의 줄바꿈 기호 = 의미 단위로 끊는 자리(법전 §2-1) */
    const lines = h('ul.sp-cons', {}, ...(me?.consent?.lines || []).map((s) => h('li', {}, ...String(s).split('\n').flatMap((x, i) => (i ? [h('br'), x] : [x])))));
    const go = h('button.t-btn', { type: 'button', text: '동의하고 내려받기' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '닫기' });
    const m = modal({ title: '내려받기 전에 확인해 주세요', body: h('div.sp-md', {}, lines, h('div.sp-md-a', {}, no, go)), onClose: () => resolve(ok) });
    no.addEventListener('click', () => m.close());
    go.addEventListener('click', async () => {
      go.disabled = true;
      try { await api('/spaces/me/consent', { method: 'POST', body: { agree: true } }); if (me?.consent) me.consent.done = true; ok = true; m.close(); }
      catch (e) { go.disabled = false; toast(e.message || '지금은 저장할 수 없습니다'); }
    });
  });
}

/** 파일 하나 내려받기 — g = 결과 설명서 · f = 받기 칸(fmt · label · ok) · btn = 누른 단추 · me = GET /spaces/me · onDone(라벨) */
export async function download(g, f, btn, me, { onDone } = {}) {
  if (!f.ok) return;
  if (!me?.consent?.done && !(await consent(me))) return;
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.textContent = '받는 중';
  try {
    const r = await api(`/spaces/me/guides/${encodeURIComponent(g.card)}/download?fmt=${f.fmt}`, { raw: true });
    if (r.status === 409) { if (me?.consent) me.consent.done = false; btn.innerHTML = label; btn.disabled = false; if (await consent(me)) return download(g, f, btn, me, { onDone }); return; }
    if (!r.ok) { const j = await r.json().catch(() => null); throw new Error(j?.error?.message || '내려받지 못했습니다'); }
    const blob = await r.blob();
    const ext = { geojson: 'geojson', parcels: 'xlsx', summary: 'json' }[f.fmt];
    const org = (me?.org?.short || '').replace(/\s+/g, '');
    const name = `${org}_${g.name.replace(/\s+/g, '')}_결과설명서${val(g.edition)}판.${ext}`;
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast(`${f.label}을 내려받았습니다`);
    onDone?.(f);
  } catch (e) { toast(e.message || '내려받지 못했습니다'); }
  finally { btn.disabled = false; btn.innerHTML = label; }
}
