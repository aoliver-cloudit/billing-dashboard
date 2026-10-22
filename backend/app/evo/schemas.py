from pydantic import BaseModel


class EvoOnboardResult(BaseModel):
    created: bool
    tenant_id: str | None = None
    tenant_name: str | None = None


class EvoDeployment(BaseModel):
    matched: bool
    tenant_id: str | None = None
    tenant_name: str | None = None
    mfa_sso_count: int | None = None
    technician_elevation_count: int | None = None
    end_user_elevation_count: int | None = None
    help_desk_verification_count: int | None = None
