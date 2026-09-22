from pydantic import BaseModel


class Customer(BaseModel):
    id: int
    identifier: str
    name: str
    status: str | None = None
    types: list[str] = []
    market: str | None = None
    website: str | None = None


class Addition(BaseModel):
    id: int
    agreement_id: int
    agreement_name: str | None = None
    product_id: int | None = None
    product_identifier: str | None = None
    description: str | None = None
    quantity: float


class AdditionUpdate(BaseModel):
    agreement_id: int
    addition_id: int
    quantity: float


class AdditionSyncResult(BaseModel):
    addition_id: int
    success: bool
    error: str | None = None
