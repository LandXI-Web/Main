"""지도 라벨링 확인(check.mjs)이 실제 프로젝트에 남긴 시험 라벨 묶음을 지운다 — 묶음 줄 · 지도 모양 · 라벨 완료한 자리 · 그림 줄 · 프로젝트 연결 · 클래스 연결 · 폴더.
확인 전에 그 프로젝트에 직접 그린 묶음이 없을 때만 쓴다(check.mjs 가 처음 상태를 items.json 에 남긴다 — before.set = null).
그 묶음에서 새로 생긴 클래스(created_from = 묶음)는 다른 곳이 쓰지 않을 때만 지운다. 감사 기록(audit_log)은 그대로 둔다.
python cleanup.py <프로젝트 id>"""
import shutil
import sys
from pathlib import Path

sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
import psycopg  # noqa: E402
from landxi_api import config  # noqa: E402

pid = sys.argv[1]
with psycopg.connect(config.PG_ADMIN_DSN) as c:
    rows = c.execute("SELECT s.id, s.dir FROM train_samples s JOIN project_links l ON l.kind='sample' AND l.ref=s.id AND l.project_id=%s "
                     "WHERE s.source='manual'", (pid,)).fetchall()
    for sid, d in rows:
        used = c.execute("SELECT 1 FROM jobs WHERE kind='train' AND ((jsonb_typeof(options->'samples')='array' AND options->'samples' ? %s) "
                         "OR options->>'samples' = %s) UNION ALL SELECT 1 FROM models WHERE sample_id=%s LIMIT 1", (sid, sid, sid)).fetchone()
        if used:
            print("학습에 쓴 묶음이라 남김", sid)
            continue
        made = [r[0] for r in c.execute("SELECT id FROM classes WHERE created_from=%s", (sid,)).fetchall()]
        c.execute("DELETE FROM label_areas WHERE sample_id=%s", (sid,))
        c.execute("DELETE FROM label_maps WHERE sample_id=%s", (sid,))
        c.execute("DELETE FROM label_images WHERE sample_id=%s", (sid,))
        c.execute("DELETE FROM sample_classes WHERE sample_id=%s", (sid,))
        c.execute("DELETE FROM project_links WHERE kind='sample' AND ref=%s", (sid,))
        c.execute("DELETE FROM train_samples WHERE id=%s", (sid,))
        for cid in made:
            if not c.execute("SELECT 1 FROM sample_classes WHERE class_id=%s UNION ALL SELECT 1 FROM card_classes WHERE class_id=%s LIMIT 1", (cid, cid)).fetchone():
                c.execute("DELETE FROM class_labels WHERE class_id=%s", (cid,))
                c.execute("DELETE FROM classes WHERE id=%s", (cid,))
        root = Path(d)
        if root.is_dir() and root.parent.resolve() == (config.DATA_ROOT / "training" / "samples").resolve():
            shutil.rmtree(root, ignore_errors=True)
        print("지움", sid, "새 클래스", len(made))
    c.commit()
