# 기관 '요청하기(촬영 요청)' 502 고침 (구현 29 · 고장 고침)

## 원인
- 502 는 게이트웨이(:8700)가 아니라 **터널(cloudflared) → 공개 관문(:4180) 사이**에서 났다.
  `server/logs/tunnel.err` 에 "Unable to reach the origin service … read tcp 127.0.0.1:…->127.0.0.1:4180: wsarecv: An existing connection was forcibly closed" 가 10-13 에 10회 묶음(01:46 · 02:13 · 04:05 · 05:13 · 06:00 · 22:21 · 22:27 …)으로 남아 있다. 관문 · 게이트웨이 로그(public-gate.err)에는 502 가 없다.
- 터널은 관문과 이어 둔 연결을 오래(약 90초) 다시 쓰는데, 관문(Node http 서버)은 기본값 `keepAliveTimeout` 5초에 그 연결을 먼저 닫았다.
  검사가 화면을 연달아 열며 잠시 쉬었다가 요청하면, 터널이 이미 닫힌 연결로 보내 502 가 난다(재시작 직후가 아니라 5초 넘게 쉰 뒤의 첫 요청 — 타이밍 경합이라 같은 화면을 따로 열면 안 난다).
- 정확한 요청 주소는 브라우저 콘솔 문구에 없고(502 만 한 줄), 경합이라 재현 때마다 달라서 같은 한 줄이 '촬영 요청' 화면에 걸렸을 뿐이다.

## 고친 것 (tools/public-gate.mjs)
1. 관문 서버 `keepAliveTimeout` 120초 · `headersTimeout` 125초 — 터널보다 늦게 닫는다.
2. 관문 → 게이트웨이 구간: 이어 둔 연결을 게이트웨이가 먼저 닫아 ECONNRESET/EPIPE 가 나면, 본문 없는 GET · HEAD 요청만 새 연결로 한 번 다시 보낸다(그 밖의 요청은 그대로 502).
- 검사 도구(words.mjs)는 건드리지 않았다. 관문만 다시 켰다(`server/start-public.ps1`, 터널 · 게이트웨이 · 워커 그대로). 재시작 뒤 app · admin · namwon · api 주소 열림 확인.

## 확인
- words-run1.txt · words-run2.txt · words-run3.txt — 관문 재시작 뒤 `node tools/check/words.mjs` 세 번 연달아: 모두 "통과 — 화면 금칙어 0 · 화면 오류 0"(종료 코드 0). 관문 재시작(22:43:44Z) 뒤 터널 로그에 Unable to reach 새 기록 없음(마지막 기록 22:43:43Z 는 관문을 끈 순간).
- 한계: 경합성이라 고치기 전 재현은 한 번 돌려서는 안 났다(고치기 전 한 번 통과). 증거는 터널 로그 원인 문구 + 고친 뒤 3회 통과.
