from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db import get_session
from app.models.asset import Asset
from app.schemas import AssetOut

router = APIRouter(prefix="/assets", tags=["asset"])

_MIME = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "txt": "text/plain"}


@router.get("/{asset_id}", response_model=AssetOut)
def get(asset_id: uuid.UUID, session: Session = Depends(get_session)):
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    return asset


@router.get("/{asset_id}/file")
def get_file(asset_id: uuid.UUID, session: Session = Depends(get_session)):
    """Stream the disclosed (visibly-labeled, provenance-stamped) asset bytes."""
    asset = session.get(Asset, asset_id)
    if asset is None or not asset.storage_uri:
        raise HTTPException(status_code=404, detail="asset file not found")
    path = Path(asset.storage_uri)
    if not path.exists():
        raise HTTPException(status_code=404, detail="asset file missing on storage")
    media_type = _MIME.get(path.suffix.lstrip(".").lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type, filename=path.name)
