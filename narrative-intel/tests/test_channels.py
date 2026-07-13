"""Alert delivery channels — Telegram + multi-channel notify."""
from __future__ import annotations

from app import config
from app.alerts import channels
from app.models import Alert


def _alert() -> Alert:
    return Alert(rule_name="Brand Watch", type="brandwatch_escalation",
                 title="Test", body="body", dedup_key="k")


def test_telegram_inert_without_config(monkeypatch):
    monkeypatch.setattr(config.settings, "telegram_bot_token", None, raising=False)
    monkeypatch.setattr(config.settings, "telegram_alert_chat_id", None, raising=False)
    assert channels.get_channel("telegram").deliver(_alert(), None) is False


def test_telegram_registered():
    assert "telegram" in channels._CHANNELS


def test_notify_all_false_when_nothing_configured(monkeypatch):
    monkeypatch.setattr(config.settings, "telegram_bot_token", None, raising=False)
    monkeypatch.setattr(config.settings, "telegram_alert_chat_id", None, raising=False)
    monkeypatch.setattr(config.settings, "alert_webhook_url", None, raising=False)
    assert channels.notify_all(_alert()) is False


def test_telegram_uses_rule_config(monkeypatch):
    # With config present it attempts delivery (network mocked to succeed).
    sent = {}

    def fake_post(url, **kwargs):
        sent["url"] = url
        sent["json"] = kwargs.get("json")
        class R:  # noqa
            pass
        return R()

    monkeypatch.setattr(channels.httpx, "post", fake_post)
    ok = channels.get_channel("telegram").deliver(
        _alert(), {"telegram_bot_token": "T", "telegram_chat_id": "123"})
    assert ok is True
    assert "botT/sendMessage" in sent["url"]
    assert sent["json"]["chat_id"] == "123"
