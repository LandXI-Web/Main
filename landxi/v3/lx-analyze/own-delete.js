/* own-delete.js — 내 영상 지우기(10-31 PM "직원이 자기가 올린 영상과 그 결과를 직접 지우는 기능을 만든다").
   화면 안 확인 칸 한 번(브라우저 confirm 없음): 무엇이 함께 지워지는지(분석 결과 · 결과 도형 수) — 서버 GET /me/imagery/{영상} 한 출처.
   지울 수 없으면 그 이유만 보이고 '닫기'. 지우면 모든 화면에 'lx:own-deleted' {id} 알림. 쓰는 곳: 분석 서비스 영상 고르기 · 국토 변화 '내 영상'. */
import { h, api } from '../kit/util.js';
import { nf } from '../kit/i18n.js';
import { modal } from '../kit/modal.js';
import { toast } from '../kit/toast.js';

/** → 지웠으면 true */
export function deleteOwn(id, name = '') {
  return new Promise((done) => {
    const body = h('div.la-del', {}, h('p.la-note', { text: '확인하는 중' }));
    let ok = false;
    const m = modal({ title: '내 영상 지우기', size: 'md', body, onClose: () => done(ok) });
    api(`/me/imagery/${encodeURIComponent(id)}`).then((pl) => {
      const close = h('button.t-btn.t-btn--2', { type: 'button', text: pl.can ? '취소' : '닫기', onclick: () => m.close() });
      if (!pl.can) { body.replaceChildren(h('p.la-del-t', { text: pl.name || name }), h('p.la-del-why', { text: pl.why }), h('div.la-own-act', {}, close)); return; }
      const go = h('button.t-btn.la-del-go', { type: 'button', text: '지우기' });
      const nRes = pl.results?.value ?? 0, nShp = pl.shapes?.value ?? 0;   // 숫자는 봉투(값 · 단위 · 출처)
      body.replaceChildren(
        h('p.la-del-t', { text: pl.name || name }),
        h('p.la-note', { text: nRes ? `이 영상과 이 영상으로 낸 분석 결과 ${nf(nRes)}건(결과 도형 ${nf(nShp)}개)을 지웁니다. 지도 서비스에서도 사라집니다.` : '이 영상을 지웁니다. 이 영상으로 낸 분석 결과는 없습니다.' }),
        /* 이 영상으로 낸 결과가 있으면 한 번 더 — 어떤 서비스 · 날짜(11-01 PM "지울때 결과가 있으면 다시 한번 안내를 하고") */
        nRes ? h('div.la-del-res', {}, h('b', { text: `이 영상으로 낸 결과 ${nf(nRes)}건도 함께 지워집니다` }),
          h('ul', {}, ...(pl.items || []).map((x) => h('li', { text: [x.service, x.date, x.kind].filter(Boolean).join(' · ') }))),
          (pl.marks?.value ?? 0) ? h('small', { text: `그 결과에 남긴 판정 ${nf(pl.marks.value)}건도 함께 지워집니다` }) : null) : null,
        h('p.la-note', { text: '지운 뒤에는 되돌릴 수 없습니다.' }),
        h('div.la-own-act', {}, close, go));
      go.addEventListener('click', async () => {
        go.disabled = true; close.disabled = true; go.textContent = '지우는 중';
        try {
          await api(`/me/imagery/${encodeURIComponent(id)}`, { method: 'DELETE' });
          ok = true;
          dispatchEvent(new CustomEvent('lx:own-deleted', { detail: { id } }));
          toast('내 영상을 지웠습니다');
          m.close();
        } catch (e) {
          body.replaceChildren(h('p.la-del-t', { text: pl.name || name }), h('p.la-del-why', { text: e.message || '지우지 못했습니다' }),
            h('div.la-own-act', {}, h('button.t-btn.t-btn--2', { type: 'button', text: '닫기', onclick: () => m.close() })));
        }
      });
    }).catch((e) => {
      body.replaceChildren(h('p.la-del-why', { text: e.message || '지금은 확인할 수 없습니다' }),
        h('div.la-own-act', {}, h('button.t-btn.t-btn--2', { type: 'button', text: '닫기', onclick: () => m.close() })));
    });
  });
}
