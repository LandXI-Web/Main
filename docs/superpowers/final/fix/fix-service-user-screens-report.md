브리핑 확인: (① 숫자 한 출처 — 서비스 상태·대표 수치는 GET /summary 에서만, 지어내지 않는다 ② 화면 용어표 §2/§5 — 지어낸 용어·내부 말 0, 새 말 만들지 않기 ③ 판정은 로그인 폼으로만(세션 주입 금지) + 소유 파일(gov-fusion·gov-report·global)만 수정, 디자인 판단은 Fable 몫)

# fix-service-user-screens — 결과 보고

## 재확인 보완 (2차 · 2026-09-29) — 남원 390 도착 화면에 결과 필지가 안 보이던 문제
**원인(실측):** AI 분석 필지 층(`sv` · 필지 pmtiles 타일 z11–16)은 z11 아래에서 그려지지 않는다. 1차 수정의 `serverOpen` 카메라는 결과 필지 전체 범위(`goReady(pts bbox, maxZoom 15)`)로 맞췄는데, 결과가 남원 전역에 퍼져 있어 390 폭에서는 배율이 **10.93**(< 11)이 되어 필지가 하나도 그려지지 않았다(수정 전 경로는 대장 범위 · maxZoom 15.5). 1440 은 11.7 이라 정상.
**조치(`landxi/v3/gov-fusion/app.js` 한 곳):** `goResult()` 추가 — 결과 필지 범위로 맞춘 배율이 필지 층이 그려지는 배율(`SV_MINZ` 11.5) 아래면, 결과가 몰린 가운데(10–90%, 없으면 25–75% 범위)로 맞추고, 그래도 멀면 가운데를 11.5 로 연다. 영상·AI 결과가 있는 관할(`S.index`)에만 적용, 범위가 충분히 가까운 화면(1440)은 그대로. `serverOpen`(새 기기 재진입) · `reopen`(이 창 캐시 재진입) · `sweepIn`(새 대장 결합) 세 카메라 모두 이 함수로. 재진입 카메라는 결과가 3 초 안에 닿게 비행 1.8 s→0.9 s · 타일 예열 상한 1.6 s→0.5 s(재진입 두 곳만).
**확인(로그인 폼 `namwon-manager@namwon` · GPU 렌더 · 지도에 그려진 결과 필지를 `queryRenderedFeatures` 로 세고 큰 숫자 카드·아래 시트·마스트에 가린 것은 뺌):**

| 경우 | 폭 | 3 s | 4 s 이후(6 · 15 s 동일) | 결합 진행 표시 |
|---|---|---|---|---|
| 수정 전(1차 코드) | 390 | 배율 5.7 · 0 | 배율 10.93 · **그려진 결과 필지 0** | 0 |
| 새 브라우저 재진입 | 390 | 배율 11.49(카메라 도착) · 필지 타일 받는 중 | 배율 11.49 · 결과 필지 131 그려짐 · **가리지 않은 곳 121** | 0 |
| 같은 브라우저 다시 로그인 | 390 | 배율 11.49 · 131 / 가리지 않은 곳 121 | 같음 | 0 |
| 새 브라우저 재진입 | 1440 | 배율 11.7(카메라 도착) · 필지 타일 받는 중 | 131 / 가리지 않은 곳 131 | 0 |
| 같은 브라우저 다시 로그인 | 1440 | 배율 11.7 · 필지 타일 받는 중 | 131 / 131 | 0 |

- 시간(개발 모드 표시 기준, 페이지 열림부터): 결과 패널(큰 숫자·표) 2.1–2.4 s · 카메라 도착 ≈3.0 s · 결과 필지 칠 완료 3–4 s(필지 타일 도착). 결과 패널 기준 ≤ 3 s 합격, **지도 위 필지까지 ≤ 3 s 는 경계**(느린 쪽은 서버 결과 목록 `survey/findings` 응답 ≈0.9 s — 소유 밖).
- 390 에서는 결과가 몰린 가운데를 보여 주므로 관할 끝의 일부 결과 필지(약 10개)는 화면 밖 — 확대·이동으로 보인다. 전체를 한 화면에 넣으면 필지 층이 안 그려지는 배율이 되어 이것이 가능한 최선(배치 판단은 아래 Fable 칸).
- 증거: 수정 전 `recheck/before-refix-namwon-390-15000ms.png` / 수정 후 `recheck/namwon-{newbrowser,samebrowser}-{390,1440}-{3000,4000,6000,15000}ms.png` · 수치 `recheck/namwon-reentry-probe.jsonl`.
- 다시 잰 나머지 조건(이번 수정 후): 광주전남 `recheck/gj-{1440,390}.png` · `gj-status.jsonl`(해양쓰레기 실태조사 서비스 · 운영 · AI 탐지 1,857건 = summary, '영상 등록 필요' 0, 콘솔 오류 0) / 해외 `recheck/global-kgz-agri-{1440,390}-{season,ndvi,sprawl}.png` · `global-tabs.jsonl`(Sprawl 에서 HUD `Built area change · Ysyk-Ata 17.2 km²` · 실행 버튼 없음, Season·NDVI 는 `Crop condition drop · 117.8 km²` + `Run this season`) / forbidden CLI(`--login`, 이제 로그인 폼 통과함) 남원·광주전남(gov-fusion·gov-report)·해외(global) 1440·390 **금지어 0 · 콘솔 오류 0** — `recheck/forbidden-*.json`.
- 참고: 1440·390 모두 그려진 결과 필지가 131개로 큰 숫자 431필지보다 적다(배율 11.5–11.7 에서 받은 필지 타일 기준). 수정 전 경로도 같은 타일을 쓰므로 이번 변경과 무관 — 낮은 배율 필지 타일에서 작은 필지가 빠지는지 타일 쪽 확인이 필요(아래 요청 5).


## 바꾼 파일
| 파일 | 바꾼 것 |
|---|---|
| `landxi/v3/gov-fusion/app.js` | (2차) `goResult()` — 재진입·결합 카메라가 결과 필지 층이 그려지는 배율(≥ 11.5) 아래로 내려가지 않게, 재진입 비행 0.9 s. ① `GET /summary`(기관 세션) 를 첫 로딩에 함께 읽음. '영상 등록 필요' 는 summary `imagery.has=false` 이고 그 서비스에 AI 결과도 없을 때만(`showStatus` · `imageryOf`). 영상이 있고 이 화면용 AI 색인이 없는 관할은 좌하단에 summary 의 서비스 이름 · 단계 · 대표 수(예: 해양쓰레기 실태조사 서비스 · 운영 · AI 탐지 1,857건)를 그대로 표시. summary 를 못 읽으면 카드 자체를 숨김(상태를 지어내지 않음). 필지 카드·Ctrl K 의 '영상 등록 필요' 도 같은 판정(영상 있음 → 'AI 분석 전'). ② 재진입(이미 결합한 올린 대장) = 결합 진행('필지에 이어 붙이는 중')·서→동 스윕을 다시 틀지 않음: `serverOpen` 은 서버 결합 결과로 곧바로 결과를 그리고 AI 색인·카메라는 뒤에서, 이 창에 남은 올린 대장은 새 `reopen()` 으로 같은 방식. 진행 표시는 새 대장 업로드(`join()`)에서만. V-World 상한 확인(`verifyCapped`)은 결과를 막지 않게 뒤로. ③ 받는 중 큰 숫자 = '불러오는 중'(키트 빈 값 대신). |
| `landxi/v3/gov-fusion/gov-fusion.css` | 좌하단 서비스 상태 카드(`.gf-status` · `.gf-svc*`) 최소 배치 — 기존 영상 등록 카드 자리 그대로, 390 은 상단. |
| `landxi/v3/global/app.js` | HUD 가 탭을 따름: Season·NDVI = `Crop condition drop · {district}`(NDVI 기준 작황 하락 · 명세 그대로), Sprawl = `Built area change · {district}`(2025 − 2017 건물 면적, 같은 격자 자료 · ~ 추정치). 탭 누를 때 HUD 다시 그림. Sprawl 탭은 실행 버튼 0(명세 §2.15 개정표 'Sprawl 탭 행동 0' — 계절 실행은 건물 면적을 만들지 않음). |
| `landxi/v3/gov-report/**` | 변경 없음 — 보이는 글자에 금지 용어 0(검사 결과 아래). 결과 확인 기록 표식은 lx-review 가 읽는 기계용 값(화면에 안 보임)이라 그대로 둠. |

## 완료 조건 확인(로그인 폼 · 세션 주입 없음)
| 조건 | 결과 | 증거 |
|---|---|---|
| 광주전남 담당자: 해양쓰레기 상태·수 = summary, '영상 등록 필요' 오표시 0 (1440·390) | 합격 — summary(gj 세션) `card-marine · 운영 · detected 1,857` 과 화면 '해양쓰레기 실태조사 서비스 · 운영 · AI 탐지 1,857건' 일치, '영상 등록 필요' 0 | 전 `before-gj-1440-0.png` `before-gj-390-0.png` / 후 `after-gj-1440-0.png` `after-gj-390-0.png` |
| 남원 담당자 재진입: 결합 재생 없이 ≤ 3s 결과, 390 결과 가림 0 | (1차 판정은 카드·시트 겹침만 봐서 틀렸음 — 390 지도에 결과 필지 0. 2차 보완 후 위 '재확인 보완' 표 참고) 1차 기록: 전 4.7s(결합 진행 0.9→4.7s 노출) / 후 1.9s(1440) · 2.4s(390), 진행 표시 0회, 390 큰 숫자 카드 하단 188px < 시트 상단 540px(겹침 0) | `before-namwon-1440-0.png` `after-namwon-1440-0.png` `after-namwon-390-reentry-at-result.png` `after-namwon-390-reentry-3s-later.png` |
| 해외 계정 탭 전환 시 히어로 값·라벨 변경, 버튼 문구 = 탭 | 합격 — Season/NDVI `Crop condition drop · Ysyk-Ata 117.8 km²` + `Run this season` → Sprawl `Built area change · Ysyk-Ata 17.2 km²` + 실행 버튼 없음(Download 만). 전에는 세 탭 모두 같은 HUD + `Run this season` | 전 `before-global-1440-{season,ndvi,sprawl}.png` / 후 `after-global-1440-*.png` `after-global-390-*.png` · `forbidden/kgz-agri-390-tabs.json` |
| forbidden 세 앱 '지어낸 용어' 0 · 콘솔 오류 0 | 합격 — 남원·광주전남(gov-fusion · gov-report 할 일 · 보고서 탭) · 해외 2계정(global) 1440·390 모두 금지어 0건, 콘솔 오류 0 | `shots/fix/fix-service-user-screens/forbidden/*.json` |
| gov-report 종이비행기 일러스트 | Fable 에게 넘김(아래) | `after-namwon-pages-1440-2.png` |

글자·버튼(첫 뷰): 남원 gov-fusion 217자·7 / gov-report 할 일 335자·8 · 광주전남 gov-fusion 137자·5 · global(Season) 197자·7(전 Sprawl 207자 → 예산 200 안).

### 검사 방법 메모
`forbidden.mjs --login` CLI 는 1차 검사 때 로그인 화면에서 멈췄으나 지금은 해결됨 — 로그인 폼을 정상 통과한다(위 재확인 절의 `recheck/forbidden-*.json`). 1차 검사 때는 스크래치 하네스로 **같은 로그인 폼**(역할 라벨 클릭 → 기관 선택 → 아이디·비밀번호 입력 → Enter)을 거친 뒤 `forbidden.mjs` 의 `scan(document)` 을 그대로 불러 쟀다(규칙 동일, '지어낸 용어' 포함).

## 남은 것
- 남원 390px: 지도 위쪽(큰 숫자 카드 아래 ~300px 띠)에 육지인데 바다색 칸이 남음 — 수정 전에도 같음(이번 변경 탓 아님). 같은 범위 타일을 직접 불러 보면 841장 모두 정상으로 와서 타일 파이프라인(land.js) 문제는 아님 — 지도 위쪽 여백(pad top)이 클 때 타일 선택이 빠지는 쪽으로 의심, 원인 미확정.
- 재진입 중 '이 창 캐시' 경로(`reopen`)는 코드로만 확인: 새 대장을 실제로 올리면 남원 공용 데이터에 새로 올린 대장(최근 올린 대장·규칙 결과)이 생겨 다른 정비 작업의 숫자가 바뀌므로 올리지 않았다. 로그인 폼 새 브라우저 재진입(서버 기록 경로)은 위처럼 실측.
- gov-report '판정 대기'(할 일 큰 숫자)는 실태조사 상태 기록(배정+확인됨) 수라 summary 계약에 같은 항목이 없다 — 이름이 달라('결과 확인 대기'와 다른 지표) 충돌은 없음. summary 로 옮길지는 요청 4.

## 사용자 결정 필요
- global Sprawl HUD 라벨 `Built area change · {district}` — 명세 §4-7 허용 라벨 밖(Crop condition drop 만 있음). 내려받기 표의 기존 말 'Built area' 를 그대로 썼다.
- global NDVI 탭 HUD 는 Crop condition drop(NDVI 기준 작황 하락) 유지. NDVI 탭만의 값(예: 최근 달 NDVI 평균)을 큰 숫자로 둘지는 §4-7(큰 숫자 = 업무 결과만)과 부딪혀 결정 필요.

## 요청(소유 밖)
5. (필지 타일) `landxi/data/survey/<기관>-parcel-survey.pmtiles` — z11–12 타일에 결과 필지가 전부 들어 있는지 확인(390·1440 도착 화면에서 그려진 결과 필지 131 < 큰 숫자 431). 낮은 배율에서 작은 필지가 빠지면 결과 필지만은 남기게(tippecanoe `--no-tiny-polygon-reduction` 류).
6. (용어 확인) 서비스 단계 `운영`(summary `stage`, 서비스 카드 상태 칩 공통)을 명세 §5 '운영(단계 이름) → 서비스 관리'에 맞춰 바꿀지 — 여러 화면이 같은 서버 값을 그대로 보이므로 gov-fusion 만 바꾸면 화면마다 말이 달라져 이번엔 그대로 둠. 바꾼다면 summary·kit 쪽에서 한 번에.
1. `landxi/v3/kit/lint/forbidden.mjs` `frontDoor()` — 로그인 역할 선택이 `getByRole('radio',{name:/기관/})` 클릭인데 라디오가 시각적으로 숨고 `<span>` 이 가로채 30s 타임아웃 → 모든 `--login` 검사 실패. `label.seg__c:has(input[value=tenant|admin|staff])` 클릭(또는 `check({force:true})`) 로 바꿔 주세요.
2. `server/landxi_api/summary.py`(fix-server-summary) — 광주전남 `card-marine`(sgg 12130) 이 `stage 운영 · detected 1,857` 인데 `imagery.has=false, label null`. 여수 항공영상이 실제 깔려 있으므로 카탈로그 영상 대조(옛 코드 46130 ↔ 통합 코드 12130 추정)를 맞춰 주세요. 화면은 '결과가 있으면 영상 있음'으로 방어해 두었음.
3. 이름 한 가지 — 기관 디렉터리 `광주전남특별시`(마스트) vs summary `region_name` `전남광주통합특별시 여수시`. 같은 기관이 두 이름으로 보임.
4. (선택) gov-report '판정 대기'를 summary 에서 읽게 하려면 계약에 `verdict_pending{label:'판정 대기'}` 추가.

## Fable 에게 넘길 것
0. **gov-fusion 390 재진입 첫 화면 구성** — 결과가 관할 전역에 퍼진 기관은 390 폭에서 전체 범위를 한 화면에 넣으면 필지가 안 그려지는 배율이 된다. 지금은 결과가 몰린 가운데로 여는 기능 정비만 했다(`recheck/namwon-newbrowser-390-4000ms.png`) — 관할 끝 결과를 어떻게 알릴지(예: 화면 밖 결과 표시) 구성 판단.
1. **gov-report 보고서 탭** — 읍면동을 고르기 전 판 절반을 차지하는 큰 3D 종이비행기(항공기 스틸) 일러스트(`after-namwon-pages-1440-2.png`). 보고서 초안 빈 상태의 구성·크기 판단.
2. **gov-fusion 서비스 상태 카드**(광주전남처럼 영상은 있고 이 화면용 AI 색인이 없는 관할 · `after-gj-1440-0.png` 좌하단) — 이번엔 기능 정비로 기존 카드 자리에 summary 문구(서비스 이름 · 단계 · 대표 수)만 최소 배치. 시각 완성도·배치 판단 필요.
3. **gov-report 할 일 빈 상태(광주전남)** — '첫 결과 전 / 배정한 필지가 아직 없습니다' 카드에 큰 위성 스틸이 판 절반(`after-gj-pages-1440-1.png`) — 첫 화면이 비어 보이는 문제와 같은 결.
4. **global Sprawl HUD** — 새 라벨 확정 시 HUD 표기·호버 문구 다듬기.
