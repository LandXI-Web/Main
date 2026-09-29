브리핑 확인: (① 지역 하드코딩 금지 — 남원은 예시, 여수와 같은 코드 경로 ② 숫자 한 출처 · 지어내지 않기 — AI 가 없거나 영상 밖이면 'AI 분석 전' ③ 확인은 로그인 폼으로만 · GPU 는 게이트웨이 대기열 한 장 · git 조작 금지)

# core-fusion — 행정데이터 융합 + AI 도우미를 어느 기관·시군구에서나 (코어 ③)

2026-09-29 · Opus 5.5 · 소유 파일만 수정 · git 조작 없음 · 증거 `shots/core/core-fusion/`

## 한 줄 결과
광주전남 담당자가 **여수(새 지역)** 농지대장을 올리면, 서버가 그 시군구 필지를 자동으로 적재(core-survey `POST /survey/build`)하고 **AI 분석 결과와 대조해 어긋난 필지 수를 숫자로** 보여 준다(화양면 안포리 2,814필지 → **대장은 농지 · AI는 건물 67필지**). 남원은 같은 코드 경로로 **431필지 그대로**(회귀 0). AI 도우미는 기관 관할 · LX 는 지역 인자로 답하고, 다른 기관 시군구는 `이 기관의 데이터가 아닙니다` 한 줄로 막는다.

## 완료 조건 대조
| 조건 | 결과 | 증거 |
|---|---|---|
| 광주전남(로그인 폼) · 여수: 대장 올리기 → 열 확인 → 결합 → 어긋난 필지 수 숫자 → 한 문장 → 지도 채색 + 표 + 집계 · vLLM 실연결 | **충족.** `화양면_안포리_농지목록.xlsx` 2,814행 → 결합 100.0% → **67필지**(작은 칩: 주차장 0 · 경작 흔적 없음 374) → `대장상 전인데 AI가 건물로 본 필지` → **53필지** · 지도 빨강 채색 · 표 2행. 질문은 게이트웨이 `/agent/runs` → **vLLM `gemma-4-12b-it`**(agent_runs.model.backend = vllm, 리플레이 0) | `gj-yeosu-1440.mp4`(19.5초) · `gj-yeosu-1440-1…5.png` · `gj-yeosu-390-1…5.png` · `gj-yeosu-1440-log.json`(agent_runs backend vllm) · `measure-db.log` |
| 원래 파일 `화양면_농지목록`(이목리 786필지) | 결합 **38.2% → 100.0%**(V-World 상한 대신 적재된 연속지적 지번 해석 · 3.2초). 이목리는 2023 25cm 영상 범위 밖(786 중 1필지만 안) → **0필지가 아니라 `영상 범위 밖 785필지는 AI 분석 전`**(정직). 그래서 판정용 여수 대장은 영상 범위 안 화양면 안포리로 만들었다(기본값 1) | `measure-db.log`(imp_…BVVV · ai.sgg.outside 785) |
| 남원 담당자(로그인 폼) 같은 흐름 회귀 | **변동 0.** 운봉읍 13,866행 · 결합 100.0% · **431필지** · 주차장 2 · 경작 흔적 없음 1,309 · 질문 `대장상 답인데 AI가 건물로 본 필지` → 183필지 · 리별 막대(권포리 23 · 산덕리 16 · 매요리 14) | `nw-namwon-1440.mp4`(19.5초) · `nw-namwon-1440-*.png` · `nw-namwon-390-*.png` |
| LX 직원 세션 여수/남원 질문 → 각 지역 데이터 | **충족.** XI맵 Ctrl K(로그인 폼): `여수시 대장상 농지인데…` → 여수 화양면 67건 · 상위 10필지 지도 도착 · `남원시 …` → 431건 · `여수시 의심 필지 전체 몇 건` → 10,499필지. ui_actions 에 `sgg_cd`(12130 · 52190) · `import_id` 실림 | `lx-staff-xi-1440-q1…q3.png` · `lx-staff-xi-1440-log.json` · `agent-runs-api.log` |
| 광주전남 세션의 남원 질문 → 권한 밖 한 줄(403 가드) | **충족.** gov-fusion Ctrl K `남원시 대장상 농지인데…` · `전주시 농지대장이랑…` → `이 기관의 데이터가 아닙니다`. 반대로 남원 세션의 `여수시 화양면 …` 도 같은 한 줄. 도구 단 가드(scope.region_of) = 403 `tool_forbidden` | `gj-guard-1440-q1…q3.png` · `nw-guard-1440-q1.png` · `agent-runs-api.log` |
| 도구 · 설명문 · 기본값 지역 문자열 0 | **충족.** 소유 파일 grep: 도구·라우터·대장·화면 0건. 남은 줄은 벤치 문항(`bench.py`)과 회귀 시험 주체(`runner.redteam_eval` 의 시험 계정) 뿐 | `grep-region-strings.txt` · `server/tests/test_fusion_nation.py::test_tool_specs_have_no_region_names` · `::test_tool_sources_have_no_fixed_region` |
| forbidden(gj-manager · namwon-manager × 1440 · 390) 0 · 콘솔 오류 0 | **0 / 0**(4회) · 흐름 녹화 · 질문 스크린샷 모두 콘솔 오류 0 | `forbidden.txt` · 각 `*-log.json` |
| `server/agent/tests` · `server/tests` 통과 | agent/tests + test_fusion_nation **150 passed**. server 전체 332 passed / 12 failed → 실패는 다른 작업의 게이트웨이 재기동(ConnectError) · GPU 전력 게이트 · 요약 수(core-xi 여수 새 결과) 쪽이고, 대장 관련(`test_f3_server -k s2` 3개) · 계약(`test_contract`) · `test_f2b_api` 는 다시 돌려 **57 passed** | 아래 '시험' |

## 바꾼 것(소유 파일)
**서버 · 대장 융합 `server/landxi_api/ledger.py`**
- 대장이 가리키는 시군구를 찾는다(`_target_sggs`: PNU 앞 5자리 → 주소 속 관할 시군구 이름 → V-World 표본 5행). 관할 밖 · 1% 미만은 버린다.
- 필지가 없으면 core-survey `POST /survey/build` 를 사용자 토큰으로 요청하고 `survey_sgg` 가 끝날 때까지 기다린다(`_ensure_parcels` · 대기열 · 20분 상한). AI 없이 적재된 시군구(`no_ai`)에 그 뒤 전역 분석이 끝났으면 그 작업으로 다시 결합을 요청한다. 게이트웨이가 다시 떠도 진행 중 적재는 이어서 기다린다.
- 필지 색인 = 대상 시군구 필지만(옛/새 코드 모두). PNU 는 지금 코드로(`canon_pnu` · 46130→12130).
- 규칙 L-* 의 AI 값 = `ai_parcels()`: 그 시군구 현재 작업(`survey_sgg.job_id`)의 `survey_parcel_ai`(core-survey `survey.nation.ai_operands` 와 같은 식) → 옛 이름(a23_* · r23_*)으로. 정본 적재(남원) 필지는 옛 열 그대로(회귀 0). **작업 범위 ∩ 영상 범위 밖 필지는 판정하지 않는다**(영상 밖을 '경작 흔적 없음'으로 오판하지 않게). 일반 피연산자 `ai.<cls>.<in_m2|hit_m2|n|conf>` · `ai.ratio.<cls>` 도 읽는다.
- AI 가 없으면 규칙을 돌리지 않고 `findings {}` + `ai.has=false`(0필지가 아니라 'AI 분석 전'). 반입 기록에 `sgg[]` · `ai{has, parcels, sgg[{state, year, outside}]}`(봉투).
- 새 경로: `GET /t/{tenant}/survey/registry/{import_id}/parcels`(결합된 대장 필지 GeoJSON + AI 값 · 정적 필지 층 없는 관할용) · `GET /t/{tenant}/survey/ledger-schema`(기관 세션이 카드 대장 형식을 읽는 길 — 이전 405/403 해결 · `parcel_tiles` 로 없는 파일을 두드리지 않음).

**AI 도우미 `server/agent/**` · `server/landxi_api/agent.py`**
- 새 `tools/scope.py`: 지역 판정 한 곳 — 기관 = `regions.tenant_scope` 관할(밖이면 403) · 지역을 안 말하면 그 기관 실태조사 시군구 · LX = `region` 인자(이름 · 옛/새 코드) → 없으면 전체. 읍면동은 `regions.emd_index`(core-xi).
- `tools/survey.py`: `OWNER_TENANT="namwon"` 삭제. 시군구 질문은 PostGIS(사용자 RLS · 그 시군구 PNU), 기관 전체는 계약 API, 둘 다 없을 때만 대체 파일. 필지 폴리곤도 PostGIS. 설명문 '남원 39개 법정동' · '남원시 전체' → `{시군구} 전체`.
- `tools/survey_local.py`: 파일 이름 = `{기관 id}-parcel-*`(고정 경로 삭제 · 그 기관 파일이 없으면 '해당 지역 데이터가 없습니다').
- `tools/registry.py` · `results.py` · `jobs.py`: 기본 세트 `results/lx/namwon-landcover-2023` 삭제 → 지역의 결과 층(`GET /regions/{sgg}/results`)에서 토지피복 먼저. `map_on` 고정 세트 → `survey/findings` + 필터(`rule · ledger · sgg_cd`) · ui_actions 에 `sgg_cd` · `import_id`. 모델 선호 목록 고정값 → 클래스로 고르는 `prefer()`.
- `tools/ledger_*` · `parcel_lookup.py`: 시도 이름 떼기 규칙 일반화(`scope.short_addr`), LX 는 시군구로 관할 기관을 찾는다(`tenant_of_region`), AI 없으면 'AI 분석 전' 안내, 지도 도착은 필지 폴리곤, 답에는 규칙 코드 대신 규칙 이름.
- `runner.py`: `대장상 ~인데 AI가 ~` 질문은 `ledger_findings` 직행(요약 도구로 새지 않게) → 지도 도착 → 답 문장은 vLLM. 도구 명세에 `region`. 시스템 문장에 용어 규칙(판독→AI 분석 등). gov-fusion 결합표 질의(JSON 계획)는 그대로 모델 경로.
- `audit.py`: 기관 이름표(`TENANT_WORDS` 고정 표) → `regions.yaml` 관할 · `region_profiles.yaml` 이름에서 만든다. 권한 밖 문구에서 기관 id 제거 → `이 기관의 데이터가 아닙니다`.
- `report.py` · `backends.py` · `record.py` · `landxi_api/agent.py`: '대상: 남원시' → 데이터의 시군구 이름, 라우터 예문 · 리플레이 경로 · 파일 데우기 등 남원 고정값 삭제.
- `redteam.yaml`: 다른 기관 시군구 질의 8문 추가(RT67–RT74).

**화면 `landxi/v3/gov-fusion/**`** (기능이 보이는 최소 UI · 기존 부품·문구 재사용)
- 새 `srvindex.js`: 정적 필지 층이 없는 관할은 서버 결합 결과가 오면 서버 필지 색인으로 바뀐다 → 큰 숫자 · 작은 칩 · 표 · 지도 채색 · Ctrl K 가 같은 필지 집합(한 출처).
- `app.js`: 서버 결합 대기(새 시군구 적재 · 20분), 영상 범위 밖 필지 한 줄(`영상 범위 밖 708필지는 AI 분석 전`), 없는 정적 필지 파일을 두드리지 않음(콘솔 404 0), 관할 밖 판정에 '○○시 ○○구' 시 이름 포함, 결과 근거 문구의 '2023 25cm' 고정 → 작업 영상 연도.
- `registry.js`: 소재지 + 지번 두 열을 이어 서버로(이전엔 첫 열만 → 서버 지번 해석 실패), 대장 종류 = `ledger-schema`.
- 샘플 `sample/화양면_안포리_농지목록.xlsx`(연속지적 농지 2,814필지 · 기본값 1).

**시험** 새 `server/tests/test_fusion_nation.py`(10): 도구 명세의 전국 시군구 이름 0 · 소스 고정 코드/기관 id 0 · 관할 밖 403 · LX 지역 인자 · 옛/새 코드 PNU · 기관 이름표가 설정에서 · 피연산자 두 이름 일치 · 저장된 의심 = 재평가(한 출처) · AI 없는 시군구 판정 0 · 새 경로 등록. 기대값은 설정 · 문항 파일 · DB 에서 센다.

## 실측(보고서 전용)
| 항목 | 값 |
|---|---|
| 여수 필지 적재(core-survey 작업 · 내 반입이 요청) | 요청 21:01:52 → 첫 시도 실패(core-survey 쪽 SQL 오류, 곧 수정) → AI 작업과 함께 재적재 완료 ~21:11 · **307,137필지** · AI 겹친 필지 27,946 |
| 대장 결합(서버 · 반입 → 규칙까지) | 남원 13,866행 **3.2초**(지번 13,866) · 여수 이목리 786행 **3.2초**(지번 786 · 이전 V-World 상한 300행에서 38.2%) · 여수 안포리 2,814행 **약 6초**(API 폴링 포함) |
| 화면(로그인 → 결과 숫자) | 여수 16.4–20.5초 · 남원 16.4–17.3초(로그인 · 착지 대기 4.5초 포함) · 질문 → 채색 약 1–5초 |
| 여수 안포리 대조 | AI 분석 필지 2,106 · 영상 범위 밖 708 · L1 67(= core-survey R1 67, 영상 밖 0) · R2 374(영상 밖 0) |
| 에이전트(vLLM gemma-4-12b-it) | 대장 직행 답 3.0–7.1초 · 요약 2.5–3.5초 · 권한 밖 0.1–1.0초(LLM 0) |

## 기본값으로 정한 것(사용자 정정 가능)
1. **판정용 여수 대장 = 화양면 안포리 농지 2,814필지**(연속지적에서 지목 전·답·과 · 기존 샘플과 같은 열). 원래 `화양면_농지목록`(이목리)은 2023 25cm 영상 범위 밖(786 중 1필지)이라 숫자 판정이 불가 — 그 파일은 '영상 범위 밖 785필지는 AI 분석 전'으로 정직하게 남긴다.
2. 영상 범위 판정 = 작업 범위(aoi) ∩ 영상 범위(footprint) 안에 필지 대표점이 있는가.
3. 대장 질문 직행 조건 = 문장에 대장·신고·허가 + 규칙 L-* 어휘, 숫자(임계)가 있으면 확인 카드 경로(ledger_rule).
4. 권한 밖 문구 한 가지 `이 기관의 데이터가 아닙니다`(기관 id 노출 0).
5. 에이전트 지도 층 이름 `survey/findings` + 필터 `{rule, ledger, sgg_cd}`.
6. 필지 적재 대기 상한 20분(서버 · 화면 같음).
7. 기관 이름표(권한 밖 판정 낱말) = 관할 시군구 어간 · 시도 약칭 · 프로필 이름(설정 파일에서).

## 남은 것
- 벤치 문항(`agent/bench.py`)과 회귀 시험 계정(`runner.redteam_eval`)은 남원 문항·계정을 그대로 둔다(시험 입력).
- 샘플 대장의 상태 열이 지목이라 L2(경작 신고 · 흔적 없음)는 두 지역 모두 0 — 실제 '경작 여부' 열이 있는 대장이 오면 돈다.
- 모델 답 문장이 가끔 '표시한 상위 n' 봉투를 '조건에 맞는 전체'처럼 부른다(숫자 자체는 봉투 · 검증기 통과). 봉투 뜻 문구 다듬기 여지.
- 여수 연속지적(2022-02 로컬 원천)에는 용도지역 · 농업진흥이 없어 표의 용도지역이 `—`.
- 서버 전체 시험 12건 실패는 다른 작업 영역(게이트웨이 재기동 중 연결 거부 · GPU 전력 게이트 · 요약 수) — 대장 · 계약 · f2b 는 재실행 통과. GPU 시험은 전력 규칙상 다시 돌리지 않았다.

## Fable 에게 넘길 것
- 영상 범위 밖 필지 표기(지금은 결과 시트 한 줄 `영상 범위 밖 n필지는 AI 분석 전`) — 위치 · 위계 · '영상 등록 요청' 행동을 붙일지.
- 서버 필지 색인 관할(새 시군구)의 지도 채색이 정적 필지 층과 같은 색 규칙을 쓴다 — 줌별 불투명도 · 필지 경계선 검토.
- 광주전남 첫 화면 좌하단 서비스 카드(해양쓰레기 · 영농관리)와 대장 결과 카드의 관계(대장을 올리면 숨김).

## 요청
- **core-xi**: `xi-clean/app.js onAgent` 의 `map_on` 이 `a.filter.emd_cd` 로만 지역을 바꾼다 → 이제 실리는 `a.sgg_cd`(시군구) · `a.import_id` 로 지역 전환 · 머리글(지금 '전국'으로 남음)을 맞춰 주세요. `map_arrive` 는 그대로 동작(폴리곤 · 도착 확인).
- **core-survey**: 첫 적재 실패 `IndeterminateDatatype $5` 는 이미 고쳐진 것으로 보임(재적재 성공). `survey_parcels` 새 시군구의 용도지역 · 농업진흥 보강(V-World)이 되면 대장 표 · 필지 카드가 채워진다.
- **core-flow / 요약**: `tests/test_summary.py::test_values_match_source_tables` 가 광주전남 card-farm 12130(17,612)에서 실패 — 여수 전역 분석 결과의 요약 대조 기준 갱신 필요(내 소유 아님).
