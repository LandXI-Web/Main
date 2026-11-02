/* label-import.js — 학습데이터 구축 · 올리기 칸의 두 창(11-02 PM "공유 학습데이터 셋 불러오기 기능과 업로드는 gpkg shp geojson 등 받아져야 한다").
   ① 공유 학습 데이터 불러오기 — 관리자 공유 데이터 '학습 데이터' 탭에서 공개한 묶음(GET /training/samples?shared=1)을 찾고 골라 이 프로젝트 학습데이터로 더한다(POST /projects/{id}/samples).
   ② 벡터 라벨 올리기 — gpkg · shp(zip) · geojson 의 면(다각형) 도형을 클래스 칸으로 나눠 이 프로젝트 영상 위 라벨로 넣고(지도 라벨링과 같은 모양),
      도형이 몰린 곳을 512 화소 그림으로 잘라 '라벨 완료'까지 잇는다(서버 labeling.py vector_apply). 큰 파일은 기존 나눠 올리기(sendChunked) 그대로. */
import { h, api, esc } from '../kit/util.js';
import { modal } from '../kit/modal.js';
import { toast } from '../kit/toast.js';
import { nf } from '../kit/i18n.js';
import { sendChunked } from '../kit/sample-upload.js';

const MB = (n) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1);
const day = (iso) => String(iso || '').slice(0, 10).replace(/-/g, '.');
const val = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x);

/** 공유 학습 데이터 — 창에서 찾기 · 고르기 → 이 프로젝트 학습데이터로 더함 */
export function openSharedSets({ project, onPicked }) {
  const find = h('input.t-input', { type: 'search', placeholder: '이름 · 지역 · 클래스로 찾기', 'aria-label': '공유 학습 데이터 찾기', autocomplete: 'off' });
  const ul = h('ul.tf-sl', { role: 'list' });
  const msg = h('p.t-label', { role: 'status', text: '불러오는 중' });
  const md = modal({ title: '공유 학습 데이터 불러오기', size: 'lg', body: h('div.tf-pk', {}, find, msg, ul) });
  let items = [];
  const draw = () => {
    const q = find.value.replace(/\s+/g, '').toLowerCase();
    const rows = items.filter((x) => !q || [x.task_name, x.region_name, ...(x.classes || []).map((c) => c.name || c)].join('').replace(/\s+/g, '').toLowerCase().includes(q));
    msg.textContent = items.length ? (rows.length ? '' : '찾는 학습 데이터가 없습니다') : '관리자가 공개한 학습 데이터가 아직 없습니다';
    ul.replaceChildren(...rows.map((x) => {
      const cls = (x.classes || []).map((c) => c.name || c);
      return h('li', {}, h('button.tf-si', { type: 'button', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          await api(`/projects/${encodeURIComponent(project.id)}/samples`, { method: 'POST', body: { sample_id: x.id } });
          const full = await api('/training/samples/' + encodeURIComponent(x.id));
          toast('이 프로젝트 학습데이터로 더했습니다');
          md.close(); onPicked?.(full);
        } catch (err) { toast(err.message || '불러오지 못했습니다'); e.currentTarget.disabled = false; }
      } }, h('b', { text: x.task_name || '학습 데이터' }),
      h('span', { text: [x.region_name, `그림 ${nf(val(x.images) || 0)}장`, cls.length ? (cls.length > 4 ? `${cls.slice(0, 4).join(' · ')} 외 ${cls.length - 4}` : cls.join(' · ')) : '', day(x.created_at)].filter(Boolean).join(' · ') })));
    }));
  };
  find.addEventListener('input', draw);
  api('/training/samples?shared=1').then((j) => { items = j?.items || []; draw(); }).catch(() => { msg.textContent = '불러오지 못했습니다'; msg.dataset.lv = 'warn'; });
  find.focus();
  return md;
}

/** 벡터 라벨 올리기 — 파일 → (서버가 읽음) → 클래스 칸 고르기 → 라벨로 넣기 */
export function openVectorLabel({ project, onDone }) {
  const file = h('input', { type: 'file', accept: '.gpkg,.geojson,.json,.zip', hidden: true });
  const pick = h('button.t-btn', { type: 'button', text: '벡터 파일 고르기 (gpkg · shp zip · geojson)', onclick: () => file.click() });
  const st = h('p.t-label', { role: 'status', text: '영상 위에 겹치는 면(다각형) 도형을 라벨로 씁니다 · 큰 파일은 나눠 올립니다' });
  const out = h('div.tf-vo');
  const md = modal({ title: '벡터 라벨 올리기', size: 'lg', body: h('div.tf-pk', {}, pick, file, st, out) });
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    pick.disabled = true; out.replaceChildren(); st.dataset.lv = ''; st.textContent = `올리는 중 · 0 / ${MB(f.size)} MB`;
    try {
      const r = await sendChunked(f, { kind: 'vector', project_id: project.id }, (off, size) => { st.textContent = off >= size ? '파일을 읽는 중' : `올리는 중 · ${MB(off)} / ${MB(size)} MB`; });
      st.textContent = `도형 ${nf(r.n)}개를 읽었습니다`;
      draw(r);
    } catch (e) {
      st.dataset.lv = 'warn'; st.textContent = e.user || e.message || '올리지 못했습니다'; pick.disabled = false;
    }
    file.value = ''; pick.disabled = false;
  });
  function draw(r) {
    const sel = h('select.t-input', { 'aria-label': '클래스를 가르는 칸' },
      h('option', { value: '', text: '클래스 칸 없음 — 파일 이름 하나의 클래스' }), ...(r.fields || []).map((f) => h('option', { value: f.name, text: `${f.name} (${f.classes.length}종)`, selected: f.name === r.field || undefined })));
    if (r.field) sel.value = r.field;   // 서버가 고른 클래스 칸(class · cls · 분류 …)이 처음 선택
    const list = h('p.t-label.tf-vc');
    const cut = h('input', { type: 'checkbox', checked: true, id: 'tf-vcut' });
    const upd = () => {
      const f = (r.fields || []).find((x) => x.name === sel.value);
      list.textContent = f ? '클래스 · ' + f.classes.map((c) => `${c.name} ${nf(c.count)}`).join(' · ') : '클래스 하나로 넣습니다';
    };
    sel.addEventListener('change', upd); upd();
    const where = (r.imagery || []).length ? `프로젝트 영상 ${r.imagery.length}장 위에 도형이 겹칩니다 — ${r.imagery.slice(0, 3).map((i) => `${i.name} ${nf(i.n)}개`).join(' · ')}${r.imagery.length > 3 ? ' 외' : ''}`
      : '이 프로젝트 영상 위에 겹치는 도형이 없습니다 — 영상 범위를 확인해 주세요';
    const go = h('button.t-btn', { type: 'button', text: '라벨로 넣기', disabled: !(r.imagery || []).length || undefined });
    go.addEventListener('click', async () => {
      go.disabled = true; go.textContent = '넣는 중';
      try {
        const j = await api(`/projects/${encodeURIComponent(project.id)}/labeling/vector/${encodeURIComponent(r.id)}/apply`, { method: 'POST', body: { field: sel.value || null, cut: cut.checked } });
        const c = j.counts || {};
        st.textContent = `도형 ${nf(c.shapes)}개를 라벨로 넣었습니다${c.images ? ` · 학습 그림 ${nf(c.images)}장으로 잘라 라벨 완료` : ''}${c.skipped ? ` · 영상마다 2,000개 한도로 ${nf(c.skipped)}개는 뺐습니다` : ''}${j.cut_note && !c.images ? ` · ${j.cut_note}` : ''}`;
        out.replaceChildren(h('div.tf-act', {}, h('button.t-btn', { type: 'button', text: '지도에서 보기', onclick: () => { md.close(); onDone?.(j); } })));
      } catch (e) { st.dataset.lv = 'warn'; st.textContent = e.message || '넣지 못했습니다'; go.disabled = false; go.textContent = '라벨로 넣기'; }
    });
    out.replaceChildren(h('label.t-label', { text: '클래스를 가르는 칸' }), sel, list, h('p.t-label', { text: where }),
      h('label.tf-ck', {}, cut, h('span', { text: ' 도형이 있는 곳을 학습 그림(512 화소)으로 잘라 라벨 완료까지' })), h('div.tf-act', {}, go));
  }
  return md;
}
