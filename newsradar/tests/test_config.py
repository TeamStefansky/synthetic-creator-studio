"""Configuration loading tests."""

from __future__ import annotations

import pytest

from newsradar.config import Settings


def test_defaults_match_compose_ports() -> None:
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert ":5433/" in settings.database_url
    assert settings.redis_url.endswith(":6380/0")
    assert settings.embedding_model == "intfloat/multilingual-e5-large"
    assert settings.smtp_port == 587
    assert settings.log_level == "INFO"


def test_reads_every_documented_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    env = {
        "DATABASE_URL": "postgresql+asyncpg://u:p@localhost:5433/db",
        "REDIS_URL": "redis://localhost:6380/1",
        "ANTHROPIC_API_KEY": "sk-ant-test",
        "PERIGON_API_KEY": "perigon-test",
        "TELEGRAM_API_ID": "12345",
        "TELEGRAM_API_HASH": "hash-test",
        "YOUTUBE_API_KEY": "yt-test",
        "SMTP_HOST": "smtp.example.com",
        "SMTP_PORT": "2525",
        "SMTP_USER": "mailer",
        "SMTP_PASSWORD": "secret",
        "SMTP_FROM": "news@example.com",
        "SLACK_WEBHOOK_URL": "https://hooks.slack.test/x",
        "EMBEDDING_MODEL": "custom/model",
        "LOG_LEVEL": "DEBUG",
    }
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.anthropic_api_key == "sk-ant-test"
    assert settings.perigon_api_key == "perigon-test"
    assert settings.telegram_api_id == "12345"
    assert settings.telegram_api_hash == "hash-test"
    assert settings.youtube_api_key == "yt-test"
    assert settings.smtp_host == "smtp.example.com"
    assert settings.smtp_port == 2525
    assert settings.smtp_user == "mailer"
    assert settings.smtp_password == "secret"
    assert settings.smtp_from == "news@example.com"
    assert settings.slack_webhook_url == "https://hooks.slack.test/x"
    assert settings.embedding_model == "custom/model"
    assert settings.log_level == "DEBUG"
