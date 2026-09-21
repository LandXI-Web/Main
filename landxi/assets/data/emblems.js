// 서비스 얼굴 — 카드 한 장마다 한 벌씩 그리는 **판(plate)**.
//
//   발주자(2026-09-21): "카드 이미지는 저렇게 정사영상 해놓으면 좀 허접하자나"
//                        "GeoVision 플랫폼, 이런 뭔가 마스코트나 홈페이지 메인 화면 같은 느낌이어야지"
//
// 정사영상 크롭은 **증거**지 얼굴이 아니다. 확대한 사진 조각은 어느 서비스인지 알아볼 수 없고,
// 작게 줄이면 흐릿한 색면이 된다. 그래서 얼굴은 그 서비스가 **무엇을 찾는지**를 그린 판으로 세운다.
// 크롭은 작업공간의 근거 자리에 그대로 남는다 — 없애는 게 아니라 제자리로 보낸다.
//
// ── 그리는 법 ──────────────────────────────────────────────────────────────
// 법전(design/system.md) 그대로다: 라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0.
// 그래서 곡선과 명암으로 멋을 내지 않는다. 쓰는 것은 셋뿐이다.
//   판   var(--t1)  연한 기관색 바탕
//   선   var(--line) / 기관색 옅은 것 — 땅의 결(필지·도로·격자·등고)
//   표시 var(--accent) 채움 — **AI 가 찾아낸 것**. 판에서 유일하게 진한 것이 이것이다.
// 어느 판에서나 같은 약속이다: 진한 것 = 찾아낸 것. 그래서 일곱 장이 한 벌로 보인다.
//
// 벡터라 어느 크기에서도 또렷하고, 기관 CI 를 갈면 색이 따라 바뀐다(CI 한 벌 규칙).
//
// 카드 이름으로 분기하지 않는다 — **선언표**다. 새 카드가 생기면 여기 한 줄을 더한다.

const P = 'var(--t1)';          // 판
const L = 'var(--line)';        // 땅의 결
const A = 'var(--accent)';      // 찾아낸 것

/** 공통 껍데기 — 160×100 판 하나. 모든 얼굴이 같은 비율·같은 여백을 쓴다. */
const plate = (inner) => `<svg class="em" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet"
  role="img" aria-hidden="true" focusable="false">
  <rect width="160" height="100" fill="${P}"/>${inner}</svg>`;

/* 되풀이 도구 — 같은 것을 일정 간격으로 놓는다(격자·나무·파도). */
const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');

export const EMBLEMS = {
  /* 영농관리 — 비스듬히 누운 필지들. 판독된 두 필지만 채워지고, 오른쪽에 하우스 지붕이 늘어선다. */
  farm: plate(`
    <g stroke="${L}" stroke-width="1" fill="none">
      ${rep(6, (i) => `<path d="M${-10 + i * 28} 100 L${18 + i * 28} 0"/>`)}
      <path d="M0 34 L160 20"/><path d="M0 66 L160 52"/>
    </g>
    <path d="M32 36 L60 33 L64 63 L36 66 Z" fill="${A}"/>
    <path d="M96 22 L124 19 L127 42 L99 45 Z" fill="${A}" opacity=".45"/>
    <g fill="none" stroke="${A}" stroke-width="1.6">
      ${rep(4, (i) => `<path d="M${104 + i * 13} 86 L${110 + i * 13} 74 L${116 + i * 13} 86"/>`)}
    </g>`),

  /* 생활환경 — 방치된 더미. 불규칙한 덩어리 위로 연기 사선이 오른다. */
  living: plate(`
    <path d="M0 78 L160 70 L160 100 L0 100 Z" fill="${L}" opacity=".5"/>
    <path d="M28 78 L44 54 L62 62 L74 46 L92 78 Z" fill="${A}"/>
    <path d="M96 78 L108 62 L122 70 L130 78 Z" fill="${A}" opacity=".45"/>
    <g stroke="${A}" stroke-width="1.6" fill="none" stroke-linecap="square">
      <path d="M62 40 L70 26 L62 14"/><path d="M78 34 L86 22 L80 12"/>
    </g>
    <g stroke="${L}" stroke-width="1"><path d="M0 88 L160 81"/></g>`),

  /* 도로안전 — 사선으로 지나는 노선. 파손 지점이 점으로 찍히고, 아래 구간 등급이 막대로 선다. */
  road: plate(`
    <path d="M-6 88 L166 26" stroke="${L}" stroke-width="16" fill="none"/>
    <path d="M-6 88 L166 26" stroke="${P}" stroke-width="1.4" stroke-dasharray="9 9" fill="none"/>
    <g fill="${A}">
      <rect x="38" y="66" width="9" height="9"/>
      <rect x="82" y="50" width="12" height="12"/>
      <rect x="120" y="38" width="7" height="7"/>
    </g>
    <g fill="${A}">
      ${rep(7, (i) => `<rect x="${12 + i * 20}" y="${92 - [6, 12, 4, 15, 9, 3, 11][i]}" width="11" height="${[6, 12, 4, 15, 9, 3, 11][i]}" opacity="${i % 2 ? '.4' : '1'}"/>`)}
    </g>`),

  /* 인파관리 — 격자 위의 밀도. 가운데로 갈수록 점이 크고 진해진다. */
  crowd: plate(`
    <g stroke="${L}" stroke-width="1">
      ${rep(7, (i) => `<path d="M${20 * i + 10} 0 L${20 * i + 10} 100"/>`)}
      ${rep(5, (i) => `<path d="M0 ${20 * i + 10} L160 ${20 * i + 10}"/>`)}
    </g>
    <rect x="50" y="30" width="60" height="40" fill="${A}" opacity=".18"/>
    <rect x="70" y="40" width="20" height="20" fill="${A}" opacity=".3"/>
    <g fill="${A}">
      ${rep(26, (i) => {
    const x = 14 + ((i * 37) % 134), y = 12 + ((i * 53) % 78);
    const d = Math.max(0, 1 - (Math.abs(x - 80) / 74 + Math.abs(y - 50) / 46) / 2);
    return `<circle cx="${x}" cy="${y}" r="${(1.4 + d * 2.6).toFixed(1)}" opacity="${(0.25 + d * 0.75).toFixed(2)}"/>`;
  })}
    </g>`),

  /* 국토변화 — 같은 땅 두 시점. 어긋나 겹치고, **겹치지 않은 데**가 변화다. */
  change: plate(`
    <path d="M24 22 L92 16 L100 62 L32 68 Z" fill="none" stroke="${L}" stroke-width="1.6"/>
    <path d="M40 34 L108 28 L116 74 L48 80 Z" fill="none" stroke="${L}" stroke-width="1.6"/>
    <path d="M40 34 L92 30 L96 62 L44 66 Z" fill="${P}"/>
    <path d="M92 16 L100 62 L96 62 L92 30 Z" fill="${A}"/>
    <path d="M44 66 L96 62 L100 62 L48 80 L40 76 Z" fill="${A}"/>
    <path d="M24 22 L40 34 L40 76 L32 68 Z" fill="${A}" opacity=".4"/>
    <g fill="${A}"><rect x="126" y="30" width="4" height="40"/><rect x="138" y="42" width="4" height="28"/></g>`),

  /* 해양쓰레기 — 해안선과 물결. 물 위에 뜬 조각들이 해안 쪽으로 몰린다. */
  marine: plate(`
    <path d="M0 0 L160 0 L160 30 C120 34 96 48 72 62 C48 76 24 84 0 86 Z" fill="${L}" opacity=".45"/>
    <g stroke="${L}" stroke-width="1.2" fill="none">
      ${rep(3, (i) => `<path d="M0 ${96 - i * 16} C30 ${88 - i * 16} 54 ${102 - i * 16} 82 ${94 - i * 16} C110 ${86 - i * 16} 134 ${98 - i * 16} 160 ${90 - i * 16}"/>`)}
    </g>
    <g fill="${A}">
      <rect x="30" y="62" width="9" height="7"/><rect x="52" y="76" width="7" height="6"/>
      <rect x="74" y="66" width="11" height="8"/><rect x="96" y="80" width="6" height="6"/>
      <rect x="112" y="60" width="8" height="7" opacity=".5"/><rect x="136" y="72" width="6" height="6" opacity=".5"/>
    </g>`),

  /* 산림·탄소 — 등고를 따라 선 나무들. 훼손된 자리만 비어 있다. */
  forest: plate(`
    <g stroke="${L}" stroke-width="1" fill="none">
      <path d="M0 74 C36 62 60 82 96 68 C124 57 142 66 160 60"/>
      <path d="M0 90 C36 78 60 98 96 84 C124 73 142 82 160 76"/>
      <path d="M0 58 C36 46 60 66 96 52 C124 41 142 50 160 44"/>
    </g>
    <g fill="${A}">
      ${rep(9, (i) => (i === 4 || i === 5 ? '' : `<path d="M${12 + i * 17} 46 L${18 + i * 17} 32 L${24 + i * 17} 46 Z"/>`))}
      ${rep(7, (i) => `<path d="M${20 + i * 19} 74 L${26 + i * 19} 58 L${32 + i * 19} 74 Z" opacity=".55"/>`)}
    </g>
    <rect x="76" y="28" width="30" height="20" fill="none" stroke="${A}" stroke-width="1.6" stroke-dasharray="4 3"/>`),
};

/** 카드 → 얼굴. **선언표다** — 화면이 카드 이름을 보고 고르지 않는다. */
export const EMBLEM_OF = {
  'card-farm': 'farm', 'card-living': 'living', 'card-road': 'road', 'card-crowd': 'crowd',
  'card-change': 'change', 'card-marine': 'marine', 'card-forest': 'forest',
  'card-global-farm': 'farm', 'card-global-disaster': 'change',
};

/** 카드 id 로 얼굴 한 장. 선언이 없으면 **빈 문자열** — 아무거나 끼워 넣지 않는다. */
export const emblemOf = (cardId) => EMBLEMS[EMBLEM_OF[cardId]] || '';
