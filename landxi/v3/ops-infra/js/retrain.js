/* LX 관리자 → 배포 → 'XI 재학습' · '학습 서식' 탭(결정 4 ⓐ · 원칙 213 · 학습 서식 ⓑ · 10-12 12:45 확인).
   XI 재학습: 언제 학습하나(쉬는 시간 자동 기본 / 사람이 누를 때만) · 쉬는 시간대 · 기준 → 분석서비스마다 줄(지금 판 · 학습 데이터 · 기준 · 방식 · 상태)
              → 새 클래스 갈 곳(세부 = 위 클래스 서비스의 나누기 학습 · 새 물체 = 새 모델 프로젝트 후보) → 오늘 밤 순서.
              학습은 쉬는 시간에 학습 장비 한 장 대기열로만(전국 분석 등 다른 고부하 작업이 있으면 다음 차례 — 서버 스케줄러).
              새 판은 나아진 경우만 배포 신청 후보. 신청 · 승인은 사람.
   학습 서식: '기본' 하나(블록 · 학습 설정 첫 값 · 10-13 학습서식-기본하나 — 업무별 고르기 없앰) — 직원 학습 화면이 처음 열 때 놓이는 흐름. 바꿀 수 없는 것은 잠금 줄.
   문구(10-13 원칙 235 · 사용자 말 그대로): 안내 한 줄 '수정된 부분은 학습 데이터로 저장됩니다.' · 칸 머리 '학습 데이터' · 숫자 '수정된 부분 n장'. 이 밖의 덧말 뺌.
   숫자는 서버 봉투(GET /retrain · /train-templates). 아이콘 0 · 'GPU' 글자 0(학습 장비). */
import { toast, h, api, nf } from './kit.js';

const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const mdhm = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const pct = (e) => (val(e) == null ? '—' : `${nf(val(e))}%`);

let css = false;
function sheet() {
  if (css) return; css = true;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('../retrain.css', import.meta.url).href }));
}

export function retrainPane(root) {
  sheet();
  let R = null;
  async function load() {
    try { R = await api('/retrain'); } catch (e) { root.replaceChildren(h('p.rv-empty', { text: e?.message || 'XI 재학습을 불러오지 못했습니다' })); return; }
    draw();
  }
  async function putSettings(body) {
    try { await api('/retrain/settings', { method: 'PUT', body }); toast('바꿨습니다'); load(); } catch (e) { toast(e?.message || '바꾸지 못했습니다'); }
  }
  function draw() {
    const st = R.settings, man = R.can_manage;
    /* ── 언제 학습하나 ── */
    const seg = h('div.rt-seg', { role: 'group', 'aria-label': '학습 방식' }, ...[['auto', '쉬는 시간에 자동'], ['manual', '사람이 누를 때만']].map(([k, t]) =>
      h('button', { type: 'button', 'aria-pressed': String(st.mode === k), disabled: !man || undefined, text: t, onclick: () => st.mode !== k && putSettings({ mode: k }) })));
    const qs = h('input.rt-in', { type: 'time', value: st.quiet_start, disabled: !man || undefined, 'aria-label': '쉬는 시간 시작' });
    const qe = h('input.rt-in', { type: 'time', value: st.quiet_end, disabled: !man || undefined, 'aria-label': '쉬는 시간 끝' });
    const wk = h('input', { type: 'checkbox', checked: st.weekend || undefined, disabled: !man || undefined });
    const mn = h('input.rt-in.rt-num', { type: 'number', min: '1', value: String(val(st.min_new)), disabled: !man || undefined, 'aria-label': '재학습 기준' });
    const save = h('button.t-btn.t-btn--2', { type: 'button', text: '저장', hidden: !man || undefined,
      onclick: () => putSettings({ quiet_start: qs.value, quiet_end: qe.value, weekend: wk.checked, min_new: +mn.value }) });
    const when = h('section.t-card.rv-card', {},
      h('header.rv-h', {}, h('h2', { text: '언제 학습하나' })),
      h('div.rt-when', {}, seg,
        h('div.rt-kv', {},
          h('label', {}, h('span', { text: '쉬는 시간' }), h('span.rt-pair', {}, qs, '–', qe)),
          h('label.rt-ck', {}, wk, h('span', { text: '주말 하루 종일' })),
          h('label', {}, h('span', { text: '기준' }), h('span.rt-pair', {}, mn, '장')),
          save)),
      h('p.rv-note', { text: '수정된 부분은 학습 데이터로 저장됩니다.' }),
      h('p.rv-note', { text: R.busy ? '지금 학습 장비를 쓰는 다른 작업이 있어, 학습은 그 뒤 차례입니다.' : R.quiet_now ? '지금은 쉬는 시간입니다.' : '지금은 쉬는 시간이 아닙니다.' }));

    /* ── 분석서비스별 ── */
    const rows = (R.services || []).map((x) => {
      const n = val(x.units), need = val(x.min_new) || 1;
      const modeSel = man ? h('select.rt-in', { 'aria-label': `${x.service} 방식`, onchange: async (e) => {
        try { await api(`/retrain/services/${encodeURIComponent(x.card_id)}`, { method: 'PUT', body: { mode: e.target.value } }); toast(`${x.service} — ${e.target.value === 'auto' ? '쉬는 시간 자동' : '수동'}`); load(); }
        catch (er) { toast(er?.message || '바꾸지 못했습니다'); }
      } }, h('option', { value: 'auto', text: '쉬는 시간 자동', selected: x.mode === 'auto' || undefined }), h('option', { value: 'manual', text: '수동', selected: x.mode === 'manual' || undefined }))
        : h('span', { text: x.mode === 'auto' ? '쉬는 시간 자동' : '수동' });
      const vd = x.verdict;
      const now = h('button.t-btn.t-btn--2', { type: 'button', text: '지금 학습', disabled: n < 1 || x.tone === 'live' || undefined,
        title: n < 1 ? '수정된 부분 0장' : '', onclick: () => trainNow(x) });
      return h('tr', {},
        h('td', {}, h('b', { text: `${x.service} · ${x.version}` }), x.project ? h('small', { text: x.project.name }) : h('small', { text: '프로젝트 없음' })),
        h('td', {}, h('span.rv-bar', {}, h('i', { style: `width:${Math.min(100, Math.round(n / need * 100))}%` })), h('small.num', { text: `${nf(n)} / ${nf(need)}장` })),
        h('td', {}, ...(x.split.length ? x.split.map((c) => h('span.rt-cls', { text: `${c.name} · 나누기` })) : ['—'])),
        h('td', {}, modeSel),
        h('td', {}, h('span.rt-st', { dataset: { tone: x.tone || '' }, text: x.state }),
          vd && vd.value ? h('small', { text: `최근 다시 학습 ${pct(vd.value)} · 지금 판 ${pct(vd.base)}` }) : null,
          vd?.memory ? h('small', { text: `삭제한 자리 ${nf(val(vd.memory.places))}곳 중 다시 잡은 곳 ${nf(val(vd.memory.again))}곳` }) : null),   // 원칙 243
        h('td.rt-do', {}, x.tone === 'ok' && x.project ? h('a.t-btn', { href: `/landxi/v3/lx-release/?project=${encodeURIComponent(x.project.id)}&stage=publish`, text: '배포 신청 보기' }) : now));
    });
    const svc = h('section.t-card.rv-card', {},
      h('header.rv-h', {}, h('h2', { text: '분석서비스별' })),
      rows.length ? h('div.rt-tbl-w', {}, h('table.rv-tbl.rt-tbl', {}, h('thead', {}, h('tr', {}, ...['분석서비스 · 지금 판', '학습 데이터', '새 클래스', '방식', '상태', ''].map((t) => h('th', { text: t })))), h('tbody', {}, ...rows)))
        : h('p.rv-empty', { text: '다시 학습할 수 있는 분석서비스가 없습니다' }));

    /* ── 새 물체 → 새 모델 프로젝트 후보 ── */
    const cands = (R.candidates || []);
    const cand = h('section.t-card.rv-card', {},
      h('header.rv-h', {}, h('h2', { text: '새 모델 프로젝트 후보' })),
      cands.length ? h('ul.rt-list', {}, ...cands.map((c) => h('li', {}, h('b', { text: c.name }), c.test ? h('span.rv-test', { text: '시험' }) : null, h('span.rv-sub', { text: `수정된 부분 ${nf(val(c.tiles) ?? 0)}장` }),
        h('a.rv-link', { href: '/landxi/v3/lx-project/', text: '프로젝트 만들기' }))))
        : h('p.rv-empty', { text: '아직 없습니다' }));

    /* ── 오늘 밤 순서 ── */
    const tn = R.tonight || [];
    const night = h('section.t-card.rv-card', {},
      h('header.rv-h', {}, h('h2', { text: '오늘 밤 순서' }), h('span.rv-sub', { text: `${st.quiet_start}–${st.quiet_end}` })),
      tn.length ? h('ol.rt-night', {}, ...tn.map((t) => h('li', {}, h('b', { text: t.service }), h('span', { text: t.what }))))
        : h('p.rv-empty', { text: '오늘 밤 학습할 서비스가 없습니다 — 기준에 닿은 서비스가 없습니다' }),
      R.last_tick ? h('p.rv-note', { text: `마지막 확인 ${mdhm(R.last_tick)} · 5분마다` }) : null,
      (R.runs || []).length ? h('ul.rt-runs', {}, ...R.runs.map((r) => h('li', {}, h('small.num', { text: mdhm(r.at) }), h('span', { text: `${r.service} · ${r.mode === 'split' ? '나누기' : '다시 학습'} · ${r.state === 'queued' ? '대기열에 넣음' : r.state === 'held' ? `미룸(${r.why || ''})` : '시험'}` }), r.test ? h('span.rv-test', { text: '시험' }) : null))) : null);

    root.replaceChildren(h('div.rt-col', {}, when, svc, cand, night));
  }
  async function trainNow(x) {
    try {
      const j = await api(`/retrain/services/${encodeURIComponent(x.card_id)}/now`, { method: 'POST', body: {} });
      const r = j.decision?.result || {};
      toast(r.state === 'queued' ? `${x.service} 학습을 대기열에 넣었습니다` : `${x.service} — ${r.why || '대기열에 넣지 못했습니다'}`, { ms: 6000 }); load();
    }
    catch (e) { toast(e?.message || '지금은 학습을 넣을 수 없습니다', { ms: 6000 }); }
  }
  return { load };
}

const BW = { data: '학습 데이터', base: '기반 모델', cfg: '학습 설정', train: '학습', eval: '추론', deploy: '배포 신청' };   // 10-13 '평가' → '추론' · '추론 시험'은 '추론'과 하나로(직원 학습 화면과 같은 이름)

export function templatePane(root) {
  sheet();
  let T = null;
  const task = '기본';                                    // 학습 서식은 '기본' 하나(10-13 · 옛 업무별 값은 서버에 그대로 · 쓰지 않음)
  async function load() {
    try { T = await api('/train-templates'); } catch (e) { root.replaceChildren(h('p.rv-empty', { text: e?.message || '학습 서식을 불러오지 못했습니다' })); return; }
    draw();
  }
  function draw() {
    const man = T.can_manage;
    const cur = T.items[task];
    const on = new Set(cur.blocks);
    const boxes = T.blocks.filter((b) => BW[b]).map((b) => {
      const must = T.must.includes(b);
      const ck = h('input', { type: 'checkbox', checked: on.has(b) || undefined, disabled: must || !man || undefined, dataset: { b } });
      return h('label.rt-ck.rt-blk', {}, ck, h('span', { text: BW[b] || b }), must ? h('small', { text: '빠질 수 없음' }) : null);
    });
    const p = cur.params || {}, cap = T.caps?.params || {};
    const ep = h('input.rt-in.rt-num', { type: 'number', min: '1', max: String(cap.epochs || 50), value: String(p.epochs || 3), disabled: !man || undefined, 'aria-label': '반복 횟수' });
    const sz = h('select.rt-in', { disabled: !man || undefined, 'aria-label': '이미지 크기' }, ...(cap.imgsz || [640, 1280]).map((x) => h('option', { value: String(x), text: String(x), selected: x === p.imgsz || undefined })));
    const bt = h('select.rt-in', { disabled: !man || undefined, 'aria-label': '한 번에' }, ...(cap.batch || [4, 8]).map((x) => h('option', { value: String(x), text: `${x}장`, selected: x === p.batch || undefined })));
    const save = h('button.t-btn', { type: 'button', text: '저장', onclick: async () => {
      const blocks = [...root.querySelectorAll('.rt-blk input')].filter((i) => i.checked).map((i) => i.dataset.b);
      try { await api(`/train-templates/${encodeURIComponent(task)}`, { method: 'PUT', body: { blocks, params: { epochs: +ep.value, imgsz: +sz.value, batch: +bt.value } } }); toast('기본 흐름을 저장했습니다'); load(); }
      catch (e) { toast(e?.message || '저장하지 못했습니다'); }
    } });
    root.replaceChildren(h('div.rt-col', {}, h('section.t-card.rv-card', {},
      h('header.rv-h', {}, h('h2', { text: '학습 서식' })),
      h('div', {}, h('p.t-label', { text: '블록' }), h('div.rt-blks', {}, ...boxes)),
      h('div.rt-kv', {}, h('label', {}, h('span', { text: '반복 횟수' }), h('span.rt-pair', {}, ep, '회')), h('label', {}, h('span', { text: '이미지 크기' }), sz), h('label', {}, h('span', { text: '한 번에' }), bt)),
      h('p.rv-note', { text: `바꿀 수 없는 것(직원) — ${T.locked.join(' · ')}` }),
      man ? h('div.rt-act', {}, save) : null)));
  }
  return { load };
}
