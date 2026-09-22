from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.sophos.client import SophosAPIError, SophosClient
from app.sophos.schemas import SophosDeployment

router = APIRouter(prefix="/api/sophos", tags=["sophos"])


@router.get("/deployment", response_model=SophosDeployment)
async def get_deployment(
    customer_name: str,
    settings: Settings = Depends(get_settings),
) -> SophosDeployment:
    client = SophosClient(settings)
    try:
        return await client.get_deployment(customer_name)
    except SophosAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc
