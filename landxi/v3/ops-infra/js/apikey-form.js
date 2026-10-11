/* API 키 설정 칸(외부 연동 API 3차 — 원칙 184 · 확인 대장 API3 키단위 ⓐ · 분석승인 ⓐ · 여는순서 ⓐ).
   LX 관리자 '배포 → API'의 키 만들기 서랍과 '요청 관리 → API 키 신청'의 승인 서랍이 같은 칸을 쓴다.
   칸: 서비스(여럿 — 서비스마다 키 하나) · 범위(전국 · 행정구역 · 사각 범위) · 권한 · 영상 원천 · 분석 넓이 한도(한 번 · 하루 · 한 달 ㎢ — 분석 호출이 열리면 씀) ·
   끝나는 날 · 내줄 형식 · 호출 한도. 값의 목록 · 처음 값은 서버(options · defaults) 한 곳. 아이콘 0.
   keyForm({ options, defaults, kind, services?, pick?, rights? }) → { el, read() → 본문 | { error, field } } */
import { h } from '../../kit/util.js';

{ const href = new URL('../apikeys.css', import.meta.url).href;
  if (!document.querySelector(`link[href="${href}"]`)) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href })); }

const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
let seq = 0;

export function keyForm({ options = {}, defaults = {}, kind = 'internal', services = null, pick = null, rights = 'read' } = {}) {
  const id = 'akf' + (++seq);
  const row = (k, ...v) => h('div.ak-f', {}, h('span.t-label', { text: k }), h('div.ak-fv', {}, ...v));
  const radios = (name, items, on) => h('div.ak-rd', { role: 'radiogroup' }, ...items.map(([v, t, dis]) =>
    h('label', { class: dis ? 'is-off' : '' }, h('input', { type: 'radio', name, value: v, checked: v === on, disabled: !!dis }), h('span', { text: t }))));
  const checks = (items, on) => h('div.ak-fm', {}, ...items.map(([v, t, dis]) =>
    h('label', { class: dis ? 'is-off' : '' }, h('input', { type: 'checkbox', value: v, checked: on.includes(v) && !dis, disabled: !!dis }), h('span', { text: t }))));
  const picked = (box) => [...box.querySelectorAll('input:checked')].map((x) => x.value);

  /* 서비스 — 신청 승인이면 신청한 서비스 먼저 켬 */
  const svcList = services || options.services || [];
  const svcBox = checks(svcList.map((s) => [s.card, s.name]), pick || []);

  /* 범위 */
  const scopeOn = 'codes';
  const scopeR = radios(id + '-sc', [['all', '전국'], ['codes', '행정구역'], ['bbox', '사각 범위']], scopeOn);
  const regs = options.regions || [];
  const sido = h('select.t-input', { 'aria-label': '시도' }, h('option', { value: '', text: '시도 고르기' }), ...regs.map((r) => h('option', { value: r.code, text: r.name })));
  const sgg = h('select.t-input', { 'aria-label': '시군구', disabled: true }, h('option', { value: '', text: '시도 전체' }));
  const add = h('button.t-btn.t-btn--2', { type: 'button', text: '더하기' });
  const chips = h('div.ak-chips');
  const codes = new Map();
  const paintChips = () => {
    chips.replaceChildren(...[...codes].map(([c, name]) => h('span.t-chip.ak-chip', {}, h('span', { text: name }),
      h('button', { type: 'button', 'aria-label': `${name} 빼기`, text: '빼기', onclick: () => { codes.delete(c); paintChips(); } }))));
    if (!codes.size) chips.append(h('span.ak-hint', { text: '시도나 시군구를 골라 더합니다' }));
  };
  sido.onchange = () => {
    const r = regs.find((x) => x.code === sido.value);
    sgg.replaceChildren(h('option', { value: '', text: '시도 전체' }), ...((r?.sgg) || []).map((s) => h('option', { value: s.code, text: s.name })));
    sgg.disabled = !r;
  };
  add.onclick = () => {
    const r = regs.find((x) => x.code === sido.value); if (!r) return;
    if (sgg.value) codes.set(sgg.value, `${r.name} ${sgg.selectedOptions[0].textContent}`);
    else { for (const c of [...codes.keys()]) if (c.startsWith(r.code)) codes.delete(c); codes.set(r.code, r.name); }
    paintChips();
  };
  paintChips();
  const regBox = h('div.ak-reg', {}, h('div.ak-inl', {}, sido, sgg, add), chips);
  const bb = ['서', '남', '동', '북'].map((t) => h('input.t-input.ak-num', { type: 'number', step: '0.0001', placeholder: t, 'aria-label': `${t}쪽 경위도` }));
  const bbBox = h('div.ak-inl.ak-bb', {}, ...bb, h('p.ak-hint', { text: '경위도(서 · 남 · 동 · 북)로 정합니다' }));
  const scopeBody = h('div.ak-scb', {}, regBox, bbBox);
  const showScope = () => { const v = scopeR.querySelector('input:checked')?.value; regBox.hidden = v !== 'codes'; bbBox.hidden = v !== 'bbox'; };
  scopeR.addEventListener('change', showScope); showScope();

  /* 권한 · 원천 */
  const ext = kind === 'external';
  const rightR = radios(id + '-rt', (options.rights || []).map((r) => [r.id, r.label, r.id === 'read_analyze' && ext]), ext ? 'read' : rights);
  const srcBox = checks((options.sources || []).map((s) => [s.id, s.label, s.internal_only && kind !== 'internal']),
    (options.sources || []).map((s) => s.id).filter((s) => s !== 'lx' || kind === 'internal'));

  /* 분석 넓이 한도 · 끝나는 날 · 형식 · 호출 한도 */
  const num = (v, max, label) => h('input.t-input.ak-num', { type: 'number', min: '1', max: String(max), value: String(val(v) ?? ''), 'aria-label': label });
  const a1 = num(defaults.area_once_km2, 100000, '한 번 분석 넓이(㎢)'), a2 = num(defaults.area_day_km2, 100000, '하루 분석 넓이(㎢)'), a3 = num(defaults.area_month_km2, 100000, '한 달 분석 넓이(㎢)');
  const end = new Date(); end.setDate(end.getDate() + (val(defaults.days) || 365));
  const exp = h('input.t-input', { type: 'date', value: isoDay(end), 'aria-label': '끝나는 날' });
  const fmBox = checks((options.formats || []).map((f) => [f.id, f.label]), (options.formats || []).map((f) => f.id));
  const pm = num(defaults.per_min || 60, 600, '1분 한도'), pd = num(defaults.per_day || 20000, 200000, '하루 한도');
  const lim = (pairs) => h('div.ak-lim', {}, ...pairs.map(([t, inp, u]) => h('label', {}, h('span', { text: t }), inp, h('span', { text: u }))));

  const el = h('div.ak-kf', {},
    row('서비스', svcBox, h('p.ak-hint', { text: '고른 서비스마다 키가 하나씩 만들어집니다' })),
    row('범위', scopeR, scopeBody),
    row('권한', rightR, h('p.ak-hint', { text: ext ? '외부 기관 시스템은 보안성 검토 전까지 결과 조회만 엽니다' : '분석 호출은 아직 열리지 않았습니다. 열리면 이 권한의 키로 바로 씁니다' })),
    row('영상 원천', srcBox, h('p.ak-hint', { text: 'LX 보유 영상은 LX 내부 시스템 키에만 엽니다' })),
    row('분석 넓이 한도', lim([['한 번', a1, '㎢'], ['하루', a2, '㎢'], ['한 달', a3, '㎢']]), h('p.ak-hint', { text: '한도 안의 분석은 바로 차례에 서고, 넘으면 요청 관리로 옵니다' })),
    row('끝나는 날', exp),
    row('내줄 형식', fmBox),
    row('호출 한도', lim([['1분', pm, '회'], ['하루', pd, '회']])));

  function read() {
    const svc = picked(svcBox);
    if (!svc.length) return { error: '키를 만들 서비스를 하나 이상 골라 주세요', field: 'services' };
    const sc = scopeR.querySelector('input:checked')?.value || 'all';
    let scope = { all: true };
    if (sc === 'codes') { if (!codes.size) return { error: '범위로 열 시도 · 시군구를 하나 이상 더해 주세요', field: 'scope' }; scope = { codes: [...codes.keys()] }; }
    if (sc === 'bbox') { const v = bb.map((x) => x.value.trim()); if (v.some((x) => x === '')) return { error: '사각 범위의 서 · 남 · 동 · 북을 모두 적어 주세요', field: 'scope' }; scope = { bbox: v.map(Number) }; }
    const sources = picked(srcBox);
    if (!sources.length) return { error: '영상 원천을 하나 이상 골라 주세요', field: 'sources' };
    const formats = picked(fmBox);
    if (!formats.length) return { error: '내줄 형식을 하나 이상 골라 주세요', field: 'formats' };
    return { services: svc, scope, rights: rightR.querySelector('input:checked')?.value || 'read', sources, formats,
      area_once_km2: +a1.value, area_day_km2: +a2.value, area_month_km2: +a3.value, expires_at: exp.value, per_min: +pm.value, per_day: +pd.value };
  }
  return { el, read };
}

/* 키 값 한 번 보기 — 서비스마다 한 줄(복사). 닫으면 다시 볼 수 없다 */
export function keysOnce(list, { who = '', toast = () => {}, done } = {}) {
  return h('div.ak-once', {},
    who ? h('p.ak-for', {}, h('b', { text: who })) : null,
    h('p.ak-warn', { text: '키 값은 지금 한 번만 보입니다. 신청한 담당자에게 안전한 길로 전하세요.' }),
    ...list.map((x) => h('div.ak-onekey', {}, h('p.t-label', { text: x.item?.service?.name || '' }),
      h('div.ak-valbox', {}, h('code.ak-val', { text: x.key }),
        h('button.t-btn.t-btn--2', { type: 'button', text: '복사', onclick: async () => {
          try { await navigator.clipboard.writeText(x.key); toast('키를 복사했습니다'); } catch { toast('복사하지 못했습니다 — 직접 골라 복사해 주세요'); }
        } })))),
    done ? h('div.ak-acts', {}, h('button.t-btn', { type: 'button', text: '닫기', onclick: done })) : null);
}
