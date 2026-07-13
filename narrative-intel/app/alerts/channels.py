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


class TelegramChannel(AlertChannel):
    """Sends the alert to a Telegram chat via the Bot API. Needs a bot token
    (TELEGRAM_BOT_TOKEN) and a target chat id (TELEGRAM_ALERT_CHAT_ID), or the
    same keys in the rule config."""
    def deliver(self, alert: Alert, config: dict | None) -> bool:
        cfg = config or {}
        token = cfg.get("telegram_bot_token") or settings.telegram_bot_token
        chat_id = cfg.get("telegram_chat_id") or settings.telegram_alert_chat_id
        if not (token and chat_id):
            return False
        try:
            httpx.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": f"🔔 {alert.title}\n{alert.body or ''}",
                      "disable_web_page_preview": True},
                timeout=10,
            )
            return True
        except Exception as exc:  # pragma: no cover - network
            log.warning("telegram delivery failed: %s", exc)
            return False


class EmailChannel(AlertChannel):
    """Stub — wire an email provider here. Logs for now."""
    def deliver(self, alert: Alert, config: dict | None) -> bool:
        log.info("EMAIL alert (stub): %s", alert.title)
        return True


_CHANNELS: dict[str, AlertChannel] = {
    "inapp": InAppChannel(),
    "webhook": WebhookChannel(),
    "telegram": TelegramChannel(),
    "email": EmailChannel(),
}


def get_channel(name: str) -> AlertChannel:
    return _CHANNELS.get(name, _CHANNELS["inapp"])


def notify_all(alert: Alert, config: dict | None = None) -> bool:
    """Deliver an alert to every configured external channel (Telegram + webhook).
    Returns True if at least one external delivery succeeded."""
    delivered = False
    for name in ("telegram", "webhook"):
        try:
            if get_channel(name).deliver(alert, config):
                delivered = True
        except Exception:  # pragma: no cover
            pass
    return delivered
