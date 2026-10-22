from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.connectsecure.client import ConnectSecureAPIError, ConnectSecureClient
from app.connectsecure.schemas import ConnectSecureDeployment

router = APIRouter(prefix="/api/connectsecure", tags=["connectsecure"])


@router.get("/deployment", response_model=ConnectSecureDeployment)
async def get_deployment(
    customer_name: str,
    settings: Settings = Depends(get_settings),
) -> ConnectSecureDeployment:
    client = ConnectSecureClient(settings)
    try:
        return await client.get_deployment(customer_name)
    except ConnectSecureAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc
