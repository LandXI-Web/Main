// tokens.css 의 커스텀 속성을 런타임에 읽는 단일 창구.
//
// 색을 JS 에 하드코딩하면 CI 가 바뀔 때 tokens.css 와 소리 없이 어긋난다(2026-08 CI 블루
// 교체 때 옛 파랑 #2457D6 이 지도·상태색에 그대로 남아 있던 사고). 그래서 리터럴은
// "tokens.css 를 읽을 수 없을 때의 마지막 보루"로만 두고 값은 항상 여기서 읽는다.
//
// DOM 이 없는 환경(node:test 단위 테스트)에서는 fallback 리터럴을 그대로 돌려준다.
export function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}
