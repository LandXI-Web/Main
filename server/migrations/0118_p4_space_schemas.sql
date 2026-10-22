-- 0118_p4_space_schemas.sql — 비어 있는 기관 칸(스키마) 4개 정리(10-22 now21 저장보안-DB-빈칸 ⓐ · 바퀴 22 P4) · 멱등
--   기관마다 만들어 두었던 자료 칸 space_<기관>(0019) 4개는 표 · 함수가 0개다(2단 자리였으나 쓰지 않음). 빈 표 25개는 그대로 둔다.
--   지우기 전 보관: 02. 데이터/_backup/p4-20261022/spaces.json(공간 줄 · 칸 이름 · 권한) — 비어 있는 칸만 지운다(안에 무엇이든 있으면 남김).
--   앞으로: space_ensure_schema() 는 칸을 만들지 않고 NULL 을 돌려준다(공간 줄의 db_schema = NULL · 폴더 저장 'tenants/{기관}/space' 는 그대로).
-- 되돌리기: migrations/down/0118_p4_space_schemas.down.sql
SET LOCAL lock_timeout = '10s';
ALTER TABLE spaces ALTER COLUMN db_schema DROP NOT NULL;

DO $$ DECLARE r record; n int; BEGIN
  FOR r IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'space\_%' LOOP
    SELECT (SELECT count(*) FROM pg_class c WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = r.nspname))
         + (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = r.nspname))
         + (SELECT count(*) FROM pg_type t WHERE t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = r.nspname)) INTO n;
    IF n = 0 THEN
      EXECUTE format('DROP SCHEMA %I RESTRICT', r.nspname);
      UPDATE spaces SET db_schema = NULL, updated_at = now() WHERE db_schema = r.nspname;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION space_ensure_schema(t text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
BEGIN
  IF t IS NULL OR t !~ '^[a-z0-9][a-z0-9-]{1,40}$' THEN RAISE EXCEPTION 'space: bad tenant id'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = t) THEN RAISE EXCEPTION 'space: no tenant %', t; END IF;
  RETURN NULL;     -- 10-22: 빈 자료 칸을 만들지 않는다(기관 자료 칸이 필요해지면 그때 새 번호 마이그레이션으로)
END $f$;
REVOKE ALL ON FUNCTION space_ensure_schema(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION space_ensure_schema(text) TO landxi_app;
