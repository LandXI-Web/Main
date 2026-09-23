# E0-5 결과 — XI맵 붕괴 처방 · 내려받기 3곳 · 정직화 · `?result=` 수신

## ① 한 줄 결과

1440×900 에서 결과 켜기 → 표 펼치기 → 행 클릭 흐름의 지도 몫이 **9 % → 63.2 %**(`#mw` 대비)로 올라갔다. 좌 판은 서랍 · 정보 판 · 비교 모드에서 띠로 접히고, 정보 판이 열린 동안 하단 표는 고른 행 한 줄(peek)로 바뀐다. 겹쳐보기에서 비교 판은 자동으로 열리지 않는다(A 91.1 %). 내려받기 3곳은 실제 파일(GeoJSON 1 · BOM CSV 2)을 준다. 시연 통계 기준 · 가짜 '다시 계산' · 비교 띠 상수 · 죽은 비교 도구 14 · 레이어 탭 12줄은 실동작이 되거나 `시연` 표기와 함께 막혔다. `?result=` 는 수신 뒤 `?on=` 으로 정규화되고 900ms 동안 그 결과 범위로 날아간다. `proto-map.spec.mjs` **76/76 녹색**(기존 71 + 신규 5).

> 경로 메모: 오케스트레이터 지시문은 `shots/wave0/E0-5/`·`E0-5-report.md` 를 적었지만, 브리프의 `new_files_allowed` 는 `shots/w0/E0-5/**`·`E0-5-result.md` 다. 허용된 쪽을 따랐다.

## ② 완료 기준별 증거

| # | 기준 | 증거 |
|---|---|---|
| 1 | 정보 판 열림 캔버스 ≥ 60 % · 겹쳐보기 A ≥ 45 % · 세로 글자 쌓임 0 | `map.js:167-173` `fitLeft`: `crowded() = drawerOpen() \|\| S.side==='info' \|\| S.mode!=='basic'`. `leftAuto` 는 자동으로 접은 것만 되돌리고 `leftPinned` 는 존중한다. `map.js:715 renderPeek` 는 정보 판이 열린 동안 표 352px 를 44px 한 줄로 바꾼다(‹ 이전 · 다음 › · 탭 3 · 표 펼치기). 비교 판 자동 열림은 제거했다(`map.js` `cmpOpen=false`, `변화 결과 보기 ›` 단추 `[data-cmp-open]`). CSS `map.css` E0-5 절 ①(`.mb-t` · `.mb-h .crumb` · `.mw-band` 가로 스크롤 + nowrap). 실측 `shots/w0/E0-5/shots.json`: info-1440 **63.2 %** · overlay-1440 **91.1 %** · overlay(결과 판 연 상태)-1440 63.1 % · info-1280 57.9 % · overlay-1280 88.8 %. 재촬영 `critique2.mjs` 는 1440.infoSide `canvasW 922 × H 677` · `tallerThanWide 0`(자기 분모 57 %), 1920 은 66 %. `x22-info-side.png` · `x28-overlay.png` · `crit-05-info-1440.png` 에서 세로 쌓임 0. |
| 2 | download 3곳 각 1건 | spec `내려받기 3곳` 로그 `E0-5 downloads [{"name":"남원시 농지이용 현황 · 2026.06.08.geojson","bytes":1293982},{"name":"농지 활용 통계 · 2026.06.08.csv","bytes":1338,"bom":true},{"name":"2026년 4월 농지 활용 현황 보고서.csv","bytes":1360,"bom":true}]`. GeoJSON features 2,098 을 단언했다. 구현: `download.js:57 downloadCSV`(추가만 · 기존 3 함수 diff 0 · 삭제 줄 0), `map.js:1164 doExport`(쌍 거르개 레이어는 거른 도형만), `map-stats.js:136 statsCsv`, `map-report.js:209 reportCsv`. 토스트는 `N개 파일이 내려갔습니다 · …` 로 사실만 말한다. 촬영 `dl-01-export.png` · `dl-02-stats-csv.png` · `dl-03-report-csv.png`. |
| 3 | 시연 기준 disabled + 문구 · '다시 계산' 0 · 거르개 실동작/제거 | `map-stats.js:42` 시연 기준은 `input[disabled]` + `· 시연 · 집계 자료 없음`(2줄)이다. `통계 보기` 토스트는 `기준 · {제목} · {n} 필지 · {k} 읍·면·동` 이다. `분석 결과 찾기`: 기간 칩은 `D.monthsAgo` 로 AS_OF 기준 실제로 거른다(1개월 → 1행 · 3개월 → 3행 · 전체 → 4행, spec 단언). 기준일 from/to 와 검색 항목도 실제로 거른다. 거를 자료가 없는 **실행자 select 는 DOM 에서 제거**했다. 보고서 내역(`map-report.js:104 list`)도 검색 항목 · 발급 일자 · 기간 칩을 실제로 거른다. `grep '다시 계산' map*.js` → 주석 1건뿐(화면 문구 0). |
| 4 | 비교 띠 · 표 상수 0 | `map-data.js:160-178` `EPOCHS[].kind`(imagery.js `kind` → `정사영상`) · `areaKm2`(bounds 구면 면적) · `resultsOfEpoch` · `changeBetween`. 띠: 기준 2025.04 = `판독 결과 —`(그 시점 판독 결과 없음), 비교 = `변화 156 건`(change.js 쌍). 표: 영상 종류 · 범위 · 판독 결과가 모두 데이터 값이다. 쌍이 없는 시점 조합은 `—` 와 빈 상태를 보인다. `2,098`·`0.62 km²`·`드론` 리터럴은 map.js 에서 0건이다(bounds 로 잰 값이 우연히 0.62 km² 라 spec 은 문자열 대신 계산값과 비교한다). |
| 5 | 비교 도구 14 data-tool + 핸들러 · 레이어 12줄 | `map.js cmpToolsHtml/cmpClick`: 좌·우 7개씩 `data-tool`. 검색(시연 목록 → 그 판 flyTo) · 배경(두 판) · 측정/그리기/관심 구역(`toolsA`/`toolsB = GL.tools(B)`) · 내보내기 · LX(읍면동 경계 · 지명 · 분석 영역 · 판별)를 잇는다. 재촬영 audit 로그: `compare tool click changes DOM true` · critique `overlay.toolButtons {"count":14,"withHandler":14}`. 레이어 탭 12줄: `input[disabled]` 12 + `<em class="tag">시연 · 지도 미연결</em>` 12 이고 기본 체크 0이다(가짜 체크 `lt-farm-2 · lt-fac-2` 제거). 실자료가 붙은 리프(`leaf.layer`)는 결과 체크와 같은 길로 켜지지만 현재 0이다. 촬영 `07-layer-tab-1440/1280.png`. |
| 6 | `?result=` → 자동 체크 + fit 900ms | `map.js:39-53`: 결과를 on 맨 앞에 넣고 `S.result=''` 로 둔 뒤 `write(S,false)` 로 `?on=` 에 정규화한다(replaceState). 판은 개관 z8.6 에서 시작해 `GL.fit(bbox)`(기존 900ms)로 날아가고, 도착하면 `#map-a[data-arrived]` 가 붙는다. spec: 체크됨 · 줌 차 > 0.5 · `on=namwon-farmland-2025` · `result` 없음. `?cell=` 은 받지 않는다. 프레임 `arrive-frame-00..09.png`(z 8.92→9.56→9.77→9.79, 앞 5장은 서로 다르고 뒤 5장은 도착 후 정지다. 캡처 1장이 약 150ms 라 이동 구간에는 5장만 들어갔다). |
| 7 | 발급 폼 오류 해제 · 요청자 = 역할명 | `map-report.js:242 clearFixed` 는 `syncIssue` 와 제목 `oninput` 에서 채워진 칸의 `.err` · `aria-invalid` 를 걷는다. 요청자는 `shell.js role.name`(staff → `LX 직원`), 접수 일자는 `D.stamp() = AS_OF 2026-06-08` 이다(벽시계 제거). 서약서 `신청자 : LX 직원 님` 이고, 활용 기간 기본값은 AS_OF 부터 1개월(`D.today()` = AS_OF, Q5-b)이다. spec 단언 포함. |
| 8 | spec 71 + 5 녹색 | `npx playwright test tests/e2e/proto-map.spec.mjs --reporter=line` → **`76 passed (1.2m)`**. 역할 픽스처 `bootAs` 는 00-COMMON 코드를 그대로 복사했다(기본 staff · M-R2). |
| 9 | map-gl.js · download.js 기존 export diff 0 | `git diff --stat -- landxi/proto/map-gl.js` → 변경 없음. `download.js` 는 `+10` 이고 삭제 줄은 0이다(`downloadCSV` 1개 추가). |

## ③ `git diff --stat`(이 에픽 소유 파일)

```
 landxi/proto/download.js     |  10 ++
 landxi/proto/map-data.js     |  30 +++-
 landxi/proto/map-pledge.js   |   6 +-
 landxi/proto/map-report.js   |  51 +++++--
 landxi/proto/map-stats.js    |  71 ++++++---
 landxi/proto/map.css         |  49 +++++++
 landxi/proto/map.js          | 340 ++++++++++++++++++++++++++++++++-----------
 tests/e2e/proto-map.spec.mjs | 211 +++++++++++++++++++++++++--
 8 files changed, 636 insertions(+), 132 deletions(-)
```
(작업 트리의 다른 변경 — shell.js · roles.js · dashboard · dataset · login 등 — 은 병렬 에픽 것이다. 이 에픽은 건드리지 않았다. `map-gl.js` 변경 0.)
새 파일: 이 문서, 그리고 `shots/w0/E0-5/**`(git 무시 경로. `shots.mjs` · `measure.mjs` · 복사한 `audit.mjs`·`critique.mjs`·`critique2.mjs` 와 그 산출물).

## ④ 소유 밖 요청

| 파일:줄 | 값 | 이유 | 받는 에픽 |
|---|---|---|---|
| `landxi/proto/shell-gate.js` MENU | `report-standard-issue.html:'map'` · `map-drift.html:'map'` 추가 | M-R1. 레일에서 숨긴 두 화면이 주소 직접 입력으로 역할 관문을 우회한다. | 셸/관문 에픽 |
| `landxi/proto/map-gl.js:266 fit` | (추가만 · E0-S 이후) `o.easing` 을 받아 법전 이징 `cubic-bezier(0.15,1,0.3,1)` 으로 | `?result=` 도착 900ms 는 지금 MapLibre 기본 이징이다. 시그니처 동결 때문에 이번엔 손대지 않았다. | E2-0 |
| `landxi/assets/data/imagery.js` 남원 4시점 | `sensor: 'drone'` 필드 | 비교 표 `영상 종류` 가 `kind: ortho` → `정사영상` 까지만 말한다. 드론 여부는 자료에 없어 적지 않았다(상수 제거). | 데이터 소유자 |

## ⑤ 남은 것 · 알려진 결손

- **1280×720 정보 판 상태는 57.9 %**다(기준은 1440 만 요구). 좌 띠 36 + 정보 판 410 이 고정이라 60 % 를 넘으려면 PLATE-FULL(E1-9)이 필요하다.
- `?result=` 도착 줌은 결과 bbox(남원 전역)라 z9.8 이다. 개관 → 전역의 짧은 이동이며, 필지 줌으로 들어가는 연출은 E1-9/E2-0 몫이다.
- 레이어 탭 12줄은 전부 원본 시드라 켤 수 있는 줄이 0 이다. `leaf.layer` 연결 자리는 있다(`map-data.js leafLayer`).
- 통계 `분석 결과 찾기` 는 시연 기준을 고를 수 없으므로 `확인` 은 실 결과만 받는다. 비교 모드의 `검색` 은 시연 검색 목록(SEARCH_SEED) 이동이고, 실 검색은 E2-1 이다.
- 영업 계정(Q4) CTA 차단은 이 브리프 범위 밖이라 반영하지 않았다(지도 `내보내기` · 조치 상태가 영업에게도 보인다 → E1-9 / 역할 에픽).
- 재촬영 audit 의 `report 엑셀 download null` 은 그 스크립트가 `1개월` 칩을 누른 뒤 `.dl` 을 찾기 때문이다. 칩이 이제 실제로 걸러 행이 0 이 된다(정상 동작). 보고서 CSV 는 spec · `shots.mjs` 에서 1건을 확인했다.
- 완료 기준 3의 `select option[disabled]` 는 이 화면의 기준 목록이 select 가 아니라 **라디오 목록**이라 `input[type=radio][disabled]` 로 구현했다(spec `.dw-basis input[disabled]` = 2).

## ⑥ 재판정(불합격 3건) 수정 · 2026-09-24

| 지적 | 수정 | 실측(`shots/w0/E0-5/v8.mjs` → `v8.log`) |
|---|---|---|
| 겹쳐보기 `변경 ›` → 좌 판 690 + 비교 결과 판이 함께 서서 지도 붕괴 · A/B 표지 띠 교차 | `map.js cmpClick` `#ch-base/#ch-cmp` 에서 `cmpOpen=false` 먼저(commit → `renderCompareSide` 가 판을 닫고 resize). 새 `untangleHeads()` — 두 띠 rect 를 실측해 겹치면 B 띠(+B `.mw-sub`)를 A 띠 아래로 내림. 좌 판 폭 전이 뒤에도 재측정하도록 `.mw-plate--a` ResizeObserver. `map.css` 겹쳐보기: A 띠 = 세로 열(힌트 다음 줄) · 폭 상한 = 스와이프 선까지, B 띠 폭 상한 = 선 오른쪽까지(기존엔 선 왼쪽이 clip-path 로 잘려 `비교 대상`→`상`) · 띠 안 줄바꿈(`keep-all`) · `.mw-scale` nowrap | 1440: 변경 › 후 캔버스/#mw **0.463** · 띠 교차 **0** · 비교 판 닫힘 · 축척 띠 203×26 ×2. 1280: **0.454** · 교차 **0**(B 띠 top 222 > A 띠 bottom 212 로 내려감) · 축척 181×26 |
| `.mv-k` 배지가 `.mv-m`(판독 결과 2,098 필지 · 1,674 필지) 를 덮음 | 배지를 절대 배치 → 제목 줄(`.mv-tr` flex-wrap) 인라인으로 이동. `.mv > div{min-width:0; flex:1 1 auto}` | 4 시점 각각 클릭 × 1440/1280 — 배지·`.mv-m` 교차 면적 **0**, `.mv-m` 잘림 **0** |
| `.mb-peek` 1280×720 탭 3 · `표 펼치기` 화면 밖(946 > 762) | `.mb-peek .row{flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis}` + 전체 문구 `title` · 글자 15px 그대로 | 1280: scrollWidth 762 = clientWidth 762 · `‹ 이전` `다음 ›` 탭 3 `표 펼치기` 전부 판 안 · 가로로 섬. 1440: 922 = 922 |

회귀 테스트: 기존 두 E0-5 테스트에 단언 추가(개수 76 유지) — 겹쳐보기 테스트 끝에 `#ch-base` → data-left on · side≠info · ratio ≥ 0.45 · 띠 교차 0 · 배지 교차 0 · 축척 띠 세로 쌓임 0, 정보 판 테스트에 1280×720 peek 넘침 0 · 버튼 밖 0 · 15px.
`npx playwright test tests/e2e/proto-map.spec.mjs --reporter=line` → **76 passed**.
스크린샷: `shots/w0/E0-5/v8-cmp-left-open-{1440,1280}.png` · `v8-cmp-epochs-*` · `v8-overlay-nopair-*` · `v8-peek-*`.

남은 것: 1280 겹쳐보기 좌 판 펼침 직후, 헤드리스 캡처에서 2025.06 행 아래에 접힌 띠의 세로선 **잔상**이 남는 경우가 있다(`v8-probe.png` — DOM 에 해당 요소 없음, 강제 리페인트 시 사라짐 · `contain:paint` 로는 안 없어져 되돌림). 실 브라우저 재현 여부 미확인.
