# F1-D 결과 — Land-XI Global (키르기스스탄 으슥아타·소쿨룩·비슈케크 + 미얀마 메이크틸라 · 글로벌판 영문)

- 작성 2026-09-26(2차 · 1차 판정 불합격 5건 반영 23:20) · 브랜치 plan1-foundation(커밋하지 않음 · 통합 단계에서 커밋)
- 화면: `landxi/global/index.html?tenant=lx|kgz-agri|kgz-land&locale=en[&from=namwon][&svc=…]` · `login.html` · `fonts-compare.html`
- 판정 영상: `shots/f1/D/f1d.webm`(55.3 s · 1440×900 · lang=en · off 모드 = `Demo · replaying stored results` 표기 · 빈 캐시 첫 방문 녹화) · 같은 내용 `f1d.mp4`
- 사본: `shots/f1/F1-D/`(영상 · 스트립 · 정지 · 레퍼런스 · 로그)

## 1. 완료 기준 대조

| # | 기준 | 상태 | 근거 |
|---|---|---|---|
| 1 | 사전 수집 6파일 · source/fetched_at/license · 멱등 | 충족 | `landxi/global/data/*` 메타(`lx` 또는 최상위) · g1·g3 두 번 연속 실행 → `cmp` 동일(2026-09-26) |
| 2 | 글로브 순백 · GIBS 어제 · 36 채색 + 사할린 점 · 우 목록 · 날짜 스크러버(페이드 500) · 남원→글로브→비슈케크 2400×2 | 충족 | `f1d-globe` 5/5 · 카메라 기록 `[2400, 2400]` · `navigation` 1 |
| 3 | 으슥아타 락온 · Ысык-Ата · WorldCover 33.0 %(비율만 유효) · 월별 3→10 · **G-J1 큐 경유 8칸** · HUD · 곡선 · 작물 분류 결손 | 충족(on·off 둘 다) | off: 리플레이 8칸 순서 도착 · on: **F1-B 실 게이트웨이 8700(Redis 큐 · CPU 워커)** 경유로 화면에서 8칸 measured · 콘솔 0(`f1d-ysykata-ndvi` 실 게이트웨이 테스트 5.8 분 통과) |
| 4 | 소쿨룩·비슈케크: 배포본 유무 분기 · built 델타 격자 · Overture 압출(pitch 45) · 필라멘트 z9–11 · 스와이프 · 시범지 3 + boundary not acquired · 키릴 | 충족 | `f1d-sprawl` 3/3 · 315.2 → 359.6 km²(+44.4 km² · measured · 500 m 격자 · 근사) |
| 5 | 메이크틸라 Maxar 전후 스와이프 · EMS 38점(4/23/11) · 차트 · CC BY-NC 시연 칩 · export 제외 | 충족 | `f1d-meiktila` · `f1d-license-guard` 3/3 · G5 XYZ 각 1163 타일(404 0) |
| 6 | lang=en Inter 600/700 · ha/km² · 키릴 병기(ru UI 없음) · fonts-compare · login realm tenant | 충족 | `f1d-i18n-fonts` 4/4 |
| 7 | `ADAPTER` 상수 → F1-B 워커 스캔 등록 · 단독 실행 · PC 장애 recorded 폴백 | 충족 | `registry_scan.scan_adapters()`에 `index/ndvi_pc`(cpu) 있음 · `logs/adapter-standalone.log`(2025-06 · 6장면 · 0.438 measured · 150 s) · `logs/adapter-outage.log`(DNS 차단 → 0.438 recorded) |
| 8 | 두 모드 콘솔 0 · p95 ≤ 20 ms · 캔버스 ≥ 90 % · motion-law · 14 px 미만 0 · 소유 밖 수정 0 | 충족(외부 GIBS 일시 오류 1건은 아래 §5) | 녹화(2차): 오류 0 · p95 16.8 ms(n 3983) · 타일 부족 ≥2 가 500 ms 넘는 구간 0 · 캔버스 ≤ 2 · 정지 3폭: 캔버스 100 % · 14 px 미만 0 |
| 9 | 결과 문서: 레퍼런스 장치표 · 해외 기관 관점 · 계약 변경 요청 | 이 문서 | §2–§4 |

## 2. 레퍼런스 장치표

캡처 파일은 `shots/f1/D/ref/`에 있다. `side-*.png`는 레퍼런스와 F1-D 화면을 나란히 붙인 것이다.

| 레퍼런스 | 장치 | F1-D에서 가져온 것 | 가져오지 않은 것과 이유 |
|---|---|---|---|
| kepler.gl 시간 재생(`kepler-time-playback.png`) | 지도 아래 시간 막대 히스토그램 + 재생 창 | 월별 스크러버 **위** 히스토그램 자리에 G-J1 shard가 한 칸씩 도착 · 곡선이 칸을 잇는다 | 어두운 UI와 범위 브러시. 법전 v2는 흰 바탕이고, 우리 시간 축은 범위가 아니라 월 8칸으로 고정이다. |
| 전후 비교 뷰(Planet Explorer 대체) — Esri World Imagery Wayback swipe(`compare-swipe-esri-wayback.png` · 비슈케크 2026-08-05 ↔ 2014-02-20 · 2026-09-26 정상 로드 캡처) · NASA Worldview 비교 모드(`compare-swipe-worldview.png` · 추이 계곡 2025-07-15 ↔ 2017-07-15) | 두 날짜 영상 가르기 · 양쪽 날짜 표기 | 메이크틸라 Maxar 전후 · 소쿨룩 2017↔2025 스와이프(두 지도 clip-path · 양쪽 하단 출처·날짜 칩). 나란히: `side-swipe-vs-f1d.png`(Wayback ↔ 소쿨룩) · `side-worldview-compare-vs-f1d.png`(Worldview ↔ 메이크틸라) | Planet Explorer 는 로그인 뒤에만 열려 캡처 불가. 1차 제출의 Wayback 캡처는 크래시 화면이었다(판정 지적) → 창 모드 Chrome 으로 다시 받아 실제 비교 뷰로 교체. Wayback 의 버전 목록 레일은 우리 카드가 대신한다. |
| NASA Worldview 날짜 | 상단 날짜 선택 + 전 지구 일일 영상 | 상단 날짜 스크러버(어제 기준 −30일 · GIBS `{date}` · 타일 페이드 500) | 타임라인 드래그 애니메이션. 글로브 오버레이는 '어제' 한 장이 기본이라서 넣지 않았다(§10.5에서 뺀 항목). |
| Vantor(Maxar) 컬러웨이 | 흰 바탕 · 잉크 · 한 가지 액센트 | 피해 등급을 Destroyed 잉크 · Damaged 액센트 #006DF7 · Possibly 슬레이트로 칠했다. 빨강은 조치 문구에만 쓴다. | 빨강/주황 피해 램프. 법전 v2 색 역할과 맞지 않는다. |

## 3. 해외 기관 관점 점검(키르기스 농업부 · 토지자원청 · LX 글로벌사업처)

- **언어**: UI는 영문, 지명은 키릴로 함께 적는다(Ысык-Ата · Сокулук · Бишкек). 러시아어 UI는 만들지 않았다(§10.5). 키르기스 현지 담당자에게 러시아어 UI가 실제로 필요한지는 LX 글로벌사업처 확인이 필요하다.
- **숫자 정직성**: NDVI 옆에 `Index calc · not model inference`를 붙였다. 장면 수는 T43TEH만 센다(107장면 합산 오류를 바로잡았다). WorldCover는 `ratio only valid`로 표기한다. 작물 분류는 `AI task · training data required` 결손 칩으로 표시한다. 기관이 "AI가 작물을 분류했다"고 오해할 여지를 없앴다.
- **경계**: 비슈케크 시와 연속지적 시범지 3곳은 `boundary not acquired`로 표시했다. 행정경계를 임의로 만들지 않았다.
- **라이선스**: EOX 2025는 CC BY-NC-SA, Maxar는 CC BY-NC(시연 한정)로 표기하고 `build=export`에서 둘 다 뺀다. 이 경우 메이크틸라는 S2 전후로 대체해 표기한다. 해외 기관에 납품하는 빌드는 export 기준으로 판단해야 한다.
- **기관 문**: `login.html`은 `realm:'tenant'`로 로그인하고 LX 셸과 분리되어 있다. kgz-agri는 G-J1 실행 권한이 있다(실 게이트웨이 테스트를 kgz-agri-manager로 통과).
- **남은 우려**: 사업국 수는 목록에서 확인된 36개다. 내부자료에 적힌 "38개국"과의 차이는 `lx-countries.json` note에 기록했다. 대외 발표 전에 사업처에서 숫자를 확정해야 한다.

## 4. 계약 변경 요청(F1-CONTRACT)

1. **§4.4 quote/submit — `kind:'index'`의 `imagery_id`**: 브리프 예시의 `imagery_id:'pc-s2-mosaic'`는 게이트웨이 imagery 표에 없는 외부 사다리 항목이어서 404가 난다. index는 `imagery_id`를 생략하고 `options.source`에 원천을 적도록 계약을 고쳐 달라. 화면은 이미 이렇게 바꿨다(ndvi-theater.js). 다른 방법은 게이트웨이가 외부 카탈로그 항목을 imagery로 허용하는 것이다.
2. **§5 SSE — 워커 재시작 뒤 고아 shard**: 2026-09-26 21:28 job `job_01M3EV13GGZHYXBNJ459CWFEK1`(kgz-agri · index)에서 `m2025-04`가 `shard.started` 뒤 done도 failed도 오지 않았고, job이 7/8 running에 멈췄다. 같은 시각쯤 F1-B 워커가 재시작됐다(21:37 기동 확인). Redis 스트림 pending 재할당(XAUTOCLAIM)이나 shard 타임아웃 → `shard.failed`가 계약에 있어야 한다. F1-B 쪽 수정이 필요하다. 화면은 job.done이 없으면 곡선을 완성하지 않는다(정직).
3. **§7 어댑터 — CPU index 소요**: 한 달 shard가 19–55 s 걸린다(PC 응답에 좌우되고, 8개월 합계 284.7 s 실측). 견적 `eta_s`가 null인데, 어댑터가 월별 최근 실측 ms(`ysykata-ndvi-2025.json`의 `ms`)로 추정 봉투를 줄 수 있게 필드를 열어 달라.
4. **§4.1 카탈로그 — 외부 타일 CORS 일시 오류**: GIBS가 가끔 CORS 헤더 없는 응답을 줘서 브라우저 콘솔 오류가 1건씩 난다(재현되지 않고 curl로는 200 + ACAO `*`). 콘솔 오류 0 판정에서 외부 타일 원천 오류를 따로 분류하는 규칙이 필요하다.

5. **§5 SSE — CPU index 작업도 `job.progress` 발행(1차 판정 요청)**: 실 게이트웨이 `cpu_worker.py`(235–241)는 `shard.started · shard.done · index.month` 만 내고 `job.progress` 를 내지 않는다. 화면은 이제 `shard.done` 으로 a/b · 경과 s · 월별 ms 를 올리지만(2026-09-26 실 게이트웨이 320.9 s 실행에서 5 s 간격 66 스냅샷 모두 갱신 확인 · `logs/ui-on-gateway2-8700.json`), 계약상 모든 kind 가 `job.progress{shards_done, shards_total, elapsed_s}` 를 shard 마다 내야 관제·다른 화면이 같은 규칙으로 읽는다.
6. **§4.4 견적 `eta_s` — index 는 최근 실측 봉투로**: 지금 `eta_s.value = null`. 화면은 '다음 칸 ≈ 직전 달 실측 s'(추정)을 스스로 계산한다. 게이트웨이가 `index_results` 최근 N 건의 shard ms 중앙값으로 `eta_s`(estimate) 를 주면 견적 단계에서 표시할 수 있다.
7. **§4.4 `area_km2` — 한국 밖 AOI 는 EPSG:5186 금지**: 같은 으슥아타 평원 bbox 가 on 모드 견적 1,704 km²(shapely EPSG:5186) vs 구면 공식 1,133 km²(off). 5186 은 한국 TM 이라 비슈케크(74.9°E)에서 크게 왜곡된다. AOI 중심 UTM(으슥아타 = EPSG:32643) 또는 측지 면적으로 바꿔 달라.
8. **§4.x 결과 — index 결과 읽기 엔드포인트**: `GET /results/{set}/stats` 는 `detections` 만 본다. index 작업(`index_results` 표)의 월별 값을 읽는 `GET /results/{set}/index`(CSV·GeoJSON 형식 선택) 가 필요하다. 지금 내보내기는 화면이 받은 `index.month` 사건을 그대로(봉투·basis 포함) 파일로 만든다.
9. **관제 딥링크 `landxi/ops/index.html?job=`**: 결과 카드의 계보 칩이 이 주소로 연다. 관제(F1-C/F1-B 쪽)가 `?job=` 을 받아 해당 작업 행을 펼치도록 요청.
10. **변화탐지(dp-kgz-land-change-26) 실행 전제**: 실 게이트웨이 사전 점검 결과(`logs/sk-preflight-on-8700.json`) — 배포본 미이식(게이트웨이엔 `-test*` 만) · `unsupervised-change` 모델 adapter 미등록 · 소쿨룩 위 게이트웨이 영상 0(PC S2 는 외부). 셋 중 영상 쌍은 계약 쪽 결정 필요: 외부 PC S2 모자이크를 imagery 로 등록 허용(`kind: satellite`, `tier: external`)할지.

## 5. 정직 표기 · 폴백

- **판정 영상은 off 모드**(리플레이 `demo · replaying stored results ×35 · recorded run 2026-09-24`)다. 8칸 값은 2026-09-24 실 PC 실행 결과이고, 2026-09-26 실 게이트웨이 재실행 값과 소수 4자리까지 같다(0.1719 · 0.2987 · 0.4352 · 0.438 · 0.4302 · 0.407 · 0.3316 · 0.25).
- **on 모드 실증**: `shots/f1/D/logs/gj1-gateway-8700.log`(API 직접 · 284.7 s · 8칸 measured · job.done), `logs/e2e-on-gateway.log`(화면 · 통과), `still/ysykata-gj1-ON-gateway-1440.png`.
- **F1-A fx**: `landxi/xi/fx/*`가 도착했지만 글로벌판은 아직 자기 `js/` 안의 최소 부품(lockOn · sweep · swipe · prov · 스크러버)을 쓴다. F1-∑ 통합 때 교체한다(아래 남은 것).
- `f1d-globe` 남원→비슈케크 연속 테스트가 GIBS CORS 일시 오류로 1회 실패했고 재실행에서 통과했다(§4-4).

## 6. 1차 판정 불합격 5건 — 해결 내역(2026-09-26 2차)

| 지적 | 해결 | 근거 |
|---|---|---|
| 하강 뭉개짐(최우선) | ① flyTo 궤적(van Wijk 식 복제)을 28 표본해 EOX·V-World·PC 타일을 HTTP 캐시로 미리 받음(`prefetchFlight` · 투어는 부트 배경 · 평소는 장면 단추·국가 행 hover 의도 때만) ② GIBS(no-store)는 부트 가림막 뒤 후퇴 경로 2 줌 + 글로브를 지도 타일 캐시에 데움(`warmInMap`) ③ EOX 를 3→4 에서 불투명(GIBS 중간 줌 의존 0) · GIBS 층 ≤5 ④ 소쿨룩 z10→z14 와 경유점→메이크틸라(11.5 단계)는 두 번째 지도에 도착 화면을 먼저 완성해 크로스페이드(`arriveCross` · 준비는 앞 비행과 겹침) ⑤ 도착 뒤 목표 타일 idle 전에는 카드를 올리지 않음 ⑥ 가려진 두 번째 지도는 층을 꺼 두어 타일 슬롯을 먹지 않음 | 계측 `tileDeficit`(화면 표본점의 맨 위 불투명 래스터 타일 줌 부족분) 100 ms: 녹화 본편 최장 구간 295 ms(남원 후퇴 첫 0.3 s) · 500 ms 초과 0 · e2e `f1d-descent-tiles`(빈 캐시) 통과 · 스트립 `strip/1…5b` |
| 라이브 HUD 진행 카운터 | `shard.done` 에서 a/b · 경과 s · 월별 ms 갱신 · on 모드 1 Hz 경과 · 진행 중 칸 초 · '직전 달 n s · 다음 칸 ≈ n s'(추정 · title 에 근거) · 완료 후 '한 달 평균 · 실측' | 실 게이트웨이 8700 kgz-agri 실행 320.9 s · 스냅샷 66 · `still/ysykata-gj1-ON-progress-1440.png` · e2e 'HUD 진행 카운터'(job.progress 제거 리플레이) |
| 레퍼런스 크래시 화면 | Wayback swipe 정상 로드 · Worldview 비교 모드 추가 · 나란히 2장 교체 | §2 표 · `ref/` |
| 완성형 · 다음 행동 0 | job.done 뒤 '결과' 절: 결과 열기(월별 표) · CSV · GeoJSON(봉투·basis·라이선스 포함) · 보고서에 첨부(첨부함 + 인쇄용 보고서) · job 계보 칩(`/landxi/ops/index.html?job=…`) · on 모드는 `GET /jobs/{id}` 로 게이트웨이 기록 대조 · '다시 실행' | e2e(CSV 9행 · 표 9행 · 딥링크) · 실 게이트웨이 'gateway · done · 8/8 shard · results/kgz-agri/job_…' |
| 소쿨룩 카드 정직성·읽힘 | 'LX change detection' 절을 맨 앞(상태 draft · 0 LX results yet) + 'Run change detection'(사전 점검 5줄 → 통과 시 POST /jobs · SSE, 막히면 이유 결손 칩 · 가짜 작업 0) · 외부 통계 절에 'Esri/IO LULC external statistics · not LX analysis' 칩 | `still/sokuluk-*.png` · 실 게이트웨이 사전 점검 `still/sokuluk-preflight-ON-gateway-1440.png` |

## 7. 2차 판정 불합격 6건 — 해결 내역(2026-09-27 3차)

| # | 증상(판정) | 해결 | 실측(빈 캐시 · 1440×900 · `shots/f1/D/record-meta.json`) |
|---|---|---|---|
| 1 | `?from=namwon` 15.5 s 흰 가림막(무표시) | 가림막 제거(`data-warm` 규칙 삭제). 남원 V-World 를 **두 번째 지도(대역 · 라이브 타일)** 로 첫 칠부터 보이고, 본 지도는 그 뒤에서 후퇴·하강 경로 타일을 자기 GPU 캐시에 올린다(`warmInMap` 20 카메라 ∥ 경로 미리 받기 922 장). 진행은 'Pre-fetching imagery n/m' 칩. 끝나면 대역이 500 으로 걷히고 본 지도가 같은 남원 화면을 잇는다. 첫 칠부터 `data-scene=namwon`(글로브 제목·목록 번쩍임 0) | ready **0.7 s** · 지도 opacity 1 · 칩 보임 · 데우기 13.4 s(칩 표시 대기) · 흰 화면 0 |
| 2 | 경유점 정지 2.4–4.5 s → 10 % 컷 | `arriveCross` 가 준비를 기다리지 않고 바로 비행 · 덮기 = max(비행 40 %, 두 번째 지도 준비) · 500 디졸브. 경유 비행의 --e-cam 꼬리(뒤 1/3)에서 하강으로 이어 탄다. 하강 경로 EOX(z3–14)를 부트에서 받아 데움 · 비행 중 래스터 페이드 0(`fastFade`) | 경유점 대기 **3 ms** · 비행 2400 실재(z2.4→13.9) · at 0.4 · 부족 ≥2 구간 100 ms 1회 |
| 3 | 남원 후퇴 첫 0.3 s 뭉개짐(부족 8) · 짙은 남색 띠 | 후퇴 출발 조건 = 경로 데우기 완료. V-World·GIBS 는 메모리 타일 캐시(`lxm://` 프로토콜 · no-store 원천도 확실히 쥠). 한국 안(z>7)에서는 EOX 층을 꺼 V-World 요청이 줄 서지 않게. **남색 띠 원인 = Blue Marble 북극해 캡**(층 끄기 계측 `_tools/pole-sheet.png`) → BM z3+ · ±79° 로 제한, 극 캡은 순백 바탕 | 후퇴 전 구간 부족 0–1(계측 `_tools/retreat-dbg.mjs`) · 부족 ≥2 구간 0 |
| 4 | 'Ops lineage →' 죽은 딥링크 | 관제(`landxi/ops`)에 `?job=` 처리 0 확인 → 링크 제거, 점선 결손 칩 'Ops lineage · deep link pending (contract change request 9)'(`data-job` 에 job id 보존). F1-∑/F1-C 가 `?job=` 을 받으면 링크로 교체 | e2e `f1d-verdict2` · `f1d-ysykata-ndvi` |
| 5 | 'Nepal 2025–25' 등 | `yearSpan(from,to)` — 같은 해 '2025' · 다른 해 '2024–26' · 미정 '2026–' | e2e 37 행 전수 |
| 6 | NDVI 큰 숫자 자리별 재조립 플리커 · 빈 카드 상자 선행 | 첫 값은 한 번에 g-in, 이후 이전 값→새 값 트윈 380(`cw-digit` 제거). 카드 3종은 내용을 다 채운 뒤 `reveal()` 로 카드 전체 한 번에 500(자식 스태거 제거) | 도착 매 프레임 `\d.\d\dNDVI` 형 · 반쪽 숫자 0 · 카드 첫 프레임에 내용 전부 |

부수: `fly/ease` 는 이동 호출 뒤에 moveend 를 건다(끊긴 앞 이동의 moveend 오인 0) · 소쿨룩 건물 줌은 준비 후 출발(`waitPrep`) · `pull()` 호스트별 병렬 · `maxTileCacheZoomLevels 24`.
