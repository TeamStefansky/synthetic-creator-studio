from app.connectors import available_sources, get_connector

# These are network/key-gated (no offline mock fixture): keyless live-search
# sources plus key-gated ones that return [] without a key. Excluded from the
# mock-fixture tests (they'd make real HTTP calls or return nothing).
NETWORK_ONLY = {
    "gdelt", "bluesky", "hackernews", "reddit", "mastodon",
    "guardian", "nyt", "gnews", "newsdata", "mediastack", "brave", "youtube",
}
MOCK_SOURCES = [s for s in available_sources() if s not in NETWORK_ONLY]


def test_key_gated_sources_are_inert_without_keys():
    # Without credentials these must return [] (not crash, not mock).
    for name in ("guardian", "nyt", "gnews", "newsdata", "mediastack", "brave", "youtube"):
        assert get_connector(name).fetch("test") == []


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


def test_guardian_normalizes_an_article():
    np = get_connector("guardian").normalize({
        "id": "world/2024/a", "webTitle": "Big story", "webUrl": "https://theguardian.com/a",
        "webPublicationDate": "2024-01-15T12:30:00Z",
        "fields": {"trailText": "details", "byline": "Jane Doe"},
    })
    assert np.source == "guardian"
    assert "Big story" in np.text
    assert np.author.display_name == "Jane Doe"
    assert np.timestamp is not None


def test_nyt_normalizes_an_article():
    np = get_connector("nyt").normalize({
        "_id": "nyt://article/1", "web_url": "https://nytimes.com/a",
        "abstract": "summary", "headline": {"main": "The headline"},
        "pub_date": "2024-01-15T12:30:00+0000", "byline": {"original": "By Reporter"},
    })
    assert np.source == "nyt"
    assert "The headline" in np.text
    assert np.url == "https://nytimes.com/a"


def test_youtube_normalizes_a_video():
    np = get_connector("youtube").normalize({
        "id": {"videoId": "vid123"},
        "snippet": {"title": "Clip", "description": "desc", "channelTitle": "Chan",
                    "channelId": "UC1", "publishedAt": "2024-01-15T12:30:00Z"},
    })
    assert np.source == "youtube"
    assert np.url == "https://www.youtube.com/watch?v=vid123"
    assert np.author.display_name == "Chan"


def test_mastodon_normalizes_and_strips_html():
    np = get_connector("mastodon").normalize({
        "id": "111", "content": "<p>Hello <b>world</b></p>", "url": "https://m.social/@a/111",
        "created_at": "2024-01-15T12:30:00.000Z", "language": "en",
        "account": {"id": "7", "acct": "alice", "display_name": "Alice"},
        "favourites_count": 3, "reblogs_count": 1, "replies_count": 0,
    })
    assert np.source == "mastodon"
    assert "Hello" in np.text and "<" not in np.text
    assert np.author.handle == "alice"
