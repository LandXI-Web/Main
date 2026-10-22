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

-- 10-22 같은 날 고침: 합집합 한 덩어리(LX 이번 달 586만 꼭짓점)에 작은 범위 하나를 더하는 데 104초 — 겹치지 않는 조각들로 둔다.
-- 새 작업 범위에서 이미 센 곳(겹치는 조각을 그 범위 상자로 잘라 낸 것)을 빼고 남은 곳만 새 조각으로 넣는다(합치지 않음 · 위치 색인).
-- 넓이 = 조각 넓이 합 + 범위 없는 작업의 적힌 값.
CREATE TABLE IF NOT EXISTS tenant_area_parts (
  tenant_id text NOT NULL,
  month     date NOT NULL,
  geom      geometry NOT NULL,
  area_km2  double precision NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tenant_area_parts_geom ON tenant_area_parts USING gist (geom);
CREATE INDEX IF NOT EXISTS tenant_area_parts_tm ON tenant_area_parts (tenant_id, month);
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_area_parts TO landxi_app, landxi_worker;

-- 작업 하나 더하기(작업기 metering.add_area · 게이트웨이가 빠진 작업을 채울 때 같은 함수) — 같은 기관 · 같은 달은 한 번에 하나(잠금)
CREATE OR REPLACE FUNCTION tenant_area_add(p_t text, p_m date, p_job text, p_amt double precision) RETURNS void LANGUAGE plpgsql AS $$
DECLARE g geometry; u geometry;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('tenant_area:' || p_t || ':' || p_m::text));
  INSERT INTO tenant_area_jobs(tenant_id, month, job_id) VALUES (p_t, p_m, p_job) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO tenant_area_month(tenant_id, month) VALUES (p_t, p_m) ON CONFLICT DO NOTHING;
  SELECT CASE WHEN j.aoi IS NULL THEN NULL WHEN i.footprint IS NULL THEN ST_MakeValid(j.aoi)
              ELSE ST_Intersection(ST_MakeValid(j.aoi), ST_MakeValid(i.footprint)) END INTO g
    FROM jobs j LEFT JOIN imagery i ON i.id = j.imagery_id WHERE j.id = p_job;
  IF g IS NULL OR ST_IsEmpty(g) THEN
    UPDATE tenant_area_month SET extra_km2 = extra_km2 + coalesce(p_amt, 0) WHERE tenant_id = p_t AND month = p_m;
  ELSE
    g := ST_CollectionExtract(ST_MakeValid(g), 3);
    SELECT ST_Union(ST_MakeValid(ST_ClipByBox2D(p.geom, ST_Envelope(g)))) INTO u
      FROM tenant_area_parts p WHERE p.tenant_id = p_t AND p.month = p_m AND p.geom && g;
    IF u IS NOT NULL AND NOT ST_IsEmpty(u) THEN
      g := ST_Difference(g, ST_CollectionExtract(ST_MakeValid(u), 3));
    END IF;
    INSERT INTO tenant_area_parts(tenant_id, month, geom, area_km2)
      SELECT p_t, p_m, d.geom, ST_Area(d.geom::geography) / 1e6 FROM ST_Dump(ST_CollectionExtract(ST_MakeValid(g), 3)) d
       WHERE NOT ST_IsEmpty(d.geom) AND ST_Area(d.geom) > 0;
  END IF;
  UPDATE tenant_area_month SET area_km2 = (SELECT coalesce(sum(area_km2), 0) FROM tenant_area_parts WHERE tenant_id = p_t AND month = p_m) + extra_km2,
         jobs = (SELECT count(*) FROM tenant_area_jobs WHERE tenant_id = p_t AND month = p_m), updated_at = now()
   WHERE tenant_id = p_t AND month = p_m;
END $$;
GRANT EXECUTE ON FUNCTION tenant_area_add(text, date, text, double precision) TO landxi_app, landxi_worker;
