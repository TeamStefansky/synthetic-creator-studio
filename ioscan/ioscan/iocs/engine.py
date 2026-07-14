"""IOC engine: run all matchers over a stream of records."""

from __future__ import annotations

from collections.abc import Iterable, Iterator

from ..models import Detection, Record
from .loader import IocBundle
from .matchers import match_record


def run_iocs(records: Iterable[Record], bundle: IocBundle) -> Iterator[Detection]:
    """Yield a Detection for every (record, IOC) match, de-duplicated."""
    seen: set[tuple] = set()
    for record in records:
        for det in match_record(record, bundle):
            key = (det.ioc_id, det.matched_value, det.source, det.record_type)
            if key in seen:
                continue
            seen.add(key)
            yield det
