from app.ingest.dedup import content_hash


def test_hash_is_whitespace_and_case_insensitive():
    a = content_hash("x", "Breaking:  the  TRUTH!")
    b = content_hash("x", "breaking: the truth!")
    assert a == b


def test_hash_differs_by_source():
    assert content_hash("x", "same text") != content_hash("telegram", "same text")


def test_hash_differs_by_content():
    assert content_hash("x", "one") != content_hash("x", "two")
