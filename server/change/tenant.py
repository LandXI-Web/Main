"""기관 하나를 다른 기관과 같은 모양으로 더한다(멱등) — 국토 변화 시나리오의 한국도로공사(§7 8단계 · 원칙 313 '시험 계정도 실제 사용자처럼').

python -m change.tenant --id kec --ko 한국도로공사 --en "Korea Expressway Corporation" --platform "한국도로공사 AI 플랫폼" --short 도로공사
  · tenants 한 줄(kind user · scope local · 상태 active) · 기관 브랜드(이름 · 색 · 대표전화) · 담당자 계정 하나(다른 기관과 같은 아이디 규칙 · 비밀번호는
    server/.env 의 DEV_PASSWORD 그대로 — 코드 · 문서에 적지 않음) · 관할은 config/regions.yaml tenants(이 스크립트가 줄을 더함 · 전국 권한 = sgg [])
  · 서비스는 열지 않는다 — LX 관리자가 '배포 → 기관 공유'에서 켠다(공유 기록이 정본).
바꾸기 전 줄을 02. 데이터/_backup/change-c22/ 에 남긴다. 이미 있으면 그대로 둔다(비밀번호도 바꾸지 않음).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--ko", required=True)
    ap.add_argument("--en", default="")
    ap.add_argument("--platform", required=True)
    ap.add_argument("--short", required=True)
    ap.add_argument("--mark", default="")
    ap.add_argument("--accent", default="#1E4F9C")
    ap.add_argument("--tint", default="#E8EEF7")
    ap.add_argument("--contact", default="")
    ap.add_argument("--login", default="lxadmin@lx.or.kr")
    ap.add_argument("--sgg", default="", help="관할 시군구 접두(쉼표) · 비우면 전국 권한")
    a = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,40}", a.id):
        raise SystemExit("기관 id 는 영소문자 · 숫자 · '-'")
    import psycopg
    from argon2 import PasswordHasher
    from psycopg.types.json import Jsonb
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        bk = {"tenants": [list(map(str, r)) for r in c.execute("SELECT * FROM tenants WHERE id=%s", (a.id,)).fetchall()],
              "tenant_brand": [list(map(str, r)) for r in c.execute("SELECT * FROM tenant_brand WHERE tenant_id=%s", (a.id,)).fetchall()],
              "tenant_users": [[str(x) for x in r] for r in c.execute("SELECT id, tenant_id, login, role, status FROM tenant_users WHERE tenant_id=%s", (a.id,)).fetchall()]}
        out = config.DATA_ROOT / "_backup" / "change-c22"
        out.mkdir(parents=True, exist_ok=True)
        (out / f"tenant-{a.id}-before-{dt.datetime.now():%Y%m%d-%H%M%S}.json").write_text(json.dumps(bk, ensure_ascii=False, indent=1), encoding="utf-8")
        c.execute("INSERT INTO tenants(id, name, kind, scope, crs, locale, status) VALUES (%s,%s,'user','local','EPSG:5186','ko','active') ON CONFLICT (id) DO NOTHING",
                  (a.id, Jsonb({"ko": a.ko, "en": a.en or a.ko})))
        c.execute("INSERT INTO tenant_brand(tenant_id, platform, short, mark_text, accent, tint, contact, updated_at, updated_by) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s,now(),'system:change-order-1022') ON CONFLICT (tenant_id) DO NOTHING",
                  (a.id, a.platform, a.short, a.mark or a.short, a.accent, a.tint, a.contact or None))
        uid = f"u_{a.id}_mail_{a.login.split('@')[0]}"
        if not c.execute("SELECT 1 FROM tenant_users WHERE id=%s", (uid,)).fetchone():
            c.execute("INSERT INTO tenant_users(id, tenant_id, login, pw_hash, role, status, name) VALUES (%s,%s,%s,%s,'manager','active','담당자')",
                      (uid, a.id, a.login, PasswordHasher().hash(config.DEV_PASSWORD)))
        c.commit()
    # 관할(config/regions.yaml tenants) — 줄이 없을 때만 더한다
    y = config.SERVER_ROOT / "config" / "regions.yaml"
    txt = y.read_text(encoding="utf-8")
    if not re.search(rf"^\s+{re.escape(a.id)}:\s*\{{", txt, re.M):
        sgg = [s.strip() for s in a.sgg.split(",") if s.strip()]
        line = f"  {a.id}: {{sgg: {json.dumps(sgg)}}}" + (f"                 # {a.ko}(전국 권한 기관 — 공유받은 서비스 · 대상지만 본다)" if not sgg else f"  # {a.ko}")
        txt = re.sub(r"(^tenants:\n(?:  .*\n)+)", lambda m: m.group(1) + line + "\n", txt, count=1, flags=re.M)
        y.write_text(txt, encoding="utf-8")
    print("ok", a.id, uid)


if __name__ == "__main__":
    main()
