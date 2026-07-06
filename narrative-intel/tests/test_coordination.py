"""Coordinated-behaviour detection tests (Stage 3)."""
from sqlalchemy import select

from app.authenticity.engine import score_all
from app.coordination.engine import detect_campaigns, graph
from app.ingest.service import ingest_source
from app.models import Author, Campaign, CampaignAccount, CampaignEvidence, CoordinationEdge


def test_detects_identical_posts_from_two_accounts(db):
    ingest_source(db, "x")  # 9002 & 9003 share identical text within 1 min
    res = detect_campaigns(db)
    assert res["campaigns"] == 1
    c = db.scalar(select(Campaign))
    assert c.account_count == 2
    assert c.post_count == 2
    assert c.coordination_score >= 40
    # Two evidence posts + two member accounts saved.
    assert db.scalar(select(CampaignEvidence.campaign_id).where(CampaignEvidence.campaign_id == c.id))
    accounts = list(db.scalars(select(CampaignAccount.author_id).where(CampaignAccount.campaign_id == c.id)))
    assert len(accounts) == 2


def test_real_account_not_flagged(db):
    ingest_source(db, "x")
    detect_campaigns(db)
    real = db.scalar(select(Author).where(Author.handle == "real_reporter"))
    in_campaign = db.scalar(select(CampaignAccount).where(CampaignAccount.author_id == real.id))
    assert in_campaign is None


def test_low_authenticity_raises_coordination_score(db):
    ingest_source(db, "x")
    score_all(db)  # the two coordinated accounts are bots -> low authenticity
    detect_campaigns(db)
    c = db.scalar(select(Campaign))
    # base 40 + tightness(20, <=5min) + inauth bonus -> clearly elevated
    assert c.coordination_score >= 55


def test_graph_has_edge_between_coordinated_accounts(db):
    ingest_source(db, "x")
    detect_campaigns(db)
    g = graph(db)
    assert len(g["nodes"]) == 2
    assert len(g["edges"]) == 1
    assert g["edges"][0]["weight"] == 1


def test_detection_is_idempotent(db):
    ingest_source(db, "x")
    detect_campaigns(db)
    detect_campaigns(db)
    assert db.scalar(select(Campaign)) is not None
    assert len(list(db.scalars(select(Campaign)))) == 1
    assert len(list(db.scalars(select(CoordinationEdge)))) == 1
