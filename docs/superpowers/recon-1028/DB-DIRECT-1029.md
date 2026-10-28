# 운영 DB 직접 수정 3건 — 변경 전 · 후 기록 (2026-10-29 · 지시서 v7.1 §0)

> 10-28 작업 중 운영 DB(`landxi`)를 시험 DB 없이 바로 고친 3건. 지시대로 **운영은 되돌리지 않고**, 같은 변경을 시험 DB(`landxi_test`)에 적용했다.
> 앞으로 DB 변경은 시험 DB → 검사 → 운영 순서만.

## 어떻게 찾았나
- 10-28 03:30 · 10-29 03:30 매일 백업(`02. 데이터/_backup/db/daily/`)에서 `card_info` · `change_ranges` 만 꺼내 서로 비교 + 지금 운영 값과 비교.
- 구간 4건은 감사 기록(`audit_log`, 읽기만)의 '구간 만들기' 기록(만들 때 출처 칸 값)과 지금 값을 비교.
- 고치기 전 두 DB 해당 줄 백업: `02. 데이터/_backup/v71/db-direct-before.landxi.json` · `db-direct-before.landxi_test.json` (10-29 07:30)

## 3건

| # | 무엇 | 운영 변경 전 | 운영 변경 후(지금 · 그대로 둠) | 시험 DB 적용 (10-29 07:31) |
|---|---|---|---|---|
| 1 | 점유의심 조사 카드 영상 칩 `card_info.imagery_kinds` (card-occupy) | 비어 있음(NULL — 같은 마이그레이션 0133 으로 만든 시험 DB 값이 NULL) | `{항공}` | **적용 · 1줄** → `{항공}` (두 DB 같음) |
| 2 | 이지목 현황 카드 그림 범례 낱말 `card_info.swipe.legend` (card-ijimok) | `정상_지목일치` (밑줄) — 변경 전 스냅숏은 없음. 같은 그림의 후보 목록(`swipe.cands`)에 그때 만든 밑줄 말이 그대로 남아 있어 이 값으로 봄 | `정상 지목일치` (띄어쓰기). 점유의심 카드 범례(`지목미정리` · `점유의심`)는 밑줄이 없어 바뀐 것 없음 | **적용했으나 0줄** — 시험 DB 두 카드는 카드 그림(`swipe`) 자체가 없음(NULL). 같은 명령(범례 말의 밑줄 → 띄어쓰기)은 바꿀 대상이 없음 |
| 3 | 구간 4건 출처 `change_ranges.origin` | 4건 모두 NULL (감사 기록 '구간 만들기' 10-28 22:04~22:40, `origin: null`) | 4건 모두 `card` (카드 대상지 목록에 보이게) | **적용했으나 0줄** — 시험 DB 에 이 4개 구간이 없음(운영에서 kec-land 계정이 만든 구간) |

구간 4건(운영):

| 구간 | 이름 | 만든 때 |
|---|---|---|
| rng_025d5de1b4b5 | 서울세종고속도로 안성 보개면 구간(창) | 10-28 22:04:32 |
| rng_37c5218bf932 | 서울세종고속도로 안성 보개면 구간(토지마스터) | 10-28 22:04:36 |
| rng_efca1415c0ac | 광산구 철도용지 | 10-28 22:04:51 |
| rng_5cb0ed18f321 | 서울세종고속도로 안성 보개면 구간(창 · 가장자리 필지 포함) | 10-28 22:40:16 |

## 시험 DB 에 실제로 실행한 것 (접속: `postgresql://postgres:***@127.0.0.1:5433/landxi_test`)
```sql
UPDATE card_info SET imagery_kinds = ARRAY['항공'] WHERE card_id='card-occupy' AND imagery_kinds IS DISTINCT FROM ARRAY['항공'];        -- 1줄
UPDATE card_info SET swipe = jsonb_set(swipe,'{legend}', (범례 말의 '_' → ' '))
 WHERE card_id IN ('card-ijimok','card-occupy') AND swipe ? 'legend' AND swipe->>'legend' LIKE '%\_%';                                  -- 0줄(swipe 없음)
UPDATE change_ranges SET origin='card' WHERE id = ANY('{rng_025d5de1b4b5,rng_37c5218bf932,rng_efca1415c0ac,rng_5cb0ed18f321}') AND origin IS DISTINCT FROM 'card';  -- 0줄(구간 없음)
```

## 남은 차이 (PM 판단)
- 2 · 3번은 시험 DB 에 대상 줄이 없어서 '같은 변경'을 해도 두 DB 값이 같아지지 않는다. 같게 하려면 운영의 카드 그림(`swipe` · `scene` · `scenes`)과 구간 4건을 시험 DB 로 **복사**해야 한다. 지시 밖이라 하지 않았다.
- 범례 말은 그 뒤 서버 코드(`card_cover.py` 범례 낱말 표)에서 띄어쓰기로 나오게 이미 고쳐져 있어, 새로 만드는 카드 그림은 두 DB 모두 띄어쓰기로 나온다.

## 이번(10-29 · v7.1) 작업의 DB 변경 — 시험 DB → 확인 → 운영 순서
| 무엇 | 시험 DB | 운영 |
|---|---|---|
| 카드 ①②③ 장면 목록(`card_info.scenes`)에서 예전 그림 빼기(새 그림은 장면 올리기 API 로 올림) | 먼저 실행 · 3줄(국토 변화 카드의 남원 그림 목록 비움 · 나머지 둘은 원래 비어 있음) | 다음 실행 · 3줄 → 남은 장면 = 새로 올린 그림만 |
| 첫 판 그림(글자 겹침 · 표 잘림으로 다시 그림) 장면 목록에서 빼기 | 먼저 실행 · 0줄(시험 DB 에 없음) | 2줄(국토 변화 · 점유의심 카드) |
- 백업: `02. 데이터/_backup/v71/card-images/card_info.before.{landxi,landxi_test}.json` + 그림 파일 82장 복사(`files/`). 파일 자체는 지우지 않음(카드 그림 후보 목록 '되돌리기'가 아직 가리킴).
- lx.demo 업로드 시험 정리(운영 · 앱이 만든 줄): `imagery` 2줄 · `request_uploads` 2줄 지움 — 백업 `02. 데이터/_backup/v71/lxdemo-upload-{a,b}/rows.json` + 파일. `audit_log` 는 건드리지 않음.
