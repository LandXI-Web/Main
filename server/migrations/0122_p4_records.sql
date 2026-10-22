-- 0122_p4_records.sql — 바퀴 22 P4 채택 제안(10-22 now21) · 멱등
--   ① 기관 공유 이력(저장보안-제안-공유이력): 언제 어느 기관에 어느 서비스 판 · 영상을 공유했다가 바꿨는지 · 거뒀는지 — 한 줄씩 쌓는다(지우지 않음).
--      배포(deploys) · 영상 공유(imagery_shares) 표에 붙은 방아쇠가 적는다(앱 코드 어느 길로 바뀌어도 남는다). 누가 = 세션 사용자(app.user_id).
--   ② 결과와 작업의 연결 규칙(저장보안-제안-결과작업연결): 결과 줄(detections · survey_parcel_ai)의 job_id 는
--      실제 작업(jobs) 이거나 이름 있는 결과 판(result_sources)이어야 한다. 'job_' 로 시작하는데 작업이 없으면 넣지 못한다.
--      이름 있는 판(옛 정적 세트 등)은 처음 들어올 때 result_sources 에 저절로 적힌다(무엇이 있는지 한 표에서 본다).
--   ③ 저장 현황 가볍게(저장보안-제안-저장현황가볍게): 작업이 끝날 때 결과 파일 크기를 jobs.result_bytes 에 적는다 — 저장 현황은 폴더를 훑지 않고 더한다.
--   ④ 해외 기관 이름 규칙(저장보안-제안-해외폴더이름): 새 해외 기관(scope global)의 id = 나라 코드(ISO 2자리) + '-' + 이름(예: kg-chuy).
--      기관 id 가 곧 폴더 이름(tenants/{기관} · results/{기관})이라 국내 시군구 5자리 · 다른 나라와 겹치지 않는다. 이미 있는 기관은 그대로.
-- 되돌리기: migrations/down/0122_p4_records.down.sql
SET LOCAL lock_timeout = '10s';

-- ① 공유 이력 ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS share_history (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  tenant_id  text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('service', 'imagery')),
  ref_id     text NOT NULL,              -- 배포 id · 영상 id
  card_id    text,
  action     text NOT NULL CHECK (action IN ('share', 'update', 'unshare', 'backfill')),
  edition    text,                       -- 그때 기관에 나간 판(배포 결과 세트) · 단계
  stage      text,
  by_user    text,
  detail     jsonb
);
CREATE INDEX IF NOT EXISTS share_history_t ON share_history (tenant_id, at DESC);
CREATE INDEX IF NOT EXISTS share_history_ref ON share_history (kind, ref_id, at DESC);
GRANT SELECT, INSERT ON share_history TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE share_history_id_seq TO landxi_app, landxi_worker;
ALTER TABLE share_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS share_history_rls ON share_history;
CREATE POLICY share_history_rls ON share_history
  USING ((tenant_id = (SELECT current_setting('app.tenant_id', true))) OR ((SELECT current_setting('app.realm', true)) = 'lx'))
  WITH CHECK ((tenant_id = (SELECT current_setting('app.tenant_id', true))) OR ((SELECT current_setting('app.realm', true)) = 'lx'));

CREATE OR REPLACE FUNCTION lx_share_history_deploys() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
DECLARE who text := nullif(current_setting('app.user_id', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT coalesce(NEW.test, false) THEN
      INSERT INTO share_history(tenant_id, kind, ref_id, card_id, action, edition, stage, by_user, detail)
      VALUES (NEW.tenant_id, 'service', NEW.id, NEW.card_id, 'share', NEW.snapshot_current, NEW.stage, who,
              jsonb_build_object('card_version', NEW.card_version_id, 'sgg_cd', NEW.sgg_cd, 'name', NEW.name));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT coalesce(NEW.test, false) AND (NEW.snapshot_current IS DISTINCT FROM OLD.snapshot_current OR NEW.stage IS DISTINCT FROM OLD.stage
        OR NEW.card_version_id IS DISTINCT FROM OLD.card_version_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
      INSERT INTO share_history(tenant_id, kind, ref_id, card_id, action, edition, stage, by_user, detail)
      VALUES (NEW.tenant_id, 'service', NEW.id, NEW.card_id, CASE WHEN NEW.stage = 'rolled_back' THEN 'unshare' ELSE 'update' END,
              NEW.snapshot_current, NEW.stage, who,
              jsonb_build_object('before', jsonb_build_object('edition', OLD.snapshot_current, 'stage', OLD.stage, 'card_version', OLD.card_version_id),
                                 'card_version', NEW.card_version_id));
    END IF;
    RETURN NEW;
  ELSE
    IF NOT coalesce(OLD.test, false) THEN
      INSERT INTO share_history(tenant_id, kind, ref_id, card_id, action, edition, stage, by_user, detail)
      VALUES (OLD.tenant_id, 'service', OLD.id, OLD.card_id, 'unshare', OLD.snapshot_current, OLD.stage, who, jsonb_build_object('deleted', true));
    END IF;
    RETURN OLD;
  END IF;
END $f$;
DROP TRIGGER IF EXISTS share_history_deploys ON deploys;
CREATE TRIGGER share_history_deploys AFTER INSERT OR UPDATE OR DELETE ON deploys FOR EACH ROW EXECUTE FUNCTION lx_share_history_deploys();

CREATE OR REPLACE FUNCTION lx_share_history_imagery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
DECLARE who text := nullif(current_setting('app.user_id', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO share_history(tenant_id, kind, ref_id, action, by_user) VALUES (NEW.tenant_id, 'imagery', NEW.imagery_id, 'share', coalesce(NEW.shared_by, who));
    RETURN NEW;
  END IF;
  INSERT INTO share_history(tenant_id, kind, ref_id, action, by_user) VALUES (OLD.tenant_id, 'imagery', OLD.imagery_id, 'unshare', who);
  RETURN OLD;
END $f$;
DROP TRIGGER IF EXISTS share_history_imagery ON imagery_shares;
CREATE TRIGGER share_history_imagery AFTER INSERT OR DELETE ON imagery_shares FOR EACH ROW EXECUTE FUNCTION lx_share_history_imagery();

-- 지금 공유된 것을 처음 한 줄로(언제부터인지는 배포를 만든 때 · 영상은 공유한 때)
INSERT INTO share_history(at, tenant_id, kind, ref_id, card_id, action, edition, stage, detail)
SELECT coalesce(d.created_at, now()), d.tenant_id, 'service', d.id, d.card_id, 'backfill', d.snapshot_current, d.stage,
       jsonb_build_object('note', '이력 표를 만들기 전부터 있던 공유(10-22)', 'card_version', d.card_version_id)
FROM deploys d WHERE NOT coalesce(d.test, false)
  AND NOT EXISTS (SELECT 1 FROM share_history h WHERE h.kind = 'service' AND h.ref_id = d.id);
INSERT INTO share_history(at, tenant_id, kind, ref_id, action, by_user, detail)
SELECT coalesce(s.shared_at, now()), s.tenant_id, 'imagery', s.imagery_id, 'backfill', s.shared_by, jsonb_build_object('note', '이력 표를 만들기 전부터 있던 공유(10-22)')
FROM imagery_shares s
WHERE NOT EXISTS (SELECT 1 FROM share_history h WHERE h.kind = 'imagery' AND h.ref_id = s.imagery_id AND h.tenant_id = s.tenant_id);

-- ② 결과와 작업의 연결 규칙 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS result_sources (
  id          text PRIMARY KEY,            -- 결과 줄의 job_id 값(이름 있는 판 · 예: results/lx/namwon-landcover-2023)
  kind        text NOT NULL DEFAULT 'static' CHECK (kind IN ('static', 'published')),
  note        text,
  first_seen  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON result_sources TO landxi_app;
GRANT SELECT, INSERT, UPDATE ON result_sources TO landxi_worker;
INSERT INTO result_sources(id, note)
SELECT DISTINCT job_id, '옛 판 결과(파일에서 넣은 것 · 10-22 연결 규칙 전부터)' FROM detections WHERE job_id NOT LIKE 'job\_%' ON CONFLICT DO NOTHING;
INSERT INTO result_sources(id, note)
SELECT DISTINCT job_id, '옛 판 결과(필지 결합 · 10-22 연결 규칙 전부터)' FROM survey_parcel_ai WHERE job_id NOT LIKE 'job\_%' ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION lx_result_link_check() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
DECLARE bad text;
BEGIN
  SELECT n.job_id INTO bad FROM (SELECT DISTINCT job_id FROM nr) n
  WHERE n.job_id LIKE 'job\_%' AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = n.job_id) LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '결과 줄의 작업 번호 % 가 작업 목록에 없습니다(결과-작업 연결 규칙 · 0122)', bad USING ERRCODE = 'foreign_key_violation';
  END IF;
  INSERT INTO result_sources(id, note)
  SELECT DISTINCT n.job_id, TG_TABLE_NAME || ' 에 처음 들어온 이름 있는 판' FROM nr n
  WHERE n.job_id IS NOT NULL AND n.job_id NOT LIKE 'job\_%' ON CONFLICT DO NOTHING;
  RETURN NULL;
END $f$;
DROP TRIGGER IF EXISTS result_link_ins ON detections;
CREATE TRIGGER result_link_ins AFTER INSERT ON detections REFERENCING NEW TABLE AS nr FOR EACH STATEMENT EXECUTE FUNCTION lx_result_link_check();
DROP TRIGGER IF EXISTS result_link_upd ON detections;
CREATE TRIGGER result_link_upd AFTER UPDATE ON detections REFERENCING NEW TABLE AS nr FOR EACH STATEMENT EXECUTE FUNCTION lx_result_link_check();
DROP TRIGGER IF EXISTS result_link_ins ON survey_parcel_ai;
CREATE TRIGGER result_link_ins AFTER INSERT ON survey_parcel_ai REFERENCING NEW TABLE AS nr FOR EACH STATEMENT EXECUTE FUNCTION lx_result_link_check();

-- ③ 결과 파일 크기(작업이 끝날 때 적음) ─────────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result_bytes bigint;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result_bytes_at timestamptz;

-- ④ 새 해외 기관 id = 나라 코드 2자리 + '-' (이미 있는 기관은 그대로) ───────────────────────────
CREATE OR REPLACE FUNCTION lx_tenant_id_rule() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.scope = 'global' AND NEW.id !~ '^[a-z]{2}-[a-z0-9][a-z0-9-]*$' THEN
    RAISE EXCEPTION '해외 기관 id 는 나라 코드 두 글자 + - + 이름(예: kg-chuy) — 받은 값 %', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.scope IS DISTINCT FROM 'global' AND NEW.id ~ '^[0-9]' THEN
    RAISE EXCEPTION '기관 id 는 숫자로 시작하지 않는다(시군구 코드 폴더와 겹침) — 받은 값 %', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS tenant_id_rule ON tenants;
CREATE TRIGGER tenant_id_rule BEFORE INSERT ON tenants FOR EACH ROW EXECUTE FUNCTION lx_tenant_id_rule();
