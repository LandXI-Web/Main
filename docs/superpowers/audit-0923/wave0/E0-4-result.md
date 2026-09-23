# E0-4 결과 — 분석 서비스: 다운로드 · 영업 caps · 새 실행 결과 연결 · 기준일 · 문구

## ① 한 줄 결과

닫았다. 다운로드가 실제 `.geojson` 파일(1,293,982 B)을 내려주고 pageerror는 0이다. 영업 계정은 실행·편집·취소·이식·공유·삭제 버튼을 **비활성**으로 보고 이유 한 줄('열람 계정 — 실행·수정은 LX 직원')을 읽는다. 업로드 입구는 없다. 직원의 새 실행은 같은 서비스의 실측 결과를 `시연`으로 가리키고 '분석 결과 보기'를 누르면 완료 탭의 그 실행이 열린다(도형 2,098 · 표 5행). 기준일은 셸 하나(2026.06.08)만 남겼다. `proto-analysis.spec.mjs`는 **44/44 녹색**이다(기존 40 + E0-4 4. 브리프의 '37'은 실제 개수와 다르다).

## ② 완료 기준별 증거

| # | 기준 | 증거 |
|---|---|---|
| 1 | download 1건 · pageerror 0 | `analysis-run.js:14` `import { downloadGeoJSON, downloadNote } from './download.js'` · spec `E0-4 ①`(suggestedFilename `.geojson` · 크기 > 0 · errs `[]`) · `shots/w0/E0-4/shots.json` `download-1440 = { name: "남원시 농지이용 현황.geojson", bytes: 1293982, errs: [] }` · 토스트는 `how`에 따라 '원본'/'요약'/.txt 안내로 나눈다 |
| 2 | sales 비활성 + 문구 · 업로드 0 · a4 네 값 false | `analysis-run.js` `VIEW_ONLY`·`hint()`·`off(cap)` · `#go-run`/`#rp-cancel`/`#rp-retry`/`#ed-open`/`#dp-share`/`#dp-del` 비활성 · `analysis-cards.js` `#cd-run`·`#tp-open` 비활성 + `?pick=transplant` 딥링크 차단 · `#from-up`·`.up-box`는 `allowed('upload')` 거짓이면 그리지 않음 · `?edit=1` 딥링크도 `allowed('edit')`로 막음 · spec `E0-4 ②` · `shots/w0/E0-4/a4.json`: `salesRunStarted:false · salesEditing:false · salesCancel:false · salesTp:false`(그리고 `salesTpShown/salesEditShown/salesCancelShown:true` = 숨기지 않았음 · `salesUploadBtn:false` · `salesDown:true`) · log `[]` |
| 3 | 새 실행 → 그 실행 · 도형 · 표 · 시연 / 실측 없는 카드는 이유 | `analysis-data.js` `resultForRun(serviceId, imageryId)`(같은 service에서 영상 지역이 맞는 것을 우선) · `startRun`의 `resultId`·`demo:true` · 완료(`p>=100`)면 '분석 결과 보기' → `commit({tab:'done',run:id})` · 실행중 탭에서 보던 실행이 끝났으면 같은 규칙으로 넘긴다 · 완료 판 `#dp-demo 시연` + `.dp-src '이 실행은 같은 서비스의 실측 결과를 시연으로 보여 줍니다 · 원본 …gpkg'` · 없으면 `#dp-none '산출물 없음 — {서비스}의 실측 결과가 결과 대장에 없습니다'` · e2e 훅 `window.__an.featureCount` · spec `E0-4 ③` · shots.json `newrun-1440 = { url: …tab=done…run=run-new-…, featureCount: 2098, resultId: namwon-farmland-2025, rows: 5 }` |
| 4 | 08-27 = 0 · 마스트 2026.06.08 | `grep -n "08-27\|08\.27" landxi/proto/analysis*.js` → 0줄 · `analysis.js` `asOf` 삭제 · `analysis-data.js` `export { AS_OF } from './shell.js'`(값이 한 곳에만 있다) · spec `E0-4 ④`(`#mast-asof = 2026.06.08` · 두 AS_OF 동일) · `04-mast-asof-*.png` |
| 5 | 개발자 말투 4문구 0 · 김○○ 0 · 처리 단위 한 줄 | '화면은 카드 이름을 모른다…' → '이 카드의 종류 선언이 켜는 장치입니다.' · '법정 조사 주기는 레지스트리에 없다…' → '조사 주기 · 준비 중 — 지금은 배포본 연혁을 보여 줍니다.' · '원천 대기 — 이 카드의 선언이 켠 자리다' → 장치별(드론 영상 없음 / 선형 기준 레이어 / 밀도·시계열 준비 중) · '시드 실행 · 지도에 올릴 도형이 없다' → '시연 실행 · 결과 산출물이 없습니다' · grep 4문구 0 · `김○○` analysis*.js 0(원래 없었음) · `analysis-run.js:217` '처리 단위 진행 · 시연 · 1 단위 = 선택 영상 1,000 m²' · `analysis-kind.js` NO_SOURCE 3문구 합니다체로(문구만) |
| 6 | spec 녹색 | `npx playwright test tests/e2e/proto-analysis.spec.mjs --reporter=line` → **44 passed (52.6s)**. `boot()`는 00-COMMON의 `bootAs(page,url,'staff')`로 바꿨다. 작업 전 기준선은 역할 없는 boot 때문에 7 passed였다 |
| 7 | 스크린샷 · 소유 밖 0 | `shots/w0/E0-4/`: `01-sales-run-disabled-{1440,1280}` · `02-done-download-toast-*` · `03-new-run-done-*` · `04-mast-asof-*` + 보조 `01b-sales-shelf-disabled-*` · `01c-sales-done-disabled-*` · `03a-new-run-progress-*` · `03b-new-run-complete-*` · a4 재촬영 70–77 · 두 폭 모두 가로 넘침 0 |

## ③ git diff --stat(소유 파일만 · 다른 에픽의 병렬 변경은 제외하고 경로를 한정해 뽑음)

```
 landxi/proto/analysis-cards.js    |  21 ++++----
 landxi/proto/analysis-data.js     |  13 ++++-
 landxi/proto/analysis-kind.js     |   8 +--
 landxi/proto/analysis-run.js      |  99 +++++++++++++++++++------------
 landxi/proto/analysis.js          |   2 +-
 tests/e2e/proto-analysis.spec.mjs | 121 +++++++++++++++++++++++++++++++++++++-
 6 files changed, 208 insertions(+), 56 deletions(-)
```
새 파일: `shots/w0/E0-4/**`(git status에 나타나지 않음 — 무시 규칙 대상으로 보인다) · 이 문서.
`analysis-map.js` · `analysis.css` · `download.js` · `roles.js` · `cards.js` · `results.js` · `publish-*.js`는 건드리지 않았다.

## ④ 소유 밖 요청

- 없음(필수). 아래 참고 한 건:
  - `analysis-cards.js`(내 소유)의 `#to-project '이 카드를 만든 프로젝트 ›'`는 영업 계정에서 `ai-project.html` → 관문 → `ximap.html`로 튕기는 막다른 길이다(a4 `salesProjClick`). 브리프 범위 밖이라 두었다. E2-2 또는 다음 웨이브에서 `allowed('build')` 거짓이면 링크 대신 문구를 두기를 권한다.

## ⑤ 남은 것 · 알려진 결손

- **a4 복사본은 원본과 다르다**: `shots/w0/E0-4/a4-roles.mjs`는 ⓐ 비활성 버튼을 누르지 않고(원본대로 누르면 Playwright가 30s 기다린 뒤 예외를 던진다) ⓑ '할 수 있나' 값을 `:not([disabled])`로 잰다(Q4 임시 ①은 숨기지 않고 비활성이므로 원본의 존재 검사는 의미가 바뀐다) ⓒ 관리자 블록은 E0-4 범위 밖이라 뺐다. `*Shown` 키로 '보이긴 한다'도 함께 기록했다.
- 공유 설정 · 삭제도 영업에게는 **숨김에서 비활성으로** 바꿨다(편집·취소·이식과 규칙을 하나로). 원래 주석('버튼을 세우지 않는다', 2026-09-21)은 Q4 결정에 맞춰 고쳐 적었다.
- 실행 진행 모달을 닫으면 타이머가 멈추고 그 실행은 '처리 중'으로 남는다(브리프: 이번 웨이브는 정지 상태 유지 · 시계는 E2-2 A7).
- 새 실행의 `count`는 이제 지어낸 처리 단위 수가 아니라 연결된 실측의 `stats.count`(없으면 null)다.
- 이식 버튼 옆 이유 문구가 카드 상세 탭 줄 아래 한 줄을 더 차지한다(1280에서 확인 · 넘침 없음).

## ⑥ 재판정 수정 (2026-09-24 · 불합격 1건)

- **문제**: 1440×900 영업 세션의 `?tab=done&run=namwon-farmland-2025`에서 완료 판 footer가 3줄로 깨졌다(힌트가 두 줄로 꺾이고 '삭제' 버튼만 둘째 줄에 남음 · top 774/775/818).
- **수정**(`landxi/proto/analysis-run.js`만 바꿈 · `analysis.css`는 건드리지 않음): `hint(full)`에 인자를 받게 했다. 완료 판 footer만 `hint(true)` → `style="flex:1 1 100%"`. 진열대·실행·실행중 footer의 `hint()`는 그대로다.
- **실측**(수정 후 `#dp .panel-f > *` top/height): 1440 → 힌트 794(h18, 한 줄), 공유 설정·다운로드·삭제 모두 818. 1280 → 힌트 621(h17), 버튼 셋 모두 644. 두 폭이 같은 모양이다.
- **spec**: `E0-4 ②`에 1440×900 단언을 추가했다. `#dp .panel-f button` 3개의 `getBoundingClientRect().top`이 모두 같고, 힌트는 1줄이며 힌트 bottom ≤ 버튼 top이다. `proto-analysis.spec.mjs` → **44 passed (53.2s)**.
- **재촬영**: `node shots/w0/E0-4/shots.mjs`로 16장을 모두 다시 찍었다(`01c-sales-done-disabled-1440.png` 포함 · 두 폭의 errs `[]` · hOverflow 0 · download 1,293,982 B · 기준일 2026.06.08). 모션이 바뀐 곳은 없다.
- 보고서 경로: 지시문의 `E0-4-report.md`는 브리프의 새 파일 허용 목록에 없어서 이 문서(`E0-4-result.md`)에 이어서 적었다. 스크린샷도 허용 경로 `shots/w0/E0-4/`에 두었다(`shots/wave0/`가 아님).
