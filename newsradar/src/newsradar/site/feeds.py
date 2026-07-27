"""Personal feed output: RSS 2.0, Atom 1.0, JSON Feed 1.1 (P6).

Each entry links to the **original article** (never an internal page), so the user
can pipe their site elsewhere. Feeds are built from the same ``StoryOut`` payloads
the serializer produces, so attribution and the rights gate are inherited.
"""

from __future__ import annotations

import datetime as dt
from email.utils import format_datetime
from typing import Any
from xml.etree import ElementTree as ET

from newsradar.api.schemas import StoryOut

# Neutral external home for channel/feed-level links (there is no reader web page
# until P7); entry links always point to the original external article.
HOME_URL = "https://newsradar.example/"


def _entry_summary(story: StoryOut) -> str:
    return story.blurb or story.extract_en or story.headline_en


def _updated(stories: list[StoryOut], now: dt.datetime) -> dt.datetime:
    times = [s.published_at for s in stories if s.published_at is not None]
    return max(times) if times else now


def render_rss(stories: list[StoryOut], *, title: str, description: str, now: dt.datetime) -> str:
    rss = ET.Element("rss", {"version": "2.0"})
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = title
    ET.SubElement(channel, "link").text = HOME_URL
    ET.SubElement(channel, "description").text = description
    ET.SubElement(channel, "lastBuildDate").text = format_datetime(_updated(stories, now))
    for s in stories:
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = s.headline_en
        ET.SubElement(item, "link").text = s.url  # original article
        guid = ET.SubElement(item, "guid", {"isPermaLink": "true"})
        guid.text = s.url
        ET.SubElement(item, "description").text = _entry_summary(s)
        ET.SubElement(item, "source").text = s.source_name
        if s.published_at is not None:
            ET.SubElement(item, "pubDate").text = format_datetime(s.published_at)
    return _to_xml(rss)


def render_atom(stories: list[StoryOut], *, title: str, feed_id: str, now: dt.datetime) -> str:
    ns = "http://www.w3.org/2005/Atom"
    feed = ET.Element("feed", {"xmlns": ns})
    ET.SubElement(feed, "title").text = title
    ET.SubElement(feed, "id").text = feed_id
    ET.SubElement(feed, "updated").text = _updated(stories, now).isoformat()
    ET.SubElement(feed, "link", {"href": HOME_URL, "rel": "alternate"})
    for s in stories:
        entry = ET.SubElement(feed, "entry")
        ET.SubElement(entry, "title").text = s.headline_en
        ET.SubElement(entry, "id").text = s.url
        ET.SubElement(entry, "link", {"href": s.url, "rel": "alternate"})  # original article
        ET.SubElement(entry, "updated").text = (
            s.published_at.isoformat() if s.published_at else now.isoformat()
        )
        ET.SubElement(entry, "summary").text = _entry_summary(s)
        author = ET.SubElement(entry, "author")
        ET.SubElement(author, "name").text = s.source_name
    return _to_xml(feed)


def render_json_feed(stories: list[StoryOut], *, title: str, feed_url: str) -> dict[str, Any]:
    return {
        "version": "https://jsonfeed.org/version/1.1",
        "title": title,
        "home_page_url": HOME_URL,
        "feed_url": feed_url,
        "items": [
            {
                "id": s.url,
                "url": s.url,  # original article
                "title": s.headline_en,
                "content_text": _entry_summary(s),
                "date_published": s.published_at.isoformat() if s.published_at else None,
                "authors": [{"name": s.source_name}],
                "language": "en",
            }
            for s in stories
        ],
    }


def _to_xml(root: ET.Element) -> str:
    return '<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(root, encoding="unicode")
