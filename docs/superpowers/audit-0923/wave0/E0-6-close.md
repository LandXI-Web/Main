# E0-6 마감 — 재게이트(regate:E0-6) must_fix 4건 + 재게이트 2(비중 띠 라벨 잘림) 해소

기준: 저널 `wf_d39cb88b-85f/journal.jsonl` label `regate:E0-6` result.must_fix. 커밋 없음(마감 단계 몫). 수정 = 소유 4경로 + `shots/w0/E0-6/` 신규 9장.

## 변경

| must_fix | 해소 | 파일 |
|---|---|---|
| 1. 패널 빈 띠 ≤ 80(1920×1017 100 · 1440×1000 92 · 1600×1000 92 · 1512×982 83 · 1440×980 82) | 행을 늘리지 않고 **실값으로 채움**: 탭 조판에서 행이 상한 58 을 넘을 자리만 `fitPanel()` 이 용량 목록 위에 **용량 비중 띠**(`.p-share` — 쌓은 막대 5칸 + `01 31% · 02 24% · 03 19% · 04 15% · 05 11%`)를 세운다. 값 = `db-data.js PROJECTS` 의 `gb ÷ 1,326`. 두 목록 조판·낮은 화면에선 내린다. 덧붙여 `--rh < 34` → `.dense`(1위 값 26→20px, 1680×1050 답답함 해소) · `--rh < 26` → `.tight`(값 17px) · 값 글자 `line-height:1`(두 목록 조판 목록 잘림 3–7px → 0–1). 1101×640 스토리지 탭이 19px 넘치던 것(위아래 −9) → 행이 하한 밑이면 스토리지 쌓은 막대를 내리고 행 바닥 21px. | `landxi/proto/dashboard.js` · `dashboard.css` |
| 2. 테스트 매트릭스에 1920×1017 · 1440×1000 | `한 화면` 매트릭스 `[1920,1017] · [1440,1000] · [1101,640]` 추가(paneBands ≤ 80 · 행 사이 ≤ 32 · 잘림 0 · 넘침 0, 두 탭). 새 테스트 3: `용량 비중 띠`(기대값을 `db-data.js` 에서 직접 계산해 대조 · 1920×1200 두 목록 조판에서는 숨김) · `낮은 행`(1680×1050, `--rh<34` 에서 1위 값 20px · 값 글자 간격 ≥ 4 · 잘림 ≤ 1) · `탭 호버 = 물리 반응`. | `tests/e2e/proto-dashboard.spec.mjs` |
| 3. 탭 호버 물리 반응 | `#tabs [role=tab]` · `#seg [role=tab]` 에 `::after` 2px 밑줄, `transform:scaleX(0→1)` · `transition: transform var(--hov)=180ms var(--hove)`. 선택 상태 색 규칙 그대로(e2e 가 `#tab-proj` 파랑 · `#seg-res` 흰 바탕 확인). | `dashboard.css` |
| 5. (재게이트 2) 비중 띠 라벨 잘림 — 1101–1300 폭에서 '05 11%' → '05 11' | `.p-pct span` `flex:none; overflow:hidden` → `flex:0 1 auto; min-width:max-content`. 칸 폭 = 몫(width:% 가 flex-basis)이되 라벨 폭 밑으로 줄지 않고, 모자란 만큼은 앞 칸이 몫에 비례해 양보. 줄임표 0. e2e `용량 비중 띠 라벨` 4건(1920×1017 · 1440×900 · **1280×800 · 1101×1000**): 칸마다 `scrollWidth ≤ ceil(clientWidth)+1` · `/^\d\d \d+%$/` · 마지막 칸 띠 안. | `dashboard.css` · `proto-dashboard.spec.mjs` |
| 4. 결과 문서 | ⑤ 에 재게이트 반영 항목 5 · 6(라벨 잘림) · 18 뷰포트 실측표 · '탭 + 비중 띠' 조건 문장(띠 없이 행 > 58 이면 세우고, 세워도 행 ≥ ROW_MIN+10 이면 둔다 — 1440×900 · 1280×800 도 해당) 추가, '남는 틈' 문단 삭제. ①·②·③ 의 건수·뷰포트·diff 갱신. | `E0-6-result.md` |

## 증거

- `npx playwright test tests/e2e/proto-dashboard.spec.mjs --reporter=line` → **37 passed (1.4m)**(전 27 + 매트릭스 3 + 신규 3 + 재게이트 2 라벨 4).
- 비중 띠 라벨 실측(칸 폭/글자 폭, px): 1280×800 `148/148 · 113/113 · 91/91 · 70/70 · 57/57` · 1101×1000 `116/116 · 89/89 · 71/71 · 57/57 · 57/57` — 5칸 모두 '0N NN%' 온전, 잘림 0(전: '05 11%' 가 42–53px 칸에서 '05 11').
- `node --test tests/unit/dashboard-cells.test.mjs tests/unit/dashboard-geo.test.mjs` → pass 12 · fail 0.
- 패널 안 실측(목록 위/아래, px) — 탭 조판: 1920×1017 **68/68** · 1440×1000 **60/60** · 1600×1000 60/60 · 1512×982 51/51 · 1440×980 50/50 · 1920×940 30/30 · 1440×900 19/19 · 1536×864 19/19 · 1366×768 15/15 · 1280×720 15/15 · 1101×640 14/14(스토리지 13/13, 전 −9). 두 목록 조판(1920×1040 이상 · 1680×1050 · 1280×1024 · 1920×1200 · 2560×1300): 가장자리 ≤ 18. 탭 조판 최대 높이(패널 ≈ 554) 추정 ≈ 71. 전체 표는 `E0-6-result.md` ⑤.
- 법전 확인: 새 규칙에 라운드·그림자·그라디언트·유리 0, 새 텍스트 14px(`.p-pct`), 색 = `#006DF7 · #010102 · #686868 · #CCCCCC · #DDDDDD` 뿐(기존 `색 역할` e2e 녹색).
- 스크린샷 `shots/w0/E0-6/`: `10-dash-1920x1017-proj.png` · `11-dash-1920x1017-store.png` · `12-dash-1440x1000-proj.png` · `13-dash-1680x1050-both.png` · `14-dash-1101x640-store.png` · `15-dash-1440x900-proj.png` · `16-tab-hover-90ms.png` · `17-tab-hover-done.png` · `18-seg-hover-done.png` · (재게이트 2) `regate-pct-1280x800.png` · `regate-pct-1101x1000.png` · `regate-pct-1440x900.png`.

## 남은 것

- 소유 밖 요청(④)은 그대로다: `tests/unit/cells.test.mjs` · `spikes/dash3d` 의 `dashboard-128` import, `review/masters.html` 문구, 셸 `#foot` 390 줄바꿈, 법전 §6 대시보드 줄 갱신, E1-6 관리 위젯 import.
- 두 목록 조판의 낮은 끝(1280×1024 · 1920×1025–1036, `--rh` 26)은 행이 촘촘하다. 넘침은 0–1px이고 값은 20px라 겹치지 않는다. 문턱을 조정할지는 E2-3 에서 판 배분과 함께 본다.
