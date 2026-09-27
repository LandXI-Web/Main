"""개발·시험용 상태 도우미 — 시험 표본 고르기 · 시험이 바꾼 finding 원복(이벤트 행 포함).

    python -m survey.pipelines.dev_state pick [offset]      # R2 C등급 점수 최하위권 open 1건 id
    python -m survey.pipelines.dev_state reset <id> [...]    # state open · 배정/사유 비움 · 그 finding 의 events 삭제
운영 데이터에는 쓰지 않는다(시험·시연 표본 전용).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from survey import db as S  # noqa: E402


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    with S.pg() as c:
        S.lx_tx(c)
        if cmd == "pick":
            off = int(argv[2]) if len(argv) > 2 else 0
            print(c.execute("SELECT id FROM survey_findings WHERE rule='R2' AND priority='C' AND state='open' AND NOT demo "
                            "ORDER BY rank DESC OFFSET %s LIMIT 1", (off,)).fetchone()[0])
        elif cmd == "reset":
            ids = argv[2:]
            c.execute("DELETE FROM survey_finding_events WHERE finding_id = ANY(%s)", (ids,))
            c.execute("UPDATE survey_findings SET state='open', assignee=NULL, planned_for=NULL, reason=NULL, updated_at=NULL, updated_by=NULL, "
                      "demo=false WHERE id = ANY(%s)", (ids,))
            c.commit()
            print("reset", len(ids))
        else:
            raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
