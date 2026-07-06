"""Authenticity signals. Each signal is an independent class that returns an
inauthenticity **score (0-100, higher = more bot-like)**, a **confidence (0-1)**,
and a human **explanation**. Signals never depend on each other; the engine
combines them with configurable weights.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone

from ..models import Author, Post


@dataclass
class SignalResult:
    score: float          # 0-100 inauthenticity
    confidence: float     # 0-1 (0 = no data)
    explanation: str


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _age_days(created_at: datetime | None) -> float | None:
    if not created_at:
        return None
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return max(0.0, (datetime.now(timezone.utc) - created_at).total_seconds() / 86400.0)


class Signal(ABC):
    name: str

    @abstractmethod
    def evaluate(self, author: Author, posts: list[Post]) -> SignalResult: ...


class AccountAgeVsVolume(Signal):
    """A young account with a huge post count posts at non-human rates."""
    name = "account_age_vs_volume"

    def evaluate(self, author: Author, posts: list[Post]) -> SignalResult:
        age = _age_days(author.created_at)
        total = author.posts_count
        if age is None or total is None:
            return SignalResult(0, 0.0, "Account age or post count unknown.")
        per_day = total / max(age, 1.0)
        score = _clamp((per_day - 10) / (100 - 10) * 100)
        if age < 30 and per_day > 20:
            score = _clamp(score + 25)
        return SignalResult(score, 0.9, f"~{per_day:.0f} posts/day over {age:.0f} days.")


class FollowerRatio(Signal):
    """Following far more accounts than follow back is a classic bot trait."""
    name = "follower_ratio"

    def evaluate(self, author: Author, posts: list[Post]) -> SignalResult:
        if author.followers is None or author.following is None:
            return SignalResult(0, 0.0, "Follower/following counts unknown.")
        ratio = author.following / max(author.followers, 1)
        score = _clamp((ratio - 1) / (20 - 1) * 100)
        return SignalResult(score, 0.85, f"following/followers ratio {ratio:.1f}.")


class ProfileCompleteness(Signal):
    """Empty bio / unverified profiles skew inauthentic (verified strongly not)."""
    name = "profile_completeness"

    def evaluate(self, author: Author, posts: list[Post]) -> SignalResult:
        verified = bool((author.raw or {}).get("verified"))
        if verified:
            return SignalResult(0, 0.8, "Verified account.")
        score = 0.0
        reasons = []
        if not author.bio:
            score += 60
            reasons.append("empty bio")
        if not author.avatar_url:
            score += 15
            reasons.append("no avatar")
        return SignalResult(_clamp(score), 0.5, ", ".join(reasons) or "profile fairly complete.")


class PostingCadence(Signal):
    """Bursts (many posts in a tiny window) and 24/7 activity are automation-like."""
    name = "posting_cadence"

    def evaluate(self, author: Author, posts: list[Post]) -> SignalResult:
        ts = sorted(p.timestamp for p in posts if p.timestamp)
        if len(ts) < 3:
            return SignalResult(0, 0.15, "Too few timestamped posts to judge cadence.")
        span_min = (ts[-1] - ts[0]).total_seconds() / 60.0
        per_min = len(ts) / max(span_min, 1.0)
        hours = {t.hour for t in ts}
        score = 0.0
        if per_min > 1:  # >1 post/min sustained
            score += 70
        if len(hours) >= 18:  # active around the clock
            score += 30
        return SignalResult(_clamp(score), 0.7, f"{len(ts)} posts across {len(hours)} hours-of-day.")


class ContentRepetition(Signal):
    """An account repeating its own text over and over looks automated."""
    name = "content_repetition"

    def evaluate(self, author: Author, posts: list[Post]) -> SignalResult:
        hashes = [p.content_hash for p in posts if p.content_hash]
        if len(hashes) < 2:
            return SignalResult(0, 0.1, "Not enough posts to measure repetition.")
        dup_ratio = 1 - (len(set(hashes)) / len(hashes))
        return SignalResult(_clamp(dup_ratio * 100), 0.6, f"{dup_ratio*100:.0f}% of this account's posts are repeats.")


class AiAvatarHook(Signal):
    """Placeholder for AI-generated-avatar detection (Stage: integrate a model)."""
    name = "ai_avatar"

    def evaluate(self, author: Author, posts: list[Post]) -> SignalResult:
        return SignalResult(0, 0.0, "AI-avatar detection not yet integrated (hook).")


ALL_SIGNALS: list[Signal] = [
    AccountAgeVsVolume(),
    FollowerRatio(),
    ProfileCompleteness(),
    PostingCadence(),
    ContentRepetition(),
    AiAvatarHook(),
]
