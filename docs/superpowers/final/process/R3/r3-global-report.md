브리핑 확인: (1) 숫자는 도구 결과(봉투) 한 출처에서만 쓴다. 지어낸 숫자와 운영 서사는 쓰지 않는다. 표본 대장의 신고값은 '표본'이라고 밝힌다. (2) 확인은 로그인 폼과 화면 조작만으로 했다(해외 기관 두 곳 + 국내 한 곳). DB 는 대조할 때 읽기만 했다. (3) GPU 는 쓰지 않았다(지도 동작·대장 대조는 CPU 와 런타임 직행이다). vLLM·Ollama 는 끄지 않았다. git commit·reset·checkout·restore 는 하지 않았다.

# r3-global — 해외: 말로 지도 제어 + 구역 대장 × AI 대조 + 어긋난 구역·영어 요약 · ③ 개발 보고 (2026-09-30)

## 1. 결과 한 장 (완료 기준)
| 기준 | 판정 | 증거 `shots/r3/r3-global/` |
|---|---|---|
| **M4** kgz-agri·kgz-land 에서 6문(Zoom in · Zoom out · Turn off the imagery layer · Turn it back on · Go to {구역} · Tilt to 3D) | ● 두 계정 12/12 가 지도 상태를 바꿨다. 성공 12건 모두 `ok:true` 이고 이유 없는 실패는 0건이다. NDVI 요약으로 샌 답은 0건이다. 모두 런타임 직행이어서 LLM 토큰은 0이다 | `agri-m1..m7.png` · `land-m1..m7.png` · `prove-all.json` |
| 　기록값(agri) | 줌 8.94→9.94→8.94 · 영상 층 visible→none→visible · 중심 [75.2041, 42.649] · 기울기 0→55→0 | 〃 |
| 　기록값(land) | 줌 8.47→9.47→8.47 · 영상 층 visible→none→visible · 중심 [74.716, 42.7493] · 기울기 0→55→0 | 〃 |
| 정직한 실패(M5 연동) | ● 줌 18 에서 'Zoom in'을 하면 화면이 `ok:false, reason "Can't zoom in any further"` 를 낸다. 명령 바 답은 "Couldn't zoom in — Can't zoom in any further."다(두 계정) | `*-e1-z18.png` · `*-e2-zoomin-at-max.png` · `prove-edge.json` |
| **C4 최소** 구역 대장 올리기 → 맞춘 비율 | ● agri CSV: "Matched 5 of 6 rows · 83.3%". land XLSX: "Matched 3 of 4 rows · 75.0%" | `agri-r1-uploaded.png` · `land-r1-uploaded.png` |
| 'How many districts don't match?' 숫자 = 화면 목록 수 = DB | ● agri 1 = 목록 1줄(Ysyk-Ata +53%) = DB mismatch 1. land 1 = 목록 1줄(Sokuluk −34%) = DB 1 | `*-r2-howmany.png` · `db-check.txt` |
| 지도 칠하기 | ● 어긋난 구역은 빨강 채움, 맞는 구역은 청록으로 칠한다. 관할 밖·못 맞춘 행은 칠하지 않는다 | `agri-r5-after-f5.png` |
| F5 뒤 유지 | ● 새로 고침 뒤에도 같은 파일, 같은 맞춘 비율, 같은 목록, 같은 칠하기가 나온다(사람별 최근 대조를 서버가 기억한다) | `*-r5-after-f5.png` |
| **C3 최소** 'Summarize the findings' | ● 영어 한 단락이다. 숫자는 모두 이 도구의 봉투 자리표에서 나오고, 글자로 쓴 숫자는 연도뿐이다. 모델을 부르지 않으므로(토큰 0) 가드 위반도 0이다. 예: "Findings for Ysyk-Ata (district level, not parcels): The uploaded district register has 6 rows; 5 matched … Of 1 district compared with the AI cropland map, 1 district differs … Ysyk-Ata (declared 45,000 ha, AI 68,726 ha, 52.7%) … latest NDVI mean was 0.3 (Oct 2025). Built area changed by …" | `*-r4-summary.png` |
| **관할** | ● kgz-agri 가 Sokuluk 대장·NDVI 를 물으면 "Sokuluk is outside your districts…"로 답하고 값은 0이다. kgz-land 가 Ysyk-Ata 를 물어도 같다. 국내 'Show suspect parcels in Namwon-si'·'Go to Namwon'·'남원시 의심 필지 몇 건?'은 거절된다(run `rejected cross_tenant` · 토큰 0) | `*-g1..g5.png` |
| 국내 영어 회귀 | ● namwon-manager 'How many suspect parcels are there in Namwon-si?' → "There are 20,872 suspect parcels…". 'Zoom in' → 확대 `ok 1/1` | `dom-namwon-en.png` · `dom-namwon-zoom.png` |
| `test_r3_global.py` | ● 19개 녹색. `test_vlm_global.py` 38개도 그대로 녹색이다. `agent/tests` 전체는 441 통과 · 2 실패인데, 둘 다 다른 작업 파일에서 난다: `test_c2_core::test_main_mounts_law_router_optionally`(main.py 목록이 r3-train 몫으로 바뀜) · `test_meaning::test_ay_real_f2s_build_draft_citations`(보고서 라벨 · r3-law-report) | pytest |

## 2. 만든 것 (소유 파일만)
| 파일 | 내용 |
|---|---|
| `server/agent/tools/ext/global_.py` | ① **말로 지도 제어 직행**: 지도 동작 한 가지만 있는 문장(zoom in/out · 줌 N · imagery/satellite 층 끄기·켜기 · 'it/back on' · tilt/3D/top view · go/move/take me to {구역})은 모델 앞에서 새 도구 `global_map` 으로 보낸다. 자료 낱말(NDVI·crop·how many·summar·mismatch …)이 섞이면 이 직행에서 빠진다. 'Turn it back on'은 같은 사람의 앞 답이 바꾼 층으로 푼다(없으면 영상 층). 답은 동작 한 줄뿐이고 숫자는 없다. 'Zoom to {구역}'은 기존 계약(값 요약 + 위치 가드)을 그대로 둔다. ② **구역 대장 도구** `global_mismatch`(어긋난 구역 수·목록)와 `global_findings`(한 단락)를 추가했다. 값은 `global_data` 한 곳에서 가져와 봉투로만 쓰고 답은 런타임 문장이다. ③ **국내 지명·모르는 이름 가드**: 한글·로마자 국내 지명(Namwon·-si/-gun…)이 나오면 다른 지역 값으로 대신 답하지 않는다. 지도도 움직이지 않고 한 줄로 막는다. 전에는 'Show suspect parcels in Namwon-si'가 Ysyk-Ata NDVI 로 답했다 |
| `server/landxi_api/global_data.py`(신규) | `POST /global/registers`(CSV·XLSX) · `GET /global/registers/latest` · `GET /global/registers/{id}` 를 둔다. 구역 열은 경계와 가장 많이 맞는 열로 자동으로 찾는다. 값 열은 머리글 낱말과 숫자 비율로 찾고, 단위(ha·km²)도 인식한다. 이름은 정확 → 코드 → 현지(키릴) → 로마자 표기 흔들림(Issyk↔Ysyk · Djety↔Jeti · Chui↔Chuy) 순으로 맞춘다. 대조 식은 (AI − 신고)/신고이고, 기준 30%를 넘으면 어긋남이다. 관할 밖 행은 AI 값을 내지 않는다. 결과는 기관 + 사람 단위로 저장하므로 다른 담당자의 대장은 열리지 않는다. 응답의 숫자는 모두 봉투다(개발 모드 봉투 검사 통과) |
| `server/pipelines/global/g6_district_cropland.py`(신규) | 해외 구역 42곳(키르기스 41 + 메이크틸라)의 **AI 경작지 면적**을 만든다. Sentinel-2 10 m AI 토지피복의 경작지 클래스를 약 40 m 표본으로 읽고, 구역 폴리곤 안의 면적(ha)을 위도별로 셈한다. 구름·빈 값은 뺀다. 결과는 `district-cropland-2025.json` 으로 정본(`02. 데이터/global`)과 화면 사본(`landxi/v3/global/data`)에 둔다. 원천 응답은 raw 캐시에 둬서 다시 돌려도 같다. 예: Ysyk-Ata 68,726 ha · Sokuluk 85,445 ha(추정) |
| `landxi/v3/global/app.js` · `global.css` | ① `map_layer`(imagery·results·districts·mismatch)를 처리한다. ② `map_zoom`·`map_view`·`map_region` 은 움직임이 끝난 뒤 상태를 재서 `ok` 를 판정한다. 바뀌지 않았으면 `ok:false` 에 사용자 말 한 줄을 `reason` 으로 담는다(plan 3.1). ③ `map_on mismatch` 를 처리한다. ④ **Register 탭**(최소 UI · 화면 판단은 Fable 몫)을 추가했다. 내용은 '구역 단위 — 필지 아님' 한 줄, 대장 올리기, 맞춘 비율, 구역·신고·AI·차이 표, 관할 밖·못 맞춘 행 수이고, HUD 는 'Districts that don't match'다. ⑤ 첫 화면이 이 사람의 최근 대조를 불러와 칠한다(F5 유지). ⑥ 동작 기록 `window.__glAgent`(줌·기울기·중심·영상 층 전후)를 남긴다. 화면에는 보이지 않는다 |
| `server/agent/tools/ext/vlm.py` | 영어 서수 'the 3rd parcel/district'·'parcel 4'·'2nd one'을 순위로 풀어 한국어처럼 직행한다(모델 경로 약 12,000 토큰 → 직행). 영어 답 첫 줄은 'Target: …'다 |
| `server/agent/tests/test_r3_global.py`(신규) | 지도 6문 직행(두 기관 · 문맥 꼬리 포함), 자료 질문 비간섭, 국내 영어 비간섭, 동작 답 숫자 0, 'it' 풀기, 관할(다른 기관·국내 지명), 구역 이름 맞추기·음역, 열·단위 고르기, 어긋남 계산(기준·관할 밖·못 맞춤·값 없음·km²), CSV·XLSX 읽기, 응답 봉투 검사, 개수·목록·요약 답의 자리표 = 봉투, 대장 질문 직행, 직행 인자의 명세 검증(enum), 영어 서수를 확인한다. 19개 |

## 3. 기본값 (사소한 것 · 묻지 않고 기록 · 사용자가 나중에 정정)
| 항목 | 기본값 | 바꾸는 곳 |
|---|---|---|
| 'AI 값' | 구역 안 AI 토지피복 경작지 면적(2025 · 추정). NDVI 저활력 면적은 NDVI 결과가 있는 구역만 있어서 대조 기준으로 쓰지 않았다 | `global_data.CROP_FILES` · g6 `--year` |
| 어긋남 기준 | ±30% | 올리기 폼 `threshold` · `THRESHOLD` |
| 관할(값 비교) | 이 기관 배포 범위와 15% 이상 겹치는 구역(기존 해외 화면·도구와 같은 판정). 지금은 kgz-agri = Ysyk-Ata, kgz-land = Sokuluk 한 곳씩이다 | 배포 범위(LX 관리자) |
| 표본 대장 | `kgz-agri-sample-register.csv`(6행) · `kgz-land-sample-register.xlsx`(4행)의 **신고값은 확인용 표본**이다(실제 통계 아님). 구역 이름은 현지 경계 이름이다 | `shots/r3/r3-global/` |
| 표 저장 | 표 두 개(`global_registers` · `global_register_rows`)는 첫 사용 때 관리 연결로 만든다(멱등). 앱 역할에는 CREATE 권한이 없어서 `agent/record.py` 와 같은 방식을 썼다 | 마이그레이션 파일로 옮기려면 아래 5절 |
| 탭 이름 | Register(영문 화면) | `STR.tabs` |

## 4. 알려진 한계
- **관할 구역이 기관마다 한 곳이다.** 그래서 '어긋난 구역 수'는 0 또는 1만 나온다. 구조는 여러 구역을 그대로 받는다(LX 계정은 42곳 전체와 대조한다). 비교 구역을 늘리려면 LX 관리자가 배포 범위를 넓혀야 한다(사용자 결정).
- AI 경작지는 10 m 지도를 약 40 m 로 표본한 추정값이다. 휴경지·목초지 경계에서 차이가 날 수 있다.
- 'Bishkek city'는 경계를 확보하지 못해서(bbox) 못 맞춘 행이 된다.
- 앞선 두 회차(`prove-map.json` 과 그 뒤 회차)에서 kgz-land 질문 다섯 개가 'Can't answer right now'로 끝났다. run 기록이 아예 없었으므로 `POST /agent/runs` 가 LLM 헬스 검사(503)에서 막힌 것으로 본다. 게이트웨이 재기동 뒤 마지막 회차(`prove-all.json`)에서는 0건이었다. 모델을 부르지 않는 직행 질문까지 LLM 헬스에 막히는 것은 r3-route 몫이다.
- 화면 문구·배치(탭·표·HUD)는 최소 UI 다. Fable 판단 대상이다.

## 5. 다른 작업에 요청·알림
- **r3-xi**(`tools/ext/map.py`): 국내 `ZOOM_IN`/`ZOOM_OUT` 정규식에 `re.I` 가 없다. 그래서 'Zoom in'(대문자)은 국내 지도 직행에 걸리지 않고 모델 경로로 간다(확인 때는 모델이 확대를 잘 불렀다). 'zoom in'(소문자)만 직행한다.
- **r3-route**: ① 대장 도구의 `status: outside` 문구를 러너가 "This is not your agency's data."로 바꿔 쓰는 것을 확인했다(3.2 동작 정상). ② 명령 바 칩의 단위 `count` 는 영어로 'cases'가 된다. 구역 수에는 맞지 않아서 봉투 단위를 `districts`(한국어 '곳')·`행` 으로 줬다. 키트 i18n 에 `unit.districts` 를 넣어 주면 좋다.
- **r3-train / Ship**: `global_data` 표 DDL(모듈 `DDL`)을 `migrations/0009_global_registers.sql` 로 옮겨도 된다. 모듈 쪽은 멱등이라 그대로 동작한다. main.py 등록은 이미 들어가 있다.
- **c2 테스트**: `test_vlm_global.py` 의 ROUTE 계약(동기 호출 · 'Zoom to X' 인자)을 지키려고 ROUTE 를 동기로 두었다.

## 6. 코어 상태 (CORE.md 기준)
| 코어 | 이번 변화 |
|---|---|
| C8 글로벌 | '해외 화면에서 말로 확대가 안 됨'을 해소했다(M4). 해외 C4(구역 대장 × AI)와 C3(어긋난 구역 목록·지도·영어 요약)를 최소로 열었다. 필지가 아닌 구역 단위다 |
| C2 vLLM 서비스 | ① 지도 제어가 해외 영어로 넓어졌다(토큰 0 직행). ⑦ 영어 영상 설명 서수 직행 · 'Target:' 첫 줄. ⑨ 해외 대장 답의 숫자는 도구 봉투뿐이다 |
| C4 행정데이터 융합 | 해외 기관도 대장(CSV·XLSX)을 올려 AI 와 대조한다. 사람별로 기억하므로 F5 뒤에도 유지된다 |
| C3 실태조사 | 해외 구역 단위의 '어긋난 구역' 목록·칠하기가 생겼다 |
| C1 · C5 · C6 · C7 · C9 | 이 작업에서 바꾸지 않았다(각 R3 작업 보고 참조). C9: 이번 기능은 명령줄 없이 화면만으로 끝난다. 단, AI 경작지 파일(g6)은 사전 수집 파이프라인이다 |

## 7. 다음 단계
- ④ 실증은 구현에 참여하지 않은 확인자가 한다. 해외 두 기관과 무작위 국내 한 곳을 확인한다.
- 확인 스크립트(로그인 폼 → Ask → 대장 탭 파일 → F5)는 스크래치에 두었다(저장소 루트 밖). 증거 JSON 은 `shots/r3/r3-global/prove-*.json` 이다.

---

## 8. 실증 1차 보완 (2026-09-30 15:00 · must_fix 3건 중 이 작업 몫 2건 해결)
브리핑 확인: (1) 지도 동작을 했다고 말하는 답은 실제로 보낸 동작과 같아야 한다(거짓 성공 0). (2) 확인은 로그인 폼과 명령 바 입력만으로 했다(해외 두 기관 + 국내 한 곳). (3) GPU 작업은 넣지 않았고 vLLM·Ollama 는 끄지 않았다. 게이트웨이는 시작 스크립트의 `-Restart gateway` 로만 다시 띄웠다. git 은 쓰지 않았다.

| must_fix | 고친 것 | 화면 확인 (`shots/r3/r3-global/fix1/`) |
|---|---|---|
| 1. 지명을 붙인 확대가 그 지역을 무시하고 "Zoomed in."이라고 답함 | `global_.py`: 'zoom in/out on·to·at·into {이름}'은 지명을 먼저 푼다. 'the map'·'it'·'this' 같은 말은 지명으로 보지 않고 그냥 확대한다. 'Zoom to {구역}'은 기존 계약(값 요약)을 그대로 둔다. **관할 구역**이면 `map_region` 하나에 `zoom_delta` 를 실어 보낸다. 화면은 그 구역으로 옮긴 뒤 확대하고, 끝 신호는 하나다. **관할 밖 해외 구역**이면 위치만 보이고 가드 한 줄을 낸다. **국내 지명·모르는 이름**이면 지도 동작 없이 거절한다. `global/app.js`: `map_region` 이 `zoom_delta` 를 처리한다. 더 확대할 수 없으면 `ok:false` 를 낸다 | 두 계정 모두 확인했다. 'Zoom in on {내 구역}' → "Moved the map to Sokuluk and zoomed in."(줌 8.47→9.47). 'Zoom in on Ak-Suu' → 위치만 보임(중심 [74.716, 42.749]→[79.647, 42.193]) + "Ak-Suu is outside your districts…"이고, 확대했다는 말은 없다. 'Zoom out to {내 구역}' → 그 구역으로 돌아와 한 단계 축소했다. 'Zoom in on Yeosu' → "This is not your organization's data."이고 동작은 0, 카메라는 그대로다. 'Zoom in on Atlantis' → "No district named…"이고 동작은 0이다. 'Zoom in on the map' → 그냥 확대(회귀 0). `fix-agri.json` · `fix-land.json` |
| 2. 관할 밖 대장 질문이 하지 않은 지도 동작("the map shows its location")을 말함 | `global_mismatch` 의 관할 밖 경로가 `map_region`(위치만)을 실제로 보낸다. 국내 지명·모르는 이름은 지도를 말하지 않는 거절 그대로다 | agri 'How many districts don't match in Sokuluk?'·'Show the mismatched districts in Sokuluk', land 의 Ysyk-Ata 두 문장 → 모두 `map_region ok:true` 이고 카메라가 그 구역 위치로 옮겨졌다(예: [75.204, 42.649]→[74.716, 42.749]). 값은 0개다 |
| 3. 토큰 0 직행이 게이트웨이·LLM 상태 검사에 막힘 | **r3-route 몫(러너·명령 바)이라 손대지 않았다.** 이번 확인 중에도 다시 나왔다. 15:03–15:04 게이트웨이가 헬스 3/3 실패로 감시 재기동됐고, 그 사이 'Zoom out to Sokuluk'·'Show the mismatched districts in Ysyk-Ata' 2건이 'Can't answer right now'로 끝났다. 14:58:47 에 다른 작업의 게이트웨이 재기동이 있었을 때도 1건이 같았다. 같은 문장을 다시 보냈을 때는 모두 성공했다 | 게이트웨이 감시 기록 15:03:52–15:04:39 |

- 문구 한 곳도 고쳤다. 관할 밖 행 수 문장이 "1 outside your districts was not compared"여서, "1 row(2 rows) outside your districts…"로 바꿨다.
- 이번 회차에서 확인한 대장 숫자: agri 'How many districts don't match?' → **1**(Ysyk-Ata, 신고 30,000 ha · AI 68,726 ha · 129.1%), land → **0**(비교 1곳). 실증 기록의 DB 값(agri 1 · land 0)과 같다. 'Summarize the findings'도 두 계정 모두 같은 숫자의 한 단락이다(모델 미호출 · 가드 위반 0).
- 국내 회귀: gj-manager 'How many suspect parcels are there in Yeosu-si?' → 10,506(실증 기록과 같음), 'Zoom in' → `map_zoom ok`. `fix-dom.json`.
- 테스트: `test_r3_global.py` 에 3개를 더했다(지명 확대 라우팅, 지명 확대 동작 — 관할·관할 밖·국내·모르는 이름·LX, 관할 밖 대장 답의 위치 이동). `test_r3_global.py` + `test_vlm_global.py` 60개가 녹색이다. `agent/tests` 전체는 453 통과 · 1 실패다. 실패 1건은 `test_c2_core::test_main_mounts_law_router_optionally` 이고, main.py 목록이 r3-train 몫으로 바뀐 것이라 이 작업과 관계없다.
- 바꾼 파일: `server/agent/tools/ext/global_.py` · `landxi/v3/global/app.js` · `server/agent/tests/test_r3_global.py`(모두 소유 파일).
- 코어 상태: C8 은 '해외 화면 말로 확대'에 남았던 지명 확대의 거짓 성공이 풀렸다. C2 ⑨(동작 답 = 실제 동작)가 해외 대장 경로까지 넓어졌다. C1·C3·C4·C5·C6·C7·C9 는 이번에 바꾸지 않았다. C2 의 '직행이 게이트웨이 상태에 막힘'은 r3-route 에 남아 있다.
