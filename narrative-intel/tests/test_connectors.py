from app.connectors import available_sources, get_connector


def test_all_connectors_normalize_their_mock_items():
    for name in available_sources():
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
