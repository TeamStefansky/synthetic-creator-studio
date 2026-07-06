"""Delivery channels — one uniform interface, separate implementations."""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod

import httpx

from ..config import settings
from ..models import Alert

log = logging.getLogger("alerts")


class AlertChannel(ABC):
    @abstractmethod
    def deliver(self, alert: Alert, config: dict | None) -> bool: ...


class InAppChannel(AlertChannel):
    """Stored in the DB (the /api/alerts feed) — nothing else to do."""
    def deliver(self, alert: Alert, config: dict | None) -> bool:
        return True


class WebhookChannel(AlertChannel):
    def deliver(self, alert: Alert, config: dict | None) -> bool:
        url = (config or {}).get("webhook_url") or settings.alert_webhook_url
        if not url:
            return False
        try:
            httpx.post(url, json={"text": f"🔔 {alert.title}\n{alert.body or ''}"}, timeout=10)
            return True
        except Exception as exc:  # pragma: no cover - network
            log.warning("webhook delivery failed: %s", exc)
            return False


class EmailChannel(AlertChannel):
    """Stub — wire an email provider here. Logs for now."""
    def deliver(self, alert: Alert, config: dict | None) -> bool:
        log.info("EMAIL alert (stub): %s", alert.title)
        return True


_CHANNELS: dict[str, AlertChannel] = {
    "inapp": InAppChannel(),
    "webhook": WebhookChannel(),
    "email": EmailChannel(),
}


def get_channel(name: str) -> AlertChannel:
    return _CHANNELS.get(name, _CHANNELS["inapp"])
