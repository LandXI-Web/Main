/* assistant-mascot.js — XI ChatGEO 마스코트 그림(이 파일 한 곳).
   확인 요청 9차 마스코트-1: LX 공식 캐릭터(랜디 · 에렉스맨) 활용 검토가 먼저 — 원본 파일을 받기 전까지는 LX 심볼로 자리만 잡는다.
   새로 그린 후보(설계 6차 시안의 svg)는 쓰지 않는다.

   자리 셋 — 도우미 버튼(56) · 채팅창 머리(32) · 답 옆(24)에서 표정 셋을 쓴다:
     idle   = 기본(버튼 · 머리)
     think  = 생각 중(답을 찾는 동안 머리 · 답 옆)
     answer = 답함(답이 온 뒤 머리 · 답 옆)
   지금은 셋 다 같은 그림(LX 한국국토정보공사 로고의 'LX' 마크).

   랜디로 바꾸는 법: 원본(정사각 PNG · SVG)을 landxi/assets/brand/ 아래에 두고 아래 FACE 세 줄의 src 만 바꾼다. 예)
     idle:   { src: at('../../assets/brand/mascot/randy.png') },
     think:  { src: at('../../assets/brand/mascot/randy-think.png') },
     answer: { src: at('../../assets/brand/mascot/randy-answer.png') },
   crop 은 가로로 긴 로고의 왼쪽 일부만 보일 때만 쓴다(가로 ÷ 세로). 정사각 캐릭터는 crop 없이. */

const at = (p) => new URL(p, import.meta.url).href;   // 이 파일 기준 상대 경로(GitHub Pages /Main/ 아래에서도 그대로)

/* LX 로고(lx-lockup.svg)의 왼쪽 'LX' 마크 — 로고 전체 3367 × 379 중 왼쪽 804 × 379 */
const LX_MARK = { src: at('../../assets/brand/vector/lx-lockup.svg'), crop: 804 / 379 };

export const FACE = {
  idle: LX_MARK,
  think: LX_MARK,
  answer: LX_MARK,
};

/** 표정 → <img> 한 장(꾸밈 그림 · 뜻은 버튼 · 창 이름이 말한다) */
export function faceImg(kind = 'idle') {
  const f = FACE[kind] || FACE.idle;
  const img = document.createElement('img');
  img.src = f.src; img.alt = ''; img.decoding = 'async'; img.draggable = false;
  img.className = 'k-chat-face-i';
  if (f.crop) { img.dataset.crop = ''; img.style.aspectRatio = String(f.crop); }
  return img;
}
