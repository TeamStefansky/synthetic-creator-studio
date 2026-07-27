"""OPML 2.0 import/export round-trip, folder names preserved as tags."""

from __future__ import annotations

from newsradar.feeds.opml import OpmlFeed, build_opml, parse_opml

SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My subscriptions</title></head>
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss" text="The Verge" title="The Verge"
               xmlUrl="https://www.theverge.com/rss/index.xml"
               htmlUrl="https://www.theverge.com/"/>
      <outline type="rss" text="Ars Technica" title="Ars Technica"
               xmlUrl="https://arstechnica.com/feed/"/>
    </outline>
    <outline text="World" title="World">
      <outline type="rss" text="BBC" title="BBC"
               xmlUrl="https://www.bbc.co.uk/news/rss.xml"/>
    </outline>
    <outline type="rss" text="Loose" title="Loose"
             xmlUrl="https://loose.example/feed.xml"/>
  </body>
</opml>
"""


def test_parse_opml_preserves_folders_as_tags() -> None:
    feeds = parse_opml(SAMPLE)
    by_url = {f.feed_url: f for f in feeds}
    assert by_url["https://www.theverge.com/rss/index.xml"].tags == ["Tech"]
    assert by_url["https://arstechnica.com/feed/"].tags == ["Tech"]
    assert by_url["https://www.bbc.co.uk/news/rss.xml"].tags == ["World"]
    assert by_url["https://loose.example/feed.xml"].tags == []
    assert by_url["https://www.theverge.com/rss/index.xml"].site_url == "https://www.theverge.com/"


def test_round_trip_reconstructs_grouping() -> None:
    feeds = parse_opml(SAMPLE)
    exported = build_opml(feeds)
    reparsed = parse_opml(exported)

    original = {(f.feed_url, tuple(f.tags)) for f in feeds}
    result = {(f.feed_url, tuple(f.tags)) for f in reparsed}
    assert original == result


def test_build_opml_from_scratch() -> None:
    feeds = [
        OpmlFeed(feed_url="https://a.example/feed", title="A", tags=["News"]),
        OpmlFeed(feed_url="https://b.example/feed", title="B", tags=["News"]),
        OpmlFeed(feed_url="https://c.example/feed", title="C"),
    ]
    xml = build_opml(feeds)
    reparsed = parse_opml(xml)
    assert {f.feed_url for f in reparsed} == {
        "https://a.example/feed",
        "https://b.example/feed",
        "https://c.example/feed",
    }
    news = [f for f in reparsed if f.tags == ["News"]]
    assert {f.feed_url for f in news} == {"https://a.example/feed", "https://b.example/feed"}


def test_nested_folders_flatten_to_tag_list() -> None:
    nested = """<?xml version="1.0"?>
    <opml version="2.0"><body>
      <outline text="A" title="A">
        <outline text="B" title="B">
          <outline type="rss" title="Deep" xmlUrl="https://deep.example/feed"/>
        </outline>
      </outline>
    </body></opml>"""
    feeds = parse_opml(nested)
    assert feeds[0].tags == ["A", "B"]
