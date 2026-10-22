-- 0121 되돌리기 — 기관 권한 계정의 칸막이 · 권한을 걷고 계정을 지운다(게이트웨이는 PG_TENANT_DSN 이 없으면 앱 계정으로 붙는다)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.relname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE p.polname = 'tenant_guard' LOOP
    EXECUTE format('DROP POLICY tenant_guard ON public.%I', r.relname);
  END LOOP;
END $$;
DROP PROCEDURE IF EXISTS lx_tenant_role_sync(jsonb);
DROP FUNCTION IF EXISTS lx_tenant_role_sync();
DROP FUNCTION IF EXISTS lx_tenant_branch(text);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'landxi_tenant') THEN
    EXECUTE 'REASSIGN OWNED BY landxi_tenant TO postgres';
    EXECUTE 'DROP OWNED BY landxi_tenant';
    EXECUTE 'DROP ROLE landxi_tenant';
  END IF;
END $$;
