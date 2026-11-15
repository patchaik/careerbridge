"""Monotonic stage durations, retained even when a stage raises."""

from contextlib import contextmanager
from time import perf_counter


@contextmanager
def measure(timings: dict, stage: str):
    start = perf_counter()
    try:
        yield
    finally:
        timings[stage] = round(
            timings.get(stage, 0) + (perf_counter() - start) * 1000, 3
        )
