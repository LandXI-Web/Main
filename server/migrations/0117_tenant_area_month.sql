-- 0117_tenant_area_month.sql — 기관 '이번 달 분석한 면적'을 작업이 끝날 때 한 번만 센다(10-22 now21 제안-면적작업끝한번 넣음) · 멱등
--   예전: 화면이 열릴 때마다(30분 · 1분 기억) 그 달 모든 작업 범위의 합집합을 다시 계산 — LX 는 한 번에 70초 · 5~7분, DB CPU 474%(10-21 impl-46).
--   이제: 작업이 끝나 사용량(area_km2)을 적는 순간 그 작업 범위 하나를 그 달 합집합에 더하고(겹친 곳은 한 번) 넓이를 적어 둔다 → 화면은 읽기만.
--   tenant_area_jobs = 이미 더한 작업(같은 작업을 두 번 더하지 않게). 범위가 없는 작업은 적힌 값을 extra_km2 에 더한다(지어내지 않음).
-- 되돌리기: migrations/down/0117_tenant_area_month.down.sql
CREATE TABLE IF NOT EXISTS tenant_area_month (
  tenant_id  text NOT NULL,
  month      date NOT NULL,
  geom       geometry,
  extra_km2  double precision NOT NULL DEFAULT 0,
  area_km2   double precision NOT NULL DEFAULT 0,
  jobs       integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, month)
);
CREATE TABLE IF NOT EXISTS tenant_area_jobs (
  tenant_id text NOT NULL,
  month     date NOT NULL,
  job_id    text NOT NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, month, job_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_area_month, tenant_area_jobs TO landxi_app, landxi_worker;
