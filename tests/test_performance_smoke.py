"""Resource sampler reports PSS only for complete process-tree samples."""
from types import SimpleNamespace

import pytest

pytest.importorskip("psutil")
from tools import performance_smoke as smoke  # noqa: E402


class FakeProcess:
    def __init__(self, pid, rss, pss, children=()):
        self.pid, self.rss, self.pss = pid, rss, pss
        self._children = children

    def children(self, recursive=True):
        return self._children

    def create_time(self):
        return 1

    def cpu_times(self):
        return SimpleNamespace(user=1, system=0)

    def memory_info(self):
        return SimpleNamespace(rss=self.rss * 1048576)

    def memory_full_info(self):
        if self.pss is None:
            return SimpleNamespace()
        return SimpleNamespace(pss=self.pss * 1048576)

    def is_running(self):
        return True


@pytest.mark.parametrize("child_pss, expected", [(20, 70), (None, None)])
def test_complete_pss_only(monkeypatch, child_pss, expected):
    times = iter([0, 1])
    monkeypatch.setattr(smoke.time, "monotonic", lambda: next(times))
    monkeypatch.setattr(smoke.time, "sleep", lambda _: None)
    root = FakeProcess(1, 100, 50, [FakeProcess(2, 80, child_pss)])
    result = smoke.sample(root, 0.5)
    assert result["rss_mib_median"] == 180
    assert result["pss_mib_median"] == expected
    assert result["pss_mib_peak"] == expected
    assert result["pss_complete_samples"] == int(expected is not None)
    assert result["sample_count"] == 1
    assert result["processes_peak"] == 2
    assert [p["pid"] for p in result["processes_at_end"]] == [1, 2]
