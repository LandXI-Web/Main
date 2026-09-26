# F1-C 보고 — 관리자 관제 LX/OPS (2026-09-26 재개분)

## 이번 재개에서 한 일
- `serve-ops.mjs`(:8702) 재기동 → 브리지·폴러 정상(gpu_poller `nv_dispwi` nvidia-smi + PDH · storage_poller · Redis 6380).
- e2e 재실행: 이전 기록(09-24)의 유일한 실패 `f1c-infra-live` 큐 행 테스트 포함 **29/29 통과**.
- `shots/f1/C/tools/standin_worker.py`: nvidia-smi 고정 경로(옛 드라이버 폴더 — 597.16에서 실패)를 **실제로 응답하는 DriverStore nvidia-smi 자동 선택**으로 수정.
- 코드 변경(20:52) 뒤라 판정 영상을 **재녹화**(50.5s · GPU 두 장 한가 확인 후 · GPU 0 한 장만 사용) · mp4 변환 · 100ms 스트립 6장 · 영상 정지 10장 · 정지 화면 1280/1440/1920 × 5화면 · off 모드 · 레퍼런스 나란히 2장 전부 재생성.
- 결과 문서 `F1-C-result.md` 작성(레퍼런스 장치표 · 세 사용자 점검 · 계약 변경 요청 6).

## 변경·산출 파일(소유 범위 안)
- `landxi/ops/**` — serve-ops.mjs · login/index/infra/tenants/deploys.html · ops.css · js 12 · data(fixtures 13 · replay · i18n)
- `landxi/assets/css/v2/ops-grid.css`
- `server/ops/{gpu_poller.py, storage_poller.py, run-pollers.ps1, README.md}`
- `tests/e2e/f1c-{contract,deploys-rollback-port,infra-live,login-flip,motion-law,origin-guard,tenants-quota}.spec.mjs`
- `shots/f1/C/**` (영상 · 스트립 · 정지 · 로그 · tools)
- `docs/superpowers/blueprint/f1/F1-C-result.md`, 이 보고서
- 사본: `shots/f1/F1-C/`(워크플로 지정 경로 · 핵심 영상·스트립·정지 복사본)

## 실행 방법
```
node landxi/ops/serve-ops.mjs                       # :8702 · 폴러 자동 기동(OPS_NO_POLLERS=1 로 끔)
python shots/f1/C/tools/standin_worker.py           # J1 대체 워커(GPU 0 한 장 · STANDIN_GPUS=1 로 변경)
node shots/f1/C/tools/record.mjs                    # 판정 영상(GPU 두 장 한가일 때만 시작)
node shots/f1/C/tools/stills.mjs                    # 정지 화면
npx playwright test tests/e2e/f1c- --workers=1      # 29 테스트
python server/ops/gpu_poller.py --stdout --once --redis=      # 폴러 단독
python server/ops/storage_poller.py --stdout --once --redis=
```
열기: http://localhost:8702/landxi/ops/login.html (lx-admin · DEV_PASSWORD)

## 실측 수치(녹화 2026-09-26 21:06–21:07)
- 반전 1600ms(테스트 1600±60 통과) · marks flip.start 6.2s → flip.done 7.9s(클릭 지연 포함)
- J1 대체: car_v2_obb · 익산 황등 1.36cm · 170 shard / 10.7s(≈15.9 칩/s) · 79 검출 · 후속 60 shard / 4.1s
- GPU0 사용률 0 → 34%(녹화 프레임) → 하강 · 워커 VRAM 1,392 MiB · 외부 점유 31,982 MiB(GPU0) / 33,374 MiB(GPU1) · 64/66°C · 131.8/96.5W
- 스토리지 E: 2,065 GB 여유(72%) · D: 363 GB(95%) · C: 104 GB(89%)
- 리더선 등장 = 큐 행 뒤 2.3s(배정 순간) · 롤백 → 스냅샷 76,215 교체 < 0.1s · 이식 POST → draft 도착 3.0s

## 폴백 여부
- **예, 부분 폴백.** F1-B 게이트웨이(:8700)는 떠 있고 SSE(`/events/ops`)는 중계 중(367 이벤트)이지만 `/ops/gpus`가 500이라 관제 쓰기·조회는 `serve-ops` 로컬 브리지(계약 §4.7–4.9 상태기계 · 폴러 실측 직결)를 쓴다. 화면 마스트에 `실측 · 로컬 브리지 · 게이트웨이 중계` 표기. 브리지 상태는 프로세스 메모리(재기동 = 픽스처 시드로 복귀).
- J1은 F1-B gpu_worker 대신 `standin_worker.py`(실제 GPU 추론)로 대체 — 영상 큐 행 라벨 `J1 대체`로 표기.
- off 모드는 픽스처 + 리플레이(util 0 고정 · `시연` 표기) · 쓰기 버튼 disabled + 이유.

## 남은 것
1. F1-B `/ops/gpus` 500 복구 → 게이트웨이 직결 전환 확인(`tools/gw-probe.mjs` 준비됨 · 09-26 20:41 직결 5화면 콘솔 오류 0 기록 있음).
2. F1-B 실제 gpu_worker 합류 시 standin 폐기 · 영상 12–30s를 진짜 J1으로 재녹화(F1-B 화면 반화면 동시 녹화는 미수행 — 이번 영상은 관제 단일 화면).
3. 브리지 상태 영속화(PostGIS) — 현재 메모리.
4. 원본 관리자 4화면(카드 발행·데이터·서비스·MY)은 4173 원본 링크(2차 이식).
5. 계약 변경 요청 6건(`F1-C-result.md` §4) 반영 여부 결정.
