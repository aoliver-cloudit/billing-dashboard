from fastapi import APIRouter, Depends, HTTPException

from app.blackpoint.client import BlackpointAPIError, BlackpointClient
from app.blackpoint.schemas import BlackpointDeployment
from app.config import Settings, get_settings

router = APIRouter(prefix="/api/blackpoint", tags=["blackpoint"])


@router.get("/deployment", response_model=BlackpointDeployment)
async def get_deployment(
    customer_name: str,
    settings: Settings = Depends(get_settings),
) -> BlackpointDeployment:
    client = BlackpointClient(settings)
    try:
        return await client.get_deployment(customer_name)
    except BlackpointAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc
