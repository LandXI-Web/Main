# Land-XI

**Hyper Performance · Hyper Solution · Hyper GeoAI 통합 플랫폼 서비스**

LX(한국국토정보공사)가 제공하는 GeoAI 실태조사 특화 플랫폼입니다. 국내 지자체와 해외 기관이 위성 · 항공 · 드론 영상과 AI로 국토를 한 번에 읽고, 대장과 다른 땅을 찾아냅니다. LX 직원 · LX 관리자 · 영업 · 지자체 · 해외 기관이 로그인 한 곳에서 들어가 각자의 첫 화면으로 갑니다.

## 사이트
- 게스트 메인(첫 주소): https://landxi-web.github.io/Main/
- 검토 허브: https://landxi-web.github.io/Main/landxi/proto/review/index.html
- 구현 현황판: https://landxi-web.github.io/Main/landxi/proto/review/status/index.html
- 자산 대장: https://landxi-web.github.io/Main/landxi/proto/review/masters.html

이 사이트에서는 게스트 메인 · 서비스 상세 · 로그인 화면이 열립니다. 로그인 뒤 화면은 서버가 켜진 곳에서만 동작해, 검토 허브의 영상과 자산 대장의 캡처로 봅니다.

## 내 PC에서 실행
```
powershell -File server/start-landxi.ps1
```
켜진 뒤 http://localhost:4173/landxi/ 로 들어갑니다.

배포(커밋 · 게이트웨이 재시작) 뒤 같은 이름 숫자 대조: `node tools/check/numbers.mjs` — 바깥 주소를 로그인 폼으로 열어 정확도 · AI 분석 결과 · 분석한 면적 · 서비스 수가 화면마다 같은지, 이 PC 주소 호출 0, 결과 확인 '봤음' 기록 말 0(원칙 203)을 표로 보여 주고, 어긋나면 실패 코드(1)로 끝납니다.

금칙어 검사: `node tools/check/words.mjs` — 바깥 주소를 로그인 폼으로 열어 기관 · LX 직원 · LX 관리자 주요 화면(서비스 대시보드 · 필지 목록 상세 · 분석하기 자세히 · 개선 후보 등)에서 '결재 · 반려 · 현장 확인 · 시연 · 데모 · 준비 중 · 검증 정확도 · 무허가 건축 의심 · 표본 n장 · 개발 요청 · 지도에서 봤음'을 세고(사용자가 쓴 질문 원문은 빼고 · 서버 응답 문구는 경고로 따로), 화면에 하나라도 있거나 화면 오류가 있으면 실패 코드(1)로 끝납니다.

화면 파일 보관(바깥 주소): 공개 관문(`tools/public-gate.mjs`)이 화면의 모듈 · 스타일 주소에 판 번호(`?v=` — 화면 코드 파일들의 이름 · 크기 · 고친 시각 지문)를 붙여 내주고, 번호가 붙은 주소는 브라우저가 1년 보관합니다. 규칙: **화면 파일을 고치면 번호가 저절로 바뀌므로 관문을 다시 켤 필요 없이 다음 열기부터 새 화면이 보입니다 — 판 번호 주소를 손으로 적거나 HTML 을 관문 밖에서 따로 보관하지 않습니다.**

## 폴더
- `landxi/v3/` — 지금 쓰는 화면(게스트 메인 · 로그인 · 역할별 첫 화면 17개)
- `landxi/proto/` — 예전 화면과 검토 허브 · 자산 대장 · 구현 현황판(`review/`)
- `server/` — 로그인 · AI 분석 · 데이터를 내주는 서버
- `design/` · `design-canvas/` — 디자인 규칙과 원판
- `docs/` — 기록과 명세
