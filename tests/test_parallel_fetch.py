from threading import Barrier, Lock
from time import sleep
from unittest.mock import MagicMock

import httpx
import pytest

from careerbridge import search_agent
from careerbridge import timings as clock


def test_fetch_is_bounded_ranked_and_stops_at_limit(monkeypatch):
    barrier, lock = Barrier(3), Lock()
    active = peak = 0
    called = []

    def get(endpoint, *, headers, params):
        nonlocal active, peak
        index = int(params["url"].rsplit("/", 1)[1])
        with lock:
            active += 1
            peak = max(peak, active)
            called.append(index)
        try:
            if index <= 3:
                barrier.wait(timeout=2)
                sleep((4 - index) * 0.01)  # Finish in reverse rank order.
            if index == 1:
                raise httpx.ReadTimeout("one slow source")
            return httpx.Response(
                200,
                request=httpx.Request("GET", endpoint),
                json={"content": str(index), "url": params["url"]},
            )
        finally:
            with lock:
                active -= 1

    client = MagicMock()
    client.__enter__.return_value = client
    client.get.side_effect = get
    monkeypatch.setattr(search_agent.httpx, "Client", lambda **kwargs: client)
    candidates = [{"url": "file:///ignored"}, {"url": "https://example.com/1"}]
    candidates += [{"url": f"https://example.com/{i}"} for i in range(1, 6)]
    pages = search_agent.fetch_pages(candidates, 3)
    assert peak == 3 and active == 0
    assert sorted(called) == [1, 2, 3, 4]  # No duplicate or unnecessary fifth request.
    assert [p["content"] for p in pages] == ["2", "3", "4"]
    client.__exit__.assert_called_once()


def test_zero_limit_does_not_fetch(monkeypatch):
    client = MagicMock()
    monkeypatch.setattr(search_agent.httpx, "Client", client)
    assert search_agent.fetch_pages([{"url": "https://example.com"}], 0) == []
    client.assert_not_called()


def test_stage_time_accumulates_and_survives_failure(monkeypatch):
    ticks = iter([1, 1.02, 2, 2.03])
    monkeypatch.setattr(clock, "perf_counter", lambda: next(ticks))
    timings = {}
    with clock.measure(timings, "fetch"):
        pass
    with pytest.raises(ValueError), clock.measure(timings, "fetch"):
        raise ValueError("source failure")
    assert timings == {"fetch": 50.0}


@pytest.mark.parametrize("kind", ["job", "resource"])
def test_graph_retains_stage_timings(monkeypatch, kind):
    monkeypatch.setenv("CAREERBRIDGE_SEARCH_MODE", "live")
    monkeypatch.setattr(search_agent, "search", lambda *args: [])
    monkeypatch.setattr(search_agent, "fetch_pages", lambda *args: [])
    timings = {}
    state = {
        "role": "Analyst",
        "location": "",
        "seniority": "",
        "skill": "SQL",
        "timings_ms": timings,
    }
    graph = (
        search_agent.job_search_agent
        if kind == "job"
        else search_agent.resource_search_agent
    )
    result = graph.invoke(state)
    assert set(timings) == {"search", "fetch", "model"}
    assert result["timings_ms"] == timings
    assert all(value >= 0 for value in timings.values())
