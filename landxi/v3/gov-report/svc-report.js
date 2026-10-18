/* 기관 '보고서' 탭 = AI 분석 결과 보고서(서비스 기준) — 확인 대장 10-11 18:52 'gov-보고서' 이대로 구현 · 시안 design-r20/gov-report-main ?v=report.
   고르는 것 둘: 서비스(기관에 열린 서비스 · 결과 있는 것) · 읍면동(전체 또는 하나). 규칙 · 소견 · 조치 제안 · 판정 · 우선순위 없음(원칙 135 · 3).
   문서 = ① 개요(합계 · 분류별 · AI 모델 정확도) ② 지도 그림 ③ 읍면동별 개수 · 면적 ④ 우리 대장과 다른 필지(올린 대장이 있을 때만) → 한글 문서(.hwpx · 10-14 원칙 250).
   숫자 한 출처 = GET /spaces/me/report(결과 설명서 결과 세트 × 관할 — 대시보드 큰 숫자 · 필지 목록과 같은 행). 지도 그림 · 한글 문서도 같은 서버 함수. */
import { api, h } from '../kit/util.js';
import { toast, devlog } from '../kit/index.js';
import { personalFile } from '../kit/pledge.js';   // 대장이 든 보고서 = 개인정보가 든 파일(10-18 영농-q3 · 이용 약속 · 받을 때마다 확인)

const $ = (s, r = document) => r.querySelector(s);
const nf = (v, d = 0) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const val = (e) => (e && typeof e === 'object' ? e.value : e);
const TOP = 10;
const jo = (w, a, b) => { const c = String(w || '').charCodeAt(String(w || '').length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? a : b; };   // 받침 있으면 a

export function svcReport({ svc, stage, onAuth, fusionHref }) {
  const S = { card: svc, emd: '', data: null, img: null, busy: false };
  /* 옛 보고서 칸(규칙 · 시군구 · 세 문단)을 새 칸으로 갈아 끼운다 — 옛 이벤트도 함께 떨어진다 */
  const old = $('#rp-form');
  const form = h('form.gr-form.gr-form--svc', { id: 'rp-form', autocomplete: 'off' });
  const svcSel = h('select.t-input', { id: 'rp-svc', 'aria-label': '서비스' });
  const emdSel = h('select.t-input', { id: 'rp-emd2', 'aria-label': '읍면동' });
  const go = h('button.t-btn', { type: 'submit', text: '보고서 만들기' });
  const dl = h('button.t-btn.t-btn--2', { type: 'button', text: '한글 문서 내려받기' });
  form.append(h('label.gr-field', {}, h('span.t-label', { text: '서비스' }), svcSel), h('label.gr-field', {}, h('span.t-label', { text: '읍면동' }), emdSel), go, dl);
  old.replaceWith(form);
  const doc = $('#doc');
  doc.classList.add('gr-doc--svc');
  doc.replaceChildren();
  $('#doc-act').hidden = true;
  const lock = (on) => { for (const b of [go, dl, svcSel, emdSel]) b.disabled = on; };

  async function load() {
    if (S.busy) return;
    S.busy = true; lock(true);
    doc.replaceChildren(h('p.gr-wait', { role: 'status', text: '보고서를 만드는 중' }));
    let d;
    try { d = await api('/spaces/me/report?' + new URLSearchParams({ card: S.card, ...(S.emd ? { emd: S.emd } : {}) })); }
    catch (e) {
      devlog('svc report', e.message); S.busy = false; lock(false);
      if (e.status === 401 || e.status === 403) return onAuth?.();
      doc.replaceChildren(h('p.gr-err', { role: 'status', text: e.status === 404 ? '이 서비스는 아직 보고서로 만들 결과가 없습니다' : '불러오지 못했습니다' }));
      return;
    }
    S.data = d; S.busy = false; lock(false);
    paintPick(d);
    paint(d);
    if (stage && d.bbox) stage.ready.then(() => stage.go(d.bbox, { ms: 1600, maxZoom: S.emd ? 13.5 : 12 })).catch(() => {});
  }

  function paintPick(d) {
    const svcs = d.services || [];
    svcSel.replaceChildren(...(svcs.length ? svcs : [{ card: S.card, name: d.service.name }]).map((s) => h('option', { value: s.card, text: s.name })));
    svcSel.value = S.card;
    emdSel.replaceChildren(h('option', { value: '', text: `${String(d.region || '').replace(` ${d.emd || ''}`, '').trim() || '관할'} 전체` }),
      ...(d.emds || []).map((x) => h('option', { value: x, text: x })));
    emdSel.value = S.emd;
  }

  function paint(d) {
    const unit = d.unit || '건';
    const meta = [String(d.region || ''), `작성 ${d.made}`, d.imagery ? `영상 ${d.imagery}` : null, d.analyzed ? `분석 ${d.analyzed}` : null].filter(Boolean).join(' · ');
    const ov = h('div.gr-ov');
    ov.append(box('AI 분석 결과', d.total, unit));
    for (const c of d.classes || []) ov.append(box(c.name, c.n, unit, `${unit} · ${nf(val(c.ha), 1)}ha` + (val(c.yield) ? ` · 생산량 ${nf(val(c.yield))}kg` : '')));   // 곤포사일리지 생산량 = 개수 × 기관이 넣은 1개당 무게(10-18 영농-q2 ⓑ)
    ov.append(box('AI 모델 정확도', d.acc, '%'));
    const nE = val(d.emd_n);
    const line = `${d.imagery ? d.imagery + jo(d.imagery, '을 ', '를 ') : ''}${d.service.name}${jo(d.service.name, '으로', '로')} 분석한 결과입니다. `
      + `${d.emd ? d.emd : `읍면동 ${nf(nE)}곳`}에서 ${nf(val(d.total))}${unit}${jo(unit, '이', '가')} 나왔습니다.`
      + (val(d.acc) !== null ? ' AI 모델 정확도는 학습에 쓰지 않은 영상으로 잰 값입니다.' : '');
    const map = h('figure.gr-map-fig', {}, h('div.gr-map-img', { 'aria-label': '보고서 지도 그림' }),
      h('figcaption', { text: '읍면동 경계 위 AI 분석 결과' + ((d.classes || []).length > 1 ? ' · ' + d.classes.map((c) => c.name).join(' · ') : '') }));
    const art = h('article.gr-rdoc', { dataset: { metric: 'AI 분석 결과', v: String(val(d.total) ?? '') } },
      h('p.gr-rdoc-k', { text: 'AI 분석 결과 보고서' }),
      h('h2.gr-rdoc-t', { text: `${d.service.name} · ${d.region}` }),
      h('p.gr-rdoc-m', { text: meta }),
      h('h3', { text: '개요' }), ov, h('p.gr-rdoc-p', { text: line }),
      h('h3', { text: '지도' }), map,
      h('h3', { text: '읍면동별 개수 · 면적' }), emdTable(d));
    if (d.ledger) art.append(...ledgerSec(d.ledger));
    doc.replaceChildren(art);
    drawMap(map.querySelector('.gr-map-img'));
  }

  function box(label, env, unit, sub) {
    const v = val(env);
    return h('div.gr-ov-i', {}, h('small', { text: label }),
      h('b', { dataset: { metric: label, v: String(v ?? '') } }, h('span.num', { text: v === null || v === undefined ? '—' : nf(v) }), h('i', { text: sub || unit })));
  }

  function emdTable(d) {
    const cls = (d.classes || []).map((c) => c.name);
    const many = cls.length > 1;
    const rows = (d.emd_rows || []);
    const show = rows.slice(0, TOP), rest = rows.slice(TOP);
    const cnt = (r, k) => (r.by || []).find((b) => b.cls === k)?.n || 0;
    const tr = (name, cells, cl) => h('tr', { class: cl || '' }, h('td', { text: name }), ...cells.map((c) => h('td.n', { text: c })));
    const head = h('tr', {}, h('th', { text: '읍면동' }), ...(many ? cls : []).map((k) => h('th.n', { text: k })), h('th.n', { text: '계' }), h('th.n', { text: '면적(ha)' }));
    const body = show.map((r) => tr(r.emd, [...(many ? cls.map((k) => nf(cnt(r, k))) : []), nf(r.n), nf(val(r.ha), 1)]));
    if (rest.length) {
      const sum = (f) => rest.reduce((a, r) => a + f(r), 0);
      body.push(tr(`그 밖 ${rest.length}곳`, [...(many ? cls.map((k) => nf(sum((r) => cnt(r, k)))) : []), nf(sum((r) => r.n)), nf(Math.round(sum((r) => val(r.ha) || 0) * 10) / 10, 1)], 'dim'));   // 서버가 합이 맞게 나눈 줄 값(최대 나머지 · GPT5-3)을 더해 열 합 = 합계
    }
    body.push(tr('합계', [...(many ? (d.classes || []).map((c) => nf(val(c.n))) : []), nf(val(d.total)), nf(val(d.area_ha), 1)], 'sum'));
    return h('table.gr-rtb', {}, h('thead', {}, head), h('tbody', {}, ...body));
  }

  function ledgerSec(L) {
    const out = [h('h3', { text: '우리 대장과 다른 필지' })];
    const cmp = h('div.gr-cmp');
    cmp.append(h('div', {}, h('small', { text: '올린 대장' }), h('b.gr-cmp-n', { text: `${L.ledger.name} · ${nf(val(L.ledger.parcels))}필지` })));
    cmp.append(h('div', {}, h('small', { text: 'AI 결과가 있는 필지' }), h('b', { dataset: { metric: 'AI 결과가 있는 필지', v: String(val(L.with_ai) ?? '') } }, h('span.num', { text: nf(val(L.with_ai)) }), h('i', { text: '필지' }))));
    const ln = (L.lines || []).filter((x) => val(x.n));
    for (const x of (ln.length ? ln : (L.lines || []).slice(0, 1))) cmp.append(h('div', {}, h('small', { text: x.label.replace('인데 ', ' · ').replace('아닌데 ', '아님 · ') }), h('b', {}, h('span.num', { text: nf(val(x.n)) }), h('i', { text: '필지' }))));
    out.push(cmp);
    const n = val(L.no_ai);
    out.push(h('p.gr-rdoc-p', {}, n ? `대장 필지 ${nf(n)}곳은 ${/영상/.test(L.no_ai_label) ? `${L.service?.shot ? L.service.shot + ' ' : ''}범위 밖이라 AI 분석 전입니다` : 'AI 결과가 없습니다'}. ` : '',
      '자세한 목록은 ', h('a.gr-a', { href: fusionHref(), text: '행정정보와 비교' }), '에서 봅니다.'));
    return out;
  }

  async function drawMap(el) {
    if (S.img) URL.revokeObjectURL(S.img);
    el.dataset.state = 'loading';
    try {
      const r = await api('/spaces/me/report/map.png?' + new URLSearchParams({ card: S.card, ...(S.emd ? { emd: S.emd } : {}) }), { raw: true });
      if (!r.ok) throw Object.assign(new Error('http ' + r.status), { status: r.status });
      S.img = URL.createObjectURL(await r.blob());
      el.replaceChildren(h('img', { src: S.img, alt: '읍면동 경계 위 AI 분석 결과 지도 그림' }));
      el.dataset.state = 'on';
    } catch (e) { devlog('report map', e.message); el.dataset.state = 'none'; el.replaceChildren(h('p.gr-err', { text: '지도 그림을 불러오지 못했습니다' })); }
  }

  async function download() {
    dl.disabled = true;
    if (S.data?.ledger) {                // '우리 대장과 다른 필지'(지번 · 대장 값)가 든 문서
      try { await personalFile('/spaces/me/report.hwpx?' + new URLSearchParams({ card: S.card, ...(S.emd ? { emd: S.emd } : {}) }), { name: 'AI분석결과보고서.hwpx', label: '이 보고서' }); }
      catch (e) { devlog('report hwpx', e.message); if (e.status === 401 || e.status === 403) return onAuth?.(); toast('내려받지 못했습니다'); }
      finally { dl.disabled = false; }
      return;
    }
    try {
      const r = await api('/spaces/me/report.hwpx?' + new URLSearchParams({ card: S.card, ...(S.emd ? { emd: S.emd } : {}) }), { raw: true });
      if (!r.ok) throw Object.assign(new Error('http ' + r.status), { status: r.status });
      const cd = r.headers.get('content-disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const name = m ? decodeURIComponent(m[1]) : 'AI분석결과보고서.hwpx';
      const u = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      toast('내려받았습니다');
    } catch (e) { devlog('report hwpx', e.message); if (e.status === 401 || e.status === 403) return onAuth?.(); toast('내려받지 못했습니다'); }
    finally { dl.disabled = false; }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  svcSel.addEventListener('change', () => { S.card = svcSel.value; S.emd = ''; load(); });
  emdSel.addEventListener('change', () => { S.emd = emdSel.value; load(); });
  dl.addEventListener('click', download);
  load();
  return { reload: load };
}
