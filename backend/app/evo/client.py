import httpx

from app.config import Settings
from app.evo.schemas import EvoDeployment, EvoOnboardResult

PAGE_SIZE = 100


class EvoAPIError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Evo API error ({status_code}): {detail}")


class EvoAlreadyExistsError(RuntimeError):
    def __init__(self, tenant_name: str):
        self.tenant_name = tenant_name
        super().__init__(f"Evo tenant already exists: {tenant_name}")


def _matches(license_name: str, *fragments: str) -> bool:
    lowered = license_name.lower()
    return all(fragment in lowered for fragment in fragments)


class EvoClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.evo_base_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {settings.evo_api_key}",
            "Accept": "application/json",
        }

    async def _get(self, client: httpx.AsyncClient, path: str, params: dict) -> dict:
        response = await client.get(path, params=params)
        if response.status_code != 200:
            raise EvoAPIError(response.status_code, response.text)
        return response.json()

    async def _find_tenant(self, client: httpx.AsyncClient, name: str) -> dict | None:
        payload = await self._get(client, "/v1/tenants", {"q": name, "limit": PAGE_SIZE})
        candidates = payload.get("data") or []
        if not candidates:
            return None

        target = name.strip().lower()
        for tenant in candidates:
            if (tenant.get("name") or "").strip().lower() == target:
                return tenant
        return candidates[0]

    async def _get_license_usage(self, client: httpx.AsyncClient, tenant_id: str) -> dict:
        payload = await self._get(client, f"/v1/tenants/{tenant_id}/licenses/usage", {})
        counts = {
            "mfa_sso_count": None,
            "technician_elevation_count": None,
            "end_user_elevation_count": None,
            "help_desk_verification_count": None,
        }

        for entry in payload.get("data") or []:
            name = (entry.get("license") or {}).get("name") or ""
            used = entry.get("usedLicenses")

            if _matches(name, "mfa") and _matches(name, "sso"):
                counts["mfa_sso_count"] = used
            elif _matches(name, "technician") and _matches(name, "elevation"):
                counts["technician_elevation_count"] = used
            elif _matches(name, "end") and _matches(name, "user") and _matches(name, "elevation"):
                counts["end_user_elevation_count"] = used
            elif _matches(name, "help desk") and _matches(name, "verification"):
                counts["help_desk_verification_count"] = used

        return counts

    async def onboard(self, customer_name: str) -> EvoOnboardResult:
        name = customer_name.strip()
        async with httpx.AsyncClient(
            base_url=self._base_url, headers=self._headers, timeout=30.0
        ) as client:
            # Same lookup the card uses, so a stale card can't create a duplicate.
            existing = await self._find_tenant(client, name)
            if existing:
                raise EvoAlreadyExistsError(existing.get("name") or name)

            response = await client.post("/v1/tenants", json={"name": name})
            if response.status_code not in (200, 201):
                raise EvoAPIError(response.status_code, response.text)

            tenant = response.json().get("data") or {}
            return EvoOnboardResult(
                created=True, tenant_id=tenant.get("id"), tenant_name=tenant.get("name")
            )

    async def get_deployment(self, customer_name: str) -> EvoDeployment:
        async with httpx.AsyncClient(
            base_url=self._base_url, headers=self._headers, timeout=30.0
        ) as client:
            tenant = await self._find_tenant(client, customer_name)
            if not tenant:
                return EvoDeployment(matched=False)

            counts = await self._get_license_usage(client, tenant["id"])

            return EvoDeployment(
                matched=True,
                tenant_id=tenant.get("id"),
                tenant_name=tenant.get("name"),
                **counts,
            )
