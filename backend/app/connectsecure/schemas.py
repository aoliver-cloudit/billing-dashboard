from pydantic import BaseModel


class ConnectSecureDeployment(BaseModel):
    matched: bool
    company_id: int | None = None
    company_name: str | None = None
    device_count: int | None = None
