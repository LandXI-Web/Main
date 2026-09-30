# r3-global — 해외: 말로 지도 제어 + C3·C4 최소 적용 (C8)
> 시작 전에 반드시 읽는다: `E:/Land-XI 플랫폼/CLAUDE.md`, `01. 디자인/docs/CORE.md`(C8), `USER-DIRECTIVES.md`, `PROCESS.md`, 이 폴더의 `plan.md`, `process/C2/c2-vlm-global-prove.md`·`c2-vlm-global-report.md`, `docs/superpowers/recon-0924/global-map.md`.
> 보고 첫 줄은 "브리핑 확인: (규칙 3개)"로 쓴다. 보고서는 `R3/r3-global-report.md`, 증거는 `shots/process/R3/r3-global/` 에 둔다.

## 목표 한 줄
해외 기관 담당자가 영어로 말해 지도를 움직인다. 자기 구역 행정 자료를 올려 AI 결과(NDVI·저활력 농지·시가지 변화)와 대조하고, 어긋난 구역을 목록·지도·영어 요약으로 받는다.

## 소유 파일
- `landxi/v3/global/*`
- `server/agent/tools/ext/global_.py` · `server/agent/tools/ext/vlm.py`
- 신규 `server/landxi_api/global_data.py`(구역 대장 올리기·결합·목록) — 라우터 등록은 r3-train 이 main.py 에 이름을 넣는다(plan 3.6)
- `server/pipelines/global/*`
- 새 테스트 `server/agent/tests/test_r3_global.py`

## 할 일
1. **M4 해외 지도 제어**
   - `global_.py` 의 `ROUTE` 는 지도 동작 말(zoom·layer·imagery·tilt·3D·go to·move·확대·층)이 있으면 NDVI 직행을 하지 않는다. 이런 질문은 지도 도구로 보낸다.
   - 해외 화면(`global/app.js`)이 `map_zoom`·`map_layer`(영상 층 켜기·끄기)·`map_region`(구역 이동)·`map_view`(3D)를 처리하고, `kit:agent-action-done {ok, reason}` 을 정직하게 낸다(plan 3.1).
   - 'Turn off the imagery layer'가 실제 영상 층 이름과 맞게 이어져야 한다.
2. **해외 C4 최소**
   - 해외 기관이 구역 단위 행정 자료(CSV/XLSX: 구역 이름 또는 코드 + 숫자 열, plan 4절)를 해외 화면에서 올린다.
   - 서버가 구역 이름을 현지 행정 경계(기존 해외 구역 자료)와 맞추고, 맞춘 비율을 보인다.
   - AI 결과와 대조한다. 예: 신고 농지 면적 vs AI 저활력·경작 면적 → 차이가 기준(기본 30%) 넘는 구역 = '어긋난 구역'.
   - 대조 결과는 기관·사람별로 기억한다(새로 고쳐도 유지).
3. **해외 C3 최소**
   - 어긋난 구역 목록(구역 이름·신고값·AI 값·차이)과 지도 칠하기를 보인다.
   - 영어 질문 "How many districts don't match?"·"Show the mismatched districts"에 도구 숫자로 답한다.
   - 영어 요약 한 단락("Summarize the findings")도 도구 숫자로만 쓴다.
   - 필지 단위가 아닌 구역 단위임을 화면에 한 줄로 밝힌다.
4. **영어 영상 설명 직행**(`vlm.py`) — 'Describe the imagery of the 3rd parcel/district'를 한국어처럼 직행(Target: …)으로 보낸다. 모델 경로 토큰 낭비를 줄인다.
5. 관할 가드를 유지한다: 한 해외 기관이 다른 기관이나 국내 자료를 물으면 막는다.

## 완료 기준 (측정 가능 · 화면만으로 · 해외 기관 두 곳 + 국내 회귀 1곳)
- M4: kgz-agri·kgz-land 두 계정에서 'Zoom in'·'Zoom out'·'Turn off the imagery layer'·'Turn it back on'·'Go to {구역}'·'Tilt to 3D' 6문이 모두 지도 상태를 바꾼다. 줌 값·층 visible·중심·기울기를 기록한다. NDVI 요약으로 새는 답 0, 성공인데 ok:false 인 것 0.
- C4: 두 계정에서 구역 자료를 올린다(각 기관 관할 구역, 파일은 해외 경계 이름으로 만든 표본). 맞춘 비율이 표시된다. "How many districts don't match?" → 숫자 = 화면 목록 수 = DB. 지도에 어긋난 구역이 칠해진다. F5 뒤에도 유지된다.
- C3: "Summarize the findings" → 영어 한 단락, 숫자는 도구 결과뿐(숫자 가드 위반 0).
- 관할: kgz-agri 가 kgz-land 자료·국내 남원을 물으면 막힌다.
- 국내 회귀: 국내 기관 영어 질문 1개가 그대로 동작한다.
- `test_r3_global.py`(직행 비간섭·구역 매칭·어긋남 계산) 녹색.
