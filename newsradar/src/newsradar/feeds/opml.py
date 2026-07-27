"""OPML 2.0 import and export.

Folder ``<outline>`` names are preserved as feed *tags*: a feed nested under a
folder outline inherits that folder's title as a tag, so a round-trip
(import -> export) reconstructs the same folder grouping.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

from defusedxml.ElementTree import fromstring as safe_fromstring


@dataclass(slots=True)
class OpmlFeed:
    """One feed parsed from (or destined for) an OPML document."""

    feed_url: str
    title: str | None = None
    site_url: str | None = None
    tags: list[str] = field(default_factory=list)


def parse_opml(text: str) -> list[OpmlFeed]:
    """Parse an OPML 2.0 document into feeds, folder titles becoming tags."""

    root = safe_fromstring(text)
    body = root.find("body")
    if body is None:
        return []
    feeds: list[OpmlFeed] = []
    _walk(body, [], feeds)
    # De-duplicate by feed_url, merging tags in first-seen order.
    merged: dict[str, OpmlFeed] = {}
    for feed in feeds:
        existing = merged.get(feed.feed_url)
        if existing is None:
            merged[feed.feed_url] = feed
            continue
        for tag in feed.tags:
            if tag not in existing.tags:
                existing.tags.append(tag)
    return list(merged.values())


def _walk(node: ET.Element, folders: list[str], out: list[OpmlFeed]) -> None:
    for outline in node.findall("outline"):
        xml_url = outline.get("xmlUrl")
        if xml_url:
            out.append(
                OpmlFeed(
                    feed_url=xml_url,
                    title=outline.get("title") or outline.get("text") or None,
                    site_url=outline.get("htmlUrl") or None,
                    tags=list(folders),
                )
            )
        else:
            # A folder outline: its title/text scopes the feeds nested beneath it.
            folder_name = outline.get("title") or outline.get("text")
            child_folders = [*folders, folder_name] if folder_name else list(folders)
            _walk(outline, child_folders, out)


def build_opml(feeds: list[OpmlFeed], *, title: str = "NewsRadar subscriptions") -> str:
    """Render feeds to an OPML 2.0 document, grouping by their first tag as a folder.

    Feeds with no tag are placed at the body root. The output round-trips through
    :func:`parse_opml` back to the same ``(feed_url, tag)`` grouping.
    """

    opml = ET.Element("opml", version="2.0")
    head = ET.SubElement(opml, "head")
    ET.SubElement(head, "title").text = title
    body = ET.SubElement(opml, "body")

    folders: dict[str, ET.Element] = {}

    def _folder(name: str) -> ET.Element:
        node = folders.get(name)
        if node is None:
            node = ET.SubElement(body, "outline", text=name, title=name)
            folders[name] = node
        return node

    for feed in feeds:
        parent = _folder(feed.tags[0]) if feed.tags else body
        attrs = {
            "type": "rss",
            "text": feed.title or feed.feed_url,
            "title": feed.title or feed.feed_url,
            "xmlUrl": feed.feed_url,
        }
        if feed.site_url:
            attrs["htmlUrl"] = feed.site_url
        ET.SubElement(parent, "outline", attrs)

    return ET.tostring(opml, encoding="unicode", xml_declaration=True)
