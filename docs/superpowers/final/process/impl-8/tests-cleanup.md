# 시험 정리 (10-09) — 화면은 그대로, 시험만 지금 말에 맞춤

| 파일 | 고친 것 | 통과 여부 |
|---|---|---|
| tests/e2e/impl3-shell.spec.mjs | 메뉴 = 대시보드 · 프로젝트 · 분석하기 · XI맵 · 데이터 · 요청함(주소에 XI맵 포함, 머리줄 XI맵 단추 없음 확인), 서비스 배포 화면 불 = 프로젝트 칸, 휴대폰 시험은 원칙 139 로 skip(이유 주석) | 7 통과 · 1 건너뜀 |
| tests/e2e/impl5-project.spec.mjs + impl5-account-extras.spec.mjs | 저장 용량 할당을 바꾸는 시험과 읽는 시험(같은 계정)이 파일이 달라 함께 돌며 충돌 → '내 정보' 시험을 account-extras 로 옮기고 그 묶음을 직렬(describe serial) | 둘 다 7 통과 |
| tests/e2e/impl1-admin.spec.mjs | 결재 '반려' → '거절'(버튼 · 사유 안내) | 통과 |
| tests/e2e/impl2-request.spec.mjs | 요청 '반려' → '거절'(버튼 · 안내 · 토스트 · 기관 화면 문구) | 통과 |
| tests/e2e/impl2-cleanup.spec.mjs | 기관 메뉴 = 내 서비스 · 요청하기 · 기관 정보 · 계정(옛 '분석 의뢰' · '내가 보낸 요청' 칸 · 서비스 화면 요청 탭 · '결과 시점' 칸 기대 제거) | 4 통과 |
| server/tests/test_impl5_gov2.py::test_shoot_flow_... | 고치지 않음 — 종 확인 줄까지 가지 못하고 그 앞 줄에서 실패. 원인은 말 바꾸기가 아니라 서비스 이름 데이터: 시험은 card-farm = '영농관리 행정서비스' 를 기대, 서버 DB 는 '경작·휴경 분석서비스' | 실패(보고) |
| RT60 '영농 결과 몇 건이야?' | match_card 단위로만 확인(언어 모델 호출 없음) → card-farm 로 맞음 | 확인 |

## 아직 실패하는 것(이번 범위 밖 · 원인이 말이 아님)
- impl3-cards: 분석하기 갤러리 서비스 수 5 이상 기대 → 지금 4 / 기관 서비스 선택 시험이 '현장 확인 필요' 숫자가 null 이길 기대하나 값이 있음
- impl7-no-fieldcheck(1440 · 390): `.k-sc-res` 에 'AI 분석 결과' 기대 → 그 칸이 없음(카드 화면 바뀜)
- impl2-accounts: 가입 신청 동의 문구('동의해야') 안내가 다름 · 임시 비밀번호 시험 400 · 관리자 계정 탭 수 불일치
- impl2-project · impl8-staff-dashboard: 위 묶음 실행 중 재시도 흔적(원인 확인 안 함)
