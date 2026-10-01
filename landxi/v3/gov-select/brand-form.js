/* 기관 정보 고치기 — 마크 · 이름 · 색 · 소개 글 · 문의처(구현 2차 T3 · GF-5 ⓐ 기관 관리자 직접 + LX 관리자도 · GF-3 구조화된 틀).
   같은 칸을 두 곳에서 쓴다: 기관 관리자 = 서비스 선택 안 '기관 정보' · LX 관리자 = LX 관리자 화면 기관 서랍.
   저장하면 서버(PUT /brand/{기관})가 정본으로 바꾸고 기관 메인에 바로 반영된다. 기관색은 대비 검사를 통과할 때만 저장(서버가 최종 판정).
   배치 · 메뉴 · 부품은 못 바꾼다(LX 가 한 벌로 찍는 골격 — brand.md 2절). 서비스 목록은 LX 관리자가 정한다(원칙 67).
   const el = brandForm({ brand, drawer: false, mainHref, onSaved(b) }) */
import { api, API, session } from '../../shared/api-v1.js';
import { h } from '../kit/util.js';
import { toast } from '../kit/toast.js';
import { LIMITS, MARK_RULE, applyBrand, checkColors, contrast, markEl, faceEl, headlineHtml } from './brand.js';

const val = (el) => (el?.value || '').trim();

export function brandForm({ brand, drawer = false, mainHref = null, onSaved } = {}) {
  let B = brand;
  const root = h('form.bf', { class: drawer ? 'bf-drawer' : '', autocomplete: 'off', novalidate: true, 'aria-label': '기관 정보' });

  /* ── 칸 ── */
  const inp = (name, max, attrs = {}) => h('input.t-input', { name, maxlength: String(max), ...attrs });
  const row = (label, ...kids) => h('div.bf-row', {}, h('span.t-label', { text: label }), h('div', {}, ...kids));

  const markBox = h('span.bf-mark-box');
  const file = h('input', { type: 'file', accept: MARK_RULE.types.join(','), hidden: true });
  const up = h('button.t-btn.t-btn--2', { type: 'button', text: '그림 올리기' });
  const toText = h('button.t-btn.t-btn--2', { type: 'button', text: '글자 마크로' });
  const m1 = inp('mark1', LIMITS.mark_line, { 'aria-label': '마크 글자 윗줄' });
  const m2 = inp('mark2', LIMITS.mark_line, { 'aria-label': '마크 글자 아랫줄' });
  const platform = inp('platform', LIMITS.platform, { 'aria-label': '플랫폼 이름' });
  const short = inp('short', LIMITS.short, { 'aria-label': '약칭' });
  const accent = inp('accent', 7, { 'aria-label': '진한 색', spellcheck: 'false' });
  const tint = inp('tint', 7, { 'aria-label': '연한 바탕', spellcheck: 'false' });
  const accentPick = h('input', { type: 'color', 'aria-label': '진한 색 고르기' });
  const tintPick = h('input', { type: 'color', 'aria-label': '연한 바탕 고르기' });
  const check = h('p.bf-check', { role: 'status' });
  const headline = h('textarea.t-input', { name: 'headline', rows: '2', maxlength: String(LIMITS.headline_line * 2 + 1), 'aria-label': '머리 두 줄' });
  const lines = [0, 1, 2].map((i) => inp('line' + i, LIMITS.line, { 'aria-label': `설명 ${i + 1}째 줄` }));
  const items = new Map();
  const contact = inp('contact', LIMITS.contact, { 'aria-label': '문의처', inputmode: 'tel' });
  const save = h('button.t-btn', { type: 'submit', text: '저장' });
  const err = h('p.bf-err', { role: 'alert' });
  const ok = h('p.bf-ok', { role: 'status' });

  const itemRows = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  for (const s of B.services || []) {
    const i = inp('item:' + s.card, LIMITS.item, { 'aria-label': `${s.name} 한 줄 소개` });
    items.set(s.card, i);
    itemRows.append(h('div.bf-item', {}, h('span.nm', { text: s.name }), i));
  }

  /* ── 미리 보기(메인 머리 한 장) ── */
  const pvMark = h('span'), pvPlat = h('span.pl'), pvOrg = h('p.t-label'), pvH = h('h4.bf-pv-h'), pvL = h('p.bf-pv-l');
  const lead = (B.services || []).find((s) => s.status === '운영') || (B.services || [])[0];
  const pv = h('aside.bf-pv', { 'aria-label': '메인 미리 보기' },
    h('div.bf-pv-top', {}, pvMark, pvPlat),
    h('div.bf-pv-body', {}, pvOrg, pvH, pvL),
    lead ? faceEl(lead.card) : null,
    h('p.bf-pv-cap', { text: '메인 미리 보기 — 저장하면 기관 메인에 바로 반영됩니다' }));

  const fields = h('div.bf-fields', {},
    h('section.bf-sec', {}, h('h3', { text: '마크' }),
      h('div.bf-mark', {}, markBox, up, toText, file),
      h('p.bf-hint', { text: `PNG · JPG · WebP 그림 · 1MB 이하 · 가로세로 ${MARK_RULE.min}–${MARK_RULE.max}픽셀. 그림이 없으면 아래 두 줄 글자가 마크가 됩니다.` }),
      row('마크 글자', h('div.bf-two', {}, m1, m2))),
    h('section.bf-sec', {}, h('h3', { text: '이름' }),
      row('플랫폼 이름', platform),
      row('약칭', short, h('p.bf-hint', { text: '메인 머리에서 이 말이 기관색으로 강조됩니다.' }))),
    h('section.bf-sec', {}, h('h3', { text: '기관색' }),
      row('진한 색', h('div.bf-color', {}, accentPick, accent)),
      row('연한 바탕', h('div.bf-color', {}, tintPick, tint)),
      check,
      h('p.bf-hint', { text: '기관색은 마크 · 현재 위치 표시 · 서비스 그림에만 쓰입니다. 대비 검사를 통과해야 저장됩니다.' })),
    h('section.bf-sec', {}, h('h3', { text: '메인 소개 글' }),
      row('머리', headline, h('p.bf-hint', { text: `두 줄까지 · 한 줄 ${LIMITS.headline_line}자까지. 줄을 바꾸는 곳을 직접 정합니다.` })),
      row('설명', h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, ...lines)),
      (B.services || []).length ? row('서비스 소개', itemRows) : null),
    h('section.bf-sec', {}, h('h3', { text: '문의처' }), row('대표 전화', contact)),
    h('div.bf-act', {}, save, mainHref ? h('a.t-btn.t-btn--text', { href: mainHref, text: '메인 열기' }) : null, ok),
    err);

  root.append(h('div.bf-grid', {}, pv, fields));

  /* ── 값 채우기 · 미리 보기 ── */
  function fill(b) {
    B = b;
    const t = b.mark?.text || [];
    m1.value = t[0] || ''; m2.value = t[1] || '';
    platform.value = b.platform || ''; short.value = b.short || '';
    accent.value = b.color?.accent || ''; tint.value = b.color?.tint || '';
    accentPick.value = accent.value.toLowerCase(); tintPick.value = tint.value.toLowerCase();
    headline.value = b.intro?.headline || '';
    lines.forEach((el, i) => { el.value = (b.intro?.lines || [])[i] || ''; });
    for (const [card, el] of items) el.value = (b.intro?.items || {})[card] || '';
    contact.value = b.contact || '';
    toText.hidden = !b.mark?.image;
    paint();
  }
  function draft() {
    return {
      ...B, platform: val(platform), short: val(short),
      mark: { image: B.mark?.image || null, text: [val(m1), val(m2)].filter(Boolean) },
      color: { accent: val(accent).toUpperCase(), tint: val(tint).toUpperCase() },
      intro: { ...(B.intro || {}), headline: headline.value.split('\n').map((s) => s.trim()).filter(Boolean).join('\n') },
    };
  }
  function paint() {
    const d = draft();
    const bad = checkColors(d.color.accent, d.color.tint);
    accent.classList.toggle('is-bad', bad.some((x) => x.key === 'accent'));
    tint.classList.toggle('is-bad', bad.some((x) => x.key === 'tint'));
    if (bad.length) { check.dataset.bad = '1'; check.textContent = bad.map((x) => x.why).join(' · '); }
    else { delete check.dataset.bad; check.textContent = `대비 검사 통과 — 흰 바탕 대비 ${contrast(d.color.accent, '#FFFFFF')}`; }
    save.disabled = bad.length > 0;
    if (!bad.length) applyBrand(pv, d);
    markBox.replaceChildren(markEl(B.mark?.image ? B : d, { size: 'lg' }));
    pvMark.replaceChildren(markEl(B.mark?.image ? B : d));
    pvPlat.textContent = d.platform;
    pvOrg.textContent = B.name?.ko || B.name?.en || '';
    pvH.innerHTML = headlineHtml(d);
    pvL.replaceChildren(...lines.map(val).filter(Boolean).map((t) => h('span', { text: t })));
  }
  root.addEventListener('input', (e) => {
    if (e.target === accentPick) accent.value = accentPick.value.toUpperCase();
    if (e.target === tintPick) tint.value = tintPick.value.toUpperCase();
    if (e.target === accent && /^#[0-9a-f]{6}$/i.test(val(accent))) accentPick.value = val(accent).toLowerCase();
    if (e.target === tint && /^#[0-9a-f]{6}$/i.test(val(tint))) tintPick.value = val(tint).toLowerCase();
    err.textContent = ''; ok.textContent = '';
    paint();
  });

  /* ── 마크 그림 올리기 · 지우기(바로 저장) ── */
  up.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; file.value = '';
    if (!f) return;
    err.textContent = '';
    if (!MARK_RULE.types.includes(f.type)) { err.textContent = 'PNG · JPG · WebP 그림만 올릴 수 있습니다'; return; }
    if (f.size > MARK_RULE.bytes) { err.textContent = '마크 그림은 1MB 이하만 올릴 수 있습니다'; return; }
    up.disabled = true; up.setAttribute('aria-busy', 'true');
    try {
      const fd = new FormData(); fd.append('file', f);
      const s = session.get();
      const r = await fetch(`${API.prefix}/brand/${encodeURIComponent(B.tenant)}/mark`, { method: 'POST', body: fd, headers: { accept: 'application/json', ...(s ? { authorization: 'Bearer ' + s.token } : {}) } });
      const j = await r.json().catch(() => null);
      if (!r.ok) { err.textContent = j?.error?.message || '지금은 올릴 수 없습니다'; return; }
      fill(j); onSaved?.(j); toast('마크를 바꿨습니다', mainHref ? { action: { label: '메인 열기', href: mainHref } } : {});
    } catch { err.textContent = '서버에 연결할 수 없습니다 — 잠시 뒤 다시 시도하세요'; }
    finally { up.disabled = false; up.removeAttribute('aria-busy'); }
  });
  toText.addEventListener('click', async () => {
    toText.disabled = true;
    try { const j = await api(`/brand/${encodeURIComponent(B.tenant)}/mark`, { method: 'DELETE' }); fill(j); onSaved?.(j); toast('글자 마크로 바꿨습니다'); }
    catch (e) { err.textContent = e.message || '지금은 바꿀 수 없습니다'; }
    finally { toText.disabled = false; }
  });

  /* ── 저장 ── */
  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = draft();
    if (checkColors(d.color.accent, d.color.tint).length) return;
    const hl = headline.value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!d.platform || !d.short || !d.mark.text.length || !hl.length || !lines.some((l) => val(l))) { err.textContent = '비어 있는 칸이 있습니다 — 이름 · 약칭 · 마크 글자 · 머리 · 설명 한 줄은 꼭 채웁니다'; return; }
    if (hl.length > 2 || hl.some((s) => s.length > LIMITS.headline_line)) { err.textContent = `머리는 두 줄까지, 한 줄 ${LIMITS.headline_line}자까지 씁니다`; headline.focus(); return; }
    const body = {
      platform: d.platform, short: d.short, mark_text: d.mark.text.join('\n'), accent: d.color.accent, tint: d.color.tint, contact: val(contact),
      intro: { headline: hl.join('\n'), lines: lines.map(val).filter(Boolean), items: Object.fromEntries([...items].map(([k, el]) => [k, val(el)]).filter(([, v]) => v)) },
    };
    save.disabled = true; save.setAttribute('aria-busy', 'true'); err.textContent = '';
    try {
      const j = await api(`/brand/${encodeURIComponent(B.tenant)}`, { method: 'PUT', body });
      fill(j); onSaved?.(j);
      ok.textContent = '저장했습니다 — 메인에 바로 반영됩니다';
      toast('저장했습니다', mainHref ? { action: { label: '메인 열기', href: mainHref } } : {});
    } catch (ex) {
      const bad = ex.detail?.bad;
      err.textContent = bad?.length ? bad.map((x) => x.why).join(' · ') : ex.status ? (ex.message || '저장하지 못했습니다') : '서버에 연결할 수 없습니다 — 잠시 뒤 다시 시도하세요';
    } finally { save.removeAttribute('aria-busy'); paint(); }
  });

  fill(B);
  return root;
}
