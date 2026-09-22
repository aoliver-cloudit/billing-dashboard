import asyncio

import httpx

from app.blackpoint.schemas import BlackpointDeployment
from app.config import Settings

ENDPOINT_FILTER = "THAT HAS SOURCE WITH type='AGENTENDPOINT'"
MAX_RETRIES = 3


class BlackpointAPIError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Blackpoint API error ({status_code}): {detail}")


def _extract_list(data: dict | list | None) -> list:
    if data is None:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("data") or data.get("items") or []
    return []


class BlackpointClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.blackpoint_base_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {settings.blackpoint_api_key}",
            "Accept": "application/json",
        }

    async def _get(self, client: httpx.AsyncClient, path: str, **kwargs) -> dict | list | None:
        for attempt in range(MAX_RETRIES):
            response = await client.get(path, **kwargs)

            if response.status_code == 404:
                return None
            if response.status_code == 429:
                retry_after = float(response.headers.get("ratelimit-reset", 2))
                await asyncio.sleep(min(retry_after, 10))
                continue
            if response.status_code != 200:
                raise BlackpointAPIError(response.status_code, response.text)

            return response.json()

        raise BlackpointAPIError(429, "Rate limited after retries")

    async def _find_tenant(self, client: httpx.AsyncClient, name: str) -> dict | None:
        data = await self._get(client, "/v1/tenants", params={"search": name, "pageSize": 10})
        candidates = _extract_list(data)
        if not candidates:
            return None

        target = name.strip().lower()
        for tenant in candidates:
            if (tenant.get("name") or "").strip().lower() == target:
                return tenant
        return candidates[0]

    async def _get_endpoint_mdr_count(self, client: httpx.AsyncClient, tenant_id: str) -> int:
        data = await self._get(
            client,
            "/v1/assets",
            params={"class": "DEVICE", "filter": ENDPOINT_FILTER},
            headers={"x-tenant-id": tenant_id},
        )
        if not isinstance(data, dict):
            return 0
        return data.get("meta", {}).get("totalItems", 0)

    async def _get_cloud_identity_mdr_count(self, client: httpx.AsyncClient, tenant_id: str) -> int:
        total = 0

        m365 = await self._get(
            client, "/v1/cloud/ms365/customer", params={"tenantId": tenant_id}
        )
        if isinstance(m365, dict):
            for package in m365.get("ms365DefensePackages", []):
                connection_id = package.get("id")
                if not connection_id:
                    continue
                users = await self._get(
                    client,
                    f"/v1/cloud/ms365/connections/{connection_id}/users",
                    params={"tenantId": tenant_id, "licensed": "true", "take": 1},
                )
                if isinstance(users, dict):
                    total += users.get("total", 0)

        for provider in ("google", "cisco"):
            onboardings = await self._get(
                client, f"/v1/cloud/{provider}/onboardings", params={"tenantId": tenant_id}
            )
            for onboarding in _extract_list(onboardings):
                connection_id = onboarding.get("connectionId")
                if not connection_id:
                    continue
                users = await self._get(
                    client,
                    f"/v1/cloud/connections/{connection_id}/users",
                    params={"tenantId": tenant_id},
                )
                if isinstance(users, dict):
                    total += users.get("total", 0)

        return total

    async def get_deployment(self, customer_name: str) -> BlackpointDeployment:
        async with httpx.AsyncClient(
            base_url=self._base_url, headers=self._headers, timeout=30.0
        ) as client:
            tenant = await self._find_tenant(client, customer_name)
            if not tenant:
                return BlackpointDeployment(matched=False)

            tenant_id = tenant["id"]
            endpoint_count = await self._get_endpoint_mdr_count(client, tenant_id)
            cloud_count = await self._get_cloud_identity_mdr_count(client, tenant_id)

            return BlackpointDeployment(
                matched=True,
                tenant_id=tenant_id,
                tenant_name=tenant.get("name"),
                endpoint_mdr_count=endpoint_count,
                cloud_identity_mdr_count=cloud_count,
            )
