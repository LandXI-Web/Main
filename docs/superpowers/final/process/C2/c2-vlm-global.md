# c2-vlm-global — 영상 검수 보조(VLM) + 해외 결과 도구(영어)
> 시작 전 필수: `E:/Land-XI 플랫폼/CLAUDE.md`, `01. 디자인/docs/CORE.md`, `01. 디자인/docs/USER-DIRECTIVES.md`, `01. 디자인/docs/PROCESS.md`, 이 폴더의 `assess.md`·`plan.md`(특히 3절 공통 계약·4절 기본값)를 읽는다. 보고 첫 줄은 "브리핑 확인: (규칙 3개)"로 쓴다.
> 공통 금지(plan.md 7절): git commit·reset·checkout·restore 금지 · vLLM·Ollama 종료 금지 · GPU 한 장씩(VLM 은 이미 떠 있는 vLLM GPU1 만 · 영상 추론 작업과 겹치면 기다린다) · 소유 밖 파일 수정 금지 · 확인은 로그인 폼으로만 · 증거는 `shots/process/C2/c2-vlm-global/`.

## 목표 한 줄
의심 필지를 말하거나 필지 카드 '영상 설명'을 누르면, 그 필지 영상 조각이 명령 바에 뜨고 Gemma 4 가 무엇이 보이는지와 오탐 가능성을 한두 문장으로 말한다. 해외 기관은 영어로 묻고 자기 결과(NDVI·시즌)를 영어로 답받는다.

## 소유 파일
- `server/agent/tools/ext/vlm.py` · `ext/global_.py`(신규)
- `server/agent/vlm/*`(신규 · 조각 만들기·프롬프트·평가셋 도구)
- `landxi/v3/global/*`(해외 첫 화면 · 지도 동작 처리)

## 할 일
1. **조각 만들기**(`crop_tiles`): 필지(PNU·지번) 또는 결과 피처의 경계에서 여백을 두고 등록 영상(COG·PMTiles·XYZ)을 잘라 PNG 로 만든다. 시점이 여럿이면 최대 4장까지 만든다. 렌더는 CPU 로 한다(`landxi_api/tiles.py` 함수는 불러 쓰기만 하고 고치지 않는다). 파일은 run 산출 폴더에 두고 c2-core 의 내려받기 경로로 보인다. 필지 경계선을 그림 위에 겹친다.
2. **`vlm_describe`**: 조각 + 필지 정보(지목·AI 클래스·면적 봉투)를 vLLM `:8000` Gemma 4 에 이미지로 보낸다(`--limit-mm-per-prompt image 4` 는 이미 켜져 있다). 답은 "보이는 것 · AI 결과와 맞는지 · 오탐 가능성(높음·보통·낮음)" 세 줄이다. 숫자는 봉투만 쓴다. 명령 바에 `image` 블록(꼬리표 `AI 의견 · 근거 아님`)으로 낸다. 이미지 토큰도 기관 사용량(`llm_tokens`)에 합산한다(기존 계량 경로).
3. **질문 연결**: "{지번} 영상 보고 설명해 줘" · "이 필지 영상 설명" · 필지 카드 버튼 문장이 이 도구로 가게 `HINT` 를 적는다(버튼은 c2-xi·c2-fusion 이 붙인다). 관할 밖 필지는 막는다.
4. **평가셋 시작**: 남원·여수 의심 필지 각 10장으로 조각 + 사람 판정 칸 표(CSV)를 만들어 `shots/process/C2/c2-vlm-global/` 에 둔다. 정확도 숫자는 사람 판정 전까지 쓰지 않는다.
5. **해외 결과 도구**(`ext/global_.py`): 해외 기관 결과(키르기스 NDVI·시즌·시가지 변화 등 `v3/global` 이 이미 그리는 데이터)를 읽는 `global_summary(region?, metric?)`·`global_parcels(filter)` 를 둔다. 수치는 봉투로만 내고, 결과가 하나면 `map_region` 으로 지도를 옮긴다. 허용은 그 해외 기관과 LX 뿐이다.
6. **해외 첫 화면**: `v3/global` 이 `map_region`·`map_zoom`·`map_view`·`map_on` 을 처리하고 `kit:agent-action-done` 을 낸다.

## 완료 기준 (측정 가능 · 화면만으로 · 두 시도 이상)
- K11: 남원(전북)·광주전남(여수) 계정에서 의심 필지 1곳씩 "영상 설명해 줘" → 영상 조각 1장 이상 + 세 줄 설명 + 꼬리표. LX 직원 XI맵 필지 카드 버튼 1회. 관할 밖 필지 요청은 막힌다.
- K12: kgz-agri 로그인 → assess 의 영어 질문 4개 모두 영어 답 + 도구 결과 수치(봉투 칩) + 지도 이동 1회 이상. "Can't answer right now" 0.
- VLM 1회 토큰이 그 기관 `usage_events llm_tokens` 에 들어간다(agent_runs 합계와 일치).
- 평가셋 20장 표가 있다. GPU: 영상 추론 작업과 동시 실행 0(로그).
