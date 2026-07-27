"""Locate and load the connector configuration files (``feeds.yaml`` etc.).

The files live under ``<repo>/config/`` by default; the paths can be overridden
via ``Settings.feeds_path`` / ``Settings.telegram_channels_path`` (used by tests
to point at fixtures).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from newsradar.config import Settings

# src/newsradar/connectors/config_files.py -> parents[3] == repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_CONFIG_DIR = _REPO_ROOT / "config"


def feeds_path(settings: Settings) -> Path:
    """Resolve the RSS feed list path."""

    return Path(settings.feeds_path) if settings.feeds_path else _CONFIG_DIR / "feeds.yaml"


def telegram_channels_path(settings: Settings) -> Path:
    """Resolve the Telegram channel list path."""

    if settings.telegram_channels_path:
        return Path(settings.telegram_channels_path)
    return _CONFIG_DIR / "telegram_channels.yaml"


def load_yaml_list(path: Path) -> list[dict[str, Any]]:
    """Load a YAML document expected to be a list of mappings; missing file -> []."""

    if not path.exists():
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if data is None:
        return []
    if not isinstance(data, list):
        raise ValueError(f"expected a YAML list in {path}, got {type(data).__name__}")
    return [dict(item) for item in data]
