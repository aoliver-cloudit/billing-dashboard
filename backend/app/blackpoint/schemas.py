from pydantic import BaseModel


class BlackpointDeployment(BaseModel):
    matched: bool
    tenant_id: str | None = None
    tenant_name: str | None = None
    endpoint_mdr_count: int | None = None
    cloud_identity_mdr_count: int | None = None
