from pydantic import BaseModel


class DropsuiteDeployment(BaseModel):
    matched: bool
    organization_id: str | None = None
    organization_name: str | None = None
    seats_used: int | None = None
