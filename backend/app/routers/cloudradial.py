from fastapi import APIRouter, Depends, HTTPException

from app.cloudradial.client import CloudRadialAPIError, CloudRadialClient
from app.cloudradial.schemas import CloudRadialDeployment
from app.config import Settings, get_settings

router = APIRouter(prefix="/api/cloudradial", tags=["cloudradial"])


@router.get("/deployment", response_model=CloudRadialDeployment)
async def get_deployment(
    customer_name: str,
    settings: Settings = Depends(get_settings),
) -> CloudRadialDeployment:
    client = CloudRadialClient(settings)
    try:
        return await client.get_deployment(customer_name)
    except CloudRadialAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc
