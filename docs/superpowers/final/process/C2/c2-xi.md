# c2-xi — XI맵: 말로 지도 제어·분석 실행 + 영상 층·보고서 서랍 잔여
> 시작 전 필수: `E:/Land-XI 플랫폼/CLAUDE.md`, `01. 디자인/docs/CORE.md`, `01. 디자인/docs/USER-DIRECTIVES.md`, `01. 디자인/docs/PROCESS.md`, 이 폴더의 `assess.md`·`plan.md`(특히 3절 공통 계약·4절 기본값)를 읽는다. 보고 첫 줄은 "브리핑 확인: (규칙 3개)"로 쓴다.
> 공통 금지(plan.md 7절): git commit·reset·checkout·restore 금지 · vLLM·Ollama 종료 금지 · GPU 한 장씩(영상 추론은 대기열로만) · 소유 밖 파일 수정 금지 · 확인은 로그인 폼으로만 · 증거는 `shots/process/C2/c2-xi/`.

## 목표 한 줄
LX 직원이 XI맵에서 말로 지역·줌·영상 층·3D 를 바꾼다. 전역 분석과 실태조사 결과 만들기를 확인 카드로 실행하면 결과가 바로 차오른다. 등록된 영상은 어느 시군구든 그려진다.

## 소유 파일
- `landxi/v3/xi-clean/*`(app.js · analyze.js · index.html · xc.css · replay-worker.js)
- `server/agent/tools/ext/map.py` · `ext/analyze.py`(신규) · `server/agent/tools/jobs.py`
- `server/landxi_api/tiles.py` · `server/landxi_api/catalog.py`

## 할 일
1. **지도 도구**(`ext/map.py`, `CLIENT`): `map_region(name|sgg_cd)` 는 결과가 없어도 시군구 경계 bbox 로 이동한다. bbox 는 `regions` 에서 읽기만 하고, 관할 가드는 기존대로 둔다. 그 밖에 `map_zoom(zoom|delta)` · `map_view(pitch, bearing | preset '3d'|'top')` · `map_layer(layer, on)` 를 둔다. 도구마다 `HINT` 를 적는다.
2. **XI맵 처리**: `onAgent` 가 새 op 를 실행하고 `kit:agent-action-done {op, ok}` 를 낸다(plan 3.2). `map_layer imagery` 는 영상 층을 켠다. `map_view` 는 상단 '입체' 버튼과 같은 코드를 쓴다.
3. **말로 분석 실행**(`ext/analyze.py`): `analysis_run(region, service?)` 는 화면 '분석' 버튼과 같은 견적 → 제출 경로(`/jobs/quote` → `/jobs`)를 쓴다. 확인 카드(`CONFIRM`)를 거치고, 제출 전에 전력·대기열 검사를 한다. 거절되면 이유를 한 줄로 낸다. 제출되면 `analysis_watch {job_id, sgg_cd}` 를 보내고, XI맵은 `analyze.js` 의 진행 보기에 붙어 결과가 읍면동 순으로 차오른다. `survey_build(region)` 은 `POST /survey/build` 를 확인 카드로 부른다. 서비스 이름은 비닐하우스·건물·경작지·주차장에 대응한다. "비닐하우스 분석"이 기존 의심 조회로 바뀌지 않게 한다.
4. **차트 연결**: "읍면동별 차트" 요청은 `survey_stats(by=emd)` 가 낸 `chart` 블록(c2-numbers)을 쓴다. XI맵에서는 막대를 누르면 그 읍면동으로 이동한다.
5. **영상 층 잔여**: 카탈로그가 PMTiles 가 없는 등록 영상(현재 68개 시군구)을 `source:'cog'` 로 내보낸다. XI맵은 `/tiles/cog/{id}/{z}/{x}/{y}.webp` 래스터 층으로 쌓는다. 기관 계정에는 기존 서명(exp·sig)을 붙인다. 렌더는 CPU 와 디스크 캐시로 하고 GPU 는 쓰지 않는다. 첫 표시가 느리면 낮은 줌 개요 타일을 서버 백그라운드 작업으로 미리 캐시한다.
6. **보고서 서랍 기본값**: 전국 보기의 기본 대상을 `운봉읍` 대신 **현재 지역**으로 한다. 지역이 없으면 "지역을 고르세요"를 보인다. 지역 하드코딩 0.
7. **머리 숫자**: 머리 숫자와 오른쪽 판은 c2-numbers 의 한 출처(plan 3.5)만 읽는다. 결과가 있을 때는 '첫 결과 전'을 없앤다.
8. **필지 카드 '영상 설명'**: 버튼을 누르면 명령 바에 "{지번} 영상 설명해 줘"를 보낸다(도구는 c2-vlm-global).

## 완료 기준 (측정 가능 · 화면만으로 · 두 시도 이상)
- K3: LX 직원 로그인. 전북(남원 + 결과 없는 1곳)과 전남광주(여수·구례) 각각에서 지역·줌·영상 층·3D 4종이 말로 성공한다. 지도 center·zoom·pitch·층 가시성 변화를 기록한다.
- K4: 두 시도 각 1곳 "전역 분석 실행해 줘" → 확인 카드 → 승인 → 대기열 → 결과 1건 이상이 지도에 표시된다. 전력 거절 경로를 1회 캡처한다. GPU 는 한 장만 쓴다.
- K5: "읍면동별 차트로" → 막대 1개. 막대 값은 같은 이름의 숫자와 같다.
- K15(영상): 등록 시군구 중 무작위 5곳(두 시도 이상 포함)에서 영상 층이 보인다(스크린샷).
- K9(일부): 여수·남원에서 서랍 기본 대상 = 현재 지역. `운봉` 하드코딩 0(grep).
