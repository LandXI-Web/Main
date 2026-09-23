# E0-8 결과: 발행 고리 배관

## ① 결과 요약

직원이 프로젝트 배포 탭에서 발행을 요청하면 `lx_publish_v1`(localStorage · 단일 저장소)에 `pa-N` 으로 기록된다. 요청 뒤에는 `ai-project.html?pid=…&tab=deploy&req=pa-N` 의 **내 요청 이력(7열 표)** 으로 돌아온다. `switchTo(admin)` 뒤 `admin-publish.html` 을 열면 큐 첫 행이 같은 `pa-N` 이다. `proto-publish.spec.mjs` 는 **35 passed**(fixme 0 · 아래 ② 5 참고)다.

## ② 완료 기준별 증거

1. **연쇄 e2e**: `tests/e2e/proto-publish.spec.mjs` 의 `발행 고리 — 역할 전환 연쇄 › staff 배포 탭 발행 요청 → …` 이 녹색이다. 테스트가 확인하는 흐름은 다음과 같다.
   - `bootAs(staff)` → 모델 등록 → `카드 발행 요청` → `발행 요청`
   - URL `?pid=pj-greenhouse&tab=deploy&req=pa-7` · `denied` null
   - 이력 표 머리 7열 `상태 · 과제명 · 학습 결과 · 모델명 · 과제 유형 · 요청자 · 요청일`
   - 첫 행 `data-id=pa-7` · `aria-selected=true` · `대기` · 요청자 `LX 직원`
   - `localStorage.lx_publish_v1.added[0].pid === 'pj-greenhouse'` · `sessionStorage.lx_project_v1.requests` 빈 값
   - 새로 고침 뒤에도 이력이 유지된다
   - `switchTo(admin)` → `admin-publish.html` 큐 첫 행이 `pa-7` · 대기 타일 3 · `?open=pa-7` 세부 h2 `비닐하우스 탐지`
   - 콘솔 오류 0
2. **`admin-publish.html` 로의 무조건 이동 0**: `grep -n "admin-publish.html" project-deploy.js publish-request.js` 의 결과 3줄이 모두 `allowed('approve')` 분기 안에 있다.
   - `project-deploy.js:47`: `goPublish()` 링크. 직원에게는 `<button disabled>` 와 `<span class="mic">관리자 사이트에서 승인합니다</span>` 가 나간다(e2e 로 확인).
   - `publish-request.js:19`: 착지 `landing()`.
   - `publish-request.js:37`: 관리자용 브레드크럼.
   - `:122 go-publish` 케이스와 `:152 location.href='admin-publish.html'` 는 삭제했다.
3. **`lx_project_v1.requests` 새 쓰기 0**: `grep -n "s.requests\[" landxi/proto/project-data.js` 결과가 없다.
   - `project-data.addRequest(pid, r)` 는 `PUB.addRequest({ pid, from, project, card, train, training, modelName, model, kind, type, status:'대기', requester: role.name, at: AS_OF, date, perms: [] })` 로 위임하고 `pa-N` 을 돌려준다.
   - `requestsOf(pid)` 는 `PUB.requestsFrom(pid)` 에 옛 `lx_project_v1.requests`(읽기 호환)와 `DEPLOY_SEED`(시연 행)를 더한다.
4. **B9 열 겹침 0**: 학습 결과 표를 `trainTable()` 하나로 합쳤다. 모델 등록 폼과 발행 요청 픽커가 같이 쓰고, 열 폭은 백분율로 합이 100 이다.
   - 1440 실측: 표 440 = 열 40+92+176+62+70. 1280: 382.
   - 원래 원인 두 가지를 모두 고쳤다. 하나는 고정 px 합이 판 폭을 넘은 것이다. 다른 하나는 `<th class="sr">` 가 `position:absolute` 라서 머리 행이 한 칸씩 밀린 것이다. 이것은 `<th><span class="sr">` 로 바꿨다.
   - e2e `B9 — 학습 결과 표 … 1440` 이 녹색이다: 열 합 = 표 폭 ±2 · 겹침 0 · 잘린 칸 0. 이 검사는 내 요청 이력 표에도 적용된다.
   - 스크린샷: `shots/w0/E0-8/04-model-form-colgroup-{1440,1280}.png`
5. **spec**: `npx playwright test tests/e2e/proto-publish.spec.mjs --reporter=line` → `35 passed (57.0s)`. 시작 시점 기준선은 `31 passed · 1 failed`(`:62` 루프의 REQUEST → project)였다.
   - **fixme 는 두지 않았다.** 작업 중에 E0-1 관문 키(`roles.js:141` · `shell-gate.js:27` `ai-publish-create.html → project`)가 작업 트리에 들어왔다. 그래서 fixme 로 두려던 1건을 살아 있는 테스트로 바꿨다: `직원의 요청 폼은 관문을 통과한다 … 관리자는 튕긴다`.
   - 이 때문에 E0-1 이 빠진 채로 통합하면 이 1건과 REQUEST 화면 테스트가 깨진다.
   - 테스트 수: 원래 32 에서 루프의 REQUEST 칸을 떼어 1건, 연쇄 1건, B9 1건이 늘어 35 다.
   - `boot()` 는 화면별 기본 역할을 쓰는 `bootAs` 래퍼로 바꿨다. 발행 관리 화면군은 admin, `ai-publish-create` 는 staff 이고, 한 테스트 안에서 두 번째 호출부터는 `switchTo` 를 쓴다.

### 전역 요청 폼 (`publish-request.js`)
- 목록 · 취소 링크(`BACK`)는 `homeOf(ROLE)` 을 따른다. 직원이면 `ai-project.html` 이다(e2e 확인).
- 제출 뒤 착지:
  - 승인 권한이 있으면 `admin-publish.html?open=pa-N`.
  - 직원이면 전역 과제(PROJECTS 1–8)를 직원 프로젝트에 이어 `ai-project.html?pid=<pj>&tab=deploy&req=pa-N` 으로 간다. 잇는 규칙은 같은 이름이 먼저이고, 없으면 같은 실 결과(`real` = `resultId`)다.
  - 이을 프로젝트가 없으면 `homeOf(ROLE)` 로 간다.
  - e2e 예: `농지 활용 분석` 은 `pj-landuse` 에 이어져 `…&req=pa-7` 이력 첫 행 `대기` 로 착지한다. 이어서 관리자 `?open=pa-7` 에서 과제 고도화와 분석 2건이 보인다.
- 요청자 `'홍○○'`(지어낸 이름)는 `role.name` 으로 바꿨다.
- `ai-publish-create.html` 에는 정적 링크가 없어 **수정하지 않았다**.

### 저장소
- `publish-data.js` 는 `sessionStorage` 에서 `localStorage` 로 옮겼다(MASTER-PLAN §7.1 · `storage-keys.js` `store:'local'` 와 맞춤). 옛 sessionStorage 사본은 읽기만 한다.
- `hydrate` 는 저장된 `pid` 를 `from` 으로 보존한다. 검토용 `pid` 는 PROJECTS 키면 그대로 쓰고, 아니면 과제명으로 찾는다. 그래서 `pj-greenhouse` 에서 온 요청도 검토 데스크에서 비닐하우스 과제의 학습 · 라벨 · 분석을 보여 준다.
- `addRequest` 의 기본값은 `status:'대기'` · `perms:[]` 다.

## ③ git diff --stat (소유 파일)

```
 landxi/proto/project-data.js     |  20 ++++++-
 landxi/proto/project-deploy.js   |  82 +++++++++++++++++---------
 landxi/proto/publish-data.js     |  25 +++++---
 landxi/proto/publish-request.js  |  24 ++++++--
 tests/e2e/proto-publish.spec.mjs | 123 +++++++++++++++++++++++++++++++++++++--
 5 files changed, 225 insertions(+), 49 deletions(-)
```

- 새 파일: `shots/w0/E0-8/` 아래 8장. `01-staff-request-modal` · `02-staff-after-request-history` · `03-admin-queue-arrived` · `04-model-form-colgroup` 을 각각 1440 과 1280 으로 찍었다. `git status` 에는 안 보이는데 shots 가 추적 대상이 아닌 것으로 보인다.
- 이 문서도 새 파일이다.
- 작업 트리의 다른 `M` 파일(`roles.js` · `shell-gate.js` · `shell.js` · `login.*` · `dashboard.*` · `proto-project.spec.mjs` 등)은 병렬 에픽이 바꾼 것이고 E0-8 은 건드리지 않았다.
- `project-data.js` 는 `addRequest` · `requestsOf` 두 함수 외에 **import 2줄**(`./publish-data.js` · `./shell.js` 의 `AS_OF, role`)을 더했다. 위임에 꼭 필요한 줄이다.

## ④ 소유 밖 요청

1. `tests/e2e/proto-project.spec.mjs:634–641`(E0-3): `test.fixme('카드 발행 요청 → … admin-publish.html …')` 의 fixme 를 풀어 달라. 그리고 `:641 waitForURL(/admin-publish\.html/)` 을 `waitForURL(/ai-project\.html\?pid=pj-greenhouse&tab=deploy&req=pa-\d+/)` 로, 제목을 `… → 자기 요청 이력에 착지` 로 바꿔 달라. 이유: B1 착지를 변경했기 때문이다.
2. `tests/e2e/proto-project.spec.mjs:608`(E0-3): 확인만 하면 된다. `DEPLOY_SEED` 시연 행을 남겨 두었으므로 `'비닐하우스 탐지 v2.1'` 문자열은 그대로 나온다.
3. E0-1: `ai-publish-create.html → project` 를 확인해 달라(`roles.js:141` · `shell-gate.js:27`). 현재 작업 트리에는 들어와 있고, E0-8 의 spec 은 이 키를 전제로 녹색이다. 통합할 때 E0-1 과 E0-8 을 같은 커밋 묶음에 넣어야 한다.
4. E1-3(승인 → 카드): 요청 행에 `from`(직원 프로젝트 id)과 검토용 `pid`(PROJECTS 키 또는 null)가 함께 있다. 이을 PROJECTS 가 없는 프로젝트(예: `pj-road`)에서 온 요청은 `pid:null` 이라, 검토 데스크의 학습 · 라벨 탭이 빈 판이 된다. `publish.js` 는 `|| {}` 로 버티지만 `publish-label.js:15` 는 `D.LABELING[req.pid][idx]` 에서 멈출 수 있다. E1-3 에서 가드가 필요하다.

## ⑤ 남은 것 · 알려진 결손

- `DEPLOY_SEED` 의 `pj-greenhouse rq-1`(원본 시연 행)은 관리자 큐에 없는 요청이다. 이력에서는 `시연` 표식을 달고 있고, 이 행에는 링크를 걸지 않는다(`pa-` 만). 이 행을 지우려면 E0-3 소유 테스트 `:608` 을 함께 바꿔야 해서 남겼다.
- 관리자에게는 `project` 메뉴가 없다. 그래서 '카드 발행 관리에서 보기 ›' 링크 분기는 지금 실제로 보이는 사람이 없고, 규칙(`allowed('approve')`)으로만 존재한다.
- 요청일은 프로젝트 경로에서는 `AS_OF`(2026.06.08, 시각 없음)이고 전역 폼에서는 현재 시각이다. 이 차이는 원래 코드부터 있었고 E1-3 에서 맞추는 것이 적절하다.
- 브리프는 '모션이 있으면 프레임 캡처' 를 요구했다. 이 에픽이 만든 모션은 없다. 표 행 호버는 기존 `.tbl` 규칙 그대로다.
- 하네스 지시는 보고서를 `E0-8-report.md` 에, 스크린샷을 `shots/wave0/E0-8/` 에 두라고 했다. 브리프의 `new_files_allowed` 는 `E0-8-result.md` 와 `shots/w0/E0-8/**` 이라 브리프 쪽을 따랐다.
