# Land-XI 역량 지도 (CAPABILITY-MAP)

- 작성: 2026-09-26 · Fable 5.1(수석 플랫폼 기획자)
- 대상: LX 600억 원 규모 국가급 하이퍼 GeoAI 플랫폼(국내 지자체·중앙부처 + 글로벌 ODA/수출)
- 입력: 다관점 탐색 705건(사업·보안·개인정보·공간정보·표준·AI 거버넌스·MLOps·LLM·실태조사 업무·SRE·UX/접근성·글로벌)
- 대조 문서: LANDXI-HYPER-BLUEPRINT.md, F1-CONTRACT.md, SURVEY-SPEC.md, agent/AGENT-SPEC.md, specs/*.md, 기능 인벤토리(2026-08-26), recon-0924/ASSET-LEDGER.md, 사용자 메모리
- 원칙: 소스·설계서 본문은 고치지 않는다. 이 문서는 "무엇이 빠졌고 어디에 넣을지"만 적는다. 수치는 [실측]·[추정]을 구분한다.
- 목적: **사용자가 짚기 전에 우리가 먼저 빠짐없이 기획한다.** 이 지도가 이후 모든 설계 문서의 완결성 점검표가 된다.

---

## §0. 한 장 역량 지도

### 0.1 집계 방법

- 705건을 같은 뜻끼리 합쳤다(예: `nis-security-review`=`security-review-nis`, `network-architecture-n2sf`=`network-separation-n2sf`=`network-separation-linkage`=`network-architecture`, `pia`=`privacy-impact-assessment`, `crypto-kcmvp`=`kcmvp-crypto`, `mobile-device-security`=`field-device-mdm`, `kwcag-certification`=`web-accessibility-kwcag`, `national-batch-campaign`=`national-batch-inference-campaign`, `time-sync-ntp`=`trusted-time-sync`, `ciip-*` 2건, `pii-file-registration`=`personal-info-file-registration`, `annual-security-*` 2건, `location-info-*` 2건 등). 병합 뒤 **역량 약 640건**, 도메인 12개 [실측: 병합은 수기 판정].
- 상태: **있음(covered)** = 설계 문서에 규칙·API·스키마·절차 중 하나 이상이 구체적으로 있음 / **부분(partial)** = 언급·한 줄·미룸("3차 목표") / **없음(missing)** = 검색 0건.
- 커버리지 = (있음 × 1.0 + 부분 × 0.5) ÷ 전체. 705건 원자료 기준 있음 ≈ 12, 부분 ≈ 195, 없음 ≈ 498 [추정: 수기 집계, ±15건].

### 0.2 도메인 × 역량 매트릭스

| # | 도메인 | 역량 수(병합 후) | 있음 | 부분 | 없음 | 커버리지 [추정] | 색 |
|---|---|---|---|---|---|---|---|
| A | 사업관리·발주·계약·예산·조달 | 48 | 0 | 3 | 45 | 3% | 🔴 |
| B | 보안 거버넌스·망분리·인증·시스템 보안 | 62 | 0 | 18 | 44 | 15% | 🔴 |
| C | 개인정보·데이터 보호 | 36 | 0 | 6 | 30 | 8% | 🔴 |
| D | 공간정보 보안·법정 절차(가림·반출·측량) | 22 | 0 | 9 | 13 | 20% | 🔴 |
| E | 국가공간정보 연계·표준·데이터 거버넌스 | 78 | 2 | 28 | 48 | 21% | 🔴 |
| F | AI 거버넌스·신뢰성·법적 지위 | 20 | 0 | 8 | 12 | 20% | 🔴 |
| G | MLOps(데이터·학습·평가·배포·추론 운영) | 82 | 1 | 34 | 47 | 22% | 🔴 |
| H | LLM 에이전트·생성형 AI 보안 | 30 | 0 | 7 | 23 | 12% | 🔴 |
| I | 실태조사 업무·행정 서비스(결재·민원·조치·현장) | 92 | 0 | 26 | 66 | 14% | 🔴 |
| J | 플랫폼 인프라·SRE·가용성·배포·과금 | 105 | 5 | 43 | 57 | 25% | 🟠 |
| K | UX·접근성·대국민 포털·브랜드·다국어 | 90 | 1 | 30 | 59 | 18% | 🔴 |
| L | 글로벌·ODA·수출 | 75 | 1 | 22 | 52 | 16% | 🔴 |
| | **합계** | **~640** | **10** | **234** | **496** | **≈ 20%** | 🔴 |

색: 🟢 ≥ 60% · 🟡 40–59% · 🟠 25–39% · 🔴 < 25%.

읽는 법
- 현재 설계서는 **제품·아키텍처·화면 설계서**로서는 밀도가 높다(XI맵 8동사, 큐·쿼터·관제, 카드 배포 상태기계, 다섯 겹 격리, 계보 API, 숫자 봉투). 그래서 "있음"으로 잡힌 10건은 전부 J·E·G(계량·격리·작업 신뢰성·V-World 프록시·계보·시계열)다.
- 그러나 **600억 국가급 사업이 검수·감리·보안성 검토·개인정보·공간정보 보안·행정 업무 연계에서 요구하는 층**은 거의 비어 있다. A(사업관리) 3%, C(개인정보) 8%, H(생성형 AI 보안) 12%가 가장 낮다.
- 우선순위 분포(병합 후): **P0 ≈ 105 · P1 ≈ 300 · P2 ≈ 235** [추정].

### 0.3 도메인별 한 줄 판정

| 도메인 | 지금 있는 것 | 결정적으로 없는 것 |
|---|---|---|
| A 사업관리 | 개발 로드맵(§8 주 단위), R1–R14, 부록 D 기술 리스크 | 요구사항 ID 체계(SFR~PSR)·추적표, RFP 원문 대조, ISP/ISMP, FP 사업비, 감리, 형상관리, 표준프레임워크 판정, 기술적용계획표 |
| B 보안 | 다섯 겹 격리, 관리자 origin 분리·IP allowlist·2인 승인, gitleaks, 폐쇄망 폴백 | 보안성 검토 패키지, N2SF 등급·망 구성도, 시큐어코딩·보안약점 진단, KCMVP, GPKI/MFA, PAM, 보안 책임 조직, cloudflared 대체 |
| C 개인정보 | audit_log(쓰기), 소유자→소유구분 치환(P8b), 에이전트 마스킹 한 줄 | PIA, 위탁 계약, 접속기록(읽기·다운로드) 보관·점검, 자동화 결정 권리(37조의2), 얼굴·번호판 비식별, 지적전산자료 이용 승인, 파생 산출물 잔존 PII |
| D 공간정보 보안 | R6(게스트 원본 금지), imagery.security_review·export_policy, 원본 라우트 0 | 가림 파이프라인, 가림 목록 비밀 취급, AI 결과 보안구역 필터, 공개등급 체계, 측량성과 국외 반출 통제, 공공측량 성과심사 |
| E 연계·표준 | V-World 프록시, STAC 유사 카탈로그, PMTiles/GeoParquet 저장 원칙, 계보 API | KRAS·일사편리·새올·행정정보공동이용 연계, OGC 발행, ISO 19115/19157, 지목·피복 코드 매핑, PNU 이력, 연속지적 편위 관리, 데이터 거버넌스 |
| F AI 거버넌스 | 'AI 추론·검수 전' 꼬리표, basis=inferred 봉투, LX staff 검수 | AI 기본법 고영향 판정, 행정기본법 20조 대응(결과 지위), 계약 합격선, 모델 카드 표준, 설명 방안, 사고·리콜 |
| G MLOps | models(sha256·metrics)·deploys 상태기계·lineage API·J1 P/R·THRESHOLDS | 데이터셋 버전·해시, 실험 추적, kind:train, 카드별 고정 평가셋·층화, 이식 게이트, 드리프트 수집, GPU 혼합 스케줄링, AGPL 판정 |
| H LLM | research-models·local-llm 조사, AGENT-SPEC 도구·권한·레드팀 20문 | 서빙층 아키텍처 편입, 생성형 AI 보안 적용체계, 프롬프트 인젝션·출력 처리·RAG 권한 상속, 토큰 계량, 테넌트 KV 격리 |
| I 실태조사 | SURVEY-SPEC(9종 조사, 상태기계, 규칙 엔진, 모바일 M-1, 보고서 3종) | 현장조사 대체의 법령 근거, 책상 종결 기준표, 위반 유형 코드, 전자결재·공문(HWPX)·송달·이첩·세외수입 연계, 오프라인 앱·MDM, 조사원 위치정보법 |
| J SRE | 큐·하트비트·XAUTOCLAIM, 쿼터·계량, 경보 규칙 9개, Phase 0/1/2 | SLO·에러 예산, 제어평면 HA, 원격 백업·PITR·DR, 당직·장애 등급, 부하시험, 환경 분리, CI/CD, 호스팅 모델 결정 |
| K UX | 법전 v2 토큰·모션 사다리, reduced-motion, 대비 4.5 일부, T1/T2/T3 티어 | KWCAG 인증 계획·33항목 대조, 지도 대체 수단, 필름 정지·건너뛰기, KRDS 정합, 반응형·모바일, 공개 포털 정식화, 시민 신고 |
| L 글로벌 | 사다리·locale en/ru, 라이선스 가드(수출 빌드), tenants.scope/crs | 재원별 납품 구조, 에어갭 설치본, 데이터 주권·반환, 현지 측지계, 위성 조달·권리, LADM, 역량강화 테넌트, 지속가능성·TCO |

---
## §1. P0 누락 — 착수 전 설계에 반드시 넣을 것

표기
- **1차 영향** ■ = 1차 플래그십 착수 전에 결정·문서화하지 않으면 뒤에서 뒤집힌다(차단) · ▲ = 1차 스키마·API·화면에 칸·필드·문구를 예약해 두면 된다(구현은 2차 이후) · △ = 1차에는 판정 기록만 남기고 2차 이후 구현.
- **어디에**: 화면은 설계서 §2 화면 ID·SURVEY-SPEC 화면 ID, 서비스는 F1-CONTRACT API·테이블, 문서는 신설 산출물 파일명(제안, `capability/` 아래).
- 근거 법령·지침은 탐색 결과를 그대로 옮겼다. 조항·시행일은 발주 시점에 원문 재확인이 필요하다(전부 재확인 대상).

### 1-A. 사업관리·발주·계약·예산 (P0 13건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| A-01 rfp-requirement-traceability | 요구사항 ID 체계(SFR·PER·SIR·DAR·TER·SER·QUR·COR·PMR·PSR)와 요구사항→설계→시험 추적표 | 조달청·NIPA RFP 관행, SW진흥법 요구사항 상세화, 감리 추적성 점검. 지금은 '사용자 요구 1~8'과 R1–R14뿐 | 신설 `REQ-TRACE.md`(요구사항 정의서+추적표). BLUEPRINT R1–R14, F1-CONTRACT §4 API, SURVEY-SPEC §3 각 항목에 REQ-ID 꼬리표 | ■ 1차 산출물 전부가 ID로 인용돼야 감리·검수 대상이 된다 |
| A-02 rfp-source-analysis | 보유 RFP·과업지시서 원문 분석과 설계 대조(누락 0 확인) | 검수·감리는 설계가 아니라 계약 문서와 대조한다. recon-0924/d-drive.md:120에 RFP 문서 존재만 기록 | 신설 `RFP-CROSSWALK.md`. 입력: D:/웨일 다운로드의 RFP 원문 | ■ 원문을 읽기 전엔 A-01의 ID 체계가 허공에 뜬다 |
| A-03 audit-supervision-readiness | 정보시스템 감리 대응(요구정의·설계·종료 3단계, 시정조치) | 전자정부법 제57조, 정보시스템 감리기준(행안부 고시). 5억 이상 의무 관행 → 600억은 대상. 문서의 'audit-0923'은 내부 UI 비평 | 신설 `AUDIT-PLAN.md`. §8 로드맵에 감리 3회 마일스톤. 산출물 목록(A-08)과 연동 | ▲ §8에 감리 시점만 박아 두면 1차는 진행 가능 |
| A-04 isp-ismp | ISP/ISMP 형식(환경 분석·As-Is/To-Be·이행계획·소요 예산) | 행정기관 정보시스템 구축·운영 지침, SW진흥법 상세화 제도. 예산 심의·발주 근거 | 신설 `ISMP-OUTLINE.md`(BLUEPRINT를 To-Be 모델로 인용, As-Is는 landxi7 인벤토리) | ■ 재원·발주 단위가 여기서 정해진다 |
| A-05 budget-basis-fp | 사업비 산정 근거(FP 개발비 + HW·SW 도입비 + 유지관리 요율 + 비SW 대가) | KOSA SW사업 대가산정 가이드, 기재부·조달청 원가 검토. 설계의 '예산'은 성능·모션 예산뿐 | 신설 `COST-BASIS.md`. F1-CONTRACT API·화면 수 → FP 산정 입력. GPU 산정은 §5.5와 J-11 연동 | ■ 600억을 개발·HW·운영·비SW로 나눈 근거 없이는 발주 자체가 안 된다 |
| A-06 config-change-management | 형상관리·변경관리(기준선, CR 심의, 변경통제위원회) | 감리기준, ISO/IEC 12207. f1/F1-A.md 공통 규칙이 'git 금지'라 소스 버전 통제가 없다 | BLUEPRINT §5.6 옆 '§5.7 형상·변경관리' 신설안. F1-A 공통 규칙의 'git 금지' 재검토(B-17 CI/CD 전제) | ■ git 없이는 CI/CD·SBOM·감리 기준선 전부 불가 |
| A-07 tech-application-plan-sheet | 기술적용계획표(RFP 첨부)와 기술적용결과표(완료 시) | 행안부 정보시스템 구축·운영 지침. 표준프레임워크·접근성·호환성·보안·DB표준·공개SW를 한 장으로 점검 | 신설 `TECH-APPLY-SHEET.md`. A-10·K-01·E-06 항목을 표 한 장으로 묶음 | ▲ 1차는 '미적용 사유' 칸을 채워 두면 됨 |
| A-08 deliverables-methodology(P1→P0 격상) | 개발방법론과 단계별 표준 산출물 목록(착수·요구정의·설계서·시험결과서·매뉴얼·완료) | 감리·준공 검사는 산출물 목록으로 판정. F1-CONTRACT·f1/F1-{A..D}는 개발 브리프일 뿐 | 신설 `DELIVERABLES.md`. 현 문서를 산출물 명칭에 매핑(BLUEPRINT=아키텍처 설계서, F1-CONTRACT=인터페이스·테이블 정의서) | ▲ 1차 산출물의 이름만 표준명으로 바꿔 두면 됨 |
| A-09 requirements-elaboration-scope-freeze | 과업내용 확정(과업심의)과 착수 후 요구사항 상세화, 확정 뒤 변경 통제 | SW진흥법 과업심의위원회. 범위 불명확 → 추가 과업 분쟁 | A-01 추적표에 '확정 기준선(baseline) 버전' 열. §8 로드맵에 '과업 확정 시점' | ■ 1차 범위(§8.1) 자체가 확정 대상 |
| A-10 egovframe-applicability | 전자정부 표준프레임워크 적용 판정(행정 업무 구간 Java/Spring vs AI·타일 구간 Python 분할, 미적용 사유서) | 행안부 지침·RFP 관행, 감리 점검. 현 백엔드는 FastAPI | §5.1 컴포넌트도에 '표준프레임워크 적용 구간' 경계선. 후보: 포털·결재·조사 관리(mod-survey)=eGovFrame, XI맵·카드 런타임·관제=Python | ■ 게이트웨이 언어를 1차에 굳히기 전에 결정 → §4 Q1 |
| A-11 sla-slm + warranty-maintenance | Land-XI 자체 SLA(가용률·장애 등급별 시한·응답시간·월간 SLM)와 하자보수·유지관리 체계(요율·범위) | NIPA SW사업 SLA 가이드, 국가계약법 하자담보. 설계의 'SLA'는 전부 외부 API 얘기 | 신설 `SLA-SLM.md`. J-01 SLO가 측정 재료. 관제 §4 ②에 'SLA 달성률' 패널 예약 | ▲ 1차는 SLO 이름·측정 창만 정의 |
| A-12 hosting-model-decision | 운영 호스팅 모델(LX IDC 온프레미스 / CSAP 민간 클라우드 / 공공 클라우드센터)과 운영 사이트 정의 | 현 운영기는 개발 PC 1대 + cloudflared. 이 결정이 망 구성·DR·인증(CSAP/CC)·감리 전제 | §5.5 확장 경로 앞에 '§5.5.0 운영 사이트' 신설안. Phase 1/2 배치 표에 '사이트' 열 | ■ → §4 Q2 |
| A-13 performance-kpi-framework | 사업 성과지표(현장조사 대체율·조사 소요일·필지당 비용·판독 정확도·적발 건수)와 기준선 측정 | 국가재정법 제38조 예타·제85조의2 성과관리, 정보화사업 성과관리. 문서의 'KPI'는 화면 계기 | 신설 `KPI-FRAMEWORK.md`. SURVEY-SPEC §5.4·usage_events에 '기준선 인일·단가' 필드. 관제 §4 ③ '사업 성과' 패널 예약 | ▲ 기준선(도입 전 인력 조사 인일)은 지자체에서 받아야 함 → §4 Q5 |

### 1-B. 보안 거버넌스·망분리·인증·시스템 보안 (P0 18건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| B-01 security-review-nis (=nis-security-review) | 국정원·상급기관 정보화사업 보안성 검토 패키지(보안대책서·보안요구사항 추적표) | 국가정보보안기본지침. 외부망·클라우드·AI 도입이 검토 핵심. cloudflared·Tailscale은 검토 없이 못 씀 | 신설 `SEC-REVIEW-PKG.md`. A-01 SER 항목과 1:1. §5.6 → '§5.6.1 보안대책 요약' | ■ 검토 없이 착수 불가가 사업 관행 |
| B-02 network-architecture-n2sf (=network-separation-n2sf, -linkage, network-architecture) | 망 구성도(행정망/인터넷망/관리망/DMZ), N2SF C/S/O 등급 분류표, 망간 자료전송, 데이터 등급↔망 매핑 | 국가정보보안기본지침 망분리, N2SF 가이드라인(2025). 지자체 행정망 사용자와 게스트·해외 인터넷 사용자를 한 플랫폼에서 받는 전제 | §5.1 컴포넌트도에 망 경계선 오버레이 신설. imagery/detections/tenants에 `n2sf_grade` 필드 예약. R14 '3차'를 '착수 전 설계'로 격상 | ■ 게이트웨이·타일·KRAS 연계가 어느 망에 있는지 없으면 §5 전체가 가설 |
| B-03 external-egress-in-closed-net | 외부 타일·API(GIBS·EOX·PC·V-World·jsdelivr) 호출의 망분리 대체 경로(중계 프록시·미러·반입, AOI 노출 차단) | 행정망은 인터넷 직접 호출 불가. 외부 요청 파라미터에 AOI가 드러남 | §3.2 사다리 각 단에 '망별 경로' 열. §5.2 /proxy/*를 '인터넷망 중계 프록시'로 명시. P12 오프라인 벤더링을 1차로 당김 | ■ 1차 시연 화면이 행정망 PC에서 안 뜨면 시연 실패 |
| B-04 remote-tunnel-policy | cloudflared·Tailscale 대체(인가된 VPN/보안 게이트웨이), 해외 기관 접속 경로 | 원격근무·외부연결 통제. 상용 터널은 비인가 외부 연결로 판정될 소지 | proposal-system Phase 0/1의 cloudflared·Tailscale 항목을 '시연 한정·운영 금지'로 표기. B-02 망 구성도에 '외부 접속 게이트웨이' 노드 | ■ 시연 URL 자체를 바꿔야 할 수 있음 |
| B-05 secure-coding-vuln-diagnosis (=secure-sdlc) | 시큐어코딩 기준, SAST/DAST, 보안약점 진단(행안부 기준 항목), 개통 전 취약점 점검·모의해킹 | 행정기관 정보시스템 구축·운영 지침, 행안부 SW 개발보안 가이드. 감리가 진단 결과 확인 | §5.6에 '개발보안' 소절. B-17 CI/CD 파이프라인에 진단 단계. §8 로드맵에 개통 전 점검 | ▲ 1차 코드부터 기준 적용 |
| B-06 kcmvp-crypto (=crypto-kcmvp) | 검증필 암호모듈: 비밀번호 일방향, 고유식별·민감정보 저장 암호화, TLS 1.2+ | 개인정보 안전성 확보조치 기준, 국가정보보안기본지침. F1-CONTRACT §3은 DEV_PASSWORD 한 값, TLS는 nginx 한 줄 | §5.6 '암호' 소절. F1-CONTRACT §3 인증·§6 스키마에 '암호화 열 목록'. server/.env 키 → J-14 비밀 저장소 | ▲ 1차는 argon2 + TLS, KCMVP 모듈은 조달 후 교체 가능한 어댑터로 |
| B-07 gpki-sso | 공무원 인증: GPKI 행정전자서명·기관 SSO 연동 | 전자정부법 제29조. 지자체 공무원에 ID/PW 단독 인증은 보안성 검토 지적 대상 | F1-CONTRACT §3 realm=tenant 인증에 `idp: gpki/sso/local` 필드. 로그인 화면(portal-login-*)에 GPKI 버튼 자리 | ▲ 1차는 local, 필드만 예약 |
| B-08 mfa | 관리자·개인정보취급자·외부 접속 2차 인증 | 안전성 확보조치 기준 제5조. 관제·배포·쿼터를 쥔 관리자 = 최고위험 | §5.6 관리자 보호(origin·allowlist·30분·2인 승인)에 'MFA' 겹 추가. LX/OPS 로그인 | ▲ 1차 TOTP 정도는 넣을 수 있음 |
| B-09 access-log-retention | 접속기록(열람·조회·다운로드·타일 열람 포함) 1~2년 보관, 월 1회 점검, 권한 이력 3년 | 안전성 확보조치 기준 제8조·제5조. audit_log는 쓰기만 기록 | F1-CONTRACT §6 audit_log 옆 `access_log(actor, realm, resource, action=read/download/tile, at)` 신설. 관제 §4에 '접속기록 점검' 월간 리포트 | ▲ 테이블 하나. 1차부터 쌓아야 2년 보관이 시작됨 |
| B-10 privileged-access-management | 서버·DB·GPU 노드 관리자 접속 PAM·접근제어 게이트웨이, 명령 기록, break-glass 봉인 | ISMS-P 2.5.5·2.6, 안전성 확보조치. 현재는 로컬 PC 직접 접근 | §5.6에 여섯 번째 겹 '관리자 접근'. B-02 관리망에 PAM 노드 | △ Phase 2 IDC 이전 시 |
| B-11 mobile-device-security (=field-device-mdm) | 현장 단말 MDM, 분실 원격 삭제, 오프라인 캐시 암호화, 앱 위변조·루팅 탐지, 캡처 제한 | 행안부 모바일 전자정부 서비스 관리 지침, 국정원 모바일 보안. offline-field-sync가 소유 정보를 단말에 내림 | SURVEY-SPEC §4.4 M-1에 '단말 보안 요건' 소절. §6 운영 요건 | ▲ M-1 설계에 요건만 |
| B-12 security-governance-officers | 보안·개인정보 책임 조직(분임정보보안담당관·CPO·사업 보안책임자)과 사업 보안관리계획서 | 국가정보보안기본지침, 개인정보 보호법 제31조. 책임 주체 없이는 B·C 항목 집행 불가 | 신설 `SEC-ORG.md`. §1 사용자와 여정에 '운영 조직' 열 | ■ 사람 지정은 발주자만 가능 |
| B-13 privacy-processing-outsourcing | 개인정보 처리 위탁 계약(LX·개발사·유지보수·클라우드), 처리방침 공개, 수탁자 교육·점검 | 개인정보 보호법 제26조. two-tier 구조에서 LX가 지자체 소유자 데이터를 처리 = 위탁 | two-tier·platform-roles 스펙에 '법적 지위(처리자/수탁자)' 열. `PRIVACY-PKG.md` | ■ 기관 온보딩 계약 서식의 전제 |
| B-14 genai-security-guideline | 생성형 AI 보안 적용체계(입력 등급 제한, 외부 LLM API 금지/통제, 로컬 vLLM 격리) | 국정원 생성형 AI 활용 보안 가이드라인(2023), 행안부 초거대 AI 가이드라인 | AGENT-SPEC §0 앞에 '적용 보안 기준' 절. B-02 등급표와 연동 | ■ 에이전트 1차 범위(AG-*)의 전제 |
| B-15 prompt-injection-tool-guard | 프롬프트 인젝션 방어, 도구 최소권한, 사용자 권한 상속, 파괴적 작업 사람 승인 | OWASP LLM Top 10(LLM01·LLM06). 에이전트가 작업 제출·배포·쿼터 API를 부르면 2인 승인 우회 통로 | AGENT-SPEC §3 도구 표에 '권한 등급·승인 필요' 열. 도구 결과=데이터 블록 규칙 유지 | ▲ AGENT-SPEC이 이미 일부 가짐, 표로 고정 |
| B-16 rag-access-inheritance | RAG·검색의 RLS·등급 상속, 개인정보·보안정보 출력 차단 | OWASP LLM02, N2SF. 벡터DB가 테넌트·등급을 무시하면 기관 간 누출 | AGENT-SPEC §3.6 저장소 결정에 'tenant_id·grade 메타 필수' 조건. F1-CONTRACT RLS를 벡터 저장소에도 적용 | ▲ 저장소 선택 조건으로 |
| B-17 ci-cd-pipeline + env-separation | CI/CD(빌드·e2e 573·정적분석·이미지 서명·SBOM·자동 배포)와 개발/검증/운영 환경 분리 | 행안부 개발보안, 공급망 보안, ISMS-P 2.8.3. 현재 개발=운영 같은 PC, cleanriver와 데몬 공유 | §5.5 Phase 표에 'staging' 행. §5.6 '배포 파이프라인' 소절. A-06 git 전제 | ■ A-06과 함께 |
| B-18 security-facility-list-custody + derived-artifact-pii-scrub | ① 가림 대상 목록(보안시설 좌표) 자체를 비밀·대외비로 격리(전용 저장소·인가자·판정 API만 노출) ② PMTiles·타일 캐시·스크린샷·필름·e2e 픽스처 속 개인정보 잔존 점검(속성 화이트리스트 빌드 검사) | 보안업무규정, 국가공간정보 보안관리규정 / 안전성 확보조치 기준. 이미 만든 namwon-parcels.pmtiles에 OWNER_NM이 남아 있음 [실측 meta.json] | ① §5.6 '보안구역 판정 서비스' 컴포넌트(목록 조회 불가, 판정만). ② P8·P10 파이프라인에 `attr_whitelist` 검사 단계, shots/·필름에 검사 규칙 | ■ ② 1차 시연 번들에 실명이 실릴 수 있음 → 즉시 |

### 1-C. 개인정보·데이터 보호 (P0 6건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| C-01 privacy-impact-assessment (=pia) | 개인정보 영향평가 대상 판정·수행(필지 소유자·조사 이력·현장 사진·조사원 계정·민원인 파일 식별) | 개인정보 보호법 제33조·시행령 제35조. 소유 정보 연계·현장 사진(얼굴·번호판)이면 대상 가능성 | 신설 `PRIVACY-PKG.md` §1 개인정보파일 목록 → PIA 대상 판정. SURVEY-SPEC §3 스키마의 개인정보 열 표시 | ■ 설계 단계에 받는 것이 관행 |
| C-02 vehicle-face-deidentification (=public-privacy-deid) | 드론·항공·현장사진 얼굴·번호판 자동 탐지·블러 공정, 공개 결과 레이어(사람·차량 탐지) 공개 범위 | 개인정보 보호법 제25조의2(이동형 영상기기), 가명정보 가이드라인. car_v2_obb 모델 보유 | §5.4 파이프라인에 P-deid 단계(원본→비식별본). imagery에 `deid_status`. 공개 모드 규칙(R6)에 '사람·차량 결과 공개 금지' | ▲ cm급 드론 시연 화면은 비식별본만 |
| C-03 parcel-owner-pii (=personal-info-protection) | 소유자 정보 표시·마스킹 규칙, owner_kind만 노출, 조사원 위치·현장사진 관리 | 개인정보 보호법 제3조·제29조. /parcels가 owner_kind 반환, pnu 칸이 detections·feedback에 있음 | F1-CONTRACT §4 /parcels 응답 스키마에 '노출 열 화이트리스트'. SURVEY-SPEC §6 | ▲ 1차 API 스키마에 명시 |
| C-04 statistical-disclosure-control | 필지 단위 '위반 의심' 결과의 공개 제한, 소규모 셀 억제, 집계 단위 하한 | 가명정보 가이드라인 재식별 위험. 필지=소유자 1:1이라 게스트 공개는 특정인 위법 의심 공개 | R6 공개 규칙에 '결과 벡터 공개 조건(집계 단위 ≥ 읍면동, 셀 ≥ n)'. stats-standard 집계에 억제 규칙 | ▲ public=1 모드의 결과 레이어 조건 |
| C-05 pipa-automated-decision-rights | 자동화된 결정에 대한 정보주체 거부·설명 요구 대응, 기준·절차 공개 | 개인정보 보호법 제37조의2(2024-03 시행). AI 의심 필지 선정이 처분 전 단계에 쓰이면 해당 판정 필요 | SURVEY-SPEC §2.4 상태기계에 '설명 요구 접수' 전이. 공개 포털 '자동화 결정 기준' 페이지. F-02와 연동 | ▲ 판정 기록 + 화면 자리 |
| C-06 cadastral-data-use-approval | 지적전산자료·국가공간정보센터 자료 이용 승인 절차(신청·범위·목적 제한·승인 대장) | 공간정보관리법 제76조. 승인 없이는 필지·소유자 대조 자체가 위법 소지 | SURVEY-SPEC §데이터 원천 표에 '이용 승인 근거' 열. `DATA-USE-APPROVALS.md` 대장 | ■ 1차 시연에 쓰는 C04 국토정보기본도(소유구분 포함)도 근거 확인 대상 |

### 1-D. 공간정보 보안·법정 절차 (P0 5건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| D-01 geo-security-masking-pipeline (=spatial-info-security, geospatial-security-classification) | 국가보안시설 가림(보안처리) 파이프라인(항공·드론 정사·DSM·3D), 보안심사 기록, 공개/공개제한/비공개 등급 체계와 해상도·정밀도 상한 | 국가공간정보 기본법 제35조, 국가공간정보 보안관리규정, 국토지리정보원 항공사진 보안처리 관행. 25cm·cm급 자체 영상은 필수 공정 | §5.4에 P-mask 단계(원본 → 가림본, B-18① 판정 서비스 호출). imagery에 `security_grade`, `security_review`를 상태기계(pending/cleared/rejected)로. 기관 배포본 가림 여부 규칙 | ■ 1차 시연에 쓰는 C01 25cm·A01 드론이 가림 전이면 화면에 못 올림 |
| D-02 ai-result-security-filter | AI 결과 벡터·통계·DSM·3D의 보안구역 필터(공개 차단) | 파생물도 보안관리 대상. 건물·차량 벡터와 DSM 높이가 시설 형상을 드러냄 | build=public·export 규칙에 '보안구역 교차 제거' 단계(F1-CONTRACT §4.1). 판정 서비스(B-18①) 호출 | ▲ 1차 public 빌드 규칙에 한 줄 |
| D-03 survey-data-export-control (=basic-survey-export-control, kr-export-restriction-guard) | 측량성과·정밀 공간정보 국외 반출 통제: 수출 빌드에서 국내 원천 레이어·국내 학습 모델 차단, 반출 허가 대장 | 공간정보관리법 제16조. 현 export 가드는 저작권 라이선스만 다룸 | F1-CONTRACT §4.1 build=export 가드에 `origin=kr & tier<=raw/tile → 차단` 규칙. models에 `training_origin` 필드 | ▲ 1차 F1-D 수출 빌드 규칙에 추가 |
| D-04 training-data-security-privacy | 학습데이터 비식별·보안 심사 필드(차량 OBB 번호판, 보안구역 칩 제외) | 개인정보 보호법, 국가공간정보 보안관리규정. 영상 서빙 기준 통제만 있고 데이터셋에는 없음 | G-01 데이터셋 매니페스트에 `deid`, `security_cleared` 필드. ASSET-LEDGER D01~D11에 열 추가 | ▲ 매니페스트 필드 |
| D-05 ngii-source-supply(P0) + license-rights-management(P0) | 국토지리정보원 정식 공급 경로와 원천 권리 기록(rights_holder·supply_basis), AI 결과(파생물)의 라이선스 상속 규칙 | 공간정보관리법 기본측량. X5: C01 권리 불명확, C04 출처 확인 필요, 'LX 보유' 표현 보류 | imagery에 `rights_holder`, `supply_basis`, `derived_license` 필드(제안 단계 → 확정). §9 Q-E ⑤⑥ 답 | ■ 1차 콘티 문구('LX 보유')와 시연 자산 권리 → §4 |

### 1-E. 국가공간정보 연계·표준·데이터 거버넌스 (P0 11건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| E-01 interface-catalog-integration-hub | 연계 인터페이스 목록(시스템·방식·주기·포맷·인증·망 경로·책임자·장애 시 처리) | 인터페이스 정의서(SIR)·행정정보공동이용 신청의 기본 정보. 외부 연계 10개+인데 §3.5 '연계'는 화면 간 이동 | 신설 `INTERFACE-CATALOG.md`. §3.5를 '내부 연계'로 개명, '§3.6 외부 연계'는 이 문서 인용 | ■ SIR 추적표의 원천 |
| E-02 kras-integration | KRAS(부동산종합공부) 지적·토지대장 연계(행정망 경유, 연계 승인) | 필지 실태조사·이력 대조의 정본. 현 필지 원천은 2021-12 스냅샷과 V-World WMS | E-01 첫 행. B-02 망 구성도의 행정망 노드. SURVEY-SPEC §데이터 원천 'KRAS' 행 신설(현재 '파일 반입') | ▲ 1차는 파일 반입, 연계 규격 칸 예약 |
| E-03 temporal-versioning-parcel-history | PNU 변동(분할·합병·지번 변경) 이력 테이블과 시점별 필지 경계 | 4시점 대조의 정확성. 필지는 2021-12 단일 스냅샷 | F1-CONTRACT §6에 `parcels_history(pnu, valid_from, valid_to, prev_pnu[], geom)`. V5 스크럽이 epoch별 필지 판 참조 | ▲ 테이블 예약, 1차는 단일 판 |
| E-04 cadastral-imagery-misalignment | 연속지적도-정사영상 편위 정량화, 경계 인접 완충 규칙, 지역별 위치정확도 표기 | 지적불부합지 존재(지적재조사법 배경). 필지×AI 폴리곤 교차 규칙은 편위가 곧 오탐 | SURVEY-SPEC §5 규칙 엔진에 `edge_buffer_m` 파라미터, parcel_facts에 `misalignment_class`. ISO 19157 위치정확도(E-08)와 연동 | ▲ 규칙 파라미터 |
| E-05 class-code-mapping-national | AI 클래스 ↔ 지목 28종·환경부 토지피복 코드·용도지역 매핑표 | 공간정보관리법 시행령 지목, 환경부 토지피복 분류. 결과는 cls/cls_en/cid 자체 코드 | 신설 `CLASS-CROSSWALK.md`. detections에 `jimok_code`, `lc_code` 파생 열. SURVEY-SPEC 규칙 R-* 입력 | ▲ 1차 카드 3~4종만 매핑 |
| E-06 iso19115-metadata-profile + feature-catalogue(19110, P1)·data-product-spec(19131, P1) 묶음 | KS X ISO 19115 메타데이터 프로파일(영상·벡터·AI 결과 공통) | 국가공간정보 기본법 표준 준수, NSDI 목록 등록, UN-GGIM IGIF. 카탈로그 필드 7개뿐 | F1-CONTRACT §4.1 /catalog 응답에 `iso19115` 블록(식별·범위·계보·품질·배포·연락처). A-07 기술적용계획표 항목 | ▲ 필드 예약 |
| E-07 stac-conformant-catalog + ogc-service-publishing | STAC 1.x 정식 준수(/search, eo/proj/raster/label 확장) + OGC WMS/WMTS/WFS·OGC API Features/Tiles 발행 | 기관 GIS(ArcGIS·QGIS·KRAS 연계)가 결과를 받는 표준 경로. 현재 소비만 하고 발행 없음 | §5.2 API 목록에 `/stac/*`, `/ogc/*` 라우트 군. §5.3 'PMTiles=전달' 옆 '표준 발행=pg_tileserv/pg_featureserv 또는 GeoServer' 선택 | ▲ 라우트 예약, 1차는 STAC /search만 |
| E-08 spatial-data-quality-iso19157 | 품질 요소(완전성·논리일관성·위치정확도·주제정확도·시간정확도) 측정·보고서 | KS X ISO 19157, 국가공간정보 납품 검사 관행. mAP·IoU만 있음 | models.metrics 옆 `quality_report(iso19157)`. 카드 결과 봉투 basis에 품질 요소 링크 | ▲ 필드 |
| E-09 data-governance-roles | 데이터 책임자·스튜어드·승인 흐름·데이터 정책 문서 | 데이터기반행정법, 공공데이터법 제공책임관, 감리 점검 | 신설 `DATA-GOVERNANCE.md`. B-12 조직표와 한 표. 카탈로그 `owner`, `steward` 필드 | ▲ |
| E-10 gov-auth·admin-info-sharing 묶음(P1) → 여기서는 vworld-openplatform(covered) 유지 | V-World 운영키·한도·재배포 조건 | 이미 설계됨(§5.2 /proxy/vworld). 남은 것은 키 재발급(E01) | 변경 없음 | ■ 키 재발급은 사용자 조치 |
| E-11 data-freshness(P1 격상 검토) | 외부 원천 기준일·동기화 주기·최신성 표기 | 지적 이동 반영 지연이 곧 오판정. '기준일' 칩만 있음 | 카탈로그 `source_as_of`, `sync_period`. XI맵 V8 필지 카드에 '공부 기준일' | ▲ 봉투 as_of 이미 있음, 원천 주기만 추가 |

### 1-F. AI 거버넌스·신뢰성·법적 지위 (P0 4건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| F-01 ai-basic-act-compliance (=ai-basic-act-transparency) | AI 기본법 대응: 고영향 AI 해당성 판정, 생성형 결과 표시, 위험관리·설명·인적 감독 문서 | 인공지능 기본법 2026-01-22 시행. 토지 행정 판단에 쓰는 실태조사 AI는 고영향 판정 필요 | 신설 `AI-ACT-COMPLIANCE.md`. 'AI 추론·검수 전' 꼬리표(R1·R2)와 basis 봉투를 법정 표시로 격상. AGENT-SPEC 답변에 생성형 고지 문구 | ■ 판정 결과가 F-02·인적 감독 설계를 좌우 |
| F-02 ai-result-legal-status | AI 판독 결과의 행정적 지위(참고자료 vs 처분 근거), 사람 확인 필수 원칙, 확정 권한자 | 행정기본법 제20조(자동적 처분은 법률 근거 필요, 재량처분 불가). 감사·소송 대응 | SURVEY-SPEC §2.4 상태기계에 'confirmed_by(사람)' 필수, 화면 M-1·Q-1에 '참고자료' 고지. F1-CONTRACT 봉투 basis에 `legal_status` | ■ 1차 콘티의 '현장조사 대체' 문구 수위 |
| F-03 ai-acceptance-criteria | 카드별 목표 지표·임계값, 검수용 비공개 평가셋 소유 주체, 제3자 검증, 미달 시 처리 | AI 구축 과업지시서 관행(TTA 등 제3자 시험), NIA 품질 목표 검증 | A-01 PER 항목. `ACCEPTANCE-CRITERIA.md`. G-06 평가 프로토콜의 합격선 열 | ■ 계약 합격선은 발주 문서 |
| F-04 model-data-license (=oss-model-license-compliance) | Ultralytics YOLO AGPL-3.0 판정(네트워크 서비스·수출·이식 시 소스 공개 의무 또는 Enterprise), AI Hub 약관, SAM 라이선스, SBOM | 카드 이식 '라벨·모델 사본 제공'(R7) 자체가 쟁점. 문서에 AGPL 0건 | 신설 `LICENSE-LEDGER.md`(코드·모델·데이터). models에 `license` 필드. §5.6 옆 '§5.8 라이선스·SBOM' | ■ 1차 모델이 YOLO11이므로 착수 전 판정 → §4 |

### 1-G. MLOps (P0 11건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| G-01 dataset-versioning | 데이터셋 버전·내용 해시·분할 매니페스트·불변 스냅샷 | NIA 학습데이터 품질관리 가이드라인, AI 기본법 문서 보관. lineage chain의 dataset이 경로 문자열 하나 | F1-CONTRACT §4.6 lineage dataset 노드를 `{id, version, sha256, split_manifest}`로. `datasets` 테이블 신설 | ▲ 테이블 |
| G-02 labeling-qa-workflow | 라벨링→다단계 검수→품질지표(작업자 간 일치도) | NIA 가이드라인, 발주처 검수 항목. AXIS-Label 프록시는 '미검증·1차 라우트 없음' | §5.2 /api/label/*을 2차로 두되, `labels(status, reviewer, iaa)` 스키마는 1차 예약 | ▲ |
| G-03 training-pipeline | job kind:train(컨테이너·시드·환경 고정·체크포인트 재개) | 'LX 선제 재학습'을 서비스로 하려면 학습이 플랫폼 작업이어야 함. kind는 infer/reinfer/index뿐 | F1-CONTRACT job.kind에 `train` 추가, options 스키마 예약. §3.3 큐 P2 재학습 우선순위와 연결 | ▲ enum 하나 |
| G-04 experiment-tracking | 하이퍼파라미터·지표·아티팩트·코드 커밋 기록, 런 비교 | 모델 선정 근거의 감사 가능성. recon에 '가중치 없는 run' 발견 | `runs` 테이블(models와 1:N). MLOps 스택 선정(P1 mlops-stack-selection)에서 MLflow 등 판정 | ▲ |
| G-05 model-registry | 상태 전이(staging→production→archived) 기준·서명 | 배포·롤백·감사 정본. models 테이블은 있으나 전이 기준 없음 | §5.3 models.status 상태기계 정의(deploys와 분리). 2인 승인 연동 | ▲ |
| G-06 eval-benchmark-protocol + domain-shift-validation | 카드별 고정 평가셋·층화(지역·계절·GSD)·업무 지표(필지 단위 정확도) + 이식 전 현지 표본 평가 게이트 | NIA 유효성 검증, ISO/IEC 25059. §10.3: E:\best.pt 지표 미확인. J2b '도메인 이식·검수 전' | `eval_sets` 테이블, deploys 상태기계 shadow 진입 조건에 'eval_set 통과' | ■ 1차 J1 실측 정의가 여기서 굳음 |
| G-07 drift-monitoring | 입력·예측·성능 분포 수집과 관제 드리프트 패널 | NIST AI RMF, AI 기본법 위험관리. THRESHOLDS는 프론트 규칙 데이터 | usage_events 옆 `model_stats(job, class_ratio, conf_hist, input_gsd…)`. 관제 §4 ② 패널 예약 | ▲ |
| G-08 gpu-mixed-scheduling (+gpu-sharing-llm-serving) | 추론·학습·LLM 서빙 공존(풀 분리·선점·MIG·VRAM 예산) | A6000×2에서 Ollama가 장당 23.4GB 점유 [실측]. §10.4: MIG 켜면 풀 GPU 재학습 불가 | §3.3 스케줄러 자원 모델에 `workload=infer/train/llm` 차원, config/pools.yaml에 llm 풀. GPU 전력 규칙(2장 동시 풀로드 금지, 메모리) 반영 | ■ 1차 시연 중 LLM 상주 여부 |
| G-09 llm-vlm-serving | LLM/VLM 서빙층(vLLM·Gemma 4·독파모·EXAONE, OpenAI 호환, 도구 호출) 아키텍처 편입 | 사용자 직접 요구. AGENT-SPEC은 있으나 §5 컴포넌트·API·스키마에 LLM 층 없음 | §5.1 컴포넌트도에 'LLM 서빙' 노드, §5.2 `/agent/*`, usage_events dim에 `tokens` | ■ 1차 AG-1 포함 여부 → §4 |
| G-10 llm-eval-guardrails | 항공영상 자체 평가셋, 환각 측정, 레드팀, 개인정보 필터 | 국정원 AI 보안 가이드북(2025-12, 15위협·30대책). Gemma 항공영상 벤치마크 미확인 | AGENT-SPEC 레드팀 20문 → `eval_sets(kind=llm)`. 30대책 매핑표 `AI-SEC-MAP.md` | ▲ |
| G-11 lineage-provenance(covered) + model-registry 서명 | 종단간 계보 유지 | 이미 설계됨 | G-01 dataset 버전만 보강 | — |

### 1-H. LLM 에이전트·생성형 AI 보안 — P0는 B-14·B-15·B-16·G-09·G-10으로 흡수. 추가 P0 없음. (P1·P2는 §2-H)

### 1-I. 실태조사 업무·행정 서비스 (P0 13건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| I-01 field-replacement-legal-basis | 조사 종류별 'AI 판독으로 현장조사 대체' 허용 조문 확인, 지침 개정안·규제샌드박스 경로를 과업에 포함 | 농지법 제54조, 부동산거래신고법 제17조, 공유재산법, 건축법 제79조 등 하위 지침이 현장 확인 전제. 지침 그대로면 대체율 KPI 달성 불가 | 신설 `LEGAL-BASIS-BY-SURVEY.md`(SURVEY-SPEC §1.1 9종 × 조문 × 대체 가능 판정). A-13 KPI 전제 | ■ 비전 문구 '현장조사 부분 대체'의 근거 |
| I-02 desk-closure-criteria | 필지별 책상 종결 vs 현장 필수 기준표(조사 종류·위반 유형·신뢰도 구간·표본 현장 비율), 버전 이력 | 감사·이의신청에서 '왜 안 갔나' 설명 필요. 행정기본법 적법성·투명성, 사람 감독 원칙 | SURVEY-SPEC §5 규칙 엔진에 `closure_rules(version)`. Q-1 의심 목록에 '종결 사유' 열 | ■ 대체율·비용 산식의 분모·분자 |
| I-03 survey-violation-rulebook | 조사 종류별 위반·이용 유형 코드, AI 클래스→위반 유형 매핑, 예외 | 법정 조사 결과 유형 코드 없이는 부처 시스템 입력 불가. E-05는 지목·피복만 | SURVEY-SPEC §5 R-* 규칙 출력에 `violation_code`(부처 코드표 참조). `CLASS-CROSSWALK.md`에 3번째 매핑 | ▲ 1차 카드 1종(농지)만 |
| I-04 survey-type-workflow-catalog | 조사 종류별 표준 흐름(계획→대상 추출→조사→검증→확정→조치→보고), 주기·주체·산출물 | 범부처 통합조사가 사업 핵심. SURVEY-SPEC §1.1 표는 담당 부서까지, 흐름도 없음 | SURVEY-SPEC §1에 '1.2 종류별 흐름도' 신설안. I-01 문서와 1:1 | ■ 카드 이식이 업무 수준에서 성립하는 조건 |
| I-05 survey-target-extraction | 조사계획 객체, AI 의심 필지→조사 목록 생성, 우선순위 규칙 | 전수조사→AI 선별 후 현장이 효과의 원천 | SURVEY-SPEC §3 `survey_plans`, `targets(priority_score, reason)`. Q-1 화면이 이 객체를 읽음 | ▲ 1차 Q-1은 정적 목록 |
| I-06 parcel-register-reconciliation | 토지대장·농지대장·건축물대장·지적도 × AI × 시계열 대조, 필지별 판정 이력, 공부 갱신 주기 | 판정='공부상 지목·용도와 현황 불일치'. 대조 대상은 KRAS·KLIS·세움터 최신본 | SURVEY-SPEC §3 parcel_facts에 `register_snapshot_at`, 건축물대장 열. E-02·E-03·E-11 연동 | ▲ 1차는 지목만 |
| I-07 field-verification-state-machine | 필지 단위 상태(추론/현장 대기/현장 완료/확정/이의)·판정자·근거, 이중 확정 방지 | 행정조치·상급 보고 근거. SURVEY-SPEC §2.4에 있으나 기관 담당자 확정 전이·판정자 서명 부족 | SURVEY-SPEC §2.4 보강: `confirmed_by`, `confirmed_at`, 전이 권한 매트릭스(inspector/manager). F-02와 한 표 | ▲ 상태기계 보강 |
| I-08 mobile-field-app + offline-field-sync | 현장 앱 제품 정의(필지 지도·의심 표시·조사표·길찾기) + 오프라인(관할 타일·필지·조사표 사전 다운로드, 재접속 동기화·충돌 해결) | 앱 없으면 종이 조사표 재입력 → 대체율·절감 효과 소멸. 농지·산지 통신 음영 흔함 | SURVEY-SPEC §4.4 M-1을 '현장 앱 제품 정의(PWA vs 네이티브)'로 확장. `sync_queue`, 충돌 규칙(last-writer/manager-wins). B-11 단말 보안 | ■ PWA/네이티브·1차 범위 → §4 Q4 |
| I-09 gps-photo-evidence | GPS·방위·촬영시각 현장 사진, 해시, 필지 경계 안 촬영 검증 | 처분·이의 대응 증거력. 조사원 위치 수집은 위치정보법 검토(I-P1) | SURVEY-SPEC §3 `field_photos(sha256, lat, lng, heading, taken_at, in_parcel)`. M-1 카메라 흐름 | ▲ 스키마 |
| I-10 cross-survey-consolidated-visit | 동일 필지 다중 조사 병합(한 번 방문·다중 조사표), 부처별 결과 분배, 공유 가능 항목 판정(개인정보 목적 외 이용) | 비전 '부처 개별 조사를 통합·일괄'의 실체. 시연 화면(통합조사 시뮬레이터)만 있음 | SURVEY-SPEC §2에 '2.5 병합 규칙', targets에 `survey_types[]`. 개인정보 보호법 제18조 판정은 PRIVACY-PKG | ■ 비용 절감 주된 근거 |
| I-11 e-approval-integration | 기관 전자결재 연계(조사계획·결과보고·조치안 상신, 결재선·위임전결) | 행정업무 운영 규정상 공문 효력. 문서의 '결재'는 LX 내부 2인 승인뿐 | E-01 연계 목록 행(온-나라·지자체별). SURVEY-SPEC §2.4 `action.approval_ref`. 조사 화면에 '결재 상신' 버튼 자리 | ▲ 1차는 '결재 대기' 상태만 |
| I-12 official-document-generation | HWP/HWPX 기관 서식 공문·결과보고서(지도·통계·사진 첨부, 문서번호) | 지자체 산출물은 HWPX(KS X 6101)가 표준 관행. CSV·화면 보고서로는 결재 불가 | SURVEY-SPEC §4.6 보고서 3종에 HWPX 출력 경로. `/reports/{id}.hwpx` 라우트 예약. '3클릭 보고서'(§3.4) 목표와 결합 | ▲ 1차 PDF, HWPX 2차 |
| I-13 e-approval·official-doc 전제: org-role-approval-line(P1 격상 검토) | 기관 내 부서·직위·결재선·위임전결 모델 | tenant realm만으로 '조사원 입력·팀장 확정·타 부서 열람' 표현 불가 | F1-CONTRACT §6 tenant_users에 `dept`, `position`, `approval_line_id`. RBAC(P1)와 함께 | ▲ 필드 |

### 1-J. 플랫폼 인프라·SRE·가용성·배포·과금 (P0 11건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| J-01 slo-sli-error-budget | 서비스별 SLI/SLO(가용률·지연·작업 완료율), 측정 창, 에러 예산 | SLA·경보 임계·이중화 수준의 근거. §5.5는 p95 목표만 | §5.5 성능 예산 표를 'SLO 표'로 개명·확장(가용률, 작업 성공률 열). 관제 §4 ② SLO 패널 | ▲ 표 확장 |
| J-02 control-plane-ha | 게이트웨이 다중 인스턴스+LB, PostgreSQL 복제·자동 페일오버, Redis Sentinel | 제어평면 전부 단일. 2023 행정전산망 장애 뒤 이중화 강화 방침 | §5.5 Phase 2 배치 표에 'HA 구성' 행. §5.1 컴포넌트도에 복제 표시 | △ Phase 2, 설계만 1차 |
| J-03 backup-policy + restore-drill-pitr | 백업 대상·주기·보존·암호화·원격지(3-2-1) 표, WAL 아카이빙·PITR, 정기 복원 시험 결과서 | 2025-09 국정자원 화재. 현 백업은 같은 PC D: 드라이브 | 신설 `BACKUP-DR.md`. R14 'RPO 24h/RTO 4h 3차'를 착수 전 정의로. 경보 '백업 실패' 옆 '복원 시험 미실행' | ■ 1차 원본·결과가 이미 단일 디스크(E:) |
| J-04 dr-site (=system-grade-dr) | 정보시스템 등급 분류, 원격지 DR, 전환·복귀 절차, 연 1회 훈련 | 행정기관 정보시스템 운영 지침 재해복구, ISO 22301 | `BACKUP-DR.md` §2. A-12 호스팅 결정 후 사이트 지정 | △ 등급 판정만 1차 |
| J-05 alert-routing-oncall + incident-management | 경보 수신 채널·에스컬레이션·ack 시한·당직, 장애 등급(Sev)·대응 조직·기관 통보·포스트모템 | §10.2 요구4 스스로 '경보 받는 곳 미정' 지적. ITIL·SRE 관행 | §4 관제에 '⑥ 장애 대응' 절 신설안. config/alerts.yaml에 `route`, `severity`. `INCIDENT-PLAYBOOK.md` | ▲ alerts.yaml 필드 |
| J-06 load-performance-test | 부하 시나리오(세션 200→2,000·타일 p95·큐 포화·SSE 동시)·도구·합격 기준·결과서 | RFP PER/TER, 감리 성능시험 결과서. bench는 GPU 칩/s만 | §7 판정 방식에 '성능 시험' 행 추가. `PERF-TEST-PLAN.md` | ▲ 1차 계획서만 |
| J-07 metering-billing-settlement | 단가표(GPU·h·GB·km²·egress)·월 정산서·계량 대사·기관 청구 | LX가 기관에 대가를 받는 흐름. usage_events 계량은 있고 금액이 없음 | F1-CONTRACT §4.8 quotas 옆 `price_list`, `invoices`. 관제 §4 ③ '정산' 탭 예약 | ▲ 테이블 |
| J-08 tenant-lifecycle-provisioning | 기관 생성·개통(CI·프로파일·쿼터·계정·포털)→변경→해지(데이터 반환·파기 증명·계량 마감) 자동화 | X2③ 스스로 지적. 개인정보 보호법 제21조 파기 증명 | 관제 §4 ③에 '기관 생성' 조작(PRODUCE 6단계 자동화). `tenants.status(active/suspended/closed)`, 해지 절차서 | ▲ 상태 필드·조작 자리 |
| J-09 ci-cd·env-separation | (B-17에 흡수) | | | |
| J-10 hosting·network | (A-12·B-02에 흡수) | | | |
| J-11 performance-capacity-sizing(P1 격상 검토) | TTA HW 규모산정 지침 기준 CPU·메모리·스토리지·GPU 산정서, GPU=작업량×처리량 | A100 조달 심의 근거. §5.5는 확장 경로만 | `COST-BASIS.md` §HW. bench/throughput.py 실측(26칩/s/GPU)을 입력으로 | ■ A-05와 함께 |

### 1-K. UX·접근성·대국민 포털 (P0 6건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| K-01 web-accessibility-kwcag (=kwcag-certification) | KWCAG 2.2 33항목 × 화면 대조표, 인증 기관·일정, 자동/수동 점검 체계, 갱신(1년) | 장애인차별금지법 제21조, 지능정보화기본법 제46조. R14 '3차'와 C-41 '접근성 에픽 없음' | 신설 `A11Y-PLAN.md`. §7 판정 루브릭에 '접근성' 행. §8.1 1차 완료 기준에 'axe 0 위반' | ■ 1차 화면을 인증 불가 구조로 굳히면 재작업 |
| K-02 map-text-alternative | 지도·WebGL 정보의 동등 경로(필지·읍면동 목록/표 뷰, 결과 요약문, 차트 데이터 표) | KWCAG '대체 텍스트·표·선형구조'. 지도형 서비스의 상습 지적 지점 | XI맵 §3에 'V9 목록으로 보기'(동사 추가 아닌 대체 뷰) 또는 결과 패널 표 모드. stats-standard에 데이터 표 토글 | ▲ 결과 패널에 표 모드 자리 |
| K-03 cinematic-media-a11y | 필름 14레그·스캔 스윕·잉크 반전의 정지·건너뛰기·자막·시간 조절, 깜빡임 한도 | KWCAG '자동 재생 금지·정지·응답시간·깜빡임' | §6.4 모션 문법에 '건너뛰기·정지 버튼 필수' 규칙. 필름 컴포넌트 props | ▲ 1차 필름 자체가 심사 대상 |
| K-04 responsive-mobile-web | 모바일 브레이크포인트·터치 제스처·모바일 성능 티어(대국민·기관 열람) | 모바일 전자정부 서비스 관리지침, 웹사이트 품질관리 지침. 1280 데스크톱 우선만 | §6.3 토큰에 브레이크포인트, §3.1 8동사의 터치 대응표 | ▲ 1차 390px 시연 1컷 |
| K-05 public-portal (+ gov-standard-footer P1) | 게스트 공개 모드 이상의 정식 공개 서비스(공지·FAQ·문의·활용사례 CRUD, 표준 푸터·처리방침·이용약관) | 공공데이터법 제공 의무, 개인정보 보호법 제30조(처리방침 없으면 개통 불가). §10.6 결손 인정 | §2 사이트 지도 '게스트' 레일에 notices/faqs/inquiries/usecases API·표. 푸터 컴포넌트 | ▲ 처리방침 페이지는 1차에도 있어야 |
| K-06 citizen-reporting | 시민 신고·제보(위치·사진, 비회원/간편인증, 처리 회신) | 민원처리법 처리기한·회신, 국민신문고 연계 관행. 현 신고는 기관 사용자 오탐 신고만 | §2 게스트 레일 'report' 화면. `/public/reports` API. I-P1 모더레이션·신고자 보호와 묶음 | △ 2차, 1차는 화면 자리만 |

### 1-L. 글로벌·ODA·수출 (P0 9건)

| ID | 무엇 | 왜(근거) | 어디에 | 1차 |
|---|---|---|---|---|
| L-01 oda-financing-delivery-modes | 재원별(KOICA 무상·EDCF 유상·MDB) 납품 단위(SaaS 구독/현지 설치 라이선스/구축+이전)와 모듈별 가격 구조 | WB·ADB 조달규정, EDCF 구속성, KOICA PMC 구조. 재원마다 조달 규정 다름 | 신설 `GLOBAL-DELIVERY-MODELS.md`. J-07 단가표에 '해외' 열. A-04 ISMP의 글로벌 장 | ■ F1-D 시연이 어느 납품 형태를 보여 주는지 |
| L-02 airgap-onprem-installer (+onprem-offline-package) | 에어갭 설치본(이미지 미러·모델·PMTiles 번들·서명 업데이트·오프라인 라이선스) | 수원국 폐쇄망·데이터 국외 금지. 국내 폐쇄망 반입도 보안적합성 검증 | §5.5에 '배포 형태: SaaS / 설치형' 열. `INSTALLER-SPEC.md`. P12 벤더링 전제 | ▲ 1차는 설치본 요건만 |
| L-03 data-sovereignty-residency (+data-residency-*) | 테넌트별 저장 위치 지정, 소유권·반환·파기 조항, LX 학습 재사용 범위 합의 | 인도네시아 PP71/2019, 베트남 Decree 53/2022, MDB 성과물 소유 원칙 | tenants에 `residency_region`, `data_owner`, `reuse_consent`. J-08 해지 절차와 연동 | ▲ 필드 |
| L-04 local-crs-datum-transform | 현지 측지계 레지스트리·변환 파라미터·격자 보정·등적 면적 계산 | LX 키르기스 ODA가 '세계측지계 전환'. 면적 source는 EPSG:5186 고정 | tenants.crs를 `{horizontal, vertical, area_projection, transform_id}`로. F1-CONTRACT 면적 봉투 source 규칙 | ▲ 스키마 |
| L-05 satellite-procurement | 상용 초고해상도 조달·촬영 요청·사용권 범위(기관·기간·파생물) 관리, CAS500 경로 | 해외는 위성이 주 데이터. Maxar CC BY-NC는 시연 한정, CAS500 미확보 | imagery에 `license_scope(beneficiaries, term, derivatives)`, `tasking_request_id`. §3.2 사다리 '상용' 단 | ▲ 필드 |
| L-06 capacity-building-lms | 교육 테넌트·샌드박스·현지어 교재·강사 양성·수료 평가 | LX 해외사업 대부분이 역량강화. OECD DAC 지속가능성 | tenants.kind에 `training`. §2 사이트 지도 '교육' 레일 예약 | △ |
| L-07 local-model-adaptation-labeling | 현지 라벨링·전이학습·현지 정답 게이트 통과 후 카드 배포, 센서·GSD 적합성 선언 | 국내 cm급 모델은 해외 위성에서 성능 미보장(X3·J5 '성능 미확인') | G-06 게이트의 해외 판. deploys에 `region_eval_ref` 필수 | ▲ 게이트 조건 |
| L-08 land-admin-domain-model | ISO 19152 LADM·FFP 토지행정 모델, 연속지적 구축 지원 카드 | LX 해외 수주 중심은 지적·토지정보(에티오피아·방글라데시·탄자니아·키르기스) | 카드 목록에 `card-global-cadastre`(LADM Party/RRR/SpatialUnit). SURVEY-SPEC 해외 장 | △ 2차 카드, 1차 카드 목록에 자리 |
| L-09 sustainability-handover-om | 운영 이관·유지보수·현지 헬프데스크 SLA·수원국 TCO | OECD DAC, KOICA 사후관리. infra.js 원가는 LX 측만 | `GLOBAL-DELIVERY-MODELS.md` §TCO. A-11 SLA 해외 판 | △ |

### 1-Σ. P0 요약 — 착수 전 '결정'(■) 22건

| 순서 | 결정 | 관련 ID |
|---|---|---|
| 1 | RFP 원문 확보·요구사항 ID 체계 수립·과업 기준선 확정 | A-01 A-02 A-09 |
| 2 | 재원·발주 단위·사업비 구성(ISMP 골격, FP+HW+비SW) | A-04 A-05 J-11 |
| 3 | 형상관리(git) 도입 + CI/CD·환경 분리 | A-06 B-17 |
| 4 | 표준프레임워크 적용 구간 판정 | A-10 |
| 5 | 운영 호스팅 모델(IDC/CSAP/공공클라우드) | A-12 |
| 6 | 망 구성도·N2SF 등급표·외부 호출 경로·터널 대체 | B-02 B-03 B-04 |
| 7 | 보안성 검토 패키지·보안 책임 조직 | B-01 B-12 |
| 8 | 개인정보 위탁 구조·PIA 대상 판정·지적전산자료 이용 승인 | B-13 C-01 C-06 |
| 9 | 가림 목록 격리·파생 산출물 PII 스크럽(즉시) | B-18 |
| 10 | 가림 파이프라인·원천 권리 확정('LX 보유' 문구) | D-01 D-05 |
| 11 | 생성형 AI 보안 기준·LLM 층 1차 포함 여부·GPU 혼합 정책 | B-14 G-08 G-09 |
| 12 | AI 기본법 고영향 판정·결과 법적 지위·계약 합격선 | F-01 F-02 F-03 |
| 13 | YOLO AGPL 판정 | F-04 |
| 14 | 평가셋·이식 게이트(J1 실측 정의) | G-06 |
| 15 | 현장조사 대체 법령 근거·책상 종결 기준·통합조사 병합 규칙·조사 흐름도 | I-01 I-02 I-04 I-10 |
| 16 | 현장 앱 형태(PWA/네이티브)와 1차 범위 | I-08 |
| 17 | 백업·DR 기본(단일 디스크 탈출) | J-03 |
| 18 | KWCAG 인증 계획(1차 화면 구조) | K-01 |
| 19 | 연계 인터페이스 목록(SIR 원천) | E-01 |
| 20 | 해외 납품 형태 | L-01 |

---

## §2. P1 · P2

형식: `key` — 한 줄(무엇 · 들어갈 곳). P1은 2차(운영화) 착수 전, P2는 3차·확산 전. 병합된 동의어는 괄호.

### 2-A. 사업관리·발주·계약·예산

**P1**
- `feasibility-review` — 예타 대상 판정(재원 구조별: 국가재정법 §38 / 공공기관운영법 §40) · ISMP-OUTLINE
- `total-project-cost-management` — 총사업비 관리 대상 판정·조정 절차 · ISMP-OUTLINE
- `spatial-db-survey-cost-basis` — 측량·정사·DB 구축·라벨 가공 대가(비SW) · COST-BASIS
- `pmo-project-management` — WBS·위험·이슈·주간/월간 보고·하도급 · PMO-PLAN
- `steering-governance-body` — 추진위·수요기관 협의체·기술자문단 · PMO-PLAN
- `sw-procurement-rules` — 상용SW 분리발주·영향평가·대기업 참여 제한·과업 변경 심의 · PROCUREMENT
- `gs-certification` — GS 1등급(XI맵·카드 런타임·관제 패키지) · CERT-PLAN
- `digital-service-procurement-channel` — 디지털서비스 전문계약·종합쇼핑몰·혁신제품 · PROCUREMENT
- `multi-year-contract-phasing` — 장기계속계약·차수별 검수와 Phase 0/1/2 연결 · §8
- `rfp-evaluation-package` — 협상에 의한 계약·평가 배점·BMT 여부 · RFP-CROSSWALK
- `ea-info-resource-registration` — 범정부 EA 등록·중복 검토(V-World·KLIS·디지털트윈국토) · ISMP
- `lx-legal-mandate-market` — 한국국토정보공사법 업무 범위·민간시장 영향 · ISMP
- `national-spatial-plan-alignment` — 국가공간정보 기본계획·시행계획 반영 · ISMP
- `gov-ai-common-infra-gpu-dedup` — 범정부 AI 공통기반 대비 자체 GPU 도입 근거 · COST-BASIS
- `hw-procurement-channel` — HW 조달 경로·규격 중립·납기 리스크 · PROCUREMENT
- `bidder-license-qualification` — 측량업·공간정보사업자·SW사업자 참가자격 · RFP
- `contract-law-procurement-agency` — 적용 계약법령·조달청 계약요청·사전규격 공개 · PROCUREMENT
- `ict-construction-separate-order` — 전산실·전력 공사 분리발주·정보통신공사 감리 · PROCUREMENT
- `leak-prohibited-info-contract-clause` (=`nondisclosure-info-designation`) — 누출금지 대상정보 목록·위약금 · SEC-REVIEW-PKG
- `quality-assurance-plan` — ISO/IEC 25010 목표·정적분석·결함 밀도 · QA-PLAN
- `dev-standards-guide` — 개발표준정의서(다수 개발사 공용) · DEV-STANDARDS
- `test-acceptance` — 인수·성능·제3자 시험 체계 · §7
- `ip-ownership` — 산출물 지재권 귀속·수출·이식 권리 · CONTRACT
- `transition-migration` — landxi7·기존 데이터 이관·시범·병행 운영 · §8
- `impact-evaluation-design` — 성과 입증 평가(전후·대조군·독립 평가) · KPI-FRAMEWORK
- `ai-performance-maintenance-obligation` — 운영 중 AI 성능 임계 미달 시 재학습 의무·비용 주체 · SLA-SLM
- `agency-onboarding-agreement` — 수요기관 가입·협약·위탁 단가·해지 반환 · TENANT-ONBOARDING
- `data-sharing-agreements` — 기관 간 데이터 제공 협약 이력 · DATA-GOVERNANCE

**P2**
`training-tech-transfer`, `consortium-subcontract-structure`, `appropriate-project-duration`, `contract-guarantees-penalties`, `sw-project-info-submission`, `post-project-performance-evaluation`, `rnd-funding-results-management`, `source-escrow-handover`, `remote-dev-approval`, `commercial-product-bmt`, `domestic-ai-chip-policy`, `hw-kc-conformity-certification`, `green-sme-mandatory-purchase`, `sw-safety-applicability`, `vendor-process-certification`, `design-build-separate-ordering`, `program-copyright-patent-filing`, `sw-asset-license-audit`, `national-core-infra-designation`, `security-budget-share`, `unit-cost-finops`, `egov-performance-reporting`, `user-council-governance`

### 2-B. 보안 거버넌스·시스템 보안

**P1**
- `cc-security-function` — CC 인증·보안기능 확인서·보안적합성 검증(자체 구현 인증·RLS 포함) · CERT-PLAN
- `csap-cloud` (`security-certs`) — CSAP 등급 판정·행정기관 클라우드 이용 기준 · A-12 결정 후
- `secure-coding` 후속 `system-hardening-baseline` — KISA 취약점 분석 가이드 기준 하드닝 · §5.6
- `security-monitoring-logs` / `soc-incident-response` — 보안 이벤트 관제·사이버안전센터 연동·유출 신고 · §4 ⑥
- `audit-log-integrity` — 해시 체인·WORM·별도 로그 서버 · §5.6
- `session-token-hardening` — HttpOnly 쿠키, URL 토큰 금지(SSE access_token 쿼리), 동시접속·유휴 만료. **§5.6과 F1-CONTRACT §3이 서로 모순(쿠키 vs localStorage)** · F1-CONTRACT 개정
- `rbac-least-privilege` — 부서·지역 범위 권한·권한 결재 · F1-CONTRACT §3
- `account-lifecycle-password-policy` — 승인 가입·인사 연동 말소·복잡도·잠금·휴면 · §10.6 결손 표
- `secrets-key-management` (`secrets-cert-mgmt`) — Vault·키 순환·서명키 분리·인증서 자동 갱신 · §5.6
- `oss-license-sbom` / `supply-chain-sbom` — SBOM·의존성 라이선스·CDN 제거 · LICENSE-LEDGER
- `model-supply-integrity` / `artifact-integrity-supplychain` — 가중치 서명·safetensors·스캔 · G 레지스트리
- `upload-malware-cdr` — 업로드 파일 악성코드·CDR · P 파이프라인 첫 단계
- `physical-security-zones` — 전산실 보호구역·출입·CCTV · A-12 후
- `media-sanitization-disposal` — 매체 완전삭제·용역 종료 회수 확인서 · VENDOR-SEC
- `vendor-dev-security` / `dev-genai-tool-policy` — 외주 보안서약·원천 반입 통제·외부 AI 코딩 도구 입력 금지 · VENDOR-SEC
- `threat-modeling-security-design` — STRIDE·LINDDUN 구성요소별 · SEC-REVIEW-PKG
- `file-integrity-webshell-antimalware` — FIM·웹셸·서버 백신 · §5.6
- `security-privacy-awareness-training` — 취급자 교육 이수↔권한 연동 · TRAINING
- `service-zero-trust-mtls` — 서비스 간 mTLS·서비스 계정 · §5.1
- `llm-tenant-context-isolation` — vLLM prefix/KV 캐시·어댑터 테넌트 분리 · AGENT-SPEC
- `insider-misuse-detection` — 비정상 대량 조회 규칙·소명 · access_log 위
- `export-download-control` — 반출 승인·워터마크·대량 요청 탐지 · §4.1
- `foreign-personnel-access-control` — 외국인 인력 접근 승인 · SEC-ORG
- `client-side-sensitive-cache` — 타일·결과 브라우저 캐시 금지·로그아웃 삭제 · 프론트 규칙
- `isms-org-cert` — ISMS-P/27001 범위 편입 · CERT-PLAN
- `rate-limit-noisy-neighbor` / `api-abuse-protection` — 요청률 제한·WAF·DDoS · §5.2
- `catalog-metadata-disclosure` — Capabilities·STAC·오류 응답의 등급별 메타 필터 · E-07
- `imagery-evidence-authenticity` — 반입 영상·민원 사진 위변조 탐지, 생성 영상 C2PA 표시 · SURVEY-SPEC
- `llm-output-handling` — 답변 마크다운·링크·지도 명령 무해화 · AGENT-SPEC §3.5
- `model-classification-inheritance` — 공개제한 원천 학습 모델·임베딩의 등급 상속 · D 등급표
- `foreign-origin-model-risk` — 모델 원산지(딥시크 사례) 허용 목록 · AGENT-SPEC
- `inbound-agent-delegation-auth` — 외부 공공 AI 에이전트의 위임 인증·범위 · AGENT-SPEC AG-9
- `agent-sql-code-sandbox` — 에이전트 SQL·코드 실행 격리(읽기 전용 역할·RLS 강제) · AGENT-SPEC
- `pipa-cross-border-transfer` — 국내 개인정보 국외 이전 통제(해외 허브·외부 API) · PRIVACY-PKG

**P2**
`ciip-designation-review`(=`ciip-designation-check`), `annual-security-privacy-audit`(=`-evaluation`), `oob-bmc-management-security`, `gpu-worker-residual-data`, `vision-adversarial-evasion`, `document-drm-screen-watermark`, `log-pii-minimization`, `cyber-crisis-drill`, `email-sender-authentication`, `legal-hold`, `zero-trust-user-device`, `drone-equipment-security`, `vuln-disclosure-channel`, `agent-memory-governance`, `model-privacy-attack-test`, `classification-marking-propagation`, `aggregation-sensitivity-review`, `model-extraction-protection`, `server-firmware-boot-integrity`, `hw-supply-chain-origin-check`, `ai-redteam-eval`, `crypto-local-regulation`, `gov-domain-cert`

### 2-C. 개인정보

**P1**
- `privacy-safeguards-logs` — 권한 변경 기록 3년·다운로드 사유 확인·취급자 관리 · access_log
- `pii-file-registration` (=`personal-info-file-registration`) — 개인정보파일 등록·공개 · PRIVACY-PKG
- `rrn-unique-id-minimization` — 주민번호 미수집·연계 필드 화이트리스트 · E-02 연계 스키마
- `field-worker-location-info` (=`location-info-act-compliance`, `location-info-consent`) — 조사원·시민 위치정보법 동의·목적 제한·보존 · SURVEY-SPEC M-1
- `training-data-pseudonymization` — 학습데이터 가명처리·반입 검수 · G-01 매니페스트
- `data-subject-rights-handling` — 열람·정정·삭제·처리정지 10일 처리 · PRIVACY-PKG
- `third-party-provision-ledger` — 목적 외 이용·제3자 제공 대장·게재 · PRIVACY-PKG
- `portal-content-privacy-scan` — 게시판·첨부 개인정보 노출 자동 탐지 · K-05
- `reporter-identity-protection` — 신고자 비공개·EXIF 제거 · K-06
- `raw-original-vault` — 가림·비식별 전 원본 보관소 접근 인가·보존·파기 · §5.6 ⑤ 확장
- `masking-inference-resistance` — 가림 흔적·다시점·해외 영상 대조 역추론 방지 · D-01

**P2**
`privacy-policy-notice`, `minor-user-consent`, `analytics-privacy-consent`, `privacy-blur-request`, `small-area-disclosure-control`(C-04에 흡수), `records-management`, `data-lifecycle-retention`

### 2-D. 공간정보 보안·법정 절차

**P1** `geo-data-classification`(D-01에 흡수), `public-survey-result-review`(공공측량 해당성·성과심사), `national-spatial-quality-inspection`, `overseas-tenant-isolation`, `spatial-security-review`(공개 심사 워크플로), `security-facility-list` 운영 절차
**P2** `drone-capture-permission`, `ngii-work-regulations-conformance`, `demo-sales-data-sanitization`(시연 데이터 비식별)

### 2-E. 연계·표준·데이터 거버넌스

**P1**
- 연계: `iljjapyeonri-realestate-register`(토지이용계획·건축물대장), `admin-info-sharing`(행정정보공동이용), `nsdi-portal-integration`, `gov-auth-integration`(B-07), `interface-monitoring-retry`, `sectoral-spatial-source-linkage`(팜맵·EGIS·임상도), `lx-national-platform-linkage`, `cadastral-resurvey-linkage`(지적재조사 지구·경계조정선), `national-basemap-update-feed`, `domestic-disaster-data-linkage`, `ministry-system-integration`, `geocoding-address`, `raster-coverage-service`(WCS/Coverages)
- 표준: `feature-catalogue-iso19110`, `data-product-spec-iso19131`, `persistent-feature-identifier`(UFID), `area-computation-standard`, `vertical-datum-geoid`, `national-statistical-grid`, `crs-transform-policy`, `export-formats-interop`(SHP·GPKG·CP949), `delivery-format-standard-fallback`, `applied-standards-profile`(적용 표준 목록표), `standards-conformance-testing`(OGC CITE), `spatial-standards-interop`, `ladm-igif-global`(L-08)
- 거버넌스·품질: `db-standardization`(공통표준용어), `admin-standard-org-code`(기관코드 slug 대체), `reference-master-data`(법정동코드 버전), `ingest-validation`, `metadata-auto-extraction`, `ai-training-data-quality`, `catalog-discovery-records`, `open-api-developer-portal`, `open-data-publication`(=`open-data-api`), `public-data-provision-request`, `kogl-attribution`, `data-freshness-sync-policy`(E-11), `records-retention`, `data-residency-sovereignty`(L-03), `training-data-rights`(AI Hub 반출 조건)

**P2**
`public-data-std-db`, `ogc-api-processes`, `lineage-provenance-standard`(PROV), `api-versioning-policy`, `3d-digital-twin-standards`, `event-webhook-integration`, `tile-matrix-korea`, `ml-data-model-metadata-standard`(TrainingDML-AI), `public-data-quality-certification`, `data-usage-statistics`, `data-error-report-correction`, `gazetteer-place-names`, `national-point-number`, `data-zone-publish-workflow`, `legacy-proprietary-format-ingest`(ECW·TFW), `map-sheet-index-standard`, `tile-generalization-fidelity`, `style-symbology-interop`, `metadata-crosswalk-dcat`, `marine-coastal-data-linkage`, `dggs-global-aggregation`, `researcher-data-access-zone`, `public-openapi-guideline-conformance`, `agent-data-tool-interface`, `law-info-api-linkage`, `land-price-transaction-linkage`, `real-property-registry-linkage`, `public-property-register-linkage`, `weather-data-linkage`, `pointcloud-lidar-standard`, `external-catalog-federation`, `ngii-feature-code-alignment`, `saeol-integration`, `data-based-admin-act`, `public-data-open`

### 2-F. AI 거버넌스·신뢰성

**P1** `ai-security-reliability`(30대책 매핑·TTA CAT), `ai-governance-certification`(ISO 42001·23894), `explainability`, `uncertainty-calibration`, `bias-performance-report`, `model-card-standard`, `human-oversight`(I-07과 통합), `ai-incident-result-recall`, `result-reprocessing-version-policy`(backfill·통계 단절 표기), `inference-determinism-reproducibility`, `postprocess-pipeline-versioning`, `ai-transparency-public`
**P2** `cadastral-display-disclaimer`(K), `recipient-ai-regulation`(L)

### 2-G. MLOps

**P1** `spatial-split-leakage`, `label-taxonomy-guideline`, `assisted-active-labeling`, `feedback-triage-loop`, `retrain-automation`, `sample-audit-design`, `promotion-gate-criteria`, `rs-foundation-model`, `preprocessing-train-serve-consistency`, `inference-input-ood-gate`, `training-chip-dataloader-pipeline`, `label-exchange-format-standard`, `geo-annotation-tool`, `weak-label-admin-data`, `llm-agent-task-eval-selection`, `rag-corpus-lifecycle`, `rag-retrieval-eval`, `byom-model-onboarding`, `mlops-stack-selection`, `export-packaging`, `model-regression-test-suite`, `multi-model-serving-residency`, `national-batch-inference-campaign`(=`national-batch-campaign`), `training-data-withdrawal-unlearning`, `eval-independence-contamination`, `pseudo-label-self-training-control`, `llmops-tracing`, `training-data-datasheet`
**P2** `hpo`, `peft-finetune`, `inference-optimization`, `gpu-usage-metering`, `ml-dev-workspace`, `embedding-vector-store`, `fm-pretraining-corpus-curation`, `geo-vlm-instruction-data`, `augmentation-synthetic-data-policy`, `labeling-workforce-productivity`, `model-retirement-archive`, `ai-energy-carbon-reporting`, `cross-card-result-fusion`, `input-profile-model-routing`, `federated-privacy-preserving-training`, `edge-ondevice-inference`, `mlops-maturity-roadmap`, `continual-learning-forgetting`, `fm-distillation-compact-model`, `cascade-screening-inference`, `llm-preference-alignment-data`, `training-reproducibility-drill`, `geo-feature-store`, `public-benchmark-challenge`

### 2-H. LLM 에이전트(§2-B의 LLM 보안 항목 외)

**P1** `llm-logging-audit`, `llmops-tracing`, `llm-serving-slo-capacity`(TTFT·동시 대화·KV 예산), `multilingual-llm-local-language`
**P2** `agent-helpdesk-assistant`, `public-ai-assistant-channel`, `country-legal-rag-corpus`, `field-capture-assist`(음성 받아쓰기 로컬 추론)

### 2-I. 실태조사 업무·행정 서비스

**P1**
- 절차·법정: `field-survey-legal-procedure`(사전통지·조사원증·결과통지), `electronic-service-of-notice`(송달·공시송달), `statutory-deadline-management`(의견제출 10일·사전통지 7일·이행강제금 주기), `voluntary-correction-guidance-stage`(계도·자진시정·청문), `notice-recipient-address-resolution`, `multi-owner-deceased-owner-handling`, `administrative-action-linkage`(처분·이의·정정 이력), `compliance-followup-monitoring`(이행 확인 재판독), `non-tax-revenue-linkage`(세외수입), `inter-department-referral`(이첩), `cadastral-ledger-correction`(지목변경 60일·직권 정리), `statutory-management-register`(법정 대장), `inter-agency-doc-distribution`(문서유통), `litigation-evidence-package`, `foia-disclosure-response`, `survey-reference-date-currency`
- 현장: `survey-form-builder`, `field-assignment-dispatch`, `field-survey-qa-resurvey`, `field-gnss-accuracy`(RTK/VRS), `cadastral-survey-referral`(지적측량 의뢰=LX 본업 연결), `on-demand-drone-tasking`, `gov-mobile-app-registration`(=`mobile-egov-app-compliance`, `public-app-registration`), `surveyor-workforce-credentialing`, `lx-branch-field-operations-model`(지사 위탁 대행)
- 업무·조직: `configurable-workflow-engine`(기관별 절차 노코드), `caseworker-worklist`(내 업무함), `org-role-approval-line`(I-13), `civil-complaint-integration`, `notification-channels`, `admin-statistics-rollup`, `ministry-system-integration`, `cost-saving-calculator`, `field-truth-feedback-loop`, `training-program`, `manuals-docs`, `helpdesk-itsm`, `pilot-bpr-rollout`, `impact-evaluation-design`

**P2**
`field-worker-safety`, `messaging-sender-compliance`, `official-statistics-approval`, `small-area-disclosure-control`, `paper-fallback-bcp`, `duty-handover-continuity`, `user-adoption-change-mgmt`, `agent-helpdesk-assistant`, `party-online-submission`, `owner-self-declaration`, `onsite-confirmation-signature`, `field-capture-assist`, `bulk-case-operations`, `cross-jurisdiction-parcels`, `field-trip-log`, `user-council-governance`, `egov-performance-reporting`, `visit-appointment-scheduling`, `gov-public-notification-channels`(국민비서·정부24), `subsidy-budget-execution-linkage`(e나라도움), `joint-evaluation-indicator-linkage`, `survey-workload-forecast`, `scheduled-report-subscription`, `practice-training-sandbox`, `internal-staff-messenger-alert`, `global-field-localization`

### 2-J. 플랫폼 인프라·SRE·배포·과금

**P1**
- 가용성·복구: `storage-durability-integrity`(이레이저 코딩·체크섬), `gpu-n-plus-one`, `business-continuity-plan`, `cold-start-recovery-order`, `tenant-granular-restore`, `soft-delete-object-versioning`, `graceful-degradation-priority`, `queue-backpressure-dlq`, `timeout-retry-circuit-policy`, `k8s-cluster-lifecycle`, `gpu-health-quarantine-burnin`, `backup-dr-security`
- 관측·운영: `central-logging-retention`, `runbooks`, `capacity-planning`, `scheduled-batch-ops`, `observability-meta-monitoring`, `rum-client-observability`, `production-readiness-review`, `ops-coverage-staffing`(24×365 여부·인력), `sla-om-organization`, `break-glass-support-access`, `time-sync-ntp`(=`trusted-time-sync`), `patch-vuln-mgmt`, `hw-facility-lifecycle`, `audit-deliverables`
- 배포·릴리스: `platform-zero-downtime-deploy`, `platform-ring-deployment`, `release-version-mgmt`, `db-schema-migration`, `artifact-registry-signing`, `feature-flags-kill-switch`, `iac-gitops`, `client-version-skew`, `stateful-major-upgrade-eol`, `perf-regression-gate`, `tenant-isolation-regression-tests`, `onprem-offline-package`(L-02)
- 테넌시·과금: `tenant-deployment-tiers`(공유/전용/설치형), `tenant-budget-fiscal-cycle`(회계연도·금액 상한), `rate-limit-noisy-neighbor`, `bulk-ingest-transfer`(매체 반입), `tile-delivery-cdn`, `llm-serving-slo-capacity`, `national-batch-campaign`, `gpu-sharing-llm-serving`(G-08)

**P2**
`distributed-tracing`, `status-maintenance-notice`, `db-operations`, `synthetic-monitoring`, `resilience-chaos-test`, `api-versioning-deprecation`, `service-catalog-cmdb`, `expiry-renewal-tracking`, `gpu-stack-compat-matrix`, `platform-phase-migration`, `unit-cost-finops`, `analytics-read-separation`, `catalog-storage-reconciliation`, `surge-burst-capacity`, `exception-tracking`, `ops-metrics-review-cadence`, `release-lts-fleet-support`, `autoscaling-onprem-limits`, `post-deploy-verification-auto-rollback`, `config-policy-validation`, `cross-store-write-consistency`, `supplier-back-to-back-sla`, `auto-remediation-guardrails`, `change-freeze-calendar`, `continuous-profiling`, `ipv6-readiness`, `gov-network-service-lines`, `cloud-native-policy`, `data-residency-global`

### 2-K. UX·접근성·대국민 포털·브랜드·다국어

**P1**
- 접근성: `zoom-reflow-contrast-modes`, `photosensitive-motion-safety`, `keyboard-map-operation`, `mobile-app-a11y`(KS X 3253), `imagery-overlay-contrast`(유리 패널 최악 배경 4.5:1), `pointer-gesture-alternatives`(WCAG 2.5.7/2.5.8), `async-status-announcements`(SSE·job-theater aria-live), `assistive-tech-test-matrix`(센스리더·NVDA·VoiceOver), `accessibility-statement-accommodation`, `ux-quality-ci-gate`(axe·시각 회귀·i18n 키), `digital-inclusion-channels`(디지털포용법 2026)
- 대국민·법적 고지: `gov-standard-footer-notices`, `web-quality-compat`(브라우저 매트릭스), `browser-device-compat`(행정망 VDI), `krds-alignment`(=`krds-ui-guideline`), `kogl-attribution`, `citizen-report-moderation`, `reporter-identity-protection`, `location-info-consent`, `portal-content-privacy-scan`, `public-web-performance`(LCP·전송량), `cadastral-display-disclaimer`(지적·AI 법적 효력 없음), `ugc-copyright-license`, `ai-transparency-public`, `portal-cms-content-ops`, `open-data-api`
- 브랜드·언어: `brand-architecture`, `design-system-docs`, `korean-language-act-naming`(한글 병기), `romanization-place-labels`, `korea-territory-naming-basemap`(동해·독도 해외 소스 검수), `i18n-full-global`, `modular-ia-consistency`
- 업무 UX: `onboarding-help`, `usability-testing-real-users`, `field-mobile-survey-app`(I-08), `map-measurement-tools`, `dsm-volume-change-4d`(4시점 DSM 체적), `reviewer-workbench-ux`, `digital-twin-3d`

**P2**
`accessible-documents`(PDF/UA·HWPX), `gov-website-launch-domain`, `minor-user-consent`, `error-prevention-recovery-ux`, `cartographic-print-output`, `thematic-symbology-standard`, `saved-views-personalization`, `collaborative-map-annotation`, `citizen-area-subscription`, `crowdsourced-validation`, `service-design-citizen-panel`, `disaster-public-mode`, `public-ai-assistant-channel`, `analytics-privacy-consent`, `control-room-exhibit-mode`, `launch-communication`, `font-license-redistribution`(Paperlogy 재배포), `legal-metrology-area-units`(평 병기), `accessible-authentication`, `domestic-foreign-resident-languages`, `field-ar-overlay`, `geo-literacy-education-content`, `tenant-context-switch-ux`, `tenant-theming-contrast-guard`, `public-video-caption-sign-language`, `kiosk-accessibility`, `gov24-citizen-channel-linkage`, `digital-twin-scenario-simulation`, `global-partner-user-research`, `complex-script-fonts`, `global-a11y-standard`(WCAG 2.2 AA·EN 301 549), `plain-language`, `satisfaction-analytics`, `public-auth-options`, `timeseries-public-archive`, `share-embed-seo`, `report-status-transparency`

### 2-L. 글로벌·ODA·수출

**P1**
- 사업 구조·규정: `mdb-procurement-safeguards`(ESF·SPS·청렴), `responsible-tenure-hria`(VGGT·인권 실사), `oecd-tied-aid-untying`, `dpg-lockin-avoidance`(DPG·GovStack·에스크로), `oda-project-cycle-deliverables`(Pre-F/S·F/S·PMC·R/D), `lx-oda-portfolio-reuse`(38+1국 성과 자산화), `oda-grievance-redress-mechanism`(GRM·SEP), `recipient-legal-institutional-reform`(KSP), `export-control-sanctions`(미얀마 시연 소재 재검토), `hardware-export-import-eligibility`(EAR·통관·면세), `kr-export-restriction-guard`(D-03), `cross-tenant-learning-consent`
- 데이터·기술: `sdg-geospatial-indicators`(11.3.1·15.1.1·15.3.1), `cloud-robust-sar-optical`, `satellite-preprocessing-ard`, `local-geodetic-control`(GCP·CORS), `global-open-baseline-data`(버전 고정), `global-landcover-taxonomy-lccs`, `legacy-cadastre-digitization`, `oss-land-admin-interop`(SOLA·STDM·Cadasta), `multinational-tenant-hierarchy`, `federated-ops-offline-metering`, `ogc-interoperability`, `local-privacy-law`, `partner-identity-integration`, `partner-data-ingest-qa`, `low-resource-infra`, `global-field-verification`, `area-estimation-accuracy`(Olofsson 오차행렬), `disputed-boundary-policy`, `i18n-l10n-full`, `country-config-pack`, `airgap-license-activation`, `recipient-site-readiness-assessment`, `local-aerial-survey-permit`, `multilingual-llm-local-language`
- 운영·보안: `sovereign-telemetry-minimization`, `cross-border-incident-coordination`, `overseas-node-backup-dr`, `local-partner-enablement`(P2 격상 검토)

**P2**
`timezone-calendar`, `multicurrency-pricing`, `oda-results-framework`, `report-localization-official`, `presales-country-profile`, `intl-disaster-linkage`, `open-datacube-interop`, `local-ict-regulatory-registration`, `climate-mrv`, `gender-inclusion-disaggregation`, `oda-visibility-cobranding`, `cps-oda-policy-alignment`, `crypto-local-regulation`, `global-address-geocoding`, `intl-contract-jurisdiction`, `intl-bid-readiness`, `overseas-tax-entity`, `overseas-staff-safety`, `local-technician-desktop-client`(QGIS 플러그인), `recipient-ai-regulation`(EU AI Act), `mdb-open-access-output`, `non-oda-commercial-export-models`(G2G·PPP·KIND), `iati-aid-transparency`, `regional-hub-shared-instance`, `recipient-data-exchange-layer`(X-Road), `multiscript-party-name-matching`, `overseas-ip-protection`, `humanitarian-data-responsibility`, `intl-positional-accuracy-reporting`(ASPRS 2023), `country-legal-rag-corpus`, `global-export-compliance`

---

## §3. 설계서 반영안 — LANDXI-HYPER-BLUEPRINT.md 어느 장에 무엇을 추가할지

본문은 고치지 않는다. 아래는 v1.2 개정 때 넣을 목록이다(§10 비평과 같은 '추가만 함' 방식 권장). 괄호는 이 문서의 ID.

| 장 | 추가할 것 | 근거 ID |
|---|---|---|
| 개정 이력 | v1.2 행: "capability/CAPABILITY-MAP.md 반영 — 국가급 사업 요건 층(사업관리·보안·개인정보·공간정보 보안·연계·AI 거버넌스·행정 업무) 추가" | 전체 |
| §0 한 장 요약 | 문단 하나: "이 설계서는 제품·아키텍처 설계서다. 발주·감리·보안성 검토·개인정보·공간정보 보안·행정 연계 요건은 capability/ 아래 산출물이 담당하며, 요구사항 ID(REQ-TRACE)로 이 설계서와 묶인다." 커버리지 ≈20% 수치 인용 | A-01 §0 |
| §1 사용자와 여정 | 역할 표에 '운영 조직' 열(보안책임자·CPO·데이터 스튜어드·당직·현장 조사원·LX 지사 위탁 인력·해외 현지 운영자) | B-12 E-09 J-05 I-13 |
| §2 정보구조 | 게스트 레일에 처리방침·이용약관·접근성 정책·자동화 결정 기준·시민 신고·공지/FAQ 화면 ID 추가. 기관 레일에 '내 업무함'·'결재 대기'. LX 레일에 '정산'·'접속기록 점검'·'장애 대응' | K-05 K-06 C-05 I-11 J-07 B-09 J-05 |
| §3.1 여덟 동사 | 각 동사에 '키보드·터치 대체 조작' 열. 결과 패널 '표로 보기' 모드 규정 | K-02 K-04 |
| §3.2 영상 층 스택 | 각 단에 '망별 경로(인터넷망/행정망 중계/오프라인 미러)' 열, '보안 등급·가림 상태' 열, '권리 근거(rights_holder·supply_basis)' 열. 상용 위성 단(사용권 범위) 추가 | B-03 D-01 D-05 L-05 |
| §3.3 실시간 분석 프레임 | 스케줄러 자원 모델에 workload=infer/train/llm 차원과 LLM 풀. job.kind에 train. 입장 제어·DLQ 한 줄. 캠페인(전국 일괄) 우선순위 등급 | G-08 G-03 J-P1 |
| §3.4 결과 층 | 검수 상태에 confirmed_by(사람) 필수와 '참고자료' 고지. 공개 모드 결과 벡터 조건(집계 단위·셀 억제·보안구역 제거). HWPX 보고서 경로 | F-02 C-04 D-02 I-12 |
| §3.5 연계 | '내부 연계'로 개명. '§3.6 외부 연계' 신설: INTERFACE-CATALOG.md 인용(KRAS·일사편리·행정정보공동이용·새올·전자결재·NSDI·재난) | E-01 E-02 I-11 |
| §4 관제 | ⑥ 장애 대응(경보 라우팅·당직·Sev·포스트모템), ⑦ 보안·접속기록 점검, SLO/SLA 달성률 패널, 드리프트 패널, 정산 탭, 기관 생성·해지 조작 | J-05 B-09 J-01 G-07 J-07 J-08 |
| §5.1 컴포넌트도 | 망 경계 오버레이(DMZ/내부/행정망/관리망), 표준프레임워크 적용 구간 경계, LLM 서빙 노드, 보안구역 판정 서비스, PAM, staging 환경, 제어평면 복제 | B-02 A-10 G-09 B-18 B-10 B-17 J-02 |
| §5.2 API 목록 | /stac/*, /ogc/*(WMS·WMTS·WFS·Features·Tiles), /agent/*, /public/reports, /reports/{id}.hwpx, /catalog iso19115 블록, /parcels 노출 열 화이트리스트 | E-07 G-09 K-06 I-12 E-06 C-03 |
| §5.3 저장소 | 신설 표: access_log, parcels_history, datasets(version·sha256), runs, eval_sets, model_stats, price_list·invoices, survey_plans·targets·field_photos(SURVEY-SPEC 인용), tenants 확장(status·residency·crs 구조·n2sf_grade·idp), imagery 확장(security_grade·deid_status·rights_holder·license_scope), models 확장(license·training_origin), labels | B-09 E-03 G-01 G-04 G-06 G-07 J-07 I-05 I-09 L-03 L-04 B-07 D-01 C-02 D-05 F-04 G-02 |
| §5.4 전처리 파이프라인 | P-mask(가림), P-deid(비식별), attr_whitelist 검사, 업로드 악성코드·CDR, 메타데이터 자동 추출 단계. 기존 namwon-parcels.pmtiles 재생성 지시 | D-01 C-02 B-18 B-P1 |
| §5.5 확장 경로 | '§5.5.0 운영 사이트·호스팅 모델' 신설. Phase 표에 staging·HA·DR·배포 형태(SaaS/설치형)·사이트 열. 성능 예산 표 → SLO 표. HW 규모산정서 링크 | A-12 J-02 J-04 L-02 J-01 J-11 |
| §5.6 보안·격리 | 여섯 번째 겹 '관리자 접근(PAM·MFA)'. 소절 신설: 개발보안(시큐어코딩·진단), 암호(KCMVP·저장 암호화), 배포 파이프라인(CI/CD·SBOM·서명), 생성형 AI 보안 기준(AGENT-SPEC 인용), 세션(쿠키 일원화 — F1-CONTRACT §3 localStorage와의 모순 해소). cloudflared·Tailscale '시연 한정' 표기 | B-05 B-06 B-08 B-10 B-14 B-17 B-04 B-P1 session |
| §5.7(신설) 형상·변경·릴리스 관리 | git 도입, 기준선, CR 심의, 플랫폼 semver·링 배포, DB 마이그레이션 | A-06 J-P1 |
| §5.8(신설) 라이선스·SBOM | YOLO AGPL 판정, AI Hub 약관, 코드 의존성, 서체 | F-04 |
| §6 디자인 언어 | §6.3 브레이크포인트 토큰, §6.4 모션 문법에 정지·건너뛰기·깜빡임 한도, 유리 패널 최악 배경 대비 규칙, KRDS 정합 판정 소절, 한글 병기 규칙 | K-04 K-03 K-P1 |
| §7 판정 방식 | 루브릭 행 추가: 접근성(axe 0·KWCAG 대조), 성능 시험, 보안(진단 결과), 백업·복원 시험, 테넌트 격리 회귀. 판정 재료를 감리 산출물 명칭으로 매핑 | K-01 J-06 B-05 J-03 A-08 |
| §8 로드맵 | §8.1 1차 완료 기준에 §1-Σ 22개 결정 완료 조건. 감리 3회·보안성 검토·PIA·과업 확정 마일스톤. §8.2에 P1 묶음(2차=운영화 요건, 3차=인증·확산, 4차=글로벌) | A-03 B-01 C-01 A-09 |
| §9 사용자 결정 질문 | 이 문서 §4의 5문항으로 교체·추가 | §4 |
| 부록 B 신설 파일 | capability/ 아래 산출물 목록(REQ-TRACE, RFP-CROSSWALK, ISMP-OUTLINE, COST-BASIS, AUDIT-PLAN, DELIVERABLES, TECH-APPLY-SHEET, SEC-REVIEW-PKG, SEC-ORG, PRIVACY-PKG, DATA-USE-APPROVALS, INTERFACE-CATALOG, CLASS-CROSSWALK, DATA-GOVERNANCE, AI-ACT-COMPLIANCE, ACCEPTANCE-CRITERIA, LICENSE-LEDGER, LEGAL-BASIS-BY-SURVEY, BACKUP-DR, INCIDENT-PLAYBOOK, PERF-TEST-PLAN, SLA-SLM, KPI-FRAMEWORK, A11Y-PLAN, GLOBAL-DELIVERY-MODELS, INSTALLER-SPEC) | §1 전체 |
| 부록 D 리스크 | 추가: 단일 디스크 원본(E:), cloudflared 운영 불가, AGPL, 가림 전 영상 시연, PMTiles 실명 잔존, 미얀마 시연 소재(제재), V-World 키 만료, DEV_PASSWORD | J-03 B-04 F-04 D-01 B-18 L-P1 |
| §10.7 착수 전 순서 | 맨 앞에 "§1-Σ 결정 22건" 삽입 | §1-Σ |

SURVEY-SPEC.md·F1-CONTRACT.md·AGENT-SPEC.md 반영안은 위 표의 '어디에' 열이 이미 가리킨다(각각 §1.2 흐름도·§2.4 상태기계 보강·§3 테이블, §3 인증 idp·§4.1 빌드 가드·§6 테이블, §0 보안 기준·§3 권한 열·§3.6 저장소 조건).

---

## §4. 사용자에게 확인할 것 (최대 5 · 추천 포함)

| # | 질문 | 선택지 | 추천 | 왜 지금 |
|---|---|---|---|---|
| Q1 | **전자정부 표준프레임워크 적용 범위** | (a) 전체 Java/Spring 재작성 (b) 행정 업무 구간(포털·결재·조사 관리)만 eGovFrame, XI맵·카드 런타임·관제·에이전트는 Python 유지 + 미적용 사유서 (c) 미적용, 호환성 확인만 | **(b)**. AI·타일·GPU 스케줄러는 Python 생태계가 사실상 표준이고 사유서로 통과한 선례가 많다. 행정 구간은 결재·GPKI 연동 라이브러리가 Java에 있다 | 게이트웨이를 1차에 굳히기 전 |
| Q2 | **운영 호스팅 모델과 인증 목표** | (a) LX IDC 온프레미스 + GS 1등급 (b) CSAP 민간 클라우드 + GS + CSAP (c) 공공 클라우드센터 입주 (d) 혼합: 국내=LX IDC, 해외=현지 설치형 | **(d)**. 국내 지적·소유 정보는 N2SF S등급 가능성이 커 온프레미스가 검토 통과에 유리하고, 해외는 데이터 주권상 설치형이 필수. 인증은 GS 1등급 우선, CC는 자체 인증 기능을 CC 제품(SSO·DB암호화)으로 대체해 회피 | 망 구성·DR·조달 전제 |
| Q3 | **AI 판독 결과의 행정적 지위와 고영향 AI 판정** | (a) 참고자료(사람 확정 필수, 고영향 아님으로 주장) (b) 처분 근거 후보(고영향 AI로 등록, 위험관리·설명 체계 구축) | **(a)로 시작, (b) 전환 조건 명시**. 행정기본법 §20상 자동 처분은 법률 근거가 필요하고 1차에는 그 근거가 없다. 다만 설계는 (b)를 위한 필드(confirmed_by, legal_status, 설명 방안)를 처음부터 둔다 | 콘티 '현장조사 대체' 문구 수위·상태기계 |
| Q4 | **현장조사 모바일 앱 범위** | (a) PWA(오프라인 캐시·IndexedDB 큐)로 1차부터 (b) 네이티브(MDM·카메라·GNSS·RTK)로 2차 (c) 1차는 데스크톱만 | **(a) PWA 1차 + (b) 네이티브 2차 판정 유보**. PWA는 앱 등록 절차(모바일 전자정부 지침)를 피하면서 오프라인·GPS 사진을 시연할 수 있다. MDM·캡처 방지가 PWA로 부족하면 2차에 네이티브 | M-1 설계와 B-11 요건 |
| Q5 | **RFP 원문·시연 자산 권리·기준선 데이터 제공** | 사용자만 할 수 있는 조치 5개: ① D:/웨일 다운로드 RFP 원문 위치 확인 ② C01 25cm·C04 국토정보기본도의 권리·보안심사·지적전산자료 이용 승인 근거 ③ V-World 운영키 재발급 ④ YOLO Enterprise 라이선스 문의 여부 ⑤ 시범 지자체(남원)의 도입 전 조사 인일·단가(KPI 기준선) | **① ②를 먼저**. ①이 없으면 요구사항 ID 체계를 세울 수 없고, ②가 없으면 1차 시연 영상 자체를 공개 화면에 못 올린다 | A-02 D-05 C-06 A-13 |

---

## 부록. 이 문서의 한계(지어내지 않는다)

- 705건 병합과 상태 판정은 수기다. 커버리지 %는 [추정]이고, 같은 항목을 다른 사람이 세면 ±5%p 움직인다.
- 법령 조항·시행일은 탐색 결과를 옮긴 것이며 발주 시점에 원문 확인이 필요하다. 특히 AI 기본법 하위 고시, N2SF 가이드라인 판, 디지털포용법 시행 시점, KWCAG 2.2 개정판은 재확인 대상.
- 예타·총사업비·CSAP·CC·주요정보통신기반시설·국가핵심기반 해당 여부는 재원 구조와 발주 주체가 정해져야 판정할 수 있다. 이 문서는 '판정이 필요하다'까지만 적었다.
- SURVEY-SPEC.md·AGENT-SPEC.md는 2026-09-24 판을 기준으로 대조했다. 탐색 결과 중 일부는 이 파일들이 없던 시점의 기록("SURVEY-SPEC 파일 없음")이므로, 해당 항목의 status는 현재 파일 기준으로 한 단계 올려 읽어도 된다(예: 실태조사 상태기계·모바일 M-1은 'missing'→'partial').


---
## 검증 메모 (2026-09-26, Claude)
§1-Σ 9번 "namwon-parcels.pmtiles 에 OWNER_NM 잔존 = PII" 는 **실측 결과 개인정보 아님**: 원천(국토정보기본도 2.0 45190.shp) OWNER_NM 은 **소유구분 코드 11종**(개인·국유지·군유지·종중·법인·시도유지·기타단체·종교단체·일본인/창씨명·외국인/외국공·결측)이며 성명이 없다. 즉시 조치 불필요 — 다만 표시 시 "소유구분"으로 명명하고, 개인 필지 표시는 게스트에 금지 유지.


---
## 사용자 결정 (2026-09-26, §4 추천안 전부 채택)
- Q1 행정 구간(회원·권한·게시판·결재)만 eGovFrame, AI·GPU·공간 엔진은 Python + 적용 제외 사유서
- Q2 국내 LX IDC(온프레미스) + 해외 현지 설치형, GS 인증 1등급 우선, CC 는 인증 제품 사용으로 대체
- Q3 AI 결과 = 참고자료(현장조사 대상 선정 근거), 처분은 사람. AI 기본법 고영향 전환 필드 선예약
- Q4 현장조사 앱 PWA 1차(오프라인·GPS·사진), 네이티브 2차 유보
