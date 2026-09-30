브리핑 확인: (1) 숫자는 도구 결과(봉투)에서만 쓰고, 표본 대장의 신고값은 표본이라고 밝혔다. (2) 확인은 로그인 폼과 화면 조작만으로 했고, DB 는 대조할 때 읽기만 했다. (3) GPU 는 쓰지 않았고 vLLM·Ollama 는 끄지 않았다. git commit·reset·checkout·restore 는 하지 않았다.

# r3-global — ④ 실증 기록 (2026-09-30 14:40–14:51 · 구현에 참여하지 않은 Opus)

## 방법
- 로그인 폼(기관 탭 → 기관 선택 → 아이디·비밀번호 → Enter)으로 들어갔다. 해외 기관 두 곳(`kgz-agri-manager`, `kgz-land-manager`)과 국내 한 곳(`gj-manager`)을 썼다.
- 화면 조작만 했다. 명령 바(Ctrl K)에 입력하고, Register 탭을 누르고, 'Upload another'로 파일을 고르고, F5 를 눌렀다. URL 직접 이동·API 직접 호출·세션 주입은 하지 않았다.
- **보고서에 없는 지역(무작위):** 해외는 **Ak-Suu**(이식쿨 주, 무작위 추첨), 국내는 **여수시**(광주전남)를 골랐다.
- **대장은 구현자 표본을 쓰지 않았다.** 새로 만든 표본 세 개를 썼다(신고값은 확인용 표본이며 실제 통계가 아니다). 파일은 `shots/r3/r3-global/prove/` 에 있다.
  - `prove-agri-A.xlsx`: 키릴 머리글('Район', 'Посевная площадь, га'), 키릴 구역 이름 'Ысык-Ата' 70,000, Ak-Suu, Talas, 없는 이름 1줄
  - `prove-agri-B.xlsx`: 로마자 흔들림 'Issyk-Ata' 30,000, Ak-Suu
  - `prove-land.csv`: 머리글 'rayon_name', 'sown area km2', 'Sokuluk rayon' 900 km², Ak-Suu, Chuy
- 증거는 `shots/r3/r3-global/prove/` 에 있다. 스크린샷 약 90장과 `prove-agri.json`, `prove-land.json`, `prove-extra.json`, `prove-dom.json` 이다.

## 완료 기준별 결과
| 기준 | 결과 | 판정 |
|---|---|---|
| **M4** 6문 × 두 계정 | 두 계정 모두 Zoom in · Zoom out · Turn off the imagery layer · Turn it back on · Go to {구역} · Tilt to 3D · Back to top view 7문이 `ok:true` 로 지도 상태를 바꿨다. **agri:** 줌 8.94→9.94→8.94, 영상 층 visible→none→visible, 기울기 0→45→0, 중심 [75.2041, 42.649]. **land:** 줌 8.47→9.47→8.47, 영상 층·기울기 같은 순서, 중심 [74.716, 42.7493]. NDVI 요약으로 샌 답은 0건이다. 기울기는 보고서의 55가 아니라 45였다(화면 최대 기울기로 보이며, 기울어진 것은 맞다) | ● |
| 　바꿔 말하기(추가) | 'Can you zoom in a little?', 'Hide the satellite imagery', 'Show the satellite imagery again', 'Show me the map in 3D please', 'zoom out please' 10건 중 9건이 성공했다. **1건(land 'Hide the satellite imagery')은 'Can't answer right now'였다.** run 기록이 0건이다(14:45:57–14:46:02). 게이트웨이 상태 감시가 14:46:02 에 'health 실패 1/3'을 남겼다. 같은 문장을 다시 3번 보냈을 때는 3/3 성공했다 | △ (아래 must_fix 3) |
| **C4** 올리기 → 맞춘 비율 | agri A: "Matched 3 of 4 · 75.0%"(키릴 'Ысык-Ата'가 Ysyk-Ata 로 맞음). agri B: "2 of 2 · 100.0%"('Issyk-Ata'가 맞음). land: "3 of 3 · 100.0%"('Sokuluk rayon'이 맞고, km² 가 ha 로 바뀜: 900 km² → 90,000 ha) | ● |
| 　어긋난 구역 수 = 화면 목록 = DB | agri A: 답 **0** = 빨강 줄 0 = DB `mismatched 0`(차이 −1.8%, match). agri B: 답 **1** = 빨강 줄 1(Ysyk-Ata +129%) = DB 1(129.09%). land: 답 **0** = 줄 0 = DB 0(−5.06%). 0과 1 두 경우를 모두 확인했다 | ● |
| 　지도 칠하기 | agri B 는 Ysyk-Ata 를 빨강으로 칠했다(`agri-r2-show.png`). land 는 Sokuluk 를 청록(맞음)으로 칠했다(`land-r1-show.png`). HUD 는 'Districts that don't match · 1 / 0'이다 | ● |
| 　F5 뒤 유지 | 두 계정 모두 같은 파일 이름·맞춘 비율·목록·칠하기·HUD 가 나왔다. 그 뒤 질문 답도 같은 숫자였다(`*-f5-reg.png`) | ● |
| **C3** 'Summarize the findings' | 영어 한 단락이다. 숫자는 행 수·맞춘 수·%·어긋난 수·신고/AI 면적·NDVI 0.3(Oct 2025)·건물 면적 변화 17.2 km² 이다. 각 숫자가 DB 대장 요약, 구역 AI 면적 파일, 지난 실증의 도구 값(109.9→127.1 km²)과 같다. kgz 두 기관의 run 62건은 토큰 0이다(모델 미호출 → 숫자 가드 위반 0) | ● |
| **관할** | agri → 'How many districts don't match in Sokuluk?'·'NDVI in Sokuluk': "outside your districts", 값 0. land → Ysyk-Ata 도 같다. 무작위 Ak-Suu 는 두 계정 모두 "outside your districts, so the map shows its location only"로 답하고 위치만 보였다. 국내 'Yeosu-si 의심 필지'(영어)·'여수시 의심 필지 몇 건?'·'Go to Yeosu'·'Take me to Gurye'는 모두 막혔다 | ● |
| **국내 영어 회귀** | gj-manager 'How many suspect parcels are there in Yeosu-si?' → "There are **10,506** suspect parcels in Yeosu-si." DB `survey_sgg` 여수 = 10,506, 한국어 답도 10,506 이다. 'Zoom in' → `ok`. 국내 계정이 'NDVI in Ysyk-Ata'를 물으면 거절된다 | ● |
| **테스트** | `test_r3_global.py` + `test_vlm_global.py` 57개 통과 | ● |
| 원스톱(명령줄 단계) | 0 — 올리기·대조·질문·칠하기·유지 모두 화면에서 끝났다 | ● |

## 원스톱이 끊기는 곳 (must_fix)
1. **이름을 붙인 확대가 그 지역을 무시하고 거짓 성공을 말한다.** 'Zoom in on Ak-Suu'(land, 지금 Sokuluk)는 Sokuluk 를 그대로 한 단계 확대하고 "Zoomed in."이라고 답한다(`land-e-zoom-aksuu.png`). 'Zoom in on Yeosu'(두 계정)도 지금 구역을 확대하고 "Zoomed in."이라고 답한다. 국내 지명 가드는 '-si' 가 붙거나 go to 일 때만 걸린다. 원인은 `global_.py` 의 `map_command` 에 있다. `D_IN` 이 맞으면 `{"op":"zoom","delta":1}` 만 만들고, 뒤의 지명을 보지 않는다.
   - 고칠 것: 'zoom in/out on|to|at {이름}'은 지명을 먼저 푼다. 관할 구역이면 이동한 뒤 확대하고, 관할 밖 해외 구역이면 위치만 보이고 가드 한 줄을 낸다. 국내 지명이나 모르는 이름이면 지도를 움직이지 않고 거절한다.
2. **관할 밖 답이 하지 않은 지도 동작을 했다고 말한다.** 'How many districts don't match in Sokuluk?'(agri), 'How many districts don't match in Ysyk-Ata?'(land), 'Show the mismatched districts in Ysyk-Ata'(land)는 "…so the map shows its location only"라고 답한다. 하지만 지도 동작이 0건이다(`done_events: []`, 카메라 변화 없음). NDVI 질문은 실제로 이동하므로 답이 맞다. 대장 질문 경로만 동작 없이 같은 문장을 쓴다.
   - 고칠 것: 대장 질문의 관할 밖 경로도 `map_region`(위치만)을 보내거나, 문장에서 'the map shows its location' 부분을 뺀다.
3. **모델을 부르지 않는 지도 직행이 게이트웨이 상태에 막힌다(r3-route 몫, 재현됨).** 확인 질문 약 75건 중 1건이다. 'Hide the satellite imagery'가 16 ms 만에 'Can't answer right now'로 끝났고 run 기록은 0건이다. 같은 순간 게이트웨이 감시에 'health 실패 1/3'이 남았다. 구현 보고의 4절 한계가 확인자 회차에서도 되풀이된 것이다.
   - 고칠 것: 직행(토큰 0) 질문은 LLM 상태 검사 전에 판정한다. 또는 run 생성이 실패하면 명령 바가 한 번 다시 보낸다.

## 보완 권고 (막지는 않음)
- LX 계정(관리자·직원)이 해외 화면으로 가는 메뉴가 없다. 마스트에는 'XI맵'만 있다. 해외 화면 코드는 LX 전체 42개 구역 대조를 지원하지만, 화면 조작만으로는 LX 가 거기에 닿을 수 없다(주소를 직접 쳐야 한다). 화면 배치는 Fable 몫이다.
- 대장 표의 신고값 옆에 '확인(✓)' 표시가 붙는다. 기관이 올린 값이라는 뜻이라면 괜찮다. 다만 '측정값'과 같은 기호여서 헷갈릴 수 있다.
- 'Matched … · 100.0%' 뒤의 표시(✓)가 줄을 넘겨 따로 한 줄에 선다(화면 폭 1440).
- 답의 차이는 '(129.1%)'이고 표는 '+129%'다. 답에도 부호를 붙이면 더 좋다.

## 대조 (DB 읽기만)
- `global_registers` 최근 행: agri `prove-agri-A.xlsx`(rows 4 · matched 3 · 75.0 · mismatched 0 · outside 2 · unmatched 1) → `prove-agri-B.xlsx`(2 · 2 · 100.0 · 1 · 1 · 0). land `prove-land.csv`(3 · 3 · 100.0 · 0 · 2 · 0). 화면 숫자와 모두 같다.
- `global_register_rows`: 'Ысык-Ата'→Ysyk-Ata(−1.82 · match), 'Issyk-Ata'→Ysyk-Ata(129.09 · mismatch), 'Sokuluk rayon'→Sokuluk(90,000 ha · −5.06 · match), Ak-Suu·Talas·Chuy 는 outside 이고 AI 값을 내지 않는다(null).
- `agent_runs` 14:42–14:51: kgz-agri 28건·kgz-land 34건, 토큰 합 0. 국내 여수 영어 run 은 모델 경로(11,845 + 40 토큰)이고, 답 자리표는 `{{env:e1}}` → 10,506 이다.
- GPU: 이 실증은 GPU 작업을 넣지 않았다(지도·대장은 런타임 직행, 국내 영어 1건만 이미 떠 있는 vLLM 을 썼다).

## 판정
- 완료 기준 다섯 가지(M4 · C4 · C3 · 관할 · 국내 회귀 + 테스트)는 **보고서에 없는 지역(Ak-Suu · 여수시)과 새 표본 대장으로 모두 재현했다.**
- 다만 지도 동작 말의 거짓 성공(must_fix 1·2)이 C2 실증에서 문제로 짚은 '실패인데 성공이라 답함'과 같은 종류라서 합격 보류로 둔다.
- 3은 r3-route 로 넘긴다.

---

# 실증 2차 (2026-09-30 15:10–15:22 · 1차 보완 뒤 · 구현에 참여하지 않은 Opus)
브리핑 확인: (1) 지도를 움직였다고 말하는 답은 실제로 보낸 지도 동작과 같아야 한다(거짓 성공 0). (2) 확인은 로그인 폼과 명령 바 입력·Register 탭·파일 고르기·F5 로만 했다(해외 두 기관 + 국내 한 곳, 세션 주입 0). (3) GPU 작업은 넣지 않았고 Ollama·vLLM 은 끄지 않았다. 게이트웨이는 다시 띄우지 않았고 git 은 쓰지 않았다. DB 는 대조할 때 읽기만 했다.

## 방법
- 로그인 폼(기관 → 기관 선택 → 아이디·비밀번호 → Enter): `kgz-agri-manager`, `kgz-land-manager`, `gj-manager`.
- **보고서에 없는 지역(무작위 추첨):** 해외 **Moskva**(추이 주). 국내는 보고서에 없는 **순천시**(자료 없음 확인)와 **강진군**(숫자 확인)을 썼다. 국내 지명 확인용으로 목록에 없는 **보령**도 넣었다.
- **새 표본 대장**(확인용 표본, 실제 통계 아님): `p2-agri.xlsx`(머리글 'District'·'Declared cropland (ha)', 'Ysyk-Ata raion' 40,000 · Moskva · 'Kemin district'), `p2-land.csv`('rayon'·'sown_ha', Sokuluk 50,000 · Moskva · Jayyl). 두 파일 모두 어긋남 1곳이 나오도록 만들었다(1차는 land 가 0이었다).
- 증거: `shots/r3/r3-global/prove2/`(스크린샷 약 70장, `p2-agri.json` · `p2-land.json` · `p2-dom.json` · `p2-dom2.json` · `p2-dom3.json`). 스크립트는 스크래치(`…/scratchpad/gprove2.py`)에 있다.

## 완료 기준별 결과
| 기준 | 결과 | 판정 |
|---|---|---|
| **M4** 6문 × 두 계정 | 두 계정 모두 Zoom in · Zoom out · Turn off the imagery layer · Turn it back on · Go to {구역} · Tilt to 3D · Back to top view 가 `ok:true` 이고 지도가 바뀌었다. agri: 줌 8.94→9.94→8.94, 영상 층 visible→none→visible, 기울기 0→45→0. land: 줌 8.47→9.47→8.47, 같은 순서. NDVI 요약으로 샌 답 0 | ● |
| **지명 확대(1차 must_fix 1)** | 'Zoom in on {내 구역}' → "Moved the map to … and zoomed in." 줌 +1. **'Zoom in on Moskva'**(두 계정, 관할 밖) → "Moskva is outside your districts, so the map shows its location only" + `map_region ok:true`, 중심 → [74.4644, 42.6883](확대했다는 말 없음). 'zoom out to Moskva please' → 같은 가드. 'Zoom in on Boryeong' → "No district named 'Boryeong'…", 동작 0, 카메라 그대로. 'Zoom into Suncheon-si' → "This is not your organization's data.", 동작 0. 'Zoom out on the map' → 그냥 축소(회귀 0) | ● |
| **관할 밖 대장 질문(1차 must_fix 2)** | 'How many districts don't match in Moskva?'(두 계정) → 위치만 이동 문장 + 실제 `map_region ok:true`, 중심 이동 확인. 'Show the mismatched districts in {남의 구역}' → 같다(agri → Sokuluk [74.716, 42.7493]). 값 0개 | ● |
| **C4** 올리기 → 맞춘 비율 | agri "Matched 3 of 3 · 100.0%"('Ysyk-Ata raion'·'Kemin district' 맞음), land "3 of 3 · 100.0%" | ● |
| 　숫자 = 목록 = DB | agri 답 **1** = 빨강 줄 1(Ysyk-Ata 40,000 → 68,726 ha, +72%) = DB `global_registers` p2-agri.xlsx mismatched 1. land 답 **1** = 줄 1(Sokuluk 50,000 → 85,445 ha, +71%) = DB mismatched 1 | ● |
| 　지도 칠하기 · F5 유지 | 두 계정 모두 어긋난 구역을 빨강으로 칠했고 HUD 1(`agri-r3-show.png`, `land-f5-reg.png`). F5 뒤 같은 파일·비율·목록·칠하기·답 숫자 | ● |
| **C3** 'Summarize the findings' | 두 계정 모두 영어 한 단락이다. 숫자는 행 수 3 · 맞춘 3(100%) · 비교 1 · 어긋남 1 · 신고/AI 면적 · 71.8%/70.9% · 관할 밖 2줄이다(agri 는 NDVI 0.3 · 건물 면적 변화 17.2 km² 도 있다). kgz 두 기관 run 124건의 토큰은 0이다(모델 미호출 → 가드 위반 0). F5 뒤 같은 단락 | ● |
| **관할** | agri → Sokuluk NDVI·대장, land → Ysyk-Ata NDVI·대장은 모두 가드 + 위치만 보였다. 두 계정 'How many suspect parcels are there in Suncheon-si?' → "This is not your organization's data." 국내 계정 'What is the NDVI in Moskva?' → 값 없음 | ● |
| **국내 영어 회귀** | gj-manager 'How many suspect parcels are there in Gangjin-gun?' → **12,625** = 한국어 답 12,625 = DB `survey_sgg` 강진군 12,625. 순천시(자료 없음)는 영어·한국어 모두 '자료 없음'으로 같다. 'Zoom in'·'Zoom out' → `map_zoom ok` | ● |
| **테스트** | `test_r3_global.py` + `test_vlm_global.py` 60 통과 | ● |
| 원스톱(명령줄 단계) | 0 | ● |

## 남은 문제 (must_fix — 이 작업 소유 파일 밖)
1. **[r3-route] 모델을 부르지 않는 직행이 게이트웨이 재기동 창에서 'Can't answer right now'로 끝난다(3회째 재현).** 약 60건 중 2건이다. agri 'Go to Ysyk-Ata'(15:12:3x, 19 ms), land 'Show the mismatched districts'(15:16:4x, 39 ms). 두 건 모두 `agent_runs` 에 행이 없다. 같은 무렵 다른 작업이 게이트웨이를 다시 띄웠다(15:12:39 기동 복구 기록, 15:16:54 새 프로세스). 감시 기록에는 실패가 없다. 명령 바가 다시 보내지 않아서 사용자가 같은 말을 한 번 더 쳐야 한다.
   - 고칠 것: run 만들기가 연결 실패·5xx 로 끝나면 명령 바가 한두 번 짧게 다시 보낸다.
2. **[r3-xi · `tools/ext/map.py` / 국내 화면] 국내 지명 확대가 지명을 무시한다.** 해외 1차 must_fix 1 과 같은 종류다. gj-manager 가 목포를 보고 있을 때 'Zoom in on Gurye-gun'·'구례군 확대해 줘' → 목포 자리에서 한 단계 확대하고 "Zoomed in on the map." / "지도를 확대했습니다."로 답한다. 중심은 [126.3633, 34.7684] 그대로다(`p2-dom3.json`). 'Zoom in on Moskva'(관할 밖 해외)도 지금 자리를 확대한다(`p2-dom2.json`). 확대한 것은 사실이지만 요청한 지역은 무시했다.
   - 고칠 것: 해외와 같은 규칙. 관할 시군구면 이동한 뒤 확대하고, 관할 밖·모르는 이름이면 동작 없이 거절한다.

## 보완 권고 (막지는 않음 · 화면은 Fable 몫)
- 국내 계정 'What is the NDVI in Moskva?' → "No data for this area yet. Next: ask LX to run AI analysis for this area…". 해외 구역인데 국내 기관에 분석 요청을 권한다. "관할 밖" 안내가 더 맞다.
- 좌하단 HUD 'Districts that don't match · {구역}' 글자가 흰 설산 위에서 잘 안 읽힌다.
- 'zoom out to Moskva' 처럼 관할 밖 확대·축소는 위치만 보인다. 답에 "확대는 하지 않았다"는 말은 없지만 'location only'로 충분히 정직하다.

## 판정
- r3-global 완료 기준(M4 · C4 · C3 · 관할 · 국내 회귀 · 테스트)은 보고서에 없는 지역(Moskva · 강진군 · 순천시 · 보령)과 새 표본 대장으로 모두 재현했다. 1차 must_fix 1·2 는 **해소를 확인했다.**
- **r3-global 합격.** 남은 두 건은 다른 작업(r3-route · r3-xi)이 소유한 파일의 문제라서 그쪽으로 넘긴다.
