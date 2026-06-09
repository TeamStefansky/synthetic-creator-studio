from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_session
from app.distribution.service import DistributionService
from app.models.post import Post
from app.schemas import PostOut, ScheduleRequest

router = APIRouter(prefix="/distribution", tags=["distribution"])


@router.get("/posts", response_model=list[PostOut])
def list_posts(session: Session = Depends(get_session)):
    return session.query(Post).order_by(Post.created_at.desc()).all()


@router.post("/schedule", response_model=PostOut, status_code=201)
def schedule(payload: ScheduleRequest, session: Session = Depends(get_session)):
    service = DistributionService(session)
    return service.schedule(
        asset_id=payload.asset_id, platform=payload.platform, caption=payload.caption
    )


@router.post("/posts/{post_id}/approve", response_model=PostOut)
def approve(post_id: uuid.UUID, session: Session = Depends(get_session)):
    post = session.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="post not found")
    return DistributionService(session).approve(post)


@router.post("/posts/{post_id}/publish", response_model=PostOut)
def publish(post_id: uuid.UUID, session: Session = Depends(get_session)):
    post = session.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="post not found")
    # HARD GATE inside publish(): DisclosureGate + synthetic-media policy.
    DistributionService(session).publish(post)
    return post
