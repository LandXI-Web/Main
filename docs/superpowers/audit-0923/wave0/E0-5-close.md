# E0-5 재게이트 마감 — must_fix 4건

- 날짜 2026-09-24 · 브랜치 plan1-foundation · 커밋 없음(마감 단계에서 커밋)
- 수정 파일: `landxi/proto/map.js` · `landxi/proto/map.css` · `landxi/proto/map-stats.js` · `tests/e2e/proto-map.spec.mjs`
- 재게이트 3(범례 재배치): `landxi/proto/map.js` · `tests/e2e/proto-map.spec.mjs` · `shots/w0/E0-5/regate3/*.png` (§5)
- 새 파일: `shots/w0/E0-5/regate-probe.mjs`(검증 스크립트) · `shots/w0/E0-5/regate/*.png`

## 1. [P0 재발] 판 셋 동시 금지 양방향

원인: `fitLeft()` 의 `crowded()` 는 `S.side` 만 봤는데, 비교 결과 판은 `cmpOpen` 으로 열려서 fitLeft 를 거치지 않았다. `#l-open` 은 오른쪽 판이 열려 있어도 좌 판을 그냥 폈다. 사용자가 편(pinned) 좌 판은 정보 판이 서도 접히지 않았다.

변경(`map.js`):
- `sideOpen()` = 서랍 · 정보 판 · (비교 모드에서) `cmpOpen`. 오른쪽 판이 서 있으면 **핀과 상관없이** `S.left='off'` · `leftAuto=true` · `leftPinned=false`. 기본 모드에서는 판(정보 판 · 서랍)이 닫히면 자동으로 접은 것만 되돌린다(기존 규칙 그대로). 비교 모드에서 `변화 결과 보기 ›` 로 접힌 좌 판은 비교 판을 `닫기`(#side-x) 해도 접힌 채로 남는다. 비교 모드의 기본 상태가 접힘(off)이라서 그렇다(재게이트 gate-probe A3: left=off · 비율 0.911, 1440 · 1280 모두 같음).
- `[data-cmp-open]`: 판을 열 때 `fitLeft()` 를 거친다. 좌 판이 접히면 `#mw[data-left]` · URL(`replaceState`) · 좌 판을 새로 그린다. 폭 전이 뒤의 resize 는 §5 의 `transitionend` 한 곳에서 한다(이 경로에 있던 260ms 지연은 지웠다). `commit()` 은 부르지 않아서 `applyCompare` 가 지도를 다시 맞추지(re-fit) 않는다.
- `#l-open`: 먼저 오른쪽 판을 닫는다. 비교 모드에서는 `cmpOpen=false`, 기본 모드에서는 `S.side=''` · `S.sel=''` 이다. 정보 판을 닫을 때는 `S.fold='1'` 로 둔다. 정보 판 아래 표는 이미 한 줄(peek)로 접혀 있었으므로, 닫아도 접힌 채로 남는다.

증거(`regate-probe.mjs`, 캔버스/#mw):

| 경로 | 1440×900 | 1280×720 |
|---|---|---|
| 겹쳐보기 `변경 ›` → `변화 결과 보기 ›` (예전 0.183 / 0.144) | **0.631** · left=off | **0.578** · left=off |
| 비교 판 열린 채 `#l-open` → 판 닫힘 | 0.463 | 0.431 |
| 기본 · 정보 판 열린 채 `#l-open` (예전 0.184) | 0.464 · side='' | 0.455 |
| 펴 둔 좌 판 → 표 펼치기 → 행 클릭 | 0.632 · left=off | 0.579 |

기본 모드에서 `#l-open` 뒤 0.46 은 좌 판(690)과 지도만 서는 기본 화면의 비율이다. 1440 폭에서 좌 판이 690 이면 지도는 구조상 최대 약 0.5 이므로 0.6 은 닿을 수 없다. 판 셋이 서지 않는다는 것이 이 항목의 불변식이다.

## 2. 1280 겹쳐보기 — 좌 판·비교 띠 스크롤바와 세로선 잔상

원인: 세로 1000px 이하에서 쓰는 두 칸 판(`column-count:2`)은 높이가 모자라면 **셋째·넷째 칸을 옆으로** 만든다. 그래서 `#l-b` 가 942>607 로 넘쳐 가로 스크롤바가 생겼고, 넘친 칸의 `column-rule` 이 2025.04·2025.06 카드 위 세로선 잔상으로 보였다. 폭 전이 때문이 아니다. `.mw-band` 는 304>299 로 5px 넘쳐 스크롤바가 섰다.

변경(`map.css` §②-b): 비교 모드 좌 판은 칸 흐름 대신 격자(`repeat(auto-fill, minmax(290px,1fr))`)를 쓴다. 제목 줄(`.mv-h`)은 전폭이고, 넘치면 세로로만 흐른다. `.mw-band` 는 `nowrap`+스크롤 대신 `flex-wrap` · `keep-all` 로 줄을 바꾼다.

증거: 1280 `변경 ›` 뒤 `#mw` 안 가로 넘침 요소 0(예전 `#l-b 942>607` · `.mw-band 304>299`). `#l-b` 의 columnCount=auto · columnRule=none 이다. 스크린샷 `regate/r2-left-open-1280.png`: 2×2 시점 카드, 경계선 없음, 띠 두 줄.

## 3. peek 줄 정보 손실

변경(`map.js renderPeek` · `map.css` §⑤):
- 말줄임을 없앴다. 고른 행 문구(읍면동 · 지번 · 클래스 · 면적 · 조치)는 `.pk-s` 칸 안에서 온전히 보인다.
- 탭 3개는 `.pk-t` 로 묶어 간격을 줄였다(구분점 여백). 1440 에서는 한 줄에 다 들어간다.
- 1280 에서 한 줄에 안 들어가면(`flex-wrap`) 넘김 · 탭 · 표 펼치기가 둘째 줄로 내려간다. 글자는 15px 그대로이고, 문구 토막과 스크롤바는 0 이다. 그보다 더 좁을 때만 `.pk-s` 가 가로로 밀린다.
- 판정 권고는 "1280 에서는 가로로 민다"였다. 그렇게 구현해 보니 스크롤바가 얇아서 화면에서는 여전히 `321-1 · :` 토막으로 보였다(1차 시도 캡처). 그래서 줄바꿈을 택했다. 대가로 1280 정보 판 비율이 0.579 에서 0.545 로 내려갔다(표 줄 약 30px). 1280 비율은 단언 대상이 아니다.

증거: 1440/1280 모두 `.pk-s`·`.row` 넘침 0, `text-overflow: clip`, 15px, 문구 끝 `· 발견`, 버튼 3종이 판 안에 있다. `regate/r3-peek-1440.png` · `r3-peek-1280.png`

## 4. 낱말 꺾임과 '시연' 중복

- `.mt-note` 에 `word-break:keep-all` 을 넣었다. `실자 / 료` 가 `실자료 없음` 으로 낱말 단위로 줄을 바꾼다(`regate/r4-layer-tab-1440.png`).
- `map-stats.js` 시연 기준 줄에서 라벨 접미 `· 시연 · 집계 자료 없음` 을 지우고, 태그를 `<em class="tag">시연 · 집계 자료 없음</em>` 하나로 합쳤다(`.dw-basis li .tag{flex:none; nowrap}`). 줄마다 '시연' 은 1회다(`regate/r4-stats-basis-1440.png`).

## 5. [재게이트 3] 좌 판 폭 전이 뒤 범례 재배치

원인은 둘이다.
- 전이 도중 한 번만 배치: `#l-open` · `#side-x` 복귀처럼 좌 판 폭이 바뀌는 경로에서는 `.mw-l` 이 36→690(1440) / 36→608(1280)px 으로 180ms 동안 늘어난다. 그런데 `positionOverlays()` 는 전이 첫 프레임에 한 번만 돌았다. 그때 잰 `#plates` 폭(711px)으로 narrow 판정이 틀렸고, 전이가 끝난 뒤에는 다시 돌지 않았다. 그래서 범례(bottom 48)가 시점 스트립(bottom 14)을 14,593px²(1440) · 21,752px²(1280) 덮었다.
- 표 판보다 먼저 배치: `renderAll()` 은 `renderPlate()` 안에서 배치한 뒤에 `renderBottom()` 을 불렀다. 그래서 표를 접거나 펼칠 때 판 높이가 옛 값인 채로 배치됐다.

변경(`map.js`):
- `boot()` 에 `#mw-l` 의 `transitionend` 핸들러 **하나**를 달았다(`e.target===#mw-l && propertyName==='width'`). 이 핸들러가 `A?.resize(); B?.resize(); anchors.forEach(place); positionOverlays()` 를 부른다. 좌 판 폭을 바꾸는 모든 경로(`#l-open` · `#side-x` 복귀 · `변화 결과 보기 ›` · `변경 ›`)가 여기를 지난다. 그래서 `[data-cmp-open]` 에만 있던 `setTimeout(…,260)` 은 지웠다.
- `renderAll()` 끝에서 `positionOverlays()` 를 한 번 더 부른다. 표 판 높이가 정해진 뒤에 배치하기 위해서다.
- `positionOverlays()` 는 먼저 지난번에 내렸던 범례 · 스트립을 다시 세운 뒤 크기를 잰다. 쌓을 높이도 나란히 설 폭도 없으면 시점 스트립을 내린다(`display:none`). 범례의 윗변이 판 위쪽 70px(검색 · `내보내기`)을 침범하면 범례도 내린다. 이 경우는 1280 · 좌 판 608 · 표 펼침 상태에서 판이 599×197px 일 때다. 표를 접으면 둘 다 다시 선다.
- `commit()` 이 `write()` 전에 `fitLeft()` 를 부른다. 전에는 `#side-x` 복귀 뒤 화면은 좌 판이 펴졌는데 주소에는 `left=off` 가 남았다. 새로 고침하면 좌 판이 접힌 채로 열렸다.

증거(`shots/w0/E0-5/regate3/`, 범례×스트립 교차 · 범례×`내보내기` 교차):

| 경로 | 1440×900 | 1280×720 |
|---|---|---|
| a. 정보 판 열린 채 `#l-open` (예전 14,593 / 21,752px²) | **0** · 0 · 쌓기(legend 174 · strip 48) | **0** · 0 · 쌓기 |
| b. 펴 둔 좌 판 → 행 클릭 → `#side-x` 복귀(표 펼침) | **0** · 0 · 쌓기 | **0** · 0 · 판 599×197 → 범례 · 스트립 내림 |
| c. 이어서 표 접기 | 0 · 0 · 쌓기 | 0 · 0 · 둘 다 다시 섬(쌓기) |

스크린샷: `a-l-open-{1440,1280}.png` · `b-side-x-{1440,1280}.png` · `c-fold-{1440,1280}.png`

## 테스트

**재게이트 3 뒤**: `npx playwright test tests/e2e/proto-map.spec.mjs --reporter=line` → **79 passed (1.4m)**. 아래 78건에서 `판 셋 동시 금지 양방향` 을 1440×900 · 1280×720 두 건으로 나눴다.
- ① `#l-open` 뒤 좌 판 폭 > 300 이 될 때까지 기다린 다음 +400ms 에 `#legend`×`#strip` 교차 0
- ② 정보 판 비율: 1440 은 ≥ 0.6, 1280 은 ≥ 0.5(§3 의 peek 두 줄 때문)
- ③ `#side-x` 복귀 → left=on · 교차 0
- ④ 표 접기 → `#legend` · `#strip` visible · 교차 0

재게이트 2 당시:

`npx playwright test tests/e2e/proto-map.spec.mjs --reporter=line` → **78 passed (1.3m)**. 76건에 새 테스트 2건을 더한 수이고, 기존 테스트 3건에 단언을 보탰다.
- 신규: `판 셋 동시 금지 양방향` (정보 판 → `#l-open` → side 닫힘 · 비율 ≥ 0.45 / 펴 둔 좌 판 → 행 클릭 → left=off · ≥ 0.6)
- 신규: `1280×720 겹쳐보기 좌 판 펼침` (가로 넘침 0 · `#l-b` columnCount auto · rule none)
- 보강: 겹쳐보기 테스트에 `#ch-base → [data-cmp-open]` 경로(left=off · ≥ 0.45)와 역방향 `#l-open`(판 닫힘 · ≥ 0.45)을 넣었다.
- 보강: peek 단언을 `over:0` 에서 `문구 넘침 0 · 말줄임 아님 · 15px · 조치 표기 · 버튼 3종 판 안`(1440·1280)으로 바꿨다.
- 보강: 레이어 탭 `.mt-note` 의 wordBreak=keep-all, 통계 시연 줄 '시연' 1회와 태그 문구.
- 법전 스캔 테스트(라운드 · 그림자 · 그라디언트 · 14px · 파란 채움)는 녹색이고 콘솔 오류는 0 이다.

## 부수

검증 스크립트 첫 실행에서 출력 경로가 퍼센트 인코딩되어, 스크린샷 8장이 `E:/Land-XI%20…/01.%20…/shots/w0/E0-5/regate/` 에 잘못 저장됐다. 이 파일들은 저장소의 `shots/w0/E0-5/regate/` 로 옮겼고, 내가 만든 빈 `w0/E0-5` 폴더만 지웠다. 그 경로에 원래 있던 `shots/audit-0923/` 는 다른 작업의 것이라 건드리지 않았다. 스크립트는 `fileURLToPath` 를 쓰도록 고쳤다.
