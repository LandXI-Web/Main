-- 0019_spaces.sql — 기관 분기 공간 1단(구현 3차 · 확인 대장 13차 분기-2 확인 · 분기-3 ⓒ의 1단 '가벼운 칸' · 8차 API-형식 ⓐ · 원칙 38·39·59·72·85) · 멱등
--   1단 = 모든 기관의 가벼운 칸만: 기관마다 자료 칸(DB 범위 — 스키마 space_<기관>) · 저장 폴더(02. 데이터/tenants/<기관>/space) · 공간 기록.
--   상자(컨테이너) · 코드 2차 올리기 · 자동 점검 · 자원 배정은 2단(이번에 만들지 않는다 — mode 'box' 는 자리만).
--   spaces          기관 공간 한 칸(기관마다 한 줄 · 방식 = 가벼운 칸)
--   space_guides    결과 설명서 판 — 1차 서비스를 기관에 공개할 때(새 회차 · 새 서비스 버전) 서버가 저절로 만든다(여섯 칸 · 바뀐 점 한 줄)
--                   같은 지문(서비스 버전 × 결과 회차)이면 새 판을 만들지 않는다(되돌리기 · 다시 공개는 그 판으로 돌아간다)
--   space_log       공간 기록 — 공간 생김 · 새 판(= 공간 안 알림) · 내려받기 · 동의 · 부서 배정
--   space_reads     알림을 마지막으로 본 때(사람마다)
--   space_consents  내려받기 동의(원칙 59 — 동의 · 범위 · 기록) — 사람마다 한 번
--   space_assign    부서 사용자가 볼 서비스(원칙 38 — 부서는 자기 업무 서비스만) — 기관 관리자가 정한다
-- RLS: 기관 세션은 자기 기관 줄만(app.tenant_id) · LX(app.realm = 'lx')는 전부. 실행: postgres(소유자) — migrate.py.

CREATE TABLE IF NOT EXISTS spaces(
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'light' CHECK (mode IN ('light', 'box')),   -- light = 가벼운 칸(1단 · 모든 기관) · box = 상자(2단 · 필요한 기관만)
  db_schema text NOT NULL,                     -- 자료 칸(DB 범위) — space_<기관>
  folder text NOT NULL,                        -- 저장 폴더(02. 데이터 기준 상대 경로) — 화면 · 응답에 내지 않는다
  state text NOT NULL DEFAULT 'on' CHECK (state IN ('on', 'off')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS space_guides(
  id text PRIMARY KEY,                         -- sg_…
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  card_id text NOT NULL,                       -- 1차 서비스(카드)
  edition int NOT NULL,                        -- 판 — 기관 × 서비스마다 1, 2, …
  sig text NOT NULL,                           -- 지문(서비스 버전 × 결과 회차)
  body jsonb NOT NULL,                         -- 여섯 칸(무엇이 · 어디 · 언제 · 어떤 형식 · 믿을 만한 정도 · 버전) + 받기 칸
  change text,                                 -- 바뀐 점 한 줄(앞 판과 비교해 서버가 쓴다)
  published_at timestamptz,                    -- 공개한 때(기록에서 — 없으면 NULL · 지어내지 않는다)
  backfill boolean NOT NULL DEFAULT false,     -- 공간을 처음 만들 때 지난 공개분을 한 번 채운 판(알림을 새로 띄우지 않는다)
  created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, card_id, edition),
  UNIQUE (tenant_id, card_id, sig));
CREATE INDEX IF NOT EXISTS space_guides_t ON space_guides (tenant_id, card_id, edition DESC);

CREATE TABLE IF NOT EXISTS space_log(
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('space', 'guide', 'download', 'consent', 'assign')),
  card_id text,
  guide_id text,
  line text NOT NULL,                          -- 사람 말 한 줄(알림 · 기록)
  actor text,                                  -- 사람(계정 id) · 서버면 NULL
  realm text,
  detail jsonb,                                -- 내려받기 형식 · 건수 · 크기 등
  backfill boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS space_log_t ON space_log (tenant_id, at DESC);
CREATE INDEX IF NOT EXISTS space_log_kind ON space_log (tenant_id, kind, at DESC);

CREATE TABLE IF NOT EXISTS space_reads(
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id));

CREATE TABLE IF NOT EXISTS space_consents(
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  realm text NOT NULL,
  ver int NOT NULL DEFAULT 1,                  -- 동의 글 판(글이 바뀌면 다시 묻는다)
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id));

CREATE TABLE IF NOT EXISTS space_assign(
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,                       -- tenant_users.id(부서 사용자)
  card_id text NOT NULL,
  by_user text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, card_id));

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['spaces', 'space_guides', 'space_log', 'space_reads', 'space_consents', 'space_assign'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS space_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY space_isolation ON %I USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx') WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON spaces, space_guides, space_log, space_reads, space_consents, space_assign TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE space_log_id_seq TO landxi_app, landxi_worker;

-- 자료 칸(DB 범위) — 기관마다 스키마 하나(space_<기관>). 2단의 기관 자료 · 2차 결과가 들어갈 자리이고, 1단에서는 빈 칸이다.
-- 앱 역할(landxi_app)은 스키마를 만들 수 없으므로, 이름을 검사하는 이 함수 하나만 소유자 권한으로 부르게 한다(새 기관은 게이트웨이가 처음 볼 때 만든다).
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

-- 지금 있는 기관(서비스 사용자)마다 공간 한 칸 — 판 · 알림 · 지난 공개분 채우기(백필)는 게이트웨이(landxi_api/spaces.py)가 처음 볼 때 한 번 한다.
DO $$ DECLARE r record; s text; BEGIN
  FOR r IN SELECT id FROM tenants WHERE kind = 'user' AND coalesce(status, 'active') = 'active' LOOP
    s := space_ensure_schema(r.id);
    INSERT INTO spaces(tenant_id, mode, db_schema, folder) VALUES (r.id, 'light', s, 'tenants/' || r.id || '/space') ON CONFLICT (tenant_id) DO NOTHING;
  END LOOP;
END $$;
