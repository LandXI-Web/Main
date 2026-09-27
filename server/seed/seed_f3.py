"""F3 최종 명세 §3 시드 — 카드 확장(S-6) · 시드 정리(S-9) · 공개 파일(카드 크롭). 멱등 · 여러 번 돌려도 된다.

사용: python server/seed/seed_f3.py            (seed_from_cards_js.py 끝에서도 부른다)
- cards.intro{headline, line} = cards.js 의 duty · summary 그대로(지어낸 문장 0)
- cards.ledger_schema = 반입 자동 인식 템플릿(대장 종류 · 열 역할) — 대장이 필요한 카드만
- cards.crop_url = 공개 크롭(02. 데이터/tiles/public/files/crop-{card}.webp · 실제 AI 결과 겹침)이 있으면 그 주소
- 정리: pytest 가 만든 시험 배포본(id '*-test*') · 시험 복구 결재 행('test restore*') 삭제 · pytest 작업 test=true(관제 제외) · 한도 note '[추정 기반 초기값]'
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

LEDGER_SCHEMA = {
    "card-farm": {"kind": "farm_ledger", "columns": [
        {"key": "pnu", "label": "필지고유번호", "role": "pnu"}, {"key": "jibun", "label": "소재지번", "role": "jibun"},
        {"key": "status", "label": "경작 여부", "role": "status"}, {"key": "use", "label": "작물", "role": "use"},
        {"key": "date", "label": "기준일", "role": "date"}]},
    "card-change": {"kind": "dev_permit", "columns": [
        {"key": "pnu", "label": "필지고유번호", "role": "pnu"}, {"key": "jibun", "label": "소재지번", "role": "jibun"},
        {"key": "permit_no", "label": "허가번호", "role": "status"}, {"key": "date", "label": "허가일", "role": "date"}]},
    "card-living": {"kind": "public_asset", "columns": [
        {"key": "pnu", "label": "필지고유번호", "role": "pnu"}, {"key": "jibun", "label": "소재지번", "role": "jibun"},
        {"key": "use", "label": "재산 용도", "role": "status"}]},
}
CROP_SRC = config.REPO_ROOT / "landxi" / "v3" / "main" / "data"
PUB_FILES = config.DATA_ROOT / "tiles" / "public" / "files"


def log(*a):
    print("[seed_f3]", *a, flush=True)


def cards(conn):
    dump_p = config.SERVER_ROOT / "seed" / ".cards_dump.json"
    dump = json.loads(dump_p.read_text(encoding="utf-8")) if dump_p.exists() else {"CARDS": []}
    PUB_FILES.mkdir(parents=True, exist_ok=True)
    n = 0
    for c in dump["CARDS"]:
        cid = c["id"]
        intro = {"headline": c.get("duty"), "line": c.get("summary")}
        crop = None
        src = CROP_SRC / f"crop-{cid}.webp"
        dst = PUB_FILES / f"crop-{cid}.webp"
        if src.exists():
            if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
                shutil.copy2(src, dst)
        if dst.exists():
            crop = f"{config.PUBLIC_BASE}/files/public/crop-{cid}.webp"
        conn.execute("UPDATE cards SET intro=%s, crop_url=%s, ledger_schema=COALESCE(ledger_schema, %s) WHERE id=%s",
                     (json.dumps(intro, ensure_ascii=False), crop, json.dumps(LEDGER_SCHEMA.get(cid), ensure_ascii=False) if cid in LEDGER_SCHEMA else None,
                      cid))
        n += 1
    log("cards", n)


def cleanup(conn):
    t = conn.execute("SELECT id FROM deploys WHERE id LIKE '%-test%' OR coalesce(test,false)").fetchall()
    ids = [r[0] for r in t]
    if ids:
        conn.execute("DELETE FROM approvals WHERE subject_type='deploy' AND subject_id = ANY(%s)", (ids,))
        conn.execute("DELETE FROM deploys WHERE id = ANY(%s)", (ids,))
    a = conn.execute("DELETE FROM approvals WHERE reason LIKE 'test restore%%' OR reason = 'test'").rowcount
    j = conn.execute("UPDATE jobs SET test=true WHERE NOT coalesce(test,false) AND (label ILIKE 'pytest%%' OR label ILIKE 'test/%%' "
                     "OR options->>'adapter' LIKE 'adapter_test%%' OR options->>'adapter' LIKE 'test%%')").rowcount
    q = conn.execute("UPDATE quotas SET note='[추정 기반 초기값]' WHERE note IS NULL OR note = ''").rowcount
    log("cleanup deploys", len(ids), "approvals", a, "jobs→test", j, "quota notes", q)


def main():
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as conn:
        cards(conn)
        cleanup(conn)


if __name__ == "__main__":
    main()
