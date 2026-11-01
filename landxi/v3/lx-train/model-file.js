/* 모델 파일(.pt) 올리기 — 학습 화면의 '모델 파일 올리기' 창(11-01 PM "모델 크기를 꼭 적게 하는 개념 보다는 pt 파일 모델 파일을 등록").
   파일을 올리면 서버가 파일에서 계열(YOLO11 등) · 모델 크기(n~x) · 결과 형태(BOX · OBB · SEG) · 클래스를 읽어 모델 장부에 '결과 확인 전'으로 넣는다.
   사람이 적지 않는다. 읽은 값을 보여 주고 '모델 승인 요청'(기존 승인 길)만 누른다. 큰 파일은 기존 나눠 올리기(sendChunked) 그대로. */
import { h, api } from '../kit/util.js';
import { modal } from '../kit/modal.js';
import { toast } from '../kit/toast.js';
import { sendChunked } from '../kit/sample-upload.js';

const MB = (n) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1);

export function openModelFile({ onDone } = {}) {
  const input = h('input', { type: 'file', accept: '.pt', hidden: true });
  const pick = h('button.t-btn', { type: 'button', text: '모델 파일(.pt) 고르기', onclick: () => input.click() });
  const st = h('p.t-label', { role: 'status', text: 'YOLO 모델 파일을 올리면 계열 · 모델 크기 · 결과 형태 · 클래스를 파일에서 자동으로 읽습니다' });
  const out = h('div.tr-mf-out');
  const m = modal({ title: '모델 파일 올리기', size: 'md', body: h('div.tr-mf', {}, pick, input, st, out) });
  input.addEventListener('change', async () => {
    const f = input.files?.[0]; if (!f) return;
    pick.disabled = true; out.replaceChildren();
    st.dataset.lv = ''; st.textContent = `올리는 중 · 0 / ${MB(f.size)} MB`;
    try {
      const r = await sendChunked(f, { kind: 'model' }, (off, size) => { st.textContent = `올리는 중 · ${MB(off)} / ${MB(size)} MB`; });
      st.textContent = '파일에서 읽었습니다 — 아래 내용을 확인하고 모델 승인을 요청하세요';
      const d = r.read || {};
      const row = (k, v) => h('div', {}, h('dt', { text: k }), h('dd', { text: v || '—' }));
      const ask = h('button.t-btn', { type: 'button', text: '모델 승인 요청' });
      ask.addEventListener('click', async () => {
        ask.disabled = true;
        try { await api('/registry/model-register', { method: 'POST', body: { model_id: r.model.id } }); toast('모델 승인을 요청했습니다'); m.close(); onDone?.(); }
        catch (e) { toast(e.message || '요청을 보내지 못했습니다'); ask.disabled = false; }
      });
      out.replaceChildren(h('dl.la-dl', {}, row('모델', d.word), row('클래스', (d.classes || []).join(' · ')), row('입력 크기', d.imgsz ? `${d.imgsz} 픽셀` : '')),
        h('p.t-label', { text: d.basis || '' }), h('div', {}, ask));
    } catch (e) {
      st.dataset.lv = 'warn'; st.textContent = e.user || e.message || '올리지 못했습니다';
      pick.disabled = false; input.value = '';
    }
    pick.disabled = false;
  });
  return m;
}
