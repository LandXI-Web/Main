/* 부서별 관할 — 광역 기관 관리자만(나중 16 채택 · 원칙 39 계정 범위 밖 0을 부서까지).
   도 부서는 관할 전체, 시군 부서는 그 시군만. 부서 사용자가 다음에 화면을 열 때부터 지역 · 결과 · 필지 · 요청이 그 시군으로 좁혀진다(서버가 자른다).
   값 = GET /spaces/me/dept-scope · 바꾸기 = PUT /spaces/me/dept-scope {dept, sgg|null}(처리 기록). 광역이 아닌 기관에는 칸이 생기지 않는다. */
import { h, api } from '../kit/util.js';
import { toast } from '../kit/index.js';

export async function mountDeptScope(host) {
  let d;
  try { d = await api('/spaces/me/dept-scope'); } catch { return null; }
  if (!d.wide) return null;
  const sec = h('section.acc-card.ds', { 'aria-label': '부서별 관할' });
  host.append(sec);
  const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
  function paint() {
    const groups = {};
    for (const r of d.regions) (groups[r.sido || ''] ||= []).push(r);
    const rows = d.depts.map((x) => {
      const sel = h('select.t-input.ds-sel', { 'aria-label': `${x.dept} 관할` }, h('option', { value: '', text: '관할 전체(도 부서)' }),
        ...Object.entries(groups).map(([sido, rs]) => h('optgroup', { label: sido || '시군구' }, ...rs.map((r) => h('option', { value: r.code, text: r.name })))));
      sel.value = x.sgg?.length === 1 ? x.sgg[0] : '';
      sel.onchange = async () => {
        sel.disabled = true;
        try {
          await api('/spaces/me/dept-scope', { method: 'PUT', body: { dept: x.dept, sgg: sel.value ? [sel.value] : null } });
          toast(sel.value ? `${x.dept} — ${sel.options[sel.selectedIndex].text}만 봅니다` : `${x.dept} — 관할 전체를 봅니다`);
          d = await api('/spaces/me/dept-scope'); paint();
        } catch (e) { toast(e.message || '바꾸지 못했습니다'); sel.disabled = false; }
      };
      return h('tr', {}, h('td', {}, h('b', { text: x.dept })), h('td.num', { text: `${val(x.users) ?? 0}명` }), h('td', {}, sel),
        h('td.ds-w', { text: x.sgg && x.sgg.length > 1 ? x.words : '' }));
    });
    sec.replaceChildren(
      h('h2.ds-h', {}, '부서별 관할', h('small', { text: '도 부서는 관할 전체, 시군 부서는 그 시군만 봅니다' })),
      d.depts.length ? h('table.ds-t', {}, h('thead', {}, h('tr', {}, ...['부서', '사용자', '볼 수 있는 지역', ''].map((t) => h('th', { text: t })))), h('tbody', {}, ...rows))
        : h('p.ds-n', { text: '부서를 적은 사용자가 아직 없습니다' }),
      h('p.ds-n', { text: `부서를 적지 않은 사용자 ${val(d.no_dept) ?? 0}명은 관할 전체를 봅니다. 기관 관리자는 늘 관할 전체입니다.` }));
  }
  paint();
  const css = document.createElement('style');
  css.textContent = `.ds{margin-top:24px;padding:20px 24px;background:var(--bg-1);border-radius:16px}.ds-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 12px;font:700 20px/28px var(--font-display);color:var(--ink)}
.ds-h small{font:400 13px/18px var(--font-body);color:var(--sub)}.ds-t{width:100%;border-collapse:collapse}.ds-t th{text-align:left;padding:8px;font:500 13px/18px var(--font-body);color:var(--sub);border-bottom:1px solid var(--rule)}
.ds-t td{padding:10px 8px;border-bottom:1px solid var(--rule);font:400 15px/20px var(--font-body);color:var(--ink)}.ds-sel{height:40px;max-width:280px}.ds-w{font-size:13px;color:var(--sub)}
.ds-n{margin:10px 0 0;font:400 13px/20px var(--font-body);color:var(--sub)}`;
  document.head.append(css);
  return sec;
}
