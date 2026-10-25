/* 두 시기 비교 분석서비스 — 이 카드로 분석(오른쪽 칸 · 10-24 사용자 "생육기 생산기 카드 각각, 비교 분석 하는 카드 하나 더").
   직원이 이 카드 안에서 끝낸다: ① 생육기 결과 ② 생산기 결과(③ 곤포사일리지 결과 — 고르면 '수확·곤포 확인'을 가른다) → 견주기.
   결과마다 그 시기 분석서비스에서 영상을 골라(공유 데이터에서 고르기 · 내 영상 업로드) 먼저 분석한다 — 끝난 결과만 고를 수 있다(새 업로드 칸을 만들지 않는다).
   견주는 일은 서버(POST /cards/{카드}/compare — 두 결과가 모두 덮는 곳의 필지마다 · CPU) · 결과는 내 분석으로 남고 지도 서비스에서 본다(원칙 337 · 카드에는 '지도 서비스에서 보기'만).
   시기별 원천 카드는 서버 카드 정의(c.pair)에서 — 카드 · 작업 id 는 고르기 값으로만(화면 글자에 없음). */
import * as K from '../kit/index.js';
import { h, api } from '../kit/util.js';

const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };

/* 지역 · 영상 이름 — 영상 이름이 지역 이름으로 시작하면 한 번만(남원시 남원시 … 반복 없앰) */
const where = (it) => (it.imagery && it.region && it.imagery.startsWith(it.region) ? it.imagery : [it.region, it.imagery].filter(Boolean).join(' '));

function ensureCss() {
  if (document.querySelector('link[data-la-cmp]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./compare-panel.css', import.meta.url).href, dataset: { laCmp: '1' } }));
}

export async function comparePanel(side, c, body) {
  ensureCss();
  side.classList.add('t-card', 'la-cmp');
  side.append(h('h2.la-side-h', { text: '이 카드로 분석' }));
  const step = (n, title, small) => h('div.la-step', {}, h('i', { text: String(n) }), h('b', { text: title }), small ? h('small', { text: small }) : null);
  const box = h('div');
  side.append(box);
  K.empty(box, { kind: 'loading', compact: true });
  let R;
  try { R = await api(`/cards/${encodeURIComponent(c.id)}/compare/results`); } catch (e) {
    box.replaceChildren(h('p.la-cant', { text: '고를 수 있는 결과를 불러오지 못했습니다' }));
    return;
  }
  box.remove();
  const sel = {};
  const order = [['growth', '생육기 결과', '봄 · 초여름 촬영'], ['production', '생산기 결과', '여름 · 가을 촬영'], ['silage', '곤포사일리지', '고르면 수확·곤포를 가립니다(선택)']];
  let n = 0;
  for (const [k, title, small] of order) {
    const s = R.seasons?.[k];
    if (!s) continue;
    side.append(step(++n, title, small));
    const go = h('a.la-cmp-go', { href: `./?card=${encodeURIComponent(s.card)}#analyze`, text: `${s.card_name || s.label}에서 영상으로 분석하기 →` });
    if (!(s.items || []).length) {
      side.append(h('p.la-cmp-none', { text: `아직 끝난 ${s.label} 분석이 없습니다. 같은 곳을 찍은 드론 영상을 공유 데이터에서 고르거나 내 영상을 업로드해 먼저 분석해 주세요.` }), go);
      continue;
    }
    const opt = (it) => h('option', { value: it.job, text: [where(it), it.when, it.finished_at ? `${ymd(it.finished_at)} 분석` : ''].filter(Boolean).join(' · ') });
    const sl = h('select.t-input', { 'aria-label': title }, k === 'silage' ? h('option', { value: '', text: '고르지 않음' }) : h('option', { value: '', text: '결과를 고르세요' }), ...s.items.map(opt));
    sl.addEventListener('change', () => { sel[k] = sl.value; btn.disabled = !(sel.growth && sel.production); });
    side.append(sl, go);
  }
  const btn = h('button.t-btn.la-go', { type: 'button', text: '견주기', disabled: true });
  const msg = h('p.la-note', { text: `두 결과가 모두 덮는 곳의 필지마다 견줍니다. ${R.rule?.text ? R.rule.text + '.' : ''}` });
  const st = h('p.la-cmp-st', { role: 'status', hidden: true });
  side.append(btn, st, msg);

  /* 견준 결과는 카드에 그리지 않는다 — 내 분석 결과로 남고 지도 서비스 '내 분석'에서 본다(10-25 원칙 337 "분석 서비스에서 돌린 결과는 … 지도 서비스에서 보는건데") */
  btn.addEventListener('click', async () => {
    btn.disabled = true; st.hidden = false; st.replaceChildren('견주는 중…');
    let d;
    try { d = await K.during(api(`/cards/${encodeURIComponent(c.id)}/compare`, { method: 'POST', body: { growth: sel.growth, production: sel.production, silage: sel.silage || '' } })); } catch (e) {
      st.replaceChildren(e?.message || '견주지 못했습니다'); btn.disabled = false; return;
    }
    btn.disabled = false;
    const href = `../lx-map/?${new URLSearchParams({ job: d.job_id })}`;
    st.replaceChildren(h('span', { text: '견주기를 마쳤습니다 · ' }), h('a', { href, text: '지도 서비스에서 보기' }));
    K.toast('견주기를 마쳤습니다 · 결과는 지도 서비스에 쌓입니다', { action: { label: '지도 서비스', href } });
  });
}
