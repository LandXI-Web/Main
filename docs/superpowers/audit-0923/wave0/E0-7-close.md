# E0-7 후속 — 데이터 관리 권고 1건 마감: `#plate-cap` 말줄임 잘림

## ① 한 줄 결과

`#plate-cap`(판 캡션)이 `white-space:nowrap` + `text-overflow:ellipsis` 한 줄이라, `sheetNote()`가 붙는 항목(완료 d4·d5, 아카이브 a1·a2)의 '파일 2026-04 · 실측 도엽 2025.04 대체 표시' 정직성 문구가 화면에서 말줄임으로 잘렸다. `landxi/proto/dataset.css` `#plate-cap` 한 규칙만 고쳐 줄바꿈을 허용했다. `dataset.js`(캡션 문자열)는 손대지 않았다. `tests/e2e/proto-dataset.spec.mjs` **22/22 녹색** 유지.

## ② 판단 — "짧게 줄이기" 대신 "줄바꿈 허용"을 택한 이유

브리프가 준 두 선택지: (a) 판 캡션을 짧게 두고 긴 문구는 기본 정보 `도엽` 행에만, (b) 2줄 허용(14px 유지). 코드를 확인한 결과 둘 다 그대로는 못 쓴다.

1. **(a) 캡션에서 문구를 빼는 안은 스펙을 깬다.** `proto-dataset.spec.mjs:535`가 `#plate-cap`에 `'GSD 1.08 cm · 측정 · 성과 2 · 파일 2026-04 · 실측 도엽 2025.04 대체 표시'` 전체 문자열이 있는지를 그대로 단언한다(`toContainText`). 이 문구를 캡션에서 지우면 이 단언이 실패한다 — spec 은 "자기 범위만 수정"이라 건드릴 수 없다.
2. **아카이브 화면은 '기본 정보 도엽 행'이 아예 없다.** 완료 탭(`dataset.js:809`)에는 `도엽` 행이 있어 문구가 캡션과 중복이지만, 아카이브 탭의 기본 정보(`dataset.js:850`)는 `이름·원본 파일·유형·형식·크기·기준일` 뿐이고 "파일명 시점 ≠ 실측 도엽 시점" 사실은 판 캡션(`geomOf` `cap`, `dataset.js:576`)이 **유일한 자리**다. 여기서 문구를 빼면 이전 E0-7 에픽이 감사 F9 로 고친 정직성 표시가 a1·a2 에서 조용히 사라진다. 아카이브 기본 정보에 행을 추가하는 건 `dl` 구성을 바꾸는 일이라 이번 범위(`dataset.css`, 필요시 캡션 문자열)를 벗어난다.
3. **(b) 2줄로도 실제로는 안 잘리지 않는다.** 1440 폭에서 판(`#plate-wrap`)은 좌우 2단 배치 때문에 실측 223px 안팎으로 좁다(계측: `width:221px`). d4 캡션 전체(`남원 농경지 · 2025.04 · GSD 1.08 cm · 측정 · 성과 2 · 파일 2026-04 · 실측 도엽 2025.04 대체 표시`)는 이 폭에서 **4줄**이 필요하다(`scrollHeight 76px ÷ line-height 18.9px ≈ 4.02`). `-webkit-line-clamp:2`로 2줄만 허용했더니 `클라이언트높이 38px < 스크롤높이 76px`로 정확히 그 문구가 다시 잘렸다(스크린샷 `e0-7-plate-cap-d4-1440.png` 1차본).

그래서 택한 안: **문구는 그대로 두고(스펙·정직성 보존), `white-space:normal`로 줄바꿈만 허용**해 필요한 만큼(보통 3~4줄) 늘어나게 했다. 14px·자간은 그대로다. `#plate-wrap`은 `aspect-ratio:16/9` + `max-height:var(--figh)`(최소 116px)라 4줄(~76px)이 늘어나도 판 박스 안에 들어간다(계측: `overflowCheck.scrollHeight === clientHeight` — 잘리는 글자 0).

## ③ 변경 — `landxi/proto/dataset.css`

```diff
-#plate-cap{ position:absolute; left:10px; right:10px; bottom:8px; margin:0; font-size:14px; letter-spacing:.05em; color:#fff; z-index:3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
+/* 주석: 문구를 줄이지 않는 이유(정직성·아카이브 유일 자리) */
+#plate-cap{ position:absolute; left:10px; right:10px; bottom:8px; margin:0; font-size:14px; line-height:1.35; letter-spacing:.05em; color:#fff; z-index:3;
+  white-space:normal; overflow-wrap:break-word; }
```

`dataset.js`·`dataset.html`·다른 파일은 수정하지 않았다(`git diff --stat` 아래 ④).

## ④ 증거

- **계측(수정 전 — 1줄 nowrap+ellipsis)**: `#plate-cap` 텍스트는 DOM 에 전체가 있으나(`toContainText` 는 원래도 녹색) 화면에는 `…`로 잘려 보였다.
- **계측(2줄 clamp 시도 — 폐기)**: `overflowCheck: { scrollHeight: 76, clientHeight: 38, lineClamp: '2' }` → 잘림 재현. 스크린샷은 남기지 않고 코드만 다음 시도로 교체.
- **계측(최종 — 줄바꿈 허용)**:
  - 완료 d4: `overflowCheck: { scrollHeight: 76, clientHeight: 76 }` (잘림 0) · 캡션 전문 `남원 농경지 · 2025.04 · GSD 1.08 cm · 측정 · 성과 2 · 파일 2026-04 · 실측 도엽 2025.04 대체 표시` 화면에 4줄로 다 보인다.
  - 아카이브 a1: `overflowCheck: { scrollHeight: 57, clientHeight: 57 }` (잘림 0) · 캡션 전문 `남원 농경지 · 2025.04 · GSD 1.08 cm · 측정 · 파일 2026-04 · 실측 도엽 2025.04 대체 표시` 3줄로 다 보인다.
- **스크린샷** (`shots/w0/E0-7/`):
  - `e0-7-plate-cap-d4-1440.png` — 완료 탭 d4 판만 크롭(줄바꿈 뒤 4줄, 잘림 없음)
  - `e0-7-plate-cap-d4-full-1440.png` — 완료 탭 d4 전체 화면(기본 정보 `도엽` 행과 판 캡션이 같은 문구를 함께 보여 준다)
  - `e0-7-plate-cap-a1-1440.png` — 아카이브 탭 a1 판만 크롭(줄바꿈 뒤 3줄, 잘림 없음)
- **캡처 스크립트**(재현용, `shots/w0/E0-7/`에 둠): `e0-7-plate-cap.mjs`(완료 d4) · `e0-7-plate-cap-archive.mjs`(아카이브 a1). `node shots/w0/E0-7/<파일>.mjs`로 재실행하면 같은 계측·스크린샷을 다시 만든다(서버가 `localhost:4173`에 떠 있어야 한다).
- **spec**: `npx playwright test tests/e2e/proto-dataset.spec.mjs --reporter=line` → `22 passed (1.5m)`.
- **git diff --stat**(내 소유 파일만 — 작업 트리의 다른 변경은 병렬 에픽 몫):

```
$ git diff --stat -- landxi/proto/dataset.css
 landxi/proto/dataset.css | 6 +++++-
 1 file changed, 5 insertions(+), 1 deletion(-)
```

(`git status`에는 이 외에도 `dashboard.css`·`dashboard.js`·`map-stats.js`·`map.css`·`map.js`·`tests/unit/cells.test.mjs`가 떠 있으나, 이번 세션에서 건드리지 않은 병렬 에픽의 작업 트리 변경이다.)

## ⑤ 남은 것

- 판 박스가 아주 작은 뷰포트(세로가 짧아 `--figh`가 최소 116px 에 가까운 경우) + 문구가 더 길어지는 조합에서는 캡션이 판 높이의 상당 부분을 덮을 수 있다. 지금 실측된 가장 긴 경우(d4, 4줄 · 76px)는 116px 안에 들어간다 — 이보다 더 긴 문구가 생기면 다시 봐야 한다.
- 아카이브 기본 정보에 `도엽`류 행이 없는 구조적인 이유로 정직성 문구가 판 캡션에만 있는 상태는 그대로다. 정식으로 고치려면(완료 탭처럼 기본 정보에 행을 추가) `dl` 구성을 바꿔야 해서 이번 범위 밖이다 — 후속 에픽(예: E1-7 자산 등급) 몫으로 남긴다.
