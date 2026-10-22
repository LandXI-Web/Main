/* change-dash.js — 기관 서비스 대시보드: 국토 변화 분석서비스(10-22 CHANGE-DEMO §7 8단계). 공유받은 대상지마다 — 무엇(대상지 · 두 해) ·
   얼마(구역선 안 변화 건수 · 유형별) · 판정 현황(미확인 · 현장확인 · 불법 · 적법 · 철거완료) · 할 일(현장점검 · 보고서).
   값 = 서버 한 출처 GET /change/shared(기관 = 공유받은 대상지만 · RLS) — LX 지도 서비스 카드 · 보고서와 같은 값. 지역 고정값 0. */
import { h, api } from './util.js';
import { empty } from './empty.js';

const TYPES = [['신축', '#F04452'], ['소실', '#6B7684'], ['경작 전환', '#0FA9A0'], ['포장 확대', '#FF9F1C']];
const STATUSES = [['미확인', '#B0B8C1'], ['현장확인', '#3182F6'], ['불법', '#F04452'], ['적법', '#0FA9A0'], ['철거완료', '#4E5968']];
const nf = (v) => Number(v ?? 0).toLocaleString('ko-KR');
const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
let cssOn = false;
function ensureCss() { if (cssOn) return; cssOn = true; document.head.append(h('link', { rel: 'stylesheet', href: new URL('./change-dash.css', import.meta.url).href })); }

export async function renderChangeDash({ page, head, title = '국토 변화 분석서비스', crumb = null }) {
  ensureCss();
  page.append(head({ title, sub: '두 해 국토지리정보원 항공영상을 비교해 구역선 안에서 바뀐 곳을 찾고, 현장 확인 · 판정까지 이어 봅니다.', crumb }));
  const box = h('div.cd-list');
  page.append(box);
  let items = [];
  try { items = (await api('/change/shared')).items || []; } catch (e) { console.debug('change shared', e); }
  if (!items.length) { empty(box, { kind: 'first', title: '아직 공유받은 대상지가 없습니다', text: 'LX 가 변화 탐지 결과를 공유하면 여기에 보입니다' }); return; }
  for (const it of items) {
    const s = it.stats || {}, bt = s.by_type || {}, mk = it.marks || {};
    const nTot = STATUSES.reduce((a, [k]) => a + (val(mk[k]) || 0), 0) || 1;
    const bar = h('div.cd-bar', { role: 'img', 'aria-label': '판정 현황 ' + STATUSES.map(([k]) => `${k} ${nf(val(mk[k]))}건`).join(' · ') },
      ...STATUSES.map(([k, c]) => (val(mk[k]) ? h('i', { style: `width:${(100 * val(mk[k])) / nTot}%;background:${c}`, title: `${k} ${nf(val(mk[k]))}건` }) : null)).filter(Boolean));
    box.append(h('section.cd-card', {},
      h('p.cd-k', { text: `${it.period?.a?.year}년 → ${it.period?.b?.year}년 항공영상 비교` }),
      h('h2.cd-t', { text: it.name }),
      h('div.cd-big', {}, h('span', { text: '구역선 안 변화' }), h('b', { text: `${nf(val(s.n_in))}건` }), h('small', { text: `구역선 밖(버퍼) ${nf(val(s.n_out))}건` })),
      h('ul.cd-types', {}, ...TYPES.map(([t, c]) => (bt[t] ? h('li', {}, h('i', { style: `background:${c}` }), h('span', { text: t }), h('b', { text: `${nf(val(bt[t].in))}건` })) : null)).filter(Boolean)),
      h('p.cd-sub', { text: '판정 현황' }), bar,
      h('ul.cd-sts', {}, ...STATUSES.map(([k, c]) => h('li', {}, h('i', { style: `background:${c}` }), h('span', { text: k }), h('b', { text: `${nf(val(mk[k]))}건` })))),
      h('p.cd-why', { text: '구역선 안에서 새로 생긴 건물 · 포장 · 경작 전환은 무단 점용 여부를 현장에서 확인할 대상입니다.' }),
      h('div.cd-acts', {}, h('a.t-btn', { href: '/landxi/v3/change-field/?' + new URLSearchParams({ job: it.job_id }), text: '현장점검' }),
        h('a.t-btn.t-btn--2', { href: '/landxi/v3/change-report/?' + new URLSearchParams({ job: it.job_id }), text: '보고서' }))));
  }
}
