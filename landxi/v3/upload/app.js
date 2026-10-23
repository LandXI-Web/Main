/* 영상 올리기 창(원칙 326 · 10-23 사용자 "다른 화면으로 넘어가고 다른 작업 하면 그냥 멈춰버리네? 이러면 무용지물이지").
   올리기 대화 상자의 '올리기 시작'이 이 창을 연다. 이 창이 파일을 쥐고 조각을 보내므로, 열어 둔 채 다른 화면에서 일해도 계속 올라간다.
   다른 화면은 머리줄 '올리는 중' 표시와 상태 창으로 진행을 본다(kit/uploads.js — BroadcastChannel). 창 제목에 진행률. */
import { h, session } from '../kit/util.js';
import { mountUploads, onUploads, uploadsOf } from '../kit/uploads.js';

const main = h('main.up-main');
document.body.append(h('header.up-h', {}, h('b', { text: 'LAND-XI' }), h('span', { text: '영상 올리기' })), main);
if (!session.get()) main.append(h('p.up-none', { text: '로그인한 Land-XI 화면에서 다시 열어 주세요.' }));
else {
  await mountUploads();
  const title = () => {
    const fs = [...uploadsOf('shared'), ...uploadsOf('own')].flatMap((b) => b.files).filter((f) => f.state !== 'done');
    const tot = fs.reduce((a, f) => a + f.size, 0), got = fs.reduce((a, f) => a + (f.bytes || 0), 0);
    document.title = fs.length ? `${tot ? Math.floor((got / tot) * 100) : 0}% 올리는 중 · 영상 올리기 · Land-XI` : '영상 올리기 · Land-XI';
  };
  onUploads(title); title();
}
document.body.dataset.ready = '1';
