from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.dropsuite.client import DropsuiteAPIError, DropsuiteClient
from app.dropsuite.schemas import DropsuiteDeployment

router = APIRouter(prefix="/api/dropsuite", tags=["dropsuite"])


@router.get("/deployment", response_model=DropsuiteDeployment)
async def get_deployment(
    customer_name: str,
    settings: Settings = Depends(get_settings),
) -> DropsuiteDeployment:
    client = DropsuiteClient(settings)
    try:
        return await client.get_deployment(customer_name)
    except DropsuiteAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc
