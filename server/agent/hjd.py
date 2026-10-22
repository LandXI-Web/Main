"""읍면동 셈 — 법정동으로 세고 행정동 이름을 함께(10-22 ChatGEO-읍면동셈 ⓐ 확인).

  names(sgg)          그 시군구 법정동 → 행정동 이름 표 — 법정동 경계(regions.emd_fc · 화면 · 통계와 같은 경계)와
                      행정동 경계(통계청 SGIS 행정동 경계 · vuski/admdongkor 가공본 · 공공누리 1유형 · CC BY 4.0)를 겹쳐
                      가장 많이 겹치는 행정동 하나. 이름이 같으면 표에 넣지 않는다. 시군구마다 한 번 만들어 디스크에 둔다.
  annotate(ctx, md)   답 글의 법정동 이름 뒤에 '(행정동 ○○)'를 처음 한 번 붙인다 · '읍면동 n곳'은 '(법정동 기준)'.
지역 고정값 0(전국 어느 시군구나 같은 길 · 경계 파일에서 읽는다). 숫자는 바꾸지 않는다(셈은 법정동 그대로).
"""
from __future__ import annotations

import json
import re
import threading
from pathlib import Path

SRC_NAME = "HangJeongDong_ver20261001.geojson"
ATTRIBUTION = "행정동 경계: 통계청 SGIS(공공누리 제1유형) · vuski/admdongkor 가공(CC BY 4.0)"
_MEM: dict[str, dict] = {}
_LOCK = threading.Lock()
_ALL: dict = {"by": None}


def _dir() -> Path:
    try:
        from landxi_api import config
        return Path(config.DATA_ROOT) / "shared" / "hjd"
    except Exception:  # noqa: BLE001
        return Path("E:/Land-XI 플랫폼/02. 데이터/shared/hjd")


def _hjd_by_sgg() -> dict:
    """행정동 경계 파일 → {시군구 코드: [(행정동 이름, 도형)]} (한 번 읽음)."""
    if _ALL["by"] is not None:
        return _ALL["by"]
    p = _dir() / SRC_NAME
    by: dict = {}
    if p.exists():
        fc = json.loads(p.read_text(encoding="utf-8"))
        for f in fc.get("features") or []:
            pr = f.get("properties") or {}
            by.setdefault(str(pr.get("sgg") or ""), []).append((str(pr.get("adm_nm") or "").split(" ")[-1], f.get("geometry")))
    _ALL["by"] = by
    return by


def names(sgg: str | None) -> dict[str, str]:
    """법정동 → 행정동(이름이 다른 것만). 경계를 못 읽으면 {}."""
    if not sgg:
        return {}
    try:
        from landxi_api.regions import region_of
        r = region_of(str(sgg)[:5])
        cd = (r or {}).get("sgg_cd") or str(sgg)[:5]
    except Exception:  # noqa: BLE001
        cd = str(sgg)[:5]
    if cd in _MEM:
        return _MEM[cd]
    disk = _dir() / "map" / f"{cd}.json"
    if disk.exists():
        try:
            _MEM[cd] = json.loads(disk.read_text(encoding="utf-8"))
            return _MEM[cd]
        except Exception:  # noqa: BLE001
            pass
    with _LOCK:
        if cd in _MEM:
            return _MEM[cd]
        out: dict[str, str] = {}
        try:
            from shapely.geometry import shape
            from landxi_api.regions import emd_fc
            hj = [(nm, shape(g).buffer(0)) for nm, g in _hjd_by_sgg().get(cd, []) if g]
            if hj:
                for f in (emd_fc(cd).get("features") or []):
                    bj = str((f.get("properties") or {}).get("name") or "")
                    if not bj:
                        continue
                    g = shape(f["geometry"]).buffer(0)
                    best = max(hj, key=lambda x: x[1].intersection(g).area)
                    if g.area > 0 and best[1].intersection(g).area / g.area >= 0.5 and best[0] != bj:
                        out[bj] = best[0]
            disk.parent.mkdir(parents=True, exist_ok=True)
            disk.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        except Exception:  # noqa: BLE001
            out = {}
        _MEM[cd] = out
        return out


CNT_RX = re.compile(r"(읍면동\s*(?:\{\{env:e\d+\}\}|\d[\d,]*)\s*곳)(?!\s*\(법정동)")


def annotate(ctx, md: str, sgg: str | None) -> str:
    """'하정동 241' → '하정동(행정동 죽항동) 241'(처음 한 번) · '읍면동 39곳' → '읍면동 39곳(법정동 기준)'."""
    if not md or getattr(ctx, "lang", "ko") != "ko":
        return md
    tb = names(sgg)
    out = md
    if tb:
        for bj, hj in sorted(tb.items(), key=lambda kv: -len(kv[0])):
            m = None
            for m0 in re.finditer(r"(?<![가-힣])" + re.escape(bj) + r"(?=$|[^가-힣(]|(?:에서|에는|으로|이며|이고|[은는이가을를의에과와도만로])(?![가-힣]))", out):
                after, before = out[m0.end():m0.end() + 14], out[max(0, m0.start() - 3):m0.start()]
                if re.match(r"\s*(?:산\s*)?\d+(?:-\d+)?\s*(?:\[|-|$)", after) or re.match(r"\s*(?:산\s*)?\d+-\d+", after)                         or (re.search(r"[시군구]\s$", before) and re.match(r"\s*(?:산\s*)?\d", after)):
                    continue                              # 주소(지번) 안의 동 이름은 그대로
                m = m0
                break
            if m and f"(행정동 {hj})" not in out[m.end():m.end() + 12]:
                out = out[:m.end()] + f"(행정동 {hj})" + out[m.end():]
    if re.search(r"읍면동", out):
        out = CNT_RX.sub(r"\1(법정동 기준)", out, count=1)
    return out
