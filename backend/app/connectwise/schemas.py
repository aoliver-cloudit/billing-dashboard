from pydantic import BaseModel


class Customer(BaseModel):
    id: int
    identifier: str
    name: str
    status: str | None = None
    types: list[str] = []
    market: str | None = None
    website: str | None = None
