from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.ninja.client import NinjaAlreadyExistsError, NinjaAPIError, NinjaClient
from app.ninja.schemas import NinjaDeployment, NinjaOnboardResult

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


@router.post("/onboard", response_model=NinjaOnboardResult)
async def onboard(
    customer_name: str,
    settings: Settings = Depends(get_settings),
) -> NinjaOnboardResult:
    client = NinjaClient(settings)
    try:
        return await client.onboard(customer_name)
    except NinjaAlreadyExistsError as exc:
        raise HTTPException(
            status_code=409, detail=f"Already exists in NinjaRMM as '{exc.organization_name}'"
        ) from exc
    except NinjaAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc
