from pydantic import BaseModel


class NinjaDeployment(BaseModel):
    matched: bool
    organization_id: int | None = None
    organization_name: str | None = None
    device_count: int | None = None
