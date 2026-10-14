# 구현 33 · 모든 문서를 한글 문서로 (10-14 사용자 · 원칙 250)

> "모든 문서는 .docx가 아니라 .hwp로 한다." → 형식은 ".hwpx 로 충분"

Land-XI가 내려주는 문서는 이제 모두 **한글 문서(.hwpx)**입니다. `.docx`는 더 내지 않습니다. 옛 `.docx` 주소(`/spaces/me/report.docx`, `/agent/runs/…/draft.docx`)는 없어졌습니다.
모든 문서는 서버의 공용 짓기 한 곳(`server/landxi_api/hwpx.py`)에서 만듭니다. 그래서 서식이 같습니다.
- A4 · 좌우 25mm
- 함초롬바탕(본문) · 함초롬돋움(제목 · 표)
- 차례: 제목 → 부제 → 개요 표 → 장 제목 → 그림 n. → 표 n. → 출처 → 만든 날짜

한컴 자동화는 쓰지 않습니다(보안 창이 뜨면 서버가 멈춤 · 구현 32 README).

## 1. 곳별 전 / 후
| 곳 | 전 | 후 |
|---|---|---|
| A 기관 서비스 '보고서' 탭(AI 분석 결과 보고서) | `.docx 내려받기` · python-docx · 맑은 고딕 | **한글 문서 내려받기** → `GET /spaces/me/report.hwpx` (지도 그림 · 읍면동 표 · 대장과 다른 필지) |
| B 기관 보고서 탭 '문서 내려받기'(실태조사 보고서 초안 · 서버) | `format=docx` | **한글 문서 내려받기** → `format=hwpx`. 인용 [n] · 조문 원문 표 · 알림 상자는 그대로 |
| C 기관 보고서 탭 '초안 만들기' 뒤 내려받기(화면 세 문단) | 브라우저가 `.docx`를 직접 지음(`gov-report/docx.js`) | 서버 `POST /report/screen.hwpx`로 옮김. 화면 글 · 숫자를 그대로 보내고, 서버는 다시 세지 않음 · `docx.js` 지움 |
| D XI ChatGEO '보고서 초안 만들어 줘'(LX · AI 분석 결과 보고서) | `draft.docx` | `draft.hwpx` · 파일 단추 이름 `….hwpx` |
| E XI맵 도구 '보고서' · 보고서 작성기 '내보내기' · 말로 실태조사 보고서 | '보고서 초안(.docx)' · '내보내기 .docx' | **보고서 초안(한글 문서)** · **내보내기(한글 문서)** · 정본 서식(survey.report)과 간이 서식 모두 한글 문서 |
| F XI맵 대시보드 '보고서로' | 구현 32의 한글 문서 | 같은 공용 짓기로 옮김(문서 모양 같음) |
| 옛 XI 화면 보고서 서랍(`landxi/xi`) | 서버 docx, 안 되면 브라우저 docx | 서버 한글 문서만, 안 되면 '내려받지 못했습니다' |

화면 글의 `.docx` · `Word`는 모두 '한글 문서'로 바꿨습니다. `words.mjs`에 '.docx · Word' 금칙을 넣었고, 기관 '보고서' 탭도 검사 화면에 넣었습니다.
남겨 둔 것: 프로젝트 자료 **올리기**에서 받는 파일 종류('워드' 파일 올리기 허용)는 사용자가 올리는 파일이라 그대로 두었습니다.

## 2. 검증 (바깥 주소 · 로그인 폼 · 남원 기관 1회 + LX 직원 1회, 바로잡은 뒤 A · B · D만 한 번 더 · 10-14 14:51–15:01)
| 항목 | 결과 |
|---|---|
| 실제 내려받기 6곳(A–F) | 모두 `.hwpx`로 받음 · 콘솔 오류 0 · 4xx/5xx 0 · 이 PC 주소 0(`run.json`) |
| 형식 점검(`check.py` → `check.txt`, 공용 `hwpx.check`) | mimetype 첫 항목 · 압축 없음 · 필수 파일 9개 · 모든 XML 정상 · 그림 PNG · 머리에 있는 모양만 부름 — **6개 모두 정상** |
| 화면 숫자 = 문서 숫자 | A 합계 2,098 · 읍면동 줄 10개 · 합계 줄 / B 인용 숫자 6개(같은 서버 출처) / C 화면 문단 3개 글 그대로 / D 답의 '결과 703건' / F 큰 숫자 4개 — **모두 같음**. 문서 안 내부 글자(경로 · 작업 id · docx · Word) 0 |
| 한글 2020으로 열기(`open-hwp.ps1` — 파일을 한글로 여는 것만, 자동화 없음) | 6개 모두 열림 · 글꼴 · 표 · 지도 그림 · 차트 정상(`opened/A–F.png`) |
| 서버 시험(`server-tests.txt`) | impl32 hwpx · impl18 기관 보고서(.hwpx 받기 · .docx 404) · 실태조사 보고서 · 범위 밖 0 · ChatGEO 보고서 · 서술 정본 경로 · 산출 파일 이름 · 법령 보고서 — 195 + 10 통과 |
| e2e | `impl18-gov-main`('한글 문서 내려받기' · `….hwpx`) 3개 통과. `f2e-report` · `f2e-off`(옛 XI 서랍)는 기대값만 `.hwpx`로 바꾸고 돌리지 않음 |
| words.mjs | 통과(화면 44개 · 금칙어 0 · '.docx · Word' 포함 · `words-check.txt`) |
| numbers.mjs | 통과(같은 이름 숫자 모두 같음 · `numbers-check.txt`) |
| 게이트웨이 | `-Restart gateway` 4번(전후 health 200) · 워커 재시작 0 · taskkill 0 |

다시 하기: `node docs/superpowers/final/process/impl-33/hwpx-all/shoot.mjs` → `python …/check.py` → `powershell -File …/open-hwp.ps1`

견본(작게): `견본_실태조사_보고서_초안.hwpx`(B · 20KB) · `견본_기관_화면_보고서.hwpx`(C · 11KB)

## 3. 한글로 열어 보며 고친 것
- 지도가 다음 쪽으로 밀려 1쪽 아래가 비던 것 → 지도 폭을 본문의 82%로 줄여 개요와 같은 쪽에 놓음(A).
- '…보고서(초\n안)'처럼 제목 글자가 중간에서 끊기던 것 → 제목은 'AI 분석 결과 보고서(초안)', 지역 · 서비스는 부제로 옮김(D).
- 칸이 많은 표에서 글자가 중간에 끊기던 것 → 표 칸 폭을 글 길이에 맞춤(공용 `auto_widths`), 의심 상위 표 칸 폭을 다시 나눔.

## 남은 것
1. **실태조사 규칙 이름 '무허가 건축 의심'**이 실태조사 보고서 문서(B · E) 안에 그대로 나옵니다. 화면 금칙어에 있는 말인데 규칙 정의(데이터)에서 오는 이름입니다. 바꿀 이름은 사용자가 정해야 합니다(전에 받던 .docx에도 같았음).
2. 의심 상위 표(B)는 칸이 10개라 소재지가 두 줄로 나뉩니다(낱말 단위로 끊김).
3. 옛 실행 기록에 남은 `.docx` 파일 단추는 이제 받을 수 없습니다(.docx를 내지 않으므로).

## 제안 — 이런 것도 필요하지 않을까요?
1. **문서 머리에 기관 이름 · 로고**: 지자체 담당자가 받은 문서를 그대로 결재에 올릴 수 있습니다. 기관 브랜드에 칸 하나를 두면 공용 서식이 모든 문서에 넣습니다.
2. **쪽 번호 · 머리말**: 여러 쪽 보고서(실태조사 11쪽)는 쪽 번호가 있어야 회의에서 함께 볼 수 있습니다.
3. **한글 문서 + PDF 함께 받기**: 한글이 없는 해외 기관 · 외부 공유용입니다. 같은 문서를 PDF로 굽는 단추 하나입니다.

## 파일
- 서버: `server/landxi_api/hwpx.py`(새 · 공용 짓기 · 형식 점검 · 글 읽기) · `xreport.py`(공용으로 옮김 · `POST /report/screen.hwpx` · 내려받기 응답 한 곳) · `gov_report.py` · `survey.py` · `agent.py` · `server/survey/report.py` · `server/agent/report.py` · `agent/config.py` · `agent/runner.py`(글 두 줄) · `agent/lint.py`(주석) · `agent/tools/ext/report.py` · `agent/tools/ext/mapsvc.py`
- 화면: `landxi/v3/gov-report/`(app.js · svc-report.js · index.html · gov-report.css · docx.js 지움) · `xi-clean/app.js` · `gov-select/tabs.js` · `gov-fusion/ask.js` · `landxi/agent/`(report-writer.js · api-agent.js · answer.js) · `landxi/xi/`(survey/report-draft.js · survey/api-survey.js · xi.js · engine/opt.js)
- 시험: server 시험 8개 파일 · e2e 3개 · `tools/check/words.mjs`
- 증거: `shoot.mjs` · `check.py` · `check.txt` · `open-hwp.ps1` · `run.json` · `opened/` · 견본 2개 · `server-tests.txt` · `words-check.txt` · `numbers-check.txt` · `items.json`. 받은 파일 원본(`got/`)과 화면 캡처(`shots/`)는 크기 때문에 올리지 않음
