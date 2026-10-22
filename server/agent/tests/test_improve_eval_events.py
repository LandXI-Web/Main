"""밤 바퀴 답 사건 읽기 — 'items' 가 없는 응답(오류 봉투 · 형태 바뀜)에도 죽지 않는다."""
from agent.improve_eval import events_of


class R:
    def __init__(self, j, code=200):
        self._j, self.status_code = j, code

    def json(self):
        if isinstance(self._j, Exception):
            raise self._j
        return self._j


def test_normal():
    items, err = events_of(R({"items": [{"id": "1-0", "event": "agent.done", "data": {}}], "done": True}))
    assert err is None and len(items) == 1


def test_missing_items_error_envelope():
    items, err = events_of(R({"error": {"message": "만료"}}, 401))
    assert items == [] and "401" in err and "만료" in err


def test_wrapped_and_garbage():
    assert events_of(R({"data": {"items": [{"event": "x"}]}}))[0] == [{"event": "x"}]
    assert events_of(R(ValueError("x"), 502))[1]
    assert events_of(R([1, 2]))[1]
    assert events_of(R({"items": [{"no": 1}, "s"]}))[0] == []
