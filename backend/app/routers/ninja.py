from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.ninja.client import NinjaAPIError, NinjaClient
from app.ninja.schemas import NinjaDeployment

router = APIRouter(prefix="/api/ninja", tags=["ninja"])


@router.get("/deployment", response_model=NinjaDeployment)
async def get_deployment(
    customer_name: str,
    settings: Settings = Depends(get_settings),
) -> NinjaDeployment:
    client = NinjaClient(settings)
    try:
        return await client.get_deployment(customer_name)
    except NinjaAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc
