부품: `landxi/v3/kit/panes.js` + `panes.css`(kit.css 가 부름) · 쓰는 법: `import { panes } from '/landxi/v3/kit/panes.js'; panes(칸, { edge:'right'|'left'|'bottom'|'top', key:'칸이름', min, max, otherMin, cssVar:'--x'(그리드면), map })`

# 칸 크기 조절 — 모든 나뉜 칸(원칙 263 · 2026-10-15)

사용자 원문: "지금 대시보드 결과 보면 왼쪽 지도와 오른쪽 통계 칸이 고정이 되어 있다? 이런 것들이 창을 조율할 수 있는 유연한 UI/UX가 되어야 한다. 이런 조건들은 모든 영역이어야 하고."

## 쓰는 법

```js
import { panes } from '/landxi/v3/kit/panes.js';     // CSS 는 kit.css 가 함께 부름(따로 쓰면 panes.css 를 link)
// 그리드 화면: CSS 에 grid-template-columns: minmax(0,1fr) var(--side, 420px) 처럼 변수 + 기본값
const p = panes(sideEl, { edge: 'left', key: 'side', cssVar: '--side', min: 320, max: 720, otherMin: 480, map });
// flex · 지도 위 떠 있는 카드: cssVar 없이 — 칸 자체 width/height 를 정함
panes(listEl, { edge: 'right', key: 'list', min: 280, max: 560 });
```

| 옵션 | 뜻 |
|---|---|
| `edge` | 손잡이 자리. 왼쪽 칸이면 `right`, 오른쪽 칸이면 `left`, 위 칸 `bottom`, 아래 칸 `top` |
| `key` | 칸 이름. 저장 열쇠 = 사람 · 화면 주소 · 칸 이름(브라우저). 저장이 막혀도 그 방문 동안은 동작 |
| `cssVar` · `varHost` | 그리드 화면은 이 변수로 폭을 넘김(기본 부모에). 없으면 칸의 width/height |
| `min` · `max` · `otherMin` | 칸 최소 · 최대 · 나머지 칸 최소(px) — 넘침 · 겹침 방지 |
| `map` | 크기가 바뀌면 `resize()` 할 지도(함수 · 배열 가능) |
| `collapse` | 접기 · 펼치기 단추(기본 켬 · 기존 꺾쇠 아이콘) |
| `below` | 이 화면 폭 미만(기본 760)은 손잡이 없이 화면 기본 배치 |

- 기본 크기 = 화면 CSS 그대로(저장 값이 없으면 지금 보던 모양으로 시작). 두 번 누르기 = 기본 크기로.
- 키보드: 손잡이에 Tab → ← → (위아래 칸은 ↑ ↓) 16px · Shift 64px · Home 최소 · End 최대 · Enter 접기/펼치기.
- 내용 때문에 저절로 출렁이지 않음: 끈 뒤 크기는 px 로 고정(원칙 231 좁혀 읽음).
