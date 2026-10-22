from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.evo.client import EvoAlreadyExistsError, EvoAPIError, EvoClient
from app.evo.schemas import EvoDeployment, EvoOnboardResult

router = APIRouter(prefix="/api/evo", tags=["evo"])


@router.get("/deployment", response_model=EvoDeployment)
async def get_deployment(
    customer_name: str,
    settings: Settings = Depends(get_settings),
) -> EvoDeployment:
    client = EvoClient(settings)
    try:
        return await client.get_deployment(customer_name)
    except EvoAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc


@router.post("/onboard", response_model=EvoOnboardResult)
async def onboard(
    customer_name: str,
    settings: Settings = Depends(get_settings),
) -> EvoOnboardResult:
    client = EvoClient(settings)
    try:
        return await client.onboard(customer_name)
    except EvoAlreadyExistsError as exc:
        raise HTTPException(
            status_code=409, detail=f"Already exists in Evo as '{exc.tenant_name}'"
        ) from exc
    except EvoAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc
