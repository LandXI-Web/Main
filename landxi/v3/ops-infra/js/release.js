/* LX 관리자 대시보드 → '배포' 메뉴 — 세 탭(확인 대장 배포-3 ⓐ · 배포-4 · 배포-5 · 원칙 152 · 159 · 160).
   #/deploys          배포 신청 — 직원이 프로젝트 마지막 단계에서 올린 신청(서버 GET /release/requests). 신청서(서버 값 + 메모)를 보고 승인 · 거절(사유 필수).
                      두 판을 돌려 보는 기능은 두지 않는다(배포-4 보류 · 원칙 159 고침). 결정 = 지금 있는 승인 요청 길(POST /approvals/{id}/decide).
   #/deploys/share    기관 공유 — 승인된 서비스 × 기관 체크 표 하나(공유 상태 표 없음). 체크 = 그 기관 '서비스 선택'에 바로(PUT /release/shares).
   #/deploys/usage    사용 현황 — 기관 × 공유된 서비스: LX가 돌린 분석 · 기관이 요청한 분석 · 마지막 사용 + 기관별 합계(GET /release/usage).
   #/deploys/categories  분야 — 분야 목록(만들기 · 이름 바꾸기 · 순서 · 쓰는 서비스 수) + 직원이 요청한 새 분야 + 바뀐 기록(/categories · 질문 5 · 원칙 165).
                      분석하기 거르기 칩 · 서비스 카드 · 기관 공유 표가 이 순서를 따른다.
   #/deploys/improve  개선 후보(16차 개선-1 · 그대로 둔다).
   #/deploys/api      API — 외부 연동 API 키(기관 × 공유된 서비스 · LX 관리자가 만들고 관리 · 원칙 178 · apikeys.js). 사용 현황 표에 'API 호출' 열(원칙 160).
   숫자는 모두 서버 값(봉투). 아이콘 0. 광역 기관은 기관 단위 체크만(배포-6 광역 세부는 보류). */
import { toast, h, api, nf, drawer } from './kit.js';
import { improveBoard } from './improve.js';
import { apiKeysPane } from './apikeys.js';   // 배포 → API(외부 연동 API 키 · 원칙 178)

{ const href = new URL('../release.css', import.meta.url).href;
  if (!document.querySelector(`link[href="${href}"]`)) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href })); }

const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const md = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()}`; };
const mdhm = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const pct = (e) => (val(e) == null ? '—' : `${nf(val(e))}%`);
const km2 = (e) => (val(e) == null || val(e) < 0.01 ? '' : `${nf(val(e), val(e) < 1 ? 2 : val(e) < 100 ? 1 : 0)}km²`);   // 직원 화면과 같은 자릿수
const join = (...xs) => xs.filter((x) => x !== null && x !== undefined && x !== '').join(' · ');
const units = (tag, text) => { const el = h(tag); String(text || '').split(' · ').forEach((u, i) => { if (i) el.append(' · '); el.append(h('span.rv-u', { text: u })); }); return el; };
const bar = (v, dim = false) => h('span.rv-bar', { class: dim ? 'is-dim' : '' }, h('i', { style: `width:${Math.max(0, Math.min(100, val(v) || 0))}%` }));
const TABS = [['req', '배포 신청', ''], ['share', '기관 공유', '/share'], ['usage', '사용 현황', '/usage'], ['cat', '분야', '/categories'], ['imp', '개선 후보', '/improve'], ['api', 'API', '/api']];

export function mountRelease(root) {
  const nBadge = h('b.num.im-tab-n'), impN = h('b.num.im-tab-n'), catN = h('b.num.im-tab-n');
  const btn = Object.fromEntries(TABS.map(([k, t]) => [k, h('button', { type: 'button', role: 'tab', dataset: { tab: k } }, h('span', { text: t }), k === 'req' ? nBadge : k === 'imp' ? impN : k === 'cat' ? catN : null)]));
  const panes = Object.fromEntries(TABS.map(([k]) => [k, h('div.rv-pane', { dataset: { tab: k } })]));
  root.append(h('div.im-head', {}, h('nav.im-tabs', { role: 'tablist', 'aria-label': '배포' }, ...Object.values(btn))), ...Object.values(panes));
  const board = improveBoard(panes.imp, { admin: true, onCount: (n) => { impN.textContent = n ? nf(n) : ''; } });
  const keys = apiKeysPane(panes.api);
  let tab = null;
  const want = () => { const m = /^#\/deploys\/(\w+)/.exec(location.hash); return ({ share: 'share', usage: 'usage', categories: 'cat', improve: 'imp', api: 'api' })[m?.[1]] || 'req'; };
  function set(t, push = false) {
    tab = t;
    for (const [k] of TABS) { btn[k].setAttribute('aria-selected', String(k === t)); panes[k].hidden = k !== t; }
    if (push) history.replaceState(null, '', '#/deploys' + TABS.find((x) => x[0] === t)[2]);
    paint();
  }
  for (const [k] of TABS) btn[k].addEventListener('click', () => set(k, true));
  addEventListener('hashchange', () => { if (/^#\/deploys/.test(location.hash) && want() !== tab) set(want()); });

  /* ── 배포 신청 ─────────────────────────── */
  let R = null, pick = null, catName = {};
  async function paintReq() {
    try { catName = Object.fromEntries(((await api('/categories')).items || []).map((g) => [g.id, g.name])); } catch { /* 분야 이름 없이도 신청서는 보인다 */ }
    try { R = await api('/release/requests'); } catch (e) { panes.req.replaceChildren(h('p.rv-empty', { text: e.message || '배포 신청을 불러오지 못했습니다' })); return; }
    nBadge.textContent = val(R.pending) ? nf(val(R.pending)) : '';
    const items = R.items || [];
    if (!pick || !items.some((x) => x.id === pick)) pick = (items.find((x) => x.state === 'pending') || items[0])?.id || null;
    const rows = items.map((x) => h('tr', { class: x.id === pick ? 'is-on' : '', tabindex: '0', onclick: () => { pick = x.id; drawReq(); }, onkeydown: (e) => { if (e.key === 'Enter') { pick = x.id; drawReq(); } } },
      h('td', {}, h('b', { text: x.service?.name || '' }), x.project?.name ? h('small', { text: x.project.name }) : null),
      h('td.num', { text: x.version || '' }), h('td', { text: x.by || '—' }), h('td.num', { text: md(x.at) }),
      h('td', {}, h('span.t-chip', { dataset: { lv: x.state === 'pending' ? 'now' : x.state === 'rejected' ? 'warn' : '' }, text: x.state_label }), x.test ? h('span.rv-test', { text: '시험' }) : null)));
    const other = (R.other || []).filter((o) => o.n);
    const list = h('section.t-card.rv-card', {}, h('header.rv-h', {}, h('h2', { text: '배포 신청' }), units('span.rv-sub', join(`검토 중 ${nf(val(R.pending))}`, `처리함 ${nf(val(R.decided))}`))),
      items.length ? h('table.rv-tbl', {}, h('thead', {}, h('tr', {}, ...['서비스', '판', '신청한 사람', '신청일', '상태'].map((t) => h('th', { text: t })))), h('tbody', {}, ...rows))
        : h('p.rv-empty', { text: '아직 배포 신청이 없습니다' }),
      h('p.rv-note', { text: `처리함에는 승인 · 거절한 신청이 사유와 함께 남습니다. 지금까지 거절 ${nf(val(R.rejected))}건.` }),
      other.length ? h('div.rv-other', {}, h('p.t-label', { text: '다른 승인 요청 — 승인 요청 메뉴에서' }),
        h('ul', {}, ...other.map((o) => h('li', {}, h('b', { text: o.label }), h('span', { text: `${nf(o.n)}건` }))))) : null);
    const it = items.find((x) => x.id === pick);
    panes.req.replaceChildren(h('div.rv-grid.rv-grid--req', {}, list, it ? detail(it) : h('section.t-card.rv-card', {}, h('p.rv-empty', { text: '신청을 고르면 신청서가 보입니다' }))));
  }
  function drawReq() { if (R) paintReqFromCache(); }
  function paintReqFromCache() {
    panes.req.querySelectorAll('tbody tr').forEach((tr, i) => tr.classList.toggle('is-on', (R.items || [])[i]?.id === pick));
    const it = (R.items || []).find((x) => x.id === pick);
    const grid = panes.req.querySelector('.rv-grid');
    if (grid && it) grid.replaceChild(detail(it), grid.children[1]);
  }

  function detail(x) {
    const f = x.form || {};
    const dl = h('dl.rv-dl');
    const row = (k, ...v) => dl.append(h('div', {}, h('dt', { text: k }), h('dd', {}, ...v)));
    if (!x.form) {                       // 신청서가 생기기 전(10-09 전)의 서비스 공개 승인 기록 — 서버 값이 없어 지어내지 않는다
      row('모델', h('b', { text: x.model_name || '—' }));
      row('신청서', h('span.rv-dim', { text: '신청서가 생기기 전 기록이라 서버 값이 없습니다' }));
      if (x.memo) row('메모', h('span', { text: x.memo }));
      return finish(x, dl);
    }
    row('모델', h('b', { text: f.model?.name || x.model_name || '—' }), f.model ? units('small', join(`${f.model.n}번째 학습`, (f.model.classes || []).join(' · '), f.model.gsd_word)) : null);
    row('정확도', h('div.rv-cmp', {},
      h('span', {}, h('em', { text: '이번 판' }), h('b', { text: pct(f.acc) }), bar(f.acc)),
      h('span', {}, h('em', { text: f.prev ? `지난 판 ${f.prev.version}` : '지난 판' }), h('b', { text: f.prev ? pct(f.prev.acc) : '—' }), bar(f.prev?.acc, true))),
    f.low ? h('p.rv-low', { role: 'note', text: `${f.low} — 막지 않습니다 · 보고 판단해 주세요` }) : null,   // 질문 9 ⓑ(직원 신청서와 같은 줄)
    h('small', { text: f.prev ? '학습 끝 검증 값' : '첫 판입니다 — 비교할 지난 판이 없습니다' }));
    row('학습 데이터', f.sample ? units('b', join(`표본 ${nf(val(f.sample.images))}장`, `${md(f.sample.at)} 올림`)) : h('b.rv-warn', { text: f.model ? '프로젝트 학습 데이터와 연결 기록 없음' : '—' }));
    const rv = f.review;
    row('결과 확인', f.review_skip ? h('b', { text: '해당 없음' }) : h('b', { class: rv && rv.n >= rv.total ? '' : 'rv-warn', text: rv ? `${nf(rv.n)}/${nf(rv.total)}` : '—' }),
      rv && rv.n < rv.total ? h('small', { text: '프로젝트의 결과 확인 단계가 끝나지 않았습니다' }) : null);
    const sc = f.scene;
    row('결과 장면', sc ? h('b', { text: join(sc.imagery, sc.range) }) : h('b', { text: '고르지 않음' }),
      sc ? units('small', join(val(sc.found) == null ? '' : `${nf(val(sc.found))}건`, km2(sc.area), md(sc.at))) : null,
      sc?.href ? h('a.rv-link', { href: sc.href, target: '_blank', rel: 'noopener', text: '결과 보기' }) : null);
    const ct = f.category || {};                       // 분야 · 서비스 설명 · 쓸 수 있는 영상(질문 5) — 승인하면 서비스에 반영
    if (ct.groups || ct.desc || ct.imagery_kinds || f.new_group) {
      row('분야', ct.groups?.length ? h('b', { text: ct.groups.map((g) => catName[g] || '').filter(Boolean).join(' · ') || '—' }) : h('span.rv-dim', { text: '고르지 않음' }),
        f.new_group ? h('small', { text: `새 분야 요청 '${f.new_group}' — 분야 탭에서 만들 수 있습니다` }) : null);
      if (ct.desc) row('서비스 설명', h('span', { text: ct.desc }));
      if (ct.imagery_kinds) row('쓸 수 있는 영상', h('b', { text: ct.imagery_kinds.join(' · ') || '—' }));
    }
    row('메모', h('span', { class: x.memo ? '' : 'rv-dim', text: x.memo || '적지 않음' }));
    return finish(x, dl);
  }
  function finish(x, dl) {
    const head = h('header.rv-h', {}, h('h2', { text: x.service?.name || '' }), units('span.rv-sub', join(`${x.version}판 신청`, x.again ? '고쳐서 다시 신청' : '', x.test ? '시험' : '')));
    const meta = units('p.rv-meta', join(x.by ? `신청 ${x.by}` : '', x.project?.name ? `프로젝트 ${x.project.name}` : '', mdhm(x.at)));
    const kids = [head, meta, dl];
    if (x.state === 'pending' && x.can_decide) {
      const reason = h('input.t-input', { type: 'text', maxlength: '200', placeholder: '사유(거절할 때는 꼭 적습니다)', 'aria-label': '사유' });
      const no = h('button.t-btn.t-btn--2', { type: 'button', text: '거절' });
      const ok = h('button.t-btn', { type: 'button', text: '승인' });
      const note = h('p.rv-need', { role: 'status' });
      const run = async (dec) => {
        if (dec === 'reject' && !reason.value.trim()) { note.textContent = '거절 사유를 적어 주세요 — 신청한 직원에게 이 사유가 보입니다'; reason.focus(); return; }
        ok.disabled = no.disabled = true; note.textContent = '';
        try {
          await api(`/approvals/${encodeURIComponent(x.id)}/decide`, { method: 'POST', body: { decision: dec, reason: reason.value.trim() || undefined } });
          toast(dec === 'approve' ? '승인했습니다 — 기관 공유 탭에서 기관에 공유할 수 있습니다' : '거절했습니다 — 신청한 직원에게 사유가 보입니다');
          await paintReq();
        } catch (e) { note.textContent = e.message || '처리하지 못했습니다'; ok.disabled = no.disabled = false; }
      };
      no.addEventListener('click', () => run('reject')); ok.addEventListener('click', () => run('approve'));
      kids.push(h('div.rv-decide', {}, reason, no, ok), note);
    } else if (x.state === 'pending') {
      kids.push(h('p.rv-note', { text: '내가 올린 신청입니다. 다른 관리자가 승인합니다.' }));
    } else {
      kids.push(h('div.rv-done', { dataset: { st: x.state } }, h('b', { text: x.state_label }), units('span', join(x.decided_by, mdhm(x.decided_at))),
        x.reason ? h('p', {}, h('em', { text: '사유 ' }), h('span', { text: x.reason })) : null,
        x.state === 'approved' ? h('a.rv-link', { href: '#/deploys/share', text: '기관 공유로' }) : null));
    }
    return h('section.t-card.rv-card.rv-detail', {}, ...kids);
  }

  /* ── 기관 공유 ─────────────────────────── */
  async function paintShare() {
    let d;
    try { d = await api('/release/shares'); } catch (e) { panes.share.replaceChildren(h('p.rv-empty', { text: e.message || '기관 공유를 불러오지 못했습니다' })); return; }
    const orgs = d.orgs || [];
    const head = h('tr', {}, h('th', { text: '서비스' }), ...orgs.map((o) => h('th', {}, h('b', { text: o.name }), h('small', { text: o.word }))), h('th'));
    let lastG = null;                                   // 분야 목록 순서로 묶는다(서버가 그 순서로 준다 · 질문 5)
    const rows = (d.items || []).flatMap((s) => { const g = (s.groups || [])[0] || '분야 없음';
      const sep = g !== lastG ? [h('tr.rv-gh', {}, h('th', { colspan: String(orgs.length + 2), scope: 'colgroup', text: g }))] : []; lastG = g;
      return [...sep, shareRow(s)]; });
    function shareRow(s) { return h('tr', {},
      h('td', {}, h('b', { text: s.name }), h('small', { text: join(s.version ? `${s.version}판` : '', s.state_label, (s.groups || []).length > 1 ? `분야 ${s.groups.join(' · ')}` : '') })),
      ...orgs.map((o) => {
        const c = s.cells?.[o.id] || {};
        const inp = h('input', { type: 'checkbox', checked: !!c.shared, disabled: !s.version && !c.shared, title: !s.version && !c.shared ? '승인된 판이 없는 서비스는 공유할 수 없습니다' : null,
          'aria-label': `${s.name} · ${o.name} 공유` });
        const lab = h('small', { text: c.shared ? (c.at ? `${md(c.at)} 공유` : c.year ? `${c.year}년부터` : '공유 중') : '' });
        /* 광역 기관 — 소속 시군구까지 고르기 · 거두기(나중 13 ⓐ). 고르지 않은 시군구 결과는 LX 보관 */
        const sgg = o.wide && o.regions?.length && c.shared
          ? h('button.rv-sgg', { type: 'button', text: `시군구 ${c.sgg ? c.sgg.length : o.regions.length} / ${o.regions.length}`, onclick: () => pickSgg(s, o, c) }) : null;
        inp.addEventListener('change', async () => {
          inp.disabled = true;
          try {
            const r = await api('/release/shares', { method: 'PUT', body: { card_id: s.id, tenant_id: o.id, shared: inp.checked } });
            inp.checked = !!r.shared;
            lab.textContent = r.shared ? `${md(new Date().toISOString())} 공유` : '';
            toast(r.shared ? `${o.name}에 공유했습니다 — 그 기관 '서비스 선택'에 나타납니다` : `${o.name} 공유를 거뒀습니다`);
            if (o.wide) paintShare();                     // 광역 — 시군구 고르기 단추가 나타나거나 사라지게
          } catch (e) { inp.checked = !inp.checked; toast(e.message || '바꾸지 못했습니다'); }
          finally { inp.disabled = false; }
        });
        return h('td.rv-ck', {}, h('label', {}, inp, lab), sgg);
      }),
      h('td.rv-ck-use', {}, s.n ? h('a', { href: '#/deploys/usage', text: '사용 현황' }) : h('span.rv-dim', { text: '—' }))); }
    panes.share.replaceChildren(h('div.rv-grid', {}, h('section.t-card.rv-card', {},
      h('header.rv-h.rv-h--row', {}, h('div', {}, h('h2', { text: '기관 공유' }), units('span.rv-sub', join(`서비스 ${nf(val(d.services))}`, `기관 ${nf(orgs.length)}`))),
        h('p.rv-note', { text: "체크를 바꾸면 바로 그 기관 '서비스 선택'에 나타나거나 사라집니다" })),
      h('table.rv-tbl.rv-tbl--matrix', {}, h('thead', {}, head), h('tbody', {}, ...rows)),
      h('p.rv-note', { text: '광역 기관은 소속 시군구까지 고릅니다. 고르지 않은 시군구 결과와 거둔 공유의 결과 · 기록은 LX가 보관합니다.' }))));
  }

  /* 광역 기관 시군구 고르기 · 거두기(나중 13 ⓐ) — 시도별 묶음 체크 · 전체 · 저장 · 공유 거두기(PUT /release/shares {sgg}) */
  function pickSgg(s, o, c) {
    const on = new Set(c.sgg || o.regions.map((r) => r.code));
    const groups = {};
    for (const r of o.regions) (groups[r.sido || ''] ||= []).push(r);
    const n = h('b.num');
    const save = h('button.t-btn', { type: 'button', text: '저장' });
    const off = h('button.t-btn.t-btn--2', { type: 'button', text: '공유 거두기' });
    const count = () => { n.textContent = `${on.size} / ${o.regions.length}`; save.disabled = !on.size; };
    const boxes = [];
    const body = h('div.rv-sg', {},
      h('p.rv-note', { text: `${o.name}에 '${s.name}'을 어느 시군구까지 보일지 고릅니다. 고르지 않은 시군구 결과는 LX가 보관합니다.` }),
      h('div.rv-sg-top', {}, h('span', {}, '고른 시군구 ', n),
        h('button.rv-link', { type: 'button', text: '모두', onclick: () => { o.regions.forEach((r) => on.add(r.code)); boxes.forEach((b) => { b.checked = true; }); count(); } }),
        h('button.rv-link', { type: 'button', text: '모두 끄기', onclick: () => { on.clear(); boxes.forEach((b) => { b.checked = false; }); count(); } })),
      ...Object.entries(groups).map(([sido, rs]) => h('fieldset.rv-sg-g', {}, h('legend', { text: sido || '시군구' }),
        ...rs.map((r) => { const b = h('input', { type: 'checkbox', checked: on.has(r.code), 'aria-label': r.name });
          b.onchange = () => { b.checked ? on.add(r.code) : on.delete(r.code); count(); }; boxes.push(b);
          return h('label', {}, b, h('span', { text: r.name })); }))),
      h('div.rv-sg-acts', {}, off, save));
    const d = drawer({ title: `${o.name} · ${s.name}`, body, slot: 'right', width: 520 });
    count();
    const put = async (b, msg) => {
      save.disabled = off.disabled = true;
      try { await api('/release/shares', { method: 'PUT', body: { card_id: s.id, tenant_id: o.id, ...b } }); toast(msg); d.close(true); paintShare(); }
      catch (e) { toast(e.message || '바꾸지 못했습니다'); save.disabled = off.disabled = false; count(); }
    };
    save.onclick = () => put({ shared: true, sgg: [...on] }, on.size === o.regions.length ? `${o.name} 관할 전체에 공유합니다` : `${o.name} 시군구 ${on.size}곳까지 공유합니다`);
    off.onclick = () => put({ shared: false }, `${o.name} 공유를 거뒀습니다 — 결과와 기록은 LX가 보관합니다`);
  }

  /* ── 사용 현황 ─────────────────────────── */
  let U = null, orgPick = '', AU = {};
  async function paintUsage() {
    try { U = await api('/release/usage'); } catch (e) { panes.usage.replaceChildren(h('p.rv-empty', { text: e.message || '사용 현황을 불러오지 못했습니다' })); return; }
    AU = {};                              // API 호출(이번 달 · 시험 키 제외) — 같은 기관 × 서비스 줄에 열 하나(원칙 160)
    try { for (const x of (await api('/apikeys/usage')).items || []) AU[x.org + '|' + x.service] = x; } catch { /* 열은 0회 */ }
    drawUsage();
  }
  function apiCell(a) {                  // API 호출 열 — 이번 달 성공 호출 · 켜진 키 · 마지막 호출(ext_api.usage_month)
    const n = val(a?.calls) || 0, k = val(a?.keys) || 0;
    return h('td', {}, n ? h('b.num', { text: `${nf(n)}회` }) : h('span.rv-dim', { text: '0회' }),
      units('small', join(k ? `켜진 키 ${nf(k)}` : '키 없음', a?.last ? `마지막 ${md(a.last)}` : '')));
  }
  function drawUsage() {
    const sel = h('select.t-input', { 'aria-label': '기관' }, h('option', { value: '', text: '모든 기관' }), ...(U.totals || []).map((t) => h('option', { value: t.org.id, text: t.org.name })));
    sel.value = orgPick;
    sel.addEventListener('change', () => { orgPick = sel.value; drawUsage(); });
    const items = (U.items || []).filter((r) => !orgPick || r.org.id === orgPick);
    const rows = items.map((r) => h('tr', {},
      h('td', { text: r.org.name }),
      h('td', {}, h('b', { text: r.service.name }), h('small', { text: r.year ? `${r.year}년부터 공유` : '공유 중' })),
      h('td', {}, val(r.lx_runs) ? h('b.num', { text: `${nf(val(r.lx_runs))}회` }) : h('span.rv-dim', { text: '0회' }),
        val(r.lx_runs) ? units('small', join(km2(r.area), r.lx_last ? `마지막 ${md(r.lx_last)}` : '')) : null),
      h('td', {}, val(r.org_runs) ? h('b.num', { text: `${nf(val(r.org_runs))}회` }) : h('span.rv-dim', { text: '0회' }),
        val(r.org_runs) ? units('small', join(val(r.org_wait) ? `처리 전 ${nf(val(r.org_wait))}건` : '', r.org_last ? `마지막 ${md(r.org_last)}` : '')) : null),
      apiCell(AU[r.org.id + '|' + r.service.id]),
      h('td.num', { text: r.last ? md(r.last) : '—' })));
    const tots = (U.totals || []).filter((t) => !orgPick || t.org.id === orgPick);
    const sm = U.summary || {};
    panes.usage.replaceChildren(h('div.rv-grid', {}, h('section.t-card.rv-card', {},
      h('header.rv-h.rv-h--row', {}, h('div', {}, h('h2', { text: '사용 현황' }),
        units('span.rv-sub', join(`기관에 공유한 서비스 ${nf(val(sm.shared))}건`, `기관 ${nf(val(sm.orgs))}`, `이번 달 분석 ${nf(val(sm.month))}회`))),
        h('label.rv-filter', {}, h('span', { text: '기관' }), sel)),
      items.length ? h('table.rv-tbl.rv-tbl--usage', {}, h('thead', {}, h('tr', {}, ...['기관', '서비스', 'LX가 돌린 분석', '기관이 요청한 분석', 'API 호출', '마지막 사용'].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...rows)) : h('p.rv-empty', { text: '공유된 서비스가 없습니다' }),
      h('div.rv-tot', {}, h('p.t-label', { text: '기관별 합계 · 이번 달' }), h('ul', {}, ...tots.map((t) => h('li', {}, h('b', { text: t.org.name }),
        h('div', {}, units('span', join(`서비스 ${nf(val(t.services))}`, `분석 ${nf(val(t.runs))}회`, t.last ? `마지막 ${md(t.last)}` : '')),
          units('small', join(`XI ChatGEO 요청 이번 달 ${nf(val(t.chat) ?? 0)}건`, val(t.storage) == null ? '' : `저장 공간 ${nf(val(t.storage), 1)}GB`))))))),
      h('p.rv-note', { text: '분석 횟수 · 면적 · 마지막 사용은 분석 작업 기록과 분석 요청 기록에서, API 호출은 이번 달 호출 기록(성공 · 시험 키 제외)에서 셉니다. 기관 합계는 기관 사용량과 같은 값입니다.' }))));
  }

  /* ── 분야(질문 5 · 원칙 165) ─────────────────────────── */
  async function paintCat() {
    let d;
    try { d = await api('/categories'); } catch (e) { panes.cat.replaceChildren(h('p.rv-empty', { text: e.message || '분야를 불러오지 못했습니다' })); return; }
    const items = d.items || [];
    catN.textContent = items.length ? nf(items.length) : '';
    const move = async (i, dir) => {
      const ids = items.map((g) => g.id); const j = i + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      try { await api('/categories/order', { method: 'PUT', body: { ids } }); toast('순서를 바꿨습니다 — 분석하기 거르기 · 기관 공유에 바로 반영됩니다'); paintCat(); }
      catch (e) { toast(e.message || '순서를 바꾸지 못했습니다'); }
    };
    const rename = (g, td) => {
      const nm = h('input.t-input', { type: 'text', maxlength: '20', value: g.name, 'aria-label': '분야 이름' });
      const ds = h('input.t-input', { type: 'text', maxlength: '40', value: g.descr || '', placeholder: '설명(선택)', 'aria-label': '분야 설명' });
      const ok = h('button.t-btn', { type: 'button', text: '저장' }), no = h('button.t-btn.t-btn--2', { type: 'button', text: '그만' });
      const save = async () => {
        ok.disabled = true;
        try { await api(`/categories/${encodeURIComponent(g.id)}`, { method: 'PATCH', body: { name: nm.value.trim(), descr: ds.value.trim() } }); toast('분야를 고쳤습니다'); paintCat(); }
        catch (e) { toast(e.message || '고치지 못했습니다'); ok.disabled = false; }
      };
      ok.onclick = save; no.onclick = () => paintCat();
      nm.onkeydown = (e) => { if (e.key === 'Enter') save(); };
      td.replaceChildren(h('div.rv-cat-edit', {}, nm, ds, no, ok)); nm.focus(); nm.select();
    };
    const rows = items.map((g, i) => {
      const nameTd = h('td.rv-cat-nm', {}, h('b', { text: g.name }), g.descr ? h('small', { text: g.descr }) : null);
      return h('tr', {},
        h('td.rv-cat-ord', {}, h('button.rv-ab', { type: 'button', disabled: i === 0 || undefined, 'aria-label': `${g.name} 위로`, text: '↑', onclick: () => move(i, -1) }),
          h('button.rv-ab', { type: 'button', disabled: i === items.length - 1 || undefined, 'aria-label': `${g.name} 아래로`, text: '↓', onclick: () => move(i, 1) })),
        nameTd,
        h('td', {}, g.services?.length ? h('span.rv-svc', {}, ...g.services.map((n) => h('span', { text: n }))) : h('span.rv-dim', { text: '아직 서비스가 없습니다' })),
        h('td.num', { text: nf(g.n || 0) }),
        h('td', {}, h('button.rv-link', { type: 'button', text: '이름 바꾸기', onclick: () => rename(g, nameTd) })));
    });
    const nm = h('input.t-input', { type: 'text', maxlength: '20', placeholder: '새 분야 이름', 'aria-label': '새 분야 이름' });
    const mk = h('button.t-btn', { type: 'button', text: '새 분야 만들기' });
    const create = async (name, request_id) => {
      if (!String(name || '').trim()) { nm.focus(); return; }
      mk.disabled = true;
      try { await api('/categories', { method: 'POST', body: { name: String(name).trim(), request_id } }); toast(`'${String(name).trim()}' 분야를 만들었습니다`); paintCat(); }
      catch (e) { toast(e.message || '만들지 못했습니다'); mk.disabled = false; }
    };
    mk.onclick = () => create(nm.value);
    nm.onkeydown = (e) => { if (e.key === 'Enter') create(nm.value); };
    const reqs = d.requests || [], log = d.log || [];
    const closeReq = async (r) => {
      try { await api(`/categories/requests/${r.id}/close`, { method: 'POST' }); toast('요청을 닫았습니다'); paintCat(); }
      catch (e) { toast(e.message || '닫지 못했습니다'); }
    };
    const left = h('section.t-card.rv-card', {},
      h('header.rv-h', {}, h('h2', { text: '분야 목록' }), h('span.rv-sub', { text: '분석하기 거르기 · 서비스 카드 · 기관 공유가 이 순서를 따릅니다' })),
      h('table.rv-tbl.rv-tbl--cat', {}, h('thead', {}, h('tr', {}, ...['순서', '분야', '서비스', '수', ''].map((t) => h('th', { text: t })))), h('tbody', {}, ...rows)),
      h('div.rv-cat-new', {}, nm, mk, h('p.rv-note', { text: '서비스가 하나도 없는 분야는 분석하기에 나오지 않습니다' })));
    const right = h('div.rv-cat-side', {},
      h('section.t-card.rv-card', {}, h('header.rv-h', {}, h('h2', { text: '직원이 요청한 새 분야' }), h('span.rv-sub', { text: '배포 신청서에서' })),
        reqs.length ? h('ul.rv-hist', {}, ...reqs.map((r) => h('li', {}, h('small.num', { text: md(r.at) }),
          h('div', {}, h('b', { text: r.name }), units('span', join(r.service || r.project, r.by)),
            h('span.rv-hist-acts', {}, h('button.rv-link', { type: 'button', text: '만들기', onclick: () => create(r.name, r.id) }),
              h('button.rv-link', { type: 'button', text: '닫기', onclick: () => closeReq(r) }))))))
          : h('p.rv-empty', { text: '요청한 새 분야가 없습니다' })),
      h('section.t-card.rv-card', {}, h('header.rv-h', {}, h('h2', { text: '바뀐 기록' })),
        log.length ? h('ul.rv-hist', {}, ...log.map((r) => h('li', {}, h('small.num', { text: md(r.at) }), h('div', {}, h('span', { text: r.text }), r.by ? h('small', { text: r.by }) : null))))
          : h('p.rv-empty', { text: '아직 바뀐 기록이 없습니다' })));
    panes.cat.replaceChildren(h('div.rv-grid.rv-grid--cat', {}, left, right));
  }

  function paint() {
    if (root.hidden) return;
    if (tab === 'req') paintReq();
    else if (tab === 'share') paintShare();
    else if (tab === 'usage') paintUsage();
    else if (tab === 'cat') paintCat();
    else if (tab === 'imp') board.load();
    else if (tab === 'api') keys.load();
  }
  set(want());
  board.load({ quiet: true });          // 탭 숫자(새로 옴)만 먼저
  return { paint, show: set };
}
