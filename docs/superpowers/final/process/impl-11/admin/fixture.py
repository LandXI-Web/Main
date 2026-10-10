"""impl-11 캡처용 시험 자료 — setup / cleanup. 시험 줄만 만들고 지운다(진행 중 데이터 0 변경). 비밀번호 출력 0."""
import asyncio
import json
import sys

sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
import psycopg  # noqa: E402
from argon2 import PasswordHasher  # noqa: E402
from landxi_api import config  # noqa: E402

RID, AID = "rq_shot11a", "ap_shot11a"
UID, LOGIN, DEPT = "u_gj_shot11", "shot11@gj.go.kr", "순천시 농정과"


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def setup():
    with pg() as c:
        meta = {"org": "남원시", "service": "생활환경 위험요소 탐지", "place": "운봉읍 준향리 일대", "area_km2": 1.2, "gsd_word": "2cm", "kind": "drone",
                "label": "2025년 드론 영상"}
        c.execute("INSERT INTO analysis_requests(id, tenant_id, requested_by, deploy_id, source, imagery_id, meta, memo, state, approval_id, created_at) "
                  "VALUES (%s,'namwon','u_namwon_mail_lxadmin','dp-nw-living-23','shared','namwon-aoi-2510', %s::jsonb, '시험 요청(캡처용 · 끝나면 지움)', 'pending', %s, now()) "
                  "ON CONFLICT (id) DO NOTHING", (RID, json.dumps(meta, ensure_ascii=False), AID))
        c.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, payload, reason, tenant_id, at) "
                  "VALUES (%s,'request',%s,'u_namwon_mail_lxadmin','pending','{}'::jsonb,'시험 요청(캡처용)','namwon',now()) ON CONFLICT (id) DO NOTHING", (AID, RID))
        h = PasswordHasher().hash(config.DEV_PASSWORD)
        c.execute("INSERT INTO tenant_users(id, tenant_id, login, pw_hash, role, status, name, dept) VALUES (%s,'gwangju-jeonnam',%s,%s,'viewer','active','시험 부서 사용자',%s) "
                  "ON CONFLICT (id) DO UPDATE SET status='active', dept=EXCLUDED.dept", (UID, LOGIN, h, DEPT))
        cv = c.execute("SELECT id FROM card_versions WHERE card_id='card-living' AND approved_by IS NOT NULL ORDER BY approved_at DESC NULLS LAST LIMIT 1").fetchone()
    if cv:
        with pg() as c:                               # 시험 배포 신청 메모(끝나면 지움) — 알림 한 줄이 메모 첫 줄에서 온다는 것을 보이려고
            c.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, decision, payload, reason, at, decided_at) "
                      "VALUES ('ap_shot11v','card',%s,'u_mail_test','decided','approve',%s::jsonb,'시험',now(),now()) ON CONFLICT (id) DO NOTHING",
                      (cv[0], json.dumps({"memo": "시험 알림 — 배포 신청 메모의 첫 줄이 여기에 보입니다\n둘째 줄은 알림에 넣지 않습니다", "test": True}, ensure_ascii=False)))
        from landxi_api import spaces
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        print("version_notice", cv[0], asyncio.run(spaces.version_notice(cv[0], test=True)))
    print("setup ok")


def cleanup():
    with pg() as c:
        c.execute("DELETE FROM approvals WHERE id IN (%s, 'ap_shot11v')", (AID,))
        c.execute("DELETE FROM audit_log WHERE subject IN (%s,%s)", (RID, AID))
        c.execute("DELETE FROM analysis_requests WHERE id=%s", (RID,))
        c.execute("DELETE FROM sessions WHERE user_id=%s", (UID,))
        c.execute("DELETE FROM tenant_users WHERE id=%s", (UID,))
        c.execute("DELETE FROM tenant_dept_scope WHERE tenant_id='gwangju-jeonnam' AND dept=%s", (DEPT,))
        c.execute("DELETE FROM audit_log WHERE action='tenant.dept_scope' AND subject=%s", (f"gwangju-jeonnam/{DEPT}",))
        c.execute("DELETE FROM space_log WHERE kind='version' AND (detail->>'test')::boolean")
        c.execute("DELETE FROM tenant_service_staff WHERE by IS NOT NULL AND at > now() - interval '3 hours'")
        c.execute("DELETE FROM tenant_shoot_staff WHERE at > now() - interval '3 hours'")
        n = c.execute("SELECT count(*) FROM card_shares WHERE test AND at > now() - interval '3 hours'").fetchone()[0]
        c.execute("DELETE FROM card_shares WHERE test AND at > now() - interval '3 hours'")
    print("cleanup ok · test share rows", n)


if __name__ == "__main__":
    {"setup": setup, "cleanup": cleanup}[sys.argv[1]]()
