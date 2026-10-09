# 화면 말 바꾸기 — 배포 신청 · 승인 · 거절 · 기관에 공유 (배포-7 · 10-09)

바꾼 말: 발행 요청 → 배포 신청 · 결재 → 승인 요청(동작은 승인 · 거절) · 반려 → 거절 · 다른 지역에 적용(이식) → 기관에 공유.
화면 글(버튼 · 제목 · 칩 · 설명 · 빈 화면 글 · 알림)과 서버가 화면에 보내는 문구만 바꿨습니다. 코드 이름 · DB 값 · API 경로 · 주석은 그대로입니다.

## 바꾼 곳 (줄 수)
| 화면 | 파일 | 줄 | 바뀐 말 |
|---|---|---|---|
| LX 직원 프로젝트 단계 | lx-project/context.js · sheets.js, lx-train/flow.js | 1 · 3 · 11 | 단계 이름 '배포 신청', 버튼 '서비스 카드 배포 신청', 알림 '승인 뒤 공개', 거절 사유 |
| LX 직원 요청함 | lx-inbox/app.js · index.html · shoots.js | 6 · 1 · 4 | '내 승인 요청', 촬영 요청 '거절' 단추 · 사유 |
| LX 직원 배포 · 기관에 공유 | lx-deploy/app.js | 13 | 버튼 · 서랍 제목 '기관에 공유', 승인 대기 · 거절 사유, 안내 글 |
| LX 직원 결과 확인 · 서비스 카드 | lx-review/app.js, lx-cards/app.js, kit/service-card.js | 6 · 1 · 1 | '승인을 요청했습니다', '공개 승인 요청 중' |
| LX 관리자 승인 요청 | ops-core/js/app.js · data.js, ops-infra/js/app.js · deploys.js | 15 · 2 · 1 · 2 | 메뉴 '승인 요청', '승인 요청함 열기', 승인 · 거절 단추, 종류 이름 '기관에 공유' |
| LX 관리자 계정 | ops-accounts/app.js · view.js | 1 · 28 | 메뉴, 가입 신청 · 재설정 거절 단추 · 사유 · 알림 (저장 용량 줄은 남김) |
| 공용 | kit/bignum.js · gallery.js, login/account.js, service-detail/summary.js, lx-console/words.js | 1 · 2 · 1 · 1 · 1 | '승인 대기' 칸 이름, 로그인 안내 '거절된 신청', 말 바꿔 보이는 표 '이식 → 기관에 공유' |
| 기관 화면(말만) | gov-request/app.js · sent.js | 1 · 2 | 분석 요청 '거절 · 사유' |
| 서버 문구(XI ChatGEO 답 · 알림 · 오류) | landxi_api approvals · cards · deploys · projects · registry · requests · shoots · accounts · gov_history · staff_home · survey, agent/tools request · ledger_rule | 약 100 | 승인 대기 · 거절 · 배포 신청 · 기관에 공유 · 오류 안내 |
| 서버 시험(옛 말 검사) | tests test_impl1_admin · test_impl2_project | 4 | 새 말로 맞춤 |

## 남긴 곳
- 다른 작업 중(저장 용량 · 내 정보 · 관리자 계정 저장 용량 탭): kit/me.js · me.css, lx-console 일부, ops-accounts 저장 용량 줄, accounts.py 저장 용량 문구 — 용량 줄은 건드리지 않았습니다.
- '적용 요청' 칩(배포 지도 범례 · 배포 목록 단계 이름 · 대시보드 지도)은 바꾸라는 말이 없어 그대로입니다 — 아직 옛 말로 보입니다(원칙 157).
- DB에 저장되는 값(할당 변경 기록 '결재 번호')은 그대로.
- 개발자 서랍 글 · 코드 주석 · 옛 시안(design-canvas) 은 범위 밖.

## 확인 캡처
캡처는 로그인 폼으로 연 실제 화면(1440)이고 콘솔 오류 0. 위 '적용 요청' 칩은 아직 옛 말(캡처 '배포' 화면 왼쪽 위 칩).
- after-staff-publish: 직원 프로젝트 단계 막대의 '배포 신청'
- after-admin-approvals: 관리자 왼쪽 메뉴 '승인 요청' · 종류 '배포 승인'
- after-admin-deploy: 배포 화면 '기관에 공유' 버튼 · 승인 완료 안내
- after-staff-inbox: 직원 요청함
