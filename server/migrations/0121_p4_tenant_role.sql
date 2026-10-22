-- 0121_p4_tenant_role.sql — 기관 칸막이를 DB 권한으로(10-22 now21 저장보안-DB-칸막이 ⓐ 단계적 · 이번 = 1단계) · 멱등
--   예전: 앱 계정 하나(landxi_app)가 모든 화면을 받았다. 칸막이(RLS)는 'app.realm = lx' 이면 다 보이게 되어 있어,
--         기관 화면이 LX 권한으로 붙으면 앱 코드의 거름 조건 하나하나에 기댔다(DB-AUDIT 4절 · 86%).
--   1단계: 기관 권한 계정 landxi_tenant — 기관 세션(realm tenant)의 DB 접속은 이 계정으로 붙는다(landxi_api/deps.db).
--          이 계정에는 '되돌릴 수 없는 칸막이'(RESTRICTIVE 정책 tenant_guard)가 붙는다: app.realm 을 lx 로 바꿔도 그 기관 행 · 볼 수 있는 시군구만.
--          LX 권한(landxi_app)은 관리 화면 · 작업이 쓴다. 기관 화면이 LX 권한으로 붙는 곳을 기관 권한으로 옮기는 일은 2단계(파일별 목록 P4-RESULT.md).
--   비밀번호는 server/.env(PG_TENANT_PASSWORD)에만 — migrate.py 가 값이 있으면 이 계정을 접속 가능으로 바꾸며 넣는다(저장소에 값 0 · 원칙 307).
--   권한(표 · 순서 · 함수)은 앱 계정과 같게, 나눈 칸(파티션)은 직접 읽지 못하게 — CALL lx_tenant_role_sync(NULL) 이 기동 때마다 맞춘다(새 표도 저절로).
--   칸막이 정책은 표마다 따로 맺는다(잠금 3초 · 표 하나씩 커밋 — 쓰는 중인 표는 다음 기동 때). 이 파일은 정의만 하고, migrate.py 가 부른다.
-- 되돌리기: migrations/down/0121_p4_tenant_role.down.sql
SET LOCAL lock_timeout = '10s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'landxi_tenant') THEN
    CREATE ROLE landxi_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO landxi_tenant', current_database()); END $$;
GRANT USAGE ON SCHEMA public TO landxi_tenant;

-- 칸막이 식: 기존 허용 정책들(PERMISSIVE)의 '기관 쪽' 조건만 남긴 것(app.realm = 'lx' 갈래 → false · realm 목록에서 lx 를 뺌).
CREATE OR REPLACE FUNCTION lx_tenant_branch(e text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE s text := e;
BEGIN
  IF s IS NULL THEN RETURN NULL; END IF;
  s := replace(s, '(( SELECT current_setting(''app.realm''::text, true) AS current_setting) = ''lx''::text)', 'false');
  s := replace(s, '(current_setting(''app.realm''::text, true) = ''lx''::text)', 'false');
  s := replace(s, 'ARRAY[''lx''::text, ''tenant''::text]', 'ARRAY[''tenant''::text]');
  s := replace(s, 'ARRAY[''tenant''::text, ''lx''::text]', 'ARRAY[''tenant''::text]');
  IF s ~ '''lx''' THEN RETURN NULL; END IF;        -- 모르는 모양 — 손으로 보게(이 표는 칸막이를 만들지 않고 알림)
  RETURN s;
END $f$;

DROP FUNCTION IF EXISTS lx_tenant_role_sync();
CREATE OR REPLACE PROCEDURE lx_tenant_role_sync(INOUT result jsonb DEFAULT NULL) LANGUAGE plpgsql AS $f$
DECLARE
  r record; u text; w text; made int := 0; same int := 0; odd text[] := '{}'; busy text[] := '{}'; parts int := 0; cur text;
BEGIN
  -- ① 권한: 앱 계정이 가진 표 권한을 그대로(나눈 칸 · 파티션은 빼고 · 거둔다)
  FOR r IN SELECT g.table_name, string_agg(DISTINCT g.privilege_type, ', ') AS privs
           FROM information_schema.role_table_grants g JOIN pg_class c ON c.relname = g.table_name
           JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
           WHERE g.grantee = 'landxi_app' AND g.table_schema = 'public' AND NOT c.relispartition AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
             AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
           GROUP BY g.table_name LOOP
    EXECUTE format('GRANT %s ON public.%I TO landxi_tenant', r.privs, r.table_name);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
           WHERE c.relispartition AND c.relkind IN ('r', 'p') LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM landxi_tenant', r.relname);
    parts := parts + 1;
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
           WHERE c.relkind = 'S' AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('landxi_app', c.oid, 'USAGE') ELSE false END LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO landxi_tenant', r.relname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
           WHERE has_function_privilege('landxi_app', p.oid, 'EXECUTE') AND p.prokind = 'f'
             AND NOT has_function_privilege('landxi_tenant', p.oid, 'EXECUTE') LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO landxi_tenant', r.fn);
  END LOOP;
  -- ② 칸막이: RLS 가 켜진 표마다 RESTRICTIVE 정책 하나(landxi_tenant 에만)
  FOR r IN SELECT c.oid, c.relname,
                  string_agg('(' || coalesce(lx_tenant_branch(pg_get_expr(p.polqual, p.polrelid)), 'NULL') || ')', ' OR ') AS uq,
                  string_agg('(' || coalesce(lx_tenant_branch(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), pg_get_expr(p.polqual, p.polrelid))), 'NULL') || ')', ' OR ') AS wq,
                  bool_or(lx_tenant_branch(pg_get_expr(p.polqual, p.polrelid)) IS NULL AND p.polqual IS NOT NULL) AS bad
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
           JOIN pg_policy p ON p.polrelid = c.oid AND p.polpermissive AND p.polname <> 'tenant_guard'
           WHERE c.relrowsecurity AND NOT c.relispartition
           GROUP BY c.oid, c.relname LOOP
    IF r.bad THEN
      odd := odd || r.relname::text;
      CONTINUE;
    END IF;
    u := r.uq; w := r.wq;
    SELECT pg_get_expr(p.polqual, p.polrelid) INTO cur FROM pg_policy p WHERE p.polrelid = r.oid AND p.polname = 'tenant_guard';
    IF cur IS NOT NULL THEN
      -- 같은 식이면 그대로(기동 때마다 표를 잠그지 않게) — 식이 바뀐 표만 다시 만든다
      IF EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = r.oid AND p.polname = 'tenant_guard'
                 AND obj_description(p.oid, 'pg_policy') = md5(u || '|' || w)) THEN
        same := same + 1;
        CONTINUE;
      END IF;
    END IF;
    BEGIN
      PERFORM set_config('lock_timeout', '3s', true);
      IF cur IS NOT NULL THEN
        EXECUTE format('DROP POLICY tenant_guard ON public.%I', r.relname);
      END IF;
      EXECUTE format('CREATE POLICY tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO landxi_tenant USING (%s) WITH CHECK (%s)', r.relname, u, w);
      EXECUTE format('COMMENT ON POLICY tenant_guard ON public.%I IS %L', r.relname, md5(u || '|' || w));
      made := made + 1;
    EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
      busy := busy || r.relname::text;               -- 지금 쓰는 중인 표 — 다음 기동 때 맺는다(그동안 이 표는 앱 계정 정책만)
    END;
    COMMIT;                                          -- 표 하나씩(잠금을 오래 쥐지 않게)
  END LOOP;
  result := jsonb_build_object('guards_made', made, 'guards_same', same, 'busy', to_jsonb(busy), 'unknown_shape', to_jsonb(odd), 'partitions_closed', parts);
END $f$;
REVOKE ALL ON PROCEDURE lx_tenant_role_sync(jsonb) FROM PUBLIC;
