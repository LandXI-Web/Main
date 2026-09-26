# SURVEY-SPEC — 필지 기반 실태조사 기능 명세 (영상 → AI 판독 → 필지 → 대장 대조 → 현장 → 이력 → 조치)

- 작성 2026-09-24 · Fable 5.1(수석 기획자·UX 디렉터) · 사용자 발언 "필지와 이력대조 등 실태조사 핵심 기능도 필요하겠지?" 에 대한 답.
- 상위 문서: `LANDXI-HYPER-BLUEPRINT.md` v1.1(설계서) · `F1-CONTRACT.md`(계약 · 이 문서의 API·스키마는 계약 형식을 따르고, 계약에 없는 것은 §7 '계약 변경 요청'에 모았다) · `design/system-v2.md`(법전 v2) · `specs/2026-09-20-{two-tier,card-architecture,platform-roles,production}.md`.
- 근거 자산: `02. 데이터/parcels/namwon-parcels.pmtiles`(P8 완료 · 2026-09-24 10:23 · 원본 328,966필지 · 2021-12 기준 · 속성 PNU·EMD_CD·EMD_NM·RI_NM·JIBUN·JIMOK·PAREA·OWNER_NM·JIGA_ILP·JIGA_STD_Y·RN_NM [실측 meta.json]) · P4 재추론 129,420 폴리곤(건물 49,800 · 경작지 76,215 · 주차장 2,677 · 비닐하우스 728 · 2023 25cm) · A02 농경지 2,098 · A04 변화 456 · B02 하천구역 건물 점유 651,478 · `landxi/assets/data/surveys.js`(실태조사 7종 · id 고정) · `cards.js EXT_MODULES`(`parcel-match` done · `farm-subsidy` · `illegal-check` · `civil-link` · `patrol-route` todo) · V-World Data API 개통(`LP_PA_CBND_BUBUN` 남원 쌍교동 BOX 112필지 [실측 09-24] · `domain=test.com`).
- 표기: **[실측]** 이 PC·API에서 잰 값 · **[추정]** 계수·임계 초기값(운영 뒤 실측 분포로 교정) · **[미검증]** 이름·형식은 알려져 있으나 이 PC에서 호출하지 않음 · **[법령 확인]** 조문 번호는 구현 전 국가법령정보센터에서 확인 · **[예시]** 화면 문구 예. 이 표기 없는 숫자는 근거 파일 인용이다. 지어낸 운영 수치는 없다.
- 이 문서는 **명세**다. 저장소 소스는 고치지 않았다. 구현은 F1 뒤 별도 에픽(§8 F1-S · 2차 S2)으로 간다.

---

## §0. 한 장 요약

**이 기능이 왜 코어인가** — LX 사업의 핵심은 "부처별 인력 현장조사를 영상 + AI로 부분 대체·통합·일괄 관리"다(메모리 `landxi-redesign-direction`). 지금 설계서의 XI맵은 *영상 위에 AI 결과가 도착하는 것*까지 닫혀 있다. 그러나 공무원의 업무는 "비닐하우스가 728동 있다"가 아니라 **"이 필지의 대장은 '전'인데 위에 건물이 서 있다 — 현장 가서 확인하고 조치하라"**다. 판독 결과를 **필지(PNU)에 얹고, 대장과 대조해, 불일치만 남기고, 현장 확인으로 닫고, 필지마다 이력을 쌓는 것**이 실태조사이고, 이것이 없으면 Land-XI는 좋은 판독기이지 행정 플랫폼이 아니다.

**한 문장 흐름**

```
영상(시점 t) → AI 판독(detections) → 필지 결합(PNU · 면적비) → 대장 대조(규칙 · 설명 가능)
 → 의심 목록(findings) → 현장조사 배정(inspections · 모바일 · 사진 · GPS) → 판정 입력
 → 필지 이력(parcel_history · 타임라인) → 행정 조치(actions) · 통계 · 보고서
 ├──────────────── LX 층 (판독 + 결합 + 규칙 엔진 제공) ────────────────┤├──── 기관 층 (규칙 내용 · 현장 · 조치) ────┤
```

**두 층 경계(two-tier · §2.3)** — LX는 **판독 + PNU 결합 + 규칙 엔진(부품)** 까지, 기관은 **규칙 내용(임계·대장 소스·조치 코드) + 현장 + 조치**. 규칙 *엔진*은 공통 모듈로 승격하고(card-architecture §5.4 '공통 승격 후보 3' 중 **대장 대조**가 이미 후보다), 규칙 *내용*은 기관 프로파일에 산다.

**결정적 장면(§4 S-1 '대조 스윕')** — XI맵 실태조사 모드에서 대장 층이 잉크 헤어라인 스윕으로 영상 위를 지나가면, **대장과 현황이 일치하는 필지는 투명하게 걷히고 불일치 필지만 남아 락온**된다. HUD 124px 숫자는 "탐지 n"이 아니라 **"의심 필지 n · 읍면동 39/39 대조"**(봉투). 공무원이 "우와" 하는 순간은 여기다 — 판독이 아니라 *내 일이 줄어드는 것*이 보인다.

**1차 최소 범위(§8)** — 로컬 자산만으로 닫히는 것: P4(2023 25cm) × P8 필지 공간 결합 배치 → 규칙 2개(휴경 의심 · 지목 전·답 위 건물) → XI맵 실태조사 모드 **열람**(대조 스윕 · 필지 카드 대장 vs 현황 · 의심 목록 서랍 · 2시점 이력). 현장조사 모바일 · 배정 · 조치 · 포털 탭 · 규칙 편집 · 재학습 고리는 2차.

---

## §1. 대상 실태조사 업무 목록

원칙: 실제 법정·행정 조사만. 각 업무에 대해 담당 · 현행 방식 · AI 대체 범위(무엇을 대체하고 무엇은 사람이 하는가) · 필요 대장 · 데이터 출처. `surveys.js`의 7종 id(`farmland` `greenbelt` `trash` `incinerator` `marine` `greenhouse` `pothole`)는 고정값이므로 아래 표의 `survey_id`는 그것을 재사용하고 새 것만 추가한다.

### 1.1 업무 표

| # | `survey_id` | 업무(법정 근거) | 담당 부처 / 지자체 부서 | 현행 현장조사 방식 | AI 대체 범위 | 사람이 남는 일 | 카드 |
|---|---|---|---|---|---|---|---|
| 1 | `farmland` | **농지이용 실태조사** — 농지법 제54조(매년) [법령 확인] · 농지 처분 의무 · 공익직불금 검토 | 농식품부 · 농관원 / 시군 **농정과(농지 담당)** | 읍면 담당자가 농지대장·농업경영체 목록을 들고 필지별 순회 · 연 1회 · 표본 위주 | 전 필지 **경작/비경작(휴경) · 시설(비닐하우스) · 전용(건물·주차장·야적) 판정**을 영상으로 전수 → 불일치 필지만 현장 | 휴경 사유 확인(농지법상 정당 사유) · 임대차·경영체 대조 · 처분 통지 | `card-farm`(duty '농지 이용 실태조사') · ext `parcel-match`(done) · `crop-cycle`(done) · `farm-subsidy`(todo) |
| 2 | `greenhouse` | **비닐하우스(농업용 시설) 실태조사** — 농지법 §36 타용도 일시사용 · 농업용 시설 신고 | 농식품부 · 시군 농정과 / 읍면 | 시설 신고 대장과 현장 동수·면적 대조 · 연 1회 | 단동/다동 **동수·면적 전수 집계**(`house-count` done) · 시설 신고 없는 필지 추출 | 창고·주거 전용 여부 판단 · 신고 유도 | `card-farm` ext `house-count` |
| 3 | `illegal_bldg` (신규) | **위반(무허가) 건축물 단속** — 건축법 §79 조치명령 · §80 이행강제금 [법령 확인] | 국토부 / 시군 **건축과(건축지도)** | **항공사진 판독 → 현장 확인**이 이미 관행. 시군마다 연 1회 항공사진 육안 판독(외주) 뒤 의심지 현장 | 육안 판독을 **AI 신축·증축 탐지(A04 변화 '신축')로 대체** · 건축물대장 footprint와 대조해 대장 없는 건물 전수 추출 | 위반 여부 법리 판단 · 시정명령 · 이행강제금 산정 | `card-change`(duty '무허가 건축물 확인') · ext `illegal-check`(todo → 이 문서로 설계 확정) |
| 4 | `greenbelt` | **개발제한구역 실태조사** — 개발제한구역법 §12 행위제한 · 국토부 연 2회 항공사진 판독 [법령 확인] | 국토부 / 시군 **도시과(GB 관리)** | 국토부가 항공 촬영 → 판독 결과를 지자체에 통보 → 현장 확인 · 연 2회 | 판독 자동화(변화 탐지 × GB 경계) · 필지 단위 통보 목록 자동 생성 | 이행강제금 · 원상복구 명령 | `card-change` · 신규 규칙 R-GB |
| 5 | `landuse` (신규) | **토지이용현황 조사 · 지목 현황 불부합** — 공간정보관리법(지적) 지목 변경 · 지적재조사법 [법령 확인] | 국토부 · **LX(지적)** / 시군 **지적(토지정보)과** | 지목과 실제 이용이 다른 필지를 민원·현장에서 발견 | **지목 vs AI 토지피복(4클래스+) 불부합 전수** — LX 고유 업무와 가장 가깝다 | 지목 변경 신청 유도 · 지적재조사 지구 선정 | `card-change`(duty '지적 재조사') · 신규 규칙 R-LU |
| 6 | `dev_permit` (신규) | **개발행위허가 사후관리** — 국토계획법 §56 허가 · §60 이행보증 · 준공검사 [법령 확인] | 국토부 / 시군 **도시과·허가과** | 허가 대장의 준공 예정일 기준으로 담당자가 현장 확인 | 허가 폴리곤 대비 **범위 초과 · 미착공 · 준공 후 용도 상이**를 변화 탐지로 전수 | 원상복구 · 이행보증금 집행 | `card-change` · 신규 규칙 R-DEV · 허가 대장은 기관 파일 반입 |
| 7 | `public_asset` (신규) | **공유재산 실태조사** — 공유재산 및 물품 관리법 · 지자체 매년 실태조사 [법령 확인] | 행안부 / 시군 **회계과(재산관리)** | 공유재산 대장 필지를 순회하며 무단 점유·경작 확인 | 소유구분 '공유·국유' 필지 위 **건물·비닐하우스·경작·야적 탐지** → 대부계약 대조 → 무단 점유 의심 전수 | 변상금 부과 · 대부 계약 유도 | 신규 카드 후보 `card-asset`(2차) — 1차는 `card-change` 규칙으로 |
| 8 | `river_occupy` (신규) | **하천구역 점용 실태조사** — 하천법 §33 점용허가 · §46 금지행위 · 소하천정비법 [법령 확인] | 환경부(하천) · 행안부(소하천) / 시군 **하천과·안전총괄과** | 하천구역 순찰 · 점용허가 대장 대조 · 민원 | **B02 전국 하천구역 건물 점유 651,478건 [실측 · 행안부 분석결과 v2]** 이 이미 실자산 — 점용허가 대조 → 무허가 점유 의심 | 철거·원상복구 명령 · 점용료 | 신규 카드 후보 `card-river`(2차) · 게스트 G-2 장면과 연결 |
| 9 | `trash` · `incinerator` | 방치폐기물 · 불법소각 실태조사 — 폐기물관리법 §8 · §48 조치명령 [법령 확인] | 환경부 / 시군 **환경과** | 민원·순찰 · 분기 1회 | 점 탐지(더미·소각 흔적)를 **필지에 얹어** 토지 소유자·관리자 특정 | 조치명령 · 과태료 | `card-living` ext `pile-size` `burn-trace`(lx wip) · `civil-link` `patrol-route`(local todo) |
| 10 | `marine` | 해양쓰레기 실태조사 — 해양폐기물관리법 | 해수부 / 시군 해양수산과 | 해안 순회 · 연 4회 | 종류 분류·물량 · 구간화(`shore-seg`) | 수거 계획 | `card-marine` — **필지 축이 아니라 구간 축** · 이 명세의 규칙 엔진은 쓰지 않고 공유 부품(현장조사·이력)만 |
| 11 | `pothole` | 도로안전(포트홀) | 국토부 / 시군 도로과 | 월 1회 순찰 | 구간 등급 | 보수 | `card-road` — 구간 축 · 같은 이유로 제외 |

**결론**: 필지 축 실태조사 = 1–9(9종). 10·11은 구간 축이라 규칙 엔진 대상이 아니고 현장조사·이력 부품만 공유한다. 1차는 **1(농지) · 3(무허가) · 5(지목 불부합)** 세 업무에 규칙을 두되 화면에 나오는 건 §8의 규칙 2개다.

### 1.2 필요 대장과 데이터 출처

| 대장 | 무엇을 준다 | 출처 · 접근 | 상태(이 PC · 2026-09-24) | 캐시·갱신 |
|---|---|---|---|---|
| **연속지적 · 필지 속성** | PNU · 지번 · **지목(JIMOK)** · 면적(PAREA) · **소유구분(OWNER_NM · 국유/공유/사유 구분 — 개인 성명 아님 [확인 필요])** · 공시지가(JIGA_ILP · 2021) · 도로명 | ① **C04 국토정보기본도 2.0 → P8 PMTiles**(키 없음 · 2021-12) ② V-World Data API `LP_PA_CBND_BUBUN`(현행 · 프록시 `/proxy/vworld/data` · `domain=test.com`) | ① **완료 [실측]** `parcels/namwon-parcels.pmtiles` z12–17 layer `parcels` · ② **개통 [실측]** 112필지 BOX 호출 OK · CORS 없음 → 서버만 | ① 정적 · ② AOI 1–2km BOX 페이징 · 디스크 캐시 30일 · `vworld_calls_day` 계량 |
| **토지이용계획(용도지역·지구·구역)** | 도시/관리/농림/자연환경보전 · 농업진흥지역 · **개발제한구역** · 보전산지 | V-World Data API `LT_C_UQ111`(도시지역 · 이름 시험됨 · `INVALID_DATA` 없음 [실측 09-24 · 응답은 키 만료였음]) · `LT_C_UQ112~114` 관리·농림·자연환경보전 [미검증] · 개발제한구역 `LT_C_UD801` [미검증] · 농업진흥지역 레이어명 [미검증 · V-World 데이터 목록에서 확인] · 임상도 `LT_C_FSDIFRSTS`(이름 시험됨) · 대안: 토지이음(LURIS) 토지이용계획정보 API(공공데이터포털 · 국토부) [미검증] | 키 개통 · 레이어별 호출은 안 함 | 필지 BOX 호출 → `registry_snapshots` 캐시 90일 · 필지 카드에 `as_of` 표기 |
| **건축물대장** | 표제부(주용도·연면적·허가·사용승인일) · 총괄표제부 · 층별 · **위반건축물 표기** | 공공데이터포털 **국토교통부 건축HUB 건축물대장정보 서비스**(`getBrTitleInfo` 표제부 · `getBrRecapTitleInfo` 총괄 · `getBrBasisOulnInfo` 기본개요 · `getBrFlrOulnInfo` 층별 · 키 필요 · 시군구코드+법정동코드+번·지 조회) [미검증] · 건물 footprint: V-World `LT_C_SPBD`(도로명주소 건물 · 이름 시험됨) · GIS건물통합정보 [미검증] | 키 없음 → **사용자 액션(§9)** | 필지 단위 호출 · 캐시 30일 · 일일 한도 계량(`bldg_calls_day` 차원 추가) |
| **농지대장 · 농업경영체 등록정보** | 농지 소유·임대차·경작 현황 · 직불금 신청 필지 | 농지대장: 농식품부 농지정보시스템(공개 API 없음 · **기관 파일 반입**) · 농업경영체: 농관원 Agrix(협약 필요) | 없음 → 반입 인터페이스만 설계 | CSV/XLSX 업로드(PNU 키) → `registry_snapshots kind='farm_ledger'` |
| **개발행위허가 대장** | 허가번호 · 허가 폴리곤(또는 필지 목록) · 착공·준공 예정 · 용도 | 지자체 새올/KRAS 내부 · **파일 반입**(SHP/GeoJSON + CSV) | 없음 | 반입 · 기관 소유 · RLS |
| **공유재산 대장 · 대부계약** | 재산 종류 · 대부 여부 · 계약 기간 | 지방재정 공유재산관리시스템 · **파일 반입** | 없음 | 반입 |
| **하천구역 · 점용허가 대장** | 하천구역선 · 점용 허가 위치·기간 | 하천구역: **B02 분석 결과 · A05 하천 벡터타일 [실측 자산]** · RIMGIS 하천구역 [미검증] · 점용허가: 기관 파일 반입 | 하천구역 있음 · 허가 없음 | – |
| **행정경계(현행)** | 읍면동·리 | A11 로컬(2021-04) → V-World `LT_C_ADEMD_INFO` `LT_C_ADRI_INFO`(이름 시험됨) | 로컬 있음 · 현행은 키 개통 | 90일 |
| **민원** | 접수 좌표 · 내용 | 새올 민원 · 파일 반입 | 없음 | `civil-link` 2차 |

원칙: **대장은 LX가 소유하지 않는다.** 서버는 프록시·캐시·반입 인터페이스만 제공하고, 캐시 행(`registry_snapshots`)은 기관 `tenant_id`로 RLS 격리한다(개인정보 최소화 — 소유자 성명은 어디에도 저장하지 않는다. 필지 카드는 소유*구분*만 보인다).

---

## §2. 핵심 흐름

### 2.1 아홉 단계

```
①영상      imagery(epoch)                    C01 25cm 2023 · A01 드론 4시점 · A03 2m 2시점 · (V-World 위성은 배경만)
②판독      detections(cls,conf,geom,job)     P4 129,420 · A02 · A04 변화 · J2b 비닐하우스 재추론 · 실추론 job
③결합      parcel_facts(pnu,epoch,cls,area,ratio)   detections ⋈ parcels — 교차 면적 분할(중심점 아님) · ratio = area/PAREA
④대조      rules × parcel_facts × registry_snapshots → findings(의심)   설명 가능 · 임계 [추정] · 규칙 버전
⑤의심목록  findings 큐 — severity · 읍면동 · 면적 · 규칙 · 상태(open→assigned→inspected→closed)
⑥배정      inspections(assignee, due, route)  모바일 현장 확인 · 사진(EXIF GPS) · 도착 판정
⑦판정      inspection.verdict ∈ {match, violation, unclear} + 코드 + 메모 → finding.state
⑧이력      parcel_history(pnu, at, kind, ref) — 영상·판독·대장·의심·현장·조치 이벤트가 필지 한 줄에 쌓인다
⑨조치      actions(kind: notice|order|fine|restore|ledger_change|none) · 통계(읍면동 × 규칙 × 상태) · 보고서
```

### 2.2 단계별 정의

| 단계 | 입력 → 출력 | 어디서 도는가 | 표기(basis) | 실패·결손 |
|---|---|---|---|---|
| ③ 결합 | `detections(geom)` × `parcels(geom)` → `parcel_facts` | **CPU 워커 `kind:'join'`**(계약 §4.4 kind 추가 요청 §7) · shard = 읍면동(A11 39개) · PostGIS `ST_Intersection` · GiST · 4m² 미만 조각 버림 · `chip_edge` 폴리곤은 `edge:true` 표기 | `inferred`(판독에서 파생) | 필지 밖 탐지(도로·하천) = `pnu null · 필지 밖` 집계로 남김 |
| ④ 대조 | `parcel_facts` + `registry_snapshots` + `rules` → `findings` | CPU 워커 `kind:'survey'` · shard = 읍면동 · **규칙은 순수 함수**(입력 봉투 → 판정 + 근거) · 규칙 버전 고정 | `inferred` · 임계는 `estimate` 봉투 | 대장 없음 → 규칙이 `skipped(reason)`으로 기록, 의심을 만들지 않는다(정직) |
| ⑤ 의심 목록 | findings 필터·정렬 | 게이트웨이 `GET /survey/findings` | – | – |
| ⑥ 배정 | findings → inspections | 기관 manager · `POST /survey/inspections` · 동선은 `patrol-route`(local · 2차) | – | – |
| ⑦ 판정 | 현장 → inspection.verdict · photos | 기관 inspector(모바일 · 오프라인 큐) | **`measured`**(현장 실측) | GPS 없음 → `gps:false` 표기 · 판정은 허용 |
| ⑧ 이력 | 모든 쓰기 → `parcel_history` 트리거 | DB 트리거(append-only) | 원 이벤트의 basis 상속 | – |
| ⑨ 조치 | inspection → actions | 기관 manager | `measured` | – |

### 2.3 두 층 경계 — two-tier 스펙

| 단계 | LX(판독 · 부품) | 기관(행정 가공) | 근거 |
|---|---|---|---|
| ①② 영상·판독 | **LX** — 프레임·실행·검수·수정(`PATCH /results`) | 열람 · 오류 신고(`POST /feedback`) | two-tier §2 "LX는 판독까지" |
| ③ 결합 | **LX** — PNU 결합은 업무 규칙이 아니라 *어디에*를 붙이는 기하 연산. `detections.pnu`는 계약 §4.5 속성 정본에 이미 있다 | – | 계약 §6 `detections(... pnu, emd ...)` |
| ④ 대조 **엔진** | **LX** — 규칙 DSL · 실행기 · 설명 카드 렌더러 · 정밀도 보드 = **공통 모듈 `mod-survey`로 승격** | – | card-architecture §5.4 '공통 승격 후보 3: 구간화 · **대장 대조** · 우선순위 산출' · R2 "두 서비스 이상 반복 → 승격 검토" — 농지·무허가·GB·공유재산·하천 다섯 업무가 같은 엔진을 쓴다 |
| ④ 대조 **내용** | LX가 **기본 규칙 팩**(R-FARM · R-BLDG · R-LU · 임계 [추정])을 카드 버전에 실어 배포 | **기관**이 임계·대장 소스·조치 코드를 자기 프로파일에서 조정(`rules.tenant_override`) · 기관 규칙은 기관 것 | two-tier "기관마다 업무 규칙이 달라 표준화할 수 없다" |
| ⑤⑥⑦⑨ 의심·배정·현장·조치 | – (열람만 · 정밀도 통계로 재학습) | **기관** | production §3 남원 농정과 요구 "필지 표에서 대장 불일치만 먼저" |
| ⑧ 이력 | 판독 이벤트를 쓴다 | 대장·현장·조치 이벤트를 쓴다 | 한 필지 한 줄 · 두 realm이 같은 표에 쓰되 RLS로 기관 행은 기관만 |
| 오탐 고리 | **LX** — `inspection.verdict='match'`(오탐 확정)를 `feedback(kind:'fp')`로 자동 전환 → 라벨링 큐 → 재학습 → 규칙 임계 재교정 제안 | 판정만 한다 | two-tier §3 '피드백' 고리 |

**규칙**: 기관 화면에 규칙 *편집기*는 있어도 규칙 *엔진 코드*는 없다. LX 화면에 현장조사 *배정*은 없다(정밀도 보드만). 이것이 "LX에 모든 걸 다 구현하면 정체성이 떨어진다"에 대한 답이다.

### 2.4 상태기계

```
finding:     open ─▶ assigned ─▶ inspected ─▶ closed
               │                    │            (closed_reason: violation_actioned | match_fp | unclear_deferred | superseded)
               └─▶ dismissed(사유 필수 · manager)   inspected ─▶ reopened(새 시점 영상에서 같은 규칙 재발)
inspection:  planned ─▶ en_route ─▶ on_site(GPS ≤ 50m [추정]) ─▶ submitted ─▶ accepted | returned(manager 반려 · 사유)
action:      draft ─▶ issued ─▶ complied | escalated | withdrawn
```
`finding`이 `closed(match_fp)`면 `feedback` 행이 생기고(자동) `rules.stats`에 오탐 1건이 쌓인다. 새 시점 job이 같은 pnu·규칙으로 다시 의심을 내면 이전 finding은 `superseded`, 새 finding은 `reopened` 표기로 이력이 이어진다.

---

## §3. 데이터 모델 · API (계약 호환)

모든 수치는 봉투(계약 §2) · 시간 `+09:00` · 좌표 4326 · 목록 `{items,total,as_of}` · 오류 §10 형식 · RLS는 `tenant_id`. 표 이름은 계약 §6 스타일. **신규 표 7 · 기존 표 변경 1(`detections.pnu` 채움 규칙만)**.

### 3.1 스키마(`server/migrations/0002_survey.sql` 제안)

```sql
-- 참조(LX 소유 · 읽기 공용) --------------------------------------------------------------
parcels(pnu text pk, emd_cd text, emd_nm text, ri_nm text, jibun text, jimok text, area_m2 numeric,
        owner_kind text,                 -- OWNER_NM: 국유|공유|사유|기타 — 성명 저장 금지
        price_krw_m2 numeric, price_year int, road_nm text, geom geometry(MultiPolygon,4326),
        source text default 'C04 국토정보기본도 2.0', as_of date default '2021-12-01')
-- 1차는 P8 PMTiles 를 그대로 쓰고 이 표는 P8b(ogr2ogr → PostGIS) 로 적재 · 328,966행 [실측 features_src]

parcel_facts(id bigserial, tenant_id text, job_id text, pnu text, epoch text, imagery_id text, cls text,
             area_m2 numeric, ratio numeric,          -- ratio = area_m2 / parcels.area_m2
             conf_mean real, n int, edge bool, at timestamptz) PARTITION BY LIST(tenant_id)
-- unique(job_id, pnu, cls) · 필지 밖 탐지는 pnu null 로 집계 행 1개

registry_snapshots(id text pk, tenant_id text, pnu text, kind text,   -- kind: cadastre|landuse|building|farm_ledger|dev_permit|public_asset|river_permit|civil
                   source text, fetched_at timestamptz, as_of date, payload jsonb, hash text)
-- V-World·건축HUB 응답 또는 반입 파일의 필지 단위 캐시 · payload 는 원문 · 개인정보 필드는 반입 단계에서 제거(allowlist)

-- 규칙(LX 팩 + 기관 오버라이드) -------------------------------------------------------------
rules(id text pk, survey_id text, version text, name jsonb, owner text check(owner in('lx','tenant')),
      tenant_id text,                          -- owner='tenant' 일 때
      when_ jsonb, then_ jsonb,                -- §5 DSL
      thresholds jsonb,                        -- {"ratio_min": {"value":0.2,"unit":"ratio","basis":"estimate",...}}
      requires text[],                         -- 필요한 registry kind · 없으면 skipped
      severity_fn jsonb, explain jsonb,        -- 설명 템플릿
      status text check(status in('draft','active','retired')), created_at, updated_at timestamptz,
      unique(id, version))
rule_stats(rule_id text, version text, tenant_id text, emd_cd text, month text,
           n_findings int, n_inspected int, n_violation int, n_fp int, precision numeric, pk(rule_id,version,tenant_id,emd_cd,month))

-- 의심 · 현장 · 조치 · 이력(기관 소유 · RLS) ---------------------------------------------------
findings(id text pk, tenant_id text, survey_id text, deploy_id text, job_id text, pnu text, emd_cd text,
         rule_id text, rule_version text, severity int check(severity between 1 and 3),
         state text check(state in('open','assigned','inspected','closed','dismissed','reopened','superseded')),
         closed_reason text, evidence jsonb,   -- §5.3 근거 봉투 묶음(detection ids · facts · registry ids · thresholds)
         imagery_epoch text, geom geometry(MultiPolygon,4326),   -- 필지 geom 사본(카드·타일 편의)
         prev_finding_id text, created_at, updated_at timestamptz) PARTITION BY LIST(tenant_id)
inspections(id text pk, tenant_id text, finding_ids text[], pnu text, assignee_id text, planned_for date, route_seq int,
            state text check(state in('planned','en_route','on_site','submitted','accepted','returned')),
            verdict text check(verdict in('match','violation','unclear')), verdict_code text, note text,
            arrived_at timestamptz, gps geometry(Point,4326), gps_acc_m numeric, gps_ok bool,
            photos jsonb,                      -- [{path, taken_at, gps:[lng,lat], heading, w, h}] · tenants/{id}/uploads/inspections/{insp}/
            submitted_at, decided_by text, decided_at timestamptz, return_reason text) PARTITION BY LIST(tenant_id)
actions(id text pk, tenant_id text, finding_id text, inspection_id text, pnu text,
        kind text check(kind in('notice','order','fine','restore','ledger_change','referral','none')),
        law_ref text, doc_no text, issued_at date, due_at date, state text check(state in('draft','issued','complied','escalated','withdrawn')),
        note text, created_by text, created_at timestamptz) PARTITION BY LIST(tenant_id)
parcel_history(id bigserial, tenant_id text, pnu text, at timestamptz,
               kind text check(kind in('imagery','detection','fact','registry','finding','inspection','action','feedback','note')),
               ref_table text, ref_id text, summary jsonb, basis text) PARTITION BY LIST(tenant_id)
-- append-only · 트리거: parcel_facts·findings·inspections·actions·feedback INSERT/UPDATE → 1행
-- imagery/registry 이벤트는 배치 적재 시 pnu 별로 기록(영상 시점은 footprint ∩ parcel 로 pnu 확장 · 읍면동 단위 요약 허용)

-- RLS: parcel_facts·findings·inspections·actions·parcel_history·registry_snapshots·rules(owner='tenant')
--      USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
-- LX 는 findings·inspections 를 **읽기만**(정밀도 보드) — 쓰기는 app.realm='tenant' 강제(트리거)
```

`detections.pnu` 채움 규칙: 워커 후처리(`postprocess.py`)에서 **가장 큰 교차 필지의 pnu**를 쓰고, 여러 필지에 걸치면 `parcel_facts`가 분할을 가진다(`detections.pnu`는 대표값). 지금 P4 결과에는 pnu가 없으므로 1차 배치 `p20_survey_join.py`가 채운다.

### 3.2 API(`/api/v1/survey/*` · 기관 라우트는 `/api/v1/t/{tenant}/survey/*` 별칭 · realm 관문은 계약 §3)

```http
# 결합·대조 실행(LX staff · 기관 manager 는 자기 배포본에 한해) — 계약 §4.4 jobs 재사용
POST /api/v1/jobs/quote   { "kind":"join",   "source_set":"results/lx/namwon-landcover-2023", "aoi": <emd MultiPolygon|null> }
POST /api/v1/jobs         { "kind":"survey", "survey_id":"farmland", "deploy_id":"dp-nw-farm-25", "facts_job_id":"job_…join",
                            "rules":["R-FARM-01@1.0","R-LU-01@1.0"], "registry":["cadastre"], "priority":1 }
→ 202 Job (shards_total = 읍면동 수 39 · events_url)     SSE: shard.done{ shard_id:"emd-52190250", n: <findings>, classes:{ "R-FARM-01": n1, "R-LU-01": n2 }, polys_url }
                                                          + survey.rule_skipped{ rule_id, reason:"registry building 없음" }   (§7 이벤트 추가 요청)

# 의심 목록
GET  /api/v1/survey/findings?deploy_id=&survey_id=&rule_id=&emd_cd=&state=&severity=&bbox=&sort=severity|area|updated&limit=200&offset=0
→ { "items":[Finding], "total": n, "counts": { "open": Envelope, "assigned": Envelope, "inspected": Envelope, "closed": Envelope }, "as_of":"…" }
GET  /api/v1/survey/findings/{id}          → Finding + "explain": Explain(§5.3) + "history": [ParcelHistory]
POST /api/v1/survey/findings/{id}/dismiss  { "reason":"…" }   (tenant manager)
GET  /api/v1/survey/findings.pmtiles?deploy_id=   → 서명 URL(계약 §4.2 · `results/{tenant}/survey-{deploy}@{rules_hash}`) — 지도 층

# 필지(계약 §4.5 GET /parcels 확장 — 동일 응답 + survey 블록)
GET  /api/v1/parcels?pnu=&lng=&lat=&with=facts,registry,findings,history&epochs=2023,2025-04
→ { "pnu":"…", "jibun":"…", "jimok":"전", "area_m2": Envelope, "owner_kind":"사유", "price_krw_m2": Envelope(as_of 2021-12),
    "facts": { "2023": { "경작지": { "area_m2": Envelope, "ratio": Envelope(inferred) }, "건물": {…} }, "2025-04": {…} },
    "registry": { "cadastre": {…as_of}, "landuse": null|{…}, "building": { "n": Envelope, "items":[…] } | { "value":null, "note":"건축HUB 키 없음" } },
    "findings": [FindingLite], "history": [ParcelHistory], "source":"reference/parcels-namwon", "as_of":"2021-12" }

# 현장조사
POST /api/v1/survey/inspections            { "finding_ids":["f_…"], "assignee_id":"u_nw_insp_01", "planned_for":"2026-10-02" } → 201 Inspection
GET  /api/v1/survey/inspections?assignee=me&date=today|week&state=          (inspector · 모바일 첫 화면)
GET  /api/v1/survey/inspections/{id}       → Inspection + finding + parcel(with=facts,registry) + 오프라인 번들(타일 목록 · 필지 outline)
POST /api/v1/survey/inspections/{id}/arrive   { "gps":[lng,lat], "acc_m": 8.2, "at":"…" }  → { "on_site": true|false, "dist_m": Envelope }   (≤ 50m [추정] · 실패해도 판정 허용)
POST /api/v1/survey/inspections/{id}/photos   multipart(jpeg ≤ 8MB [목표] · EXIF 유지) → { "photo": {...} }   저장 tenants/{id}/uploads/inspections/{insp}/
POST /api/v1/survey/inspections/{id}/submit   { "verdict":"violation", "verdict_code":"FARM-CONV-BLDG", "note":"…", "client_id":"…" }  (멱등 · 오프라인 재전송)
POST /api/v1/survey/inspections/{id}/decide   { "decision":"accept|return", "reason"? }   (manager)

# 조치 · 통계 · 보고서
POST /api/v1/survey/actions                { "finding_id","inspection_id","kind":"order","law_ref":"농지법 제42조 [법령 확인]","due_at":"…" } → 201
GET  /api/v1/survey/stats?deploy_id=&by=emd|rule|state|month   → { "items":[{ "key","n_parcels": Envelope,"n_findings": Envelope,"n_inspected": Envelope,"n_violation": Envelope,"precision": Envelope }] }
POST /api/v1/survey/reports                { "deploy_id","template":"survey-result|order-list|ledger-mismatch","emd_cd"?,"period":{from,to} } → 202 { "report_id", "events_url" }   (기존 report-standard 흐름 재사용 · CSV BOM · PDF는 2차)

# 규칙(LX admin/staff · 기관은 오버라이드만)
GET  /api/v1/survey/rules?survey_id=&status=active     → { "items":[Rule] }
POST /api/v1/survey/rules                  (lx staff · owner lx) · POST /api/v1/t/{tenant}/survey/rules (owner tenant · 오버라이드 · thresholds·then_ 만)
POST /api/v1/survey/rules/{id}/activate    { "version":"1.1", "reason":"…" } → approvals 행(2인 승인 정책은 Q-E ③ 따라)
GET  /api/v1/survey/rules/{id}/stats?tenant_id=&by=emd|month   → rule_stats (정밀도 보드)
POST /api/v1/survey/rules/{id}/recalibrate → { "proposal": { "thresholds": {...Envelope estimate...}, "basis":"rule_stats 최근 3개월 · Youden J", "n": Envelope } }  (제안만 · 적용은 activate)

# 대장 프록시·반입
GET  /api/v1/proxy/vworld/data?data=LP_PA_CBND_BUBUN&geomFilter=BOX(...)   (계약 §4.3 그대로 · domain 서버 주입)
GET  /api/v1/proxy/bldg/title?sigunguCd=&bjdongCd=&bun=&ji=              → 건축HUB 대리(키 서버) · 캐시 30일 · 없으면 503 bldg_key_pending
POST /api/v1/t/{tenant}/survey/registry/import  multipart(csv|xlsx|geojson · kind · pnu 열 지정 · allowlist 열) → 202 { "import_id", "rows": Envelope, "rejected": Envelope, "reasons":[…] }
```

**Finding**
```json
{ "id":"f_01J9K…", "tenant_id":"namwon", "survey_id":"farmland", "deploy_id":"dp-nw-farm-25", "job_id":"job_…survey",
  "pnu":"4519025021100010000", "emd_cd":"45190250", "emd_nm":"운봉읍", "jibun":"[예시]",
  "rule_id":"R-FARM-01", "rule_version":"1.0", "severity":2, "state":"open", "imagery_epoch":"2023",
  "score": { "value":0.07, "unit":"ratio", "basis":"inferred", "as_of":"2026-09-24", "source":"parcel_facts(job_…join) 경작지 ratio", "note":"임계 0.20 [추정] 미만" },
  "explain_short": "지목 '전' · 2023 25cm 판독 경작지 7% · 비닐하우스 0% → 휴경 의심",
  "geom": { "type":"MultiPolygon", "coordinates":[[…]] }, "prev_finding_id": null, "created_at":"…", "updated_at":"…" }
```
**오류 코드 추가**: `registry_unavailable` 404(대장 캐시·반입 없음) · `bldg_key_pending` 503 · `rule_requires_missing` 400(규칙이 요구하는 대장 종류 없음 → skipped) · `inspection_not_on_site` 409(정책상 도착 필수일 때만) · `verdict_required` 400.

**SSE(계약 §5.1 표에 추가)**: `survey.rule_skipped` · `survey.finding`(`shard.done`과 함께 · 칸 안 finding 요약 `{pnu, rule_id, severity}` 최대 200 · 나머지는 polys_url) · 기관 스트림 `GET /events/t/{tenant}/survey`: `inspection.submitted` · `finding.state`(포털 큐·지도가 즉시 갱신).

### 3.3 저장·타일

- 의심 층 = 불변 PMTiles 스냅샷 `results/{tenant}/survey-{deploy}@{rules_hash}.pmtiles`(layer `findings` · promote_id `id` · 속성 `pnu rule_id severity state`) — 계약 §4.2 서명 규약 · 상태 변화는 `feature-state`로 덧칠(스냅샷 재생성 없이). 1차 off 모드 파일: `02. 데이터/survey/namwon-farm-2023-findings.pmtiles`(폴더는 이미 있음 · 비어 있음 [실측]).
- `parcel_facts` 스냅샷 `survey/namwon-facts-2023.parquet`(GeoParquet · 보관·교환).
- 사진: `LX_DATA_ROOT/tenants/{id}/uploads/inspections/…` · 서명 URL로만 서빙 · 게스트·LX 라우트 0(사진은 기관 자산).

---

## §4. 화면 설계 — 결정적 장면

법전 v2: 지도 = Imagery 무대(유리 elev-2 · 빛은 데이터 위에만) · 문서·표·모바일 폼 = Paper 무대. 색 역할: **청록 = AI 결과(판독 층)** · **액센트 #006DF7 = 의심(선택·정보 상태) 헤어라인 + 사선 해치** · **잉크 채움 .35 = 현장 확인 위반** · **걷힘(투명) = 일치·적법** · **앰버 380 = 락온 순간만** · **경고 #D1352B = '위반' 글자만**. 채도가 터지는 곳은 결과 위 하나뿐이라는 규칙을 지킨다 — 의심은 파란 *선*이고 채움은 해치다.

### 4.1 S-1 — XI맵 '실태조사 모드'(`landxi/xi/index.html?mode=survey&svc=dp-nw-farm-25&survey=farmland`)

**진입**: 레이어 패널(좌상 유리 360) 상단 모드 스위치 `판독 ◉ 실태조사 ○` — 기관 세션은 실태조사가 기본. URL 상태에 `mode=survey&survey=&rule=&state=&pnu=` 추가(계약 §3.1 URL 규약 확장).

**장면(≈14s · 통합 영상에 들어가는 길이)**

| 초 | 무엇 | 부품 |
|---|---|---|
| 0–2 | 판독 층(청록 · P4 129,420)이 켜진 남원 z12.5 위에 모드 스위치를 누른다. 레이어 패널이 **업무 선택** 판으로 바뀐다: `surveys.js` 7종 + 신규 3종 = 행 10 · 각 행 담당 부처 · 주기 · 활성 규칙 수(봉투) · 남원 배포본에 연결된 것만 켜짐(`farmland` 켜짐 · 나머지 `배포본 없음 · 점선`) | `ui/survey-panel.js` |
| 2–3 | '농지이용 실태조사' 선택 → 필지 층(P8 · z12는 읍면동 집계 격자 · z14+ 필지 outline 헤어라인 흰 .35)이 도착 1250 · 카메라 pitch 0→25 | `frame()` · P8 PMTiles |
| 3–6 | **대조 스윕**: 잉크 헤어라인 수직선(청록 스윕과 다른 재질 — 1px `#010102` .6 + 24px 꼬리 없이 **격자 점선 꼬리**)이 좌→우로 지나간다. 지나간 자리에서 **일치 필지는 걷히고(fill 0 · outline 유지) 불일치 필지만 액센트 해치로 남는다**. 스윕은 `shard.done`(읍면동 단위 39칸)에 묶인다 — on 모드는 실제 `kind:'survey'` job · off 모드는 리플레이 | `fx/reconcile-sweep.js`(신규 · `arrive`와 `job-theater` 조합) |
| 6–7 | 락온 380 × 3(가장 큰 의심 3필지) · HUD 124px 숫자가 40ms/글자로 **`의심 필지 n`**(봉투 inferred) · 부제 `읍면동 39/39 대조 · 규칙 2 · 대장 C04 2021-12 · 건축물대장 미대조` · 우상 HUD ≤ 420 | `fx/arrive.js` · `hud.js` |
| 7–9 | 우 서랍(유리 · 420)이 **의심 목록 큐**로 열린다(§4.3) · 첫 행 호버 → 지도 필지 +outline 2px · 삼각 호버 표↔도형↔읍면동 막대 | `ui/drawer-findings.js` |
| 9–14 | 행 클릭 → 카메라 1600 z17 · 배경 25cm → (AOI 안이면) 1.08cm · **필지 카드**(§4.2) 도착 | `ui/parcel-card.js` v2 |

**HUD 문구 규칙**: 대장이 없는 규칙은 `skipped`로 HUD 부제에 정직하게 쓴다(`건축물대장 미대조 · 지목 기준만`). 지어낸 정밀도·처리율 0.

**게스트(`public=1`)**: 실태조사 모드 **없음**(의심 목록은 행정 내부 정보 · 개인 필지 특정 가능). LX staff: 열람 + 정밀도 보드 링크. 기관 manager: 전부. inspector: 모바일만.

### 4.2 P-3 — 필지 카드 v2 '대장 vs 현황 나란히'(`EVIDENCE-PAIR` 안의 유리 카드 · 폭 560 · elev-2)

```
┌ 4519025021100010000 · 운봉읍 ○○리 123-4 [예시]                     실측 · C04 2021-12 · 25cm 2023 ┐
│ ┌── 대장(등록) ───────────────┐  ┌── 현황(AI 판독) ─────────────────┐                             │
│ │ 지목        전               │  │ 경작지     7%  ▮░░░░░░░░░  conf .81 │  ← 막대는 ratio 봉투    │
│ │ 면적        1,842 ㎡         │  │ 건물      31%  ▮▮▮░░░░░░░  conf .77 │     [예시]              │
│ │ 소유구분    사유             │  │ 비닐하우스  0%                      │                          │
│ │ 공시지가    ₩ 12,300/㎡ '21  │  │ 주차장     12%  ▮░░░░░░░░░ conf .69 │                          │
│ │ 용도지역    (키 대기 · 점선)  │  │ 시점  2023 ◉ ─── 2025-04 ○ (AOI 밖 · 2m) │                       │
│ │ 건축물대장  (키 없음 · 점선)  │  └────────────────────────────────────┘                          │
│ └────────────────────────────┘                                                                    │
│ ▣ 시점 스크럽  2023 ▬▬▬●▬▬▬ 2025   크롭 2장(AOI 밖) · 4장(AOI 안 · A01 실시간 크롭 · clip-path 1000) │
│ ── 왜 의심인가 ──────────────────────────────────────────────────────────────────────────────────── │
│ R-FARM-02 v1.0 · 심각 2  │ 지목 '전'(대장) 위 건물+주차장 43% ≥ 15% [추정] · 건축물대장 미대조         │
│ R-FARM-01 v1.0 · 심각 1  │ 경작지 7% < 20% [추정] · 비닐하우스 0%                                     │
│ [ 현장조사 배정 › ]  [ 오탐 신고 ]  [ 이력 ▾ ]                                   상태 open · 2026-09-24 │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- 좌우 두 칸은 **같은 행 높이**로 정렬해 눈이 가로로 대조한다(EVIDENCE-PAIR). 대장 결손은 점선 무채 + 이유 한 줄(`키 없음` · `키 대기` · `반입 전`).
- 현황 막대는 `parcel_facts.ratio` 봉투 → `prov()` 칩. 시점 라디오를 바꾸면 막대가 500ms로 다시 자라고 지도 배경이 그 시점으로 갈린다(V5 연동).
- '왜 의심인가'는 §5.3 Explain을 **한 줄 = 규칙 하나**로. 임계는 항상 `[추정]` 꼬리표. 위반 확정 뒤에는 이 줄 끝에 `현장 확인 · 위반 · 2026-10-02`(measured)가 붙고 '위반' 글자만 경고색.
- 이력 ▾ → §4.5 타임라인이 카드 아래로 펼쳐진다(750).

### 4.3 Q-1 — 의심 목록 큐(우 서랍 420 · XI맵 안 / 포털 '결과' 탭에서는 전폭 LEDGER)

- 헤더: 상태 칩 4(`open n · assigned n · inspected n · closed n` 봉투) · 정렬(심각도 · 면적 · 갱신) · 필터(규칙 · 읍면동 · 시점) · 검색(PNU·지번).
- 행(56px): `심각 ▮▮▯ · 운봉읍 ○○리 123-4 · 지목 전 → 건물 31% · R-FARM-02 · open` — 행↔도형↔읍면동 막대 삼각 호버 · 체크박스 다중 선택 → 하단 액션 바 `n건 배정 › · 무시(사유)` · 배정 시 동선 제안은 2차(`patrol-route` local).
- 빈 상태: `의심 0 · 대조 완료 hh:mm` (정직). 대장 없는 규칙은 목록 하단 `skipped 2 · 건축물대장 없음` 줄.
- 내보내기 CSV(BOM · `export_policy` 검사 · 소유자 성명 열 없음).

### 4.4 M-1 — 현장조사 모바일(`landxi/portal/<tenant>/inspect/` · PWA · 390×844 · realm tenant · role `inspector`)

두 화면 = 두 무대(법전 "한 화면은 한 무대").

**① `today.html`(Paper)** — 오늘 배정 목록: 상단 큰 숫자 `오늘 n건 · 완료 m`(봉투) · 행 = 지번 · 규칙 한 줄 · 거리(GPS 기준 · `estimate`) · 순서 번호 · 오프라인 배지(`번들 저장됨 · 타일 z16–18 · 필지 outline`). 하단 고정 `동기화 대기 k건`.

**② `parcel.html?insp=`(Imagery · 모바일 변형 레이아웃 `CANVAS-SHEET` — §7 법전 개정 요청)** — 지도 55%(xdworld z17 + 필지 outline 액센트 2px + AI 폴리곤 청록 .18 + **내 위치 점 + 필지까지 거리 링**) · 하단 유리 시트 45%(당겨 올리면 90%):
1. 도착: 시트 첫 줄 `필지까지 38m · 도착 판정 ≤ 50m [추정]` → 안에 들어오면 락온 380 · `현장 도착 hh:mm`(measured · `arrive`).
2. 대장 vs 현황 축약(2열 3행) + 정사영상 크롭 1장(2023) — **카메라 버튼을 누르면 그 크롭 옆에 지금 찍은 사진이 나란히 붙는다**(EVIDENCE-PAIR · clip-path 1000). EXIF GPS·방위 자동 · 사진 ≤ 8MB · 여러 장.
3. 판정 3택(큰 버튼 · 잉크 채움 1개만 = 선택): `일치(적법)` · `위반` · `확인 불가` → 코드 피커(업무별 코드표 · 예 `FARM-IDLE-JUSTIFIED 정당 휴경` · `FARM-CONV-BLDG 건물 전용` · `BLDG-NOPERMIT 무허가`) → 메모(음성 입력 허용) → 제출(오프라인이면 큐 · `client_id` 멱등).
4. 제출 후 시트가 750으로 접히고 다음 필지로 카메라 1600 이동 — 점프 없음.

결정적 장면 **M-1**: *정사영상 크롭 옆에 현장 사진이 붙는 순간* — 공무원이 "이게 조사서다"라고 느끼는 프레임. 사진 두 장은 같은 폭 · 위 출처 칩(`LX 항공 25cm 2023` / `현장 2026-10-02 10:41 · GPS ±8m`).

접근성·현실: 큰 글자(바닥 16px 모바일) · 장갑 손 · 한 손 조작(하단 시트) · iGPU·저사양 = T2(pitch 0 · 압출 없음) · 오프라인 번들은 배정 시 서버가 `inspections/{id}` 응답에 타일 목록을 넣고 PWA가 미리 받는다(z16–18 · 필지 반경 300m [추정] · 약 수 MB [추정]).

### 4.5 H-1 — 필지 이력 타임라인(`ui/parcel-timeline.js` · 카드 아래 펼침 / 포털 필지 페이지 전폭)

```
2021-12 ◆ 대장  지목 전 · 소유 사유 (C04)
2023-05 ▣ 영상  25cm 항공 ── ● 판독 경작지 7% · 건물 31% (P4 · inferred) ── ▲ 의심 R-FARM-02 (2026-09-24)
2025-04 ▣ 영상  드론 1.08cm(AOI 안일 때) ── ● 판독 …
2026-10 ■ 현장  위반 · FARM-CONV-BLDG · 사진 3 (measured) ── ▶ 조치 시정명령 · 농지법 §42 [법령 확인] · 기한 2026-12
```
- 수평 레일 · 시간축 = V5 스크러버와 **같은 축**(스크러버를 끌면 타임라인 커서가 따라오고 배경 영상이 갈린다). 이벤트 종류별 마커 6(◆ 대장 · ▣ 영상 · ● 판독 · ▲ 의심 · ■ 현장 · ▶ 조치) — 아이콘 v2 없으면 글자 라벨.
- 각 마커 호버 → 브래킷 카드(출처 봉투 · 사진 썸네일). 영상 마커는 그 시점의 필지 크롭 썸네일(A01 AOI 안만 4장 · 밖은 A03 2장 · C01 1장).
- 시민·게스트는 보지 못한다. LX staff는 판독 마커까지만 상세(현장·조치는 건수만).

### 4.6 O-1 — 기관 포털 작업공간(5탭 골격 유지 · `LOCKED` 골격 안에서)

production 스펙의 5탭(현황·결과·지도·통계·보고서)은 LX가 잠근 골격이다. 실태조사는 **탭을 추가하지 않고** 각 탭의 내용 블록으로 들어간다(`opt`/`add` 요구 처리 방식 그대로).

| 탭 | 실태조사 블록 | 결정적 장면 |
|---|---|---|
| 현황 | 큰 숫자 밴드 `의심 n · 배정 m · 확인 k · 조치 j`(봉투) + 읍면동 × 상태 헤어라인 막대 + `이번 주 마감 배정` 목록 · 규칙별 정밀도 스파크라인(24px · rule_stats · 3개월) | 숫자가 SSE `finding.state`로 40ms 현상 — 현장에서 제출하면 사무실 화면이 바로 바뀐다 |
| 결과 | §4.3 큐 전폭(LEDGER) + 배정 패널(담당자 · 날짜 · 동선 순서 드래그) + 반려/승인(`decide`) | 배정 → 모바일 `today.html`에 즉시 도착 |
| 지도 | XI맵 실태조사 모드 임베드(`?mode=survey&svc=&embed=1`) | S-1 |
| 통계 | `stats?by=emd|rule|state|month` — 읍면동별 의심률(의심/필지 수) · 확인율 · **위반 확정률(= 규칙 정밀도)** · 월별 추이 · 전부 봉투·프로비넌스 칩 | 정밀도가 낮은 규칙 행에 `임계 재교정 제안 보기 ›`(§5.5) |
| 보고서 | 서식 3: `실태조사 결과보고`(읍면동 × 규칙 × 상태 표 + 지도 이미지) · `시정명령 대상 목록`(CSV BOM · 성명 없음) · `대장 불부합 목록`(지목 변경 유도용 · LX 지적 업무 연결) — 기존 `report-standard` 흐름(접수→생성→완료) 재사용 | 발급 요청 3클릭 |

**조치 화면**(결과 탭 행 → 우 판): 조치 종류 7 · 법령 근거(코드표에서 · `[법령 확인]` 상시) · 문서번호 · 기한 · 상태. 조치가 `issued`면 이력에 ▶ 마커. **문서 생성(공문 서식)은 기관 시스템(새올) 몫** — Land-XI는 목록·근거·첨부(사진·크롭·대조표)까지만 낸다(two-tier).

### 4.7 LX 쪽 — 규칙 정밀도 보드(LX 워크벤치 '프로젝트 → 분석' 옆 서랍 · Paper)

규칙 × 읍면동 × 월 정밀도 격자(데이터 잉크 · 램프 `--conf-*`) · 오탐 확정 건이 라벨링 큐로 간 수 · `recalibrate` 제안 카드(현재 임계 vs 제안 임계 · 근거 n · Youden J [추정] 표기) · `activate`(approvals). 화면은 하나, 기능은 세 개 — 새 메뉴 아니다(원본 1:1 규칙과 충돌 최소).

---

## §5. 규칙 엔진 — 설명 가능한 규칙 · 임계 [추정] · 오탐 관리

### 5.1 원칙

1. **규칙은 순수 함수**: `(parcel, facts[epoch], registry[kind], thresholds) → finding | null | skipped(reason)`. 부작용·외부 호출 0. 같은 입력·같은 버전 → 같은 결과(재현성 · 감사).
2. **설명이 먼저**: 규칙을 쓸 때 `explain` 템플릿을 같이 쓴다. 템플릿 없는 규칙은 활성화되지 않는다(`prov()`가 봉투 없는 숫자를 던지는 것과 같은 규칙).
3. **임계는 전부 봉투 `estimate`**: 값 · 근거(`source`: "초기값 · 농정과 관행" / "rule_stats 3개월 Youden J") · `as_of`. 화면은 `[추정]`을 붙인다. 실측 분포로 교정되면 `source`가 바뀌지만 `basis`는 여전히 `estimate`(임계는 측정값이 아니다).
4. **없는 대장으로 판정하지 않는다**: `requires`에 있는 대장이 없으면 `skipped` — 화면·HUD·목록에 사유가 남는다.
5. **모델 지표를 지어내지 않는다**: 규칙 정밀도는 `inspections.verdict`에서만 계산한다(현장 확인 = 정답). 확인 0건이면 정밀도 = `null · 확인 전`.
6. **개인정보 최소화**: 규칙 입력에 소유자 성명·연락처는 없다. `owner_kind`(국유·공유·사유)만.

### 5.2 DSL(`rules.when_ / then_ / thresholds / explain` · JSON · 1차는 파일 `server/config/rules/*.yaml`로 시드)

```yaml
id: R-FARM-01            # 휴경(비경작) 의심
survey_id: farmland
version: "1.0"
owner: lx
name: { ko: "농지 비경작(휴경) 의심", en: "Idle farmland (suspected)" }
requires: [cadastre]                       # facts 는 항상 필요 · 대장 종류만 적는다
when:
  all:
    - { field: "registry.cadastre.jimok", in: ["전", "답", "과"] }
    - { field: "facts[epoch].경작지.ratio", lt: "$ratio_crop_min" }
    - { field: "facts[epoch].비닐하우스.ratio", lt: "$ratio_house_max" }
    - { field: "facts[epoch].건물.ratio", lt: "$ratio_bldg_max" }         # 전용은 R-FARM-02 가 잡는다 · 중복 방지
    - { field: "parcel.area_m2", gte: "$area_min" }
thresholds:
  ratio_crop_min:  { value: 0.20, unit: ratio, basis: estimate, as_of: "2026-09-24", source: "초기값 · 농지법 시행령 휴경 판단 관행 참고 [법령 확인]" }
  ratio_house_max: { value: 0.10, unit: ratio, basis: estimate, as_of: "2026-09-24", source: "초기값" }
  ratio_bldg_max:  { value: 0.15, unit: ratio, basis: estimate, as_of: "2026-09-24", source: "초기값" }
  area_min:        { value: 300,  unit: m2,    basis: estimate, as_of: "2026-09-24", source: "초기값 · 소필지 노이즈 억제" }
then:
  finding_type: idle_farmland
  severity: { by: "facts[epoch].경작지.ratio", bands: [[0.0, 0.05, 3], [0.05, 0.12, 2], [0.12, 0.20, 1]] }
  verdict_codes: [FARM-IDLE-JUSTIFIED, FARM-IDLE-UNJUSTIFIED, FARM-IDLE-MISREAD]
explain:
  short: "지목 '{jimok}' · {epoch} 판독 경작지 {crop_pct} · 비닐하우스 {house_pct} → 휴경 의심"
  lines:
    - "대장: 지목 {jimok} (C04 · {cadastre_as_of})"
    - "현황: 경작지 {crop_pct} < {ratio_crop_min} [추정] · conf {crop_conf}"
    - "제외 확인: 비닐하우스 {house_pct} · 건물 {bldg_pct}"
```

**1차 규칙 팩(LX 기본 · `estimate` 초기값)**

| 규칙 | 업무 | when(요약) | requires | 심각도 | 1차 화면 |
|---|---|---|---|---|---|
| **R-FARM-01** 휴경 의심 | farmland | 지목 전·답·과 ∧ 경작지 ratio < .20 ∧ 시설·건물 낮음 ∧ 면적 ≥ 300㎡ | cadastre | ratio 밴드 3단 | **1차 ◉** |
| **R-FARM-02** 농지 전용 의심 | farmland | 지목 전·답·과 ∧ (건물+주차장) ratio ≥ .15 ∧ 건물 면적 ≥ 20㎡ | cadastre (+building 있으면 '대장 있는 건물' 제외) | 면적비 밴드 | 2차(1차는 R-LU-01이 대신) |
| **R-LU-01** 지목 불부합(전·답·과·임 위 건물) | landuse | 지목 ∈ {전,답,과,임,목} ∧ 건물 탐지 면적 ≥ 20㎡ [추정] ∧ conf ≥ .5 | cadastre | 건물 면적 밴드(20/100/300㎡) | **1차 ◉** — 건축물대장 없이도 성립 · HUD `건축물대장 미대조` |
| R-BLDG-01 무허가 건축물 의심 | illegal_bldg | 건물 탐지(또는 A04 '신축') ∩ 건축물대장 footprint = ∅ ∧ 면적 ≥ 20㎡ | building(footprint) | 면적·신축 여부 | 2차(건축HUB 키) |
| R-BLDG-02 신축 미허가 | illegal_bldg | A04 변화 '신축' ∧ 시점 사이 허가·신고 없음 | building · dev_permit | – | 2차 |
| R-GB-01 개발제한구역 내 신축·형질 변경 | greenbelt | 변화(신축·나지화) ∩ GB 구역 | landuse(GB) | 면적 | 2차(레이어명 [미검증]) |
| R-DEV-01 허가 범위 초과 | dev_permit | 허가 폴리곤 100m 버퍼 안 변화 ∧ 폴리곤 밖 ≥ 200㎡ | dev_permit | 초과 면적 | 2차(반입) |
| R-DEV-02 미착공·미준공 | dev_permit | 준공 예정 경과 ∧ 허가 필지 변화 없음 / 건물 없음 | dev_permit | 경과 월 | 2차 |
| R-PUB-01 공유재산 무단 점유 | public_asset | owner_kind ∈ {국유,공유} ∧ (건물∨비닐하우스∨주차장∨경작지) ratio ≥ .10 ∧ 대부계약 없음 | cadastre · public_asset | 면적비 | 2차(C04 owner_kind만으로 '점유 후보'는 1차 통계로 가능) |
| R-RIV-01 하천구역 무허가 점유 | river_occupy | 건물 ∩ 하천구역(B02) ∧ 점용허가 없음 | river · river_permit | 건물 면적 | 2차(B02가 있어 '후보'는 즉시) |
| R-LIV-01 방치폐기물 필지 특정 | trash | 점 탐지(더미) ∈ 필지 ∧ 규모 추정 ≥ 임계 | – | 규모 | 2차(card-living 결과 결속 뒤) |

### 5.3 설명 카드(Explain) — 봉투 묶음

```json
{ "rule": { "id":"R-FARM-01", "version":"1.0", "name":{...} },
  "short": "지목 '전' · 2023 판독 경작지 7% · 비닐하우스 0% → 휴경 의심",
  "lines": ["대장: 지목 전 (C04 · 2021-12)", "현황: 경작지 7% < 20% [추정] · conf .81", "제외 확인: 비닐하우스 0% · 건물 0%"],
  "inputs": {
    "jimok": { "value":"전", "basis":"measured", "as_of":"2021-12", "source":"reference/parcels-namwon#4519025021100010000" },
    "crop_ratio": { "value":0.07, "unit":"ratio", "basis":"inferred", "as_of":"2026-09-24", "source":"parcel_facts job_…join · results/lx/namwon-landcover-2023" },
    "ratio_crop_min": { "value":0.20, "unit":"ratio", "basis":"estimate", "as_of":"2026-09-24", "source":"rules R-FARM-01@1.0" } },
  "evidence": { "detection_ids":[…], "fact_ids":[…], "registry_ids":["rs_…"], "imagery_id":"ap25-namwon-2023", "chips":[{"bbox":[…],"url":"/tiles/…"}] },
  "skipped": [ { "rule_id":"R-BLDG-01", "reason":"registry building 없음 · 건축HUB 키" } ] }
```
화면은 `lines`를 그대로 3줄로 그리고, 숫자마다 `inputs`의 봉투를 `prov()` 칩으로 단다. `skipped`는 카드 하단 점선 한 줄.

### 5.4 임계 초기값 [추정]과 교정 절차

- 초기값은 위 표대로 **전부 `estimate`**. 지자체 관행·법령의 수치 근거가 있으면 `source`에 적고 `[법령 확인]`.
- 운영 3개월 뒤(또는 확인 ≥ 100건 [목표]) `recalibrate`: `rule_stats`에서 규칙별 (score → verdict) 곡선 → **Youden J 최대 임계**를 제안 · 제안 카드에 n · 정밀도·재현율 변화(둘 다 봉투 measured · 확인 표본 기준) · 적용은 `activate`(approvals · 2인 승인 정책 시 2인). 자동 적용 없음.
- 읍면동·기관마다 분포가 다르면 `tenant_override.thresholds`(기관 규칙)로 나눈다 — LX 팩 값은 그대로.

### 5.5 오탐 관리 → LX 검수 → 재학습

```
inspection.verdict = 'match'(현장에서 대장·현황 일치 = 의심이 틀렸다)
  ├─ 원인 분류(inspector 코드): MISREAD_AI(판독 오류) · REGISTRY_STALE(대장 갱신 지연) · RULE_THRESHOLD(임계 문제) · SEASONAL(시점 문제)
  ├─ MISREAD_AI → feedback(kind:'fp', fid=detection, pnu, lnglat, note) 자동 생성 → LX 검토 데스크 '라벨링 큐로 보내기 ›' (기존 §3.5 고리) → 재학습 → 새 모델 → 카드 버전 ↑ → 배포본 갱신
  ├─ RULE_THRESHOLD → rule_stats 반영 → recalibrate 제안
  ├─ REGISTRY_STALE → registry_snapshots 강제 갱신 표시 · 대장 관리 부서 알림(기관 내부)
  └─ SEASONAL → 다음 시점 job에서 재평가 예약(finding.state='closed(unclear_deferred)' · 다음 epoch 자동 reopened)
verdict = 'violation' → 긍정 표본 → 규칙 정밀도 ↑ · 판독 폴리곤은 라벨 후보(positive)로 라벨링 큐(선택)
```
LX 정밀도 보드(§4.7)는 이 네 원인의 비율을 규칙·읍면동별로 보인다. **판독 오류 비율이 높은 클래스·지역이 곧 다음 학습 데이터 수집 지역**이다 — 양산 라인(대시보드 '다음 것' 띠)에 이 신호를 넣는다.

---

## §6. 정직성·보안·운영 요건

- **콘티**: 의심 수·정밀도·확인율 전부 봉투. 확인 0건 = `확인 전`. 규칙 skipped 표기 필수. 영상에 나오는 의심 수는 1차 배치가 실제로 낸 수(§8 P20 산출 뒤 채움 · 지금은 [예시]).
- **개인정보**: 필지 소유자 성명·주민번호는 저장·표시 0. `OWNER_NM`이 성명이면 P8b 적재에서 **소유구분 코드로 치환**하고 원문 열은 버린다 [확인 필요 · P8b 첫 작업]. 사진은 기관 자산 · 서명 URL · LX 라우트 0. 의심 목록은 게스트에 절대 없다(`build=public` 카탈로그에 `survey-*` 세트 제외).
- **격리**: findings·inspections·actions·history·registry_snapshots·기관 규칙 = RLS. LX는 읽기 + 정밀도 집계만. 기관 A 세션으로 B 필지 이력 0건(e2e 2차).
- **감사**: 규칙 활성화·임계 변경·dismiss·decide·action 전부 `audit_log`. 규칙 버전은 finding에 고정 저장(나중에 규칙이 바뀌어도 그때 왜 의심이었는지 재현).
- **성능 [추정]**: 129,420 × 328,966 교차 = PostGIS GiST · 읍면동 39 shard · CPU 워커 1 → 수 분. 규칙 평가는 필지 수(32.9만) × 규칙 수 선형 · 초 단위. 의심 PMTiles ≤ 수 MB. bench 뒤 실측으로 교체.
- **오프라인 현장**: PWA 번들 · IndexedDB 큐 · `client_id` 멱등 · 재접속 시 순서 보장 · 충돌(같은 inspection 두 기기) = 서버 최신 우선 + 반려 사유.
- **법적 지위**: AI 의심 = **조사 대상 선정 근거**이지 처분 근거가 아니다. 처분 근거는 현장 확인(measured)과 법령. 화면 문구 고정: `AI 판독은 조사 대상 선정 참고 자료입니다 · 처분은 현장 확인 후`(보고서 하단 · 카드 풋터 14px).

---

## §7. 계약·법전 변경 요청(F1-CONTRACT · system-v2 — Fable 판정 뒤 판 올림)

| # | 절 | 현재 | 제안 | 이유 |
|---|---|---|---|---|
| C1 | 계약 §4.4 `kind` | `infer · reinfer · index` | + **`join`**(CPU · detections ⋈ parcels) · **`survey`**(CPU · 규칙 평가) — shard = 읍면동 | 대조 스윕을 실제 큐 이벤트에 묶기 위해 · 우선순위 1 |
| C2 | 계약 §5.1 SSE | – | + `survey.rule_skipped` · `survey.finding` · 기관 스트림 `/events/t/{tenant}/survey`(`inspection.submitted` · `finding.state`) | 포털·모바일 즉시 갱신 |
| C3 | 계약 §3 역할 | tenant `manager · viewer` | + **`inspector`**(caps `inspections.read(own)` `inspections.write(own)` `parcels.read` · 모바일만 · 큐·조치 쓰기 없음) | 현장조사원 계정 |
| C4 | 계약 §4.5 `GET /parcels` | pnu·지목·면적·공시지가 | + `with=facts,registry,findings,history` · `epochs=` | 필지 카드 v2 |
| C5 | 계약 §6 스키마 | detections.pnu 존재 | 채움 규칙 명시(최대 교차 필지) + `0002_survey.sql` 7표 | §3.1 |
| C6 | 계약 §4.8 쿼터 차원 | 6 | + `bldg_calls_day`(건축HUB) · `photo_gb_month`(현장 사진) | 외부 API 한도 · 저장 |
| C7 | 계약 §10 오류 | – | + `registry_unavailable` `bldg_key_pending` `rule_requires_missing` `inspection_not_on_site` `verdict_required` | §3.2 |
| C8 | 계약 §4.2 sets | – | + `results/{tenant}/survey-{deploy}@{rules_hash}` · off 별칭 `02. 데이터/survey/*.pmtiles` | 의심 층 |
| C9 | 계약 §3.1 URL 상태 | XI맵 파라미터 | + `mode=survey&survey=&rule=&state=&pnu=` | 딥링크·포털 임베드 |
| V1 | 법전 v2 §2 레이아웃 | `CANVAS-FULL`(캔버스 ≥ 90%) | + **`CANVAS-SHEET`**(모바일 · 지도 55% + 하단 유리 시트 45→90% · 바닥 16px) | 현장조사 모바일은 캔버스 90%가 성립하지 않는다 |
| V2 | 법전 v2 §4 빛 문법 | `--sweep` 청록 | + **`--sweep-ink`**(대조 스윕 · 1px 잉크 .6 · 격자 점선 꼬리 · 지나간 뒤 일치 필지 걷힘 500) · **`--hatch-suspect`**(액센트 45° 해치 · 간격 6px · .18) | 판독(청록)과 대조(잉크·액센트)를 재질로 구분 |
| V3 | 법전 v2 §6 표기 | 여섯 꼬리표 | 변경 없음 — 현장 판정은 `measured`, 임계는 `estimate`, 의심은 `inferred`로 충분하다 | 꼬리표를 늘리지 않는다 |
| K1 | card-architecture §5.4 | 대장 대조 = 공통 승격 *후보* | **승격 확정**: `CORE_MODULES`에 `survey`(규칙 엔진 · 의심 큐 · 현장 · 이력) 추가 = 공통 8 · `parcel-match`(local)는 규칙 *내용*으로 남김 | 다섯 업무 반복 · R2 충족 |
| K2 | 원본 1:1 전제(설계서 §2.1) | 35화면 추가 없음 | 실태조사는 **XI맵 모드 + 기관 포털 블록 + 모바일**(원본 35화면 밖 · two-tier 기관 층)로 넣고 LX 워크벤치에 새 메뉴를 만들지 않는다. `home.html` scene 4 '통합조사 시뮬레이터' 스텁은 **이 기능의 공개용 얼굴이 아니다** — 게스트에 의심 목록 없음 | 사용자 2026-09-24 지시가 범위를 넓혔고, 그 자리는 기관 층이다 |

---

## §8. 범위 — 1차 플래그십 최소 vs 2차

### 8.1 1차(F1과 병행 · 별도 에픽 **F1-S** · 소유 파일 겹침 0 · 기간 5–6일 [추정] · 통합 영상에 ≈14s)

원칙: **로컬 자산만으로 닫히고, 지어낸 수치 없이, 공무원이 "내 일이 줄어드는 것"을 본다.** 외부 키(건축HUB) · 기관 반입 · 모바일 · 쓰기 흐름은 넣지 않는다.

| 조각 | 내용 | 자산 | 소유(새 경로) |
|---|---|---|---|
| **P8b** 필지 적재 | P8 원본 SHP → PostGIS `parcels` 328,966행 · OWNER_NM 성명 여부 확인 → 소유구분 치환 · 성명 열 폐기 | C04 남원 45190.shp [실측 경로] | `server/survey/pipelines/p8b_parcels_pg.py` |
| **P20** 결합 배치 | P4 129,420 × parcels → `parcel_facts`(2023) + A02·A04(2025 · AOI) → facts(2025-04) · `detections.pnu` 채움 · GeoParquet | P4 · A02 · A04 | `server/survey/pipelines/p20_join.py` · `02. 데이터/survey/namwon-facts-2023.parquet` |
| **P21** 규칙 배치 | R-FARM-01 · R-LU-01 두 규칙(`estimate` 초기값) → findings → PMTiles `survey/namwon-farm-2023-findings.pmtiles` + 읍면동 집계 JSON + skipped 목록(R-BLDG-01 `건축물대장 없음`) · 실제 의심 수는 **이 배치가 낸 값**만 화면에 | P20 산출 | `server/survey/rules/*.yaml` · `server/survey/engine.py`(순수 함수) · `p21_rules.py` |
| **워커 어댑터** | `kind:'join'` `kind:'survey'` CPU 어댑터(계약 §7 Adapter 인터페이스 · `ADAPTER={"id":"survey/join"…}`) · shard = 읍면동 39 · `shard.done` 발행 · off 리플레이 녹음 `replay/survey-namwon-2023.ndjson` | – | `server/adapters/survey/adapter_join.py` `adapter_rules.py` |
| **API 최소** | `GET /survey/findings` · `GET /survey/findings/{id}`(explain) · `GET /parcels?with=facts,findings,history` · `GET /survey/stats?by=emd` · `GET /survey/rules` — **읽기만** · 오류 코드 3 | – | `server/landxi_api/survey.py`(F1-B 결과 뒤 라우터 등록 1줄은 요청) |
| **XI맵 실태조사 모드(열람)** | 모드 스위치 · 업무 선택 판(10행 · 켜짐 1) · **대조 스윕 `--sweep-ink`**(shard.done 39칸) · HUD `의심 필지 n · 39/39 · 규칙 2 · 건축물대장 미대조` · 의심 목록 서랍(정렬·필터·삼각 호버 · 배정 버튼 `2차 · 준비 중` 비활성) · **필지 카드 v2**(대장 vs 현황 · 2시점 라디오 2023/2025-04 · 왜 의심인가 3줄 · skipped 점선) · 이력 타임라인(대장 1 · 영상 2 · 판독 2 · 의심 1 마커) · 두 모드(on/off) 콘솔 0 | P8 PMTiles · P21 PMTiles · P3 25cm · A01 | `landxi/xi/survey/{survey-panel.js,reconcile-sweep.js,drawer-findings.js,parcel-card-v2.js,parcel-timeline.js,survey.css}` · `landxi/xi/survey/data/{rules-fixture.json,findings-emd.json,replay/*.ndjson}` — F1-A `index.html`에는 **모드 훅 1줄 + import** 만 요청(결과 문서 '요청' 절) |
| **e2e·판정** | `f1s-sweep`(39칸 순서 · 일치 필지 fill 0 · 의심 해치) · `f1s-parcel-card`(대장/현황 행 정렬 · 봉투 · skipped 줄) · `f1s-no-fabrication`(HUD 숫자 = findings-emd.json 합) · `f1s-public-guard`(public=1에 survey 층·모드 없음) · motion-law | – | `tests/e2e/f1s-*.spec.mjs` · `shots/f1/S/**` · `blueprint/f1/F1-S-result.md` |

**영상 장면(F1-∑ 안 · 공무원 P-1 뒤 ≈14s)**: 판독 도착 → 모드 스위치 → 필지 층 도착 → **대조 스윕이 지나가며 일치 필지가 걷히고 의심만 남는다** → 락온 3 · HUD `의심 필지 n [AI 추론 · 검수 전]` → 서랍 첫 행 → 카메라 z17 → 필지 카드 대장 vs 현황 · 2시점 라디오 → '왜 의심인가' 3줄 · `건축물대장 미대조` 점선 → 이력 ▾ 펼침. 지어낸 수 0 · 현장·조치 장면 없음(2차라고 자막).

**넣지 않는 것(1차)**: 현장조사 모바일 · 배정·판정·조치 쓰기 · 포털 5탭 블록 · 건축HUB · V-World 대장 레이어(용도지역·GB) · 기관 반입 · 규칙 편집기·재교정 · 정밀도 보드(확인 0건이므로 보여 줄 게 없다 — 정직) · 공유재산·하천 규칙(후보 통계만 가능하나 화면 미표시).

### 8.2 2차 확산(4–6주 [추정] · 설계서 §8.2 '2차'와 같은 차수 · 기관 포털 남원 farm-25와 함께)

| 조각 | 내용 |
|---|---|
| S2-A 쓰기 흐름 | findings 상태기계 · dismiss · inspections 배정·decide · actions · `parcel_history` 트리거 · 기관 SSE 스트림 · RLS e2e(기관 A로 B 0건) |
| S2-B 현장조사 모바일 PWA | `today.html` · `parcel.html`(CANVAS-SHEET) · 도착 판정 · 사진 EXIF · 판정 3택 + 코드표 · 오프라인 큐 · 동기화 · `inspector` 역할 · T2 |
| S2-C 포털 5탭 블록 | 현황 밴드 · 결과 큐 전폭 + 배정 패널 · 지도 임베드 · 통계 · 보고서 서식 3(CSV · PDF는 3차) |
| S2-D 대장 확장 | 건축HUB 프록시(사용자 키) → R-BLDG-01 · V-World 용도지역·GB·임상도 레이어 [미검증 → 실호출 검증] → R-GB-01 · 반입 인터페이스(farm_ledger · dev_permit · public_asset · river_permit) → R-DEV · R-PUB · R-RIV · B02 하천 점유 후보 결속 |
| S2-E 오탐 고리 | verdict=match → 원인 코드 → `feedback` 자동 · 라벨링 큐 · `rule_stats` · LX 정밀도 보드 · `recalibrate` 제안(확인 ≥ 100건 뒤) · approvals |
| S2-F 이식 | `mod-survey` 공통 승격 · 규칙 팩이 카드 버전에 실려 `POST /deploys` 이식 시 함께 감 · `region_profile`별 임계 오버라이드 · 광주전남 해양(구간 축 — 현장·이력 부품만) |
| S2-G 시점 확장 | J2b 비닐하우스 재추론 · 2025 드론 전역(A03) 결과가 들어오면 facts epoch 추가 → 같은 pnu 재평가 → `reopened`/`superseded` 이력 |

3차(운영화)에서: 공문 서식 PDF · 새올 연계(민원 `civil-link`) · 동선 최적화(`patrol-route`) · 접근성 KWCAG · 행정망 접속 · 개인정보 영향평가.

---

## §9. 사용자 액션(발주자만 할 수 있는 것)

| # | 무엇 | 왜 지금 |
|---|---|---|
| U1 | **공공데이터포털 건축HUB 건축물대장 API 키** 신청(국토교통부 건축HUB 건축물대장정보 서비스) | R-BLDG-01(무허가) — 실태조사 두 번째 축 · 없으면 2차에도 `건축물대장 미대조` |
| U2 | V-World 키에 **용도지역·개발제한구역·임상도 레이어 호출** 실검증 승인(일일 한도 소모) · 레이어명 확정 | R-GB-01 · 토지이용계획 칸 |
| U3 | 남원시(또는 시연 기관)로부터 **개발행위허가 대장 · 공유재산 대장 · 하천 점용허가 대장 · 농지대장 표본** 반입 가능 여부 · 형식 확인 | R-DEV · R-PUB · R-RIV · farm_ledger |
| U4 | **C04 OWNER_NM 필드의 실체**(소유구분 코드인지 성명인지) 확인 → 성명이면 적재 시 폐기 승인 | 개인정보 |
| U5 | 규칙 초기 임계 `[추정]` 값(§5.2 표)에 대한 농정과·건축과 관행 확인 — 확인 전엔 `초기값` 표기로 간다 | 정직성 |
| U6 | 현장조사원(`inspector`) 계정 정책 · 사진 보존 기간 · 도착 판정 필수 여부(`inspection_not_on_site` 정책) | S2-B |
| U7 | 1차 영상에 실태조사 14s를 **넣는다/2차로 미룬다** 결정 — 추천은 **넣는다**(사업 코어를 첫 영상에서 보여야 하고, 로컬 자산만으로 닫힌다) | §8.1 |

---

## 부록 A. 화면 × 장면 × 자산(설계서 부록 A 형식)

| 화면 | 장면 | 한 줄 | 자산 |
|---|---|---|---|
| XI맵 실태조사 모드 | **S-1** | 대조 스윕이 지나가며 일치 필지는 걷히고 의심만 남는다 | P4 · P8 · P21 findings PMTiles · A11 |
| 필지 카드 v2 | **P-3** | 대장 vs 현황 나란히 · 2시점 라디오 · '왜 의심인가' 3줄 | C04 · P20 facts · A01/A03 크롭 |
| 의심 목록 서랍 | Q-1 | 상태 칩 4 · 삼각 호버 · 배정(2차) | findings |
| 현장조사 모바일 | **M-1**(2차) | 정사영상 크롭 옆에 현장 사진이 붙는다 · 도착 락온 | inspections · photos |
| 필지 이력 | H-1 | 대장·영상·판독·의심·현장·조치가 한 줄 · 스크러버와 같은 축 | parcel_history |
| 포털 현황 | O-1(2차) | 현장 제출이 사무실 숫자를 40ms로 바꾼다 | SSE finding.state |
| LX 정밀도 보드 | L-2(2차) | 오탐 원인 4 비율 · 재교정 제안 · 다음 학습 지역 | rule_stats · feedback |

## 부록 B. 신설 파일(제안 · 소유 경계 겹침 0)

```
docs/superpowers/blueprint/SURVEY-SPEC.md                    이 문서
docs/superpowers/blueprint/f1/F1-S.md                         브리프(§8.1 · Fable 작성 예정)
server/survey/{engine.py,dsl.py,explain.py}                   규칙 엔진(순수 함수)
server/survey/rules/{R-FARM-01,R-LU-01}.yaml (+ 2차 팩)
server/survey/pipelines/{p8b_parcels_pg.py,p20_join.py,p21_rules.py}
server/adapters/survey/{adapter_join.py,adapter_rules.py}
server/landxi_api/survey.py · server/migrations/0002_survey.sql
landxi/xi/survey/{survey-panel,reconcile-sweep,drawer-findings,parcel-card-v2,parcel-timeline}.js · survey.css · data/
landxi/portal/<tenant>/inspect/{today.html,parcel.html,js/*,sw.js}          (2차)
02. 데이터/survey/{namwon-facts-2023.parquet,namwon-farm-2023-findings.pmtiles,findings-emd.json,replay/}
tests/e2e/f1s-*.spec.mjs · shots/f1/S/ · blueprint/f1/F1-S-result.md
```

## 부록 C. 미확정 · 지어내지 않은 것

- 법령 조문 번호 전부 `[법령 확인]` — 구현 전 국가법령정보센터 대조.
- V-World 레이어명 중 실호출된 것은 `LP_PA_CBND_BUBUN`(성공)과 키 만료 시점에 이름 오류가 나지 않은 7종뿐. 개발제한구역·농업진흥지역·GIS건물통합 레이어명은 `[미검증]`.
- 건축HUB 오퍼레이션명(`getBrTitleInfo` 등)은 공개 문서 기준 `[미검증]` — 키 발급 뒤 스모크.
- 규칙 임계는 전부 초기값 `[추정]` · 정밀도는 확인 0건 = `확인 전`.
- OWNER_NM의 실체(성명/구분) 미확인 → P8b 첫 작업.
- 1차 영상 HUD의 의심 필지 수는 P21이 실제로 낸 값만 — 이 문서에는 적지 않았다.
