from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.connectwise.client import ConnectWiseAPIError, ConnectWiseClient
from app.connectwise.schemas import Customer

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("", response_model=list[Customer])
async def list_customers(
    status_name: str | None = "Active",
    settings: Settings = Depends(get_settings),
) -> list[Customer]:
    client = ConnectWiseClient(settings)
    try:
        return await client.get_all_customers(status_name=status_name)
    except ConnectWiseAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc
