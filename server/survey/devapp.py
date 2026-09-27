"""F2-S 개발 게이트웨이 — 정본 게이트웨이(landxi_api.main:app) 그대로 + 실태조사 라우터(+ 기관 스트림 대체).

main.py 는 F2-B 소유(확장 훅 `try: import landxi_api.survey`)라 F2-S 가 고치지 않는다. 훅이 들어온 뒤에는 :8700 이 그대로
/api/v1/survey/* 를 내고, 이 파일은 필요 없다. 훅 도착 전 검증·영상용으로 같은 앱을 다른 포트에 띄운다(:8705):

    cd server && python -m uvicorn survey.devapp:app --port 8705

같은 PostGIS · Redis · 세션 표를 쓰므로 :8700 에서 받은 토큰이 여기서도 통한다.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import contextlib  # noqa: E402

from landxi_api.deps import close, pool, redis  # noqa: E402
from landxi_api.main import API, app  # noqa: E402


@contextlib.asynccontextmanager
async def _lifespan(_app):
    """정본 lifespan 의 관제 경보 루프(ops.alert_loop)는 :8700 한 곳에서만 — 여기선 풀·Redis 만."""
    await pool()
    await redis()
    yield
    await close()


app.router.lifespan_context = _lifespan

_paths = {getattr(r, "path", "") for r in app.routes}
if API + "/survey/findings" not in _paths:
    from landxi_api import survey as _survey  # noqa: E402
    app.include_router(_survey.router, prefix=API)
    MOUNTED_SURVEY = True
else:
    MOUNTED_SURVEY = False
if API + "/events/tenant" not in _paths:
    from survey import sse_fallback  # noqa: E402
    app.include_router(sse_fallback.router, prefix=API)
    MOUNTED_TENANT_SSE = True
else:
    MOUNTED_TENANT_SSE = False
print(f"[survey.devapp] survey router {'mounted' if MOUNTED_SURVEY else 'already in main'} · "
      f"/events/tenant {'fallback' if MOUNTED_TENANT_SSE else 'main(F2-B)'}", flush=True)
