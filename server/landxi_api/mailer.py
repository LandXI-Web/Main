"""메일 알림 한 줄(확인 대장 18차 N-1 ⓐ — 새 결과 알림 = 머리의 종 + 메일 한 줄 · 원칙 89 메일은 알림에만 · 2차 인증 아님).

설정은 server/.env 한 곳 — 없으면 메일은 보내지 않고 화면은 종만(기관 화면에 '메일 알림은 설정 뒤').
  LX_MAIL_HOST   메일 서버(예: smtp.lx.or.kr) · LX_MAIL_PORT(기본 587) · LX_MAIL_USER · LX_MAIL_PASSWORD · LX_MAIL_FROM(보내는 주소)
  LX_MAIL_TLS    1 = STARTTLS(기본) · 0 = 그대로
보낸 것은 감사 기록에 남기고, 받는 사람 주소 · 본문 글은 남기지 않는다(개인정보 최소). 실패해도 화면 일은 멈추지 않는다(한 줄 기록).
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from . import config

log = logging.getLogger("landxi")


def settings() -> dict | None:
    host = (config.get("LX_MAIL_HOST") or "").strip()
    sender = (config.get("LX_MAIL_FROM") or "").strip()
    if not host or not sender:
        return None
    return {"host": host, "port": int(config.get("LX_MAIL_PORT") or 587), "user": config.get("LX_MAIL_USER") or "",
            "password": config.get("LX_MAIL_PASSWORD") or "", "from": sender, "tls": (config.get("LX_MAIL_TLS") or "1") != "0"}


def enabled() -> bool:
    return settings() is not None


def send(to: list[str], subject: str, line: str) -> int:
    """동기(스레드에서 부른다) — 보낸 수. 설정이 없으면 0."""
    s = settings()
    to = [t for t in dict.fromkeys(x.strip() for x in to) if "@" in t]
    if not s or not to:
        return 0
    n = 0
    try:
        with smtplib.SMTP(s["host"], s["port"], timeout=15) as smtp:
            if s["tls"]:
                smtp.starttls()
            if s["user"]:
                smtp.login(s["user"], s["password"])
            for addr in to:
                m = EmailMessage()
                m["Subject"], m["From"], m["To"] = subject, s["from"], addr
                m.set_content(line + "\n\n— Land-XI 알림(이 메일에는 답하지 않아도 됩니다)")
                smtp.send_message(m)
                n += 1
    except Exception as e:  # noqa: BLE001
        log.warning("mail send failed: %r", e)
    return n


async def notify_new_result(tenant: str, card: str, name: str, edition: int, change: str | None) -> int:
    """새 결과(결과 설명서 새 판 · 백필 아님) — 그 서비스를 볼 수 있는 기관 사람에게 메일 한 줄(N-1 ⓐ 알림 ⓑ).
    받는 사람 = 그 기관 관리자 + 그 서비스를 배정받은 부서 사용자(원칙 38) · 잠긴 계정 빼고 · 주소 = 계정 아이디(메일).
    설정이 없으면 아무것도 하지 않는다(종만). 보낸 수만 로그 한 줄."""
    if not enabled():
        return 0
    from starlette.concurrency import run_in_threadpool

    from .deps import db
    try:
        async with db(realm="lx") as c:
            org = await c.fetchval("SELECT name FROM tenants WHERE id=$1", tenant)
            rows = await c.fetch(
                "SELECT u.login FROM tenant_users u WHERE u.tenant_id=$1 AND coalesce(u.status,'active') NOT IN ('locked','disabled') AND "
                "(u.role = 'manager' OR EXISTS (SELECT 1 FROM space_assign a WHERE a.tenant_id=u.tenant_id AND a.user_id=u.id AND a.card_id=$2))",
                tenant, card)
    except Exception as e:  # noqa: BLE001
        log.warning("mail recipients %s/%s: %r", tenant, card, e)
        return 0
    org_name = (org.get("ko") if isinstance(org, dict) else org) or ""
    short = str(org_name).split()[-1] if org_name else ""
    subject = f"[{short or 'Land-XI'}] {name} 새 결과({edition}판)"
    line = f"{name}에 새 결과({edition}판)가 왔습니다." + (f" {change}" if change else "") + " 우리 기관 플랫폼에 로그인해 확인하세요."
    n = await run_in_threadpool(send, [r["login"] for r in rows if r["login"]], subject, line)
    log.info("mail new result %s/%s ed%s: %s", tenant, card, edition, n)
    return n
