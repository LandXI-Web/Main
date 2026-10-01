-- 0015 옛 아이디 → 메일 아이디(원칙 77 · 확인 대장 PW-4 · 구현 2차 정리 작업 10-01)
-- 옛 계정이 가진 것(프로젝트 · 프로젝트장 · 구성원 · 결재 기록 · 카드 공개 승인 · 분석 작업 · 대장 · 최근 대장 · 의뢰 · 검토 요청 · 실태조사 처리 ·
-- AI 도우미 대화 · 학습 표본 · 영상 등록 · 공유 등)을 새 메일 계정으로 옮긴다:
--   LX 직원 lx-staff → test@lx.or.kr(u_mail_test) · LX 관리자 lx-admin · lxadmin → lxadmin@lx.or.kr(u_mail_lxadmin)
--   기관 옛 계정({기관}-manager · gj-manager · 별칭 · lxadmin) → 그 기관의 lxadmin@lx.or.kr(u_{기관}_mail_lxadmin)
-- 옛 계정은 지우지 않고 '사용 중지'(status 'disabled' — 로그인 · 아이디 찾기 · 비밀번호 찾기 0, 세션 삭제).
-- 영업 lx-sales 는 아이디만 sales@lx.or.kr 로 바꾼다(기본값 — 사용자가 정하지 않음) · 비밀번호는 메일 계정과 같은 임시 값(해시를 복사 — 값은 어디에도 적지 않는다).
-- 사람 이름 표시는 새 계정 이름으로(처리 담당 이름 칸). 누가 언제 무엇을 했는지의 기록(audit_log · login_failures)은 그대로 둔다.
-- 멱등 — 다시 돌려도 같은 결과. 새 메일 계정이 없는 DB(새로 만든 DB)에서는 옮기지 않는다.

CREATE TEMP TABLE _idmap(old text PRIMARY KEY, new text NOT NULL, realm text NOT NULL) ON COMMIT DROP;
INSERT INTO _idmap(old, new, realm) VALUES
  ('u_lx_staff', 'u_mail_test', 'lx'),
  ('u_lx_admin', 'u_mail_lxadmin', 'lx'),
  ('u_lxadmin', 'u_mail_lxadmin', 'lx'),
  ('u_namwon_manager', 'u_namwon_mail_lxadmin', 'tenant'),
  ('u_namwon_lxadmin', 'u_namwon_mail_lxadmin', 'tenant'),
  ('u_gj_manager', 'u_gwangju-jeonnam_mail_lxadmin', 'tenant'),
  ('u_gj_manager_alias', 'u_gwangju-jeonnam_mail_lxadmin', 'tenant'),
  ('u_gwangju-jeonnam_lxadmin', 'u_gwangju-jeonnam_mail_lxadmin', 'tenant'),
  ('u_kgz_agri_manager', 'u_kgz-agri_mail_lxadmin', 'tenant'),
  ('u_kgz-agri_lxadmin', 'u_kgz-agri_mail_lxadmin', 'tenant'),
  ('u_kgz_land_manager', 'u_kgz-land_mail_lxadmin', 'tenant'),
  ('u_kgz-land_lxadmin', 'u_kgz-land_mail_lxadmin', 'tenant');
DELETE FROM _idmap m WHERE NOT EXISTS (SELECT 1 FROM lx_users u WHERE u.id = m.new) AND NOT EXISTS (SELECT 1 FROM tenant_users u WHERE u.id = m.new);

DO $$
DECLARE m record;
BEGIN
  FOR m IN SELECT old, new, realm FROM _idmap ORDER BY old LOOP
    -- 프로젝트 · 프로젝트장 · 구성원(같은 프로젝트에 새 계정이 이미 있으면 옛 줄만 지운다)
    UPDATE projects SET lead_id = m.new WHERE lead_id = m.old;
    UPDATE projects SET created_by = m.new WHERE created_by = m.old;
    UPDATE projects SET rounds = (SELECT jsonb_agg(CASE WHEN r->>'by' = m.old THEN jsonb_set(r, '{by}', to_jsonb(m.new)) ELSE r END ORDER BY ord)
                                  FROM jsonb_array_elements(rounds) WITH ORDINALITY AS t(r, ord))
      WHERE jsonb_typeof(rounds) = 'array' AND rounds @> jsonb_build_array(jsonb_build_object('by', m.old));
    DELETE FROM project_members pm WHERE pm.user_id = m.old AND EXISTS (SELECT 1 FROM project_members x WHERE x.project_id = pm.project_id AND x.user_id = m.new);
    UPDATE project_members SET user_id = m.new WHERE user_id = m.old;
    UPDATE project_members SET added_by = m.new WHERE added_by = m.old;
    UPDATE project_links SET by = m.new WHERE by = m.old;
    -- 결재 기록 · 카드 담당 · 공개 승인
    UPDATE approvals SET requested_by = m.new WHERE requested_by = m.old;
    UPDATE approvals SET decided_by = m.new WHERE decided_by = m.old;
    UPDATE card_versions SET approved_by = m.new WHERE approved_by = m.old;
    UPDATE cards SET owner_id = m.new WHERE owner_id = m.old;
    -- 분석 작업 · 영상 등록 · 공유 · 학습 표본
    UPDATE jobs SET submitted_by = m.new WHERE submitted_by = m.old;
    UPDATE imagery SET registered_by = m.new WHERE registered_by = m.old;
    UPDATE imagery_shares SET shared_by = m.new WHERE shared_by = m.old;
    UPDATE train_samples SET created_by = m.new WHERE created_by = m.old;
    -- 대장 · 사람별 최근 대장(같은 칸이면 더 늦은 쪽을 남긴다)
    UPDATE ledger_imports SET created_by = m.new WHERE created_by = m.old;
    DELETE FROM ledger_recent l WHERE l.user_id = m.old AND EXISTS (SELECT 1 FROM ledger_recent x WHERE x.user_id = m.new AND x.tenant_id = l.tenant_id
                                                                     AND x.sgg_cd = l.sgg_cd AND x.kind = l.kind AND x.at >= l.at);
    DELETE FROM ledger_recent x WHERE x.user_id = m.new AND EXISTS (SELECT 1 FROM ledger_recent l WHERE l.user_id = m.old AND l.tenant_id = x.tenant_id
                                                                     AND l.sgg_cd = x.sgg_cd AND l.kind = x.kind);
    UPDATE ledger_recent SET user_id = m.new WHERE user_id = m.old;
    UPDATE global_registers SET user_id = m.new WHERE user_id = m.old;
    -- 의뢰 · 검토 요청 · 메시지 · 읽음
    UPDATE analysis_requests SET requested_by = m.new WHERE requested_by = m.old;
    UPDATE analysis_requests SET decided_by = m.new WHERE decided_by = m.old;
    UPDATE analysis_requests SET lead_user = m.new WHERE lead_user = m.old;
    UPDATE request_uploads SET user_id = m.new WHERE user_id = m.old;
    UPDATE feedback SET sender_id = m.new WHERE sender_id = m.old;
    UPDATE feedback SET recipient_id = m.new WHERE recipient_id = m.old;
    UPDATE review_messages SET author_id = m.new WHERE author_id = m.old;
    DELETE FROM review_reads rr WHERE rr.reader = m.realm || ':' || m.old
      AND EXISTS (SELECT 1 FROM review_reads x WHERE x.request_id = rr.request_id AND x.reader = m.realm || ':' || m.new);
    UPDATE review_reads SET reader = m.realm || ':' || m.new WHERE reader = m.realm || ':' || m.old;
    -- 실태조사 처리 · 판정 · 기관 정보 고친 사람
    UPDATE survey_actions SET by = m.new WHERE by = m.old;
    UPDATE survey_finding_events SET by = m.new WHERE by = m.old;
    UPDATE survey_findings SET updated_by = m.new WHERE updated_by = m.old;
    UPDATE finding_verdicts SET by = m.new WHERE by = m.old;
    UPDATE tenant_brand SET updated_by = m.new WHERE updated_by = m.old;
    -- AI 도우미 대화 · 확인 카드
    UPDATE agent_runs SET user_id = m.new WHERE user_id = m.old;
    UPDATE agent_confirms SET decided_by = m.new WHERE decided_by = m.old;
    -- 계정 처리(가입 · 재설정을 처리한 사람)
    UPDATE signup_requests SET decided_by = m.new WHERE decided_by = m.old;
    UPDATE reset_requests SET decided_by = m.new WHERE decided_by = m.old;
  END LOOP;
END $$;

-- 사람 이름 표시 — 옛 계정 이름으로 적힌 처리 담당 · 처리한 사람 칸을 새 계정 이름으로(같은 기관 · 정확히 같은 이름만)
UPDATE survey_findings f SET assignee = n.name
  FROM (SELECT o.tenant_id, o.name AS old_name, nu.name FROM tenant_users o JOIN _idmap m ON m.old = o.id JOIN tenant_users nu ON nu.id = m.new
        WHERE o.name IS NOT NULL AND o.name <> nu.name) n
  WHERE f.tenant_id = n.tenant_id AND f.assignee = n.old_name;
UPDATE survey_finding_events f SET assignee = n.name
  FROM (SELECT o.tenant_id, o.name AS old_name, nu.name FROM tenant_users o JOIN _idmap m ON m.old = o.id JOIN tenant_users nu ON nu.id = m.new
        WHERE o.name IS NOT NULL AND o.name <> nu.name) n
  WHERE f.tenant_id = n.tenant_id AND f.assignee = n.old_name;
UPDATE signup_requests s SET decided_name = nu.name FROM _idmap m JOIN lx_users nu ON nu.id = m.new WHERE s.decided_by = m.new AND s.decided_name IS DISTINCT FROM nu.name
  AND s.decided_name IN (SELECT o.name FROM lx_users o WHERE o.id = m.old);
UPDATE reset_requests s SET decided_name = nu.name FROM _idmap m JOIN lx_users nu ON nu.id = m.new WHERE s.decided_by = m.new AND s.decided_name IS DISTINCT FROM nu.name
  AND s.decided_name IN (SELECT o.name FROM lx_users o WHERE o.id = m.old);

-- 옛 계정 사용 중지(지우지 않음) — 로그인 불가 · 열린 세션 삭제 · 걸린 비밀번호 재설정 요청은 반려로 닫음
UPDATE lx_users SET status = 'disabled' WHERE id IN (SELECT old FROM _idmap WHERE realm = 'lx') AND status <> 'disabled';
UPDATE tenant_users SET status = 'disabled' WHERE id IN (SELECT old FROM _idmap WHERE realm = 'tenant') AND status <> 'disabled';
DELETE FROM sessions s USING _idmap m WHERE s.realm = m.realm AND s.user_id = m.old;
UPDATE reset_requests r SET state = 'rejected', reason = '사용 중지된 계정', decided_at = now()
  FROM _idmap m WHERE r.state = 'pending' AND r.realm = m.realm AND r.user_id = m.old;

-- 영업 — 아이디만 메일로(기본값) · 같은 임시 비밀번호(메일 계정의 해시를 복사) · 이름은 역할 이름
UPDATE lx_users SET login = 'sales@lx.or.kr', name = 'LX 영업',
       pw_hash = coalesce((SELECT pw_hash FROM lx_users WHERE id = 'u_mail_test'), pw_hash), must_change = false, temp_pw_at = NULL
  WHERE id = 'u_lx_sales' AND login = 'lx-sales' AND EXISTS (SELECT 1 FROM lx_users WHERE id = 'u_mail_test')
    AND NOT EXISTS (SELECT 1 FROM lx_users WHERE lower(login) = 'sales@lx.or.kr');
