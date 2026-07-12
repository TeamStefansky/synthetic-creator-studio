from app.connectors import available_sources, get_connector

# These are network-only (keyless live search) — no offline mock fixture, so
# they're excluded from the mock-fixture tests (they'd make real HTTP calls).
NETWORK_ONLY = {"gdelt", "bluesky", "hackernews", "reddit"}
MOCK_SOURCES = [s for s in available_sources() if s not in NETWORK_ONLY]


def test_all_connectors_normalize_their_mock_items():
    for name in MOCK_SOURCES:
        c = get_connector(name)
        raw = c.fetch()
        assert raw, f"{name} produced no mock items"
        for item in raw:
            np = c.normalize(item)
            assert np.source == name
            assert np.source_post_id
            assert isinstance(np.text, str) and np.text


def test_x_connector_uses_mock_without_token():
    c = get_connector("x")
    assert c.health()["mock"] is True


def test_connectors_accept_query_argument():
    # Every connector's fetch() must accept an optional keyword query.
    for name in MOCK_SOURCES:
        c = get_connector(name)
        raw = c.fetch("some keyword query")
        assert isinstance(raw, list)


def test_gdelt_normalizes_an_article():
    c = get_connector("gdelt")
    np = c.normalize({
        "url": "https://example.com/a", "title": "Sample headline",
        "domain": "example.com", "language": "English",
        "seendate": "20240115T123000Z",
    })
    assert np.source == "gdelt"
    assert np.source_post_id == "https://example.com/a"
    assert np.text == "Sample headline"
    assert np.timestamp is not None


def test_bluesky_normalizes_a_post():
    c = get_connector("bluesky")
    np = c.normalize({
        "uri": "at://did:plc:abc/app.bsky.feed.post/xyz", "cid": "cid1",
        "author": {"did": "did:plc:abc", "handle": "alice.bsky.social", "displayName": "Alice"},
        "record": {"text": "hello world", "createdAt": "2024-01-15T12:30:00Z"},
        "likeCount": 5, "repostCount": 2, "replyCount": 1,
    })
    assert np.source == "bluesky"
    assert np.text == "hello world"
    assert np.author.handle == "alice.bsky.social"
    assert np.url.endswith("/xyz")
    assert np.timestamp is not None


def test_hackernews_normalizes_a_story():
    c = get_connector("hackernews")
    np = c.normalize({
        "objectID": "42", "title": "Big news", "url": "https://example.com",
        "author": "pg", "points": 100, "num_comments": 20, "created_at_i": 1700000000,
    })
    assert np.source == "hackernews"
    assert np.source_post_id == "42"
    assert np.text == "Big news"
    assert np.timestamp is not None


def test_reddit_normalizes_a_post():
    c = get_connector("reddit")
    np = c.normalize({
        "name": "t3_abc", "id": "abc", "title": "Headline", "selftext": "body text",
        "author": "someuser", "permalink": "/r/news/comments/abc/headline/",
        "ups": 50, "num_comments": 12, "created_utc": 1700000000,
    })
    assert np.source == "reddit"
    assert np.source_post_id == "t3_abc"
    assert "Headline" in np.text
    assert np.url.startswith("https://www.reddit.com/r/news")
