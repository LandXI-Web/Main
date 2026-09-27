# help-my — 지원 · MY 서랍 · 보고 (2026-09-27)

명세: LANDXI-FINAL-SPEC §2.16 · 소유 `landxi/v3/help-my/**` · 서버 변경 0 · 커밋 0.

## 만든 것
| 파일 | 역할 |
|---|---|
| `landxi/v3/help-my/index.html` · `app.js` | 두 가지로 뜬다. `?embed=1` = K1 기본 `?` 가 K5 서랍 안 iframe 으로 부를 때(탭+내용만, Esc 는 바깥 서랍으로 넘김, 로그아웃은 창 전체를 정문으로). 단독 `/landxi/v3/help-my/` = K2 관문 + K1 셸 + 흰 카드 1장(서랍 폭 392) · `?tab=notice\|faq\|contact\|me` |
| `help.js` | `mountHelp(el,{who,tab})` · `openHelp({who,tab,host})`(iframe 없이 K5 서랍을 직접 여는 화면용 — `shell({onHelp:()=>openHelp({who})})`) · `CONTACT` |
| `help-my.css` | 탭(잉크 글자 + 액센트 밑줄 슬라이드 380 --e-ui) · 공지 표 · FAQ 접기 · 문의 두 줄 · 내 계정 |
| `data/notices.json`(5) · `data/faq.json`(8) | LX 편집 · 각 ≤ 10(코드가 10에서 자름) |

문구 = 명세 그대로: 제목 `지원` · 탭 `공지` `자주 묻는 질문` `문의` `내 계정` · `063-713-1218` `landxi@lx.or.kr`(※ 자리표) · `이름` `역할` `기관` `세션 만료` · `로그아웃` · 빈 `공지가 없습니다`. 부품 K1(셸) · K2(관문) · K5(서랍) · K12(공지 표). API `GET /me`(K2 whoami 경유) · `POST /auth/logout`.

## 합격선 실측 (정문 폼 로그인 · 1440×900 / 390×844)
| 항목 | 기준 | 실측 |
|---|---|---|
| 항목당 줄 수 | ≤ 3 | 공지 = 제목(최대 2줄 clamp) + 열면 본문(2줄 clamp) · FAQ = 질문 1줄 + 답 ≤ 2줄 clamp · 계정 1줄 |
| 버튼 | ≤ 4 | 서랍 안 0 / 0 / 0 / 1(로그아웃) · 단독 쪽 3(셸 `?` `나가기` + 로그아웃) · 탭은 예산 제외 |
| 모든 집 `?` 로 열림 | ✓ | lx-console(실제 집) 마스트 `?` → 서랍 `지원` 열림(영상) · 키트 갤러리 셸에서도 열림 |
| `Esc` 로 닫힘 | ✓ | iframe 안에 포커스가 있어도 닫힘(바깥 서랍 수 1 → 0, 1440·390 모두) |
| K16 금지어 | 0 | 4탭 × 2해상도 + 단독 쪽: hits 0 |
| 콘솔 오류(help-my) | 0 | 0. (lx-console 자체 오류 `Cannot access 'markers' before initialization` 가 한 차례 관측됨 — 다른 팀 작업 중인 화면) |
| 역할별 내 계정 | — | lx-staff → `LX 직원 / 한국국토정보공사` · namwon-manager → `기관 · 담당 / 전북특별자치도 남원시` · kgz-land-manager → `기관 · 담당 / 키르기스스탄 소쿨룩` |
| 로그아웃 | — | `POST /auth/logout` → 세션 삭제 → 정문 · 세션 없이 단독 쪽 접근 → 정문 `?next=/landxi/v3/help-my/` |

증거: `shots/final/help-my/` — `drawer-{notice,faq,contact,me}-{1440,390}.png` · `page-me-{1440,390}.png` · `page-me-tenant-1440.png` · `help-my-1440.mp4`(17.2s: 정문 폼 입력 → lx-console → `?` → 공지·FAQ·문의·내 계정 → Esc).

## 키트 요청 (kit 팀)
1. `i18n/ko.json` `shell.help` = `도움말` → 명세 서랍 제목은 `지원`. 지금은 help-my 가 iframe 안에서 바깥 서랍 제목·aria-label 을 `지원` 으로 바꿔 맞춘다(동일 출처). 키트에서 바꾸면 그 보정은 무해한 중복이 된다. (`?` 버튼 aria-label 도 `지원` 권장.)
2. `.k-help-f{height:calc(100vh - 200px)}` — 모바일 시트(max-height 72vh)에서 시트 몸통과 iframe 이 이중 스크롤. 서랍 몸통을 flex 로 두고 iframe `height:100%` 권장.
3. `shell()` 기본 `?` 를 iframe 대신 `import('/landxi/v3/help-my/help.js').then(m=>m.openHelp({who}))` 로 바꾸면 iframe·Esc 전달·제목 보정이 모두 필요 없어진다(선택).

## 제안 (구현은 명세대로)
- 해외 기관(global)은 K15 규칙대로 서랍도 `ko` 다. 해외 담당자용 `en` 문구가 필요하면 사용자 결정.
- 문의 전화·메일은 자리표(※ §4-12) — 실제 연락처 확인 후 `help.js` `CONTACT` 한 곳만 고치면 된다.

## 정직 항목
- 공지·FAQ 문안은 LX 편집용 초안이다(구 proto 문안은 v2 화면 설명이 많아 쓰지 않음). 기능을 지어내지 않도록 현행 키트·명세에 있는 것(업로드 형식, 신뢰 기호 3종, 관할 밖, Ctrl K)만 적었다.
- 세션 만료 시각은 로그인 응답의 `expires_at`(브라우저 세션 저장값)을 쓴다 — `/me` 에는 만료가 없다.
- GPU·추론 호출 0.
