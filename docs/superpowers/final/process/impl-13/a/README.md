# 구현 13차 a — 분야 관리 · 계정 각자 범위 · 대시보드 요약 칸 · 학습 · 추론 설명 (10-11 바퀴 2 · 3단계 구현)

브리핑 확인: (1) **한 바퀴 고정(원칙 175)** — 확인 페이지는 만들지 않고 증거(items.json · 그림)만 남겼다. 다음 now 에서 '완료 · 다시'로 묻는다. (2) **각자 범위 · 서버가 정본(원칙 177 · 39)** — 화면만 가리지 않고 서버 권한부터 같은 범위로 바꿨다. (3) **그림은 지금 바깥 주소에서 로그인 폼으로 새로 찍고 시각을 붙인다(원칙 162 · 139 PC 1440만)** — 13장 모두 10-11 09:01–09:16 에 https://app · admin · namwon.land-xi.dev 를 로그인 폼으로 열어 찍었다(log-12.json · log-34.json — 넘침 0 · 한 단어 줄 0 · 금지어 0 · 화면 오류 0).

> 사용자 답(10-11 08:51): 질문 5 '이대로 구현' · 질문 10 "대시보드는 요약이여야 한다"(원칙 176) · 나중 17 "계정 관리는 각자. LX는 LX 관리자만 남원시는 남원시 관리자만"(원칙 177) · 대화 답 "학습은 무슨 모델?? … 자동으로 타일링 추론 처리하는 개념인가??"(원칙 181)

## 1. 분야(카테고리) 관리 — 질문 5 · 원칙 165
- **서버 분야 표**: `server/migrations/0030_card_groups.sql`(0029 · 0031 은 다른 작업 — 번호 겹침 없음). 분야 목록 `card_groups`(이름 · 설명 · 순서) · 서비스 × 분야 여러 개 `card_group_of` · 직원이 요청한 새 분야 `card_group_requests` · 바뀐 기록 `card_group_log` · 쓸 수 있는 영상 `card_info.imagery_kinds`.
  코드 상수(`cards.py GROUPS` 농지·시설 · 환경 · 건축·변화 · 안전 · 해외)를 **이름 · 순서 그대로** 옮겼고, 카드 13장의 지금 분야 값을 모두 옮겼다(빠진 카드 0 — 시험 `test_moved_from_constant`). 옛 칸 `card_info.grp` 는 지우지 않고 첫 분야를 같이 적는다. 되돌리기 `migrations/down/0030_card_groups.down.sql`.
- **LX 관리자 '배포 → 분야' 탭**(배포 신청 · 기관 공유 · 사용 현황 · **분야** · 개선 후보): 순서 ↑↓ · 이름 바꾸기(설명 함께) · 쓰는 서비스와 수 · 새 분야 만들기 + 직원이 요청한 새 분야(만들기 · 닫기) + 바뀐 기록. API `GET/POST /categories` · `PATCH /categories/{id}` · `PUT /categories/order` · `POST /categories/requests/{id}/close`(만들기 · 바꾸기는 LX 관리자만 · 기관 계정 403).
- **배포 신청서**: 분야(여러 개) · 목록에 없으면 새 분야 요청 · 서비스 설명 한 문장 · 쓸 수 있는 영상(드론 · 항공 · 위성). 지금 서비스의 값이 미리 골라져 있다(쓸 수 있는 영상은 정해 둔 값 → 영상 조건 글 → 고른 모델이 배운 영상). 신청서 값은 **승인될 때** 서비스에 반영된다(`approvals.decide` → `categories.on_card_approved` · 거절되면 서비스는 그대로).
- **따르는 곳**: 분석하기 거르기 칩 = 분야 표 순서 · 서비스가 없는 분야는 숨김 · 한 서비스가 여러 분야에(칩 수도 그대로) + 영상별 거르기(드론 · 항공 · 위성) · 카드 그림 위 분야 표시 · 카드 아래 쓸 수 있는 영상 / 기관 공유 체크 표가 분야 묶음 머리줄로 분야 순서대로 / 서비스 카드 고치기의 '분류' 고르기 → '분야' 여러 개.
- 덤으로 고침: 기관 공유 · 분야 탭의 서비스 이름에 남아 있던 옛 말('재해 피해 판독 (해외)')을 분석하기 카드와 같은 용어표로(→ 'AI 분석').
- 그림: `c-admin-category-1440-0916.png`(분야 탭) · `c-apply-category-1440-0916.png`(배포 신청서 — 주차장 2026) · `c-analyze-list-1440-0915.png` · `c-analyze-filtered-1440-0916.png`(건축·변화 + 항공) · `c-admin-share-groups-1440-0916.png`(기관 공유 분야 묶음).
- 남긴 것: 분야 지우기(시안에 없음) · 직원 요청을 '기존 분야에 넣기'(시안의 두 번째 단추 — 지금은 만들기 · 닫기만, 기존 분야는 신청서에서 직접 고른다).

## 2. 계정 관리는 각자 범위 — 나중 17 → 원칙 177
- **서버**(`accounts.py`): LX 관리자 = LX 계정 · LX 가입 신청 · LX 재설정 요청 · LX 로그인 기록 · LX 입구 로그인 실패 · LX 계정 처리 기록만. 기관 계정은 목록에도 없고(`/accounts/users?realm=tenant…` = 빈 목록) 바꾸기 · 결정도 '없음'(404). 기관 관리자 = 자기 기관 것만(지금과 같음 · 부서별 관할 `/spaces/me/dept-scope` 그대로). 기관 가입 신청을 LX 관리자에게 '보기만'으로 보이던 것(원칙 72)도 뺐다.
- **LX 관리자 화면**: 계정 관리에서 '소속' 고르기(기관들)가 사라지고 LX 계정만. 기관 한 곳 화면 '사용과 계정' 탭의 계정 표(이름 · 아이디 · 부서 · 마지막 로그인)를 **요약 숫자**(계정 · 기관 관리자 · 부서 사용자 · 이번 달 로그인)로 바꿨다 — 서버 `/tenants/{id}/page` 도 사람마다의 값(views)을 더는 주지 않는다.
- 그림: `a-admin-accounts-lx-only-1440-0916.png` · `a-admin-logins-lx-only-1440-0916.png` · `a-admin-tenant-use-summary-1440-0916.png` · `a-namwon-accounts-1440-0914.png` · `a-namwon-logins-1440-0915.png`(남원 관리자 — 자기 기관만).
- 남긴 것: LX 직원이 받은 기관 요청의 '보낸 사람' 연락처(`/accounts/senders` — 계정 관리가 아니라 요청 응대 · 기관-8 ⓐ)는 그대로.

## 3. 대시보드는 요약 — 질문 10 → 원칙 176
LX 직원 대시보드의 '프로젝트 진행 현황'을 저장 용량 · 내가 돌린 작업 · 요청함 · 공지와 같은 크기의 요약 칸으로 줄였다. 칸 안은 단계(서버 단계 그대로 여섯 — 데이터 올리기 · 학습데이터 구축 · 학습 · 추론 · 결과 확인 · 배포 신청, 10-10 질문 10에서 확인한 단계)를 한 줄씩 — 숫자 + 단계 이름 + '남은 일 n'(있을 때만). 이름 칩 · 진행 그래프는 뺐다. 줄을 누르면 메뉴 '프로젝트' 목록이 그 단계로 걸러지고, 칸 아래 '프로젝트 목록'은 전체로 간다. **배치는 한 줄 다섯 칸** — 1440에서 칸 너비가 약 250이라 도넛 · 숫자 칸이 줄바꿈 없이 들어가고, 2×3 은 한 칸이 비어 한쪽으로 쏠린다(좁은 PC 1180 이하는 세 칸씩). 숫자는 지금처럼 `GET /projects?scope=mine` 한 출처. 지시의 '네 단계'와 달리 서버 단계가 여섯이라 여섯 줄로 두었다. 그림 `d-dashboard-1440-0901.png`.

## 4. 학습 · 추론 설명 — 원칙 181 (코드 근거)
프로젝트 '학습' 탭과 '추론' 탭 맨 위에 접지 않은 설명 칸(작은 그림 + 두세 줄 · `lx-project/explain.js`).
- 학습 = "지금 있는 AI 모델(기반 모델)을 이 프로젝트 학습데이터로 다시 가르쳐 새 모델을 만듭니다 · 모델은 YOLO11 — 영역 분할은 테두리를 도형으로, 회전 상자는 기울어진 상자로 · 3번 반복해 배우고 검증 몫(없으면 다섯 장에 한 장)으로 정확도를 잽니다" + 이 프로젝트 모델의 종류(서버 모델 기록).
  근거: `server/adapters/adapter_train_yolo.py:113-145`(ultralytics `YOLO(기반 가중치).train`) · `:212,239`(새 모델 = 기반 모델의 종류) · 등록된 기반 모델 = yolo11-seg · yolo11x-seg · yolo11n-seg(영역 분할) · yolo11x-obb(회전 상자 · models 표) · 화면이 보내는 반복 3 · 묶음 4 · 학습 크기 640(`landxi/v3/lx-train/flow.js:338-339`) · 검증 몫 = 올린 묶음의 val 폴더, 없으면 다섯 장에 한 장(`server/landxi_api/training.py:101-105`).
- 추론 = "큰 영상을 1024×1024 화소 조각으로 자동으로 나눠 AI가 조각마다 보고 다시 이어 붙입니다 · 이웃 조각과 12.5%(128화소)씩 겹쳐 경계에 걸린 것도 놓치지 않고, 두 번 잡힌 것은 확신이 높은 쪽만 · 조각 크기는 영상 해상도와 상관없이 같고 조각 수는 영상과 범위 크기에 따라 정해집니다".
  근거: `server/landxi_api/release.py:392`(프로젝트 추론 조각 1024 · 겹침 0.125) · `server/workers/tiling.py:31-57`(128화소 겹침 · 조각 수 = 영상 · 범위 크기) · 이어 붙이기 — 조각마다 겹침의 제 몫만 남기고 같은 분류가 겹치면 확신이 높은 쪽(`server/workers/postprocess.py:229-243`) · **해상도 자동 맞춤은 프로젝트 추론에 없다** — `jobs.py:388`(실시간 작업만) · `jobs.py:745`(분석하기 카드 분석만 모델이 배운 해상도에 맞춰 키우거나 줄임). 모델은 1024 조각을 자기 입력 크기로 다시 맞춘다(`server/adapters/adapter_yolo_seg.py:37,67` — 화면에는 쓰지 않음).
- 설정 칸 이름 '결과로 남길 기준': 신뢰도 기준(0~1) = "AI가 이 정도 이상 확신한 것만 결과로 남깁니다 · 높이면 결과가 적고 정확해집니다"(모델 예측 `conf` — `adapter_yolo_seg.py:47,67`) · 최소 크기 = "이보다 작은 도형은 결과에서 버립니다"(㎡ — `postprocess.py:220` · `cpu_worker.py:79`). 기본 0.25 · 4㎡ · 범위 0.05–0.95 · 0–500㎡(`release.py:36-37`).
- 그림: `p-train-1440-0903.png` · `p-infer-1440-0903.png`(설정 칸은 접힌 '설정' 아래라 그림 밖 — 코드 `lx-release/app.js` drawInfer).

## 5. 시험
- 서버: `test_impl13_categories.py`(새 · 3) · `test_release.py` · `test_impl2_accounts.py` · `test_impl11_admin.py` · `test_impl11_entry_contact.py` · `test_impl5_account_extras.py` · `test_impl3_spaces.py` — **43 통과**. 원칙 177로 기대값이 바뀐 시험(LX 관리자가 기관 신청 · 계정 · 로그인을 본다던 줄)은 새 범위로 고쳤다.
- e2e(이 PC · GPU 0): impl8-staff-dashboard · impl12-mapsvc · impl5-account-extras · impl2-accounts(기관 관리자 계정 화면 · LX 관리자 계정 화면) 통과 · impl9-deploy 는 분야 탭 · 기관 공유 묶음까지 통과하고 '사용 현황' 머리줄에서 멈춤 — 다른 작업(외부 연동 API)이 'API 호출' 열을 더한 것이라 그 작업이 기대값을 고친다.
  이번 일과 상관없이 전부터 실패: impl3-cards 갤러리 시험(옛 카드 모양 `.k-sc-res` 를 찾음 — 카드틀-5 뒤 바뀐 모양) · impl2-accounts 가입 신청 시험(LX 직원은 @lx.or.kr 메일만 — 구현 확인 2차 Q-2 ⓐ 뒤 시험이 옛 메일을 씀).
- `node tools/check/numbers.mjs`: 이 PC 주소 호출 0 · 어긋남 3 — 모두 '결과 확인 n'(프로젝트 목록 · 신청서 0/20 ↔ 결과 확인 화면 0/100 · 2/100). 이번에 고친 화면이 아니다(결과 확인 화면의 분모가 다름) — 다음 바퀴 고칠 거리로 올린다.

## 6. 제안 — 이런 것도 필요하지 않을까요?
1. **결과 확인 수 한 출처** — 누가 왜: LX 직원 · 관리자. 프로젝트 목록 · 배포 신청서는 0/20, 결과 확인 화면은 0/100 으로 같은 이름의 숫자가 다르다(숫자 한 출처 위반 · numbers 점검 어긋남 3).
2. **정확도 숫자 맞추기** — 누가 왜: 배포를 판단하는 LX 관리자. 주차장 2026 추론 탭 모델 줄은 40%, 학습 카드 · 지난 판은 89%로 보인다(1번째 학습 40% · 2.0판 89% — 어느 값이 어느 모델의 것인지 화면에서 바로 알 수 있게).
3. **분야별 사용 현황** — 누가 왜: LX 관리자. 분야 탭에 '이번 달 분석 n회'를 더하면 어느 분야 서비스가 많이 쓰이는지 보고 분야를 나누거나 합칠 수 있다.

## 7. 파일
- 서버: `server/migrations/0030_card_groups.sql` · `down/0030_card_groups.down.sql` · `server/landxi_api/categories.py`(새) · `cards.py` · `release.py` · `approvals.py` · `accounts.py` · `spaces.py` · 시험 `server/tests/test_impl13_categories.py` 외 넷
- 화면: `landxi/v3/ops-infra/js/release.js` · `release.css`(분야 탭 · 공유 묶음 · 신청서 분야) · `lx-release/app.js` · `release.css`(신청서) · `lx-analyze/app.js` · `analyze.css` · `lx-cards/app.js` · `cards.css` · `ops-accounts/view.js` · `ops-infra/js/tenant-page.js` · `lx-console/*` · `lx-project/explain.*` · `lx-train/*` · e2e `impl8-staff-dashboard` · `impl9-deploy`
- 촬영: `shots/*-1440-HHMM.png` · `shots/log-12.json` · `shots/log-34.json` · 결정 항목 `items.json`(id = now 페이지 번호)
