# rate_limit.py
from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, Tuple


@dataclass
class RateDecision:
    ok: bool
    retry_after: float
    remaining: int


class SlidingWindowRateLimiter:
    """
    Sliding window limiter:
      - limit N requests per WINDOW seconds
      - key is identity+ip (or ip only)
      - increments ONLY when you call consume(key)
    """

    def __init__(self, limit: int, window_seconds: float):
        self.limit = int(limit)
        self.window = float(window_seconds)
        self._buckets: Dict[str, Deque[float]] = {}

    def _prune(self, q: Deque[float], now: float) -> None:
        cutoff = now - self.window
        while q and q[0] <= cutoff:
            q.popleft()

    def check(self, key: str) -> RateDecision:
        now = time.time()
        q = self._buckets.get(key)
        if q is None:
            return RateDecision(ok=True, retry_after=0.0, remaining=self.limit)

        self._prune(q, now)
        used = len(q)
        if used < self.limit:
            return RateDecision(ok=True, retry_after=0.0, remaining=self.limit - used)

        # Not ok -> compute retry_after until oldest falls out
        oldest = q[0]
        retry_after = max(0.0, (oldest + self.window) - now)
        return RateDecision(ok=False, retry_after=retry_after, remaining=0)

    def consume(self, key: str) -> RateDecision:
        """
        This is the ONLY method that should be called on a real request.
        """
        now = time.time()
        q = self._buckets.setdefault(key, deque())
        self._prune(q, now)

        used = len(q)
        if used >= self.limit:
            oldest = q[0]
            retry_after = max(0.0, (oldest + self.window) - now)
            return RateDecision(ok=False, retry_after=retry_after, remaining=0)

        q.append(now)
        return RateDecision(ok=True, retry_after=0.0, remaining=self.limit - len(q))

    def compact(self) -> None:
        """
        Optional cleanup to prevent memory growth.
        """
        now = time.time()
        dead = []
        for k, q in self._buckets.items():
            self._prune(q, now)
            if not q:
                dead.append(k)
        for k in dead:
            del self._buckets[k]
