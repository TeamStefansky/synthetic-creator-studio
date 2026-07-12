from app.connectors import available_sources, get_connector

# gdelt is network-only (keyless live search) — it has no offline mock fixture,
# so it's excluded from the mock-fixture test.
MOCK_SOURCES = [s for s in available_sources() if s != "gdelt"]


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
