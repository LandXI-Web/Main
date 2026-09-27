# F3-DIRECTION — 핵심만 남긴 한 제품 (2026-09-27 · Fable 5.1 · 수석 기획·디자인 디렉터)

- 입력: 사용자 원문 9/27(어수선·글 과다·LX 직원 관점 불명·행정데이터 융합·현장 PWA 제외) · 세 관점 리뷰(`review-lx-staff` · `review-admin` · `review-service`) · `PLATFORM-EVAL` · 법전 `design/system-v2.md` · 스펙 09-20 4종 · `SURVEY-SPEC` · `AGENT-SPEC` · 서버 라우트 실측(`server/landxi_api/*.py`).
- 한 줄: **문 하나 · 집 셋 · 새 기능 하나(대장 반입) · 화면 35 → 12 · 글 60% 삭감.** 이번 차수는 §7의 5화면 시안만 구현하고, 나머지는 계획(§6)이다.
- 규칙: 커밋은 마지막 단계만 · GPU 한 장씩(Ollama·vLLM 종료 금지) · 행정·조달 문서 없음 · 남원 하드코딩 없음(지역 = 변수).

---

## 1. 제품 재구성 — 관리자 · LX 직원 · 서비스 사용자

```
                 ┌────────── 정문 하나 (모토 3축 · POST /auth/login) ──────────┐
                 │  LX 직원          LX 관리자          기관(지자체 · 해외)      │
                 └─────┬─────────────────┬──────────────────────┬────────────────┘
                       ▼                 ▼                      ▼
        ┌── 생산 콘솔 (:4173/v3/console) ──┐  ┌─ 관제 (:8702/v3/ops) ─┐  ┌─ 서비스 (:4173/v3/service) ─┐
        │ XI맵 + '오늘' 띠 + 6단 라인       │  │ 현황·인프라·기관·배포·결재 │  │ 지도 + 내 대장 × AI + ⌘K    │
        │ 반입→학습→조립→검수→배포→운영      │  │ 잉크 반전 · 같은 로그인    │  │ 보고서 서랍 하나            │
        └───────────────┬──────────────────┘  └───────────┬───────────┘  └──────────────┬─────────────┘
                        └──────── 같은 id(job · card · deploy · finding) ────────────────┘
```

| 축 | 첫 화면이 답하는 질문 | 핵심 요소(≤5) | 지금 대비 |
|---|---|---|---|
| **LX 관리자** | 지금 내가 승인·조치할 것이 있나? | ① 배포 지도(점=기관 · 색=단계) ② 결재 대기 n ③ 경보 n ④ GPU 부하·전력 예산 ⑤ 결재함 첫 건 열기 | 메뉴 11 → 5 · 정문 관리자 → :8702 직행 · 구 admin-* 7화면 폐기 |
| **LX 직원(생산)** | 오늘 뭘 해야 하고, 뭘 만들 수 있고, 어디에 깔렸나? | ① XI맵(전국) ② '오늘' 띠(검수 대기·재학습·이식 요청·기관 신고) ③ 6단 레일 ④ 카탈로그 매트릭스(업무 10 × 모델·대장·영상·규칙) ⑤ 깔린 기관 n | 착지 프로젝트 썸네일 → 오늘 띠 · 대시보드 폐지 · 발행·생산이 직원에게 열림 |
| **서비스 사용자(공무원 · 해외)** | 내 대장과 AI가 어긋난 필지는 어디인가? | ① 지도(실태조사 고정 · 관내) ② 대장 올리기 ③ 의심 필지 3분류 큰 숫자 ④ ⌘K 한 문장 ⑤ 오늘 할 일(현장 배정·판정 대기·초안) | 카드 덱 5장(3장 준비 중) + 5탭 → 화면 1 + 서랍 1 · 대장 반입 신설 |

경계는 그대로: LX = 판독·규칙·대장 스키마까지, 기관 = 대장 올리고 결과로 업무를 끝낸다(two-tier). 기관 세션은 콘솔·관제에 못 들어가고 LX 세션은 기관 작업공간에 못 들어간다(서버 realm).

---

## 2. LX 직원 '생산 콘솔' — 네 질문에 화면으로 답한다

```
 오늘 ─ 검수 대기 3 · 재학습 1 · 이식 요청 1 · 기관 신고 4        [첫 항목 열기]
 ────────────────────────────────────────────────────────────────────────────
 ① 반입 ──▶ ② 학습 ──▶ ③ 조립 ──▶ ④ 검수 ──▶ ⑤ 배포·이식 ──▶ ⑥ 운영
 영상·대장   라벨·곡선   카탈로그    의심 큐     기관 덱·CI      성능·신고
 V-World     모델        매트릭스    정밀도      심기·이식       재학습 ↺ 오늘
```

| 질문 | 답하는 자리 | 화면에 보이는 것 |
|---|---|---|
| **이게 뭐야?** | 정문 + 콘솔 마스트 한 줄 | "부처·지자체 실태조사를 AI로 대체하는 유일한 GeoAI 플랫폼" · 모토 3축 |
| **뭘 해야 하지?** | '오늘' 띠 | 네 종류 할 일 n, 누르면 지도가 그곳으로 이동하고 해당 단의 서랍이 열린다 |
| **뭘 만들 수 있지?** | ③ 조립 = 카탈로그 매트릭스 | 업무 10행 × [모델 · 대장 스키마 · 영상 · 규칙] 있음/없음 → 4칸이 차면 "카드 만들기" 활성. 지금 만들 수 있는 업무 n/10 |
| **어떻게 지자체에 주지?** | ⑤ 배포·이식 | 기관 덱 미리보기 → 심기 / 이식(프로파일 1벌 + 배포본 1줄) → CI 9키 → 포털 생성. 배포 지도(전국)에 새 점 |

**카드의 정의를 바꾼다: 카드 = 모델 + 규칙 + 대장 스키마.** LX는 업무 하나당 이 세트를 만들고, 지자체는 자기 대장을 올려 쓴다. 이것이 "만들 수 있는 서비스"와 "제공 경로"의 실체다(`cards.js CARDS`에 `ledger_schema` 필드 추가 · `CORE_MODULES`에 `survey` 승격 = SURVEY-SPEC K1).

**남원 영농관리 → 여수 이식, 6단 8칸(콘솔에서 클릭으로 따라간다)**

| 단 | 클릭 | 지도 | 서버 |
|---|---|---|---|
| 오늘 | "이식 요청 · 여수시 농정과" | 여수로 카메라 이동 | — |
| ① | 여수 정사영상 등록 · V-World 연속지적·농업진흥 켜기 · 농지대장 XLSX 반입 | 결합률 채색, 미결합 붉게 | `POST /t/yeosu/survey/registry/import` |
| ② | 남원 모델 사본 → 여수 표본 미세조정 | 라벨 AOI | `/registry/models` |
| ③ | 카탈로그 '농지이용' 행 4칸 ✓ → 카드 여수 배포본 | 규칙이 켜지는 필지 미리보기 | `POST /deploys`(from_deploy_id) |
| ④ | 첫 스윕 → 표본 100 → 정밀도 ≥ 기준 → '검수 전' 떼기 | R 규칙 필지 | `/survey/findings` · `rule_stats` |
| ⑤ | CI 9키 → 포털 생성 → 심기 | 배포 지도에 여수 점 | `POST /deploys/{id}/rollout` |
| ⑥ | 오탐 신고 임계 미달 → 재학습 카드가 '오늘'로 | 관제 기관 막대 | `/feedback` · `ops.js THRESHOLDS` |

---

## 3. 행정데이터 융합 분석 — 업로드한 대장 × AI 판독 × V-World

```
  공무원                         서버                                    화면
 ┌────────┐   XLSX/CSV/SHP/GPKG  ┌──────────┐ 열 인식 ┌──────────┐ PNU  ┌─────────┐
 │ 올리기 │ ───────────────────▶ │ ① 반입   │ ──────▶ │ ② 매칭   │ ───▶ │ 결합률  │
 └────────┘                      └──────────┘         └──────────┘      │ 96% ✓   │
      ▲  확인 표 한 장(열 → 뜻)        │                    │              └─────────┘
      │                                ▼                    ▼
 ┌────────┐  "대장상 농지인데        ┌──────────┐ 규칙  ┌──────────┐      ┌─────────┐
 │  ⌘K    │ ─ AI가 건물로 본 필지" ▶ │ ③ 에이전트│ ────▶ │ ④ 대조   │ ───▶ │지도·표· │
 └────────┘                      └──────────┘       └──────────┘      │보고서   │
                                  Gemma 4 계획 3단   대장열×AI×V-World  └─────────┘
```

**매칭 사다리**: PNU 19자리 직접 → 지번 문자열 파싱(읍면동·리·본번-부번) → V-World `LP_PA_CBND_BUBUN` BOX 조회로 PNU 부여 → 미매칭 목록(사유 1줄). 결합률은 봉투로.

**데이터 모델(기존 계약 위에 얹는다 · 새 표 0)**

| 기존 | 얹는 것 |
|---|---|
| `registry_snapshots(kind, payload jsonb, tenant_id RLS)` | `kind ∈ farm_ledger·dev_permit·public_asset·river_permit·greenhouse` · `payload` = 반입 행(allowlist 열만 · 성명 저장 금지) · `import_id` 열 1개 추가 |
| `rules.when_ / requires[]` DSL | 피연산자 `ledger.<kind>.<col>` 허용 · `requires:['farm_ledger']` 없으면 `rule_requires_missing` → skipped |
| `findings.evidence` | `{ledger:{col,value}, ai:{cls,ratio}, vworld:{layer,value}}` 세 값 나란히 |
| `cards.CARDS` | `ledger_schema:{kind, columns:[{key,label,role:'pnu'|'jibun'|'status'|'date'}]}` — 반입 자동 인식의 템플릿 |

**API(SURVEY-SPEC §3.2에 이미 적힌 것을 구현 · 신설 2)**

```
POST /api/v1/t/{tenant}/survey/registry/import      multipart · kind · → 202 {import_id, rows, columns_guess}   (스펙 有 · 구현 0)
GET  /api/v1/t/{tenant}/survey/registry/{import_id}  → {columns, mapping, matched, unmatched[], as_of}           (신설)
POST /api/v1/t/{tenant}/survey/registry/{import_id}/confirm  {mapping}  → 매칭 실행 · 202                       (신설)
GET  /api/v1/survey/stats?by=emd|jimok|ledger.<col>  (기존 · by 값 확장)
GET  /api/v1/survey/findings?rule=L-*                (기존)
POST /api/v1/t/{tenant}/survey/rules                 (스펙 有 · 기관 오버라이드 · 자연어 → 확인 카드 저장)
```

**vLLM(Gemma 4 12B :8000 · 라우터 HyperCLOVAX :8001) 도구 설계** — `server/agent/tools/`에 4개 추가, 스키마는 계약 JSON에서 생성(from_contract).

| 도구 | 인자 | 반환 | 가드 |
|---|---|---|---|
| `ledger_ingest` | `file, kind?` | `import_id · columns_guess` | 기관 realm만 · 파일 20MB · 열 allowlist |
| `ledger_match` | `import_id, mapping` | `matched(봉투) · unmatched[]` | 매칭률 < 50%면 확인 카드로 멈춤 |
| `ledger_rule` | `text` (자연어) | 규칙 DSL + 설명 한 줄 → **확인 카드**(`POST /agent/runs/{id}/confirm` 기존) | 저장 전 사람이 누른다 · owner=tenant |
| `ledger_findings` | `rule_id \| when_, by?` | 필지 FeatureCollection + `count` 봉투 + `by_emd` | 대장 없으면 `"이 기관에 농지대장이 없습니다 → 올리기"` 한 줄 · 타 기관 403 |
| `parcel_lookup`(F3-AG) | `jibun \| pnu` | 필지 1 + 이력 | 관내 밖이면 거절 |

라우터가 먼저 `tenant · survey_id · 대장 유무`를 판정해 범위 밖이면 도구를 부르지 않는다. 숫자는 봉투에서만(number-lint 유지). 클라이언트 도구 `map_on · map_arrive`로 **말 한마디 → 카메라 이동 + 융합 채색 + 집계 카드**가 기다림 없이 이어진다 — 이것이 사용자가 정의한 Hyper Performance의 장면이다.

첫 대장 = **농지대장**(남원 농정과 표본 확보 시) · 없으면 V-World 농업진흥·용도지역·GB 레이어로 먼저 시연(사용자 결정). 형식 1차 = XLSX·CSV + SHP·GPKG.

---

## 4. 법전 v2.1 '글 다이어트' — `design/system-v2.md`에 §v2.1로 추가 제안(본문 미수정)

판정 한 문장: **"이 글자가 이 사용자의 업무 결정에 쓰이는가?" 아니면 지운다.**

```markdown
## v2.1 — 글 다이어트 (2026-09-27 제안 · 사용자 12차 피드백)

### v2.1-1 화면당 글 예산(공백 제외 · 첫 뷰 1440×900 · e2e가 innerText로 잰다)
| 항목 | 예산 |
|---|---|
| 첫 뷰 본문 | 직원·관리자 ≤ 300자 · 서비스 ≤ 400자 · 로그인 ≤ 200자 |
| 헤드라인 | 1개 · ≤ 12자 · 부제 없음 |
| 문장(마침표가 있는 글) | 화면당 1개 |
| 패널 | ≤ 3줄 · 줄당 ≤ 24자 · 제목 옆 설명문 0 |
| 큰 숫자(≥ 54px) | 화면당 1개 · 사용자 업무 결과만(현장 확인 필요 n필지 · 대장과 다른 필지 n건) |
| 버튼·링크 | ≤ 8 · 1차 행동 1개(잉크 채움) |
| 숫자 : 라벨 | 1 : 1 · 한 숫자에 퍼센트 둘 이상 금지 |

### v2.1-2 출처·기술정보의 자리
- 신뢰는 숫자 옆 기호 하나: `✓` 확인됨 · `~` 추정치 · `예시`(demo). 봉투 basis 6종 → 화면 표기 3종으로 접는다.
- 근거(데이터셋 이름 · 기준일)는 호버 한 줄. API · 버전 · 필터 · 경로는 개발자 서랍(`?dev=1` · LX 직원 role만).
- 패널마다 붙던 `실측 · nvidia-smi · 10:58:46` 꼬리표 → 상단 바 신선도 점 하나.
- 내부 용어 금지: 실측·추정·봉투·basis·shard·칩·픽스처·리플레이 → 확인됨·추정치·칸·예시·기록.

### v2.1-3 금지 목록(사용자 화면 · e2e grep 0)
파일 경로 · job/run/import id · API 경로·메서드 · GPU 모델명·렌더러·D3D11 · p95·ms·fps · 줌·좌표 · 타일 결손 수 · 모델 id·버전 문자열 · 폴리곤·shard·칩/s · 계산식 문장(`= 총 − 외부 − 2,048`) · `시연`·`기준일 2026.06.08` 고정 꼬리표 · `준비 중` 카드 · 코드 식별자(`approvals subject_type=`).
성능 수치는 관제 인프라 한 곳. 사용자에게는 "결과까지 약 20초" 한 문장.

### v2.1-4 여백 · 타이포 · 색
- 위계 3단만: 큰 숫자(Paperlogy 124/54) · 라벨(Pretendard 14) · 본문(16). H2~H5는 문서 무대에만.
- 여백 = 글의 자리: 패널 안쪽 24 · 패널 사이 16 · 첫 뷰 지도 ≥ 90%(영상 무대) · 유리 ≤ 15% 유지.
- 색은 결과 위에서만: 청록(AI) · 앰버(탐지 순간) · 경고(조치 필요 글자). 크롬에 색 0 · 상태 칩은 잉크 농도로.
- 경보는 조치할 일에만(디스크 ≥ 90% 켜고 · LLM 상주 VRAM은 끈다).

### v2.1-5 게이트 추가
Craft 불합격 신호에 추가: 예산 초과 · 금지어 1개 · 숫자에 라벨 없음 · 같은 지표가 두 화면에서 다른 값 · 큰 숫자가 내부 지표.
```

---

## 5. 삭제 · 축소 목록

| 구분 | 항목 | 처분 |
|---|---|---|
| **확정 제외** | 현장 PWA(`inspect/` · GPS 도착 · 오프라인 큐) · 행정·조달 문서 | 하지 않는다. 현장 배정·판정은 서비스 화면 표에서 상태 변경만 |
| **폐지** | 대시보드 · charts · admin-home · 발행 요청 폼(썸네일·1,000자) · 이식 마법사 모달 · 기관 카드 덱 5장 · 작업공간 5탭 | '오늘' 띠 · 카탈로그 매트릭스 · 6단 서랍 · 서비스 화면 1 + 서랍으로 흡수 |
| **폐지** | dive · map-drift · fonts · system · shell-demo · fonts-compare | 개발 잔재 · 레일 밖 |
| **축소** | 프로젝트 8단계 → 라벨·학습·모델 3 · 인증 6 → 1(찾기·신청은 서랍) · 지원 5(공지·FAQ·문의·사례·매뉴얼) → `?` 서랍 | |
| **관제** | 레일 11 → 5 · GPU 퍼센트 4 → 부하·VRAM·W · 링 8 → 3 · 보안 칩 4 → 1 · A100 자리표 · 용량 계획 · 하단 배포 지도 · 계보 격자 · 하단 3패널 · 실태조사 의심 레이어 | 삭제 · 결재함 하나로 합침 |
| **XI맵** | 우하단 GPU·렌더러·p95·좌표·GIBS · 계보 칩 문자열 · 비활성 시점 플레이어 · 기관용 판독/실태조사 스위치 · 출처 칸 파일 경로 | 개발자 서랍 · 기관은 실태조사 고정 |
| **서비스** | 현황 설명 3줄 · 근거 6줄 · 신뢰도 히스토그램·평균 · 각주 · 공지 띠 · Family Site · 3단 푸터 | 삭제 · 푸터 1줄 |
| **에이전트** | 라우터 ms · 모델 id · 도구 이름·인자 노출 · `GET …` 설명 | 계획 단계는 사용자 말 3줄로 · 나머지 개발자 서랍 |

새 기능은 **대장 반입 하나**뿐이다.

---

## 6. 구 화면 v2 재구현 계획 — 묶음 · 순서(계획만 · 시안 승인 후)

`landxi/proto/*.html` 50(개발 잔재 6 제외 44) → v3 12화면. 순서는 정문 경로가 먼저 열리는 순.

| 순 | 묶음 | v3 화면 | 흡수하는 구 화면 | 근거 |
|---|---|---|---|---|
| B0 | 정문 | `v3/login` | login · signup · find-id(2) · find-password(2) · portal-login-*(2) · ops/login | §7-⑤ |
| B1 | 오늘 + XI맵 | `v3/console`(오늘 띠) · `v3/xi` | dashboard · charts · admin-home · admin-map · ximap | §7-①③ |
| B2 | 서비스 | `v3/service` + 보고서 서랍 | portal · portal-dp-*(7) · stats-standard · report-standard(2) | §7-② |
| B3 | 관제 | `v3/ops` 5메뉴 | ops 4 · admin-users · admin-publish(결재) · admin-notice·faq·inquiry(설정 하위) | §7-④ |
| B4 | 생산 ①~⑤ 서랍 | `v3/console/{ingest,train,assemble,review,deploy}` | dataset · ai-project(3) · workflow · analysis-ai · ai-card(2) · ai-publish-create · produce | 시안 ① 승인 뒤 |
| B5 | 지원·MY | `v3/console/?drawer=help` · `?drawer=my` | notice · faq · contact · usecase · manual · mypage | 마지막 |

합격 기준(묶음 공통): 정문 로그인에서 도달 · 숫자 출처 한 곳(`/registry · /survey/stats · /jobs · /ops`) · `시연` 꼬리표 0 · §4 예산 통과 · 죽은 버튼 0.

---

## 7. 핵심 5화면 시안 명세 — 이번 차수 구현 · 사용자에게 보일 것

공통: 새 경로 `landxi/v3/<screen>/`(html · css · js) + `landxi/v3/shared/`(신선도 점 · 개발자 서랍 · `✓/~` 기호 · 오늘 띠 부품). 기존 `landxi/xi/engine · fx · survey · agent`, `landxi/ops/js`, `landxi/shared/api-v1.js`, `tokens-v2.css`는 **import만**. 서버는 §3 신설 2 엔드포인트 외 수정 없음. 판정은 정문 로그인부터 찍은 동작 영상 + §4 예산 실측.

| # | 화면 | 목적 한 줄 | 요소(≤5) | 레퍼런스 장치 | 소유 파일 |
|---|---|---|---|---|---|
| ① | **LX 직원 생산 콘솔** | 오늘 할 일·만들 수 있는 것·깔린 곳이 한 화면 | 전국 XI맵(캔버스 ≥ 90%) · '오늘' 띠 4칸 · 6단 레일(서랍) · ③ 카탈로그 매트릭스 10×4 · ⑤ 배포 지도 점 | **Linear**(레일 밀도 · ⌘K · 패널 그림자) · **Palantir**(단계 노출 · 디밍) | `landxi/v3/console/` — index.html · console.css · today.js · rail.js · matrix.js · transplant.js |
| ② | **지자체 공무원 첫 화면** | 내 대장을 올리면 AI와 어긋난 필지가 바로 지도에 | 지도(실태조사 고정) · 대장 올리기(드롭 → 열 확인 표 → 결합률) · 의심 3분류 큰 숫자 1 + 2 · ⌘K(vLLM 실연결 · 계획 3줄) · 오늘 할 일 | **Apple Maps**(vibrancy 시트) · **Palantir AIP**(계획 단계) | `landxi/v3/service/` — index.html · service.css · ledger-upload.js · fusion.js · cmdk-bridge.js |
| ③ | **XI맵 정돈판** | 같은 엔진, 글 60% 삭감 · 큰 숫자는 업무 결과만 | 지도 · 검색 · 도구 7 · HUD(큰 숫자 1 · 라벨 1 · `✓`) · 개발자 서랍 `?dev=1` | **planet.com**(사진으로 대접) · **Vantor**(124px 숫자 하나) | `landxi/v3/xi/` — index.html · chrome.css · hud-lite.js · dev-drawer.js (엔진·fx·survey import) |
| ④ | **관리자 관제 핵심판** | 승인·조치할 것이 있나를 5메뉴로 | 현황 = 배포 지도 + 할 일 목록 · 인프라(GPU 부하·VRAM·W · 전력 1/1 · 큐 · 디스크) · 기관 3링 · 배포 매트릭스 · 결재함 하나 | **Palantir Blueprint dark** · **Linear** 밀도 | `landxi/v3/ops/` — index.html · infra.html · tenants.html · deploys.html · approvals.html · ops-lite.css (ops/js import) |
| ⑤ | **로그인** | 플랫폼 소개 3축 + 실제 인증 + 역할별 착지 | 모토 3축 한 줄씩 · "실태조사 특화 유일 GeoAI" 한 문장 · 계정 3택 · 폼 · 실결과 얼굴판 1장 | **Apple**(한 화면 한 문장) · **Vantor**(반전 섹션 · clip-path) | `landxi/v3/login/` — index.html · login.css · auth.js(`POST /auth/login` → staff→console · admin→ops · tenant→service) |

**화면별 합격선**

| # | 글자(첫 뷰) | 버튼 | 반드시 보이는 장면 | 데이터 |
|---|---|---|---|---|
| ① | ≤ 300 | ≤ 8 | '오늘' 띠 클릭 → 여수 카메라 이동 → 6단 8칸이 순서대로 열린다(§2 표) | `/registry` · `/deploys` · `/survey/findings` · `/feedback` |
| ② | ≤ 400 | ≤ 8 | XLSX 드롭 → 열 확인 표 → 결합률 ✓ → ⌘K "대장상 농지인데 AI가 건물로 본 필지" → 지도 채색 + 표 + 집계 카드, 기다림 없이 | §3 API · vLLM :8000 실연결(녹음 재생 0) |
| ③ | ≤ 200 | ≤ 10 | 우하단 개발 문자열 0 · HUD 큰 숫자 = "현장 확인 필요 n필지" | 기존 봉투 |
| ④ | 각 ≤ 40% 현재 | 메뉴 5 | 정문 관리자 로그인 → 현황 착지 · 결재함 한 목록 · 거짓 경보 0 | `/ops/*` · `/deploys` · `approvals` |
| ⑤ | ≤ 200 | 3 | 틀린 비밀번호 거절 · 세 역할이 각자 집에 도착 | `/auth/login` · `/me` |

**하지 않는 것**: 기존 `landxi/xi · ops · proto` 파일 수정 · 새 표 · 현장 PWA · 남원 고정값 · GPU 2장 동시.

---

## 정직 항목
- 이 문서는 세 리뷰와 실측 스틸을 근거로 쓴 계획이며, 새로 서버를 띄우거나 GPU를 쓰지 않았다.
- `survey.py`에 대장 반입 엔드포인트가 0이라는 것은 grep으로 확인했다(`ledger` 0건). SURVEY-SPEC §3.2의 `registry/import`는 스펙만 있다.
- 글자 예산 수치는 리뷰 실측(로그인 454 · 분석 1,322 · 인프라 2,635)에서 역산한 목표이며 구현 뒤 e2e로 잰다.
- `system-v2.md`는 수정하지 않았다. §4 블록은 붙여 넣을 수 있는 제안이다.
