-- 0118 되돌리기 — 기관 자료 칸(빈 스키마)을 다시 만들고 공간 줄에 이름을 다시 적는다(만들 때와 같은 함수 · 0019)
CREATE OR REPLACE FUNCTION space_ensure_schema(t text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
DECLARE s text;
BEGIN
  IF t IS NULL OR t !~ '^[a-z0-9][a-z0-9-]{1,40}$' THEN RAISE EXCEPTION 'space: bad tenant id'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = t) THEN RAISE EXCEPTION 'space: no tenant %', t; END IF;
  s := 'space_' || replace(t, '-', '_');
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', s);
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', s);
  EXECUTE format('COMMENT ON SCHEMA %I IS %L', s, '기관 공간 자료 칸(' || t || ') — 2단: 기관 자료 · 2차 결과');
  RETURN s;
END $f$;
REVOKE ALL ON FUNCTION space_ensure_schema(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION space_ensure_schema(text) TO landxi_app;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tenant_id FROM spaces WHERE db_schema IS NULL LOOP
    UPDATE spaces SET db_schema = space_ensure_schema(r.tenant_id) WHERE tenant_id = r.tenant_id;
  END LOOP;
END $$;
ALTER TABLE spaces ALTER COLUMN db_schema SET NOT NULL;
