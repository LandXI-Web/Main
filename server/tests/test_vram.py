"""VRAM 예산 — total − used − 2,048 (Ollama 점유는 used 에 들어 있다 · 종료하지 않음)."""
from workers import vram

TABLE = """
|    1   N/A  N/A    108656    C+G   ...b\\ollama\\llama-server.exe    N/A      |
|    1   N/A  N/A    128956    C+G   ...b\\ollama\\llama-server.exe    N/A      |
|    0   N/A  N/A      4242    C     ...python.exe                    N/A      |
"""


def test_budget_formula():
    assert vram.budget_mib(49140, 23396) == 49140 - 23396 - 2048 == 23696
    assert vram.budget_mib(49140, 48000) == 0


def test_parse_query():
    g = vram.parse_query("0, NVIDIA RTX A6000, 23396, 49140, 0, WDDM\n1, NVIDIA RTX A6000, 23396, 49140, 3, WDDM")
    assert [x["used"] for x in g] == [23396, 23396] and g[1]["util"] == 3 and g[0]["mode"] == "WDDM"


def test_parse_procs_and_label():
    p = vram.parse_procs("Processes:\n" + TABLE)
    assert p[1] == ["llama-server.exe", "llama-server.exe"]
    assert vram.external_label(p[1]) == "llama-server ×2"


def test_live_query_if_available():
    try:
        gs = vram.query()
    except Exception:
        return
    for g in gs:
        assert g.total_mib > 0 and 0 <= vram.budget_mib(g.total_mib, g.used_mib) < g.total_mib
