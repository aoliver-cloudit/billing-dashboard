from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.connectwise.client import ConnectWiseAPIError, ConnectWiseClient
from app.connectwise.schemas import Addition, AdditionSyncResult, AdditionUpdate

router = APIRouter(prefix="/api/connectwise", tags=["connectwise"])


@router.get("/additions", response_model=list[Addition])
async def get_additions(
    company_id: int,
    settings: Settings = Depends(get_settings),
) -> list[Addition]:
    client = ConnectWiseClient(settings)
    try:
        return await client.get_additions_for_company(company_id)
    except ConnectWiseAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc


@router.post("/additions/sync", response_model=list[AdditionSyncResult])
async def sync_additions(
    updates: list[AdditionUpdate],
    settings: Settings = Depends(get_settings),
) -> list[AdditionSyncResult]:
    client = ConnectWiseClient(settings)
    try:
        return await client.sync_addition_quantities(
            [(u.agreement_id, u.addition_id, u.quantity) for u in updates]
        )
    except ConnectWiseAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc
