from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    cw_base_url: str
    cw_company_id: str
    cw_public_key: str
    cw_private_key: str
    cw_client_id: str

    blackpoint_api_key: str
    blackpoint_base_url: str = "https://api.blackpointcyber.com"

    ninja_base_url: str
    ninja_client_id: str
    ninja_client_secret: str
    # Onboarding only: organization to copy settings/policies from, and how new devices are approved.
    ninja_template_organization_id: int | None = None
    ninja_node_approval_mode: str = "MANUAL"

    cloudradial_base_url: str = "https://api.us.cloudradial.com"
    cloudradial_public_key: str
    cloudradial_private_key: str

    sophos_client_id: str
    sophos_client_secret: str

    connectsecure_base_url: str = "https://pod102.myconnectsecure.com"
    connectsecure_tenant: str
    connectsecure_client_id: str
    connectsecure_client_secret: str

    evo_base_url: str = "https://partner-api.evosecurity.com"
    evo_api_key: str

    dropsuite_base_url: str
    dropsuite_reseller_token: str
    dropsuite_access_token: str

    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
