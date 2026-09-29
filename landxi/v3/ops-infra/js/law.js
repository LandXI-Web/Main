/* 법령 색인 칸(LX 관리자 화면 · 인프라) — 법령 원문 올리기 · 색인 만들기 · 상태(법령 수 · 조문 수 · 마지막 색인 시각).
   원문 = 국가법령정보센터 공개 원문(XML · HTML · 텍스트). 명령줄 단계 0. 기능이 보이는 최소 모양(모양은 디자인 차수에서).
   export function mountLaw(host) — infra.js 가 #law 칸에 붙인다. */
import { api, esc, toast, devlog } from './kit.js';
import { API, session } from '../../../shared/api-v1.js';

const vv = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);   // 숫자 봉투(값 · 꼬리표)
const nf = (v) => (vv(v) == null ? '—' : Number(vv(v)).toLocaleString('ko-KR'));
const when = (iso) => {
  if (!iso) return '색인 전';
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const CSS = `
.law-c{display:flex;flex-direction:column;gap:12px}
.law-c .row b small{font:400 12px/1 var(--font-body);color:var(--sub);margin-left:2px}
.law-c{gap:10px}
.law-d summary{cursor:pointer;font:500 13px/1.4 var(--font-body);color:var(--sub)}
.law-l{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto}
.law-l li{display:flex;justify-content:space-between;gap:8px;font:400 13px/1.35 var(--font-body);color:var(--ink)}
.law-l li small{flex:none;font:400 12px/1.35 var(--font-num);color:var(--sub)}
.law-b{display:flex;gap:8px;flex-wrap:wrap}
.law-b input{display:none}
`;

export function mountLaw(host) {
  if (!document.getElementById('law-css')) {
    const st = document.createElement('style'); st.id = 'law-css'; st.textContent = CSS; document.head.append(st);
  }
  host.innerHTML = `<div class="law-c">
    <p class="row"><span>법령 색인</span><b class="num" id="law-n" data-metric="법령 색인">—</b></p>
    <p class="row sub"><span>조문 · 마지막 색인</span><b class="num"><span id="law-a">—</span> · <span id="law-t">—</span></b></p>
    <p class="row sub" id="law-p" hidden><span>색인 전 파일</span><b class="num" id="law-pn">—</b></p>
    <details class="law-d"><summary>법령 목록</summary><ul class="law-l" id="law-l"></ul></details>
    <div class="law-b">
      <label class="t-btn t-btn--2" id="law-up" role="button" tabindex="0">원문 올리기<input type="file" id="law-f" multiple accept=".xml,.html,.htm,.txt"></label>
      <button class="t-btn t-btn--2" type="button" id="law-ix">색인 만들기</button>
    </div>
  </div>`;
  const $ = (s) => host.querySelector(s);

  function paint(st) {
    if (!st) { $('#law-n').textContent = '—'; return; }
    $('#law-n').innerHTML = `${nf(st.n_acts)}<small>개 법령</small>`;
    $('#law-a').textContent = nf(st.n_articles);
    $('#law-t').textContent = when(st.built_at);
    $('#law-p').hidden = !vv(st.pending);
    $('#law-pn').textContent = nf(st.pending);
    $('#law-l').innerHTML = (st.acts || []).map((a) => `<li><span>${esc(a.act)}</span><small>시행 ${esc(a.effective || '—')}</small></li>`).join('');
  }
  async function load() {
    try { paint(await api('/law/status')); } catch (e) { devlog('law status', e.code || e.message); paint(null); }
  }

  $('#law-up').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#law-f').click(); } });
  $('#law-f').addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    const s = session.get();
    try {
      const r = await fetch(API.prefix + '/law/files', { method: 'POST', body: fd, headers: s ? { authorization: 'Bearer ' + s.token } : {} });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error((j && j.error && j.error.message) || '올리지 못했습니다');
      const ok = (j.files || []).filter((x) => x.ok);
      const bad = (j.files || []).filter((x) => !x.ok);
      toast(`${ok.length}개 올렸습니다${bad.length ? ` · ${bad.length}개는 읽지 못했습니다` : ''} — 색인 만들기를 누르세요`);
      paint(j.status);
    } catch (err) { devlog('law upload', err.message); toast(err.message || '올리지 못했습니다'); }
  });
  $('#law-ix').addEventListener('click', async () => {
    const b = $('#law-ix'); b.disabled = true; b.textContent = '색인 중';
    try { const st = await api('/law/index', { method: 'POST', body: {} }); paint(st); toast(`법령 ${nf(st.n_acts)}개 · 조문 ${nf(st.n_articles)}개 색인했습니다`); }
    catch (e) { devlog('law index', e.code || e.message); toast('색인하지 못했습니다'); }
    finally { b.disabled = false; b.textContent = '색인 만들기'; }
  });
  load();
  return { reload: load };
}
