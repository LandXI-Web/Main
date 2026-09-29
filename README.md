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

## 폴더
- `landxi/v3/` — 지금 쓰는 화면(게스트 메인 · 로그인 · 역할별 첫 화면 17개)
- `landxi/proto/` — 예전 화면과 검토 허브 · 자산 대장 · 구현 현황판(`review/`)
- `server/` — 로그인 · AI 분석 · 데이터를 내주는 서버
- `design/` · `design-canvas/` — 디자인 규칙과 원판
- `docs/` — 기록과 명세
