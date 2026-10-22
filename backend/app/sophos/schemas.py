from pydantic import BaseModel


class SophosEndpoint(BaseModel):
    id: str
    hostname: str | None = None
    online: bool | None = None
    last_seen_at: str | None = None
    last_user: str | None = None
    # Raw Sophos value (e.g. "encrypted"); None when the endpoint reports no encryption block.
    encryption_status: str | None = None
    # Raw Sophos value: "good", "suspicious" or "bad".
    health_status: str | None = None
    # Sub-statuses behind the overall health, same values as health_status.
    threats_status: str | None = None
    services_status: str | None = None
    protected: bool = False


class SophosEndpointList(BaseModel):
    matched: bool
    tenant_id: str | None = None
    tenant_name: str | None = None
    endpoints: list[SophosEndpoint] = []


class SophosDeployment(BaseModel):
    matched: bool
    tenant_id: str | None = None
    tenant_name: str | None = None
    device_count: int | None = None
    encrypted_count: int | None = None
