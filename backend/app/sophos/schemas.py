from pydantic import BaseModel


class SophosDeployment(BaseModel):
    matched: bool
    tenant_id: str | None = None
    tenant_name: str | None = None
    device_count: int | None = None
    encrypted_count: int | None = None
