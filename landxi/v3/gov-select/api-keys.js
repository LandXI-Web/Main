/* 기관 정보 → '받은 API 키' — 기관 관리자만 · 보기만(원칙 178 — 키는 LX 관리자가 만들고 관리 · 기관 관리자 발급 아님).
   우리 기관의 다른 시스템이 공유받은 서비스의 AI 분석 결과를 가져갈 때 쓰는 키 목록. 키 값은 보이지 않는다(만들 때 LX가 한 번만 전함 · 끝 네 자리만).
   서버: GET /spaces/me/apikeys(자기 기관 것만 · 폐기한 키 제외). 아이콘 0. */
import { h } from '../kit/util.js';
import { api } from '../../shared/api-v1.js';

const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const ymd = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
const mdhm = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const nf = (n) => Number(n || 0).toLocaleString('ko-KR');

export async function apiKeysSection() {
  const sec = h('section.bf-sec.gk', { 'aria-label': '받은 API 키' });
  let d;
  try { d = await api('/spaces/me/apikeys'); } catch { return null; }
  const items = d.items || [];
  sec.append(h('h3', { text: '받은 API 키' }),
    h('p.gk-note', { text: '우리 기관의 다른 시스템이 공유받은 서비스의 AI 분석 결과를 가져갈 때 쓰는 키입니다. 키는 LX 관리자가 만들고 관리합니다.' }));
  if (!items.length) {
    sec.append(h('p.gk-empty', { text: '받은 API 키가 없습니다. 다른 시스템과 이어야 하면 LX 담당자에게 요청해 주세요.' }));
    return sec;
  }
  sec.append(h('div.gk-wrap', {}, h('table.gk-tbl', {},
    h('thead', {}, h('tr', {}, ...['서비스', '쓰는 시스템', '상태', '끝나는 날', '마지막 호출', '이번 달'].map((t) => h('th', { text: t })))),
    h('tbody', {}, ...items.map((k) => h('tr', {},
      h('td', {}, h('b', { text: k.service?.name || '' })),
      h('td', {}, h('span', { text: k.label }), h('small', { text: `끝 네 자리 ${k.last4}${k.test ? ' · 시험' : ''}` })),
      h('td', {}, h('span.gk-st', { dataset: { st: k.state }, text: k.state_label })),
      h('td.num', { text: ymd(k.expires_at) }),
      h('td.num', { text: k.last_used_at ? mdhm(k.last_used_at) : '—' }),
      h('td.num', { text: `${nf(val(k.month))}회` })))))),
    h('p.gk-note', { text: '키 값은 여기에 보이지 않습니다. 잃어버렸거나 멈추고 싶으면 LX 담당자에게 알려 주세요.' }));
  return sec;
}
