# F2-D — Land-XI Global v2: 불합격 6건(하강 스냅→비행 · 라이브 히스토그램 · 13.4s 대기 · 클릭 경로 공백 · 정지화면 잘림 · 가독성/게스트 표기) + 관제 실링크 + F1-A fx 교체

- 모델 **Opus 5** · 난이도 L · 기간 5–6일 [추정] · 판정 Fable 5.1(Craft · 영상 · 100ms 스트립 · 해외 기관 관점)
- 읽을 것(순서): ① `F1-CONTRACT.md` v1.0 §4.1 + **v1.1-2(9·10·11·12·13·20) · v1.1-5(29) · v1.1-6** ② `f1/F1-D.md` · `f1/F1-D-result.md`(§4 요청 10 · §6–7 해결 내역) ③ 저널 regate:F1-D(ad8fa26e) must_fix 원문(아래) ④ `landxi/global/js/{globe-stage,boot,ndvi-theater,sprawl,disaster-swipe}.js` 현재 코드 ⑤ `landxi/xi/fx/*`(import 대상 · F2-A가 D0에 브리지 표를 낸다) ⑥ `design/system-v2.md` §3(모션 사다리 · **장거리 비행 이징 항목 추가 요청은 채택** — 아래) · §7 글로벌 타이포
- 공통 규칙: **git 금지** · 소유 밖 수정 0 · 테스트 자기 것만(`tests/e2e/f1d- f2d- --workers=2` · 외부 타일 CORS 간헐 실패는 순차 재실행) · GPU 사용 0(NDVI는 cpu 워커 · PC 원격) · 4173·8700·8702·vLLM·Ollama 끄지 말 것 · 영상 생성 API 금지 · 행정 문서화 금지.
- 판정 5축 + 시민·해외 기관·LX 직원 '우와'. 이 에픽의 유일함 = **국내와 같은 지도·같은 큐에서 해외 지수 작업이 실측으로 도착**한다.

## 목표

Global은 세 번 판정에서 "글로브·으슥아타 = 우와, 이음새 = 목업 느낌"으로 반복 불합격했다. 2차는 이음새 6곳을 0으로 만들고(**카메라가 비행하고, 라이브가 리플레이만큼 풍부하고, 대기가 5초를 넘지 않고, 클릭하면 0.5초 안에 카드가 뜬다**), 관제 `?job=`가 이제 열리므로 결손 칩을 **실링크**로 바꾸며, F1-A fx 부품을 import로 교체해 한 제품으로 읽히게 한다.

## 근거 — 1차 must_fix 원문(저널 regate:F1-D · ad8fa26e · 6건 · 전부 필수)

1. `[하강이 비행이 아니라 스냅] landxi/global/js/globe-stage.js fly()/flySamples — EASE.cam bezier(0.16,1,0.3,1)+flyTo curve 1.42 조합으로 실측(scratchpad zoom 트레이스) 메이크틸라 하강 z2.4→z11이 0.5 s, 글로브→으슥아타 z1.8→z6가 0.2 s, 나머지 1.9 s는 z11→13.9 정착. 100 ms 스트립(strips/transit-cut.png·descend-cut.png)에서 2프레임 만에 지구본이 사라진다. 기대: 글로브→지역 하강(≥6 줌 단계)은 ease-in-out(또는 flyTo speed/curve 기반 등속) 로 1 s 이상 지구본 곡률이 보이며 내려가야 한다 — system-v2 §3 에 '카메라 장거리 비행 이징' 항목을 추가 요청하고 F1-D 는 그 값으로 교체. 판정용 100 ms 스트립에서 z 변화가 프레임당 ≤1.5 단계.` → **법전 결정(Fable)**: 사다리에 `--e-fly cubic-bezier(.45,0,.25,1)`(ease-in-out · 장거리 ≥ 6 줌 · 2400)을 추가한다 — F2-D는 이 값을 쓰고 결과 문서에 실측 z 트레이스를 적는다(tokens-v2.css 반영은 Fable이 통합 때).
2. `[라이브 ≠ 판정 영상] 히스토그램 자리: server/workers/cpu_worker.py 241행 index.month 가 hist·p10/p50/p90·valid_px 를 뺀다 → on 모드 화면(scratchpad/on/on-done.png) 슬롯에 분포 막대 0, CSV p10/p50/p90 빈칸. 판정 영상의 리플레이(하니스 기록)는 차 있다. 기대: ① F1-B 계약 변경 요청에 'index.month 는 어댑터 metrics 의 hist/p10/p50/p90/valid_px 를 그대로 싣는다'를 추가하고(요청 5·8 과 묶기) ② 도착 전까지 on 모드 슬롯 제목을 'NDVI by month · distribution pending(gateway)' 결손으로 정직 표기 · 또는 job.done 뒤 index_results 를 읽어 채우는 경로. 판정 영상은 라이브가 못 보여주는 것을 보여주면 안 된다.` → 서버는 v1.1-10(F2-B) · 프론트는 필드가 있으면 그리고 없으면 결손 제목 + `GET /results/{set}/index`(v1.1-20)로 job.done 뒤 채움 · **판정 영상은 on 모드로 재녹화**(리플레이는 off 장면에만).
3. `[남원 진입 13.4 s 정지] landxi/global/js/boot.js namwonPf — go() 와 tour 가 922 타일(후퇴 경로 + 글로브→으슥아타 하강 + 경유→메이크틸라 하강) 전부와 warmInMap 20 카메라를 기다린 뒤에야 후퇴한다. 기대: 출발 조건은 후퇴 경로(specsR · V-World z12→5 · EOX ≤7 · GIBS ≤5)만으로 제한(≈3–4 s), 두 하강 경로는 글로브 체류(현재 4.7 s)와 각 장면 직전에 받는다(이미 preYs/bgPrefetch 가 있음). 첫 방문 ready→후퇴 시작 ≤5 s, 칩은 그동안만.`
4. `[클릭 경로의 대기·착지 뒤 공백] boot.js descend()/go('meiktila') — 실측(scratchpad/judge-zoom2): 첫 방문 Ysyk-Ata 클릭→카드 7.3 s(칩 3.0 s·비행 2.0 s·착지 뒤 공백 2.0 s), Meiktila 11.3 s(칩 4.4 s·글로브 정지 3.0 s 중 2.2 s 칩), 재방문 Meiktila 7.7 s(칩 1.6 s). 카드는 idle(1600)+reveal 뒤에야 떠서 카메라가 멈춘 뒤 1.5–2 s 동안 아무 일도 없다. 기대: ① 착지 즉시 락온·카드(내용은 준비돼 있음)를 올리고 타일 idle 은 NDVI 층 등 무거운 것에만 건다(착지→카드 ≤500 ms) ② 경유점 prefetch(max 2400) 를 경유 비행과 완전히 겹쳐 글로브 정지 ≤500 ms ③ 재방문에서 PF 칩 0(HTTP 캐시 적중 확인 — 2차 방문 EOX 요청 718건이 다시 나감, pull() 의 fetch 캐시 키/credentials 를 MapLibre 타일 요청과 맞출 것).`
5. `[제출 정지화면의 잘림] shots/f1/D/still/ysykata-gj1-1440.png · sokuluk-1440.png · on 모드 on-done.png — #card 가 결과 절로 자동 스크롤돼 제목 행('Farmland use · Ysyk-Ata' · '2025')이 반쯤 잘린 채 찍힘. sokuluk-1440.png 우측 'Bishkek Бишкек · Continuous cadastre pilot · bo…' 핀 라벨이 화면 밖으로 잘리고 Sokuluk 라벨이 Δ 격자·필라멘트와 겹친다. 기대: 카드 헤더 sticky(또는 스크롤 시 상단 페이드 마스크) · 핀 라벨은 화면 안으로 앵커 반전 · 정지 3폭 모두 잘린 글자 0.`
6. `[후퇴 첫 0.4 s 가독성·게스트 표기] ① boot.js go('globe') — root.dataset.scene='globe' 를 비행 시작과 동시에 바꿔 검은 H1 'LX works in 36 countries.'와 흰 목록 패널이 어두운 위성영상(z5–7) 위에 그대로 올라온다(strips/retreat-hero.png 1–3 프레임). 기대: 히어로·목록은 z ≤ 3(글로브가 순백 위에 보일 때) 이후 g-in, 또는 그 전엔 흰 반투명 바탕. ② landxi/global/js/disaster-swipe.js 111행 — 게스트(public)·export 에서 S2 전후로 대체돼도 #mk-lic 이 'Maxar Open Data CC BY-NC 4.0 · demo only' 를 그대로 보인다. 기대: S.maxar 가 false 면 'Copernicus Sentinel-2 · EMS' 로 칩 교체.`

추가(integrate): `영문판 라이선스 칩에 국문 '(비상업 · export 빌드 제외)'가 섞여 있습니다` → i18n-en 완전 분리 e2e. F1-D 요청 9 + integrate: `Global 카드의 '관제 딥링크 결손' 칩을 실제 링크로 교체 (관제가 이제 ?job=을 받습니다)` → `ndvi-theater.js:317–321` 결손 칩 → `http://localhost:8702/landxi/ops/infra.html?job=` 실링크(관제 세션 없으면 관제 로그인 `?next=`). F1-D-result §5: `F1-A fx 미교체 — 글로벌판은 아직 자기 js/ 안의 최소 부품(lockOn · sweep · swipe · prov · 스크러버)을 쓴다` → `landxi/xi/fx/{arrive,swipe,timescrub,provenance,lineage,glass}.js` import로 교체(수정 요청은 결과 문서).

## owned_files
`landxi/global/**` · `server/adapters/global/**` · `server/pipelines/global/**` · `LX_DATA_ROOT/global/**` · `landxi/assets/css/v2/globe-stage.css` · `tests/e2e/f1d-*.spec.mjs`(개정) · `tests/e2e/f2d-*.spec.mjs` · `shots/f2/D/**` · `blueprint/f2/F2-D-result.md`.
읽기·import만: `landxi/xi/fx/*` · `landxi/xi/engine/*` · `landxi/xi/bridge.js` · `landxi/shared/api-v1.js` · `tokens-v2.css`. **만지지 말 것**: `landxi/xi/**` · `landxi/ops/**` · `server/workers/**`(index.month 필드는 F2-B) · `tokens-v2.css`(`--e-fly`는 Fable이 넣는다 — 그 전엔 `global.css` 안 로컬 변수 · 결과 문서 표기).

## 단계별 할 일

### 1. 카메라 · 대기 · 착지 (D1–D3 · must_fix 1·3·4·6①)
- `globe-stage.js fly()`: 장거리(≥ 6 줌) = `--e-fly` ease-in-out 2400 · `flyTo` `curve`/`speed` 등속 · 100ms 트레이스에서 프레임당 z ≤ 1.5 · 지구본 곡률 ≥ 1s 가시 · 단거리(< 6)는 `--e-cam` 유지. e2e `f2d-fly-trace`(zoom 트레이스 단언).
- `boot.js`: 후퇴 출발 조건 = 후퇴 경로 타일만(≈ 3–4s) · 두 하강 경로는 글로브 체류·장면 직전 prefetch(비행과 겹침) · ready→후퇴 ≤ 5s(첫 방문 · 빈 캐시 실측) · `Pre-fetching imagery n/m` 칩은 그동안만 · 재방문 PF 칩 0(`pull()` fetch 캐시 키·credentials = MapLibre 타일 요청 · EOX 재요청 0 네트워크 단언).
- 착지: 카드는 착지 즉시(≤ 500ms · 내용 준비됨) · 타일 idle은 NDVI 층에만 · 경유점 정지 ≤ 500ms(prefetch 겹침) · 히어로·목록은 z ≤ 3 이후 g-in(그 전 흰 반투명 바탕).
- 클릭 경로 실측 표(첫 방문 · 재방문 × Ysyk-Ata · Sokuluk · Meiktila) 결과 문서.

### 2. 라이브 = 판정 영상 (D3–D4 · must_fix 2)
- `ndvi-theater.js`: `index.month`에 `hist/p10/p50/p90/valid_px`가 있으면 슬롯 분포 막대(kepler 시간 재생 히스토그램 자리) · 없으면 슬롯 제목 `NDVI by month · distribution pending (gateway)` 결손 · job.done 뒤 `GET /results/{set}/index`로 채움 · CSV p10/p50/p90 = 서버 값. `job.progress`(v1.1-9)로 a/b·경과·다음 칸 ≈ 실측 · `eta_s`(v1.1-11) 견적 표시.
- 판정 영상은 **on 모드**(실 게이트웨이 kgz-agri · 8칸 실도착 · 대기 구간은 자막 건너뛰기 표기).

### 3. 정지화면 · 표기 · 링크 · fx (D4–D5 · must_fix 5 · 6② · 추가)
- 카드 헤더 sticky + 상단 페이드 마스크 · 핀 라벨 앵커 반전(화면 안) · Sokuluk 라벨 겹침 0 · 정지 3폭 잘린 글자 0 e2e(텍스트 bbox ⊂ 뷰포트).
- `disaster-swipe.js`: `S.maxar===false` → `Copernicus Sentinel-2 · EMS` 칩 · i18n-en에 국문 0(정규식 e2e) · `build=export` 라이선스 자동 스왑 유지.
- 계보: 결손 칩 → 실링크 `infra.html?job=`(+ `XI map · KR ↗` 왕복) · 기관 화면(kgz-agri manager)은 `?job=` 딥링크 수신 시 그 작업 결과 절을 연다(v1.1-29).
- fx 교체: `lockOn · sweep · swipe · prov · 스크러버` → `landxi/xi/fx/*` import(모션 값 동일 · motion-law 통과 · 부족한 인터페이스는 결과 문서 요청 · 로컬 부품 삭제).
- 사업국 목록 연도 표기(`yearSpan`) · 36 vs 38 note 유지 · ru UI 미착수 정직.

### 4. 테스트 · 녹화 (D5–D6)
- e2e: `f1d-*` 개정 + `f2d-fly-trace` · `f2d-boot-timing`(ready→후퇴 ≤ 5s · 착지→카드 ≤ 500ms · 재방문 PF 0) · `f2d-live-hist`(on 필드 · off 결손) · `f2d-stills`(3폭 잘림 0) · `f2d-guest-license` · `f2d-lineage-link` · `f2d-i18n-pure`.
- 녹화 `shots/f2/D/f2d.mp4` on 모드 · 100ms 스트립(후퇴 · 하강 · 경유 · 착지) · 정지 1280/1440/1920 · 레퍼런스 나란히(Worldview · Wayback swipe · kepler 시간 재생 — 정상 로드).

## 완료 기준(acceptance)
1. 6건 전부 0 — 각 e2e + 100ms 스트립 + 클릭 경로 실측 표(첫 방문 Ysyk-Ata 클릭→카드 ≤ 3s · Meiktila ≤ 3.5s · 재방문 ≤ 2.5s [실측 목표]) · z 트레이스 프레임당 ≤ 1.5.
2. 라이브 on 모드 히스토그램 8칸 = 리플레이와 같은 풍부함(서버 필드 도착 시) · 없으면 결손 제목 · CSV 값 = 서버.
3. ready→후퇴 ≤ 5s(빈 캐시) · 흰 화면 0 · 재방문 EOX 재요청 0.
4. 정지 3폭 잘림 0 · 게스트 S2 칩 · i18n-en 국문 0.
5. 관제 실링크 왕복 · 기관 `?job=` 수신 · fx import 교체(로컬 부품 0 · motion-law).
6. 콘솔 0(외부 타일 CORS 간헐 오류는 별도 분류 · 결과 문서) · p95 ≤ 20ms · 캔버스 ≥ 90% · 14px 미만 0 · 소유 밖 수정 0 · 결과 문서(장치표 · 해외 기관 관점 · 계약 요청 · `--e-fly` 실측 근거).

## 판정용 동작 영상(≈ 60s · `shots/f2/D/f2d.mp4` · on 모드 · 대기 구간 자막 건너뛰기)
| 초 | 무엇 |
|---|---|
| 0–6 | 남원 V-World(`?from=namwon`) → `Pre-fetching n/m` ≤ 4s → 후퇴(첫 0.4s 남색 띠 0 · 히어로는 z ≤ 3 뒤 g-in) → 순백 글로브 36국 |
| 6–12 | Ysyk-Ata 클릭 → **ease-in-out 비행 2400 · 곡률이 보이며 내려간다** → 착지 즉시 카드(≤ 500ms) |
| 12–30 | frame → quote(`eta_s` 추정) → run → 8칸 실도착(`job.progress` a/b · 경과) · **분포 막대가 라이브로 찬다** · 큰 NDVI 트윈 380 · (대기 자막) · job.done → 결과 절 · CSV(p10/p50/p90) · `Ops lineage →` 실링크 → 관제 행 |
| 30–40 | Sokuluk: 헤더 sticky · 핀 라벨 안쪽 · 'Run change detection' 사전 점검 정직 |
| 40–52 | 경유점 정지 ≤ 500ms → Meiktila 하강(비행) → 전후 스와이프(F1-A fx `swipe`) · 게스트 탭에서 S2 칩 |
| 52–60 | XI map · KR ↗ 왕복 · 재방문 Meiktila PF 칩 0 |

## 계약 · 요청
- 사용 = v1.1-9·10·11·12·13·20·29. 법전 `--e-fly` 추가는 채택(Fable) — 통합 전엔 로컬 변수.
- F2-B에서 받는다: `index.month` 필드 · `job.progress` cpu · `eta_s` · `/results/{set}/index` · 측지 면적(으슥아타 1,133 km²).
- F2-C에서 받는다: `?job=` 행 펼침(이미 있음 · 완성 통보).
- F2-A에서 받는다: fx 인터페이스(브리지 표 D0).
